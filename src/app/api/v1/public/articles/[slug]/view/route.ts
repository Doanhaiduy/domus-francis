import { api } from "@/server/http";
import { recordView } from "@/server/modules/articles";

export const runtime = "nodejs";

/** +1 lượt xem (trình duyệt gọi một lần mỗi phiên). Không cần đăng nhập, không kiểm CSRF (chỉ tăng bộ đếm). */
export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  const slug = ctx.params.slug;
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) await ctx.db((tx) => recordView(tx, slug));
  return { ok: true };
});
