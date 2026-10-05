// Kiểu dữ liệu phiên dùng chung client/server (GET /api/v1/auth/me)
export interface SessionInfo {
  user: { id: string; email: string | null; phone: string | null; status: string; mustChangePassword: boolean };
  member: {
    id: string;
    fullName: string;
    displayName: string;
    avatarFileId: string | null;
    gender: string | null;
    roomCode: string | null;
    roomName: string | null;
    positionLabel: string | null;
  } | null;
  /** Mã vai trò đang hiệu lực, xếp theo hạng (quyền cao trước): admin, house_head, treasurer, vai trò tự tạo (các ban…), member */
  roles: string[];
  primaryRole: string;
  /** Tên hiển thị của vai trò chính (vai trò tự tạo lấy tên từ bảng roles) */
  roleLabel: string;
  /** Mã vai trò → tên hiển thị (roles.name_vi) cho mọi vai trò người dùng đang giữ */
  roleNames?: Record<string, string>;
  /** Mã quyền nguyên tử (role_permissions) — nguồn duy nhất để ẩn/hiện chức năng trên giao diện */
  permissions: string[];
  application: { id: string; status: string; fullName: string; email: string | null; createdAt: string; reviewNote: string | null } | null;
}

/**
 * Nhãn ngắn của vai trò HỆ THỐNG (và các ban có sẵn). Vai trò tự tạo do Admin thêm không có ở đây — dùng tên từ server
 * (SessionInfo.roleLabel / roleNames, RbacMatrixDto.roles[].name, AssignableRoleDto.name).
 */
export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  house_head: "Trưởng nhà",
  treasurer: "Thủ quỹ",
  liturgy_lead: "Trưởng ban Phụng vụ",
  kitchen_lead: "Trưởng ban Ẩm thực",
  media_lead: "Trưởng ban Truyền thông",
  member: "Thành viên",
};
