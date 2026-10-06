-- =====================================================================
-- 1027 — ADMIN CÓ TOÀN QUYỀN, KỂ CẢ QUYỀN MỚI SAU NÀY
--   1002 đã cấp mọi quyền lúc đó + cho app.has_permission() luôn đúng với Admin. Bản này bổ sung:
--   1. Cấp nốt các quyền thêm sau 1002 + trigger tự cấp cho Admin mỗi khi thêm một quyền mới (không phải nhớ cấp tay).
--   2. app.roles_have_permission(): Admin luôn có quyền (dùng trong các trigger kiểm tra chữ ký duyệt chi…).
--   3. app.has_role(): Admin được coi là giữ MỌI vai trò (Trưởng nhà, Thủ quỹ, Trưởng ban…) — kiểm tra theo vai trò không loại Admin nữa.
--   4. Ký duyệt chi (tg_expense_approval_rules): Admin ký được như Trưởng nhà / Thủ quỹ.
--   Các quy tắc TÁCH NGƯỜI (người lập phiếu không tự duyệt phiếu của mình, không tự duyệt đơn xin phép của chính mình) vẫn giữ nguyên.
-- =====================================================================
BEGIN;

-- 1. cấp mọi quyền hiện có + tự cấp quyền mới
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r CROSS JOIN public.permissions p WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION app.tg_permissions_grant_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.role_permissions (role_id, permission_code)
  SELECT r.id, NEW.code FROM public.roles r WHERE r.code = 'admin'
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END
$$;
ALTER FUNCTION app.tg_permissions_grant_admin() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_permissions_grant_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_permissions_grant_admin() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
DROP TRIGGER IF EXISTS trg_permissions__grant_admin ON public.permissions;
CREATE TRIGGER trg_permissions__grant_admin AFTER INSERT ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION app.tg_permissions_grant_admin();

-- 2. roles_have_permission: Admin luôn có quyền
CREATE OR REPLACE FUNCTION app.roles_have_permission(p_roles text[], p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT 'admin' = ANY (p_roles) OR EXISTS (
    SELECT 1
      FROM public.roles r
      JOIN public.role_permissions rp ON rp.role_id = r.id
     WHERE r.code = ANY (p_roles) AND rp.permission_code = p_permission)
$$;

-- 3. has_role: Admin giữ mọi vai trò
CREATE OR REPLACE FUNCTION app.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM app.current_role_grants() g WHERE g.role_code = p_role OR g.role_code = 'admin')
$$;

-- 4. Ký duyệt chi: Admin (người ký) được tính là Trưởng nhà + Thủ quỹ. Chỉ áp cho NGƯỜI KÝ — vai trò của người lập / người ứng tiền
--    (app.user_roles_of) giữ nguyên để việc tính số chữ ký cần thiết của phiếu không đổi. Thân hàm = bản của db/app/998, thêm đúng một dòng.
CREATE OR REPLACE FUNCTION app.tg_expense_approval_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v           public.expense_vouchers%ROWTYPE;
  v_payee_uid uuid;
  v_roles     text[];
  v_used      text[];
  v_role      text;
  v_cross     boolean := COALESCE(app.setting_bool('finance.expense.cross_signer_mode'), false);
  v_head_inv  boolean := false;
BEGIN
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = NEW.voucher_id FOR UPDATE;
  IF v.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Phiếu % không ở trạng thái chờ duyệt (hiện: %).', v.voucher_no, v.status USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL AND NEW.approver_user_id <> app.current_user_id() THEN
    RAISE EXCEPTION 'Chỉ được ghi chữ ký duyệt của chính mình.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.approver_user_id = v.requested_by THEN
    RAISE EXCEPTION 'BR-FIN-01: người tạo phiếu không được tự duyệt phiếu của mình.' USING ERRCODE = 'check_violation';
  END IF;
  IF v.paid_by_member_id IS NOT NULL THEN
    SELECT m.user_id INTO v_payee_uid FROM public.members m WHERE m.id = v.paid_by_member_id;
    IF v_payee_uid IS NOT NULL AND v_payee_uid = NEW.approver_user_id THEN
      RAISE EXCEPTION 'BR-FIN-01: người ứng tiền/được hoàn ứng không được duyệt phiếu của chính mình.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_cross THEN
    v_head_inv := 'house_head' = ANY (app.user_roles_of(v.requested_by))
                  OR (v_payee_uid IS NOT NULL AND 'house_head' = ANY (app.user_roles_of(v_payee_uid)));
  END IF;

  v_roles := app.user_roles_of(NEW.approver_user_id);
  IF 'admin' = ANY (v_roles) THEN v_roles := v_roles || ARRAY['house_head', 'treasurer']; END IF;  -- Admin ký được như Trưởng nhà / Thủ quỹ
  IF NOT app.roles_have_permission(v_roles, 'finance.expense.approve') THEN
    RAISE EXCEPTION 'Người dùng không có quyền duyệt chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(array_agg(ea.approver_role), ARRAY[]::text[]) INTO v_used
    FROM public.expense_approvals ea
   WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.decision = 'approved';

  IF NEW.decision = 'rejected' THEN
    v_role := (SELECT r FROM unnest(ARRAY['house_head', 'treasurer', 'vice_head']) AS r WHERE r = ANY (v_roles) LIMIT 1);
  ELSIF v.required_approvals = 1 THEN
    v_role := CASE WHEN 'house_head' = ANY (v_roles) THEN 'house_head'
                   WHEN 'treasurer'  = ANY (v_roles) AND (v.amount_vnd <= app.setting_int('finance.expense.treasurer_solo_approve_max_vnd')
                                                          OR (v_cross AND v_head_inv)) THEN 'treasurer' END;
    IF v_role IS NULL AND 'treasurer' = ANY (v_roles) THEN
      RAISE EXCEPTION 'BR-FIN-17: Thủ quỹ chỉ tự duyệt (một chữ ký) phiếu đến % đ; phiếu này % đ cần Trưởng nhà duyệt để tách người duyệt khỏi người ghi chi.',
        app.setting_int('finance.expense.treasurer_solo_approve_max_vnd'), v.amount_vnd USING ERRCODE = 'check_violation';
    END IF;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'BR-FIN-02: phiếu một chữ ký phải do Trưởng nhà (hoặc Thủ quỹ với khoản nhỏ) duyệt.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_role := (SELECT r FROM unnest(ARRAY['house_head', 'treasurer', 'vice_head']) AS r
                WHERE r = ANY (v_roles) AND NOT (r = ANY (v_used)) LIMIT 1);
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'BR-FIN-02: phiếu cần 2 chữ ký của 2 vai trò khác nhau (Trưởng nhà + Thủ quỹ/Phó nhà); vai trò của bạn đã ký hoặc không hợp lệ.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.approver_role := v_role;
  NEW.round := v.approval_round;
  RETURN NEW;
END
$$;

-- app.user_roles_of() GIỮ NGUYÊN như thiết kế gốc (không mở rộng cho Admin): vai trò của người lập/người ứng tiền quyết định số chữ ký cần có,
-- nên Admin lập hoặc ứng tiền một phiếu không được làm đổi số chữ ký. (Khai báo lại ở đây để bảo đảm đúng bản gốc ở mọi môi trường.)
CREATE OR REPLACE FUNCTION app.user_roles_of(p_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT x.code), ARRAY[]::text[])
    FROM (
      SELECT r.code
        FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL
         AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
      UNION
      SELECT r.code
        FROM public.role_delegations d JOIN public.roles r ON r.id = d.role_id
       WHERE d.delegate_user_id = p_user_id AND d.revoked_at IS NULL
         AND d.starts_at <= now() AND d.ends_at > now()
    ) AS x
$$;

COMMIT;
