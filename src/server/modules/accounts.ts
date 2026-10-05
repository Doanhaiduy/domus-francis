import "server-only";
import { randomInt } from "node:crypto";
import type { Ctx } from "../http";
import { batch, type Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import { hashPassword } from "../auth/password";
import type {
  AccountAction,
  AccountDto,
  AccountRoleDto,
  AccountStatus,
  AccountsListDto,
  AssignableRoleDto,
  MemberRolesDto,
} from "@/lib/types/accounts";

/** Mật khẩu tạm dễ đọc qua điện thoại: 3 cụm chữ-số, đủ chính sách (chữ + số, ≥ 8). */
function tempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const pick = (n: number, set: string) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(4, letters)}-${pick(4, "23456789")}-${pick(3, letters.toUpperCase())}`;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

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
 * Quyền người thao tác được kiểm TRƯỚC: auth.user.manage (Trưởng nhà/Admin) hoặc application.review (người duyệt đơn) — giống
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

// ---------------------------------------------------------------------
// Đối tượng thao tác: tài khoản (users.id) hoặc hồ sơ thành viên (members.id → users.id)
// ---------------------------------------------------------------------
export type AccountTarget = { userId: string } | { memberId: string };

/** Câu SQL tra users.id của đối tượng (gộp được vào batch cùng các lần đọc khác). */
function targetQuery(t: AccountTarget): readonly [string, unknown[]] {
  return "userId" in t
    ? ["SELECT u.id AS user_id, true AS found FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL", [t.userId]]
    : ["SELECT m.user_id, true AS found FROM members m WHERE m.id = $1 AND m.deleted_at IS NULL", [t.memberId]];
}

function resolveTarget(t: AccountTarget, row: { user_id: string | null; found: boolean } | undefined): string {
  if (!row?.found) throw notFound("userId" in t ? "Không tìm thấy tài khoản." : "Không tìm thấy thành viên.");
  if (!row.user_id) throw new ApiError(409, "NO_ACCOUNT", "Thành viên này chưa có tài khoản đăng nhập — cấp tài khoản trước.");
  return row.user_id;
}

// ---------------------------------------------------------------------
// Đặt lại mật khẩu
// ---------------------------------------------------------------------

/** Đặt lại mật khẩu (quên mật khẩu, không có email ra ngoài): cấp mật khẩu tạm + bắt đổi ở lần đăng nhập sau + đăng xuất mọi thiết bị. */
export async function resetUserPassword(ctx: Ctx, target: AccountTarget) {
  // Các bước kiểm tra (chỉ đọc) trong MỘT transaction, một vòng mạng: quyền + tài khoản + vai trò đặc quyền của đối tượng
  const userId = await ctx.db(async (tx) => {
    const [okR, tR] = await batch(tx, [
      ["SELECT app.has_permission('auth.user.manage') AS ok, app.has_permission('auth.role.assign') AS assign"],
      targetQuery(target),
    ]);
    const me = okR.rows[0] as { ok: boolean; assign: boolean };
    if (!me.ok) throw forbidden("Chỉ Trưởng nhà hoặc Admin được đặt lại mật khẩu.");
    const uid = resolveTarget(target, tR.rows[0] as { user_id: string | null; found: boolean } | undefined);
    if (uid === ctx.userId) throw new ApiError(422, "SELF_RESET", "Không đặt lại mật khẩu cho chính mình ở đây — hãy dùng chức năng Đổi mật khẩu.");
    // BR-AUTH-22 (vá C-002): tài khoản giữ vai trò đặc quyền chỉ người có quyền gán vai trò (Trưởng nhà / Admin) mới được thao tác
    const p = (await tx.query<{ p: boolean }>("SELECT app.is_privileged_user($1) AS p", [uid])).rows[0].p;
    if (p && !me.assign) throw new ApiError(403, "BR-AUTH-22", "Tài khoản giữ vai trò đặc quyền chỉ Trưởng nhà hoặc Admin được đặt lại mật khẩu.");
    return uid;
  });
  const pw = tempPassword();
  const hash = await hashPassword(pw);
  await ctx.dbAs("luuxa_auth", async (tx) => {
    // Gộp 3 lệnh độc lập (giữ thứ tự: đặt người thao tác cho audit → đổi mật khẩu → thu hồi phiên): 1 vòng mạng thay vì 3
    await batch(tx, [
      ["SELECT set_config('app.current_user_id', $1, true)", [ctx.userId]],
      [
        "UPDATE users SET password_hash = $2, password_changed_at = now(), must_change_password = true, locked_until = NULL WHERE id = $1",
        [userId, hash],
      ],
      ["UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'admin_revoked' WHERE user_id = $1 AND revoked_at IS NULL", [userId]],
    ]);
  });
  return { temporaryPassword: pw };
}

/** Giữ tên cũ cho route /api/v1/members/{id}/password-reset. */
export const resetMemberPassword = (ctx: Ctx, memberId: string) => resetUserPassword(ctx, { memberId });

// ---------------------------------------------------------------------
// Vai trò
// ---------------------------------------------------------------------
const ASSIGNABLE_SQL = `SELECT code, name_vi, description, rank, is_system FROM roles WHERE archived_at IS NULL ORDER BY rank, code`;
const ACTIVE_ROLE = `ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())`;

type RoleRow = { code: string; name_vi: string; description: string | null; rank: number; is_system: boolean };
const toAssignable = (rows: RoleRow[]): AssignableRoleDto[] =>
  rows.map((r) => ({ code: r.code, name: r.name_vi, description: r.description, rank: r.rank, isSystem: r.is_system }));

/** Vai trò có thể gán (đọc từ bảng roles — vai trò tự tạo do Admin thêm cũng có mặt; vai trò đã xóa thì không). */
export async function listAssignableRoles(tx: Tx): Promise<AssignableRoleDto[]> {
  return toAssignable((await tx.query<RoleRow>(ASSIGNABLE_SQL)).rows);
}

async function rolesOf(tx: Tx, target: AccountTarget): Promise<MemberRolesDto> {
  const rolesSql =
    "userId" in target
      ? `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL
          WHERE ur.user_id = $1 AND ${ACTIVE_ROLE} ORDER BY r.rank`
      : `SELECT r.code FROM members m JOIN user_roles ur ON ur.user_id = m.user_id JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL
          WHERE m.id = $1 AND ${ACTIVE_ROLE} ORDER BY r.rank`;
  const id = "userId" in target ? target.userId : target.memberId;
  // Gộp 4 lần đọc độc lập: 1 vòng mạng
  const [tR, rolesR, assignR, metaR] = await batch(tx, [targetQuery(target), [rolesSql, [id]], [ASSIGNABLE_SQL], ["SELECT app.has_role('admin') AS admin"]]);
  const t = tR.rows[0] as { user_id: string | null; found: boolean } | undefined;
  if (!t?.found) throw notFound("userId" in target ? "Không tìm thấy tài khoản." : "Không tìm thấy thành viên.");
  return {
    hasAccount: !!t.user_id,
    roles: [...new Set((rolesR.rows as { code: string }[]).map((r) => r.code))],
    assignable: toAssignable(assignR.rows as RoleRow[]),
    canAssignAdmin: !!(metaR.rows[0] as { admin: boolean }).admin,
  };
}

export async function listMemberRoles(ctx: Ctx, memberId: string): Promise<MemberRolesDto> {
  return ctx.db((tx) => rolesOf(tx, { memberId }));
}

/**
 * Gán / thu hồi vai trò (RLS user_roles__insert__assign / __update__assign: chỉ người có auth.role.assign, không cho chính mình,
 * vai trò Admin chỉ Admin gán). Vai trò hợp lệ = có trong bảng roles và chưa lưu trữ (trigger trg_user_roles__role_not_archived).
 */
export async function setUserRole(ctx: Ctx, target: AccountTarget, role: string, grant: boolean): Promise<MemberRolesDto> {
  return ctx.db(async (tx) => {
    // Gộp các lần đọc độc lập (tài khoản, quyền, vai trò, nhiệm kỳ đang hiệu lực): 1 vòng mạng
    const [tR, meR, roleR, termR] = await batch(tx, [
      targetQuery(target),
      ["SELECT app.has_permission('auth.role.assign') AS ok, app.has_role('admin') AS admin"],
      ["SELECT code, name_vi, archived_at IS NOT NULL AS archived FROM roles WHERE code = $1", [role]],
      ["SELECT id FROM board_terms WHERE status = 'active' ORDER BY starts_on DESC LIMIT 1"],
    ]);
    const me = meR.rows[0] as { ok: boolean; admin: boolean };
    if (!me.ok) throw forbidden("Chỉ Trưởng nhà hoặc Admin được gán/thu hồi vai trò.");
    const userId = resolveTarget(target, tR.rows[0] as { user_id: string | null; found: boolean } | undefined);
    const r = roleR.rows[0] as { code: string; name_vi: string; archived: boolean } | undefined;
    if (!r || r.archived) throw new ApiError(400, "BAD_ROLE", "Vai trò không hợp lệ hoặc đã bị xóa.");
    if (userId === ctx.userId) {
      if (!grant && r.code === "house_head") {
        throw new ApiError(422, "SELF_REVOKE", "Không thể tự thu hồi vai trò Trưởng nhà của chính mình — hãy bàn giao nhiệm kỳ.");
      }
      throw new ApiError(422, "SELF_ROLE", "Không tự gán hoặc thu hồi vai trò của chính mình — nhờ Trưởng nhà hoặc Admin khác thực hiện.");
    }
    if (grant && r.code === "admin" && !me.admin) throw forbidden("Chỉ Admin được gán vai trò Admin.");
    if (grant) {
      const term = (termR.rows[0]?.id as string | undefined) ?? null;
      await tx.query(
        `INSERT INTO user_roles (user_id, role_id, board_term_id, granted_by)
         SELECT $1, r.id, CASE WHEN r.code = 'member' THEN NULL ELSE $3::uuid END, app.current_user_id() FROM roles r
          WHERE r.code = $2
            AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = $1 AND x.role_id = r.id AND x.revoked_at IS NULL
                              AND (x.valid_to IS NULL OR x.valid_to > now()))`,
        [userId, r.code, term]
      );
    } else {
      await tx.query(
        `UPDATE user_roles SET revoked_at = now(), revoked_by = app.current_user_id()
          WHERE user_id = $1 AND revoked_at IS NULL AND role_id = (SELECT id FROM roles WHERE code = $2)`,
        [userId, r.code]
      );
    }
    return rolesOf(tx, target);
  });
}

/** Giữ tên cũ cho route /api/v1/members/{id}/roles và POST /api/v1/members (gán vai trò khi thêm thành viên). */
export const setMemberRole = (ctx: Ctx, memberId: string, role: string, grant: boolean) => setUserRole(ctx, { memberId }, role, grant);

// ---------------------------------------------------------------------
// Danh sách tài khoản + trạng thái
// ---------------------------------------------------------------------
type MemberAccountRow = {
  member_id: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_file_id: string | null;
  member_status: string | null;
  contact_email: string | null;
  user_id: string | null;
  email: string | null;
  phone_e164: string | null;
  user_status: string | null;
  temp_locked: boolean | null;
  locked_until: Date | null;
  must_change_password: boolean | null;
  last_login_at: Date | null;
  account_created_at: Date | null;
  privileged: boolean | null;
};

const ACCOUNT_COLS = `u.id AS user_id, u.email::text AS email, u.phone_e164, u.status::text AS user_status,
       (u.locked_until IS NOT NULL AND u.locked_until > now()) AS temp_locked, u.locked_until,
       u.must_change_password, u.last_login_at, u.created_at AS account_created_at,
       CASE WHEN u.id IS NULL THEN false ELSE app.is_privileged_user(u.id) END AS privileged`;

const MEMBER_ORDER: Record<string, number> = { active: 0, on_leave: 1, alumni: 2, left: 3 };

/** Danh sách thành viên + tài khoản (auth.user.read — Trưởng nhà/Admin): trạng thái, email, vai trò, lần đăng nhập cuối. */
export async function listAccounts(ctx: Ctx): Promise<AccountsListDto> {
  return ctx.db(async (tx) => {
    // Gộp 5 truy vấn độc lập: 1 vòng mạng (RLS: users/user_roles chỉ hiện đủ khi có auth.user.read — kiểm ngay sau)
    const [meR, memR, orphanR, rolesR, assignR] = await batch(tx, [
      [
        `SELECT app.has_permission('auth.user.read') AS can_read, app.has_permission('auth.user.manage') AS can_manage,
                app.has_permission('auth.role.assign') AS can_assign, app.has_role('admin') AS is_admin`,
      ],
      [
        `SELECT m.id AS member_id, m.full_name, m.display_name, m.avatar_file_id, m.status::text AS member_status, m.member_no,
                m.contact_email::text AS contact_email, ${ACCOUNT_COLS}
           FROM members m
           LEFT JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
          WHERE m.deleted_at IS NULL
          ORDER BY m.member_no`,
      ],
      [
        // Tài khoản không gắn hồ sơ (tài khoản kỹ thuật). Bỏ qua người đăng ký đang chờ duyệt (status invited — ở màn hình duyệt đơn).
        `SELECT ${ACCOUNT_COLS}
           FROM users u
          WHERE u.deleted_at IS NULL AND u.status <> 'invited'
            AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id)
          ORDER BY u.created_at`,
      ],
      [
        `SELECT ur.user_id, r.code, r.name_vi, r.rank
           FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL
          WHERE ${ACTIVE_ROLE}
          ORDER BY r.rank, r.code`,
      ],
      [ASSIGNABLE_SQL],
    ]);
    const me = meR.rows[0] as { can_read: boolean; can_manage: boolean; can_assign: boolean; is_admin: boolean };
    if (!me.can_read) throw forbidden("Chỉ Trưởng nhà hoặc Admin xem được danh sách tài khoản.");

    const rolesByUser = new Map<string, AccountRoleDto[]>();
    for (const r of rolesR.rows as { user_id: string; code: string; name_vi: string }[]) {
      const list = rolesByUser.get(r.user_id) ?? [];
      if (!list.some((x) => x.code === r.code)) list.push({ code: r.code, name: r.name_vi });
      rolesByUser.set(r.user_id, list);
    }

    const toDto = (r: MemberAccountRow): AccountDto => {
      const status: AccountStatus = !r.user_id ? "none" : ((r.user_status as AccountStatus) ?? "active");
      return {
        userId: r.user_id,
        memberId: r.member_id,
        fullName: r.full_name ?? r.email ?? "Tài khoản không gắn hồ sơ",
        displayName: r.display_name ?? r.email ?? "Tài khoản kỹ thuật",
        avatarFileId: r.avatar_file_id,
        memberStatus: r.member_status,
        email: r.email,
        contactEmail: r.contact_email ?? null,
        phone: r.phone_e164,
        status,
        tempLocked: !!r.temp_locked,
        lockedUntil: iso(r.locked_until),
        mustChangePassword: !!r.must_change_password,
        lastLoginAt: iso(r.last_login_at),
        createdAt: iso(r.account_created_at),
        roles: r.user_id ? (rolesByUser.get(r.user_id) ?? []) : [],
        privileged: !!r.privileged,
        isSelf: !!r.user_id && r.user_id === ctx.userId,
      };
    };

    const members = (memR.rows as MemberAccountRow[])
      .map(toDto)
      .sort((a, b) => (MEMBER_ORDER[a.memberStatus ?? ""] ?? 9) - (MEMBER_ORDER[b.memberStatus ?? ""] ?? 9));
    const orphans = (orphanR.rows as MemberAccountRow[]).map((r) =>
      toDto({ ...r, member_id: null, full_name: null, display_name: null, avatar_file_id: null, member_status: null, contact_email: null })
    );
    return {
      items: [...members, ...orphans],
      assignableRoles: toAssignable(assignR.rows as RoleRow[]),
      canManage: !!me.can_manage,
      canAssign: !!me.can_assign,
      canAssignAdmin: !!me.is_admin,
    };
  });
}

const ACTION_DONE: Record<AccountAction, string> = {
  lock: "Đã khóa tài khoản và đăng xuất mọi thiết bị.",
  unlock: "Đã mở khóa tài khoản.",
  disable: "Đã vô hiệu hóa tài khoản và đăng xuất mọi thiết bị.",
  enable: "Đã kích hoạt lại tài khoản.",
};

/**
 * Khóa / mở khóa / vô hiệu / kích hoạt lại tài khoản (auth.user.manage). Ghi bằng luuxa_app ⇒ trigger tg_users_guard kiểm thêm:
 * không tự đổi trạng thái của mình (BR-AUTH-22), tài khoản đặc quyền cần auth.role.assign. Khóa/vô hiệu ⇒ thu hồi mọi phiên
 * (app.fn_revoke_user_sessions, cần auth.session.revoke_any — Trưởng nhà/Admin đều có).
 */
export async function setAccountStatus(ctx: Ctx, userId: string, action: AccountAction) {
  return ctx.db(async (tx) => {
    const [meR, uR] = await batch(tx, [
      ["SELECT app.has_permission('auth.user.manage') AS ok, app.has_permission('auth.role.assign') AS assign"],
      [
        `SELECT u.status::text AS status, (u.locked_until IS NOT NULL AND u.locked_until > now()) AS temp_locked,
                app.is_privileged_user(u.id) AS privileged,
                (SELECT m.status::text FROM members m WHERE m.user_id = u.id AND m.deleted_at IS NULL LIMIT 1) AS member_status
           FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [userId],
      ],
    ]);
    const me = meR.rows[0] as { ok: boolean; assign: boolean };
    if (!me.ok) throw forbidden("Chỉ Trưởng nhà hoặc Admin được khóa, mở khóa hoặc vô hiệu tài khoản.");
    const u = uR.rows[0] as { status: string; temp_locked: boolean; privileged: boolean; member_status: string | null } | undefined;
    if (!u) throw notFound("Không tìm thấy tài khoản.");
    if (userId === ctx.userId) throw new ApiError(422, "BR-AUTH-22", "Không tự khóa hoặc vô hiệu tài khoản của chính mình.");
    if (u.privileged && !me.assign) {
      throw new ApiError(403, "BR-AUTH-22", "Tài khoản giữ vai trò đặc quyền chỉ Trưởng nhà hoặc Admin được khóa hoặc vô hiệu.");
    }
    let sql: string;
    let revoke = false;
    switch (action) {
      case "lock":
        if (u.status === "disabled") throw new ApiError(422, "ACCOUNT_DISABLED", "Tài khoản đang bị vô hiệu — hãy kích hoạt lại trước.");
        if (u.status === "locked") return { ok: true, message: "Tài khoản đã đang bị khóa." };
        sql = "UPDATE users SET status = 'locked' WHERE id = $1";
        revoke = true;
        break;
      case "unlock":
        if (u.status === "disabled") throw new ApiError(422, "ACCOUNT_DISABLED", "Tài khoản đang bị vô hiệu — dùng \"Kích hoạt lại\".");
        if (u.status !== "locked" && !u.temp_locked) return { ok: true, message: "Tài khoản không bị khóa." };
        sql = "UPDATE users SET status = CASE WHEN status = 'locked' THEN 'active'::user_status_t ELSE status END, locked_until = NULL WHERE id = $1";
        break;
      case "disable":
        if (u.status === "disabled") return { ok: true, message: "Tài khoản đã đang bị vô hiệu." };
        sql = "UPDATE users SET status = 'disabled', locked_until = NULL WHERE id = $1";
        revoke = true;
        break;
      case "enable":
        if (u.status !== "disabled") return { ok: true, message: "Tài khoản đang không bị vô hiệu." };
        if (u.member_status === "left") {
          throw new ApiError(422, "MEMBER_LEFT", "Thành viên đã rời lưu xá — chuyển trạng thái cư trú về \"Đang ở\" trước khi kích hoạt lại tài khoản.");
        }
        sql = "UPDATE users SET status = 'active', locked_until = NULL WHERE id = $1";
        break;
      default:
        throw new ApiError(400, "BAD_ACTION", "Thao tác không hợp lệ.");
    }
    const items: (readonly [string, unknown[]])[] = [[sql, [userId]]];
    if (revoke) items.push(["SELECT app.fn_revoke_user_sessions($1, 'user_disabled')", [userId]]);
    await batch(tx, items);
    return { ok: true, message: ACTION_DONE[action] };
  });
}
