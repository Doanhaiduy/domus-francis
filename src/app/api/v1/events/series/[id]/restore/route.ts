import { api, uuidParam } from "@/server/http";
import { getSeries, restoreSeriesDate } from "@/server/modules/events-series";
import { SeriesRestoreSchema } from "@/server/modules/events-schema";

/** POST /api/v1/events/series/:id/restore { date } — khôi phục một ngày đã bỏ (ngày chưa qua): buổi trở lại lịch. Quyền: event.manage. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SeriesRestoreSchema);
  return ctx.db(async (tx) => {
    await restoreSeriesDate(tx, id, b.date);
    return getSeries(tx, id);
  });
});
