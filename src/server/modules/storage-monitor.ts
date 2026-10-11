import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Tx } from "../db";
import { forbidden } from "../errors";
import { BUCKETS, getSupabaseStorageConfig, localStorageRoot } from "../storage";
import { cloudinaryConfig } from "../video";
import type { CloudinaryUsage, MonitorLimits, ProvidersDto, StorageOverviewDto, SupabaseUsage } from "@/lib/types/storage-monitor";

// =====================================================================
// Theo dõi dung lượng (chỉ Admin — quyền system.monitor).
//   • Số liệu CSDL + tệp: hàm CSDL app.fn_storage_overview (db/app/1039) — kiểm quyền trong hàm.
//   • Supabase Storage: ĐẾM THẬT qua Storage API (liệt kê từng thư mục <bucket>/<năm>/<tháng>, cộng metadata.size) — gồm cả bản thu nhỏ
//     thumb/medium mà bảng storage_files không ghi dung lượng. Khi chạy bằng ổ đĩa local thì đo thư mục .local/storage.
//   • Cloudinary: Admin API /usage (credits, lưu trữ, băng thông, biến đổi). Khóa đọc từ CLOUDINARY_* của từng môi trường.
//   Kết quả đo ngoài (chậm hơn) được nhớ 10 phút trong bộ nhớ tiến trình; "Đo lại" bỏ qua bộ nhớ đệm (cách nhau ≥ 15 giây).
// =====================================================================

export const MONITOR_PERMISSION = "system.monitor";

export async function assertMonitor(tx: Tx): Promise<void> {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission($1) AS ok", [MONITOR_PERMISSION])).rows[0]?.ok;
  if (!ok) throw forbidden("Chỉ Admin được xem theo dõi dung lượng.");
}

const MB = 1024 * 1024;

export async function readLimits(tx: Tx): Promise<MonitorLimits> {
  const rows = (await tx.query<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key LIKE 'monitor.%'")).rows;
  return limitsFromSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

export function limitsFromSettings(v: Record<string, unknown>): MonitorLimits {
  const num = (k: string, d: number) => {
    const n = Number(v[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const warn = num("monitor.warn_percent", 70);
  const critical = Math.max(num("monitor.critical_percent", 90), warn + 1);
  return {
    dbLimitBytes: num("monitor.supabase.db_limit_mb", 500) * MB,
    storageLimitBytes: num("monitor.supabase.storage_limit_mb", 1024) * MB,
    warnPercent: warn,
    criticalPercent: critical,
  };
}

/** Số liệu CSDL + tệp (nhanh, chỉ truy vấn CSDL). */
export async function getOverview(tx: Tx, days: number): Promise<StorageOverviewDto> {
  await assertMonitor(tx);
  const r = (await tx.query<{ o: Omit<StorageOverviewDto, "limits"> }>("SELECT app.fn_storage_overview($1) AS o", [days])).rows[0].o;
  return { ...r, limits: await readLimits(tx) };
}

// ---------------------------------------------------------------------
// Supabase Storage
// ---------------------------------------------------------------------
const SUPABASE_BUCKETS = [...BUCKETS, "videos"] as const;
const LIST_PAGE = 1000;
const MAX_OBJECTS = 200_000;
const SCAN_DEADLINE_MS = 45_000;

interface ListItem {
  name: string;
  id: string | null;
  metadata?: { size?: number | string } | null;
}

async function listPage(cfg: { url: string; key: string }, bucket: string, prefix: string, offset: number): Promise<ListItem[] | null> {
  const res = await fetch(`${cfg.url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404 || res.status === 400) return null; // bucket chưa có
  if (!res.ok) throw new Error(`Supabase Storage trả ${res.status}`);
  return (await res.json()) as ListItem[];
}

/** Duyệt cây thư mục của một bucket (có phân trang), cộng số đối tượng + dung lượng. */
async function scanBucket(cfg: { url: string; key: string }, bucket: string, deadline: number, budget: { left: number }): Promise<{ objects: number; bytes: number } | null> {
  let objects = 0;
  let bytes = 0;
  let exists = true;
  const walk = async (prefix: string): Promise<void> => {
    for (let offset = 0; ; offset += LIST_PAGE) {
      if (Date.now() > deadline) throw new Error("Quét Supabase Storage quá thời gian — thử đo lại sau.");
      if (budget.left <= 0) throw new Error(`Có quá nhiều đối tượng (> ${MAX_OBJECTS.toLocaleString("vi-VN")}) để đếm một lần.`);
      const items = await listPage(cfg, bucket, prefix, offset);
      if (items === null) {
        exists = false;
        return;
      }
      const folders: string[] = [];
      for (const it of items) {
        if (it.id === null || it.id === undefined) folders.push(prefix ? `${prefix}/${it.name}` : it.name);
        else {
          objects++;
          budget.left--;
          bytes += Number(it.metadata?.size ?? 0) || 0;
        }
      }
      // thư mục con của cùng một trang được duyệt song song (tối đa 6 cùng lúc)
      for (let i = 0; i < folders.length; i += 6) await Promise.all(folders.slice(i, i + 6).map(walk));
      if (items.length < LIST_PAGE) return;
    }
  };
  await walk("");
  return exists ? { objects, bytes } : null;
}

async function dirSize(dir: string): Promise<{ objects: number; bytes: number }> {
  let objects = 0;
  let bytes = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { objects, bytes };
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const s = await dirSize(p);
      objects += s.objects;
      bytes += s.bytes;
    } else if (e.isFile()) {
      objects++;
      bytes += (await stat(p).catch(() => ({ size: 0 }))).size;
    }
  }
  return { objects, bytes };
}

export async function measureSupabase(deadlineMs = SCAN_DEADLINE_MS): Promise<SupabaseUsage> {
  const cfg = getSupabaseStorageConfig();
  if (!cfg) {
    // Chạy bằng ổ đĩa local (máy dev / kiểm thử): đo thư mục lưu tệp để trang vẫn có số liệu thật
    const root = localStorageRoot();
    const names = await readdir(root).catch(() => [] as string[]);
    const buckets: SupabaseUsage["buckets"] = [];
    for (const n of names) {
      const s = await dirSize(path.join(root, n));
      if (s.objects) buckets.push({ bucket: n, ...s });
    }
    const total = buckets.reduce((a, b) => ({ objects: a.objects + b.objects, bytes: a.bytes + b.bytes }), { objects: 0, bytes: 0 });
    return { source: "local", usedBytes: total.bytes, objects: total.objects, buckets: buckets.sort((a, b) => b.bytes - a.bytes) };
  }
  try {
    const deadline = Date.now() + deadlineMs;
    const budget = { left: MAX_OBJECTS };
    const out = await Promise.all(SUPABASE_BUCKETS.map(async (b) => ({ bucket: b as string, r: await scanBucket(cfg, b, deadline, budget) })));
    const buckets = out.filter((x) => x.r).map((x) => ({ bucket: x.bucket, objects: x.r!.objects, bytes: x.r!.bytes }));
    return {
      source: "supabase",
      usedBytes: buckets.reduce((s, b) => s + b.bytes, 0),
      objects: buckets.reduce((s, b) => s + b.objects, 0),
      buckets: buckets.sort((a, b) => b.bytes - a.bytes),
    };
  } catch (e) {
    return { source: "unavailable", usedBytes: null, objects: null, buckets: [], error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------
// Cloudinary
// ---------------------------------------------------------------------
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Chuẩn hóa phản hồi /usage (gói mới có khối "credits"; gói cũ có used_percent theo từng mục). */
export function normalizeCloudinaryUsage(j: unknown): CloudinaryUsage {
  const o = asObj(j);
  const credits = asObj(o.credits);
  const storage = asObj(o.storage);
  const bandwidth = asObj(o.bandwidth);
  const transformations = asObj(o.transformations);
  const used = numOrNull(credits.usage);
  const limit = numOrNull(credits.limit);
  let percent = numOrNull(credits.used_percent);
  if (percent === null && used !== null && limit) percent = (used / limit) * 100;
  if (percent === null) {
    // gói theo hạn mức từng mục: lấy mục cao nhất
    const ps = [storage, bandwidth, transformations].map((x) => numOrNull(x.used_percent)).filter((x): x is number => x !== null);
    if (ps.length) percent = Math.max(...ps);
  }
  return {
    configured: true,
    ok: true,
    plan: typeof o.plan === "string" ? o.plan : null,
    creditsUsed: used,
    creditsLimit: limit,
    creditsPercent: percent,
    storageBytes: numOrNull(storage.usage),
    bandwidthBytes: numOrNull(bandwidth.usage),
    transformations: numOrNull(transformations.usage),
    resources: numOrNull(o.resources),
    lastUpdated: typeof o.last_updated === "string" ? o.last_updated : null,
  };
}

const emptyCloudinary = (over: Partial<CloudinaryUsage>): CloudinaryUsage => ({
  configured: false,
  ok: false,
  plan: null,
  creditsUsed: null,
  creditsLimit: null,
  creditsPercent: null,
  storageBytes: null,
  bandwidthBytes: null,
  transformations: null,
  resources: null,
  lastUpdated: null,
  ...over,
});

export async function fetchCloudinaryUsage(): Promise<CloudinaryUsage> {
  const cfg = cloudinaryConfig();
  if (!cfg) return emptyCloudinary({ error: "Chưa cấu hình CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET." });
  // CLOUDINARY_API_BASE_URL: chỉ để kiểm thử (máy chủ giả loopback); mặc định là API thật
  const base = (process.env.CLOUDINARY_API_BASE_URL || "https://api.cloudinary.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/v1_1/${encodeURIComponent(cfg.cloud)}/usage`, {
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.key}:${cfg.secret}`).toString("base64")}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return emptyCloudinary({ configured: true, error: res.status === 401 || res.status === 403 ? "Cloudinary từ chối khóa API (kiểm tra CLOUDINARY_API_KEY/SECRET)." : `Cloudinary trả ${res.status}.` });
    return normalizeCloudinaryUsage(await res.json());
  } catch (e) {
    return emptyCloudinary({ configured: true, error: `Không gọi được Cloudinary: ${(e as Error).message}` });
  }
}

// ---------------------------------------------------------------------
// Bộ nhớ đệm + tổng hợp
// ---------------------------------------------------------------------
const TTL_MS = 10 * 60_000;
const MIN_REFRESH_MS = 15_000;
let cache: { at: number; data: Omit<ProvidersDto, "cached"> } | null = null;
let inflight: Promise<Omit<ProvidersDto, "cached">> | null = null;

async function measureAll(deadlineMs?: number): Promise<Omit<ProvidersDto, "cached">> {
  const [supabase, cloudinary] = await Promise.all([measureSupabase(deadlineMs), fetchCloudinaryUsage()]);
  return { fetchedAt: new Date().toISOString(), supabase, cloudinary };
}

export async function getProviders(opts: { refresh?: boolean; deadlineMs?: number } = {}): Promise<ProvidersDto> {
  const now = Date.now();
  if (cache && (!opts.refresh ? now - cache.at < TTL_MS : now - cache.at < MIN_REFRESH_MS)) return { ...cache.data, cached: true };
  inflight ??= measureAll(opts.deadlineMs)
    .then((d) => {
      cache = { at: Date.now(), data: d };
      return d;
    })
    .finally(() => {
      inflight = null;
    });
  return { ...(await inflight), cached: false };
}
