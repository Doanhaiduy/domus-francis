import "server-only";
import { z } from "zod";
import { batch, type Tx } from "../db";
import { ApiError, conflict, forbidden, notFound } from "../errors";
import {
  PERMISSION_MODULE_LABEL,
  PROTECTED_PERMISSIONS,
  ROLE_CODE_RE,
  type PermissionModuleDto,
  type RbacMatrixDto,
  type RoleDto,
  type RoleHolderDto,
  type RoleInput,
} from "@/lib/types/settings";

/** Thân chung khi thêm/sửa vai trò (app.fn_role_save kiểm lại toàn bộ ở DB: hạng 41–89, quyền tồn tại, quyền bảo vệ…). */
export const RoleBody = z.object({
  name: z.string().trim().min(2, "Tên vai trò tối thiểu 2 ký tự.").max(80, "Tên vai trò tối đa 80 ký tự."),
  description: z.string().trim().max(300, "Mô tả tối đa 300 ký tự.").nullable().optional(),
  rank: z.number().int("Thứ hạng phải là số nguyên.").min(0).max(100).nullable().optional(),
  permissions: z
    .array(z.string().trim().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Mã quyền không hợp lệ."))
    .max(300)
    .nullable()
    .optional(),
});

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
 * những người khác chỉ thấy vai trò của chính mình. Vai trò đã xóa (lưu trữ — roles.archived_at) không hiển thị.
 */
export async function getRbacMatrix(tx: Tx): Promise<RbacMatrixDto> {
  // Gộp 4 truy vấn độc lập: 1 vòng mạng thay vì 4
  const [rolesR, permsR, holdersR, metaR] = await batch(tx, [
    [
      `SELECT r.id, r.code, r.name_vi, r.description, r.rank, r.is_system,
              COALESCE((SELECT array_agg(rp.permission_code ORDER BY rp.permission_code) FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS perms
         FROM roles r
        WHERE r.archived_at IS NULL
        ORDER BY r.rank, r.code`,
    ],
    [
      `SELECT p.code, p.module, p.description, p.is_sensitive,
              COALESCE(array_agg(r.code ORDER BY r.rank, r.code) FILTER (WHERE r.id IS NOT NULL), '{}') AS roles
         FROM permissions p
         LEFT JOIN role_permissions rp ON rp.permission_code = p.code
         LEFT JOIN roles r ON r.id = rp.role_id AND r.archived_at IS NULL
        GROUP BY p.code
        ORDER BY p.module, p.code`,
    ],
    [
      `SELECT ur.user_id, r.code AS role_code, ur.valid_to, ur.scope_type::text AS scope_type,
              m.id AS member_id, m.display_name, m.full_name, m.avatar_file_id
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL
         LEFT JOIN members m ON m.user_id = ur.user_id AND m.deleted_at IS NULL
        WHERE ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
        ORDER BY r.rank, m.display_name NULLS LAST`,
    ],
    [
      `SELECT app.has_any_permission(ARRAY['auth.user.read', 'auth.role.assign']) AS see_all,
              app.has_permission('auth.role.manage') AS can_manage,
              app.has_permission('auth.role.assign') AS can_assign,
              app.rbac_protected_permissions() AS protected`,
    ],
  ]);
  const roles = rolesR.rows as { id: string; code: string; name_vi: string; description: string | null; rank: number; is_system: boolean; perms: string[] }[];
  const perms = permsR.rows as { code: string; module: string; description: string; is_sensitive: boolean; roles: string[] }[];
  const holders = holdersR.rows as {
    user_id: string;
    role_code: string;
    valid_to: Date | null;
    scope_type: string;
    member_id: string | null;
    display_name: string | null;
    full_name: string | null;
    avatar_file_id: string | null;
  }[];
  const meta = metaR.rows[0] as { see_all: boolean; can_manage: boolean; can_assign: boolean; protected: string[] | null } | undefined;

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
    archived: false,
    permissionCount: r.perms.length,
    permissions: r.perms,
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
    holdersVisibility: meta?.see_all ? "all" : "own",
    canManage: !!meta?.can_manage,
    canAssign: !!meta?.can_assign,
    protectedPermissions: meta?.protected ?? [...PROTECTED_PERMISSIONS],
  };
}

/** Kiểm định dạng mã vai trò trên đường dẫn (/api/v1/rbac/roles/{code}); sai ⇒ 404 (không lộ lý do). */
export function roleCodeParam(raw: string | undefined): string {
  const code = (raw ?? "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) throw notFound("Không tìm thấy vai trò.");
  return code;
}

async function requireManage(tx: Tx) {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('auth.role.manage') AS ok")).rows[0].ok;
  if (!ok) throw forbidden("Chỉ Admin được thêm, sửa hoặc xóa vai trò.");
}

/** Tạo vai trò tự tạo (app.fn_role_save — DB kiểm quyền auth.role.manage, mã, hạng, quyền bảo vệ). */
export async function createRole(tx: Tx, input: RoleInput & { code: string }) {
  const code = input.code.trim().toLowerCase();
  if (!ROLE_CODE_RE.test(code)) {
    throw new ApiError(400, "BAD_ROLE_CODE", "Mã vai trò 3–40 ký tự, bắt đầu bằng chữ thường không dấu, chỉ gồm chữ thường, số và dấu gạch dưới.");
  }
  // Gộp kiểm quyền + kiểm trùng mã (kể cả vai trò đã xóa đang lưu trữ): 1 vòng mạng
  const [okR, dupR] = await batch(tx, [
    ["SELECT app.has_permission('auth.role.manage') AS ok"],
    ["SELECT name_vi, archived_at IS NOT NULL AS archived FROM roles WHERE code = $1", [code]],
  ]);
  if (!(okR.rows[0] as { ok: boolean }).ok) throw forbidden("Chỉ Admin được thêm, sửa hoặc xóa vai trò.");
  const dup = dupR.rows[0] as { name_vi: string; archived: boolean } | undefined;
  if (dup) {
    throw conflict(
      dup.archived ? `Mã "${code}" từng dùng cho vai trò đã xóa "${dup.name_vi}" — hãy chọn mã khác.` : `Mã "${code}" đã thuộc vai trò "${dup.name_vi}".`,
      "ROLE_EXISTS",
    );
  }
  await tx.query("SELECT app.fn_role_save($1, $2, $3, $4::smallint, $5::text[])", [
    code,
    input.name,
    input.description ?? null,
    input.rank ?? null,
    input.permissions ?? [],
  ]);
  return code;
}

/** Thân PATCH: mọi trường tùy chọn — trường không gửi giữ nguyên giá trị hiện tại. */
export const RolePatchBody = RoleBody.partial();

/**
 * Sửa vai trò: hệ thống ⇒ chỉ tên/mô tả; tự tạo ⇒ tên/mô tả/hạng/bộ quyền. Trường không gửi (undefined) giữ nguyên;
 * description null = xóa mô tả; permissions null/không gửi = giữ nguyên bộ quyền.
 */
export async function updateRole(tx: Tx, code: string, input: Partial<RoleInput>) {
  const [okR, curR] = await batch(tx, [
    ["SELECT app.has_permission('auth.role.manage') AS ok"],
    ["SELECT name_vi, description, is_system, archived_at IS NOT NULL AS archived FROM roles WHERE code = $1", [code]],
  ]);
  if (!(okR.rows[0] as { ok: boolean }).ok) throw forbidden("Chỉ Admin được thêm, sửa hoặc xóa vai trò.");
  const cur = curR.rows[0] as { name_vi: string; description: string | null; is_system: boolean; archived: boolean } | undefined;
  if (!cur || cur.archived) throw notFound("Không tìm thấy vai trò.");
  await tx.query("SELECT app.fn_role_save($1, $2, $3, $4::smallint, $5::text[])", [
    code,
    input.name ?? cur.name_vi,
    input.description === undefined ? cur.description : input.description,
    cur.is_system ? null : (input.rank ?? null),
    input.permissions ?? null,
  ]);
}

/** Xóa vai trò tự tạo: 'deleted' (chưa từng dùng) hoặc 'archived' (còn lịch sử — người đang giữ bị thu hồi ngay). */
export async function deleteRole(tx: Tx, code: string): Promise<"deleted" | "archived"> {
  await requireManage(tx);
  const r = await tx.query<{ result: "deleted" | "archived" }>("SELECT app.fn_role_delete($1) AS result", [code]);
  return r.rows[0].result;
}
