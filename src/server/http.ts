import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { COOKIE, CSRF_HEADER, verifyAccessToken, type AccessClaims } from "@/lib/auth-shared";
import { SessionRevokedError, dbStats, withTx, type DbRole, type DbStats, type SessionGate, type Tx } from "./db";
import { ApiError, badRequest, forbidden, problemResponse, toApiError, unauthorized } from "./errors";
import { recordActivity } from "./activity";
import { dispatchOutbox, outboxConfigured } from "./outbox";
import { inBackground, recordErrorEvent } from "./ops";

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
  /**
   * Route GET có GHI dữ liệu bằng ctx.db (mặc định GET chạy transaction READ ONLY, không chờ COMMIT ⇒ nhanh hơn một vòng mạng).
   * Quên đặt cũng không hỏng: gặp lỗi "read-only transaction" thì api() tự chạy lại handler ở chế độ ghi (và in cảnh báo).
   */
  writes?: boolean;
}

type Handler = (ctx: Ctx) => Promise<unknown>;
type RouteArgs = { params?: Record<string, string | string[]> };

/** Chuẩn hóa mọi chuỗi (kể cả lồng nhau) về NFC để chữ tiếng Việt lưu một dạng duy nhất. */
function deepNfc(v: unknown): unknown {
  if (typeof v === "string") return v.normalize("NFC");
  if (Array.isArray(v)) return v.map(deepNfc);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, deepNfc(x)]));
  return v;
}

const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/i;
export function clientIp(req: NextRequest): string | null {
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

// ---------------------------------------------------------------------
// Phiên đăng nhập: kiểm tra "còn hiệu lực" + trạng thái tài khoản (mật khẩu tạm, 2FA bắt buộc) nằm NGAY trong lượt gửi BEGIN của
// transaction luuxa_app đầu tiên (không tốn thêm vòng mạng). Đệm kết quả 15 giây trong bộ nhớ cho các API gọi đồng thời khi tải trang.
// ---------------------------------------------------------------------
interface CachedSession extends SessionGate {
  exp: number;
}
const sessionCache = new Map<string, CachedSession>();

export function invalidateSessionCache(sid?: string) {
  if (sid) sessionCache.delete(sid);
  else sessionCache.clear();
}

/**
 * Tài khoản dùng mật khẩu tạm / vai trò bắt buộc 2FA mà chưa bật ⇒ CHỈ được gọi các API xác thực (/api/v1/auth/*: xem phiên, đổi mật khẩu,
 * thiết lập 2FA, đăng xuất). Giao diện hiện màn hình chặn tương ứng (SecurityGate) — chặn ở API để không lách được bằng cách gọi thẳng.
 */
function enforceGate(gate: SessionGate, pathname: string) {
  if (pathname.startsWith("/api/v1/auth/")) return;
  if (gate.mustChange) throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Bạn đang dùng mật khẩu tạm — hãy đổi mật khẩu mới trước khi tiếp tục.");
  if (gate.needMfa) throw new ApiError(403, "MFA_REQUIRED", "Vai trò của bạn bắt buộc bật xác thực 2 bước — hãy thiết lập trước khi tiếp tục.");
}

/** Header Server-Timing (DevTools → Network → Timing): số vòng mạng DB, thời gian DB, chờ kết nối, tổng. Tắt bằng SERVER_TIMING=0. */
const SERVER_TIMING = process.env.SERVER_TIMING !== "0";
function serverTiming(stats: DbStats, totalMs: number): string {
  const f = (n: number) => n.toFixed(1);
  return [
    `db;dur=${f(stats.dbMs)};desc="${stats.roundTrips} round-trips/${stats.txs} tx"`,
    `conn;dur=${f(stats.connMs)}`,
    `app;dur=${f(Math.max(0, totalMs - stats.dbMs - stats.connMs))}`,
    `total;dur=${f(totalMs)}`,
  ].join(", ");
}

/** Đường dẫn với giá trị tham số thay bằng [tên] (vd. /api/v1/events/[id]/cancel) — để gộp lỗi theo route. */
function routePattern(pathname: string, params: Record<string, string>): string {
  const byValue = new Map<string, string>();
  for (const [k, v] of Object.entries(params)) if (v && !byValue.has(v)) byValue.set(v, k);
  return pathname
    .split("/")
    .map((seg) => {
      let dec = seg;
      try {
        dec = decodeURIComponent(seg);
      } catch {
        /* giữ nguyên */
      }
      const k = byValue.get(dec);
      return k ? `[${k}]` : seg;
    })
    .join("/");
}

const isReadOnlyTxError = (e: unknown) => (e as { code?: string })?.code === "25006";

/** Bọc một Route Handler: xác thực, CSRF, transaction theo request, ánh xạ lỗi RFC 9457, Server-Timing, nhật ký lỗi. */
export function api(opts: RouteOptions, handler: Handler) {
  const auth = opts.auth ?? "member";
  return async (req: NextRequest, args: RouteArgs = {}): Promise<Response> => {
    const stats: DbStats = { roundTrips: 0, txs: 0, dbMs: 0, connMs: 0, label: `${req.method} ${req.nextUrl.pathname}` };
    const t0 = performance.now();
    const res = await dbStats.run(stats, () => handle(req, args));
    if (SERVER_TIMING) {
      try {
        // Route có Server-Timing riêng (vd. tải tệp: read, process, storage…) ⇒ nối thêm số đo DB, không ghi đè
        const own = res.headers.get("server-timing");
        const ours = serverTiming(stats, performance.now() - t0);
        res.headers.set("server-timing", own ? `${own}, ${ours.replace(/(^|, )total;/, "$1api;")}` : ours);
      } catch {
        /* Response.redirect có header bất biến — bỏ qua */
      }
    }
    return res;
  };

  async function handle(req: NextRequest, args: RouteArgs): Promise<Response> {
    const requestId = randomUUID();
    const ip = clientIp(req);
    const started = Date.now();
    const method = req.method.toUpperCase();
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(args.params ?? {})) params[k] = Array.isArray(v) ? v.join("/") : v;
    // Nhật ký hoạt động: thao tác ghi của người đã đăng nhập (db/app/1016_activity_logs.sql). Không lưu nội dung gửi lên.
    let actor: string | null = null;
    const track = (status: number, errorCode: string | null) => {
      if (!actor || ["GET", "HEAD", "OPTIONS"].includes(method)) return Promise.resolve();
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
        if (auth === "member" && session.pnd) throw new ApiError(403, "PENDING_APPROVAL", "Tài khoản của bạn đang chờ người quản lý duyệt.");
      }
      if ((opts.csrf ?? true) && !bearer && !["GET", "HEAD", "OPTIONS"].includes(method)) checkCsrf(req);

      const userId = session?.sub ?? null;
      const gated = !!session && auth !== "public";
      const cached = session ? sessionCache.get(session.sid) : undefined;
      let sessionChecked = !!cached && cached.exp > Date.now();
      if (sessionChecked && gated) enforceGate(cached!, req.nextUrl.pathname);

      const runHandler = async (readOnly: boolean): Promise<unknown> => {
        const run = <T,>(role: DbRole, fn: (tx: Tx) => Promise<T>) => {
          const check = !!session && role === "luuxa_app" && !sessionChecked;
          if (check) sessionChecked = true;
          return withTx(
            {
              userId: role === "luuxa_auth" ? null : userId,
              requestId,
              ip,
              checkSessionId: check ? session!.sid : undefined,
              onSession: check
                ? (gate) => {
                    // đang bị chặn (mật khẩu tạm / chưa bật 2FA) ⇒ đệm rất ngắn để vừa đổi xong là dùng được ngay trên mọi instance
                    sessionCache.set(session!.sid, { ...gate, exp: Date.now() + (gate.mustChange || gate.needMfa ? 2_000 : 15_000) });
                    if (gated) enforceGate(gate, req.nextUrl.pathname);
                  }
                : undefined,
              readOnly: readOnly && role === "luuxa_app",
            },
            role,
            fn,
          ).catch((e) => {
            if (e instanceof SessionRevokedError) {
              sessionCache.delete(session!.sid);
              throw new ApiError(401, "SESSION_REVOKED", "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.");
            }
            throw e;
          });
        };

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
              raw = deepNfc(await req.clone().json());
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
        return handler(ctx);
      };

      // GET/HEAD chỉ đọc: transaction READ ONLY, không chờ COMMIT (xem withTx). Route GET cần ghi đặt opts.writes = true.
      const readOnly = (method === "GET" || method === "HEAD") && !opts.writes;
      let out: unknown;
      try {
        out = await runHandler(readOnly);
      } catch (e) {
        if (!readOnly || !isReadOnlyTxError(e)) throw e;
        console.warn(`[api] ${method} ${routePattern(req.nextUrl.pathname, params)} có ghi dữ liệu — hãy đặt { writes: true } cho route này. Chạy lại ở chế độ ghi.`);
        out = await runHandler(false);
      }
      const res = out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
      res.headers.set("x-request-id", requestId);
      res.headers.set("cache-control", res.headers.get("cache-control") ?? "no-store");
      await track(res.status, null);
      // Sau mỗi thao tác ghi thành công có thể đã phát sinh thông báo ⇒ gửi đẩy/email nền (không làm chậm phản hồi)
      if (res.status < 400 && !["GET", "HEAD", "OPTIONS"].includes(method) && outboxConfigured()) void inBackground(dispatchOutbox());
      return res;
    } catch (e) {
      const err = toApiError(e);
      await track(err.status, err.code);
      // Lỗi phía máy chủ (5xx) ⇒ nhật ký lỗi (Cài đặt → Hệ thống). Lỗi 4xx là lỗi nghiệp vụ/người dùng, không ghi.
      if (err.status >= 500) {
        void inBackground(
          recordErrorEvent({
            source: req.nextUrl.pathname.startsWith("/api/v1/auth/") ? "auth" : "server",
            route: `${method} ${routePattern(req.nextUrl.pathname, params)}`,
            code: err.code,
            message: err.internal ?? err.message,
            requestId,
            userId: actor,
          }),
        );
      }
      return problemResponse(err, requestId, req.nextUrl.pathname);
    }
  }
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
