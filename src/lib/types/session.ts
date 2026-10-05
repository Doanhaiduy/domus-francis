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
  /** Mã vai trò hệ thống đang hiệu lực, xếp theo hạng (quyền cao trước): admin, house_head, vice_head, treasurer, … member */
  roles: string[];
  primaryRole: string;
  roleLabel: string;
  /** Mã quyền nguyên tử (role_permissions) — nguồn duy nhất để ẩn/hiện chức năng trên giao diện */
  permissions: string[];
  application: { id: string; status: string; fullName: string; email: string | null; createdAt: string; reviewNote: string | null } | null;
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  house_head: "Trưởng nhà",
  vice_head: "Phó nhà",
  treasurer: "Thủ quỹ",
  liturgy_lead: "Trưởng ban Phụng vụ",
  kitchen_lead: "Trưởng ban Ẩm thực",
  media_lead: "Trưởng ban Truyền thông",
  member: "Thành viên",
};
