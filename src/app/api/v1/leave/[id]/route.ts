import { api, uuidParam } from "@/server/http";
import { badRequest } from "@/server/errors";
import { adminDelete } from "@/server/modules/admin-delete";
import { LeaveActionSchema, LeaveEditSchema, actOnLeave, notifyLeaveDecided, updateLeave } from "@/server/modules/leave";

/**
 * Hủy đơn của mình (cancel), duyệt / từ chối (approve / reject — người có leave.review, không tự duyệt đơn của mình)
 * hoặc sửa nội dung đơn (edit — chính chủ khi còn chờ duyệt, Admin bất kỳ lúc nào).
 */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const raw = await ctx.req.clone().json().catch(() => null);
  if (!raw || typeof raw !== "object") throw badRequest("Yêu cầu không hợp lệ.");
  if ((raw as { action?: string }).action === "edit") {
    const b = await ctx.body(LeaveEditSchema);
    await ctx.db((tx) => updateLeave(tx, id, b));
    return { ok: true };
  }
  const b = await ctx.body(LeaveActionSchema);
  await ctx.db((tx) => actOnLeave(tx, id, b));
  if (b.action !== "cancel") await notifyLeaveDecided(ctx, id);
  return { ok: true };
});

/** Admin dọn dữ liệu rác: xóa vĩnh viễn đơn (quyền data.purge). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "leave", uuidParam(ctx, "id"))));
