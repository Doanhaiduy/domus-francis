import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { listPlansRange } from "@/server/modules/finance";
import { createPlan } from "@/server/modules/finance-contributions";
import { PlanSchema } from "@/server/modules/finance-schema";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Kế hoạch thu (quỹ định kỳ, điện nước, quỹ tháng cũ…) kèm thống kê: ?from=YYYY-MM&to=YYYY-MM (mặc định 12 tháng qua + 6 tháng tới). */
export const GET = api({}, (ctx) => {
  const from = ctx.query.get("from") ?? undefined;
  const to = ctx.query.get("to") ?? undefined;
  if ((from && !MONTH.test(from)) || (to && !MONTH.test(to))) throw badRequest("Tháng phải có dạng YYYY-MM.");
  return ctx.db((tx) => listPlansRange(tx, from, to));
});

/**
 * Lập kế hoạch thu và sinh khoản phải thu cho mọi thành viên đang ở (finance.contribution.plan.manage):
 *   { kind: "periodic_dues", startMonth?, dueDate?, fundId? }  — quỹ định kỳ, mức theo finance.dues_cycle_amount_vnd
 *   { kind: "utility", month, billTotalVnd, dueDate?, fundId?, note? } — tiền điện nước: tổng hóa đơn chia đều, làm tròn lên 1.000 đ
 * Trùng kỳ / trùng tháng ⇒ 409 (BR-FIN-13).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PlanSchema);
  const out = await ctx.db((tx) => createPlan(tx, b));
  return Response.json(out, { status: 201 });
});
