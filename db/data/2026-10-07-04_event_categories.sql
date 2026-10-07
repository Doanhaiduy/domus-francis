-- =====================================================================
-- DỮ LIỆU 2026-10-07 — Thêm danh mục sự kiện "Hành hương" và "Lần chuỗi & Kinh nguyện chung" để báo cáo tổng kết đếm được
--   số buổi lần chuỗi, số cuộc hành hương (trước đây "Hành hương" nằm chung với "Dã ngoại"). Idempotent (ON CONFLICT DO NOTHING).
--   Sự kiện cũ giữ nguyên danh mục; Trưởng nhà chọn danh mục mới khi tạo sự kiện.
-- =====================================================================
BEGIN;

INSERT INTO public.categories (kind, code, name, description, color, icon_name, sort_order, is_system)
VALUES
  ('event', 'EVT_PILGRIM', 'Hành hương',                       'Các chuyến hành hương thánh địa, đền thánh, linh địa', '#14b8a6', 'MapPin', 45, false),
  ('event', 'EVT_ROSARY',  'Lần chuỗi & Kinh nguyện chung',    'Các buổi lần chuỗi Mân Côi, kinh nguyện chung của nhà',  '#a855f7', 'Heart',  15, false)
ON CONFLICT DO NOTHING;

COMMIT;
