import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { completeMfaLogin, setSessionCookies } from "@/server/auth/session";
import { verifyMfaToken } from "@/server/auth/tokens";
import { mergeTrustTokens, parseTrustCookie, setTrustCookie } from "@/server/auth/trusted-device";
import { COOKIE } from "@/lib/auth-shared";

const Body = z.object({
  mfaToken: z.string().min(20).max(2000),
  code: z.string().trim().min(6, "Nhập mã 6 số.").max(20),
  /** Tick "Tin cậy thiết bị này 30 ngày": lần đăng nhập sau trên thiết bị này không hỏi mã 2FA */
  trustDevice: z.boolean().optional(),
});

/** Bước 2 đăng nhập: token trung gian (từ /auth/login) + mã TOTP hoặc mã khôi phục ⇒ phiên đăng nhập (+ cookie thiết bị tin cậy nếu được chọn). */
export const POST = api({ auth: "public" }, async (ctx) => {
  const b = await ctx.body(Body);
  const userId = await verifyMfaToken(b.mfaToken);
  if (!userId) throw new ApiError(401, "MFA_EXPIRED", "Phiên xác thực đã hết hạn. Hãy đăng nhập lại từ đầu.");
  const r = await completeMfaLogin(userId, b.code, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId }, b.trustDevice === true);
  if (!r.ok) throw r.error;
  if (r.mfa) throw new ApiError(500, "MFA_STATE", "Trạng thái đăng nhập không hợp lệ.");
  const res = await setSessionCookies(NextResponse.json({ pending: r.pending, trusted: !!r.trustedToken }), { userId: r.userId, sid: r.sid, pending: r.pending, refresh: r.refresh });
  if (r.trustedToken) setTrustCookie(res, mergeTrustTokens(r.trustedToken, parseTrustCookie(ctx.req.cookies.get(COOKIE.trusted)?.value)));
  return res;
});
