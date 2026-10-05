-- =====================================================================
-- 999 — Thu chi: ĐỊNH MỨC QUỸ TÙY CHỈNH THEO ĐIỀU KIỆN & THÀNH VIÊN ĐÃ RA TRƯỜNG
--   1. Khóa cấu hình finance.dues_cycle_graduated_amount_vnd (mặc định 500.000 đ).
--   2. Cột members.custom_dues_vnd — định mức quỹ kỳ riêng theo cá nhân (nếu có diện đặc biệt).
--   3. Trigger app.tg_protect_member_custom_dues — chỉ Ban điều hành/Thủ quỹ sửa được custom_dues_vnd.
--   4. Hàm app.fn_member_dues_amount(member_id, base_amount) — tính mức quỹ theo thứ tự ưu tiên:
--      custom_dues_vnd -> tốt nghiệp (graduated) -> mức chuẩn (base_amount).
--   5. app.fn_generate_contributions(plan_id) — áp dụng mức quỹ riêng khi sinh kỳ quỹ (periodic_dues).
--   6. app.fn_adjust_contribution_due(contribution_id, new_amount, reason) — điều chỉnh mức thu từng khoản.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Khóa cấu hình mức quỹ cho thành viên đã tốt nghiệp / ra trường đi làm
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES (
  'finance.dues_cycle_graduated_amount_vnd',
  '500000'::jsonb,
  'vnd',
  'Mức quỹ mỗi kỳ cho thành viên đã tốt nghiệp / ra trường đi làm (VNĐ). Mặc định 500.000 đ / 6 tháng.',
  1000,
  50000000,
  true,
  'finance.settings.write',
  '500000'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- [2] Cột custom_dues_vnd trong members
-- ---------------------------------------------------------------------
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS custom_dues_vnd bigint;
COMMENT ON COLUMN public.members.custom_dues_vnd IS
  'Định mức quỹ kỳ riêng của thành viên (nếu có trường hợp đặc biệt). Nếu NULL, tự động tính theo tình trạng học tập (sinh viên: mức chuẩn; đã ra trường: mức tốt nghiệp).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.members'::regclass AND conname = 'ck_members__custom_dues') THEN
    ALTER TABLE public.members ADD CONSTRAINT ck_members__custom_dues
      CHECK (custom_dues_vnd IS NULL OR (custom_dues_vnd >= 0 AND custom_dues_vnd <= 50000000));
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- [3] Trigger bảo vệ cột custom_dues_vnd
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_protect_member_custom_dues()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.custom_dues_vnd IS DISTINCT FROM OLD.custom_dues_vnd THEN
    IF NOT app.has_any_permission(ARRAY['member.update', 'finance.contribution.plan.manage', 'finance.settings.write']) THEN
      RAISE EXCEPTION 'Chỉ Ban điều hành hoặc Thủ quỹ mới được đổi định mức quỹ riêng của thành viên.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members__custom_dues_protect ON public.members;
CREATE TRIGGER trg_members__custom_dues_protect
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION app.tg_protect_member_custom_dues();

-- ---------------------------------------------------------------------
-- [4] Hàm lấy tình trạng học tập của thành viên (SECURITY DEFINER để mọi caller có quyền đọc được)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_member_student_status(p_member_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT sp.status::text INTO v_status FROM public.student_profiles sp
   WHERE sp.member_id = p_member_id AND sp.is_current AND sp.deleted_at IS NULL
   ORDER BY sp.updated_at DESC LIMIT 1;
  RETURN COALESCE(v_status, 'studying');
END;
$$;
COMMENT ON FUNCTION app.fn_member_student_status(uuid) IS
  'Lấy tình trạng học tập hiện tại của thành viên (studying, graduated, deferred, dropped), mặc định studying nếu chưa có hồ sơ.';

-- ---------------------------------------------------------------------
-- [5] Hàm tính định mức quỹ cho một thành viên
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_member_dues_amount(p_member_id uuid, p_base_amount bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_custom     bigint;
  v_base       bigint := COALESCE(p_base_amount, app.setting_int('finance.dues_cycle_amount_vnd'));
  v_grad_rate  bigint;
BEGIN
  -- 1. Nếu có định mức cá nhân riêng
  SELECT m.custom_dues_vnd INTO v_custom FROM public.members m WHERE m.id = p_member_id;
  IF v_custom IS NOT NULL THEN
    RETURN v_custom;
  END IF;

  -- 2. Nếu đã tốt nghiệp / ra trường
  IF app.fn_member_student_status(p_member_id) = 'graduated' THEN
    v_grad_rate := app.setting_int('finance.dues_cycle_graduated_amount_vnd');
    IF v_grad_rate IS NOT NULL AND v_grad_rate > 0 THEN
      RETURN v_grad_rate;
    END IF;
  END IF;

  -- 3. Mặc định: mức chuẩn (hoặc 300.000 đ nếu null)
  RETURN COALESCE(v_base, 300000);
END;
$$;
COMMENT ON FUNCTION app.fn_member_dues_amount(uuid, bigint) IS
  'Tính mức quỹ kỳ cho một thành viên: ưu tiên custom_dues_vnd, kế đến nếu status=graduated thì lấy finance.dues_cycle_graduated_amount_vnd, còn lại lấy p_base_amount / finance.dues_cycle_amount_vnd.';

-- ---------------------------------------------------------------------
-- [5] Cập nhật app.fn_generate_contributions: áp dụng mức riêng theo người khi là periodic_dues
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_generate_contributions(p_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_plan public.contribution_plans%ROWTYPE;
  v_n    integer;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Không có quyền lập kế hoạch thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_plan FROM public.contribution_plans cp WHERE cp.id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kế hoạch thu không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_plan.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'Kế hoạch đã %.', v_plan.status USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.contributions (plan_id, member_id, amount_due_vnd, due_date)
  SELECT v_plan.id, m.id,
         CASE
           WHEN v_plan.fee_type = 'periodic_dues' THEN app.fn_member_dues_amount(m.id, v_plan.amount_vnd)
           ELSE v_plan.amount_vnd
         END,
         v_plan.due_date
    FROM public.members m
   WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= v_plan.due_date
  ON CONFLICT (plan_id, member_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.contribution_plans SET status = 'active', generated_at = now() WHERE id = v_plan.id;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------
-- [6] Hàm điều chỉnh mức thu trực tiếp trên một khoản (Thủ quỹ / Trưởng nhà)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_adjust_contribution_due(p_contribution_id uuid, p_new_amount bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_c public.contributions%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền điều chỉnh mức thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_amount IS NULL OR p_new_amount < 0 OR p_new_amount > 50000000 THEN
    RAISE EXCEPTION 'Mức thu mới không hợp lệ.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do điều chỉnh (tối thiểu 3 ký tự).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_c FROM public.contributions WHERE id = p_contribution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy khoản phải thu.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_c.status = 'cancelled' THEN
    RAISE EXCEPTION 'Khoản phải thu đã bị hủy.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_new_amount < v_c.paid_vnd THEN
    RAISE EXCEPTION 'Mức thu mới (%) không được nhỏ hơn số tiền đã đóng (%).', p_new_amount, v_c.paid_vnd USING ERRCODE = 'check_violation';
  END IF;
  IF p_new_amount < v_c.discount_vnd THEN
    RAISE EXCEPTION 'Mức thu mới (%) không được nhỏ hơn số tiền đã miễn/giảm (%).', p_new_amount, v_c.discount_vnd USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.contributions
     SET amount_due_vnd = p_new_amount,
         note = CASE WHEN note IS NULL OR note = '' THEN format('[Điều chỉnh: %s]', v_reason)
                     ELSE note || format('; [Điều chỉnh: %s]', v_reason) END,
         updated_at = now()
   WHERE id = p_contribution_id;

  RETURN jsonb_build_object('id', p_contribution_id, 'amount_due_vnd', p_new_amount, 'note', v_reason);
END;
$$;

-- ---------------------------------------------------------------------
-- [7] Cập nhật trigger kiểm tra mức thu khớp kế hoạch (tương thích mức quỹ riêng & điều chỉnh)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_contribution_amount_from_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_plan public.contribution_plans%ROWTYPE;
  v_expected bigint;
BEGIN
  SELECT * INTO v_plan FROM public.contribution_plans cp WHERE cp.id = NEW.plan_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_plan.fee_type = 'periodic_dues' THEN
    v_expected := app.fn_member_dues_amount(NEW.member_id, v_plan.amount_vnd);
  ELSE
    v_expected := v_plan.amount_vnd;
  END IF;

  -- 1. Chặn chèn hoặc sửa mức thu về 0 đ (miễn nợ) nếu không có quyền finance.contribution.waive (Trưởng nhà)
  --    Bảo vệ quy tắc F-042 / BR-FIN-14: Thủ quỹ không được tự miễn nợ bằng cách đưa mức thu về 0 đ.
  IF NEW.amount_due_vnd = 0 AND app.current_user_id() IS NOT NULL AND NOT app.has_permission('finance.contribution.waive') THEN
    RAISE EXCEPTION 'BR-FIN-14: số phải thu (% đ) khác mức của kế hoạch (% đ) — dùng miễn/giảm có lý do (Trưởng nhà).', NEW.amount_due_vnd, v_expected
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Nếu mức thu khác mức định mức / kế hoạch, người sửa phải có quyền quản lý kế hoạch thu hoặc miễn/giảm
  IF NEW.amount_due_vnd IS DISTINCT FROM v_expected AND app.current_user_id() IS NOT NULL
     AND NOT app.has_any_permission(ARRAY['finance.contribution.waive', 'finance.contribution.plan.manage']) THEN
    RAISE EXCEPTION 'BR-FIN-14: số phải thu (% đ) khác mức của kế hoạch (% đ) — dùng miễn/giảm có lý do (Trưởng nhà).', NEW.amount_due_vnd, v_expected
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contributions__amount_from_plan ON public.contributions;
CREATE TRIGGER trg_contributions__amount_from_plan
  BEFORE INSERT OR UPDATE OF amount_due_vnd, plan_id ON public.contributions
  FOR EACH ROW EXECUTE FUNCTION app.tg_contribution_amount_from_plan();

-- ---------------------------------------------------------------------
-- [8] Chủ sở hữu và phân quyền (INV-08: SECURITY DEFINER thuộc luuxa_definer; INV-14: không EXECUTE cho PUBLIC)
-- ---------------------------------------------------------------------
DO $mig$ BEGIN ALTER FUNCTION app.tg_protect_member_custom_dues() OWNER TO luuxa_definer; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;
DO $mig$ BEGIN ALTER FUNCTION app.fn_member_student_status(uuid) OWNER TO luuxa_definer; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;
DO $mig$ BEGIN ALTER FUNCTION app.fn_member_dues_amount(uuid, bigint) OWNER TO luuxa_definer; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;
DO $mig$ BEGIN ALTER FUNCTION app.fn_generate_contributions(uuid) OWNER TO luuxa_definer; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;
DO $mig$ BEGIN ALTER FUNCTION app.fn_adjust_contribution_due(uuid, bigint, text) OWNER TO luuxa_definer; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;
DO $mig$ BEGIN ALTER FUNCTION app.tg_contribution_amount_from_plan() OWNER TO luuxa_definer; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;

REVOKE ALL ON FUNCTION app.tg_protect_member_custom_dues() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_member_student_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_member_dues_amount(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_generate_contributions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_adjust_contribution_due(uuid, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.tg_contribution_amount_from_plan() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.tg_protect_member_custom_dues() TO luuxa_app, luuxa_api, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_member_student_status(uuid) TO luuxa_app, luuxa_api, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_member_dues_amount(uuid, bigint) TO luuxa_app, luuxa_api, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_generate_contributions(uuid) TO luuxa_app, luuxa_api, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_adjust_contribution_due(uuid, bigint, text) TO luuxa_app, luuxa_api, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.tg_contribution_amount_from_plan() TO luuxa_app, luuxa_api, luuxa_worker, luuxa_definer, luuxa_owner;

COMMIT;
