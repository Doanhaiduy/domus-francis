import "server-only";
import type { Tx } from "../db";
import { PERMISSION_MODULE_LABEL, type PermissionModuleDto, type RbacMatrixDto, type RoleDto, type RoleHolderDto } from "@/lib/types/settings";

const MODULE_ORDER = [
  "setting",
  "auth",
  "audit",
  "member",
  "house",
  "duty",
  "academic",
  "event",
  "finance",
  "facility",
  "community",
  "storage",
  "ai",
];

/**
 * Ma trận phân quyền sinh từ dữ liệu: roles × permissions × role_permissions (bảng chỉ đọc với luuxa_app, mọi người đã đăng nhập
 * đều đọc được). Người giữ vai trò lấy từ user_roles còn hiệu lực — RLS chỉ cho người có auth.user.read/auth.role.assign thấy hết,
 * những người khác chỉ thấy vai trò của chính mình.
 */
export async function getRbacMatrix(tx: Tx): Promise<RbacMatrixDto> {
  const roles = (
    await tx.query<{ id: string; code: string; name_vi: string; description: string | null; rank: number; is_system: boolean; n: number }>(
      `SELECT r.id, r.code, r.name_vi, r.description, r.rank, r.is_system,
              (SELECT count(*)::int FROM role_permissions rp WHERE rp.role_id = r.id) AS n
         FROM roles r ORDER BY r.rank, r.code`,
    )
  ).rows;

  const perms = (
    await tx.query<{ code: string; module: string; description: string; is_sensitive: boolean; roles: string[] }>(
      `SELECT p.code, p.module, p.description, p.is_sensitive,
              COALESCE(array_agg(r.code ORDER BY r.rank, r.code) FILTER (WHERE r.id IS NOT NULL), '{}') AS roles
         FROM permissions p
         LEFT JOIN role_permissions rp ON rp.permission_code = p.code
         LEFT JOIN roles r ON r.id = rp.role_id
        GROUP BY p.code
        ORDER BY p.module, p.code`,
    )
  ).rows;

  const holders = (
    await tx.query<{
      user_id: string;
      role_code: string;
      valid_to: Date | null;
      scope_type: string;
      member_id: string | null;
      display_name: string | null;
      full_name: string | null;
      avatar_file_id: string | null;
    }>(
      `SELECT ur.user_id, r.code AS role_code, ur.valid_to, ur.scope_type::text AS scope_type,
              m.id AS member_id, m.display_name, m.full_name, m.avatar_file_id
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         LEFT JOIN members m ON m.user_id = ur.user_id AND m.deleted_at IS NULL
        WHERE ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
        ORDER BY r.rank, m.display_name NULLS LAST`,
    )
  ).rows;

  const seeAll = (await tx.query<{ ok: boolean }>("SELECT app.has_any_permission(ARRAY['auth.user.read', 'auth.role.assign']) AS ok")).rows[0]?.ok;

  const byRole = new Map<string, RoleHolderDto[]>();
  for (const h of holders) {
    const list = byRole.get(h.role_code) ?? [];
    if (list.some((x) => x.userId === h.user_id)) continue; // một người có thể giữ vai trò ở nhiều phạm vi
    list.push({
      userId: h.user_id,
      memberId: h.member_id,
      name: h.display_name ?? "Tài khoản chưa có hồ sơ",
      fullName: h.full_name,
      avatarFileId: h.avatar_file_id,
      validTo: h.valid_to ? new Date(h.valid_to).toISOString() : null,
      scopeType: h.scope_type,
    });
    byRole.set(h.role_code, list);
  }

  const roleDtos: RoleDto[] = roles.map((r) => ({
    code: r.code,
    name: r.name_vi,
    description: r.description,
    rank: r.rank,
    isSystem: r.is_system,
    permissionCount: r.n,
    holders: byRole.get(r.code) ?? [],
  }));

  const modules = new Map<string, PermissionModuleDto>();
  for (const p of perms) {
    const m = modules.get(p.module) ?? { code: p.module, label: PERMISSION_MODULE_LABEL[p.module] ?? p.module, permissions: [] };
    m.permissions.push({ code: p.code, module: p.module, description: p.description, isSensitive: p.is_sensitive, roles: p.roles });
    modules.set(p.module, m);
  }
  const order = (c: string) => {
    const i = MODULE_ORDER.indexOf(c);
    return i < 0 ? 999 : i;
  };

  return {
    roles: roleDtos,
    modules: [...modules.values()].sort((a, b) => order(a.code) - order(b.code) || a.code.localeCompare(b.code)),
    holdersVisibility: seeAll ? "all" : "own",
  };
}
