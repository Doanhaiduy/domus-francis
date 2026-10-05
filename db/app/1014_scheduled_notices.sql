-- =====================================================================
-- 1014 — TÁC VỤ HẰNG NGÀY (Vercel Cron gói miễn phí: mỗi tác vụ chạy 1 lần/ngày). Chạy SAU 1013. Idempotent.
--   • system_post_log: nhật ký chống gửi trùng (một khóa = một tin tự động đã gửi), chỉ worker/definer đọc ghi.
--   • recurring_reminders: lịch nhắc lặp hằng tuần do Trưởng nhà/Admin (event.manage) soạn — vd. "Họp nhà tối thứ 4 21:00".
--   • app.fn_dues_auto_remind: nhắc đóng quỹ trong ứng dụng cho khoản sắp đến hạn / quá hạn theo cấu hình finance.reminder.*.
--   • app.fn_system_notify_all / fn_system_notify_member: thông báo hệ thống (chỉ worker gọi được, không cho người dùng giả mạo).
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.reminder',     'system', 'Nhắc lịch của nhà',                ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('system.room_changed', 'system', 'Phòng ở của bạn thay đổi',         ARRAY['in_app']::notification_channel_t[],            'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. Nhật ký tin tự động (chống gửi trùng)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_post_log (
  key        text        PRIMARY KEY,
  kind       text        NOT NULL DEFAULT 'post',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_system_post_log__key CHECK (char_length(key) BETWEEN 3 AND 200)
);
COMMENT ON TABLE public.system_post_log IS 'Mỗi dòng = một tin tự động đã gửi (khóa dạng "ev:<id>:today"). INSERT ... ON CONFLICT DO NOTHING để chạy lại không gửi trùng.';
ALTER TABLE public.system_post_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_post_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_post_log OWNER TO luuxa_owner;
REVOKE ALL ON public.system_post_log FROM luuxa_app;
GRANT SELECT, INSERT, DELETE ON public.system_post_log TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- 2. Lịch nhắc lặp hằng tuần
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_reminders (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  title       text        NOT NULL,
  message     text,
  weekdays    smallint[]  NOT NULL,
  slot        text        NOT NULL DEFAULT 'morning',
  time_label  text,
  send_app    boolean     NOT NULL DEFAULT true,
  send_zalo   boolean     NOT NULL DEFAULT true,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_recurring_reminders__title CHECK (char_length(btrim(title)) BETWEEN 2 AND 150),
  CONSTRAINT ck_recurring_reminders__message CHECK (message IS NULL OR char_length(message) <= 500),
  CONSTRAINT ck_recurring_reminders__weekdays CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  CONSTRAINT ck_recurring_reminders__slot CHECK (slot IN ('morning', 'evening')),
  CONSTRAINT ck_recurring_reminders__time CHECK (time_label IS NULL OR char_length(time_label) <= 30)
);
COMMENT ON TABLE public.recurring_reminders IS
  'Lịch nhắc lặp hằng tuần. weekdays: 1=Thứ Hai … 7=Chúa Nhật. slot: nhắc lúc 07:00 (morning) hoặc 19:00 (evening) giờ VN — Vercel Cron gói miễn phí chỉ chạy mỗi tác vụ 1 lần/ngày. time_label chỉ là chữ hiển thị trong tin (vd. "21:00").';
CREATE INDEX IF NOT EXISTS ix_recurring_reminders__created_by ON public.recurring_reminders (created_by);

CREATE OR REPLACE FUNCTION app.tg_recurring_reminders_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
  END IF;
  NEW.updated_at := now();
  NEW.title := btrim(NEW.title);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_recurring_reminders__stamp ON public.recurring_reminders;
CREATE TRIGGER trg_recurring_reminders__stamp BEFORE INSERT OR UPDATE ON public.recurring_reminders
  FOR EACH ROW EXECUTE FUNCTION app.tg_recurring_reminders_stamp();
DROP TRIGGER IF EXISTS trg_recurring_reminders__audit ON public.recurring_reminders;
CREATE TRIGGER trg_recurring_reminders__audit AFTER INSERT OR UPDATE OR DELETE ON public.recurring_reminders
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

ALTER TABLE public.recurring_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_reminders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_reminders__all ON public.recurring_reminders;
CREATE POLICY recurring_reminders__all ON public.recurring_reminders FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('event.manage'))) WITH CHECK ((SELECT app.has_permission('event.manage')));
ALTER TABLE public.recurring_reminders OWNER TO luuxa_owner;
REVOKE ALL ON public.recurring_reminders FROM luuxa_app;
GRANT SELECT, DELETE ON public.recurring_reminders TO luuxa_app;
GRANT INSERT (title, message, weekdays, slot, time_label, send_app, send_zalo, is_active) ON public.recurring_reminders TO luuxa_app;
GRANT UPDATE (title, message, weekdays, slot, time_label, send_app, send_zalo, is_active) ON public.recurring_reminders TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_reminders TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- 3. Thông báo hệ thống (chỉ worker gọi)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_system_notify_all(p_type text, p_title text, p_body text DEFAULT NULL, p_link text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.fn_notify_all_active(p_type, left(p_title, 200), p_body,
    CASE WHEN p_link IS NOT NULL AND p_link LIKE '/%' AND p_link NOT LIKE '//%' THEN jsonb_build_object('link', p_link) ELSE '{}'::jsonb END)
$$;

CREATE OR REPLACE FUNCTION app.fn_system_notify_member(p_member uuid, p_type text, p_title text, p_body text DEFAULT NULL, p_link text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.fn_notify(p_member, p_type, left(p_title, 200), p_body,
    CASE WHEN p_link IS NOT NULL AND p_link LIKE '/%' AND p_link NOT LIKE '//%' THEN jsonb_build_object('link', p_link) ELSE '{}'::jsonb END)
$$;

-- Nhắc đóng quỹ tự động: sắp đến hạn (còn 0..N ngày, N = finance.reminder.days_before_due) hoặc quá hạn
-- (ngày thứ 1 sau hạn rồi cứ M ngày một lần, M = finance.reminder.overdue_every_days). Mỗi khoản tối đa 1 lần/20 giờ.
-- p_dry = true: chỉ đếm, không gửi. Trả [{planId, planName, soon, overdue}].
CREATE OR REPLACE FUNCTION app.fn_dues_auto_remind(p_dry boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_before integer := COALESCE(app.setting_int('finance.reminder.days_before_due')::integer, 3);
  v_every  integer := GREATEST(1, COALESCE(app.setting_int('finance.reminder.overdue_every_days')::integer, 7));
  v_today  date    := app.local_today();
  r        record;
  v_kind   text;
  v_left   integer;
  v_out    jsonb   := '{}'::jsonb;
  v_cur    jsonb;
BEGIN
  FOR r IN
    SELECT ct.id, ct.member_id, ct.due_date, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining,
           cp.id AS plan_id, cp.name AS plan_name
      FROM public.contributions ct
      JOIN public.contribution_plans cp ON cp.id = ct.plan_id AND cp.status <> 'cancelled'
      JOIN public.members m ON m.id = ct.member_id AND m.deleted_at IS NULL AND m.status = 'active'
     WHERE ct.status IN ('unpaid', 'partial') AND (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) > 0
  LOOP
    v_left := r.due_date - v_today;
    v_kind := CASE
      WHEN v_left BETWEEN 0 AND v_before THEN 'soon'
      WHEN v_left < 0 AND ((-v_left - 1) % v_every) = 0 THEN 'overdue'
      ELSE NULL END;
    CONTINUE WHEN v_kind IS NULL;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.contribution_reminders x
                           WHERE x.contribution_id = r.id AND x.channel = 'in_app' AND x.sent_at > now() - interval '20 hours');
    IF NOT p_dry THEN
      PERFORM app.fn_notify(r.member_id,
        CASE WHEN v_kind = 'overdue' THEN 'finance.dues_overdue' ELSE 'finance.dues_reminder' END,
        left('Nhắc đóng quỹ: ' || r.plan_name, 200),
        'Bạn còn thiếu ' || app.fn_vnd(r.remaining) || ', hạn ' || to_char(r.due_date, 'DD/MM/YYYY')
          || CASE WHEN v_kind = 'overdue' THEN ' (quá hạn ' || (-v_left) || ' ngày)' WHEN v_left = 0 THEN ' (hôm nay)' ELSE ' (còn ' || v_left || ' ngày)' END || '.',
        jsonb_build_object('link', '/thu-chi'), 'contributions', r.id);
      INSERT INTO public.contribution_reminders (contribution_id, member_id, sent_by, channel) VALUES (r.id, r.member_id, NULL, 'in_app');
    END IF;
    v_cur := COALESCE(v_out -> r.plan_id::text, jsonb_build_object('planId', r.plan_id, 'planName', r.plan_name, 'soon', 0, 'overdue', 0));
    v_cur := jsonb_set(v_cur, ARRAY[v_kind], to_jsonb(((v_cur ->> v_kind)::integer) + 1));
    v_out := jsonb_set(v_out, ARRAY[r.plan_id::text], v_cur, true);
  END LOOP;
  RETURN COALESCE((SELECT jsonb_agg(value) FROM jsonb_each(v_out)), '[]'::jsonb);
END
$$;
COMMENT ON FUNCTION app.fn_dues_auto_remind(boolean) IS 'Nhắc đóng quỹ tự động trong ứng dụng (cron hằng ngày). Chỉ worker gọi.';

ALTER FUNCTION app.tg_recurring_reminders_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_recurring_reminders_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_recurring_reminders_stamp() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

ALTER FUNCTION app.fn_system_notify_all(text, text, text, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_system_notify_member(uuid, text, text, text, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_dues_auto_remind(boolean) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_system_notify_all(text, text, text, text), app.fn_system_notify_member(uuid, text, text, text, text),
  app.fn_dues_auto_remind(boolean) FROM PUBLIC, luuxa_app, luuxa_auth;
GRANT EXECUTE ON FUNCTION app.fn_system_notify_all(text, text, text, text), app.fn_system_notify_member(uuid, text, text, text, text),
  app.fn_dues_auto_remind(boolean) TO luuxa_worker, luuxa_definer, luuxa_owner;

COMMIT;
