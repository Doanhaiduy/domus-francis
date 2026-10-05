import { api, uuidParam } from "@/server/http";
import { cancelPlan } from "@/server/modules/finance-contributions";
import { ReasonSchema } from "@/server/modules/finance-schema";

/** Hủy kế hoạch thu khi CHƯA ai nộp tiền (vd. nhập sai tổng hóa đơn điện nước) — cần lý do ≥ 5 ký tự. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReasonSchema);
  return ctx.db((tx) => cancelPlan(tx, id, b.reason));
});
