import { api, uuidParam } from "@/server/http";
import { markNotificationRead } from "@/server/modules/notifications";

export const POST = api({}, async (ctx) => {
  await ctx.db((tx) => markNotificationRead(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
