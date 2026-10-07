-- =====================================================================
-- 1031 — Tiền điện nước: (a) nhập theo SỐ TIỀN MỖI NGƯỜI (hệ thống tự tính tổng = mỗi người × số người đang ở),
--        (b) tùy chọn TRỪ QUỸ NGAY khi lập kế hoạch: tự lập một phiếu chi đã chi (hạng mục "Điện, Nước & Internet") bằng tổng hóa đơn;
--            anh em đóng thì ghi thu cộng lại quỹ như thường lệ. Hủy kế hoạch (chưa ai nộp) ⇒ tự đảo phiếu chi.
-- Idempotent. Không sửa db/app/993 (đã áp) — thay hàm bằng bản mới ở đây.
--   • contribution_plans.expense_voucher_id: phiếu chi tự lập từ kế hoạch (NULL nếu không trừ quỹ tự động).
--   • finance.utility.auto_expense_max_vnd: trần tổng hóa đơn được tự trừ quỹ (mặc định 10.000.000 đ). Lớn hơn ⇒ phải lập phiếu chi
--     thường để qua duyệt 1–2 chữ ký. Phiếu tự lập KHÔNG qua chữ ký duyệt (người lập kế hoạch thu = finance.contribution.plan.manage chịu
--     trách nhiệm; kế hoạch hiện công khai cho từng thành viên với số tiền phải đóng) nhưng được ghi kiểm toán và đảo được.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Cột + cấu hình
-- ---------------------------------------------------------------------
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS expense_voucher_id uuid REFERENCES public.expense_vouchers (id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.contribution_plans.expense_voucher_id IS
  'Phiếu chi do hệ thống tự lập (đã chi) khi kế hoạch điện nước được lập với "trừ quỹ ngay": số tiền = tổng hóa đơn. NULL = không trừ quỹ tự động (Thủ quỹ tự lập phiếu chi).';
CREATE INDEX IF NOT EXISTS ix_contribution_plans__expense_voucher ON public.contribution_plans (expense_voucher_id) WHERE expense_voucher_id IS NOT NULL;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('finance.utility.auto_expense_max_vnd', '10000000'::jsonb, 'vnd',
   'Tổng hóa đơn điện nước tối đa được TỰ TRỪ QUỸ khi lập kế hoạch thu điện nước (hệ thống tự lập phiếu chi đã chi). Vượt mức này phải lập phiếu chi thường để người quản lý duyệt.',
   100000, 1000000000, true, 'finance.settings.write', '10000000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- [2] Lập kế hoạch điện nước: thêm "mỗi người" + "trừ quỹ ngay" (thay bản 5 tham số của 993)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.fn_create_utility_plan(date, bigint, date, uuid, text);

CREATE OR REPLACE FUNCTION app.fn_create_utility_plan(
  p_month          date,
  p_bill_total_vnd bigint,
  p_due_date       date DEFAULT NULL,
  p_fund_id        uuid DEFAULT NULL,
  p_note           text DEFAULT NULL,
  p_per_person_vnd bigint DEFAULT NULL,
  p_auto_expense   boolean DEFAULT false,
  p_pay_method     payment_method_t DEFAULT 'cash'
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
  v_frow    public.funds%ROWTYPE;
  v_cat     uuid;
  v_vid     uuid;
  v_vno     text;
  v_entry   uuid;
  v_cap     bigint;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền lập kế hoạch thu tiền điện nước.' USING ERRCODE = 'insufficient_privilege';
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

  v_fund := app.fn_plan_fund(p_fund_id);

  -- Trừ quỹ ngay: kiểm điều kiện TRƯỚC khi ghi bất cứ thứ gì
  IF p_auto_expense THEN
    v_cap := app.setting_int('finance.utility.auto_expense_max_vnd');
    IF v_cap IS NOT NULL AND v_total > v_cap THEN
      RAISE EXCEPTION 'Tổng % đ vượt mức tự trừ quỹ tối đa % đ — hãy tắt "Trừ quỹ ngay" và lập phiếu chi thường để người quản lý duyệt.', v_total, v_cap
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_frow FROM public.funds f WHERE f.id = v_fund FOR UPDATE;
    IF v_frow.last_seq = 0 THEN
      RAISE EXCEPTION 'Quỹ chưa có số dư đầu kỳ — hãy nhập "Số dư đầu kỳ" trước, hoặc tắt "Trừ quỹ ngay".' USING ERRCODE = 'check_violation';
    END IF;
    SELECT c.id INTO v_cat FROM public.categories c WHERE c.kind = 'expense' AND c.code = 'UTILITY' AND c.deleted_at IS NULL;
    IF v_cat IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy danh mục chi "Điện, Nước & Internet" để lập phiếu chi tự động.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  v_code := app.fn_next_plan_code('DN-' || to_char(v_month, 'YYYY-MM'));
  v_name := 'Điện nước tháng ' || to_char(v_month, 'MM/YYYY');
  INSERT INTO public.contribution_plans (code, name, fee_type, academic_year_id, period_month, amount_vnd, due_date, fund_id, created_by,
                                         bill_total_vnd, split_count, note)
  VALUES (v_code, v_name, 'utility',
          (SELECT ay.id FROM public.academic_years ay WHERE v_month BETWEEN ay.starts_on AND ay.ends_on ORDER BY ay.starts_on LIMIT 1),
          v_month, v_amount, v_due, v_fund, v_uid, v_total, v_n, v_note)
  RETURNING id INTO v_id;
  v_gen := app.fn_generate_contributions(v_id);
  IF v_gen <> v_n THEN
    RAISE EXCEPTION 'Số khoản phải thu sinh ra (%) khác số người chia (%) — vui lòng thử lại.', v_gen, v_n USING ERRCODE = 'serialization_failure';
  END IF;

  -- Phiếu chi tự lập (draft → chờ duyệt → duyệt → đã chi trong một giao dịch) + bút toán chi ở sổ quỹ (BR-FIN-06/07 kiểm bởi trigger sổ cái)
  IF p_auto_expense THEN
    INSERT INTO public.expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, payee_name, note, no_receipt_reason, requested_by)
    VALUES (v_name, v_total, v_cat, app.local_today(), v_fund, 'Hóa đơn điện nước',
            left('Tự lập khi lập kế hoạch thu ' || v_code || ': trừ quỹ trước, anh em đóng sẽ cộng lại quỹ.', 1000),
            'Phiếu tự lập từ kế hoạch thu ' || v_code || ' (hóa đơn gốc do Thủ quỹ lưu)', v_uid)
    RETURNING id, voucher_no INTO v_vid, v_vno;
    PERFORM set_config('app.status_reason', 'Tự lập từ kế hoạch thu ' || v_code, true);
    UPDATE public.expense_vouchers SET status = 'pending_approval' WHERE id = v_vid;
    PERFORM set_config('app.status_reason', 'Tự duyệt: phiếu sinh từ kế hoạch thu ' || v_code, true);
    UPDATE public.expense_vouchers SET status = 'approved' WHERE id = v_vid;
    v_entry := app.uuid_v7();
    INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, description, created_by)
    VALUES (v_entry, v_fund, app.local_today(), 'out', v_total, 'expense', v_vid,
            left('Chi ' || v_vno || ': ' || v_name || ' (trừ quỹ trước, thu lại theo kế hoạch ' || v_code || ')', 500), v_uid);
    PERFORM set_config('app.status_reason', 'Đã chi: trừ quỹ khi lập kế hoạch thu ' || v_code, true);
    UPDATE public.expense_vouchers
       SET status = 'paid', paid_at = now(), paid_recorded_by = v_uid, payment_method = p_pay_method, ledger_entry_id = v_entry
     WHERE id = v_vid;
    UPDATE public.contribution_plans SET expense_voucher_id = v_vid WHERE id = v_id;
    PERFORM app.write_audit('OTHER', 'contribution_plans', v_id::text,
      'UTILITY_PLAN_AUTO_EXPENSE: tự lập phiếu chi ' || v_vno || ' khi lập kế hoạch thu ' || v_code, NULL,
      jsonb_build_object('voucher_id', v_vid, 'voucher_no', v_vno, 'amount_vnd', v_total, 'fund_id', v_fund, 'ledger_entry_id', v_entry));
  END IF;

  RETURN jsonb_build_object('plan_id', v_id, 'code', v_code, 'name', v_name, 'generated', v_gen, 'amount_vnd', v_amount,
                            'split_count', v_n, 'bill_total_vnd', v_total, 'remainder_vnd', v_amount * v_n - v_total,
                            'due_date', v_due, 'expense_voucher_no', v_vno, 'expense_vnd', CASE WHEN v_vid IS NOT NULL THEN v_total END);
END
$$;
COMMENT ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t) IS
  'Lập kế hoạch tiền điện nước tháng p_month cho n người đang ở. Nhập MỘT trong hai: p_bill_total_vnd (mỗi người = ceil(tổng/n/1000)×1000) hoặc p_per_person_vnd (tổng = mỗi người × n). p_auto_expense ⇒ tự lập phiếu chi đã chi (hạng mục UTILITY) bằng tổng, trừ quỹ ngay (≤ finance.utility.auto_expense_max_vnd, quỹ phải có số dư đầu kỳ); kế hoạch giữ expense_voucher_id.';

ALTER FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text, bigint, boolean, payment_method_t)
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- [3] Hủy kế hoạch (chưa ai nộp): nếu đã tự trừ quỹ ⇒ đảo phiếu chi (bút toán thu lại vào quỹ)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_cancel_contribution_plan(p_plan_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_plan  public.contribution_plans%ROWTYPE;
  v_v     public.expense_vouchers%ROWTYPE;
  v_entry uuid;
  v_n     integer;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy kế hoạch thu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_text(p_reason, 5) THEN
    RAISE EXCEPTION 'Lý do hủy kế hoạch tối thiểu 5 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_plan FROM public.contribution_plans cp WHERE cp.id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kế hoạch thu không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_plan.status = 'cancelled' THEN
    RAISE EXCEPTION 'Kế hoạch "%" đã hủy trước đó.', v_plan.name USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contributions ct WHERE ct.plan_id = p_plan_id AND ct.paid_vnd > 0) THEN
    RAISE EXCEPTION 'Kế hoạch "%" đã có người nộp tiền — hủy các phiếu thu liên quan trước rồi mới hủy kế hoạch.', v_plan.name
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.contributions SET status = 'cancelled' WHERE plan_id = p_plan_id AND status <> 'cancelled';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.contribution_plans SET status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason) WHERE id = p_plan_id;

  -- Đã tự trừ quỹ khi lập kế hoạch ⇒ hoàn lại quỹ bằng bút toán đảo (không xóa bút toán chi)
  IF v_plan.expense_voucher_id IS NOT NULL THEN
    SELECT * INTO v_v FROM public.expense_vouchers ev WHERE ev.id = v_plan.expense_voucher_id FOR UPDATE;
    IF FOUND AND v_v.status = 'paid' THEN
      v_entry := app.uuid_v7();
      INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, reversal_of_id,
                                         counterparty_member_id, description, created_by)
      VALUES (v_entry, v_v.fund_id, app.local_today(), 'in', v_v.amount_vnd, 'reversal', v_v.id, v_v.ledger_entry_id, v_v.paid_by_member_id,
              left('Đảo phiếu chi ' || v_v.voucher_no || ': hủy kế hoạch thu ' || v_plan.code || ' — ' || btrim(p_reason), 500), app.current_user_id());
      PERFORM set_config('app.status_reason', left('Hủy kế hoạch thu ' || v_plan.code || ': ' || btrim(p_reason), 500), true);
      UPDATE public.expense_vouchers SET status = 'reversed', reversal_entry_id = v_entry WHERE id = v_v.id;
    END IF;
  END IF;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_cancel_contribution_plan(uuid, text) IS
  'Hủy kế hoạch thu chưa có ai nộp tiền (cần finance.contribution.plan.manage + lý do ≥ 5 ký tự): khoản phải thu → cancelled, kế hoạch → cancelled (giữ để kiểm toán); nếu kế hoạch điện nước đã tự trừ quỹ thì đảo phiếu chi (bút toán thu lại vào quỹ).';

COMMIT;
