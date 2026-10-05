-- =====================================================================
-- DỮ LIỆU NGHIỆP VỤ 2026-10-05 — Vai trò của lưu xá: chỉ còn Trưởng nhà, Thủ quỹ, Admin, Thành viên là vai trò HỆ THỐNG;
-- các ban (Phụng vụ, Ẩm thực, Truyền thông…) là VAI TRÒ TỰ TẠO do Admin quản lý ở Cài đặt → "Phân quyền & Vai trò".
-- Chạy bằng scripts/db/migrate.mjs SAU db/app/992_rbac_admin.sql (cần cột roles.archived_at). Idempotent; áp được trên DB thật
-- đang có dữ liệu (không giả định người nào đang giữ vai trò nào). Chạy dưới tài khoản migrator (superuser/owner): không có
-- ngữ cảnh người dùng ⇒ nhật ký kiểm toán ghi người thao tác = hệ thống.
--
--   1. Bỏ vai trò Phó nhà (vice_head):
--      a. người đang giữ (trực tiếp) vẫn còn vai trò Thành viên;
--      b. thu hồi mọi gán / ủy quyền vice_head còn hiệu lực;
--      c. kết thúc chức danh "Phó nhà" trong nhiệm kỳ (member_positions) và ngừng dùng chức danh đó (positions.is_active = false);
--      d. xóa quyền của vice_head rồi xóa hẳn vai trò; còn lịch sử tham chiếu ⇒ lưu trữ (archived_at).
--         (expense_approvals.approver_role lưu mã vai trò dạng TEXT — lịch sử chữ ký không bị ảnh hưởng.)
--   2. Trưởng ban Phụng vụ / Ẩm thực / Truyền thông → vai trò tự tạo (giữ nguyên quyền và người đang giữ).
--   3. Admin được gán/thu hồi vai trò (auth.role.assign — kể cả đặt lại mật khẩu/khóa tài khoản đặc quyền, BR-AUTH-22),
--      quản lý năm học/học kỳ/nhiệm kỳ (term.manage) và trách vụ (position.manage). auth.role.manage đã cấp ở db/app/992.
-- =====================================================================
BEGIN;

-- [1a] Người đang giữ vai trò Phó nhà vẫn là Thành viên
INSERT INTO public.user_roles (user_id, role_id, note)
SELECT DISTINCT ur.user_id, mem.id, 'Giữ vai trò Thành viên khi bỏ vai trò Phó nhà (2026-10)'
  FROM public.user_roles ur
  JOIN public.roles v   ON v.id = ur.role_id AND v.code = 'vice_head'
  JOIN public.roles mem ON mem.code = 'member'
 WHERE ur.revoked_at IS NULL AND (ur.valid_to IS NULL OR ur.valid_to > now())
   AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                    WHERE x.user_id = ur.user_id AND x.role_id = mem.id AND x.scope_type = 'global'
                      AND x.revoked_at IS NULL AND (x.valid_to IS NULL OR x.valid_to > now()));

-- [1b] Thu hồi gán / ủy quyền Phó nhà
UPDATE public.user_roles ur
   SET revoked_at = now(),
       note = left(concat_ws(' · ', NULLIF(ur.note, ''), 'Bỏ vai trò Phó nhà (2026-10)'), 500)
  FROM public.roles v
 WHERE v.id = ur.role_id AND v.code = 'vice_head' AND ur.revoked_at IS NULL;

UPDATE public.role_delegations d
   SET revoked_at = now()
  FROM public.roles v
 WHERE v.id = d.role_id AND v.code = 'vice_head' AND d.revoked_at IS NULL;

-- [1c] Chức danh Phó nhà: kết thúc từ hôm qua để không còn hiển thị là chức danh hiện hành (v_member_current_position tính
--      ends_on >= hôm nay); chức danh bắt đầu hôm nay thì kết thúc hôm nay; chức danh hẹn trước (chưa bắt đầu) thì hủy.
DELETE FROM public.member_positions mp
 USING public.positions p
 WHERE p.id = mp.position_id AND p.code = 'vice_head' AND mp.starts_on > app.local_today();

UPDATE public.member_positions mp
   SET ends_on = GREATEST(mp.starts_on, app.local_today() - 1)
  FROM public.positions p
 WHERE p.id = mp.position_id AND p.code = 'vice_head'
   AND (mp.ends_on IS NULL OR mp.ends_on > GREATEST(mp.starts_on, app.local_today() - 1));

UPDATE public.positions SET is_active = false WHERE code = 'vice_head' AND is_active;

-- Cấu hình "vai trò bắt buộc MFA" không còn nhắc tới vai trò đã bỏ
UPDATE public.settings s
   SET value = (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(s.value) AS x WHERE x <> '"vice_head"'::jsonb)
 WHERE s.key = 'auth.mfa_required_roles' AND jsonb_typeof(s.value) = 'array' AND s.value @> '["vice_head"]'::jsonb;

-- [1d] Xóa quyền rồi xóa (hoặc lưu trữ) vai trò Phó nhà
DELETE FROM public.role_permissions rp USING public.roles v WHERE v.id = rp.role_id AND v.code = 'vice_head';

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.roles WHERE code = 'vice_head' AND archived_at IS NULL;
  IF v_id IS NULL THEN
    RETURN;  -- đã xóa / đã lưu trữ ở lần chạy trước
  END IF;
  -- announcement_targets tham chiếu ON DELETE CASCADE: xóa vai trò sẽ biến thông báo chỉ gửi Phó nhà thành thông báo toàn thể ⇒ lưu trữ
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role_id = v_id)
     AND NOT EXISTS (SELECT 1 FROM public.role_delegations WHERE role_id = v_id)
     AND NOT EXISTS (SELECT 1 FROM public.announcement_targets WHERE role_id = v_id) THEN
    BEGIN
      DELETE FROM public.roles WHERE id = v_id;
      RETURN;
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;
    END;
  END IF;
  UPDATE public.roles SET archived_at = now() WHERE id = v_id;
END
$$;

-- [2] Các ban là vai trò tự tạo (Admin sửa tên/quyền/xóa được)
UPDATE public.roles SET is_system = false
 WHERE code IN ('liturgy_lead', 'kitchen_lead', 'media_lead') AND is_system;

-- [3] Quyền quản trị cho Admin
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, x.code
  FROM public.roles r
  JOIN (VALUES ('auth.role.assign'), ('term.manage'), ('position.manage')) AS x(code) ON true
  JOIN public.permissions p ON p.code = x.code
 WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

COMMIT;
