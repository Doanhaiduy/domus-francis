import { api } from "@/server/http";
import { createPost, listPosts } from "@/server/modules/forum";
import { ForumPostSchema } from "@/server/modules/community-schema";

/** { posts, categories, stats } — chủ đề diễn đàn (ghim trước, theo hoạt động mới nhất). */
export const GET = api({}, (ctx) => ctx.db((tx) => listPosts(tx)));

/** Tạo chủ đề (forum.post) — tác giả lấy từ phiên đăng nhập. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ForumPostSchema);
  const id = await ctx.db((tx) => createPost(tx, b));
  return Response.json({ id }, { status: 201 });
});
