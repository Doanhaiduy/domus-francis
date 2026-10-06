import { api } from "@/server/http";
import { listBankLines } from "@/server/modules/finance-bank";

/** Giao dịch ngân hàng nhận tự động (webhook) + gợi ý khoản phải thu khớp. Quyền: finance.reconcile. */
export const GET = api({}, (ctx) => ctx.db((tx) => listBankLines(tx)));
