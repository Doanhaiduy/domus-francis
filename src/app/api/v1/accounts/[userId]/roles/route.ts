import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { setUserRole } from "@/server/modules/accounts";

const Body = z.object({ role: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/, "Vai trò không hợp lệ."), grant: z.boolean() });

/** Gán / thu hồi một vai trò cho tài khoản (auth.role.assign; không cho chính mình; vai trò Admin chỉ Admin gán). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return setUserRole(ctx, { userId: uuidParam(ctx, "userId") }, b.role, b.grant);
});
