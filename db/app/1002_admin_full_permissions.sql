-- =====================================================================
-- 1002 — CẤP TOÀN BỘ QUYỀN (FULL QUYỀN) CHO VAI TRÒ ADMIN
--   1. Gán TẤT CẢ mã quyền trong bảng permissions vào role_permissions cho admin.
--   2. Cập nhật hàm app.has_permission() và app.lacks_permission():
--      nếu người dùng có vai trò 'admin' thì luôn có quyền với mọi tính năng.
-- =====================================================================
BEGIN;

-- 1. Gán toàn bộ quyền hiện có cho vai trò admin
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.roles r
 CROSS JOIN public.permissions p
 WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- 2. Cập nhật app.has_permission: admin luôn có toàn quyền
CREATE OR REPLACE FUNCTION app.has_permission(
  p_permission text,
  p_scope_type scope_type_t DEFAULT 'global',
  p_scope_id   uuid         DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.current_role_grants() g WHERE g.role_code = 'admin'
  ) OR EXISTS (
    SELECT 1
      FROM app.current_role_grants() g
      JOIN public.roles r             ON r.code = g.role_code
      JOIN public.role_permissions rp ON rp.role_id = r.id
     WHERE rp.permission_code = p_permission
       AND (g.scope_type = 'global'
            OR (p_scope_id IS NOT NULL AND g.scope_type = p_scope_type AND g.scope_id = p_scope_id))
  )
$$;

-- 3. Cập nhật app.lacks_permission: admin không bao giờ thiếu quyền
CREATE OR REPLACE FUNCTION app.lacks_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE
    WHEN app.current_user_id() IS NULL THEN NOT app.is_system_caller()
    WHEN EXISTS (SELECT 1 FROM app.current_role_grants() g WHERE g.role_code = 'admin') THEN false
    ELSE NOT app.has_permission(p_permission)
  END
$$;

COMMIT;
