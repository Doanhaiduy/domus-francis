import { api, uuidParam } from "@/server/http";
import { closePoll, getPoll } from "@/server/modules/events-polls";

/** POST /api/v1/polls/:id/close — đóng biểu quyết. Quyền: poll.manage. */
export const POST = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    await closePoll(tx, id);
    return getPoll(tx, id);
  });
});
