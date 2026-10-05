import "server-only";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import type {
  LiturgyAssignmentDto,
  LiturgyDayDto,
  LiturgyHighlightDto,
  LiturgySessionDto,
  LiturgyWeekDto,
  ReflectionDto,
} from "@/lib/types/community";
import { addDays, dayPeriod, formatDayMonth, weekdayOf } from "@/lib/community-format";
import { liturgicalDay } from "@/lib/liturgy/engine";
import { currentMemberId, denyOrMissing, iso, permissions, personCols, personJoin, toPerson } from "./community-shared";

// ---------------------------------------------------------------------
// Lịch phụng vụ tuần: buổi phụng vụ = sự kiện thuộc danh mục EVT_MASS (Phụng vụ & Thánh lễ) / EVT_PATRON (Bổn mạng),
// kèm lịch Phụng vụ Công giáo theo ngày (bộ tính lịch src/lib/liturgy/engine.ts) và phân công phục vụ (liturgy_assignments × liturgy_role_types).
// ---------------------------------------------------------------------
const LITURGY_CATS = ["EVT_MASS", "EVT_PATRON"];
const TZ = "Asia/Ho_Chi_Minh";

type Row = Record<string, any>;

const timeLabel = (hm: string) => `${hm} ${dayPeriod(hm)}`;

async function sessionsBetween(tx: Tx, from: string, toExclusive: string): Promise<LiturgySessionDto[]> {
  const rows = (
    await tx.query(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, e.location_text, e.description, c.code AS cat_code,
              to_char(e.starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, to_char(e.starts_at AT TIME ZONE '${TZ}', 'HH24:MI') AS hm
         FROM events e JOIN categories c ON c.id = e.category_id
        WHERE c.code = ANY($3::text[]) AND e.deleted_at IS NULL AND e.status NOT IN ('cancelled', 'draft')
          AND e.starts_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}'
          AND e.starts_at <  ($2::date)::timestamp AT TIME ZONE '${TZ}'
        ORDER BY e.starts_at`,
      [from, toExclusive, LITURGY_CATS]
    )
  ).rows;
  const ids = rows.map((r) => r.id);
  const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0]?.id;
  const asg = ids.length
    ? (
        await tx.query(
          `SELECT la.id, la.event_id, la.status, la.note, la.member_id, rt.code AS role_code, rt.name_vi AS role_name, rt.sort_order,
                  ${personCols("lm")}
             FROM liturgy_assignments la
             JOIN liturgy_role_types rt ON rt.id = la.role_type_id
             ${personJoin("lm", "la.member_id")}
            WHERE la.event_id = ANY($1::uuid[])
            ORDER BY rt.sort_order, lm.display_name`,
          [ids]
        )
      ).rows
    : [];
  const byEvent = new Map<string, LiturgyAssignmentDto[]>();
  for (const a of asg) {
    const list = byEvent.get(a.event_id) ?? [];
    list.push({
      id: a.id,
      eventId: a.event_id,
      roleCode: a.role_code,
      roleName: a.role_name,
      member: toPerson(a, "lm"),
      status: a.status,
      note: a.note ?? null,
      isMine: a.member_id === me,
    });
    byEvent.set(a.event_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    date: r.day,
    time: r.hm,
    timeLabel: timeLabel(r.hm),
    location: r.location_text ?? null,
    description: r.description ?? null,
    categoryCode: r.cat_code,
    isMass: r.cat_code === "EVT_PATRON" || /thánh lễ/i.test(r.title),
    isPatron: r.cat_code === "EVT_PATRON",
    assignments: byEvent.get(r.id) ?? [],
  }));
}

function highlight(s: LiturgySessionDto, today: string): LiturgyHighlightDto {
  const tomorrow = addDays(today, 1);
  const evening = Number(s.time.slice(0, 2)) >= 18;
  const whenLabel =
    s.date === today ? (evening ? "Tối nay" : "Hôm nay") : s.date === tomorrow ? "Ngày mai" : `${weekdayOf(s.date)} ${formatDayMonth(s.date)}`;
  const presider = s.assignments.find((a) => a.roleCode === "presider");
  return {
    sessionId: s.id,
    title: s.title,
    date: s.date,
    time: s.time,
    timeLabel: s.timeLabel,
    whenLabel,
    weekday: weekdayOf(s.date),
    location: s.location,
    presider: presider ? `${presider.member.name}${presider.member.room ? ` (${presider.member.room})` : ""}` : null,
  };
}

export async function getWeek(tx: Tx, fromParam: string | null): Promise<LiturgyWeekDto> {
  const base = (
    await tx.query<{ today: string; night: string | null }>(
      "SELECT app.local_today()::text AS today, app.setting_text('liturgy.night_prayer_time') AS night"
    )
  ).rows[0];
  const today = base.today;
  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : today;
  const to = addDays(from, 6);

  const [sessions, roleTypes] = await Promise.all([
    sessionsBetween(tx, from, addDays(from, 7)),
    tx.query("SELECT id, code, name_vi FROM liturgy_role_types WHERE is_active ORDER BY sort_order"),
  ]);

  const list: LiturgyDayDto[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    const l = liturgicalDay(d);
    list.push({
      date: d,
      weekday: weekdayOf(d),
      dateLabel: formatDayMonth(d),
      isToday: d === today,
      isSunday: weekdayOf(d) === "Chúa Nhật",
      liturgical: {
        // Ngày thường: bỏ thứ ở đầu tên (đã hiện cạnh ngày) — "Thứ Hai tuần XXVII Thường Niên" ⇒ "Tuần XXVII Thường Niên"
        title: l.title.startsWith(`${l.weekdayLabel} `)
          ? l.title.slice(l.weekdayLabel.length + 1).replace(/^[—-]\s*/, "").replace(/^./, (c) => c.toUpperCase())
          : l.title,
        rankLabel: l.rank === "weekday" || l.rank === "privileged" ? null : l.rankLabel,
        color: l.color,
        isAbstinence: !!l.fasting,
        note: l.notes.find((n) => !/đầu tháng/.test(n)) ?? null,
      },
      sessions: sessions.filter((s) => s.date === d),
    });
  }

  // Tên tuần phụng vụ (vd "Tuần XXVII Thường Niên") theo Chúa Nhật trong khoảng 7 ngày
  const weekLabel = liturgicalDay(list.find((d) => d.isSunday)?.date ?? from).weekLabel;

  // Thẻ đầu trang: buổi kế tiếp hôm nay (hoặc sắp tới) và Thánh lễ kế tiếp (trong 45 ngày)
  const upcoming = await sessionsBetween(tx, today, addDays(today, 45));
  const nowMs = Date.now();
  const next = upcoming.filter((s) => new Date(s.endsAt).getTime() > nowMs);
  const tonightSession = next.find((s) => s.date === today && !s.isMass) ?? next.find((s) => s.date === today) ?? next.find((s) => !s.isMass) ?? next[0];
  const massSession = next.find((s) => s.isMass);

  const [fy, fm] = from.split("-");
  return {
    from,
    to,
    today,
    monthLabel: `Tháng ${fm}/${fy}`,
    weekLabel,
    rangeLabel: `${formatDayMonth(from)} – ${formatDayMonth(to)}/${to.slice(0, 4)}`,
    days: list,
    roleTypes: roleTypes.rows.map((r) => ({ id: r.id, code: r.code, name: r.name_vi })),
    tonight: tonightSession ? highlight(tonightSession, today) : null,
    nextMass: massSession ? highlight(massSession, today) : null,
    defaultNightPrayerTime: (base.night ?? "20:30").replace(/^"|"$/g, ""),
  };
}

// ---------------------------------------------------------------------
// Buổi phụng vụ (sự kiện danh mục EVT_MASS) — tạo/hủy cần event.manage (RLS events)
// ---------------------------------------------------------------------
export interface SessionInput {
  title: string;
  date: string;
  time: string;
  durationMinutes?: number;
  location?: string | null;
  description?: string | null;
  patron?: boolean;
}

export async function createSession(tx: Tx, b: SessionInput): Promise<string> {
  const p = await permissions(tx, ["liturgy.manage"] as const);
  if (!p["liturgy.manage"]) throw forbidden("Chỉ Ban Phụng vụ được lập lịch phụng vụ.");
  const cat = (await tx.query<{ id: string }>("SELECT id FROM categories WHERE kind = 'event' AND code = $1", [b.patron ? "EVT_PATRON" : "EVT_MASS"])).rows[0];
  if (!cat) throw new ApiError(500, "NO_CATEGORY", "Thiếu danh mục sự kiện Phụng vụ.");
  const minutes = Math.min(Math.max(b.durationMinutes ?? 45, 10), 600);
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO events (title, category_id, status, starts_at, ends_at, location_text, organizer_text, description, created_by)
       VALUES ($1, $2, 'scheduled',
               ($3::date + $4::time)::timestamp AT TIME ZONE '${TZ}',
               ($3::date + $4::time)::timestamp AT TIME ZONE '${TZ}' + make_interval(mins => $5),
               $6, 'Ban Phụng vụ', $7, app.current_user_id())
       RETURNING id`,
      [b.title.trim(), cat.id, b.date, b.time, minutes, b.location?.trim() || null, b.description?.trim() || null]
    )
  ).rows[0].id;
}

export async function cancelSession(tx: Tx, id: string, reason: string) {
  const p = await permissions(tx, ["liturgy.manage"] as const);
  if (!p["liturgy.manage"]) throw forbidden("Chỉ Ban Phụng vụ được hủy buổi phụng vụ.");
  const ok = (
    await tx.query(
      `SELECT 1 FROM events e JOIN categories c ON c.id = e.category_id WHERE e.id = $1 AND c.code = ANY($2::text[]) AND e.deleted_at IS NULL`,
      [id, LITURGY_CATS]
    )
  ).rowCount;
  if (!ok) throw notFound("Không tìm thấy buổi phụng vụ.");
  const r = await tx.query("UPDATE events SET status = 'cancelled', cancel_reason = $2 WHERE id = $1 AND status IN ('scheduled', 'draft', 'ongoing')", [id, reason.trim()]);
  if (!r.rowCount) await denyOrMissing(tx, "events", id, "Bạn không có quyền hủy buổi phụng vụ này.");
}

// ---------------------------------------------------------------------
// Phân công phục vụ
// ---------------------------------------------------------------------
export async function addAssignment(tx: Tx, b: { eventId: string; roleCode: string; memberId: string; note?: string | null }): Promise<string> {
  const p = await permissions(tx, ["liturgy.manage"] as const);
  if (!p["liturgy.manage"]) throw forbidden("Chỉ Ban Phụng vụ được phân công phục vụ.");
  const role = (await tx.query<{ id: string }>("SELECT id FROM liturgy_role_types WHERE code = $1 AND is_active", [b.roleCode])).rows[0];
  if (!role) throw new ApiError(400, "BAD_ROLE", "Vai trò phục vụ không hợp lệ.");
  const ev = (await tx.query("SELECT 1 FROM events WHERE id = $1 AND deleted_at IS NULL", [b.eventId])).rowCount;
  if (!ev) throw notFound("Không tìm thấy buổi phụng vụ.");
  const mem = (await tx.query("SELECT 1 FROM members WHERE id = $1 AND deleted_at IS NULL AND status IN ('active', 'on_leave')", [b.memberId])).rowCount;
  if (!mem) throw new ApiError(400, "BAD_MEMBER", "Thành viên không hợp lệ.");
  let id: string;
  try {
    id = (
      await tx.query<{ id: string }>(
        `INSERT INTO liturgy_assignments (event_id, role_type_id, member_id, note, assigned_by)
         VALUES ($1, $2, $3, $4, app.current_user_id()) RETURNING id`,
        [b.eventId, role.id, b.memberId, b.note?.trim() || null]
      )
    ).rows[0].id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "DUPLICATE", "Thành viên này đã được phân công vai trò đó trong buổi này.");
    throw e;
  }
  await tx.query("SELECT app.fn_notify_liturgy_assignment($1)", [id]);
  return id;
}

/** Người được phân công xác nhận/từ chối; Ban Phụng vụ đổi mọi trạng thái. */
export async function setAssignmentStatus(tx: Tx, id: string, status: "assigned" | "confirmed" | "declined" | "served") {
  const r = await tx.query("UPDATE liturgy_assignments SET status = $2 WHERE id = $1", [id, status]);
  if (!r.rowCount) await denyOrMissing(tx, "liturgy_assignments", id, "Chỉ người được phân công hoặc Ban Phụng vụ được cập nhật.");
}

export async function deleteAssignment(tx: Tx, id: string) {
  const p = await permissions(tx, ["liturgy.manage"] as const);
  if (!p["liturgy.manage"]) throw forbidden("Chỉ Ban Phụng vụ được gỡ phân công.");
  const r = await tx.query("DELETE FROM liturgy_assignments WHERE id = $1", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy phân công.");
}

// ---------------------------------------------------------------------
// Góc chia sẻ Lời Chúa (reflections)
// ---------------------------------------------------------------------
export async function listReflections(tx: Tx, limit = 5): Promise<ReflectionDto[]> {
  const me = await currentMemberId(tx);
  const p = await permissions(tx, ["liturgy.manage"] as const);
  const rows = (
    await tx.query(
      `SELECT rf.id, rf.scripture_ref, rf.quote, rf.body, rf.week_of::text AS week_of, rf.created_at, rf.author_member_id, ${personCols("ra")}
         FROM reflections rf
         ${personJoin("ra", "rf.author_member_id")}
        WHERE rf.deleted_at IS NULL AND rf.status = 'published'
        ORDER BY COALESCE(rf.week_of, (rf.created_at AT TIME ZONE '${TZ}')::date) DESC, rf.created_at DESC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 30)]
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    scriptureRef: r.scripture_ref ?? null,
    quote: r.quote ?? null,
    body: r.body,
    weekOf: r.week_of ?? null,
    author: toPerson(r, "ra"),
    createdAt: iso(r.created_at),
    isMine: r.author_member_id === me,
    canDelete: r.author_member_id === me || p["liturgy.manage"],
  }));
}

export async function createReflection(tx: Tx, b: { scriptureRef?: string | null; quote?: string | null; body: string }): Promise<string> {
  await currentMemberId(tx);
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO reflections (author_member_id, scripture_ref, quote, body, week_of)
       VALUES (app.current_member_id(), $1, $2, $3, date_trunc('week', app.local_today())::date) RETURNING id`,
      [b.scriptureRef?.trim() || null, b.quote?.trim() || null, b.body.trim()]
    )
  ).rows[0].id;
}

export async function deleteReflection(tx: Tx, id: string) {
  const r = await tx.query("UPDATE reflections SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) await denyOrMissing(tx, "reflections", id, "Chỉ người chia sẻ hoặc Ban Phụng vụ được gỡ bài suy niệm.");
}
