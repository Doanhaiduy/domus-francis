// Tiện ích định dạng dùng chung (client + server) cho phân hệ Hậu cần (trực vệ sinh theo tuần, báo hỏng).
import type { DutyWeekEntryDto, IssueStatus, IssueUrgency } from "./types/duty";

// ---------------------------------------------------------------------
// Ngày (chuỗi 'YYYY-MM-DD', không phụ thuộc múi giờ máy)
// ---------------------------------------------------------------------
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const utc = (iso: string) => {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
/** Thứ Hai của tuần ISO chứa ngày iso */
export const mondayOf = (iso: string) => {
  const d = utc(iso);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Thứ Hai
  d.setUTCDate(d.getUTCDate() - dow);
  return fmt(d);
};
export const isoDow = (iso: string) => (utc(iso).getUTCDay() + 6) % 7; // 0..6, 0 = Thứ Hai
export const isIsoDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Ngày hôm nay theo giờ Việt Nam */
export const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export const WEEKDAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chúa Nhật"] as const;
export const WEEKDAYS_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
export const weekdayLabel = (iso: string) => WEEKDAYS[isoDow(iso)];
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Giờ:phút theo giờ Việt Nam của một mốc ISO */
export const vnTime = (isoTs: string | null | undefined) => {
  if (!isoTs) return "";
  const d = new Date(new Date(isoTs).getTime() + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
export const vnDate = (isoTs: string | null | undefined) => (isoTs ? new Date(new Date(isoTs).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : "");
/** "14:20 · 02/10" hoặc "Hôm nay 14:20" / "Hôm qua 14:20" */
export const vnStamp = (isoTs: string | null | undefined, today = vnToday()) => {
  if (!isoTs) return "";
  const d = vnDate(isoTs);
  const t = vnTime(isoTs);
  if (d === today) return `Hôm nay ${t}`;
  if (d === addDays(today, -1)) return `Hôm qua ${t}`;
  return `${t} · ${dm(d)}${d.slice(0, 4) !== today.slice(0, 4) ? `/${d.slice(0, 4)}` : ""}`;
};
export const relativeHours = (isoTs: string, now = Date.now()) => {
  const h = (new Date(isoTs).getTime() - now) / 3600e3;
  if (Math.abs(h) < 1) return `${Math.round(h * 60)} phút`;
  if (Math.abs(h) < 48) return `${Math.round(h)} giờ`;
  return `${Math.round(h / 24)} ngày`;
};

// ---------------------------------------------------------------------
// Báo hỏng
// ---------------------------------------------------------------------
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  new: "Mới tiếp nhận",
  in_progress: "Đang xử lý",
  waiting_parts: "Chờ vật tư/thợ",
  done: "Đã xong",
  cancelled: "Đã hủy",
  duplicate: "Trùng sự cố khác",
};
export const ISSUE_STATUS_CLASS: Record<IssueStatus, string> = {
  new: "bg-rose-100 text-rose-700",
  in_progress: "bg-amber-100 text-amber-800",
  waiting_parts: "bg-orange-100 text-orange-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-600",
  duplicate: "bg-gray-100 text-gray-600",
};
export const URGENCY_LABEL: Record<IssueUrgency, string> = {
  low: "Thấp (1 tuần)",
  medium: "Trung bình (48h)",
  high: "Gấp (Trong ngày)",
  critical: "Khẩn cấp (Ngay)",
};
export const URGENCY_CLASS: Record<IssueUrgency, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-rose-100 text-rose-700",
};
export const issueCode = (n: number) => `LOG-${String(n).padStart(3, "0")}`;
export const isOpenIssue = (s: IssueStatus) => s === "new" || s === "in_progress" || s === "waiting_parts";

// ---------------------------------------------------------------------
// Trực vệ sinh sân nhà theo tuần
// ---------------------------------------------------------------------
/** Biến cho mẫu tin Zalo "duty_week". */
export function dutyWeekVars(w: DutyWeekEntryDto, houseName?: string | null): Record<string, string> {
  return {
    house: houseName ?? "",
    week: weekRangeLabel(w.weekStart),
    members: w.members.map((m) => m.name).join(" & ") || "—",
    note: w.note ?? "",
  };
}

/** "05/10 – 11/10/2026" */
export const weekRangeLabel = (weekStart: string) => {
  const end = addDays(weekStart, 6);
  return `${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)} – ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`;
};
