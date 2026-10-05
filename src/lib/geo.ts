// Hàm thuần dùng chung client/server cho danh mục tỉnh/thành, xã/phường: tìm kiếm không dấu, rút gọn tên,
// so khớp chuỗi địa chỉ đã lưu (văn bản tự do từ trước) với danh mục để điền sẵn bộ chọn.
import type { GeoProvinceDto, GeoWardDto } from "./types/geo";

/** Bỏ dấu + chữ thường + gộp khoảng trắng: "Thành phố Hồ Chí Minh" → "thanh pho ho chi minh" */
export const foldVi = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Khóa so khớp tên tỉnh: bỏ dấu và tiền tố "Tỉnh"/"Thành phố"/"TP." — "TP.HCM", "Hồ Chí Minh", "Thành phố Hồ Chí Minh" cùng một khóa. */
export function provinceKey(s: string): string {
  const k = foldVi(s)
    .replace(/^(tinh|thanh pho|t\.?\s?p\.?)\s*/, "")
    .replace(/[.\s]+/g, " ")
    .trim();
  return ["hcm", "tphcm", "sai gon", "saigon"].includes(k) ? "ho chi minh" : k;
}

/** Khóa so khớp tên xã/phường: bỏ dấu và tiền tố "Phường"/"Xã"/"Đặc khu"/"Thị trấn". */
export const wardKey = (s: string) =>
  foldVi(s)
    .replace(/^(phuong|xa|dac khu|thi tran|p\.|x\.)\s*/, "")
    .trim();

/** "Thành phố Hà Nội" → "Hà Nội"; "Thành phố Hồ Chí Minh" → "TP. Hồ Chí Minh" (cách viết quen thuộc). */
export function provinceShortName(name: string): string {
  const s = name
    .trim()
    .replace(/^(Tỉnh|Thành phố|TP\.?)\s+/i, "")
    .trim();
  return provinceKey(s) === "ho chi minh" ? "TP. Hồ Chí Minh" : s;
}

export function findProvince<T extends GeoProvinceDto>(text: string | null | undefined, list: T[]): T | null {
  const k = text ? provinceKey(text) : "";
  return k ? list.find((p) => provinceKey(p.name) === k) ?? null : null;
}

export function findWard<T extends GeoWardDto>(text: string | null | undefined, list: T[]): T | null {
  const k = text ? wardKey(text) : "";
  if (!k) return null;
  const full = text ? foldVi(text) : "";
  return list.find((w) => foldVi(w.name) === full) ?? list.find((w) => wardKey(w.name) === k) ?? null;
}

/** Tách chuỗi theo dấu phẩy, bỏ phần rỗng. */
export const addressParts = (text: string | null | undefined) =>
  (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Ghép địa chỉ: "Số 12 ngõ 5, Phường Ba Đình, Thành phố Hà Nội" */
export const composeAddress = (detail: string, wardName: string | null, provinceName: string | null) =>
  [detail.trim(), wardName ?? "", provinceName ?? ""].filter((s) => s.trim()).join(", ");

/** Lọc danh sách theo chuỗi tìm (không dấu, khớp từng từ), ưu tiên tên bắt đầu bằng chuỗi tìm. */
export function searchGeo<T extends { name: string }>(list: T[], query: string, limit = 80): T[] {
  const q = foldVi(query);
  if (!q) return list.slice(0, limit);
  const words = q.split(" ");
  const alias = provinceKey(query); // "hcm", "tp.hcm", "sai gon" → "ho chi minh"
  const hits = list.filter((x) => {
    const n = foldVi(x.name);
    return words.every((w) => n.includes(w)) || provinceKey(x.name) === alias;
  });
  const starts = (x: T) => (wardKey(x.name).startsWith(q) || provinceKey(x.name).startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b)).slice(0, limit);
}
