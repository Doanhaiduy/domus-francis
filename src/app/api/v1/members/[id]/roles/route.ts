import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { listMemberRoles, setMemberRole } from "@/server/modules/accounts";

/** Vai trò đang giữ của thành viên + danh sách vai trò gán được (đọc từ bảng roles — gồm vai trò tự tạo). */
export const GET = api({}, (ctx) => listMemberRoles(ctx, uuidParam(ctx, "id")));

const Body = z.object({ role: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/, "Vai trò không hợp lệ."), grant: z.boolean() });

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return setMemberRole(ctx, uuidParam(ctx, "id"), b.role, b.grant);
});
