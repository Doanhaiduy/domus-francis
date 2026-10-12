-- =====================================================================
-- 1043 — GIÁM SÁT & VẬN HÀNH: Cài đặt → Hệ thống, dải cảnh báo cho Admin, bước cron "ops-digest", nhịp tim sao lưu. Chạy SAU 1042. Idempotent.
--   • Loại thông báo finance.bank_unmatched: bước cron buổi sáng nhắc Thủ quỹ + Trưởng nhà (mỗi tuần MỘT lần) khi còn giao dịch ngân hàng
--     (bank_statement_lines) chưa khớp quá 7 ngày — liên kết mở trang Thu chi.
--   • ai_provider_state: trạng thái "ngắt mạch" của nhà cung cấp AI (Groq / Gemini) — số lỗi liên tiếp, tạm dừng đến khi nào, lỗi gần nhất.
--     Trước đây chỉ nằm trong bộ nhớ của từng instance serverless (instance mới lại gọi vào nhà cung cấp đang hỏng, người dùng chờ lâu);
--     nay lưu CSDL để mọi instance cùng biết, và Admin xem được ở Cài đặt → Hệ thống. Bảng hệ thống (không phải dữ liệu nghiệp vụ, không chứa
--     dữ liệu cá nhân) ⇒ KHÔNG gắn trigger audit; chỉ worker/definer đọc ghi, luuxa_app không có quyền nào.
--   • Chỉ mục một phần cho các lỗi MỚI chưa báo (error_events: status = 'new' AND notified_at IS NULL) — bước tóm tắt lỗi buổi sáng.
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('finance.bank_unmatched', 'finance', 'Nhắc giao dịch ngân hàng chưa khớp quá 7 ngày', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- ai_provider_state: ngắt mạch nhà cung cấp AI dùng chung cho mọi instance
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_provider_state (
  provider        text        PRIMARY KEY,
  failures        integer     NOT NULL DEFAULT 0,
  open_until      timestamptz,
  last_error      text,
  last_failure_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_provider_state__provider CHECK (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  CONSTRAINT ck_ai_provider_state__failures CHECK (failures BETWEEN 0 AND 1000),
  CONSTRAINT ck_ai_provider_state__error    CHECK (last_error IS NULL OR char_length(last_error) <= 300)
);
COMMENT ON TABLE public.ai_provider_state IS 'Ngắt mạch nhà cung cấp AI (groq, gemini) dùng chung cho mọi instance: số lỗi liên tiếp, tạm dừng đến open_until (sau N lỗi liên tiếp), lỗi gần nhất (chỉ mã trạng thái, không nội dung). Worker đọc/ghi; Admin xem ở Cài đặt → Hệ thống.';

ALTER TABLE public.ai_provider_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_state FORCE ROW LEVEL SECURITY;
-- Nơi vai trò nền không có BYPASSRLS (Supabase) vẫn đọc/ghi được; luuxa_app KHÔNG có chính sách nào
DROP POLICY IF EXISTS ai_provider_state__system ON public.ai_provider_state;
CREATE POLICY ai_provider_state__system ON public.ai_provider_state FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);

ALTER TABLE public.ai_provider_state OWNER TO luuxa_owner;
REVOKE ALL ON public.ai_provider_state FROM luuxa_app, luuxa_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_state TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- Lỗi mới chưa báo Admin (bước cron ops-digest đọc mỗi sáng)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_error_events__unnotified ON public.error_events (count DESC, last_seen DESC) WHERE status = 'new' AND notified_at IS NULL;

COMMIT;
