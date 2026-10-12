import { api } from "@/server/http";
import { DataRequestCreateSchema, createDataRequest, listDataRequests, notifyDataRequestCreated } from "@/server/modules/data-requests";

/** Yêu cầu về dữ liệu cá nhân: của tôi + (người có privacy.manage) mọi yêu cầu, còn mở/quá hạn trước. `?scope=mine` ⇒ chỉ của tôi. */
export const GET = api({}, (ctx) => ctx.db((tx) => listDataRequests(tx, { mineOnly: ctx.query.get("scope") === "mine" })));

/** Thành viên gửi yêu cầu về dữ liệu của CHÍNH MÌNH (hạn phản hồi 72 giờ) ⇒ báo người quản lý. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(DataRequestCreateSchema);
  const r = await ctx.db((tx) => createDataRequest(tx, b));
  await notifyDataRequestCreated(ctx, { id: r.id, memberId: r.memberId, memberName: r.memberName, type: b.type, dueAt: r.dueAt });
  return Response.json({ id: r.id, dueAt: r.dueAt }, { status: 201 });
});
