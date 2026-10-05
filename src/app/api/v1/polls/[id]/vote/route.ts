import { api, uuidParam } from "@/server/http";
import { castVote, getPoll } from "@/server/modules/events-polls";
import { VoteSchema } from "@/server/modules/events-schema";

/** POST /api/v1/polls/:id/vote { optionIds } — bỏ/đổi phiếu (app.fn_cast_vote); [] = rút phiếu. Quyền: poll.vote. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(VoteSchema);
  return ctx.db(async (tx) => {
    await castVote(tx, id, b.optionIds);
    return getPoll(tx, id);
  });
});
