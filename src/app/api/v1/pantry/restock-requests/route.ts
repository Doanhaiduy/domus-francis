import { api } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { createRestockRequest, getPantry } from "@/server/modules/kitchen-pantry";
import { RestockCreateSchema } from "@/server/modules/kitchen-schema";

/** Đề xuất mua thêm (mọi thành viên — meal.register): mặt hàng trong kho hoặc món mới. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RestockCreateSchema);
  return kdb(ctx, async (tx) => {
    const r = await createRestockRequest(tx, b);
    return { ...r, pantry: await getPantry(tx) };
  });
});
