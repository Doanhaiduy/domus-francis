-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (4/8): TÀI CHÍNH — SỔ CÁI, CHUYỂN QUỸ, CHỐT SỔ
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.30  Tiện ích: kỳ tài chính theo tháng (tạo khi cần), người dùng có vai trò X (không phụ thuộc user hiện tại)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_period(p_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_month date := date_trunc('month', p_date)::date;
  v_id    uuid;
BEGIN
  SELECT fp.id INTO v_id FROM public.financial_periods fp WHERE fp.period_month = v_month;
  IF v_id IS NULL THEN
    INSERT INTO public.financial_periods (period_month, academic_year_id)
    VALUES (v_month,
            (SELECT ay.id FROM public.academic_years ay WHERE v_month BETWEEN ay.starts_on AND ay.ends_on LIMIT 1))
    ON CONFLICT (period_month) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT fp.id INTO v_id FROM public.financial_periods fp WHERE fp.period_month = v_month;
    END IF;
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.ensure_period(date) IS 'Trả về id kỳ tài chính của tháng chứa p_date; tạo mới (open) nếu chưa có. Idempotent, an toàn khi chạy đồng thời.';

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
COMMENT ON FUNCTION app.user_roles_of(uuid) IS 'Vai trò hiệu lực của một user bất kỳ (dùng trong trigger kiểm tra chữ ký duyệt, không phụ thuộc người đang đăng nhập).';

CREATE OR REPLACE FUNCTION app.roles_have_permission(p_roles text[], p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.roles r
      JOIN public.role_permissions rp ON rp.role_id = r.id
     WHERE r.code = ANY (p_roles) AND rp.permission_code = p_permission)
$$;

-- ---------------------------------------------------------------------
-- 4.5.31  Trigger sổ cái: gán kỳ, khóa kỳ đã chốt, chặn âm, kiểm tra bút toán đảo, chuỗi băm
--         SECURITY DEFINER: cần cập nhật funds.last_seq/head_hash dù người gọi không có quyền sửa funds.
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

  NEW.period_id := app.ensure_period(NEW.entry_date);
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.id = NEW.period_id;
  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'BR-FIN-06: kỳ % đã chốt hoặc đang chờ xác nhận — không ghi thêm bút toán. Hãy ghi bút toán đảo/điều chỉnh vào kỳ đang mở.',
      to_char(v_period.period_month, 'MM/YYYY') USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT * INTO v_fund FROM public.funds f WHERE f.id = NEW.fund_id FOR UPDATE;
  IF NOT FOUND OR v_fund.deleted_at IS NOT NULL OR NOT v_fund.is_active THEN
    RAISE EXCEPTION 'Túi quỹ không tồn tại hoặc đã ngừng sử dụng.' USING ERRCODE = 'foreign_key_violation';
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
      COALESCE(NEW.source_id::text, ''), NEW.description), 'sha256'),
    'hex');

  UPDATE public.funds SET last_seq = NEW.fund_seq, head_hash = NEW.row_hash WHERE id = NEW.fund_id;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_ledger_entry_before_insert() IS
  'BEFORE INSERT ledger_entries: (1) không ghi ngày tương lai; (2) gán kỳ và chặn kỳ đã chốt (BR-FIN-06); (3) khóa dòng túi quỹ để tuần tự hóa; (4) kiểm tra bút toán đảo (cùng quỹ/số tiền, ngược chiều); (5) chặn số dư âm (BR-FIN-07) trừ quỹ allow_negative; (6) gán fund_seq + chuỗi băm.';

CREATE TRIGGER trg_ledger_entries__chain
  BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.tg_ledger_entry_before_insert();

CREATE TRIGGER trg_ledger_entries__immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

CREATE TRIGGER trg_ledger_entries__no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION app.tg_forbid_mutation();

-- Mỗi nhóm chuyển quỹ phải có đúng 2 dòng: một out, một in, cùng số tiền, khác quỹ (kiểm tra cuối transaction)
CREATE OR REPLACE FUNCTION app.tg_check_transfer_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_n        integer;
  v_in       bigint;
  v_out      bigint;
  v_funds    integer;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(amount_vnd) FILTER (WHERE direction = 'in'), 0),
         COALESCE(SUM(amount_vnd) FILTER (WHERE direction = 'out'), 0),
         COUNT(DISTINCT fund_id)
    INTO v_n, v_in, v_out, v_funds
    FROM public.ledger_entries
   WHERE transfer_group_id = NEW.transfer_group_id;
  IF v_n <> 2 OR v_in <> v_out OR v_funds <> 2 THEN
    RAISE EXCEPTION 'Nhóm chuyển quỹ % không hợp lệ: cần đúng 2 bút toán (1 thu, 1 chi) cùng số tiền ở hai túi quỹ khác nhau.', NEW.transfer_group_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER trg_ledger_entries__transfer_pair
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.transfer_group_id IS NOT NULL)
  EXECUTE FUNCTION app.tg_check_transfer_group();

-- ---------------------------------------------------------------------
-- 4.5.32  Chuyển quỹ giữa hai túi (hai bút toán cùng transfer_group_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_transfer_funds(
  p_from_fund   uuid,
  p_to_fund     uuid,
  p_amount_vnd  bigint,
  p_entry_date  date,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_group uuid := app.uuid_v7();
  v_uid   uuid := app.current_user_id();
BEGIN
  IF app.lacks_permission('finance.fund.manage') THEN
    RAISE EXCEPTION 'Không có quyền chuyển quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from_fund = p_to_fund THEN
    RAISE EXCEPTION 'Túi quỹ nguồn và đích phải khác nhau.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, transfer_group_id, description, created_by)
  VALUES (p_from_fund, p_entry_date, 'out', p_amount_vnd, 'transfer', v_group, 'Chuyển quỹ đi: ' || p_description, v_uid);
  INSERT INTO public.ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, transfer_group_id, description, created_by)
  VALUES (p_to_fund, p_entry_date, 'in', p_amount_vnd, 'transfer', v_group, 'Chuyển quỹ đến: ' || p_description, v_uid);
  RETURN v_group;
END
$$;
COMMENT ON FUNCTION app.fn_transfer_funds(uuid, uuid, bigint, date, text) IS 'Chuyển tiền giữa hai túi quỹ (ví dụ rút ngân hàng về tiền mặt) bằng hai bút toán cùng transfer_group_id.';

-- ---------------------------------------------------------------------
-- 4.5.32b  Ghi tay vào sổ cái: số dư đầu kỳ, điều chỉnh, quyên góp — DUY NHẤT đường ghi trực tiếp ngoài luồng phiếu chi/thu quỹ/chuyển quỹ
--          (luuxa_app không có quyền INSERT trên ledger_entries; BR-FIN-16)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_post_ledger_entry(
  p_fund_id           uuid,
  p_entry_date        date,
  p_direction         ledger_direction_t,
  p_amount_vnd        bigint,
  p_source_type       ledger_source_t,
  p_description       text,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid  uuid := app.current_user_id();
  v_fund public.funds%ROWTYPE;
  v_id   uuid;
BEGIN
  IF p_source_type NOT IN ('opening_balance', 'adjustment', 'donation') THEN
    RAISE EXCEPTION 'BR-FIN-16: chỉ được ghi tay bút toán số dư đầu kỳ, điều chỉnh hoặc quyên góp (nguồn "%" đi qua luồng nghiệp vụ riêng).', p_source_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_source_type = 'donation' THEN
    IF app.lacks_permission('finance.contribution.record') THEN
      RAISE EXCEPTION 'Không có quyền ghi nhận quyên góp.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_direction <> 'in' THEN
      RAISE EXCEPTION 'BR-FIN-16: quyên góp phải là khoản thu (in).' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF app.lacks_permission('finance.ledger.adjust') THEN
    RAISE EXCEPTION 'Không có quyền ghi số dư đầu kỳ / bút toán điều chỉnh (cần finance.ledger.adjust — Trưởng nhà).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_description IS NULL OR char_length(btrim(p_description)) < 10 THEN
    RAISE EXCEPTION 'BR-FIN-16: phải ghi rõ lý do/chứng từ (≥ 10 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT le.id INTO v_id FROM public.ledger_entries le WHERE le.created_by IS NOT DISTINCT FROM v_uid AND le.client_request_id = p_client_request_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  SELECT * INTO v_fund FROM public.funds f WHERE f.id = p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Túi quỹ không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF p_source_type = 'opening_balance' AND (v_fund.last_seq <> 0 OR p_direction <> 'in') THEN
    RAISE EXCEPTION 'BR-FIN-16: số dư đầu kỳ chỉ ghi được MỘT lần, là bút toán đầu tiên của túi quỹ và là khoản thu (in).' USING ERRCODE = 'check_violation';
  END IF;
  v_id := app.uuid_v7();
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, description, created_by, client_request_id)
  VALUES (v_id, p_fund_id, p_entry_date, p_direction, p_amount_vnd, p_source_type, NULL, btrim(p_description), v_uid, p_client_request_id);
  PERFORM app.write_audit('LEDGER_MANUAL_ENTRY', 'ledger_entries', v_id::text, p_description, NULL,
                          jsonb_build_object('fund_id', p_fund_id, 'direction', p_direction, 'amount_vnd', p_amount_vnd, 'source_type', p_source_type));
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_post_ledger_entry(uuid, date, ledger_direction_t, bigint, ledger_source_t, text, uuid) IS
  'BR-FIN-16: ghi tay bút toán số dư đầu kỳ (một lần, đầu tiên), điều chỉnh (finance.ledger.adjust — Trưởng nhà) hoặc quyên góp (finance.contribution.record). Bắt buộc lý do ≥ 10 ký tự, idempotent theo client_request_id, luôn ghi audit LEDGER_MANUAL_ENTRY. Là đường ghi thủ công DUY NHẤT: luuxa_app không INSERT trực tiếp vào ledger_entries.';

-- ---------------------------------------------------------------------
-- 4.5.33  Chốt sổ tháng hai bước: Thủ quỹ chốt → Trưởng nhà xác nhận; mở lại cần lý do
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_fund_balance_at(p_fund_id uuid, p_until date)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0)::bigint
    FROM public.ledger_entries le
   WHERE le.fund_id = p_fund_id AND le.entry_date <= p_until
$$;
COMMENT ON FUNCTION app.fn_fund_balance_at(uuid, date) IS 'Số dư túi quỹ tại cuối ngày p_until (tính từ sổ cái).';

-- Kiểm chứng chuỗi băm: tính lại SHA-256 từng dòng, so prev_hash với row_hash dòng trước, phát hiện hụt số thứ tự và đầu chuỗi lệch funds.head_hash
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
                                   COALESCE(le.source_id::text, ''), le.description), 'sha256'), 'hex') AS recomputed
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
COMMENT ON FUNCTION app.fn_verify_ledger_chain(uuid) IS 'Kiểm chứng toàn vẹn sổ cái: tính lại băm SHA-256 từng bút toán, đối chiếu prev_hash với dòng trước, phát hiện hụt số thứ tự và so đầu chuỗi với funds.head_hash. first_broken_seq NULL = nguyên vẹn. Chạy hằng đêm (worker) và trước khi in báo cáo chốt sổ; người dùng cần quyền đọc sổ cái (RLS).';

CREATE OR REPLACE FUNCTION app.fn_close_period(p_period_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_period  public.financial_periods%ROWTYPE;
  v_prev    public.financial_periods%ROWTYPE;
  v_fund    public.funds%ROWTYPE;
  v_start   date;
  v_end     date;
  v_open    bigint;
  v_in      bigint;
  v_out     bigint;
  v_cnt     integer;
  v_hash    text;
  v_pending integer;
  v_recon   bigint;
  v_summary jsonb := '[]'::jsonb;
BEGIN
  IF app.lacks_permission('finance.period.close') THEN
    RAISE EXCEPTION 'Không có quyền chốt sổ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kỳ tài chính không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'Kỳ % không ở trạng thái open (hiện: %).', to_char(v_period.period_month, 'MM/YYYY'), v_period.status
      USING ERRCODE = 'check_violation';
  END IF;
  v_start := v_period.period_month;
  v_end   := (v_period.period_month + interval '1 month' - interval '1 day')::date;
  IF app.local_today() < v_end THEN
    RAISE EXCEPTION 'BR-FIN-08: chưa thể chốt kỳ % trước ngày cuối tháng.', to_char(v_start, 'MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;

  -- Mọi kỳ cũ hơn đều phải đã chốt (không chỉ kỳ liền trước: tháng không phát sinh bút toán không có dòng kỳ nhưng kỳ xa hơn có thể còn mở)
  SELECT * INTO v_prev FROM public.financial_periods fp WHERE fp.period_month < v_start AND fp.status <> 'closed' ORDER BY fp.period_month LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'BR-FIN-08: phải chốt kỳ % trước.', to_char(v_prev.period_month, 'MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;

  FOR v_fund IN SELECT * FROM public.funds f WHERE f.deleted_at IS NULL AND f.is_active ORDER BY f.code LOOP
    IF v_fund.fund_type = 'bank' AND app.setting_bool('finance.period.close_requires_reconciliation') THEN
      SELECT pr.ledger_balance_vnd INTO v_recon FROM public.period_reconciliations pr
       WHERE pr.period_id = p_period_id AND pr.fund_id = v_fund.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'BR-FIN-09: túi quỹ ngân hàng "%" chưa được đối soát sao kê cho kỳ %.', v_fund.name, to_char(v_start, 'MM/YYYY')
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_recon <> app.fn_fund_balance_at(v_fund.id, v_end) THEN
        RAISE EXCEPTION 'BR-FIN-09: biên bản đối soát của túi quỹ "%" đã cũ (số dư sổ cái hiện % đ, biên bản ghi % đ) — hãy đối soát lại cho kỳ %.',
          v_fund.name, app.fn_fund_balance_at(v_fund.id, v_end), v_recon, to_char(v_start, 'MM/YYYY') USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_open := app.fn_fund_balance_at(v_fund.id, v_start - 1);
    SELECT COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'), 0),
           COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out'), 0),
           COUNT(*)
      INTO v_in, v_out, v_cnt
      FROM public.ledger_entries le
     WHERE le.fund_id = v_fund.id AND le.period_id = p_period_id;
    SELECT le.row_hash INTO v_hash
      FROM public.ledger_entries le
     WHERE le.fund_id = v_fund.id AND le.entry_date <= v_end
     ORDER BY le.fund_seq DESC LIMIT 1;

    INSERT INTO public.period_fund_balances (period_id, fund_id, opening_balance_vnd, total_in_vnd, total_out_vnd, closing_balance_vnd, entry_count, head_hash)
    VALUES (p_period_id, v_fund.id, v_open, v_in, v_out, v_open + v_in - v_out, v_cnt, COALESCE(v_hash, repeat('0', 64)))
    ON CONFLICT (period_id, fund_id) DO UPDATE
      SET opening_balance_vnd = EXCLUDED.opening_balance_vnd, total_in_vnd = EXCLUDED.total_in_vnd,
          total_out_vnd = EXCLUDED.total_out_vnd, closing_balance_vnd = EXCLUDED.closing_balance_vnd,
          entry_count = EXCLUDED.entry_count, head_hash = EXCLUDED.head_hash, computed_at = now();

    v_summary := v_summary || jsonb_build_object(
      'fund', v_fund.code, 'opening', v_open, 'in', v_in, 'out', v_out, 'closing', v_open + v_in - v_out, 'head_hash', COALESCE(v_hash, repeat('0', 64)));
  END LOOP;

  SELECT COUNT(*) INTO v_pending
    FROM public.expense_vouchers ev
   WHERE ev.status IN ('pending_approval', 'approved') AND ev.expense_date BETWEEN v_start AND v_end;

  UPDATE public.financial_periods
     SET status = 'pending_confirmation', closed_by = v_uid, closed_at = now(), closing_note = p_note
   WHERE id = p_period_id;
  PERFORM app.write_audit('PERIOD_CLOSE', 'financial_periods', p_period_id::text, p_note, NULL,
                          jsonb_build_object('step', 'closed_by_treasurer', 'funds', v_summary, 'unsettled_vouchers', v_pending));
  RETURN jsonb_build_object('period', to_char(v_start, 'YYYY-MM'), 'funds', v_summary, 'unsettled_vouchers', v_pending);
END
$$;
COMMENT ON FUNCTION app.fn_close_period(uuid, text) IS
  'Bước 1 chốt sổ (Thủ quỹ): kiểm tra đã hết tháng, kỳ trước đã chốt (BR-FIN-08), quỹ ngân hàng đã đối soát và biên bản đối soát khớp số dư sổ cái hiện tại (BR-FIN-09); chụp số dư từng túi vào period_fund_balances; chuyển kỳ sang pending_confirmation (đóng băng ghi sổ). Trả về tóm tắt gồm head_hash để in lên báo cáo.';

CREATE OR REPLACE FUNCTION app.fn_confirm_period_close(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_period public.financial_periods%ROWTYPE;
BEGIN
  IF app.lacks_permission('finance.period.confirm') THEN
    RAISE EXCEPTION 'Không có quyền xác nhận chốt sổ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kỳ tài chính không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_period.status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'Kỳ % chưa ở trạng thái chờ xác nhận.', to_char(v_period.period_month, 'MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF v_uid IS NOT NULL AND v_uid = v_period.closed_by THEN
    RAISE EXCEPTION 'BR-FIN-10: người xác nhận phải khác người chốt sổ (nguyên tắc hai người).' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.financial_periods
     SET status = 'closed', confirmed_by = v_uid, confirmed_at = now()
   WHERE id = p_period_id;
  PERFORM app.write_audit('PERIOD_CLOSE', 'financial_periods', p_period_id::text, NULL, NULL,
                          jsonb_build_object('step', 'confirmed_by_house_head'));
END
$$;
COMMENT ON FUNCTION app.fn_confirm_period_close(uuid) IS 'Bước 2 chốt sổ (Trưởng nhà): xác nhận kỳ pending_confirmation → closed. CHECK ck_financial_periods__two_person bảo đảm closed_by ≠ confirmed_by ngay cả khi gọi trực tiếp UPDATE.';

CREATE OR REPLACE FUNCTION app.fn_reopen_period(p_period_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_period public.financial_periods%ROWTYPE;
BEGIN
  IF app.lacks_permission('finance.period.reopen') THEN
    RAISE EXCEPTION 'Không có quyền mở lại kỳ đã chốt.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kỳ tài chính không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_period.status = 'open' THEN
    RAISE EXCEPTION 'Kỳ % đang mở.', to_char(v_period.period_month, 'MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_periods fp WHERE fp.period_month > v_period.period_month AND fp.status <> 'open') THEN
    RAISE EXCEPTION 'BR-FIN-11: phải mở lại kỳ mới hơn trước (kỳ sau đã chốt).' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.financial_periods
     SET status = 'open', reopen_count = reopen_count + 1, reopened_by = v_uid, reopened_at = now(), reopen_reason = p_reason
   WHERE id = p_period_id;
  DELETE FROM public.period_fund_balances WHERE period_id = p_period_id;
  PERFORM app.write_audit('PERIOD_REOPEN', 'financial_periods', p_period_id::text, p_reason);
END
$$;
COMMENT ON FUNCTION app.fn_reopen_period(uuid, text) IS 'Mở lại kỳ đã chốt (Trưởng nhà, lý do ≥ 10 ký tự theo CHECK). Chỉ mở lại kỳ mới nhất trước; xóa ảnh chụp số dư; ghi audit PERIOD_REOPEN.';

-- Chặn thêm/sửa/xóa ảnh chụp số dư và biên bản đối soát khi kỳ KHÔNG còn mở (đã chốt hoặc đang chờ xác nhận).
-- SECURITY DEFINER: phải đọc được trạng thái kỳ ngay cả khi người gọi không có quyền xem financial_periods.
CREATE OR REPLACE FUNCTION app.tg_period_locked_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status period_status_t;
  v_period uuid;
BEGIN
  v_period := CASE WHEN TG_OP = 'DELETE' THEN OLD.period_id ELSE NEW.period_id END;
  SELECT fp.status INTO v_status FROM public.financial_periods fp WHERE fp.id = v_period;
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'BR-FIN-06: kỳ tài chính không còn mở (đã chốt hoặc đang chờ xác nhận) — không được thay đổi dữ liệu liên quan (%).', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
COMMENT ON FUNCTION app.tg_period_locked_guard() IS 'BEFORE INSERT/UPDATE/DELETE period_reconciliations & period_fund_balances: chỉ cho thay đổi khi kỳ còn open. Hàm chốt/mở lại kỳ luôn đổi trạng thái kỳ trước khi ghi/xóa ảnh chụp nên không bị chặn nhầm.';

CREATE TRIGGER trg_period_reconciliations__locked
  BEFORE INSERT OR UPDATE OR DELETE ON period_reconciliations
  FOR EACH ROW EXECUTE FUNCTION app.tg_period_locked_guard();

CREATE TRIGGER trg_period_fund_balances__locked
  BEFORE INSERT OR UPDATE OR DELETE ON period_fund_balances
  FOR EACH ROW EXECUTE FUNCTION app.tg_period_locked_guard();
