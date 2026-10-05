import { api, uuidParam } from "@/server/http";
import { markRead } from "@/server/modules/announcements";
import { ReadSchema } from "@/server/modules/community-schema";

/** Đánh dấu đã đọc cho chính mình; { acknowledge: true } = "Xác nhận đã đọc" (chỉ thông báo requires_ack). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReadSchema);
  await ctx.db((tx) => markRead(tx, id, !!b.acknowledge));
  return { ok: true };
});
