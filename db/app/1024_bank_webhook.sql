-- =====================================================================
-- 1024 — Nhận giao dịch ngân hàng tự động (webhook SePay / Casso) → bank_statement_lines
--   • bank_statement_lines.source: nguồn dòng sao kê ('import' = nhập tay/CSV, 'sepay', 'casso')
--   • loại thông báo "finance.bank_incoming" (báo Thủ quỹ/Trưởng nhà/Admin khi có tiền vào)
--   • chỉ mục cho danh sách dòng chưa xử lý
--   Webhook ghi bằng vai trò luuxa_worker (không có người dùng); người xác nhận ghi thu là Thủ quỹ (finance.contribution.record).
-- =====================================================================
BEGIN;

ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'import';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_statement_lines__source') THEN
    ALTER TABLE public.bank_statement_lines ADD CONSTRAINT ck_bank_statement_lines__source CHECK (source IN ('import', 'sepay', 'casso'));
  END IF;
END
$$;
COMMENT ON COLUMN public.bank_statement_lines.source IS 'Nguồn dòng sao kê: import (nhập tay/CSV) hoặc webhook của dịch vụ báo biến động số dư (sepay, casso).';

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory)
VALUES ('finance.bank_incoming', 'finance', 'Có tiền chuyển khoản vào tài khoản lưu xá',
        ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS ix_bank_statement_lines__imported_at ON public.bank_statement_lines (imported_at DESC);

COMMIT;
