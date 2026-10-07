import { api, uuidParam } from "@/server/http";
import { cancelEvent, getEvent } from "@/server/modules/events";
import { CancelSchema } from "@/server/modules/events-schema";

/** POST /api/v1/events/:id/cancel { reason } — hủy sự kiện (đóng biểu quyết đang mở). Quyền: event.manage. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(CancelSchema);
  return ctx.db(async (tx) => {
    await cancelEvent(tx, id, b.reason);
    return getEvent(tx, id);
  });
});
