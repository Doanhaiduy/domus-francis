// Thông tin phiên bản đang chạy — các biến NEXT_PUBLIC_* được next.config.mjs điền LÚC BUILD (đọc từ package.json + Vercel), nên khớp đúng bản đang chạy.
// Số phiên bản thật nằm ở package.json (không gõ cứng ở chỗ khác); lịch sử ở src/content/changelog.ts.

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
/** Thời điểm dựng bản này (ISO). */
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";
/** Mã commit rút gọn (có khi build trên Vercel). */
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_COMMIT || "";
/** production | preview | development | local */
export const DEPLOY_ENV = process.env.NEXT_PUBLIC_DEPLOY_ENV || "local";

export const DEPLOY_ENV_LABEL: Record<string, string> = {
  production: "Production (bản chính thức)",
  preview: "Staging / xem trước",
  development: "Phát triển",
  local: "Máy cá nhân (chạy thử)",
};

/** Ngày giờ theo giờ Việt Nam, vd. "14/10/2026 08:30". */
export function formatVnDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** "2026-10-14" ⇒ "14/10/2026". */
export const formatReleaseDate = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : ymd);
