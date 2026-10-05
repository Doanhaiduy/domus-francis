// Kiểu dữ liệu dùng chung client/server cho màn hình Cài đặt → "Tài khoản" (quản lý tài khoản đăng nhập + gán vai trò).

/** Trạng thái tài khoản hiển thị: none = thành viên chưa được cấp tài khoản. */
export type AccountStatus = "none" | "invited" | "active" | "locked" | "disabled";

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  none: "Chưa có tài khoản",
  invited: "Chờ kích hoạt",
  active: "Đang hoạt động",
  locked: "Bị khóa",
  disabled: "Vô hiệu",
};

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  active: "Đang ở",
  on_leave: "Tạm vắng",
  alumni: "Cựu thành viên",
  left: "Đã rời lưu xá",
};

/** Vai trò có thể gán (roles chưa lưu trữ), xếp theo hạng. */
export interface AssignableRoleDto {
  code: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
}

export interface AccountRoleDto {
  code: string;
  name: string;
}

export interface AccountDto {
  /** users.id — null khi thành viên chưa có tài khoản */
  userId: string | null;
  /** members.id — null với tài khoản không gắn hồ sơ (tài khoản kỹ thuật) */
  memberId: string | null;
  fullName: string;
  displayName: string;
  avatarFileId: string | null;
  /** Trạng thái cư trú của thành viên (active / on_leave / alumni / left) */
  memberStatus: string | null;
  /** Email đăng nhập (users.email) */
  email: string | null;
  /** Email liên lạc trên hồ sơ thành viên — gợi ý khi cấp tài khoản */
  contactEmail: string | null;
  phone: string | null;
  status: AccountStatus;
  /** Đang bị khóa tạm do đăng nhập sai nhiều lần (users.locked_until > now) */
  tempLocked: boolean;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  roles: AccountRoleDto[];
  /** Tài khoản giữ vai trò đặc quyền (Admin / Trưởng nhà / Thủ quỹ…) — thao tác cần quyền gán vai trò (BR-AUTH-22) */
  privileged: boolean;
  /** Tài khoản của chính người đang xem */
  isSelf: boolean;
}

export interface AccountsListDto {
  items: AccountDto[];
  assignableRoles: AssignableRoleDto[];
  /** auth.user.manage — cấp tài khoản, đặt lại mật khẩu, khóa/mở khóa, vô hiệu/kích hoạt */
  canManage: boolean;
  /** auth.role.assign — gán/thu hồi vai trò; thao tác trên tài khoản đặc quyền */
  canAssign: boolean;
  /** Người xem đang giữ vai trò Admin (chỉ Admin gán được vai trò Admin) */
  canAssignAdmin: boolean;
}

/** GET/POST /api/v1/members/{id}/roles và POST /api/v1/accounts/{userId}/roles */
export interface MemberRolesDto {
  hasAccount: boolean;
  roles: string[];
  assignable: AssignableRoleDto[];
  canAssignAdmin: boolean;
}

export type AccountAction = "lock" | "unlock" | "disable" | "enable";

export const ACCOUNT_ACTION_LABEL: Record<AccountAction, string> = {
  lock: "Khóa tài khoản",
  unlock: "Mở khóa",
  disable: "Vô hiệu hóa",
  enable: "Kích hoạt lại",
};
