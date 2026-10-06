import "server-only";
import { withTx } from "../db";
import { addDays, dutyWeekVars } from "@/lib/duty-format";
import type { ZaloEventKey } from "@/lib/types/settings";

// Dự báo các tin tự động theo NGÀY (phần tính được trước từ dữ liệu): sự kiện hôm nay/ngày mai, sinh nhật, lịch trực đầu tuần,
// lịch nhắc lặp. Dùng cho lịch "tin sẽ gửi" trong Tích hợp Zalo; cron thật (daily.ts) dùng chung hàm dựng nội dung sự kiện.
// KHÔNG dự báo: nhắc đóng quỹ (phụ thuộc ai còn nợ lúc đó) và nhắc lễ trọng (có nhật ký riêng).

export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const WEEKDAY = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chúa Nhật"];
export const isoDow = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const wdLabel = (iso: string) => `${WEEKDAY[isoDow(iso)]} ${dm(iso)}`;

export interface EventRow {
  title: string;
  hm: string;
  d: string;
  loc: string | null;
}

export interface EventPlan {
  key: string;
  vars: Record<string, string>;
  count: number;
  appTitle: string;
  appBody: string;
}

/**
 * Sự kiện hôm nay + ngày mai gộp thành MỘT tin (trước đây mỗi ngày một tin nên sự kiện lặp hằng ngày bị báo hai lần).
 * Chỉ một ngày có sự kiện thì giữ nhãn HÔM NAY / NGÀY MAI như cũ.
 */
export function planEvents(rows: EventRow[], today: string): EventPlan | null {
  const tomorrow = addDays(today, 1);
  const t = rows.filter((r) => r.d === today);
  const m = rows.filter((r) => r.d === tomorrow);
  if (!t.length && !m.length) return null;
  const fmt = (list: EventRow[]) => list.map((r) => `• ${r.hm} — ${r.title}${r.loc ? ` @ ${r.loc}` : ""}`);
  if (t.length && m.length) {
    const lines = [`Hôm nay (${wdLabel(today)}):`, ...fmt(t), "", `Ngày mai (${wdLabel(tomorrow)}):`, ...fmt(m)];
    return {
      key: `evday:${today}`,
      vars: { day_label: "HÔM NAY & NGÀY MAI", date: `${wdLabel(today)} – ${wdLabel(tomorrow)}`, list: lines.join("\n") },
      count: t.length + m.length,
      appTitle: `Hôm nay có ${t.length}, ngày mai có ${m.length} sự kiện`,
      appBody: lines.join("\n"),
    };
  }
  const list = t.length ? t : m;
  const day = t.length ? today : tomorrow;
  const label = t.length ? "HÔM NAY" : "NGÀY MAI";
  const lines = fmt(list);
  return {
    key: `evday:${day}:${t.length ? "today" : "tomorrow"}`,
    vars: { day_label: label, date: wdLabel(day), list: lines.join("\n") },
    count: list.length,
    appTitle: `${t.length ? "Hôm nay" : "Ngày mai"} có ${list.length} sự kiện`,
    appBody: lines.join("\n"),
  };
}

export const EVENTS_SQL = `SELECT e.title, to_char(e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS hm,
        (e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d,
        COALESCE(NULLIF(btrim(e.location_text), ''), (SELECT r.name FROM rooms r WHERE r.id = e.location_room_id)) AS loc
   FROM events e
  WHERE e.deleted_at IS NULL AND e.status <> 'cancelled'
    AND (e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
  ORDER BY e.starts_at`;

export interface PlannedMessage {
  slot: "morning" | "evening";
  event: ZaloEventKey;
  vars: Record<string, string>;
}

interface PlanData {
  events: EventRow[];
  birthdays: { n: string; month: number; day: number }[];
  reminders: { title: string; message: string | null; time_label: string | null; slot: "morning" | "evening"; weekdays: number[]; send_zalo: boolean }[];
  weeks: Map<string, { names: string[]; note: string | null }>;
  house: string | null;
}

/** Nạp dữ liệu để dự báo các ngày trong [from, to] (YYYY-MM-DD). Chỉ đọc. */
export async function loadPlanData(from: string, to: string): Promise<PlanData> {
  return withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
    const events = (await tx.query<EventRow>(EVENTS_SQL, [from, addDays(to, 1)])).rows;
    const birthdays = (
      await tx.query<{ n: string; month: number; day: number }>(
        `SELECT m.display_name AS n, extract(month FROM d.birth_date)::int AS month, extract(day FROM d.birth_date)::int AS day
           FROM members m JOIN member_private_details d ON d.member_id = m.id
          WHERE m.deleted_at IS NULL AND m.status IN ('active', 'on_leave') AND d.birth_date IS NOT NULL ORDER BY m.display_name`,
      )
    ).rows;
    const reminders = (
      await tx.query<PlanData["reminders"][number]>(
        "SELECT title, message, time_label, slot, weekdays::int[] AS weekdays, send_zalo FROM recurring_reminders WHERE is_active ORDER BY created_at",
      )
    ).rows;
    const weekRows = (
      await tx.query<{ ws: string; names: string[]; note: string | null }>(
        `SELECT dw.week_start::text AS ws, COALESCE(array_agg(m.display_name ORDER BY m.display_name) FILTER (WHERE m.id IS NOT NULL), '{}') AS names, dw.note
           FROM duty_weeks dw LEFT JOIN duty_week_members wm ON wm.week_id = dw.id LEFT JOIN members m ON m.id = wm.member_id
          WHERE dw.week_start BETWEEN $1::date AND $2::date GROUP BY dw.id`,
        [from, to],
      )
    ).rows;
    const house = (await tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'")).rows[0]?.v ?? null;
    return { events, birthdays, reminders, weeks: new Map(weekRows.map((w) => [w.ws, { names: w.names, note: w.note }])), house };
  });
}

/** Các tin tự động DỰ KIẾN của một ngày. */
export function planDay(data: PlanData, date: string): PlannedMessage[] {
  const out: PlannedMessage[] = [];
  const ev = planEvents(data.events, date);
  if (ev) out.push({ slot: "morning", event: "event_reminder", vars: ev.vars });

  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const names = data.birthdays.filter((b) => b.month === month && b.day === day).map((b) => b.n);
  if (names.length) out.push({ slot: "morning", event: "birthday", vars: { names: names.join(" & "), them: names.length > 1 ? "các bạn" : "bạn" } });

  const dow = isoDow(date);
  const w = dow === 1 ? data.weeks.get(date) : undefined;
  if (w && w.names.length) {
    const vars = dutyWeekVars(
      { id: null, weekStart: date, weekEnd: addDays(date, 6), members: w.names.map((n) => ({ id: n, name: n, fullName: n, room: null, avatarFileId: null })), note: w.note, review: null, isMine: false },
      data.house,
    );
    out.push({ slot: "morning", event: "duty_week", vars: vars as Record<string, string> });
  }

  for (const r of data.reminders) {
    if (!r.weekdays.includes(dow) || !r.send_zalo) continue;
    const head = `${r.title}${r.time_label ? ` — ${r.time_label}` : ""} (${r.slot === "morning" ? "hôm nay" : "tối nay"})`;
    out.push({ slot: r.slot, event: "reminder_schedule", vars: { headline: head, title: r.title, time: r.time_label ?? "", message: r.message ?? "" } });
  }
  return out;
}
