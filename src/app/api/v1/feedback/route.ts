import { api } from "@/server/http";
import { FeedbackCreateSchema, createFeedback, listFeedback, notifyFeedbackSubmitted } from "@/server/modules/feedback";

/** Góp ý của mình + (người có feedback.manage) mọi góp ý. */
export const GET = api({}, (ctx) => ctx.db((tx) => listFeedback(tx)));

/** Gửi góp ý về ứng dụng (mọi thành viên). Báo người quản lý. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(FeedbackCreateSchema);
  const r = await ctx.db((tx) => createFeedback(tx, b));
  await notifyFeedbackSubmitted(ctx, { id: r.id, memberName: r.memberName, category: b.category, isAnonymous: b.isAnonymous, content: b.content });
  return Response.json({ id: r.id }, { status: 201 });
});
