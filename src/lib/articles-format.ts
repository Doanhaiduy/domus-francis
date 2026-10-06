// Tiện ích dùng chung cho bài viết công khai (client + server): đường dẫn ảnh công khai, tạo slug, thời gian đọc.

/** URL ảnh công khai (không cần đăng nhập) của tệp đang được bài đã đăng sử dụng. */
export function publicFileUrl(fileId: string | null | undefined, variant?: "thumb" | "medium"): string | null {
  if (!fileId) return null;
  return `/api/v1/public/files/${fileId}${variant ? `?v=${variant}` : ""}`;
}

/** "Tuyển sinh 2026 — Lưu xá mở đơn!" → "tuyen-sinh-2026-luu-xa-mo-don". */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 120;

/** Số phút đọc (≈ 200 từ/phút), tối thiểu 1. */
export function readMinutes(content: string): number {
  const words = content.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** "08 tháng 10, 2026" */
export function formatArticleDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
