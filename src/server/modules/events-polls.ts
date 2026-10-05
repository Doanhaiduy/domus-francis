import "server-only";
import type { Tx } from "../db";
import { ApiError, notFound } from "../errors";
import type { PollDto } from "@/lib/types/events";
import type { PollCreateInput } from "./events-schema";

interface PollRow {
  id: string;
  event_id: string | null;
  question: string;
  description: string | null;
  is_multi_select: boolean;
  max_choices: number;
  is_anonymous: boolean;
  status: PollDto["status"];
  is_open: boolean;
  closes_at: Date | null;
  created_at: Date;
  created_date: string;
  event_title: string | null;
  event_date: string | null;
  created_by_name: string | null;
}

interface ResultRow {
  poll_id: string;
  option_id: string;
  label: string;
  sort_order: number;
  votes: number | null;
  voters: number;
  eligible: number;
  voter_names: string[] | null;
}

/**
 * Danh sách biểu quyết người xem được (RLS polls__select) kèm kết quả qua app.fn_poll_results — hàm tự che số phiếu
 * từng phương án của biểu quyết ẩn danh đang mở và chỉ trả tên người bỏ phiếu cho người có poll.manage khi không ẩn danh.
 */
export async function listPolls(tx: Tx, opts: { eventIds?: string[]; pollIds?: string[]; limit?: number } = {}): Promise<PollDto[]> {
  const polls = (
    await tx.query<PollRow>(
      `SELECT p.id, p.event_id, p.question, p.description, p.is_multi_select, p.max_choices, p.is_anonymous, p.status::text AS status,
              (p.status = 'open' AND now() >= p.opens_at AND (p.closes_at IS NULL OR now() <= p.closes_at)) AS is_open,
              p.closes_at, p.created_at,
              to_char(p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS created_date,
              e.title AS event_title,
              to_char(e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS event_date,
              cm.display_name AS created_by_name
         FROM polls p
         LEFT JOIN events e ON e.id = p.event_id AND e.deleted_at IS NULL
         LEFT JOIN members cm ON cm.user_id = p.created_by AND cm.deleted_at IS NULL
        WHERE p.status <> 'draft'
          AND ($1::uuid[] IS NULL OR p.event_id = ANY ($1::uuid[]))
          AND ($2::uuid[] IS NULL OR p.id = ANY ($2::uuid[]))
        ORDER BY (p.status = 'open') DESC, p.created_at DESC
        LIMIT $3`,
      [opts.eventIds ?? null, opts.pollIds ?? null, opts.limit ?? 100]
    )
  ).rows;
  if (!polls.length) return [];
  const ids = polls.map((p) => p.id);
  const results = (
    await tx.query<ResultRow>(
      `SELECT x.poll_id, r.option_id, r.label, r.sort_order, r.votes, r.voters, r.eligible, r.voter_names
         FROM unnest($1::uuid[]) AS x(poll_id)
         CROSS JOIN LATERAL app.fn_poll_results(x.poll_id) r
        ORDER BY x.poll_id, r.sort_order`,
      [ids]
    )
  ).rows;
  const mine = (
    await tx.query<{ poll_id: string; option_id: string }>(
      "SELECT poll_id, option_id FROM poll_votes WHERE poll_id = ANY ($1::uuid[]) AND member_id = app.current_member_id()",
      [ids]
    )
  ).rows;
  return polls.map((p): PollDto => {
    const opts = results.filter((r) => r.poll_id === p.id);
    const voters = opts[0]?.voters ?? 0;
    return {
      id: p.id,
      eventId: p.event_title ? p.event_id : null,
      eventTitle: p.event_title,
      eventDate: p.event_date,
      question: p.question,
      description: p.description,
      isMultiSelect: p.is_multi_select,
      maxChoices: p.max_choices,
      isAnonymous: p.is_anonymous,
      status: p.status,
      isOpen: p.is_open,
      closesAt: p.closes_at ? p.closes_at.toISOString() : null,
      createdAt: p.created_at.toISOString(),
      createdDate: p.created_date,
      createdByName: p.created_by_name,
      options: opts.map((o) => ({ id: o.option_id, label: o.label, votes: o.votes, voterNames: o.voter_names })),
      voters,
      eligible: opts[0]?.eligible ?? 0,
      myOptionIds: mine.filter((m) => m.poll_id === p.id).map((m) => m.option_id),
      hasVotes: voters > 0,
    };
  });
}

export async function getPoll(tx: Tx, id: string): Promise<PollDto> {
  const [p] = await listPolls(tx, { pollIds: [id], limit: 1 });
  if (!p) throw notFound("Không tìm thấy cuộc biểu quyết.");
  return p;
}

/** Tạo biểu quyết (RLS polls__write: poll.manage). Đơn lựa chọn ⇒ max_choices = 1 (CHECK ck_polls__choices). */
export async function createPoll(tx: Tx, i: PollCreateInput): Promise<string> {
  const options = i.options.map((o) => o.trim()).filter(Boolean);
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    throw new ApiError(400, "VALIDATION_FAILED", "Các phương án không được trùng nhau.");
  }
  if (options.length < 2) throw new ApiError(400, "VALIDATION_FAILED", "Cần ít nhất 2 phương án lựa chọn.");
  const multi = !!i.isMultiSelect;
  const maxChoices = multi ? Math.min(Math.max(2, i.maxChoices ?? options.length), options.length) : 1;
  if (i.closesAt && new Date(i.closesAt).getTime() <= Date.now()) {
    throw new ApiError(400, "VALIDATION_FAILED", "Hạn chót biểu quyết phải ở tương lai.");
  }
  if (i.eventId) {
    const ev = await tx.query("SELECT 1 FROM events WHERE id = $1 AND deleted_at IS NULL", [i.eventId]);
    if (!ev.rowCount) throw notFound("Không tìm thấy sự kiện liên kết.");
  }
  const r = await tx.query<{ id: string }>(
    `INSERT INTO polls (event_id, question, description, is_multi_select, max_choices, is_anonymous, status, closes_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, app.current_user_id()) RETURNING id`,
    [i.eventId ?? null, i.question.trim(), i.description?.trim() || null, multi, maxChoices, !!i.isAnonymous, i.closesAt ?? null]
  );
  const id = r.rows[0].id;
  for (const [idx, label] of options.entries()) {
    await tx.query("INSERT INTO poll_options (poll_id, label, sort_order) VALUES ($1, $2, $3)", [id, label, idx + 1]);
  }
  return id;
}

/** Bỏ phiếu / đổi phiếu nguyên tử qua app.fn_cast_vote; mảng rỗng ⇒ rút phiếu (RLS chỉ cho khi biểu quyết còn mở). */
export async function castVote(tx: Tx, pollId: string, optionIds: string[]) {
  const p = (
    await tx.query<{ is_open: boolean; status: string; max_choices: number; is_multi_select: boolean }>(
      `SELECT (status = 'open' AND now() >= opens_at AND (closes_at IS NULL OR now() <= closes_at)) AS is_open,
              status::text AS status, max_choices, is_multi_select
         FROM polls WHERE id = $1`,
      [pollId]
    )
  ).rows[0];
  if (!p) throw notFound("Không tìm thấy cuộc biểu quyết.");
  if (!p.is_open) throw new ApiError(422, "BR-EVT-08", "Cuộc biểu quyết không còn nhận phiếu.");
  const unique = [...new Set(optionIds)];
  if (unique.length > p.max_choices) {
    throw new ApiError(422, "BR-EVT-08", `Chỉ được chọn tối đa ${p.max_choices} phương án.`);
  }
  if (unique.length) {
    const valid = await tx.query("SELECT 1 FROM poll_options WHERE poll_id = $1 AND id = ANY ($2::uuid[])", [pollId, unique]);
    if (valid.rowCount !== unique.length) throw new ApiError(400, "VALIDATION_FAILED", "Phương án không thuộc cuộc biểu quyết này.");
    await tx.query("SELECT app.fn_cast_vote($1, $2::uuid[])", [pollId, unique]);
  } else {
    await tx.query("DELETE FROM poll_votes WHERE poll_id = $1 AND member_id = app.current_member_id()", [pollId]);
  }
}

export async function closePoll(tx: Tx, pollId: string) {
  const r = await tx.query("UPDATE polls SET status = 'closed' WHERE id = $1 AND status = 'open'", [pollId]);
  if (!r.rowCount) {
    const ex = await tx.query<{ status: string }>("SELECT status::text AS status FROM polls WHERE id = $1", [pollId]);
    if (!ex.rowCount) throw notFound("Không tìm thấy cuộc biểu quyết.");
    if (ex.rows[0].status === "closed") return;
    throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền đóng cuộc biểu quyết.");
  }
}

/** Xóa biểu quyết chưa có phiếu (BR-EVT-19: đã có phiếu thì chỉ được đóng — trigger chặn). */
export async function deletePoll(tx: Tx, pollId: string) {
  const ex = await tx.query("SELECT 1 FROM polls WHERE id = $1", [pollId]);
  if (!ex.rowCount) throw notFound("Không tìm thấy cuộc biểu quyết.");
  const r = await tx.query("DELETE FROM polls WHERE id = $1", [pollId]);
  if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền xóa cuộc biểu quyết.");
}
