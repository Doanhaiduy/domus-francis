import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getLedgerBook } from "@/server/modules/finance-ledger";
import { LedgerQuery } from "@/server/modules/finance-schema";

/**
 * Sổ quỹ có số dư theo khoảng ngày: ?from=YYYY-MM-DD&to=YYYY-MM-DD[&fund=<id>] (tối đa 366 ngày). Mỗi túi quỹ: số dư đầu kỳ, các bút toán
 * (thu / chi / điều chỉnh / đảo…, người đối ứng, chứng từ, số dư sau bút toán), tổng thu – chi, số dư cuối kỳ. Cần finance.ledger.read.
 */
export const GET = api({}, (ctx) => {
  const parsed = LedgerQuery.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  return ctx.db((tx) => getLedgerBook(tx, parsed.data));
});
