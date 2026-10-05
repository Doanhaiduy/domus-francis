// Kiểu dữ liệu dùng chung (server + client) cho phân hệ AI hỗ trợ.
// Nguyên tắc (Phần 8): AI chỉ GỢI Ý, người dùng xác nhận; hệ thống chạy bình thường khi AI tắt.

export const AI_TASK_CODES = [
  "finance.dues_message",
  "community.policy_rag",
  "community.moderation",
  "facility.issue_triage",
  "community.minutes",
  "finance.monthly_insight",
  "academic.insight",
  "academic.house_insight",
] as const;
export type AiTaskCode = (typeof AI_TASK_CODES)[number];

/** Mục đích đồng ý mà người dùng tự bật/tắt được cho AI (consent_purposes). */
export const AI_CONSENT_PURPOSES = ["ai_processing", "ai_academic_summary"] as const;
export type AiConsentPurpose = (typeof AI_CONSENT_PURPOSES)[number];

export type AiProviderId = "groq" | "gemini";

export interface AiProviderDto {
  id: AiProviderId;
  label: string;
  model: string;
  /** Đã có khóa API trong .env.local (không bao giờ trả về chính khóa). */
  configured: boolean;
  /** Đang bị ngắt mạch tạm thời sau nhiều lần lỗi liên tiếp. */
  paused: boolean;
}

export interface AiTaskDto {
  code: string;
  name: string;
  description: string;
  technique: string;
  dataClass: "internal_ok" | "mask_required" | "never_external";
  enabled: boolean;
  humanReview: boolean;
  requiredConsent: string | null;
  monthlyBudgetVnd: number | null;
  /** Ứng dụng đã có bộ xử lý cho tác vụ này (các tác vụ luật/OCR… thuộc thiết kế nhưng chưa nằm trong cổng LLM). */
  implemented: boolean;
}

export interface AiStatusDto {
  /** settings feature.ai.enabled */
  masterEnabled: boolean;
  /** Có ít nhất một nhà cung cấp có khóa API. */
  configured: boolean;
  providers: AiProviderDto[];
  /** Người dùng hiện tại đã đồng ý mục đích ai_processing chưa (giữ để tương thích — xem thêm `consents`). */
  consented: boolean;
  /** Trạng thái đồng ý theo từng mục đích AI của người dùng hiện tại. */
  consents: Record<AiConsentPurpose, boolean>;
  canUse: boolean;
  canReview: boolean;
  canManage: boolean;
  /** Mã tác vụ đang dùng được ngay (bật + công tắc tổng + có khóa). */
  available: string[];
  tasks: AiTaskDto[];
}

// --- Đầu vào / đầu ra từng tác vụ --------------------------------------------------

export interface DuesMessageInput {
  amountVnd: number;
  dueDate?: string;
  periodLabel?: string;
  tone?: "friendly" | "formal";
}
export interface DuesMessageOutput {
  message: string;
}

export interface PolicyRagInput {
  question: string;
}
export interface PolicyRagOutput {
  answer: string;
  confident: boolean;
  sources: { label: string; title: string; kind: "policy" | "announcement" | "event" }[];
}

export interface ModerationInput {
  text: string;
  kind?: "forum_post" | "forum_comment" | "announcement";
}
export interface ModerationOutput {
  flagged: boolean;
  categories: ("insult" | "personal_info" | "spam" | "sensitive" | "other")[];
  reason: string;
}

export interface IssueTriageInput {
  title: string;
  description?: string;
  location?: string;
}
export interface IssueTriageOutput {
  urgency: "low" | "medium" | "high" | "critical";
  category: string;
  summary: string;
  rationale: string;
  duplicateOf: { id: string; title: string } | null;
}

export interface MinutesInput {
  notes: string;
  kind?: "meeting" | "weekly_digest";
}
export interface MinutesOutput {
  summary: string;
  decisions: string[];
  actions: { task: string; owner: string }[];
}

// Nhận xét thu chi theo tháng: mọi con số do MÁY CHỦ tính từ sổ quỹ; mô hình chỉ viết lời nhận xét.
export interface FinanceInsightInput {
  /** 'YYYY-MM' — mặc định tháng hiện tại. */
  month?: string;
}
export interface FinanceInsightComparison {
  label: string;
  /** Số nguyên VND của tháng đang xem / tháng trước (máy chủ tính). */
  current: number;
  previous: number;
  /** % thay đổi so với tháng trước; null khi tháng trước bằng 0. */
  changePct: number | null;
  /** Chiều được coi là tốt (thu, số dư: tăng là tốt; chi: giảm là tốt). */
  better: "up" | "down";
  comment: string;
}
export interface FinanceInsightOutput {
  month: string;
  previousMonth: string;
  /** Tháng đang xem chưa kết thúc (số liệu tính đến hôm nay). */
  partial: boolean;
  headline: string;
  summary: string;
  comparisons: FinanceInsightComparison[];
  highlights: string[];
  warnings: string[];
  suggestions: string[];
}

// Nhận xét học tập: của chính mình (academic.insight, cần đồng ý ai_academic_summary) hoặc toàn nhà (academic.house_insight).
export interface AcademicInsightInput {
  scope?: "self";
}
export type AcademicHouseInsightInput = Record<string, never>;
export interface AcademicInsightRow {
  label: string;
  current: number | null;
  previous: number | null;
  better: "up" | "down";
  /** Số lẻ khi hiển thị (GPA: 2, số đếm: 0). */
  decimals: number;
}
export interface AcademicInsightOutput {
  headline: string;
  summary: string;
  /** Xu hướng do máy chủ tính từ GPA hệ 4 (không lấy từ mô hình). */
  trend: "up" | "down" | "stable" | "unknown";
  points: string[];
  suggestions: string[];
  /** Bảng so sánh do máy chủ tính (null khi không đủ dữ liệu). */
  compare: { currentLabel: string; previousLabel: string | null; rows: AcademicInsightRow[] } | null;
}

export interface AiInputMap {
  "finance.dues_message": DuesMessageInput;
  "community.policy_rag": PolicyRagInput;
  "community.moderation": ModerationInput;
  "facility.issue_triage": IssueTriageInput;
  "community.minutes": MinutesInput;
  "finance.monthly_insight": FinanceInsightInput;
  "academic.insight": AcademicInsightInput;
  "academic.house_insight": AcademicHouseInsightInput;
}
export interface AiOutputMap {
  "finance.dues_message": DuesMessageOutput;
  "community.policy_rag": PolicyRagOutput;
  "community.moderation": ModerationOutput;
  "facility.issue_triage": IssueTriageOutput;
  "community.minutes": MinutesOutput;
  "finance.monthly_insight": FinanceInsightOutput;
  "academic.insight": AcademicInsightOutput;
  "academic.house_insight": AcademicInsightOutput;
}

export interface AiResultDto<C extends AiTaskCode = AiTaskCode> {
  suggestionId: string | null;
  jobId: string | null;
  taskCode: C;
  output: AiOutputMap[C];
  /** null khi trả lời bằng luật nội bộ, không gọi dịch vụ ngoài. */
  provider: AiProviderId | null;
  model: string | null;
  /** Tái sử dụng kết quả trong 24 giờ (không tốn thêm chi phí). */
  cached: boolean;
  createdAt: string;
}

// --- Quản trị -----------------------------------------------------------------------

export interface AiUsageDto {
  month: string;
  budget: { limitVnd: number; usedVnd: number; alertThresholdPct: number; hardStop: boolean } | null;
  byTask: { taskCode: string; jobs: number; failedJobs: number; tokensIn: number; tokensOut: number; costVnd: number }[];
  acceptance: { taskCode: string; accepted: number; rejected: number; pending: number }[];
  recentJobs: {
    id: string;
    taskCode: string;
    status: string;
    provider: string | null;
    model: string | null;
    costVnd: number;
    latencyMs: number | null;
    blockedReason: string | null;
    errorMessage: string | null;
    createdAt: string;
  }[];
}

export interface AiSuggestionDto {
  id: string;
  taskCode: string;
  taskName: string;
  suggestionType: string;
  payload: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
}
