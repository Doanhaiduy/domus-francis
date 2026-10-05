import "server-only";
import { z } from "zod";
import { withTx, type Tx } from "./db";
import { forbidden } from "./errors";
import { ENTITY_LABEL, activityLabel, routesMatching, routesOfArea } from "@/lib/activity-labels";
import type {
  ActivityActionDto,
  ActivityActor,
  ActivityChangeDto,
  ActivityLoginDto,
  ActivityPage,
  ActivityUserDto,
} from "@/lib/types/activity";

// Nhật ký hoạt động người dùng — CHỈ Admin (quyền activity.log.read, db/app/1016_activity_logs.sql).
// Ghi: mỗi thao tác ghi qua API (xem api() ở http.ts). Đọc: dưới RLS luuxa_app + kiểm quyền tường minh ở đây.

const SKIP_ROUTES = new Set([
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/refresh",
  "POST /api/v1/notifications/[id]/read",
  "POST /api/v1/notifications/read-all",
  "POST /api/v1/announcements/[id]/read",
  "POST /api/v1/announcements/read-all",
]);

export interface ActivityRecord {
  userId: string;
  method: string;
  pathname: string;
  params: Record<string, string>;
  status: number;
  errorCode: string | null;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

/** Đường dẫn với giá trị tham số thay bằng [tên] (vd. /api/v1/events/[id]/cancel). */
function routeOf(pathname: string, params: Record<string, string>): string {
  const byValue = new Map<string, string>();
  for (const [k, v] of Object.entries(params)) if (!byValue.has(v)) byValue.set(v, k);
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

/** Ghi một thao tác. Không bao giờ ném lỗi (nhật ký hỏng không được làm hỏng thao tác của người dùng). */
export async function recordActivity(r: ActivityRecord): Promise<void> {
  const method = r.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
  const route = routeOf(r.pathname, r.params);
  if (SKIP_ROUTES.has(`${method} ${route}`)) return;
  try {
    await withTx({ requestId: r.requestId, ip: r.ip }, "luuxa_worker", (tx) =>
      tx.query(
        `INSERT INTO activity_logs (user_id, method, route, path, status, error_code, duration_ms, ip, user_agent, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, $10)`,
        [r.userId, method, route.slice(0, 300), r.pathname.slice(0, 400), r.status, r.errorCode?.slice(0, 60) ?? null, Math.round(r.durationMs), r.ip, r.userAgent?.slice(0, 300) ?? null, r.requestId],
      ),
    );
  } catch (e) {
    console.error("[activity] không ghi được nhật ký:", (e as Error).message);
  }
}

/** Dọn nhật ký quá hạn giữ (gọi trong housekeeping). */
export async function purgeActivity(tx: Tx, days = 180) {
  await tx.query("DELETE FROM activity_logs WHERE occurred_at < now() - make_interval(days => $1::int)", [days]);
}

// ---------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------
export async function assertActivityAccess(tx: Tx) {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('activity.log.read') AS ok")).rows[0].ok;
  if (!ok) throw forbidden("Chỉ Admin mới xem được nhật ký hoạt động.");
}

export const ActivityQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  result: z.enum(["all", "ok", "error"]).optional(),
  q: z.string().trim().max(80).optional(),
  area: z.string().trim().max(30).optional(),
  before: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ActivityFilter = z.infer<typeof ActivityQuerySchema>;

/** Thiết bị rút gọn từ User-Agent: "Chrome · Windows". */
export function deviceOf(ua: string | null): string {
  if (!ua) return "Không rõ";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Trình duyệt khác";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

const NAME_JOIN = (col: string) => `LEFT JOIN members m ON m.user_id = ${col} AND m.deleted_at IS NULL LEFT JOIN users u ON u.id = ${col}`;
const NAME_COLS = "COALESCE(m.display_name, m.full_name) AS actor_name, u.email::text AS actor_email";

const actorOf = (userId: string | null, name: string | null, email: string | null): ActivityActor => ({
  userId,
  name: name ?? email ?? (userId ? "Tài khoản đã xóa" : "Hệ thống"),
  email,
});

/** Tách con trỏ "<thời gian đầy đủ>|<id>". */
function parseCursor(before?: string): { at: string; id: string } | null {
  if (!before) return null;
  const i = before.lastIndexOf("|");
  if (i < 1) return null;
  const at = before.slice(0, i);
  const id = before.slice(i + 1);
  if (!/^\d{4}-\d{2}-\d{2}[ T][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/.test(at) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

class Where {
  parts: string[] = [];
  params: unknown[] = [];
  add(sql: string, value: unknown) {
    this.params.push(value);
    this.parts.push(sql.replace("?", `$${this.params.length}`));
  }
  raw(sql: string) {
    this.parts.push(sql);
  }
  get sql() {
    return this.parts.length ? `WHERE ${this.parts.join(" AND ")}` : "";
  }
}

function pageOf<T extends { cursor: string; id: string }>(rows: T[], limit: number): ActivityPage<T> {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, next: more && last ? `${last.cursor}|${last.id}` : null };
}

export async function listActions(tx: Tx, f: ActivityFilter): Promise<ActivityPage<ActivityActionDto>> {
  await assertActivityAccess(tx);
  const limit = f.limit ?? 40;
  const w = new Where();
  if (f.userId) w.add("a.user_id = ?::uuid", f.userId);
  if (f.from) w.add("a.occurred_at >= ?::timestamptz", f.from);
  if (f.to) w.add("a.occurred_at < ?::timestamptz", f.to);
  if (f.result === "ok") w.raw("a.status < 400");
  if (f.result === "error") w.raw("a.status >= 400");
  if (f.area) {
    const keys = routesOfArea(f.area);
    w.add("(a.method || ' ' || a.route) = ANY(?::text[])", keys);
  }
  if (f.q) {
    const keys = routesMatching(f.q);
    w.params.push(keys, `%${f.q.replace(/[\\%_]/g, "\\$&")}%`);
    const a = w.params.length - 1;
    const b = w.params.length;
    w.raw(`((a.method || ' ' || a.route) = ANY($${a}::text[]) OR a.path ILIKE $${b} OR COALESCE(m.display_name, m.full_name, '') ILIKE $${b})`);
  }
  const cur = parseCursor(f.before);
  if (cur) {
    w.params.push(cur.at, cur.id);
    w.raw(`(a.occurred_at, a.id) < ($${w.params.length - 1}::timestamptz, $${w.params.length}::uuid)`);
  }
  w.params.push(limit + 1);
  const rows = (
    await tx.query(
      `SELECT a.id, a.occurred_at::text AS cursor, a.occurred_at, a.user_id, a.method, a.route, a.path, a.status, a.error_code,
              a.duration_ms, host(a.ip) AS ip, a.user_agent, a.request_id, ${NAME_COLS}
         FROM activity_logs a ${NAME_JOIN("a.user_id")}
         ${w.sql}
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT $${w.params.length}`,
      w.params,
    )
  ).rows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ActivityActionDto[] = rows.map((r: any) => {
    const l = activityLabel(r.method, r.route);
    return {
      id: r.id,
      at: new Date(r.occurred_at).toISOString(),
      cursor: r.cursor,
      actor: actorOf(r.user_id, r.actor_name, r.actor_email),
      method: r.method,
      route: r.route,
      path: r.path,
      label: l.label,
      area: l.area,
      areaLabel: l.areaLabel,
      status: r.status,
      ok: r.status < 400,
      errorCode: r.error_code ?? null,
      durationMs: r.duration_ms ?? null,
      ip: r.ip ?? null,
      device: deviceOf(r.user_agent),
      requestId: r.request_id ?? null,
    };
  });
  return pageOf(items, limit);
}

const FAIL_LABEL: Record<string, string> = {
  unknown_user: "Không có tài khoản này",
  bad_password: "Sai mật khẩu",
  locked: "Tài khoản đang bị khóa tạm",
  disabled: "Tài khoản đã bị vô hiệu",
  mfa_failed: "Sai mã xác thực 2 lớp",
  rate_limited: "Bị chặn do thử quá nhiều lần",
};

export async function listLogins(tx: Tx, f: ActivityFilter): Promise<ActivityPage<ActivityLoginDto>> {
  await assertActivityAccess(tx);
  const limit = f.limit ?? 40;
  const w = new Where();
  if (f.userId) w.add("l.user_id = ?::uuid", f.userId);
  if (f.from) w.add("l.attempted_at >= ?::timestamptz", f.from);
  if (f.to) w.add("l.attempted_at < ?::timestamptz", f.to);
  if (f.result === "ok") w.raw("l.success");
  if (f.result === "error") w.raw("NOT l.success");
  if (f.q) {
    w.params.push(`%${f.q.replace(/[\\%_]/g, "\\$&")}%`);
    w.raw(`(l.identifier ILIKE $${w.params.length} OR host(l.ip) ILIKE $${w.params.length} OR COALESCE(m.display_name, m.full_name, '') ILIKE $${w.params.length})`);
  }
  const cur = parseCursor(f.before);
  if (cur) {
    w.params.push(cur.at, cur.id);
    w.raw(`(l.attempted_at, l.id) < ($${w.params.length - 1}::timestamptz, $${w.params.length}::uuid)`);
  }
  w.params.push(limit + 1);
  const rows = (
    await tx.query(
      `SELECT l.id, l.attempted_at::text AS cursor, l.attempted_at, l.identifier, l.user_id, host(l.ip) AS ip, l.user_agent,
              l.success, l.failure_reason, ${NAME_COLS}
         FROM login_attempts l ${NAME_JOIN("l.user_id")}
         ${w.sql}
        ORDER BY l.attempted_at DESC, l.id DESC
        LIMIT $${w.params.length}`,
      w.params,
    )
  ).rows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ActivityLoginDto[] = rows.map((r: any) => ({
    id: r.id,
    at: new Date(r.attempted_at).toISOString(),
    cursor: r.cursor,
    actor: actorOf(r.user_id, r.actor_name, r.actor_email),
    identifier: r.identifier,
    success: r.success,
    reason: r.failure_reason ?? null,
    reasonLabel: r.failure_reason ? (FAIL_LABEL[r.failure_reason] ?? r.failure_reason) : null,
    ip: r.ip ?? null,
    device: deviceOf(r.user_agent),
  }));
  return pageOf(items, limit);
}

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Thêm mới",
  UPDATE: "Sửa",
  DELETE: "Xóa",
  STATE_CHANGE: "Đổi trạng thái",
  PERMISSION_CHANGE: "Đổi quyền",
  SETTING_CHANGE: "Đổi cấu hình",
  READ_SENSITIVE: "Xem dữ liệu nhạy cảm",
  EXPORT: "Xuất dữ liệu",
  PERIOD_CLOSE: "Chốt kỳ",
  PERIOD_REOPEN: "Mở lại kỳ",
};

/** Thay đổi dữ liệu (audit_logs do trigger ghi). RLS vẫn áp dụng: bảng dữ liệu cá nhân nhạy cảm chỉ Trưởng nhà xem được. */
export async function listChanges(tx: Tx, f: ActivityFilter): Promise<ActivityPage<ActivityChangeDto>> {
  await assertActivityAccess(tx);
  const limit = f.limit ?? 30;
  const w = new Where();
  w.raw("al.actor_user_id IS NOT NULL");
  if (f.userId) w.add("al.actor_user_id = ?::uuid", f.userId);
  if (f.from) w.add("al.occurred_at >= ?::timestamptz", f.from);
  if (f.to) w.add("al.occurred_at < ?::timestamptz", f.to);
  if (f.q) {
    w.params.push(`%${f.q.replace(/[\\%_]/g, "\\$&")}%`);
    w.raw(`(al.entity_table ILIKE $${w.params.length} OR al.entity_id ILIKE $${w.params.length})`);
  }
  const cur = parseCursor(f.before);
  if (cur) {
    w.params.push(cur.at, cur.id);
    w.raw(`(al.occurred_at, al.id) < ($${w.params.length - 1}::timestamptz, $${w.params.length}::uuid)`);
  }
  w.params.push(limit + 1);
  const rows = (
    await tx.query(
      `SELECT al.id, al.occurred_at::text AS cursor, al.occurred_at, al.actor_user_id, al.action, al.entity_table, al.entity_id,
              al.changed_fields, al.old_data, al.new_data, host(al.ip) AS ip, ${NAME_COLS}
         FROM audit_logs al ${NAME_JOIN("al.actor_user_id")}
         ${w.sql}
        ORDER BY al.occurred_at DESC, al.id DESC
        LIMIT $${w.params.length}`,
      w.params,
    )
  ).rows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ActivityChangeDto[] = rows.map((r: any) => ({
    id: r.id,
    at: new Date(r.occurred_at).toISOString(),
    cursor: r.cursor,
    actor: actorOf(r.actor_user_id, r.actor_name, r.actor_email),
    action: r.action,
    actionLabel: ACTION_LABEL[r.action] ?? r.action,
    entityTable: r.entity_table,
    entityLabel: ENTITY_LABEL[r.entity_table] ?? r.entity_table,
    entityId: r.entity_id ?? null,
    changedFields: r.changed_fields ?? [],
    oldData: r.old_data ?? null,
    newData: r.new_data ?? null,
    ip: r.ip ?? null,
  }));
  return pageOf(items, limit);
}

/** Tổng hợp theo người dùng trong khoảng thời gian: số thao tác, số lỗi, lần cuối hoạt động / đăng nhập. */
export async function listActivityUsers(tx: Tx, f: ActivityFilter): Promise<ActivityUserDto[]> {
  await assertActivityAccess(tx);
  const w = new Where();
  w.raw("a.user_id IS NOT NULL");
  if (f.from) w.add("a.occurred_at >= ?::timestamptz", f.from);
  if (f.to) w.add("a.occurred_at < ?::timestamptz", f.to);
  const rows = (
    await tx.query(
      `SELECT a.user_id, COALESCE(m.display_name, m.full_name) AS actor_name, u.email::text AS actor_email,
              count(*)::int AS total, count(*) FILTER (WHERE a.status >= 400)::int AS errors,
              max(a.occurred_at) AS last_at, u.last_login_at
         FROM activity_logs a ${NAME_JOIN("a.user_id")}
         ${w.sql}
        GROUP BY a.user_id, m.display_name, m.full_name, u.email, u.last_login_at
        ORDER BY max(a.occurred_at) DESC
        LIMIT 200`,
      w.params,
    )
  ).rows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    userId: r.user_id,
    name: r.actor_name ?? r.actor_email ?? "Tài khoản đã xóa",
    email: r.actor_email ?? null,
    total: r.total,
    errors: r.errors,
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
  }));
}
