import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { COOKIE } from "@/lib/auth-shared";
import { clearSessionCookies, refreshSession, setSessionCookies } from "@/server/auth/session";
import { problemResponse, toApiError, ApiError } from "@/server/errors";

const meta = (req: NextRequest) => ({
  ip: (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1").replace(/^::ffff:/, ""),
  userAgent: req.headers.get("user-agent"),
  requestId: randomUUID(),
});

/** POST: client gọi khi nhận 401 — trả 204 + cookie mới, hoặc 401. */
export async function POST(req: NextRequest) {
  const m = meta(req);
  try {
    const r = await refreshSession(req.cookies.get(COOKIE.refresh)?.value, m);
    if (!r.ok) {
      const body = await problemResponse(new ApiError(401, "SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn."), m.requestId).text();
      return clearSessionCookies(new NextResponse(body, { status: 401, headers: { "content-type": "application/problem+json; charset=utf-8" } }));
    }
    return setSessionCookies(NextResponse.json({ pending: r.pending }), r);
  } catch (e) {
    return problemResponse(toApiError(e), m.requestId);
  }
}

/** GET ?next=/duong-dan: middleware chuyển hướng tới đây khi access token hết hạn khi tải trang. */
export async function GET(req: NextRequest) {
  const m = meta(req);
  const raw = req.nextUrl.searchParams.get("next") || "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  try {
    const r = await refreshSession(req.cookies.get(COOKIE.refresh)?.value, m);
    if (r.ok) {
      const dest = r.pending ? "/cho-phe-duyet" : next;
      return setSessionCookies(NextResponse.redirect(new URL(dest, req.url)), r);
    }
  } catch (e) {
    console.error("[auth] refresh lỗi:", e);
  }
  const login = new URL("/dang-nhap", req.url);
  if (next !== "/") login.searchParams.set("next", next);
  return clearSessionCookies(NextResponse.redirect(login));
}
