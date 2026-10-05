// Kiểu dữ liệu dùng chung (server + client) cho phân hệ AI hỗ trợ.
// Nguyên tắc (Phần 8): AI chỉ GỢI Ý, người dùng xác nhận; hệ thống chạy bình thường khi AI tắt.

export const AI_TASK_CODES = [
  "finance.dues_message",
  "community.policy_rag",
  "community.moderation",
  "facility.issue_triage",
  "community.minutes",
] as const;
export type AiTaskCode = (typeof AI_TASK_CODES)[number];

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
  /** Người dùng hiện tại đã đồng ý mục đích ai_processing chưa. */
  consented: boolean;
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

export interface AiInputMap {
  "finance.dues_message": DuesMessageInput;
  "community.policy_rag": PolicyRagInput;
  "community.moderation": ModerationInput;
  "facility.issue_triage": IssueTriageInput;
  "community.minutes": MinutesInput;
}
export interface AiOutputMap {
  "finance.dues_message": DuesMessageOutput;
  "community.policy_rag": PolicyRagOutput;
  "community.moderation": ModerationOutput;
  "facility.issue_triage": IssueTriageOutput;
  "community.minutes": MinutesOutput;
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
