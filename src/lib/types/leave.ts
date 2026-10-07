// Đơn xin phép (vắng sự kiện, về muộn, ngủ ngoài, tạm vắng dài) — DTO dùng chung client/server.

export type LeaveKind = "event_absence" | "late_return" | "overnight_out" | "long_leave";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  event_absence: "Vắng một sự kiện",
  late_return: "Về muộn quá giờ giới nghiêm",
  overnight_out: "Ngủ ngoài",
  long_leave: "Tạm vắng nhiều ngày",
};

export const LEAVE_KIND_HINT: Record<LeaveKind, string> = {
  event_absence: "Chọn sự kiện bạn không tham dự được. Được duyệt thì điểm danh ghi “có phép”, không bị trừ điểm.",
  late_return: "Dự kiến giờ về của bạn khi muộn hơn giờ giới nghiêm của nhà.",
  overnight_out: "Đêm đó bạn không ngủ tại lưu xá — cho biết nơi ở để anh em yên tâm.",
  long_leave: "Về quê, thực tập, đi xa vài ngày (tối đa 120 ngày). Cho biết nơi đến và số liên lạc.",
};

/** Loại đơn có "nhờ người để cửa", xin thêm giờ và báo vào nhóm Zalo. */
export const LEAVE_DOOR_KINDS: LeaveKind[] = ["late_return", "overnight_out"];
export const isDoorKind = (k: LeaveKind) => LEAVE_DOOR_KINDS.includes(k);

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
};

/** Một lần xin thêm giờ (chỉ thêm, không sửa/xóa). */
export interface LeaveExtensionDto {
  id: string;
  newEndsAt: string;
  reason: string;
  createdAt: string;
}

export interface LeaveRequestDto {
  id: string;
  memberId: string;
  memberName: string;
  kind: LeaveKind;
  eventId: string | null;
  eventTitle: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  destination: string | null;
  contactPhone: string | null;
  status: LeaveStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  isMine: boolean;
  /** Người được nhờ để cửa (đơn về muộn / ngủ ngoài; tùy chọn) */
  doorMemberId: string | null;
  doorMemberName: string | null;
  /** Các lần xin thêm giờ, theo thứ tự thời gian */
  extensions: LeaveExtensionDto[];
  /** Giờ về hiệu lực = giờ dự kiến lớn nhất (gồm các lần xin thêm) */
  effectiveEndsAt: string;
  /** Người xin còn xin thêm giờ được (đơn của mình, về muộn / ngủ ngoài, đang chờ hoặc đã duyệt, còn trong thời hạn) */
  canExtend: boolean;
}

/** Việc "được nhờ để cửa" của chính mình — không kèm lý do / nơi đến / số điện thoại của người xin. */
export interface LeaveDoorDutyDto {
  leaveId: string;
  memberName: string;
  kind: LeaveKind;
  status: LeaveStatus;
  startsAt: string;
  endsAt: string;
  effectiveEndsAt: string;
}

/** Sự kiện có thể xin vắng (sắp diễn ra, có điểm danh). */
export interface LeaveEventOption {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface LeaveListDto {
  /** Đơn của chính mình (mới nhất trước) */
  mine: LeaveRequestDto[];
  /** Người có leave.review: đơn chờ duyệt + đơn đã xử lý 60 ngày gần đây (không gồm đơn của chính mình) */
  review: LeaveRequestDto[] | null;
  pendingCount: number;
  events: LeaveEventOption[];
  /** Các đơn đang nhờ mình để cửa */
  doorDuties: LeaveDoorDutyDto[];
  canRequest: boolean;
  canReview: boolean;
}
