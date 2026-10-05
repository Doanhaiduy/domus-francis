-- =====================================================================
-- 993 — Thu chi: QUỸ ĐỊNH KỲ (nhiều tháng/kỳ), TIỀN ĐIỆN NƯỚC HẰNG THÁNG (chia đều), TÀI KHOẢN NHẬN TIỀN + MÃ QR.
-- Chạy SAU 991 (giá trị enum fee_type_t 'periodic_dues' / 'utility'). Idempotent (chạy lại nhiều lần được).
--   1. contribution_plans: cột period_end_month (tháng cuối kỳ), bill_total_vnd + split_count (tổng hóa đơn điện nước / số người
--      chia), note, cancelled_at + cancel_reason; ràng buộc; chống trùng kỳ (BR-FIN-13) bằng index duy nhất.
--   2. Khóa cấu hình mới finance.dues_cycle_* / finance.utility_due_day / finance.receiving_account (JSON, công khai).
--      Tài khoản nhận quỹ: Thủ quỹ + Trưởng nhà sửa được (quyền finance.contribution.plan.manage — người lập kế hoạch thu
--      quyết định nơi nhận tiền); Admin kỹ thuật KHÔNG có quyền này nên không đổi được nơi nhận tiền.
--   3. Hàm nghiệp vụ SECURITY DEFINER: lập kỳ quỹ / lập kế hoạch điện nước (chia đều, làm tròn LÊN 1.000 đ) / hủy kế hoạch
--      chưa ai nộp / số liệu tổng hợp của một kế hoạch cho thành viên thường / số người đang ở được tính khoản thu.
--   4. Bảng member_payment_accounts — tài khoản nhận tiền (STK + ảnh QR) của từng thành viên, để chuyển khoản/hoàn ứng cho nhau.
--   5. Ảnh mã QR tải lên (storage_files): chính sách SELECT + đánh dấu attached_at khi gắn (không bị dọn như tệp mồ côi);
--      chỉ gắn được ảnh do CHÍNH người sửa tải lên (chặn lấy mã tệp riêng tư của người khác để "công khai" nó).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] contribution_plans — cột + ràng buộc
-- ---------------------------------------------------------------------
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS period_end_month date;
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS bill_total_vnd   bigint;
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS split_count      integer;
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS note             text;
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS cancelled_at     timestamptz;
ALTER TABLE public.contribution_plans ADD COLUMN IF NOT EXISTS cancel_reason    text;

COMMENT ON COLUMN public.contribution_plans.period_end_month IS
  'Tháng cuối kỳ (ngày 01) của quỹ định kỳ (periodic_dues); period_month = tháng đầu kỳ. NULL với kế hoạch một tháng.';
COMMENT ON COLUMN public.contribution_plans.bill_total_vnd IS
  'Tiền điện nước (utility): TỔNG hóa đơn điện + nước của cả nhà do Thủ quỹ nhập. amount_vnd = làm tròn LÊN tới 1.000 đ của bill_total_vnd / split_count; phần dư = amount_vnd × split_count − bill_total_vnd.';
COMMENT ON COLUMN public.contribution_plans.split_count IS
  'Tiền điện nước: số thành viên đang ở được chia (cùng tiêu chí với fn_generate_contributions) tại thời điểm lập kế hoạch.';
COMMENT ON COLUMN public.contribution_plans.note IS 'Ghi chú kế hoạch (vd. "Điện 1.180.000 + nước 670.000").';
COMMENT ON COLUMN public.contribution_plans.cancel_reason IS 'Lý do hủy kế hoạch (chỉ hủy được khi chưa ai nộp tiền — app.fn_cancel_contribution_plan).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contribution_plans'::regclass AND conname = 'ck_contribution_plans__end_month') THEN
    ALTER TABLE public.contribution_plans ADD CONSTRAINT ck_contribution_plans__end_month CHECK (
      period_end_month IS NULL
      OR (period_end_month = date_trunc('month', period_end_month)::date AND period_month IS NOT NULL AND period_end_month >= period_month));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contribution_plans'::regclass AND conname = 'ck_contribution_plans__periodic') THEN
    ALTER TABLE public.contribution_plans ADD CONSTRAINT ck_contribution_plans__periodic CHECK (
      fee_type <> 'periodic_dues' OR (period_month IS NOT NULL AND period_end_month IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contribution_plans'::regclass AND conname = 'ck_contribution_plans__utility') THEN
    ALTER TABLE public.contribution_plans ADD CONSTRAINT ck_contribution_plans__utility CHECK (
      fee_type <> 'utility' OR (period_month IS NOT NULL AND bill_total_vnd IS NOT NULL AND split_count IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contribution_plans'::regclass AND conname = 'ck_contribution_plans__bill') THEN
    -- Mỗi người × số người phải phủ đủ hóa đơn và phần dư (do làm tròn) nhỏ hơn 1.000 đ/người
    ALTER TABLE public.contribution_plans ADD CONSTRAINT ck_contribution_plans__bill CHECK (
      (bill_total_vnd IS NULL) = (split_count IS NULL)
      AND (bill_total_vnd IS NULL OR (
            bill_total_vnd > 0 AND split_count > 0
        AND amount_vnd::numeric * split_count >= bill_total_vnd
        AND amount_vnd::numeric * split_count < bill_total_vnd + split_count::numeric * 1000)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contribution_plans'::regclass AND conname = 'ck_contribution_plans__note') THEN
    ALTER TABLE public.contribution_plans ADD CONSTRAINT ck_contribution_plans__note CHECK (note IS NULL OR char_length(note) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contribution_plans'::regclass AND conname = 'ck_contribution_plans__cancel') THEN
    ALTER TABLE public.contribution_plans ADD CONSTRAINT ck_contribution_plans__cancel CHECK (
      (status = 'cancelled' OR (cancelled_at IS NULL AND cancel_reason IS NULL))
      AND (cancel_reason IS NULL OR app.has_text(cancel_reason, 5)));
  END IF;
END
$$;

-- BR-FIN-13 mở rộng: mỗi kỳ quỹ / mỗi tháng điện nước chỉ một kế hoạch còn hiệu lực (chống sinh khoản phải thu trùng khi bấm đúp)
CREATE UNIQUE INDEX IF NOT EXISTS ux_contribution_plans__cycle ON public.contribution_plans (fee_type, period_month)
  WHERE fee_type IN ('periodic_dues', 'utility') AND status <> 'cancelled';
COMMENT ON INDEX public.ux_contribution_plans__cycle IS
  'Mỗi kỳ quỹ định kỳ (theo tháng đầu kỳ) và mỗi tháng tiền điện nước chỉ một kế hoạch chưa hủy (BR-FIN-13). Chồng lấn giữa các kỳ quỹ được hàm app.fn_create_dues_cycle_plan chặn thêm.';

-- ---------------------------------------------------------------------
-- [2] Khóa cấu hình mới (công khai: thành viên cần biết mức quỹ, hạn nộp, nơi chuyển khoản)
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('finance.dues_cycle_months', '6'::jsonb, 'integer',
   'Số tháng của một kỳ quỹ định kỳ (mặc định 6 — mỗi năm đóng 2 lần).', 1, 12, true, 'finance.settings.write', '6'::jsonb),
  ('finance.dues_cycle_amount_vnd', '300000'::jsonb, 'vnd',
   'Mức quỹ mỗi kỳ của một thành viên (VNĐ). Mặc định 300.000 đ / 6 tháng ⇒ 600.000 đ / năm.', 1000, 50000000, true, 'finance.settings.write', '300000'::jsonb),
  ('finance.dues_cycle_start_month', '1'::jsonb, 'integer',
   'Tháng bắt đầu kỳ quỹ đầu tiên trong năm (1 ⇒ các kỳ T1–T6, T7–T12; 9 ⇒ các kỳ T9–T2, T3–T8).', 1, 12, true, 'finance.settings.write', '1'::jsonb),
  ('finance.dues_cycle_due_day', '15'::jsonb, 'integer',
   'Hạn nộp quỹ định kỳ: ngày này của tháng đầu kỳ (1–28).', 1, 28, true, 'finance.settings.write', '15'::jsonb),
  ('finance.utility_due_day', '10'::jsonb, 'integer',
   'Hạn nộp tiền điện nước: ngày này của tháng SAU tháng hóa đơn (1–28).', 1, 28, true, 'finance.settings.write', '10'::jsonb),
  ('finance.receiving_account', '{"bankBin": "", "bankName": "", "accountNo": "", "accountName": "", "qrFileId": null}'::jsonb, 'json',
   'Tài khoản nhận quỹ của nhà (thường là tài khoản Thủ quỹ): mã ngân hàng (BIN 6 số), tên ngân hàng, số tài khoản, chủ tài khoản, ảnh mã QR (tùy chọn). Thành viên dùng để chuyển khoản nộp quỹ (mã VietQR có sẵn số tiền + nội dung). Thủ quỹ / Trưởng nhà sửa; Admin kỹ thuật không đổi được nơi nhận tiền.',
   NULL, NULL, true, 'finance.contribution.plan.manage',
   '{"bankBin": "", "bankName": "", "accountNo": "", "accountName": "", "qrFileId": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- [3] Hàm tiện ích + nghiệp vụ
-- ---------------------------------------------------------------------
-- Kỳ quỹ chứa một ngày, theo cấu hình (số tháng mỗi kỳ + tháng bắt đầu). Căn theo chỉ số tháng tuyệt đối nên đúng cả khi kỳ vắt qua năm.
CREATE OR REPLACE FUNCTION app.fn_dues_cycle_bounds(p_day date)
RETURNS TABLE (start_month date, end_month date)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_len   integer := LEAST(12, GREATEST(1, app.setting_int('finance.dues_cycle_months')::int));
  v_first integer := LEAST(12, GREATEST(1, app.setting_int('finance.dues_cycle_start_month')::int));
  v_idx   integer;
  v_off   integer;
BEGIN
  v_idx := extract(year FROM p_day)::int * 12 + extract(month FROM p_day)::int - 1;
  v_off := (((v_idx - (v_first - 1)) % v_len) + v_len) % v_len;
  start_month := make_date((v_idx - v_off) / 12, (v_idx - v_off) % 12 + 1, 1);
  end_month := (start_month + make_interval(months => v_len - 1))::date;
  RETURN NEXT;
END
$$;
COMMENT ON FUNCTION app.fn_dues_cycle_bounds(date) IS
  'Kỳ quỹ định kỳ (tháng đầu, tháng cuối — ngày 01) chứa p_day theo finance.dues_cycle_months + finance.dues_cycle_start_month.';

-- "T7–T12/2026", "T9/2026–T2/2027", "T7/2026" (kỳ một tháng)
CREATE OR REPLACE FUNCTION app.fn_month_range_label(p_start date, p_end date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE
           WHEN p_end IS NULL OR p_end = p_start THEN format('T%s/%s', extract(month FROM p_start)::int, extract(year FROM p_start)::int)
           WHEN extract(year FROM p_start) = extract(year FROM p_end)
             THEN format('T%s–T%s/%s', extract(month FROM p_start)::int, extract(month FROM p_end)::int, extract(year FROM p_start)::int)
           ELSE format('T%s/%s–T%s/%s', extract(month FROM p_start)::int, extract(year FROM p_start)::int,
                       extract(month FROM p_end)::int, extract(year FROM p_end)::int)
         END
$$;

-- Mã kế hoạch chưa dùng (mã cũ của kế hoạch đã hủy vẫn chiếm chỗ do ux_contribution_plans__code): QUY-2026-07, QUY-2026-07-2, …
CREATE OR REPLACE FUNCTION app.fn_next_plan_code(p_base text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_code text := p_base;
  v_n    integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.contribution_plans cp WHERE cp.code = v_code) LOOP
    v_n := v_n + 1;
    v_code := p_base || '-' || v_n;
  END LOOP;
  RETURN v_code;
END
$$;

-- Số thành viên sẽ được sinh khoản phải thu nếu hạn nộp là p_due_date (ĐÚNG tiêu chí của app.fn_generate_contributions)
CREATE OR REPLACE FUNCTION app.fn_billable_member_count(p_due_date date)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.lacks_permission('finance.summary.read') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem tình hình quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (SELECT count(*)::int FROM public.members m
           WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= p_due_date);
END
$$;
COMMENT ON FUNCTION app.fn_billable_member_count(date) IS
  'Số thành viên đang ở (status=active, gia nhập trước hạn) — cùng tiêu chí sinh khoản phải thu; dùng để xem trước phép chia tiền điện nước.';

-- Túi quỹ nhận mặc định: quỹ tiền mặt đang hoạt động đầu tiên; túi quỹ chỉ định phải còn hoạt động và không phải quỹ sự kiện
CREATE OR REPLACE FUNCTION app.fn_plan_fund(p_fund_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_fund_id IS NULL THEN
    SELECT f.id INTO v_id FROM public.funds f
     WHERE f.fund_type = 'cash' AND f.is_active AND f.deleted_at IS NULL ORDER BY f.code LIMIT 1;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Chưa có túi quỹ tiền mặt để nhận tiền.' USING ERRCODE = 'no_data_found';
    END IF;
    RETURN v_id;
  END IF;
  SELECT f.id INTO v_id FROM public.funds f
   WHERE f.id = p_fund_id AND f.is_active AND f.deleted_at IS NULL AND f.fund_type <> 'event';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Túi quỹ nhận tiền không tồn tại hoặc đã ngừng hoạt động.' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_id;
END
$$;

-- Lập kế hoạch QUỸ ĐỊNH KỲ cho kỳ chứa p_start_month (mặc định: kỳ hiện tại) + sinh khoản phải thu.
-- Mức thu lấy từ finance.dues_cycle_amount_vnd (Trưởng nhà cấu hình) — người lập kế hoạch không tự đặt mức khác.
CREATE OR REPLACE FUNCTION app.fn_create_dues_cycle_plan(p_start_month date DEFAULT NULL, p_due_date date DEFAULT NULL, p_fund_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_len      integer;
  v_amount   bigint;
  v_due_day  integer;
  v_start    date;
  v_end      date;
  v_cur      date;
  v_due      date;
  v_fund     uuid;
  v_code     text;
  v_name     text;
  v_clash    text;
  v_id       uuid;
  v_n        integer;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền lập kế hoạch thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_len := LEAST(12, GREATEST(1, app.setting_int('finance.dues_cycle_months')::int));
  v_amount := app.setting_int('finance.dues_cycle_amount_vnd');
  v_due_day := LEAST(28, GREATEST(1, app.setting_int('finance.dues_cycle_due_day')::int));
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Chưa cấu hình mức quỹ mỗi kỳ (Cài đặt → Quản lý quỹ).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.start_month, b.end_month INTO v_start, v_end FROM app.fn_dues_cycle_bounds(COALESCE(p_start_month, app.local_today())) b;
  IF p_start_month IS NOT NULL AND date_trunc('month', p_start_month)::date <> v_start THEN
    RAISE EXCEPTION 'Kỳ quỹ phải bắt đầu từ tháng đầu kỳ theo cấu hình: tháng % thuộc kỳ %.',
      to_char(p_start_month, 'MM/YYYY'), app.fn_month_range_label(v_start, v_end) USING ERRCODE = 'check_violation';
  END IF;
  SELECT b.start_month INTO v_cur FROM app.fn_dues_cycle_bounds(app.local_today()) b;
  IF v_start > (v_cur + make_interval(months => v_len))::date THEN
    RAISE EXCEPTION 'Chỉ lập trước được kỳ quỹ kế tiếp (kỳ hiện tại bắt đầu T%/%).', extract(month FROM v_cur)::int, extract(year FROM v_cur)::int
      USING ERRCODE = 'check_violation';
  END IF;

  v_due := COALESCE(p_due_date, make_date(extract(year FROM v_start)::int, extract(month FROM v_start)::int, v_due_day));
  IF v_due < v_start OR v_due > (v_end + interval '1 month' - interval '1 day')::date THEN
    RAISE EXCEPTION 'Hạn nộp phải nằm trong kỳ quỹ %.', app.fn_month_range_label(v_start, v_end) USING ERRCODE = 'check_violation';
  END IF;

  -- Khóa theo loại kế hoạch: hai người bấm cùng lúc không tạo được hai kỳ chồng nhau
  PERFORM pg_advisory_xact_lock(hashtext('contribution_plans:periodic_dues'));
  SELECT cp.name INTO v_clash FROM public.contribution_plans cp
   WHERE cp.fee_type = 'periodic_dues' AND cp.status <> 'cancelled'
     AND cp.period_month <= v_end AND COALESCE(cp.period_end_month, cp.period_month) >= v_start
   LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'BR-FIN-13: đã có kế hoạch "%" trùng thời gian với kỳ % — mỗi kỳ chỉ một kế hoạch thu quỹ.', v_clash, app.fn_month_range_label(v_start, v_end)
      USING ERRCODE = 'unique_violation';
  END IF;

  v_fund := app.fn_plan_fund(p_fund_id);
  v_code := app.fn_next_plan_code('QUY-' || to_char(v_start, 'YYYY-MM'));
  v_name := 'Quỹ kỳ ' || app.fn_month_range_label(v_start, v_end);
  INSERT INTO public.contribution_plans (code, name, fee_type, academic_year_id, period_month, period_end_month, amount_vnd, due_date, fund_id, created_by)
  VALUES (v_code, v_name, 'periodic_dues',
          (SELECT ay.id FROM public.academic_years ay WHERE v_start BETWEEN ay.starts_on AND ay.ends_on ORDER BY ay.starts_on LIMIT 1),
          v_start, v_end, v_amount, v_due, v_fund, app.current_user_id())
  RETURNING id INTO v_id;
  v_n := app.fn_generate_contributions(v_id);
  RETURN jsonb_build_object('plan_id', v_id, 'code', v_code, 'name', v_name, 'generated', v_n,
                            'amount_vnd', v_amount, 'due_date', v_due, 'start_month', v_start, 'end_month', v_end);
END
$$;
COMMENT ON FUNCTION app.fn_create_dues_cycle_plan(date, date, uuid) IS
  'Lập kế hoạch quỹ định kỳ (periodic_dues) cho kỳ chứa p_start_month (mặc định kỳ hiện tại; lập trước tối đa kỳ kế tiếp): mức = finance.dues_cycle_amount_vnd, hạn mặc định ngày finance.dues_cycle_due_day của tháng đầu kỳ; chặn kỳ chồng lấn (BR-FIN-13, 23505); sinh khoản phải thu cho mọi thành viên đang ở.';

-- Lập kế hoạch TIỀN ĐIỆN NƯỚC tháng p_month: chia đều tổng hóa đơn cho số người đang ở, mỗi người làm tròn LÊN tới 1.000 đ.
CREATE OR REPLACE FUNCTION app.fn_create_utility_plan(p_month date, p_bill_total_vnd bigint, p_due_date date DEFAULT NULL,
                                                      p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_month   date := date_trunc('month', p_month)::date;
  v_due     date;
  v_n       integer;
  v_amount  bigint;
  v_fund    uuid;
  v_code    text;
  v_name    text;
  v_id      uuid;
  v_gen     integer;
  v_note    text := NULLIF(btrim(p_note), '');
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền lập kế hoạch thu tiền điện nước.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_month IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn tháng hóa đơn điện nước.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_bill_total_vnd IS NULL OR p_bill_total_vnd <= 0 OR p_bill_total_vnd > 1000000000 THEN
    RAISE EXCEPTION 'Tổng hóa đơn điện nước phải lớn hơn 0 và tối đa 1.000.000.000 đ.' USING ERRCODE = 'check_violation';
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
  v_amount := ((p_bill_total_vnd + v_n::bigint * 1000 - 1) / (v_n::bigint * 1000)) * 1000;   -- làm tròn LÊN tới 1.000 đ

  v_fund := app.fn_plan_fund(p_fund_id);
  v_code := app.fn_next_plan_code('DN-' || to_char(v_month, 'YYYY-MM'));
  v_name := 'Điện nước tháng ' || to_char(v_month, 'MM/YYYY');
  INSERT INTO public.contribution_plans (code, name, fee_type, academic_year_id, period_month, amount_vnd, due_date, fund_id, created_by,
                                         bill_total_vnd, split_count, note)
  VALUES (v_code, v_name, 'utility',
          (SELECT ay.id FROM public.academic_years ay WHERE v_month BETWEEN ay.starts_on AND ay.ends_on ORDER BY ay.starts_on LIMIT 1),
          v_month, v_amount, v_due, v_fund, app.current_user_id(), p_bill_total_vnd, v_n, v_note)
  RETURNING id INTO v_id;
  v_gen := app.fn_generate_contributions(v_id);
  IF v_gen <> v_n THEN
    RAISE EXCEPTION 'Số khoản phải thu sinh ra (%) khác số người chia (%) — vui lòng thử lại.', v_gen, v_n USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN jsonb_build_object('plan_id', v_id, 'code', v_code, 'name', v_name, 'generated', v_gen, 'amount_vnd', v_amount,
                            'split_count', v_n, 'bill_total_vnd', p_bill_total_vnd, 'remainder_vnd', v_amount * v_n - p_bill_total_vnd,
                            'due_date', v_due);
END
$$;
COMMENT ON FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text) IS
  'Lập kế hoạch tiền điện nước (utility) tháng p_month: n = số thành viên đang ở (tiêu chí fn_generate_contributions), mỗi người = ceil(tổng / n / 1000) × 1000; lưu bill_total_vnd + split_count; hạn mặc định ngày finance.utility_due_day của tháng sau; một tháng một kế hoạch (BR-FIN-13, 23505).';

-- Hủy kế hoạch thu khi CHƯA ai nộp (vd. nhập sai tổng hóa đơn) — khoản phải thu chuyển cancelled, kế hoạch giữ lại để kiểm toán
CREATE OR REPLACE FUNCTION app.fn_cancel_contribution_plan(p_plan_id uuid, p_reason text)
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
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_cancel_contribution_plan(uuid, text) IS
  'Hủy kế hoạch thu chưa có ai nộp tiền (cần finance.contribution.plan.manage + lý do ≥ 5 ký tự): khoản phải thu → cancelled, kế hoạch → cancelled (giữ để kiểm toán). Sau đó lập lại được kế hoạch cho cùng kỳ/tháng.';

-- Số liệu tổng hợp một kế hoạch (đã thu / phải thu) cho người chỉ thấy khoản của mình — không lộ tên ai
CREATE OR REPLACE FUNCTION app.fn_contribution_plan_totals(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.lacks_permission('finance.summary.read') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem tình hình quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (SELECT jsonb_build_object('expected_vnd', COALESCE(sum(ct.amount_due_vnd - ct.discount_vnd), 0),
                                    'collected_vnd', COALESCE(sum(ct.paid_vnd), 0))
            FROM public.contributions ct WHERE ct.plan_id = p_plan_id AND ct.status <> 'cancelled');
END
$$;
COMMENT ON FUNCTION app.fn_contribution_plan_totals(uuid) IS
  'Tổng phải thu (đã trừ miễn giảm) / đã thu của một kế hoạch — cho thành viên thường (RLS chỉ cho thấy khoản của chính mình). Cần finance.summary.read.';

-- Gắn ảnh mã QR: tệp phải sẵn sàng, là ảnh, do CHÍNH người đang sửa tải lên; đánh dấu attached_at (không bị dọn như tệp mồ côi)
CREATE OR REPLACE FUNCTION app.fn_attach_qr_file(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v record;
BEGIN
  SELECT f.status, f.detected_mime, f.uploaded_by, f.deleted_at INTO v FROM public.storage_files f WHERE f.id = p_file_id FOR UPDATE;
  IF NOT FOUND OR v.deleted_at IS NOT NULL OR v.status <> 'ready' THEN
    RAISE EXCEPTION 'Ảnh mã QR không tồn tại hoặc chưa tải lên xong.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v.detected_mime IS NULL OR v.detected_mime NOT LIKE 'image/%' THEN
    RAISE EXCEPTION 'Mã QR phải là ảnh (JPG, PNG hoặc WEBP).' USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL AND v.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'Chỉ gắn được ảnh mã QR do chính bạn tải lên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()) WHERE id = p_file_id;
END
$$;
COMMENT ON FUNCTION app.fn_attach_qr_file(uuid) IS 'Nội bộ (trigger): kiểm tra + đánh dấu attached_at cho ảnh mã QR được gắn vào tài khoản nhận tiền.';

-- ---------------------------------------------------------------------
-- [4] Tài khoản nhận quỹ của nhà (settings finance.receiving_account): chuẩn hóa + kiểm tra JSON, gắn ảnh QR
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_settings_receiving_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_bin  text;
  v_bank text;
  v_no   text;
  v_name text;
  v_qr   text;
BEGIN
  IF jsonb_typeof(NEW.value) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Tài khoản nhận quỹ không hợp lệ.' USING ERRCODE = 'check_violation';
  END IF;
  v_bin  := btrim(COALESCE(NEW.value ->> 'bankBin', ''));
  v_bank := btrim(COALESCE(NEW.value ->> 'bankName', ''));
  v_no   := regexp_replace(COALESCE(NEW.value ->> 'accountNo', ''), '\s', '', 'g');
  v_name := btrim(COALESCE(NEW.value ->> 'accountName', ''));
  v_qr   := NULLIF(btrim(COALESCE(NEW.value ->> 'qrFileId', '')), '');
  IF v_bin <> '' AND v_bin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Mã ngân hàng (BIN) phải gồm đúng 6 chữ số.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_no <> '' AND v_no !~ '^[0-9A-Za-z]{4,19}$' THEN
    RAISE EXCEPTION 'Số tài khoản chỉ gồm chữ số/chữ cái, từ 4 đến 19 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_bank) > 100 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Tên ngân hàng / chủ tài khoản tối đa 100 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_qr IS NOT NULL AND v_qr !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Mã ảnh QR không hợp lệ.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_qr IS NOT NULL AND v_qr IS DISTINCT FROM (OLD.value ->> 'qrFileId') THEN
    PERFORM app.fn_attach_qr_file(v_qr::uuid);
  END IF;
  NEW.value := jsonb_build_object('bankBin', v_bin, 'bankName', v_bank, 'accountNo', v_no, 'accountName', v_name, 'qrFileId', v_qr);
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_settings_receiving_account() IS
  'BEFORE UPDATE settings (khóa finance.receiving_account): chỉ giữ các trường bankBin/bankName/accountNo/accountName/qrFileId, kiểm tra định dạng (BIN 6 số, STK 4–19 ký tự), gắn ảnh QR (do chính người sửa tải lên).';

DROP TRIGGER IF EXISTS trg_settings__receiving_account ON public.settings;
CREATE TRIGGER trg_settings__receiving_account BEFORE UPDATE ON public.settings
  FOR EACH ROW WHEN (NEW.key = 'finance.receiving_account') EXECUTE FUNCTION app.tg_settings_receiving_account();

-- ---------------------------------------------------------------------
-- [5] member_payment_accounts — tài khoản nhận tiền của từng thành viên
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_payment_accounts (
  member_id     uuid        PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  bank_bin      text,
  bank_name     text        NOT NULL,
  account_no    text        NOT NULL,
  account_name  text        NOT NULL,
  qr_file_id    uuid        REFERENCES public.storage_files(id) ON DELETE SET NULL,
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT ck_member_payment_accounts__bin  CHECK (bank_bin IS NULL OR bank_bin ~ '^[0-9]{6}$'),
  CONSTRAINT ck_member_payment_accounts__bank CHECK (char_length(btrim(bank_name)) BETWEEN 2 AND 100),
  CONSTRAINT ck_member_payment_accounts__no   CHECK (account_no ~ '^[0-9A-Za-z]{4,19}$'),
  CONSTRAINT ck_member_payment_accounts__name CHECK (char_length(btrim(account_name)) BETWEEN 2 AND 100),
  CONSTRAINT ck_member_payment_accounts__note CHECK (note IS NULL OR char_length(note) <= 300)
);
COMMENT ON TABLE public.member_payment_accounts IS
  'Tài khoản nhận tiền của một thành viên (ngân hàng / ví + STK + chủ tài khoản + ảnh QR tùy chọn) — để anh em chuyển khoản, Thủ quỹ hoàn ứng. Mọi thành viên có member.read xem được; chỉ chính chủ hoặc người có member.update sửa/xóa. bank_bin NULL khi không phải ngân hàng NAPAS (vd. ví điện tử) — khi đó chỉ dùng ảnh QR tải lên.';
CREATE INDEX IF NOT EXISTS ix_member_payment_accounts__qr_file_id ON public.member_payment_accounts (qr_file_id);
CREATE INDEX IF NOT EXISTS ix_member_payment_accounts__updated_by ON public.member_payment_accounts (updated_by);

CREATE OR REPLACE FUNCTION app.tg_member_payment_account_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'Không được chuyển tài khoản nhận tiền sang thành viên khác.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.bank_bin     := NULLIF(btrim(NEW.bank_bin), '');
  NEW.bank_name    := btrim(NEW.bank_name);
  NEW.account_no   := regexp_replace(COALESCE(NEW.account_no, ''), '\s', '', 'g');
  NEW.account_name := btrim(NEW.account_name);
  NEW.note         := NULLIF(btrim(NEW.note), '');
  NEW.updated_by   := COALESCE(app.current_user_id(), NEW.updated_by);
  IF NEW.qr_file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.qr_file_id IS DISTINCT FROM OLD.qr_file_id) THEN
    PERFORM app.fn_attach_qr_file(NEW.qr_file_id);
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_member_payment_account_before() IS
  'BEFORE INSERT/UPDATE member_payment_accounts: chuẩn hóa chuỗi, không đổi chủ tài khoản, ghi updated_by, gắn ảnh QR (do chính người sửa tải lên, đánh dấu attached_at).';

DROP TRIGGER IF EXISTS trg_member_payment_accounts__before ON public.member_payment_accounts;
CREATE TRIGGER trg_member_payment_accounts__before BEFORE INSERT OR UPDATE ON public.member_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION app.tg_member_payment_account_before();
DROP TRIGGER IF EXISTS trg_member_payment_accounts__touch ON public.member_payment_accounts;
CREATE TRIGGER trg_member_payment_accounts__touch BEFORE UPDATE ON public.member_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_member_payment_accounts__audit ON public.member_payment_accounts;
CREATE TRIGGER trg_member_payment_accounts__audit AFTER INSERT OR UPDATE OR DELETE ON public.member_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('member_id');

ALTER TABLE public.member_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_payment_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_payment_accounts__select ON public.member_payment_accounts;
CREATE POLICY member_payment_accounts__select ON public.member_payment_accounts FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('member.read')));
DROP POLICY IF EXISTS member_payment_accounts__insert ON public.member_payment_accounts;
CREATE POLICY member_payment_accounts__insert ON public.member_payment_accounts FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));
DROP POLICY IF EXISTS member_payment_accounts__update ON public.member_payment_accounts;
CREATE POLICY member_payment_accounts__update ON public.member_payment_accounts FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));
DROP POLICY IF EXISTS member_payment_accounts__delete ON public.member_payment_accounts;
CREATE POLICY member_payment_accounts__delete ON public.member_payment_accounts FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));

ALTER TABLE public.member_payment_accounts OWNER TO luuxa_owner;
REVOKE ALL ON public.member_payment_accounts FROM luuxa_app;
GRANT SELECT, DELETE ON public.member_payment_accounts TO luuxa_app;
GRANT INSERT (member_id, bank_bin, bank_name, account_no, account_name, qr_file_id, note) ON public.member_payment_accounts TO luuxa_app;
GRANT UPDATE (bank_bin, bank_name, account_no, account_name, qr_file_id, note) ON public.member_payment_accounts TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_payment_accounts TO luuxa_worker, luuxa_definer;
-- (luuxa_readonly: không cấp — vai trò báo cáo chỉ đọc view tổng hợp không chứa dữ liệu cá nhân, theo 49_b mục E)

-- ---------------------------------------------------------------------
-- [6] storage_files: xem được ảnh QR đã gắn (chính sách permissive, OR với các chính sách sẵn có)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS storage_files__select__member_payment_accounts ON public.storage_files;
CREATE POLICY storage_files__select__member_payment_accounts ON public.storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.member_payment_accounts x WHERE x.qr_file_id = storage_files.id));
DROP POLICY IF EXISTS storage_files__select__receiving_account ON public.storage_files;
CREATE POLICY storage_files__select__receiving_account ON public.storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.settings s
                                         WHERE s.key = 'finance.receiving_account' AND s.value ->> 'qrFileId' = storage_files.id::text));

-- ---------------------------------------------------------------------
-- [7] Chủ sở hữu + quyền thực thi (INV-14: không hàm schema app nào EXECUTE cho PUBLIC)
-- ---------------------------------------------------------------------
ALTER FUNCTION app.fn_dues_cycle_bounds(date) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_month_range_label(date, date) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_next_plan_code(text) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_plan_fund(uuid) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_billable_member_count(date) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_create_dues_cycle_plan(date, date, uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_create_utility_plan(date, bigint, date, uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_cancel_contribution_plan(uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_plan_totals(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_attach_qr_file(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_settings_receiving_account() OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_member_payment_account_before() OWNER TO luuxa_definer;

REVOKE ALL ON FUNCTION app.fn_dues_cycle_bounds(date), app.fn_month_range_label(date, date), app.fn_next_plan_code(text),
  app.fn_plan_fund(uuid), app.fn_billable_member_count(date), app.fn_create_dues_cycle_plan(date, date, uuid),
  app.fn_create_utility_plan(date, bigint, date, uuid, text), app.fn_cancel_contribution_plan(uuid, text),
  app.fn_contribution_plan_totals(uuid), app.fn_attach_qr_file(uuid), app.tg_settings_receiving_account(),
  app.tg_member_payment_account_before() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_dues_cycle_bounds(date), app.fn_month_range_label(date, date), app.fn_billable_member_count(date),
  app.fn_create_dues_cycle_plan(date, date, uuid), app.fn_create_utility_plan(date, bigint, date, uuid, text),
  app.fn_cancel_contribution_plan(uuid, text), app.fn_contribution_plan_totals(uuid)
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
-- Hàm nội bộ chỉ được gọi bên trong các hàm SECURITY DEFINER ở trên (chạy dưới quyền luuxa_definer)
GRANT EXECUTE ON FUNCTION app.fn_next_plan_code(text), app.fn_plan_fund(uuid), app.fn_attach_qr_file(uuid) TO luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.tg_settings_receiving_account(), app.tg_member_payment_account_before()
  TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
