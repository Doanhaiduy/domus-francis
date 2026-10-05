import "server-only";
import type { Tx } from "../db";
import type { Ctx } from "../http";
import { ApiError, conflict, forbidden, notFound } from "../errors";
import { addDays, mondayOf } from "@/lib/duty-format";
import { dutyWeekBriefs } from "./duty-weeks";
import type {
  CleaningAreaDto,
  ChecklistItemDto,
  DutyAssignmentDto,
  DutyCheckinDto,
  DutyPersonDto,
  DutyRosterDto,
  DutyShiftDto,
  DutyStatus,
  DutySummaryDto,
  DutySummaryItemDto,
  DutySwapDto,
  DutySwapsDto,
  DutyWeekDto,
  MyUpcomingDutyDto,
  SwapStatus,
} from "@/lib/types/duty";

// =====================================================================
// Phân hệ Trực nhật: roster tuần → ca trực → người trực → check-in (ảnh + checklist) → nghiệm thu; đổi ca 3 bước.
// Mọi luật nghiệp vụ do DB kiểm (trigger/hàm 32_fn_duty.sql + RLS 46): ở đây chỉ dựng câu lệnh và DTO.
// =====================================================================

const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
const isoReq = (v: Date | string): string => new Date(v).toISOString();
const shiftLabel = (name: string, start: string) => `${name} (${start})`;

interface Viewer {
  me: string | null; // members.id
  manage: boolean;
  review: boolean;
  checkin: boolean;
  swapRequest: boolean;
  swapApprove: boolean;
  today: string;
  now: Date;
}

async function viewer(tx: Tx): Promise<Viewer> {
  const r = (
    await tx.query(
      `SELECT app.current_member_id() AS me,
              app.has_permission('duty.manage') AS manage, app.has_permission('duty.review') AS review,
              app.has_permission('duty.checkin') AS checkin, app.has_permission('duty.swap.request') AS swap_request,
              app.has_permission('duty.swap.approve') AS swap_approve,
              app.local_today()::text AS today, now() AS now`
    )
  ).rows[0];
  return {
    me: r.me,
    manage: r.manage,
    review: r.review,
    checkin: r.checkin,
    swapRequest: r.swap_request,
    swapApprove: r.swap_approve,
    today: r.today,
    now: new Date(r.now),
  };
}

async function dutySettings(tx: Tx) {
  const r = (
    await tx.query(
      `SELECT app.setting_int('duty.checkin.window_before_minutes') AS before_min,
              app.setting_int('duty.checkin.window_after_minutes')  AS after_min,
              app.setting_int('duty.swap.min_notice_hours')         AS notice_h,
              app.setting_int('duty.rework.window_hours')           AS rework_h`
    )
  ).rows[0];
  return { beforeMin: Number(r.before_min), afterMin: Number(r.after_min), noticeH: Number(r.notice_h), reworkH: Number(r.rework_h) };
}

async function requireMember(tx: Tx): Promise<string> {
  const me = (await tx.query<{ me: string | null }>("SELECT app.current_member_id() AS me")).rows[0].me;
  if (!me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  return me;
}

export async function listAreas(tx: Tx): Promise<CleaningAreaDto[]> {
  return (
    await tx.query(
      `SELECT id, code, name, COALESCE(icon, '🧹') AS icon, description, min_assignees, is_whole_house, difficulty_points
         FROM cleaning_areas WHERE is_active ORDER BY sort_order, name`
    )
  ).rows.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    icon: a.icon,
    description: a.description,
    minAssignees: a.min_assignees,
    isWholeHouse: a.is_whole_house,
    difficultyPoints: a.difficulty_points,
  }));
}

export async function listShifts(tx: Tx): Promise<DutyShiftDto[]> {
  return (
    await tx.query(
      `SELECT id, code, name, to_char(start_time, 'HH24:MI') AS st, to_char(end_time, 'HH24:MI') AS et
         FROM duty_shifts WHERE is_active ORDER BY sort_order, start_time`
    )
  ).rows.map((s) => ({ id: s.id, code: s.code, name: s.name, start: s.st, end: s.et, label: shiftLabel(s.name, s.st) }));
}

// ---------------------------------------------------------------------
// Đọc ca trực (roster tuần, tóm tắt, ca của tôi)
// ---------------------------------------------------------------------
const ASSIGNMENT_SELECT = `
  SELECT a.id, a.roster_id, a.duty_date::text AS duty_date, a.status::text AS status, a.status_reason, a.attempt_count,
         a.rework_due_at, a.checklist_template_id,
         ca.id AS area_id, ca.code AS area_code, ca.name AS area_name, COALESCE(ca.icon, '🧹') AS area_icon,
         ca.min_assignees, ca.is_whole_house,
         s.id AS shift_id, s.code AS shift_code, s.name AS shift_name,
         to_char(s.start_time, 'HH24:MI') AS shift_start, to_char(s.end_time, 'HH24:MI') AS shift_end,
         r.code AS room_code, r.name AS room_name,
         lower(app.shift_window(a.duty_date, a.shift_id)) AS starts_at,
         upper(app.shift_window(a.duty_date, a.shift_id)) AS ends_at
    FROM duty_assignments a
    JOIN cleaning_areas ca ON ca.id = a.area_id
    JOIN duty_shifts s ON s.id = a.shift_id
    LEFT JOIN rooms r ON r.id = a.room_id`;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadAssignmentDetails(tx: Tx, rows: Row[], v: Viewer): Promise<DutyAssignmentDto[]> {
  if (!rows.length) return [];
  const st = await dutySettings(tx);
  const ids = rows.map((r) => r.id);
  const templates = [...new Set(rows.map((r) => r.checklist_template_id).filter(Boolean))];

  const members = (
    await tx.query(
      `SELECT dam.assignment_id, dam.member_role, m.id, m.display_name, m.full_name
         FROM duty_assignment_members dam JOIN members m ON m.id = dam.member_id
        WHERE dam.assignment_id = ANY($1::uuid[])
        ORDER BY (dam.member_role = 'lead') DESC, dam.created_at, m.display_name`,
      [ids]
    )
  ).rows;
  const items = templates.length
    ? (
        await tx.query(
          `SELECT id, template_id, code, label, is_required FROM checklist_template_items
            WHERE template_id = ANY($1::uuid[]) ORDER BY sort_order, label`,
          [templates]
        )
      ).rows
    : [];
  const checkins = (
    await tx.query(
      `SELECT c.id, c.assignment_id, c.attempt, c.checked_in_at, c.is_late, c.late_minutes, c.note, c.evidence_file_id,
              m.id AS by_id, m.display_name AS by_name, m.full_name AS by_full
         FROM duty_checkins c JOIN members m ON m.id = c.checked_in_by_member_id
        WHERE c.assignment_id = ANY($1::uuid[])
        ORDER BY c.attempt DESC`,
      [ids]
    )
  ).rows;
  const checkinIds = checkins.map((c) => c.id);
  const ckItems = checkinIds.length
    ? (
        await tx.query(
          `SELECT ci.checkin_id, ci.template_item_id, ci.is_done, i.label
             FROM checkin_items ci JOIN checklist_template_items i ON i.id = ci.template_item_id
            WHERE ci.checkin_id = ANY($1::uuid[]) ORDER BY i.sort_order`,
          [checkinIds]
        )
      ).rows
    : [];
  const reviews = checkinIds.length
    ? (
        await tx.query(
          `SELECT dr.id, dr.checkin_id, dr.decision::text AS decision, dr.score, dr.feedback, dr.reviewed_at,
                  m.id AS rv_id, m.display_name AS rv_name, m.full_name AS rv_full
             FROM duty_reviews dr JOIN members m ON m.id = dr.reviewer_member_id
            WHERE dr.checkin_id = ANY($1::uuid[])`,
          [checkinIds]
        )
      ).rows
    : [];
  const swaps = (
    await tx.query(
      `SELECT s.id, s.assignment_id, s.status::text AS status,
              fm.id AS f_id, fm.display_name AS f_name, fm.full_name AS f_full,
              tm.id AS t_id, tm.display_name AS t_name, tm.full_name AS t_full
         FROM duty_swap_requests s
         JOIN members fm ON fm.id = s.from_member_id
         JOIN members tm ON tm.id = s.to_member_id
        WHERE s.assignment_id = ANY($1::uuid[]) AND s.status IN ('pending_peer', 'pending_admin')`,
      [ids]
    )
  ).rows;

  const person = (id: string, name: string, full: string, role?: string): DutyPersonDto => ({
    id,
    name,
    fullName: full,
    ...(role ? { role: role as "lead" | "member" } : {}),
  });
  const now = v.now.getTime();

  return rows.map((r) => {
    const mem = members.filter((m) => m.assignment_id === r.id).map((m) => person(m.id, m.display_name, m.full_name, m.member_role));
    const checklist: ChecklistItemDto[] = items
      .filter((i) => i.template_id === r.checklist_template_id)
      .map((i) => ({ id: i.id, code: i.code, label: i.label, isRequired: i.is_required }));
    const cks: DutyCheckinDto[] = checkins
      .filter((c) => c.assignment_id === r.id)
      .map((c) => {
        const rv = reviews.find((x) => x.checkin_id === c.id);
        return {
          id: c.id,
          attempt: c.attempt,
          by: person(c.by_id, c.by_name, c.by_full),
          at: isoReq(c.checked_in_at),
          isLate: c.is_late,
          lateMinutes: c.late_minutes,
          note: c.note,
          evidenceFileId: c.evidence_file_id,
          items: ckItems.filter((x) => x.checkin_id === c.id).map((x) => ({ itemId: x.template_item_id, label: x.label, isDone: x.is_done })),
          review: rv
            ? {
                id: rv.id,
                decision: rv.decision,
                score: rv.score,
                feedback: rv.feedback,
                reviewer: person(rv.rv_id, rv.rv_name, rv.rv_full),
                reviewedAt: isoReq(rv.reviewed_at),
              }
            : null,
        };
      });
    const openSwaps = swaps
      .filter((s) => s.assignment_id === r.id)
      .map((s) => ({ id: s.id, status: s.status as SwapStatus, from: person(s.f_id, s.f_name, s.f_full), to: person(s.t_id, s.t_name, s.t_full) }));
    const startsAt = new Date(r.starts_at).getTime();
    const endsAt = new Date(r.ends_at).getTime();
    const opens = startsAt - st.beforeMin * 60e3;
    const closes = endsAt + st.afterMin * 60e3;
    const status = r.status as DutyStatus;
    const isMine = !!v.me && mem.some((m) => m.id === v.me);
    const reworkDue = r.rework_due_at ? new Date(r.rework_due_at).getTime() : null;
    const canCheckin =
      isMine &&
      v.checkin &&
      ((status === "scheduled" && now >= opens && now <= closes) || (status === "rework_required" && reworkDue !== null && now <= reworkDue));
    return {
      id: r.id,
      rosterId: r.roster_id,
      date: r.duty_date,
      area: { id: r.area_id, code: r.area_code, name: r.area_name, icon: r.area_icon, minAssignees: r.min_assignees, isWholeHouse: r.is_whole_house },
      shift: { id: r.shift_id, code: r.shift_code, name: r.shift_name, start: r.shift_start, end: r.shift_end, label: shiftLabel(r.shift_name, r.shift_start) },
      roomCode: r.room_code,
      roomName: r.room_name,
      status,
      statusReason: r.status_reason,
      attemptCount: r.attempt_count,
      reworkDueAt: iso(r.rework_due_at),
      startsAt: isoReq(r.starts_at),
      endsAt: isoReq(r.ends_at),
      checkinOpensAt: new Date(opens).toISOString(),
      checkinClosesAt: new Date(closes).toISOString(),
      members: mem,
      checklist,
      checkins: cks,
      openSwaps,
      isMine,
      canCheckin,
      canReview: v.review && !isMine && status === "checked_in",
      canSwap:
        isMine &&
        v.swapRequest &&
        status === "scheduled" &&
        now < startsAt - st.noticeH * 3600e3 &&
        !openSwaps.some((s) => s.from.id === v.me),
      canManage: v.manage && status === "scheduled",
    };
  });
}

export async function getDutyWeek(tx: Tx, anyDate: string): Promise<DutyWeekDto> {
  const v = await viewer(tx);
  const weekStart = mondayOf(anyDate || v.today);
  const ro = (
    await tx.query(
      "SELECT id, week_start::text AS week_start, status::text AS status, published_at, notes FROM duty_rosters WHERE week_start = $1",
      [weekStart]
    )
  ).rows[0];
  let assignments: DutyAssignmentDto[] = [];
  if (ro) {
    const rows = (
      await tx.query(`${ASSIGNMENT_SELECT} WHERE a.roster_id = $1 ORDER BY a.duty_date, s.sort_order, s.start_time, ca.sort_order`, [ro.id])
    ).rows;
    assignments = await loadAssignmentDetails(tx, rows, v);
  }
  const roster: DutyRosterDto = {
    id: ro?.id ?? null,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    status: ro?.status ?? "none",
    publishedAt: iso(ro?.published_at),
    notes: ro?.notes ?? null,
    assignments,
  };
  const prev = (
    await tx.query<{ w: string | null }>("SELECT max(week_start)::text AS w FROM duty_rosters WHERE week_start < $1", [weekStart])
  ).rows[0].w;
  const st = await dutySettings(tx);
  return {
    today: v.today,
    now: v.now.toISOString(),
    roster,
    areas: await listAreas(tx),
    shifts: await listShifts(tx),
    previousRosterWeek: prev,
    settings: { swapMinNoticeHours: st.noticeH, reworkWindowHours: st.reworkH },
  };
}

export async function getAssignment(tx: Tx, id: string): Promise<DutyAssignmentDto> {
  const v = await viewer(tx);
  const rows = (await tx.query(`${ASSIGNMENT_SELECT} WHERE a.id = $1`, [id])).rows;
  if (!rows.length) throw notFound("Không tìm thấy ca trực.");
  return (await loadAssignmentDetails(tx, rows, v))[0];
}

/** Hợp đồng cho Tổng quan/Sidebar. Chỉ roster đã công bố. */
export async function getDutySummary(tx: Tx): Promise<DutySummaryDto> {
  const v = await viewer(tx);
  const rows = (
    await tx.query(
      `SELECT a.id, a.duty_date::text AS duty_date, a.status::text AS status, ca.name AS area, COALESCE(ca.icon, '🧹') AS icon,
              s.name AS shift_name, to_char(s.start_time, 'HH24:MI') AS shift_start,
              COALESCE((SELECT array_agg(m.display_name ORDER BY (dam.member_role = 'lead') DESC, m.display_name)
                          FROM duty_assignment_members dam JOIN members m ON m.id = dam.member_id
                         WHERE dam.assignment_id = a.id), '{}') AS members
         FROM duty_assignments a
         JOIN duty_rosters ro ON ro.id = a.roster_id AND ro.status <> 'draft'
         JOIN cleaning_areas ca ON ca.id = a.area_id
         JOIN duty_shifts s ON s.id = a.shift_id
        WHERE a.duty_date IN (app.local_today(), app.local_today() + 1) AND a.status <> 'cancelled'
        ORDER BY a.duty_date, s.sort_order, s.start_time, ca.sort_order`
    )
  ).rows;
  const item = (r: Row): DutySummaryItemDto => ({
    assignmentId: r.id,
    date: r.duty_date,
    area: r.area,
    areaIcon: r.icon,
    shift: shiftLabel(r.shift_name, r.shift_start),
    members: r.members,
    status: r.status,
  });
  const tomorrow = addDays(v.today, 1);
  const next = v.me
    ? (
        await tx.query(
          `SELECT a.id, a.duty_date::text AS duty_date, ca.name AS area, s.name AS shift_name, to_char(s.start_time, 'HH24:MI') AS shift_start
             FROM duty_assignments a
             JOIN duty_rosters ro ON ro.id = a.roster_id AND ro.status <> 'draft'
             JOIN duty_assignment_members dam ON dam.assignment_id = a.id AND dam.member_id = $1
             JOIN cleaning_areas ca ON ca.id = a.area_id
             JOIN duty_shifts s ON s.id = a.shift_id
            WHERE (a.status = 'scheduled' AND upper(app.shift_window(a.duty_date, a.shift_id)) > now())
               OR (a.status = 'rework_required' AND a.rework_due_at > now())
            ORDER BY lower(app.shift_window(a.duty_date, a.shift_id))
            LIMIT 1`,
          [v.me]
        )
      ).rows[0]
    : null;
  const counts = (
    await tx.query(
      `SELECT (SELECT count(*) FROM maintenance_issues WHERE status IN ('new', 'in_progress', 'waiting_parts'))::int AS open_issues,
              (SELECT count(*) FROM duty_assignments a JOIN duty_rosters ro ON ro.id = a.roster_id AND ro.status <> 'draft'
                WHERE a.status = 'checked_in'
                  AND (NOT $1 OR NOT EXISTS (SELECT 1 FROM duty_assignment_members dam
                                              WHERE dam.assignment_id = a.id AND dam.member_id = $2)))::int AS pending_reviews`,
      [v.review, v.me]
    )
  ).rows[0];
  const weekly = await dutyWeekBriefs(tx);
  return {
    today: rows.filter((r) => r.duty_date === v.today).map(item),
    tomorrow: rows.filter((r) => r.duty_date === tomorrow).map(item),
    myNext: next ? { assignmentId: next.id, date: next.duty_date, area: next.area, shift: shiftLabel(next.shift_name, next.shift_start) } : null,
    openIssuesCount: counts.open_issues,
    pendingReviewsCount: weekly.pendingReviews ?? counts.pending_reviews,
    thisWeek: weekly.thisWeek,
    myNextWeek: weekly.myNextWeek,
  };
}

// ---------------------------------------------------------------------
// Roster & phân công (duty.manage — RLS duty_rosters/duty_assignments__write)
// ---------------------------------------------------------------------
async function rosterIdForWeek(tx: Tx, weekStart: string): Promise<{ id: string; status: string } | null> {
  return (await tx.query("SELECT id, status::text AS status FROM duty_rosters WHERE week_start = $1", [weekStart])).rows[0] ?? null;
}

async function insertRoster(tx: Tx, weekStart: string, notes: string | null): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO duty_rosters (academic_year_id, week_start, notes, created_by)
     VALUES ((SELECT id FROM academic_years WHERE is_current LIMIT 1), $1, $2, app.current_user_id()) RETURNING id`,
    [weekStart, notes]
  );
  return r.rows[0].id;
}

export async function createRoster(
  tx: Tx,
  i: { weekStart: string; notes?: string | null; copyFromWeek?: string | null }
): Promise<{ rosterId: string; copied: number; skipped: string[] }> {
  const weekStart = mondayOf(i.weekStart);
  if (await rosterIdForWeek(tx, weekStart)) throw conflict("Tuần này đã có roster trực nhật.", "ROSTER_EXISTS");
  const rosterId = await insertRoster(tx, weekStart, i.notes ?? null);
  let copied = 0;
  const skipped: string[] = [];
  if (i.copyFromWeek) {
    const srcWeek = mondayOf(i.copyFromWeek);
    const src = await rosterIdForWeek(tx, srcWeek);
    if (!src) throw notFound("Không tìm thấy roster nguồn để sao chép.");
    const offset = Math.round((Date.parse(weekStart) - Date.parse(srcWeek)) / 86400e3);
    const list = (
      await tx.query(
        `SELECT a.id, a.area_id, a.shift_id, a.duty_date::text AS duty_date, a.room_id, ca.name AS area_name
           FROM duty_assignments a JOIN cleaning_areas ca ON ca.id = a.area_id
          WHERE a.roster_id = $1 AND a.status <> 'cancelled' ORDER BY a.duty_date`,
        [src.id]
      )
    ).rows;
    for (const a of list) {
      const date = addDays(a.duty_date, offset);
      const n = (
        await tx.query<{ id: string }>(
          `INSERT INTO duty_assignments (roster_id, area_id, shift_id, duty_date, room_id, created_by)
           VALUES ($1, $2, $3, $4, $5, app.current_user_id()) RETURNING id`,
          [rosterId, a.area_id, a.shift_id, date, a.room_id]
        )
      ).rows[0];
      copied++;
      const mem = (
        await tx.query(
          `SELECT dam.member_id, dam.member_role, m.display_name FROM duty_assignment_members dam
             JOIN members m ON m.id = dam.member_id WHERE dam.assignment_id = $1`,
          [a.id]
        )
      ).rows;
      for (const m of mem) {
        // Thành viên đã rời nhà / báo bận / trùng ca: bỏ qua người đó, giữ phần còn lại
        await tx.query("SAVEPOINT copy_member");
        try {
          await tx.query(
            `INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id, member_role, added_by)
             VALUES ($1, $2, $3, $4, $5, app.current_user_id())`,
            [n.id, date, a.shift_id, m.member_id, m.member_role]
          );
          await tx.query("RELEASE SAVEPOINT copy_member");
        } catch {
          await tx.query("ROLLBACK TO SAVEPOINT copy_member");
          skipped.push(`${m.display_name} (${a.area_name} ${date.slice(8, 10)}/${date.slice(5, 7)})`);
        }
      }
    }
  }
  return { rosterId, copied, skipped };
}

export async function publishRoster(tx: Tx, rosterId: string): Promise<{ count: number; memberIds: string[]; weekStart: string }> {
  const n = (await tx.query<{ n: number }>("SELECT app.fn_publish_roster($1) AS n", [rosterId])).rows[0].n;
  const info = (
    await tx.query(
      `SELECT r.week_start::text AS week_start,
              COALESCE(array_agg(DISTINCT dam.member_id) FILTER (WHERE dam.member_id IS NOT NULL), '{}') AS members
         FROM duty_rosters r
         LEFT JOIN duty_assignments a ON a.roster_id = r.id
         LEFT JOIN duty_assignment_members dam ON dam.assignment_id = a.id
        WHERE r.id = $1 GROUP BY r.week_start`,
      [rosterId]
    )
  ).rows[0];
  return { count: Number(n), memberIds: info?.members ?? [], weekStart: info?.week_start ?? "" };
}

/**
 * Xóa roster NHÁP chưa có ca nào. Ca trực đã tạo không xóa được (nhật ký trạng thái duty_status_history là bất biến)
 * — bỏ ca khỏi roster bằng "Hủy ca".
 */
export async function deleteDraftRoster(tx: Tx, rosterId: string) {
  const r = (
    await tx.query("SELECT status::text AS status, (SELECT count(*)::int FROM duty_assignments a WHERE a.roster_id = $1) AS n FROM duty_rosters WHERE id = $1", [rosterId])
  ).rows[0];
  if (!r) throw notFound("Không tìm thấy roster.");
  if (r.status !== "draft") throw new ApiError(422, "ROSTER_PUBLISHED", "Roster đã công bố — không xóa được, chỉ hủy từng ca.");
  if (r.n > 0) throw new ApiError(422, "ROSTER_HAS_DUTIES", "Roster đã có ca trực (lịch sử ca được lưu bất biến) — hãy hủy hoặc sửa từng ca thay vì xóa cả tuần.");
  const d = await tx.query("DELETE FROM duty_rosters WHERE id = $1", [rosterId]);
  if (!d.rowCount) throw forbidden("Bạn không có quyền xóa roster.");
}

export interface AssignmentInput {
  date: string;
  areaId: string;
  shiftId: string;
  roomCode?: string | null;
  memberIds: string[];
  overrideReason?: string | null;
}

async function checkMemberSlotConflicts(tx: Tx, date: string, shiftId: string, memberIds: string[], exceptAssignment: string | null) {
  if (!memberIds.length) return;
  const busy = (
    await tx.query(
      `SELECT m.display_name, ca.name AS area FROM duty_assignment_members dam
         JOIN members m ON m.id = dam.member_id
         JOIN duty_assignments a ON a.id = dam.assignment_id
         JOIN cleaning_areas ca ON ca.id = a.area_id
        WHERE dam.duty_date = $1 AND dam.shift_id = $2 AND dam.member_id = ANY($3::uuid[])
          AND ($4::uuid IS NULL OR dam.assignment_id <> $4)`,
      [date, shiftId, memberIds, exceptAssignment]
    )
  ).rows;
  if (busy.length) {
    throw conflict(
      `${busy.map((b) => `${b.display_name} (đang trực ${b.area})`).join(", ")} đã có ca khác cùng ngày, cùng ca.`,
      "BR-DUTY-04"
    );
  }
}

async function addMembers(tx: Tx, assignmentId: string, date: string, shiftId: string, memberIds: string[], overrideReason: string | null, firstIsLead: boolean) {
  let idx = 0;
  for (const mid of memberIds) {
    await tx.query(
      `INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id, member_role, override_reason, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, app.current_user_id())`,
      [assignmentId, date, shiftId, mid, firstIsLead && idx === 0 ? "lead" : "member", overrideReason]
    );
    idx++;
  }
}

export async function createAssignment(tx: Tx, i: AssignmentInput): Promise<string> {
  const weekStart = mondayOf(i.date);
  let ro = await rosterIdForWeek(tx, weekStart);
  if (!ro) ro = { id: await insertRoster(tx, weekStart, null), status: "draft" };
  if (ro.status === "closed") throw new ApiError(422, "ROSTER_CLOSED", "Roster tuần này đã khóa.");
  const dup = (
    await tx.query<{ status: string }>("SELECT status::text AS status FROM duty_assignments WHERE duty_date = $1 AND area_id = $2 AND shift_id = $3", [i.date, i.areaId, i.shiftId])
  ).rows[0];
  if (dup) {
    throw conflict(
      dup.status === "cancelled"
        ? "Khu vực này từng có ca vào đúng ngày/ca đã chọn nhưng đã bị hủy (lịch sử được giữ) — hãy chọn ca hoặc khu vực khác."
        : "Khu vực này đã có ca trực vào đúng ngày và ca đã chọn — hãy sửa ca đó thay vì tạo mới.",
      "DUTY_SLOT_TAKEN"
    );
  }
  const memberIds = [...new Set(i.memberIds)];
  await checkMemberSlotConflicts(tx, i.date, i.shiftId, memberIds, null);
  const room = i.roomCode
    ? (await tx.query<{ id: string }>("SELECT id FROM rooms WHERE code = $1 AND deleted_at IS NULL", [i.roomCode])).rows[0]?.id ?? null
    : null;
  const a = (
    await tx.query<{ id: string }>(
      `INSERT INTO duty_assignments (roster_id, area_id, shift_id, duty_date, room_id, created_by)
       VALUES ($1, $2, $3, $4, $5, app.current_user_id()) RETURNING id`,
      [ro.id, i.areaId, i.shiftId, i.date, room]
    )
  ).rows[0];
  await addMembers(tx, a.id, i.date, i.shiftId, memberIds, i.overrideReason?.trim() || null, true);
  return a.id;
}

/** Sửa ca chưa check-in: người trực, phòng phụ trách, hoặc dời sang ngày/ca/khu vực khác trong cùng tuần (BR-DUTY-06). */
export async function updateAssignment(
  tx: Tx,
  id: string,
  i: { memberIds?: string[]; roomCode?: string | null; overrideReason?: string | null; date?: string; areaId?: string; shiftId?: string }
): Promise<{ added: string[] }> {
  const a = (
    await tx.query("SELECT id, duty_date::text AS duty_date, area_id, shift_id, status::text AS status FROM duty_assignments WHERE id = $1", [id])
  ).rows[0];
  if (!a) throw notFound("Không tìm thấy ca trực.");
  if (a.status !== "scheduled") throw new ApiError(422, "BR-DUTY-07", "Ca đã check-in/có kết quả — không đổi người trực ngoài quy trình đổi ca.");
  const date = i.date ?? a.duty_date;
  const areaId = i.areaId ?? a.area_id;
  const shiftId = i.shiftId ?? a.shift_id;
  const moved = date !== a.duty_date || areaId !== a.area_id || shiftId !== a.shift_id;

  const cur = (await tx.query<{ member_id: string }>("SELECT member_id FROM duty_assignment_members WHERE assignment_id = $1", [id])).rows.map((r) => r.member_id);
  const want = i.memberIds ? [...new Set(i.memberIds)] : cur;
  const remove = cur.filter((m) => !want.includes(m));
  const added = want.filter((m) => !cur.includes(m));

  if (moved) {
    const dup = (
      await tx.query("SELECT 1 FROM duty_assignments WHERE duty_date = $1 AND area_id = $2 AND shift_id = $3 AND id <> $4", [date, areaId, shiftId, id])
    ).rowCount;
    if (dup) throw conflict("Khu vực đã có ca trực vào ngày/ca muốn dời tới.", "DUTY_SLOT_TAKEN");
  }
  await checkMemberSlotConflicts(tx, date, shiftId, moved ? want : added, id);

  if (remove.length) {
    const d = await tx.query("DELETE FROM duty_assignment_members WHERE assignment_id = $1 AND member_id = ANY($2::uuid[])", [id, remove]);
    if (d.rowCount !== remove.length) throw forbidden("Bạn không có quyền đổi người trực.");
  }
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (moved) {
    vals.push(date, areaId, shiftId);
    sets.push("duty_date = $2", "area_id = $3", "shift_id = $4");
  }
  if (i.roomCode !== undefined) {
    const room = i.roomCode
      ? (await tx.query<{ id: string }>("SELECT id FROM rooms WHERE code = $1 AND deleted_at IS NULL", [i.roomCode])).rows[0]?.id ?? null
      : null;
    vals.push(room);
    sets.push(`room_id = $${vals.length}`);
  }
  if (sets.length) {
    // Người trực đi theo nhờ FK (assignment_id, duty_date, shift_id) ON UPDATE CASCADE
    const r = await tx.query(`UPDATE duty_assignments SET ${sets.join(", ")} WHERE id = $1`, vals);
    if (!r.rowCount) throw forbidden("Bạn không có quyền sửa ca trực.");
  }
  await addMembers(tx, id, date, shiftId, added, i.overrideReason?.trim() || null, want.length > 0 && cur.length - remove.length === 0);
  return { added };
}

/**
 * Hủy ca chưa check-in (status → cancelled, bắt buộc lý do; roster nháp tự điền lý do). Không xóa dòng: nhật ký trạng thái bất biến.
 * Người trực được giữ nguyên trên ca đã hủy (fn_publish_roster vẫn đếm đủ người cho mọi ca của roster).
 */
export async function cancelAssignment(tx: Tx, id: string, reason: string | null): Promise<"cancelled"> {
  const a = (
    await tx.query("SELECT a.status::text AS status, r.status::text AS roster_status FROM duty_assignments a JOIN duty_rosters r ON r.id = a.roster_id WHERE a.id = $1", [id])
  ).rows[0];
  if (!a) throw notFound("Không tìm thấy ca trực.");
  if (a.status !== "scheduled") throw new ApiError(422, "DUTY_NOT_SCHEDULED", "Chỉ hủy được ca chưa check-in.");
  const why = reason?.trim() || (a.roster_status === "draft" ? "Bỏ khỏi roster nháp" : "");
  if (why.length < 3) throw new ApiError(400, "VALIDATION_FAILED", "Nhập lý do hủy ca (roster đã công bố, mọi người đã thấy lịch).");
  await tx.query("SELECT set_config('app.status_reason', $1, true)", [why]);
  const r = await tx.query("UPDATE duty_assignments SET status = 'cancelled', status_reason = $2 WHERE id = $1", [id, why]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền hủy ca trực.");
  return "cancelled";
}

// ---------------------------------------------------------------------
// Check-in: duty_checkins + checkin_items + media_attachments trong CÙNG transaction (BR-DUTY-09 kiểm cuối tx)
// ---------------------------------------------------------------------
export async function checkIn(
  tx: Tx,
  assignmentId: string,
  i: { fileId: string; doneItemIds: string[]; note?: string | null; clientCapturedAt?: string | null }
): Promise<{ checkinId: string; memberIds: string[] }> {
  await requireMember(tx);
  const a = (await tx.query("SELECT id FROM duty_assignments WHERE id = $1", [assignmentId])).rows[0];
  if (!a) throw notFound("Không tìm thấy ca trực.");
  const id = (await tx.query<{ id: string }>("SELECT app.uuid_v7() AS id")).rows[0].id;
  // attempt / checked_in_at / is_late do trigger trg_duty_checkins__rules đặt theo giờ máy chủ
  await tx.query(
    `INSERT INTO duty_checkins (id, assignment_id, attempt, checked_in_by_member_id, evidence_file_id, note, client_captured_at)
     VALUES ($1, $2, 1, app.current_member_id(), $3, $4, $5)`,
    [id, assignmentId, i.fileId, i.note?.trim() || null, i.clientCapturedAt ?? null]
  );
  await tx.query(
    `INSERT INTO checkin_items (checkin_id, template_item_id, is_done)
     SELECT $1, it.id, it.id = ANY($3::uuid[])
       FROM checklist_template_items it
       JOIN duty_assignments a ON a.checklist_template_id = it.template_id
      WHERE a.id = $2`,
    [id, assignmentId, i.doneItemIds]
  );
  // Kiểm ngay tiêu chí bắt buộc (thay vì đợi COMMIT) để trả lỗi rõ ràng
  await tx.query("SET CONSTRAINTS trg_duty_checkins__required_items IMMEDIATE");
  // Gắn ảnh vào check-in ⇒ người nghiệm thu/người cùng ca xem được ảnh (RLS storage_files qua media_attachments)
  await tx.query(
    `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by)
     VALUES ($1, 'duty_checkin', $2, 'evidence', app.current_user_id())`,
    [i.fileId, id]
  );
  const memberIds = (await tx.query<{ member_id: string }>("SELECT member_id FROM duty_assignment_members WHERE assignment_id = $1", [assignmentId])).rows.map(
    (r) => r.member_id
  );
  return { checkinId: id, memberIds };
}

export async function reviewAssignment(
  tx: Tx,
  assignmentId: string,
  i: { decision: "approved" | "rework"; score?: number | null; feedback?: string | null }
): Promise<{ memberIds: string[]; label: string }> {
  await requireMember(tx);
  const can = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('duty.review') AS ok")).rows[0].ok;
  if (!can) throw forbidden("Bạn không có quyền nghiệm thu ca trực.");
  const c = (
    await tx.query(
      `SELECT c.id, ca.name AS area, a.duty_date::text AS duty_date FROM duty_assignments a
         JOIN cleaning_areas ca ON ca.id = a.area_id
         LEFT JOIN duty_checkins c ON c.assignment_id = a.id AND c.attempt = a.attempt_count
        WHERE a.id = $1`,
      [assignmentId]
    )
  ).rows[0];
  if (!c) throw notFound("Không tìm thấy ca trực.");
  if (!c.id) throw new ApiError(422, "NO_CHECKIN", "Ca này chưa có check-in để nghiệm thu.");
  await tx.query(
    `INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score, feedback)
     VALUES ($1, app.current_member_id(), $2::review_decision_t, $3, $4)`,
    [c.id, i.decision, i.score ?? null, i.feedback?.trim() || null]
  );
  const memberIds = (await tx.query<{ member_id: string }>("SELECT member_id FROM duty_assignment_members WHERE assignment_id = $1", [assignmentId])).rows.map(
    (r) => r.member_id
  );
  return { memberIds, label: `${c.area} ${c.duty_date.slice(8, 10)}/${c.duty_date.slice(5, 7)}` };
}

// ---------------------------------------------------------------------
// Đổi ca 3 bước
// ---------------------------------------------------------------------
export async function listSwaps(tx: Tx): Promise<DutySwapsDto> {
  const v = await viewer(tx);
  const st = await dutySettings(tx);
  const upcoming: MyUpcomingDutyDto[] = [];
  if (v.me) {
    const rows = (
      await tx.query(
        `${ASSIGNMENT_SELECT}
          JOIN duty_rosters ro ON ro.id = a.roster_id AND ro.status <> 'draft'
          JOIN duty_assignment_members me ON me.assignment_id = a.id AND me.member_id = $1
         WHERE a.status = 'scheduled' AND lower(app.shift_window(a.duty_date, a.shift_id)) > now()
           AND a.duty_date <= app.local_today() + 21
         ORDER BY lower(app.shift_window(a.duty_date, a.shift_id))`,
        [v.me]
      )
    ).rows;
    const details = await loadAssignmentDetails(tx, rows, v);
    for (const d of details) {
      const tooLate = v.now.getTime() >= new Date(d.startsAt).getTime() - st.noticeH * 3600e3;
      const pending = d.openSwaps.some((s) => s.from.id === v.me);
      upcoming.push({
        assignmentId: d.id,
        date: d.date,
        area: { name: d.area.name, icon: d.area.icon },
        shift: d.shift,
        startsAt: d.startsAt,
        members: d.members,
        swappable: !tooLate && !pending && v.swapRequest,
        blockedReason: pending ? "Đã có đơn đổi ca đang chờ" : tooLate ? `Còn dưới ${st.noticeH} giờ trước ca` : null,
      });
    }
  }
  const reqs = (
    await tx.query(
      `SELECT s.id, s.assignment_id, s.reason, s.status::text AS status, s.created_at, s.expires_at, s.peer_responded_at,
              s.admin_decided_at, s.admin_note, a.duty_date::text AS duty_date,
              ca.name AS area_name, COALESCE(ca.icon, '🧹') AS area_icon,
              sh.id AS shift_id, sh.code AS shift_code, sh.name AS shift_name,
              to_char(sh.start_time, 'HH24:MI') AS shift_start, to_char(sh.end_time, 'HH24:MI') AS shift_end,
              fm.id AS f_id, fm.display_name AS f_name, fm.full_name AS f_full,
              tm.id AS t_id, tm.display_name AS t_name, tm.full_name AS t_full,
              EXISTS (SELECT 1 FROM duty_assignment_members dam WHERE dam.assignment_id = s.assignment_id AND dam.member_id = $1) AS i_am_in
         FROM duty_swap_requests s
         JOIN duty_assignments a ON a.id = s.assignment_id
         JOIN cleaning_areas ca ON ca.id = a.area_id
         JOIN duty_shifts sh ON sh.id = a.shift_id
         JOIN members fm ON fm.id = s.from_member_id
         JOIN members tm ON tm.id = s.to_member_id
        WHERE s.status IN ('pending_peer', 'pending_admin') OR s.updated_at > now() - interval '14 days'
        ORDER BY (s.status IN ('pending_peer', 'pending_admin')) DESC, s.created_at DESC
        LIMIT 60`,
      [v.me]
    )
  ).rows;
  const now = v.now.getTime();
  const requests: DutySwapDto[] = reqs.map((s) => {
    const live = new Date(s.expires_at).getTime() > now;
    return {
      id: s.id,
      assignmentId: s.assignment_id,
      date: s.duty_date,
      area: { name: s.area_name, icon: s.area_icon },
      shift: { id: s.shift_id, code: s.shift_code, name: s.shift_name, start: s.shift_start, end: s.shift_end, label: shiftLabel(s.shift_name, s.shift_start) },
      from: { id: s.f_id, name: s.f_name, fullName: s.f_full },
      to: { id: s.t_id, name: s.t_name, fullName: s.t_full },
      reason: s.reason,
      status: s.status,
      createdAt: isoReq(s.created_at),
      expiresAt: isoReq(s.expires_at),
      peerRespondedAt: iso(s.peer_responded_at),
      adminDecidedAt: iso(s.admin_decided_at),
      adminNote: s.admin_note,
      canRespond: s.status === "pending_peer" && s.t_id === v.me && live,
      canCancel: (s.status === "pending_peer" || s.status === "pending_admin") && s.f_id === v.me,
      canDecide: s.status === "pending_admin" && v.swapApprove && s.f_id !== v.me && s.t_id !== v.me && !s.i_am_in,
    };
  });
  return { upcoming, requests, minNoticeHours: st.noticeH };
}

export async function requestSwap(tx: Tx, i: { assignmentId: string; toMemberId: string; reason: string }) {
  const me = await requireMember(tx);
  if (me === i.toMemberId) throw new ApiError(400, "VALIDATION_FAILED", "Hãy chọn một thành viên khác để nhờ đổi ca.");
  const a = (await tx.query("SELECT duty_date::text AS duty_date, shift_id FROM duty_assignments WHERE id = $1", [i.assignmentId])).rows[0];
  if (!a) throw notFound("Không tìm thấy ca trực.");
  const busy = (
    await tx.query(
      `SELECT ca.name FROM duty_assignment_members dam JOIN duty_assignments x ON x.id = dam.assignment_id
         JOIN cleaning_areas ca ON ca.id = x.area_id
        WHERE dam.member_id = $1 AND dam.duty_date = $2 AND dam.shift_id = $3 AND dam.assignment_id <> $4`,
      [i.toMemberId, a.duty_date, a.shift_id, i.assignmentId]
    )
  ).rows[0];
  if (busy) throw conflict(`Người nhận đã có ca trực "${busy.name}" cùng ngày, cùng ca — hãy chọn người khác.`, "BR-DUTY-04");
  const r = (await tx.query<{ id: string }>("SELECT app.fn_request_duty_swap($1, $2, $3) AS id", [i.assignmentId, i.toMemberId, i.reason.trim()])).rows[0];
  return r.id;
}

async function swapParties(tx: Tx, id: string) {
  return (
    await tx.query(
      `SELECT s.from_member_id, s.to_member_id, s.status::text AS status, ca.name AS area, a.duty_date::text AS duty_date
         FROM duty_swap_requests s JOIN duty_assignments a ON a.id = s.assignment_id JOIN cleaning_areas ca ON ca.id = a.area_id
        WHERE s.id = $1`,
      [id]
    )
  ).rows[0] as { from_member_id: string; to_member_id: string; status: string; area: string; duty_date: string } | undefined;
}

export async function respondSwap(tx: Tx, id: string, accept: boolean, note: string | null) {
  await tx.query("SELECT app.fn_peer_respond_duty_swap($1, $2, $3)", [id, accept, note]);
  return swapParties(tx, id);
}

export async function decideSwap(tx: Tx, id: string, approve: boolean, note: string | null) {
  await tx.query("SELECT app.fn_admin_decide_duty_swap($1, $2, $3)", [id, approve, note]);
  return swapParties(tx, id);
}

export async function cancelSwap(tx: Tx, id: string) {
  const r = await tx.query("UPDATE duty_swap_requests SET status = 'cancelled' WHERE id = $1 AND status IN ('pending_peer', 'pending_admin')", [id]);
  if (!r.rowCount) {
    const s = (await tx.query("SELECT status::text AS status FROM duty_swap_requests WHERE id = $1", [id])).rows[0];
    if (!s) throw notFound("Không tìm thấy đơn đổi ca.");
    throw new ApiError(s.status === "pending_peer" || s.status === "pending_admin" ? 403 : 422, "SWAP_CANNOT_CANCEL", "Chỉ người xin đổi mới rút được đơn đang chờ.");
  }
}

// ---------------------------------------------------------------------
// Tác vụ nền "lười" + thông báo (vai trò luuxa_worker — bước hệ thống tin cậy)
// ---------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __luuxaDutyJobsAt: number | undefined;
}

/**
 * Thiết kế giao cho worker chạy định kỳ app.fn_mark_missed_duties() (bỏ ca quá hạn). Trên Vercel không có tiến trình nền
 * nên phân hệ chạy hàm này tối đa 10 phút/lần khi có người mở trang.
 */
export async function runDutyJobs(ctx: Ctx) {
  const now = Date.now();
  if (globalThis.__luuxaDutyJobsAt && now - globalThis.__luuxaDutyJobsAt < 10 * 60_000) return;
  globalThis.__luuxaDutyJobsAt = now;
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      await tx.query("SELECT set_config('app.current_user_id', '', true)"); // tiến trình hệ thống, không mạo danh người đang xem
      await tx.query("SELECT app.fn_mark_missed_duties()");
    });
  } catch (e) {
    console.error("[duty] tác vụ nền lỗi:", (e as Error).message);
  }
}

/** Thông báo trong ứng dụng (app.fn_notify — outbox giao dịch). Lỗi gửi không làm hỏng thao tác chính. */
export async function notifyMembers(
  ctx: Ctx,
  memberIds: (string | null | undefined)[],
  type: string,
  title: string,
  body: string,
  entity?: { table: string; id: string }
) {
  const ids = [...new Set(memberIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const me = (await tx.query<{ m: string | null }>("SELECT m.id AS m FROM members m WHERE m.user_id = $1", [ctx.userId])).rows[0]?.m;
      for (const id of ids) {
        if (id === me) continue;
        await tx.query("SELECT app.fn_notify($1, $2, $3, $4, '{}'::jsonb, $5, $6)", [id, type, title, body, entity?.table ?? null, entity?.id ?? null]);
      }
    });
  } catch (e) {
    console.error("[duty] gửi thông báo lỗi:", (e as Error).message);
  }
}

/** Thông báo cho mọi thành viên đang giữ một trong các vai trò (trừ người thao tác và danh sách loại trừ). */
export async function notifyRoles(
  ctx: Ctx,
  roles: string[],
  type: string,
  title: string,
  body: string,
  entity?: { table: string; id: string },
  exclude: string[] = []
) {
  try {
    const ids = await ctx.dbAs("luuxa_worker", async (tx) =>
      (
        await tx.query<{ id: string }>(
          `SELECT DISTINCT m.id FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id AND r.code = ANY($1::text[])
             JOIN members m ON m.user_id = ur.user_id AND m.deleted_at IS NULL AND m.status = 'active'
            WHERE ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())`,
          [roles]
        )
      ).rows.map((r) => r.id)
    );
    await notifyMembers(ctx, ids.filter((id) => !exclude.includes(id)), type, title, body, entity);
  } catch (e) {
    console.error("[duty] gửi thông báo lỗi:", (e as Error).message);
  }
}
