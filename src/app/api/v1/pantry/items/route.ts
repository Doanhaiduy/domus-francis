import { api } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { createPantryItem, getPantry } from "@/server/modules/kitchen-pantry";
import { PantryItemSchema } from "@/server/modules/kitchen-schema";

/** Thêm mặt hàng vào kho (meal.manage). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PantryItemSchema);
  return kdb(ctx, async (tx) => {
    const r = await createPantryItem(tx, b);
    return { ...r, pantry: await getPantry(tx) };
  });
});
