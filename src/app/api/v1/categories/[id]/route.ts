import { api, uuidParam } from "@/server/http";
import { deleteCategory, updateCategory } from "@/server/modules/categories";
import { CategoryUpdateSchema } from "@/server/modules/settings-schema";

/** Sửa tên/mô tả/màu/trạng thái (danh mục hệ thống không đổi được mã, phân hệ). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(CategoryUpdateSchema);
  return ctx.db((tx) => updateCategory(tx, id, b));
});

/** Xóa mềm; danh mục hệ thống bị chặn (chỉ được tạm ẩn). */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteCategory(tx, id));
  return { ok: true };
});
