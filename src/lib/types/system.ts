// DTO của Quản trị → Hệ thống (chỉ Admin — quyền system.monitor) và dải cảnh báo vận hành (OpsBanner).
// Nguồn: job_runs (lượt chạy cron / nhịp tim sao lưu), error_events (lỗi đã gộp) — db/app/1041; các bảng kênh gửi (notification_outbox,
// push_subscriptions, zalo_message_log, bank_statement_lines, ai_jobs, ai_budgets) và ai_provider_state (db/app/1043).
// Biến môi trường CHỈ trả CÓ/KHÔNG — không bao giờ trả giá trị.

export type OpsLevel = "ok" | "warn" | "error" | "unknown";

/** Loại lượt chạy được theo dõi */
export type WatchedJobKind = "cron:morning" | "cron:evening" | "backup" | "backup:storage";

export const JOB_KIND_LABEL: Record<string, string> = {
  "cron:morning": "Tác vụ buổi sáng",
  "cron:evening": "Tác vụ buổi tối",
  "cron:manual": "Chạy tay (Tích hợp Zalo)",
  "cron:storage": "Đo dung lượng (chạy riêng)",
  backup: "Sao lưu CSDL",
  "backup:storage": "Sao lưu tệp (Storage)",
};

export const ERROR_SOURCES = ["server", "client", "cron", "csp", "auth"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];
export const ERROR_SOURCE_LABEL: Record<ErrorSource, string> = {
  server: "Máy chủ (API)",
  client: "Giao diện",
  cron: "Tác vụ nền",
  csp: "Chặn nội dung (CSP)",
  auth: "Đăng nhập / bảo mật",
};

export const ERROR_STATUSES = ["new", "ack", "resolved"] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];
export const ERROR_STATUS_LABEL: Record<ErrorStatus, string> = { new: "Mới", ack: "Đã xem", resolved: "Đã sửa" };

/** Một bước của lượt chạy (job_runs.steps) */
export interface JobStepDto {
  name: string;
  ok: boolean;
  ms: number | null;
  error: string | null;
  info: string[];
}

export interface JobRunDto {
  id: string;
  kind: string;
  kindLabel: string;
  startedAt: string;
  finishedAt: string | null;
  /** null = chưa kết thúc (đang chạy, hoặc hàm bị dừng giữa chừng) */
  ok: boolean | null;
  /** Lượt chưa kết thúc quá 10 phút ⇒ coi như bị dừng giữa chừng (vd. hàm Vercel quá 60 giây) */
  hung: boolean;
  durationMs: number | null;
  stepCount: number;
  failedSteps: number;
  summary: string | null;
  requestId: string | null;
  steps: JobStepDto[];
}

/** Tình trạng của một loại tác vụ được theo dõi (cron sáng/tối, sao lưu CSDL, sao lưu tệp) */
export interface JobCheckDto {
  kind: WatchedJobKind;
  label: string;
  level: OpsLevel;
  /** Câu tóm tắt tình trạng (tiếng Việt) */
  status: string;
  /** Lượt gần nhất (kể cả lỗi), không kèm danh sách bước */
  last: Omit<JobRunDto, "steps"> | null;
  /** Lần gần nhất chạy xong KHÔNG lỗi */
  lastOkAt: string | null;
  /** Số giờ kể từ lần chạy đạt gần nhất */
  ageHours: number | null;
  /** Ngưỡng quá hạn (giờ) */
  staleHours: number;
  /** Có xét quá hạn không (cron: chỉ khi chạy trên Vercel; sao lưu: khi đã từng có nhịp tim) */
  watched: boolean;
  /** Đã từng có lượt chạy nào */
  everSeen: boolean;
}

export interface OpsIssue {
  key: string;
  level: "warn" | "error";
  title: string;
  detail?: string;
}

/** Bản tóm tắt nhẹ cho dải cảnh báo (GET /api/v1/system/status?summary=1) */
export interface OpsSummaryDto {
  level: "ok" | "warn" | "error";
  issues: OpsIssue[];
  /** Số lỗi MỚI (chưa xem) xảy ra trong 24 giờ qua */
  newErrors24h: number;
  onVercel: boolean;
  generatedAt: string;
}

export interface ErrorEventDto {
  id: string;
  source: ErrorSource;
  route: string | null;
  code: string | null;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: ErrorStatus;
  /** Mã request của lần gặp gần nhất (đầy đủ) */
  sampleRequestId: string | null;
  /** "Mã lỗi" người dùng thấy trong thông báo lỗi = 8 ký tự đầu mã request */
  shortCode: string | null;
  /** Người gặp lỗi gần nhất (nếu đã đăng nhập) */
  sampleUser: string | null;
  notifiedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface ErrorCountsDto {
  new: number;
  ack: number;
  resolved: number;
  all: number;
}

export interface ErrorListDto {
  items: ErrorEventDto[];
  /** Đếm theo trạng thái (theo bộ lọc nguồn + tìm kiếm, không theo bộ lọc trạng thái) */
  counts: ErrorCountsDto;
  /** Còn dòng chưa hiện (vượt giới hạn) */
  more: boolean;
}

export interface OutboxStatDto {
  channel: string;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface AiProviderStateDto {
  provider: string;
  label: string;
  configured: boolean;
  failures: number;
  /** Đang tạm dừng (ngắt mạch) đến lúc này */
  pausedUntil: string | null;
  lastError: string | null;
  lastFailureAt: string | null;
}

export interface ChannelsDto {
  push: {
    configured: boolean;
    /** Thiết bị đăng ký nhận thông báo đẩy còn hiệu lực */
    devices: number;
    users: number;
  };
  email: { configured: boolean };
  /** notification_outbox 7 ngày qua theo kênh × trạng thái */
  outbox: OutboxStatDto[];
  /** Dòng đang chờ gửi đã quá hạn gửi > 15 phút (hàng đợi kẹt), theo kênh */
  stuck: { channel: string; count: number; oldestAt: string }[];
  zalo: {
    configured: boolean;
    sent7d: number;
    failed7d: number;
    skipped7d: number;
    lastFailedAt: string | null;
    lastError: string | null;
  };
  bank: {
    configured: boolean;
    unmatched: number;
    /** Chưa khớp quá 7 ngày kể từ lúc nhận */
    unmatchedOver7d: number;
    oldestUnmatchedAt: string | null;
    /** Lần cuối nhận giao dịch qua webhook (SePay/Casso) */
    lastWebhookAt: string | null;
  };
  ai: {
    configured: boolean;
    masterEnabled: boolean;
    jobs7d: number;
    failed7d: number;
    blocked7d: number;
    lastError: string | null;
    lastFailedAt: string | null;
    budget: { month: string; limitVnd: number; usedVnd: number; alertThresholdPct: number; hardStop: boolean } | null;
    providers: AiProviderStateDto[];
  };
}

export interface EnvFlagDto {
  key: string;
  label: string;
  /** Đã đặt (CHỈ cờ — không bao giờ trả giá trị) */
  set: boolean;
  /** Bắt buộc cho môi trường thật */
  required: boolean;
  /** Thiếu thì sao / dùng để làm gì */
  hint: string;
  /** Ghi chú thêm (vd. đang ép dùng ổ đĩa local) */
  note?: string | null;
}

export interface InfraDto {
  onVercel: boolean;
  env: string;
  /** Mã commit rút gọn (VERCEL_GIT_COMMIT_SHA) */
  version: string | null;
  branch: string | null;
  region: string | null;
  node: string;
  postgres: string | null;
  /** Thời gian một vòng truy vấn kiểm quyền (ms) */
  dbLatencyMs: number;
  audit: {
    /** Số dòng ước tính ở phân vùng mặc định audit_logs_default (> 0 ⇒ phân vùng tháng chưa được tạo kịp) */
    defaultRows: number;
    /** Phân vùng tháng xa nhất đã có (YYYY-MM) */
    latestPartition: string | null;
    /** Số tháng đã tạo trước so với tháng hiện tại (giờ VN) */
    monthsAhead: number | null;
  };
  envFlags: EnvFlagDto[];
}

export interface SystemStatusDto {
  /** Giống dải cảnh báo (đỏ: tác vụ nền / sao lưu; vàng: lỗi mới 24 giờ) */
  summary: OpsSummaryDto;
  /** Cảnh báo phụ chỉ hiện ở trang này: hàng đợi kẹt, phân vùng audit, ngân hàng chưa khớp, Zalo lỗi, AI tạm dừng / gần hết ngân sách, thiếu biến môi trường */
  notices: OpsIssue[];
  jobs: JobCheckDto[];
  errors: ErrorCountsDto & { new24h: number };
  channels: ChannelsDto;
  infra: InfraDto;
  generatedAt: string;
}
