// Văn bản pháp lý công khai: Chính sách bảo mật và Điều khoản sử dụng.
// Nội dung nằm ở legal-privacy.ts / legal-terms.ts (viết dưới dạng khối có cấu trúc); trang dựng bằng components/public/LegalDocument.tsx.
// Đổi nội dung có ý nghĩa pháp lý ⇒ tăng LEGAL_VERSION, đặt lại LEGAL_UPDATED (và LEGAL_UPDATED_ISO) cho cả hai văn bản.
// LEGAL_VERSION cũng là phiên bản ĐỒNG Ý: thành viên chưa đồng ý phiên bản hiện hành được hỏi lại bằng hộp thoại bắt buộc (ConsentGate);
// đồng ý ghi vào consents (terms_of_use + privacy_notice_ack) với policy_version = legalVersionNumber(LEGAL_VERSION) — vd. "1.2" ⇒ 102.
// Nên kèm một migration nâng consent_purposes.current_version cho khớp (xem db/app/1046) để hàm app.has_active_consent trong CSDL cùng nghĩa.
import type { PublicOrgInfo } from "@/lib/types/articles";

export const LEGAL_VERSION = "1.2";
export const LEGAL_UPDATED = "12/10/2026";
export const LEGAL_UPDATED_ISO = "2026-10-12";

/** "1.2" ⇒ 102, "2.0" ⇒ 200 (consents.policy_version là số nguyên). */
export function legalVersionNumber(v: string): number {
  const [major, minor] = v.split(".").map((x) => Number.parseInt(x, 10) || 0);
  return major * 100 + Math.min(Math.max(minor ?? 0, 0), 99);
}

/** 102 ⇒ "1.2"; số cũ (< 100, vd. 1 của dữ liệu khởi tạo) ⇒ "cũ". */
export function legalVersionLabel(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return n >= 100 ? `${Math.floor(n / 100)}.${n % 100}` : "trước 1.2";
}

/** Phiên bản đồng ý hiện hành (số nguyên ghi vào consents.policy_version). */
export const LEGAL_CONSENT_VERSION = legalVersionNumber(LEGAL_VERSION);

export const LEGAL_PATHS = {
  privacy: "/chinh-sach-bao-mat",
  terms: "/dieu-khoan-su-dung",
} as const;

/**
 * Ý chính hiện trong hộp thoại xác nhận (ConsentGate) và ở trang đăng ký — viết gọn, đúng với hai văn bản đầy đủ.
 * Đổi văn bản mà các ý này không còn đúng ⇒ sửa ở đây.
 */
export const LEGAL_GATE_POINTS: { title: string; text: string }[] = [
  {
    title: "Chỉ thu thập điều cần thiết",
    text: "Hồ sơ thành viên, phòng ở, điểm danh, trực tuần, xin phép, quỹ chung và thông báo — để vận hành đời sống chung của nhà. Không bán dữ liệu, không quảng cáo.",
  },
  {
    title: "Dữ liệu nhạy cảm cần bạn đồng ý riêng",
    text: "Hồ sơ Công giáo, bảng điểm, gắn thẻ ảnh… chỉ lưu hoặc chia sẻ khi bạn bật từng mục; rút đồng ý hồ sơ Công giáo thì dữ liệu đó bị xóa.",
  },
  {
    title: "Bảo vệ nhiều lớp",
    text: "CCCD và SĐT phụ huynh được mã hóa; ai xem được gì kiểm soát ngay trong cơ sở dữ liệu theo vai trò; có xác thực 2 bước và sao lưu mã hóa.",
  },
  {
    title: "Nhà cung cấp hạ tầng",
    text: "Dữ liệu lưu ở Supabase (Hàn Quốc), ứng dụng chạy trên Vercel, video ở Cloudinary (Hoa Kỳ). Tính năng AI (khi bật) chỉ nhận nội dung cần thiết; Trợ lý Lưu Xá che tên thành viên, số điện thoại, email trước khi gửi.",
  },
  {
    title: "Quyền của bạn",
    text: "Tự tải dữ liệu của mình, gửi yêu cầu xem / sửa / xóa / rút đồng ý ngay trong ứng dụng (Cài đặt → Hồ sơ cá nhân); người quản lý phản hồi trong 72 giờ.",
  },
  {
    title: "Dùng ứng dụng đúng mực",
    text: "Mỗi người một tài khoản, trung thực khi điểm danh và khai báo, tôn trọng thông tin của anh em; sổ quỹ ghi bất biến, mọi đính chính đều lưu vết.",
  },
];

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
