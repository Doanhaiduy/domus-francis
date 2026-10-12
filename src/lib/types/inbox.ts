// Hộp "Việc cần xử lý" của người quản lý (GET /api/v1/inbox) — gói B.
// Mỗi loại việc chỉ có mặt khi người xem có quyền xử lý loại đó; count = số việc đang chờ.

export type InboxKind =
  | "leave" // đơn xin phép chờ duyệt
  | "expense_approve" // phiếu chi chờ tôi ký/duyệt
  | "expense_pay" // phiếu chi đã duyệt, chờ chi tiền
  | "application" // đơn đăng ký tài khoản (vào nhà) chờ duyệt
  | "inquiry" // đăng ký tìm hiểu từ trang công khai chưa xử lý
  | "claim" // "Tôi đã đóng" chờ Thủ quỹ xác nhận
  | "donation" // khoản ủng hộ chờ xác nhận
  | "bank_line" // giao dịch ngân hàng chưa khớp
  | "mass_checkin" // check-in đi lễ chờ duyệt
  | "transcript" // bảng điểm / minh chứng học tập chờ duyệt
  | "issue" // sự cố / báo hỏng chưa xử lý (mới, chưa giao, quá hạn)
  | "duty_review" // tuần trực đã qua chưa đánh giá
  | "discipline_overdue" // hình phạt quá hạn chưa chấp hành xong
  | "feedback" // góp ý mới về ứng dụng
  | "data_request"; // yêu cầu về dữ liệu cá nhân (xem/sửa/xóa) chờ xử lý

export interface InboxItem {
  kind: InboxKind;
  /** Nhãn tiếng Việt ngắn, vd. "Đơn xin phép chờ duyệt" */
  label: string;
  count: number;
  /** Trang mở để xử lý (đường dẫn trong ứng dụng, có thể kèm ?tab=) */
  href: string;
  /** Có việc quá hạn / gấp ⇒ tô đỏ */
  urgent?: boolean;
  /** Số việc quá hạn / gấp trong `count` (0 = không có) — dùng cho tin tóm tắt buổi sáng */
  overdue?: number;
  /** Ghi chú ngắn, vd. "2 đơn quá 3 ngày" */
  hint?: string | null;
}

export interface InboxDto {
  /** Tổng số việc đang chờ (cộng count của mọi mục) */
  total: number;
  /** Người xem có ít nhất một quyền xử lý (false ⇒ ẩn hẳn thẻ "Việc cần xử lý") */
  eligible: boolean;
  /** Chỉ các loại việc có count > 0, việc gấp lên trước */
  items: InboxItem[];
  generatedAt: string;
}

/**
 * Quyền xử lý từng loại việc (có MỘT trong các quyền là đủ) — dùng chung cho máy chủ (đếm) và giao diện (khỏi gọi API khi không có quyền nào).
 * Quyền mới của gói khác (vd. privacy.manage) chưa có thì app.has_permission trả false, không lỗi.
 */
export const INBOX_KIND_PERMISSIONS: Record<InboxKind, readonly string[]> = {
  leave: ["leave.review"],
  expense_approve: ["finance.expense.approve"],
  expense_pay: ["finance.expense.pay"],
  application: ["application.review"],
  inquiry: ["application.review"],
  claim: ["finance.contribution.record"],
  donation: ["finance.contribution.record"],
  bank_line: ["finance.reconcile"],
  mass_checkin: ["liturgy.calendar.manage"],
  transcript: ["academic.verify"],
  issue: ["issue.triage", "issue.resolve"],
  duty_review: ["duty.review"],
  discipline_overdue: ["discipline.manage"],
  feedback: ["feedback.manage"],
  data_request: ["privacy.manage", "dsr.manage"],
};

/** Mọi quyền làm người xem "có hộp việc" (eligible). */
export const INBOX_PERMISSIONS: string[] = [...new Set(Object.values(INBOX_KIND_PERMISSIONS).flat())];

/** Nhãn từng loại việc. */
export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  leave: "Đơn xin phép chờ duyệt",
  expense_approve: "Phiếu chi chờ bạn duyệt",
  expense_pay: "Phiếu chi đã duyệt, chờ chi tiền",
  application: "Đơn đăng ký tài khoản chờ duyệt",
  inquiry: "Đăng ký tìm hiểu chưa liên hệ",
  claim: "Báo đã đóng quỹ chờ xác nhận",
  donation: "Khoản ủng hộ chờ xác nhận",
  bank_line: "Giao dịch ngân hàng chưa khớp",
  mass_checkin: "Check-in đi lễ chờ duyệt",
  transcript: "Bảng điểm chờ xác minh",
  issue: "Sự cố cần xử lý",
  duty_review: "Tuần trực chưa đánh giá",
  discipline_overdue: "Hình phạt quá hạn chưa xong",
  feedback: "Góp ý mới về ứng dụng",
  data_request: "Yêu cầu về dữ liệu cá nhân",
};

/** Thứ tự hiển thị (cùng mức gấp): việc ảnh hưởng người khác / tiền bạc trước. */
export const INBOX_KIND_ORDER: readonly InboxKind[] = [
  "leave",
  "expense_approve",
  "expense_pay",
  "issue",
  "claim",
  "bank_line",
  "donation",
  "application",
  "inquiry",
  "mass_checkin",
  "transcript",
  "duty_review",
  "discipline_overdue",
  "data_request",
  "feedback",
];
