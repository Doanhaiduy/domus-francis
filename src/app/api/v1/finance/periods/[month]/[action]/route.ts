import { z } from "zod";
import { api } from "@/server/http";
import { badRequest, notFound } from "@/server/errors";
import { closePeriod, confirmPeriod, isMonth, reconcilePeriod, reopenPeriod } from "@/server/modules/finance-periods";
import { ClosePeriodSchema, ConfirmPeriodSchema, ReconcileSchema, ReopenPeriodSchema } from "@/server/modules/finance-schema";
import { notifyPeriod } from "@/server/modules/finance-notify";

type Action = "close" | "confirm" | "reopen" | "reconcile";
const SCHEMAS: Record<Action, z.ZodType> = {
  close: ClosePeriodSchema,
  confirm: ConfirmPeriodSchema,
  reopen: ReopenPeriodSchema,
  reconcile: ReconcileSchema,
};

/**
 * POST /api/v1/finance/periods/:month/close | confirm | reopen | reconcile   (:month = YYYY-MM)
 *   close     { note? }                                — Thủ quỹ chốt sổ (bước 1): kiểm hết tháng, kỳ trước đã chốt, quỹ bắt buộc đã đối soát
 *   confirm   {}                                       — người thứ hai xác nhận (người chốt không tự xác nhận — BR-FIN-10)
 *   reopen    { reason ≥ 10 ký tự }                    — mở lại kỳ (chỉ kỳ mới nhất trước — BR-FIN-11)
 *   reconcile { fundId, statementVnd, explanation? }   — đối soát số dư thực tế ↔ sổ quỹ cuối tháng (chênh lệch phải giải trình)
 * Mọi kiểm tra quyền / luật nằm trong hàm CSDL; xong việc báo người liên quan (người xác nhận, người đã chốt, Thủ quỹ).
 */
export const POST = api({}, async (ctx) => {
  const month = ctx.params.month;
  const action = ctx.params.action as Action;
  const schema = SCHEMAS[action];
  if (!schema) throw notFound();
  if (!isMonth(month)) throw badRequest("Tháng phải có dạng YYYY-MM.");
  switch (action) {
    case "close": {
      const b = (await ctx.body(ClosePeriodSchema)) as z.infer<typeof ClosePeriodSchema>;
      const r = await ctx.db((tx) => closePeriod(tx, month, b.note ?? null));
      await notifyPeriod(ctx, month, "closed", { closingVnd: r.funds.reduce((s, f) => s + f.closingVnd, 0) });
      return r;
    }
    case "confirm": {
      await ctx.body(ConfirmPeriodSchema);
      const r = await ctx.db((tx) => confirmPeriod(tx, month));
      await notifyPeriod(ctx, month, "confirmed");
      return { month, ...r };
    }
    case "reopen": {
      const b = (await ctx.body(ReopenPeriodSchema)) as z.infer<typeof ReopenPeriodSchema>;
      const r = await ctx.db((tx) => reopenPeriod(tx, month, b.reason));
      await notifyPeriod(ctx, month, "reopened", { reason: b.reason });
      return { month, ...r };
    }
    case "reconcile": {
      const b = (await ctx.body(ReconcileSchema)) as z.infer<typeof ReconcileSchema>;
      const r = await ctx.db((tx) => reconcilePeriod(tx, month, b));
      return { month, fundId: b.fundId, ...r };
    }
  }
});
