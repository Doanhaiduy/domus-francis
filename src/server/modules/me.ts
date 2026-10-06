import "server-only";
import { batch, type Tx } from "../db";
import { ROLE_LABEL, type SessionInfo } from "@/lib/types/session";

export type { SessionInfo };

/** Thông tin phiên của người gọi — đọc dưới vai trò luuxa_app (RLS áp dụng). */
export async function loadSessionInfo(tx: Tx): Promise<SessionInfo> {
  // Gộp các truy vấn độc lập: 1 vòng mạng thay vì 4–5 (đơn đăng ký chỉ dùng khi chưa có hồ sơ thành viên)
  const [uR, mR, rolesR, permsR, appR, mfaR] = await batch(tx, [
    [`SELECT id, email::text, phone_e164, status::text, must_change_password FROM users WHERE id = app.current_user_id()`],
    [
      `SELECT m.id, m.full_name, m.display_name, m.avatar_file_id, m.gender::text,
              r.code AS room_code, r.name AS room_name, p.position_name
         FROM members m
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
         LEFT JOIN v_member_current_position p ON p.member_id = m.id
        WHERE m.id = app.current_member_id()`,
    ],
    [`SELECT DISTINCT g.role_code AS code, r.rank, r.name_vi, r.is_system FROM app.current_role_grants() g JOIN roles r ON r.code = g.role_code ORDER BY r.rank`],
    [
      `SELECT DISTINCT rp.permission_code AS code
         FROM app.current_role_grants() g
         JOIN roles r ON r.code = g.role_code
         JOIN role_permissions rp ON rp.role_id = r.id
        WHERE g.scope_type = 'global'
        ORDER BY 1`,
    ],
    [
      `SELECT id, status::text, full_name, email::text, created_at, review_note
             FROM member_applications WHERE user_id = app.current_user_id() ORDER BY created_at DESC LIMIT 1`,
    ],
    [
      `SELECT app.fn_mfa_required() AS required,
              EXISTS (SELECT 1 FROM user_mfa_factors WHERE user_id = app.current_user_id() AND confirmed_at IS NOT NULL) AS enabled`,
    ],
  ]);
  const u = uR.rows[0];
  const m = mR.rows[0];
  const roleRows = rolesR.rows as { code: string; name_vi: string; is_system: boolean }[];
  const roles = roleRows.map((r) => r.code);
  // Vai trò hệ thống: nhãn ngắn cố định (vd. "Admin"); vai trò tự tạo (các ban, vai trò Admin thêm): tên trong bảng roles
  const roleNames = Object.fromEntries(roleRows.map((r) => [r.code, (r.is_system && ROLE_LABEL[r.code]) || r.name_vi]));
  const permissions = roles.includes("admin")
    ? (await tx.query<{ code: string }>("SELECT code FROM permissions ORDER BY 1")).rows.map((r) => r.code)
    : (permsR.rows as { code: string }[]).map((r) => r.code);
  const a = m ? null : appR.rows[0];
  const primaryRole = roles[0] ?? "member";
  return {
    user: { id: u.id, email: u.email, phone: u.phone_e164, status: u.status, mustChangePassword: u.must_change_password },
    member: m
      ? {
          id: m.id,
          fullName: m.full_name,
          displayName: m.display_name,
          avatarFileId: m.avatar_file_id,
          gender: m.gender,
          roomCode: m.room_code,
          roomName: m.room_name,
          positionLabel: m.position_name,
        }
      : null,
    mfa: { enabled: !!mfaR.rows[0]?.enabled, required: !!mfaR.rows[0]?.required },
    roles,
    primaryRole,
    roleLabel: roleNames[primaryRole] ?? ROLE_LABEL[primaryRole] ?? "Thành viên",
    roleNames,
    permissions,
    application: a
      ? { id: a.id, status: a.status, fullName: a.full_name, email: a.email, createdAt: a.created_at, reviewNote: a.review_note }
      : null,
  };
}
