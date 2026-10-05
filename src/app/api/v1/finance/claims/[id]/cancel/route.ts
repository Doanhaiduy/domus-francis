import { api, uuidParam } from "@/server/http";
import { cancelClaim } from "@/server/modules/finance-ops";

/** Người báo tự hủy yêu cầu khi còn chờ. */
export const POST = api({}, async (ctx) => {
  await ctx.db((tx) => cancelClaim(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
