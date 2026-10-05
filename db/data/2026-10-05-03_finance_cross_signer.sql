-- =====================================================================
-- Dữ liệu nghiệp vụ: nhà KHÔNG có Phó nhà (chỉ Trưởng nhà + Thủ quỹ duyệt chi) ⇒ bật chế độ "người còn lại ký thay"
-- (xem db/app/998_finance_cross_signer.sql). Idempotent. Muốn quay lại đúng thiết kế gốc: đặt lại false trong Cài đặt.
-- =====================================================================
BEGIN;
UPDATE public.settings SET value = 'true'::jsonb, updated_at = now()
 WHERE key = 'finance.expense.cross_signer_mode' AND value = 'false'::jsonb;  -- migrate.mjs chỉ chạy file này một lần
COMMIT;
