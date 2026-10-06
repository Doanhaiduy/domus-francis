-- =====================================================================
-- 1021 — THÔNG BÁO ĐẨY (Web Push). Chạy SAU 1020. Idempotent.
--   • Thêm kênh web_push vào default_channels của mọi loại thông báo đang dùng: app.fn_notify() sẽ xếp thêm một dòng
--     notification_outbox (kênh web_push) cho mỗi thông báo, tôn trọng notification_preferences (tắt kênh / giờ yên tĩnh).
--     Người chưa đăng ký thiết bị ⇒ dòng đó được đánh dấu 'skipped' khi bộ gửi chạy.
--   • Chỉ mục để bộ gửi lấy nhanh các dòng web_push đang chờ.
--   • Các bảng push_subscriptions / notification_preferences / notification_outbox đã có từ thiết kế gốc.
-- =====================================================================
BEGIN;

UPDATE public.notification_types
   SET default_channels = array_append(default_channels, 'web_push'::notification_channel_t)
 WHERE NOT ('web_push'::notification_channel_t = ANY (default_channels));

CREATE INDEX IF NOT EXISTS ix_notification_outbox__push_queue
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'queued' AND channel = 'web_push';

COMMIT;
