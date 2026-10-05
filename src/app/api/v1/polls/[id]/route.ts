import { api, uuidParam } from "@/server/http";
import { deletePoll, getPoll } from "@/server/modules/events-polls";

/** GET /api/v1/polls/:id */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db((tx) => getPoll(tx, id));
});

/** DELETE /api/v1/polls/:id — chỉ khi chưa có phiếu (BR-EVT-19). Quyền: poll.manage. */
export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    await deletePoll(tx, id);
    return { ok: true };
  });
});
