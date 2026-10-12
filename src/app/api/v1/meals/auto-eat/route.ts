import { z } from "zod";
import { api } from "@/server/http";
import { kdb, setAutoEat } from "@/server/modules/kitchen";

/** Bật / tắt "Luôn ăn, trừ khi báo vắng" của chính mình (meal.register). Bật ⇒ tự ghi "ăn" vào các bữa đang mở. */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(z.object({ enabled: z.boolean() }));
  return kdb(ctx, (tx) => setAutoEat(tx, b.enabled));
});
