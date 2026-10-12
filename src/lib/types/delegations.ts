// Ủy quyền vai trò tạm thời (bảng role_delegations, tối đa 60 ngày) — DTO dùng chung client/server.

export type DelegationPhase = "upcoming" | "active" | "ended" | "revoked";

export const DELEGATION_MAX_DAYS = 60;

export const DELEGATION_PHASE_LABEL: Record<DelegationPhase, string> = {
  upcoming: "Sắp hiệu lực",
  active: "Đang hiệu lực",
  ended: "Đã hết hạn",
  revoked: "Đã thu hồi",
};

export interface DelegationDto {
  id: string;
  roleCode: string;
  roleName: string;
  delegatorMemberId: string | null;
  delegatorName: string;
  delegateMemberId: string | null;
  delegateName: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  phase: DelegationPhase;
  /** Tôi là người ủy quyền */
  asDelegator: boolean;
  /** Tôi là người được ủy quyền */
  asDelegate: boolean;
  /** Thu hồi sớm được (chưa hết hạn / chưa thu hồi; người ủy quyền hoặc người có quyền gán vai trò) */
  canRevoke: boolean;
}

export interface DelegableRoleDto {
  code: string;
  name: string;
}

export interface DelegationsDto {
  items: DelegationDto[];
  /** Vai trò tôi đang giữ trực tiếp và ủy quyền được (không gồm Admin) */
  myRoles: DelegableRoleDto[];
  /** Tôi tạo được ủy quyền mới (có quyền auth.role.delegate và đang giữ ít nhất một vai trò ủy quyền được) */
  canDelegate: boolean;
  maxDays: number;
}
