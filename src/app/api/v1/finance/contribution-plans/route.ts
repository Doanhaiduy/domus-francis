import { api } from "@/server/http";
import { createPlan } from "@/server/modules/finance-contributions";
import { PlanSchema } from "@/server/modules/finance-schema";

/** Lập kỳ thu quỹ tháng và sinh khoản phải thu cho mọi thành viên đang ở (fn_generate_contributions). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PlanSchema);
  const out = await ctx.db((tx) => createPlan(tx, b));
  return Response.json(out, { status: 201 });
});
