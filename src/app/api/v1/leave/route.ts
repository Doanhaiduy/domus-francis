import { api } from "@/server/http";
import { LeaveCreateSchema, createLeave, listLeave, notifyLeaveSubmitted } from "@/server/modules/leave";
import { isDoorKind } from "@/lib/types/leave";

/** Đơn của mình + (người duyệt) đơn chờ duyệt + sự kiện có thể xin vắng + việc được nhờ để cửa. Quyền: leave.request / leave.review (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listLeave(tx)));

/**
 * Gửi đơn xin phép (luôn là đơn của chính mình, trạng thái chờ duyệt). Người duyệt và người được nhờ để cửa luôn được báo;
 * khi tích "gửi thông báo" (`notify`; mặc định bật với đơn về muộn / ngủ ngoài) đơn còn được báo cả nhà trong ứng dụng và vào nhóm Zalo.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(LeaveCreateSchema);
  const r = await ctx.db((tx) => createLeave(tx, b));
  await notifyLeaveSubmitted(ctx, {
    id: r.id,
    memberId: r.memberId,
    memberName: r.memberName,
    kind: b.kind,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    reason: b.reason.trim(),
    destination: r.destination,
    eventTitle: r.eventTitle,
    doorMemberId: b.doorMemberId ?? null,
    doorMemberName: r.doorMemberName,
    notify: b.notify ?? isDoorKind(b.kind),
  });
  return Response.json({ id: r.id }, { status: 201 });
});
