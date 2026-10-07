// Văn bản pháp lý công khai: Chính sách bảo mật và Điều khoản sử dụng.
// Nội dung nằm ở legal-privacy.ts / legal-terms.ts (viết dưới dạng khối có cấu trúc); trang dựng bằng components/public/LegalDocument.tsx.
// Đổi nội dung có ý nghĩa pháp lý ⇒ tăng LEGAL_VERSION, đặt lại LEGAL_UPDATED (và LEGAL_UPDATED_ISO) cho cả hai văn bản.
import type { PublicOrgInfo } from "@/lib/types/articles";

export const LEGAL_VERSION = "1.0";
export const LEGAL_UPDATED = "07/10/2026";
export const LEGAL_UPDATED_ISO = "2026-10-07";

export const LEGAL_PATHS = {
  privacy: "/chinh-sach-bao-mat",
  terms: "/dieu-khoan-su-dung",
} as const;

/** Một khối nội dung. `md` dùng cú pháp của ArticleMarkdown (đoạn, ### tiêu đề nhỏ, danh sách, **đậm**, [chữ](/liên-kết)). Ô bảng chỉ hỗ trợ **đậm** và [chữ](liên-kết). */
export type LegalBlock =
  | { t: "md"; text: string }
  | { t: "table"; head: string[]; rows: string[][]; /** Tỉ lệ rộng các cột (Tailwind w-…), tùy chọn */ widths?: string[] }
  | { t: "callout"; tone: "info" | "warn"; title?: string; text: string }
  | { t: "contact" };

export interface LegalSection {
  /** Dùng làm neo (#id) và mục lục — chỉ chữ thường, số, gạch ngang */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  subtitle: string;
  /** Hộp "Tóm tắt nhanh" đầu trang: ý chính bằng lời dễ hiểu */
  summary: string[];
  sections: LegalSection[];
}

/** Tên gọi chủ thể trong văn bản (thông tin lấy từ Cài đặt → Cấu hình chung). */
export const houseOf = (org: PublicOrgInfo) => org.houseName?.trim() || "Lưu Xá Phanxicô";

/** Dòng liên hệ dạng văn bản: "địa chỉ …; hotline …" (bỏ phần thiếu). */
export function contactLine(org: PublicOrgInfo): string {
  const parts = [org.address && `địa chỉ ${org.address}`, org.phone && `hotline ${org.phone}`].filter(Boolean);
  return parts.length ? parts.join("; ") : "thông tin liên hệ công bố tại trang [Liên hệ](/lien-he)";
}
