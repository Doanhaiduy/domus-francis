import { api, uuidParam } from "@/server/http";
import { ReceiptSchema, receive } from "@/server/modules/event-funds";

/** Ghi thu vào quỹ riêng (người phụ trách quỹ hoặc Thủ quỹ). participantId trống = người đóng ngoài danh sách (ghi tên). Idempotent theo clientRequestId. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReceiptSchema);
  const receiptId = await ctx.db((tx) => receive(tx, id, b));
  return Response.json({ id: receiptId }, { status: 201 });
});
