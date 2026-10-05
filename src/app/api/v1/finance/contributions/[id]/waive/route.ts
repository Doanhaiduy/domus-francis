import { api, uuidParam } from "@/server/http";
import { waiveContribution } from "@/server/modules/finance-contributions";
import { WaiveSchema } from "@/server/modules/finance-schema";

/** Miễn/giảm khoản phải thu (Trưởng nhà — finance.contribution.waive). discountVnd = 0 ⇒ bỏ miễn giảm. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(WaiveSchema);
  await ctx.db((tx) => waiveContribution(tx, id, b.discountVnd, b.reason));
  return { ok: true };
});
