import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { clearSessionCookies, revokeSession } from "@/server/auth/session";

export const POST = api({ auth: "public" }, async (ctx) => {
  if (ctx.session) await revokeSession(ctx.session.sid, "logout", { ip: ctx.ip, userAgent: null, requestId: ctx.requestId });
  return clearSessionCookies(NextResponse.json({ ok: true }));
});
