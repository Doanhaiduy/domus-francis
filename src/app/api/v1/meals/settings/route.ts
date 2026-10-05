import { api } from "@/server/http";
import { kdb, updateMealSettings } from "@/server/modules/kitchen";
import { MealSettingsSchema } from "@/server/modules/kitchen-schema";

/** Giờ chốt trưa/tối + giá tham chiếu (meal.manage), bật/tắt phân hệ (setting.write) — RLS settings theo write_permission. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(MealSettingsSchema);
  return kdb(ctx, (tx) => updateMealSettings(tx, b));
});
