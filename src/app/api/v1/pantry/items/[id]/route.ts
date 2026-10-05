import { api, uuidParam } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { archivePantryItem, getPantry, updatePantryItem } from "@/server/modules/kitchen-pantry";
import { PantryItemPatchSchema } from "@/server/modules/kitchen-schema";

/** Cập nhật tồn kho / định mức (delta: cộng trừ nhanh) — meal.manage. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(PantryItemPatchSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await updatePantryItem(tx, id, b);
    return getPantry(tx);
  });
});

/** Ngưng theo dõi mặt hàng (is_active = false, giữ lịch sử yêu cầu). */
export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await archivePantryItem(tx, id);
    return getPantry(tx);
  });
});
