import { NextResponse } from "next/server";
import { api, uuidParam } from "@/server/http";
import { clearTrustCookie, parseTrustCookie, revokeTrustedDevice, setTrustCookie } from "@/server/auth/trusted-device";
import { sha256Hex } from "@/server/auth/tokens";
import { COOKIE } from "@/lib/auth-shared";

/** Thu hồi một thiết bị tin cậy của chính mình (nếu là thiết bị đang dùng thì gỡ luôn token khỏi cookie). */
export const DELETE = api({ auth: "user" }, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const hash = await revokeTrustedDevice(ctx.userId!, id, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
  const tokens = parseTrustCookie(ctx.req.cookies.get(COOKIE.trusted)?.value);
  const rest = tokens.filter((t) => sha256Hex(t) !== hash);
  const res = NextResponse.json({ ok: true });
  if (rest.length === tokens.length) return res; // cookie không chứa token của thiết bị này (thu hồi từ máy khác)
  return rest.length ? setTrustCookie(res, rest) : clearTrustCookie(res);
});
