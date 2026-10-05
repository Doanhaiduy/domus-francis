import { api, uuidParam } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { deleteShoppingItem, getPantry, updateShoppingItem } from "@/server/modules/kitchen-pantry";
import { ShoppingPatchSchema } from "@/server/modules/kitchen-schema";

/** Sửa / đánh dấu đã mua (tự cộng kho + đóng yêu cầu liên quan — trigger DB) — meal.manage. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(ShoppingPatchSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await updateShoppingItem(tx, id, b);
    return getPantry(tx);
  });
});

export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await deleteShoppingItem(tx, id);
    return getPantry(tx);
  });
});
