-- =====================================================================
-- 1054 — QUỸ RIÊNG CHO CHUYẾN ĐI / SỰ KIỆN (túi quỹ loại 'event'), TÁCH KHỎI QUỸ NHÀ. Chạy SAU 1053. Idempotent.
--   Nền sẵn có từ thiết kế gốc: funds.fund_type = 'event' + funds.event_id (CHECK ck_funds__event), expense_vouchers.event_id,
--   ledger_source_t 'refund'. Bản này bổ sung:
--   [1] Người phụ trách quỹ (fund_managers) — thành viên được thu / lập phiếu chi / ghi chi TRONG ĐÚNG quỹ đó.
--   [2] Danh sách tham gia + mức phải đóng (fund_participants): thành viên HOẶC người ngoài lưu xá (tên + SĐT tùy chọn).
--   [3] Phiếu thu quỹ riêng (fund_receipts) ghi sổ cái qua app.fn_fund_receive; hủy bằng bút toán đảo.
--   [4] Vòng đời: lập quỹ, đổi người tham gia/phụ trách, bù từ quỹ nhà (có lý do), ĐÓNG QUỸ (hoàn lại người đã đóng theo tỷ lệ
--       HOẶC chuyển phần dư về quỹ nhà) + biên bản quyết toán (fund_settlements).
--   [5] Phiếu chi của quỹ riêng: người phụ trách lập + 1 chữ ký (Thủ quỹ/Trưởng nhà), vẫn bắt buộc hóa đơn; người phụ trách ghi "đã chi".
--   [6] CÔ LẬP SỐ LIỆU QUỸ NHÀ: fn_finance_summary, v_period_cashflow, v_expense_by_category, minh bạch công khai LOẠI quỹ 'event'.
--       (Quy tắc: mọi con số TỔNG của quỹ nhà phải lọc fund_type <> 'event'.)
--   Mọi thao tác ghi đi qua hàm SECURITY DEFINER; luuxa_app KHÔNG đọc trực tiếp các bảng mới (đọc qua hàm để che SĐT người ngoài).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [0] Loại thông báo + chỉ mục: mỗi sự kiện tối đa một quỹ riêng
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('finance.eventfund_assigned', 'finance', 'Bạn được giao phụ trách quỹ riêng của một sự kiện',  ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false),
  ('finance.eventfund_settled',  'finance', 'Quỹ riêng của sự kiện bạn tham gia đã quyết toán',    ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS ux_funds__event_one ON public.funds (event_id) WHERE fund_type = 'event' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- [1] Bảng
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fund_managers (
  fund_id     uuid        NOT NULL REFERENCES public.funds(id)   ON DELETE RESTRICT,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  assigned_by uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fund_id, member_id)
);
COMMENT ON TABLE public.fund_managers IS 'Người phụ trách quỹ riêng (loại event): thu / lập phiếu chi / ghi chi trong đúng quỹ này. Ghi qua app.fn_event_fund_create / fn_event_fund_set_managers.';
CREATE INDEX IF NOT EXISTS ix_fund_managers__member_id ON public.fund_managers (member_id);
CREATE INDEX IF NOT EXISTS ix_fund_managers__assigned_by ON public.fund_managers (assigned_by);

CREATE TABLE IF NOT EXISTS public.fund_participants (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  fund_id     uuid        NOT NULL REFERENCES public.funds(id)   ON DELETE RESTRICT,
  member_id   uuid        REFERENCES public.members(id) ON DELETE RESTRICT,
  guest_name  text,
  guest_phone text,
  due_vnd     bigint      NOT NULL DEFAULT 0,
  note        text,
  removed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_fund_participants__who   CHECK ((member_id IS NULL) <> (guest_name IS NULL)),
  CONSTRAINT ck_fund_participants__name  CHECK (guest_name IS NULL OR char_length(btrim(guest_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_fund_participants__phone CHECK (guest_phone IS NULL OR char_length(guest_phone) <= 20),
  CONSTRAINT ck_fund_participants__due   CHECK (due_vnd >= 0 AND due_vnd <= 100000000),
  CONSTRAINT ck_fund_participants__note  CHECK (note IS NULL OR char_length(note) <= 300),
  CONSTRAINT ck_fund_participants__guest_phone_only CHECK (guest_phone IS NULL OR guest_name IS NOT NULL)
);
COMMENT ON TABLE public.fund_participants IS 'Danh sách tham gia quỹ riêng + mức phải đóng. Thành viên (member_id) HOẶC người ngoài lưu xá (guest_name, guest_phone tùy chọn). guest_phone là dữ liệu cá nhân của người ngoài: chỉ người phụ trách / người quản lý đọc được (qua app.fn_event_fund_roster).';
CREATE UNIQUE INDEX IF NOT EXISTS ux_fund_participants__member ON public.fund_participants (fund_id, member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fund_participants__fund_id ON public.fund_participants (fund_id);
CREATE INDEX IF NOT EXISTS ix_fund_participants__member_id ON public.fund_participants (member_id);

CREATE TABLE IF NOT EXISTS public.fund_receipts (
  id                   uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  fund_id              uuid             NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  participant_id       uuid             REFERENCES public.fund_participants(id) ON DELETE RESTRICT,
  payer_name           text             NOT NULL,
  amount_vnd           bigint           NOT NULL,
  method               payment_method_t NOT NULL,
  paid_on              date             NOT NULL,
  reference_code       text,
  note                 text,
  ledger_entry_id      uuid             REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  client_request_id    uuid,
  received_by          uuid             REFERENCES public.users(id) ON DELETE SET NULL,
  voided_at            timestamptz,
  voided_by            uuid             REFERENCES public.users(id) ON DELETE SET NULL,
  void_reason          text,
  void_ledger_entry_id uuid             REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  created_at           timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT ck_fund_receipts__amount CHECK (amount_vnd > 0 AND amount_vnd <= 1000000000),
  CONSTRAINT ck_fund_receipts__name   CHECK (char_length(btrim(payer_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_fund_receipts__ref    CHECK (reference_code IS NULL OR char_length(reference_code) <= 100),
  CONSTRAINT ck_fund_receipts__note   CHECK (note IS NULL OR char_length(note) <= 300),
  CONSTRAINT ck_fund_receipts__void   CHECK ((voided_at IS NULL) = (void_reason IS NULL) AND (voided_at IS NULL) = (voided_by IS NULL))
);
COMMENT ON TABLE public.fund_receipts IS 'Phiếu thu của quỹ riêng: mỗi phiếu có đúng một bút toán thu ở sổ cái (nguồn contribution, source_id = id phiếu). Hủy = voided_* + bút toán đảo (không xóa). participant_id NULL = người đóng ngoài danh sách (ghi tên).';
CREATE UNIQUE INDEX IF NOT EXISTS ux_fund_receipts__request ON public.fund_receipts (received_by, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fund_receipts__fund_id ON public.fund_receipts (fund_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS ix_fund_receipts__participant_id ON public.fund_receipts (participant_id);
CREATE INDEX IF NOT EXISTS ix_fund_receipts__ledger_entry_id ON public.fund_receipts (ledger_entry_id);
CREATE INDEX IF NOT EXISTS ix_fund_receipts__void_ledger_entry_id ON public.fund_receipts (void_ledger_entry_id);
CREATE INDEX IF NOT EXISTS ix_fund_receipts__received_by ON public.fund_receipts (received_by);
CREATE INDEX IF NOT EXISTS ix_fund_receipts__voided_by ON public.fund_receipts (voided_by);

CREATE TABLE IF NOT EXISTS public.fund_settlements (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  fund_id        uuid        NOT NULL UNIQUE REFERENCES public.funds(id) ON DELETE RESTRICT,
  mode           text        NOT NULL,
  balance_vnd    bigint      NOT NULL,
  target_fund_id uuid        REFERENCES public.funds(id) ON DELETE RESTRICT,
  note           text,
  settled_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  settled_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_fund_settlements__mode CHECK (mode IN ('refund', 'to_house', 'none')),
  CONSTRAINT ck_fund_settlements__bal  CHECK (balance_vnd >= 0),
  CONSTRAINT ck_fund_settlements__note CHECK (note IS NULL OR char_length(note) <= 500)
);
COMMENT ON TABLE public.fund_settlements IS 'Biên bản quyết toán khi ĐÓNG quỹ riêng: số dư còn lại lúc đóng và cách xử lý (hoàn lại người đã đóng / chuyển về quỹ nhà / không còn dư).';
CREATE INDEX IF NOT EXISTS ix_fund_settlements__target_fund_id ON public.fund_settlements (target_fund_id);
CREATE INDEX IF NOT EXISTS ix_fund_settlements__settled_by ON public.fund_settlements (settled_by);

CREATE TABLE IF NOT EXISTS public.fund_settlement_lines (
  id              uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  settlement_id   uuid        NOT NULL REFERENCES public.fund_settlements(id) ON DELETE RESTRICT,
  participant_id  uuid        REFERENCES public.fund_participants(id) ON DELETE RESTRICT,
  member_id       uuid        REFERENCES public.members(id) ON DELETE RESTRICT,
  payer_name      text        NOT NULL,
  paid_vnd        bigint      NOT NULL DEFAULT 0,
  amount_vnd      bigint      NOT NULL,
  ledger_entry_id uuid        REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  CONSTRAINT ck_fund_settlement_lines__amount CHECK (amount_vnd > 0 AND paid_vnd >= 0)
);
COMMENT ON TABLE public.fund_settlement_lines IS 'Từng khoản hoàn lại (theo người đóng) hoặc khoản chuyển về quỹ nhà khi đóng quỹ riêng. ledger_entry_id = bút toán chi của quỹ riêng.';
CREATE INDEX IF NOT EXISTS ix_fund_settlement_lines__settlement_id ON public.fund_settlement_lines (settlement_id);
CREATE INDEX IF NOT EXISTS ix_fund_settlement_lines__participant_id ON public.fund_settlement_lines (participant_id);
CREATE INDEX IF NOT EXISTS ix_fund_settlement_lines__member_id ON public.fund_settlement_lines (member_id);
CREATE INDEX IF NOT EXISTS ix_fund_settlement_lines__ledger_entry_id ON public.fund_settlement_lines (ledger_entry_id);

DROP TRIGGER IF EXISTS trg_fund_participants__touch ON public.fund_participants;
CREATE TRIGGER trg_fund_participants__touch BEFORE UPDATE ON public.fund_participants FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_fund_managers__audit ON public.fund_managers;
CREATE TRIGGER trg_fund_managers__audit AFTER INSERT OR UPDATE OR DELETE ON public.fund_managers FOR EACH ROW EXECUTE FUNCTION app.tg_audit('fund_id,member_id');
DROP TRIGGER IF EXISTS trg_fund_participants__audit ON public.fund_participants;
CREATE TRIGGER trg_fund_participants__audit AFTER INSERT OR UPDATE OR DELETE ON public.fund_participants FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'guest_phone,note');
DROP TRIGGER IF EXISTS trg_fund_receipts__audit ON public.fund_receipts;
CREATE TRIGGER trg_fund_receipts__audit AFTER INSERT OR UPDATE OR DELETE ON public.fund_receipts FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'note,reference_code');
DROP TRIGGER IF EXISTS trg_fund_settlements__audit ON public.fund_settlements;
CREATE TRIGGER trg_fund_settlements__audit AFTER INSERT OR UPDATE OR DELETE ON public.fund_settlements FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'note');
DROP TRIGGER IF EXISTS trg_fund_settlement_lines__audit ON public.fund_settlement_lines;
CREATE TRIGGER trg_fund_settlement_lines__audit AFTER INSERT OR UPDATE OR DELETE ON public.fund_settlement_lines FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

-- RLS bật + FORCE; luuxa_app KHÔNG có quyền trên 5 bảng này (đọc qua hàm ở dưới, ghi qua hàm) — chỉ vai trò nền (worker/definer).
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fund_managers', 'fund_participants', 'fund_receipts', 'fund_settlements', 'fund_settlement_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '__system', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true)', t || '__system', t);
    EXECUTE format('ALTER TABLE public.%I OWNER TO luuxa_owner', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM luuxa_app', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO luuxa_worker, luuxa_definer', t);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------
-- [2] Người phụ trách + mức truy cập
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_is_fund_manager(p_fund_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.fund_id = p_fund_id AND fm.member_id = app.current_member_id())
$$;
COMMENT ON FUNCTION app.fn_is_fund_manager(uuid) IS 'Thành viên đăng nhập có phải NGƯỜI PHỤ TRÁCH của quỹ riêng này không (dùng trong RLS phiếu chi / túi quỹ và các hàm quỹ riêng).';

-- Túi quỹ này có phải quỹ riêng (loại event) không — SECURITY DEFINER để người không đọc được bảng funds (RLS) vẫn lọc đúng phiếu chi
CREATE OR REPLACE FUNCTION app.fn_fund_is_event(p_fund_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.funds f WHERE f.id = p_fund_id AND f.fund_type = 'event')
$$;

-- 'house' = người quản lý quỹ nhà (xem mọi quỹ riêng) · 'manager' = người phụ trách quỹ này · NULL = không có quyền quản lý
CREATE OR REPLACE FUNCTION app.fn_event_fund_level(p_fund_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE WHEN app.has_any_permission(ARRAY['finance.fund.manage', 'finance.ledger.read']) THEN 'house'
              WHEN app.fn_is_fund_manager(p_fund_id) THEN 'manager' END
$$;

-- Quỹ riêng phải tồn tại, loại event, chưa xóa. p_active = true ⇒ còn hoạt động.
CREATE OR REPLACE FUNCTION app.fn_event_fund_get(p_fund_id uuid, p_active boolean DEFAULT false)
RETURNS public.funds
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v public.funds%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.funds f WHERE f.id = p_fund_id AND f.fund_type = 'event' AND f.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy quỹ riêng này.' USING ERRCODE = 'no_data_found'; END IF;
  IF p_active AND NOT v.is_active THEN
    RAISE EXCEPTION 'Quỹ "%" đã đóng — không ghi thêm được.', v.name USING ERRCODE = 'check_violation';
  END IF;
  RETURN v;
END
$$;

-- ---------------------------------------------------------------------
-- [3] Danh sách tham gia (dùng nội bộ bởi hàm lập quỹ / sửa danh sách)
--     phần tử: {id?, member_id?, guest_name?, guest_phone?, due_vnd?, note?, remove?}
--       • có id  ⇒ sửa dòng đó (due_vnd/note/tên-SĐT khách) hoặc gỡ (remove = true, chỉ khi chưa có phiếu thu còn hiệu lực)
--       • không id ⇒ thêm thành viên (member_id) hoặc người ngoài (guest_name); thành viên đã từng bị gỡ ⇒ kích hoạt lại
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_event_fund_apply_participants(p_fund_id uuid, p_default_due bigint, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  e       jsonb;
  v_pid   uuid;
  v_mid   uuid;
  v_gname text;
  v_phone text;
  v_due   bigint;
  v_note  text;
  v_rem   boolean;
  v_n     integer := 0;
  v_row   public.fund_participants%ROWTYPE;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN 0; END IF;
  IF jsonb_array_length(p_items) > 300 THEN
    RAISE EXCEPTION 'Mỗi lần cập nhật tối đa 300 người.' USING ERRCODE = 'check_violation';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid   := NULLIF(e ->> 'id', '')::uuid;
    v_mid   := NULLIF(e ->> 'member_id', '')::uuid;
    v_gname := NULLIF(btrim(COALESCE(e ->> 'guest_name', '')), '');
    v_phone := NULLIF(regexp_replace(COALESCE(e ->> 'guest_phone', ''), '[^0-9+]', '', 'g'), '');
    v_note  := NULLIF(btrim(COALESCE(e ->> 'note', '')), '');
    v_rem   := COALESCE((e ->> 'remove')::boolean, false);
    v_due   := NULLIF(e ->> 'due_vnd', '')::bigint;
    IF v_due IS NOT NULL AND (v_due < 0 OR v_due > 100000000) THEN
      RAISE EXCEPTION 'Mức phải đóng của mỗi người từ 0 đến 100.000.000 đ.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_pid IS NOT NULL THEN
      SELECT * INTO v_row FROM public.fund_participants p WHERE p.id = v_pid AND p.fund_id = p_fund_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy người trong danh sách quỹ này.' USING ERRCODE = 'no_data_found'; END IF;
      IF v_rem THEN
        IF EXISTS (SELECT 1 FROM public.fund_receipts r WHERE r.participant_id = v_pid AND r.voided_at IS NULL) THEN
          RAISE EXCEPTION 'Người này đã đóng tiền — hãy hủy phiếu thu trước khi gỡ khỏi danh sách.' USING ERRCODE = 'check_violation';
        END IF;
        UPDATE public.fund_participants SET removed_at = COALESCE(removed_at, now()) WHERE id = v_pid;
      ELSE
        UPDATE public.fund_participants
           SET due_vnd = COALESCE(v_due, due_vnd),
               note = CASE WHEN e ? 'note' THEN v_note ELSE note END,
               guest_name  = CASE WHEN v_row.member_id IS NULL AND v_gname IS NOT NULL THEN v_gname ELSE guest_name END,
               guest_phone = CASE WHEN v_row.member_id IS NULL AND e ? 'guest_phone' THEN v_phone ELSE guest_phone END,
               removed_at = NULL
         WHERE id = v_pid;
      END IF;
    ELSIF v_mid IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_mid AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')) THEN
        RAISE EXCEPTION 'Có thành viên không còn ở nhà hoặc không tồn tại — tải lại trang rồi chọn lại.' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_rem THEN
        INSERT INTO public.fund_participants (fund_id, member_id, due_vnd, note)
        VALUES (p_fund_id, v_mid, COALESCE(v_due, p_default_due, 0), v_note)
        ON CONFLICT (fund_id, member_id) WHERE member_id IS NOT NULL
        DO UPDATE SET removed_at = NULL, due_vnd = COALESCE(v_due, public.fund_participants.due_vnd), note = COALESCE(v_note, public.fund_participants.note);
      END IF;
    ELSIF v_gname IS NOT NULL THEN
      IF char_length(v_gname) < 2 OR char_length(v_gname) > 120 THEN
        RAISE EXCEPTION 'Tên người ngoài từ 2 đến 120 ký tự.' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_rem THEN
        INSERT INTO public.fund_participants (fund_id, guest_name, guest_phone, due_vnd, note)
        VALUES (p_fund_id, v_gname, v_phone, COALESCE(v_due, p_default_due, 0), v_note);
      END IF;
    ELSE
      RAISE EXCEPTION 'Mỗi dòng phải là thành viên (member_id) hoặc người ngoài (guest_name).' USING ERRCODE = 'check_violation';
    END IF;
    v_n := v_n + 1;
  END LOOP;
  IF (SELECT count(*) FROM public.fund_participants p WHERE p.fund_id = p_fund_id AND p.removed_at IS NULL) > 300 THEN
    RAISE EXCEPTION 'Mỗi quỹ tối đa 300 người tham gia.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_n;
END
$$;

-- ---------------------------------------------------------------------
-- [4] Lập quỹ riêng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_event_fund_create(
  p_event_id        uuid,
  p_name            text,
  p_managers        uuid[],
  p_default_due_vnd bigint DEFAULT 0,
  p_participants    jsonb  DEFAULT '[]'::jsonb,
  p_description     text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_name  text := btrim(COALESCE(p_name, ''));
  v_event public.events%ROWTYPE;
  v_base  text;
  v_code  text;
  v_n     integer := 0;
  v_id    uuid;
  v_mgr   uuid;
  v_cnt   integer;
  v_bad   integer;
BEGIN
  IF app.lacks_permission('finance.fund.manage') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Thủ quỹ được lập quỹ riêng cho sự kiện.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_name) < 3 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tên quỹ từ 3 đến 120 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_default_due_vnd IS NULL OR p_default_due_vnd < 0 OR p_default_due_vnd > 100000000 THEN
    RAISE EXCEPTION 'Mức đóng chung từ 0 đến 100.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_event FROM public.events e WHERE e.id = p_event_id AND e.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy sự kiện.' USING ERRCODE = 'no_data_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.funds f WHERE f.event_id = p_event_id AND f.fund_type = 'event' AND f.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sự kiện này đã có quỹ riêng.' USING ERRCODE = 'unique_violation';
  END IF;
  IF p_managers IS NULL OR cardinality(p_managers) < 1 OR cardinality(p_managers) > 5 THEN
    RAISE EXCEPTION 'Chọn từ 1 đến 5 người phụ trách quỹ.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(DISTINCT x) INTO v_cnt FROM unnest(p_managers) x;
  IF v_cnt <> cardinality(p_managers) THEN
    RAISE EXCEPTION 'Danh sách người phụ trách bị trùng.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO v_bad FROM unnest(p_managers) x
    LEFT JOIN public.members m ON m.id = x AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
   WHERE m.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Có người phụ trách không còn ở nhà hoặc không tồn tại.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('funds:event_code'));
  v_base := 'QR' || to_char(app.local_today(), 'YYMM');
  v_code := v_base;
  WHILE EXISTS (SELECT 1 FROM public.funds f WHERE f.code = v_code) LOOP
    v_n := v_n + 1;
    v_code := v_base || '_' || v_n;
  END LOOP;

  INSERT INTO public.funds (code, name, fund_type, event_id, allow_negative, description)
  VALUES (v_code, v_name, 'event', p_event_id, false, NULLIF(btrim(COALESCE(p_description, '')), ''))
  RETURNING id INTO v_id;

  FOREACH v_mgr IN ARRAY p_managers LOOP
    INSERT INTO public.fund_managers (fund_id, member_id, assigned_by) VALUES (v_id, v_mgr, v_uid);
    PERFORM app.fn_notify(v_mgr, 'finance.eventfund_assigned', 'Bạn được giao phụ trách quỹ "' || v_name || '"',
      'Bạn có thể ghi thu, lập phiếu chi và ghi chi của quỹ này (phiếu chi cần Thủ quỹ hoặc Trưởng nhà duyệt). Mở Thu chi → Quỹ riêng.',
      jsonb_build_object('link', '/thu-chi?tab=quy-rieng&fund=' || v_id::text), 'funds', v_id);
  END LOOP;

  PERFORM app.fn_event_fund_apply_participants(v_id, p_default_due_vnd, p_participants);
  PERFORM app.write_audit('OTHER', 'funds', v_id::text, 'EVENT_FUND_CREATE: lập quỹ riêng "' || v_name || '" cho sự kiện "' || v_event.title || '"', NULL,
    jsonb_build_object('fund_id', v_id, 'event_id', p_event_id, 'managers', p_managers));
  RETURN jsonb_build_object('fund_id', v_id, 'code', v_code, 'name', v_name);
END
$$;
COMMENT ON FUNCTION app.fn_event_fund_create(uuid, text, uuid[], bigint, jsonb, text) IS
  'Lập quỹ riêng (túi quỹ loại event) cho một sự kiện: 1–5 người phụ trách + danh sách tham gia (thành viên / người ngoài) với mức đóng chung. Cần finance.fund.manage. Mỗi sự kiện một quỹ.';

-- Sửa danh sách tham gia (người phụ trách hoặc người quản lý quỹ nhà); quỹ phải còn hoạt động
CREATE OR REPLACE FUNCTION app.fn_event_fund_set_participants(p_fund_id uuid, p_items jsonb, p_default_due_vnd bigint DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_fund public.funds%ROWTYPE;
BEGIN
  IF app.current_user_id() IS NULL OR (NOT app.has_permission('finance.fund.manage') AND NOT app.fn_is_fund_manager(p_fund_id)) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách quỹ hoặc người quản lý được sửa danh sách tham gia.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_fund := app.fn_event_fund_get(p_fund_id, true);
  IF p_default_due_vnd IS NULL OR p_default_due_vnd < 0 OR p_default_due_vnd > 100000000 THEN
    RAISE EXCEPTION 'Mức đóng chung từ 0 đến 100.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN app.fn_event_fund_apply_participants(v_fund.id, p_default_due_vnd, p_items);
END
$$;

-- Đổi người phụ trách (chỉ người quản lý quỹ nhà)
CREATE OR REPLACE FUNCTION app.fn_event_fund_set_managers(p_fund_id uuid, p_managers uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_fund public.funds%ROWTYPE;
  v_mgr  uuid;
  v_cnt  integer;
  v_bad  integer;
BEGIN
  IF app.lacks_permission('finance.fund.manage') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Thủ quỹ được đổi người phụ trách quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_fund := app.fn_event_fund_get(p_fund_id, true);
  IF p_managers IS NULL OR cardinality(p_managers) < 1 OR cardinality(p_managers) > 5 THEN
    RAISE EXCEPTION 'Chọn từ 1 đến 5 người phụ trách quỹ.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(DISTINCT x) INTO v_cnt FROM unnest(p_managers) x;
  IF v_cnt <> cardinality(p_managers) THEN RAISE EXCEPTION 'Danh sách người phụ trách bị trùng.' USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*) INTO v_bad FROM unnest(p_managers) x
    LEFT JOIN public.members m ON m.id = x AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
   WHERE m.id IS NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Có người phụ trách không còn ở nhà hoặc không tồn tại.' USING ERRCODE = 'check_violation'; END IF;

  DELETE FROM public.fund_managers fm WHERE fm.fund_id = p_fund_id AND NOT (fm.member_id = ANY (p_managers));
  FOREACH v_mgr IN ARRAY p_managers LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.fund_id = p_fund_id AND fm.member_id = v_mgr) THEN
      INSERT INTO public.fund_managers (fund_id, member_id, assigned_by) VALUES (p_fund_id, v_mgr, app.current_user_id());
      PERFORM app.fn_notify(v_mgr, 'finance.eventfund_assigned', 'Bạn được giao phụ trách quỹ "' || v_fund.name || '"',
        'Bạn có thể ghi thu, lập phiếu chi và ghi chi của quỹ này. Mở Thu chi → Quỹ riêng.',
        jsonb_build_object('link', '/thu-chi?tab=quy-rieng&fund=' || p_fund_id::text), 'funds', p_fund_id);
    END IF;
  END LOOP;
  RETURN cardinality(p_managers);
END
$$;

-- ---------------------------------------------------------------------
-- [5] Thu / hủy thu của quỹ riêng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_fund_receive(
  p_fund_id           uuid,
  p_participant_id    uuid,
  p_payer_name        text,
  p_amount_vnd        bigint,
  p_method            payment_method_t,
  p_paid_on           date,
  p_reference         text DEFAULT NULL,
  p_note              text DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_fund   public.funds%ROWTYPE;
  v_part   public.fund_participants%ROWTYPE;
  v_name   text := NULLIF(btrim(COALESCE(p_payer_name, '')), '');
  v_ref    text := NULLIF(btrim(COALESCE(p_reference, '')), '');
  v_id     uuid;
  v_entry  uuid := app.uuid_v7();
BEGIN
  IF v_uid IS NULL OR (NOT app.fn_is_fund_manager(p_fund_id) AND NOT app.has_permission('finance.contribution.record')) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách quỹ hoặc Thủ quỹ được ghi nhận khoản thu của quỹ riêng.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT r.id INTO v_id FROM public.fund_receipts r WHERE r.received_by = v_uid AND r.client_request_id = p_client_request_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  v_fund := app.fn_event_fund_get(p_fund_id, true);
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 OR p_amount_vnd > 1000000000 THEN
    RAISE EXCEPTION 'Số tiền thu phải lớn hơn 0 và tối đa 1.000.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > app.local_today() THEN
    RAISE EXCEPTION 'Ngày thu không được ở tương lai.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_ref IS NOT NULL AND char_length(v_ref) > 100 THEN RAISE EXCEPTION 'Mã tham chiếu tối đa 100 ký tự.' USING ERRCODE = 'check_violation'; END IF;
  IF p_note IS NOT NULL AND char_length(btrim(p_note)) > 300 THEN RAISE EXCEPTION 'Ghi chú tối đa 300 ký tự.' USING ERRCODE = 'check_violation'; END IF;

  IF p_participant_id IS NOT NULL THEN
    SELECT * INTO v_part FROM public.fund_participants p WHERE p.id = p_participant_id AND p.fund_id = p_fund_id AND p.removed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Người đóng không có trong danh sách của quỹ này.' USING ERRCODE = 'check_violation'; END IF;
    IF v_name IS NULL THEN
      v_name := COALESCE(v_part.guest_name, (SELECT COALESCE(m.display_name, m.full_name) FROM public.members m WHERE m.id = v_part.member_id));
    END IF;
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Hãy nhập tên người đóng tiền.' USING ERRCODE = 'check_violation';
  END IF;

  v_id := app.uuid_v7();
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, counterparty_member_id, description, created_by)
  VALUES (v_entry, p_fund_id, p_paid_on, 'in', p_amount_vnd, 'contribution', v_id, v_part.member_id,
          left('Thu quỹ "' || v_fund.name || '": ' || v_name || COALESCE(' [tham chiếu ' || v_ref || ']', ''), 500), v_uid);
  INSERT INTO public.fund_receipts (id, fund_id, participant_id, payer_name, amount_vnd, method, paid_on, reference_code, note,
                                    ledger_entry_id, client_request_id, received_by)
  VALUES (v_id, p_fund_id, p_participant_id, v_name, p_amount_vnd, p_method, p_paid_on, v_ref, NULLIF(btrim(COALESCE(p_note, '')), ''),
          v_entry, p_client_request_id, v_uid);
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_fund_receive(uuid, uuid, text, bigint, payment_method_t, date, text, text, uuid) IS
  'Ghi thu vào quỹ riêng (người phụ trách hoặc Thủ quỹ): bút toán thu ở sổ cái + phiếu thu; idempotent theo (người ghi, client_request_id). participant_id NULL = người đóng ngoài danh sách.';

CREATE OR REPLACE FUNCTION app.fn_fund_void_receipt(p_receipt_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v       public.fund_receipts%ROWTYPE;
  v_entry uuid := app.uuid_v7();
BEGIN
  SELECT * INTO v FROM public.fund_receipts r WHERE r.id = p_receipt_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR (NOT app.fn_is_fund_manager(v.fund_id) AND NOT app.has_permission('finance.contribution.record')) THEN
    RAISE EXCEPTION 'Không có quyền hủy phiếu thu này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_text(p_reason, 5) THEN RAISE EXCEPTION 'Lý do hủy tối thiểu 5 ký tự.' USING ERRCODE = 'check_violation'; END IF;
  IF v.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Phiếu thu đã hủy trước đó.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM app.fn_event_fund_get(v.fund_id, true);
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, reversal_of_id,
                                     counterparty_member_id, description, created_by)
  VALUES (v_entry, v.fund_id, app.local_today(), 'out', v.amount_vnd, 'reversal', v.id, v.ledger_entry_id,
          (SELECT p.member_id FROM public.fund_participants p WHERE p.id = v.participant_id),
          left('Hủy phiếu thu quỹ riêng: ' || v.payer_name || ' — ' || btrim(p_reason), 500), v_uid);
  UPDATE public.fund_receipts SET voided_at = now(), voided_by = v_uid, void_reason = btrim(p_reason), void_ledger_entry_id = v_entry WHERE id = v.id;
  RETURN v_entry;
END
$$;
COMMENT ON FUNCTION app.fn_fund_void_receipt(uuid, text) IS 'Hủy phiếu thu quỹ riêng bằng bút toán đảo (cần đủ số dư); không xóa dữ liệu.';

-- ---------------------------------------------------------------------
-- [6] Đọc cho giao diện (SECURITY DEFINER + kiểm quyền trong thân hàm; che SĐT người ngoài)
-- ---------------------------------------------------------------------
-- Danh sách quỹ: người quản lý quỹ nhà thấy tất cả; người phụ trách thấy quỹ của mình; thành viên thấy quỹ mình có tên (chỉ phần của mình)
CREATE OR REPLACE FUNCTION app.fn_event_fund_list()
RETURNS TABLE (
  fund_id uuid, code text, name text, is_active boolean, event_id uuid, event_title text, event_starts_at timestamptz,
  relation text, balance_vnd bigint, participant_count integer, due_total_vnd bigint, paid_total_vnd bigint,
  my_due_vnd bigint, my_paid_vnd bigint, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_me    uuid := app.current_member_id();
  v_house boolean;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_house := app.has_any_permission(ARRAY['finance.fund.manage', 'finance.ledger.read']);
  RETURN QUERY
  SELECT f.id, f.code, f.name, f.is_active, f.event_id, ev.title, ev.starts_at,
         CASE WHEN fm.member_id IS NOT NULL THEN 'manager' WHEN v_house THEN 'house' ELSE 'participant' END,
         CASE WHEN v_house OR fm.member_id IS NOT NULL
              THEN (SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0)::bigint FROM public.ledger_entries le WHERE le.fund_id = f.id) END,
         CASE WHEN v_house OR fm.member_id IS NOT NULL
              THEN (SELECT count(*)::int FROM public.fund_participants p WHERE p.fund_id = f.id AND p.removed_at IS NULL) END,
         CASE WHEN v_house OR fm.member_id IS NOT NULL
              THEN (SELECT COALESCE(sum(p.due_vnd), 0)::bigint FROM public.fund_participants p WHERE p.fund_id = f.id AND p.removed_at IS NULL) END,
         CASE WHEN v_house OR fm.member_id IS NOT NULL
              THEN (SELECT COALESCE(sum(r.amount_vnd), 0)::bigint FROM public.fund_receipts r WHERE r.fund_id = f.id AND r.voided_at IS NULL) END,
         me.due_vnd,
         CASE WHEN me.id IS NOT NULL THEN (SELECT COALESCE(sum(r.amount_vnd), 0)::bigint FROM public.fund_receipts r WHERE r.participant_id = me.id AND r.voided_at IS NULL) END,
         f.created_at
    FROM public.funds f
    LEFT JOIN public.events ev ON ev.id = f.event_id
    LEFT JOIN public.fund_managers fm ON fm.fund_id = f.id AND fm.member_id = v_me
    LEFT JOIN public.fund_participants me ON me.fund_id = f.id AND me.member_id = v_me AND me.removed_at IS NULL
   WHERE f.fund_type = 'event' AND f.deleted_at IS NULL
     AND (v_house OR fm.member_id IS NOT NULL OR me.id IS NOT NULL)
   ORDER BY f.is_active DESC, f.created_at DESC;
END
$$;

-- Người tham gia (kèm số đã đóng). Quản lý/phụ trách: tất cả (SĐT người ngoài hiện); thành viên: chỉ dòng của mình.
CREATE OR REPLACE FUNCTION app.fn_event_fund_roster(p_fund_id uuid)
RETURNS TABLE (
  participant_id uuid, member_id uuid, name text, is_guest boolean, guest_phone text,
  due_vnd bigint, paid_vnd bigint, note text, removed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_level text;
  v_me    uuid := app.current_member_id();
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_level := app.fn_event_fund_level(p_fund_id);
  IF v_level IS NULL AND NOT EXISTS (SELECT 1 FROM public.fund_participants p WHERE p.fund_id = p_fund_id AND p.member_id = v_me AND p.removed_at IS NULL) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem quỹ này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT p.id, p.member_id, COALESCE(p.guest_name, m.display_name, m.full_name)::text, p.member_id IS NULL,
         (CASE WHEN v_level IS NOT NULL THEN p.guest_phone END)::text,
         p.due_vnd,
         (SELECT COALESCE(sum(r.amount_vnd), 0)::bigint FROM public.fund_receipts r WHERE r.participant_id = p.id AND r.voided_at IS NULL),
         p.note, p.removed_at
    FROM public.fund_participants p
    LEFT JOIN public.members m ON m.id = p.member_id
   WHERE p.fund_id = p_fund_id AND (v_level IS NOT NULL OR p.member_id = v_me)
   ORDER BY (p.removed_at IS NOT NULL), p.member_id IS NULL, COALESCE(p.guest_name, m.display_name, m.full_name);
END
$$;

-- Phiếu thu của quỹ (quản lý/phụ trách: tất cả; thành viên: phiếu của mình)
CREATE OR REPLACE FUNCTION app.fn_event_fund_receipts(p_fund_id uuid)
RETURNS TABLE (
  receipt_id uuid, participant_id uuid, payer_name text, amount_vnd bigint, method text, paid_on date, reference_code text, note text,
  received_by_name text, created_at timestamptz, voided_at timestamptz, void_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_level text;
  v_me    uuid := app.current_member_id();
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_level := app.fn_event_fund_level(p_fund_id);
  IF v_level IS NULL AND NOT EXISTS (SELECT 1 FROM public.fund_participants p WHERE p.fund_id = p_fund_id AND p.member_id = v_me AND p.removed_at IS NULL) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem quỹ này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT r.id, r.participant_id, r.payer_name, r.amount_vnd, r.method::text, r.paid_on, r.reference_code, r.note,
         (SELECT COALESCE(m.display_name, m.full_name)::text FROM public.members m WHERE m.user_id = r.received_by LIMIT 1),
         r.created_at, r.voided_at, r.void_reason
    FROM public.fund_receipts r
    LEFT JOIN public.fund_participants p ON p.id = r.participant_id
   WHERE r.fund_id = p_fund_id AND (v_level IS NOT NULL OR p.member_id = v_me)
   ORDER BY r.paid_on DESC, r.created_at DESC;
END
$$;

-- Tóm tắt quỹ (quản lý / phụ trách): số dư, thu, chi, bù từ quỹ nhà, hoàn lại, tiến độ đóng, phiếu chi chờ, biên bản quyết toán
CREATE OR REPLACE FUNCTION app.fn_event_fund_summary(p_fund_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_level   text;
  v_fund    public.funds%ROWTYPE;
  v_event   public.events%ROWTYPE;
  v_bal     bigint;
  v_recv    bigint;
  v_spent   bigint;
  v_subs    bigint;
  v_refund  bigint;
  v_due     bigint;
  v_cnt     integer;
  v_full    integer;
  v_part    integer;
  v_pending integer;
  v_mgrs    jsonb;
  v_settle  jsonb;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_level := app.fn_event_fund_level(p_fund_id);
  IF v_level IS NULL THEN
    RAISE EXCEPTION 'Bạn không có quyền xem tổng hợp quỹ này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_fund := app.fn_event_fund_get(p_fund_id, false);
  SELECT * INTO v_event FROM public.events e WHERE e.id = v_fund.event_id;

  SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0)::bigint,
         COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'refund'), 0)::bigint,
         COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END) FILTER (WHERE le.source_type = 'adjustment'), 0)::bigint
    INTO v_bal, v_refund, v_subs
    FROM public.ledger_entries le WHERE le.fund_id = p_fund_id;
  SELECT COALESCE(sum(r.amount_vnd), 0)::bigint INTO v_recv FROM public.fund_receipts r WHERE r.fund_id = p_fund_id AND r.voided_at IS NULL;
  SELECT COALESCE(sum(ev.amount_vnd), 0)::bigint INTO v_spent FROM public.expense_vouchers ev WHERE ev.fund_id = p_fund_id AND ev.status = 'paid';
  SELECT count(*)::int INTO v_pending FROM public.expense_vouchers ev WHERE ev.fund_id = p_fund_id AND ev.status IN ('pending_approval', 'approved');

  SELECT count(*)::int, COALESCE(sum(p.due_vnd), 0)::bigint,
         count(*) FILTER (WHERE x.paid >= p.due_vnd AND p.due_vnd > 0)::int,
         count(*) FILTER (WHERE x.paid > 0 AND x.paid < p.due_vnd)::int
    INTO v_cnt, v_due, v_full, v_part
    FROM public.fund_participants p
    CROSS JOIN LATERAL (SELECT COALESCE(sum(r.amount_vnd), 0) AS paid FROM public.fund_receipts r WHERE r.participant_id = p.id AND r.voided_at IS NULL) x
   WHERE p.fund_id = p_fund_id AND p.removed_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('member_id', fm.member_id, 'name', COALESCE(m.display_name, m.full_name)) ORDER BY fm.assigned_at), '[]'::jsonb)
    INTO v_mgrs FROM public.fund_managers fm JOIN public.members m ON m.id = fm.member_id WHERE fm.fund_id = p_fund_id;

  SELECT jsonb_build_object('mode', s.mode, 'balance_vnd', s.balance_vnd, 'note', s.note, 'settled_at', s.settled_at,
           'target_fund_name', (SELECT t.name FROM public.funds t WHERE t.id = s.target_fund_id),
           'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', l.payer_name, 'paid_vnd', l.paid_vnd, 'amount_vnd', l.amount_vnd) ORDER BY l.payer_name)
                               FROM public.fund_settlement_lines l WHERE l.settlement_id = s.id), '[]'::jsonb))
    INTO v_settle FROM public.fund_settlements s WHERE s.fund_id = p_fund_id;

  RETURN jsonb_build_object(
    'level', v_level,
    'fund', jsonb_build_object('id', v_fund.id, 'code', v_fund.code, 'name', v_fund.name, 'is_active', v_fund.is_active, 'description', v_fund.description,
                               'event_id', v_fund.event_id, 'event_title', v_event.title, 'event_starts_at', v_event.starts_at, 'created_at', v_fund.created_at),
    'balance_vnd', v_bal, 'receipts_vnd', v_recv, 'spent_vnd', v_spent, 'subsidy_vnd', v_subs, 'refunded_vnd', v_refund,
    'participants', jsonb_build_object('count', v_cnt, 'due_vnd', v_due, 'paid_full', v_full, 'paid_partial', v_part),
    'pending_vouchers', v_pending,
    'managers', v_mgrs,
    'settlement', v_settle);
END
$$;

-- ---------------------------------------------------------------------
-- [7] Bù từ quỹ nhà (Trưởng nhà; có lý do) — quỹ riêng chi vượt thu thì KHÔNG tự âm, phải bù bằng thao tác này hoặc thu thêm
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_event_fund_house_subsidy(p_fund_id uuid, p_amount_vnd bigint, p_reason text, p_house_fund_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_fund  public.funds%ROWTYPE;
  v_house uuid;
  v_out   uuid := app.uuid_v7();
  v_in    uuid := app.uuid_v7();
  v_why   text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF app.lacks_permission('finance.ledger.adjust') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà được bù từ quỹ nhà sang quỹ riêng (cần quyền điều chỉnh sổ quỹ).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_why IS NULL OR char_length(v_why) < 10 THEN
    RAISE EXCEPTION 'Phải ghi rõ lý do bù (tối thiểu 10 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 OR p_amount_vnd > 100000000 THEN
    RAISE EXCEPTION 'Số tiền bù phải lớn hơn 0 và tối đa 100.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  v_fund := app.fn_event_fund_get(p_fund_id, true);
  v_house := app.fn_plan_fund(p_house_fund_id);
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, description, created_by)
  VALUES (v_out, v_house, app.local_today(), 'out', p_amount_vnd, 'adjustment', left('Bù cho quỹ riêng "' || v_fund.name || '": ' || v_why, 500), v_uid);
  INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, description, created_by)
  VALUES (v_in, p_fund_id, app.local_today(), 'in', p_amount_vnd, 'adjustment', left('Quỹ nhà bù vào quỹ riêng: ' || v_why, 500), v_uid);
  PERFORM app.write_audit('LEDGER_MANUAL_ENTRY', 'funds', p_fund_id::text, 'EVENT_FUND_SUBSIDY: ' || v_why, NULL,
    jsonb_build_object('event_fund_id', p_fund_id, 'house_fund_id', v_house, 'amount_vnd', p_amount_vnd, 'ledger_out', v_out, 'ledger_in', v_in));
  RETURN v_in;
END
$$;
COMMENT ON FUNCTION app.fn_event_fund_house_subsidy(uuid, bigint, text, uuid) IS
  'Quỹ nhà bù tiền sang quỹ riêng (Trưởng nhà, lý do ≥ 10 ký tự): bút toán chi điều chỉnh ở quỹ nhà + bút toán thu điều chỉnh ở quỹ riêng; ghi audit LEDGER_MANUAL_ENTRY.';

-- ---------------------------------------------------------------------
-- [8] ĐÓNG QUỸ: hoàn lại người đã đóng theo tỷ lệ ('refund') hoặc chuyển phần dư về quỹ nhà ('to_house')
-- ---------------------------------------------------------------------
-- Người đã đóng + số tiền ròng (phiếu thu còn hiệu lực): người trong danh sách gom theo dòng danh sách, người đóng ngoài danh sách gom theo tên
CREATE OR REPLACE FUNCTION app.fn_event_fund_payers(p_fund_id uuid)
RETURNS TABLE (participant_id uuid, member_id uuid, payer_name text, paid bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT fr.participant_id, fp.member_id,
         (CASE WHEN fr.participant_id IS NOT NULL
               THEN COALESCE(fp.guest_name, (SELECT COALESCE(m.display_name, m.full_name) FROM public.members m WHERE m.id = fp.member_id))
               ELSE min(fr.payer_name) END)::text,
         sum(fr.amount_vnd)::bigint
    FROM public.fund_receipts fr
    LEFT JOIN public.fund_participants fp ON fp.id = fr.participant_id
   WHERE fr.fund_id = p_fund_id AND fr.voided_at IS NULL
   GROUP BY fr.participant_id, fp.member_id, fp.guest_name, CASE WHEN fr.participant_id IS NULL THEN lower(btrim(fr.payer_name)) END
$$;
ALTER FUNCTION app.fn_event_fund_payers(uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_event_fund_payers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_event_fund_payers(uuid) TO luuxa_definer, luuxa_owner;

CREATE OR REPLACE FUNCTION app.fn_event_fund_close(p_fund_id uuid, p_mode text, p_note text DEFAULT NULL, p_target_fund_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_fund    public.funds%ROWTYPE;
  v_bal     bigint;
  v_total   bigint;
  v_left    bigint;
  v_share   bigint;
  v_settle  uuid := app.uuid_v7();
  v_target  uuid;
  v_out     uuid;
  v_in      uuid;
  v_note    text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_lines   integer := 0;
  v_pending integer;
  v_idx     integer := 0;
  v_cnt     integer;
  v_mode    text;
  v_pay     record;
BEGIN
  IF app.lacks_permission('finance.fund.manage') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Thủ quỹ được đóng quỹ riêng.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('refund', 'to_house') THEN
    RAISE EXCEPTION 'Chọn cách xử lý phần dư: hoàn lại người đã đóng hoặc chuyển về quỹ nhà.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.funds f WHERE f.id = p_fund_id FOR UPDATE;
  v_fund := app.fn_event_fund_get(p_fund_id, true);

  SELECT count(*)::int INTO v_pending FROM public.expense_vouchers ev WHERE ev.fund_id = p_fund_id AND ev.status IN ('pending_approval', 'approved');
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Còn % phiếu chi đang chờ duyệt hoặc chưa ghi chi — hãy xử lý (duyệt, ghi chi hoặc hủy) trước khi đóng quỹ.', v_pending USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0)::bigint INTO v_bal
    FROM public.ledger_entries le WHERE le.fund_id = p_fund_id;
  v_mode := CASE WHEN v_bal = 0 THEN 'none' ELSE p_mode END;

  INSERT INTO public.fund_settlements (id, fund_id, mode, balance_vnd, target_fund_id, note, settled_by)
  VALUES (v_settle, p_fund_id, v_mode, v_bal, NULL, v_note, v_uid);

  IF v_bal > 0 AND p_mode = 'refund' THEN
    -- Mỗi "người đóng" = một người trong danh sách (thành viên / người ngoài) hoặc một tên đóng ngoài danh sách (app.fn_event_fund_payers)
    SELECT COALESCE(sum(x.paid), 0), count(*)::int INTO v_total, v_cnt FROM app.fn_event_fund_payers(p_fund_id) x;
    IF v_total < v_bal THEN
      RAISE EXCEPTION 'Quỹ còn dư % đ, nhiều hơn tổng tiền mọi người đã đóng (% đ) vì có tiền bù từ quỹ nhà — hãy chọn "Chuyển phần dư về quỹ nhà".', v_bal, v_total
        USING ERRCODE = 'check_violation';
    END IF;
    v_left := v_bal;
    FOR v_pay IN SELECT * FROM app.fn_event_fund_payers(p_fund_id) ORDER BY paid, payer_name LOOP   -- người đóng nhiều nhất đứng cuối: nhận phần lẻ
      v_idx := v_idx + 1;
      v_share := CASE WHEN v_idx = v_cnt THEN v_left ELSE floor(v_bal::numeric * v_pay.paid / v_total)::bigint END;
      v_share := LEAST(v_share, v_left, v_pay.paid);
      IF v_share > 0 THEN
        v_out := app.uuid_v7();
        INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, counterparty_member_id, description, created_by)
        VALUES (v_out, p_fund_id, app.local_today(), 'out', v_share, 'refund', v_settle, v_pay.member_id,
                left('Hoàn quỹ "' || v_fund.name || '" cho ' || v_pay.payer_name, 500), v_uid);
        INSERT INTO public.fund_settlement_lines (settlement_id, participant_id, member_id, payer_name, paid_vnd, amount_vnd, ledger_entry_id)
        VALUES (v_settle, v_pay.participant_id, v_pay.member_id, v_pay.payer_name, v_pay.paid, v_share, v_out);
        v_left := v_left - v_share;
        v_lines := v_lines + 1;
        IF v_pay.member_id IS NOT NULL THEN
          PERFORM app.fn_notify(v_pay.member_id, 'finance.eventfund_settled', 'Quỹ "' || v_fund.name || '" đã quyết toán',
            'Bạn được hoàn lại ' || app.fn_vnd(v_share) || ' (đã đóng ' || app.fn_vnd(v_pay.paid) || ').', jsonb_build_object('link', '/thu-chi?tab=quy-rieng&fund=' || p_fund_id::text), 'funds', p_fund_id);
        END IF;
      END IF;
    END LOOP;
    IF v_left <> 0 THEN
      RAISE EXCEPTION 'Không chia hết số dư (còn % đ) — hãy chọn "Chuyển phần dư về quỹ nhà".', v_left USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_bal > 0 AND p_mode = 'to_house' THEN
    v_target := app.fn_plan_fund(p_target_fund_id);
    v_out := app.uuid_v7();
    v_in  := app.uuid_v7();
    INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, description, created_by)
    VALUES (v_out, p_fund_id, app.local_today(), 'out', v_bal, 'refund', v_settle, left('Chuyển phần dư quỹ "' || v_fund.name || '" về quỹ nhà', 500), v_uid);
    INSERT INTO public.ledger_entries (id, fund_id, entry_date, direction, amount_vnd, source_type, source_id, description, created_by)
    VALUES (v_in, v_target, app.local_today(), 'in', v_bal, 'donation', v_settle, left('Phần dư quỹ riêng "' || v_fund.name || '" chuyển về quỹ nhà', 500), v_uid);
    INSERT INTO public.fund_settlement_lines (settlement_id, payer_name, paid_vnd, amount_vnd, ledger_entry_id)
    VALUES (v_settle, 'Quỹ nhà', 0, v_bal, v_out);
    UPDATE public.fund_settlements SET target_fund_id = v_target WHERE id = v_settle;
    v_lines := 1;
  END IF;

  UPDATE public.funds SET is_active = false WHERE id = p_fund_id;
  PERFORM app.write_audit('OTHER', 'funds', p_fund_id::text, 'EVENT_FUND_CLOSE: đóng quỹ riêng "' || v_fund.name || '" — ' || v_mode, NULL,
    jsonb_build_object('fund_id', p_fund_id, 'mode', v_mode, 'balance_vnd', v_bal, 'lines', v_lines, 'settlement_id', v_settle));
  RETURN jsonb_build_object('settlement_id', v_settle, 'mode', v_mode, 'balance_vnd', v_bal, 'lines', v_lines);
END
$$;
COMMENT ON FUNCTION app.fn_event_fund_close(uuid, text, text, uuid) IS
  'Đóng quỹ riêng (finance.fund.manage): không còn phiếu chi chờ; số dư được hoàn lại người đã đóng theo tỷ lệ (refund; phần lẻ dồn cho người đóng nhiều nhất) hoặc chuyển về quỹ nhà (to_house, ghi nhận như khoản thu nguồn donation). Ghi biên bản fund_settlements + dòng chi tiết, tắt quỹ, thông báo người nhận hoàn.';

-- ---------------------------------------------------------------------
-- [9] Phiếu chi của quỹ riêng
-- ---------------------------------------------------------------------
-- (a) Người lập phiếu vào quỹ riêng phải là người phụ trách quỹ đó hoặc người quản lý quỹ nhà; tự điền event_id
CREATE OR REPLACE FUNCTION app.tg_expense_event_fund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_fund public.funds%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.fund_id IS NOT DISTINCT FROM OLD.fund_id THEN RETURN NEW; END IF;
  SELECT * INTO v_fund FROM public.funds f WHERE f.id = NEW.fund_id;
  IF FOUND AND v_fund.fund_type = 'event' THEN
    IF app.current_user_id() IS NOT NULL AND NOT app.fn_is_fund_manager(NEW.fund_id) AND NOT app.has_permission('finance.fund.manage') THEN
      RAISE EXCEPTION 'Chỉ người phụ trách quỹ "%" hoặc người quản lý được lập phiếu chi vào quỹ này.', v_fund.name USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT v_fund.is_active THEN
      RAISE EXCEPTION 'Quỹ "%" đã đóng — không lập thêm phiếu chi.', v_fund.name USING ERRCODE = 'check_violation';
    END IF;
    NEW.event_id := v_fund.event_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.funds f WHERE f.id = OLD.fund_id AND f.fund_type = 'event') THEN
    NEW.event_id := NULL;   -- chuyển phiếu khỏi quỹ riêng ⇒ bỏ liên kết sự kiện của quỹ cũ
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_expense_event_fund() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_expense_vouchers__event_fund ON public.expense_vouchers;
CREATE TRIGGER trg_expense_vouchers__event_fund
  BEFORE INSERT OR UPDATE ON public.expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_event_fund();

-- (b) Quy tắc phiếu chi: quỹ riêng chỉ cần MỘT chữ ký (giữ nguyên hóa đơn bắt buộc + luật Thủ quỹ chỉ tự duyệt đến ngưỡng).
--     Thân hàm = bản của db/app/1037 (đã gồm sửa của Admin), thêm đúng điều kiện v_is_event ở dòng required_approvals.
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
  v_is_event    boolean;
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
    v_is_event    := EXISTS (SELECT 1 FROM public.funds f WHERE f.id = NEW.fund_id AND f.fund_type = 'event');
    IF NEW.amount_vnd >= v_receipt_min AND NEW.no_receipt_reason IS NULL AND NOT EXISTS (
         SELECT 1 FROM public.media_attachments ma
          WHERE ma.entity_type = 'expense_voucher' AND ma.entity_id = NEW.id AND ma.purpose = 'receipt') THEN
      RAISE EXCEPTION 'BR-FIN-03: phiếu từ % đ phải đính kèm ảnh hóa đơn hoặc ghi rõ lý do không có hóa đơn.', v_receipt_min
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.required_approvals := CASE WHEN NEW.amount_vnd >= v_dual_min AND NOT v_is_event THEN 2 ELSE 1 END;
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

-- (c) Ghi chi: người có finance.expense.pay (Thủ quỹ) HOẶC người phụ trách của quỹ riêng đó. Thân hàm = bản gốc db/migrations/36.
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
  v_uid     uuid := app.current_user_id();
  v         public.expense_vouchers%ROWTYPE;
  v_entry   uuid;
  v_can_pay boolean := app.has_permission('finance.expense.pay');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT v_can_pay THEN RAISE EXCEPTION 'Không có quyền ghi nhận chi.' USING ERRCODE = 'insufficient_privilege'; END IF;
    RAISE EXCEPTION 'Phiếu chi không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_can_pay AND NOT (app.fn_is_fund_manager(v.fund_id)
                            AND EXISTS (SELECT 1 FROM public.funds f WHERE f.id = v.fund_id AND f.fund_type = 'event')) THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận chi.' USING ERRCODE = 'insufficient_privilege';
  END IF;
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

-- (d) Danh sách túi quỹ cho form chi THƯỜNG: bỏ quỹ riêng (phiếu của quỹ riêng lập ngay trong màn hình quỹ đó)
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
  RETURN QUERY SELECT f.id, f.code, f.name, f.fund_type FROM public.funds f
   WHERE f.deleted_at IS NULL AND f.is_active AND f.fund_type <> 'event' ORDER BY f.name;
END
$$;

-- (e) RLS: người phụ trách xem được túi quỹ + phiếu chi của quỹ mình
DROP POLICY IF EXISTS funds__select ON public.funds;
CREATE POLICY funds__select ON public.funds FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND ((SELECT app.has_any_permission(ARRAY['finance.ledger.read', 'finance.fund.manage'])) OR app.fn_is_fund_manager(id)));

DROP POLICY IF EXISTS expense_vouchers__select ON public.expense_vouchers;
CREATE POLICY expense_vouchers__select ON public.expense_vouchers FOR SELECT TO luuxa_app
  USING (requested_by = (SELECT app.current_user_id()) OR paid_by_member_id = (SELECT app.current_member_id())
         OR (SELECT app.has_permission('finance.expense.read_all')) OR app.fn_is_fund_manager(fund_id));

-- ---------------------------------------------------------------------
-- [10] CÔ LẬP SỐ LIỆU QUỸ NHÀ — loại túi quỹ 'event' khỏi mọi con số tổng của quỹ nhà
-- ---------------------------------------------------------------------
-- Thân hàm = bản gốc db/migrations/40; chỉ thêm JOIN funds (loại quỹ riêng) ở ba truy vấn sổ cái + truy vấn cơ cấu chi.
CREATE OR REPLACE FUNCTION app.fn_finance_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_open   bigint;
  v_in     bigint;
  v_out    bigint;
  v_due    bigint;
  v_paid   bigint;
  v_cats   jsonb;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('finance.summary.read') THEN
    RAISE EXCEPTION 'Không có quyền xem tổng quan quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Khoảng thời gian không hợp lệ (tối đa 366 ngày).' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Số dư đầu kỳ = mọi bút toán trước p_from + các bút toán "số dư đầu kỳ nhập tay" nằm trong khoảng (đó không phải khoản thu) — CHỈ quỹ nhà
  SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0) INTO v_open
    FROM public.ledger_entries le JOIN public.funds f ON f.id = le.fund_id AND f.fund_type <> 'event'
   WHERE le.entry_date < p_from OR (le.entry_date BETWEEN p_from AND p_to AND le.source_type = 'opening_balance');
  SELECT COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type <> 'reversal'), 0)
         - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'reversal'), 0),
         COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type <> 'reversal'), 0)
         - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'reversal'), 0)
    INTO v_in, v_out
    FROM public.ledger_entries le JOIN public.funds f ON f.id = le.fund_id AND f.fund_type <> 'event'
   WHERE le.entry_date BETWEEN p_from AND p_to AND le.source_type NOT IN ('transfer', 'opening_balance');
  SELECT COALESCE(SUM(ct.amount_due_vnd - ct.discount_vnd), 0), COALESCE(SUM(ct.paid_vnd), 0) INTO v_due, v_paid
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE cp.period_month BETWEEN date_trunc('month', p_from)::date AND p_to AND ct.status <> 'cancelled';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'color', x.color, 'total_vnd', x.total_vnd, 'count', x.cnt) ORDER BY x.total_vnd DESC), '[]'::jsonb)
    INTO v_cats
    FROM (SELECT c.code, c.name, c.color, SUM(ev.amount_vnd) AS total_vnd, COUNT(*) AS cnt
            FROM public.expense_vouchers ev
            JOIN public.categories c ON c.id = ev.category_id
            JOIN public.funds f ON f.id = ev.fund_id AND f.fund_type <> 'event'
           WHERE ev.status = 'paid' AND app.local_date(ev.paid_at) BETWEEN p_from AND p_to
           GROUP BY c.code, c.name, c.color) x;
  RETURN jsonb_build_object('from', p_from, 'to', p_to,
    'opening_balance_vnd', v_open, 'total_in_vnd', v_in, 'total_out_vnd', v_out, 'closing_balance_vnd', v_open + v_in - v_out,
    'dues_expected_vnd', v_due, 'dues_collected_vnd', v_paid,
    'collection_rate_pct', CASE WHEN v_due > 0 THEN round(100.0 * v_paid / v_due, 1) END,
    'expense_by_category', v_cats);
END
$$;
COMMENT ON FUNCTION app.fn_finance_summary(date, date) IS 'Tổng quan quỹ NHÀ cho mọi thành viên (quyền finance.summary.read): số dư đầu/cuối, tổng thu/chi, tỷ lệ thu, cơ cấu chi — không có tên người nợ hay chi tiết bút toán. LOẠI quỹ riêng (fund_type = event). Thu/chi là số thuần (bút toán đảo trừ vào chiều gốc); chuyển quỹ nội bộ không tính vào thu/chi nên số dư cuối = đầu + thu − chi vẫn khớp.';

CREATE OR REPLACE VIEW v_period_cashflow WITH (security_invoker = true) AS
SELECT fp.period_month, fp.status AS period_status, le.fund_id, f.code AS fund_code,
       (COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type NOT IN ('transfer', 'reversal', 'opening_balance')), 0)
        - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'reversal'), 0))::bigint AS total_in_vnd,
       (COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type NOT IN ('transfer', 'reversal', 'opening_balance')), 0)
        - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'reversal'), 0))::bigint AS total_out_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.source_type = 'opening_balance'), 0)::bigint AS opening_balance_entries_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'transfer'), 0)::bigint AS transfer_in_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'transfer'), 0)::bigint AS transfer_out_vnd,
       COUNT(le.id) AS entries
  FROM financial_periods fp
  JOIN ledger_entries le ON le.period_id = fp.id
  JOIN funds f ON f.id = le.fund_id AND f.fund_type <> 'event'
 GROUP BY fp.period_month, fp.status, le.fund_id, f.code;

CREATE OR REPLACE VIEW v_expense_by_category WITH (security_invoker = true) AS
SELECT date_trunc('month', ev.expense_date)::date AS month, c.id AS category_id, c.code, c.name, c.color,
       COUNT(*) AS voucher_count, SUM(ev.amount_vnd)::bigint AS total_vnd
  FROM expense_vouchers ev
  JOIN categories c ON c.id = ev.category_id
  JOIN funds f ON f.id = ev.fund_id AND f.fund_type <> 'event'
 WHERE ev.status = 'paid'
 GROUP BY 1, c.id, c.code, c.name, c.color;

-- Minh bạch công khai (db/app/1047): tổng chi theo hạng mục chỉ tính quỹ nhà
CREATE OR REPLACE FUNCTION app.fn_public_donation_transparency(p_year integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_this   integer := extract(year FROM app.local_today())::int;
  v_year   integer;
  v_from   date;
  v_to     date;
  v_years  jsonb;
  v_dcount integer;
  v_dtotal bigint;
  v_exp    jsonb;
  v_etotal bigint;
BEGIN
  IF (SELECT value FROM public.settings WHERE key = 'org.donation_enabled') IS DISTINCT FROM 'true'::jsonb
     OR (SELECT value FROM public.settings WHERE key = 'org.donation_transparency') IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;
  v_year := CASE WHEN p_year BETWEEN 2000 AND v_this THEN p_year ELSE v_this END;
  v_from := make_date(v_year, 1, 1);
  v_to   := make_date(v_year, 12, 31);

  SELECT COALESCE(jsonb_agg(b.y ORDER BY b.y DESC), '[]'::jsonb) INTO v_years
    FROM (SELECT a.y
            FROM (SELECT v_this AS y
                  UNION SELECT extract(year FROM d.donated_on)::int FROM public.donations d WHERE d.status = 'confirmed'
                  UNION SELECT extract(year FROM e.expense_date)::int FROM public.expense_vouchers e
                          JOIN public.funds f ON f.id = e.fund_id AND f.fund_type <> 'event' WHERE e.status = 'paid') a
           WHERE a.y BETWEEN 2000 AND v_this
           ORDER BY a.y DESC
           LIMIT 6) b;

  SELECT count(*)::int, COALESCE(sum(d.amount_vnd), 0)::bigint INTO v_dcount, v_dtotal
    FROM public.donations d
   WHERE d.status = 'confirmed' AND d.donated_on BETWEEN v_from AND v_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', x.name, 'totalVnd', x.total) ORDER BY x.total DESC, x.name), '[]'::jsonb),
         COALESCE(sum(x.total), 0)::bigint
    INTO v_exp, v_etotal
    FROM (SELECT c.name, sum(e.amount_vnd)::bigint AS total
            FROM public.expense_vouchers e
            JOIN public.categories c ON c.id = e.category_id
            JOIN public.funds f ON f.id = e.fund_id AND f.fund_type <> 'event'
           WHERE e.status = 'paid' AND e.expense_date BETWEEN v_from AND v_to
           GROUP BY c.name) x;

  RETURN jsonb_build_object(
    'enabled', true,
    'year', v_year,
    'years', v_years,
    'donationCount', v_dcount,
    'donationTotalVnd', v_dtotal,
    'expenseTotalVnd', v_etotal,
    'expenseByCategory', v_exp,
    'asOf', to_char(app.local_today(), 'YYYY-MM-DD'));
END
$$;
ALTER FUNCTION app.fn_public_donation_transparency(integer) OWNER TO luuxa_definer;

-- ---------------------------------------------------------------------
-- [11] Chủ sở hữu + quyền thực thi
-- ---------------------------------------------------------------------
ALTER FUNCTION app.fn_finance_summary(date, date) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_pay_expense(uuid, payment_method_t, date, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_fund_options() OWNER TO luuxa_definer;
ALTER VIEW public.v_period_cashflow OWNER TO luuxa_owner;
ALTER VIEW public.v_expense_by_category OWNER TO luuxa_owner;

ALTER FUNCTION app.fn_is_fund_manager(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_fund_is_event(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_level(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_get(uuid, boolean) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_apply_participants(uuid, bigint, jsonb) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_create(uuid, text, uuid[], bigint, jsonb, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_set_participants(uuid, jsonb, bigint) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_set_managers(uuid, uuid[]) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_fund_receive(uuid, uuid, text, bigint, payment_method_t, date, text, text, uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_fund_void_receipt(uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_list() OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_roster(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_receipts(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_summary(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_house_subsidy(uuid, bigint, text, uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_fund_close(uuid, text, text, uuid) OWNER TO luuxa_definer;

REVOKE ALL ON FUNCTION
  app.fn_is_fund_manager(uuid), app.fn_fund_is_event(uuid), app.fn_event_fund_level(uuid), app.fn_event_fund_get(uuid, boolean), app.fn_event_fund_apply_participants(uuid, bigint, jsonb),
  app.fn_event_fund_create(uuid, text, uuid[], bigint, jsonb, text), app.fn_event_fund_set_participants(uuid, jsonb, bigint),
  app.fn_event_fund_set_managers(uuid, uuid[]), app.fn_fund_receive(uuid, uuid, text, bigint, payment_method_t, date, text, text, uuid),
  app.fn_fund_void_receipt(uuid, text), app.fn_event_fund_list(), app.fn_event_fund_roster(uuid), app.fn_event_fund_receipts(uuid),
  app.fn_event_fund_summary(uuid), app.fn_event_fund_house_subsidy(uuid, bigint, text, uuid), app.fn_event_fund_close(uuid, text, text, uuid)
  FROM PUBLIC;

-- Tin báo phiếu chi chạy bằng vai trò nền (luuxa_worker) và cần biết phiếu thuộc quỹ riêng hay quỹ nhà
GRANT EXECUTE ON FUNCTION app.fn_fund_is_event(uuid), app.fn_is_fund_manager(uuid) TO luuxa_worker;

-- Hàm dùng nội bộ (không cho luuxa_app gọi trực tiếp)
GRANT EXECUTE ON FUNCTION app.fn_event_fund_get(uuid, boolean), app.fn_event_fund_apply_participants(uuid, bigint, jsonb)
  TO luuxa_definer, luuxa_owner;
-- Hàm cho ứng dụng (kiểm quyền trong thân hàm) + RLS
GRANT EXECUTE ON FUNCTION
  app.fn_is_fund_manager(uuid), app.fn_fund_is_event(uuid), app.fn_event_fund_level(uuid),
  app.fn_event_fund_create(uuid, text, uuid[], bigint, jsonb, text), app.fn_event_fund_set_participants(uuid, jsonb, bigint),
  app.fn_event_fund_set_managers(uuid, uuid[]), app.fn_fund_receive(uuid, uuid, text, bigint, payment_method_t, date, text, text, uuid),
  app.fn_fund_void_receipt(uuid, text), app.fn_event_fund_list(), app.fn_event_fund_roster(uuid), app.fn_event_fund_receipts(uuid),
  app.fn_event_fund_summary(uuid), app.fn_event_fund_house_subsidy(uuid, bigint, text, uuid), app.fn_event_fund_close(uuid, text, text, uuid)
  TO luuxa_app, luuxa_definer, luuxa_owner;

COMMIT;
