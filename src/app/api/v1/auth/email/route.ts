import { z } from "zod";
import { api } from "@/server/http";
import { changeLoginEmail } from "@/server/auth/session";

const Body = z.object({ password: z.string().min(1).max(200), newEmail: z.string().min(3).max(254) });

/** Đổi email ĐĂNG NHẬP của chính mình (cần nhập lại mật khẩu). Email liên hệ ở hồ sơ là thứ khác. */
export const POST = api({ auth: "user" }, async (ctx) => {
  const b = await ctx.body(Body);
  return changeLoginEmail(ctx.userId!, b.password, b.newEmail, { ip: ctx.ip, userAgent: null, requestId: ctx.requestId });
});
