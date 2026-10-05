import { api } from "@/server/http";
import { createRoster } from "@/server/modules/duty";
import { RosterCreateSchema } from "@/server/modules/duty-schema";

/** Tạo roster nháp cho một tuần (tùy chọn sao chép phân công từ tuần khác). Quyền: duty.manage (RLS). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RosterCreateSchema);
  const r = await ctx.db((tx) => createRoster(tx, b));
  return Response.json(r, { status: 201 });
});
