import { api, uuidParam } from "@/server/http";
import { deleteComment, updateComment } from "@/server/modules/forum";
import { CommentPatchSchema } from "@/server/modules/community-schema";

/** Tác giả sửa nội dung; người kiểm duyệt ẩn/hiện. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(CommentPatchSchema);
  await ctx.db((tx) => updateComment(tx, uuidParam(ctx, "id"), b));
  return { ok: true };
});

/** Xóa mềm — tác giả hoặc người kiểm duyệt. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteComment(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
