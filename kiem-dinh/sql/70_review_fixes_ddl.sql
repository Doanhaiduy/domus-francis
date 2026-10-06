-- =====================================================================
-- 70_review_fixes_ddl.sql — MIGRATION SỬA LỖI SAU KIỂM ĐỊNH ĐỘC LẬP (Bước 3)
-- Chạy SAU 01…52 bằng superuser/migrator, idempotent (chạy lại an toàn).
-- Xử lý: G-01, G-02, G-03, G-04, G-05, G-06,
--        G-07, G-08, G-09, G-10, G-11.
-- Đã kiểm chứng trên PostgreSQL 16.14: 01…52 + file này + 60_smoke_tests + 80_concurrency_tests.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- G-01: luuxa_owner phải dùng được schema app (RI check chạy dưới quyền chủ bảng,
--               planner inline app.norm_text/app.immutable_unaccent trong index biểu thức).
-- G-02: luuxa_owner phải tạo được bảng trong public (phân vùng audit_logs theo tháng).
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA app TO luuxa_owner;
DO $$ BEGIN
  GRANT USAGE, CREATE ON SCHEMA public TO luuxa_owner;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- Tạo trước phân vùng theo NGÀY TRIỂN KHAI thực tế (6 tháng tới), thay cho 6 phân vùng viết cứng 10/2026–03/2027
SELECT app.ensure_monthly_partitions('public.audit_logs'::regclass, 6);

-- fn_housekeeping không được rollback toàn bộ chỉ vì bước tạo phân vùng lỗi: tách bước này thành khối riêng có bắt lỗi
CREATE OR REPLACE FUNCTION app.fn_ensure_audit_partitions_safe()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  BEGIN
    v_n := app.ensure_monthly_partitions('public.audit_logs'::regclass, 3);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Không tạo được phân vùng audit_logs: % (SQLSTATE %). Job dọn dẹp vẫn tiếp tục; kiểm tra quyền của luuxa_owner.', SQLERRM, SQLSTATE;
    v_n := -1;
  END;
  RETURN v_n;
END
$$;
ALTER FUNCTION app.fn_ensure_audit_partitions_safe() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_ensure_audit_partitions_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_ensure_audit_partitions_safe() TO luuxa_worker;
COMMENT ON FUNCTION app.fn_ensure_audit_partitions_safe() IS 'Gọi ensure_monthly_partitions(audit_logs, 3) trong khối bắt lỗi; trả -1 nếu lỗi (cảnh báo qua giám sát) để fn_housekeeping không bị rollback toàn bộ.';

-- fn_housekeeping: thay đúng một dòng (gọi bản an toàn); phần còn lại giữ nguyên văn 38_fn_platform.sql
CREATE OR REPLACE FUNCTION app.fn_housekeeping()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_notif  integer;
  v_login  integer;
  v_idem   integer;
  v_tokens integer;
  v_resets integer;
  v_orphan integer;
  v_ai     integer;
  v_sug    integer;
  v_swaps  integer;
  v_polls  integer;
  v_parts  integer;
BEGIN
  DELETE FROM public.notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days';
  GET DIAGNOSTICS v_notif = ROW_COUNT;
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '90 days';
  GET DIAGNOSTICS v_login = ROW_COUNT;
  DELETE FROM public.idempotency_keys WHERE expires_at < now();
  GET DIAGNOSTICS v_idem = ROW_COUNT;
  DELETE FROM public.refresh_tokens WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS v_tokens = ROW_COUNT;
  DELETE FROM public.password_resets WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_resets = ROW_COUNT;
  UPDATE public.storage_files
     SET status = 'deleted', deleted_at = now(), purge_after = now() + interval '7 days'
   WHERE deleted_at IS NULL AND attached_at IS NULL
     AND status IN ('pending_upload', 'uploaded', 'processing', 'ready', 'rejected')
     AND created_at < now() - make_interval(hours => app.setting_int('upload.orphan_ttl_hours')::int)
     -- Tệp được tham chiếu TRỰC TIẾP bằng khóa ngoại (ảnh album, ảnh bìa, ảnh đại diện, ảnh minh chứng check-in) không đi qua media_attachments
     -- nên attached_at vẫn NULL: không được coi là mồ côi (nếu không, ảnh đang dùng bị xóa sau 24 giờ).
     AND NOT EXISTS (SELECT 1 FROM public.album_photos ap WHERE ap.file_id = storage_files.id)
     AND NOT EXISTS (SELECT 1 FROM public.albums al WHERE al.cover_file_id = storage_files.id)
     AND NOT EXISTS (SELECT 1 FROM public.members mb WHERE mb.avatar_file_id = storage_files.id)
     AND NOT EXISTS (SELECT 1 FROM public.duty_checkins dc WHERE dc.evidence_file_id = storage_files.id);
  GET DIAGNOSTICS v_orphan = ROW_COUNT;
  DELETE FROM public.ai_jobs WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_ai = ROW_COUNT;
  UPDATE public.ai_suggestions SET status = 'expired' WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_sug = ROW_COUNT;
  UPDATE public.duty_swap_requests SET status = 'expired' WHERE status IN ('pending_peer', 'pending_admin') AND expires_at < now();
  GET DIAGNOSTICS v_swaps = ROW_COUNT;
  v_polls := app.fn_close_expired_polls();
  v_parts := app.fn_ensure_audit_partitions_safe();   -- G-02: lỗi tạo phân vùng không còn làm rollback cả job dọn dẹp
  RETURN jsonb_build_object(
    'notifications_deleted', v_notif, 'login_attempts_deleted', v_login, 'idempotency_deleted', v_idem,
    'refresh_tokens_deleted', v_tokens, 'password_resets_deleted', v_resets, 'orphan_files_marked', v_orphan,
    'ai_jobs_deleted', v_ai, 'ai_suggestions_expired', v_sug, 'swap_requests_expired', v_swaps,
    'polls_closed', v_polls, 'audit_partitions_created', v_parts);
END
$$;

-- ---------------------------------------------------------------------
-- G-03: thứ tự khóa thống nhất  funds → financial_periods  cho mọi đường ghi sổ và chốt sổ
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

  -- (1) Khóa túi quỹ TRƯỚC (cùng thứ tự với fn_close_period) — tuần tự hóa chuỗi băm và kiểm tra số dư
  SELECT * INTO v_fund FROM public.funds f WHERE f.id = NEW.fund_id FOR UPDATE;
  IF NOT FOUND OR v_fund.deleted_at IS NOT NULL OR NOT v_fund.is_active THEN
    RAISE EXCEPTION 'Túi quỹ không tồn tại hoặc đã ngừng sử dụng.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- (2) Rồi mới đọc trạng thái kỳ với khóa FOR SHARE: nếu fn_close_period đang giữ FOR UPDATE thì chờ và đọc lại trạng thái mới nhất
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
      COALESCE(NEW.source_id::text, ''), NEW.description), 'sha256'),
    'hex');

  UPDATE public.funds SET last_seq = NEW.fund_seq, head_hash = NEW.row_hash WHERE id = NEW.fund_id;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_ledger_entry_before_insert() IS
  'BEFORE INSERT ledger_entries: (1) không ghi ngày tương lai; (2) khóa túi quỹ FOR UPDATE; (3) gán kỳ và đọc trạng thái kỳ FOR SHARE — thứ tự khóa funds → kỳ giống fn_close_period nên không thể lọt bút toán vào kỳ đang chốt (G-03); (4) kiểm tra bút toán đảo; (5) chặn số dư âm (BR-FIN-07); (6) gán fund_seq + chuỗi băm.';

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
  -- G-03: khóa mọi túi quỹ đang dùng TRƯỚC khi khóa kỳ (thứ tự id cố định để tránh deadlock với chuyển quỹ)
  PERFORM 1 FROM public.funds f WHERE f.deleted_at IS NULL AND f.is_active ORDER BY f.id FOR UPDATE;
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
  'Bước 1 chốt sổ (Thủ quỹ). G-03: khóa mọi túi quỹ đang dùng (ORDER BY id FOR UPDATE) trước khi khóa kỳ, nên không bút toán nào chen vào giữa lúc chụp số dư. Kiểm tra đã hết tháng, kỳ trước đã chốt (BR-FIN-08), đối soát ngân hàng khớp (BR-FIN-09); chụp số dư vào period_fund_balances; chuyển kỳ sang pending_confirmation.';

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
  -- G-03: khóa hai túi theo thứ tự id (cùng thứ tự với fn_close_period) để hai lệnh chuyển ngược chiều không deadlock
  PERFORM 1 FROM public.funds f WHERE f.id IN (p_from_fund, p_to_fund) ORDER BY f.id FOR UPDATE;
  INSERT INTO public.ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, transfer_group_id, description, created_by)
  VALUES (p_from_fund, p_entry_date, 'out', p_amount_vnd, 'transfer', v_group, 'Chuyển quỹ đi: ' || p_description, v_uid);
  INSERT INTO public.ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, transfer_group_id, description, created_by)
  VALUES (p_to_fund, p_entry_date, 'in', p_amount_vnd, 'transfer', v_group, 'Chuyển quỹ đến: ' || p_description, v_uid);
  RETURN v_group;
END
$$;
COMMENT ON FUNCTION app.fn_transfer_funds(uuid, uuid, bigint, date, text) IS 'Chuyển tiền giữa hai túi quỹ bằng hai bút toán cùng transfer_group_id; khóa hai túi theo thứ tự id (G-03).';

-- ---------------------------------------------------------------------
-- G-04: sức chứa phòng — tuần tự hóa theo phòng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_room_assignment_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_room     public.rooms%ROWTYPE;
  v_gender   gender_t;
  v_peak     integer;
  v_range    daterange;
BEGIN
  -- G-04: hai giao dịch xếp người vào CÙNG phòng phải nối đuôi nhau, nếu không cả hai cùng thấy "còn 1 chỗ"
  PERFORM pg_advisory_xact_lock(hashtextextended('room_assign:' || NEW.room_id::text, 0));

  SELECT * INTO v_room FROM public.rooms r WHERE r.id = NEW.room_id AND r.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phòng không tồn tại hoặc đã xóa.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_room.room_type <> 'bedroom' THEN
    RAISE EXCEPTION 'Chỉ được xếp người vào phòng ngủ (phòng % là %).', v_room.code, v_room.room_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room.status <> 'active' THEN
    RAISE EXCEPTION 'Phòng % đang ở trạng thái % — không thể xếp thêm người.', v_room.code, v_room.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room.gender_policy IS NOT NULL THEN
    SELECT m.gender INTO v_gender FROM public.members m WHERE m.id = NEW.member_id;
    IF v_gender IS NOT NULL AND v_gender <> v_room.gender_policy THEN
      RAISE EXCEPTION 'Phòng % chỉ dành cho %.', v_room.code, v_room.gender_policy USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_range := daterange(NEW.starts_on, COALESCE(NEW.ends_on, 'infinity'::date), '[]');
  SELECT COALESCE(MAX(cnt), 0) INTO v_peak
    FROM (
      SELECT p.d, COUNT(a.id) AS cnt
        FROM (
          SELECT NEW.starts_on AS d
          UNION
          SELECT a2.starts_on
            FROM public.room_assignments a2
           WHERE a2.room_id = NEW.room_id
             AND a2.id <> NEW.id
             AND daterange(a2.starts_on, COALESCE(a2.ends_on, 'infinity'::date), '[]') && v_range
             AND a2.starts_on >= NEW.starts_on
        ) AS p
        LEFT JOIN public.room_assignments a
               ON a.room_id = NEW.room_id
              AND a.id <> NEW.id
              AND daterange(a.starts_on, COALESCE(a.ends_on, 'infinity'::date), '[]') @> p.d
       GROUP BY p.d
    ) AS s;
  IF v_peak + 1 > v_room.capacity THEN
    RAISE EXCEPTION 'Phòng % đã đủ % chỗ trong khoảng thời gian này.', v_room.code, v_room.capacity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_room_assignment_rules() IS 'BEFORE INSERT/UPDATE room_assignments: khóa advisory theo phòng (G-04) rồi kiểm tra chỉ phòng ngủ, phòng active, đúng giới, không vượt sức chứa tại bất kỳ ngày nào trong khoảng.';

-- ---------------------------------------------------------------------
-- G-05: biểu quyết — khóa trong trigger để MỌI đường ghi (kể cả INSERT trực tiếp) đều tuần tự
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_poll_vote_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_p public.polls%ROWTYPE;
  v_n integer;
BEGIN
  -- G-05: cùng khóa với app.fn_cast_vote (advisory xact lock tái nhập được trong cùng transaction)
  PERFORM pg_advisory_xact_lock(hashtextextended('poll_vote:' || NEW.poll_id::text || ':' || NEW.member_id::text, 0));
  SELECT * INTO v_p FROM public.polls p WHERE p.id = NEW.poll_id;
  IF v_p.status <> 'open' OR now() < v_p.opens_at OR (v_p.closes_at IS NOT NULL AND now() > v_p.closes_at) THEN
    RAISE EXCEPTION 'BR-EVT-08: cuộc biểu quyết không còn nhận phiếu.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.poll_votes pv WHERE pv.poll_id = NEW.poll_id AND pv.member_id = NEW.member_id;
  IF v_n + 1 > v_p.max_choices THEN
    RAISE EXCEPTION 'BR-EVT-08: chỉ được chọn tối đa % phương án.', v_p.max_choices USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = NEW.member_id AND m.status = 'active' AND m.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Chỉ thành viên đang ở được bỏ phiếu.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_poll_vote_rules() IS 'BEFORE INSERT poll_votes (BR-EVT-08): khóa advisory theo (poll, người) (G-05), poll đang mở, không vượt max_choices, chỉ thành viên đang ở.';

-- ---------------------------------------------------------------------
-- G-06: hạn mức lượt giặt/tuần — khóa theo thành viên
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_laundry_booking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_machine_status text;
  v_local_date     date;
  v_slot_ok        boolean;
  v_week_start     date;
  v_week_count     integer;
  v_max_week       integer := app.setting_int('laundry.max_per_week');
  v_ahead          integer := app.setting_int('laundry.max_days_ahead');
  v_mstatus        member_status_t;
BEGIN
  SELECT lm.status INTO v_machine_status FROM public.laundry_machines lm WHERE lm.id = NEW.machine_id;
  IF v_machine_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Máy giặt không hoạt động.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT m.status INTO v_mstatus FROM public.members m WHERE m.id = NEW.member_id AND m.deleted_at IS NULL;
  IF v_mstatus IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Chỉ thành viên đang ở được đặt máy giặt.' USING ERRCODE = 'check_violation';
  END IF;

  v_local_date := app.local_date(NEW.starts_at);
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(app.setting_json('laundry.slots')) AS s
     WHERE ((v_local_date + (s ->> 0)::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') = NEW.starts_at
       AND ((v_local_date + (s ->> 1)::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') = NEW.ends_at
  ) INTO v_slot_ok;
  IF NOT v_slot_ok THEN
    RAISE EXCEPTION 'BR-LAU-01: thời gian đặt phải đúng một khung giờ cấu hình (settings laundry.slots).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.starts_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'BR-LAU-02: không đặt lượt đã qua.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.starts_at > now() + make_interval(days => v_ahead) THEN
    RAISE EXCEPTION 'BR-LAU-02: chỉ đặt trước tối đa % ngày.', v_ahead USING ERRCODE = 'check_violation';
  END IF;

  v_week_start := date_trunc('week', v_local_date)::date;
  -- G-06: tuần tự hóa các lượt đặt của cùng một thành viên trong cùng tuần trước khi đếm hạn mức
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry_quota:' || NEW.member_id::text || ':' || v_week_start::text, 0));
  SELECT COUNT(*) INTO v_week_count
    FROM public.laundry_bookings b
   WHERE b.member_id = NEW.member_id AND b.status IN ('booked', 'checked_in', 'completed')
     AND date_trunc('week', app.local_date(b.starts_at))::date = v_week_start;
  IF v_week_count >= v_max_week THEN
    RAISE EXCEPTION 'BR-LAU-03: đã đủ % lượt giặt trong tuần.', v_max_week USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_laundry_booking_rules() IS 'BEFORE INSERT laundry_bookings (BR-LAU-01..03): máy hoạt động, thành viên đang ở, đúng khung giờ cấu hình, không đặt quá khứ/quá xa, hạn mức lượt/tuần có khóa advisory theo (thành viên, tuần) (G-06). Chống trùng máy do EXCLUDE ex_laundry_bookings__no_overlap.';

-- ---------------------------------------------------------------------
-- G-07: điểm chưa đủ (chưa có cuối kỳ) được lưu, không tính GPA, không cho nộp
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
    v_total := NULL;                                   -- G-07: mới có điểm quá trình/giữa kỳ — chưa đủ để tổng kết
  ELSIF NEW.process_score IS NULL THEN
    v_total := NEW.final_score;                        -- môn chỉ có điểm thi (giữ quy tắc gốc của thiết kế)
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
COMMENT ON FUNCTION app.tg_grade_record_compute() IS 'BEFORE INSERT/UPDATE grade_records: tổng kết = điểm chính thức (nếu có) hoặc trung bình có trọng số theo thang; CHƯA có điểm cuối kỳ ⇒ để trống tổng kết/điểm chữ, không tính GPA (G-07); làm tròn theo thang; tra bậc điểm chữ. Không cài cứng trọng số/ngưỡng.';

-- G-07: cho phép lưu điểm quá trình/giữa kỳ trước (ít nhất một loại điểm); trigger trên để trống tổng kết, tg_academic_record_rules chặn nộp khi thiếu
ALTER TABLE grade_records DROP CONSTRAINT IF EXISTS ck_grade_records__has_score;
ALTER TABLE grade_records ADD CONSTRAINT ck_grade_records__has_score
  CHECK (final_score IS NOT NULL OR official_total_score IS NOT NULL OR process_score IS NOT NULL);
COMMENT ON CONSTRAINT ck_grade_records__has_score ON grade_records IS
  'G-07: phải có ít nhất một loại điểm; dòng chỉ có điểm quá trình là hợp lệ khi bảng điểm còn nháp (chưa tổng kết, chưa tính GPA, không nộp được).';

-- ---------------------------------------------------------------------
-- G-07 + G-08 (G-07, G-08): nộp phải đủ điểm; chỉ người có academic.verify mới mở lại bảng điểm đã xác minh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_academic_record_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_n        integer;
  v_owner    uuid;
  v_dup      integer;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'submitted' THEN
    SELECT COUNT(*) INTO v_n FROM public.grade_records g WHERE g.record_id = NEW.id;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'BR-ACAD-04: bảng điểm phải có ít nhất một môn trước khi nộp.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COUNT(*) INTO v_n FROM public.grade_records g WHERE g.record_id = NEW.id AND g.total_score IS NULL;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'BR-ACAD-04: còn % môn chưa có điểm tổng kết (thiếu điểm cuối kỳ) — bổ sung trước khi nộp.', v_n USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.media_attachments ma
                    WHERE ma.entity_type = 'academic_record' AND ma.entity_id = NEW.id AND ma.purpose = 'transcript') THEN
      RAISE EXCEPTION 'BR-ACAD-04: phải đính kèm ảnh/bản chụp bảng điểm làm minh chứng trước khi nộp.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COUNT(*) INTO v_dup
      FROM public.media_attachments ma
      JOIN public.storage_files f ON f.id = ma.file_id
      JOIN public.media_attachments ma2 ON ma2.file_id <> ma.file_id AND ma2.entity_type = 'academic_record' AND ma2.entity_id <> NEW.id
      JOIN public.storage_files f2 ON f2.id = ma2.file_id AND f2.sha256 = f.sha256
      JOIN public.academic_records ar2 ON ar2.id = ma2.entity_id AND ar2.member_id <> NEW.member_id
     WHERE ma.entity_type = 'academic_record' AND ma.entity_id = NEW.id AND f.sha256 IS NOT NULL;
    IF v_dup > 0 THEN
      RAISE EXCEPTION 'BR-ACAD-05: minh chứng trùng hoàn toàn với minh chứng của thành viên khác.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.submitted_at := now();
    NEW.reject_reason := NULL;
  ELSIF NEW.status = 'verified' THEN
    SELECT m.user_id INTO v_owner FROM public.members m WHERE m.id = NEW.member_id;
    IF app.current_user_id() IS NOT NULL THEN
      IF v_owner IS NOT DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'BR-ACAD-02: không được tự xác minh bảng điểm của chính mình.' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT app.has_permission('academic.verify') THEN
        RAISE EXCEPTION 'Không có quyền xác minh bảng điểm.' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    NEW.verified_at := now();
    NEW.verified_by := COALESCE(app.current_user_id(), NEW.verified_by);
  ELSIF NEW.status = 'draft' THEN
    -- G-08: bảng điểm ĐÃ XÁC MINH chỉ được mở lại bởi người có quyền xác minh (chính chủ gửi yêu cầu chỉnh sửa qua kênh khác)
    IF OLD.status = 'verified' AND app.current_user_id() IS NOT NULL AND NOT app.has_permission('academic.verify') THEN
      RAISE EXCEPTION 'BR-ACAD-18: bảng điểm đã xác minh chỉ người có quyền xác minh mới mở lại được.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.verified_at := NULL; NEW.verified_by := NULL; NEW.submitted_at := NULL;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_academic_record_rules() IS 'BEFORE UPDATE OF status academic_records: nộp cần ≥1 môn, mọi môn đã có tổng kết (G-07), có minh chứng, không dùng chung ảnh (BR-ACAD-04/05); xác minh do người có quyền và khác chính chủ (BR-ACAD-02); mở lại bảng điểm đã xác minh cần academic.verify (G-08, BR-ACAD-18).';

-- ---------------------------------------------------------------------
-- G-09 + G-11 (G-09, G-11): xóa mềm chỉ sau khi đã rời; hiệu ứng rời lưu xá chạy SECURITY DEFINER và hủy lượt giặt tương lai
-- ---------------------------------------------------------------------
ALTER TABLE members DROP CONSTRAINT IF EXISTS ck_members__deleted_requires_left;
ALTER TABLE members ADD CONSTRAINT ck_members__deleted_requires_left
  CHECK (deleted_at IS NULL OR status IN ('left', 'alumni'));
COMMENT ON CONSTRAINT ck_members__deleted_requires_left ON members IS
  'G-09: chỉ xóa mềm hồ sơ đã chuyển sang left/alumni, để hiệu ứng rời lưu xá (khóa tài khoản, kết thúc phòng, hủy lượt giặt) luôn chạy trước.';

CREATE OR REPLACE FUNCTION app.tg_member_leave_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('left', 'alumni') AND OLD.status NOT IN ('left', 'alumni') THEN
    IF NEW.user_id IS NOT NULL AND NEW.status = 'left' THEN
      UPDATE public.users SET status = 'disabled' WHERE id = NEW.user_id AND status <> 'disabled';
      UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'user_disabled'
       WHERE user_id = NEW.user_id AND revoked_at IS NULL;
    END IF;
    UPDATE public.room_assignments
       SET ends_on = COALESCE(NEW.left_on, app.local_today()), end_reason = 'member_left'
     WHERE member_id = NEW.id AND ends_on IS NULL;
    UPDATE public.laundry_bookings
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Thành viên rời lưu xá'
     WHERE member_id = NEW.id AND status = 'booked' AND starts_at > now();
    PERFORM app.write_audit('STATE_CHANGE', 'members', NEW.id::text, 'MEMBER_LEFT', jsonb_build_object('status', OLD.status),
                            jsonb_build_object('status', NEW.status, 'left_on', NEW.left_on,
                                               'future_duties', (SELECT COUNT(*) FROM public.duty_assignment_members dam
                                                                  WHERE dam.member_id = NEW.id AND dam.duty_date > app.local_today())));
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_member_leave_effects() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_member_leave_effects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_member_leave_effects() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.tg_member_leave_effects() IS 'AFTER UPDATE OF status members (SECURITY DEFINER — G-11): sang left ⇒ khóa tài khoản + thu hồi phiên; sang left/alumni ⇒ kết thúc phân phòng, hủy lượt giặt tương lai (G-09) và ghi audit STATE_CHANGE (reason MEMBER_LEFT) kèm số ca trực tương lai để Phó nhà phân lại.';

-- ---------------------------------------------------------------------
-- G-10: giữ bằng chứng pháp lý khi xóa cứng hồ sơ — RESTRICT thay CASCADE
-- ---------------------------------------------------------------------
ALTER TABLE consents DROP CONSTRAINT consents_member_id_fkey,
  ADD CONSTRAINT consents_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE data_subject_requests DROP CONSTRAINT data_subject_requests_member_id_fkey,
  ADD CONSTRAINT data_subject_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE policy_acknowledgements DROP CONSTRAINT policy_acknowledgements_member_id_fkey,
  ADD CONSTRAINT policy_acknowledgements_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE poll_votes DROP CONSTRAINT poll_votes_member_id_fkey,
  ADD CONSTRAINT poll_votes_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
COMMENT ON CONSTRAINT consents_member_id_fkey ON consents IS 'G-10: RESTRICT — bằng chứng đồng ý phải còn để chứng minh tuân thủ; xóa dữ liệu cá nhân bằng ẩn danh hóa hồ sơ, không xóa cứng.';

COMMIT;
