import { api } from "@/server/http";
import { kdb, saveMenuDay } from "@/server/modules/kitchen";
import { MenuDaySchema } from "@/server/modules/kitchen-schema";

/** Lập / sửa thực đơn một ngày (trưa, tối) và người trực bếp — meal.manage (RLS meal_menus / meal_menu_cooks). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(MenuDaySchema);
  return kdb(ctx, (tx) => saveMenuDay(tx, b));
});
