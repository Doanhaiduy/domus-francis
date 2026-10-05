import { api, uuidParam } from "@/server/http";
import { getExpense, updateExpense } from "@/server/modules/finance-expenses";
import { UpdateExpenseSchema } from "@/server/modules/finance-schema";

export const GET = api({}, (ctx) => ctx.db((tx) => getExpense(tx, uuidParam(ctx, "id"))));

/** Người lập sửa phiếu nháp / bị từ chối / đang chờ duyệt (tự rút về nháp), tùy chọn nộp lại. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(UpdateExpenseSchema);
  return ctx.db(async (tx) => {
    await updateExpense(tx, id, b);
    return getExpense(tx, id);
  });
});
