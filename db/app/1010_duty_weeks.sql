-- =====================================================================
-- 1010 — TRỰC VỆ SINH SÂN NHÀ THEO TUẦN (đơn giản hóa phân hệ Trực nhật). Chạy SAU 01–52 + 70–75 + 90…1002. Idempotent.
--   • Mỗi tuần (Thứ Hai → Chúa Nhật) có tối đa 2 người trực vệ sinh sân nhà. Không chia khu vực/ca, không check-in, không nghiệm thu từng ca.
--   • Trưởng nhà/Admin (duty.manage) xếp người trực theo tuần ⇒ người được xếp nhận thông báo trong ứng dụng.
--   • Hết tuần, Trưởng nhà/Admin (duty.review) chấm điểm 0–10, nhận xét và có thể yêu cầu trực lại.
--   • Ghi/sửa chỉ qua hàm SECURITY DEFINER (kiểm quyền + gửi thông báo cùng transaction); luuxa_app chỉ ĐỌC (mọi thành viên xem được
--     ai trực tuần nào — thông tin công khai trong nhà).
--   • Các bảng/ hàm trực nhật cũ (duty_rosters, duty_assignments…) giữ nguyên để không mất lịch sử; giao diện không dùng nữa.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Loại thông báo mới
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('duty.week_assigned', 'duty', 'Bạn được xếp trực vệ sinh sân nhà',        ARRAY['in_app','web_push']::notification_channel_t[], 'high',   false, false),
  ('duty.week_changed',  'duty', 'Lịch trực vệ sinh của bạn thay đổi',        ARRAY['in_app']::notification_channel_t[],            'normal', false, false),
  ('duty.week_reminder', 'duty', 'Nhắc trực vệ sinh sân nhà',                 ARRAY['in_app','web_push']::notification_channel_t[], 'high',   false, false),
  ('duty.week_reviewed', 'duty', 'Kết quả đánh giá tuần trực vệ sinh',        ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Bảng
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.duty_weeks (
  id              uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  week_start      date        NOT NULL,
  note            text,
  score           smallint,
  review_comment  text,
  redo_required   boolean     NOT NULL DEFAULT false,
  redo_note       text,
  reviewed_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_duty_weeks__week_start UNIQUE (week_start),
  CONSTRAINT ck_duty_weeks__monday CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT ck_duty_weeks__note CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_duty_weeks__score CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  CONSTRAINT ck_duty_weeks__comment CHECK (review_comment IS NULL OR char_length(review_comment) <= 1000),
  CONSTRAINT ck_duty_weeks__redo_note CHECK (redo_note IS NULL OR char_length(redo_note) <= 500),
  CONSTRAINT ck_duty_weeks__reviewed CHECK ((score IS NULL) = (reviewed_at IS NULL))
);
COMMENT ON TABLE public.duty_weeks IS
  'Tuần trực vệ sinh sân nhà (week_start = Thứ Hai). Người trực ở duty_week_members (tối đa 2). Sau tuần: score 0–10 + nhận xét + cờ yêu cầu trực lại do người có duty.review đặt.';
CREATE INDEX IF NOT EXISTS ix_duty_weeks__created_by ON public.duty_weeks (created_by);
CREATE INDEX IF NOT EXISTS ix_duty_weeks__reviewed_by ON public.duty_weeks (reviewed_by);

CREATE TABLE IF NOT EXISTS public.duty_week_members (
  week_id    uuid        NOT NULL REFERENCES public.duty_weeks(id) ON DELETE CASCADE,
  member_id  uuid        NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, member_id)
);
COMMENT ON TABLE public.duty_week_members IS 'Người trực của một tuần (1–2 người, kiểm ở app.fn_duty_week_save).';
CREATE INDEX IF NOT EXISTS ix_duty_week_members__member_id ON public.duty_week_members (member_id);

DROP TRIGGER IF EXISTS trg_duty_weeks__touch ON public.duty_weeks;
CREATE TRIGGER trg_duty_weeks__touch BEFORE UPDATE ON public.duty_weeks FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_duty_weeks__audit ON public.duty_weeks;
CREATE TRIGGER trg_duty_weeks__audit AFTER INSERT OR UPDATE OR DELETE ON public.duty_weeks FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

-- ---------------------------------------------------------------------
-- 3. Hàm nghiệp vụ (SECURITY DEFINER)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_duty_week_label(p_week_start date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(p_week_start, 'DD/MM') || ' – ' || to_char(p_week_start + 6, 'DD/MM/YYYY')
$$;

CREATE OR REPLACE FUNCTION app.fn_duty_week_save(p_week_start date, p_member_ids uuid[], p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_ids   uuid[];
  v_week  public.duty_weeks%ROWTYPE;
  v_old   uuid[] := '{}';
  v_m     uuid;
  v_other text;
  v_label text;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('duty.manage') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Admin mới được phân công trực vệ sinh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'Tuần trực phải bắt đầu từ Thứ Hai.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(COALESCE(p_member_ids, '{}')) x WHERE x IS NOT NULL;
  IF cardinality(v_ids) < 1 OR cardinality(v_ids) > 2 THEN
    RAISE EXCEPTION 'Mỗi tuần xếp 1–2 người trực vệ sinh sân nhà.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.members m WHERE m.id = ANY (v_ids) AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave'))
       <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Chỉ xếp được thành viên đang ở trong nhà.' USING ERRCODE = 'check_violation';
  END IF;
  v_label := app.fn_duty_week_label(p_week_start);

  SELECT * INTO v_week FROM public.duty_weeks w WHERE w.week_start = p_week_start FOR UPDATE;
  IF FOUND THEN
    IF v_week.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Tuần này đã được đánh giá — không đổi người trực nữa.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(wm.member_id), '{}') INTO v_old FROM public.duty_week_members wm WHERE wm.week_id = v_week.id;
    UPDATE public.duty_weeks SET note = NULLIF(btrim(COALESCE(p_note, '')), '') WHERE id = v_week.id;
  ELSE
    INSERT INTO public.duty_weeks (week_start, note, created_by)
    VALUES (p_week_start, NULLIF(btrim(COALESCE(p_note, '')), ''), v_uid)
    RETURNING * INTO v_week;
  END IF;

  DELETE FROM public.duty_week_members WHERE week_id = v_week.id AND member_id <> ALL (v_ids);
  INSERT INTO public.duty_week_members (week_id, member_id) SELECT v_week.id, x FROM unnest(v_ids) x ON CONFLICT DO NOTHING;

  -- Người mới được xếp ⇒ thông báo (kèm tên bạn cùng trực); người bị gỡ ⇒ báo thay đổi
  FOREACH v_m IN ARRAY v_ids LOOP
    IF NOT (v_m = ANY (v_old)) THEN
      SELECT string_agg(m.display_name, ' & ' ORDER BY m.display_name) INTO v_other
        FROM public.members m WHERE m.id = ANY (v_ids) AND m.id <> v_m;
      PERFORM app.fn_notify(v_m, 'duty.week_assigned',
        'Tuần ' || v_label || ': bạn trực vệ sinh sân nhà',
        CASE WHEN v_other IS NOT NULL THEN 'Bạn trực cùng ' || v_other || '. ' ELSE '' END
          || 'Trưởng nhà sẽ đánh giá kết quả sau khi hết tuần.' || COALESCE(' Ghi chú: ' || NULLIF(btrim(p_note), ''), ''),
        jsonb_build_object('link', '/hau-can'), 'duty_weeks', v_week.id);
    END IF;
  END LOOP;
  FOREACH v_m IN ARRAY v_old LOOP
    IF NOT (v_m = ANY (v_ids)) THEN
      PERFORM app.fn_notify(v_m, 'duty.week_changed', 'Tuần ' || v_label || ': bạn không còn trong lịch trực vệ sinh',
        'Trưởng nhà đã đổi người trực của tuần này.', jsonb_build_object('link', '/hau-can'), 'duty_weeks', v_week.id);
    END IF;
  END LOOP;
  RETURN v_week.id;
END
$$;
COMMENT ON FUNCTION app.fn_duty_week_save(date, uuid[], text) IS
  'Xếp (hoặc sửa) người trực vệ sinh sân nhà của một tuần: 1–2 người đang ở, tuần chưa đánh giá. Cần duty.manage. Thông báo người mới được xếp / người bị gỡ.';

CREATE OR REPLACE FUNCTION app.fn_duty_week_delete(p_week_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_week public.duty_weeks%ROWTYPE;
  v_m    uuid;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('duty.manage') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Admin mới được xóa lịch trực.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_week FROM public.duty_weeks w WHERE w.id = p_week_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tuần trực.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_week.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tuần này đã được đánh giá — không xóa được.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_m IN SELECT wm.member_id FROM public.duty_week_members wm WHERE wm.week_id = p_week_id LOOP
    PERFORM app.fn_notify(v_m, 'duty.week_changed', 'Tuần ' || app.fn_duty_week_label(v_week.week_start) || ': lịch trực vệ sinh đã được hủy',
      'Bạn không còn phải trực tuần này.', jsonb_build_object('link', '/hau-can'), NULL, NULL);
  END LOOP;
  DELETE FROM public.duty_weeks WHERE id = p_week_id;
END
$$;
COMMENT ON FUNCTION app.fn_duty_week_delete(uuid) IS 'Hủy lịch trực của một tuần chưa đánh giá (duty.manage); báo cho người đã được xếp.';

CREATE OR REPLACE FUNCTION app.fn_duty_week_remind(p_week_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_week public.duty_weeks%ROWTYPE;
  v_m    uuid;
  v_n    integer := 0;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('duty.manage') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Admin mới được nhắc người trực.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_week FROM public.duty_weeks w WHERE w.id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tuần trực.' USING ERRCODE = 'no_data_found'; END IF;
  FOR v_m IN SELECT wm.member_id FROM public.duty_week_members wm WHERE wm.week_id = p_week_id LOOP
    PERFORM app.fn_notify(v_m, 'duty.week_reminder', 'Nhắc: tuần ' || app.fn_duty_week_label(v_week.week_start) || ' bạn trực vệ sinh sân nhà',
      'Nhớ dọn dẹp sân nhà trong tuần này nhé.', jsonb_build_object('link', '/hau-can'), 'duty_weeks', v_week.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_duty_week_remind(uuid) IS 'Gửi thông báo nhắc cho người trực của tuần (duty.manage). Trả về số người được nhắc.';

CREATE OR REPLACE FUNCTION app.fn_duty_week_review(p_week_id uuid, p_score integer, p_comment text DEFAULT NULL,
                                                   p_redo boolean DEFAULT false, p_redo_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid  uuid := app.current_user_id();
  v_week public.duty_weeks%ROWTYPE;
  v_m    uuid;
  v_body text;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('duty.review') THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Admin mới được đánh giá tuần trực.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 10 THEN
    RAISE EXCEPTION 'Điểm đánh giá phải từ 0 đến 10.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_week FROM public.duty_weeks w WHERE w.id = p_week_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tuần trực.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_week.week_start > app.local_today() THEN
    RAISE EXCEPTION 'Tuần này chưa bắt đầu — chưa đánh giá được.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.duty_weeks
     SET score = p_score,
         review_comment = NULLIF(btrim(COALESCE(p_comment, '')), ''),
         redo_required = COALESCE(p_redo, false),
         redo_note = CASE WHEN COALESCE(p_redo, false) THEN NULLIF(btrim(COALESCE(p_redo_note, '')), '') END,
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_week_id;
  v_body := 'Điểm: ' || p_score || '/10.' || COALESCE(' Nhận xét: ' || NULLIF(btrim(p_comment), ''), '')
            || CASE WHEN COALESCE(p_redo, false) THEN ' ⚠ Trưởng nhà yêu cầu trực lại.' || COALESCE(' ' || NULLIF(btrim(p_redo_note), ''), '') ELSE '' END;
  FOR v_m IN SELECT wm.member_id FROM public.duty_week_members wm WHERE wm.week_id = p_week_id LOOP
    PERFORM app.fn_notify(v_m, 'duty.week_reviewed', 'Đánh giá tuần trực ' || app.fn_duty_week_label(v_week.week_start),
      v_body, jsonb_build_object('link', '/hau-can'), 'duty_weeks', p_week_id);
  END LOOP;
END
$$;
COMMENT ON FUNCTION app.fn_duty_week_review(uuid, integer, text, boolean, text) IS
  'Đánh giá một tuần trực đã bắt đầu: điểm 0–10, nhận xét, có yêu cầu trực lại hay không (duty.review). Sửa lại đánh giá được. Thông báo người trực.';

-- ---------------------------------------------------------------------
-- 4. RLS + quyền
-- ---------------------------------------------------------------------
ALTER TABLE public.duty_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_weeks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duty_week_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_week_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duty_weeks__select ON public.duty_weeks;
CREATE POLICY duty_weeks__select ON public.duty_weeks FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
DROP POLICY IF EXISTS duty_week_members__select ON public.duty_week_members;
CREATE POLICY duty_week_members__select ON public.duty_week_members FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));

ALTER TABLE public.duty_weeks OWNER TO luuxa_owner;
ALTER TABLE public.duty_week_members OWNER TO luuxa_owner;
REVOKE ALL ON public.duty_weeks, public.duty_week_members FROM luuxa_app;
GRANT SELECT ON public.duty_weeks, public.duty_week_members TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_weeks, public.duty_week_members TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.fn_duty_week_label(date) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_duty_week_save(date, uuid[], text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_duty_week_delete(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_duty_week_remind(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_duty_week_review(uuid, integer, text, boolean, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_duty_week_label(date), app.fn_duty_week_save(date, uuid[], text), app.fn_duty_week_delete(uuid),
  app.fn_duty_week_remind(uuid), app.fn_duty_week_review(uuid, integer, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_duty_week_label(date), app.fn_duty_week_save(date, uuid[], text), app.fn_duty_week_delete(uuid),
  app.fn_duty_week_remind(uuid), app.fn_duty_week_review(uuid, integer, text, boolean, text)
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

COMMIT;
