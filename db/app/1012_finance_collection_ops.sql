-- =====================================================================
-- 1012 — THU QUỸ: BÁO "ĐÃ ĐÓNG", XÁC NHẬN, NHẮC NỢ. Chạy SAU 1011. Idempotent.
--   • Thành viên bấm "Tôi đã đóng" (tiền mặt / chuyển khoản) ⇒ yêu cầu CHỜ XÁC NHẬN (contribution_claims) + báo Thủ quỹ/Trưởng nhà/Admin.
--     Người có finance.contribution.record xác nhận ⇒ ghi phiếu thu thật (app.fn_record_contribution_payment) hoặc từ chối.
--   • Trưởng nhà cũng được ghi thu / hủy phiếu thu (hoàn tác khi báo nhầm): cấp finance.contribution.record cho house_head.
--     Admin đã có đủ quyền (1002).
--   • Nhắc nợ: app.fn_contribution_remind gửi thông báo trong ứng dụng cho người chưa đóng + ghi nhật ký nhắc (chống nhắc dồn trong 1 giờ).
-- =====================================================================
BEGIN;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'finance.contribution.record' FROM public.roles r WHERE r.code = 'house_head'
ON CONFLICT DO NOTHING;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('finance.claim_pending', 'finance', 'Có người báo đã đóng quỹ — chờ xác nhận', ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('finance.claim_decided', 'finance', 'Kết quả xác nhận khoản bạn báo đã đóng',   ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contribution_claims (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  contribution_id  uuid        NOT NULL REFERENCES public.contributions(id) ON DELETE CASCADE,
  member_id        uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  method           payment_method_t NOT NULL,
  reference_code   text,
  note             text,
  status           text        NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  decision_note    text,
  payment_id       uuid,
  CONSTRAINT ck_contribution_claims__status CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  CONSTRAINT ck_contribution_claims__ref CHECK (reference_code IS NULL OR char_length(reference_code) <= 100),
  CONSTRAINT ck_contribution_claims__note CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_contribution_claims__decision CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  CONSTRAINT ck_contribution_claims__decided CHECK ((status = 'pending') = (decided_at IS NULL))
);
COMMENT ON TABLE public.contribution_claims IS
  'Thành viên báo "đã đóng" một khoản phải thu (chờ Thủ quỹ/Trưởng nhà/Admin xác nhận). Xác nhận ⇒ ghi phiếu thu thật; chưa xác nhận thì khoản vẫn là chưa đóng.';
CREATE UNIQUE INDEX IF NOT EXISTS ux_contribution_claims__pending ON public.contribution_claims (contribution_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_contribution_claims__member_id ON public.contribution_claims (member_id);
CREATE INDEX IF NOT EXISTS ix_contribution_claims__decided_by ON public.contribution_claims (decided_by);

CREATE TABLE IF NOT EXISTS public.contribution_reminders (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  contribution_id  uuid        NOT NULL REFERENCES public.contributions(id) ON DELETE CASCADE,
  member_id        uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sent_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  channel          text        NOT NULL DEFAULT 'in_app',
  CONSTRAINT ck_contribution_reminders__channel CHECK (channel IN ('in_app', 'zalo_group'))
);
COMMENT ON TABLE public.contribution_reminders IS 'Nhật ký nhắc nợ quỹ (ai nhắc ai, khi nào) — dùng chống nhắc dồn và hiển thị "đã nhắc lúc…".';
CREATE INDEX IF NOT EXISTS ix_contribution_reminders__contribution ON public.contribution_reminders (contribution_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS ix_contribution_reminders__member_id ON public.contribution_reminders (member_id);
CREATE INDEX IF NOT EXISTS ix_contribution_reminders__sent_by ON public.contribution_reminders (sent_by);

DROP TRIGGER IF EXISTS trg_contribution_claims__audit ON public.contribution_claims;
CREATE TRIGGER trg_contribution_claims__audit AFTER INSERT OR UPDATE OR DELETE ON public.contribution_claims
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

-- ---------------------------------------------------------------------
-- 2. Hàm
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_vnd(p_amount bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(to_char(COALESCE(p_amount, 0), 'FM999,999,999,999,999'), ',', '.') || ' đ'
$$;

CREATE OR REPLACE FUNCTION app.fn_contribution_claim(p_contribution_id uuid, p_method payment_method_t,
                                                     p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me   uuid := app.current_member_id();
  v_ct   record;
  v_id   uuid;
  v_name text;
BEGIN
  IF app.current_user_id() IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT ct.id, ct.member_id, ct.status::text AS status, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining,
         cp.name AS plan_name
    INTO v_ct
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE ct.id = p_contribution_id;
  IF NOT FOUND OR v_ct.member_id <> v_me THEN
    RAISE EXCEPTION 'Chỉ báo đã đóng được khoản của chính bạn.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ct.status NOT IN ('unpaid', 'partial') OR v_ct.remaining <= 0 THEN
    RAISE EXCEPTION 'Khoản này không còn phải đóng.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contribution_claims c WHERE c.contribution_id = p_contribution_id AND c.status = 'pending') THEN
    RAISE EXCEPTION 'Bạn đã báo đã đóng khoản này — đang chờ Thủ quỹ xác nhận.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.contribution_claims (contribution_id, member_id, method, reference_code, note)
  VALUES (p_contribution_id, v_me, p_method, NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;
  SELECT m.display_name INTO v_name FROM public.members m WHERE m.id = v_me;
  PERFORM app.fn_notify_roles(ARRAY['treasurer', 'house_head', 'admin'], 'finance.claim_pending',
    v_name || ' báo đã đóng ' || v_ct.plan_name,
    'Còn ' || app.fn_vnd(v_ct.remaining) || ' — hình thức: ' || CASE p_method WHEN 'cash' THEN 'tiền mặt' WHEN 'bank_transfer' THEN 'chuyển khoản' WHEN 'e_wallet' THEN 'ví điện tử' ELSE 'khác' END
      || '. Vào Thu chi để xác nhận.',
    jsonb_build_object('link', '/thu-chi'), 'contribution_claims', v_id);
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_contribution_claim(uuid, payment_method_t, text, text) IS
  'Thành viên báo đã đóng khoản của mình (chờ xác nhận). Mỗi khoản chỉ có một yêu cầu đang chờ. Báo Thủ quỹ/Trưởng nhà/Admin.';

CREATE OR REPLACE FUNCTION app.fn_contribution_claim_cancel(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v public.contribution_claims%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.contribution_claims c WHERE c.id = p_claim_id FOR UPDATE;
  IF NOT FOUND OR v.member_id IS DISTINCT FROM app.current_member_id() THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu của bạn.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu đã được xử lý.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.contribution_claims SET status = 'cancelled', decided_at = now(), decision_note = 'Người đóng tự hủy' WHERE id = p_claim_id;
END
$$;

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
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Không có quyền xác nhận thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.contribution_claims c WHERE c.id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT ct.status::text AS status, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining, cp.name AS plan_name
    INTO v_ct
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE ct.id = v.contribution_id;

  IF p_approve THEN
    IF p_fund_id IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    IF v_ct.status NOT IN ('unpaid', 'partial') OR v_ct.remaining <= 0 THEN
      RAISE EXCEPTION 'Khoản này không còn phải đóng (có thể đã được ghi thu).' USING ERRCODE = 'check_violation';
    END IF;
    v_payment := app.fn_record_contribution_payment(
      v.member_id, p_fund_id, v_ct.remaining, v.method, app.local_today(), v.reference_code,
      jsonb_build_array(jsonb_build_object('contribution_id', v.contribution_id, 'amount_vnd', v_ct.remaining)),
      NULL, COALESCE(NULLIF(btrim(p_note), ''), 'Xác nhận thành viên báo đã đóng'));
    UPDATE public.contribution_claims
       SET status = 'confirmed', decided_by = v_uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''), payment_id = v_payment
     WHERE id = p_claim_id;
    PERFORM app.fn_notify(v.member_id, 'finance.claim_decided', 'Đã xác nhận bạn đóng ' || v_ct.plan_name,
      'Thủ quỹ đã ghi nhận ' || app.fn_vnd(v_ct.remaining) || '. Cảm ơn bạn!', jsonb_build_object('link', '/thu-chi'), 'contribution_claims', p_claim_id);
  ELSE
    UPDATE public.contribution_claims
       SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
     WHERE id = p_claim_id;
    PERFORM app.fn_notify(v.member_id, 'finance.claim_decided', 'Chưa ghi nhận bạn đóng ' || v_ct.plan_name,
      'Thủ quỹ chưa nhận được khoản này' || COALESCE(': ' || NULLIF(btrim(p_note), ''), '') || '. Vui lòng kiểm tra lại hoặc liên hệ Thủ quỹ.',
      jsonb_build_object('link', '/thu-chi'), 'contribution_claims', p_claim_id);
  END IF;
  RETURN v_payment;
END
$$;
COMMENT ON FUNCTION app.fn_contribution_claim_decide(uuid, boolean, uuid, text) IS
  'Xác nhận (ghi phiếu thu cho toàn bộ số còn lại) hoặc từ chối yêu cầu "đã đóng" của thành viên. Cần finance.contribution.record. Báo lại cho người đóng.';

CREATE OR REPLACE FUNCTION app.fn_contribution_remind(p_contribution_ids uuid[], p_message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_row     record;
  v_sent    integer := 0;
  v_skipped integer := 0;
  v_late    integer;
BEGIN
  IF v_uid IS NULL OR NOT app.has_any_permission(ARRAY['finance.contribution.record', 'finance.contribution.plan.manage']) THEN
    RAISE EXCEPTION 'Không có quyền nhắc đóng quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_contribution_ids IS NULL OR cardinality(p_contribution_ids) = 0 THEN RETURN jsonb_build_object('sent', 0, 'skipped', 0); END IF;
  IF cardinality(p_contribution_ids) > 200 THEN
    RAISE EXCEPTION 'Mỗi lần nhắc tối đa 200 khoản.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  FOR v_row IN
    SELECT ct.id, ct.member_id, ct.due_date, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining, cp.name AS plan_name
      FROM public.contributions ct
      JOIN public.contribution_plans cp ON cp.id = ct.plan_id AND cp.status <> 'cancelled'
      JOIN public.members m ON m.id = ct.member_id AND m.deleted_at IS NULL
     WHERE ct.id = ANY (p_contribution_ids) AND ct.status IN ('unpaid', 'partial')
       AND (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) > 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.contribution_reminders r
                WHERE r.contribution_id = v_row.id AND r.channel = 'in_app' AND r.sent_at > now() - interval '1 hour') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_late := app.local_today() - v_row.due_date;
    PERFORM app.fn_notify(v_row.member_id,
      CASE WHEN v_late > 0 THEN 'finance.dues_overdue' ELSE 'finance.dues_reminder' END,
      'Nhắc đóng quỹ: ' || v_row.plan_name,
      'Bạn còn thiếu ' || app.fn_vnd(v_row.remaining) || ', hạn ' || to_char(v_row.due_date, 'DD/MM/YYYY')
        || CASE WHEN v_late > 0 THEN ' (quá hạn ' || v_late || ' ngày)' ELSE '' END || '.'
        || COALESCE(' ' || NULLIF(btrim(p_message), ''), ''),
      jsonb_build_object('link', '/thu-chi'), 'contributions', v_row.id);
    INSERT INTO public.contribution_reminders (contribution_id, member_id, sent_by, channel) VALUES (v_row.id, v_row.member_id, v_uid, 'in_app');
    v_sent := v_sent + 1;
  END LOOP;
  RETURN jsonb_build_object('sent', v_sent, 'skipped', v_skipped);
END
$$;
COMMENT ON FUNCTION app.fn_contribution_remind(uuid[], text) IS
  'Nhắc đóng quỹ trong ứng dụng cho người chưa đóng các khoản đã chọn (finance.contribution.record hoặc plan.manage). Bỏ qua khoản đã được nhắc trong 1 giờ qua. Trả {sent, skipped}.';

CREATE OR REPLACE FUNCTION app.fn_contribution_remind_log_group(p_contribution_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_any_permission(ARRAY['finance.contribution.record', 'finance.contribution.plan.manage']) THEN
    RAISE EXCEPTION 'Không có quyền nhắc đóng quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.contribution_reminders (contribution_id, member_id, sent_by, channel)
  SELECT ct.id, ct.member_id, app.current_user_id(), 'zalo_group'
    FROM public.contributions ct WHERE ct.id = ANY (COALESCE(p_contribution_ids, '{}')) AND ct.status IN ('unpaid', 'partial');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_contribution_remind_log_group(uuid[]) IS 'Ghi nhật ký đã nhắc qua nhóm Zalo (sau khi máy chủ gửi tin thành công).';

-- ---------------------------------------------------------------------
-- 3. RLS + quyền
-- ---------------------------------------------------------------------
ALTER TABLE public.contribution_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_reminders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contribution_claims__select ON public.contribution_claims;
CREATE POLICY contribution_claims__select ON public.contribution_claims FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('finance.contribution.read_all')));
DROP POLICY IF EXISTS contribution_reminders__select ON public.contribution_reminders;
CREATE POLICY contribution_reminders__select ON public.contribution_reminders FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('finance.contribution.read_all')));

ALTER TABLE public.contribution_claims OWNER TO luuxa_owner;
ALTER TABLE public.contribution_reminders OWNER TO luuxa_owner;
REVOKE ALL ON public.contribution_claims, public.contribution_reminders FROM luuxa_app;
GRANT SELECT ON public.contribution_claims, public.contribution_reminders TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contribution_claims, public.contribution_reminders TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.fn_vnd(bigint) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_contribution_claim(uuid, payment_method_t, text, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_claim_cancel(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_claim_decide(uuid, boolean, uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_remind(uuid[], text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_remind_log_group(uuid[]) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_vnd(bigint), app.fn_contribution_claim(uuid, payment_method_t, text, text), app.fn_contribution_claim_cancel(uuid),
  app.fn_contribution_claim_decide(uuid, boolean, uuid, text), app.fn_contribution_remind(uuid[], text),
  app.fn_contribution_remind_log_group(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_vnd(bigint), app.fn_contribution_claim(uuid, payment_method_t, text, text), app.fn_contribution_claim_cancel(uuid),
  app.fn_contribution_claim_decide(uuid, boolean, uuid, text), app.fn_contribution_remind(uuid[], text),
  app.fn_contribution_remind_log_group(uuid[]) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

COMMIT;
