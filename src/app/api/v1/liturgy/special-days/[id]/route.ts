import { api, uuidParam } from "@/server/http";
import { deleteSpecialDay, SpecialDaySchema, updateSpecialDay } from "@/server/modules/liturgy-calendar";

/** Sửa ngày đặc biệt (gửi kèm version để không ghi đè bản người khác vừa sửa). */
export const PUT = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SpecialDaySchema);
  return ctx.db((tx) => updateSpecialDay(tx, id, b));
});

/** Xóa (mềm) ngày đặc biệt. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteSpecialDay(tx, id));
  return { ok: true };
});
