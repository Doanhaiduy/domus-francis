import { api, uuidParam } from "@/server/http";
import { FeedbackPatchSchema, deleteFeedback, notifyFeedbackReplied, updateFeedback } from "@/server/modules/feedback";

/** Người quản lý (feedback.manage): đổi trạng thái và/hoặc trả lời. Có câu trả lời mới ⇒ báo người gửi. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(FeedbackPatchSchema);
  const r = await ctx.db((tx) => updateFeedback(tx, id, b));
  if (r.replied) await notifyFeedbackReplied(ctx, { id, memberId: r.memberId, status: r.status });
  return { ok: true };
});

/** Xóa: người gửi (khi còn “Mới gửi”) hoặc người quản lý. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteFeedback(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
