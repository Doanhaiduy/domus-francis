import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { createExpense, getExpense, listExpenses } from "@/server/modules/finance-expenses";
import { CreateExpenseSchema, RangeQuery } from "@/server/modules/finance-schema";

/** Danh sách phiếu chi theo ngày chi (?from&to). RLS: thành viên thấy phiếu mình lập/mình ứng tiền. */
export const GET = api({}, (ctx) => {
  const parsed = RangeQuery.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  return ctx.db((tx) => listExpenses(tx, parsed.data));
});

/** Lập phiếu chi (nháp) + gắn hóa đơn + (tùy chọn) nộp duyệt ngay. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CreateExpenseSchema);
  const out = await ctx.db(async (tx) => getExpense(tx, await createExpense(tx, b)));
  return Response.json(out, { status: 201 });
});
