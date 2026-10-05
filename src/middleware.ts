import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, COOKIE_SECURE, verifyAccessToken } from "@/lib/auth-shared";

// Trang không cần đăng nhập
const PUBLIC_PAGES = ["/dang-nhap"];
// Trang dành cho tài khoản đã đăng ký nhưng chưa được duyệt
const PENDING_PAGES = ["/cho-phe-duyet"];

function ensureCsrfCookie(req: NextRequest, res: NextResponse) {
  if (!req.cookies.get(COOKIE.csrf)?.value) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // Không HttpOnly: client đọc để gửi lại qua header X-CSRF-Token (double-submit cookie)
    res.cookies.set(COOKIE.csrf, token, { httpOnly: false, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
  }
  return res;
}

function securityHeaders(res: NextResponse) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // API tự xác thực trong Route Handler (trả 401/403 dạng problem+json) — middleware chỉ cấp cookie CSRF.
  if (pathname.startsWith("/api/")) return ensureCsrfCookie(req, NextResponse.next());

  const claims = await verifyAccessToken(req.cookies.get(COOKIE.access)?.value);
  const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isPendingPage = PENDING_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!claims) {
    if (isPublic) return securityHeaders(ensureCsrfCookie(req, NextResponse.next()));
    // Access token hết hạn/thiếu: thử làm mới bằng refresh token (cookie chỉ gửi tới /api/v1/auth) rồi quay lại trang.
    const url = req.nextUrl.clone();
    url.pathname = "/api/v1/auth/refresh";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (claims.pnd && !isPendingPage) return NextResponse.redirect(new URL("/cho-phe-duyet", req.url));
  if (!claims.pnd && isPendingPage) return NextResponse.redirect(new URL("/", req.url));
  if (isPublic) return NextResponse.redirect(new URL("/", req.url));

  return securityHeaders(ensureCsrfCookie(req, NextResponse.next()));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
