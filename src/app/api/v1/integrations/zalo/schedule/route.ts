import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { DayQuery, MonthQuery, zaloDay, zaloMonth } from "@/server/integrations/zalo-schedule";

/**
 * Lịch & lịch sử tin gửi nhóm Zalo (Admin / Trưởng nhà — setting.write).
 *   ?month=YYYY-MM → số tin theo ngày (đã gửi / lỗi / bỏ qua + dự kiến cho ngày sắp tới)
 *   ?date=YYYY-MM-DD → chi tiết một ngày: nhật ký đã gửi + tin dự kiến
 */
export const GET = api({}, async (ctx) => {
  const q = Object.fromEntries(ctx.query);
  if (q.date) {
    const p = DayQuery.safeParse(q);
    if (!p.success) throw badRequest(p.error.issues[0].message);
    return zaloDay(ctx, p.data.date);
  }
  const p = MonthQuery.safeParse(q);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  return zaloMonth(ctx, p.data.month);
});
