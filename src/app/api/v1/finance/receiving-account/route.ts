import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getPlanReceivingAccount, getReceivingAccount, saveReceivingAccount } from "@/server/modules/finance";
import { BankAccountSchema } from "@/server/modules/finance-schema";

/**
 * Tài khoản nhận quỹ của nhà (STK + ngân hàng + chủ tài khoản + ảnh QR) — mọi thành viên xem được để chuyển khoản nộp quỹ.
 * Có `?planId=<id>` ⇒ tài khoản áp dụng cho kế hoạch thu đó (kế hoạch điện nước có thể nhận tiền vào tài khoản của một thành viên).
 */
export const GET = api({}, (ctx) => {
  const planId = ctx.query.get("planId");
  if (planId !== null) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) throw badRequest("Mã kế hoạch không hợp lệ.");
    return ctx.db((tx) => getPlanReceivingAccount(tx, planId));
  }
  return ctx.db((tx) => getReceivingAccount(tx));
});

/** Đặt tài khoản nhận quỹ — Thủ quỹ / Trưởng nhà (Admin kỹ thuật ⇒ 403). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(BankAccountSchema);
  return ctx.db((tx) => saveReceivingAccount(tx, b));
});
