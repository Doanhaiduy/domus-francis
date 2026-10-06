import { z } from "zod";
import { api } from "@/server/http";
import { confirmEnroll } from "@/server/auth/mfa";

/** Xác nhận mã đầu tiên ⇒ bật 2FA; trả 8 mã khôi phục (chỉ hiện lần này). */
export const POST = api({ auth: "user" }, async (ctx) => {
  const b = await ctx.body(z.object({ code: z.string().trim().min(6).max(10) }));
  const recoveryCodes = await confirmEnroll(ctx.userId!, b.code, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
  return { recoveryCodes };
});
