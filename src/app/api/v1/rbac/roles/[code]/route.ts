import { api } from "@/server/http";
import { deleteRole, roleCodeParam, RolePatchBody, updateRole } from "@/server/modules/rbac";

/** Sửa vai trò (auth.role.manage): vai trò hệ thống chỉ đổi tên hiển thị/mô tả; vai trò tự tạo đổi được hạng và bộ quyền. */
export const PATCH = api({}, async (ctx) => {
  const code = roleCodeParam(ctx.params.code);
  const b = await ctx.body(RolePatchBody);
  await ctx.db((tx) => updateRole(tx, code, b));
  return { ok: true, code };
});

/** Xóa vai trò tự tạo: chưa từng dùng ⇒ xóa hẳn; còn lịch sử ⇒ lưu trữ và thu hồi ngay mọi người đang giữ. */
export const DELETE = api({}, async (ctx) => {
  const code = roleCodeParam(ctx.params.code);
  const result = await ctx.db((tx) => deleteRole(tx, code));
  return { ok: true, code, result };
});
