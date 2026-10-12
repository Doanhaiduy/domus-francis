import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, COOKIE_SECURE, REFRESH_TTL_SECONDS, verifyAccessToken } from "@/lib/auth-shared";
import { PUBLIC_HOME, PUBLIC_SITE_PATHS } from "@/lib/public-site";

// Trang không cần đăng nhập
const PUBLIC_PAGES = ["/dang-nhap", "/quen-mat-khau", "/dat-lai-mat-khau"];
// Trang CÔNG KHAI (bài viết cho người ngoài): ai cũng xem được, đã đăng nhập hay chưa, đã duyệt hay chưa — không chuyển hướng.
const OPEN_PAGES = [...PUBLIC_SITE_PATHS];
// Trang dành cho tài khoản đã đăng ký nhưng chưa được duyệt
const PENDING_PAGES = ["/cho-phe-duyet"];

const under = (pathname: string, list: readonly string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));

// ---------------------------------------------------------------------
// Dấu "trình duyệt này đang có phiên đăng nhập" (cookie HttpOnly, chỉ giá trị ngày — không chứa dữ liệu cá nhân).
// Cookie làm mới phiên (refresh token) chỉ được gửi tới /api/v1/auth nên ở trang "/" middleware không biết người xem còn phiên hay không;
// access token thì hết hạn sau 15 phút. Dấu này giúp phân biệt: khách CHƯA từng đăng nhập vào "/" ⇒ trang giới thiệu công khai, còn
// thành viên có dấu (hoặc còn cookie access) ⇒ đi luồng làm mới phiên như cũ. Đặt/gia hạn khi thấy access token hợp lệ (tối đa mỗi ngày
// một lần), xóa khi đăng xuất hoặc khi một yêu cầu tới /api/v1/auth không còn cookie phiên nào.
// ---------------------------------------------------------------------
const SESSION_HINT = COOKIE_SECURE ? "__Host-luuxa_hs" : "luuxa_hs";
const hintValue = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

function markSession(req: NextRequest, res: NextResponse) {
  const v = hintValue();
  if (req.cookies.get(SESSION_HINT)?.value !== v) {
    res.cookies.set(SESSION_HINT, v, { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: REFRESH_TTL_SECONDS });
  }
  return res;
}

function clearSessionHint(req: NextRequest, res: NextResponse) {
  if (req.cookies.get(SESSION_HINT)) res.cookies.set(SESSION_HINT, "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

function ensureCsrfCookie(req: NextRequest, res: NextResponse) {
  if (!req.cookies.get(COOKIE.csrf)?.value) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // Không HttpOnly: client đọc để gửi lại qua header X-CSRF-Token (double-submit cookie)
    res.cookies.set(COOKIE.csrf, token, { httpOnly: false, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
  }
  return res;
}

// ---------------------------------------------------------------------
// Tiêu đề bảo mật
// ---------------------------------------------------------------------
const DEV = process.env.NODE_ENV !== "production";
// Trang Preview của Vercel (nhánh staging) chèn thanh công cụ vercel.live — cho phép ở chính sách để báo cáo không bị nhiễu
const VERCEL_LIVE = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";
const SUPABASE = "https://*.supabase.co";
const CLOUDINARY_RES = "https://res.cloudinary.com";
const CLOUDINARY_API = "https://api.cloudinary.com";
const TURNSTILE = "https://challenges.cloudflare.com";
const CSP_REPORT_PATH = "/api/v1/public/csp-report";

/**
 * Content-Security-Policy ở chế độ CHỈ BÁO (Report-Only — KHÔNG chặn gì): thu thập vi phạm thật (error_events, nguồn "csp") trước khi
 * bật chặn. Khớp với những gì ứng dụng đang dùng:
 *   • script 'self' + 'unsafe-inline' (Next 14 App Router chèn script nội tuyến; script chủ đề ở layout) + Turnstile; dev thêm 'unsafe-eval' (HMR).
 *   • ảnh/video: tệp của ứng dụng ('self', data:, blob: — ảnh xem trước, QR), Cloudinary (video + ảnh bìa), Supabase Storage (URL ký).
 *   • connect: API của ứng dụng, tải video thẳng lên Cloudinary / Supabase, đoạn HLS (res.cloudinary.com), Turnstile.
 *   • frame: Turnstile + YouTube chế độ không cookie (tài liệu phụng vụ — chỉ nhúng khi người dùng bấm "Xem tại đây").
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ""} ${TURNSTILE}${VERCEL_LIVE}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${CLOUDINARY_RES} ${SUPABASE}${VERCEL_LIVE}`,
  "font-src 'self' data:",
  `media-src 'self' blob: ${CLOUDINARY_RES} ${SUPABASE}`,
  `connect-src 'self' ${CLOUDINARY_API} ${CLOUDINARY_RES} ${SUPABASE} ${TURNSTILE}${DEV ? " ws: wss:" : ""}${VERCEL_LIVE}`,
  `frame-src ${TURNSTILE} https://www.youtube-nocookie.com${VERCEL_LIVE}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `report-uri ${CSP_REPORT_PATH}`,
  "report-to csp-endpoint",
].join("; ");

/** Tiêu đề cho trang HTML. */
function pageHeaders(req: NextRequest, res: NextResponse) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  // Reporting API (Chrome/Edge gửi application/reports+json tới endpoint có tên trong chỉ thị report-to)
  res.headers.set("Reporting-Endpoints", `csp-endpoint="${req.nextUrl.origin}${CSP_REPORT_PATH}"`);
  return res;
}

/** Tiêu đề cho phản hồi API (route nào tự đặt giá trị riêng — vd. tệp tải về — thì giá trị của route được giữ). */
function apiHeaders(res: NextResponse) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // API tự xác thực trong Route Handler (trả 401/403 dạng problem+json) — middleware chỉ cấp cookie CSRF + tiêu đề bảo mật.
  if (pathname.startsWith("/api/")) {
    const res = apiHeaders(ensureCsrfCookie(req, NextResponse.next()));
    // Chỉ các yêu cầu tới /api/v1/auth mới mang cookie làm mới phiên ⇒ nơi duy nhất biết chắc trình duyệt đã hết phiên
    if (pathname.startsWith("/api/v1/auth/")) {
      const noSession = !req.cookies.get(COOKIE.refresh)?.value && !req.cookies.get(COOKIE.access)?.value;
      if (pathname === "/api/v1/auth/logout" || noSession) clearSessionHint(req, res);
    }
    return res;
  }

  const access = req.cookies.get(COOKIE.access)?.value;
  const claims = await verifyAccessToken(access);
  const isPublic = under(pathname, PUBLIC_PAGES);
  const isOpen = under(pathname, OPEN_PAGES);
  const isPendingPage = under(pathname, PENDING_PAGES);

  if (!claims) {
    if (isPublic || isOpen) return pageHeaders(req, ensureCsrfCookie(req, NextResponse.next()));
    // Khách vào trang gốc mà KHÔNG có cookie phiên nào (chưa từng đăng nhập / đã đăng xuất) ⇒ trang giới thiệu công khai
    if (pathname === "/" && !access && !req.cookies.get(SESSION_HINT)) {
      const url = req.nextUrl.clone();
      url.pathname = PUBLIC_HOME;
      return NextResponse.redirect(url);
    }
    // Access token hết hạn/thiếu: thử làm mới bằng refresh token (cookie chỉ gửi tới /api/v1/auth) rồi quay lại trang.
    const url = req.nextUrl.clone();
    url.pathname = "/api/v1/auth/refresh";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (isOpen) return pageHeaders(req, markSession(req, ensureCsrfCookie(req, NextResponse.next())));
  if (claims.pnd && !isPendingPage) return markSession(req, NextResponse.redirect(new URL("/cho-phe-duyet", req.url)));
  if (!claims.pnd && isPendingPage) return markSession(req, NextResponse.redirect(new URL("/", req.url)));
  if (isPublic) return markSession(req, NextResponse.redirect(new URL("/", req.url)));

  return pageHeaders(req, markSession(req, ensureCsrfCookie(req, NextResponse.next())));
}

export const config = {
  // Tệp tĩnh + tệp PWA (manifest, service worker, trang offline) phải tải được khi chưa đăng nhập
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
