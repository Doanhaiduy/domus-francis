import "server-only";
import { NextResponse } from "next/server";
import { withTx, type Tx } from "../db";
import { invalidateSessionCache } from "../http";
import { ApiError } from "../errors";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { randomToken, sha256Hex, signAccessToken } from "./tokens";
import {
  ACCESS_TTL_SECONDS,
  COOKIE,
  COOKIE_SECURE,
  REFRESH_PATH,
  REFRESH_TTL_SECONDS,
} from "@/lib/auth-shared";

const MAX_FAILS_PER_ID = 5; // trong 15 phút ⇒ khóa tạm tài khoản 15 phút
const MAX_FAILS_PER_IP = 30;
const LOCK_MINUTES = 15;
const REFRESH_GRACE_SECONDS = 30; // hai tab cùng làm mới gần như đồng thời không bị coi là "dùng lại token"

export interface ReqMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

/** Chuẩn hóa định danh đăng nhập: email (thường hóa) hoặc SĐT Việt Nam → E.164. */
export function normalizeIdentifier(raw: string): { email: string | null; phone: string | null; key: string } {
  const s = raw.trim();
  if (s.includes("@")) return { email: s.toLowerCase(), phone: null, key: s.toLowerCase() };
  const digits = s.replace(/[^\d+]/g, "");
  const phone = digits.startsWith("+") ? digits : digits.startsWith("0") ? `+84${digits.slice(1)}` : `+${digits}`;
  return { email: null, phone, key: phone };
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  return normalizeIdentifier(raw).phone;
}

async function isPending(tx: Tx, userId: string): Promise<boolean> {
  const r = await tx.query("SELECT 1 FROM members WHERE user_id = $1 AND deleted_at IS NULL", [userId]);
  return r.rowCount === 0;
}

async function createSession(tx: Tx, userId: string, meta: ReqMeta) {
  const refresh = randomToken();
  const s = await tx.query<{ id: string }>(
    `INSERT INTO auth_sessions (user_id, device_label, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4::inet, now() + make_interval(secs => $5)) RETURNING id`,
    [userId, deviceLabel(meta.userAgent), meta.userAgent?.slice(0, 400) ?? null, meta.ip, REFRESH_TTL_SECONDS]
  );
  const sid = s.rows[0].id;
  await tx.query(
    `INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [sid, userId, sha256Hex(refresh), REFRESH_TTL_SECONDS]
  );
  return { sid, refresh };
}

function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Thiết bị";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Trình duyệt";
  return `${br} · ${os}`;
}

/** Gắn cookie phiên vào response. */
export async function setSessionCookies(res: NextResponse, a: { userId: string; sid: string; pending: boolean; refresh?: string }) {
  const at = await signAccessToken({ sub: a.userId, sid: a.sid, pnd: a.pending });
  res.cookies.set(COOKIE.access, at, { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: ACCESS_TTL_SECONDS });
  if (a.refresh) {
    res.cookies.set(COOKIE.refresh, a.refresh, {
      httpOnly: true, secure: COOKIE_SECURE, sameSite: "strict", path: REFRESH_PATH, maxAge: REFRESH_TTL_SECONDS,
    });
  }
  return res;
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(COOKIE.access, "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(COOKIE.refresh, "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "strict", path: REFRESH_PATH, maxAge: 0 });
  return res;
}

// ---------------------------------------------------------------------
// Đăng nhập
// ---------------------------------------------------------------------
type LoginOutcome =
  | { ok: true; userId: string; sid: string; refresh: string; pending: boolean }
  | { ok: false; error: ApiError };

export async function login(identifier: string, password: string, meta: ReqMeta): Promise<LoginOutcome> {
  const id = normalizeIdentifier(identifier);
  // Ghi nhận lần thử phải COMMIT kể cả khi thất bại ⇒ không ném lỗi bên trong transaction.
  return withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx): Promise<LoginOutcome> => {
    const attempt = (userId: string | null, success: boolean, reason: string | null) =>
      tx.query(
        "INSERT INTO login_attempts (identifier, user_id, ip, user_agent, success, failure_reason) VALUES ($1, $2, $3::inet, $4, $5, $6)",
        [id.key, userId, meta.ip, meta.userAgent?.slice(0, 400) ?? null, success, reason]
      );

    const fails = await tx.query<{ by_id: number; by_ip: number }>(
      `SELECT count(*) FILTER (WHERE identifier = $1)::int AS by_id,
              count(*) FILTER (WHERE ip = $2::inet)::int    AS by_ip
         FROM login_attempts
        WHERE success = false AND attempted_at > now() - interval '15 minutes'`,
      [id.key, meta.ip]
    );
    if (fails.rows[0].by_id >= MAX_FAILS_PER_ID * 2 || fails.rows[0].by_ip >= MAX_FAILS_PER_IP) {
      await attempt(null, false, "rate_limited");
      return { ok: false, error: new ApiError(429, "RATE_LIMITED", "Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.") };
    }

    const u = (
      await tx.query<{ id: string; email: string | null; password_hash: string | null; status: string; locked: boolean }>(
        `SELECT id, email::text, password_hash, status::text, (locked_until IS NOT NULL AND locked_until > now()) AS locked
           FROM users
          WHERE deleted_at IS NULL AND (($1::text IS NOT NULL AND email = $1::citext) OR ($2::text IS NOT NULL AND phone_e164 = $2))
          LIMIT 1`,
        [id.email, id.phone]
      )
    ).rows[0];

    const good = await verifyPassword(u?.password_hash, password);
    if (!u) {
      await attempt(null, false, "unknown_user");
      return { ok: false, error: new ApiError(401, "BAD_CREDENTIALS", "Email/SĐT hoặc mật khẩu không đúng.") };
    }
    if (u.locked || u.status === "locked") {
      await attempt(u.id, false, "locked");
      return { ok: false, error: new ApiError(423, "LOCKED", `Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút hoặc liên hệ Ban điều hành.`) };
    }
    if (!good) {
      await attempt(u.id, false, "bad_password");
      if (fails.rows[0].by_id + 1 >= MAX_FAILS_PER_ID) {
        await tx.query(`UPDATE users SET locked_until = now() + make_interval(mins => $2) WHERE id = $1`, [u.id, LOCK_MINUTES]);
      }
      return { ok: false, error: new ApiError(401, "BAD_CREDENTIALS", "Email/SĐT hoặc mật khẩu không đúng.") };
    }
    if (u.status === "disabled") {
      await attempt(u.id, false, "disabled");
      return { ok: false, error: new ApiError(403, "DISABLED", "Tài khoản đã bị vô hiệu hóa. Liên hệ Ban điều hành nếu đây là nhầm lẫn.") };
    }
    await attempt(u.id, true, null);
    await tx.query("UPDATE users SET last_login_at = now(), locked_until = NULL WHERE id = $1", [u.id]);
    const { sid, refresh } = await createSession(tx, u.id, meta);
    return { ok: true, userId: u.id, sid, refresh, pending: await isPending(tx, u.id) };
  });
}

// ---------------------------------------------------------------------
// Đăng ký tài khoản + đơn xin vào lưu xá (chờ duyệt)
// ---------------------------------------------------------------------
export interface RegisterInput {
  fullName: string;
  email: string;
  phone?: string | null;
  password: string;
  universityName?: string | null;
  message?: string | null;
}

export async function register(input: RegisterInput, meta: ReqMeta) {
  const email = input.email.trim().toLowerCase();
  const pwErr = passwordProblem(input.password, email);
  if (pwErr) throw new ApiError(400, "WEAK_PASSWORD", pwErr);
  const phone = normalizePhone(input.phone);
  const hash = await hashPassword(input.password);
  return withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx) => {
    const exists = await tx.query(
      "SELECT 1 FROM users WHERE deleted_at IS NULL AND (email = $1::citext OR ($2::text IS NOT NULL AND phone_e164 = $2))",
      [email, phone]
    );
    if (exists.rowCount) throw new ApiError(409, "ACCOUNT_EXISTS", "Email hoặc số điện thoại đã có tài khoản. Hãy đăng nhập.");
    const u = await tx.query<{ id: string }>(
      `INSERT INTO users (email, phone_e164, password_hash, password_changed_at, status)
       VALUES ($1, $2, $3, now(), 'invited') RETURNING id`,
      [email, phone, hash]
    );
    const userId = u.rows[0].id;
    await tx.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await tx.query(
      `INSERT INTO member_applications (user_id, full_name, email, phone_e164, university_name, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, input.fullName.trim(), email, phone, input.universityName?.trim() || null, input.message?.trim() || null]
    );
    const { sid, refresh } = await createSession(tx, userId, meta);
    return { userId, sid, refresh, pending: true };
  });
}

// ---------------------------------------------------------------------
// Làm mới phiên (xoay vòng refresh token + phát hiện dùng lại)
// ---------------------------------------------------------------------
type RefreshOutcome =
  | { ok: true; userId: string; sid: string; refresh?: string; pending: boolean }
  | { ok: false; reason: string };

export async function refreshSession(token: string | undefined, meta: ReqMeta): Promise<RefreshOutcome> {
  if (!token) return { ok: false, reason: "missing" };
  return withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx): Promise<RefreshOutcome> => {
    const r = (
      await tx.query<{
        id: string; session_id: string; user_id: string; expired: boolean; rotated_secs: number | null;
        s_revoked: boolean; s_expired: boolean; u_status: string; u_deleted: boolean;
      }>(
        `SELECT rt.id, rt.session_id, rt.user_id,
                rt.expires_at <= now() AS expired,
                CASE WHEN rt.rotated_at IS NULL THEN NULL ELSE extract(epoch FROM now() - rt.rotated_at)::int END AS rotated_secs,
                s.revoked_at IS NOT NULL AS s_revoked, s.expires_at <= now() AS s_expired,
                u.status::text AS u_status, u.deleted_at IS NOT NULL AS u_deleted
           FROM refresh_tokens rt
           JOIN auth_sessions s ON s.id = rt.session_id
           JOIN users u ON u.id = rt.user_id
          WHERE rt.token_hash = $1
          FOR UPDATE OF rt, s`,
        [sha256Hex(token)]
      )
    ).rows[0];
    if (!r) return { ok: false, reason: "unknown" };
    if (r.s_revoked || r.s_expired || r.expired) return { ok: false, reason: "expired" };
    if (r.u_deleted || r.u_status === "disabled" || r.u_status === "locked") {
      await tx.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'user_disabled' WHERE id = $1 AND revoked_at IS NULL", [r.session_id]);
      return { ok: false, reason: "disabled" };
    }
    const pending = await isPending(tx, r.user_id);
    if (r.rotated_secs !== null) {
      if (r.rotated_secs <= REFRESH_GRACE_SECONDS) {
        // Hai request làm mới gần như đồng thời: cấp access token mới, không xoay thêm (cookie mới đã về trình duyệt).
        return { ok: true, userId: r.user_id, sid: r.session_id, pending };
      }
      await tx.query("UPDATE refresh_tokens SET reuse_detected_at = now() WHERE id = $1", [r.id]);
      await tx.query(
        "UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'refresh_reuse_detected' WHERE id = $1 AND revoked_at IS NULL",
        [r.session_id]
      );
      return { ok: false, reason: "reuse" };
    }
    const next = randomToken();
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at)
       SELECT $1, $2, $3, LEAST(s.expires_at, now() + make_interval(secs => $4)) FROM auth_sessions s WHERE s.id = $1
       RETURNING id`,
      [r.session_id, r.user_id, sha256Hex(next), REFRESH_TTL_SECONDS]
    );
    await tx.query("UPDATE refresh_tokens SET rotated_at = now(), replaced_by_id = $2 WHERE id = $1", [r.id, ins.rows[0].id]);
    await tx.query("UPDATE auth_sessions SET last_seen_at = now(), ip = COALESCE($2::inet, ip) WHERE id = $1", [r.session_id, meta.ip]);
    return { ok: true, userId: r.user_id, sid: r.session_id, refresh: next, pending };
  });
}

export async function revokeSession(sid: string, reason: "logout" | "password_changed" | "admin_revoked", meta: ReqMeta) {
  invalidateSessionCache(sid);
  await withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", (tx) =>
    tx.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL", [sid, reason])
  );
}

// ---------------------------------------------------------------------
// Đổi mật khẩu (thu hồi mọi phiên khác)
// ---------------------------------------------------------------------
export async function changePassword(userId: string, currentSid: string, current: string, next: string, meta: ReqMeta) {
  invalidateSessionCache();
  return withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx) => {
    const u = (await tx.query<{ email: string | null; password_hash: string | null }>("SELECT email::text, password_hash FROM users WHERE id = $1", [userId])).rows[0];
    if (!u || !(await verifyPassword(u.password_hash, current))) throw new ApiError(400, "BAD_PASSWORD", "Mật khẩu hiện tại không đúng.");
    const problem = passwordProblem(next, u.email);
    if (problem) throw new ApiError(400, "WEAK_PASSWORD", problem);
    await tx.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await tx.query("UPDATE users SET password_hash = $2, password_changed_at = now(), must_change_password = false WHERE id = $1", [userId, await hashPassword(next)]);
    await tx.query(
      "UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'password_changed' WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL",
      [userId, currentSid]
    );
  });
}
