import { api, uuidParam } from "@/server/http";
import { addComment, getPost } from "@/server/modules/forum";
import { CommentSchema } from "@/server/modules/community-schema";

/** Bình luận (forum.post); bài bị khóa/ẩn bị DB chặn (BR-COM-03). Trả về chủ đề kèm bình luận mới. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(CommentSchema);
  const post = await ctx.db(async (tx) => {
    await addComment(tx, id, b.content, b.parentId ?? null);
    return getPost(tx, id);
  });
  return Response.json(post, { status: 201 });
});
