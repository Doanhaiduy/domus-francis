-- =====================================================================
-- 1030 — ỦNG HỘ / QUYÊN GÓP VÀO QUỸ (khác khoản phải thu định kỳ): ai ủng hộ bao nhiêu, đã chuyển khoản chưa
--   • donations: một khoản ủng hộ của thành viên trong nhà HOẶC người ngoài (ghi tên). Trạng thái:
--       pledged   = đã ghi nhận, chờ nhận tiền (Thủ quỹ ghi trước)
--       pending   = thành viên báo "tôi đã ủng hộ/chuyển khoản", chờ Thủ quỹ xác nhận
--       confirmed = ĐÃ NHẬN — đã ghi sổ quỹ (bút toán nguồn "donation", bất biến)
--       rejected / cancelled = từ chối / hủy
--   • Ghi nhận trực tiếp + xác nhận cần finance.contribution.record (Thủ quỹ, Trưởng nhà, Admin). Thành viên tự báo khoản của mình.
--   • Mọi thao tác ghi đi qua hàm SECURITY DEFINER (kiểm quyền + ghi sổ + thông báo cùng giao dịch); luuxa_app chỉ ĐỌC.
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('finance.donation_pending', 'finance', 'Có người báo đã ủng hộ quỹ — chờ xác nhận', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false),
  ('finance.donation_decided', 'finance', 'Kết quả khoản ủng hộ quỹ của bạn',          ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.donations (
  id               uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  fund_id          uuid             REFERENCES public.funds(id) ON DELETE RESTRICT,
  donor_member_id  uuid             REFERENCES public.members(id) ON DELETE SET NULL,
  donor_name       text             NOT NULL,
  amount_vnd       bigint           NOT NULL,
  donated_on       date             NOT NULL,
  method           payment_method_t NOT NULL DEFAULT 'bank_transfer',
  reference_code   text,
  note             text,
  status           text             NOT NULL DEFAULT 'pending',
  self_reported    boolean          NOT NULL DEFAULT false,
  ledger_entry_id  uuid             REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  recorded_by      uuid             REFERENCES public.users(id) ON DELETE SET NULL,
  decided_by       uuid             REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz      NOT NULL DEFAULT now(),
  updated_at       timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT ck_donations__status CHECK (status IN ('pledged', 'pending', 'confirmed', 'rejected', 'cancelled')),
  CONSTRAINT ck_donations__amount CHECK (amount_vnd > 0 AND amount_vnd <= 1000000000000),
  CONSTRAINT ck_donations__name   CHECK (char_length(btrim(donor_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_donations__ref    CHECK (reference_code IS NULL OR char_length(reference_code) <= 100),
  CONSTRAINT ck_donations__note   CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_donations__dnote  CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  CONSTRAINT ck_donations__confirmed CHECK (status <> 'confirmed' OR (fund_id IS NOT NULL AND ledger_entry_id IS NOT NULL AND decided_at IS NOT NULL))
);
COMMENT ON TABLE public.donations IS
  'Khoản ủng hộ/quyên góp vào quỹ nhà (người trong nhà hoặc người ngoài). confirmed ⇒ đã ghi sổ quỹ (ledger_entry_id, nguồn donation). pledged/pending chưa vào sổ. Ghi qua hàm app.fn_donation_*.';
CREATE INDEX IF NOT EXISTS ix_donations__date ON public.donations (donated_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_donations__donor_member ON public.donations (donor_member_id);
CREATE INDEX IF NOT EXISTS ix_donations__open ON public.donations (created_at) WHERE status IN ('pledged', 'pending');
CREATE INDEX IF NOT EXISTS ix_donations__fund_id ON public.donations (fund_id);
CREATE INDEX IF NOT EXISTS ix_donations__ledger_entry_id ON public.donations (ledger_entry_id);
CREATE INDEX IF NOT EXISTS ix_donations__recorded_by ON public.donations (recorded_by);
CREATE INDEX IF NOT EXISTS ix_donations__decided_by ON public.donations (decided_by);

DROP TRIGGER IF EXISTS trg_donations__touch ON public.donations;
CREATE TRIGGER trg_donations__touch BEFORE UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_donations__audit ON public.donations;
CREATE TRIGGER trg_donations__audit AFTER INSERT OR UPDATE OR DELETE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'note,decision_note,reference_code');

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS donations__select ON public.donations;
CREATE POLICY donations__select ON public.donations FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(donor_member_id)) OR (SELECT app.has_permission('finance.contribution.record')));

ALTER TABLE public.donations OWNER TO luuxa_owner;
REVOKE ALL ON public.donations FROM luuxa_app;
GRANT SELECT ON public.donations TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- Hàm nghiệp vụ
-- ---------------------------------------------------------------------
-- Thủ quỹ / Trưởng nhà / Admin ghi nhận một khoản ủng hộ. p_received = true ⇒ ĐÃ NHẬN tiền (ghi sổ quỹ ngay, cần p_fund_id);
-- false ⇒ ghi nhận trước, chưa nhận tiền (pledged). Thành viên trong nhà: truyền p_donor_member_id; người ngoài: truyền p_donor_name.
CREATE OR REPLACE FUNCTION app.fn_donation_record(
  p_donor_member_id uuid, p_donor_name text, p_amount_vnd bigint, p_donated_on date, p_method payment_method_t,
  p_fund_id uuid, p_reference text, p_note text, p_received boolean, p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_name   text;
  v_ledger uuid;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Chỉ Thủ quỹ, Trưởng nhà hoặc Admin được ghi nhận khoản ủng hộ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 THEN
    RAISE EXCEPTION 'Số tiền ủng hộ phải lớn hơn 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donated_on IS NULL OR p_donated_on > app.local_today() THEN
    RAISE EXCEPTION 'Ngày ủng hộ không được ở tương lai.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donor_member_id IS NOT NULL THEN
    SELECT COALESCE(m.display_name, m.full_name) INTO v_name FROM public.members m WHERE m.id = p_donor_member_id AND m.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy thành viên ủng hộ.' USING ERRCODE = 'no_data_found'; END IF;
  ELSE
    v_name := NULLIF(btrim(COALESCE(p_donor_name, '')), '');
    IF v_name IS NULL OR char_length(v_name) < 2 THEN
      RAISE EXCEPTION 'Hãy nhập tên người ủng hộ (hoặc ghi "Ẩn danh").' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_received THEN
    IF p_fund_id IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    v_ledger := app.fn_post_ledger_entry(p_fund_id, p_donated_on, 'in', p_amount_vnd, 'donation',
      'Ủng hộ quỹ nhà: ' || v_name || ' — ' || app.fn_vnd(p_amount_vnd) || COALESCE(' (' || NULLIF(btrim(p_reference), '') || ')', ''), p_client_request_id);
    SELECT d.id INTO v_id FROM public.donations d WHERE d.ledger_entry_id = v_ledger;
    IF FOUND THEN RETURN v_id; END IF; -- gọi lại cùng clientRequestId ⇒ không nhân đôi
  END IF;

  INSERT INTO public.donations (fund_id, donor_member_id, donor_name, amount_vnd, donated_on, method, reference_code, note, status, self_reported,
                                ledger_entry_id, recorded_by, decided_by, decided_at)
  VALUES (p_fund_id, p_donor_member_id, v_name, p_amount_vnd, p_donated_on, p_method,
          NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''),
          CASE WHEN p_received THEN 'confirmed' ELSE 'pledged' END, false, v_ledger, v_uid,
          CASE WHEN p_received THEN v_uid END, CASE WHEN p_received THEN now() END)
  RETURNING id INTO v_id;

  IF p_donor_member_id IS NOT NULL THEN
    PERFORM app.fn_notify(p_donor_member_id, 'finance.donation_decided',
      CASE WHEN p_received THEN 'Quỹ nhà đã nhận khoản ủng hộ của bạn' ELSE 'Đã ghi nhận khoản ủng hộ của bạn' END,
      CASE WHEN p_received THEN 'Quỹ nhà đã nhận ' || app.fn_vnd(p_amount_vnd) || '. Xin cảm ơn bạn!' ELSE 'Khoản ' || app.fn_vnd(p_amount_vnd) || ' đang chờ nhận tiền — cảm ơn tấm lòng của bạn.' END,
      jsonb_build_object('link', '/thu-chi'), 'donations', v_id);
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_donation_record(uuid, text, bigint, date, payment_method_t, uuid, text, text, boolean, uuid) IS
  'Thủ quỹ/Trưởng nhà/Admin ghi nhận khoản ủng hộ: đã nhận ⇒ ghi sổ quỹ (nguồn donation) ngay; chưa nhận ⇒ trạng thái pledged. Idempotent theo clientRequestId.';

-- Thành viên tự báo "tôi đã ủng hộ / chuyển khoản" (chờ Thủ quỹ xác nhận, chưa vào sổ quỹ)
CREATE OR REPLACE FUNCTION app.fn_donation_report(p_amount_vnd bigint, p_donated_on date, p_method payment_method_t, p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me   uuid := app.current_member_id();
  v_name text;
  v_id   uuid;
BEGIN
  IF app.current_user_id() IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 THEN
    RAISE EXCEPTION 'Số tiền ủng hộ phải lớn hơn 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donated_on IS NULL OR p_donated_on > app.local_today() THEN
    RAISE EXCEPTION 'Ngày ủng hộ không được ở tương lai.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.donations d WHERE d.donor_member_id = v_me AND d.status = 'pending') >= 5 THEN
    RAISE EXCEPTION 'Bạn đang có quá nhiều khoản báo ủng hộ chờ xác nhận — hãy đợi Thủ quỹ xử lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(m.display_name, m.full_name) INTO v_name FROM public.members m WHERE m.id = v_me;
  INSERT INTO public.donations (donor_member_id, donor_name, amount_vnd, donated_on, method, reference_code, note, status, self_reported, recorded_by)
  VALUES (v_me, v_name, p_amount_vnd, p_donated_on, p_method, NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''),
          'pending', true, app.current_user_id())
  RETURNING id INTO v_id;
  PERFORM app.fn_notify_roles(ARRAY['treasurer', 'house_head', 'admin'], 'finance.donation_pending',
    v_name || ' báo đã ủng hộ quỹ ' || app.fn_vnd(p_amount_vnd),
    'Hình thức: ' || CASE p_method WHEN 'cash' THEN 'tiền mặt' WHEN 'bank_transfer' THEN 'chuyển khoản' WHEN 'e_wallet' THEN 'ví điện tử' ELSE 'khác' END || '. Vào Thu chi → Ủng hộ để xác nhận.',
    jsonb_build_object('link', '/thu-chi'), 'donations', v_id);
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_donation_report(bigint, date, payment_method_t, text, text) IS 'Thành viên tự báo đã ủng hộ quỹ (pending). Báo Thủ quỹ/Trưởng nhà/Admin; chưa ghi sổ cho tới khi được xác nhận.';

-- Xác nhận (đã nhận tiền ⇒ ghi sổ), từ chối (chỉ khi thành viên tự báo), hoặc hủy khoản ghi nhận trước / đang chờ.
CREATE OR REPLACE FUNCTION app.fn_donation_decide(p_id uuid, p_action text, p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v        public.donations%ROWTYPE;
  v_ledger uuid;
  v_note   text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Chỉ Thủ quỹ, Trưởng nhà hoặc Admin được xử lý khoản ủng hộ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.donations d WHERE d.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy khoản ủng hộ.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status NOT IN ('pledged', 'pending') THEN
    RAISE EXCEPTION 'Khoản ủng hộ này đã được xử lý.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_action = 'confirm' THEN
    IF p_fund_id IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    v_ledger := app.fn_post_ledger_entry(p_fund_id, v.donated_on, 'in', v.amount_vnd, 'donation',
      'Ủng hộ quỹ nhà: ' || v.donor_name || ' — ' || app.fn_vnd(v.amount_vnd) || COALESCE(' (' || v.reference_code || ')', ''), NULL);
    UPDATE public.donations SET status = 'confirmed', fund_id = p_fund_id, ledger_entry_id = v_ledger, decided_by = v_uid, decided_at = now(), decision_note = v_note WHERE id = p_id;
    IF v.donor_member_id IS NOT NULL THEN
      PERFORM app.fn_notify(v.donor_member_id, 'finance.donation_decided', 'Quỹ nhà đã nhận khoản ủng hộ của bạn',
        'Quỹ nhà đã nhận ' || app.fn_vnd(v.amount_vnd) || '. Xin cảm ơn bạn!', jsonb_build_object('link', '/thu-chi'), 'donations', p_id);
    END IF;
  ELSIF p_action = 'reject' THEN
    IF v.status <> 'pending' THEN RAISE EXCEPTION 'Chỉ từ chối được khoản thành viên tự báo; khoản ghi nhận trước thì hãy hủy.' USING ERRCODE = 'check_violation'; END IF;
    IF v_note IS NULL OR char_length(v_note) < 5 THEN RAISE EXCEPTION 'Hãy ghi lý do từ chối (tối thiểu 5 ký tự).' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.donations SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = v_note WHERE id = p_id;
    IF v.donor_member_id IS NOT NULL THEN
      PERFORM app.fn_notify(v.donor_member_id, 'finance.donation_decided', 'Chưa ghi nhận khoản ủng hộ bạn báo',
        'Thủ quỹ chưa nhận được ' || app.fn_vnd(v.amount_vnd) || ': ' || v_note || '. Vui lòng kiểm tra lại hoặc liên hệ Thủ quỹ.', jsonb_build_object('link', '/thu-chi'), 'donations', p_id);
    END IF;
  ELSIF p_action = 'cancel' THEN
    UPDATE public.donations SET status = 'cancelled', decided_by = v_uid, decided_at = now(), decision_note = v_note WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Thao tác không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN p_id;
END
$$;
COMMENT ON FUNCTION app.fn_donation_decide(uuid, text, uuid, text) IS 'confirm = đã nhận tiền, ghi sổ quỹ (cần túi quỹ); reject = từ chối khoản thành viên tự báo (có lý do); cancel = hủy khoản ghi nhận trước/đang chờ. Cần finance.contribution.record.';

-- Thành viên rút lại khoản mình đã báo (khi chưa được xác nhận)
CREATE OR REPLACE FUNCTION app.fn_donation_withdraw(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me uuid := app.current_member_id();
BEGIN
  UPDATE public.donations SET status = 'cancelled', decided_at = now(), decision_note = 'Người báo đã rút lại'
   WHERE id = p_id AND donor_member_id = v_me AND v_me IS NOT NULL AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Không rút lại được: khoản không phải của bạn hoặc đã được xử lý.' USING ERRCODE = 'check_violation'; END IF;
END
$$;

ALTER FUNCTION app.fn_donation_record(uuid, text, bigint, date, payment_method_t, uuid, text, text, boolean, uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_donation_report(bigint, date, payment_method_t, text, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_donation_decide(uuid, text, uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_donation_withdraw(uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_donation_record(uuid, text, bigint, date, payment_method_t, uuid, text, text, boolean, uuid),
  app.fn_donation_report(bigint, date, payment_method_t, text, text), app.fn_donation_decide(uuid, text, uuid, text), app.fn_donation_withdraw(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_donation_record(uuid, text, bigint, date, payment_method_t, uuid, text, text, boolean, uuid),
  app.fn_donation_report(bigint, date, payment_method_t, text, text), app.fn_donation_decide(uuid, text, uuid, text), app.fn_donation_withdraw(uuid)
  TO luuxa_app, luuxa_definer, luuxa_owner;

COMMIT;
