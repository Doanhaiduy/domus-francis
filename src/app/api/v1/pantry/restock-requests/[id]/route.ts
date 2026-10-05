import { api, uuidParam } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { actOnRestockRequest, getPantry } from "@/server/modules/kitchen-pantry";
import { RestockActionSchema } from "@/server/modules/kitchen-schema";

/** approve (→ danh sách cần mua) / reject (kèm lý do) — meal.manage; cancel — người đề xuất khi còn chờ. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(RestockActionSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await actOnRestockRequest(tx, id, b);
    return getPantry(tx);
  });
});
