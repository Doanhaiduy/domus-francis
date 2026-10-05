import { api } from "@/server/http";
import { getReceivingAccount, saveReceivingAccount } from "@/server/modules/finance";
import { BankAccountSchema } from "@/server/modules/finance-schema";

/** Tài khoản nhận quỹ của nhà (STK + ngân hàng + chủ tài khoản + ảnh QR) — mọi thành viên xem được để chuyển khoản nộp quỹ. */
export const GET = api({}, (ctx) => ctx.db((tx) => getReceivingAccount(tx)));

/** Đặt tài khoản nhận quỹ — Thủ quỹ / Trưởng nhà (Admin kỹ thuật ⇒ 403). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(BankAccountSchema);
  return ctx.db((tx) => saveReceivingAccount(tx, b));
});
