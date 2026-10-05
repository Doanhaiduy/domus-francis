import { api, uuidParam } from "@/server/http";
import { getAnnouncement, rsvp } from "@/server/modules/announcements";
import { RsvpSchema } from "@/server/modules/community-schema";

/** "Tôi sẽ có mặt" — ghi RSVP thật vào sự kiện được liên kết với thông báo. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(RsvpSchema);
  return ctx.db(async (tx) => {
    await rsvp(tx, id, b.going);
    return getAnnouncement(tx, id);
  });
});
