import { api } from "@/server/http";
import { createPoll, getPoll, listPolls } from "@/server/modules/events-polls";
import { PollCreateSchema } from "@/server/modules/events-schema";

/** GET /api/v1/polls?eventId= — các cuộc biểu quyết (đang mở trước) kèm kết quả theo app.fn_poll_results. Quyền: event.read. */
export const GET = api({}, (ctx) => {
  const eventId = ctx.query.get("eventId");
  const ids = eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? [eventId] : undefined;
  return ctx.db((tx) => listPolls(tx, { eventIds: ids, limit: 100 }));
});

/** POST /api/v1/polls — tạo biểu quyết (độc lập hoặc gắn sự kiện). Quyền: poll.manage (RLS). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PollCreateSchema);
  const poll = await ctx.db(async (tx) => getPoll(tx, await createPoll(tx, b)));
  return Response.json(poll, { status: 201 });
});
