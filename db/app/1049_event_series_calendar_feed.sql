-- =====================================================================
-- 1049 — SỰ KIỆN ĐỊNH KỲ + ĐỒNG BỘ LỊCH (.ics). Chạy SAU 1048. Idempotent.
--   • Sự kiện định kỳ dùng bảng/hàm có sẵn của thiết kế: event_recurrence_rules (quy tắc lặp), event_recurrence_exceptions (ngày bỏ qua),
--     app.fn_generate_recurring_events (vật chất hóa các buổi vào events, ON CONFLICT (rule, ngày) DO NOTHING). Bổ sung:
--       - event_recurrence_rules.organizer_ids: ban tổ chức (người đầu tiên là chủ trì) chép sang từng buổi được sinh ⇒ họ điểm danh được buổi đó.
--       - app.fn_recurrence_matches(rule, ngày): ngày có thuộc mẫu lặp không — CÙNG công thức với hàm sinh của thiết kế (tuần tính từ Thứ Hai
--         của tuần chứa starts_on; tháng: ngày cố định hoặc thứ thứ n).
--       - app.fn_event_series_generate(rule|NULL, đến_ngày): bọc hàm sinh của thiết kế (luuxa_app không được gọi trực tiếp) — cần event.manage
--         hoặc tiến trình hệ thống (cron "recurring-events" mỗi sáng sinh 14 ngày tới); chép ban tổ chức cho các buổi vừa sinh.
--       - app.fn_event_series_sync(rule, từ_ngày): sau khi sửa / bỏ ngày / dừng chuỗi — gỡ (xóa mềm) các buổi CHƯA diễn ra từ ngày đó mà không
--         còn khớp mẫu, nằm trong ngày bỏ qua hoặc chuỗi đã dừng; khôi phục buổi đã gỡ nay khớp lại (không phải ngày bỏ qua); sinh tiếp.
--         Buổi đã diễn ra (hoặc đã hủy riêng) không bị đụng tới. Biểu quyết đang mở của buổi bị gỡ được đóng lại.
--       - Nhật ký kiểm toán cho quy tắc lặp (bỏ qua lượt cập nhật chỉ đổi last_generated_through của hàm sinh) và ngày bỏ qua.
--   • calendar_feed_tokens: đường dẫn lịch cá nhân (Google Calendar / Lịch iPhone đăng ký theo URL). Chỉ lưu BĂM SHA-256 (hex) của mã bí mật
--     — mã gốc chỉ hiện một lần lúc tạo. Mỗi người tối đa 5 đường dẫn đang dùng; thu hồi = đặt revoked_at (không mở lại được). RLS: chỉ
--     chính chủ xem / tạo / thu hồi; luuxa_app không đọc được cột token_hash. Route công khai /api/v1/public/calendar/<mã>.ics băm mã, tra
--     bằng vai trò worker (cập nhật last_used_at, không ghi nhật ký kiểm toán cho lượt dùng) rồi đọc lịch dưới RLS của chính người đó.
--   • Loại thông báo event.cancelled (buổi sinh hoạt bị hủy / tạm nghỉ, dừng chuỗi định kỳ).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Loại thông báo
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('event.cancelled', 'event', 'Sự kiện bị hủy / tạm nghỉ', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Quy tắc lặp: ban tổ chức + nhật ký kiểm toán
-- ---------------------------------------------------------------------
ALTER TABLE public.event_recurrence_rules ADD COLUMN IF NOT EXISTS organizer_ids uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.event_recurrence_rules.organizer_ids IS 'Ban tổ chức của chuỗi (members.id, người đầu tiên là chủ trì) — chép sang event_organizers của mỗi buổi được sinh.';
DO $$
BEGIN
  ALTER TABLE public.event_recurrence_rules
    ADD CONSTRAINT ck_event_recurrence_rules__organizers CHECK (cardinality(organizer_ids) <= 20);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;
CREATE INDEX IF NOT EXISTS ix_events__rule_date ON public.events (recurrence_rule_id, occurrence_date) WHERE recurrence_rule_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_event_recurrence_rules__audit ON public.event_recurrence_rules;
DROP TRIGGER IF EXISTS trg_event_recurrence_rules__audit_iud ON public.event_recurrence_rules;
CREATE TRIGGER trg_event_recurrence_rules__audit_iud AFTER INSERT OR DELETE ON public.event_recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');
DROP TRIGGER IF EXISTS trg_event_recurrence_rules__audit_upd ON public.event_recurrence_rules;
CREATE TRIGGER trg_event_recurrence_rules__audit_upd AFTER UPDATE ON public.event_recurrence_rules
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'last_generated_through' - 'updated_at' - 'version') IS DISTINCT FROM (to_jsonb(NEW) - 'last_generated_through' - 'updated_at' - 'version'))
  EXECUTE FUNCTION app.tg_audit('id');
DROP TRIGGER IF EXISTS trg_event_recurrence_exceptions__audit ON public.event_recurrence_exceptions;
CREATE TRIGGER trg_event_recurrence_exceptions__audit AFTER INSERT OR UPDATE OR DELETE ON public.event_recurrence_exceptions
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('rule_id,occurrence_date');

-- ---------------------------------------------------------------------
-- 3. Ngày có thuộc mẫu lặp không (cùng công thức với app.fn_generate_recurring_events)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_recurrence_matches(p_rule public.event_recurrence_rules, p_d date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_d IS NOT NULL
     AND p_d >= p_rule.starts_on
     AND (p_rule.until_date IS NULL OR p_d <= p_rule.until_date)
     AND CASE
           WHEN p_rule.freq = 'weekly' THEN
                EXTRACT(ISODOW FROM p_d)::smallint = ANY (p_rule.by_weekday)
            AND (((p_d - date_trunc('week', p_rule.starts_on)::date) / 7) % p_rule.interval_n) = 0
           ELSE
                (((EXTRACT(YEAR FROM p_d) * 12 + EXTRACT(MONTH FROM p_d))
                  - (EXTRACT(YEAR FROM p_rule.starts_on) * 12 + EXTRACT(MONTH FROM p_rule.starts_on)))::int % p_rule.interval_n) = 0
            AND (   (p_rule.by_monthday IS NOT NULL AND EXTRACT(DAY FROM p_d)::int = p_rule.by_monthday)
                 OR (p_rule.nth_weekday IS NOT NULL AND EXTRACT(ISODOW FROM p_d)::smallint = p_rule.by_weekday[1]
                     AND (CASE WHEN p_rule.nth_weekday = -1
                               THEN EXTRACT(MONTH FROM p_d + 7) <> EXTRACT(MONTH FROM p_d)
                               ELSE ((EXTRACT(DAY FROM p_d)::int - 1) / 7 + 1) = p_rule.nth_weekday END)))
         END
$$;
COMMENT ON FUNCTION app.fn_recurrence_matches(public.event_recurrence_rules, date) IS
  'TRUE nếu ngày p_d là một buổi của quy tắc lặp (trong [starts_on, until_date], đúng thứ/tuần hoặc ngày/tháng) — cùng công thức với app.fn_generate_recurring_events. Không xét ngày bỏ qua (event_recurrence_exceptions) và is_active.';

-- ---------------------------------------------------------------------
-- 4. Sinh các buổi (bọc hàm thiết kế) + chép ban tổ chức
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_event_series_generate(p_rule_id uuid DEFAULT NULL, p_through date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_h integer;
  v_n integer;
BEGIN
  IF app.lacks_permission('event.manage') THEN
    RAISE EXCEPTION 'Chỉ người có quyền quản lý sự kiện được tạo các buổi của sự kiện định kỳ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_through IS NOT NULL AND p_rule_id IS NOT NULL THEN
    SELECT r.generate_horizon_days INTO v_h FROM public.event_recurrence_rules r WHERE r.id = p_rule_id;
    v_h := LEAST(GREATEST(COALESCE(v_h, 14), p_through - app.local_today()), 400);
  END IF;
  v_n := app.fn_generate_recurring_events(p_rule_id, v_h);

  -- Ban tổ chức cho các buổi VỪA sinh trong giao dịch này (created_at = now() = giờ bắt đầu giao dịch); buổi cũ đã bị sửa tay thì giữ nguyên
  IF v_n > 0 THEN
    INSERT INTO public.event_organizers (event_id, member_id, role_label)
    SELECT e.id, o.member_id, CASE WHEN o.ord = 1 THEN 'lead' ELSE 'member' END
      FROM public.events e
      JOIN public.event_recurrence_rules r ON r.id = e.recurrence_rule_id
      CROSS JOIN LATERAL unnest(r.organizer_ids) WITH ORDINALITY AS o(member_id, ord)
     WHERE (p_rule_id IS NULL OR r.id = p_rule_id)
       AND e.created_at = now()
       AND e.deleted_at IS NULL
       AND cardinality(r.organizer_ids) > 0
       AND NOT EXISTS (SELECT 1 FROM public.event_organizers x WHERE x.event_id = e.id)
       AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = o.member_id AND m.deleted_at IS NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_event_series_generate(uuid, date) IS
  'Sinh các buổi của quy tắc lặp (một quy tắc hoặc tất cả) trong khoảng tạo trước của quy tắc (generate_horizon_days; p_through kéo dài tới ngày đó, tối đa 400 ngày) bằng app.fn_generate_recurring_events (bỏ ngày ngoại lệ, không trùng), rồi chép ban tổ chức của chuỗi sang các buổi vừa sinh. Cần event.manage hoặc tiến trình hệ thống. Trả về số buổi mới.';

-- ---------------------------------------------------------------------
-- 5. Đồng bộ các buổi tương lai sau khi sửa / bỏ ngày / dừng chuỗi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_event_series_sync(p_rule_id uuid, p_from date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  r          public.event_recurrence_rules%ROWTYPE;
  v_today    date := app.local_today();
  v_from     date;
  v_removed  integer := 0;
  v_restored integer := 0;
  v_gen      integer := 0;
BEGIN
  IF app.lacks_permission('event.manage') THEN
    RAISE EXCEPTION 'Chỉ người có quyền quản lý sự kiện được sửa sự kiện định kỳ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.event_recurrence_rules x WHERE x.id = p_rule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy sự kiện định kỳ.' USING ERRCODE = 'no_data_found';
  END IF;
  v_from := GREATEST(COALESCE(p_from, v_today), v_today);

  -- (1) Gỡ buổi chưa diễn ra không còn thuộc chuỗi (chuỗi dừng / không khớp mẫu mới / ngày bỏ qua)
  WITH removed AS (
    UPDATE public.events e
       SET deleted_at = now()
     WHERE e.recurrence_rule_id = r.id
       AND e.deleted_at IS NULL
       AND e.occurrence_date >= v_from
       AND e.starts_at > now()
       AND e.status IN ('draft', 'scheduled', 'cancelled')
       AND (NOT r.is_active
            OR NOT app.fn_recurrence_matches(r, e.occurrence_date)
            OR EXISTS (SELECT 1 FROM public.event_recurrence_exceptions x WHERE x.rule_id = r.id AND x.occurrence_date = e.occurrence_date))
    RETURNING e.id
  ), closed AS (
    UPDATE public.polls p SET status = 'closed' WHERE p.event_id IN (SELECT id FROM removed) AND p.status = 'open' RETURNING p.id
  )
  SELECT (SELECT count(*) FROM removed) INTO v_removed;

  -- (2) Khôi phục buổi đã gỡ nay khớp lại (không phải ngày bỏ qua), lấy giá trị hiện hành của chuỗi
  IF r.is_active THEN
    UPDATE public.events e
       SET deleted_at = NULL,
           title = r.title,
           category_id = r.category_id,
           starts_at = (e.occurrence_date + r.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
           ends_at = ((e.occurrence_date + r.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(mins => r.duration_minutes),
           location_room_id = r.location_room_id,
           location_text = r.location_text,
           organizer_text = r.organizer_text,
           description = r.description,
           requires_attendance = r.requires_attendance
     WHERE e.recurrence_rule_id = r.id
       AND e.deleted_at IS NOT NULL
       AND e.occurrence_date >= v_from
       AND e.status IN ('draft', 'scheduled')
       AND ((e.occurrence_date + r.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh') > now()
       AND app.fn_recurrence_matches(r, e.occurrence_date)
       AND NOT EXISTS (SELECT 1 FROM public.event_recurrence_exceptions x WHERE x.rule_id = r.id AND x.occurrence_date = e.occurrence_date)
       AND NOT EXISTS (SELECT 1 FROM public.attendance_records a WHERE a.event_id = e.id);
    GET DIAGNOSTICS v_restored = ROW_COUNT;

    -- (3) Sinh tiếp từ ngày v_from (hàm sinh không tạo trùng ngày đã có — kể cả buổi đã gỡ)
    UPDATE public.event_recurrence_rules
       SET last_generated_through = LEAST(COALESCE(last_generated_through, v_from - 1), v_from - 1)
     WHERE id = r.id;
    v_gen := app.fn_event_series_generate(r.id, NULL);
  END IF;

  RETURN jsonb_build_object('removed', v_removed, 'restored', v_restored, 'generated', v_gen);
END
$$;
COMMENT ON FUNCTION app.fn_event_series_sync(uuid, date) IS
  'Đồng bộ các buổi CHƯA diễn ra (từ p_from, mặc định hôm nay) với quy tắc lặp sau khi sửa / bỏ ngày / dừng / tiếp tục chuỗi: xóa mềm buổi không còn thuộc chuỗi (đóng biểu quyết đang mở), khôi phục buổi đã gỡ nay khớp lại (không phải ngày bỏ qua, chưa có điểm danh), rồi sinh tiếp trong khoảng tạo trước. Cần event.manage. Trả {removed, restored, generated}.';

ALTER FUNCTION app.fn_recurrence_matches(public.event_recurrence_rules, date) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_event_series_generate(uuid, date) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_event_series_sync(uuid, date) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_recurrence_matches(public.event_recurrence_rules, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_event_series_generate(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_event_series_sync(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_recurrence_matches(public.event_recurrence_rules, date) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_event_series_generate(uuid, date) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_event_series_sync(uuid, date) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 6. Đường dẫn lịch cá nhân (.ics đăng ký theo URL)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id     uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_hash    text        NOT NULL,
  label         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  CONSTRAINT ux_calendar_feed_tokens__hash UNIQUE (token_hash),
  CONSTRAINT ck_calendar_feed_tokens__hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_calendar_feed_tokens__label CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 60)
);
COMMENT ON TABLE public.calendar_feed_tokens IS
  'Đường dẫn lịch cá nhân (/api/v1/public/calendar/<mã>.ics) để Google Calendar / Lịch iPhone đăng ký: chỉ lưu SHA-256 (hex) của mã bí mật. Ai có đường dẫn đều xem được lịch của người đó (sự kiện họ được xem, tuần trực của họ, ngày lễ buộc) — thu hồi = đặt revoked_at. Tối đa 5 đường dẫn đang dùng mỗi người.';
CREATE INDEX IF NOT EXISTS ix_calendar_feed_tokens__member ON public.calendar_feed_tokens (member_id, created_at DESC);

CREATE OR REPLACE FUNCTION app.tg_calendar_feed_token_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me uuid;
  v_n  integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF app.current_user_id() IS NOT NULL THEN
      v_me := app.current_member_id();
      IF v_me IS NULL THEN
        RAISE EXCEPTION 'Tài khoản chưa gắn hồ sơ thành viên — không tạo được đường dẫn lịch.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.member_id := v_me;
    END IF;
    NEW.label := NULLIF(btrim(COALESCE(NEW.label, '')), '');
    NEW.created_at := now();
    NEW.last_used_at := NULL;
    NEW.revoked_at := NULL;
    PERFORM pg_advisory_xact_lock(hashtextextended('calendar_feed:' || NEW.member_id::text, 0));
    SELECT count(*) INTO v_n FROM public.calendar_feed_tokens t WHERE t.member_id = NEW.member_id AND t.revoked_at IS NULL;
    IF v_n >= 5 THEN
      RAISE EXCEPTION 'Mỗi người dùng tối đa 5 đường dẫn lịch cùng lúc — hãy thu hồi bớt đường dẫn cũ.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.id := OLD.id;
    NEW.member_id := OLD.member_id;
    NEW.token_hash := OLD.token_hash;
    NEW.created_at := OLD.created_at;
    -- Đã thu hồi thì không mở lại; thu hồi luôn lấy giờ máy chủ
    IF OLD.revoked_at IS NOT NULL THEN
      NEW.revoked_at := OLD.revoked_at;
    ELSIF NEW.revoked_at IS NOT NULL THEN
      NEW.revoked_at := now();
    END IF;
    IF app.current_user_id() IS NOT NULL THEN
      -- Người dùng chỉ thu hồi; lượt dùng gần nhất do tiến trình hệ thống ghi
      NEW.last_used_at := OLD.last_used_at;
      NEW.label := OLD.label;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_calendar_feed_token_rules() IS
  'BEFORE INSERT/UPDATE calendar_feed_tokens: người tạo = thành viên đang đăng nhập, tối đa 5 đường dẫn đang dùng/người (khóa advisory chống tạo song song); sau đó chỉ thu hồi được (revoked_at = giờ máy chủ, không mở lại); last_used_at chỉ tiến trình hệ thống ghi.';

DROP TRIGGER IF EXISTS trg_calendar_feed_tokens__rules ON public.calendar_feed_tokens;
CREATE TRIGGER trg_calendar_feed_tokens__rules BEFORE INSERT OR UPDATE ON public.calendar_feed_tokens
  FOR EACH ROW EXECUTE FUNCTION app.tg_calendar_feed_token_rules();
-- Kiểm toán: tạo / thu hồi / xóa (không ghi lượt dùng — last_used_at đổi mỗi lần lịch được tải về); che mã băm
DROP TRIGGER IF EXISTS trg_calendar_feed_tokens__audit_iud ON public.calendar_feed_tokens;
CREATE TRIGGER trg_calendar_feed_tokens__audit_iud AFTER INSERT OR DELETE ON public.calendar_feed_tokens
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'token_hash');
DROP TRIGGER IF EXISTS trg_calendar_feed_tokens__audit_upd ON public.calendar_feed_tokens;
CREATE TRIGGER trg_calendar_feed_tokens__audit_upd AFTER UPDATE ON public.calendar_feed_tokens
  FOR EACH ROW WHEN (OLD.revoked_at IS DISTINCT FROM NEW.revoked_at OR OLD.label IS DISTINCT FROM NEW.label)
  EXECUTE FUNCTION app.tg_audit('id', 'token_hash');

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_feed_tokens__select ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens__select ON public.calendar_feed_tokens FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)));
DROP POLICY IF EXISTS calendar_feed_tokens__insert ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens__insert ON public.calendar_feed_tokens FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)));
DROP POLICY IF EXISTS calendar_feed_tokens__update ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens__update ON public.calendar_feed_tokens FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));

ALTER TABLE public.calendar_feed_tokens OWNER TO luuxa_owner;
REVOKE ALL ON public.calendar_feed_tokens FROM luuxa_app;
GRANT SELECT (id, member_id, label, created_at, last_used_at, revoked_at) ON public.calendar_feed_tokens TO luuxa_app;
GRANT INSERT (member_id, token_hash, label) ON public.calendar_feed_tokens TO luuxa_app;
GRANT UPDATE (revoked_at) ON public.calendar_feed_tokens TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feed_tokens TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_calendar_feed_token_rules() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_calendar_feed_token_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_calendar_feed_token_rules() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
