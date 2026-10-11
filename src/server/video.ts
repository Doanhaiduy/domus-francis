import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./errors";
import { getSupabaseStorageConfig } from "./storage";

// ---------------------------------------------------------------------
// Video khoảnh khắc — lưu trữ + phát. Vercel giới hạn thân yêu cầu 4,5 MB nên TRÌNH DUYỆT tải thẳng lên nơi lưu trữ (không qua máy chủ ứng dụng):
//   • cloudinary (ưu tiên nếu có CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET): gói miễn phí 25 credits/tháng, tự chuyển mã
//     về H.264/AAC, cắt HLS thích ứng băng thông (sp_auto) — thay cho "worker cắt HLS" tự dựng. Tệp tối đa 100 MB.
//   • supabase (khi đã cấu hình Supabase Storage): bucket riêng "videos", tải qua URL ký sẵn; gói miễn phí giới hạn 50 MB/tệp và 1 GB tổng.
//     Phát bằng URL ký có hạn (hỗ trợ tua / Range của trình duyệt), không đi qua hàm máy chủ.
//   • local (máy phát triển): ghi vào .local/storage/videos, phát qua API có hỗ trợ Range.
// Máy chủ cấp "vé tải" (JWT ngắn hạn, gắn người dùng + album + khóa đối tượng) rồi xác minh tệp thật sự có ở nơi lưu trữ trước khi ghi DB.
// ---------------------------------------------------------------------

export type VideoProvider = "cloudinary" | "supabase" | "local";

export const VIDEO_MIME_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/3gpp": "3gp",
};
export const VIDEO_MAX_DURATION_S = 10 * 60;
const MB = 1024 * 1024;
const SUPABASE_BUCKET = "videos";

export interface CloudinaryConfig {
  cloud: string;
  key: string;
  secret: string;
}
export function cloudinaryConfig(): CloudinaryConfig | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const secret = process.env.CLOUDINARY_API_SECRET?.trim();
  return cloud && key && secret ? { cloud, key, secret } : null;
}

export function videoProvider(): VideoProvider {
  const forced = process.env.VIDEO_PROVIDER as VideoProvider | undefined;
  if (forced === "cloudinary" && cloudinaryConfig()) return "cloudinary";
  if (forced === "supabase" && getSupabaseStorageConfig()) return "supabase";
  if (forced === "local") return "local";
  if (cloudinaryConfig()) return "cloudinary";
  if (getSupabaseStorageConfig()) return "supabase";
  return "local";
}

/** Dung lượng tối đa một video (byte) theo nơi lưu trữ; VIDEO_MAX_MB chỉ có thể HẠ thấp thêm. */
export function videoMaxBytes(p: VideoProvider = videoProvider()): number {
  const base = p === "supabase" ? 50 * MB - 512 * 1024 : 100 * MB;
  const env = Number(process.env.VIDEO_MAX_MB);
  return Number.isFinite(env) && env > 0 ? Math.min(base, env * MB) : base;
}

export const hlsEnabled = () => process.env.VIDEO_HLS !== "0";

export function videoLimits() {
  const provider = videoProvider();
  return { provider, maxBytes: videoMaxBytes(provider), maxDurationS: VIDEO_MAX_DURATION_S, mimes: Object.keys(VIDEO_MIME_EXT) };
}

// ---------------------------------------------------------------------
// Vé tải lên (JWT ngắn hạn): chứng minh máy chủ đã cho phép đúng người này tải đúng tệp này vào đúng album
// ---------------------------------------------------------------------
export interface UploadTicketClaims {
  uid: string;
  albumId: string;
  provider: VideoProvider;
  key: string;
  mime: string;
  max: number;
  /** Số byte người dùng khai (kiểm lại với thực tế sau khi tải) */
  size: number;
}
const TICKET_AUD = "luuxa-video-upload";

export async function signUploadTicket(c: UploadTicketClaims): Promise<string> {
  const { SignJWT } = await import("jose");
  const { getTicketKey } = await import("./auth/tokens");
  const { key, kid } = await getTicketKey();
  return new SignJWT({ alb: c.albumId, prov: c.provider, k: c.key, mime: c.mime, max: c.max, size: c.size })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setSubject(c.uid)
    .setAudience(TICKET_AUD)
    .setIssuedAt()
    .setExpirationTime("45m")
    .sign(key);
}

export async function verifyUploadTicket(token: string, uid: string): Promise<UploadTicketClaims> {
  try {
    const { jwtVerify } = await import("jose");
    const { getTicketPublicKey } = await import("./auth/tokens");
    const { payload } = await jwtVerify(token, await getTicketPublicKey(), { audience: TICKET_AUD, algorithms: ["EdDSA"] });
    if (payload.sub !== uid) throw new Error("uid");
    return { uid, albumId: String(payload.alb), provider: payload.prov as VideoProvider, key: String(payload.k), mime: String(payload.mime), max: Number(payload.max), size: Number(payload.size) };
  } catch {
    throw new ApiError(400, "BAD_TICKET", "Phiên tải video đã hết hạn hoặc không hợp lệ — hãy chọn lại video và tải lên lần nữa.");
  }
}

// ---------------------------------------------------------------------
// Cloudinary
// ---------------------------------------------------------------------
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/** Chữ ký tải lên: SHA-1 của các tham số (trừ file, api_key, resource_type, cloud_name) sắp theo tên, nối `k=v&…`, cộng api_secret. */
export function cloudinarySign(params: Record<string, string | number>, secret: string): string {
  const s = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sha1(s + secret);
}

/** Chữ ký phản hồi tải lên (chống người dùng tự khai public_id của tệp khác): sha1(public_id=…&version=… + secret). */
export function cloudinaryResponseSignature(publicId: string, version: string | number, secret: string): string {
  return sha1(`public_id=${publicId}&version=${version}${secret}`);
}

export interface UploadInit {
  provider: VideoProvider;
  ticket: string;
  maxBytes: number;
  /** Địa chỉ nhận tệp (trình duyệt gửi thẳng tới đây) */
  uploadUrl: string;
  /** cloudinary: POST multipart (các trường bên dưới + file); supabase: PUT multipart (cacheControl + file); local: PUT thân thô */
  method: "POST" | "PUT";
  fields: Record<string, string>;
  headers: Record<string, string>;
  /** Tên trường chứa tệp trong multipart ("" = trường rỗng của Supabase); null = gửi thân thô */
  fileField: string | null;
}

let videoBucketReady = false;
async function ensureSupabaseVideoBucket(cfg: { url: string; key: string }) {
  if (videoBucketReady) return;
  const headers = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" };
  const got = await fetch(`${cfg.url}/storage/v1/bucket/${SUPABASE_BUCKET}`, { headers });
  if (got.ok) {
    videoBucketReady = true;
    return;
  }
  const res = await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: SUPABASE_BUCKET, name: SUPABASE_BUCKET, public: false, file_size_limit: 50 * MB, allowed_mime_types: Object.keys(VIDEO_MIME_EXT) }),
  });
  if (!res.ok && res.status !== 409) {
    const t = await res.text();
    if (!/already exists|Duplicate/i.test(t)) throw new ApiError(502, "STORAGE_BUCKET", `Không tạo được kho video trên Supabase Storage (${res.status}).`);
  }
  videoBucketReady = true;
}

/** Chuẩn bị tải lên: sinh khóa đối tượng, địa chỉ + tham số cho trình duyệt, và vé. */
export async function initVideoUpload(input: { uid: string; albumId: string; mime: string; sizeBytes: number }): Promise<UploadInit> {
  const provider = videoProvider();
  const maxBytes = videoMaxBytes(provider);
  const ext = VIDEO_MIME_EXT[input.mime];
  if (!ext) throw new ApiError(415, "UNSUPPORTED_TYPE", "Chỉ nhận video MP4, MOV (iPhone), WebM, M4V hoặc 3GP.");
  if (input.sizeBytes <= 0) throw new ApiError(400, "EMPTY_FILE", "Tệp video rỗng.");
  if (input.sizeBytes > maxBytes) {
    const where = provider === "supabase" ? " (gói miễn phí của Supabase giới hạn 50 MB — hãy cắt ngắn / nén video hoặc nhờ quản trị bật Cloudinary)" : "";
    throw new ApiError(413, "FILE_TOO_LARGE", `Video lớn quá ${Math.round(maxBytes / MB)} MB${where}.`);
  }
  const id = randomUUID();
  const now = new Date(Date.now() + 7 * 3600e3);
  const folder = `moments/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  if (provider === "cloudinary") {
    const cfg = cloudinaryConfig()!;
    const publicId = `luuxa/${folder}/${id}`;
    const timestamp = Math.floor(Date.now() / 1000);
    // Chỉ ký các tham số cố định ⇒ trình duyệt không thêm được biến đổi / thông báo nào khác
    const toSign = { public_id: publicId, timestamp };
    const ticket = await signUploadTicket({ uid: input.uid, albumId: input.albumId, provider, key: publicId, mime: input.mime, max: maxBytes, size: input.sizeBytes });
    return {
      provider,
      ticket,
      maxBytes,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloud}/video/upload`,
      method: "POST",
      fields: { api_key: cfg.key, timestamp: String(timestamp), public_id: publicId, signature: cloudinarySign(toSign, cfg.secret) },
      headers: {},
      fileField: "file",
    };
  }

  if (provider === "supabase") {
    const cfg = getSupabaseStorageConfig()!;
    await ensureSupabaseVideoBucket(cfg);
    const objectKey = `${folder}/${id}.${ext}`;
    const res = await fetch(`${cfg.url}/storage/v1/object/upload/sign/${SUPABASE_BUCKET}/${objectKey}`, {
      method: "POST",
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new ApiError(502, "STORAGE_SIGN", `Không tạo được liên kết tải video lên Supabase (${res.status}).`);
    const j = (await res.json()) as { url?: string };
    if (!j.url) throw new ApiError(502, "STORAGE_SIGN", "Supabase không trả liên kết tải lên.");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const ticket = await signUploadTicket({ uid: input.uid, albumId: input.albumId, provider, key: objectKey, mime: input.mime, max: maxBytes, size: input.sizeBytes });
    return {
      provider,
      ticket,
      maxBytes,
      uploadUrl: `${cfg.url}/storage/v1${j.url}`,
      method: "PUT",
      fields: { cacheControl: "31536000" },
      headers: { "x-upsert": "false", ...(anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {}) },
      fileField: "",
    };
  }

  const objectKey = `videos/${folder}/${id}.${ext}`;
  const ticket = await signUploadTicket({ uid: input.uid, albumId: input.albumId, provider, key: objectKey, mime: input.mime, max: maxBytes, size: input.sizeBytes });
  return { provider, ticket, maxBytes, uploadUrl: `/api/v1/moments/videos/local-upload?ticket=${encodeURIComponent(ticket)}`, method: "PUT", fields: {}, headers: {}, fileField: null };
}

// ---------------------------------------------------------------------
// Xác minh sau khi tải xong
// ---------------------------------------------------------------------
export interface VerifiedAsset {
  provider: VideoProvider;
  objectKey: string;
  sizeBytes: number;
  meta: Record<string, unknown>;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}
export interface ClientUploadResult {
  /** Phản hồi của Cloudinary sau khi tải (public_id, version, signature, bytes, duration, width, height, format) */
  cloudinary?: { public_id: string; version: number | string; signature: string; bytes: number; duration?: number; width?: number; height?: number; format?: string; resource_type?: string };
}

export async function verifyUploadedAsset(t: UploadTicketClaims, client: ClientUploadResult): Promise<VerifiedAsset> {
  if (t.provider === "cloudinary") {
    const cfg = cloudinaryConfig();
    const r = client.cloudinary;
    if (!cfg || !r) throw new ApiError(400, "BAD_UPLOAD", "Thiếu thông tin tải lên Cloudinary.");
    if (r.public_id !== t.key) throw new ApiError(400, "BAD_UPLOAD", "Tệp tải lên không khớp phiên tải.");
    if (r.resource_type && r.resource_type !== "video") throw new ApiError(400, "BAD_UPLOAD", "Tệp tải lên không phải video.");
    if (r.signature !== cloudinaryResponseSignature(r.public_id, r.version, cfg.secret)) throw new ApiError(400, "BAD_UPLOAD", "Chữ ký tệp tải lên không hợp lệ.");
    const bytes = Number(r.bytes);
    if (!(bytes > 0) || bytes > t.max) throw new ApiError(413, "FILE_TOO_LARGE", "Dung lượng video vượt giới hạn.");
    return {
      provider: "cloudinary",
      objectKey: r.public_id,
      sizeBytes: bytes,
      meta: { version: String(r.version), format: r.format ?? null },
      durationMs: r.duration ? Math.round(Number(r.duration) * 1000) : null,
      width: r.width ?? null,
      height: r.height ?? null,
    };
  }
  if (t.provider === "supabase") {
    const cfg = getSupabaseStorageConfig();
    if (!cfg) throw new ApiError(500, "NO_STORAGE", "Chưa cấu hình Supabase Storage.");
    const res = await fetch(`${cfg.url}/storage/v1/object/info/${SUPABASE_BUCKET}/${t.key}`, { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } });
    if (!res.ok) throw new ApiError(400, "BAD_UPLOAD", "Chưa thấy video trên kho lưu trữ — hãy tải lại.");
    const info = (await res.json()) as { size?: number; content_type?: string; metadata?: { size?: number; mimetype?: string } };
    const size = Number(info.size ?? info.metadata?.size ?? 0);
    if (!(size > 0) || size > t.max) {
      await deleteVideoObject({ provider: "supabase", object_key: t.key });
      throw new ApiError(413, "FILE_TOO_LARGE", "Dung lượng video vượt giới hạn.");
    }
    return { provider: "supabase", objectKey: t.key, sizeBytes: size, meta: {}, durationMs: null, width: null, height: null };
  }
  const st = await stat(localPath(t.key)).catch(() => null);
  if (!st || st.size <= 0) throw new ApiError(400, "BAD_UPLOAD", "Chưa thấy video trên máy chủ — hãy tải lại.");
  if (st.size > t.max) {
    await rm(localPath(t.key), { force: true });
    throw new ApiError(413, "FILE_TOO_LARGE", "Dung lượng video vượt giới hạn.");
  }
  return { provider: "local", objectKey: t.key, sizeBytes: st.size, meta: {}, durationMs: null, width: null, height: null };
}

// ---------------------------------------------------------------------
// Phát
// ---------------------------------------------------------------------
export interface VideoRow {
  provider: VideoProvider;
  object_key: string;
  provider_meta?: Record<string, unknown> | null;
  mime?: string | null;
}

export interface VideoSources {
  /** Địa chỉ phát tiến trình (MP4); với Supabase / local là API trả chuyển hướng tới URL ký / phát có Range */
  mp4: string;
  /** Danh sách phát HLS thích ứng băng thông (chỉ Cloudinary, khi bật VIDEO_HLS) */
  hls: string | null;
  /** Ảnh bìa dự phòng do nhà cung cấp tạo (khi video không có poster tự chụp) */
  poster: string | null;
}

export function videoSources(id: string, v: VideoRow): VideoSources {
  if (v.provider === "cloudinary") {
    const cfg = cloudinaryConfig();
    if (cfg) {
      const ver = v.provider_meta?.version ? `v${v.provider_meta.version}/` : "";
      const base = `https://res.cloudinary.com/${cfg.cloud}/video/upload`;
      return {
        mp4: `${base}/f_mp4,vc_h264,ac_aac,q_auto,c_limit,w_1280/${ver}${v.object_key}.mp4`,
        hls: hlsEnabled() ? `${base}/sp_auto/${ver}${v.object_key}.m3u8` : null,
        poster: `${base}/so_0,f_jpg,q_auto,c_limit,w_720/${ver}${v.object_key}.jpg`,
      };
    }
  }
  return { mp4: `/api/v1/moments/videos/${id}/play`, hls: null, poster: null };
}

/** URL ký (có hạn) để phát video trong Supabase Storage. */
export async function supabaseSignedPlayUrl(objectKey: string, expiresIn = 3600): Promise<string> {
  const cfg = getSupabaseStorageConfig();
  if (!cfg) throw new ApiError(500, "NO_STORAGE", "Chưa cấu hình Supabase Storage.");
  const res = await fetch(`${cfg.url}/storage/v1/object/sign/${SUPABASE_BUCKET}/${objectKey}`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new ApiError(404, "NOT_FOUND", "Video không còn trên kho lưu trữ.");
  const j = (await res.json()) as { signedURL?: string };
  if (!j.signedURL) throw new ApiError(404, "NOT_FOUND", "Video không còn trên kho lưu trữ.");
  return `${cfg.url}/storage/v1${j.signedURL}`;
}

// ---------------------------------------------------------------------
// Lưu trữ local (máy phát triển)
// ---------------------------------------------------------------------
const storageRoot = () => path.resolve(process.cwd(), process.env.STORAGE_DIR || ".local/storage");
export function localPath(key: string): string {
  const p = path.resolve(storageRoot(), key);
  if (!p.startsWith(storageRoot() + path.sep)) throw new ApiError(400, "BAD_KEY", "Khóa tệp không hợp lệ.");
  return p;
}
export async function ensureLocalDir(key: string) {
  await mkdir(path.dirname(localPath(key)), { recursive: true });
}

/** Phát tệp local có hỗ trợ Range (để tua video). */
export async function serveLocalVideo(key: string, mime: string, range: string | null): Promise<Response> {
  const p = localPath(key);
  const st = await stat(p).catch(() => null);
  if (!st) throw new ApiError(404, "NOT_FOUND", "Video không còn trên máy chủ.");
  const total = st.size;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  let start = 0;
  let end = total - 1;
  let status = 200;
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    } else {
      start = Math.max(0, total - Number(m[2]));
    }
    if (start > end || start >= total) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    status = 206;
  }
  const stream = createReadStream(p, { start, end });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (c) => controller.enqueue(typeof c === "string" ? new TextEncoder().encode(c) : new Uint8Array(c)));
      stream.on("end", () => controller.close());
      stream.on("error", (e) => controller.error(e));
    },
    cancel() {
      stream.destroy();
    },
  });
  const headers: Record<string, string> = {
    "content-type": mime,
    "content-length": String(end - start + 1),
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  if (status === 206) headers["content-range"] = `bytes ${start}-${end}/${total}`;
  return new Response(body, { status, headers });
}

// ---------------------------------------------------------------------
// Xóa tệp (khi xóa video) — chạy nền, lỗi không làm hỏng việc xóa
// ---------------------------------------------------------------------
export async function deleteVideoObject(v: { provider: VideoProvider; object_key: string }): Promise<void> {
  try {
    if (v.provider === "cloudinary") {
      const cfg = cloudinaryConfig();
      if (!cfg) return;
      const timestamp = Math.floor(Date.now() / 1000);
      const params = { invalidate: "true", public_id: v.object_key, timestamp };
      const body = new URLSearchParams({ public_id: v.object_key, invalidate: "true", timestamp: String(timestamp), api_key: cfg.key, signature: cloudinarySign(params, cfg.secret) });
      await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/video/destroy`, { method: "POST", body });
    } else if (v.provider === "supabase") {
      const cfg = getSupabaseStorageConfig();
      if (!cfg) return;
      await fetch(`${cfg.url}/storage/v1/object/${SUPABASE_BUCKET}`, {
        method: "DELETE",
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [v.object_key] }),
      });
    } else {
      await rm(localPath(v.object_key), { force: true });
    }
  } catch (e) {
    console.warn("[video] không xóa được tệp video:", (e as Error).message);
  }
}
