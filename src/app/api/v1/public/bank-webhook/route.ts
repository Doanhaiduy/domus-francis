import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { ingestBankTxns, parseBankWebhook, verifyWebhookSecret, webhookEnabled } from "@/server/modules/finance-bank";

export const runtime = "nodejs";

/**
 * Webhook báo biến động số dư (SePay / Casso). Xác thực bằng bí mật dùng chung BANK_WEBHOOK_SECRET (không đăng nhập, không CSRF):
 *   SePay: header `Authorization: Apikey <khóa>` · Casso: header `secure-token: <khóa>` · hoặc `x-webhook-secret`.
 * Chỉ LƯU giao dịch thành dòng sao kê chưa khớp (idempotent); Thủ quỹ xác nhận ghi thu ở trang Thu chi.
 */
export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  if (!webhookEnabled()) throw new ApiError(404, "NOT_FOUND", "Chưa bật nhận giao dịch ngân hàng tự động.");
  if (!verifyWebhookSecret(ctx.req.headers)) throw new ApiError(401, "UNAUTHORIZED", "Sai khóa xác thực webhook.");
  const body = await ctx.req.json().catch(() => null);
  const txns = parseBankWebhook(body);
  if (txns === null) throw new ApiError(400, "BAD_PAYLOAD", "Không nhận ra định dạng giao dịch (hỗ trợ SePay, Casso).");
  const r = await ingestBankTxns(ctx, txns);
  // SePay cần { success: true }; Casso cần { error: 0 }
  return { success: true, error: 0, ...r };
});
