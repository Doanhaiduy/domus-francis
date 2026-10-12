import { api, uuidParam } from "@/server/http";
import { getSeries, skipSeriesDate } from "@/server/modules/events-series";
import { SeriesSkipSchema } from "@/server/modules/events-schema";
import { isoToDmy, weekdayDm } from "@/lib/events-format";

/**
 * POST /api/v1/events/series/:id/skip { date, reason?, notify? } — BỎ một buổi (tạm nghỉ ngày đó): ghi ngày ngoại lệ, gỡ buổi khỏi lịch nếu đã
 * tạo (chưa diễn ra); cron không sinh lại. Tùy chọn báo cả nhà. Quyền: event.manage.
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SeriesSkipSchema);
  const out = await ctx.db(async (tx) => {
    const r = await skipSeriesDate(tx, id, b.date, b.reason);
    return { ...r, series: await getSeries(tx, id) };
  });
  if (b.notify) {
    await ctx
      .dbAs("luuxa_worker", (tx) =>
        tx.query("SELECT app.fn_system_notify_all('event.cancelled', $1, $2, $3)", [
          `Tạm nghỉ ${weekdayDm(out.date)}: ${out.title}`,
          b.reason?.trim() ? `Lý do: ${b.reason.trim()}` : `Buổi ngày ${isoToDmy(out.date)} không diễn ra.`,
          `/lich-su-kien?date=${out.date}`,
        ])
      )
      .catch((e) => console.error("[event-series] thông báo lỗi:", (e as Error).message));
  }
  return out.series;
});
