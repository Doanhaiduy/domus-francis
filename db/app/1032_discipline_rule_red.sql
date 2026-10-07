-- =====================================================================
-- 1032 — LỖI ĐỎ trong luật phạt: cờ is_red trên discipline_rules. Chạy SAU 1029. Idempotent.
--   • Lỗi đỏ = vi phạm nghiêm trọng (vd. bị mời ra khỏi Nhà Chung); giao diện làm nổi bật (nhãn LỖI ĐỎ, viền/nền đỏ) thay vì ghi chữ trong tên điều luật.
--   • Hình phạt cụ thể vẫn nằm ở default_penalty_* như mọi điều luật khác. Luật nhà (house_rule_sections.items) là JSON nên cờ tương ứng
--     nằm trong từng điều khoản ({"red": true}) — không cần đổi cấu trúc bảng.
-- =====================================================================
BEGIN;

ALTER TABLE public.discipline_rules ADD COLUMN IF NOT EXISTS is_red boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.discipline_rules.is_red IS 'Lỗi đỏ: vi phạm nghiêm trọng, giao diện làm nổi bật. Hình phạt cụ thể ở default_penalty_*.';

-- quyền theo cột (luuxa_app chỉ được ghi các cột liệt kê)
GRANT INSERT (is_red) ON public.discipline_rules TO luuxa_app;
GRANT UPDATE (is_red) ON public.discipline_rules TO luuxa_app;

COMMIT;
