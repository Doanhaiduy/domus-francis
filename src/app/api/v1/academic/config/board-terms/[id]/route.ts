import { api, uuidParam } from "@/server/http";
import { BoardTermPatchSchema, deleteBoardTerm, updateBoardTerm } from "@/server/modules/academic-config";

/** Sửa nhiệm kỳ; đóng (bàn giao) / mở lại nhiệm kỳ cần thêm term.handover. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(BoardTermPatchSchema);
  return ctx.db((tx) => updateBoardTerm(tx, id, b));
});

/** Xóa nhiệm kỳ chưa gắn chức vụ/vai trò nào (không xóa nhiệm kỳ đang hiệu lực). */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteBoardTerm(tx, id));
  return { ok: true };
});
