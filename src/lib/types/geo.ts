// Danh mục đơn vị hành chính Việt Nam (lấy qua máy chủ từ provinces.open-api.vn — trình duyệt không gọi thẳng ra ngoài).
//  - "2025": địa giới hiện hành từ 01/07/2025 — 34 tỉnh/thành, hai cấp tỉnh → xã/phường (API v2).
//  - "legacy": địa giới cũ trước 07/2025 — 63 tỉnh/thành (API v1), chỉ dùng để chọn quê quán ghi theo tên cũ.

export type GeoEdition = "2025" | "legacy";

export interface GeoProvinceDto {
  code: number;
  /** Tên đầy đủ: "Thành phố Hà Nội", "Tỉnh Nghệ An" */
  name: string;
  /** Tên gọn để lưu/hiển thị: "Hà Nội", "Nghệ An", "TP. Hồ Chí Minh" */
  shortName: string;
  /** "tỉnh" | "thành phố trung ương" … */
  type: string;
}

export interface GeoWardDto {
  code: number;
  /** "Phường Ba Đình", "Xã Trung Đông" */
  name: string;
  type: string;
  provinceCode: number;
}

export interface GeoListDto<T> {
  items: T[];
  edition: GeoEdition;
  /** Lần tải từ nguồn (ISO) */
  fetchedAt: string;
  /** true = nguồn đang lỗi, đang dùng bản đã lưu tạm trước đó */
  stale: boolean;
  source: string;
}
