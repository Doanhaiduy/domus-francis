import "server-only";
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

function createPool() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("Chưa cấu hình biến môi trường DATABASE_URL trên Vercel / server.");
  const url = normalizeDatabaseUrl(rawUrl);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // Fallback if URL is non-standard
  }
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(host);
  const isCloudOrProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
  if (!isLocal && !isCloudOrProd && process.env.ALLOW_REMOTE_DB !== "true" && !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    // Ràng buộc an toàn: cảnh báo nếu chưa cho phép kết nối DB từ xa ở môi trường local.
    throw new Error(`DATABASE_URL đang trỏ tới host từ xa (${host}). Đặt ALLOW_REMOTE_DB=true trong .env.local để cho phép.`);
  }
  // Serverless: mỗi instance chỉ giữ vài kết nối (nhiều instance chạy song song); đóng sớm kết nối nhàn rỗi để trả lại pooler.
  const serverless = Boolean(process.env.VERCEL);
  const envMax = Number(process.env.DB_POOL_MAX);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: Number.isInteger(envMax) && envMax > 0 ? envMax : serverless ? 3 : 20,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 15_000,
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

export interface TxContext {
  userId?: string | null;
  requestId?: string;
  ip?: string | null;
}

export type Tx = PoolClient;

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

function escapeSqlLiteral(val: string | null | undefined): string {
  if (val === null || val === undefined) return "''";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/**
 * Một request = một transaction:
 *   Gộp BEGIN + SET LOCAL ROLE + set_config(...) thành MỘT vòng mạng duy nhất để giảm độ trễ khi kết nối xa.
 * Kết nối đăng nhập bằng luuxa_api (NOINHERIT) nên không có quyền gì nếu chưa SET ROLE.
 * Tự thử lại tối đa 2 lần khi gặp serialization failure / deadlock.
 */
export async function withTx<T>(ctx: TxContext, role: DbRole, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ROLES.has(role)) throw new Error(`Vai trò DB không hợp lệ: ${role}`);
  for (let attempt = 0; ; attempt++) {
    const client = await connectWithRetry();
    try {
      await client.query(
        `BEGIN;
SET LOCAL ROLE ${role};
SELECT set_config('app.current_user_id', ${escapeSqlLiteral(ctx.userId)}, true),
       set_config('app.request_id', ${escapeSqlLiteral(ctx.requestId)}, true),
       set_config('app.client_ip', ${escapeSqlLiteral(ctx.ip)}, true),
       set_config('statement_timeout', '15s', true),
       set_config('lock_timeout', '5s', true),
       set_config('idle_in_transaction_session_timeout', '30s', true);`
      );
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      const code = (e as { code?: string }).code;
      if (code && RETRYABLE.has(code) && attempt < 2) continue;
      throw e;
    } finally {
      client.release();
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

export type BatchItem = readonly [sql: string, params?: readonly unknown[]];

/** Chạy một loạt truy vấn tuần tự trong cùng transaction `tx`. */
export async function batch<R extends QueryResultRow = Record<string, any>>(
  tx: Tx,
  items: readonly BatchItem[]
): Promise<QueryResult<R>[]> {
  const results: QueryResult<R>[] = [];
  for (const [sql, params] of items) {
    results.push(await tx.query<R>(sql, params ? (params as unknown[]) : []));
  }
  return results;
}

