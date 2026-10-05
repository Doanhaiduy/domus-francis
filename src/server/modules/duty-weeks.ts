import "server-only";
import type { Tx } from "../db";
import { badRequest, notFound } from "../errors";
import { addDays, mondayOf } from "@/lib/duty-format";
import type { DutyBoardDto, DutyCandidateDto, DutyWeekBriefDto, DutyWeekEntryDto, DutyWeekMemberDto } from "@/lib/types/duty";
import { DUTY_WEEK_MAX_MEMBERS } from "@/lib/types/duty";

// =====================================================================
// Trực vệ sinh sân nhà theo tuần — luật ở DB (db/app/1010_duty_weeks.sql): app.fn_duty_week_save / _review / _remind / _delete.
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ROOM_JOIN = `LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                                 AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
                   LEFT JOIN rooms r ON r.id = ra.room_id`;

function toEntry(r: Row | null, weekStart: string, me: string | null): DutyWeekEntryDto {
  const members: DutyWeekMemberDto[] = (r?.members ?? []).map((m: Row) => ({
    id: m.id,
    name: m.name,
    fullName: m.full_name,
    room: m.room ?? null,
    avatarFileId: m.avatar ?? null,
  }));
  return {
    id: r?.id ?? null,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    members,
    note: r?.note ?? null,
    review:
      r && r.reviewed_at
        ? {
            score: Number(r.score),
            comment: r.review_comment ?? null,
            redoRequired: !!r.redo_required,
            redoNote: r.redo_note ?? null,
            reviewedAt: new Date(r.reviewed_at).toISOString(),
            reviewerName: r.reviewer_name ?? null,
          }
        : null,
    isMine: !!me && members.some((m) => m.id === me),
  };
}

const WEEK_SELECT = `
  SELECT w.id, w.week_start::text AS week_start, w.note, w.score, w.review_comment, w.redo_required, w.redo_note, w.reviewed_at,
         (SELECT mm.display_name FROM members mm WHERE mm.user_id = w.reviewed_by LIMIT 1) AS reviewer_name,
         COALESCE((SELECT json_agg(json_build_object('id', m.id, 'name', m.display_name, 'full_name', m.full_name, 'room', r.code, 'avatar', m.avatar_file_id)
                                   ORDER BY m.display_name)
                     FROM duty_week_members wm JOIN members m ON m.id = wm.member_id ${ROOM_JOIN}
                    WHERE wm.week_id = w.id), '[]'::json) AS members
    FROM duty_weeks w`;

/** Bảng trực: tuần đang xem + dòng thời gian các tuần đã có lịch (+ danh sách luân phiên cho người quản lý). */
export async function getDutyBoard(tx: Tx, weekParam: string | null): Promise<DutyBoardDto> {
  const v = (
    await tx.query(
      `SELECT app.current_member_id() AS me, app.local_today()::text AS today,
              app.has_permission('duty.manage') AS manage, app.has_permission('duty.review') AS review`,
    )
  ).rows[0];
  const thisWeekStart = mondayOf(v.today);
  const sel = weekParam ? mondayOf(weekParam) : thisWeekStart;
  const lo = addDays(sel < thisWeekStart ? sel : thisWeekStart, -84);
  const hi = addDays(sel > thisWeekStart ? sel : thisWeekStart, 35);
  const rows = (await tx.query(`${WEEK_SELECT} WHERE w.week_start BETWEEN $1::date AND $2::date ORDER BY w.week_start DESC`, [lo, hi])).rows;
  const byStart = new Map<string, Row>(rows.map((r) => [r.week_start, r]));
  const timeline = rows.map((r) => toEntry(r, r.week_start, v.me));

  let candidates: DutyCandidateDto[] = [];
  if (v.manage) {
    candidates = (
      await tx.query(
        `SELECT m.id, m.display_name, m.full_name, r.code AS room,
                (SELECT count(*) FROM duty_week_members wm JOIN duty_weeks w ON w.id = wm.week_id
                  WHERE wm.member_id = m.id AND w.week_start >= $1::date - 182)::int AS recent_count,
                (SELECT max(w.week_start)::text FROM duty_week_members wm JOIN duty_weeks w ON w.id = wm.week_id WHERE wm.member_id = m.id) AS last_week
           FROM members m ${ROOM_JOIN}
          WHERE m.deleted_at IS NULL AND m.status = 'active'
          ORDER BY recent_count, last_week NULLS FIRST, m.member_no`,
        [thisWeekStart],
      )
    ).rows.map((r) => ({ id: r.id, name: r.display_name, fullName: r.full_name, room: r.room ?? null, recentCount: r.recent_count, lastWeek: r.last_week ?? null }));
  }
  return {
    today: v.today,
    thisWeekStart,
    week: toEntry(byStart.get(sel) ?? null, sel, v.me),
    timeline,
    canManage: v.manage,
    canReview: v.review,
    candidates,
    peoplePerWeek: DUTY_WEEK_MAX_MEMBERS,
  };
}

export async function saveDutyWeek(tx: Tx, weekStart: string, memberIds: string[], note: string | null): Promise<string> {
  if (!memberIds.length) throw badRequest("Chọn ít nhất 1 người trực.");
  return (await tx.query<{ id: string }>("SELECT app.fn_duty_week_save($1::date, $2::uuid[], $3) AS id", [mondayOf(weekStart), memberIds, note])).rows[0].id;
}

export async function deleteDutyWeek(tx: Tx, id: string) {
  await tx.query("SELECT app.fn_duty_week_delete($1)", [id]);
}

export async function remindDutyWeek(tx: Tx, id: string): Promise<number> {
  return (await tx.query<{ n: number }>("SELECT app.fn_duty_week_remind($1) AS n", [id])).rows[0].n;
}

export async function reviewDutyWeek(
  tx: Tx,
  id: string,
  b: { score: number; comment: string | null; redo: boolean; redoNote: string | null },
) {
  await tx.query("SELECT app.fn_duty_week_review($1, $2, $3, $4, $5)", [id, b.score, b.comment, b.redo, b.redoNote]);
}

export async function dutyWeekEntryById(tx: Tx, id: string): Promise<DutyWeekEntryDto> {
  const me = (await tx.query<{ me: string | null }>("SELECT app.current_member_id() AS me")).rows[0].me;
  const r = (await tx.query(`${WEEK_SELECT} WHERE w.id = $1`, [id])).rows[0] ?? null;
  if (!r) throw notFound("Không tìm thấy tuần trực.");
  return toEntry(r, r.week_start, me);
}

/**
 * Tóm tắt cho Tổng quan: tuần trực hiện tại, lần trực sắp tới của tôi và số tuần đã qua chưa đánh giá (cho người có duty.review).
 * Đọc trong SAVEPOINT: nếu CSDL chưa áp migration 1010 thì trả rỗng thay vì làm hỏng cả trang Tổng quan.
 */
export async function dutyWeekBriefs(tx: Tx): Promise<{ thisWeek: DutyWeekBriefDto | null; myNextWeek: DutyWeekBriefDto | null; pendingReviews: number | null }> {
  await tx.query("SAVEPOINT duty_week_brief");
  try {
    const v = (await tx.query("SELECT app.current_member_id() AS me, app.local_today()::text AS today, app.has_permission('duty.review') AS review")).rows[0];
    const thisWeekStart = mondayOf(v.today);
    const rows = (
      await tx.query(
        `SELECT w.week_start::text AS week_start, w.score, w.redo_required,
                COALESCE((SELECT array_agg(m.display_name ORDER BY m.display_name) FROM duty_week_members wm JOIN members m ON m.id = wm.member_id WHERE wm.week_id = w.id), '{}') AS names,
                EXISTS (SELECT 1 FROM duty_week_members wm WHERE wm.week_id = w.id AND wm.member_id = $2) AS is_mine
           FROM duty_weeks w WHERE w.week_start BETWEEN $1::date AND $1::date + 7 ORDER BY w.week_start`,
        [thisWeekStart, v.me],
      )
    ).rows;
    const brief = (r: Row): DutyWeekBriefDto => ({
      weekStart: r.week_start,
      weekEnd: addDays(r.week_start, 6),
      members: r.names,
      isMine: r.is_mine,
      score: r.score === null ? null : Number(r.score),
      redoRequired: !!r.redo_required,
    });
    const thisRow = rows.find((r) => r.week_start === thisWeekStart);
    const mine = rows.find((r) => r.is_mine);
    const pending = v.review
      ? (await tx.query("SELECT count(*)::int AS n FROM duty_weeks w WHERE w.reviewed_at IS NULL AND w.week_start + 6 < app.local_today() AND EXISTS (SELECT 1 FROM duty_week_members wm WHERE wm.week_id = w.id)")).rows[0].n
      : null;
    await tx.query("RELEASE SAVEPOINT duty_week_brief");
    return { thisWeek: thisRow ? brief(thisRow) : null, myNextWeek: mine ? brief(mine) : null, pendingReviews: pending };
  } catch {
    await tx.query("ROLLBACK TO SAVEPOINT duty_week_brief");
    await tx.query("RELEASE SAVEPOINT duty_week_brief");
    return { thisWeek: null, myNextWeek: null, pendingReviews: null };
  }
}
