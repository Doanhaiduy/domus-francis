import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { notFound } from "@/server/errors";
import { expenseAction, getExpense, type ExpenseAction } from "@/server/modules/finance-expenses";
import { DecisionSchema, PaySchema, ReasonSchema } from "@/server/modules/finance-schema";

const SCHEMAS: Record<ExpenseAction, z.ZodType> = {
  submit: z.object({}),
  withdraw: z.object({}),
  decision: DecisionSchema,
  pay: PaySchema,
  cancel: ReasonSchema,
  reverse: ReasonSchema,
};

/**
 * POST /expenses/:id/submit | withdraw | decision | pay | cancel | reverse
 * Mọi chuyển trạng thái đi qua app.fn_* (kiểm quyền, chống tự duyệt, ngưỡng 2 chữ ký, khóa kỳ trong DB).
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const action = ctx.params.action as ExpenseAction;
  const schema = SCHEMAS[action];
  if (!schema) throw notFound();
  const b = await ctx.body(schema);
  return ctx.db(async (tx) => {
    await expenseAction(tx, id, action, b as Parameters<typeof expenseAction>[3]);
    return getExpense(tx, id);
  });
});
