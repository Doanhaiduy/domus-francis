import { api } from "@/server/http";
import { postZaloEvent } from "@/server/integrations/zalo";
import { createSeries, getSeries, listSeries, seriesAnnouncement } from "@/server/modules/events-series";
import { SeriesCreateSchema } from "@/server/modules/events-schema";
import type { EventSeriesSaveResultDto } from "@/lib/types/events";

/** GET /api/v1/events/series — các chuỗi sự kiện định kỳ (đang chạy trước). Quyền: event.read (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listSeries(tx)));

/**
 * POST /api/v1/events/series — tạo sự kiện lặp hằng tuần { title, time, endTime?, weekdays[1..7], intervalWeeks?, startsOn, untilDate? | count?, … }
 * và sinh ngay các buổi trong 14 ngày tới. Quyền: event.manage. Tùy chọn báo cả nhà (ứng dụng / nhóm Zalo) một lần cho cả chuỗi.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SeriesCreateSchema);
  const out = await ctx.db(async (tx): Promise<EventSeriesSaveResultDto> => {
    const r = await createSeries(tx, b);
    return { series: await getSeries(tx, r.id), generated: r.generated, updated: 0, removed: 0, restored: 0, firstDate: r.firstDate };
  });
  let zalo: { sent: boolean; reason?: string } | null = null;
  const s = out.series;
  const when = seriesAnnouncement(s);
  const link = `/lich-su-kien?date=${out.firstDate ?? s.startsOn}`;
  if (b.notifyApp) {
    await ctx
      .dbAs("luuxa_worker", (tx) => tx.query("SELECT app.fn_system_notify_all('event.created', $1, $2, $3)", [`Lịch định kỳ mới: ${s.title}`, when, link]))
      .catch((e) => console.error("[event-series] thông báo lỗi:", (e as Error).message));
  }
  if (b.notifyZalo) {
    zalo = await postZaloEvent(ctx, "event_new", { title: s.title, when, location: s.location ?? "", description: s.description?.slice(0, 200) ?? "", link });
  }
  return Response.json({ ...out, zalo }, { status: 201 });
});
