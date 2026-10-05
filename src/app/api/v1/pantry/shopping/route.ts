import { api } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { createShoppingItem, getPantry } from "@/server/modules/kitchen-pantry";
import { ShoppingCreateSchema } from "@/server/modules/kitchen-schema";

/** Thêm vào danh sách cần mua (meal.manage). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ShoppingCreateSchema);
  return kdb(ctx, async (tx) => {
    const r = await createShoppingItem(tx, b);
    return { ...r, pantry: await getPantry(tx) };
  });
});
