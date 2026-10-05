import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { previewPlan } from "@/server/modules/finance-contributions";
import { PlanPreviewQuery } from "@/server/modules/finance-schema";

/**
 * Xem trước kế hoạch thu (không ghi): ?kind=periodic_dues[&startMonth=YYYY-MM][&dueDate=…]
 * hoặc ?kind=utility&month=YYYY-MM&billTotalVnd=N[&dueDate=…] ⇒ số người chia, mỗi người, phần dư, kế hoạch trùng.
 */
export const GET = api({}, (ctx) => {
  const parsed = PlanPreviewQuery.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  return ctx.db((tx) => previewPlan(tx, parsed.data));
});
