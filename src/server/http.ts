import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { COOKIE, CSRF_HEADER, verifyAccessToken, type AccessClaims } from "@/lib/auth-shared";
import { withTx, type DbRole, type Tx } from "./db";
import { ApiError, badRequest, forbidden, problemResponse, toApiError, unauthorized } from "./errors";
import { recordActivity } from "./activity";

export interface Ctx {
  req: NextRequest;
  params: Record<string, string>;
  query: URLSearchParams;
  requestId: string;
  ip: string | null;
  session: AccessClaims | null;
  /** users.id của người gọi (null nếu chưa đăng nhập). */
  userId: string | null;
  /** Transaction với vai trò luuxa_app + ngữ cảnh người dùng (RLS áp dụng). */
  db<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Transaction với vai trò khác (luuxa_auth cho luồng đăng nhập, luuxa_worker cho bước xử lý tin cậy). */
  dbAs<T>(role: DbRole, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Đọc + kiểm tra JSON body theo schema zod. */
  body<T>(schema: ZodType<T>): Promise<T>;
}

export interface RouteOptions {
  /** "member" (mặc định): đã đăng nhập VÀ đã được duyệt; "user": đăng nhập (kể cả đang chờ duyệt); "public": không cần. */
  auth?: "member" | "user" | "public";
  /** Kiểm CSRF cho phương thức ghi (mặc định bật). */
  csrf?: boolean;
}

type Handler = (ctx: Ctx) => Promise<unknown>;
type RouteArgs = { params?: Record<string, string | string[]> };

const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/i;
function clientIp(req: NextRequest): string | null {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const ip = raw.replace(/^::ffff:/, "");
  return IP_RE.test(ip) ? ip : null;
}

function checkCsrf(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    try {
      if (new URL(origin).host !== host) throw forbidden("Yêu cầu bị chặn (Origin không hợp lệ).");
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw forbidden("Yêu cầu bị chặn (Origin không hợp lệ).");
    }
  }
  const cookie = req.cookies.get(COOKIE.csrf)?.value;
  const header = req.headers.get(CSRF_HEADER);
  if (!cookie || !header || cookie !== header) throw new ApiError(403, "CSRF", "Phiên làm việc đã hết hạn bảo vệ CSRF — tải lại trang rồi thử lại.");
}

const sessionCache = new Map<string, number>();

export function invalidateSessionCache(sid?: string) {
  if (sid) sessionCache.delete(sid);
  else sessionCache.clear();
}

/** Bọc một Route Handler: xác thực, CSRF, transaction theo request, ánh xạ lỗi RFC 9457. */
export function api(opts: RouteOptions, handler: Handler) {
  const auth = opts.auth ?? "member";
  return async (req: NextRequest, args: RouteArgs = {}): Promise<Response> => {
    const requestId = randomUUID();
    const ip = clientIp(req);
    const started = Date.now();
    // Nhật ký hoạt động: thao tác ghi của người đã đăng nhập (db/app/1016_activity_logs.sql). Không lưu nội dung gửi lên.
    let actor: string | null = null;
    const track = (status: number, errorCode: string | null) => {
      if (!actor || ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return Promise.resolve();
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(args.params ?? {})) params[k] = Array.isArray(v) ? v.join("/") : v;
      return recordActivity({
        userId: actor,
        method: req.method,
        pathname: req.nextUrl.pathname,
        params,
        status,
        errorCode,
        durationMs: Date.now() - started,
        ip,
        userAgent: req.headers.get("user-agent"),
        requestId,
      });
    };
    try {
      const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
      const session = await verifyAccessToken(bearer ?? req.cookies.get(COOKIE.access)?.value);
      actor = session?.sub ?? null;
      if (auth !== "public") {
        if (!session) throw unauthorized();
        if (auth === "member" && session.pnd) throw new ApiError(403, "PENDING_APPROVAL", "Tài khoản của bạn đang chờ Ban điều hành duyệt.");
      }
      const method = req.method.toUpperCase();
      if ((opts.csrf ?? true) && !bearer && !["GET", "HEAD", "OPTIONS"].includes(method)) checkCsrf(req);

      const userId = session?.sub ?? null;
      let sessionChecked = false;
      const run = <T,>(role: DbRole, fn: (tx: Tx) => Promise<T>) =>
        withTx({ userId: role === "luuxa_auth" ? null : userId, requestId, ip }, role, async (tx) => {
          // Phiên bị thu hồi (đăng xuất nơi khác, đổi mật khẩu, phát hiện dùng lại refresh token) bị chặn ngay, không chờ access token hết hạn.
          // Đệm kết quả 15s trong bộ nhớ để tránh tốn 1 vòng mạng DB cho mỗi API call đồng thời khi tải trang.
          if (session && role === "luuxa_app" && !sessionChecked) {
            const now = Date.now();
            const cachedExp = sessionCache.get(session.sid);
            if (!cachedExp || cachedExp < now) {
              const ok = await tx.query("SELECT 1 FROM auth_sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()", [session.sid]);
              if (!ok.rowCount) {
                sessionCache.delete(session.sid);
                throw new ApiError(401, "SESSION_REVOKED", "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.");
              }
              sessionCache.set(session.sid, now + 15_000);
            }
            sessionChecked = true;
          }
          return fn(tx);
        });

      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(args.params ?? {})) params[k] = Array.isArray(v) ? v.join("/") : v;

      const ctx: Ctx = {
        req,
        params,
        query: req.nextUrl.searchParams,
        requestId,
        ip,
        session,
        userId,
        db: (fn) => run("luuxa_app", fn),
        dbAs: (role, fn) => run(role, fn),
        body: async (schema) => {
          let raw: unknown;
          try {
            raw = await req.json();
          } catch {
            throw badRequest("Body phải là JSON hợp lệ.");
          }
          const parsed = schema.safeParse(raw);
          if (!parsed.success) {
            const errors = parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(body)", message: i.message }));
            throw badRequest(errors[0]?.message ?? "Dữ liệu không hợp lệ.", errors);
          }
          return parsed.data;
        },
      };

      const out = await handler(ctx);
      const res = out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
      res.headers.set("x-request-id", requestId);
      res.headers.set("cache-control", res.headers.get("cache-control") ?? "no-store");
      await track(res.status, null);
      return res;
    } catch (e) {
      const err = toApiError(e);
      await track(err.status, err.code);
      return problemResponse(err, requestId, req.nextUrl.pathname);
    }
  };
}

// ---- Schema dùng chung ----
export const zUuid = z.string().uuid("Mã định danh không hợp lệ.");
export const zText = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} tối thiểu ${min} ký tự.`).max(max, `${label} tối đa ${max} ký tự.`);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD.");
export const zMoney = z.number().int("Số tiền phải là số nguyên (đồng).").min(0).max(10_000_000_000);

/** Lấy tham số đường dẫn bắt buộc là UUID; sai định dạng ⇒ 404 (không lộ lý do). */
export function uuidParam(ctx: Ctx, name: string): string {
  const v = ctx.params[name];
  if (!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy dữ liệu.");
  return v;
}
