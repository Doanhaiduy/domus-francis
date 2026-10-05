import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { createEvent, getEvent, listEvents } from "@/server/modules/events";
import { EventSchema } from "@/server/modules/events-schema";

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
  return Response.json(ev, { status: 201 });
});
