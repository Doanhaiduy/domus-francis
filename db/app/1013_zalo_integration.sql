-- =====================================================================
-- 1013 — TÍCH HỢP NHÓM ZALO (thay cho nhóm Telegram). Chạy SAU 1012. Idempotent.
--   Cấu hình hiển thị ở Cài đặt → "Tích hợp Zalo". Bot Token KHÔNG lưu trong CSDL: đặt biến môi trường ZALO_BOT_TOKEN trên máy chủ.
--   Khóa integration.telegram.* cũ giữ nguyên (không dùng nữa) để không mất dữ liệu.
-- =====================================================================
BEGIN;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES
  ('integration.zalo.group_enabled', 'false'::jsonb, 'boolean', 'Bật gửi tin tự động vào nhóm Zalo chung của lưu xá (qua Zalo Bot).',
   NULL, NULL, false, 'setting.write', 'false'::jsonb),
  ('integration.zalo.group_chat_id', to_jsonb(''::text), 'string', 'Mã cuộc trò chuyện (chat_id) của nhóm Zalo nhận tin. Bot Token để ở biến môi trường máy chủ (ZALO_BOT_TOKEN).',
   NULL, NULL, false, 'setting.write', to_jsonb(''::text)),
  ('integration.zalo.group_events', '{"duty_week": true, "dues_reminder": true, "facility_new": true}'::jsonb, 'json', 'Công tắc các loại tin tự động gửi vào nhóm Zalo.',
   NULL, NULL, false, 'setting.write', '{"duty_week": true, "dues_reminder": true, "facility_new": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
