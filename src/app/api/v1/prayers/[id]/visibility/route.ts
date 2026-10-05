import { api, uuidParam } from "@/server/http";
import { setPrayerHidden } from "@/server/modules/prayers";
import { PrayerVisibilitySchema } from "@/server/modules/community-schema";

/** Ẩn/hiện do kiểm duyệt (prayer.moderate). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PrayerVisibilitySchema);
  await ctx.db((tx) => setPrayerHidden(tx, uuidParam(ctx, "id"), b.hidden));
  return { ok: true };
});
