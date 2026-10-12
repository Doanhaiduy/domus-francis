import { api, uuidParam } from "@/server/http";
import { firstUpcomingDate, getSeries, updateSeries } from "@/server/modules/events-series";
import { SeriesPatchSchema } from "@/server/modules/events-schema";
import type { EventSeriesSaveResultDto } from "@/lib/types/events";

/** GET /api/v1/events/series/:id — chi tiết chuỗi định kỳ (buổi sắp tới, ngày nghỉ). Quyền: event.read. */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db((tx) => getSeries(tx, id));
});

/**
 * PATCH /api/v1/events/series/:id — sửa chuỗi cho các buổi TỪ ngày `fromDate` (mặc định hôm nay): tên, giờ, địa điểm, mô tả, điểm danh,
 * ban tổ chức, thứ trong tuần, chu kỳ, ngày kết thúc; `isActive: true` = tiếp tục chuỗi đã dừng. Buổi đã diễn ra và phần đã sửa riêng
 * từng buổi giữ nguyên. Quyền: event.manage.
 */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SeriesPatchSchema);
  return ctx.db(async (tx): Promise<EventSeriesSaveResultDto> => {
    const r = await updateSeries(tx, id, b);
    return { series: await getSeries(tx, id), ...r, firstDate: await firstUpcomingDate(tx, id) };
  });
});
