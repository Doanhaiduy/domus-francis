import { z } from "zod";
import { api } from "@/server/http";
import { performPasswordReset } from "@/server/auth/reset";

const Body = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(128) });

/** Đặt mật khẩu mới bằng token trong email; thu hồi mọi phiên đang đăng nhập. */
export const POST = api({ auth: "public" }, async (ctx) => {
  const b = await ctx.body(Body);
  await performPasswordReset(b.token, b.password, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
  return { ok: true };
});
