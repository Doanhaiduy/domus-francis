import "server-only";
import type { Tx } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { addDays, mondayOf } from "@/lib/duty-format";
import type {
  DutyBoardDto,
  DutyBulkResultDto,
  DutyCandidateDto,
  DutyHistoryDto,
  DutyPlanAction,
  DutyPlanDto,
  DutyWeekBriefDto,
  DutyWeekEntryDto,
  DutyWeekMemberDto,
} from "@/lib/types/duty";
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

// ---------------------------------------------------------------------
// Xếp lịch trực tự động nhiều tuần — CÙNG thứ tự công bằng với danh sách gợi ý của bảng trực (getDutyBoard → candidates):
//   số tuần đã trực tính từ 26 tuần trước tuần này (gồm cả các tuần sắp tới đã xếp) tăng dần → lần trực gần nhất cũ nhất (chưa từng trực
//   xếp trước) → số thứ tự thành viên. Mỗi tuần được xếp thì những người vừa chọn được cộng 1 lượt + đổi "lần gần nhất" rồi xếp lại thứ tự
//   cho tuần sau ⇒ trong N tuần không ai trực lần hai khi còn người cùng mức chưa trực.
// ---------------------------------------------------------------------
const FAIR_WINDOW_DAYS = 182;

async function requireDutyManager(tx: Tx): Promise<{ me: string | null; today: string; thisWeekStart: string }> {
  const v = (await tx.query("SELECT app.current_member_id() AS me, app.local_today()::text AS today, app.has_permission('duty.manage') AS manage")).rows[0];
  if (!v.manage) throw forbidden("Chỉ Trưởng nhà hoặc Admin mới được xếp lịch trực vệ sinh.");
  return { me: v.me, today: v.today, thisWeekStart: mondayOf(v.today) };
}

export async function planDutyWeeks(tx: Tx, q: { from?: string; weeks: number; overwrite: boolean }): Promise<DutyPlanDto> {
  const v = await requireDutyManager(tx);
  const from = q.from ? mondayOf(q.from) : v.thisWeekStart;
  if (from < v.thisWeekStart) throw badRequest("Chỉ xếp lịch từ tuần này trở đi.");
  const starts = Array.from({ length: q.weeks }, (_, i) => addDays(from, 7 * i));
  const last = starts[starts.length - 1];
  const cutoff = addDays(v.thisWeekStart, -FAIR_WINDOW_DAYS);

  const [weekRows, hist, cands] = await Promise.all([
    tx.query(`${WEEK_SELECT} WHERE w.week_start BETWEEN $1::date AND $2::date`, [from, last]),
    tx.query<{ ws: string; member_id: string }>("SELECT w.week_start::text AS ws, wm.member_id FROM duty_week_members wm JOIN duty_weeks w ON w.id = wm.week_id"),
    tx.query(
      `SELECT m.id, m.display_name, m.full_name, m.member_no, m.avatar_file_id, r.code AS room
         FROM members m ${ROOM_JOIN}
        WHERE m.deleted_at IS NULL AND m.status = 'active'`,
    ),
  ]);
  const existing = new Map<string, Row>(weekRows.rows.map((r) => [r.week_start, r]));
  const hasPeople = (r: Row | undefined) => !!r && Array.isArray(r.members) && r.members.length > 0;
  // Tuần sẽ bị thay người (ghi đè) ⇒ người đang xếp ở tuần đó không bị tính lượt
  const replaced = new Set(starts.filter((ws) => q.overwrite && hasPeople(existing.get(ws)) && !existing.get(ws)!.reviewed_at));

  const stats = new Map<string, { count: number; last: string | null }>(cands.rows.map((c) => [c.id as string, { count: 0, last: null }]));
  for (const h of hist.rows) {
    if (replaced.has(h.ws)) continue;
    const st = stats.get(h.member_id);
    if (!st) continue;
    if (h.ws >= cutoff) st.count++;
    if (!st.last || h.ws > st.last) st.last = h.ws;
  }
  const memberNo = new Map(cands.rows.map((c) => [c.id as string, Number(c.member_no)]));
  const fairOrder = () =>
    [...cands.rows].sort((a, b) => {
      const x = stats.get(a.id)!;
      const y = stats.get(b.id)!;
      if (x.count !== y.count) return x.count - y.count;
      if (x.last !== y.last) return x.last === null ? -1 : y.last === null ? 1 : x.last < y.last ? -1 : 1;
      return memberNo.get(a.id)! - memberNo.get(b.id)!;
    });
  const asMember = (c: Row): DutyWeekMemberDto => ({ id: c.id, name: c.display_name, fullName: c.full_name, room: c.room ?? null, avatarFileId: c.avatar_file_id ?? null });

  // Danh sách để sửa tay: thứ tự công bằng TRƯỚC khi xếp
  const candidates: DutyCandidateDto[] = fairOrder().map((c) => ({
    id: c.id,
    name: c.display_name,
    fullName: c.full_name,
    room: c.room ?? null,
    recentCount: stats.get(c.id)!.count,
    lastWeek: stats.get(c.id)!.last,
  }));

  const weeks = starts.map((ws) => {
    const e = existing.get(ws);
    const entry = toEntry(e ?? null, ws, v.me);
    const reviewed = !!e?.reviewed_at;
    const action: DutyPlanAction = reviewed ? "locked" : entry.members.length && !q.overwrite ? "keep" : entry.members.length ? "overwrite" : "fill";
    let proposed: DutyWeekMemberDto[] = [];
    if (action === "fill" || action === "overwrite") {
      const picked = fairOrder().slice(0, DUTY_WEEK_MAX_MEMBERS);
      for (const p of picked) {
        const st = stats.get(p.id)!;
        st.count++;
        if (!st.last || ws > st.last) st.last = ws;
      }
      proposed = picked.map(asMember);
    }
    return { weekStart: ws, weekEnd: entry.weekEnd, existing: entry.members, note: entry.note, reviewed, action, proposed };
  });
  return { thisWeekStart: v.thisWeekStart, from, overwrite: q.overwrite, peoplePerWeek: DUTY_WEEK_MAX_MEMBERS, weeks, candidates };
}

/**
 * Lưu nhiều tuần trong MỘT giao dịch bằng đường lưu tuần sẵn có (app.fn_duty_week_save — kiểm 1–2 người đang ở, gửi thông báo người được xếp /
 * bị gỡ). Tuần đã có người bị BỎ QUA trừ khi `overwrite`; tuần đã đánh giá không bao giờ đổi. Lỗi ở một tuần (vd. người đã rời nhà) ⇒ không
 * lưu tuần nào.
 */
export async function saveDutyWeeksBulk(
  tx: Tx,
  b: { weeks: { weekStart: string; memberIds: string[]; note?: string | null }[]; overwrite: boolean },
): Promise<DutyBulkResultDto> {
  const v = await requireDutyManager(tx);
  const seen = new Set<string>();
  const list = [...b.weeks].sort((x, y) => x.weekStart.localeCompare(y.weekStart));
  for (const w of list) {
    if (mondayOf(w.weekStart) !== w.weekStart) throw badRequest(`Tuần ${w.weekStart} không bắt đầu từ Thứ Hai.`);
    if (w.weekStart < v.thisWeekStart) throw badRequest("Không xếp lại lịch trực của các tuần đã qua.");
    if (seen.has(w.weekStart)) throw badRequest(`Tuần ${w.weekStart} bị lặp.`);
    seen.add(w.weekStart);
  }
  const saved: string[] = [];
  const skipped: DutyBulkResultDto["skipped"] = [];
  for (const w of list) {
    const cur = (
      await tx.query<{ id: string; note: string | null; reviewed_at: Date | null; n: number }>(
        `SELECT w.id, w.note, w.reviewed_at, (SELECT count(*) FROM duty_week_members wm WHERE wm.week_id = w.id)::int AS n
           FROM duty_weeks w WHERE w.week_start = $1::date`,
        [w.weekStart],
      )
    ).rows[0];
    if (cur?.reviewed_at) {
      skipped.push({ weekStart: w.weekStart, reason: "Tuần đã được đánh giá — không đổi người trực." });
      continue;
    }
    if (cur && cur.n > 0 && !b.overwrite) {
      skipped.push({ weekStart: w.weekStart, reason: "Tuần đã có người trực (chưa chọn ghi đè)." });
      continue;
    }
    const note = w.note === undefined ? cur?.note ?? null : w.note?.trim() || null;
    await saveDutyWeek(tx, w.weekStart, [...new Set(w.memberIds)], note);
    saved.push(w.weekStart);
  }
  return { saved, skipped };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Lịch trực + kết quả đánh giá của các tuần có Thứ Hai trong [from, to] (≤ 2 năm) — xuất Excel. Mọi thành viên xem được (như bảng trực). */
export async function dutyWeekHistory(tx: Tx, q: { from: string | null; to: string | null }): Promise<DutyHistoryDto> {
  if (!q.from || !q.to || !ISO_DATE.test(q.from) || !ISO_DATE.test(q.to)) throw badRequest("Cần from và to dạng YYYY-MM-DD.");
  if (q.to < q.from || Date.parse(q.to) - Date.parse(q.from) > 731 * 86_400_000) throw badRequest("Khoảng ngày tối đa 2 năm.");
  const v = (await tx.query("SELECT app.current_member_id() AS me, app.local_today()::text AS today")).rows[0];
  const [rows, house] = await Promise.all([
    tx.query(`${WEEK_SELECT} WHERE w.week_start BETWEEN $1::date AND $2::date ORDER BY w.week_start`, [mondayOf(q.from), q.to]),
    tx.query<{ v: string | null }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'"),
  ]);
  return {
    from: q.from,
    to: q.to,
    today: v.today,
    houseName: house.rows[0]?.v ?? null,
    weeks: rows.rows.map((r) => toEntry(r, r.week_start, v.me)),
  };
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
