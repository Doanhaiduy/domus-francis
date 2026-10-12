import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// ---------------------------------------------------------------------
// Kiểu dữ liệu trả về từ PostgreSQL
//  - bigint (tiền VND, đếm): số JS (mọi giá trị VND < 2^53)
//  - numeric (điểm số, tín chỉ): số thực
//  - date: giữ chuỗi 'YYYY-MM-DD' — tránh lệch múi giờ khi parse thành Date
// ---------------------------------------------------------------------
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
types.setTypeParser(1082, (v) => v);

declare global {
  // eslint-disable-next-line no-var
  var __luuxaPool: Pool | undefined;
}

/**
 * Supabase Supavisor: cổng 5432 = "session mode" (mỗi client chiếm một kết nối thật tới khi đóng; giới hạn pool_size ≈ 15 ⇒
 * lỗi EMAXCONNSESSION khi nhiều hàm serverless cùng mở), cổng 6543 = "transaction mode" (kết nối chỉ bị giữ trong một transaction).
 * Ứng dụng chỉ dùng transaction (BEGIN … COMMIT, SET LOCAL ROLE) nên luôn dùng cổng 6543 — tự đổi nếu cấu hình nhầm 5432.
 */
export function normalizeDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".pooler.supabase.com") && (u.port === "" || u.port === "5432")) {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    // giữ nguyên nếu không phân tích được
  }
  return raw;
}

/**
 * TLS tới DB ở xa. Mặc định mã hóa nhưng KHÔNG kiểm chứng chỉ (Supabase dùng CA riêng). Đặt DB_SSL_CA = nội dung PEM
 * (bắt đầu bằng -----BEGIN CERTIFICATE-----) hoặc đường dẫn tệp .crt (tải ở Supabase → Project Settings → Database → SSL) để kiểm
 * chứng chỉ thật (chống giả mạo máy chủ DB).
 */
function sslOptions(isLocal: boolean): { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (isLocal) return undefined;
  const raw = process.env.DB_SSL_CA?.trim();
  if (raw) {
    const pem = raw.startsWith("-----BEGIN") ? raw.replace(/\\n/g, "\n") : existsSync(raw) ? readFileSync(raw, "utf8") : null;
    if (pem) return { rejectUnauthorized: true, ca: pem };
    console.error("[db] DB_SSL_CA không phải PEM hợp lệ / không tìm thấy tệp — dùng TLS không kiểm chứng chỉ.");
  }
  return { rejectUnauthorized: false };
}

function createPool() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("Chưa cấu hình biến môi trường DATABASE_URL trên Vercel / server.");
  const url = normalizeDatabaseUrl(rawUrl);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // URL không chuẩn — để pg tự phân tích
  }
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(host);
  const isCloudOrProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
  if (!isLocal && !isCloudOrProd && process.env.ALLOW_REMOTE_DB !== "true" && !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    // Ràng buộc an toàn: cảnh báo nếu chưa cho phép kết nối DB từ xa ở môi trường local.
    throw new Error(`DATABASE_URL đang trỏ tới host từ xa (${host}). Đặt ALLOW_REMOTE_DB=true trong .env.local để cho phép.`);
  }
  // Serverless: mỗi instance chỉ giữ vài kết nối (nhiều instance chạy song song); đóng sớm kết nối nhàn rỗi để trả lại pooler.
  // Máy chủ chạy lâu (local / tự host): giữ kết nối nhàn rỗi 5 phút — mở kết nối mới tới DB ở xa tốn DNS + TCP + TLS + SCRAM ≈ 5–8 vòng mạng.
  const serverless = Boolean(process.env.VERCEL);
  const envMax = Number(process.env.DB_POOL_MAX);
  const envIdle = Number(process.env.DB_IDLE_TIMEOUT_MS);
  const pool = new Pool({
    connectionString: url,
    ssl: sslOptions(isLocal),
    max: Number.isInteger(envMax) && envMax > 0 ? envMax : serverless ? 3 : 20,
    idleTimeoutMillis: Number.isInteger(envIdle) && envIdle > 0 ? envIdle : serverless ? 10_000 : 300_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    allowExitOnIdle: serverless,
    application_name: "luuxa-web",
  });
  pool.on("error", (e) => console.error("[db] lỗi kết nối nhàn rỗi:", e.message));
  return pool;
}

export const pool: Pool = globalThis.__luuxaPool ?? (globalThis.__luuxaPool = createPool());

/** Vai trò DB của một transaction (xem Phần 2.3 tài liệu thiết kế). */
export type DbRole = "luuxa_app" | "luuxa_auth" | "luuxa_worker";
const ROLES: ReadonlySet<DbRole> = new Set(["luuxa_app", "luuxa_auth", "luuxa_worker"]);

/** Trạng thái tài khoản đọc cùng lượt kiểm tra phiên (không tốn thêm vòng mạng). */
export interface SessionGate {
  /** Mật khẩu tạm do người quản lý cấp/đặt lại — phải đổi trước khi dùng tiếp. */
  mustChange: boolean;
  /** Vai trò bắt buộc xác thực 2 bước (settings auth.mfa_required_roles) mà chưa bật. */
  needMfa: boolean;
}

export interface TxContext {
  userId?: string | null;
  requestId?: string;
  ip?: string | null;
  /** Nếu có: kiểm tra phiên đăng nhập còn hiệu lực NGAY TRONG lượt gửi BEGIN (không tốn thêm vòng mạng). */
  checkSessionId?: string;
  /** Nhận trạng thái tài khoản đọc cùng lượt kiểm tra phiên; ném lỗi ở đây ⇒ cả transaction bị hủy (ROLLBACK). */
  onSession?: (gate: SessionGate) => void;
  /** Request chỉ đọc (GET): transaction READ ONLY, không chờ COMMIT. */
  readOnly?: boolean;
}

/** Phiên đã bị thu hồi/hết hạn (phát hiện trong lượt gửi BEGIN). */
export class SessionRevokedError extends Error {}

// ---------------------------------------------------------------------
// Đo hiệu năng theo request (header Server-Timing): số vòng mạng tới DB, thời gian chờ lấy kết nối, thời gian DB.
// ---------------------------------------------------------------------
export interface DbStats {
  /** Số lệnh gửi tới DB = số vòng mạng (BEGIN-gộp, từng truy vấn, COMMIT). */
  roundTrips: number;
  txs: number;
  /** Tổng thời gian chờ DB trả lời (ms). */
  dbMs: number;
  /** Tổng thời gian chờ lấy kết nối từ pool (cao ⇒ đang mở kết nối mới hoặc pool cạn). */
  connMs: number;
  /** Nhãn request (METHOD /path) — chỉ dùng khi DB_TRACE=1 để in từng câu SQL. */
  label?: string;
}
const TRACE = process.env.DB_TRACE === "1";
export const dbStats = new AsyncLocalStorage<DbStats>();

// ---------------------------------------------------------------------
// Nhúng tham số $1..$n vào câu SQL dưới dạng literal (dùng đúng quy tắc prepareValue + escapeLiteral của pg) để gửi NHIỀU câu
// trong MỘT vòng mạng (simple query protocol). Literal trong nháy đơn có kiểu "unknown" giống tham số không khai kiểu
// của extended protocol nên PostgreSQL suy kiểu như cũ. Bỏ qua $n nằm trong chuỗi, định danh, chú thích, $tag$…$tag$.
// Viết lại tại đây vì webpack không cho nạp động "pg/lib/utils" trong bundle máy chủ.
// ---------------------------------------------------------------------
const pgArrayElement = (s: string) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
function pgArray(val: readonly unknown[]): string {
  let out = "{";
  val.forEach((item, i) => {
    if (i > 0) out += ",";
    if (item == null) out += "NULL";
    else if (Array.isArray(item)) out += pgArray(item);
    else if (ArrayBuffer.isView(item)) out += "\\\\x" + Buffer.from(item.buffer, item.byteOffset, item.byteLength).toString("hex");
    else out += pgArrayElement(String(prepareValue(item)));
  });
  return out + "}";
}
function pgDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  let off = -d.getTimezoneOffset();
  const sign = off < 0 ? "-" : "+";
  off = Math.abs(off);
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${sign}${p(Math.floor(off / 60))}:${p(off % 60)}`;
}
function prepareValue(val: unknown): string | Buffer | null {
  if (val == null) return null;
  if (typeof val === "object") {
    if (Buffer.isBuffer(val)) return val;
    if (ArrayBuffer.isView(val)) return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
    if (val instanceof Date) return pgDate(val);
    if (Array.isArray(val)) return pgArray(val);
    const tp = (val as { toPostgres?: (f: typeof prepareValue) => unknown }).toPostgres;
    if (typeof tp === "function") return prepareValue(tp.call(val, prepareValue));
    return JSON.stringify(val);
  }
  return String(val);
}
function escapeLiteral(str: string): string {
  let backslash = false;
  let out = "'";
  for (const c of str) {
    if (c === "'") out += "''";
    else if (c === "\\") {
      out += "\\\\";
      backslash = true;
    } else out += c;
  }
  out += "'";
  return backslash ? ` E${out}` : out;
}

function literal(v: unknown): string {
  const pv = prepareValue(v);
  if (pv === null) return "NULL";
  if (Buffer.isBuffer(pv)) return escapeLiteral(`\\x${pv.toString("hex")}`);
  return escapeLiteral(pv);
}

const IDENT = /[A-Za-z0-9_$\u0080-￿]/;
export function inlineParams(sql: string, params?: readonly unknown[]): string {
  if (!params || params.length === 0) return sql;
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    let j = i;
    if (c === "'") {
      const esc = i > 0 && (sql[i - 1] === "E" || sql[i - 1] === "e") && !(i > 1 && IDENT.test(sql[i - 2]));
      j++;
      while (j < n) {
        if (esc && sql[j] === "\\") j += 2;
        else if (sql[j] === "'") {
          if (sql[j + 1] === "'") j += 2;
          else {
            j++;
            break;
          }
        } else j++;
      }
    } else if (c === '"') {
      j++;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') j += 2;
          else {
            j++;
            break;
          }
        } else j++;
      }
    } else if (c === "-" && d === "-") {
      while (j < n && sql[j] !== "\n") j++;
    } else if (c === "/" && d === "*") {
      let depth = 1;
      j += 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
    } else if (c === "$" && !(i > 0 && IDENT.test(sql[i - 1]))) {
      const pm = /^\$(\d+)/.exec(sql.slice(i, i + 12));
      if (pm) {
        const idx = Number(pm[1]);
        if (idx < 1 || idx > params.length) throw new Error(`Thiếu tham số $${idx}`);
        out += literal(params[idx - 1]);
        i += pm[0].length;
        continue;
      }
      const dq = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (dq) {
        const end = sql.indexOf(dq[0], i + dq[0].length);
        j = end < 0 ? n : end + dq[0].length;
      } else j++;
    } else j++;
    out += sql.slice(i, j);
    i = j;
  }
  return out;
}

type QR = { rows: Record<string, unknown>[]; rowCount: number | null };
export type BatchItem = readonly [sql: string, params?: readonly unknown[]];

interface TxState {
  /** Lệnh mở đầu chưa gửi (BEGIN; SET LOCAL ROLE…) — được ghép vào câu SQL đầu tiên của request. */
  preamble: string | null;
  /** Số kết quả do phần mở đầu sinh ra (để tách khỏi kết quả của câu SQL nghiệp vụ). */
  preambleResults: number;
  checkSession: boolean;
  onSession?: (gate: SessionGate) => void;
}

interface TxExtras {
  __batch(items: readonly BatchItem[]): Promise<QR[]>;
  __flushPreamble(): Promise<void>;
}

function makeTx(raw: PoolClient, stats: DbStats | undefined, st: TxState): PoolClient {
  const send = async (text: string, params?: readonly unknown[]): Promise<unknown> => {
    if (stats) {
      stats.roundTrips++;
      if (TRACE) console.log(`[sql] ${stats.label ?? ""} #${stats.roundTrips} ${text.replace(/\s+/g, " ").slice(0, 160)}`);
    }
    const t0 = performance.now();
    try {
      return await (params ? raw.query(text, params as unknown[]) : raw.query(text));
    } finally {
      if (stats) stats.dbMs += performance.now() - t0;
    }
  };
  /** Gửi phần mở đầu (nếu còn) ghép với `body` (đã nhúng tham số) trong một vòng mạng; trả về các kết quả của `body`. */
  const withPreamble = async (body: string | null): Promise<QR[]> => {
    const pre = st.preamble!;
    st.preamble = null;
    const res = (await send(body ? `${pre};\n${body}` : pre)) as QR | QR[];
    const list = Array.isArray(res) ? res : [res];
    if (st.checkSession) {
      const row = list[st.preambleResults - 1]?.rows[0] as { ok?: boolean; must_change?: boolean; need_mfa?: boolean } | undefined;
      if (!row?.ok) throw new SessionRevokedError();
      st.onSession?.({ mustChange: !!row.must_change, needMfa: !!row.need_mfa });
    }
    return list.slice(st.preambleResults);
  };
  const query = async (text: unknown, params?: readonly unknown[]): Promise<unknown> => {
    if (st.preamble !== null && typeof text === "string") {
      let body: string | null;
      try {
        body = inlineParams(text, params);
      } catch {
        body = null; // không nhúng được ⇒ gửi phần mở đầu riêng rồi chạy câu SQL như thường
      }
      if (body !== null) {
        const out = await withPreamble(body);
        return out.length === 1 ? out[0] : out;
      }
    }
    if (st.preamble !== null) await withPreamble(null);
    return send(text as string, params);
  };
  const extras: TxExtras = {
    __batch: async (items) => {
      if (!items.length) return [];
      const body = items.map(([q, p]) => inlineParams(q, p)).join(";\n");
      if (st.preamble !== null) return withPreamble(body);
      const res = (await send(body)) as QR | QR[];
      return Array.isArray(res) ? res : [res];
    },
    __flushPreamble: async () => {
      if (st.preamble !== null) await withPreamble(null);
    },
  };
  return new Proxy(raw, {
    get(target, prop) {
      if (prop === "query") return query;
      if (prop === "__batch" || prop === "__flushPreamble") return extras[prop];
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

export type Tx = PoolClient;

/**
 * Chạy nhiều câu SQL ĐỘC LẬP trong MỘT vòng mạng (thay cho nhiều lần `await tx.query` nối tiếp).
 * Câu sau không được dùng kết quả của câu trước; câu nào lỗi thì cả transaction lỗi như bình thường (giống chạy tuần tự).
 *   const [a, b] = await batch(tx, [["SELECT … WHERE id = $1", [id]], ["SELECT …"]]);
 *   a.rows, b.rows[0] …
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function batch<R extends QueryResultRow = Record<string, any>>(tx: Tx, items: readonly BatchItem[]): Promise<QueryResult<R>[]> {
  const ext = tx as unknown as Partial<TxExtras>;
  if (ext.__batch) return (await ext.__batch(items)) as unknown as QueryResult<R>[];
  const out: QueryResult<R>[] = [];
  for (const [q, p] of items) out.push(await tx.query<R>(q, p ? (p as unknown[]) : []));
  return out;
}

/** Mở sẵn vài kết nối khi máy chủ khởi động để lần tải trang đầu không phải chờ bắt tay TLS với DB ở xa. */
export async function warmPool(n = Number(process.env.DB_POOL_WARM) || 3) {
  const clients = await Promise.allSettled(Array.from({ length: n }, () => pool.connect()));
  for (const c of clients) if (c.status === "fulfilled") c.value.release();
}

const RETRYABLE = new Set(["40001", "40P01"]);

/** Pooler báo hết chỗ tạm thời (EMAXCONNSESSION / "max clients reached") ⇒ chờ một chút rồi thử lại thay vì lỗi ngay. */
async function connectWithRetry(): Promise<PoolClient> {
  for (let i = 0; ; i++) {
    try {
      return await pool.connect();
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      const saturated = /EMAXCONNSESSION|max clients reached|too many clients|remaining connection slots/i.test(msg);
      if (!saturated || i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1) + Math.random() * 150));
    }
  }
}

/**
 * Một request = một transaction, tối ưu cho DB ở xa (mỗi vòng mạng tới Supabase tốn hàng chục ms):
 *  - Phần mở đầu `BEGIN; SET LOCAL ROLE <vai trò>; set_config(user, request, ip, timeout…); [kiểm tra phiên + trạng thái tài khoản]`
 *    KHÔNG gửi riêng mà ghép vào câu SQL đầu tiên của request ⇒ tiết kiệm 1 vòng mạng.
 *  - `readOnly` (request GET): transaction READ ONLY và trả kết quả ngay, COMMIT chạy nền ⇒ tiết kiệm thêm 1 vòng mạng
 *    (transaction chỉ đọc thì COMMIT không thể làm mất dữ liệu).
 * Kết nối đăng nhập bằng luuxa_api (NOINHERIT) nên không có quyền gì nếu chưa SET ROLE.
 * Tự thử lại tối đa 2 lần khi gặp serialization failure / deadlock.
 */
export async function withTx<T>(ctx: TxContext, role: DbRole, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ROLES.has(role)) throw new Error(`Vai trò DB không hợp lệ: ${role}`);
  const stats = dbStats.getStore();
  for (let attempt = 0; ; attempt++) {
    const c0 = performance.now();
    const raw = await connectWithRetry();
    if (stats) {
      stats.connMs += performance.now() - c0;
      stats.txs++;
    }
    const lit = (v: string | null | undefined) => escapeLiteral(v ?? "");
    const st: TxState = {
      preamble:
        `BEGIN${ctx.readOnly ? " READ ONLY" : ""};\nSET LOCAL ROLE ${role};\n` +
        `SELECT set_config('app.current_user_id', ${lit(ctx.userId)}, true), set_config('app.request_id', ${lit(ctx.requestId)}, true), ` +
        `set_config('app.client_ip', ${lit(ctx.ip)}, true), set_config('statement_timeout', '15s', true), ` +
        `set_config('lock_timeout', '5s', true), set_config('idle_in_transaction_session_timeout', '30s', true)` +
        (ctx.checkSessionId
          ? `;\nSELECT EXISTS (SELECT 1 FROM auth_sessions WHERE id = ${lit(ctx.checkSessionId)}::uuid AND revoked_at IS NULL AND expires_at > now()) AS ok,` +
            ` COALESCE((SELECT u.must_change_password FROM users u WHERE u.id = app.current_user_id()), false) AS must_change,` +
            ` (app.fn_mfa_required() AND NOT EXISTS (SELECT 1 FROM user_mfa_factors f WHERE f.user_id = app.current_user_id() AND f.confirmed_at IS NOT NULL)) AS need_mfa`
          : ""),
      preambleResults: ctx.checkSessionId ? 4 : 3,
      checkSession: !!ctx.checkSessionId,
      onSession: ctx.onSession,
    };
    const client = makeTx(raw, stats, st);
    let released = false;
    const release = (err?: Error) => {
      if (released) return;
      released = true;
      raw.release(err);
    };
    try {
      const result = await fn(client);
      if (st.preamble !== null) {
        // Request không chạy câu SQL nào: không có gì để commit — chỉ còn kiểm tra phiên (nếu được yêu cầu).
        if (st.checkSession) {
          await (client as unknown as TxExtras).__flushPreamble();
          await raw.query("COMMIT");
        }
      } else if (ctx.readOnly) {
        // Không bắt người dùng chờ COMMIT của transaction chỉ đọc
        released = true;
        raw.query("COMMIT").then(
          () => raw.release(),
          (e: Error) => raw.release(e),
        );
      } else {
        if (stats) stats.roundTrips++;
        const t0 = performance.now();
        await raw.query("COMMIT");
        if (stats) stats.dbMs += performance.now() - t0;
      }
      return result;
    } catch (e) {
      if (st.preamble === null) await raw.query("ROLLBACK").catch(() => {});
      const code = (e as { code?: string }).code;
      if (code && RETRYABLE.has(code) && attempt < 2) {
        release();
        continue;
      }
      throw e;
    } finally {
      release();
    }
  }
}

/** Tiện ích: một câu truy vấn, trả về mảng dòng. */
export async function rows<R extends QueryResultRow = Record<string, unknown>>(tx: Tx, sql: string, params: unknown[] = []): Promise<R[]> {
  return (await tx.query<R>(sql, params)).rows;
}

/** Một dòng hoặc null. */
export async function one<R extends QueryResultRow = Record<string, unknown>>(tx: Tx, sql: string, params: unknown[] = []): Promise<R | null> {
  return (await tx.query<R>(sql, params)).rows[0] ?? null;
}
