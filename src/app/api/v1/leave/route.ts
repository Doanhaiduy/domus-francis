import { api } from "@/server/http";
import { LeaveCreateSchema, createLeave, listLeave, notifyLeaveSubmitted } from "@/server/modules/leave";

/** Đơn của mình + (người duyệt) đơn chờ duyệt + sự kiện có thể xin vắng + việc được nhờ để cửa. Quyền: leave.request / leave.review (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listLeave(tx)));

/**
 * Gửi đơn xin phép (luôn là đơn của chính mình, trạng thái chờ duyệt). Đơn về muộn / ngủ ngoài: báo vào nhóm Zalo của nhà
 * và báo người được nhờ để cửa (nếu có).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(LeaveCreateSchema);
  const r = await ctx.db((tx) => createLeave(tx, b));
  await notifyLeaveSubmitted(ctx, {
    id: r.id,
    memberName: r.memberName,
    kind: b.kind,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    reason: b.reason.trim(),
    destination: b.destination?.trim() || null,
    doorMemberId: b.doorMemberId ?? null,
    doorMemberName: r.doorMemberName,
  });
  return Response.json({ id: r.id }, { status: 201 });
});
