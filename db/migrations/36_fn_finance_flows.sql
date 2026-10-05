-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (5/8): TÀI CHÍNH — PHIẾU CHI, CHỮ KÝ, THU QUỸ
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.40  Phiếu chi: sinh số phiếu, máy trạng thái, khóa trường sau khi nộp, ngưỡng 2 chữ ký, bắt buộc hóa đơn
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
    IF OLD.status <> 'draft' AND (
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
COMMENT ON FUNCTION app.tg_expense_voucher_rules() IS
  'BEFORE INSERT/UPDATE expense_vouchers: sinh voucher_no; máy trạng thái draft→pending_approval→approved→paid→reversed (+rejected/cancelled); khóa nội dung sau khi nộp; đóng băng required_approvals theo ngưỡng finance.expense.dual_approval_min_vnd; bắt buộc hóa đơn từ finance.expense.receipt_required_min_vnd.';

CREATE TRIGGER trg_expense_vouchers__rules
  BEFORE INSERT OR UPDATE ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_voucher_rules();

-- BR-FIN-15: RLS chỉ lọc HÀNG; người tạo phiếu sửa được dòng của mình nên có thể tự hạ required_approvals 2→1 rồi đặt status = 'approved'
-- (mass-assignment). Trigger bảo vệ cột (chạy TRƯỚC trg_..__rules theo thứ tự tên) cấm phiên người dùng ghi các cột trạng thái, chữ ký và
-- thanh toán; chúng chỉ đổi qua hàm SECURITY DEFINER fn_submit_expense / fn_return_expense_to_draft / fn_cancel_expense / fn_decide_expense /
-- fn_pay_expense / fn_reverse_expense và trigger chữ ký (current_user = luuxa_definer).
CREATE TRIGGER trg_expense_vouchers__guard
  BEFORE INSERT OR UPDATE ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-FIN-15', '', '',
    'voucher_no,status,required_approvals,approval_round,submitted_at,approved_at,rejected_at,rejection_reason,paid_at,paid_recorded_by,payment_method,ledger_entry_id,reversal_entry_id,cancelled_at,cancel_reason');

CREATE OR REPLACE FUNCTION app.tg_expense_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.expense_status_history (voucher_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, COALESCE(app.current_user_id(), NEW.requested_by));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.expense_status_history (voucher_id, from_status, to_status, changed_by, reason)
    VALUES (NEW.id, OLD.status, NEW.status, app.current_user_id(), NULLIF(current_setting('app.status_reason', true), ''));
    PERFORM set_config('app.status_reason', '', true);
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_expense_status_history() IS 'AFTER ROW: ghi expense_status_history mỗi lần đổi trạng thái (SECURITY DEFINER để người dùng không thể giả mạo lịch sử). Lý do lấy từ GUC app.status_reason.';

CREATE TRIGGER trg_expense_vouchers__history
  AFTER INSERT OR UPDATE OF status ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_status_history();

CREATE TRIGGER trg_expense_status_history__immutable
  BEFORE UPDATE OR DELETE ON expense_status_history
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

CREATE TRIGGER trg_expense_approvals__immutable
  BEFORE UPDATE OR DELETE ON expense_approvals
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

-- ---------------------------------------------------------------------
-- 4.5.41  Chữ ký duyệt chi: chống tự duyệt, kiểm tra quyền/vai trò, ngưỡng 2 chữ ký, tự chuyển trạng thái
-- ---------------------------------------------------------------------
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
                   WHEN 'treasurer'  = ANY (v_roles) AND v.amount_vnd <= app.setting_int('finance.expense.treasurer_solo_approve_max_vnd') THEN 'treasurer' END;
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
COMMENT ON FUNCTION app.tg_expense_approval_rules() IS
  'BEFORE INSERT expense_approvals (BR-FIN-01, BR-FIN-02, BR-FIN-17): người duyệt ≠ người tạo ≠ người ứng tiền; phải có quyền finance.expense.approve; chữ ký đơn do house_head, hoặc treasurer với phiếu nhỏ đến finance.expense.treasurer_solo_approve_max_vnd; chữ ký kép = hai vai trò khác nhau, trong đó có house_head (vice_head chỉ là chữ ký thứ hai); từ chối thì ai có quyền duyệt cũng được.';

CREATE TRIGGER trg_expense_approvals__rules
  BEFORE INSERT ON expense_approvals
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_approval_rules();

CREATE OR REPLACE FUNCTION app.tg_expense_approval_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v             public.expense_vouchers%ROWTYPE;
  v_n           integer;
  v_head        boolean;
  v_payee_uid   uuid;
  v_head_needed boolean;
BEGIN
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = NEW.voucher_id FOR UPDATE;
  IF NEW.decision = 'rejected' THEN
    PERFORM set_config('app.status_reason', NEW.comment, true);
    UPDATE public.expense_vouchers SET status = 'rejected', rejection_reason = NEW.comment WHERE id = v.id;
  ELSE
    SELECT COUNT(*), COALESCE(bool_or(ea.approver_role = 'house_head'), false)
      INTO v_n, v_head
      FROM public.expense_approvals ea
     WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.decision = 'approved';
    -- Phiếu lớn cần chữ ký Trưởng nhà; NGOẠI LỆ chống bế tắc: nếu chính Trưởng nhà là người tạo hoặc người ứng tiền thì (theo BR-FIN-01) họ
    -- không được ký phiếu của mình, nên yêu cầu "có Trưởng nhà" được thay bằng hai chữ ký của hai vai trò khác nhau còn lại (Thủ quỹ + Phó nhà).
    SELECT m.user_id INTO v_payee_uid FROM public.members m WHERE m.id = v.paid_by_member_id;
    v_head_needed := NOT ('house_head' = ANY (app.user_roles_of(v.requested_by))
                          OR (v_payee_uid IS NOT NULL AND 'house_head' = ANY (app.user_roles_of(v_payee_uid))));
    IF (v.required_approvals = 1 AND v_n >= 1) OR (v.required_approvals = 2 AND v_n >= 2 AND (v_head OR NOT v_head_needed)) THEN
      UPDATE public.expense_vouchers SET status = 'approved' WHERE id = v.id;
    END IF;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_expense_approval_apply() IS 'AFTER INSERT expense_approvals: đủ chữ ký ⇒ phiếu approved; có người từ chối ⇒ rejected (kèm lý do). Phiếu hai chữ ký cần có Trưởng nhà, trừ khi Trưởng nhà là người tạo/người ứng tiền (khi đó cần Thủ quỹ + Phó nhà) để tránh bế tắc mà vẫn giữ BR-FIN-01.';

CREATE TRIGGER trg_expense_approvals__apply
  AFTER INSERT ON expense_approvals
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_approval_apply();

-- ---------------------------------------------------------------------
-- 4.5.42  Luồng nghiệp vụ phiếu chi (API gọi các hàm này; mỗi hàm một transaction)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_submit_expense(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid uuid := app.current_user_id();
  v     public.expense_vouchers%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu chi không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_uid IS NULL OR v.requested_by <> v_uid THEN
    RAISE EXCEPTION 'Phiếu chi không tồn tại hoặc bạn không phải người tạo phiếu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.expense_vouchers SET status = 'pending_approval' WHERE id = p_voucher_id;
END
$$;
COMMENT ON FUNCTION app.fn_submit_expense(uuid) IS 'Nộp phiếu nháp (hoặc phiếu bị từ chối đã trả về nháp) để duyệt; trigger tính required_approvals và kiểm tra hóa đơn.';

CREATE OR REPLACE FUNCTION app.fn_return_expense_to_draft(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid uuid := app.current_user_id();
  v     public.expense_vouchers%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL OR v.requested_by <> v_uid THEN
    RAISE EXCEPTION 'Phiếu chi không tồn tại hoặc bạn không phải người tạo phiếu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.status NOT IN ('rejected', 'pending_approval') THEN
    RAISE EXCEPTION 'BR-FIN-04: chỉ phiếu đang chờ duyệt hoặc bị từ chối mới trả về nháp được (hiện: %).', v.status USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.status_reason', CASE WHEN v.status = 'rejected' THEN 'Người tạo chỉnh sửa sau khi bị từ chối' ELSE 'Người tạo rút phiếu về nháp để sửa' END, true);
  UPDATE public.expense_vouchers SET status = 'draft' WHERE id = p_voucher_id;
END
$$;
COMMENT ON FUNCTION app.fn_return_expense_to_draft(uuid) IS 'Người tạo trả phiếu (đang chờ duyệt hoặc bị từ chối) về nháp để sửa; các chữ ký của vòng cũ được giữ nguyên trong expense_approvals, lần nộp lại sang vòng duyệt mới.';

CREATE OR REPLACE FUNCTION app.fn_cancel_expense(p_voucher_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid uuid := app.current_user_id();
  v     public.expense_vouchers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Phải nêu lý do hủy (≥ 5 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu chi không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF NOT ((v.requested_by = v_uid AND v.status IN ('draft', 'rejected', 'pending_approval'))
          OR (app.has_permission('finance.expense.approve') AND v.status IN ('pending_approval', 'approved'))) THEN
    RAISE EXCEPTION 'Không có quyền hủy phiếu này ở trạng thái hiện tại (%).', v.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.status_reason', p_reason, true);
  UPDATE public.expense_vouchers SET status = 'cancelled', cancel_reason = p_reason WHERE id = p_voucher_id;
END
$$;
COMMENT ON FUNCTION app.fn_cancel_expense(uuid, text) IS 'Hủy phiếu CHƯA chi (không xóa): người tạo hủy được khi nháp/bị từ chối/chờ duyệt; người có quyền duyệt hủy được khi chờ duyệt/đã duyệt. Phiếu đã chi chỉ đảo bằng fn_reverse_expense. Bắt buộc lý do.';

CREATE OR REPLACE FUNCTION app.fn_decide_expense(p_voucher_id uuid, p_decision approval_decision_t, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid uuid := app.current_user_id();
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.expense.approve') THEN
    RAISE EXCEPTION 'Không có quyền duyệt chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.expense_approvals (voucher_id, round, approver_user_id, approver_role, decision, comment)
  VALUES (p_voucher_id, 0, v_uid, 'treasurer', p_decision, p_comment);
END
$$;
COMMENT ON FUNCTION app.fn_decide_expense(uuid, approval_decision_t, text) IS 'Duyệt/từ chối phiếu: chèn chữ ký; trigger điền vai trò + vòng duyệt, kiểm tra tự duyệt/ngưỡng và tự chuyển trạng thái.';

CREATE OR REPLACE FUNCTION app.fn_pay_expense(
  p_voucher_id uuid,
  p_method     payment_method_t,
  p_paid_on    date,
  p_reference  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v       public.expense_vouchers%ROWTYPE;
  v_entry uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.expense.pay') THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu chi không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status <> 'approved' THEN
    RAISE EXCEPTION 'Chỉ phiếu đã duyệt mới được ghi nhận chi (hiện: %).', v.status USING ERRCODE = 'check_violation';
  END IF;
  IF p_reference IS NOT NULL AND char_length(btrim(p_reference)) > 100 THEN
    RAISE EXCEPTION 'Mã tham chiếu giao dịch tối đa 100 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  v_entry := app.uuid_v7();
  -- D-05: mã giao dịch ngân hàng/ví được giữ vĩnh viễn trong mô tả bút toán (sổ cái bất biến) để đối soát sao kê
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id,
                                     counterparty_member_id, description, created_by)
  VALUES (v_entry, v.fund_id, p_paid_on, 'out', v.amount_vnd, 'expense', v.id, v.paid_by_member_id,
          left('Chi ' || v.voucher_no || ': ' || v.title
               || COALESCE(' [tham chiếu ' || NULLIF(btrim(p_reference), '') || ']', ''), 500), v_uid);
  UPDATE public.expense_vouchers
     SET status = 'paid', paid_at = now(), paid_recorded_by = v_uid, payment_method = p_method, ledger_entry_id = v_entry
   WHERE id = p_voucher_id;
  RETURN v_entry;
END
$$;
COMMENT ON FUNCTION app.fn_pay_expense(uuid, payment_method_t, date, text) IS 'Ghi nhận đã chi cho phiếu approved: sinh bút toán out ở sổ cái (kiểm tra kỳ mở, đủ số dư) và chuyển phiếu sang paid. Người ghi chi phải có quyền finance.expense.pay. p_reference (mã giao dịch ngân hàng/ví, ≤ 100 ký tự) được ghi vào mô tả bút toán dạng "[tham chiếu …]".';

-- D-04: người chỉ có finance.expense.create không đọc được bảng funds (RLS) nên cần danh sách rút gọn để chọn túi quỹ khi lập phiếu
CREATE OR REPLACE FUNCTION app.fn_fund_options()
RETURNS TABLE (id uuid, code text, name text, fund_type fund_type_t)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL AND NOT app.is_system_caller() THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app.current_user_id() IS NOT NULL AND NOT app.has_any_permission(ARRAY[
       'finance.expense.create', 'finance.expense.read_all', 'finance.expense.pay', 'finance.contribution.record',
       'finance.ledger.read', 'finance.fund.manage', 'finance.reconcile']) THEN
    RAISE EXCEPTION 'Không có quyền xem danh sách túi quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT f.id, f.code, f.name, f.fund_type FROM public.funds f WHERE f.deleted_at IS NULL AND f.is_active ORDER BY f.name;
END
$$;
COMMENT ON FUNCTION app.fn_fund_options() IS 'Danh sách rút gọn túi quỹ đang dùng (id, code, name, fund_type — KHÔNG có số dư, số tài khoản) cho form lập phiếu chi/ghi thu. SECURITY DEFINER vì funds__select chỉ cho finance.ledger.read/finance.fund.manage; quyền được kiểm tra trong thân hàm.';

-- D-19: dòng sao kê là DỮ LIỆU GỐC của ngân hàng — sau khi nhập chỉ đổi được trạng thái khớp (GRANT UPDATE theo cột ở 49_b);
--       trigger dưới đây ghi matched_at/matched_by, kiểm tra bút toán ghép cùng túi quỹ/chiều/số tiền và chặn xóa dòng đã khớp.
CREATE OR REPLACE FUNCTION app.tg_bank_statement_line_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_e public.ledger_entries%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.match_status = 'matched' THEN
      RAISE EXCEPTION 'BR-FIN-50: dòng sao kê đã khớp bút toán không được xóa — hãy bỏ khớp trước (mọi thay đổi được ghi audit).' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.match_status = 'matched' THEN
    SELECT * INTO v_e FROM public.ledger_entries le WHERE le.id = NEW.matched_ledger_entry_id;
    IF NOT FOUND OR v_e.fund_id <> NEW.fund_id OR v_e.direction <> NEW.direction OR v_e.amount_vnd <> NEW.amount_vnd THEN
      RAISE EXCEPTION 'BR-FIN-40: bút toán ghép phải cùng túi quỹ, cùng chiều và cùng số tiền với dòng sao kê.' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.match_status IS DISTINCT FROM 'matched' OR NEW.matched_ledger_entry_id IS DISTINCT FROM OLD.matched_ledger_entry_id THEN
      NEW.matched_at := now();
      NEW.matched_by := app.current_user_id();
    END IF;
  ELSE
    NEW.matched_ledger_entry_id := NULL;
    NEW.matched_at := NULL;
    NEW.matched_by := NULL;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_bank_statement_line_guard() IS 'BEFORE UPDATE/DELETE bank_statement_lines (BR-FIN-40/50): ghép chỉ với bút toán cùng quỹ + chiều + số tiền (lệch ngày do service/Thủ quỹ quyết định); matched_at/matched_by do trigger ghi; chuyển khỏi matched thì xóa liên kết; không xóa dòng đã khớp.';
CREATE TRIGGER trg_bank_statement_lines__guard
  BEFORE UPDATE OR DELETE ON bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION app.tg_bank_statement_line_guard();

CREATE OR REPLACE FUNCTION app.fn_reverse_expense(p_voucher_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v       public.expense_vouchers%ROWTYPE;
  v_entry uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.expense.reverse') THEN
    RAISE EXCEPTION 'Không có quyền đảo phiếu chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Phải nêu lý do đảo (≥ 5 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu chi không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status <> 'paid' THEN
    RAISE EXCEPTION 'Chỉ phiếu đã chi (paid) mới được đảo (hiện: %).', v.status USING ERRCODE = 'check_violation';
  END IF;
  v_entry := app.uuid_v7();
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id,
                                     reversal_of_id, counterparty_member_id, description, created_by)
  VALUES (v_entry, v.fund_id, app.local_today(), 'in', v.amount_vnd, 'reversal', v.id,
          v.ledger_entry_id, v.paid_by_member_id, 'Đảo phiếu chi ' || v.voucher_no || ': ' || p_reason, v_uid);
  PERFORM set_config('app.status_reason', p_reason, true);
  UPDATE public.expense_vouchers SET status = 'reversed', reversal_entry_id = v_entry WHERE id = p_voucher_id;
  RETURN v_entry;
END
$$;
COMMENT ON FUNCTION app.fn_reverse_expense(uuid, text) IS 'Đảo phiếu đã chi bằng bút toán in cùng số tiền (không xóa/sửa sổ cái); bút toán đảo ghi vào kỳ đang mở (BR-FIN-05/06).';

-- ---------------------------------------------------------------------
-- 4.5.43  Thu quỹ: trạng thái khoản phải thu tính từ số liệu; khóa kỳ; phân bổ; ghi nhận/hủy thanh toán
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_contribution_status(
  p_amount_due bigint, p_discount bigint, p_paid bigint, p_current contribution_status_t
)
RETURNS contribution_status_t
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_current = 'cancelled'                     THEN 'cancelled'::contribution_status_t
           WHEN p_amount_due - p_discount = 0               THEN 'waived'::contribution_status_t
           WHEN p_paid >= p_amount_due - p_discount         THEN 'paid'::contribution_status_t
           WHEN p_paid > 0                                  THEN 'partial'::contribution_status_t
           ELSE 'unpaid'::contribution_status_t
         END
$$;

CREATE OR REPLACE FUNCTION app.tg_contribution_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_month   date;
  v_status  period_status_t;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.amount_due_vnd IS DISTINCT FROM OLD.amount_due_vnd
                           OR NEW.discount_vnd IS DISTINCT FROM OLD.discount_vnd
                           OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
                           OR NEW.member_id IS DISTINCT FROM OLD.member_id) THEN
    SELECT cp.period_month INTO v_month FROM public.contribution_plans cp WHERE cp.id = OLD.plan_id;
    IF v_month IS NOT NULL THEN
      SELECT fp.status INTO v_status FROM public.financial_periods fp WHERE fp.period_month = v_month;
      IF v_status IS NOT NULL AND v_status <> 'open' THEN
        RAISE EXCEPTION 'BR-FIN-06: kỳ % đã chốt — không sửa số phải thu/miễn giảm của kỳ này.', to_char(v_month, 'MM/YYYY')
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END IF;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.discount_vnd > 0) OR (TG_OP = 'UPDATE' AND NEW.discount_vnd IS DISTINCT FROM OLD.discount_vnd) THEN
    IF app.current_user_id() IS NOT NULL AND NOT app.has_permission('finance.contribution.waive') THEN
      RAISE EXCEPTION 'BR-FIN-14: chỉ người có quyền miễn/giảm (finance.contribution.waive — Trưởng nhà) được đặt miễn/giảm khoản phải thu.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.discount_approved_by := COALESCE(app.current_user_id(), NEW.discount_approved_by);
  END IF;
  NEW.status := app.fn_contribution_status(NEW.amount_due_vnd, NEW.discount_vnd, NEW.paid_vnd, NEW.status);
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_contribution_before_write() IS 'BEFORE INSERT/UPDATE contributions: khóa sửa số phải thu/miễn giảm của kỳ đã chốt (BR-FIN-06); miễn/giảm chỉ do người có quyền finance.contribution.waive đặt và người duyệt được hệ thống ghi tự động (BR-FIN-14); luôn tính lại status từ (phải thu, miễn giảm, đã thu).';

CREATE TRIGGER trg_contributions__before_write
  BEFORE INSERT OR UPDATE ON contributions
  FOR EACH ROW EXECUTE FUNCTION app.tg_contribution_before_write();

CREATE OR REPLACE FUNCTION app.fn_rollup_contribution(p_contribution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_paid bigint;
BEGIN
  SELECT COALESCE(SUM(a.amount_vnd), 0)
    INTO v_paid
    FROM public.contribution_payment_allocations a
    JOIN public.contribution_payments p ON p.id = a.payment_id
   WHERE a.contribution_id = p_contribution_id AND p.voided_at IS NULL;
  UPDATE public.contributions SET paid_vnd = v_paid WHERE id = p_contribution_id AND paid_vnd IS DISTINCT FROM v_paid;
END
$$;

CREATE OR REPLACE FUNCTION app.tg_contribution_allocations_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM app.fn_rollup_contribution(NEW.contribution_id); END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN PERFORM app.fn_rollup_contribution(OLD.contribution_id); END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_contribution_allocations_rollup() IS 'AFTER ROW allocations: cập nhật contributions.paid_vnd (tổng phân bổ của các phiếu thu chưa hủy); status được tính lại ở trigger BEFORE của contributions.';

CREATE TRIGGER trg_contribution_allocations__rollup
  AFTER INSERT OR UPDATE OR DELETE ON contribution_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.tg_contribution_allocations_rollup();

CREATE OR REPLACE FUNCTION app.tg_contribution_payment_void_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cid uuid;
BEGIN
  IF NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    FOR v_cid IN SELECT a.contribution_id FROM public.contribution_payment_allocations a WHERE a.payment_id = NEW.id LOOP
      PERFORM app.fn_rollup_contribution(v_cid);
    END LOOP;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_contribution_payments__void_rollup
  AFTER UPDATE OF voided_at ON contribution_payments
  FOR EACH ROW EXECUTE FUNCTION app.tg_contribution_payment_void_rollup();

-- Tổng phân bổ phải đúng bằng số tiền phiếu thu (kiểm tra cuối transaction)
CREATE OR REPLACE FUNCTION app.tg_check_payment_allocations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sum bigint;
  v_amt bigint;
BEGIN
  SELECT COALESCE(SUM(a.amount_vnd), 0) INTO v_sum FROM public.contribution_payment_allocations a WHERE a.payment_id = NEW.id;
  SELECT p.amount_vnd INTO v_amt FROM public.contribution_payments p WHERE p.id = NEW.id;
  IF v_sum <> v_amt THEN
    RAISE EXCEPTION 'BR-FIN-12: tổng phân bổ (% đ) phải bằng số tiền phiếu thu (% đ).', v_sum, v_amt USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER trg_contribution_payments__alloc_sum
  AFTER INSERT ON contribution_payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.tg_check_payment_allocations();

CREATE TRIGGER trg_contribution_payments__immutable_core
  BEFORE DELETE ON contribution_payments
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

CREATE OR REPLACE FUNCTION app.fn_record_contribution_payment(
  p_member_id          uuid,
  p_fund_id            uuid,
  p_amount_vnd         bigint,
  p_method             payment_method_t,
  p_paid_on            date,
  p_reference_code     text,
  p_allocations        jsonb,
  p_client_request_id  uuid DEFAULT NULL,
  p_note               text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_id      uuid;
  v_entry   uuid := app.uuid_v7();
  v_alloc   jsonb;
  v_cid     uuid;
  v_amt     bigint;
  v_sum     bigint := 0;
  v_row     public.contributions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT cp.id INTO v_id FROM public.contribution_payments cp
     WHERE cp.received_by = v_uid AND cp.client_request_id = p_client_request_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Phải phân bổ phiếu thu cho ít nhất một khoản phải thu.' USING ERRCODE = 'check_violation';
  END IF;

  v_id := app.uuid_v7();
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id,
                                     counterparty_member_id, description, created_by)
  VALUES (v_entry, p_fund_id, p_paid_on, 'in', p_amount_vnd, 'contribution', v_id, p_member_id,
          'Thu quỹ' || COALESCE(': ' || p_note, ''), v_uid);
  INSERT INTO public.contribution_payments (id, member_id, fund_id, amount_vnd, method, paid_on, reference_code,
                                            received_by, ledger_entry_id, note, client_request_id)
  VALUES (v_id, p_member_id, p_fund_id, p_amount_vnd, p_method, p_paid_on, p_reference_code,
          v_uid, v_entry, p_note, p_client_request_id);

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_cid := (v_alloc ->> 'contribution_id')::uuid;
    v_amt := (v_alloc ->> 'amount_vnd')::bigint;
    SELECT * INTO v_row FROM public.contributions c WHERE c.id = v_cid FOR UPDATE;
    IF NOT FOUND OR v_row.member_id <> p_member_id THEN
      RAISE EXCEPTION 'Khoản phải thu % không tồn tại hoặc không thuộc thành viên này.', v_cid USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_row.status IN ('cancelled', 'waived') THEN
      RAISE EXCEPTION 'Khoản phải thu % đã %.', v_cid, v_row.status USING ERRCODE = 'check_violation';
    END IF;
    IF v_amt > v_row.amount_due_vnd - v_row.discount_vnd - v_row.paid_vnd THEN
      RAISE EXCEPTION 'Số phân bổ % đ vượt số còn phải thu của khoản %.', v_amt, v_cid USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.contribution_payment_allocations (payment_id, contribution_id, amount_vnd) VALUES (v_id, v_cid, v_amt);
    v_sum := v_sum + v_amt;
  END LOOP;
  IF v_sum <> p_amount_vnd THEN
    RAISE EXCEPTION 'BR-FIN-12: tổng phân bổ (% đ) phải bằng số tiền thu (% đ).', v_sum, p_amount_vnd USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_record_contribution_payment(uuid, uuid, bigint, payment_method_t, date, text, jsonb, uuid, text) IS
  'Ghi nhận một lần thu quỹ: bút toán in + phiếu thu + phân bổ cho 1..n khoản phải thu (đóng gộp nhiều tháng). Idempotent theo (người thu, client_request_id). Thay cho toggleContribution của FE (công tắc đảo, không vết, không idempotent).';

CREATE OR REPLACE FUNCTION app.fn_void_contribution_payment(p_payment_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v       public.contribution_payments%ROWTYPE;
  v_entry uuid := app.uuid_v7();
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Không có quyền hủy phiếu thu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.contribution_payments cp WHERE cp.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu thu không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Phiếu thu đã hủy trước đó.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id,
                                     reversal_of_id, counterparty_member_id, description, created_by)
  VALUES (v_entry, v.fund_id, app.local_today(), 'out', v.amount_vnd, 'reversal', v.id,
          v.ledger_entry_id, v.member_id, 'Hủy phiếu thu: ' || p_reason, v_uid);
  UPDATE public.contribution_payments
     SET voided_at = now(), voided_by = v_uid, void_reason = p_reason, void_ledger_entry_id = v_entry
   WHERE id = p_payment_id;
  RETURN v_entry;
END
$$;
COMMENT ON FUNCTION app.fn_void_contribution_payment(uuid, text) IS 'Hủy phiếu thu bằng bút toán đảo (out) + voided_*; khoản phải thu tự trở về unpaid/partial nhờ trigger rollup. Không xóa dữ liệu.';

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
  SELECT v_plan.id, m.id, v_plan.amount_vnd, v_plan.due_date
    FROM public.members m
   WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= v_plan.due_date
  ON CONFLICT (plan_id, member_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.contribution_plans SET status = 'active', generated_at = now() WHERE id = v_plan.id;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_generate_contributions(uuid) IS 'Sinh khoản phải thu cho mọi thành viên đang ở (status=active, đã gia nhập trước hạn). Idempotent (ON CONFLICT DO NOTHING) — chạy lại để bổ sung thành viên mới vào.';
