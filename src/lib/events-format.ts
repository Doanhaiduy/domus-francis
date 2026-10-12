// Tiện ích định dạng phân hệ Lịch & Sự kiện — dùng chung client/server (không phụ thuộc trình duyệt).
// Giờ hiển thị luôn theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không đổi giờ mùa hè).

import type { EventDto, PollDto } from "./types/events";

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Nhãn ngắn của danh mục sự kiện theo mã (giao diện cũ dùng các nhãn này). */
export const CATEGORY_LABEL: Record<string, string> = {
  EVT_MASS: "Phụng vụ",
  EVT_MEET: "Họp nhà",
  EVT_PATRON: "Bổn mạng",
  EVT_TRIP: "Dã ngoại",
  EVT_SOCIAL: "Sinh hoạt",
  EVT_CLEAN: "Vệ sinh",
  EVT_ROSARY: "Kinh nguyện",
  EVT_PILGRIM: "Hành hương",
};

/** Thời lượng mặc định (phút) khi người dùng không nhập giờ kết thúc. */
export const DEFAULT_DURATION_MIN: Record<string, number> = {
  EVT_MASS: 60,
  EVT_MEET: 90,
  EVT_PATRON: 180,
  EVT_TRIP: 600,
  EVT_SOCIAL: 120,
  EVT_CLEAN: 120,
  EVT_ROSARY: 45,
  EVT_PILGRIM: 600,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Các thành phần ngày giờ theo giờ VN của một thời điểm. */
export function vnParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour) % 24, mm: Number(p.minute) };
}

/** "YYYY-MM-DD" hôm nay theo giờ VN. */
export function vnTodayIso(now: Date = new Date()) {
  const p = vnParts(now);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export const isoToDmy = (iso: string) => iso.split("-").reverse().join("/");

/** "DD/MM/YYYY" | "YYYY-MM-DD" → "YYYY-MM-DD" (null nếu sai). */
export function toIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else {
    mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!mt) return null;
    [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Đọc giờ người dùng nhập theo thói quen tiếng Việt: "19:30", "19:30 tối", "7:30 tối", "7h30 tối", "8h sáng",
 * "12:00 trưa", "1:30 chiều", "22:00 đêm", "7:30 pm". Trả về { h, m } 24 giờ hoặc null.
 */
export function parseVnTime(input: string | null | undefined): { h: number; m: number } | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().normalize("NFC");
  const mt = /^(\d{1,2})(?:\s*(?::|giờ|h|g|\.)\s*(\d{1,2})?)?\s*(?:phút)?\s*(.*)$/.exec(s);
  if (!mt) return null;
  let h = Number(mt[1]);
  const m = mt[2] ? Number(mt[2]) : 0;
  const suffix = (mt[3] ?? "").trim();
  if (m > 59 || h > 24) return null;
  if (suffix && !/^(sáng|trưa|chiều|tối|đêm|khuya|am|pm|a\.m\.|p\.m\.)$/.test(suffix)) return null;
  if (h === 24) h = 0;
  if (/^(pm|p\.m\.)$/.test(suffix) && h < 12) h += 12;
  else if (/^(am|a\.m\.)$/.test(suffix) && h === 12) h = 0;
  else if (suffix === "sáng" && h === 12) h = 0;
  else if (suffix === "trưa" && h < 11) h += 12; // "1 giờ trưa" = 13:00
  else if (suffix === "chiều" && h < 12) h += 12;
  else if (suffix === "tối" && h < 12 && h >= 4) h += 12;
  else if ((suffix === "đêm" || suffix === "khuya") && h >= 6 && h < 12) h += 12;
  else if ((suffix === "đêm" || suffix === "khuya" || suffix === "tối") && h === 12) h = 0;
  if (h > 23) return null;
  return { h, m };
}

/** 19:30 → "19:30 tối" (cùng kiểu với các khung giờ có sẵn trong bộ chọn giờ). */
export function formatVnTime(h: number, m: number) {
  const label = h < 11 && h >= 4 ? "sáng" : h < 13 && h >= 11 ? "trưa" : h < 18 && h >= 13 ? "chiều" : h < 22 && h >= 18 ? "tối" : "đêm";
  return `${pad(h)}:${pad(m)} ${label}`;
}

export const hmToVn = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return formatVnTime(h, m);
};

/** Thời điểm UTC (ISO) của ngày + giờ theo giờ VN. */
export function vnToIso(dateIso: string, h: number, m: number) {
  const [y, mo, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 7, m)).toISOString();
}

export function addDaysIso(dateIso: string, n: number) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Giờ VN "HH:mm" của một thời điểm ISO. */
export function isoToVnHm(iso: string | null | undefined) {
  if (!iso) return null;
  const p = vnParts(new Date(iso));
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

/** "DD/MM/YYYY HH:mm" giờ VN */
export function isoToVnDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const p = vnParts(new Date(iso));
  return `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.hh)}:${pad(p.mm)}`;
}

export interface EventFormValues {
  title: string;
  date: string; // DD/MM/YYYY hoặc YYYY-MM-DD
  time: string; // "19:30 tối"
  endTime?: string; // tùy chọn
  categoryCode: string;
  location: string;
  organizerText: string;
  description: string;
  hasCheckIn: boolean;
  organizerIds?: string[];
}

/**
 * Chuyển giá trị form (ngày + giờ dạng chữ) thành khoảng thời gian thật.
 * Không nhập giờ kết thúc ⇒ dùng thời lượng mặc định theo danh mục; giờ kết thúc ≤ giờ bắt đầu ⇒ hiểu là sang ngày hôm sau.
 */
export function resolveEventTimes(v: { date: string; time: string; endTime?: string; categoryCode: string }):
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; error: string } {
  const dateIso = toIsoDate(v.date);
  if (!dateIso) return { ok: false, error: "Ngày diễn ra không hợp lệ (định dạng DD/MM/YYYY)." };
  const t = parseVnTime(v.time);
  if (!t) return { ok: false, error: `Không hiểu giờ bắt đầu "${v.time}". Ví dụ hợp lệ: 19:30 tối, 08:00 sáng, 14h30.` };
  const startsAt = vnToIso(dateIso, t.h, t.m);
  let endsAt: string;
  if (v.endTime && v.endTime.trim()) {
    const e = parseVnTime(v.endTime);
    if (!e) return { ok: false, error: `Không hiểu giờ kết thúc "${v.endTime}".` };
    const sameDay = e.h * 60 + e.m > t.h * 60 + t.m;
    endsAt = vnToIso(sameDay ? dateIso : addDaysIso(dateIso, 1), e.h, e.m);
  } else {
    const dur = DEFAULT_DURATION_MIN[v.categoryCode] ?? 90;
    endsAt = new Date(new Date(startsAt).getTime() + dur * 60_000).toISOString();
  }
  return { ok: true, startsAt, endsAt };
}

// ---------------------------------------------------------------------
// Sự kiện định kỳ (lặp hằng tuần) — CÙNG công thức với app.fn_recurrence_matches / app.fn_generate_recurring_events (db/app/1049):
// tuần được đếm từ Thứ Hai của tuần chứa ngày bắt đầu; "2 tuần một lần" = các tuần 0, 2, 4… kể từ tuần đó.
// ---------------------------------------------------------------------

/** Hệ thống tạo trước các buổi của chuỗi định kỳ bao nhiêu ngày (cron sáng "recurring-events"). */
export const SERIES_HORIZON_DAYS = 14;
/** Giới hạn số buổi khi chọn "kết thúc sau N lần" */
export const SERIES_MAX_COUNT = 200;
/** Ngày kết thúc xa nhất của một chuỗi (tính từ ngày bắt đầu) */
export const SERIES_MAX_SPAN_DAYS = 730;

export const WEEKDAY_SHORT = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
export const WEEKDAY_LONG = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chúa Nhật"] as const;

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
/** Số ngày từ a tới b (b − a) */
export const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);

/** Thứ ISO của ngày YYYY-MM-DD: 1 = Thứ Hai … 7 = Chúa Nhật */
export function isoWeekday(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** "T2 12/10" */
export const weekdayDm = (dateIso: string) => `${WEEKDAY_SHORT[isoWeekday(dateIso)]} ${dateIso.slice(8, 10)}/${dateIso.slice(5, 7)}`;

export interface WeeklyPattern {
  startsOn: string;
  /** ISO 1..7 */
  weekdays: number[];
  intervalWeeks: number;
  untilDate?: string | null;
}

/** Ngày `d` có phải một buổi của mẫu lặp hằng tuần không (không xét ngày bỏ qua). */
export function weeklyMatches(p: WeeklyPattern, d: string): boolean {
  if (d < p.startsOn || (p.untilDate && d > p.untilDate)) return false;
  if (!p.weekdays.includes(isoWeekday(d))) return false;
  const monday = addDaysIso(p.startsOn, -(isoWeekday(p.startsOn) - 1));
  return Math.floor(daysBetween(monday, d) / 7) % Math.max(1, p.intervalWeeks) === 0;
}

/** Các ngày của mẫu lặp từ `from` (tính cả), không quá `to`/ngày kết thúc, tối đa `limit` ngày; bỏ các ngày trong `skip`. */
export function weeklyDates(
  p: WeeklyPattern,
  from: string,
  opts: { to?: string | null; limit?: number; skip?: ReadonlySet<string> } = {}
): string[] {
  const out: string[] = [];
  if (!p.weekdays.length) return out;
  const limit = opts.limit ?? 50;
  let d = from > p.startsOn ? from : p.startsOn;
  const bounds = [opts.to, p.untilDate].filter((x): x is string => !!x).sort();
  const end = bounds[0] ?? addDaysIso(d, SERIES_MAX_SPAN_DAYS + 7);
  for (let i = 0; i < SERIES_MAX_SPAN_DAYS * 3 && out.length < limit && d <= end; i++, d = addDaysIso(d, 1)) {
    if (weeklyMatches(p, d) && !opts.skip?.has(d)) out.push(d);
  }
  return out;
}

/** "Kết thúc sau N lần" ⇒ ngày của buổi thứ N (null nếu mẫu lặp không có buổi nào). */
export function untilForCount(p: WeeklyPattern, count: number): string | null {
  const dates = weeklyDates({ ...p, untilDate: null }, p.startsOn, { limit: Math.max(1, count) });
  return dates.length ? dates[dates.length - 1] : null;
}

/** "Thứ Hai, Thứ Tư" · "Mỗi ngày" · "Thứ Hai – Thứ Sáu" */
export function weekdaysLabel(days: number[]): string {
  const s = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (s.length === 7) return "Mỗi ngày";
  if (s.join(",") === "1,2,3,4,5") return "Thứ Hai – Thứ Sáu";
  if (s.join(",") === "6,7") return "Thứ Bảy & Chúa Nhật";
  return s.map((d) => WEEKDAY_LONG[d]).join(", ");
}

/** "Thứ Hai, Thứ Tư hằng tuần" · "Mỗi ngày" · "Thứ Bảy · 2 tuần một lần" */
export function seriesPatternLabel(p: { weekdays: number[]; intervalWeeks: number }): string {
  const w = weekdaysLabel(p.weekdays);
  if (p.intervalWeeks <= 1) return w === "Mỗi ngày" ? w : `${w} hằng tuần`;
  return `${w} · ${p.intervalWeeks} tuần một lần`;
}

/** "21:00" + 90 phút ⇒ "22:30" (qua nửa đêm thì quay vòng) */
export function addMinutesHm(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map(Number);
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/** Thời lượng (phút) từ giờ bắt đầu tới giờ kết thúc dạng chữ; kết thúc ≤ bắt đầu ⇒ sang hôm sau. null nếu không hiểu giờ. */
export function durationFromTimes(time: string, endTime: string | null | undefined, categoryCode: string): { startHm: string; minutes: number } | null {
  const t = parseVnTime(time);
  if (!t) return null;
  const startHm = `${pad(t.h)}:${pad(t.m)}`;
  if (!endTime || !endTime.trim()) return { startHm, minutes: DEFAULT_DURATION_MIN[categoryCode] ?? 90 };
  const e = parseVnTime(endTime);
  if (!e) return null;
  let minutes = e.h * 60 + e.m - (t.h * 60 + t.m);
  if (minutes <= 0) minutes += 1440;
  return { startHm, minutes };
}

/** Trạng thái hiển thị theo thời gian thực. */
export function eventPhase(e: Pick<EventDto, "status" | "startsAt" | "endsAt">, now = Date.now()) {
  if (e.status === "cancelled") return "cancelled" as const;
  if (e.status === "completed") return "ended" as const;
  const s = new Date(e.startsAt).getTime();
  const en = new Date(e.endsAt).getTime();
  if (now < s) return "upcoming" as const;
  if (now <= en) return "ongoing" as const;
  return "ended" as const;
}

/** Gần giờ điểm danh: đang diễn ra hoặc còn ≤ 60 phút nữa bắt đầu (cửa sổ thật do DB quyết định theo cấu hình). */
export function nearCheckInWindow(e: Pick<EventDto, "status" | "startsAt" | "endsAt">, now = Date.now()) {
  const p = eventPhase(e, now);
  return p === "ongoing" || (p === "upcoming" && new Date(e.startsAt).getTime() - now <= 60 * 60_000);
}

export const RSVP_LABEL: Record<string, string> = { going: "Tham dự", not_going: "Vắng phép", maybe: "Chưa rõ", none: "Chưa phản hồi" };
export const ATTENDANCE_LABEL: Record<string, string> = { present: "Có mặt", late: "Đi muộn", absent: "Vắng", excused: "Vắng có phép" };

/** Tin nhắn Zalo (sao chép clipboard) tổng hợp kết quả biểu quyết từ dữ liệu thật. */
export function formatPollForZalo(poll: PollDto) {
  const known = poll.options.every((o) => o.votes !== null);
  const total = known ? poll.options.reduce((s, o) => s + (o.votes ?? 0), 0) : 0;
  let text = `📊 BIỂU QUYẾT LƯU XÁ: ${poll.question}\n`;
  if (poll.eventTitle) text += `📅 Sự kiện: ${poll.eventTitle}${poll.eventDate ? ` (${poll.eventDate})` : ""}\n`;
  text += `🗳️ ${poll.voters}/${poll.eligible} anh em đã biểu quyết${known ? ` • ${total} phiếu` : ""}`;
  text += poll.isOpen ? (poll.closesAt ? ` • Hạn chót ${isoToVnDateTime(poll.closesAt)}` : " • Đang mở") : " • ĐÃ ĐÓNG";
  text += "\n";
  if (poll.isMultiSelect) text += `☑️ Được chọn tối đa ${poll.maxChoices} phương án\n`;
  text += "\n";
  poll.options.forEach((opt, idx) => {
    if (opt.votes === null) {
      text += `${idx + 1}. ${opt.label}\n`;
      return;
    }
    const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
    text += `${idx + 1}. ${opt.label}: ${opt.votes} phiếu (${pct}%)\n`;
    if (opt.voterNames && opt.voterNames.length > 0) text += `   👥 Anh em: ${opt.voterNames.join(", ")}\n`;
  });
  if (!known) text += `\n🔒 Biểu quyết ẩn danh — kết quả từng phương án công bố khi đóng.\n`;
  text += `\nPax et Bonum - Lưu Xá Sinh Viên Phanxicô`;
  return text;
}
