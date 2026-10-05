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

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Chưa cấu hình biến môi trường DATABASE_URL trên Vercel / server.");
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
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 5 : 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
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
    const client = await pool.connect();
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

