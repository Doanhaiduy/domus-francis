import { api } from "@/server/http";
import { getOpeningBalances, OpeningBalanceSchema, postOpeningBalance } from "@/server/modules/finance-opening";

/** Số dư từng túi quỹ + bút toán số dư đầu kỳ đã ghi (cần finance.ledger.read). `canOpen` = túi quỹ chưa có bút toán nào. */
export const GET = api({}, (ctx) => ctx.db((tx) => getOpeningBalances(tx)));

/**
 * Nhập số dư quỹ khởi đầu cho một túi quỹ mới (Trưởng nhà / Admin — finance.ledger.adjust). Chỉ ghi được MỘT lần cho mỗi túi quỹ
 * và phải là bút toán đầu tiên của túi quỹ đó; bút toán bất biến (sai thì ghi bút toán điều chỉnh, không sửa).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(OpeningBalanceSchema);
  const id = await ctx.db((tx) => postOpeningBalance(tx, b));
  return Response.json({ id }, { status: 201 });
});
