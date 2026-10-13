import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import exifReader from "exif-reader";
import { ApiError } from "./errors";
import type { Ctx } from "./http";

// ---------------------------------------------------------------------
// Lưu trữ tệp: Hỗ trợ Supabase Storage hoặc local disk (.local/storage).
//   pending_upload (luuxa_app ghi) → ready (bước xử lý tin cậy chạy với vai trò luuxa_worker xác lập MIME/SHA-256/pHash)
// Khóa đối tượng: <bucket>/<yyyy>/<mm>/<file_id>.<ext>.
// ---------------------------------------------------------------------

export const BUCKETS = ["avatars", "receipts", "cleaning-evidence", "academic-evidence", "maintenance", "moments", "attachments", "documents"] as const;
export type Bucket = (typeof BUCKETS)[number];

const MAX_BYTES = 20 * 1024 * 1024; // ck_storage_files__size
const IMAGE_MAX_SIDE = 2560;

const root = () => path.resolve(process.cwd(), process.env.STORAGE_DIR || ".local/storage");
/** Thư mục lưu tệp khi chạy bằng ổ đĩa local (theo dõi dung lượng đo thư mục này). */
export const localStorageRoot = root;
const abs = (key: string) => {
  const p = path.resolve(root(), key);
  if (!p.startsWith(root() + path.sep)) throw new ApiError(400, "BAD_KEY", "Khóa tệp không hợp lệ.");
  return p;
};

export function getSupabaseStorageConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (process.env.STORAGE_DRIVER === "local") return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function splitBucketAndPath(bucket: Bucket, key: string): { bucket: Bucket; path: string } {
  const prefix = `${bucket}/`;
  if (key.startsWith(prefix)) {
    return { bucket, path: key.slice(prefix.length) };
  }
  return { bucket, path: key };
}

async function uploadToSupabase(cfg: { url: string; key: string }, bucket: Bucket, objPath: string, buffer: Buffer, mime: string): Promise<void> {
  const res = await fetch(`${cfg.url}/storage/v1/object/${encodeURIComponent(bucket)}/${objPath}`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lỗi tải tệp lên Supabase Storage (${res.status}): ${errText}`);
  }
}

async function downloadFromSupabase(cfg: { url: string; key: string }, bucket: Bucket, objPath: string): Promise<Buffer | null> {
  const res = await fetch(`${cfg.url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${objPath}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes("NoSuchKey") || errText.includes("not_found") || errText.includes("Object not found")) {
      return null;
    }
    throw new Error(`Lỗi đọc tệp từ Supabase Storage (${res.status}): ${errText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/** Xóa đối tượng khỏi Supabase Storage. Trả true nếu Storage xác nhận (HTTP 2xx; đối tượng không còn cũng tính là xong). */
export async function deleteFromSupabase(cfg: { url: string; key: string }, bucket: Bucket, objPaths: string[]): Promise<boolean> {
  if (objPaths.length === 0) return true;
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: objPaths }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error(`[storage] xóa trên Supabase lỗi (${bucket}): HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error(`[storage] xóa trên Supabase lỗi (${bucket}):`, (e as Error).message);
    return false;
  }
}

/**
 * Xóa hẳn nội dung các tệp (bản gốc + biến thể) khỏi kho (Supabase Storage hoặc ổ đĩa local).
 * Trả về `id` của các tệp đã xóa XONG — tệp nào xóa trên Supabase lỗi thì KHÔNG có trong danh sách để lượt dọn sau thử lại
 * (trước đây lỗi bị bỏ qua sau khi CSDL đã xóa dấu ⇒ tệp mồ côi ăn dần hạn mức 1 GB).
 */
export async function purgeStorageFiles(
  files: { id?: string; bucket?: Bucket; object_key: string; variants?: Record<string, string> }[]
): Promise<string[]> {
  const supaCfg = getSupabaseStorageConfig();
  const byBucket = new Map<Bucket, { paths: string[]; ids: Set<string> }>();
  const done = new Set<string>();

  for (const f of files) {
    if (f.id) done.add(f.id);
    const allKeys = [f.object_key, ...Object.values(f.variants ?? {})];
    for (const key of allKeys) {
      if (supaCfg) {
        const bucket = (f.bucket || key.split("/")[0]) as Bucket;
        const { bucket: b, path: p } = splitBucketAndPath(bucket, key);
        const entry = byBucket.get(b) ?? { paths: [], ids: new Set<string>() };
        entry.paths.push(p);
        if (f.id) entry.ids.add(f.id);
        byBucket.set(b, entry);
      }
      try {
        const p = abs(key);
        await rm(p, { force: true });
      } catch {
        // bỏ qua nếu file local không tồn tại
      }
    }
  }

  if (supaCfg && byBucket.size > 0) {
    for (const [b, entry] of byBucket) {
      // tối đa 500 đối tượng mỗi lần gọi
      let ok = true;
      for (let i = 0; i < entry.paths.length; i += 500) ok = (await deleteFromSupabase(supaCfg, b, entry.paths.slice(i, i + 500))) && ok;
      if (!ok) for (const id of entry.ids) done.delete(id);
    }
  }
  return [...done];
}

type Kind = { mime: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; ext: string };
function sniff(buf: Buffer): Kind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

/** dHash 64-bit → bigint có dấu (vừa cột bigint của PostgreSQL). */
async function dHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return BigInt.asIntN(64, h).toString();
}

function exifTakenAt(exif: Buffer | undefined): Date | null {
  if (!exif) return null;
  try {
    const e = exifReader(exif) as { Photo?: { DateTimeOriginal?: Date }; Image?: { DateTime?: Date } };
    const d = e.Photo?.DateTimeOriginal ?? e.Image?.DateTime ?? null;
    return d instanceof Date && !isNaN(d.getTime()) && d.getFullYear() > 2000 ? d : null;
  } catch {
    return null;
  }
}

export interface StoredFile {
  id: string;
  bucket: Bucket;
  mime: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  url: string;
}

/** Thời gian từng bước (ms) — gửi về trình duyệt qua Server-Timing để biết chậm ở đâu. */
export type UploadTimings = Record<string, number>;

/** UUID v7 (48 bit thời gian + ngẫu nhiên) — cùng kiểu app.uuid_v7() của CSDL, tạo ngay ở máy chủ để không phải hỏi CSDL. */
function uuidV7(): string {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Ngày chụp do trình duyệt đọc từ EXIF gốc ("YYYY:MM:DD HH:MM:SS", giờ máy ảnh — hiểu như UTC giống exif-reader). */
function clientExifDate(v: string | null | undefined): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return !isNaN(d.getTime()) && d.getUTCFullYear() > 2000 && d.getTime() < Date.now() + 36 * 3600e3 ? d : null;
}

interface ProcessedImage {
  body: Buffer;
  width: number;
  height: number;
  phash: string;
  variants: [string, Buffer][];
}

async function processImage(input: Buffer, kind: Kind): Promise<ProcessedImage> {
  const pipeline = sharp(input).rotate().resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true });
  // sharp mặc định KHÔNG ghi lại metadata ⇒ EXIF (kể cả GPS) bị loại bỏ. JPEG dùng libjpeg-turbo (mozjpeg chậm gấp ~6 lần, chỉ nhỉnh ~5% dung lượng)
  const out = kind.mime === "image/png" ? pipeline.png({ compressionLevel: 9 }) : kind.mime === "image/webp" ? pipeline.webp({ quality: 85 }) : pipeline.jpeg({ quality: 85 });
  const { data, info } = await out.toBuffer({ resolveWithObject: true });
  const [phash, thumb, medium] = await Promise.all([
    dHash(data),
    sharp(data).resize({ width: 360, height: 360, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    sharp(data).resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
  ]);
  return { body: data, width: info.width, height: info.height, phash, variants: [["thumb", thumb], ["medium", medium]] };
}

/**
 * Nhận một tệp từ multipart/form-data: kiểm magic bytes, xoay đúng chiều + bỏ toàn bộ metadata (EXIF/GPS),
 * thu nhỏ ảnh quá lớn, tạo biến thể WebP, tính SHA-256 + pHash, ghi lên Supabase Storage (hoặc đĩa local) rồi đánh dấu ready.
 * Trình duyệt đã thu nhỏ + nén ảnh trước khi gửi (src/lib/image-optimize.ts) nên bước xử lý ở đây nhẹ; các việc độc lập chạy SONG SONG.
 */
export async function storeUpload(ctx: Ctx, file: File, bucket: Bucket, extra: { exifDate?: string | null } = {}): Promise<StoredFile & { timings: UploadTimings }> {
  const timings: UploadTimings = {};
  const lap = (name: string, since: number) => {
    timings[name] = Math.round(performance.now() - since);
  };
  const t0 = performance.now();
  if (!BUCKETS.includes(bucket)) throw new ApiError(400, "BAD_BUCKET", "Loại tệp không hợp lệ.");
  if (file.size <= 0) throw new ApiError(400, "EMPTY_FILE", "Tệp rỗng.");
  if (file.size > MAX_BYTES) throw new ApiError(413, "FILE_TOO_LARGE", "Tệp vượt quá 20 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  const kind = sniff(input);
  if (!kind) throw new ApiError(415, "UNSUPPORTED_TYPE", "Chỉ nhận ảnh JPEG, PNG, WebP hoặc tệp PDF (ảnh HEIC hãy chuyển sang JPEG trước).");
  if (kind.mime === "application/pdf" && !["attachments", "documents", "receipts", "academic-evidence"].includes(bucket)) {
    throw new ApiError(415, "UNSUPPORTED_TYPE", "Mục này chỉ nhận ảnh.");
  }
  lap("read", t0);

  const id = uuidV7();
  const now = new Date(Date.now() + 7 * 3600e3); // thư mục theo tháng giờ Việt Nam
  const prefix = `${bucket}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = `${prefix}/${id}.${kind.ext}`;

  // (1) luuxa_app: bản ghi pending_upload (RLS: uploaded_by = mình, cần quyền storage.upload) — chạy SONG SONG với xử lý ảnh
  const tIns = performance.now();
  // Dung lượng tối đa của ẢNH lấy từ cấu hình upload.max_image_bytes (Cài đặt → Lưu trữ tệp tải lên), không vượt trần cứng 20 MB; PDF giữ 20 MB.
  // Kiểm ngay trong câu INSERT (không thêm vòng mạng): vượt hạn mức ⇒ không ghi dòng nào ⇒ 413.
  const isImage = kind.mime !== "application/pdf";
  const insertP = ctx
    .db(async (tx) => {
      const r = await tx.query(
        `INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, size_bytes, uploaded_by, status, upload_expires_at)
         SELECT $1, $2, $3, $4, $5, $6::bigint, app.current_user_id(), 'pending_upload', now() + interval '10 minutes'
          WHERE NOT $7::boolean
             OR $6::bigint <= LEAST(app.setting_int('upload.max_image_bytes'), $8::bigint)`,
        [id, bucket, key, file.name?.slice(0, 200) || null, file.type || null, input.length, isImage, MAX_BYTES]
      );
      if (!r.rowCount) throw new ApiError(413, "FILE_TOO_LARGE", "Ảnh vượt quá dung lượng tối đa cho phép. Hãy chọn ảnh nhỏ hơn hoặc chụp lại ở chất lượng thấp hơn.");
    })
    .then(() => lap("db_insert", tIns));

  let body = input;
  let width: number | null = null;
  let height: number | null = null;
  let takenAt: Date | null = null;
  let phash: string | null = null;
  let variantBufs: [string, Buffer][] = [];
  const tProc = performance.now();
  const processP: Promise<void> =
    kind.mime === "application/pdf"
      ? Promise.resolve()
      : (async () => {
          let meta: Metadata;
          try {
            meta = await sharp(input).metadata();
          } catch {
            throw new ApiError(415, "CORRUPT_IMAGE", "Ảnh bị hỏng hoặc không đọc được.");
          }
          takenAt = exifTakenAt(meta.exif) ?? clientExifDate(extra.exifDate);
          const p = await processImage(input, kind).catch((e) => {
            throw e instanceof ApiError ? e : new ApiError(415, "CORRUPT_IMAGE", "Ảnh bị hỏng hoặc không đọc được.");
          });
          body = p.body;
          width = p.width;
          height = p.height;
          phash = p.phash;
          variantBufs = p.variants;
        })().then(() => lap("process", tProc));
  await Promise.all([insertP, processP]);

  const sha256 = createHash("sha256").update(body).digest("hex");
  const variants: Record<string, string> = {};
  for (const [name] of variantBufs) variants[name] = `${prefix}/${id}.${name}.webp`;

  // (2) Lưu trữ tệp (Supabase Storage hoặc Local Disk) — tệp chính + biến thể tải LÊN SONG SONG
  const writtenLocal: string[] = [];
  const writtenSupabase: { bucket: Bucket; path: string }[] = [];
  const supaCfg = getSupabaseStorageConfig();
  const cacheLocal = !process.env.VERCEL; // Vercel: hệ thống tệp chỉ đọc ⇒ không ghi đệm đĩa (trước đây thử rồi lỗi mỗi lần)

  try {
    const tStore = performance.now();
    const objects: { key: string; buf: Buffer; mime: string }[] = [
      { key, buf: body, mime: kind.mime },
      ...variantBufs.map(([name, buf]) => ({ key: variants[name], buf, mime: "image/webp" })),
    ];
    if (supaCfg) {
      await Promise.all(
        objects.map(async (o) => {
          const { bucket: b, path: p } = splitBucketAndPath(bucket, o.key);
          await uploadToSupabase(supaCfg, b, p, o.buf, o.mime);
          writtenSupabase.push({ bucket: b, path: p });
        })
      );
    }
    if (!supaCfg || cacheLocal) {
      try {
        await mkdir(path.dirname(abs(key)), { recursive: true });
        await Promise.all(
          objects.map(async (o) => {
            await writeFile(abs(o.key), o.buf);
            writtenLocal.push(abs(o.key));
          })
        );
      } catch (e) {
        if (!supaCfg) throw e; // lưu local là nơi lưu chính thức; còn khi có Supabase thì đây chỉ là bộ đệm
      }
    }
    lap("storage", tStore);

    // (3) bước xử lý tin cậy (vai trò worker) xác lập thuộc tính kiểm chứng — BR-STO-04
    const tFin = performance.now();
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query(
        `UPDATE storage_files
            SET status = 'ready', detected_mime = $2, sha256 = $3, phash = $4::bigint, width_px = $5, height_px = $6,
                taken_at = $7, exif_stripped = $8, scan_status = 'skipped', variants = $9::jsonb, size_bytes = $10
          WHERE id = $1`,
        [id, kind.mime, sha256, phash, width, height, takenAt, kind.mime !== "application/pdf", JSON.stringify(variants), body.length]
      )
    );
    lap("db_finalize", tFin);
  } catch (e) {
    if (supaCfg && writtenSupabase.length > 0) {
      const byBucket = new Map<Bucket, string[]>();
      for (const item of writtenSupabase) {
        const list = byBucket.get(item.bucket) || [];
        list.push(item.path);
        byBucket.set(item.bucket, list);
      }
      for (const [b, paths] of byBucket) {
        await deleteFromSupabase(supaCfg, b, paths);
      }
    }
    await Promise.all(writtenLocal.map((p) => rm(p, { force: true })));
    throw e;
  }
  lap("total", t0);
  return { id, bucket, mime: kind.mime, width, height, sizeBytes: body.length, url: `/api/v1/files/${id}`, timings };
}

/** Đọc nội dung đối tượng: đĩa cục bộ trước (rất nhanh), không có thì tải từ Supabase Storage rồi đệm lại vào đĩa. */
async function loadObject(bucket: Bucket, key: string): Promise<Buffer> {
  let data: Buffer | null = null;

  // 1. Kiểm tra cache đĩa cục bộ trước (< 1ms, tránh vòng mạng từ xa)
  try {
    data = await readFile(abs(key));
  } catch {
    // Chưa có ở đĩa cục bộ
  }

  // 2. Nếu đĩa chưa có, tải từ Supabase Storage và lưu đệm lại vào đĩa
  if (!data) {
    const supaCfg = getSupabaseStorageConfig();
    if (supaCfg) {
      const { bucket: b, path: p } = splitBucketAndPath(bucket, key);
      try {
        data = await downloadFromSupabase(supaCfg, b, p);
        if (data) {
          const localPath = abs(key);
          mkdir(path.dirname(localPath), { recursive: true })
            .then(() => writeFile(localPath, data!))
            .catch(() => {});
        }
      } catch (e) {
        console.warn(`[storage] Supabase download error for ${key}:`, (e as Error).message);
      }
    }
  }

  if (!data) throw new ApiError(404, "NOT_FOUND", "Tệp không còn trên máy chủ.");
  return data;
}

/**
 * Ảnh CÔNG KHAI (không cần đăng nhập) — chỉ tệp đang được một bài viết công khai đã đăng sử dụng
 * (app.fn_public_article_file). Ảnh được lưu đệm công khai 1 giờ để chịu được lượng truy cập khi bài được chia sẻ.
 */
export async function servePublicFile(ctx: Ctx, id: string, variant: string | null): Promise<Response> {
  const f = await ctx.db(async (tx) => (await tx.query("SELECT * FROM app.fn_public_article_file($1)", [id])).rows[0] as
    | { bucket: Bucket; object_key: string; detected_mime: string; variants: Record<string, string> }
    | undefined);
  if (!f) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tệp.");
  const useVariant = variant && f.variants?.[variant];
  const data = await loadObject(f.bucket, useVariant ? f.variants[variant!] : f.object_key);
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "content-type": useVariant ? "image/webp" : f.detected_mime,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

interface FileMeta {
  bucket: Bucket;
  object_key: string;
  detected_mime: string;
  variants: Record<string, string>;
  original_name: string | null;
}

const fileMetaCache = new Map<string, { meta: FileMeta; expires: number }>();

/** Trả nội dung tệp nếu người gọi được xem (RLS storage_files__select). */
export async function serveFile(ctx: Ctx, id: string, variant: string | null): Promise<Response> {
  const cacheKey = `${ctx.userId ?? "anon"}:${id}`;
  const now = Date.now();
  let f: FileMeta | null = null;
  const cached = fileMetaCache.get(cacheKey);
  if (cached && cached.expires > now) {
    f = cached.meta;
  } else {
    f = await ctx.db(async (tx) =>
      (
        await tx.query<FileMeta>(
          "SELECT bucket, object_key, detected_mime, variants, original_name FROM storage_files WHERE id = $1 AND status = 'ready' AND deleted_at IS NULL",
          [id]
        )
      ).rows[0] ?? null
    );
    if (f) {
      if (fileMetaCache.size > 2000) {
        for (const [k, v] of fileMetaCache) {
          if (v.expires < now) fileMetaCache.delete(k);
        }
      }
      fileMetaCache.set(cacheKey, { meta: f, expires: now + 60_000 });
    }
  }

  if (!f) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tệp.");
  const useVariant = variant && f.variants?.[variant];
  const key = useVariant ? f.variants[variant!] : f.object_key;
  const data = await loadObject(f.bucket, key);

  const mime = useVariant ? "image/webp" : f.detected_mime;
  const headers: Record<string, string> = {
    "content-type": mime,
    "cache-control": "private, max-age=86400, immutable",
    "x-content-type-options": "nosniff",
    // PDF: Chrome/Edge không hiển thị PDF trong tài liệu bị "sandbox" (chặn trình xem PDF tích hợp) ⇒ bỏ sandbox riêng cho PDF;
    // ảnh và tệp khác vẫn sandbox. Trình xem PDF của trình duyệt chạy tách biệt khỏi trang ứng dụng.
    "content-security-policy":
      mime === "application/pdf"
        ? "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'"
        : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  if (mime === "application/pdf" || ctx.query.has("download")) {
    const name = (f.original_name || `tep.${key.split(".").pop()}`).replace(/[^\p{L}\p{N}._ -]/gu, "_");
    headers["content-disposition"] = `${ctx.query.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  return new Response(new Uint8Array(data), { status: 200, headers });
}

/** Đọc nội dung (bản gốc) của một tệp mà người gọi được phép xem (RLS storage_files__select) — dùng cho các tác vụ xử lý ảnh phía máy chủ. */
export async function readStoredFile(ctx: Ctx, id: string): Promise<{ data: Buffer; mime: string; bucket: Bucket; name: string | null }> {
  const f = await ctx.db(async (tx) =>
    (
      await tx.query<FileMeta>(
        "SELECT bucket, object_key, detected_mime, variants, original_name FROM storage_files WHERE id = $1 AND status = 'ready' AND deleted_at IS NULL",
        [id]
      )
    ).rows[0] ?? null
  );
  if (!f) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tệp.");
  return { data: await loadObject(f.bucket, f.object_key), mime: f.detected_mime, bucket: f.bucket, name: f.original_name };
}
