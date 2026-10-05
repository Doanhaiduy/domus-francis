-- =====================================================================
-- 994 — ẨN/BẢO TRÌ PHÂN HỆ (màn hình Cài đặt → Phân hệ). Chạy SAU 01–52 + 70–75 + 90…98. Idempotent.
--   Admin (setting.write) tạm ẩn một phân hệ: thanh bên làm mờ mục đó + nhãn "Bảo trì", mở trang thì thấy lời nhắn.
--   Giá trị: { "<đường dẫn>": { "message": "...", "since": "<ISO>" } } — đọc qua GET /api/v1/ui/modules.
-- =====================================================================
BEGIN;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES ('ui.disabled_modules', '{}'::jsonb, 'json',
        'Phân hệ đang tạm ẩn (bảo trì) với thành viên và lời nhắn hiển thị. Sửa ở Cài đặt → Phân hệ.',
        NULL, NULL, true, 'setting.write', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
