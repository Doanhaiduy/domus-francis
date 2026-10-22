-- =====================================================================
-- 1056 — TIỀN ĐIỆN NƯỚC KHÔNG ĐỤNG TỚI SỔ QUỸ NHÀ + CHỌN TÀI KHOẢN NHẬN TIỀN (STK) + SỬA LỖI XÁC NHẬN "ĐÃ ĐÓNG".
-- Idempotent. Không sửa db/app/1031, 1045 (đã áp) — thay hàm bằng bản mới ở đây.
--
--   (a) Tiền điện nước là khoản thu hộ/trả hộ: hóa đơn KHÔNG tự trừ vào quỹ nhà ("Trừ quỹ ngay" của 1031 bị bỏ) và tiền anh em đóng
--       KHÔNG được cộng vào quỹ nhà — phiếu thu của kế hoạch điện nước chỉ ghi nhận AI đã đóng (contribution_payments, ledger_entry_id = NULL),
--       không tạo bút toán sổ cái. Hủy phiếu thu như vậy cũng không có bút toán đảo. Dữ liệu cũ (bút toán đã ghi trước đây) giữ nguyên.
--   (b) contribution_plans.payee_member_id: tài khoản nhận tiền (STK) của kế hoạch điện nước — NULL = tài khoản nhận quỹ của nhà (mặc định),
--       hoặc một thành viên đã khai báo tài khoản nhận tiền (vd. người ứng tiền trả hóa đơn). Thành viên chuyển khoản vào đúng tài khoản đó.
--   (c) fn_contribution_claim_decide: báo "đã đóng" bằng chuyển khoản mà không kèm mã giao dịch thì lúc xác nhận phiếu thu vi phạm
--       ck_contribution_payments__bank_ref ⇒ lỗi "Dữ liệu không thỏa ràng buộc nghiệp vụ". Nay tự ghi "XAC-NHAN-THU-CONG" như nút "Đã đóng".
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Cột tài khoản nhận tiền của kế hoạch
-- ---------------------------------------------------------------------
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS payee_member_id uuid REFERENCES public.members (id) ON DELETE SET NULL;
COMMENT ON COLUMN public.contribution_plans.payee_member_id IS
  'Kế hoạch điện nước: thành viên nhận tiền (dùng tài khoản trong member_payment_accounts của người đó) — NULL = tài khoản nhận quỹ của nhà (settings finance.receiving_account). Chỉ để hiển thị mã QR/STK cho người đóng; không ảnh hưởng sổ quỹ.';
CREATE INDEX IF NOT EXISTS ix_contribution_plans__payee ON public.contribution_plans (payee_member_id) WHERE payee_member_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- [2] Lập kế hoạch điện nước: bỏ "trừ quỹ ngay", thêm tài khoản nhận tiền
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t);

CREATE OR REPLACE FUNCTION app.fn_create_utility_plan(
  p_month           date,
  p_bill_total_vnd  bigint,
  p_due_date        date DEFAULT NULL,
  p_fund_id         uuid DEFAULT NULL,
  p_note            text DEFAULT NULL,
  p_per_person_vnd  bigint DEFAULT NULL,
  p_auto_expense    boolean DEFAULT false,
  p_pay_method      payment_method_t DEFAULT 'cash',
  p_payee_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_month   date := date_trunc('month', p_month)::date;
  v_due     date;
  v_n       integer;
  v_amount  bigint;
  v_total   bigint;
  v_fund    uuid;
  v_code    text;
  v_name    text;
  v_id      uuid;
  v_gen     integer;
  v_note    text := NULLIF(btrim(p_note), '');
  v_payee   text;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền lập kế hoạch thu tiền điện nước.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_auto_expense THEN
    RAISE EXCEPTION 'Tiền điện nước không còn tự trừ vào quỹ nhà — hãy tắt "Trừ quỹ ngay" (nếu quỹ nhà trả hóa đơn thì lập phiếu chi thường).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_month IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn tháng hóa đơn điện nước.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_per_person_vnd IS NOT NULL AND p_bill_total_vnd IS NOT NULL THEN
    RAISE EXCEPTION 'Chỉ nhập MỘT trong hai: tổng hóa đơn hoặc số tiền mỗi người.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_per_person_vnd IS NULL AND (p_bill_total_vnd IS NULL OR p_bill_total_vnd <= 0 OR p_bill_total_vnd > 1000000000) THEN
    RAISE EXCEPTION 'Tổng hóa đơn điện nước phải lớn hơn 0 và tối đa 1.000.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_per_person_vnd IS NOT NULL AND (p_per_person_vnd <= 0 OR p_per_person_vnd > 100000000) THEN
    RAISE EXCEPTION 'Số tiền mỗi người phải lớn hơn 0 và tối đa 100.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_month > date_trunc('month', app.local_today())::date THEN
    RAISE EXCEPTION 'Chưa thể nhập hóa đơn điện nước của tháng % (tháng chưa tới).', to_char(v_month, 'MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  v_due := COALESCE(p_due_date, (v_month + interval '1 month')::date + (LEAST(28, GREATEST(1, app.setting_int('finance.utility_due_day')::int)) - 1));
  IF v_due < v_month THEN
    RAISE EXCEPTION 'Hạn nộp không được trước tháng hóa đơn.' USING ERRCODE = 'check_violation';
  END IF;

  -- Tài khoản nhận tiền: người nhận phải là thành viên còn hiệu lực và đã khai báo tài khoản nhận tiền
  IF p_payee_member_id IS NOT NULL THEN
    SELECT m.display_name INTO v_payee FROM public.members m WHERE m.id = p_payee_member_id AND m.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Người nhận tiền không tồn tại.' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.member_payment_accounts a WHERE a.member_id = p_payee_member_id) THEN
      RAISE EXCEPTION '% chưa khai báo tài khoản nhận tiền (Cài đặt → Hồ sơ cá nhân) nên chưa thể chọn làm nơi nhận.', v_payee USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contribution_plans:utility'));
  IF EXISTS (SELECT 1 FROM public.contribution_plans cp WHERE cp.fee_type = 'utility' AND cp.status <> 'cancelled' AND cp.period_month = v_month) THEN
    RAISE EXCEPTION 'BR-FIN-13: tháng % đã có kế hoạch thu tiền điện nước — muốn nhập lại thì hủy kế hoạch cũ (khi chưa ai nộp).', to_char(v_month, 'MM/YYYY')
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT count(*)::int INTO v_n FROM public.members m
   WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= v_due;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Không có thành viên đang ở để chia tiền điện nước.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_per_person_vnd IS NOT NULL THEN
    v_amount := p_per_person_vnd;                       -- mỗi người cố định ⇒ tổng = mỗi người × số người
    v_total  := v_amount * v_n;
    IF v_total > 1000000000 THEN
      RAISE EXCEPTION 'Tổng % đ (mỗi người × % người) vượt mức tối đa 1.000.000.000 đ.', v_total, v_n USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_amount := ((p_bill_total_vnd + v_n::bigint * 1000 - 1) / (v_n::bigint * 1000)) * 1000;   -- làm tròn LÊN tới 1.000 đ
    v_total  := p_bill_total_vnd;
  END IF;

  -- fund_id là cột bắt buộc của kế hoạch nhưng với điện nước KHÔNG có bút toán nào được ghi vào túi quỹ này
  v_fund := app.fn_plan_fund(p_fund_id);

  v_code := app.fn_next_plan_code('DN-' || to_char(v_month, 'YYYY-MM'));
  v_name := 'Điện nước tháng ' || to_char(v_month, 'MM/YYYY');
  INSERT INTO public.contribution_plans (code, name, fee_type, academic_year_id, period_month, amount_vnd, due_date, fund_id, created_by,
                                         bill_total_vnd, split_count, note, payee_member_id)
  VALUES (v_code, v_name, 'utility',
          (SELECT ay.id FROM public.academic_years ay WHERE v_month BETWEEN ay.starts_on AND ay.ends_on ORDER BY ay.starts_on LIMIT 1),
          v_month, v_amount, v_due, v_fund, v_uid, v_total, v_n, v_note, p_payee_member_id)
  RETURNING id INTO v_id;
  v_gen := app.fn_generate_contributions(v_id);
  IF v_gen <> v_n THEN
    RAISE EXCEPTION 'Số khoản phải thu sinh ra (%) khác số người chia (%) — vui lòng thử lại.', v_gen, v_n USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object('plan_id', v_id, 'code', v_code, 'name', v_name, 'generated', v_gen, 'amount_vnd', v_amount,
                            'split_count', v_n, 'bill_total_vnd', v_total, 'remainder_vnd', v_amount * v_n - v_total,
                            'due_date', v_due, 'expense_voucher_no', NULL, 'expense_vnd', NULL, 'payee_member_id', p_payee_member_id);
END
$$;
COMMENT ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t, uuid) IS
  'Lập kế hoạch tiền điện nước tháng p_month cho n người đang ở. Nhập MỘT trong hai: p_bill_total_vnd (mỗi người = ceil(tổng/n/1000)×1000) hoặc p_per_person_vnd (tổng = mỗi người × n). KHÔNG trừ quỹ nhà (p_auto_expense = true ⇒ lỗi; p_pay_method giữ để tương thích, bị bỏ qua) và tiền anh em đóng không vào sổ quỹ nhà. p_payee_member_id = thành viên nhận tiền (NULL = tài khoản nhận quỹ của nhà).';

ALTER FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t, uuid)
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- [3] Ghi thu: kế hoạch điện nước ⇒ chỉ ghi phiếu thu + phân bổ, KHÔNG bút toán sổ cái
-- ---------------------------------------------------------------------
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
  v_entry   uuid;
  v_alloc   jsonb;
  v_cid     uuid;
  v_amt     bigint;
  v_sum     bigint := 0;
  v_row     public.contributions%ROWTYPE;
  v_n_all   integer;
  v_n_util  integer;
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

  -- Khoản điện nước không vào sổ quỹ nhà: cả phiếu phải thuần điện nước, hoặc không có khoản điện nước nào
  SELECT count(*)::int, count(*) FILTER (WHERE pl.fee_type = 'utility')::int INTO v_n_all, v_n_util
    FROM jsonb_array_elements(p_allocations) a
    JOIN public.contributions c ON c.id = (a ->> 'contribution_id')::uuid
    JOIN public.contribution_plans pl ON pl.id = c.plan_id;
  IF v_n_util > 0 AND v_n_util <> jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'Tiền điện nước không vào sổ quỹ nhà nên phải ghi thu riêng, không gộp chung phiếu với khoản thu khác.' USING ERRCODE = 'check_violation';
  END IF;

  v_id := app.uuid_v7();
  IF v_n_util = 0 THEN
    v_entry := app.uuid_v7();
    INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id,
                                       counterparty_member_id, description, created_by)
    VALUES (v_entry, p_fund_id, p_paid_on, 'in', p_amount_vnd, 'contribution', v_id, p_member_id,
            'Thu quỹ' || COALESCE(': ' || p_note, ''), v_uid);
  END IF;
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
  'Ghi nhận một lần thu quỹ: phiếu thu + phân bổ cho 1..n khoản phải thu (đóng gộp nhiều tháng) + bút toán thu ở sổ quỹ — TRỪ khoản điện nước (fee_type = utility): chỉ ghi phiếu thu, ledger_entry_id = NULL, không đụng sổ quỹ nhà (không được gộp phiếu điện nước với khoản khác). Idempotent theo (người thu, client_request_id).';

CREATE OR REPLACE FUNCTION app.fn_void_contribution_payment(p_payment_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v       public.contribution_payments%ROWTYPE;
  v_entry uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Không có quyền hủy phiếu thu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.contribution_payments cp WHERE cp.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu thu không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Phiếu thu đã hủy trước đó.' USING ERRCODE = 'check_violation'; END IF;
  -- Phiếu thu không có bút toán (tiền điện nước) ⇒ không có gì để đảo
  IF v.ledger_entry_id IS NOT NULL THEN
    v_entry := app.uuid_v7();
    INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id,
                                       reversal_of_id, counterparty_member_id, description, created_by)
    VALUES (v_entry, v.fund_id, app.local_today(), 'out', v.amount_vnd, 'reversal', v.id,
            v.ledger_entry_id, v.member_id, 'Hủy phiếu thu: ' || p_reason, v_uid);
  END IF;
  UPDATE public.contribution_payments
     SET voided_at = now(), voided_by = v_uid, void_reason = p_reason, void_ledger_entry_id = v_entry
   WHERE id = p_payment_id;
  RETURN v_entry;
END
$$;
COMMENT ON FUNCTION app.fn_void_contribution_payment(uuid, text) IS
  'Hủy phiếu thu bằng bút toán đảo (out) + voided_* (phiếu điện nước không có bút toán ⇒ chỉ đánh dấu hủy); khoản phải thu tự trở về unpaid/partial nhờ trigger rollup. Không xóa dữ liệu.';

ALTER FUNCTION app.fn_record_contribution_payment(uuid, uuid, bigint, payment_method_t, date, text, jsonb, uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_void_contribution_payment(uuid, text) OWNER TO luuxa_definer;

-- ---------------------------------------------------------------------
-- [4] Xác nhận yêu cầu "đã đóng": chuyển khoản thiếu mã giao dịch không còn làm hỏng việc xác nhận
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_contribution_claim_decide(p_claim_id uuid, p_approve boolean, p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v         public.contribution_claims%ROWTYPE;
  v_ct      record;
  v_payment uuid;
  v_link    text;
  v_fund    uuid;
  v_ref     text;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Không có quyền xác nhận thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.contribution_claims c WHERE c.id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT ct.status::text AS status, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining, cp.name AS plan_name, cp.id AS plan_id,
         cp.fee_type::text AS fee_type, cp.fund_id AS plan_fund_id
    INTO v_ct
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE ct.id = v.contribution_id;
  v_link := '/thu-chi?tab=tong-quan&plan=' || v_ct.plan_id::text;

  IF p_approve THEN
    -- Điện nước không vào sổ quỹ nên không cần chọn túi quỹ: dùng túi quỹ của kế hoạch
    v_fund := COALESCE(p_fund_id, CASE WHEN v_ct.fee_type = 'utility' THEN v_ct.plan_fund_id END);
    IF v_fund IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    IF v_ct.status NOT IN ('unpaid', 'partial') OR v_ct.remaining <= 0 THEN
      RAISE EXCEPTION 'Khoản này không còn phải đóng (có thể đã được ghi thu).' USING ERRCODE = 'check_violation';
    END IF;
    -- Chuyển khoản bắt buộc có mã đối soát (ck_contribution_payments__bank_ref): người báo không có mã thì ghi "xác nhận thủ công"
    v_ref := v.reference_code;
    IF v.method = 'bank_transfer' AND NULLIF(btrim(COALESCE(v_ref, '')), '') IS NULL THEN
      v_ref := 'XAC-NHAN-THU-CONG';
    END IF;
    v_payment := app.fn_record_contribution_payment(
      v.member_id, v_fund, v_ct.remaining, v.method, app.local_today(), v_ref,
      jsonb_build_array(jsonb_build_object('contribution_id', v.contribution_id, 'amount_vnd', v_ct.remaining)),
      NULL, COALESCE(NULLIF(btrim(p_note), ''), 'Xác nhận thành viên báo đã đóng'));
    UPDATE public.contribution_claims
       SET status = 'confirmed', decided_by = v_uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''), payment_id = v_payment
     WHERE id = p_claim_id;
    PERFORM app.fn_notify(v.member_id, 'finance.claim_decided', 'Đã xác nhận bạn đóng ' || v_ct.plan_name,
      'Thủ quỹ đã ghi nhận ' || app.fn_vnd(v_ct.remaining) || '. Cảm ơn bạn!', jsonb_build_object('link', v_link), 'contribution_claims', p_claim_id);
  ELSE
    UPDATE public.contribution_claims
       SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
     WHERE id = p_claim_id;
    PERFORM app.fn_notify(v.member_id, 'finance.claim_decided', 'Chưa ghi nhận bạn đóng ' || v_ct.plan_name,
      'Thủ quỹ chưa nhận được khoản này' || COALESCE(': ' || NULLIF(btrim(p_note), ''), '') || '. Vui lòng kiểm tra lại hoặc liên hệ Thủ quỹ.',
      jsonb_build_object('link', v_link), 'contribution_claims', p_claim_id);
  END IF;
  RETURN v_payment;
END
$$;
COMMENT ON FUNCTION app.fn_contribution_claim_decide(uuid, boolean, uuid, text) IS
  'Xác nhận (ghi phiếu thu cho toàn bộ số còn lại) hoặc từ chối yêu cầu "đã đóng" của thành viên. Cần finance.contribution.record. Chuyển khoản không kèm mã ⇒ ghi "XAC-NHAN-THU-CONG". Khoản điện nước dùng túi quỹ của kế hoạch và không vào sổ quỹ.';
ALTER FUNCTION app.fn_contribution_claim_decide(uuid, boolean, uuid, text) OWNER TO luuxa_definer;

COMMIT;
