import { api, uuidParam } from "@/server/http";
import { revealAuthor } from "@/server/modules/prayers";
import { RevealSchema } from "@/server/modules/community-schema";

/**
 * Xem tác giả ý ẩn danh — prayer.reveal_author (Trưởng nhà), CHỈ khi có báo cáo vi phạm đang mở do người khác lập (D-007),
 * bắt buộc lý do >= 10 ký tự, mỗi lần gọi ghi audit READ_SENSITIVE. Toàn bộ luật nằm trong app.fn_reveal_prayer_author.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RevealSchema);
  return ctx.db((tx) => revealAuthor(tx, uuidParam(ctx, "id"), b.reason));
});
