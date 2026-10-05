import { api, uuidParam } from "@/server/http";
import { cancelSwap } from "@/server/modules/duty";

/** Người xin rút đơn đổi ca đang chờ (UPDATE status — chính sách duty_swap_requests__update). */
export const POST = api({}, async (ctx) => {
  await ctx.db((tx) => cancelSwap(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
