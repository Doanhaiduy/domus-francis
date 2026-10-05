-- =====================================================================
-- 991 — Thu chi: thêm LOẠI KHOẢN THU mới cho kế hoạch thu (fee_type_t). Idempotent.
--   periodic_dues : quỹ định kỳ — mỗi kỳ nhiều tháng (mặc định 6 tháng, 300.000 đ/người/kỳ ⇒ 600.000 đ/năm),
--                   cấu hình ở finance.dues_cycle_* (db/app/993_finance_dues_utilities.sql).
--   utility       : tiền điện nước hằng tháng — Thủ quỹ nhập TỔNG hóa đơn của cả nhà, hệ thống chia đều cho người đang ở.
-- Phải ở file RIÊNG: giá trị enum mới chỉ dùng được sau khi transaction thêm nó đã COMMIT (993 dùng các giá trị này).
-- =====================================================================
BEGIN;

ALTER TYPE public.fee_type_t ADD VALUE IF NOT EXISTS 'periodic_dues';
ALTER TYPE public.fee_type_t ADD VALUE IF NOT EXISTS 'utility';

COMMENT ON TYPE public.fee_type_t IS
  'Loại khoản thu: monthly_dues = quỹ sinh hoạt tháng (cũ, chỉ còn trong lịch sử), periodic_dues = quỹ định kỳ nhiều tháng, utility = tiền điện nước hằng tháng chia đều, event_fee = phí sự kiện, donation = quyên góp, deposit = đặt cọc, other = khác.';

COMMIT;
