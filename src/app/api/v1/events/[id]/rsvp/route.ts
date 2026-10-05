import { api, uuidParam } from "@/server/http";
import { getEvent, setRsvp } from "@/server/modules/events";
import { RsvpSchema } from "@/server/modules/events-schema";

/** POST /api/v1/events/:id/rsvp { rsvp: going|maybe|not_going|none } — phản hồi tham dự của chính mình. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(RsvpSchema);
  return ctx.db(async (tx) => {
    await setRsvp(tx, id, b.rsvp);
    return getEvent(tx, id);
  });
});
