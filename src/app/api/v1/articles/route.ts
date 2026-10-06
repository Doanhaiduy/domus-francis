import { api } from "@/server/http";
import { createArticle, getForManage, listForManage } from "@/server/modules/articles";
import { ArticleSchema } from "@/server/modules/articles-schema";

/** Danh sách mọi bài (kể cả bản nháp) — người có article.manage. */
export const GET = api({}, (ctx) => ctx.db(async (tx) => ({ articles: await listForManage(tx) })));

/** Tạo bài viết công khai (nháp hoặc đăng ngay). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ArticleSchema);
  return ctx.db(async (tx) => {
    const id = await createArticle(tx, b);
    return Response.json(await getForManage(tx, id), { status: 201 });
  });
});
