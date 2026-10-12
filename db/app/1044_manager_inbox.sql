-- =====================================================================
-- 1044 — HỘP "VIỆC CẦN XỬ LÝ" CỦA NGƯỜI QUẢN LÝ + THÔNG BÁO CÒN THIẾU. Chạy SAU 1043. Idempotent.
--   • app.fn_expense_can_sign(voucher): người đang đăng nhập CÒN KÝ ĐƯỢC phiếu chi này ở vòng duyệt hiện tại không — cùng điều kiện với trigger
--     app.tg_expense_approval_rules (db/app/1027): phiếu đang chờ duyệt; không phải người lập / người ứng tiền (BR-FIN-01); chưa ký vòng này;
--     có quyền duyệt chi; phiếu 1 chữ ký: Trưởng nhà, hoặc Thủ quỹ với khoản ≤ hạn mức tự duyệt (BR-FIN-17) / chế độ ký chéo khi Trưởng nhà
--     là người lập hoặc người ứng tiền; phiếu 2 chữ ký: còn một vai trò của mình chưa được dùng trong vòng này (BR-FIN-02). Admin ký như
--     Trưởng nhà / Thủ quỹ. Hộp việc chỉ đếm phiếu mà người xem còn ký được (phiếu mình lập không tính vào việc của mình).
--     GIỮ ĐỒNG BỘ với tg_expense_approval_rules khi luật ký duyệt thay đổi.
--   • Loại thông báo: system.manager_digest (tin tóm tắt buổi sáng cho người quản lý có việc QUÁ HẠN — bước cron manager-digest),
--     facility.issue_assigned (người được giao xử lý một sự cố — liên kết mở thẳng sự cố).
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.manager_digest',   'system',   'Tóm tắt việc quá hạn cần xử lý (người quản lý)', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false),
  ('facility.issue_assigned', 'facility', 'Bạn được giao xử lý một sự cố',                  ARRAY['in_app', 'web_push']::notification_channel_t[], 'high',   false, false)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION app.fn_expense_can_sign(p_voucher_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid       uuid := app.current_user_id();
  v           public.expense_vouchers%ROWTYPE;
  v_payee_uid uuid;
  v_roles     text[];
  v_used      text[];
BEGIN
  IF v_uid IS NULL OR p_voucher_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id;
  IF NOT FOUND OR v.status <> 'pending_approval' OR v.requested_by = v_uid THEN
    RETURN false;
  END IF;
  IF v.paid_by_member_id IS NOT NULL THEN
    SELECT m.user_id INTO v_payee_uid FROM public.members m WHERE m.id = v.paid_by_member_id;
    IF v_payee_uid IS NOT NULL AND v_payee_uid = v_uid THEN
      RETURN false;
    END IF;
  END IF;
  -- Mỗi người ký (duyệt hoặc từ chối) một lần trong một vòng (ux_expense_approvals__voucher_round_approver)
  IF EXISTS (SELECT 1 FROM public.expense_approvals ea WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.approver_user_id = v_uid) THEN
    RETURN false;
  END IF;

  v_roles := app.user_roles_of(v_uid);
  IF 'admin' = ANY (v_roles) THEN v_roles := v_roles || ARRAY['house_head', 'treasurer']; END IF;
  IF NOT app.roles_have_permission(v_roles, 'finance.expense.approve') THEN
    RETURN false;
  END IF;

  IF v.required_approvals = 1 THEN
    IF 'house_head' = ANY (v_roles) THEN
      RETURN true;
    END IF;
    IF 'treasurer' = ANY (v_roles) THEN
      IF v.amount_vnd <= app.setting_int('finance.expense.treasurer_solo_approve_max_vnd') THEN
        RETURN true;
      END IF;
      IF COALESCE(app.setting_bool('finance.expense.cross_signer_mode'), false) THEN
        RETURN 'house_head' = ANY (app.user_roles_of(v.requested_by))
            OR (v_payee_uid IS NOT NULL AND 'house_head' = ANY (app.user_roles_of(v_payee_uid)));
      END IF;
    END IF;
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(ea.approver_role), ARRAY[]::text[]) INTO v_used
    FROM public.expense_approvals ea
   WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.decision = 'approved';
  RETURN EXISTS (SELECT 1 FROM unnest(ARRAY['house_head', 'treasurer', 'vice_head']) AS r WHERE r = ANY (v_roles) AND NOT (r = ANY (v_used)));
END
$$;
ALTER FUNCTION app.fn_expense_can_sign(uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_expense_can_sign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_expense_can_sign(uuid) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_expense_can_sign(uuid) IS
  'Người đang đăng nhập còn ký duyệt được phiếu chi này ở vòng hiện tại không (cùng điều kiện với trigger tg_expense_approval_rules — giữ đồng bộ). Dùng cho hộp "Việc cần xử lý" và nút Duyệt.';

COMMIT;
