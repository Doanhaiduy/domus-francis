// Định dạng hiển thị phân hệ Cộng đoàn (dùng chung client/server, không gọi mạng).
import type { AnnouncementDto } from "./types/community";

const TZ = "Asia/Ho_Chi_Minh";

/** Nhãn ngắn + biểu tượng của chuyên mục theo mã danh mục (categories.code). */
export const CATEGORY_LABEL: Record<string, { label: string; icon: string }> = {
  ANN_URGENT: { label: "Quan trọng", icon: "🚨" },
  ANN_EVENT: { label: "Sự kiện", icon: "🎉" },
  ANN_COMMON: { label: "Chung", icon: "📢" },
  ANN_KITCHEN: { label: "Bếp & Cơm", icon: "🍳" },
  FORUM_SPORT: { label: "Đi chơi", icon: "🏖️" },
  FORUM_FOOD: { label: "Bếp & Thực đơn", icon: "🍳" },
  FORUM_FEEDBACK: { label: "Góp ý chung", icon: "💡" },
  FORUM_STUDY: { label: "Học tập", icon: "📚" },
  FORUM_LEISURE: { label: "Giải trí", icon: "🎉" },
};

export const categoryLabel = (code: string, name: string) => CATEGORY_LABEL[code]?.label ?? name;
export const categoryIcon = (code: string) => CATEGORY_LABEL[code]?.icon ?? "📌";

function parts(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { y: g("year"), m: g("month"), d: g("day"), hh: g("hour") === "24" ? "00" : g("hour"), mm: g("minute") };
}

/** "10:30 · 01/10/2026" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = parts(iso);
  return `${p.hh}:${p.mm} · ${p.d}/${p.m}/${p.y}`;
}

/** "01/10/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join("/");
  const p = parts(iso);
  return `${p.d}/${p.m}/${p.y}`;
}

/** "01/10" */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const p = parts(iso);
  return `${p.d}/${p.m}`;
}

/** "20:30" */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = parts(iso);
  return `${p.hh}:${p.mm}`;
}

function dayKey(d: Date) {
  const p = parts(d);
  return `${p.y}-${p.m}-${p.d}`;
}

/** "Vừa xong", "5 phút trước", "2 giờ trước", "Hôm qua · 21:30", "3 ngày trước", "28/09/2026" */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86400_000));
  const k = dayKey(d);
  if (k === today) return `${Math.floor(diff / 3600)} giờ trước`;
  if (k === yesterday) return `Hôm qua · ${formatTime(iso)}`;
  if (diff < 7 * 86400) return `${Math.max(2, Math.round(diff / 86400))} ngày trước`;
  return formatDate(iso);
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "1.4 MB", "820 KB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Lớp màu chip theo mã chuyên mục thông báo (giữ phong cách cũ: Quan trọng đỏ, Sự kiện tím, còn lại xanh). */
export function announcementChipClass(code: string): string {
  if (code === "ANN_URGENT") return "bg-rose-100 text-rose-700";
  if (code === "ANN_EVENT") return "bg-purple-100 text-primary";
  if (code === "ANN_KITCHEN") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

/** Tin nhắn dán Zalo cho một thông báo (sao chép clipboard — không gọi mạng). */
export function formatAnnouncementForZalo(a: AnnouncementDto): string {
  const lines = [
    `📢 THÔNG BÁO LƯU XÁ PHANXICÔ`,
    `【${a.category}】 ${a.title}`,
    `— ${a.author} (${a.authorRole}) · ${formatDateTime(a.publishedAt)}`,
    "",
    a.content,
  ];
  if (a.requiresAck && a.ackDeadline) lines.push("", `⚠️ Vui lòng xác nhận đã đọc trên ứng dụng trước ${formatDateTime(a.ackDeadline)}.`);
  if (a.event) lines.push("", `📅 ${a.event.title} · ${formatDateTime(a.event.startsAt)}${a.event.location ? ` · ${a.event.location}` : ""}`);
  lines.push("", "Pax et Bonum 🙏");
  return lines.join("\n");
}

export const WEEKDAY_VI = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Thứ trong tuần của một ngày 'YYYY-MM-DD' (không lệch múi giờ). */
export function weekdayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return WEEKDAY_VI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Cộng ngày cho chuỗi 'YYYY-MM-DD'. */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Buổi trong ngày theo giờ: "SÁNG" | "TRƯA" | "CHIỀU" | "TỐI" */
export function dayPeriod(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (h < 11) return "SÁNG";
  if (h < 13) return "TRƯA";
  if (h < 18) return "CHIỀU";
  return "TỐI";
}
