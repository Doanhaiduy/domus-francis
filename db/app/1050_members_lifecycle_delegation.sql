-- =====================================================================
-- 1050 — GÓI E: Thành viên — vào/ra nhà, xuất danh sách, ủy quyền tạm thời. Chạy TRƯỚC 1051 về số thứ tự (độc lập nhau). Idempotent.
--   • Rời nhà có danh sách việc còn treo, kích hoạt lại một bước, xuất danh bạ / danh sách tạm trú: TOÀN BỘ dùng bảng/hàm/RLS sẵn có
--     (contributions, duty_week_members, discipline_records, leave_requests, alumni_profiles, app.fn_national_id_cipher…) — không cần cấu trúc mới.
--   • Ủy quyền tạm thời (Q9) dùng bảng thiết kế `role_delegations` (db/migrations/04, RLS ở 46; app.current_role_grants() đã tính ủy quyền;
--     trigger tg_role_delegation_rules chặn vai trò admin + bắt người ủy quyền phải đang giữ vai trò đó; tối đa 60 ngày). Ở đây chỉ thêm:
--       1. hai loại thông báo: delegation.received (người được ủy quyền) và delegation.revoked (thu hồi sớm),
--       2. app.fn_delegation_overview(): danh sách ủy quyền kèm TÊN người (bảng users/members bị RLS nên ứng dụng không join trực tiếp được),
--          chỉ cho bên liên quan (người ủy quyền, người được ủy quyền) hoặc người có auth.role.assign.
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('delegation.received', 'system', 'Bạn được ủy quyền vai trò tạm thời', ARRAY['in_app', 'web_push']::notification_channel_t[], 'high',   false, true),
  ('delegation.revoked',  'system', 'Ủy quyền vai trò đã được thu hồi',   ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, true)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION app.fn_delegation_overview()
RETURNS TABLE (
  id uuid, role_code text, role_name text,
  delegator_user_id uuid, delegator_member_id uuid, delegator_name text,
  delegate_user_id uuid, delegate_member_id uuid, delegate_name text,
  reason text, starts_at timestamptz, ends_at timestamptz,
  revoked_at timestamptz, revoked_by_name text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT d.id, r.code, r.name_vi,
         d.delegator_user_id, dm.id, COALESCE(dm.display_name, dm.full_name, du.email::text),
         d.delegate_user_id, em.id, COALESCE(em.display_name, em.full_name, eu.email::text),
         d.reason, d.starts_at, d.ends_at,
         d.revoked_at, COALESCE(rm.display_name, rm.full_name), d.created_at
    FROM public.role_delegations d
    JOIN public.roles r ON r.id = d.role_id
    JOIN public.users du ON du.id = d.delegator_user_id
    JOIN public.users eu ON eu.id = d.delegate_user_id
    LEFT JOIN public.members dm ON dm.user_id = d.delegator_user_id
    LEFT JOIN public.members em ON em.user_id = d.delegate_user_id
    LEFT JOIN public.members rm ON rm.user_id = d.revoked_by
   WHERE app.current_user_id() IS NOT NULL
     AND (d.delegator_user_id = app.current_user_id() OR d.delegate_user_id = app.current_user_id() OR app.has_permission('auth.role.assign'))
     AND (d.revoked_at IS NULL OR d.revoked_at > now() - interval '90 days')
     AND d.ends_at > now() - interval '90 days'
   ORDER BY (d.revoked_at IS NULL AND d.ends_at > now()) DESC, d.starts_at DESC
   LIMIT 200
$$;
COMMENT ON FUNCTION app.fn_delegation_overview() IS
  'Ủy quyền vai trò đang/sắp/đã hiệu lực (90 ngày gần đây) kèm tên người ủy quyền / được ủy quyền / thu hồi — cho bên liên quan hoặc người có auth.role.assign.';
ALTER FUNCTION app.fn_delegation_overview() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_delegation_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_delegation_overview() TO luuxa_app, luuxa_definer, luuxa_owner;

COMMIT;
