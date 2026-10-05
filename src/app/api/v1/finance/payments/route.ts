import { api } from "@/server/http";
import { recordPayment } from "@/server/modules/finance-contributions";
import { PaymentSchema } from "@/server/modules/finance-schema";

/** Ghi thu quỹ (Thủ quỹ — finance.contribution.record): một phiếu thu phân bổ cho 1..n tháng; idempotent theo clientRequestId. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PaymentSchema);
  const id = await ctx.db((tx) => recordPayment(tx, b));
  return Response.json({ id }, { status: 201 });
});
