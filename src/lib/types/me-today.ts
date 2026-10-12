// "Việc của tôi hôm nay" (GET /api/v1/me/today — src/server/modules/me-today.ts) + dữ liệu cho danh sách "Bắt đầu với Lưu Xá"
// (OnboardingChecklist). DTO dùng chung client/server. Mọi mục là việc của CHÍNH người xem (không bao giờ là việc của người khác).
import type { AttendanceStatus } from "./events";
import type { LeaveKind, LeaveStatus } from "./leave";
import type { MassCheckinStatus } from "./liturgy";

/** todo = cần làm (có nút một chạm) · info = cần biết · done = đã xong hôm nay (hiện gọn ở cuối thẻ) */
export type MyTodayState = "todo" | "info" | "done";

interface ItemBase {
  /** Khóa ổn định cho React, vd. "dues:<id>" */
  key: string;
  state: MyTodayState;
  /** Quá hạn / gấp ⇒ tô đỏ và lên đầu */
  urgent: boolean;
  title: string;
  hint: string | null;
  /** Trang xem chi tiết (đường dẫn trong ứng dụng) */
  href: string;
}

/** Tuần trực vệ sinh sân nhà của tôi (tuần này / tuần sau / được yêu cầu trực lại). */
export interface MyTodayDutyWeek extends ItemBase {
  kind: "duty_week";
  weekStart: string;
  weekEnd: string;
  when: "this" | "next" | "redo";
  partners: string[];
}

export interface MyTodayMealSlot {
  meal: "lunch" | "dinner";
  /** null = chưa báo */
  willEat: boolean | null;
  cutoffAt: string;
  /** Còn đổi được (chưa quá giờ chốt, bữa không đóng/hủy) */
  open: boolean;
  /** Bữa này nghỉ nấu */
  cancelled: boolean;
}

/** Cơm hôm nay (chỉ khi phân hệ Bếp & Cơm đang bật và có quyền đăng ký suất). */
export interface MyTodayMeal extends ItemBase {
  kind: "meal";
  date: string;
  meals: MyTodayMealSlot[];
}

/** Một khoản quỹ chưa đóng của tôi. */
export interface MyTodayDues extends ItemBase {
  kind: "dues";
  contributionId: string;
  planId: string;
  planCode: string;
  planName: string;
  remainingVnd: number;
  dueDate: string;
  overdue: boolean;
  /** Đã bấm "Tôi đã đóng" — chờ Thủ quỹ xác nhận (không cần nộp thêm) */
  claimPending: boolean;
}

export interface MyTodayEventRef {
  id: string;
  title: string;
  /** YYYY-MM-DD (giờ VN) */
  dateIso: string;
  /** DD/MM/YYYY */
  date: string;
  startHm: string;
  endHm: string;
  location: string;
  startsAt: string;
  endsAt: string;
}

/** Sự kiện hôm nay có điểm danh mà tôi phải có mặt. */
export interface MyTodayEventCheckin extends ItemBase {
  kind: "event_checkin";
  event: MyTodayEventRef;
  /** Giờ mở điểm danh */
  opensAt: string;
  /** Đang trong cửa sổ điểm danh (chụp ảnh gửi là được) */
  open: boolean;
  attendance: AttendanceStatus | null;
}

/** Lễ bắt buộc check-in (hôm nay, ngày lễ vừa qua còn hạn, hoặc lễ ngày mai — lễ vọng). */
export interface MyTodayMass extends ItemBase {
  kind: "mass";
  date: string;
  label: string;
  evidenceRequired: boolean;
  deadline: string;
  status: MassCheckinStatus | null;
  reviewNote: string | null;
}

/** Tôi được nhờ để cửa cho người về muộn / ngủ ngoài. */
export interface MyTodayDoor extends ItemBase {
  kind: "door";
  leaveId: string;
  memberName: string;
  leaveKind: LeaveKind;
  status: LeaveStatus;
  effectiveEndsAt: string;
}

/** Đơn xin phép của tôi đang chờ duyệt / đang hiệu lực / sắp hết giờ. */
export interface MyTodayLeave extends ItemBase {
  kind: "leave";
  leaveId: string;
  leaveKind: LeaveKind;
  status: LeaveStatus;
  startsAt: string;
  endsAt: string;
  effectiveEndsAt: string;
  eventTitle: string | null;
  doorMemberName: string | null;
  extensions: number;
  /** Còn xin thêm giờ được (đơn về muộn / ngủ ngoài) */
  canExtend: boolean;
}

/** Phân công phục vụ phụng vụ của tôi trong 7 ngày tới. */
export interface MyTodayLiturgy extends ItemBase {
  kind: "liturgy";
  assignmentId: string;
  status: "assigned" | "confirmed";
  roleName: string;
  eventTitle: string;
  startsAt: string;
}

/** Hình phạt đang / sắp chấp hành hoặc quá hạn. */
export interface MyTodayDiscipline extends ItemBase {
  kind: "discipline";
  recordId: string;
  phase: "upcoming" | "serving" | "overdue";
  penalty: string;
  ruleTitle: string;
  startsOn: string | null;
  endsOn: string | null;
  isRed: boolean;
}

/** Chưa xác nhận đã đọc phiên bản Luật nhà hiện hành. */
export interface MyTodayHouseRules extends ItemBase {
  kind: "house_rules";
  version: string;
  updatedAt: string | null;
  /** Đã từng xác nhận một phiên bản cũ hơn */
  everAcked: boolean;
}

export type MyTodayItem =
  | MyTodayDutyWeek
  | MyTodayMeal
  | MyTodayDues
  | MyTodayEventCheckin
  | MyTodayMass
  | MyTodayDoor
  | MyTodayLeave
  | MyTodayLiturgy
  | MyTodayDiscipline
  | MyTodayHouseRules;

export type MyTodayKind = MyTodayItem["kind"];

/** Dữ liệu cho danh sách "Bắt đầu với Lưu Xá" (thành viên mới). Cài ứng dụng / thông báo trên THIẾT BỊ NÀY do trình duyệt tự kiểm. */
export interface OnboardingDto {
  joinedOn: string;
  daysSinceJoined: number;
  /** Vào nhà ≤ 30 ngày */
  isNew: boolean;
  avatar: boolean;
  paymentAccount: boolean;
  /** Số thiết bị đã bật thông báo đẩy (mọi thiết bị của tài khoản) */
  pushDevices: number;
  /** Đã từng chọn (đồng ý hoặc không) một mục đồng ý dữ liệu ở Cài đặt → Hồ sơ */
  consentChoice: boolean;
  houseRules: { version: string | null; updatedAt: string | null; ackedAt: string | null };
}

export interface MyTodayDto {
  /** YYYY-MM-DD (giờ VN) */
  today: string;
  generatedAt: string;
  /** Xếp sẵn: gấp → cần làm → cần biết → đã xong */
  items: MyTodayItem[];
  /** Số mục cần làm (state = todo) */
  todo: number;
  /** Mọi khoản quỹ chưa đóng của tôi (kể cả khoản chưa tới hạn không hiện trong danh sách) */
  dues: { count: number; totalVnd: number; hidden: number };
  onboarding: OnboardingDto | null;
}

/** Thứ tự loại việc khi cùng mức (việc có hạn trong ngày lên trước). */
export const MY_TODAY_KIND_ORDER: readonly MyTodayKind[] = [
  "event_checkin",
  "mass",
  "meal",
  "door",
  "leave",
  "liturgy",
  "duty_week",
  "dues",
  "discipline",
  "house_rules",
];
