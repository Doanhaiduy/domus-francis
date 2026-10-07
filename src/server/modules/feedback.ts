import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { zUuid } from "../http";
import { badRequest, forbidden, notFound } from "../errors";
import { permissions } from "./community-shared";
import type { FeedbackDto, FeedbackListDto } from "@/lib/types/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABEL, FEEDBACK_STATUSES } from "@/lib/types/feedback";

// Góp ý về ứng dụng (db/app/1035). Quyền nằm ở CSDL (RLS): mỗi người xem/xóa (khi còn "mới") góp ý của mình; feedback.manage xem mọi góp ý,
// đổi trạng thái, trả lời, xóa. Góp ý "ẩn tên": tên người gửi bị che khi người quản lý xem (chính chủ vẫn thấy của mình).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

export const FeedbackCreateSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES as [string, ...string[]]),
  content: z.string().trim().min(10, "Góp ý tối thiểu 10 ký tự.").max(2000, "Góp ý tối đa 2000 ký tự."),
  pagePath: z.string().trim().max(200).nullable().optional().transform((v) => (v && v.startsWith("/") ? v : null)),
  isAnonymous: z.boolean().default(false),
  evidenceFileId: zUuid.nullable().optional().transform((v) => v ?? null),
});
export type FeedbackCreateInput = z.infer<typeof FeedbackCreateSchema>;

export const FeedbackPatchSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES as [string, ...string[]]).optional(),
  response: z.string().trim().max(1000, "Câu trả lời tối đa 1000 ký tự.").nullable().optional(),
});
export type FeedbackPatchInput = z.infer<typeof FeedbackPatchSchema>;

const SELECT = `
  SELECT f.id, f.member_id, f.category, f.content, f.page_path, f.is_anonymous, f.evidence_file_id, f.status, f.response, f.responded_at, f.created_at,
         (f.member_id = app.current_member_id()) AS is_mine,
         (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.id = f.member_id) AS author_name,
         (SELECT COALESCE(rm.display_name, rm.full_name) FROM members rm WHERE rm.user_id = f.responded_by LIMIT 1) AS responded_by_name
    FROM app_feedback f`;

const toDto = (r: Row): FeedbackDto => ({
  id: r.id,
  category: r.category,
  content: r.content,
  pagePath: r.page_path ?? null,
  isAnonymous: !!r.is_anonymous,
  evidenceFileId: r.evidence_file_id ?? null,
  status: r.status,
  response: r.response ?? null,
  respondedByName: r.responded_by_name ?? null,
  respondedAt: r.responded_at ? iso(r.responded_at) : null,
  createdAt: iso(r.created_at),
  isMine: !!r.is_mine,
  // Ẩn tên: chỉ chính chủ thấy tên mình; người quản lý chỉ thấy "Ẩn danh"
  authorName: r.is_anonymous && !r.is_mine ? null : (r.author_name ?? null),
});

export async function listFeedback(tx: Tx): Promise<FeedbackListDto> {
  const p = await permissions(tx, ["feedback.manage"] as const);
  const mine = (await tx.query(`${SELECT} WHERE f.member_id = app.current_member_id() ORDER BY f.created_at DESC LIMIT 100`)).rows.map(toDto);
  let all: FeedbackDto[] | null = null;
  let newCount = 0;
  if (p["feedback.manage"]) {
    all = (await tx.query(`${SELECT} ORDER BY (f.status = 'new') DESC, f.created_at DESC LIMIT 300`)).rows.map(toDto);
    newCount = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM app_feedback WHERE status = 'new'")).rows[0].n;
  }
  return { mine, all, canManage: !!p["feedback.manage"], newCount };
}

export async function createFeedback(tx: Tx, b: FeedbackCreateInput): Promise<{ id: string; memberName: string }> {
  const me = (await tx.query<{ id: string; name: string }>("SELECT id, COALESCE(display_name, full_name) AS name FROM members WHERE id = app.current_member_id()")).rows[0];
  if (!me) throw forbidden("Tài khoản chưa gắn với hồ sơ thành viên.");
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO app_feedback (member_id, category, content, page_path, is_anonymous, evidence_file_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [me.id, b.category, b.content, b.pagePath, b.isAnonymous, b.evidenceFileId]
    )
  ).rows[0].id;
  return { id, memberName: me.name };
}

/** Người quản lý đổi trạng thái / trả lời. Trả về thông tin để báo người gửi khi có câu trả lời mới. */
export async function updateFeedback(tx: Tx, id: string, b: FeedbackPatchInput): Promise<{ memberId: string; replied: boolean; status: string }> {
  const p = await permissions(tx, ["feedback.manage"] as const);
  if (!p["feedback.manage"]) throw forbidden("Chỉ người quản lý được trả lời hoặc đổi trạng thái góp ý.");
  const cur = (await tx.query<{ member_id: string; response: string | null; status: string }>("SELECT member_id, response, status FROM app_feedback WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy góp ý.");
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.status !== undefined) {
    vals.push(b.status);
    sets.push(`status = $${vals.length}`);
  }
  let replied = false;
  if (b.response !== undefined) {
    const text = b.response?.trim() || null;
    if (text !== null && text.length < 2) throw badRequest("Câu trả lời tối thiểu 2 ký tự.");
    vals.push(text);
    sets.push(`response = $${vals.length}`);
    replied = text !== null && text !== (cur.response ?? null);
  }
  if (!sets.length) throw badRequest("Không có gì để cập nhật.");
  vals.push(id);
  await tx.query(`UPDATE app_feedback SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return { memberId: cur.member_id, replied, status: b.status ?? cur.status };
}

/** Xóa: người gửi (khi còn "mới") hoặc người quản lý. RLS chặn phần còn lại. */
export async function deleteFeedback(tx: Tx, id: string) {
  const r = await tx.query("DELETE FROM app_feedback WHERE id = $1", [id]);
  if (!r.rowCount) {
    const exists = (await tx.query("SELECT 1 FROM app_feedback WHERE id = $1", [id])).rowCount;
    throw exists ? forbidden("Bạn chỉ xóa được góp ý của mình khi còn ở trạng thái “Mới gửi”.") : notFound("Không tìm thấy góp ý.");
  }
}

/** Báo người quản lý có góp ý mới (vai trò luuxa_worker). Ẩn tên ⇒ không nêu tên trong thông báo. Lỗi gửi không làm hỏng việc chính. */
export async function notifyFeedbackSubmitted(ctx: Ctx, input: { id: string; memberName: string; category: string; isAnonymous: boolean; content: string }) {
  try {
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query("SELECT app.fn_notify_roles(ARRAY['house_head', 'admin'], 'system.feedback_new', $1, $2, $3::jsonb, 'app_feedback', $4)", [
        `${input.isAnonymous ? "Một thành viên" : input.memberName} góp ý: ${FEEDBACK_CATEGORY_LABEL[input.category as keyof typeof FEEDBACK_CATEGORY_LABEL] ?? "Góp ý"}`,
        input.content.length > 140 ? `${input.content.slice(0, 137)}…` : input.content,
        JSON.stringify({ link: "/gop-y" }),
        input.id,
      ])
    );
  } catch (e) {
    console.error("[feedback] báo người quản lý lỗi:", (e as Error).message);
  }
}

/** Báo người gửi khi góp ý được trả lời. */
export async function notifyFeedbackReplied(ctx: Ctx, input: { id: string; memberId: string; status: string }) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const r = (await tx.query<{ response: string | null }>("SELECT response FROM app_feedback WHERE id = $1", [input.id])).rows[0];
      await tx.query("SELECT app.fn_notify($1, 'system.feedback_reply', $2, $3, $4::jsonb, 'app_feedback', $5)", [
        input.memberId,
        "Góp ý của bạn đã được trả lời",
        (r?.response ?? "").length > 140 ? `${(r?.response ?? "").slice(0, 137)}…` : (r?.response ?? "Cảm ơn bạn đã góp ý."),
        JSON.stringify({ link: "/gop-y" }),
        input.id,
      ]);
    });
  } catch (e) {
    console.error("[feedback] báo người gửi lỗi:", (e as Error).message);
  }
}
