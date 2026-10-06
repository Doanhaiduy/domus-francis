import { api, uuidParam } from "@/server/http";
import { BankLineActionSchema, actOnBankLine } from "@/server/modules/finance-bank";

/** confirm (ghi thu cho khoản phải thu đã chọn) · ignore (bỏ qua, có lý do) · restore (khôi phục dòng đã bỏ qua). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BankLineActionSchema);
  const r = await ctx.db((tx) => actOnBankLine(tx, uuidParam(ctx, "id"), b));
  return { ok: true, ...r };
});
