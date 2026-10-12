import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { appOrigin } from "@/server/auth/reset";
import { hashKey, rateLimit } from "@/server/ops";
import { createFeedToken, listFeedTokens } from "@/server/modules/events-calendar";
import { FeedTokenCreateSchema } from "@/server/modules/events-schema";

/** GET /api/v1/me/calendar-feed — các đường dẫn lịch cá nhân đang dùng của tôi (không có mã — máy chủ chỉ lưu mã băm). */
export const GET = api({}, (ctx) => ctx.db((tx) => listFeedTokens(tx)));

/**
 * POST /api/v1/me/calendar-feed { label? } — tạo đường dẫn lịch mới để đăng ký trong Google Calendar / Lịch iPhone. Trả đường dẫn đầy đủ
 * MỘT lần duy nhất. Tối đa 5 đường dẫn đang dùng; tối đa 10 lần tạo mỗi giờ.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(FeedTokenCreateSchema);
  return ctx.db(async (tx) => {
    if (!(await rateLimit(tx, `calfeed:new:${hashKey(ctx.userId)}`, 3600, 10))) {
      throw new ApiError(429, "RATE_LIMITED", "Bạn tạo đường dẫn lịch quá nhiều lần — thử lại sau ít phút.");
    }
    return Response.json(await createFeedToken(tx, b.label, appOrigin(ctx.req)), { status: 201 });
  });
});
