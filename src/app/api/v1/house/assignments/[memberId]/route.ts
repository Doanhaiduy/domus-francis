import { api, uuidParam } from "@/server/http";
import { unassignRoom } from "@/server/modules/house";

export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => unassignRoom(tx, uuidParam(ctx, "memberId"), ctx.query.get("reason")));
  return { ok: true };
});
