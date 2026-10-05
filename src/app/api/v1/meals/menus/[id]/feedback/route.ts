import { api, uuidParam } from "@/server/http";
import { deleteFeedback, getFeedback, kdb, putFeedback } from "@/server/modules/kitchen";
import { FeedbackSchema } from "@/server/modules/kitchen-schema";

/** Góp ý của bữa: điểm trung bình (mọi người) + nội dung (Ban Ẩm thực thấy hết, thành viên thấy của mình). */
export const GET = api({}, (ctx) => kdb(ctx, (tx) => getFeedback(tx, uuidParam(ctx, "id"))));

/** Chấm điểm + lời khen/góp ý của chính mình cho bữa đã diễn ra (ghi đè lần trước). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(FeedbackSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await putFeedback(tx, id, b);
    return getFeedback(tx, id);
  });
});

/** Xóa góp ý của mình; Ban Ẩm thực xóa được góp ý bất kỳ qua ?feedbackId=. */
export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  const fid = ctx.query.get("feedbackId");
  return kdb(ctx, async (tx) => {
    await deleteFeedback(tx, id, fid && /^[0-9a-f-]{36}$/i.test(fid) ? fid : null);
    return getFeedback(tx, id);
  });
});
