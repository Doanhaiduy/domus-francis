// =====================================================================
// iCalendar (RFC 5545) — dựng tệp .ics dùng chung client/server (không phụ thuộc trình duyệt hay Node):
//   • tải một sự kiện ("Thêm vào lịch") và lịch đăng ký theo đường dẫn (Google Calendar / Lịch iPhone / Outlook).
//   • Dòng kết thúc bằng CRLF; dòng dài hơn 75 octet (UTF-8) được GẬP: CRLF + một dấu cách, không cắt giữa ký tự nhiều byte.
//   • TEXT được thoát: \\ ; , và xuống dòng (\n); bỏ ký tự điều khiển.
//   • Giờ địa phương kèm TZID=Asia/Ho_Chi_Minh + VTIMEZONE (UTC+7, không đổi giờ mùa hè); DTSTAMP/LAST-MODIFIED theo UTC.
//   • Sự kiện cả ngày dùng VALUE=DATE, DTEND là ngày KẾ TIẾP ngày cuối (độc quyền theo chuẩn).
// =====================================================================

export const ICS_TZID = "Asia/Ho_Chi_Minh";
/** Hậu tố UID — giữ cố định để UID của cùng một sự kiện không đổi giữa các lần tải */
export const ICS_UID_DOMAIN = "luuxa-phanxico";

export interface IcsEvent {
  /** Định danh ổn định (vd. "event-<uuid>@luuxa-phanxico") */
  uid: string;
  summary: string;
  /** Thời điểm (ISO / Date) — bỏ trống nếu là sự kiện cả ngày */
  start?: string | Date;
  end?: string | Date;
  /** Sự kiện cả ngày: ngày đầu và ngày cuối (YYYY-MM-DD, tính cả hai đầu) */
  allDay?: { from: string; to: string };
  location?: string | null;
  description?: string | null;
  url?: string | null;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  categories?: string[];
  /** Số lần sửa (SEQUENCE) — tăng khi sự kiện đổi để ứng dụng lịch cập nhật */
  sequence?: number;
  lastModified?: string | Date | null;
  /** Không chiếm thời gian bận (ngày trực, ngày lễ) */
  transparent?: boolean;
}

export interface IcsCalendarOptions {
  /** Tên lịch hiện trong ứng dụng lịch (X-WR-CALNAME) */
  name: string;
  description?: string;
  /** Gợi ý tần suất làm mới cho lịch đăng ký (phút) */
  refreshMinutes?: number;
  /** Thời điểm dựng tệp (DTSTAMP) — mặc định bây giờ */
  now?: Date;
}

const CRLF = "\r\n";
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Thoát giá trị TEXT (RFC 5545 §3.3.11). */
export function escapeText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const utf8Len = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Gập một dòng nội dung thành các dòng ≤ 75 octet (UTF-8), dòng tiếp theo bắt đầu bằng một dấu cách. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Len(ch.codePointAt(0) ?? 0);
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // + 1 octet dấu cách đầu dòng = 75
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/** 20261012T133000Z */
export function formatUtc(v: string | Date): string {
  const d = toDate(v);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Giờ Việt Nam (UTC+7, không đổi giờ mùa hè) dạng 20261012T203000 */
export function formatVnLocal(v: string | Date): string {
  const d = new Date(toDate(v).getTime() + 7 * 3_600_000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

const dateValue = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ICS_TZID}`,
  `X-LIC-LOCATION:${ICS_TZID}`,
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0700",
  "TZOFFSETTO:+0700",
  "TZNAME:+07",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function eventLines(e: IcsEvent, stamp: string): string[] {
  const out = ["BEGIN:VEVENT", `UID:${escapeText(e.uid)}`, `DTSTAMP:${stamp}`];
  if (e.allDay) {
    out.push(`DTSTART;VALUE=DATE:${dateValue(e.allDay.from)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(e.allDay.to))}`);
  } else if (e.start) {
    out.push(`DTSTART;TZID=${ICS_TZID}:${formatVnLocal(e.start)}`);
    out.push(`DTEND;TZID=${ICS_TZID}:${formatVnLocal(e.end ?? toDate(e.start))}`);
  }
  out.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.location) out.push(`LOCATION:${escapeText(e.location)}`);
  if (e.description) out.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.url) out.push(`URL;VALUE=URI:${e.url.replace(/[\r\n]/g, "")}`);
  if (e.categories?.length) out.push(`CATEGORIES:${e.categories.map(escapeText).join(",")}`);
  out.push(`STATUS:${e.status ?? "CONFIRMED"}`);
  if (e.transparent) out.push("TRANSP:TRANSPARENT");
  if (e.sequence !== undefined) out.push(`SEQUENCE:${Math.max(0, Math.trunc(e.sequence))}`);
  if (e.lastModified) out.push(`LAST-MODIFIED:${formatUtc(e.lastModified)}`);
  out.push("END:VEVENT");
  return out;
}

/** Dựng một VCALENDAR hoàn chỉnh (chuỗi CRLF, đã gập dòng). */
export function buildCalendar(events: IcsEvent[], o: IcsCalendarOptions): string {
  const stamp = formatUtc(o.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Luu Xa Phanxico//Lich sinh hoat//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(o.name)}`,
    `X-WR-TIMEZONE:${ICS_TZID}`,
  ];
  if (o.description) lines.push(`X-WR-CALDESC:${escapeText(o.description)}`);
  if (o.refreshMinutes) {
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${Math.max(15, Math.round(o.refreshMinutes))}M`);
    lines.push(`X-PUBLISHED-TTL:PT${Math.max(15, Math.round(o.refreshMinutes))}M`);
  }
  lines.push(...VTIMEZONE);
  for (const e of events) lines.push(...eventLines(e, stamp));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Tên tệp an toàn (không dấu) cho Content-Disposition */
export function icsFileName(title: string, date?: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  return `${base || "su-kien"}${date ? `-${date}` : ""}.ics`;
}
