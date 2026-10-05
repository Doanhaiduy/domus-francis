import "server-only";
import { ApiError } from "./errors";
import { provinceShortName } from "@/lib/geo";
import type { GeoEdition, GeoListDto, GeoProvinceDto, GeoWardDto } from "@/lib/types/geo";

// ---------------------------------------------------------------------
// Danh mục tỉnh/thành, xã/phường từ provinces.open-api.vn (dữ liệu công khai, chỉ GET). Máy chủ gọi thay trình duyệt:
//  - chỉ gọi đúng vài đường dẫn cố định (mã tỉnh phải có trong danh sách tỉnh trước khi hỏi danh sách xã) ⇒ không thành proxy mở;
//  - đệm trong bộ nhớ 24 giờ; nguồn lỗi thì dùng tiếp bản cũ tối đa 7 ngày (stale = true);
//  - không có bản nào ⇒ 503 kèm lời nhắn tiếng Việt, ô nhập trên giao diện vẫn cho gõ tay.
// PROVINCES_API_BASE_URL đổi nguồn (kiểm thử trỏ tới máy chủ giả loopback — scripts/test-api/geo.mjs).
// ---------------------------------------------------------------------
const BASE = (process.env.PROVINCES_API_BASE_URL || "https://provinces.open-api.vn").replace(/\/+$/, "");
const SOURCE = "provinces.open-api.vn";
const TTL_MS = 24 * 3600_000;
const STALE_MS = 7 * 24 * 3600_000;
const TIMEOUT_MS = 8_000;

interface Entry {
  at: number;
  data: unknown[];
}
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
/** Nguồn treo (quá thời gian chờ) ⇒ 30 giây kế tiếp báo lỗi ngay, không bắt người dùng chờ lại 8 giây mỗi lần mở ô chọn. */
let hangUntil = 0;

const unavailable = () =>
  new ApiError(503, "GEO_UNAVAILABLE", "Chưa tải được danh mục tỉnh/thành (provinces.open-api.vn) — thử lại sau, hoặc nhập tay vào ô địa chỉ.");

async function load(path: string): Promise<{ data: unknown[]; at: number; stale: boolean }> {
  const hit = cache.get(path);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return { ...hit, stale: false };
  if (now < hangUntil) {
    if (hit && now - hit.at < STALE_MS) return { ...hit, stale: true };
    throw unavailable();
  }
  let p = inflight.get(path);
  if (!p) {
    p = (async () => {
      const r = await fetch(BASE + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (!Array.isArray(data) || !data.length) throw new Error("dữ liệu rỗng");
      const e = { at: Date.now(), data };
      cache.set(path, e);
      return e;
    })().finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  try {
    return { ...(await p), stale: false };
  } catch (err) {
    if ((err as Error).name === "TimeoutError") hangUntil = Date.now() + 30_000;
    if (hit && now - hit.at < STALE_MS) return { ...hit, stale: true };
    console.warn(`[geo] ${path}: ${(err as Error).message}`);
    throw unavailable();
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function toProvinces(raw: unknown[]): GeoProvinceDto[] {
  const out: GeoProvinceDto[] = [];
  for (const x of raw as Record<string, unknown>[]) {
    const code = int(x?.code);
    const name = str(x?.name);
    if (code && name) out.push({ code, name, shortName: provinceShortName(name), type: str(x.division_type) });
  }
  if (!out.length) throw unavailable();
  return out;
}

export async function listProvinces(edition: GeoEdition): Promise<GeoListDto<GeoProvinceDto>> {
  const r = await load(edition === "legacy" ? "/api/v1/p/" : "/api/v2/p/");
  return { items: toProvinces(r.data), edition, fetchedAt: new Date(r.at).toISOString(), stale: r.stale, source: SOURCE };
}

/** Xã/phường của một tỉnh theo địa giới hiện hành (2025 — không còn cấp huyện). */
export async function listWards(provinceCode: number): Promise<GeoListDto<GeoWardDto>> {
  const provinces = await listProvinces("2025");
  if (!provinces.items.some((p) => p.code === provinceCode)) throw new ApiError(404, "NOT_FOUND", "Không có tỉnh/thành với mã này.");
  const r = await load(`/api/v2/w/?province=${provinceCode}`);
  const items: GeoWardDto[] = [];
  for (const x of r.data as Record<string, unknown>[]) {
    const code = int(x?.code);
    const name = str(x?.name);
    if (code && name && int(x.province_code) === provinceCode) items.push({ code, name, type: str(x.division_type), provinceCode });
  }
  if (!items.length) throw unavailable();
  const bare = (n: string) => n.replace(/^(Phường|Xã|Đặc khu)\s+/, "");
  items.sort((a, b) => bare(a.name).localeCompare(bare(b.name), "vi"));
  return { items, edition: "2025", fetchedAt: new Date(r.at).toISOString(), stale: r.stale, source: SOURCE };
}
