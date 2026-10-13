// Kiểu dữ liệu dùng chung (server + client) cho phân hệ AI hỗ trợ.
// Nguyên tắc (Phần 8): AI chỉ GỢI Ý, người dùng xác nhận; hệ thống chạy bình thường khi AI tắt.
import type { DraftFlag } from "../article-verify";

export const AI_TASK_CODES = [
  "finance.dues_message",
  "community.policy_rag",
  "community.moderation",
  "facility.issue_triage",
  "community.minutes",
  "finance.monthly_insight",
  "academic.insight",
  "academic.house_insight",
  "content.article_assist",
  "content.article_research",
  "content.article_image",
  "content.image_caption",
] as const;
export type AiTaskCode = (typeof AI_TASK_CODES)[number];

/**
 * Tác vụ không dùng nhà cung cấp văn bản (Groq/Cloudflare/Gemini): "cloudflare" = cần khóa Cloudflare Workers AI,
 * "none" = tự chạy được kể cả khi chưa có khóa nào (nguồn tin công khai). Mặc định (không có trong bảng) = cần ít nhất một nhà cung cấp văn bản.
 */
export const AI_TASK_NEEDS: Partial<Record<AiTaskCode, "cloudflare" | "none">> = {
  "content.article_research": "none",
  "content.article_image": "cloudflare",
  "content.image_caption": "cloudflare",
};

/** Mục đích đồng ý mà người dùng tự bật/tắt được cho AI (consent_purposes). */
export const AI_CONSENT_PURPOSES = ["ai_processing", "ai_academic_summary"] as const;
export type AiConsentPurpose = (typeof AI_CONSENT_PURPOSES)[number];

export type AiProviderId = "groq" | "gemini" | "cloudflare";

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
  /** Đã có khóa của nhà cung cấp mà tác vụ này cần (văn bản: ít nhất một nhà; ảnh/chú thích: Cloudflare; tra cứu: không cần). */
  configured: boolean;
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
  /** Vài lượt gần nhất để hiểu câu hỏi nối tiếp (tối đa 4) */
  history?: { q: string; a?: string }[];
}
export interface PolicyRagOutput {
  answer: string;
  confident: boolean;
  sources: { label: string; title: string; kind: "policy" | "announcement" | "event" | "guide" }[];
  /** Trang gợi ý mở (đã lọc theo danh sách cho phép ở máy chủ) */
  actions?: { label: string; href: string }[];
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

// Trợ lý viết bài công khai (người quản lý/Truyền thông): gợi ý đề tài, phỏng vấn, viết nháp, chỉnh văn, gợi ý tiêu đề + tóm tắt.
// Chỉ gửi nội dung người soạn đang viết + thông tin giới thiệu cộng đoàn đã công khai; không có dữ liệu cá nhân của thành viên.
export type ArticleTone = "plain" | "warm" | "formal" | "lively";
export type ArticleLength = "short" | "medium" | "long";
export type ArticleImproveMode = "polish" | "shorter" | "longer" | "warmer" | "formal" | "catchy";
/** Kết bài: không kêu gọi (mặc định) · mời nhẹ nhàng · kèm thông tin liên hệ (hotline, địa chỉ). */
export type ArticleEnding = "none" | "soft" | "contact";

/** Câu hỏi AI đặt cho người soạn (chế độ phỏng vấn) + câu trả lời thật của họ. */
export interface ArticleQa {
  q: string;
  a: string;
}
/** Tư liệu tra cứu người soạn đã chọn đưa vào bài (kèm nguồn để họ kiểm chứng). */
export interface ArticleResearchUse {
  notes: string[];
  sources: { title: string; url: string }[];
}

export type ArticleAssistInput =
  | { action: "ideas"; category: string; note?: string }
  | { action: "questions"; topic: string; category: string }
  /** AI đọc cả bài và chọn vài đoạn nên có ảnh minh họa (trả số thứ tự đoạn theo src/lib/article-paragraphs.ts). */
  | { action: "illustrations"; title: string; content: string; category: string; max?: number }
  | {
      action: "draft";
      topic: string;
      keyPoints?: string;
      answers?: ArticleQa[];
      research?: ArticleResearchUse;
      category: string;
      tone?: ArticleTone;
      length?: ArticleLength;
      ending?: ArticleEnding;
    }
  | { action: "improve"; text: string; mode: ArticleImproveMode }
  | { action: "meta"; content: string; title?: string };

export type ArticleAssistOutput =
  | { action: "ideas"; ideas: { title: string; angle: string; /** Cơ sở của gợi ý (lễ, sự kiện có thật) */ basis?: string }[] }
  | { action: "questions"; questions: string[] }
  | { action: "illustrations"; spots: { index: number; reason: string }[] }
  | {
      action: "draft";
      title: string;
      summary: string;
      content: string;
      /** Chỗ cần người soạn kiểm lại (ngày/giờ/số không có trong dữ kiện, cụm sáo rỗng, lời kêu gọi). */
      flags: DraftFlag[];
      /** Người soạn chưa đưa dữ kiện thật ⇒ AI chỉ viết khung ngắn có chỗ [cần bổ sung]. */
      thin: boolean;
    }
  | { action: "improve"; text: string; flags: DraftFlag[] }
  | { action: "meta"; titles: string[]; summary: string };

// Tra cứu tư liệu cho bài viết: Gemini + tìm kiếm Google (khi còn hạn mức) + Vatican News + Wikipedia tiếng Việt.
export interface ArticleResearchInput {
  topic: string;
  category: string;
}
export interface ArticleResearchSource {
  title: string;
  url: string;
  kind: "web" | "vatican" | "wikipedia";
  /** Nguồn Vatican News/Wikipedia gắn với MỘT ghi chú (chỉ số trong `notes`); nguồn web của Google thì không biết ghi chú nào. */
  noteIndex?: number;
}
export interface ArticleResearchOutput {
  /** Các dữ kiện đã tra (mỗi dòng một ý, đã làm sạch); người soạn chọn ý nào đưa vào bài. */
  notes: string[];
  sources: ArticleResearchSource[];
  /** Tìm kiếm web: ok = có dùng; unavailable = lỗi/hết hạn mức (chỉ còn nguồn Vatican News, Wikipedia); skipped = chưa cấu hình. */
  webSearch: "ok" | "unavailable" | "skipped";
  queries: string[];
}

// Tạo ảnh bìa / ảnh minh họa bằng AI (Cloudflare Workers AI, miễn phí trong hạn mức ngày).
export type ArticleImageStyle = "flat" | "watercolor" | "line" | "scenic";
export interface ArticleImageInput {
  purpose: "cover" | "inline";
  title: string;
  summary?: string;
  /** Đoạn văn cần minh họa (ảnh trong bài). */
  excerpt?: string;
  category: string;
  style: ArticleImageStyle;
  /** Gợi ý thêm của người soạn (VD: "ánh nến, cửa sổ kính màu"). */
  hint?: string;
  /** Số phương án (1–2). */
  count?: 1 | 2;
}
export interface ArticleImageOutput {
  /** Ảnh đã lưu (bucket attachments, thuộc về người soạn). alt đã có tiền tố "(AI) " để trang công khai gắn nhãn. */
  images: { fileId: string; alt: string }[];
  /** Mô tả ảnh (tiếng Anh) đã gửi cho mô hình — để người soạn biết AI hiểu gì. */
  prompt: string;
  model: string;
  /** Dùng mô hình dự phòng (ảnh vuông, đã cắt). */
  fallback: boolean;
}

// Gợi ý chú thích cho một ảnh đã tải lên (người soạn bấm thì mới gửi ảnh cho AI).
export interface ImageCaptionInput {
  fileId: string;
  /** Tiêu đề bài + đoạn văn gần ảnh: để chú thích gắn ảnh với nội dung bài thay vì chỉ tả ảnh. */
  title?: string;
  context?: string;
}
export interface ImageCaptionOutput {
  caption: string;
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
  "content.article_assist": ArticleAssistInput;
  "content.article_research": ArticleResearchInput;
  "content.article_image": ArticleImageInput;
  "content.image_caption": ImageCaptionInput;
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
  "content.article_assist": ArticleAssistOutput;
  "content.article_research": ArticleResearchOutput;
  "content.article_image": ArticleImageOutput;
  "content.image_caption": ImageCaptionOutput;
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
