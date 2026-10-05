import { api, uuidParam } from "@/server/http";
import { reportContent } from "@/server/modules/forum";
import { ReportSchema } from "@/server/modules/community-schema";

/** Báo cáo vi phạm một bình luận. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ReportSchema);
  await ctx.db((tx) => reportContent(tx, "forum_comment", uuidParam(ctx, "id"), b.reason));
  return Response.json({ ok: true }, { status: 201 });
});
