import "server-only";
import type { Tx } from "../db";
import { ROLE_LABEL, type SessionInfo } from "@/lib/types/session";

export type { SessionInfo };

/** Thông tin phiên của người gọi — đọc dưới vai trò luuxa_app (RLS áp dụng). */
export async function loadSessionInfo(tx: Tx): Promise<SessionInfo> {
  const u = (
    await tx.query(
      `SELECT id, email::text, phone_e164, status::text, must_change_password FROM users WHERE id = app.current_user_id()`
    )
  ).rows[0];
  const m = (
    await tx.query(
      `SELECT m.id, m.full_name, m.display_name, m.avatar_file_id, m.gender::text,
              r.code AS room_code, r.name AS room_name, p.position_name
         FROM members m
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
         LEFT JOIN v_member_current_position p ON p.member_id = m.id
        WHERE m.id = app.current_member_id()`
    )
  ).rows[0];
  const roles = (
    await tx.query<{ code: string }>(
      `SELECT DISTINCT g.role_code AS code, r.rank FROM app.current_role_grants() g JOIN roles r ON r.code = g.role_code ORDER BY r.rank`
    )
  ).rows.map((r) => r.code);
  const permissions = (
    await tx.query<{ code: string }>(
      `SELECT DISTINCT rp.permission_code AS code
         FROM app.current_role_grants() g
         JOIN roles r ON r.code = g.role_code
         JOIN role_permissions rp ON rp.role_id = r.id
        WHERE g.scope_type = 'global'
        ORDER BY 1`
    )
  ).rows.map((r) => r.code);
  const a = m
    ? null
    : (
        await tx.query(
          `SELECT id, status::text, full_name, email::text, created_at, review_note
             FROM member_applications WHERE user_id = app.current_user_id() ORDER BY created_at DESC LIMIT 1`
        )
      ).rows[0];
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
    roles,
    primaryRole,
    roleLabel: ROLE_LABEL[primaryRole] ?? primaryRole,
    permissions,
    application: a
      ? { id: a.id, status: a.status, fullName: a.full_name, email: a.email, createdAt: a.created_at, reviewNote: a.review_note }
      : null,
  };
}
