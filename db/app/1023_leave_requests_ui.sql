-- =====================================================================
-- 1023 — Đơn xin phép (vắng sự kiện / về muộn / ngủ ngoài / tạm vắng dài): giao diện + thông báo
--   Bảng leave_requests, RLS, trigger duyệt đã có từ thiết kế gốc (08, 34, 47). Bản này chỉ bổ sung:
--   • loại thông báo "event.leave_submitted" (báo người duyệt khi có đơn mới; kết quả dùng loại event.leave_decided có sẵn)
--   • chỉ mục cho danh sách chờ duyệt
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory)
VALUES ('event.leave_submitted', 'event', 'Có đơn xin phép mới chờ duyệt',
        ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS ix_leave_requests__pending ON public.leave_requests (created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_leave_requests__member_created ON public.leave_requests (member_id, created_at DESC);

COMMIT;
