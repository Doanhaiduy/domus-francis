import { api } from "@/server/http";
import { BulkReviewSchema, notifyReviewed, reviewBulk } from "@/server/modules/liturgy-calendar";

/**
 * Duyệt check-in đi lễ hàng loạt (một giao dịch). Body: { date, status: "approved" } = "Duyệt tất cả" của một ngày (bỏ qua bản có cảnh báo
 * và bản của chính mình) HOẶC { ids: [...], status: "approved" | "rejected", note? } = các bản đã chọn trong hàng đợi (không hợp lệ cần lý do).
 * Quyền: liturgy.calendar.manage. Người check-in nhận thông báo kết quả (bước hệ thống tin cậy — lỗi gửi không làm hỏng kết quả duyệt).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BulkReviewSchema);
  const { result, reviewed } = await ctx.db((tx) => reviewBulk(tx, b));
  if (reviewed.length) {
    await ctx
      .dbAs("luuxa_worker", async (tx) => {
        for (const r of reviewed) await notifyReviewed(tx, r);
      })
      .catch(() => undefined);
  }
  return result;
});
