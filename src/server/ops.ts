import "server-only";
import { createHash } from "node:crypto";
import { withTx, type Tx } from "./db";

// =====================================================================
// Tiện ích vận hành dùng chung (db/app/1041_ops_core.sql):
//   • rateLimit()          giới hạn tần suất lưu trong CSDL (đúng khi chạy serverless nhiều instance)
//   • recordErrorEvent()   ghi/gộp lỗi vào error_events (Vercel Hobby chỉ giữ log ~1 giờ) — không bao giờ ném lỗi
//   • notifyAdminsOnce()   báo Admin (hoặc vai trò khác) MỘT lần theo khóa chống trùng (system_post_log)
//   • startJobRun()/finishJobRun()  nhật ký từng lượt chạy tác vụ nền (job_runs)
// =====================================================================

/** Băm khóa (không lưu IP/email thô): sha256(phần tử… + muối) cắt 32 ký tự hex. */
export function hashKey(...parts: (string | null | undefined)[]): string {
  const pepper = process.env.RATE_LIMIT_PEPPER || process.env.PII_BIDX_KEY || "luuxa";
  return createHash("sha256")
    .update(parts.map((p) => p ?? "").join("|") + "|" + pepper)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Giới hạn tần suất: true = được phép (đã tính một lần dùng), false = đã vượt `max` lần trong `windowSec` giây.
 * Truyền `tx` để chạy trong transaction sẵn có (mọi vai trò luuxa_app/auth/worker đều gọi được hàm); không truyền ⇒ tự mở transaction worker.
 * Lỗi CSDL ⇒ cho qua (không chặn người dùng vì hệ thống đếm lỗi) nhưng ghi log.
 */
export async function rateLimit(tx: Tx | null, key: string, windowSec: number, max: number): Promise<boolean> {
  const run = async (t: Tx) => (await t.query<{ ok: boolean }>("SELECT app.fn_rate_limit_hit($1, $2, $3) AS ok", [key.slice(0, 200), windowSec, max])).rows[0]?.ok !== false;
  try {
    return tx ? await run(tx) : await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", run);
  } catch (e) {
    console.error("[rate-limit] lỗi:", (e as Error).message);
    return true;
  }
}

// ---------------------------------------------------------------------
// Nhật ký lỗi
// ---------------------------------------------------------------------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /api/v1/members/0190…/roles ⇒ /api/v1/members/:id/roles (gộp lỗi cùng một route). */
export function normalizeRoute(pathname: string): string {
  return pathname
    .replace(UUID_RE, ":id")
    .replace(/\/\d{2,}(?=\/|$)/g, "/:n")
    .slice(0, 300);
}

/** Che dữ liệu cá nhân / bí mật có thể lọt vào thông điệp lỗi (email, SĐT, dãy số dài, token, chuỗi kết nối). */
export function scrubMessage(msg: string): string {
  return msg
    .replace(/postgres(ql)?:\/\/[^\s"')]+/gi, "postgresql://***")
    .replace(/(bearer|apikey|token|secret|password)[=: ]+[^\s"',)]+/gi, "$1=***")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(UUID_RE, "<id>")
    .replace(/\+?\d[\d .-]{8,}\d/g, "<số>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export interface ErrorEventInput {
  source: "server" | "client" | "cron" | "csp" | "auth";
  /** vd. "POST /api/v1/members/:id" hoặc đường dẫn trang "/thu-chi" */
  route?: string | null;
  code?: string | null;
  message: string;
  requestId?: string | null;
  userId?: string | null;
}

/** Dấu vân tay để gộp: cùng nguồn + route + mã + thông điệp (đã bỏ số/id) ⇒ cùng một dòng. */
export function errorFingerprint(e: Pick<ErrorEventInput, "source" | "route" | "code" | "message">): string {
  const msg = scrubMessage(e.message).replace(/\d+/g, "#").slice(0, 200);
  return createHash("sha1").update(`${e.source}|${e.route ?? ""}|${e.code ?? ""}|${msg}`).digest("hex");
}

/** Ghi/gộp một lỗi. KHÔNG bao giờ ném lỗi (ghi nhật ký lỗi hỏng thì chỉ in console). */
export async function recordErrorEvent(e: ErrorEventInput): Promise<void> {
  try {
    const message = scrubMessage(e.message || "(không có thông điệp)") || "(không có thông điệp)";
    await withTx({ requestId: e.requestId ?? undefined }, "luuxa_worker", (tx) =>
      tx.query("SELECT app.fn_error_event_record($1, $2, $3, $4, $5, $6, $7)", [
        errorFingerprint(e),
        e.source,
        e.route ?? null,
        e.code ?? null,
        message,
        e.requestId ?? null,
        e.userId && IS_UUID.test(e.userId) ? e.userId : null,
      ]),
    );
  } catch (err) {
    console.error("[error-events] không ghi được:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------
// Báo Admin một lần
// ---------------------------------------------------------------------
export interface NotifyOnceOptions {
  /** Mặc định system.ops_alert */
  type?: string;
  /** Mặc định ['admin'] */
  roles?: string[];
  /** Đường dẫn trong ứng dụng mở khi bấm thông báo (payload.link) */
  link?: string | null;
}

/**
 * Gửi thông báo cho các vai trò (mặc định Admin) đúng MỘT lần theo `key` (system_post_log). Trả true nếu đã gửi lần này.
 * Dùng khóa có kèm ngày/tuần để nhắc lại theo chu kỳ, vd. `ops-alert:cron-morning:2026-10-12`.
 */
export async function notifyAdminsOnce(key: string, title: string, body: string, o: NotifyOnceOptions = {}): Promise<boolean> {
  try {
    return await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
      const first = (await tx.query("INSERT INTO system_post_log (key, kind) VALUES ($1, 'ops') ON CONFLICT (key) DO NOTHING RETURNING key", [key.slice(0, 200)])).rowCount === 1;
      if (!first) return false;
      await tx.query("SELECT app.fn_notify_roles($1::text[], $2, $3, $4, $5::jsonb)", [
        o.roles ?? ["admin"],
        o.type ?? "system.ops_alert",
        title.slice(0, 200),
        body.slice(0, 1000),
        JSON.stringify(o.link ? { link: o.link } : {}),
      ]);
      return true;
    });
  } catch (e) {
    console.error("[ops] gửi cảnh báo lỗi:", (e as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------
// Nhật ký lượt chạy tác vụ nền
// ---------------------------------------------------------------------
export interface JobStep {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
  /** Ghi chú ngắn (vd. "đã gửi 3 tin") */
  info?: string[];
}

export async function startJobRun(kind: string, requestId?: string): Promise<string | null> {
  try {
    return await withTx({ requestId }, "luuxa_worker", async (tx) =>
      (await tx.query<{ id: string }>("INSERT INTO job_runs (kind, request_id) VALUES ($1, $2) RETURNING id", [kind, requestId ?? null])).rows[0].id,
    );
  } catch (e) {
    console.error("[job-runs] không ghi được lượt chạy:", (e as Error).message);
    return null;
  }
}

export async function finishJobRun(id: string | null, r: { ok: boolean; steps: JobStep[]; summary?: string | null }): Promise<void> {
  if (!id) return;
  try {
    await withTx({}, "luuxa_worker", (tx) =>
      tx.query("UPDATE job_runs SET finished_at = now(), ok = $2, steps = $3::jsonb, summary = $4 WHERE id = $1", [
        id,
        r.ok,
        JSON.stringify(r.steps.map((s) => ({ ...s, error: s.error ? scrubMessage(s.error) : undefined, info: s.info?.slice(0, 30).map((x) => x.slice(0, 300)) }))),
        r.summary ? r.summary.slice(0, 2000) : null,
      ]),
    );
  } catch (e) {
    console.error("[job-runs] không cập nhật được lượt chạy:", (e as Error).message);
  }
}

/** Chạy hàm nền (waitUntil trên Vercel; nơi khác: chạy không chờ). Không bao giờ ném lỗi. */
export async function inBackground(p: Promise<unknown>): Promise<void> {
  const safe = p.catch((e) => console.error("[bg] lỗi:", (e as Error)?.message));
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(safe);
  } catch {
    void safe;
  }
}
