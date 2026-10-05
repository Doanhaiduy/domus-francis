import { api, uuidParam } from "@/server/http";
import { cancelAssignment, getAssignment, updateAssignment } from "@/server/modules/duty";
import { AssignmentUpdateSchema } from "@/server/modules/duty-schema";

export const GET = api({}, (ctx) => ctx.db((tx) => getAssignment(tx, uuidParam(ctx, "id"))));

/** Sửa người trực / phòng phụ trách của ca chưa check-in. Quyền: duty.manage. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(AssignmentUpdateSchema);
  return ctx.db(async (tx) => {
    await updateAssignment(tx, id, b);
    return getAssignment(tx, id);
  });
});

/** Hủy ca chưa check-in (?reason=, bắt buộc khi roster đã công bố). Không xóa dòng vì nhật ký trạng thái bất biến. Quyền: duty.manage. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const result = await ctx.db((tx) => cancelAssignment(tx, id, ctx.query.get("reason")));
  return { ok: true, result };
});
