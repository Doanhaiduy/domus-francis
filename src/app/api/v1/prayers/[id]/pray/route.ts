import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { togglePraying } from "@/server/modules/prayers";

const Body = z.object({ praying: z.boolean().optional() }).optional();

/** "Đang cầu nguyện" của chính mình — { praying: true|false } đặt trạng thái (idempotent); bỏ trống = đảo trạng thái. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body).catch(() => undefined);
  return ctx.db((tx) => togglePraying(tx, uuidParam(ctx, "id"), b?.praying));
});
