import { z } from "zod";
import { api } from "@/server/http";
import { appOrigin, requestPasswordReset } from "@/server/auth/reset";

const Body = z.object({ identifier: z.string().trim().min(3, "Nhập email hoặc số điện thoại.").max(200) });

/** Yêu cầu email đặt lại mật khẩu. Luôn trả { ok: true } (không lộ tài khoản có tồn tại hay không). */
export const POST = api({ auth: "public" }, async (ctx) => {
  const b = await ctx.body(Body);
  await requestPasswordReset(b.identifier, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId }, appOrigin(ctx.req));
  return { ok: true };
});
