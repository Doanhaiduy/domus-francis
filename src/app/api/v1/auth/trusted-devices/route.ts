import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { clearTrustCookie, listTrustedDevices, parseTrustCookie, revokeAllTrustedDevices } from "@/server/auth/trusted-device";
import { COOKIE } from "@/lib/auth-shared";

const meta = (ctx: Parameters<Parameters<typeof api>[1]>[0]) => ({ ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });

/** Thiết bị đã tin cậy 30 ngày của chính mình (đánh dấu thiết bị đang dùng). */
export const GET = api({ auth: "user" }, (ctx) => listTrustedDevices(ctx.userId!, parseTrustCookie(ctx.req.cookies.get(COOKIE.trusted)?.value), meta(ctx)));

/** Thu hồi TẤT CẢ thiết bị tin cậy: lần đăng nhập sau trên mọi thiết bị đều hỏi mã 2FA. */
export const DELETE = api({ auth: "user" }, async (ctx) => {
  const revoked = await revokeAllTrustedDevices(ctx.userId!, meta(ctx));
  return clearTrustCookie(NextResponse.json({ ok: true, revoked }));
});
