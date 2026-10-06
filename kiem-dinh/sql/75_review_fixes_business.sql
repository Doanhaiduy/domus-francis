-- =====================================================================
-- 75_review_fixes_business.sql — VÁ NGHIỆP VỤ & KIỂM SOÁT NỘI BỘ (kiểm định Bước 4), chạy SAU 70–74. Idempotent.
-- Xử lý: N-01, N-02, N-03, N-04, N-05, N-06, N-07, N-10, N-11, N-12, N-13, N-14, N-15, N-16, N-18, N-19.
-- Nguồn: Phụ lục A của báo cáo nghiệp vụ; người kiểm định chính đã: bỏ 2 khối trùng với 70 (khóa bỏ phiếu G-05, khóa hạn
-- mức giặt G-06); hợp nhất 3 hàm bị cả hai bên sửa (trigger sổ cái, tính điểm, hiệu ứng rời lưu xá); làm mọi lệnh chạy lại được.
-- CẢNH BÁO: N-04 đổi công thức chuỗi băm sổ cái — xem ghi chú migration ở hàm tg_ledger_entry_before_insert.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- N-01 (bế tắc duyệt phiếu 1 chữ ký khi Trưởng nhà là người lập/người ứng)
-- ---------------------------------------------------------------------
-- Nâng lên 2 chữ ký (Thủ quỹ + Phó nhà) — tg_expense_approval_apply đã có nhánh "không cần Trưởng nhà" cho trường hợp này.
CREATE OR REPLACE FUNCTION app.tg_expense_voucher_head_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_payee uuid;
BEGIN
  IF NEW.status = 'pending_approval' AND OLD.status IS DISTINCT FROM 'pending_approval' AND NEW.required_approvals = 1
     AND NEW.amount_vnd > app.setting_int('finance.expense.treasurer_solo_approve_max_vnd') THEN
    SELECT m.user_id INTO v_payee FROM public.members m WHERE m.id = NEW.paid_by_member_id;
    IF 'house_head' = ANY (app.user_roles_of(NEW.requested_by))
       OR (v_payee IS NOT NULL AND 'house_head' = ANY (app.user_roles_of(v_payee))) THEN
      NEW.required_approvals := 2;   -- BR-FIN-35: Thủ quỹ + Phó nhà thay chữ ký Trưởng nhà
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_expense_voucher_head_conflict() OWNER TO luuxa_definer;
-- tên "__sod" xếp sau "__rules" => chạy sau khi trg_expense_vouchers__rules đã tính required_approvals
DROP TRIGGER IF EXISTS trg_expense_vouchers__sod ON expense_vouchers;
CREATE TRIGGER trg_expense_vouchers__sod BEFORE UPDATE ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_voucher_head_conflict();

-- ---------------------------------------------------------------------
-- N-02 (tự duyệt gián tiếp qua ủy quyền)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_expense_approval_delegation_sod()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v public.expense_vouchers%ROWTYPE; v_payee uuid;
BEGIN
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = NEW.voucher_id;
  SELECT m.user_id INTO v_payee FROM public.members m WHERE m.id = v.paid_by_member_id;
  IF NEW.decision = 'approved' AND EXISTS (
       SELECT 1 FROM public.role_delegations d JOIN public.roles r ON r.id = d.role_id
        WHERE d.delegate_user_id = NEW.approver_user_id AND r.code = NEW.approver_role
          AND d.revoked_at IS NULL AND d.starts_at <= now() AND d.ends_at > now()
          AND d.delegator_user_id IN (v.requested_by, v_payee))
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = NEW.approver_user_id AND r.code = NEW.approver_role AND ur.revoked_at IS NULL
          AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())) THEN
    RAISE EXCEPTION 'BR-FIN-35: vai trò % của bạn là do chính người lập/người ứng phiếu ủy quyền — không được dùng để duyệt phiếu của họ.', NEW.approver_role
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_expense_approval_delegation_sod() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_expense_approvals__sod ON expense_approvals;
CREATE TRIGGER trg_expense_approvals__sod BEFORE INSERT ON expense_approvals    -- sau __rules (đã điền approver_role)
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_approval_delegation_sod();

-- ---------------------------------------------------------------------
-- N-07 (ủy quyền còn hiệu lực khi vai trò gốc bị thu hồi)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_user_roles_cascade_delegations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
BEGIN
  UPDATE public.role_delegations d
     SET revoked_at = now(), revoked_by = app.current_user_id()
   WHERE d.delegator_user_id = NEW.user_id AND d.role_id = NEW.role_id AND d.revoked_at IS NULL
     AND (NEW.revoked_at IS NOT NULL OR (NEW.valid_to IS NOT NULL AND d.ends_at > NEW.valid_to));
  RETURN NULL;
END $$;
ALTER FUNCTION app.tg_user_roles_cascade_delegations() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_user_roles__cascade_delegations ON user_roles;
CREATE TRIGGER trg_user_roles__cascade_delegations AFTER UPDATE OF revoked_at, valid_to ON user_roles
  FOR EACH ROW WHEN (NEW.revoked_at IS NOT NULL OR NEW.valid_to IS NOT NULL)
  EXECUTE FUNCTION app.tg_user_roles_cascade_delegations();

-- ---------------------------------------------------------------------
-- N-03 (ghi lùi ngày vào tháng trước kỳ đã chốt)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_ledger_entry_no_backdate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_locked date;
BEGIN
  SELECT max(fp.period_month) INTO v_locked FROM public.financial_periods fp WHERE fp.status <> 'open';
  IF v_locked IS NOT NULL AND date_trunc('month', NEW.entry_date)::date <= v_locked THEN
    RAISE EXCEPTION 'BR-FIN-06: ngày hạch toán % thuộc hoặc trước kỳ đã chốt gần nhất (%) — ghi vào kỳ đang mở.', NEW.entry_date, to_char(v_locked, 'MM/YYYY')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_ledger_entry_no_backdate() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_ledger_entries__backdate ON ledger_entries;
CREATE TRIGGER trg_ledger_entries__backdate BEFORE INSERT ON ledger_entries   -- "__backdate" < "__chain": chạy trước, trước cả ensure_period
  FOR EACH ROW EXECUTE FUNCTION app.tg_ledger_entry_no_backdate();

-- ---------------------------------------------------------------------
-- N-04 (chủ bảng tắt trigger bảng bất biến)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.evt_protect_immutable_tables()
RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN RETURN; END IF;   -- chỉ superuser (người vận hành, có nhật ký) vượt được
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF r.classid = 'pg_class'::regclass AND r.objid IN ('public.ledger_entries'::regclass, 'public.expense_approvals'::regclass,
         'public.expense_status_history'::regclass, 'public.merit_entries'::regclass, 'public.duty_reviews'::regclass) THEN
      RAISE EXCEPTION 'Bảng bất biến % không được ALTER (kể cả DISABLE TRIGGER) bởi vai trò %.', r.object_identity, current_user;
    END IF;
  END LOOP;
END $$;
DROP EVENT TRIGGER IF EXISTS evt_protect_immutable_tables;
CREATE EVENT TRIGGER evt_protect_immutable_tables ON ddl_command_end WHEN TAG IN ('ALTER TABLE')
  EXECUTE FUNCTION app.evt_protect_immutable_tables();

-- ---------------------------------------------------------------------
-- N-05 (Thủ quỹ miễn quỹ bằng khoản phải thu 0 đ)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_contribution_amount_from_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_amt bigint;
BEGIN
  SELECT cp.amount_vnd INTO v_amt FROM public.contribution_plans cp WHERE cp.id = NEW.plan_id;
  IF NEW.amount_due_vnd IS DISTINCT FROM v_amt AND app.current_user_id() IS NOT NULL AND NOT app.has_permission('finance.contribution.waive') THEN
    RAISE EXCEPTION 'BR-FIN-14: số phải thu (% đ) khác mức của kế hoạch (% đ) — dùng miễn/giảm có lý do (Trưởng nhà).', NEW.amount_due_vnd, v_amt
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_contribution_amount_from_plan() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_contributions__amount_from_plan ON contributions;
CREATE TRIGGER trg_contributions__amount_from_plan BEFORE INSERT OR UPDATE OF amount_due_vnd, plan_id ON contributions
  FOR EACH ROW EXECUTE FUNCTION app.tg_contribution_amount_from_plan();

-- ---------------------------------------------------------------------
-- N-15 (thành viên tự đặt no_show để né quy tắc hủy) — khóa hạn mức tuần đã vá ở 70 (G-06)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_laundry_noshow_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' AND NOT app.is_rls_exempt_role()
     AND NOT app.has_permission('laundry.manage') THEN
    RAISE EXCEPTION 'BR-LAU-04: no_show do hệ thống đánh dấu; muốn bỏ lượt hãy hủy (đúng hạn hủy).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_laundry_bookings__noshow_guard ON laundry_bookings;
CREATE TRIGGER trg_laundry_bookings__noshow_guard BEFORE UPDATE OF status ON laundry_bookings
  FOR EACH ROW EXECUTE FUNCTION app.tg_laundry_noshow_guard();

-- ---------------------------------------------------------------------
-- N-10 (đương sự tự quyết khiếu nại trực nhật bằng UPDATE trực tiếp)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS duty_review_appeals__update ON duty_review_appeals;
REVOKE UPDATE ON duty_review_appeals FROM luuxa_app;

-- ---------------------------------------------------------------------
-- N-12 (sửa thang điểm tại chỗ; Admin kỹ thuật sửa được thang)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_scale_in_use(p_scale uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.academic_records ar WHERE ar.scale_id = p_scale AND ar.status IN ('submitted', 'verified'))
$$;
ALTER FUNCTION app.fn_scale_in_use(uuid) OWNER TO luuxa_definer;
-- bậc điểm chữ / bậc xếp loại (cả hai bảng có cột scale_id)
CREATE OR REPLACE FUNCTION app.tg_grade_band_in_use_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND app.fn_scale_in_use(OLD.scale_id)) OR (TG_OP <> 'DELETE' AND app.fn_scale_in_use(NEW.scale_id)) THEN
    RAISE EXCEPTION 'BR-ACAD-06: thang điểm đã được bảng điểm nộp/xác minh sử dụng — không sửa bậc tại chỗ; tạo thang mới với effective_from mới.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_grade_scale_bands__in_use ON grade_scale_bands;
CREATE TRIGGER trg_grade_scale_bands__in_use BEFORE INSERT OR UPDATE OR DELETE ON grade_scale_bands FOR EACH ROW EXECUTE FUNCTION app.tg_grade_band_in_use_lock();
DROP TRIGGER IF EXISTS trg_grade_rank_bands__in_use ON grade_rank_bands;
CREATE TRIGGER trg_grade_rank_bands__in_use  BEFORE INSERT OR UPDATE OR DELETE ON grade_rank_bands  FOR EACH ROW EXECUTE FUNCTION app.tg_grade_band_in_use_lock();
-- tham số tính điểm của thang (cho đổi tên, hiệu lực, is_active)
CREATE OR REPLACE FUNCTION app.tg_grade_scale_in_use_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.max_score, NEW.process_weight_pct, NEW.final_weight_pct, NEW.round_decimals, NEW.rounding_mode, NEW.gpa4_mode)
         IS NOT DISTINCT FROM (OLD.max_score, OLD.process_weight_pct, OLD.final_weight_pct, OLD.round_decimals, OLD.rounding_mode, OLD.gpa4_mode) THEN
    RETURN NEW;
  END IF;
  IF app.fn_scale_in_use(OLD.id) THEN
    RAISE EXCEPTION 'BR-ACAD-06: thang điểm đã được bảng điểm nộp/xác minh sử dụng — không sửa tham số tại chỗ; tạo thang mới.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_grade_scales__in_use ON grade_scales;
CREATE TRIGGER trg_grade_scales__in_use BEFORE UPDATE OR DELETE ON grade_scales FOR EACH ROW EXECUTE FUNCTION app.tg_grade_scale_in_use_lock();
-- + bỏ academic.scale.manage khỏi vai trò admin (Admin kỹ thuật không đổi được cách xếp loại học tập):
DELETE FROM role_permissions WHERE permission_code = 'academic.scale.manage' AND role_id = (SELECT id FROM roles WHERE code = 'admin');

-- ---------------------------------------------------------------------
-- N-06 (geofence nhập tọa độ nhưng không bắt buộc; một thiết bị điểm danh nhiều người)
-- ---------------------------------------------------------------------
ALTER TABLE qr_sessions DROP CONSTRAINT IF EXISTS ck_qr_sessions__geofence_enforced;
ALTER TABLE qr_sessions ADD CONSTRAINT ck_qr_sessions__geofence_enforced CHECK (geofence_lat IS NULL OR require_geofence);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_records__event_device ON attendance_records (event_id, device_hash)
  WHERE device_hash IS NOT NULL AND method = 'qr';

-- ---------------------------------------------------------------------
-- N-16 (ngưỡng kiểm soát chi do một người đổi)
-- ---------------------------------------------------------------------
UPDATE settings SET max_value = 500000   WHERE key = 'finance.expense.treasurer_solo_approve_max_vnd';
UPDATE settings SET max_value = 5000000  WHERE key = 'finance.expense.dual_approval_min_vnd';
UPDATE settings SET max_value = 1000000  WHERE key = 'finance.expense.receipt_required_min_vnd';
CREATE OR REPLACE FUNCTION app.tg_settings_finance_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
BEGIN
  IF app.setting_int('finance.expense.treasurer_solo_approve_max_vnd') >= app.setting_int('finance.expense.dual_approval_min_vnd') THEN
    RAISE EXCEPTION 'BR-FIN-32: hạn mức Thủ quỹ tự duyệt (% đ) phải nhỏ hơn ngưỡng hai chữ ký (% đ).',
      app.setting_int('finance.expense.treasurer_solo_approve_max_vnd'), app.setting_int('finance.expense.dual_approval_min_vnd') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
ALTER FUNCTION app.tg_settings_finance_invariants() OWNER TO luuxa_definer;
REVOKE EXECUTE ON FUNCTION app.tg_settings_finance_invariants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_settings_finance_invariants() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
DROP TRIGGER IF EXISTS trg_settings__finance_invariants ON settings;
CREATE CONSTRAINT TRIGGER trg_settings__finance_invariants AFTER UPDATE ON settings DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.key LIKE 'finance.expense.%') EXECUTE FUNCTION app.tg_settings_finance_invariants();
-- (khuyến nghị thêm, ngoài DDL: đổi nhóm finance.* có hiệu lực sau khi người thứ hai xác nhận — bảng setting_change_requests — và luôn thông báo Ban điều hành)

-- ---------------------------------------------------------------------
-- N-19 (ngày ghi chi trước ngày duyệt)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_ledger_expense_date_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_appr date;
BEGIN
  SELECT app.local_date(ev.approved_at) INTO v_appr FROM public.expense_vouchers ev WHERE ev.id = NEW.source_id;
  IF v_appr IS NOT NULL AND NEW.entry_date < v_appr THEN
    RAISE EXCEPTION 'BR-FIN-18: ngày chi % trước ngày phiếu được duyệt % — không ghi lùi ngày chi.', NEW.entry_date, v_appr USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_ledger_expense_date_guard() OWNER TO luuxa_definer;
REVOKE EXECUTE ON FUNCTION app.tg_ledger_expense_date_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_ledger_expense_date_guard() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
DROP TRIGGER IF EXISTS trg_ledger_entries__expense_date ON ledger_entries;
CREATE TRIGGER trg_ledger_entries__expense_date BEFORE INSERT ON ledger_entries
  FOR EACH ROW WHEN (NEW.source_type = 'expense') EXECUTE FUNCTION app.tg_ledger_expense_date_guard();

-- ---------------------------------------------------------------------
-- N-18 (phát hiện tách phiếu lách ngưỡng)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_expense_split_alerts WITH (security_invoker = true) AS
SELECT COALESCE(ev.paid_by_member_id::text, lower(btrim(ev.payee_name)), ev.requested_by::text) AS counterparty,
       date_trunc('week', ev.expense_date)::date AS week_start,
       count(*) AS vouchers, sum(ev.amount_vnd)::bigint AS total_vnd,
       max(ev.amount_vnd) AS max_single_vnd,
       array_agg(ev.voucher_no ORDER BY ev.voucher_no) AS voucher_nos
  FROM expense_vouchers ev
 WHERE ev.status IN ('pending_approval', 'approved', 'paid') AND ev.required_approvals = 1
 GROUP BY 1, 2
HAVING count(*) >= 2 AND sum(ev.amount_vnd) >= app.setting_int('finance.expense.dual_approval_min_vnd');
COMMENT ON VIEW v_expense_split_alerts IS 'Cảnh báo: ≥2 phiếu một chữ ký cùng đối tượng nhận trong một tuần có tổng ≥ ngưỡng 2 chữ ký (nghi tách phiếu). RLS theo expense_vouchers (người có finance.expense.read_all thấy toàn bộ).';
GRANT SELECT ON v_expense_split_alerts TO luuxa_app;

-- ---------------------------------------------------------------------
-- Hàm hợp nhất 1/3 — trigger sổ cái: thứ tự khóa funds → kỳ (G-03) + băm thêm mọi cột nghiệp vụ (N-04)
-- LƯU Ý MIGRATION: đổi công thức băm. DB mới (chưa có bút toán) không cần làm gì; DB đã có bút toán phải chạy một lần
-- khối "tính lại chuỗi" ở cuối file này TRƯỚC khi mở cho người dùng, rồi neo head_hash mới ra ngoài DB.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_ledger_entry_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_period  public.financial_periods%ROWTYPE;
  v_fund    public.funds%ROWTYPE;
  v_orig    public.ledger_entries%ROWTYPE;
  v_balance bigint;
BEGIN
  IF NEW.entry_date > app.local_today() THEN
    RAISE EXCEPTION 'Ngày hạch toán % ở tương lai.', NEW.entry_date USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_fund FROM public.funds f WHERE f.id = NEW.fund_id FOR UPDATE;
  IF NOT FOUND OR v_fund.deleted_at IS NOT NULL OR NOT v_fund.is_active THEN
    RAISE EXCEPTION 'Túi quỹ không tồn tại hoặc đã ngừng sử dụng.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.period_id := app.ensure_period(NEW.entry_date);
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.id = NEW.period_id FOR SHARE;
  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'BR-FIN-06: kỳ % đã chốt hoặc đang chờ xác nhận — không ghi thêm bút toán. Hãy ghi bút toán đảo/điều chỉnh vào kỳ đang mở.',
      to_char(v_period.period_month, 'MM/YYYY') USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.source_type = 'reversal' THEN
    SELECT * INTO v_orig FROM public.ledger_entries le WHERE le.id = NEW.reversal_of_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bút toán gốc cần đảo không tồn tại.' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_orig.source_type = 'reversal' THEN
      RAISE EXCEPTION 'Không đảo một bút toán đảo.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_orig.fund_id <> NEW.fund_id OR v_orig.amount_vnd <> NEW.amount_vnd OR v_orig.direction = NEW.direction THEN
      RAISE EXCEPTION 'Bút toán đảo phải cùng túi quỹ, cùng số tiền và ngược chiều với bút toán gốc.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.direction = 'out' AND NOT v_fund.allow_negative THEN
    SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0)
      INTO v_balance
      FROM public.ledger_entries le
     WHERE le.fund_id = NEW.fund_id;
    IF v_balance - NEW.amount_vnd < 0 THEN
      RAISE EXCEPTION 'BR-FIN-07: số dư túi quỹ "%" (% đ) không đủ để chi % đ.', v_fund.name, v_balance, NEW.amount_vnd
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.fund_seq  := v_fund.last_seq + 1;
  NEW.prev_hash := v_fund.head_hash;
  NEW.posted_at := now();
  NEW.row_hash  := encode(
    digest(concat_ws('|',
      NEW.prev_hash, NEW.fund_id::text, NEW.fund_seq::text, to_char(NEW.entry_date, 'YYYY-MM-DD'),
      NEW.direction::text, NEW.amount_vnd::text, NEW.source_type::text,
      COALESCE(NEW.source_id::text, ''), NEW.description,
      COALESCE(NEW.counterparty_member_id::text, ''), COALESCE(NEW.created_by::text, ''), COALESCE(NEW.reversal_of_id::text, ''),
      COALESCE(NEW.transfer_group_id::text, ''), NEW.period_id::text, COALESCE(NEW.client_request_id::text, '')), 'sha256'),
    'hex');

  UPDATE public.funds SET last_seq = NEW.fund_seq, head_hash = NEW.row_hash WHERE id = NEW.fund_id;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_ledger_entry_before_insert() IS
  'BEFORE INSERT ledger_entries: không ghi ngày tương lai; khóa túi quỹ FOR UPDATE rồi đọc kỳ FOR SHARE (thứ tự khóa giống fn_close_period — G-03); kiểm tra bút toán đảo; chặn số dư âm (BR-FIN-07); fund_seq + chuỗi băm SHA-256 phủ MỌI cột nghiệp vụ (kể cả người tạo, người đối ứng, kỳ, nhóm chuyển quỹ — N-04).';

-- ---------------------------------------------------------------------
-- Hàm hợp nhất 2/3 — tính điểm: cho lưu nháp khi CHƯA có cuối kỳ (G-07) + KHÔNG ngầm coi cuối kỳ = 100% khi thiếu
-- điểm quá trình trên thang có trọng số quá trình (N-11)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_grade_record_compute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_rec     public.academic_records%ROWTYPE;
  v_scale   public.grade_scales%ROWTYPE;
  v_band    public.grade_scale_bands%ROWTYPE;
  v_excl    boolean;
  v_total   numeric;
BEGIN
  SELECT * INTO v_rec FROM public.academic_records ar WHERE ar.id = NEW.record_id;
  IF v_rec.status IN ('submitted', 'verified')
     AND NOT (app.is_system_caller() AND COALESCE(current_setting('app.academic_unlock', true), '') = 'on') THEN
    RAISE EXCEPTION 'BR-ACAD-03: bảng điểm đã nộp/xác minh — trả về bản nháp trước khi sửa (mọi thay đổi được ghi audit).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_scale FROM public.grade_scales s WHERE s.id = v_rec.scale_id;
  IF COALESCE(NEW.process_score, 0) > v_scale.max_score OR COALESCE(NEW.final_score, 0) > v_scale.max_score
     OR COALESCE(NEW.official_total_score, 0) > v_scale.max_score THEN
    RAISE EXCEPTION 'Điểm vượt thang tối đa % của thang "%".', v_scale.max_score, v_scale.name USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.official_total_score IS NOT NULL THEN
    v_total := NEW.official_total_score;
  ELSIF NEW.final_score IS NULL THEN
    v_total := NULL;                                   -- mới có điểm quá trình/giữa kỳ: lưu nháp, chưa tổng kết
  ELSIF NEW.process_score IS NULL AND v_scale.process_weight_pct > 0 THEN
    RAISE EXCEPTION 'BR-ACAD-07: thang "%" có trọng số điểm quá trình % phần trăm nhưng thiếu điểm quá trình — nhập điểm quá trình hoặc điểm tổng kết chính thức của trường.',
      v_scale.name, v_scale.process_weight_pct USING ERRCODE = 'check_violation';
  ELSIF NEW.process_score IS NULL THEN
    v_total := NEW.final_score;                        -- thang không có trọng số quá trình: cuối kỳ là 100%
  ELSE
    v_total := (NEW.process_score * v_scale.process_weight_pct + NEW.final_score * v_scale.final_weight_pct) / 100.0;
  END IF;

  IF v_total IS NULL THEN
    NEW.total_score   := NULL;
    NEW.letter_grade  := NULL;
    NEW.gpa_points    := NULL;
    NEW.is_pass       := NULL;
    NEW.counts_in_gpa := false;
    NEW.updated_at    := now();
    RETURN NEW;
  END IF;

  v_total := CASE v_scale.rounding_mode
               WHEN 'truncate' THEN trunc(v_total, v_scale.round_decimals)
               ELSE round(v_total, v_scale.round_decimals)
             END;
  NEW.total_score := v_total;

  SELECT * INTO v_band
    FROM public.grade_scale_bands b
   WHERE b.scale_id = v_scale.id AND b.min_score <= v_total
   ORDER BY b.min_score DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thang điểm "%" chưa có bậc điểm chữ phù hợp cho điểm %.', v_scale.name, v_total USING ERRCODE = 'no_data_found';
  END IF;
  SELECT c.excluded_from_gpa INTO v_excl FROM public.courses c WHERE c.id = NEW.course_id;
  NEW.letter_grade  := v_band.letter;
  NEW.gpa_points    := v_band.gpa_points;
  NEW.is_pass       := v_band.is_pass;
  NEW.counts_in_gpa := v_band.counts_in_gpa AND NOT COALESCE(v_excl, false);
  NEW.updated_at    := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_grade_record_compute() IS 'BEFORE INSERT/UPDATE grade_records: tổng kết = điểm chính thức (nếu có) hoặc trung bình có trọng số theo thang; chưa có cuối kỳ ⇒ lưu nháp, tổng kết trống, không tính GPA (G-07); thiếu điểm quá trình trên thang có trọng số quá trình ⇒ phải nhập điểm chính thức (N-11); làm tròn và tra bậc theo thang.';

-- ---------------------------------------------------------------------
-- Hàm hợp nhất 3/3 — hiệu ứng rời lưu xá (G-09, G-11, N-14): khóa tài khoản, kết thúc phòng, gỡ khỏi ca
-- trực tương lai, hủy lượt giặt tương lai, thu hồi vai trò đặc quyền và ủy quyền, ghi audit
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_member_leave_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_from    date := COALESCE(NEW.left_on, app.local_today());
  v_duties  integer := 0;
  v_laundry integer := 0;
  v_roles   integer := 0;
BEGIN
  IF NEW.status IN ('left', 'alumni') AND OLD.status NOT IN ('left', 'alumni') THEN
    IF NEW.user_id IS NOT NULL AND NEW.status = 'left' THEN
      UPDATE public.users SET status = 'disabled' WHERE id = NEW.user_id AND status <> 'disabled';
      UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'user_disabled'
       WHERE user_id = NEW.user_id AND revoked_at IS NULL;
    END IF;
    UPDATE public.room_assignments
       SET ends_on = v_from, end_reason = 'member_left'
     WHERE member_id = NEW.id AND ends_on IS NULL;
    DELETE FROM public.duty_assignment_members dm
     USING public.duty_assignments a
     WHERE dm.assignment_id = a.id AND dm.member_id = NEW.id AND a.status = 'scheduled' AND a.duty_date > v_from;
    GET DIAGNOSTICS v_duties = ROW_COUNT;
    UPDATE public.laundry_bookings
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Thành viên rời lưu xá'
     WHERE member_id = NEW.id AND status = 'booked' AND starts_at > now();
    GET DIAGNOSTICS v_laundry = ROW_COUNT;
    IF NEW.user_id IS NOT NULL THEN
      UPDATE public.user_roles
         SET revoked_at = now(), revoked_by = app.current_user_id()
       WHERE user_id = NEW.user_id AND revoked_at IS NULL
         AND role_id <> (SELECT r.id FROM public.roles r WHERE r.code = 'member');
      GET DIAGNOSTICS v_roles = ROW_COUNT;
      UPDATE public.role_delegations
         SET revoked_at = now(), revoked_by = app.current_user_id()
       WHERE (delegator_user_id = NEW.user_id OR delegate_user_id = NEW.user_id) AND revoked_at IS NULL;
    END IF;
    PERFORM app.write_audit('STATE_CHANGE', 'members', NEW.id::text, 'MEMBER_LEFT', jsonb_build_object('status', OLD.status),
                            jsonb_build_object('status', NEW.status, 'left_on', NEW.left_on, 'removed_future_duties', v_duties,
                                               'cancelled_laundry', v_laundry, 'revoked_privileged_roles', v_roles));
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_member_leave_effects() IS 'AFTER UPDATE OF status members (SECURITY DEFINER): sang left ⇒ khóa tài khoản + thu hồi phiên; sang left/alumni ⇒ kết thúc phân phòng, gỡ khỏi ca trực scheduled sau ngày rời, hủy lượt giặt tương lai, thu hồi vai trò ≠ member và mọi ủy quyền (BR-MEM-07/18), ghi audit STATE_CHANGE. Tái nhập phải cấp lại vai trò.';

-- ---------------------------------------------------------------------
-- N-04: hàm kiểm chứng chuỗi băm theo công thức mới
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_verify_ledger_chain(p_fund_id uuid DEFAULT NULL)
RETURNS TABLE (fund_id uuid, fund_code text, entries_checked bigint, first_broken_seq bigint, head_matches boolean)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  WITH chain AS (
    SELECT le.fund_id, le.fund_seq, le.row_hash, le.prev_hash,
           row_number() OVER w AS rn,
           lag(le.row_hash) OVER w AS expected_prev,
           encode(digest(concat_ws('|', le.prev_hash, le.fund_id::text, le.fund_seq::text, to_char(le.entry_date, 'YYYY-MM-DD'),
                                   le.direction::text, le.amount_vnd::text, le.source_type::text,
                                   COALESCE(le.source_id::text, ''), le.description,
                                   COALESCE(le.counterparty_member_id::text, ''), COALESCE(le.created_by::text, ''), COALESCE(le.reversal_of_id::text, ''),
                                   COALESCE(le.transfer_group_id::text, ''), le.period_id::text, COALESCE(le.client_request_id::text, '')), 'sha256'), 'hex') AS recomputed
      FROM public.ledger_entries le
     WHERE p_fund_id IS NULL OR le.fund_id = p_fund_id
    WINDOW w AS (PARTITION BY le.fund_id ORDER BY le.fund_seq)
  ), agg AS (
    SELECT c.fund_id,
           COUNT(*) AS n,
           MIN(c.fund_seq) FILTER (WHERE c.recomputed <> c.row_hash
                                      OR c.prev_hash IS DISTINCT FROM COALESCE(c.expected_prev, repeat('0', 64))
                                      OR c.fund_seq <> c.rn) AS first_bad,
           (array_agg(c.row_hash ORDER BY c.fund_seq DESC))[1] AS last_hash
      FROM chain c
     GROUP BY c.fund_id
  )
  SELECT f.id, f.code, COALESCE(a.n, 0), a.first_bad, f.head_hash = COALESCE(a.last_hash, repeat('0', 64))
    FROM public.funds f
    LEFT JOIN agg a ON a.fund_id = f.id
   WHERE p_fund_id IS NULL OR f.id = p_fund_id
   ORDER BY f.code
$$;
COMMENT ON FUNCTION app.fn_verify_ledger_chain(uuid) IS 'Kiểm chứng toàn vẹn sổ cái theo công thức băm phủ mọi cột nghiệp vụ (N-04). first_broken_seq NULL = nguyên vẹn. Chỉ phát hiện sửa vụng: người có quyền siêu người dùng tính lại được cả chuỗi — phải neo head_hash ra ngoài DB hằng ngày.';

-- ---------------------------------------------------------------------
-- N-13: xếp loại theo GPA hệ 4 chưa làm tròn
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_recompute_gpa(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  DELETE FROM public.gpa_snapshots WHERE member_id = p_member_id;

  INSERT INTO public.gpa_snapshots (member_id, scope, as_of_semester_id, credits_attempted, credits_passed, failed_courses, gpa10, gpa4, rank_label, includes_unverified)
  WITH base AS (
    SELECT ar.semester_id, sem.starts_on, ar.scale_id, ar.status,
           gr.credits, gr.total_score, gr.gpa_points, gr.is_pass, gr.counts_in_gpa,
           gs.gpa4_mode, gs.max_score
      FROM public.academic_records ar
      JOIN public.semesters sem    ON sem.id = ar.semester_id
      JOIN public.grade_records gr ON gr.record_id = ar.id
      JOIN public.grade_scales gs  ON gs.id = ar.scale_id
     WHERE ar.member_id = p_member_id AND ar.status IN ('submitted', 'verified')
  ), per_sem AS (
    SELECT semester_id, starts_on, scale_id,
           COALESCE(SUM(credits) FILTER (WHERE counts_in_gpa), 0)                     AS cr_att,
           COALESCE(SUM(credits) FILTER (WHERE counts_in_gpa AND is_pass), 0)         AS cr_pass,
           COUNT(*) FILTER (WHERE NOT is_pass)                                        AS failed,
           COALESCE(SUM(total_score * credits) FILTER (WHERE counts_in_gpa), 0)       AS w10,
           COALESCE(SUM((CASE WHEN gpa4_mode = 'linear' THEN total_score / max_score * 4 ELSE gpa_points END) * credits)
                    FILTER (WHERE counts_in_gpa), 0)                                  AS w4,
           bool_or(status <> 'verified')                                              AS unverified
      FROM base
     GROUP BY semester_id, starts_on, scale_id
  ), cum AS (
    SELECT p.*,
           SUM(cr_att)   OVER w AS c_att,  SUM(cr_pass) OVER w AS c_pass, SUM(failed) OVER w AS c_failed,
           SUM(w10)      OVER w AS c_w10,  SUM(w4)      OVER w AS c_w4,
           bool_or(unverified) OVER w AS c_unverified
      FROM per_sem p
    WINDOW w AS (ORDER BY starts_on ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), flat AS (
    SELECT semester_id, scale_id, 'semester'::text AS scope, cr_att AS att, cr_pass AS pas, failed AS fl,
           CASE WHEN cr_att > 0 THEN round(w10 / cr_att, 2) END AS g10,
           CASE WHEN cr_att > 0 THEN round(w4 / cr_att, 2) END  AS g4,
           CASE WHEN cr_att > 0 THEN w4 / cr_att END            AS g4_raw,   -- xếp loại theo giá trị CHƯA làm tròn
           unverified AS unv
      FROM cum
    UNION ALL
    SELECT semester_id, scale_id, 'cumulative', c_att, c_pass, c_failed,
           CASE WHEN c_att > 0 THEN round(c_w10 / c_att, 2) END,
           CASE WHEN c_att > 0 THEN round(c_w4 / c_att, 2) END,
           CASE WHEN c_att > 0 THEN c_w4 / c_att END,
           c_unverified
      FROM cum
  )
  SELECT p_member_id, f.scope, f.semester_id, f.att, f.pas, f.fl::integer, f.g10, f.g4,
         (SELECT rb.label_vi FROM public.grade_rank_bands rb
           WHERE rb.scale_id = f.scale_id AND f.g4_raw IS NOT NULL AND rb.min_gpa4 <= f.g4_raw
           ORDER BY rb.min_gpa4 DESC LIMIT 1),
         f.unv
    FROM flat f;
END
$$;

-- Quyền thực thi cho hàm mới (quy ước 49_b: không EXECUTE cho PUBLIC)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p
            WHERE p.pronamespace = 'app'::regnamespace
              AND p.proname IN ('tg_expense_voucher_head_conflict', 'tg_expense_approval_delegation_sod', 'tg_user_roles_cascade_delegations',
                                'tg_ledger_entry_no_backdate', 'evt_protect_immutable_tables', 'tg_contribution_amount_from_plan',
                                'tg_laundry_noshow_guard', 'fn_scale_in_use', 'tg_grade_band_in_use_lock', 'tg_grade_scale_in_use_lock',
                                'tg_settings_finance_invariants', 'tg_ledger_expense_date_guard') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner', r.f);
  END LOOP;
END $$;
-- Hàm INVOKER mới thuộc luuxa_owner (quy ước 49_a)
ALTER FUNCTION app.tg_laundry_noshow_guard() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_grade_band_in_use_lock() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_grade_scale_in_use_lock() OWNER TO luuxa_owner;

-- Tính lại chuỗi băm cho dữ liệu đã có (N-04) — chỉ cần khi DB đã có bút toán; chạy bằng superuser, một lần, trong cửa sổ bảo trì:
-- (không chạy tự động ở đây vì ledger_entries bất biến; quy trình: tắt trigger bất biến có biên bản, UPDATE prev_hash/row_hash
--  theo thứ tự fund_seq bằng công thức trên, cập nhật funds.head_hash, bật lại trigger, chạy fn_verify_ledger_chain, neo head_hash mới.)

COMMIT;
