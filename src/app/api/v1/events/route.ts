import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { createEvent, getEvent, listEvents } from "@/server/modules/events";
import { EventSchema } from "@/server/modules/events-schema";
import { postToZaloGroup } from "@/server/integrations/zalo";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/v1/events?from=YYYY-MM-DD&to=YYYY-MM-DD — sự kiện giao với khoảng ngày (giờ VN) + danh mục. Quyền: event.read (RLS). */
export const GET = api({}, (ctx) => {
  const from = ctx.query.get("from") ?? "";
  const to = ctx.query.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) throw badRequest("Thiếu tham số from/to dạng YYYY-MM-DD.");
  return ctx.db((tx) => listEvents(tx, from, to));
});

/** POST /api/v1/events — tạo sự kiện (+ ban tổ chức, + biểu quyết kèm theo). Quyền: event.manage (RLS), poll.manage nếu có biểu quyết. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(EventSchema);
  const ev = await ctx.db(async (tx) => getEvent(tx, await createEvent(tx, b)));
  let zalo: { sent: boolean; reason?: string } | null = null;
  if (b.notifyApp || b.notifyZalo) {
    const when = `${ev.startHm} ngày ${ev.date}`;
    if (b.notifyApp) {
      await ctx
        .dbAs("luuxa_worker", (tx) => tx.query("SELECT app.fn_system_notify_all('event.created', $1, $2, '/lich-su-kien')", [`Sự kiện mới: ${ev.title}`, `${when}${ev.location ? ` · ${ev.location}` : ""}`]))
        .catch((e) => console.error("[event] thông báo lỗi:", (e as Error).message));
    }
    if (b.notifyZalo) {
      zalo = await postToZaloGroup(ctx, "event_new", `📅 SỰ KIỆN MỚI: ${ev.title}\n🕒 ${when}${ev.location ? `\n📍 ${ev.location}` : ""}${ev.description ? `\n📝 ${ev.description.slice(0, 200)}` : ""}\nAnh em xem chi tiết và báo tham gia trên web Lưu Xá nhé.`);
    }
  }
  return Response.json({ ...ev, zalo }, { status: 201 });
});
