// Nhật ký hoạt động người dùng (chỉ Admin — quyền activity.log.read). Xem db/app/1016_activity_logs.sql.

export interface ActivityActor {
  userId: string | null;
  name: string;
  email: string | null;
}

export interface ActivityActionDto {
  id: string;
  at: string;
  /** Chuỗi thời gian đầy đủ độ chính xác (dùng làm con trỏ phân trang). */
  cursor: string;
  actor: ActivityActor;
  method: string;
  route: string;
  path: string;
  label: string;
  area: string;
  areaLabel: string;
  status: number;
  ok: boolean;
  errorCode: string | null;
  durationMs: number | null;
  ip: string | null;
  device: string;
  requestId: string | null;
}

export interface ActivityLoginDto {
  id: string;
  at: string;
  cursor: string;
  actor: ActivityActor;
  identifier: string;
  success: boolean;
  reason: string | null;
  reasonLabel: string | null;
  ip: string | null;
  device: string;
}

/** Hành động trong audit_logs (khớp ck_audit_logs__action) + nhãn tiếng Việt — dùng cho bộ lọc "Hành động" và hiển thị. */
export const AUDIT_ACTIONS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "STATE_CHANGE",
  "PERMISSION_CHANGE",
  "SETTING_CHANGE",
  "READ_SENSITIVE",
  "EXPORT",
  "PRINT",
  "DOWNLOAD_FILE",
  "SHARE_LINK",
  "PERIOD_CLOSE",
  "PERIOD_REOPEN",
  "LEDGER_MANUAL_ENTRY",
  "PASSWORD_CHANGE",
  "MFA_CHANGE",
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "OTHER",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  INSERT: "Thêm mới",
  UPDATE: "Sửa",
  DELETE: "Xóa",
  STATE_CHANGE: "Đổi trạng thái",
  PERMISSION_CHANGE: "Đổi quyền",
  SETTING_CHANGE: "Đổi cấu hình",
  READ_SENSITIVE: "Xem dữ liệu nhạy cảm",
  EXPORT: "Xuất dữ liệu",
  PRINT: "In",
  DOWNLOAD_FILE: "Tải tệp",
  SHARE_LINK: "Chia sẻ liên kết",
  PERIOD_CLOSE: "Chốt kỳ",
  PERIOD_REOPEN: "Mở lại kỳ",
  LEDGER_MANUAL_ENTRY: "Bút toán ghi tay",
  PASSWORD_CHANGE: "Đổi mật khẩu",
  MFA_CHANGE: "Đổi xác thực 2 bước",
  LOGIN_SUCCESS: "Đăng nhập",
  LOGIN_FAILURE: "Đăng nhập thất bại",
  LOGOUT: "Đăng xuất",
  OTHER: "Khác",
};

export interface ActivityChangeDto {
  id: string;
  at: string;
  cursor: string;
  actor: ActivityActor;
  action: string;
  actionLabel: string;
  entityTable: string;
  entityLabel: string;
  entityId: string | null;
  changedFields: string[];
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  /** Lý do người thực hiện nêu (bắt buộc với xem dữ liệu nhạy cảm, sửa phiếu chi của Admin, xuất dữ liệu…) */
  reason: string | null;
  ip: string | null;
}

export interface ActivityUserDto {
  userId: string;
  name: string;
  email: string | null;
  total: number;
  errors: number;
  lastAt: string | null;
  lastLoginAt: string | null;
}

export interface ActivityPage<T> {
  items: T[];
  /** Con trỏ trang kế tiếp (null = hết). */
  next: string | null;
}

export interface ActivityQuery {
  userId?: string;
  from?: string;
  to?: string;
  /** all | ok | error */
  result?: "all" | "ok" | "error";
  q?: string;
  area?: string;
  /** Chỉ tab "Thay đổi dữ liệu": lọc theo hành động (INSERT, UPDATE, READ_SENSITIVE…) */
  action?: AuditAction;
  before?: string;
  /** Số dòng mỗi trang (mặc định 30–40; xuất Excel dùng tới 500) */
  limit?: number;
}

/** Xuất Excel phía trình duyệt: tối đa chừng này dòng cho danh sách đang lọc. */
export const ACTIVITY_EXPORT_MAX = 5000;
