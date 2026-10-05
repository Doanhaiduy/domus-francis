-- =====================================================================
-- 90 — Vai trò đăng nhập của ứng dụng web (Next.js Route Handlers).
-- luuxa_api: LOGIN (mật khẩu đặt bởi scripts/setup-local.mjs), NOINHERIT ⇒ không có quyền gì cho tới khi
-- mỗi transaction SET LOCAL ROLE sang đúng một vai trò thiết kế (luuxa_app / luuxa_auth / luuxa_worker).
-- Membership WITH INHERIT FALSE ⇒ app.is_system_caller() = false cho kết nối chưa SET ROLE.
-- Idempotent.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_api') THEN
    CREATE ROLE luuxa_api NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
GRANT luuxa_app    TO luuxa_api WITH INHERIT FALSE, SET TRUE;
GRANT luuxa_auth   TO luuxa_api WITH INHERIT FALSE, SET TRUE;
GRANT luuxa_worker TO luuxa_api WITH INHERIT FALSE, SET TRUE;
