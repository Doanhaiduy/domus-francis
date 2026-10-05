import { api, uuidParam } from "@/server/http";
import { setPrayerStatus } from "@/server/modules/prayers";
import { PrayerStatusSchema } from "@/server/modules/community-schema";

/** Chính chủ (kể cả ý ẩn danh) hoặc người kiểm duyệt: open | answered | closed. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(PrayerStatusSchema);
  await ctx.db((tx) => setPrayerStatus(tx, uuidParam(ctx, "id"), b.status));
  return { ok: true };
});
