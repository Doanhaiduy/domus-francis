import { api } from "@/server/http";
import { createAssignment, getAssignment } from "@/server/modules/duty";
import { AssignmentCreateSchema } from "@/server/modules/duty-schema";

/** Tạo ca trực (khu vực × ngày × ca) + người trực; tự tạo roster nháp nếu tuần chưa có. Quyền: duty.manage. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(AssignmentCreateSchema);
  const a = await ctx.db(async (tx) => getAssignment(tx, await createAssignment(tx, b)));
  return Response.json(a, { status: 201 });
});
