import { api, uuidParam } from "@/server/http";
import { LeaveExtendSchema, extendLeave, notifyLeaveExtended } from "@/server/modules/leave";

/**
 * POST /api/v1/leave/:id/extend { newEndsAt, reason } — xin thêm giờ cho đơn về muộn / ngủ ngoài của MÌNH (đã xin phép rồi mà có chuyện phát sinh).
 * Ghi vết (chỉ thêm), báo người duyệt + người được nhờ để cửa và đăng lại vào nhóm Zalo.
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(LeaveExtendSchema);
  const r = await ctx.db((tx) => extendLeave(tx, id, b));
  await notifyLeaveExtended(ctx, { id, ...r });
  return Response.json({ ok: true }, { status: 201 });
});
