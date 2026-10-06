import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { login, setSessionCookies } from "@/server/auth/session";
import { signMfaToken } from "@/server/auth/tokens";

const Body = z.object({
  identifier: z.string().trim().min(3, "Nhập email hoặc số điện thoại.").max(200),
  password: z.string().min(1, "Nhập mật khẩu.").max(200),
});

export const POST = api({ auth: "public" }, async (ctx) => {
  const b = await ctx.body(Body);
  const r = await login(b.identifier, b.password, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
  if (!r.ok) throw r.error;
  // Tài khoản bật xác thực 2 bước: trả token trung gian 5 phút, chưa có phiên
  if (r.mfa) return { mfaRequired: true, mfaToken: await signMfaToken(r.userId) };
  return setSessionCookies(NextResponse.json({ pending: r.pending }), { userId: r.userId, sid: r.sid, pending: r.pending, refresh: r.refresh });
});
