// Các đường dẫn thuộc TRANG CÔNG KHAI (người ngoài xem, không cần đăng nhập, không dùng khung ứng dụng).
// Dùng chung cho middleware (không chuyển hướng đăng nhập), AppShell (không vẽ thanh bên), SessionProvider (không gọi /auth/me) và robots.txt.
// File này được middleware (Edge runtime) nạp ⇒ KHÔNG import module Node.
export const PUBLIC_SITE_PATHS = ["/tin-tuc", "/gioi-thieu", "/vao-o", "/lien-he", "/hoi-dap", "/thu-vien", "/ung-ho", "/chinh-sach-bao-mat", "/dieu-khoan-su-dung"] as const;

export const isPublicSitePath = (pathname: string): boolean => PUBLIC_SITE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Trang người ngoài thấy đầu tiên: khách chưa đăng nhập mở "/" được middleware chuyển tới đây; logo đầu trang công khai trỏ về đây. */
export const PUBLIC_HOME = "/gioi-thieu";

/** Ảnh chia sẻ mặc định (Open Graph) khi trang không có ảnh riêng — sinh bởi scripts/gen-icons.mjs. */
export const OG_DEFAULT_IMAGES = [{ url: "/og-default.png", width: 1200, height: 630 }];

/** Thành phố / tỉnh của lưu xá — dùng trong tiêu đề trang (SEO) và địa chỉ có cấu trúc (JSON-LD). */
export const SITE_CITY = "Nha Trang";
export const SITE_REGION = "Khánh Hòa";
/** Cụm từ mô tả loại hình (đưa vào tiêu đề/mô tả trang cho công cụ tìm kiếm). */
export const SITE_KIND = `lưu xá sinh viên Công giáo ${SITE_CITY}`;

/**
 * Nội dung chuyển khoản mặc định khi ủng hộ (không dấu, ≤ 25 ký tự — VietQR trường 62.08): mã QR ở /ung-ho điền sẵn để Thủ quỹ
 * (và việc khớp giao dịch ngân hàng tự động sau này) nhận ra ngay đây là khoản ủng hộ.
 */
export const DONATION_TRANSFER_CONTENT = "UNG HO LUU XA";

/** Mức gợi ý cho nút chọn nhanh số tiền ủng hộ (đồng). */
export const DONATION_PRESETS = [100_000, 200_000, 500_000, 1_000_000] as const;

/**
 * Liên kết mở bản đồ theo địa chỉ. KHÔNG nhúng iframe bản đồ của bên thứ ba vào trang (tránh gửi dữ liệu người xem cho họ khi chưa bấm) —
 * người xem tự bấm mở Google Maps hoặc OpenStreetMap.
 */
export function mapLinks(address: string): { google: string; osm: string } {
  const q = encodeURIComponent(address.trim());
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    osm: `https://www.openstreetmap.org/search?query=${q}`,
  };
}

/** Số điện thoại dạng gọi được (tel:) — bỏ khoảng trắng/dấu chấm. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
