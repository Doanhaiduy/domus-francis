-- =====================================================================
-- DỮ LIỆU 2026-10-07 — Bỏ cấu hình "Giá tham chiếu một suất cơm" (meal.price_per_serving_vnd). Chạy MỘT LẦN.
--   Ứng dụng không còn dùng giá này (Bếp & Cơm không hiển thị/tính định mức suất); xóa khóa để không còn hiện ở Cài đặt.
-- =====================================================================
BEGIN;

DELETE FROM public.settings WHERE key = 'meal.price_per_serving_vnd';

COMMIT;
