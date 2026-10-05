import { z } from "zod";
import { api } from "@/server/http";
import { createRole, RoleBody } from "@/server/modules/rbac";

const CreateBody = RoleBody.extend({ code: z.string().trim().min(1, "Nhập mã vai trò.").max(40, "Mã vai trò tối đa 40 ký tự.") });

/** Thêm vai trò tự tạo (auth.role.manage — Admin). Quyền bảo vệ / mã trùng / hạng sai bị DB từ chối với thông điệp tiếng Việt. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CreateBody);
  const code = await ctx.db((tx) => createRole(tx, b));
  return Response.json({ code }, { status: 201 });
});
