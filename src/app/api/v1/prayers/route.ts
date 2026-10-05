import { api } from "@/server/http";
import { listPrayers, postPrayer } from "@/server/modules/prayers";
import { PrayerSchema } from "@/server/modules/community-schema";

/** { items, stats } — ý cầu nguyện còn mở; ý ẩn danh không bao giờ kèm tác giả. */
export const GET = api({}, (ctx) => ctx.db((tx) => listPrayers(tx)));

/** Gửi ý cầu nguyện (app.fn_post_prayer — ẩn danh thật qua prayer_intention_authors). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PrayerSchema);
  const id = await ctx.db((tx) => postPrayer(tx, b.content, !!b.anonymous));
  return Response.json({ id }, { status: 201 });
});
