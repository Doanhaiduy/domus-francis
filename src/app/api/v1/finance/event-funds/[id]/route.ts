import { api, uuidParam } from "@/server/http";
import { getEventFund } from "@/server/modules/event-funds";

/** Chi tiết một quỹ riêng (tóm tắt, danh sách tham gia, phiếu thu, phiếu chi). Phạm vi xem theo quan hệ của người gọi với quỹ. */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db((tx) => getEventFund(tx, id));
});
