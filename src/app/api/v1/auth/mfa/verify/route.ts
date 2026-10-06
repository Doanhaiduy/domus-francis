import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { completeMfaLogin, setSessionCookies } from "@/server/auth/session";
import { verifyMfaToken } from "@/server/auth/tokens";

const Body = z.object({ mfaToken: z.string().min(20).max(2000), code: z.string().trim().min(6, "Nhập mã 6 số.").max(20) });

/** Bước 2 đăng nhập: token trung gian (từ /auth/login) + mã TOTP hoặc mã khôi phục ⇒ phiên đăng nhập. */
export const POST = api({ auth: "public" }, async (ctx) => {
  const b = await ctx.body(Body);
  const userId = await verifyMfaToken(b.mfaToken);
  if (!userId) throw new ApiError(401, "MFA_EXPIRED", "Phiên xác thực đã hết hạn. Hãy đăng nhập lại từ đầu.");
  const r = await completeMfaLogin(userId, b.code, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
  if (!r.ok) throw r.error;
  if (r.mfa) throw new ApiError(500, "MFA_STATE", "Trạng thái đăng nhập không hợp lệ.");
  return setSessionCookies(NextResponse.json({ pending: r.pending }), { userId: r.userId, sid: r.sid, pending: r.pending, refresh: r.refresh });
});
