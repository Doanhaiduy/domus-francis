import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { createCategory, listCategories } from "@/server/modules/categories";
import { CategoryCreateSchema } from "@/server/modules/settings-schema";
import { CATEGORY_KINDS, type CategoryKind } from "@/lib/types/settings";

/** Danh mục chưa xóa; ?kind=expense lọc theo phân hệ, ?active=1 chỉ lấy danh mục đang hoạt động (cho form tạo mới). */
export const GET = api({}, (ctx) => {
  const kind = ctx.query.get("kind");
  if (kind && !(CATEGORY_KINDS as readonly string[]).includes(kind)) throw badRequest("Phân hệ danh mục không hợp lệ.");
  const activeOnly = ctx.query.get("active") === "1";
  return ctx.db((tx) => listCategories(tx, { kind: (kind as CategoryKind) || null, activeOnly }));
});

/** Thêm danh mục (category.manage — RLS + kiểm tra trong module). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CategoryCreateSchema);
  return ctx.db((tx) => createCategory(tx, b));
});
