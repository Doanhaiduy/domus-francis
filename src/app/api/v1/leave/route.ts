import { api } from "@/server/http";
import { LeaveCreateSchema, createLeave, listLeave, notifyLeaveSubmitted } from "@/server/modules/leave";

/** Đơn của mình + (người duyệt) đơn chờ duyệt + sự kiện có thể xin vắng. Quyền: leave.request / leave.review (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listLeave(tx)));

/** Gửi đơn xin phép (luôn là đơn của chính mình, trạng thái chờ duyệt). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(LeaveCreateSchema);
  const r = await ctx.db((tx) => createLeave(tx, b));
  await notifyLeaveSubmitted(ctx, { id: r.id, memberName: r.memberName, kind: b.kind, startsAt: b.startsAt });
  return Response.json({ id: r.id }, { status: 201 });
});
