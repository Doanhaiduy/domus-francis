// Đơn xin phép (vắng sự kiện, về muộn, ngủ ngoài, tạm vắng dài) — DTO dùng chung client/server.

export type LeaveKind =
  | "event_absence"
  | "late_return"
  | "overnight_out"
  | "long_leave"
  | "home_visit"
  | "tet_break"
  | "summer_break"
  | "holiday_break"
  | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  event_absence: "Vắng một sự kiện",
  late_return: "Về muộn quá giờ giới nghiêm",
  overnight_out: "Ngủ ngoài",
  long_leave: "Tạm vắng nhiều ngày",
  home_visit: "Về quê",
  tet_break: "Nghỉ Tết",
  summer_break: "Nghỉ hè",
  holiday_break: "Nghỉ lễ",
  other: "Lý do khác",
};

/** Nhãn ngắn IN HOA cho tin nhóm Zalo. */
export const LEAVE_KIND_SHORT: Record<LeaveKind, string> = {
  event_absence: "VẮNG SỰ KIỆN",
  late_return: "VỀ MUỘN",
  overnight_out: "NGỦ NGOÀI",
  long_leave: "TẠM VẮNG DÀI NGÀY",
  home_visit: "VỀ QUÊ",
  tet_break: "NGHỈ TẾT",
  summer_break: "NGHỈ HÈ",
  holiday_break: "NGHỈ LỄ",
  other: "XIN PHÉP",
};

/** Thứ tự và nhóm hiển thị trong ô chọn loại đơn. */
export const LEAVE_KIND_GROUPS: { label: string; kinds: LeaveKind[] }[] = [
  { label: "Trong ngày / đêm", kinds: ["event_absence", "late_return", "overnight_out"] },
  { label: "Nghỉ nhiều ngày", kinds: ["home_visit", "tet_break", "summer_break", "holiday_break", "long_leave", "other"] },
];

/** Loại đơn bắt buộc cho biết nơi đến. */
export const LEAVE_PLACE_KINDS: LeaveKind[] = ["overnight_out", "long_leave", "home_visit", "tet_break", "summer_break", "holiday_break"];
export const leaveNeedsPlace = (k: LeaveKind) => LEAVE_PLACE_KINDS.includes(k);

/** Loại đơn nghỉ nhiều ngày (có số điện thoại liên lạc, mốc gợi ý theo ngày). */
export const LEAVE_LONG_KINDS: LeaveKind[] = ["long_leave", "home_visit", "tet_break", "summer_break", "holiday_break", "other"];
export const isLongKind = (k: LeaveKind) => LEAVE_LONG_KINDS.includes(k);

export const LEAVE_KIND_HINT: Record<LeaveKind, string> = {
  event_absence: "Chọn sự kiện bạn không tham dự được. Được duyệt thì điểm danh ghi “có phép”, không bị trừ điểm.",
  late_return: "Dự kiến giờ về của bạn khi muộn hơn giờ giới nghiêm của nhà.",
  overnight_out: "Đêm đó bạn không ngủ tại lưu xá — cho biết nơi ở để anh em yên tâm.",
  long_leave: "Thực tập, đi xa vài ngày (tối đa 120 ngày). Cho biết nơi đến và số liên lạc.",
  home_visit: "Về quê thăm nhà vài ngày. Cho biết quê ở đâu và số liên lạc.",
  tet_break: "Nghỉ Tết Nguyên đán — cho biết ngày đi, ngày dự kiến quay lại nhà và nơi ở.",
  summer_break: "Nghỉ hè — cho biết ngày về quê và ngày dự kiến quay lại nhà.",
  holiday_break: "Nghỉ các dịp lễ (Giáng sinh, 30/4, 2/9…) — cho biết nơi ở trong những ngày nghỉ.",
  other: "Trường hợp khác không thuộc các loại trên — ghi rõ lý do để người quản lý nắm.",
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
  /** Sửa được: chính chủ khi đơn còn chờ duyệt, hoặc Admin (leave.manage) bất kỳ lúc nào */
  canEdit: boolean;
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
  /** Admin (leave.manage): xem toàn bộ và sửa mọi đơn */
  canManage: boolean;
}

/** Trang kết quả của tab "Tất cả đơn" (người có leave.review). */
export interface LeaveAllDto {
  items: LeaveRequestDto[];
  total: number;
  /** Số đơn theo trạng thái (không phụ thuộc bộ lọc trạng thái) */
  counts: Record<LeaveStatus, number>;
  hasMore: boolean;
}

/** Một dòng "tối nay ai vắng / về muộn" — CHỈ tên, loại đơn, giờ (không lý do / nơi đến / số điện thoại). */
export interface LeaveTonightItemDto {
  leaveId: string;
  memberName: string;
  kind: LeaveKind;
  startsAt: string;
  endsAt: string;
  /** Giờ về hiệu lực (gồm các lần xin thêm giờ) */
  effectiveEndsAt: string;
  /** Tôi là người được nhờ để cửa cho đơn này */
  doorForMe: boolean;
}

/** Đơn đã duyệt có hiệu lực tối nay (18:00 → 06:00 giờ VN) cho người quản lý (leave.review) và người được nhờ giữ cửa tối nay. */
export interface LeaveTonightDto {
  items: LeaveTonightItemDto[];
}
