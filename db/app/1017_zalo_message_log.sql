-- =====================================================================
-- 1017 — NHẬT KÝ TIN GỬI NHÓM ZALO. Chạy SAU 1016. Idempotent.
--   • zalo_message_log: mỗi lần bot gửi (hoặc cố gửi) một tin vào nhóm Zalo — lúc nào, loại tin, tự động hay do ai bấm,
--     nội dung, thành công hay lỗi (kèm lý do). Dùng cho lịch "đã gửi gì, ngày nào" trong Cài đặt → Tích hợp Zalo.
--   • Tin tự động bị bỏ qua (công tắc tắt, thiếu cấu hình) cũng được ghi (status = 'skipped') để biết vì sao không có tin.
--   • Chỉ người có setting.write (Admin / Trưởng nhà) đọc được; ghi bằng worker. Giữ 180 ngày (housekeeping).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.zalo_message_log (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  event       text,
  mode        text        NOT NULL,
  user_id     uuid,
  chat_id     text,
  body        text        NOT NULL,
  status      text        NOT NULL,
  error       text,
  CONSTRAINT ck_zalo_message_log__mode CHECK (mode IN ('auto', 'manual')),
  CONSTRAINT ck_zalo_message_log__status CHECK (status IN ('sent', 'failed', 'skipped')),
  CONSTRAINT ck_zalo_message_log__len CHECK (char_length(body) <= 8000 AND (error IS NULL OR char_length(error) <= 500))
);
COMMENT ON TABLE public.zalo_message_log IS
  'Nhật ký tin bot gửi vào nhóm Zalo (tự động hoặc thủ công). user_id không có khóa ngoại để giữ lịch sử khi tài khoản bị xóa. Giữ 180 ngày.';
CREATE INDEX IF NOT EXISTS ix_zalo_message_log__time ON public.zalo_message_log (sent_at DESC);

ALTER TABLE public.zalo_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_message_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zalo_message_log__select ON public.zalo_message_log;
CREATE POLICY zalo_message_log__select ON public.zalo_message_log FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('setting.write')));

ALTER TABLE public.zalo_message_log OWNER TO luuxa_owner;
REVOKE ALL ON public.zalo_message_log FROM luuxa_app;
GRANT SELECT ON public.zalo_message_log TO luuxa_app;
GRANT SELECT, INSERT, DELETE ON public.zalo_message_log TO luuxa_worker, luuxa_definer;

COMMIT;
