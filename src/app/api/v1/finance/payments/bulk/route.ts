import { api } from "@/server/http";
import { recordPaymentsBulk } from "@/server/modules/finance-contributions";
import { BulkPaymentSchema } from "@/server/modules/finance-schema";

/**
 * Ghi thu HÀNG LOẠT (Thủ quỹ — finance.contribution.record): nhiều người cùng ngày/hình thức, mỗi người một phiếu thu + bút toán thu.
 * Dùng cho khoản anh em đã đóng trước khi dùng hệ thống (ngày thu thực tế). Tất cả hoặc không gì cả; idempotent theo clientRequestId.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BulkPaymentSchema);
  const r = await ctx.db((tx) => recordPaymentsBulk(tx, b));
  return Response.json(r, { status: 201 });
});
