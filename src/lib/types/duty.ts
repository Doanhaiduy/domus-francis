// DTO phân hệ Hậu cần & Trực nhật (trực nhật, báo hỏng) — dùng chung client/server.

// ---------------------------------------------------------------------
// Trực nhật
// ---------------------------------------------------------------------
export type DutyStatus = "scheduled" | "checked_in" | "approved" | "rework_required" | "missed" | "cancelled" | "excused";
export type RosterStatus = "none" | "draft" | "published" | "closed";
export type SwapStatus = "pending_peer" | "pending_admin" | "approved" | "rejected" | "cancelled" | "expired";

export interface CleaningAreaDto {
  id: string;
  code: string;
  name: string;
  icon: string;
  description: string | null;
  minAssignees: number;
  isWholeHouse: boolean;
  difficultyPoints: number;
}

export interface DutyShiftDto {
  id: string;
  code: string;
  name: string; // "Ca Sáng"
  start: string; // "06:30"
  end: string; // "08:00"
  label: string; // "Ca Sáng (06:30)"
}

export interface ChecklistItemDto {
  id: string;
  code: string;
  label: string;
  isRequired: boolean;
}

export interface DutyPersonDto {
  id: string; // members.id
  name: string; // display_name
  fullName: string;
  role?: "lead" | "member";
}

export interface DutyReviewDto {
  id: string;
  decision: "approved" | "rework";
  score: number | null;
  feedback: string | null;
  reviewer: DutyPersonDto;
  reviewedAt: string; // ISO
}

export interface DutyCheckinDto {
  id: string;
  attempt: number;
  by: DutyPersonDto;
  at: string; // ISO
  isLate: boolean;
  lateMinutes: number | null;
  note: string | null;
  evidenceFileId: string;
  items: { itemId: string; label: string; isDone: boolean }[];
  review: DutyReviewDto | null;
}

export interface DutySwapBriefDto {
  id: string;
  status: SwapStatus;
  from: DutyPersonDto;
  to: DutyPersonDto;
}

export interface DutyAssignmentDto {
  id: string;
  rosterId: string;
  date: string; // YYYY-MM-DD
  area: Pick<CleaningAreaDto, "id" | "code" | "name" | "icon" | "minAssignees" | "isWholeHouse">;
  shift: DutyShiftDto;
  roomCode: string | null;
  roomName: string | null;
  status: DutyStatus;
  statusReason: string | null;
  attemptCount: number;
  reworkDueAt: string | null; // ISO
  startsAt: string; // ISO — giờ bắt đầu ca
  endsAt: string; // ISO
  /** Khung cho phép check-in lần đầu (settings duty.checkin.*) */
  checkinOpensAt: string;
  checkinClosesAt: string;
  members: DutyPersonDto[];
  checklist: ChecklistItemDto[];
  /** Các lần check-in người xem được thấy (RLS), lần mới nhất trước */
  checkins: DutyCheckinDto[];
  openSwaps: DutySwapBriefDto[];
  isMine: boolean;
  canCheckin: boolean;
  canReview: boolean;
  canSwap: boolean;
  canManage: boolean;
}

export interface DutyRosterDto {
  id: string | null;
  weekStart: string; // Thứ Hai YYYY-MM-DD
  weekEnd: string; // Chúa Nhật
  status: RosterStatus;
  publishedAt: string | null;
  notes: string | null;
  assignments: DutyAssignmentDto[];
}

export interface DutyWeekDto {
  today: string;
  now: string;
  roster: DutyRosterDto;
  areas: CleaningAreaDto[];
  shifts: DutyShiftDto[];
  /** Tuần gần nhất trước đó có roster (để "Sao chép từ tuần trước") */
  previousRosterWeek: string | null;
  settings: { swapMinNoticeHours: number; reworkWindowHours: number };
}

export interface DutySwapDto {
  id: string;
  assignmentId: string;
  date: string;
  area: { name: string; icon: string };
  shift: DutyShiftDto;
  from: DutyPersonDto;
  to: DutyPersonDto;
  reason: string;
  status: SwapStatus;
  createdAt: string;
  expiresAt: string;
  peerRespondedAt: string | null;
  adminDecidedAt: string | null;
  adminNote: string | null;
  canRespond: boolean;
  canCancel: boolean;
  canDecide: boolean;
}

/** Ca sắp tới của tôi (form xin đổi ca) */
export interface MyUpcomingDutyDto {
  assignmentId: string;
  date: string;
  area: { name: string; icon: string };
  shift: DutyShiftDto;
  startsAt: string;
  members: DutyPersonDto[];
  swappable: boolean;
  blockedReason: string | null;
}

export interface DutySwapsDto {
  upcoming: MyUpcomingDutyDto[];
  requests: DutySwapDto[];
  minNoticeHours: number;
}

/** Hợp đồng cho Tổng quan / Sidebar: GET /api/v1/duty/summary */
export interface DutySummaryItemDto {
  assignmentId: string;
  date: string;
  area: string;
  areaIcon: string;
  shift: string;
  members: string[];
  status: DutyStatus;
}
export interface DutySummaryDto {
  today: DutySummaryItemDto[];
  tomorrow: DutySummaryItemDto[];
  myNext: { assignmentId: string; date: string; area: string; shift: string } | null;
  openIssuesCount: number;
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
