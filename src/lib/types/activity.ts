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
  before?: string;
}
