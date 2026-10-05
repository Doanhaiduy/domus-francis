-- =====================================================================
-- 992 — PHÂN QUYỀN, VAI TRÒ & TÀI KHOẢN do Admin quản trị (màn hình /cai-dat → "Phân quyền & Vai trò", "Tài khoản").
-- Chạy SAU 01–52 + 70–75 + 90–98. Idempotent (chạy lại nhiều lần được; scripts/db/migrate.mjs áp file ≥ 991 lên DB đang chạy).
--
--   1. Quyền mới auth.role.manage (nhạy cảm) — tạo/sửa/xóa VAI TRÒ TỰ TẠO và bộ quyền của chúng; cấp cho vai trò admin.
--   2. roles.archived_at — vai trò tự tạo đã xóa nhưng còn lịch sử gán/ủy quyền/đối tượng thông báo ⇒ LƯU TRỮ thay vì xóa cứng
--      (user_roles/role_delegations tham chiếu ON DELETE RESTRICT; announcement_targets ON DELETE CASCADE — xóa cứng sẽ làm
--      thông báo chỉ gửi cho vai trò đó biến thành thông báo TOÀN THỂ).
--   3. app.rbac_protected_permissions() — danh sách CỨNG các quyền "bảo vệ" mà vai trò tự tạo không được nhận (chống leo thang
--      đặc quyền: ai giữ auth.role.manage không thể tự đúc ra một vai trò "siêu Admin" rồi nhờ người khác gán). Cùng danh sách ở
--      src/lib/types/settings.ts (PROTECTED_PERMISSIONS) để giao diện làm mờ ô.
--   4. app.fn_role_save / app.fn_role_delete — SECURITY DEFINER (luuxa_app không có quyền ghi roles/role_permissions — 49_b A2).
--      • Vai trò hệ thống (is_system = true: admin, house_head, treasurer, member…): KHÔNG xóa, bộ quyền + hạng KHÓA,
--        chỉ đổi tên hiển thị/mô tả.
--      • Vai trò tự tạo (is_system = false): tạo/sửa tên-mô tả-hạng-bộ quyền/xóa. Hạng 41..89: luôn dưới Trưởng nhà/Thủ quỹ,
--        trên Thành viên (rank chỉ để sắp xếp/hiển thị, KHÔNG dùng để kiểm quyền).
--      • Không được THÊM quyền vào vai trò mà chính mình đang giữ (tự nâng quyền qua đường sửa vai trò).
--   5. Trigger chặn gán / ủy quyền vai trò đã lưu trữ.
--
-- Lưu ý: file CẤU TRÚC — không đổi dữ liệu gốc (vai trò Phó nhà, quyền của Admin với vai trò có sẵn…). Các thay đổi đó ở
-- db/data/2026-10-05-01_roles.sql để bộ kiểm định độc lập (pnpm db:audit — smoke test giả định dữ liệu gốc) vẫn xanh.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Quyền auth.role.manage (quyền MỚI ⇒ được cấp ngay ở đây cho vai trò admin)
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('auth.role.manage', 'auth', 'Tạo/sửa/xóa vai trò tự tạo và bộ quyền của chúng', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'auth.role.manage' FROM public.roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- [2] Lưu trữ vai trò
-- ---------------------------------------------------------------------
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
COMMENT ON COLUMN public.roles.archived_at IS
  'Vai trò tự tạo đã bị xóa nhưng còn lịch sử tham chiếu (user_roles / role_delegations / announcement_targets) ⇒ giữ dòng để không mất lịch sử, ẩn khỏi giao diện, không còn quyền nào (role_permissions đã xóa) và không gán/ủy quyền được nữa (trg_*__role_not_archived). NULL = đang dùng.';

-- ---------------------------------------------------------------------
-- [3] Quyền bảo vệ — vai trò tự tạo không được nhận
-- ---------------------------------------------------------------------
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
    'member.national_id.read'   -- giải mã CCCD
  ]::text[]
$$;
COMMENT ON FUNCTION app.rbac_protected_permissions() IS
  'Danh sách cứng các quyền mà vai trò tự tạo (roles.is_system = false) không được nhận — chống leo thang đặc quyền qua app.fn_role_save. Đồng bộ với PROTECTED_PERMISSIONS ở src/lib/types/settings.ts.';
ALTER FUNCTION app.rbac_protected_permissions() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.rbac_protected_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.rbac_protected_permissions() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- [4a] Tạo / sửa vai trò
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_role_save(p_code text, p_name text, p_description text, p_rank smallint, p_permissions text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_code  text := lower(btrim(COALESCE(p_code, '')));
  v_name  text := regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g');
  v_desc  text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_role  public.roles%ROWTYPE;
  v_perms text[];
  v_cur   text[];
  v_bad   text;
  v_added text;
  v_found boolean;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('auth.role.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý vai trò (chỉ Admin).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Tên vai trò phải từ 2 đến 80 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN
    RAISE EXCEPTION 'Mô tả vai trò tối đa 300 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  -- Bộ quyền chuẩn hóa: bỏ khoảng trắng/trùng, sắp xếp (NULL = giữ nguyên bộ quyền hiện tại)
  IF p_permissions IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)), '{}'::text[]) INTO v_perms
      FROM unnest(p_permissions) AS x WHERE btrim(COALESCE(x, '')) <> '';
  END IF;

  SELECT * INTO v_role FROM public.roles r WHERE r.code = v_code FOR UPDATE;
  v_found := FOUND;  -- giữ lại: các lệnh SELECT … INTO phía sau ghi đè biến FOUND

  IF v_found AND v_role.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'BR-RBAC-03: vai trò "%" đã bị xóa (đang lưu trữ) — không sửa được; mã "%" cũng không dùng lại được.', v_role.name_vi, v_code
      USING ERRCODE = 'check_violation';
  END IF;

  -- Không trùng tên hiển thị với vai trò khác đang dùng (tránh hai lựa chọn giống hệt nhau khi gán vai trò)
  IF EXISTS (SELECT 1 FROM public.roles r
              WHERE r.archived_at IS NULL AND lower(r.name_vi) = lower(v_name) AND r.code <> v_code) THEN
    RAISE EXCEPTION 'Đã có vai trò tên "%".', v_name USING ERRCODE = 'unique_violation';
  END IF;

  -- ---- Vai trò hệ thống: chỉ đổi tên hiển thị / mô tả ----
  IF v_found AND v_role.is_system THEN
    IF v_perms IS NOT NULL THEN
      SELECT COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code), '{}'::text[]) INTO v_cur
        FROM public.role_permissions rp WHERE rp.role_id = v_role.id;
      IF v_perms IS DISTINCT FROM v_cur THEN
        RAISE EXCEPTION 'BR-RBAC-01: "%" là vai trò hệ thống — bộ quyền cố định, chỉ đổi được tên hiển thị và mô tả.', v_role.name_vi
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF p_rank IS NOT NULL AND p_rank <> v_role.rank THEN
      RAISE EXCEPTION 'BR-RBAC-01: "%" là vai trò hệ thống — không đổi được thứ hạng.', v_role.name_vi USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.roles SET name_vi = v_name, description = v_desc
     WHERE id = v_role.id AND (name_vi IS DISTINCT FROM v_name OR description IS DISTINCT FROM v_desc);
    RETURN v_role.id;
  END IF;

  -- ---- Vai trò tự tạo: kiểm bộ quyền ----
  IF v_perms IS NOT NULL THEN
    SELECT string_agg(x, ', ' ORDER BY x) INTO v_bad
      FROM unnest(v_perms) AS x WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = x);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Mã quyền không tồn tại: %.', v_bad USING ERRCODE = 'check_violation';
    END IF;
    SELECT string_agg(p.description || ' (' || p.code || ')', '; ' ORDER BY p.code) INTO v_bad
      FROM unnest(v_perms) AS x JOIN public.permissions p ON p.code = x
     WHERE x = ANY (app.rbac_protected_permissions());
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'BR-RBAC-02: vai trò tự tạo không được nhận quyền bảo vệ (chỉ vai trò hệ thống có): %.', v_bad
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_found THEN
    -- ---- Tạo mới ----
    IF v_code !~ '^[a-z][a-z0-9_]{2,39}$' THEN
      RAISE EXCEPTION 'Mã vai trò "%" không hợp lệ: 3–40 ký tự, bắt đầu bằng chữ thường không dấu, chỉ gồm chữ thường, số và dấu gạch dưới.', v_code
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_rank IS NOT NULL AND p_rank NOT BETWEEN 41 AND 89 THEN
      RAISE EXCEPTION 'Thứ hạng vai trò tự tạo phải từ 41 đến 89 (dưới Trưởng nhà/Thủ quỹ, trên Thành viên).' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.roles (code, name_vi, description, rank, is_system)
    VALUES (v_code, v_name, v_desc, COALESCE(p_rank, 50), false)
    RETURNING * INTO v_role;
    IF v_perms IS NOT NULL AND cardinality(v_perms) > 0 THEN
      INSERT INTO public.role_permissions (role_id, permission_code) SELECT v_role.id, x FROM unnest(v_perms) AS x;
    END IF;
    RETURN v_role.id;
  END IF;

  -- ---- Sửa vai trò tự tạo ----
  IF p_rank IS NOT NULL AND p_rank <> v_role.rank AND p_rank NOT BETWEEN 41 AND 89 THEN
    RAISE EXCEPTION 'Thứ hạng vai trò tự tạo phải từ 41 đến 89 (dưới Trưởng nhà/Thủ quỹ, trên Thành viên).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_perms IS NOT NULL THEN
    -- Chống tự nâng quyền: người sửa đang giữ vai trò này (trực tiếp hoặc được ủy quyền) thì chỉ được BỚT quyền
    IF EXISTS (SELECT 1 FROM app.current_role_grants() g WHERE g.role_code = v_role.code) THEN
      SELECT string_agg(x, ', ' ORDER BY x) INTO v_added
        FROM unnest(v_perms) AS x
       WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = v_role.id AND rp.permission_code = x);
      IF v_added IS NOT NULL THEN
        RAISE EXCEPTION 'BR-RBAC-05: bạn đang giữ vai trò "%" — không được tự thêm quyền cho vai trò của chính mình (%). Nhờ Admin khác thực hiện.', v_role.name_vi, v_added
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  UPDATE public.roles
     SET name_vi = v_name, description = v_desc, rank = COALESCE(p_rank, rank)
   WHERE id = v_role.id
     AND (name_vi IS DISTINCT FROM v_name OR description IS DISTINCT FROM v_desc OR rank IS DISTINCT FROM COALESCE(p_rank, rank));
  IF v_perms IS NOT NULL THEN
    -- Thay toàn bộ bộ quyền (chỉ ghi phần chênh lệch ⇒ nhật ký kiểm toán gọn)
    DELETE FROM public.role_permissions rp WHERE rp.role_id = v_role.id AND rp.permission_code <> ALL (v_perms);
    INSERT INTO public.role_permissions (role_id, permission_code)
    SELECT v_role.id, x FROM unnest(v_perms) AS x
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_role.id;
END
$$;
COMMENT ON FUNCTION app.fn_role_save(text, text, text, smallint, text[]) IS
  'Tạo/sửa vai trò (cần auth.role.manage). Chưa có ⇒ tạo vai trò tự tạo (mã ^[a-z][a-z0-9_]{2,39}$, hạng 41..89, mặc định 50). Vai trò hệ thống ⇒ chỉ đổi name_vi/description (bộ quyền/hạng khác hiện tại ⇒ BR-RBAC-01). Vai trò tự tạo ⇒ đổi tên/mô tả/hạng và THAY toàn bộ role_permissions bằng p_permissions (NULL = giữ nguyên; mã phải tồn tại, không thuộc app.rbac_protected_permissions() — BR-RBAC-02; người đang giữ vai trò không được tự thêm quyền — BR-RBAC-05). Vai trò đã lưu trữ ⇒ BR-RBAC-03.';
ALTER FUNCTION app.fn_role_save(text, text, text, smallint, text[]) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_role_save(text, text, text, smallint, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_role_save(text, text, text, smallint, text[]) TO luuxa_app;

-- ---------------------------------------------------------------------
-- [4b] Xóa vai trò tự tạo (xóa cứng nếu chưa từng dùng, ngược lại lưu trữ + thu hồi gán còn hiệu lực)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_role_delete(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_role public.roles%ROWTYPE;
  v_uid  uuid := app.current_user_id();
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('auth.role.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý vai trò (chỉ Admin).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_role FROM public.roles r WHERE r.code = lower(btrim(COALESCE(p_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy vai trò.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_role.is_system THEN
    RAISE EXCEPTION 'BR-RBAC-04: "%" là vai trò hệ thống — không xóa được.', v_role.name_vi USING ERRCODE = 'check_violation';
  END IF;
  IF v_role.archived_at IS NOT NULL THEN
    RETURN 'archived';  -- đã xóa trước đó (idempotent)
  END IF;

  -- Mất mọi quyền ngay lập tức
  DELETE FROM public.role_permissions rp WHERE rp.role_id = v_role.id;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role_id = v_role.id)
     AND NOT EXISTS (SELECT 1 FROM public.role_delegations d WHERE d.role_id = v_role.id)
     AND NOT EXISTS (SELECT 1 FROM public.announcement_targets t WHERE t.role_id = v_role.id) THEN
    BEGIN
      DELETE FROM public.roles WHERE id = v_role.id;
      RETURN 'deleted';
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;  -- bảng khác (thêm sau này) còn tham chiếu ⇒ lưu trữ như dưới
    END;
  END IF;

  -- Còn lịch sử tham chiếu: thu hồi các gán/ủy quyền còn hiệu lực rồi lưu trữ
  UPDATE public.user_roles
     SET revoked_at = now(), revoked_by = v_uid
   WHERE role_id = v_role.id AND revoked_at IS NULL AND (valid_to IS NULL OR valid_to > now());
  UPDATE public.role_delegations
     SET revoked_at = now(), revoked_by = v_uid
   WHERE role_id = v_role.id AND revoked_at IS NULL AND ends_at > now();
  UPDATE public.roles SET archived_at = now() WHERE id = v_role.id;
  RETURN 'archived';
END
$$;
COMMENT ON FUNCTION app.fn_role_delete(text) IS
  'Xóa vai trò tự tạo (cần auth.role.manage; vai trò hệ thống ⇒ BR-RBAC-04). Xóa role_permissions; nếu còn user_roles / role_delegations / announcement_targets tham chiếu thì thu hồi các gán còn hiệu lực (revoked_at, revoked_by = người thao tác), đặt archived_at và trả ''archived''; không thì xóa hẳn và trả ''deleted''.';
ALTER FUNCTION app.fn_role_delete(text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_role_delete(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_role_delete(text) TO luuxa_app;

-- ---------------------------------------------------------------------
-- [5] Không gán / ủy quyền vai trò đã lưu trữ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_role_not_archived()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT r.name_vi INTO v_name FROM public.roles r WHERE r.id = NEW.role_id AND r.archived_at IS NOT NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'BR-RBAC-03: vai trò "%" đã bị xóa — không gán hoặc ủy quyền được nữa.', v_name USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_role_not_archived() IS 'BEFORE INSERT user_roles / role_delegations: từ chối vai trò đã lưu trữ (roles.archived_at IS NOT NULL) — BR-RBAC-03.';
ALTER FUNCTION app.tg_role_not_archived() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_role_not_archived() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_user_roles__role_not_archived ON public.user_roles;
CREATE TRIGGER trg_user_roles__role_not_archived
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app.tg_role_not_archived();

DROP TRIGGER IF EXISTS trg_role_delegations__role_not_archived ON public.role_delegations;
CREATE TRIGGER trg_role_delegations__role_not_archived
  BEFORE INSERT ON public.role_delegations
  FOR EACH ROW EXECUTE FUNCTION app.tg_role_not_archived();

COMMIT;
