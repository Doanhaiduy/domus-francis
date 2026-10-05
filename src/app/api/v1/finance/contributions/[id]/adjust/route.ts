import { api, uuidParam } from "@/server/http";
import { adjustContribution } from "@/server/modules/finance-contributions";
import { AdjustContributionSchema } from "@/server/modules/finance-schema";

/** Điều chỉnh mức phải thu (Thủ quỹ / Trưởng nhà — finance.contribution.plan.manage). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(AdjustContributionSchema);
  const r = await ctx.db((tx) => adjustContribution(tx, id, b.amountDueVnd, b.reason));
  return r;
});
