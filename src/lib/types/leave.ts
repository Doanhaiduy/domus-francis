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

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
};

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
  canRequest: boolean;
  canReview: boolean;
}
