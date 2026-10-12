import { api, uuidParam } from "@/server/http";
import { listFeedTokens, revokeFeedToken } from "@/server/modules/events-calendar";

/** DELETE /api/v1/me/calendar-feed/:id — thu hồi một đường dẫn lịch của tôi (ứng dụng lịch đang đăng ký sẽ không tải được nữa). */
export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    await revokeFeedToken(tx, id);
    return listFeedTokens(tx);
  });
});
