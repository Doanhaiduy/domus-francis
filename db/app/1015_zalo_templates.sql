-- =====================================================================
-- 1015 — MẪU TIN NHẮN ZALO (sửa được ở Cài đặt → Tích hợp Zalo). Idempotent.
--   integration.zalo.templates = { "<loại tin>": "<mẫu có {biến}>" } — thiếu loại nào thì dùng mẫu mặc định trong ứng dụng.
--   Thêm loại tin birthday (chúc mừng sinh nhật) vào công tắc loại tin: mặc định bật (thiếu khóa = dùng mặc định trong ứng dụng).
-- =====================================================================
BEGIN;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES ('integration.zalo.templates', '{}'::jsonb, 'json', 'Mẫu tin nhắn tùy chỉnh gửi vào nhóm Zalo (theo loại tin). Để trống = dùng mẫu mặc định.',
        NULL, NULL, false, 'setting.write', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
