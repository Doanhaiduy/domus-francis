import "server-only";
import { randomInt } from "node:crypto";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import { hashPassword } from "../auth/password";

/** Mật khẩu tạm dễ đọc qua điện thoại: 3 cụm chữ-số, đủ chính sách (chữ + số, ≥ 8). */
function tempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const pick = (n: number, set: string) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(4, letters)}-${pick(4, "23456789")}-${pick(3, letters.toUpperCase())}`;
}

async function requireAny(ctx: Ctx, perms: string[]) {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_any_permission($1::text[]) AS ok", [perms])).rows[0].ok);
  if (!ok) throw forbidden();
}

export interface PreparedAccount {
  email: string;
  temporaryPassword: string;
  hash: string;
}

/** Băm mật khẩu tạm TRƯỚC khi mở transaction (Argon2 tốn CPU, không giữ khóa DB trong lúc băm). */
export async function prepareAccount(email: string): Promise<PreparedAccount> {
  const temporaryPassword = tempPassword();
  return { email: email.trim().toLowerCase(), temporaryPassword, hash: await hashPassword(temporaryPassword) };
}

/**
 * Trong CÙNG transaction của request (đang ở vai trò luuxa_app): tạo tài khoản + vai trò nền "member" (+ liên kết hồ sơ nếu có).
 * Đổi vai trò DB tạm thời: luuxa_auth ghi users (cột password_hash), luuxa_worker gán vai trò nền và liên kết members.user_id
 * (trigger tg_members_guard chỉ cho đổi liên kết khi không có ngữ cảnh người dùng = bước hệ thống), rồi trở lại luuxa_app.
 * Quyền người thao tác được kiểm TRƯỚC: auth.user.manage (Trưởng nhà/Admin) hoặc application.review (Phó nhà) — giống
 * app.fn_approve_member_application. Lỗi ở bất kỳ bước nào ⇒ rollback toàn bộ (không để lại tài khoản mồ côi).
 */
export async function insertAccountInTx(tx: Tx, actorId: string, acc: PreparedAccount, linkMemberId?: string): Promise<string> {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_any_permission(ARRAY['auth.user.manage', 'application.review']) AS ok")).rows[0].ok;
  if (!ok) throw forbidden("Bạn không có quyền cấp tài khoản đăng nhập.");
  await tx.query("SET LOCAL ROLE luuxa_auth");
  const dup = await tx.query("SELECT 1 FROM users WHERE email = $1::citext AND deleted_at IS NULL", [acc.email]);
  if (dup.rowCount) throw new ApiError(409, "ACCOUNT_EXISTS", "Email đã được dùng cho tài khoản khác.");
  const userId = (
    await tx.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, password_changed_at, must_change_password, status)
       VALUES ($1, $2, now(), true, 'active') RETURNING id`,
      [acc.email, acc.hash]
    )
  ).rows[0].id;
  await tx.query("SET LOCAL ROLE luuxa_worker");
  await tx.query(
    `INSERT INTO user_roles (user_id, role_id, granted_by, note)
     SELECT $1, r.id, $2, 'Cấp tài khoản cho hồ sơ thành viên' FROM roles r WHERE r.code = 'member'`,
    [userId, actorId]
  );
  if (linkMemberId) {
    await tx.query("SELECT set_config('app.current_user_id', '', true)");
    const r = await tx.query("UPDATE members SET user_id = $2 WHERE id = $1 AND user_id IS NULL AND deleted_at IS NULL", [linkMemberId, userId]);
    if (!r.rowCount) throw new ApiError(409, "HAS_ACCOUNT", "Thành viên này đã có tài khoản.");
    await tx.query("SELECT set_config('app.current_user_id', $1, true)", [actorId]);
  }
  await tx.query("SET LOCAL ROLE luuxa_app");
  return userId;
}

/** Cấp tài khoản cho một hồ sơ đã có (một transaction). */
export async function createAccountForMember(ctx: Ctx, memberId: string, email: string) {
  const acc = await prepareAccount(email);
  await ctx.db(async (tx) => {
    const m = (await tx.query<{ user_id: string | null }>("SELECT user_id FROM members WHERE id = $1 AND deleted_at IS NULL", [memberId])).rows[0];
    if (!m) throw notFound("Không tìm thấy thành viên.");
    if (m.user_id) throw new ApiError(409, "HAS_ACCOUNT", "Thành viên này đã có tài khoản.");
    await insertAccountInTx(tx, ctx.userId!, acc, memberId);
  });
  return { email: acc.email, temporaryPassword: acc.temporaryPassword };
}

/** Đặt lại mật khẩu (quên mật khẩu, không có email ra ngoài): cấp mật khẩu tạm + bắt đổi ở lần đăng nhập sau. */
export async function resetMemberPassword(ctx: Ctx, memberId: string) {
  await requireAny(ctx, ["auth.user.manage"]);
  const m = await ctx.db(async (tx) => (await tx.query<{ user_id: string | null }>("SELECT user_id FROM members WHERE id = $1", [memberId])).rows[0]);
  if (!m?.user_id) throw new ApiError(409, "NO_ACCOUNT", "Thành viên này chưa có tài khoản đăng nhập.");
  // BR-AUTH-22 (vá C-002): tài khoản giữ vai trò đặc quyền chỉ Trưởng nhà mới được thao tác
  const privileged = await ctx.db(async (tx) =>
    (await tx.query<{ p: boolean; me: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                       WHERE ur.user_id = $1 AND ur.revoked_at IS NULL AND r.code IN ('admin', 'house_head', 'treasurer')) AS p,
              app.has_permission('auth.role.assign') AS me`,
      [m.user_id]
    )).rows[0]
  );
  if (privileged.p && !privileged.me && m.user_id !== ctx.userId) {
    throw new ApiError(403, "BR-AUTH-22", "Tài khoản giữ vai trò đặc quyền chỉ Trưởng nhà được đặt lại mật khẩu.");
  }
  const pw = tempPassword();
  const hash = await hashPassword(pw);
  await ctx.dbAs("luuxa_auth", async (tx) => {
    await tx.query("SELECT set_config('app.current_user_id', $1, true)", [ctx.userId]);
    await tx.query(
      "UPDATE users SET password_hash = $2, password_changed_at = now(), must_change_password = true, locked_until = NULL WHERE id = $1",
      [m.user_id, hash]
    );
    await tx.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'admin_revoked' WHERE user_id = $1 AND revoked_at IS NULL", [m.user_id]);
  });
  return { temporaryPassword: pw };
}

export const ASSIGNABLE_ROLES = ["house_head", "vice_head", "treasurer", "admin", "liturgy_lead", "kitchen_lead", "media_lead", "member"] as const;

export async function listMemberRoles(ctx: Ctx, memberId: string) {
  return ctx.db(async (tx) => {
    const m = (await tx.query<{ user_id: string | null }>("SELECT user_id FROM members WHERE id = $1", [memberId])).rows[0];
    if (!m) throw notFound("Không tìm thấy thành viên.");
    if (!m.user_id) return { hasAccount: false, roles: [] as string[] };
    const roles = (
      await tx.query<{ code: string }>(
        `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
          ORDER BY r.rank`,
        [m.user_id]
      )
    ).rows.map((r) => r.code);
    return { hasAccount: true, roles };
  });
}

/** Gán / thu hồi vai trò (RLS user_roles__insert__assign / __update__assign: chỉ người có auth.role.assign). */
export async function setMemberRole(ctx: Ctx, memberId: string, role: string, grant: boolean) {
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) throw new ApiError(400, "BAD_ROLE", "Vai trò không hợp lệ.");
  return ctx.db(async (tx) => {
    const m = (await tx.query<{ user_id: string | null }>("SELECT user_id FROM members WHERE id = $1", [memberId])).rows[0];
    if (!m?.user_id) throw new ApiError(409, "NO_ACCOUNT", "Thành viên chưa có tài khoản — cấp tài khoản trước khi gán vai trò.");
    const can = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('auth.role.assign') AS ok")).rows[0].ok;
    if (!can) throw forbidden("Chỉ Trưởng nhà được gán/thu hồi vai trò.");
    if (grant) {
      const term = (await tx.query<{ id: string }>("SELECT id FROM board_terms WHERE status = 'active' ORDER BY starts_on DESC LIMIT 1")).rows[0]?.id ?? null;
      await tx.query(
        `INSERT INTO user_roles (user_id, role_id, board_term_id, granted_by)
         SELECT $1, r.id, CASE WHEN r.code = 'member' THEN NULL ELSE $3::uuid END, app.current_user_id() FROM roles r
          WHERE r.code = $2
            AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = $1 AND x.role_id = r.id AND x.revoked_at IS NULL
                              AND (x.valid_to IS NULL OR x.valid_to > now()))`,
        [m.user_id, role, term]
      );
    } else {
      if (m.user_id === ctx.userId && role === "house_head") throw new ApiError(422, "SELF_REVOKE", "Không thể tự thu hồi vai trò Trưởng nhà của chính mình — hãy bàn giao nhiệm kỳ.");
      await tx.query(
        `UPDATE user_roles SET revoked_at = now(), revoked_by = app.current_user_id()
          WHERE user_id = $1 AND revoked_at IS NULL AND role_id = (SELECT id FROM roles WHERE code = $2)`,
        [m.user_id, role]
      );
    }
  });
}
