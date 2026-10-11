-- =====================================================================
-- 1037 — ADMIN SỬA PHIẾU CHI SAI + XÓA PHIẾU CHI ĐÃ HỦY + QUẢN LÝ ĐƠN XIN PHÉP. Chạy SAU 1036. Idempotent.
--   [1] Quyền mới (trigger 1027 tự cấp cho Admin):
--         finance.expense.correct — sửa "người ứng tiền" và "hình thức chi" của phiếu chi đã lập/đã chi (sổ cái KHÔNG bị sửa)
--         leave.manage            — xem toàn bộ + sửa mọi đơn xin phép
--   [2] app.fn_admin_fix_expense(): chỉnh người ứng tiền / hình thức chi kèm lý do (≥ 5 ký tự), ghi nhật ký kiểm toán (giá trị cũ → mới).
--       Bút toán sổ quỹ là bất biến nên KHÔNG đổi; chỉ phiếu chi (và các màn hình đọc từ phiếu) hiện giá trị đã sửa. Phiếu đã hủy không sửa.
--   [3] app.fn_admin_delete(): thêm entity 'expense' — xóa vĩnh viễn phiếu chi ĐÃ HỦY (chưa từng ghi sổ quỹ). Chữ ký duyệt + lịch sử trạng thái
--       của đúng phiếu đó được xóa theo (bảng bất biến nên cần cờ app.purge_expense do chính hàm này đặt trong giao dịch).
--       Phiếu đã chi / đã đảo (có bút toán) KHÔNG xóa được.
--   [4] Thông báo event.leave_notice: báo cả nhà trong ứng dụng khi người xin phép tích "gửi thông báo".
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Quyền + loại thông báo
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, module, description, is_sensitive) VALUES
  ('finance.expense.correct', 'finance', 'Sửa người ứng tiền / hình thức chi của phiếu chi đã lập hoặc đã chi (chỉ Admin; sổ quỹ không bị sửa)', true),
  ('leave.manage',            'event',   'Xem toàn bộ và sửa mọi đơn xin phép (chỉ Admin)', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r CROSS JOIN (VALUES ('finance.expense.correct'), ('leave.manage')) AS p(code) WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('event.leave_notice', 'event', 'Có anh em xin phép vắng / về muộn', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- [2] Trigger quy tắc phiếu chi: cho phép đổi người ứng tiền khi Admin sửa (cờ app.expense_admin_fix = mã phiếu + có quyền correct)
--     Thân hàm = bản gốc db/migrations/36, thêm đúng một điều kiện ở nhánh "khóa nội dung sau khi nộp".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_expense_voucher_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_allowed     boolean;
  v_dual_min    bigint;
  v_receipt_min bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Phiếu chi mới phải ở trạng thái draft; dùng app.fn_submit_expense() để nộp duyệt.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.voucher_no := 'PC-' || to_char(app.local_today(), 'YYYY-MM') || '-' || lpad(nextval('expense_voucher_seq')::text, 4, '0');
    RETURN NEW;
  END IF;

  IF NEW.voucher_no IS DISTINCT FROM OLD.voucher_no OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'Không được đổi số phiếu hoặc người tạo.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = OLD.status THEN
    IF OLD.status <> 'draft'
       AND NOT (current_setting('app.expense_admin_fix', true) IS NOT DISTINCT FROM OLD.id::text AND app.has_permission('finance.expense.correct'))
       AND (
         NEW.title IS DISTINCT FROM OLD.title OR NEW.amount_vnd IS DISTINCT FROM OLD.amount_vnd
      OR NEW.category_id IS DISTINCT FROM OLD.category_id OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
      OR NEW.fund_id IS DISTINCT FROM OLD.fund_id OR NEW.paid_by_member_id IS DISTINCT FROM OLD.paid_by_member_id
      OR NEW.payee_name IS DISTINCT FROM OLD.payee_name OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no) THEN
      RAISE EXCEPTION 'BR-FIN-05: phiếu chi đã nộp (%) không được sửa nội dung; trả về nháp hoặc đảo bút toán.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'draft'            THEN NEW.status IN ('pending_approval', 'cancelled')
    WHEN 'pending_approval' THEN NEW.status IN ('approved', 'rejected', 'cancelled', 'draft')
    WHEN 'approved'         THEN NEW.status IN ('paid', 'cancelled')
    WHEN 'rejected'         THEN NEW.status IN ('draft', 'cancelled')
    WHEN 'paid'             THEN NEW.status = 'reversed'
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'BR-FIN-04: chuyển trạng thái phiếu chi không hợp lệ: % → %.', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'pending_approval' THEN
    v_dual_min    := app.setting_int('finance.expense.dual_approval_min_vnd');
    v_receipt_min := app.setting_int('finance.expense.receipt_required_min_vnd');
    IF NEW.amount_vnd >= v_receipt_min AND NEW.no_receipt_reason IS NULL AND NOT EXISTS (
         SELECT 1 FROM public.media_attachments ma
          WHERE ma.entity_type = 'expense_voucher' AND ma.entity_id = NEW.id AND ma.purpose = 'receipt') THEN
      RAISE EXCEPTION 'BR-FIN-03: phiếu từ % đ phải đính kèm ảnh hóa đơn hoặc ghi rõ lý do không có hóa đơn.', v_receipt_min
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.required_approvals := CASE WHEN NEW.amount_vnd >= v_dual_min THEN 2 ELSE 1 END;
    NEW.approval_round := OLD.approval_round + 1;
    NEW.submitted_at := now();
    NEW.approved_at := NULL; NEW.rejected_at := NULL; NEW.rejection_reason := NULL;
  ELSIF NEW.status = 'approved' THEN
    NEW.approved_at := now();
  ELSIF NEW.status = 'rejected' THEN
    NEW.rejected_at := now();
  ELSIF NEW.status = 'cancelled' THEN
    NEW.cancelled_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL; NEW.approved_at := NULL; NEW.rejected_at := NULL;
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_expense_voucher_rules() OWNER TO luuxa_definer;

-- ---------------------------------------------------------------------
-- [2b] Admin sửa người ứng tiền / hình thức chi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_admin_fix_expense(
  p_voucher_id       uuid,
  p_reason           text,
  p_change_paid_by   boolean          DEFAULT false,
  p_paid_by_member   uuid             DEFAULT NULL,
  p_payment_method   payment_method_t DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v        public.expense_vouchers%ROWTYPE;
  v_uid    uuid := app.current_user_id();
  v_user   uuid;
  v_name   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_permission('finance.expense.correct') THEN
    RAISE EXCEPTION 'Chỉ Admin được sửa người ứng tiền / hình thức chi của phiếu chi (quyền finance.expense.correct).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Phải nêu lý do sửa (≥ 5 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT p_change_paid_by AND p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Không có gì để sửa.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu chi không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status = 'cancelled' THEN
    RAISE EXCEPTION 'Phiếu đã hủy — không sửa được.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_payment_method IS NOT NULL AND v.status NOT IN ('paid', 'reversed') THEN
    RAISE EXCEPTION 'Phiếu chưa ghi chi nên chưa có hình thức chi (Thủ quỹ chọn khi ghi nhận đã chi).' USING ERRCODE = 'check_violation';
  END IF;

  IF p_change_paid_by AND p_paid_by_member IS NOT NULL THEN
    SELECT m.user_id, COALESCE(m.display_name, m.full_name) INTO v_user, v_name
      FROM public.members m WHERE m.id = p_paid_by_member AND m.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy thành viên được chọn làm người ứng tiền.' USING ERRCODE = 'check_violation';
    END IF;
    -- BR-FIN-01: người ứng tiền không được là người đã ký duyệt phiếu ở vòng duyệt hiện tại (phiếu chưa chi)
    IF v_user IS NOT NULL AND v.status IN ('pending_approval', 'approved') AND EXISTS (
         SELECT 1 FROM public.expense_approvals ea
          WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.decision = 'approved' AND ea.approver_user_id = v_user) THEN
      RAISE EXCEPTION 'BR-FIN-01: % đã ký duyệt phiếu này nên không thể làm người ứng tiền.', v_name USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.expense_admin_fix', p_voucher_id::text, true);
  UPDATE public.expense_vouchers
     SET paid_by_member_id = CASE WHEN p_change_paid_by THEN p_paid_by_member ELSE paid_by_member_id END,
         payment_method    = COALESCE(p_payment_method, payment_method)
   WHERE id = p_voucher_id;
  PERFORM set_config('app.expense_admin_fix', '', true);

  PERFORM app.write_audit('OTHER', 'expense_vouchers', p_voucher_id::text, 'Admin sửa phiếu chi: ' || btrim(p_reason),
    jsonb_build_object('paid_by_member_id', v.paid_by_member_id, 'payment_method', v.payment_method),
    jsonb_build_object('paid_by_member_id', CASE WHEN p_change_paid_by THEN p_paid_by_member ELSE v.paid_by_member_id END,
                       'payment_method', COALESCE(p_payment_method, v.payment_method)));
END
$$;
ALTER FUNCTION app.fn_admin_fix_expense(uuid, text, boolean, uuid, payment_method_t) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_admin_fix_expense(uuid, text, boolean, uuid, payment_method_t) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_admin_fix_expense(uuid, text, boolean, uuid, payment_method_t) TO luuxa_app, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_admin_fix_expense(uuid, text, boolean, uuid, payment_method_t) IS
  'Admin (finance.expense.correct) sửa người ứng tiền và/hoặc hình thức chi của phiếu chi chưa hủy, kèm lý do; ghi audit giá trị cũ → mới. Không đụng sổ cái bất biến (bút toán giữ nguyên người đối ứng cũ).';

-- ---------------------------------------------------------------------
-- [3] Xóa phiếu chi ĐÃ HỦY: chữ ký duyệt + lịch sử trạng thái của đúng phiếu đó được phép xóa khi cờ app.purge_expense khớp
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_expense_children_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.purge_expense', true) = OLD.voucher_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Bảng % là bất biến (append-only): không được % bản ghi. Dùng bút toán/bản ghi đảo thay thế.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Tạo bản ghi điều chỉnh/đảo (reversal) thay vì sửa hoặc xóa.';
END
$$;
ALTER FUNCTION app.tg_expense_children_guard() OWNER TO luuxa_owner;

-- luuxa_definer bị thu DELETE trên hai bảng này (49_b); cấp lại để fn_admin_delete xóa được (trigger ở trên vẫn chặn mọi trường hợp khác)
DO $g$ BEGIN
  GRANT DELETE ON public.expense_approvals, public.expense_status_history TO luuxa_definer;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $g$;

DROP TRIGGER IF EXISTS trg_expense_status_history__immutable ON public.expense_status_history;
CREATE TRIGGER trg_expense_status_history__immutable
  BEFORE UPDATE OR DELETE ON public.expense_status_history
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_children_guard();
DROP TRIGGER IF EXISTS trg_expense_approvals__immutable ON public.expense_approvals;
CREATE TRIGGER trg_expense_approvals__immutable
  BEFORE UPDATE OR DELETE ON public.expense_approvals
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_children_guard();

-- Bản fn_admin_delete của 1028 + entity 'expense' (giữ nguyên các entity cũ)
CREATE OR REPLACE FUNCTION app.fn_admin_delete(p_entity text, p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_n      integer := 0;
  v_status text;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_permission('data.purge') THEN
    RAISE EXCEPTION 'Chỉ Admin được xóa vĩnh viễn dữ liệu (quyền data.purge).' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_entity = 'leave' THEN
    DELETE FROM public.leave_requests WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    DELETE FROM public.media_attachments WHERE entity_type = 'leave_request' AND entity_id = p_id;

  ELSIF p_entity = 'issue' THEN
    PERFORM set_config('app.purge_issue', p_id::text, true);
    DELETE FROM public.repair_costs WHERE issue_id = p_id;
    DELETE FROM public.media_attachments WHERE entity_type IN ('maintenance_issue', 'repair_cost') AND entity_id = p_id;
    DELETE FROM public.maintenance_issues WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.purge_issue', '', true);

  ELSIF p_entity = 'prayer' THEN
    DELETE FROM public.prayer_intentions WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_entity = 'inquiry' THEN
    DELETE FROM public.admission_inquiries WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_entity = 'application' THEN
    SELECT status::text INTO v_status FROM public.member_applications WHERE id = p_id;
    IF v_status IN ('submitted', 'under_review') THEN
      RAISE EXCEPTION 'Đơn đang chờ duyệt — hãy duyệt hoặc từ chối trước rồi mới xóa.' USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.member_applications WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    DELETE FROM public.media_attachments WHERE entity_type = 'member_application' AND entity_id = p_id;

  ELSIF p_entity = 'expense' THEN
    SELECT status::text INTO v_status FROM public.expense_vouchers WHERE id = p_id;
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy phiếu chi (có thể đã được xóa).' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status <> 'cancelled' THEN
      RAISE EXCEPTION 'Chỉ xóa được phiếu chi ĐÃ HỦY (hiện: %). Phiếu đã chi phải đảo bút toán, không xóa.', v_status USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.purge_expense', p_id::text, true);
    DELETE FROM public.expense_approvals WHERE voucher_id = p_id;
    DELETE FROM public.expense_status_history WHERE voucher_id = p_id;
    DELETE FROM public.media_attachments WHERE entity_type = 'expense_voucher' AND entity_id = p_id;
    DELETE FROM public.expense_vouchers WHERE id = p_id AND status = 'cancelled';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.purge_expense', '', true);

  ELSE
    RAISE EXCEPTION 'Loại dữ liệu "%" không hỗ trợ xóa.', p_entity USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy bản ghi (có thể đã được xóa).' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_n;
END
$$;
ALTER FUNCTION app.fn_admin_delete(text, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_admin_delete(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_admin_delete(text, uuid) TO luuxa_app, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_admin_delete(text, uuid) IS
  'Admin (quyền data.purge) xóa vĩnh viễn một bản ghi thuộc danh sách cho phép: leave, issue, prayer, inquiry, application, expense (chỉ phiếu chi đã hủy). Không xóa được sổ quỹ / phiếu đã chi / nhật ký.';

COMMIT;
