import { api, uuidParam } from "@/server/http";
import { resolveReports } from "@/server/modules/forum";
import { ResolveReportsSchema } from "@/server/modules/community-schema";

/** Người kiểm duyệt đóng các báo cáo đang mở của chủ đề (bỏ qua / đã xử lý). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ResolveReportsSchema);
  const n = await ctx.db((tx) => resolveReports(tx, "forum_post", uuidParam(ctx, "id"), b.status, b.note ?? null));
  return { resolved: n };
});
