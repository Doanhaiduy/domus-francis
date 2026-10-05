import { api, uuidParam } from "@/server/http";
import { deleteReflection } from "@/server/modules/liturgy";

/** Gỡ bài suy niệm — người chia sẻ hoặc liturgy.manage. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteReflection(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
