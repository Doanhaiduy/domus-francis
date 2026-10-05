-- =====================================================================
-- 998 — DUYỆT CHI KHI CHỈ CÒN HAI NGƯỜI DUYỆT (Trưởng nhà + Thủ quỹ). Chạy SAU 01–52 + 70–75 + 90…997. Idempotent.
-- Bối cảnh: thiết kế gốc dùng Phó nhà làm chữ ký thay khi Trưởng nhà/Thủ quỹ là người lập hoặc người ứng tiền (BR-FIN-01:
-- người liên quan không tự duyệt). Nhà bỏ vai trò Phó nhà ⇒ các phiếu đó không bao giờ đủ chữ ký (bế tắc).
-- Cấu hình finance.expense.cross_signer_mode (MẶC ĐỊNH TẮT ⇒ hành vi giữ nguyên như thiết kế + smoke test):
--   bật ⇒ (1) phiếu 2 chữ ký mà Trưởng nhà HOẶC Thủ quỹ là người lập/người ứng ⇒ chỉ cần 1 chữ ký của người còn lại;
--         (2) phiếu 1 chữ ký vượt hạn mức tự duyệt của Thủ quỹ mà Trưởng nhà là người lập/người ứng ⇒ Thủ quỹ ký thay
--             (thay vì nâng lên 2 chữ ký Thủ quỹ + Phó nhà như bản vá N-01).
--   Người liên quan vẫn KHÔNG BAO GIỜ tự duyệt (BR-FIN-01 giữ nguyên); mọi chữ ký vẫn ghi nhật ký kiểm toán.
-- Bật/tắt: db/data/2026-10-05-03_finance_cross_signer.sql bật cho nhà không có Phó nhà; Trưởng nhà đổi được trong Cài đặt.
-- =====================================================================
BEGIN;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES ('finance.expense.cross_signer_mode', 'false'::jsonb, 'boolean',
        'Nhà chỉ có Trưởng nhà + Thủ quỹ duyệt chi: khi một trong hai là người lập/người ứng tiền thì một chữ ký của người còn lại là đủ.',
        NULL, NULL, true, 'finance.settings.write', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- (1)(2) Tính lại số chữ ký khi nộp phiếu — thay bản của kiem-dinh/sql/75 (N-01); nhánh "tắt" giống hệt bản đó.
CREATE OR REPLACE FUNCTION app.tg_expense_voucher_head_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE
  v_payee     uuid;
  v_head_inv  boolean;
  v_treas_inv boolean;
BEGIN
  IF NEW.status = 'pending_approval' AND OLD.status IS DISTINCT FROM 'pending_approval' THEN
    SELECT m.user_id INTO v_payee FROM public.members m WHERE m.id = NEW.paid_by_member_id;
    v_head_inv := 'house_head' = ANY (app.user_roles_of(NEW.requested_by))
                  OR (v_payee IS NOT NULL AND 'house_head' = ANY (app.user_roles_of(v_payee)));
    IF COALESCE(app.setting_bool('finance.expense.cross_signer_mode'), false) THEN
      v_treas_inv := 'treasurer' = ANY (app.user_roles_of(NEW.requested_by))
                     OR (v_payee IS NOT NULL AND 'treasurer' = ANY (app.user_roles_of(v_payee)));
      IF NEW.required_approvals = 2 AND (v_head_inv OR v_treas_inv) THEN
        NEW.required_approvals := 1;   -- người còn lại (không liên quan) ký một chữ ký
      END IF;
    ELSIF NEW.required_approvals = 1 AND NEW.amount_vnd > app.setting_int('finance.expense.treasurer_solo_approve_max_vnd') AND v_head_inv THEN
      NEW.required_approvals := 2;     -- BR-FIN-35 (thiết kế gốc): Thủ quỹ + Phó nhà thay chữ ký Trưởng nhà
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_expense_voucher_head_conflict() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_expense_voucher_head_conflict() FROM PUBLIC;

-- (2) Ai được ký phiếu một chữ ký — thay bản của db/migrations/36 (chỉ thêm nhánh cross_signer_mode).
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
  IF NOT app.roles_have_permission(v_roles, 'finance.expense.approve') THEN
    RAISE EXCEPTION 'Người dùng không có quyền duyệt chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(array_agg(ea.approver_role), ARRAY[]::text[]) INTO v_used
    FROM public.expense_approvals ea
   WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.decision = 'approved';

  IF NEW.decision = 'rejected' THEN
    -- Từ chối luôn an toàn: bất kỳ ai có quyền duyệt chi (Trưởng nhà, Thủ quỹ, Phó nhà) đều được từ chối phiếu
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

ALTER FUNCTION app.tg_expense_approval_rules() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_expense_approval_rules() FROM PUBLIC;

COMMIT;
