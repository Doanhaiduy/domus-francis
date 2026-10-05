import { api, uuidParam } from "@/server/http";
import { deleteRuleSection, RuleSectionSchema, updateRuleSection } from "@/server/modules/house-rules";

export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(RuleSectionSchema);
  return ctx.db((tx) => updateRuleSection(tx, id, b));
});

export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteRuleSection(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
