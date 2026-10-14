import { api } from "@/server/http";
import { CreateEventFundSchema, createEventFund, listEventFunds } from "@/server/modules/event-funds";

/**
 * Quỹ riêng của chuyến đi / sự kiện (tách khỏi quỹ nhà). GET: danh sách quỹ người xem được —
 * người quản lý quỹ nhà thấy tất cả, người phụ trách thấy quỹ mình phụ trách, thành viên thấy quỹ có tên mình (chỉ phần của mình).
 */
export const GET = api({}, (ctx) => ctx.db((tx) => listEventFunds(tx)));

/** Lập quỹ riêng cho một sự kiện: người phụ trách (1–5), mức đóng chung, danh sách tham gia (thành viên / người ngoài). Cần finance.fund.manage. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CreateEventFundSchema);
  const out = await ctx.db((tx) => createEventFund(tx, b));
  return Response.json(out, { status: 201 });
});
