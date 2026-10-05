import { api } from "@/server/http";
import { reorderRuleSections, RuleReorderSchema } from "@/server/modules/house-rules";

/** Đổi thứ tự các mục luật nhà. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RuleReorderSchema);
  await ctx.db((tx) => reorderRuleSections(tx, b.ids));
  return { ok: true };
});
