import { z } from "zod";
import { api } from "@/server/http";
import { disableMfa, getMfaStatus } from "@/server/auth/mfa";

const meta = (ctx: Parameters<Parameters<typeof api>[1]>[0]) => ({ ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });

/** Trạng thái xác thực 2 bước của chính mình. */
export const GET = api({ auth: "user" }, (ctx) => getMfaStatus(ctx.userId!, meta(ctx)));

/** Tắt xác thực 2 bước (nhập lại mật khẩu). */
export const DELETE = api({ auth: "user" }, async (ctx) => {
  const b = await ctx.body(z.object({ password: z.string().min(1).max(200) }));
  await disableMfa(ctx.userId!, b.password, meta(ctx));
  return { ok: true };
});
