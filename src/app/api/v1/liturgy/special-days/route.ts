import { api } from "@/server/http";
import { createSpecialDay, listSpecialDays, SpecialDaySchema } from "@/server/modules/liturgy-calendar";

/** Ngày đặc biệt của nhà (kèm ngày Bổn mạng từ cấu hình chung). */
export const GET = api({}, (ctx) => ctx.db((tx) => listSpecialDays(tx)));

/** Thêm ngày đặc biệt — liturgy.calendar.manage (Trưởng nhà, Ban Phụng vụ, Admin). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SpecialDaySchema);
  const d = await ctx.db((tx) => createSpecialDay(tx, b));
  return Response.json(d, { status: 201 });
});
