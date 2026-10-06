-- =====================================================================
-- 1020 — BẢO MẬT: xác thực 2 bước (TOTP), đặt lại mật khẩu qua email. Chạy SAU 1019. Idempotent.
--   • app.fn_mfa_required(): người đang đăng nhập có vai trò thuộc settings auth.mfa_required_roles không (giao diện dùng để
--     nhắc/bắt bật 2FA). Hàm đặc quyền vì settings chỉ đọc được theo quyền của từng khóa.
--   • Bảng user_mfa_factors / mfa_recovery_codes / password_resets đã có từ thiết kế gốc (luuxa_auth ghi, luuxa_app không đọc được).
--   • password_resets: thêm chỉ mục theo user + thời gian để đếm yêu cầu đặt lại (chống spam) nhanh.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.current_user_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM app.current_role_grants() g
        WHERE g.role_code IN (
          SELECT jsonb_array_elements_text(s.value)
            FROM public.settings s
           WHERE s.key = 'auth.mfa_required_roles' AND jsonb_typeof(s.value) = 'array'))
$$;
COMMENT ON FUNCTION app.fn_mfa_required() IS 'true nếu người đang đăng nhập giữ vai trò bắt buộc xác thực 2 bước (settings auth.mfa_required_roles).';
ALTER FUNCTION app.fn_mfa_required() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_mfa_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_mfa_required() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

CREATE INDEX IF NOT EXISTS ix_password_resets__user_time ON public.password_resets (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS ix_password_resets__ip_time ON public.password_resets (requested_ip, requested_at DESC);

COMMIT;
