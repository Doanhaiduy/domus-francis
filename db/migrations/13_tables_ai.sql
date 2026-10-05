-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (9/9, phần AI): CỔNG AI, TÁC VỤ, GỢI Ý CÓ NGƯỜI DUYỆT, NGÂN SÁCH
-- Nguyên tắc: hệ thống chạy bình thường khi KHÔNG có AI; AI chỉ ghi vào ai_suggestions (chờ người duyệt),
-- không bao giờ ghi trực tiếp vào bảng nghiệp vụ (BR-AI-01). Truy hồi cho trợ lý hỏi đáp dùng full-text + unaccent + pg_trgm (Phần 8.2);
-- bảng vector chỉ được thêm bằng migration riêng nếu đánh giá cho thấy full-text không đủ.
-- =====================================================================

CREATE TABLE ai_task_types (
  code                      text        PRIMARY KEY,
  name_vi                   text        NOT NULL,
  description               text        NOT NULL,
  technique                 text        NOT NULL,
  model_tier                text        NOT NULL,
  data_class                text        NOT NULL,
  required_consent_purpose  text        REFERENCES consent_purposes(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  human_review_required     boolean     NOT NULL DEFAULT true,
  external_call_allowed     boolean     NOT NULL DEFAULT true,
  is_enabled                boolean     NOT NULL DEFAULT false,
  monthly_budget_vnd        bigint,
  CONSTRAINT ck_ai_task_types__code CHECK (code ~ '^[a-z][a-z0-9_.]*$'),
  CONSTRAINT ck_ai_task_types__technique CHECK (technique IN ('rule_based', 'statistical', 'ocr', 'vision', 'llm', 'embedding', 'speech', 'solver')),
  CONSTRAINT ck_ai_task_types__tier CHECK (model_tier IN ('none', 'small', 'large', 'vision', 'embedding', 'ocr', 'speech')),
  CONSTRAINT ck_ai_task_types__class CHECK (data_class IN ('internal_ok', 'mask_required', 'never_external')),
  CONSTRAINT ck_ai_task_types__never_external CHECK (data_class <> 'never_external' OR external_call_allowed = false),
  CONSTRAINT ck_ai_task_types__budget CHECK (monthly_budget_vnd IS NULL OR monthly_budget_vnd >= 0)
);
COMMENT ON TABLE ai_task_types IS 'Danh mục tác vụ AI = công tắc tính năng + phân loại dữ liệu: internal_ok (được gửi dịch vụ ngoài), mask_required (phải ẩn danh hóa), never_external (CCCD, điểm cá nhân chưa đồng ý, dữ liệu tôn giáo, ý chỉ ẩn danh — không được gọi dịch vụ AI bên thứ ba, chỉ chạy nội bộ/self-host hoặc rule-based). is_enabled mặc định FALSE: bật từng tác vụ sau khi có đồng ý và đo lường (Phần 8.4).';

CREATE TABLE ai_budgets (
  month               date        PRIMARY KEY,
  limit_vnd           bigint      NOT NULL,
  used_vnd            bigint      NOT NULL DEFAULT 0,
  alert_threshold_pct smallint    NOT NULL DEFAULT 80,
  hard_stop           boolean     NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_budgets__month CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT ck_ai_budgets__limit CHECK (limit_vnd >= 0 AND used_vnd >= 0),
  CONSTRAINT ck_ai_budgets__alert CHECK (alert_threshold_pct BETWEEN 1 AND 100)
);
COMMENT ON TABLE ai_budgets IS 'Ngân sách AI theo tháng (VNĐ). hard_stop=true: vượt hạn mức ⇒ tác vụ mới bị chặn (blocked) bởi trigger; cảnh báo khi đạt alert_threshold_pct.';

CREATE TABLE ai_jobs (
  id                  uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  task_code           text            NOT NULL REFERENCES ai_task_types(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  status              ai_job_status_t NOT NULL DEFAULT 'queued',
  requested_by        uuid            REFERENCES users(id) ON DELETE SET NULL,
  subject_member_id   uuid            REFERENCES members(id) ON DELETE SET NULL,
  entity_table        text,
  entity_id           uuid,
  input_hash          text,
  input_ref           jsonb           NOT NULL DEFAULT '{}'::jsonb,
  provider            text,
  model               text,
  prompt_version      text,
  tokens_in           integer         NOT NULL DEFAULT 0,
  tokens_out          integer         NOT NULL DEFAULT 0,
  cost_vnd            bigint          NOT NULL DEFAULT 0,
  latency_ms          integer,
  blocked_reason      text,
  error_message       text,
  idempotency_key     text,
  created_at          timestamptz     NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  CONSTRAINT ck_ai_jobs__hash CHECK (app.is_hex(input_hash, 64)),
  CONSTRAINT ck_ai_jobs__input_ref CHECK (jsonb_typeof(input_ref) = 'object'),
  CONSTRAINT ck_ai_jobs__tokens CHECK (tokens_in >= 0 AND tokens_out >= 0 AND cost_vnd >= 0),
  CONSTRAINT ck_ai_jobs__blocked CHECK ((status = 'blocked') = (blocked_reason IS NOT NULL)),
  CONSTRAINT ck_ai_jobs__finished CHECK (status NOT IN ('succeeded', 'failed', 'cancelled', 'blocked') OR finished_at IS NOT NULL)
);
COMMENT ON TABLE ai_jobs IS 'Nhật ký tác vụ AI. KHÔNG lưu prompt/đầu ra thô chứa dữ liệu cá nhân: chỉ con trỏ (input_ref) và băm đầu vào (input_hash) để chống gọi lặp và truy vết; nội dung đầu ra có kiểm soát nằm ở ai_suggestions. Dọn sau 180 ngày. subject_member_id = chủ thể dữ liệu (để kiểm tra đồng ý và phục vụ quyền xóa).';

CREATE TABLE ai_suggestions (
  id              uuid                   PRIMARY KEY DEFAULT app.uuid_v7(),
  job_id          uuid                   NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  task_code       text                   NOT NULL REFERENCES ai_task_types(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  entity_table    text                   NOT NULL,
  entity_id       uuid                   NOT NULL,
  suggestion_type text                   NOT NULL,
  payload         jsonb                  NOT NULL,
  confidence      numeric(4,3),
  status          ai_suggestion_status_t NOT NULL DEFAULT 'pending',
  reviewed_by     uuid                   REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  review_note     text,
  expires_at      timestamptz            NOT NULL DEFAULT (now() + interval '14 days'),
  created_at      timestamptz            NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_suggestions__confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT ck_ai_suggestions__payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT ck_ai_suggestions__reviewed CHECK ((status IN ('accepted', 'rejected')) = (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
COMMENT ON TABLE ai_suggestions IS 'Gợi ý của AI chờ người duyệt (human-in-the-loop). Giao diện luôn gắn nhãn "AI gợi ý". Tỷ lệ accepted/(accepted+rejected) là chỉ số đo hiệu quả để quyết định tiếp tục hay rút tác vụ (Phần 8.4). Người duyệt phải có quyền ai.review trong phạm vi nghiệp vụ tương ứng.';

CREATE TABLE ai_usage_daily (
  usage_date   date    NOT NULL,
  task_code    text    NOT NULL REFERENCES ai_task_types(code) ON UPDATE CASCADE ON DELETE CASCADE,
  jobs         integer NOT NULL DEFAULT 0,
  failed_jobs  integer NOT NULL DEFAULT 0,
  tokens_in    bigint  NOT NULL DEFAULT 0,
  tokens_out   bigint  NOT NULL DEFAULT 0,
  cost_vnd     bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, task_code),
  CONSTRAINT ck_ai_usage_daily__nonneg CHECK (jobs >= 0 AND failed_jobs >= 0 AND tokens_in >= 0 AND tokens_out >= 0 AND cost_vnd >= 0)
);
COMMENT ON TABLE ai_usage_daily IS 'Tổng hợp chi phí/sử dụng AI theo ngày × tác vụ (trigger trên ai_jobs) — nguồn cho báo cáo chi phí và cảnh báo ngân sách.';
