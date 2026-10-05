import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { toggleLike } from "@/server/modules/forum";

const Body = z.object({ liked: z.boolean().optional() }).optional();

/** Thả/bỏ tim — mỗi thành viên một lượt; { liked: true|false } đặt trạng thái (idempotent), bỏ trống = đảo trạng thái. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body).catch(() => undefined);
  return ctx.db((tx) => toggleLike(tx, uuidParam(ctx, "id"), b?.liked));
});
