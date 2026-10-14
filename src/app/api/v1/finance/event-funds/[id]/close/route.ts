import { api, uuidParam } from "@/server/http";
import { CloseSchema, closeEventFund } from "@/server/modules/event-funds";

/**
 * Đóng quỹ riêng (Trưởng nhà / Thủ quỹ): mode = refund (hoàn lại người đã đóng theo tỷ lệ) | to_house (chuyển phần dư về quỹ nhà).
 * Phải hết phiếu chi đang chờ duyệt / chưa ghi chi. Ghi biên bản quyết toán.
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(CloseSchema);
  return ctx.db((tx) => closeEventFund(tx, id, b));
});
