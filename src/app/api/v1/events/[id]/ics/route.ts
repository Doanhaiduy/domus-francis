import { api, uuidParam } from "@/server/http";
import { appOrigin } from "@/server/auth/reset";
import { eventIcs } from "@/server/modules/events-calendar";

/**
 * GET /api/v1/events/:id/ics — tải sự kiện dạng iCalendar (.ics, RFC 5545) để "Thêm vào lịch" (Google Calendar, Lịch iPhone, Outlook).
 * UID ổn định theo mã sự kiện ⇒ tải lại sau khi sự kiện đổi giờ thì ứng dụng lịch cập nhật đúng sự kiện cũ. Quyền: xem được sự kiện (RLS).
 */
export const GET = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const { body, filename } = await ctx.db((tx) => eventIcs(tx, id, appOrigin(ctx.req)));
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
});
