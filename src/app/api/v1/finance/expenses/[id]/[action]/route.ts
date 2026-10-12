import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { notFound } from "@/server/errors";
import { expenseAction, getExpense, type ExpenseAction } from "@/server/modules/finance-expenses";
import { CorrectExpenseSchema, DecisionSchema, PaySchema, ReasonSchema } from "@/server/modules/finance-schema";
import { notifyExpense, type ExpenseEvent } from "@/server/modules/finance-notify";

const SCHEMAS: Record<ExpenseAction, z.ZodType> = {
  submit: z.object({}),
  withdraw: z.object({}),
  decision: DecisionSchema,
  pay: PaySchema,
  cancel: ReasonSchema,
  reverse: ReasonSchema,
  correct: CorrectExpenseSchema,
};

/** Thao tác ⇒ tin cần báo (correct = Admin sửa người ứng/hình thức chi: không báo). */
const EVENT: Partial<Record<ExpenseAction, ExpenseEvent>> = {
  submit: "submitted",
  withdraw: "withdrawn",
  decision: "decided",
  pay: "paid",
  cancel: "cancelled",
  reverse: "reversed",
};

/**
 * POST /expenses/:id/submit | withdraw | decision | pay | cancel | reverse | correct (Admin sửa người ứng tiền / hình thức chi)
 * Mọi chuyển trạng thái đi qua app.fn_* (kiểm quyền, chống tự duyệt, ngưỡng 2 chữ ký, khóa kỳ trong DB).
 * Xong việc báo người liên quan (người còn ký được / người lập / người ứng tiền / người ghi chi) — lỗi gửi không ảnh hưởng thao tác.
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const action = ctx.params.action as ExpenseAction;
  const schema = SCHEMAS[action];
  if (!schema) throw notFound();
  const b = await ctx.body(schema);
  const out = await ctx.db(async (tx) => {
    await expenseAction(tx, id, action, b as Parameters<typeof expenseAction>[3]);
    return getExpense(tx, id);
  });
  const event = EVENT[action];
  if (event) await notifyExpense(ctx, id, event);
  return out;
});
