import { api, uuidParam } from "@/server/http";
import { getSeries, stopSeries } from "@/server/modules/events-series";
import { SeriesStopSchema } from "@/server/modules/events-schema";
import { isoToDmy } from "@/lib/events-format";

/**
 * POST /api/v1/events/series/:id/stop { fromDate?, reason?, notify? } — DỪNG chuỗi từ ngày (mặc định hôm nay): không sinh buổi mới, gỡ các buổi
 * chưa diễn ra từ ngày đó; buổi đã diễn ra (và điểm danh) giữ nguyên. Tiếp tục lại bằng PATCH { isActive: true }. Quyền: event.manage.
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SeriesStopSchema);
  const out = await ctx.db(async (tx) => {
    const r = await stopSeries(tx, id, b.fromDate);
    return { ...r, series: await getSeries(tx, id) };
  });
  if (b.notify) {
    await ctx
      .dbAs("luuxa_worker", (tx) =>
        tx.query("SELECT app.fn_system_notify_all('event.cancelled', $1, $2, $3)", [
          `Dừng lịch định kỳ: ${out.title}`,
          `Từ ngày ${isoToDmy(out.from)} không còn sinh hoạt này nữa.${b.reason?.trim() ? ` Lý do: ${b.reason.trim()}` : ""}`,
          "/lich-su-kien",
        ])
      )
      .catch((e) => console.error("[event-series] thông báo lỗi:", (e as Error).message));
  }
  return { ...out.series, removed: out.removed };
});
