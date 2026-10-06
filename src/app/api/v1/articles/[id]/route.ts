import { api, uuidParam } from "@/server/http";
import { deleteArticle, getForManage, updateArticle } from "@/server/modules/articles";
import { ArticlePatchSchema } from "@/server/modules/articles-schema";

export const GET = api({}, (ctx) => ctx.db((tx) => getForManage(tx, uuidParam(ctx, "id"))));

/** Sửa nội dung / đăng / gỡ / ghim nổi bật. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ArticlePatchSchema);
  return ctx.db(async (tx) => {
    await updateArticle(tx, id, b);
    return getForManage(tx, id);
  });
});

/** Xóa mềm. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteArticle(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
