import { api, uuidParam } from "@/server/http";
import { getAnnouncement, setPinned } from "@/server/modules/announcements";
import { PinSchema } from "@/server/modules/community-schema";

/** Ghim/bỏ ghim — announcement.pin (trigger BR-COM-06 + RLS). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(PinSchema);
  return ctx.db(async (tx) => {
    await setPinned(tx, id, b.pinned);
    return getAnnouncement(tx, id);
  });
});
