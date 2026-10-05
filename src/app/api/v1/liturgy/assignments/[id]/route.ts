import { api, uuidParam } from "@/server/http";
import { deleteAssignment, setAssignmentStatus } from "@/server/modules/liturgy";
import { AssignmentStatusSchema } from "@/server/modules/community-schema";

/** Người được phân công xác nhận/từ chối; Ban Phụng vụ cập nhật mọi trạng thái. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(AssignmentStatusSchema);
  await ctx.db((tx) => setAssignmentStatus(tx, uuidParam(ctx, "id"), b.status));
  return { ok: true };
});

/** Gỡ phân công — liturgy.manage. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteAssignment(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
