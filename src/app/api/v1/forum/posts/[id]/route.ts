import { api, uuidParam } from "@/server/http";
import { deletePost, getPost, updatePost } from "@/server/modules/forum";
import { ForumPostPatchSchema } from "@/server/modules/community-schema";

export const GET = api({}, (ctx) => ctx.db((tx) => getPost(tx, uuidParam(ctx, "id"))));

/** Tác giả sửa tiêu đề/nội dung/chuyên mục; người kiểm duyệt (forum.moderate) ghim, khóa, ẩn. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ForumPostPatchSchema);
  return ctx.db(async (tx) => {
    await updatePost(tx, id, b);
    return getPost(tx, id);
  });
});

/** Xóa mềm — tác giả hoặc người kiểm duyệt. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deletePost(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
