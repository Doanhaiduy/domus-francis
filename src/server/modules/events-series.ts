import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import {
  CATEGORY_LABEL,
  SERIES_HORIZON_DAYS,
  SERIES_MAX_SPAN_DAYS,
  addMinutesHm,
  daysBetween,
  durationFromTimes,
  isoToDmy,
  seriesPatternLabel,
  toIsoDate,
  untilForCount,
  weeklyDates,
  type WeeklyPattern,
} from "@/lib/events-format";
import type { EventSeriesDto, EventSeriesListDto, EventStatus } from "@/lib/types/events";
import { resolveCategory } from "./events";
import type { SeriesCreateInput, SeriesPatchInput } from "./events-schema";

// =====================================================================
// SỰ KIỆN ĐỊNH KỲ (lặp hằng tuần) — bảng/hàm có sẵn của thiết kế (event_recurrence_rules, event_recurrence_exceptions,
// app.fn_generate_recurring_events) + phần bổ sung ở db/app/1049:
//   • tạo chuỗi ⇒ sinh ngay các buổi trong 14 ngày tới (app.fn_event_series_generate); cron sáng "recurring-events" sinh tiếp mỗi ngày;
//   • sửa "các buổi từ ngày X" ⇒ cập nhật quy tắc + các buổi CHƯA diễn ra từ X (chỉ trường nào buổi đó chưa bị sửa riêng), rồi
//     app.fn_event_series_sync gỡ/khôi phục/sinh lại cho khớp mẫu mới;
//   • bỏ một ngày = ngoại lệ (event_recurrence_exceptions) + gỡ buổi của ngày đó; khôi phục được khi ngày chưa qua;
//   • dừng chuỗi ⇒ is_active = false, gỡ các buổi chưa diễn ra từ ngày dừng; buổi đã diễn ra (và điểm danh) giữ nguyên.
// Ghi dưới RLS (event_recurrence_* chỉ cho event.manage ghi); hàm sinh/đồng bộ là SECURITY DEFINER tự kiểm event.manage.
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const VN = "Asia/Ho_Chi_Minh";

async function localToday(tx: Tx): Promise<string> {
  return (await tx.query<{ d: string }>("SELECT app.local_today()::text AS d")).rows[0].d;
}

async function requireManage(tx: Tx, msg = "Chỉ người có quyền quản lý sự kiện được thao tác với sự kiện định kỳ.") {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('event.manage') AS ok")).rows[0]?.ok;
  if (!ok) throw forbidden(msg);
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function parseDay(v: string | null | undefined, label: string): string {
  const d = toIsoDate(v ?? "");
  if (!d) throw badRequest(`${label} không hợp lệ (định dạng DD/MM/YYYY).`);
  return d;
}

// ---------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------
const SERIES_SELECT = `
  SELECT r.id, r.title, r.category_id, c.code AS cat_code, c.name AS cat_name, c.color AS cat_color,
         to_char(r.start_time, 'HH24:MI') AS start_hm, r.duration_minutes, r.freq::text AS freq, r.interval_n, r.by_weekday,
         r.starts_on::text AS starts_on, r.until_date::text AS until_date, r.location_text, r.organizer_text, r.description,
         r.requires_attendance, r.is_active, r.organizer_ids, r.created_at, r.updated_at,
         cm.display_name AS created_by_name,
         COALESCE((SELECT json_agg(json_build_object('memberId', m.id, 'name', m.display_name) ORDER BY o.ord)
                     FROM unnest(r.organizer_ids) WITH ORDINALITY AS o(id, ord) JOIN members m ON m.id = o.id), '[]'::json) AS organizers,
         COALESCE((SELECT json_agg(json_build_object('date', x.occurrence_date::text, 'reason', x.reason, 'createdAt', x.created_at)
                                   ORDER BY x.occurrence_date)
                     FROM event_recurrence_exceptions x
                    WHERE x.rule_id = r.id AND x.occurrence_date >= app.local_today() - 60), '[]'::json) AS skips,
         (SELECT count(*) FROM events e WHERE e.recurrence_rule_id = r.id AND e.deleted_at IS NULL AND e.status <> 'cancelled' AND e.starts_at <= now())::int AS past_count,
         (SELECT count(*) FROM events e WHERE e.recurrence_rule_id = r.id AND e.deleted_at IS NULL AND e.status <> 'cancelled' AND e.starts_at > now())::int AS upcoming_count,
         COALESCE((SELECT json_agg(u ORDER BY u.date) FROM (
            SELECT e.id AS "eventId", e.occurrence_date::text AS date,
                   to_char(e.starts_at AT TIME ZONE '${VN}', 'HH24:MI') AS "startHm",
                   to_char(e.ends_at AT TIME ZONE '${VN}', 'HH24:MI') AS "endHm",
                   e.status::text AS status,
                   (e.title <> r.title
                    OR (e.starts_at AT TIME ZONE '${VN}') <> (e.occurrence_date + r.start_time)
                    OR e.ends_at - e.starts_at <> make_interval(mins => r.duration_minutes)
                    OR e.location_text IS DISTINCT FROM r.location_text) AS customized
              FROM events e
             WHERE e.recurrence_rule_id = r.id AND e.deleted_at IS NULL AND e.ends_at >= now()
             ORDER BY e.occurrence_date
             LIMIT 12) u), '[]'::json) AS upcoming
    FROM event_recurrence_rules r
    JOIN categories c ON c.id = r.category_id
    LEFT JOIN members cm ON cm.user_id = r.created_by AND cm.deleted_at IS NULL`;

const toMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

function patternOf(r: Row): WeeklyPattern {
  return {
    startsOn: r.starts_on,
    weekdays: ((r.by_weekday ?? []) as unknown[]).map(Number),
    intervalWeeks: Number(r.interval_n) || 1,
    untilDate: r.until_date ?? null,
  };
}

function toDto(r: Row, today: string): EventSeriesDto {
  const p = patternOf(r);
  const weekly = r.freq === "weekly";
  const skips = (r.skips as { date: string; reason: string | null; createdAt: string }[]).map((s) => ({
    date: s.date,
    reason: s.reason ?? null,
    createdAt: new Date(s.createdAt).toISOString(),
    restorable: s.date >= today,
  }));
  const skipSet = new Set(skips.map((s) => s.date));
  const finished = !!r.until_date && r.until_date < today;
  const upcomingDates = new Set((r.upcoming as { date: string }[]).map((u) => u.date));
  // Buổi hôm nay chỉ tính là "sắp tới" khi chưa kết thúc (còn trong danh sách upcoming)
  const nextDates =
    weekly && r.is_active && !finished
      ? weeklyDates(p, today, { limit: 13, skip: skipSet })
          .filter((d) => d !== today || upcomingDates.has(d))
          .slice(0, 12)
      : (r.upcoming as { date: string; status: string }[]).filter((u) => u.status !== "cancelled").map((u) => u.date);
  return {
    id: r.id,
    title: r.title,
    categoryId: r.category_id,
    categoryCode: r.cat_code,
    category: CATEGORY_LABEL[r.cat_code] ?? r.cat_name,
    categoryColor: r.cat_color,
    startHm: r.start_hm,
    endHm: addMinutesHm(r.start_hm, Number(r.duration_minutes)),
    durationMinutes: Number(r.duration_minutes),
    weekdays: p.weekdays,
    intervalWeeks: p.intervalWeeks,
    startsOn: r.starts_on,
    untilDate: r.until_date ?? null,
    location: r.location_text ?? null,
    organizerText: r.organizer_text ?? null,
    description: r.description ?? null,
    hasCheckIn: !!r.requires_attendance,
    organizers: r.organizers,
    isActive: !!r.is_active,
    finished,
    patternLabel: weekly ? seriesPatternLabel(p) : "Hằng tháng",
    timeLabel: `${r.start_hm}–${addMinutesHm(r.start_hm, Number(r.duration_minutes))}${Number(r.duration_minutes) >= 1440 - toMinutes(r.start_hm) ? " (hôm sau)" : ""}`,
    upcoming: (r.upcoming as EventSeriesDto["upcoming"]).map((u) => ({ ...u, status: u.status as EventStatus })),
    nextDates,
    skips,
    pastCount: r.past_count,
    upcomingCount: r.upcoming_count,
    createdByName: r.created_by_name ?? null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

export async function listSeries(tx: Tx): Promise<EventSeriesListDto> {
  const [today, manage] = await Promise.all([
    localToday(tx),
    tx.query<{ ok: boolean }>("SELECT app.has_permission('event.manage') AS ok").then((r) => !!r.rows[0]?.ok),
  ]);
  const rows = (
    await tx.query(
      `${SERIES_SELECT}
        ORDER BY (r.is_active AND (r.until_date IS NULL OR r.until_date >= app.local_today())) DESC, r.start_time, r.title
        LIMIT 200`
    )
  ).rows;
  return { items: rows.map((r) => toDto(r, today)), canManage: manage, horizonDays: SERIES_HORIZON_DAYS };
}

export async function getSeries(tx: Tx, id: string): Promise<EventSeriesDto> {
  const today = await localToday(tx);
  const r = (await tx.query(`${SERIES_SELECT} WHERE r.id = $1`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy sự kiện định kỳ.");
  return toDto(r, today);
}

// ---------------------------------------------------------------------
// Kiểm tra đầu vào chung
// ---------------------------------------------------------------------
function normWeekdays(days: number[]): number[] {
  const s = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
  if (!s.length) throw badRequest("Chọn ít nhất một thứ trong tuần.");
  return s;
}

/** Ngày kết thúc: count (số buổi tính từ đầu chuỗi) > untilDate > không kết thúc. */
function resolveUntil(p: WeeklyPattern, untilDate: string | null | undefined, count: number | null | undefined): string | null {
  let until: string | null = null;
  if (count) {
    until = untilForCount({ ...p, untilDate: null }, count);
    if (!until) throw badRequest("Không tính được ngày kết thúc từ số buổi — kiểm tra lại thứ trong tuần.");
  } else if (untilDate) {
    until = parseDay(untilDate, "Ngày kết thúc");
  }
  if (until) {
    if (until < p.startsOn) throw badRequest("Ngày kết thúc phải sau ngày bắt đầu.");
    if (daysBetween(p.startsOn, until) > SERIES_MAX_SPAN_DAYS) throw badRequest("Chuỗi định kỳ kéo dài tối đa 2 năm.");
  }
  return until;
}

async function validOrganizers(tx: Tx, ids: string[] | undefined): Promise<string[]> {
  const list = [...new Set(ids ?? [])];
  if (!list.length) return [];
  const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM members WHERE id = ANY ($1::uuid[]) AND deleted_at IS NULL", [list])).rows[0].n;
  if (n !== list.length) throw badRequest("Có thành viên phụ trách không còn trong danh sách thành viên.");
  return list;
}

function times(time: string, endTime: string | null | undefined, categoryCode: string) {
  const t = durationFromTimes(time, endTime, categoryCode);
  if (!t) {
    const bad = durationFromTimes(time, null, categoryCode) ? endTime : time;
    throw badRequest(`Không hiểu giờ "${bad ?? ""}". Ví dụ hợp lệ: 21:00, 8h tối, 07:30 sáng.`);
  }
  if (t.minutes < 5 || t.minutes > 1440) throw badRequest("Mỗi buổi kéo dài từ 5 phút đến 24 giờ.");
  return t;
}

// ---------------------------------------------------------------------
// Tạo chuỗi
// ---------------------------------------------------------------------
export async function createSeries(tx: Tx, i: SeriesCreateInput): Promise<{ id: string; generated: number; firstDate: string | null }> {
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được tạo sự kiện định kỳ.");
  const today = await localToday(tx);
  const startsOn = parseDay(i.startsOn, "Ngày bắt đầu");
  if (startsOn < today) throw badRequest("Chuỗi định kỳ phải bắt đầu từ hôm nay trở đi.");
  if (daysBetween(today, startsOn) > 366) throw badRequest("Ngày bắt đầu quá xa (tối đa 1 năm tới).");
  const cat = await resolveCategory(tx, i);
  const t = times(i.time, i.endTime, cat.code);
  const base: WeeklyPattern = { startsOn, weekdays: normWeekdays(i.weekdays), intervalWeeks: i.intervalWeeks ?? 1 };
  const until = resolveUntil(base, i.untilDate, i.count);
  const first = weeklyDates({ ...base, untilDate: until }, startsOn, { limit: 1 });
  if (!first.length) throw badRequest("Không có buổi nào trong khoảng đã chọn — kiểm tra thứ trong tuần và ngày kết thúc.");
  const organizers = await validOrganizers(tx, i.organizerIds);

  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO event_recurrence_rules (title, category_id, location_text, organizer_text, description, start_time, duration_minutes,
                                           freq, interval_n, by_weekday, starts_on, until_date, requires_attendance, generate_horizon_days,
                                           organizer_ids, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::time, $7, 'weekly', $8, $9::smallint[], $10::date, $11::date, $12, $13, $14::uuid[], app.current_user_id())
       RETURNING id`,
      [
        i.title.trim(),
        cat.id,
        i.location?.trim() || null,
        i.organizerText?.trim() || null,
        i.description?.trim() || null,
        t.startHm,
        t.minutes,
        base.intervalWeeks,
        base.weekdays,
        startsOn,
        until,
        i.hasCheckIn ?? false,
        SERIES_HORIZON_DAYS,
        organizers,
      ]
    )
  ).rows[0].id;
  const generated = (await tx.query<{ n: number }>("SELECT app.fn_event_series_generate($1, NULL) AS n", [id])).rows[0].n;
  return { id, generated, firstDate: first[0] };
}

// ---------------------------------------------------------------------
// Sửa chuỗi (áp dụng cho các buổi từ ngày `fromDate`)
// ---------------------------------------------------------------------
interface RuleRow {
  id: string;
  title: string;
  category_id: string;
  cat_code: string;
  start_hm: string;
  duration_minutes: number;
  freq: string;
  interval_n: number;
  by_weekday: number[];
  starts_on: string;
  until_date: string | null;
  location_text: string | null;
  organizer_text: string | null;
  description: string | null;
  requires_attendance: boolean;
  is_active: boolean;
  organizer_ids: string[];
}

async function loadRule(tx: Tx, id: string): Promise<RuleRow> {
  const r = (
    await tx.query<RuleRow>(
      `SELECT r.id, r.title, r.category_id, c.code AS cat_code, to_char(r.start_time, 'HH24:MI') AS start_hm, r.duration_minutes,
              r.freq::text AS freq, r.interval_n, r.by_weekday, r.starts_on::text AS starts_on, r.until_date::text AS until_date,
              r.location_text, r.organizer_text, r.description, r.requires_attendance, r.is_active, r.organizer_ids
         FROM event_recurrence_rules r JOIN categories c ON c.id = r.category_id
        WHERE r.id = $1
        FOR UPDATE OF r`,
      [id]
    )
  ).rows[0];
  if (!r) throw notFound("Không tìm thấy sự kiện định kỳ.");
  return { ...r, by_weekday: (r.by_weekday ?? []).map(Number), organizer_ids: r.organizer_ids ?? [] };
}

export interface SeriesChangeResult {
  updated: number;
  removed: number;
  restored: number;
  generated: number;
}

async function sync(tx: Tx, id: string, from: string): Promise<{ removed: number; restored: number; generated: number }> {
  return (await tx.query<{ r: { removed: number; restored: number; generated: number } }>("SELECT app.fn_event_series_sync($1, $2::date) AS r", [id, from]))
    .rows[0].r;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function updateSeries(tx: Tx, id: string, p: SeriesPatchInput): Promise<SeriesChangeResult> {
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được sửa sự kiện định kỳ.");
  const today = await localToday(tx);
  const cur = await loadRule(tx, id);
  if (!cur.is_active && !p.isActive) throw new ApiError(422, "SERIES_STOPPED", "Chuỗi đã dừng — hãy tiếp tục chuỗi trước khi sửa.");
  const from = p.fromDate ? parseDay(p.fromDate, "Ngày áp dụng") : today;
  if (from < today) throw badRequest("Chỉ sửa được các buổi từ hôm nay trở đi — buổi đã diễn ra giữ nguyên.");
  if (daysBetween(today, from) > 180) throw badRequest("Ngày áp dụng quá xa (tối đa 180 ngày tới).");

  // ---- Giá trị mới ----
  let catId = cur.category_id;
  let catCode = cur.cat_code;
  if (p.categoryCode !== undefined || p.categoryId !== undefined) {
    const c = await resolveCategory(tx, p);
    catId = c.id;
    catCode = c.code;
  }
  let startHm = cur.start_hm;
  let duration = cur.duration_minutes;
  if (p.time !== undefined || p.endTime !== undefined) {
    if (p.endTime === undefined) {
      // Chỉ dời giờ bắt đầu: giữ nguyên thời lượng
      startHm = times(p.time!, null, catCode).startHm;
    } else {
      const t = times(p.time ?? cur.start_hm, p.endTime, catCode);
      startHm = t.startHm;
      duration = t.minutes;
    }
  }
  const weekly = cur.freq === "weekly";
  const weekdays = p.weekdays !== undefined ? normWeekdays(p.weekdays) : cur.by_weekday;
  const intervalWeeks = p.intervalWeeks ?? cur.interval_n;
  if (!weekly && (p.weekdays !== undefined || p.intervalWeeks !== undefined)) throw badRequest("Chuỗi hằng tháng không đổi được thứ trong tuần.");
  const base: WeeklyPattern = { startsOn: cur.starts_on, weekdays, intervalWeeks };
  let until = cur.until_date;
  if (p.noEnd || p.untilDate === null) until = null;
  else if (p.count || p.untilDate) until = resolveUntil(base, p.untilDate, p.count);
  let active = cur.is_active;
  if (p.isActive) {
    active = true;
    if (until && until < today) throw badRequest("Chuỗi đã qua ngày kết thúc — chọn ngày kết thúc mới (hoặc không kết thúc) để tiếp tục.");
  }
  const title = p.title !== undefined ? p.title.trim() : cur.title;
  const location = p.location !== undefined ? p.location?.trim() || null : cur.location_text;
  const organizerText = p.organizerText !== undefined ? p.organizerText?.trim() || null : cur.organizer_text;
  const description = p.description !== undefined ? p.description?.trim() || null : cur.description;
  const hasCheckIn = p.hasCheckIn ?? cur.requires_attendance;
  const organizers = p.organizerIds !== undefined ? await validOrganizers(tx, p.organizerIds) : cur.organizer_ids;

  // ---- Buổi trước ngày áp dụng (chưa sinh) giữ giá trị CŨ: sinh trước tới from−1 rồi mới đổi quy tắc ----
  if (cur.is_active && from > today) await tx.query("SELECT app.fn_event_series_generate($1, $2::date - 1)", [id, from]);

  await tx.query(
    `UPDATE event_recurrence_rules
        SET title = $2, category_id = $3, start_time = $4::time, duration_minutes = $5, interval_n = $6, by_weekday = $7::smallint[],
            until_date = $8::date, location_text = $9, organizer_text = $10, description = $11, requires_attendance = $12,
            organizer_ids = $13::uuid[], is_active = $14
      WHERE id = $1`,
    [id, title, catId, startHm, duration, intervalWeeks, weekdays, until, location, organizerText, description, hasCheckIn, organizers, active]
  );

  // ---- Các buổi chưa diễn ra từ ngày áp dụng: chỉ đổi trường nào buổi đó CHƯA bị sửa riêng (còn bằng giá trị cũ của chuỗi) ----
  const scope = `recurrence_rule_id = $1 AND occurrence_date >= $2::date AND deleted_at IS NULL AND starts_at > now() AND status IN ('scheduled', 'draft')`;
  const touched = new Set<string>();
  const run = async (sql: string, params: unknown[]) => {
    for (const r of (await tx.query<{ id: string }>(sql, params)).rows) touched.add(r.id);
  };
  if (title !== cur.title) await run(`UPDATE events SET title = $3 WHERE ${scope} AND title = $4 RETURNING id`, [id, from, title, cur.title]);
  if (catId !== cur.category_id) await run(`UPDATE events SET category_id = $3 WHERE ${scope} AND category_id = $4 RETURNING id`, [id, from, catId, cur.category_id]);
  if (startHm !== cur.start_hm || duration !== cur.duration_minutes) {
    await run(
      `UPDATE events
          SET starts_at = (occurrence_date + $3::time) AT TIME ZONE '${VN}',
              ends_at = ((occurrence_date + $3::time) AT TIME ZONE '${VN}') + make_interval(mins => $4::int)
        WHERE ${scope}
          AND (starts_at AT TIME ZONE '${VN}') = (occurrence_date + $5::time)
          AND ends_at - starts_at = make_interval(mins => $6::int)
        RETURNING id`,
      [id, from, startHm, duration, cur.start_hm, cur.duration_minutes]
    );
  }
  if (location !== cur.location_text)
    await run(`UPDATE events SET location_text = $3 WHERE ${scope} AND location_text IS NOT DISTINCT FROM $4 RETURNING id`, [id, from, location, cur.location_text]);
  if (organizerText !== cur.organizer_text)
    await run(`UPDATE events SET organizer_text = $3 WHERE ${scope} AND organizer_text IS NOT DISTINCT FROM $4 RETURNING id`, [id, from, organizerText, cur.organizer_text]);
  if (description !== cur.description)
    await run(`UPDATE events SET description = $3 WHERE ${scope} AND description IS NOT DISTINCT FROM $4 RETURNING id`, [id, from, description, cur.description]);
  if (hasCheckIn !== cur.requires_attendance)
    await run(
      `UPDATE events e SET requires_attendance = $3
        WHERE e.recurrence_rule_id = $1 AND e.occurrence_date >= $2::date AND e.deleted_at IS NULL AND e.starts_at > now()
          AND e.status IN ('scheduled', 'draft') AND e.requires_attendance = $4
          AND NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.event_id = e.id)
        RETURNING e.id`,
      [id, from, hasCheckIn, cur.requires_attendance]
    );
  if (!sameSet(organizers, cur.organizer_ids)) {
    // Buổi có ban tổ chức đúng như chuỗi cũ ⇒ thay bằng ban tổ chức mới (người đầu tiên là chủ trì)
    const ids = (
      await tx.query<{ id: string }>(
        `SELECT e.id FROM events e
          WHERE e.recurrence_rule_id = $1 AND e.occurrence_date >= $2::date AND e.deleted_at IS NULL AND e.starts_at > now()
            AND e.status IN ('scheduled', 'draft')
            AND COALESCE((SELECT array_agg(o.member_id::text ORDER BY o.member_id::text) FROM event_organizers o WHERE o.event_id = e.id), '{}')
                = COALESCE((SELECT array_agg(x::text ORDER BY x::text) FROM unnest($3::uuid[]) x), '{}')`,
        [id, from, cur.organizer_ids]
      )
    ).rows.map((r) => r.id);
    if (ids.length) {
      await tx.query("DELETE FROM event_organizers WHERE event_id = ANY ($1::uuid[])", [ids]);
      if (organizers.length) {
        await tx.query(
          `INSERT INTO event_organizers (event_id, member_id, role_label)
           SELECT e, o.member_id, CASE WHEN o.ord = 1 THEN 'lead' ELSE 'member' END
             FROM unnest($1::uuid[]) e CROSS JOIN unnest($2::uuid[]) WITH ORDINALITY AS o(member_id, ord)`,
          [ids, organizers]
        );
      }
      for (const x of ids) touched.add(x);
    }
  }

  // ---- Khớp lại mẫu lặp (thứ / chu kỳ / ngày kết thúc / tiếp tục) + sinh tiếp ----
  const s = await sync(tx, id, from);
  return { updated: touched.size, ...s };
}

// ---------------------------------------------------------------------
// Bỏ một ngày / khôi phục / dừng chuỗi
// ---------------------------------------------------------------------
export async function skipSeriesDate(tx: Tx, id: string, date: string, reason: string | null | undefined): Promise<{ date: string; title: string; hadEvent: boolean }> {
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được bỏ một buổi của sự kiện định kỳ.");
  const today = await localToday(tx);
  const d = parseDay(date, "Ngày bỏ qua");
  if (d < today) throw new ApiError(422, "SERIES_PAST", "Ngày này đã qua — không bỏ được.");
  const rule = (
    await tx.query<{ ok: boolean; title: string }>(
      "SELECT app.fn_recurrence_matches(r, $2::date) AS ok, r.title FROM event_recurrence_rules r WHERE r.id = $1",
      [id, d]
    )
  ).rows[0];
  if (!rule) throw notFound("Không tìm thấy sự kiện định kỳ.");
  if (!rule.ok) throw new ApiError(422, "SERIES_NO_OCCURRENCE", `Ngày ${isoToDmy(d)} không có buổi nào của chuỗi này.`);
  const ev = (
    await tx.query<{ started: boolean }>(
      "SELECT starts_at <= now() AS started FROM events WHERE recurrence_rule_id = $1 AND occurrence_date = $2::date AND deleted_at IS NULL",
      [id, d]
    )
  ).rows[0];
  if (ev?.started) throw new ApiError(422, "SERIES_STARTED", `Buổi ngày ${dm(d)} đã bắt đầu — không bỏ được (có thể hủy riêng buổi này).`);
  await tx.query(
    `INSERT INTO event_recurrence_exceptions (rule_id, occurrence_date, reason, created_by)
     VALUES ($1, $2::date, $3, app.current_user_id())
     ON CONFLICT (rule_id, occurrence_date) DO UPDATE SET reason = EXCLUDED.reason`,
    [id, d, reason?.trim() || null]
  );
  await sync(tx, id, d);
  return { date: d, title: rule.title, hadEvent: !!ev };
}

export async function restoreSeriesDate(tx: Tx, id: string, date: string): Promise<{ date: string }> {
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được khôi phục buổi của sự kiện định kỳ.");
  const today = await localToday(tx);
  const d = parseDay(date, "Ngày khôi phục");
  if (d < today) throw new ApiError(422, "SERIES_PAST", "Ngày này đã qua — không khôi phục được.");
  const r = await tx.query("DELETE FROM event_recurrence_exceptions WHERE rule_id = $1 AND occurrence_date = $2::date", [id, d]);
  if (!r.rowCount) throw notFound(`Ngày ${isoToDmy(d)} không nằm trong danh sách ngày nghỉ của chuỗi.`);
  await sync(tx, id, d);
  return { date: d };
}

export async function stopSeries(tx: Tx, id: string, fromDate: string | null | undefined): Promise<{ from: string; title: string; removed: number }> {
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được dừng sự kiện định kỳ.");
  const today = await localToday(tx);
  const from = fromDate ? parseDay(fromDate, "Ngày dừng") : today;
  if (from < today) throw badRequest("Ngày dừng phải từ hôm nay trở đi.");
  const cur = await loadRule(tx, id);
  if (!cur.is_active) throw new ApiError(422, "SERIES_STOPPED", "Chuỗi này đã dừng rồi.");
  // Các buổi trước ngày dừng (nếu chưa sinh) vẫn được tạo theo chuỗi hiện tại
  if (from > today) await tx.query("SELECT app.fn_event_series_generate($1, $2::date - 1)", [id, from]);
  await tx.query(
    `UPDATE event_recurrence_rules
        SET is_active = false,
            until_date = GREATEST(starts_on, LEAST(COALESCE(until_date, $2::date - 1), $2::date - 1))
      WHERE id = $1`,
    [id, from]
  );
  const s = await sync(tx, id, from);
  return { from, title: cur.title, removed: s.removed };
}

/** Ngày đầu tiên còn buổi (≥ hôm nay) của chuỗi — để mở lịch tới đúng tháng sau khi lưu. */
export async function firstUpcomingDate(tx: Tx, id: string): Promise<string | null> {
  return (
    (
      await tx.query<{ d: string | null }>(
        "SELECT min(occurrence_date)::text AS d FROM events WHERE recurrence_rule_id = $1 AND deleted_at IS NULL AND occurrence_date >= app.local_today()",
        [id]
      )
    ).rows[0]?.d ?? null
  );
}

/** Thông tin ngắn để báo cả nhà: "Thứ Hai, Thứ Tư hằng tuần · 21:00–21:30 · từ 12/10/2026". */
export function seriesAnnouncement(s: EventSeriesDto): string {
  return `${s.patternLabel} · ${s.timeLabel} · từ ${isoToDmy(s.startsOn)}${s.untilDate ? ` đến ${isoToDmy(s.untilDate)}` : ""}${s.location ? ` · ${s.location}` : ""}`;
}
