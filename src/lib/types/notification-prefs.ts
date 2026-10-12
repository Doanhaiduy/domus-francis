// Tùy chọn nhận thông báo của chính mình (GET/PUT /api/v1/notifications/preferences) — DTO dùng chung client/server.

/** Nhóm thông báo (notification_types.category) — bật/tắt KÊNH ĐẨY theo nhóm + giờ yên tĩnh. */
export const NOTIFICATION_CATEGORIES: { code: string; label: string; text: string }[] = [
  { code: "announcement", label: "Thông báo & bảng tin", text: "Thông báo của người quản lý" },
  { code: "event", label: "Lịch, sự kiện & xin phép", text: "Sự kiện sắp tới, điểm danh, đơn xin phép, đi lễ" },
  { code: "duty", label: "Trực nhật", text: "Lịch trực, đổi ca, nhắc việc" },
  { code: "finance", label: "Thu chi & quỹ", text: "Nhắc đóng quỹ, duyệt chi" },
  { code: "meal", label: "Bếp & cơm", text: "Thực đơn, chốt suất ăn" },
  { code: "academic", label: "Học tập", text: "Bảng điểm, phụ đạo" },
  { code: "facility", label: "Hậu cần", text: "Báo hỏng, sửa chữa" },
  { code: "laundry", label: "Giặt đồ", text: "Lượt giặt, khung giờ trống" },
  { code: "social", label: "Diễn đàn & khoảnh khắc", text: "Bình luận, nhắc tên" },
  { code: "security", label: "Bảo mật", text: "Đăng nhập mới, đổi mật khẩu (luôn bật)" },
  { code: "system", label: "Hệ thống & nhà", text: "Nhắc lịch của nhà, sinh nhật, góp ý, thông tin chung" },
];

/** Một loại thông báo (notification_types) và tùy chọn TẮT RIÊNG của người xem. */
export interface NotificationTypePrefDto {
  code: string;
  category: string;
  name: string;
  /** Loại bắt buộc (bảo mật, thông báo quan trọng…) — không tắt được */
  mandatory: boolean;
  /** Người xem đã tắt riêng loại này */
  muted: boolean;
  /** Số thông báo loại này người xem đã nhận trong 90 ngày */
  received90: number;
}

export interface NotificationPrefsDto {
  categories: { code: string; label: string; text: string }[];
  /** category → bật kênh đẩy (mặc định true khi chưa có dòng) */
  push: Record<string, boolean>;
  quiet: { start: string; end: string } | null;
  devices: number;
  pushAvailable: boolean;
  vapidPublicKey: string | null;
  /** Mọi loại thông báo đang dùng (xếp theo nhóm, tên) + trạng thái tắt riêng */
  types: NotificationTypePrefDto[];
}

/**
 * Loại thông báo thành viên thường hay nhận — mặc định hiện ở mục "Theo từng loại" (cùng các loại người xem đã nhận trong 90 ngày / đã tắt).
 * Các loại khác (của người quản lý, Admin…) nằm trong "Xem tất cả". Loại mới chưa có ở đây vẫn hiện khi người xem đã nhận.
 */
export const COMMON_NOTIFICATION_TYPES: readonly string[] = [
  "announcement.published",
  "event.created",
  "event.reminder",
  "event.attendance_open",
  "event.leave_notice",
  "event.leave_decided",
  "event.leave_door",
  "event.leave_extended",
  "event.liturgy_assigned",
  "liturgy.checkin_reminder",
  "liturgy.checkin_reviewed",
  "liturgy.feast_upcoming",
  "duty.week_assigned",
  "duty.week_changed",
  "duty.week_reminder",
  "duty.week_reviewed",
  "finance.dues_reminder",
  "finance.dues_overdue",
  "finance.claim_decided",
  "finance.donation_decided",
  "finance.expense_decided",
  "finance.expense_paid",
  "meal.reminder",
  "facility.issue_updated",
  "social.forum_reply",
  "system.reminder",
  "system.birthday",
  "system.room_changed",
  "system.discipline_recorded",
  "system.feedback_reply",
  "system.house_rules_ack",
];
