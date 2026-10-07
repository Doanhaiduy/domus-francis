import { api, uuidParam } from "@/server/http";
import { adminDelete } from "@/server/modules/admin-delete";
import { LeaveActionSchema, actOnLeave, notifyLeaveDecided } from "@/server/modules/leave";

/** Hủy đơn của mình (cancel) hoặc duyệt / từ chối (approve / reject — người có leave.review, không tự duyệt đơn của mình). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(LeaveActionSchema);
  await ctx.db((tx) => actOnLeave(tx, id, b));
  if (b.action !== "cancel") await notifyLeaveDecided(ctx, id);
  return { ok: true };
});

/** Admin dọn dữ liệu rác: xóa vĩnh viễn đơn (quyền data.purge). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "leave", uuidParam(ctx, "id"))));
