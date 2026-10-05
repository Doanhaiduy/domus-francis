-- =====================================================================
-- 1016 — NHẬT KÝ HOẠT ĐỘNG NGƯỜI DÙNG (chỉ Admin xem). Chạy SAU 1015. Idempotent.
--   • activity_logs: mỗi thao tác GHI (POST/PUT/PATCH/DELETE) qua API ghi một dòng — ai, làm gì (đường dẫn API), kết quả, từ đâu.
--     KHÔNG lưu nội dung gửi lên (tránh lộ mật khẩu / số điện thoại / CCCD); thay đổi dữ liệu chi tiết nằm ở audit_logs.
--   • Quyền mới activity.log.read: chỉ vai trò admin; là quyền "bảo vệ" nên vai trò tự tạo không nhận được.
--   • Ghi bằng luuxa_worker (tầng ứng dụng); luuxa_app chỉ ĐỌC và chỉ khi có quyền (RLS) — không ai sửa/xóa được từ giao diện.
--   • Giữ 180 ngày: dọn trong tác vụ housekeeping (src/server/jobs.ts).
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('activity.log.read', 'audit', 'Xem nhật ký hoạt động của người dùng (ai làm gì, lúc nào, từ đâu)', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'activity.log.read' FROM public.roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- Thêm vào danh sách quyền bảo vệ (đồng bộ PROTECTED_PERMISSIONS ở src/lib/types/settings.ts)
CREATE OR REPLACE FUNCTION app.rbac_protected_permissions()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT ARRAY[
    'auth.role.manage',         -- đúc vai trò
    'auth.role.assign',         -- gán vai trò
    'auth.role.delegate',       -- ủy quyền vai trò
    'auth.user.manage',         -- tạo/khóa tài khoản, đặt lại mật khẩu
    'auth.session.revoke_any',  -- thu hồi phiên người khác
    'audit.sensitive.read',     -- nhật ký dữ liệu cá nhân nhạy cảm
    'activity.log.read',        -- nhật ký hoạt động người dùng (chỉ Admin)
    'member.national_id.read'   -- giải mã CCCD
  ]::text[]
$$;

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,
  method       text        NOT NULL,
  route        text        NOT NULL,
  path         text        NOT NULL,
  status       smallint    NOT NULL,
  error_code   text,
  duration_ms  integer,
  ip           inet,
  user_agent   text,
  request_id   uuid,
  CONSTRAINT ck_activity_logs__method CHECK (method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
  CONSTRAINT ck_activity_logs__len CHECK (char_length(route) <= 300 AND char_length(path) <= 400)
);
COMMENT ON TABLE public.activity_logs IS
  'Nhật ký thao tác ghi của người dùng qua API (ai, làm gì, kết quả, IP/thiết bị). Không lưu nội dung gửi lên. user_id không có khóa ngoại để giữ lịch sử khi tài khoản bị xóa. Chỉ Admin (activity.log.read) đọc; giữ 180 ngày.';
CREATE INDEX IF NOT EXISTS ix_activity_logs__time ON public.activity_logs (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_activity_logs__user ON public.activity_logs (user_id, occurred_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_logs__select ON public.activity_logs;
CREATE POLICY activity_logs__select ON public.activity_logs FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('activity.log.read')));

ALTER TABLE public.activity_logs OWNER TO luuxa_owner;
REVOKE ALL ON public.activity_logs FROM luuxa_app;
GRANT SELECT ON public.activity_logs TO luuxa_app;
GRANT SELECT, INSERT, DELETE ON public.activity_logs TO luuxa_worker, luuxa_definer;

COMMIT;
