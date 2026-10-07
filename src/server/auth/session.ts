import "server-only";
import { NextResponse } from "next/server";
import { batch, withTx, type Tx } from "../db";
import { ApiError } from "../errors";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { randomToken, sha256Hex, signAccessToken } from "./tokens";
import { hasMfa, verifySecondFactor } from "./mfa";
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

/** Phiên + refresh token trong MỘT câu lệnh (CTE) — 1 vòng mạng thay vì 2. */
function createSessionItem(userId: string, meta: ReqMeta, refresh: string) {
  return [
    `WITH s AS (
       INSERT INTO auth_sessions (user_id, device_label, user_agent, ip, expires_at)
       VALUES ($1, $2, $3, $4::inet, now() + make_interval(secs => $5)) RETURNING id
     )
     INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at)
     SELECT s.id, $1, $6, now() + make_interval(secs => $5) FROM s
     RETURNING session_id AS id`,
    [userId, deviceLabel(meta.userAgent), meta.userAgent?.slice(0, 400) ?? null, meta.ip, REFRESH_TTL_SECONDS, sha256Hex(refresh)],
  ] as const;
}

async function createSession(tx: Tx, userId: string, meta: ReqMeta) {
  const refresh = randomToken();
  const [q, params] = createSessionItem(userId, meta, refresh);
  const sid = (await tx.query<{ id: string }>(q, params as unknown as unknown[])).rows[0].id;
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
  | { ok: true; mfa?: false; userId: string; sid: string; refresh: string; pending: boolean }
  /** Mật khẩu đúng nhưng tài khoản bật xác thực 2 bước: chưa tạo phiên — chờ mã ở /api/v1/auth/mfa/verify. */
  | { ok: true; mfa: true; userId: string }
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

    // Đếm lần sai gần đây + tìm tài khoản: hai truy vấn độc lập ⇒ 1 vòng mạng (ghép cùng BEGIN)
    const [fails, userRes] = await batch(tx, [
      [
        `SELECT count(*) FILTER (WHERE identifier = $1)::int AS by_id,
                count(*) FILTER (WHERE ip = $2::inet)::int    AS by_ip
           FROM login_attempts
          WHERE success = false AND attempted_at > now() - interval '15 minutes'`,
        [id.key, meta.ip],
      ],
      [
        `SELECT id, email::text, password_hash, status::text, (locked_until IS NOT NULL AND locked_until > now()) AS locked
           FROM users
          WHERE deleted_at IS NULL AND (($1::text IS NOT NULL AND email = $1::citext) OR ($2::text IS NOT NULL AND phone_e164 = $2))
          LIMIT 1`,
        [id.email, id.phone],
      ],
    ]);
    if (fails.rows[0].by_id >= MAX_FAILS_PER_ID * 2 || fails.rows[0].by_ip >= MAX_FAILS_PER_IP) {
      await attempt(null, false, "rate_limited");
      return { ok: false, error: new ApiError(429, "RATE_LIMITED", "Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.") };
    }

    const u = userRes.rows[0] as { id: string; email: string | null; password_hash: string | null; status: string; locked: boolean } | undefined;

    const good = await verifyPassword(u?.password_hash, password);
    if (!u) {
      await attempt(null, false, "unknown_user");
      return { ok: false, error: new ApiError(401, "BAD_CREDENTIALS", "Email/SĐT hoặc mật khẩu không đúng.") };
    }
    if (u.status === "locked") {
      // Admin/người quản lý khóa thủ công (Cài đặt → Tài khoản) — khác với khóa tạm do nhập sai mật khẩu
      await attempt(u.id, false, "locked");
      return { ok: false, error: new ApiError(423, "LOCKED", "Tài khoản đã bị Admin/người quản lý khóa. Vui lòng liên hệ để được mở khóa.") };
    }
    if (u.locked) {
      await attempt(u.id, false, "locked");
      return { ok: false, error: new ApiError(423, "LOCKED", `Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút hoặc liên hệ người quản lý.`) };
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
      return { ok: false, error: new ApiError(403, "DISABLED", "Tài khoản đã bị vô hiệu hóa. Liên hệ người quản lý nếu đây là nhầm lẫn.") };
    }
    // Có xác thực 2 bước ⇒ dừng ở đây: ghi nhận bước mật khẩu đã đúng, phiên chỉ tạo sau khi nhập đúng mã
    if (await hasMfa(tx, u.id)) {
      await attempt(u.id, true, null); // ràng buộc DB: lần thử thành công không có lý do thất bại
      return { ok: true, mfa: true, userId: u.id };
    }
    // Đăng nhập đúng: ghi lần thử + cập nhật người dùng + tạo phiên/refresh token + kiểm tra chờ duyệt ⇒ 1 vòng mạng
    const refresh = randomToken();
    const [, , sess, mem] = await batch(tx, [
      [
        "INSERT INTO login_attempts (identifier, user_id, ip, user_agent, success, failure_reason) VALUES ($1, $2, $3::inet, $4, $5, $6)",
        [id.key, u.id, meta.ip, meta.userAgent?.slice(0, 400) ?? null, true, null],
      ],
      ["UPDATE users SET last_login_at = now(), locked_until = NULL WHERE id = $1", [u.id]],
      createSessionItem(u.id, meta, refresh),
      ["SELECT 1 FROM members WHERE user_id = $1 AND deleted_at IS NULL", [u.id]],
    ]);
    return { ok: true, userId: u.id, sid: sess.rows[0].id as string, refresh, pending: mem.rowCount === 0 };
  });
}

/** Bước 2 đăng nhập: mã TOTP/mã khôi phục đúng ⇒ tạo phiên như đăng nhập thường. */
export async function completeMfaLogin(userId: string, code: string, meta: ReqMeta): Promise<LoginOutcome> {
  return withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx): Promise<LoginOutcome> => {
    const u = (await tx.query<{ status: string; locked: boolean }>("SELECT status::text, (locked_until IS NOT NULL AND locked_until > now()) AS locked FROM users WHERE id = $1 AND deleted_at IS NULL", [userId])).rows[0];
    if (!u || u.status === "disabled" || u.status === "locked") return { ok: false, error: new ApiError(403, "DISABLED", "Tài khoản không thể đăng nhập. Liên hệ người quản lý.") };
    let good = false;
    try {
      good = await verifySecondFactor(tx, userId, code, meta);
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, error: e };
      throw e;
    }
    // Không ném lỗi khi sai mã: lần thử sai phải COMMIT (đếm chống dò mã)
    if (!good) return { ok: false, error: new ApiError(401, "BAD_CODE", "Mã không đúng hoặc đã hết hạn. Thử mã mới trong ứng dụng, hoặc dùng mã khôi phục.") };
    const refresh = randomToken();
    const [, sess, mem] = await batch(tx, [
      ["INSERT INTO login_attempts (identifier, user_id, ip, user_agent, success, failure_reason) VALUES ($1, $2, $3::inet, $4, true, NULL)", [`user:${userId}`, userId, meta.ip, meta.userAgent?.slice(0, 400) ?? null]],
      createSessionItem(userId, meta, refresh),
      ["SELECT 1 FROM members WHERE user_id = $1 AND deleted_at IS NULL", [userId]],
    ]);
    await tx.query("UPDATE users SET last_login_at = now(), locked_until = NULL WHERE id = $1", [userId]);
    return { ok: true, userId, sid: sess.rows[0].id as string, refresh, pending: mem.rowCount === 0 };
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
        s_revoked: boolean; s_expired: boolean; u_status: string; u_deleted: boolean; pending: boolean;
      }>(
        `SELECT rt.id, rt.session_id, rt.user_id,
                rt.expires_at <= now() AS expired,
                NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = rt.user_id AND m.deleted_at IS NULL) AS pending,
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
    const pending = r.pending;
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
    // Xoay token (chèn token mới + đánh dấu token cũ, CTE) và cập nhật phiên: 1 vòng mạng thay vì 3
    await batch(tx, [
      [
        `WITH n AS (
           INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at)
           SELECT $1, $2, $3, LEAST(s.expires_at, now() + make_interval(secs => $4)) FROM auth_sessions s WHERE s.id = $1
           RETURNING id
         )
         UPDATE refresh_tokens SET rotated_at = now(), replaced_by_id = (SELECT id FROM n) WHERE id = $5`,
        [r.session_id, r.user_id, sha256Hex(next), REFRESH_TTL_SECONDS, r.id],
      ],
      ["UPDATE auth_sessions SET last_seen_at = now(), ip = COALESCE($2::inet, ip) WHERE id = $1", [r.session_id, meta.ip]],
    ]);
    return { ok: true, userId: r.user_id, sid: r.session_id, refresh: next, pending };
  });
}

export async function revokeSession(sid: string, reason: "logout" | "password_changed" | "admin_revoked", meta: ReqMeta) {
  await withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", (tx) =>
    tx.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL", [sid, reason])
  );
}

// ---------------------------------------------------------------------
// Đổi mật khẩu (thu hồi mọi phiên khác)
// ---------------------------------------------------------------------
export async function changePassword(userId: string, currentSid: string, current: string, next: string, meta: ReqMeta) {
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

// ---------------------------------------------------------------------
// Đổi email đăng nhập (users.email). Khác với "Email liên hệ" ở hồ sơ (members.contact_email) — email liên hệ KHÔNG dùng để đăng nhập.
// Phải nhập lại mật khẩu hiện tại. Giữ nguyên các phiên đang đăng nhập (định danh đổi, không phải thông tin bí mật).
// ---------------------------------------------------------------------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function changeLoginEmail(userId: string, password: string, newEmail: string, meta: ReqMeta): Promise<{ email: string }> {
  const email = newEmail.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new ApiError(400, "BAD_EMAIL", "Email không hợp lệ.");
  return withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx) => {
    const u = (await tx.query<{ email: string | null; password_hash: string | null }>("SELECT email::text, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL", [userId])).rows[0];
    if (!u || !(await verifyPassword(u.password_hash, password))) throw new ApiError(400, "BAD_PASSWORD", "Mật khẩu hiện tại không đúng.");
    if (u.email?.toLowerCase() === email) throw new ApiError(400, "SAME_EMAIL", "Đây đang là email đăng nhập của bạn.");
    const dup = await tx.query("SELECT 1 FROM users WHERE email = $1::citext AND deleted_at IS NULL AND id <> $2", [email, userId]);
    if (dup.rowCount) throw new ApiError(409, "EMAIL_TAKEN", "Email này đã được dùng cho tài khoản khác.");
    await tx.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    try {
      await tx.query("UPDATE users SET email = $2 WHERE id = $1", [userId, email]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new ApiError(409, "EMAIL_TAKEN", "Email này đã được dùng cho tài khoản khác.");
      throw e;
    }
    return { email };
  });
}
