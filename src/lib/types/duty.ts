// DTO phân hệ Hậu cần (trực vệ sinh sân nhà theo tuần, báo hỏng) — dùng chung client/server.
// Hệ thống trực nhật CŨ theo ca/khu vực (duty_rosters, duty_assignments, đổi ca…) đã bỏ khỏi ứng dụng; bảng/hàm SQL vẫn giữ để không mất lịch sử.

/** Người trong DTO báo hỏng (người báo, người xử lý). */
export interface DutyPersonDto {
  id: string; // members.id
  name: string; // display_name
  fullName: string;
}

/** Hợp đồng cho Tổng quan: GET /api/v1/duty/summary */
export interface DutySummaryDto {
  /** Khóa của hệ thống trực nhật cũ (ca hôm nay / ngày mai / ca kế tiếp) — đã bỏ, luôn rỗng; giữ để không vỡ hợp đồng cũ của trang Tổng quan */
  today: [];
  tomorrow: [];
  myNext: null;
  openIssuesCount: number;
  /** Số tuần trực đã qua chưa đánh giá (người có duty.review; người khác = 0) */
  pendingReviewsCount: number;
  /** Tuần trực vệ sinh hiện tại (null nếu chưa xếp hoặc chưa cập nhật CSDL) */
  thisWeek?: DutyWeekBriefDto | null;
  /** Lần trực sắp tới của tôi (tuần hiện tại hoặc tuần sau) */
  myNextWeek?: DutyWeekBriefDto | null;
}

// ---------------------------------------------------------------------
// Báo hỏng & sự cố
// ---------------------------------------------------------------------
export type IssueStatus = "new" | "in_progress" | "waiting_parts" | "done" | "cancelled" | "duplicate";
export type IssueUrgency = "low" | "medium" | "high" | "critical";

export interface IssueDto {
  id: string;
  issueNo: number;
  code: string; // LOG-108
  title: string;
  description: string | null;
  location: string;
  roomCode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  urgency: IssueUrgency;
  status: IssueStatus;
  reporter: DutyPersonDto & { roomCode: string | null };
  createdAt: string;
  slaDueAt: string | null;
  acceptedAt: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  isOverdue: boolean;
  assignees: { id: string; memberId: string | null; name: string; roleLabel: "lead" | "helper"; note: string | null; assignedAt: string }[];
  costs: { id: string; kind: "estimate" | "actual"; amount: number; description: string; createdAt: string; createdByName: string | null }[];
  estimateTotal: number;
  actualTotal: number;
  photos: { fileId: string; purpose: "before_photo" | "after_photo" }[];
  history: { from: string | null; to: string; at: string; byName: string | null; reason: string | null }[];
  isMine: boolean;
}

export interface IssuesDto {
  issues: IssueDto[];
  categories: { id: string; code: string; name: string }[];
  areas: { code: string; name: string; icon: string }[];
}

// ---------------------------------------------------------------------
// Trực vệ sinh sân nhà THEO TUẦN (mỗi tuần 1–2 người; Trưởng nhà/Admin xếp lịch, hết tuần chấm điểm + nhận xét)
// ---------------------------------------------------------------------
export const DUTY_WEEK_MAX_MEMBERS = 2;

export interface DutyWeekMemberDto {
  id: string;
  name: string;
  fullName: string;
  room: string | null;
  avatarFileId: string | null;
}

export interface DutyWeekReviewDto {
  score: number; // 0–10
  comment: string | null;
  redoRequired: boolean;
  redoNote: string | null;
  reviewedAt: string; // ISO
  reviewerName: string | null;
}

export interface DutyWeekEntryDto {
  /** null = tuần chưa có lịch */
  id: string | null;
  weekStart: string; // Thứ Hai YYYY-MM-DD
  weekEnd: string; // Chúa Nhật
  members: DutyWeekMemberDto[];
  note: string | null;
  review: DutyWeekReviewDto | null;
  isMine: boolean;
}

export interface DutyCandidateDto {
  id: string;
  name: string;
  fullName: string;
  room: string | null;
  /** Số tuần đã trực trong 26 tuần gần nhất (để xếp luân phiên công bằng) */
  recentCount: number;
  lastWeek: string | null;
}

export interface DutyBoardDto {
  today: string;
  thisWeekStart: string;
  /** Tuần đang xem */
  week: DutyWeekEntryDto;
  /** Các tuần đã có lịch gần đây (mới → cũ), gồm cả tuần sắp tới */
  timeline: DutyWeekEntryDto[];
  canManage: boolean;
  canReview: boolean;
  /** Danh sách thành viên đang ở kèm số lần trực gần đây — chỉ trả khi canManage */
  candidates: DutyCandidateDto[];
  peoplePerWeek: number;
}

/** Trực tuần của tôi / của nhà cho Tổng quan */
export interface DutyWeekBriefDto {
  weekStart: string;
  weekEnd: string;
  members: string[];
  isMine: boolean;
  score: number | null;
  redoRequired: boolean;
}

// ---------------------------------------------------------------------
// Xếp lịch trực tự động nhiều tuần (thứ tự công bằng: ít tuần trực gần đây nhất → lâu nhất chưa trực → số thứ tự thành viên)
// ---------------------------------------------------------------------
export const DUTY_PLAN_MIN_WEEKS = 4;
export const DUTY_PLAN_MAX_WEEKS = 8;

/** keep = giữ nguyên (đã có người, không chọn ghi đè) · locked = đã đánh giá, không đổi được · fill = tuần trống sẽ được xếp · overwrite = thay người đang có */
export type DutyPlanAction = "keep" | "locked" | "fill" | "overwrite";

export interface DutyPlanWeekDto {
  weekStart: string;
  weekEnd: string;
  /** Người đang được xếp (nếu có) */
  existing: DutyWeekMemberDto[];
  note: string | null;
  reviewed: boolean;
  action: DutyPlanAction;
  /** Người đề xuất (action fill/overwrite) */
  proposed: DutyWeekMemberDto[];
}

export interface DutyPlanDto {
  thisWeekStart: string;
  from: string;
  overwrite: boolean;
  peoplePerWeek: number;
  weeks: DutyPlanWeekDto[];
  /** Thành viên đang ở theo thứ tự công bằng (số lần trực tính TRƯỚC khi xếp) — để sửa tay từng tuần */
  candidates: DutyCandidateDto[];
}

export interface DutyBulkResultDto {
  /** Các tuần đã lưu (Thứ Hai) */
  saved: string[];
  skipped: { weekStart: string; reason: string }[];
}

/** Lịch trực + kết quả đánh giá theo khoảng ngày — xuất Excel */
export interface DutyHistoryDto {
  from: string;
  to: string;
  today: string;
  houseName: string | null;
  weeks: DutyWeekEntryDto[];
}
