-- =====================================================================
-- 1055 — "TIN CẬY THIẾT BỊ NÀY 30 NGÀY" Ở BƯỚC XÁC THỰC 2 BƯỚC. Chạy SAU 1054. Idempotent.
--   Người dùng tick ở bước nhập mã 2FA ⇒ máy chủ cấp một token ngẫu nhiên 256-bit lưu trong cookie httpOnly của thiết bị đó;
--   DB chỉ giữ SHA-256 của token. Trong 30 ngày, đăng nhập lại (mật khẩu đúng) trên đúng thiết bị đó KHÔNG hỏi mã 2FA nữa.
--   • Gắn với MỘT tài khoản, mỗi thiết bị một dòng; hết hạn cố định 30 ngày kể từ lúc tin cậy (không gia hạn tự động).
--   • Thu hồi: người dùng tự thu hồi từng thiết bị / tất cả (Cài đặt → Bảo mật); tự thu hồi khi đổi/đặt lại mật khẩu, tắt hoặc gỡ 2FA.
--   • Chỉ vai trò luuxa_auth (đường đăng nhập) và vai trò nền đọc/ghi; luuxa_app KHÔNG đọc được bảng này.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash     text        NOT NULL,
  device_label   text,
  user_agent     text,
  ip             inet,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoked_reason text,
  CONSTRAINT ux_trusted_devices__token  UNIQUE (token_hash),
  CONSTRAINT ck_trusted_devices__hash   CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_trusted_devices__ttl    CHECK (expires_at > created_at AND expires_at <= created_at + interval '31 days'),
  CONSTRAINT ck_trusted_devices__revoke CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
COMMENT ON TABLE public.trusted_devices IS
  'Thiết bị được người dùng tin cậy 30 ngày ở bước xác thực 2 bước: đăng nhập lại bằng mật khẩu trên thiết bị này không hỏi mã 2FA. token_hash = SHA-256 của token trong cookie httpOnly (DB không giữ token). Ghi/đọc chỉ qua luuxa_auth.';
COMMENT ON COLUMN public.trusted_devices.device_label IS 'Nhãn trình duyệt · hệ điều hành lúc tin cậy; đăng nhập chỉ được bỏ qua 2FA khi nhãn của thiết bị đang dùng trùng nhãn này (chống mang cookie sang máy khác).';
CREATE INDEX IF NOT EXISTS ix_trusted_devices__user_active ON public.trusted_devices (user_id, expires_at) WHERE revoked_at IS NULL;

-- Nhật ký kiểm toán: thêm / xóa thiết bị tin cậy và thu hồi; KHÔNG ghi mỗi lần dùng (UPDATE chỉ đổi last_used_at)
DROP TRIGGER IF EXISTS trg_trusted_devices__audit ON public.trusted_devices;
CREATE TRIGGER trg_trusted_devices__audit AFTER INSERT OR DELETE ON public.trusted_devices
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'token_hash');
DROP TRIGGER IF EXISTS trg_trusted_devices__audit_revoke ON public.trusted_devices;
CREATE TRIGGER trg_trusted_devices__audit_revoke AFTER UPDATE ON public.trusted_devices
  FOR EACH ROW WHEN (OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) EXECUTE FUNCTION app.tg_audit('id', 'token_hash');

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trusted_devices__system ON public.trusted_devices;
CREATE POLICY trusted_devices__system ON public.trusted_devices FOR ALL TO luuxa_auth, luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);
ALTER TABLE public.trusted_devices OWNER TO luuxa_owner;
REVOKE ALL ON public.trusted_devices FROM luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_devices TO luuxa_auth, luuxa_worker, luuxa_definer;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('security.device_trusted', 'security', 'Một thiết bị vừa được tin cậy 30 ngày (bỏ qua xác thực 2 bước)', ARRAY['in_app', 'email']::notification_channel_t[], 'high', false, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
