-- =====================================================================
-- 1051 — GÓI G: Bếp & Cơm (luôn ăn, nhắc đăng ký, bỏ qua người vắng), Kỷ luật (tái phạm ⇒ Lỗi đỏ), Xin phép ("tối nay ai vắng"). Chạy SAU 1050. Idempotent.
--   1. Loại thông báo `meal.reminder` (nhắc đăng ký cơm hôm nay).
--   2. discipline_rules.repeat_becomes_red: điều luật mà tái phạm thì chuyển thành Lỗi đỏ (luật nhà L04–L09 — đặt cờ cho các mã đó nếu có).
--   3. meal_auto_eaters: thành viên bật "Luôn ăn, trừ khi báo vắng" — chính chủ bật/tắt (RLS), người quản lý bếp đọc. Khi một bữa được tạo / mở
--      đăng ký (trigger trên meal_menus) hoặc cron sáng chạy, hệ thống tự ghi will_eat = true cho những người này, TRỪ người có đơn xin phép đã duyệt
--      bao trùm bữa đó và người đã tự báo (không đè đăng ký sẵn có). Người dùng vẫn bỏ được từng bữa.
--   4. app.fn_leave_absent_at(thời điểm) (nội bộ) + app.fn_members_absent_for_meal(ngày, bữa) (cho người quản lý bếp): thành viên vắng ở một bữa cơm =
--      có đơn đã duyệt (ngủ ngoài, tạm vắng dài, về quê, nghỉ Tết/hè/lễ, lý do khác) mà khoảng thời gian (gồm cả giờ xin thêm) bao trùm giờ ăn
--      (trưa 11:30, tối 18:30 giờ Việt Nam). Đơn vắng sự kiện / về muộn không tính.
--   5. app.tg_meal_registration_rules: thêm đường "tự đăng ký" (cờ phiên app.meal_auto) — người đăng ký là chính thành viên, không bị coi là đăng ký hộ;
--      mọi luật khác GIỮ NGUYÊN như db/migrations/37.
--   6. app.fn_meal_auto_register_menu / _day, app.fn_meal_reminder_notify: việc của bước cron `meal-reminder` (luuxa_worker); nhắc chống trùng bằng khóa
--      system_post_log "meal-reminder:<ngày>:<thành viên>" ghi CÙNG giao dịch với thông báo.
--   7. app.fn_leave_tonight(): danh sách "tối nay ai vắng / về muộn" cho người có leave.review và cho người được nhờ giữ cửa tối nay — CHỈ tên,
--      loại đơn, giờ (không lý do, nơi đến, số điện thoại).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Loại thông báo
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('meal.reminder', 'meal', 'Nhắc đăng ký cơm hôm nay', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Tái phạm ⇒ Lỗi đỏ
-- ---------------------------------------------------------------------
ALTER TABLE public.discipline_rules ADD COLUMN IF NOT EXISTS repeat_becomes_red boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.discipline_rules.repeat_becomes_red IS
  'Tái phạm điều này (từ lần thứ hai trong 12 tháng) thì chuyển thành Lỗi đỏ — giao diện cảnh báo khi ghi vi phạm. Luật nhà: L04–L09.';
GRANT INSERT (repeat_becomes_red) ON public.discipline_rules TO luuxa_app;
GRANT UPDATE (repeat_becomes_red) ON public.discipline_rules TO luuxa_app;
UPDATE public.discipline_rules
   SET repeat_becomes_red = true
 WHERE code IN ('L04', 'L05', 'L06', 'L07', 'L08', 'L09') AND NOT is_red AND NOT repeat_becomes_red;

-- ---------------------------------------------------------------------
-- 3. "Luôn ăn, trừ khi báo vắng"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_auto_eaters (
  member_id   uuid        PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  enabled_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.meal_auto_eaters IS
  'Thành viên bật "Luôn ăn, trừ khi báo vắng": có dòng ở đây = tự được ghi đăng ký ăn mỗi khi một bữa mở đăng ký (trừ khi có đơn xin phép vắng đã duyệt). Chính chủ bật/tắt.';

ALTER TABLE public.meal_auto_eaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_auto_eaters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meal_auto_eaters__select ON public.meal_auto_eaters;
CREATE POLICY meal_auto_eaters__select ON public.meal_auto_eaters FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('meal.manage')));
DROP POLICY IF EXISTS meal_auto_eaters__insert ON public.meal_auto_eaters;
CREATE POLICY meal_auto_eaters__insert ON public.meal_auto_eaters FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('meal.register')));
DROP POLICY IF EXISTS meal_auto_eaters__delete ON public.meal_auto_eaters;
CREATE POLICY meal_auto_eaters__delete ON public.meal_auto_eaters FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id)));

DROP TRIGGER IF EXISTS trg_meal_auto_eaters__audit ON public.meal_auto_eaters;
CREATE TRIGGER trg_meal_auto_eaters__audit AFTER INSERT OR UPDATE OR DELETE ON public.meal_auto_eaters
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('member_id');

ALTER TABLE public.meal_auto_eaters OWNER TO luuxa_owner;
REVOKE ALL ON public.meal_auto_eaters FROM luuxa_app;
GRANT SELECT, DELETE ON public.meal_auto_eaters TO luuxa_app;
GRANT INSERT (member_id) ON public.meal_auto_eaters TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_auto_eaters TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- 4. Ai vắng ở một bữa cơm (đơn xin phép đã duyệt)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_leave_absent_at(p_at timestamptz)
RETURNS TABLE (member_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT DISTINCT l.member_id
    FROM public.leave_requests l
   WHERE l.status = 'approved'
     AND l.kind::text IN ('overnight_out', 'long_leave', 'home_visit', 'tet_break', 'summer_break', 'holiday_break', 'other')
     AND l.starts_at <= p_at
     AND GREATEST(l.ends_at, COALESCE((SELECT max(x.new_ends_at) FROM public.leave_extensions x WHERE x.leave_request_id = l.id), l.ends_at)) > p_at
$$;
COMMENT ON FUNCTION app.fn_leave_absent_at(timestamptz) IS
  'Nội bộ: thành viên có đơn xin phép ĐÃ DUYỆT (ngủ ngoài, tạm vắng dài, về quê, nghỉ Tết/hè/lễ, khác) bao trùm thời điểm p_at — kể cả giờ xin thêm. Không cấp cho luuxa_app.';

CREATE OR REPLACE FUNCTION app.fn_meal_time(p_date date, p_meal meal_type_t)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_date + (CASE p_meal WHEN 'lunch' THEN time '11:30' ELSE time '18:30' END)) AT TIME ZONE 'Asia/Ho_Chi_Minh'
$$;
COMMENT ON FUNCTION app.fn_meal_time(date, meal_type_t) IS 'Giờ ăn quy ước (trưa 11:30, tối 18:30, giờ Việt Nam) dùng để xét đơn xin phép bao trùm bữa cơm.';

CREATE OR REPLACE FUNCTION app.fn_members_absent_for_meal(p_date date, p_meal meal_type_t)
RETURNS TABLE (member_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NOT NULL AND NOT app.has_permission('meal.manage') THEN
    RAISE EXCEPTION 'Chỉ người quản lý bếp mới xem được ai vắng ở bữa ăn.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT a.member_id FROM app.fn_leave_absent_at(app.fn_meal_time(p_date, p_meal)) a;
END
$$;
COMMENT ON FUNCTION app.fn_members_absent_for_meal(date, meal_type_t) IS
  'Thành viên vắng ở bữa (ngày, bữa) theo đơn xin phép đã duyệt — cho người quản lý bếp (đăng ký hộ cả nhà bỏ qua họ).';

-- ---------------------------------------------------------------------
-- 5. Trigger đăng ký bữa ăn: thêm đường "tự đăng ký" (mọi luật khác như db/migrations/37)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_meal_registration_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz;
  v_status text;
BEGIN
  IF NOT app.setting_bool('feature.meals.enabled') THEN
    RAISE EXCEPTION 'Phân hệ Bếp & Cơm đang tạm hoãn theo quyết định người quản lý.' USING ERRCODE = 'check_violation';
  END IF;
  -- Tự đăng ký cho người bật "Luôn ăn" (chỉ các hàm app.fn_meal_auto_register_* đặt cờ này trong giao dịch): đăng ký là của chính thành viên
  IF COALESCE(current_setting('app.meal_auto', true), '') = 'on' THEN
    NEW.registered_by := (SELECT m.user_id FROM public.members m WHERE m.id = NEW.member_id);
    NEW.registered_at := now();
    RETURN NEW;
  END IF;
  SELECT m.cutoff_at, m.status INTO v_cutoff, v_status FROM public.meal_menus m WHERE m.id = NEW.menu_id;
  IF v_status NOT IN ('open') AND NOT (app.current_user_id() IS NOT NULL AND app.has_permission('meal.manage')) THEN
    RAISE EXCEPTION 'Bữa ăn không mở đăng ký.' USING ERRCODE = 'check_violation';
  END IF;
  IF now() > v_cutoff AND app.current_user_id() IS NOT NULL AND NOT app.has_permission('meal.manage') THEN
    RAISE EXCEPTION 'BR-MEAL-01: đã quá giờ chốt suất ăn.' USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL AND NEW.member_id <> COALESCE(app.current_member_id(), NEW.member_id)
     AND NOT app.has_permission('meal.manage') THEN
    RAISE EXCEPTION 'BR-MEAL-02: chỉ được đăng ký suất của chính mình (đăng ký hộ cần quyền meal.manage).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.registered_by := COALESCE(app.current_user_id(), NEW.registered_by);
  NEW.registered_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_meal_registration_rules() IS 'BEFORE INSERT/UPDATE meal_registrations: tính năng phải bật (feature.meals.enabled), trước giờ chốt, chỉ tự đăng ký cho mình (đăng ký hộ cần meal.manage). Đường tự đăng ký của người bật "Luôn ăn" (cờ phiên app.meal_auto, db/app/1051) bỏ qua kiểm giờ/quyền vì chính các hàm tự đăng ký đã kiểm.';

-- ---------------------------------------------------------------------
-- 6. Tự đăng ký + nhắc đăng ký cơm
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_meal_auto_register_menu(p_menu uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_menu public.meal_menus%ROWTYPE;
  v_n    integer := 0;
BEGIN
  SELECT * INTO v_menu FROM public.meal_menus m WHERE m.id = p_menu;
  IF NOT FOUND OR v_menu.status <> 'open' OR now() > v_menu.cutoff_at THEN
    RETURN 0;
  END IF;
  IF NOT app.setting_bool('feature.meals.enabled') THEN
    RETURN 0;
  END IF;
  PERFORM set_config('app.meal_auto', 'on', true);
  INSERT INTO public.meal_registrations (menu_id, member_id, will_eat)
  SELECT p_menu, a.member_id, true
    FROM public.meal_auto_eaters a
    JOIN public.members m ON m.id = a.member_id AND m.deleted_at IS NULL AND m.status = 'active'
   WHERE a.member_id NOT IN (SELECT x.member_id FROM app.fn_leave_absent_at(app.fn_meal_time(v_menu.menu_date, v_menu.meal_type)) x)
  ON CONFLICT (menu_id, member_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.meal_auto', '', true);
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.meal_auto', '', true);
  RAISE;
END
$$;
COMMENT ON FUNCTION app.fn_meal_auto_register_menu(uuid) IS
  'Ghi đăng ký ĂN cho các thành viên bật "Luôn ăn" vào một bữa đang mở (chưa quá giờ chốt), trừ người có đơn vắng đã duyệt; không đè đăng ký sẵn có. Trả số suất mới.';

CREATE OR REPLACE FUNCTION app.tg_meal_menu_auto_register()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.fn_meal_auto_register_menu(NEW.id);
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_meal_menu_auto_register() IS 'AFTER INSERT / đổi trạng thái sang open của meal_menus: tự đăng ký ĂN cho người bật "Luôn ăn".';

DROP TRIGGER IF EXISTS trg_meal_menus__auto_register_ins ON public.meal_menus;
CREATE TRIGGER trg_meal_menus__auto_register_ins AFTER INSERT ON public.meal_menus
  FOR EACH ROW WHEN (NEW.status = 'open') EXECUTE FUNCTION app.tg_meal_menu_auto_register();
DROP TRIGGER IF EXISTS trg_meal_menus__auto_register_upd ON public.meal_menus;
CREATE TRIGGER trg_meal_menus__auto_register_upd AFTER UPDATE OF status ON public.meal_menus
  FOR EACH ROW WHEN (NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open') EXECUTE FUNCTION app.tg_meal_menu_auto_register();

CREATE OR REPLACE FUNCTION app.fn_meal_auto_register_day(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_meal   meal_type_t;
  v_menu   uuid;
  v_before integer;
  v_after  integer;
BEGIN
  IF p_date IS NULL OR p_date < app.local_today() OR p_date > app.local_today() + 7 THEN
    RETURN 0;
  END IF;
  IF NOT app.setting_bool('feature.meals.enabled') OR NOT EXISTS (SELECT 1 FROM public.meal_auto_eaters) THEN
    RETURN 0;
  END IF;
  SELECT count(*)::int INTO v_before FROM public.meal_registrations r JOIN public.meal_menus m ON m.id = r.menu_id WHERE m.menu_date = p_date;
  FOREACH v_meal IN ARRAY ARRAY['lunch', 'dinner']::meal_type_t[] LOOP
    -- mở ô bữa ăn nếu chưa có (đăng ký của người bật "Luôn ăn" được ghi ngay bởi trigger khi chèn)
    INSERT INTO public.meal_menus (menu_date, meal_type, cutoff_at, status)
    VALUES (p_date, v_meal, app.fn_meal_default_cutoff(p_date, v_meal), 'open')
    ON CONFLICT (menu_date, meal_type) DO NOTHING;
    SELECT m.id INTO v_menu FROM public.meal_menus m WHERE m.menu_date = p_date AND m.meal_type = v_meal;
    PERFORM app.fn_meal_auto_register_menu(v_menu);
  END LOOP;
  SELECT count(*)::int INTO v_after FROM public.meal_registrations r JOIN public.meal_menus m ON m.id = r.menu_id WHERE m.menu_date = p_date;
  RETURN GREATEST(v_after - v_before, 0);
END
$$;
COMMENT ON FUNCTION app.fn_meal_auto_register_day(date) IS
  'Mở hai bữa (trưa, tối) của ngày p_date (từ hôm nay đến +7) nếu chưa có và tự đăng ký ĂN cho người bật "Luôn ăn". Idempotent. Trả số suất mới. Chỉ có tác dụng khi phân hệ Bếp & Cơm bật và có người bật "Luôn ăn".';

CREATE OR REPLACE FUNCTION app.fn_meal_auto_register_self()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me uuid := app.current_member_id();
  v_n  integer := 0;
BEGIN
  IF v_me IS NULL OR NOT app.setting_bool('feature.meals.enabled') OR NOT EXISTS (SELECT 1 FROM public.meal_auto_eaters a WHERE a.member_id = v_me) THEN
    RETURN 0;
  END IF;
  PERFORM set_config('app.meal_auto', 'on', true);
  INSERT INTO public.meal_registrations (menu_id, member_id, will_eat)
  SELECT mm.id, v_me, true
    FROM public.meal_menus mm
   WHERE mm.status = 'open' AND mm.cutoff_at > now() AND mm.menu_date <= app.local_today() + 14
     AND v_me NOT IN (SELECT x.member_id FROM app.fn_leave_absent_at(app.fn_meal_time(mm.menu_date, mm.meal_type)) x)
  ON CONFLICT (menu_id, member_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.meal_auto', '', true);
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.meal_auto', '', true);
  RAISE;
END
$$;
COMMENT ON FUNCTION app.fn_meal_auto_register_self() IS
  'Vừa bật "Luôn ăn": ghi đăng ký ĂN cho CHÍNH người gọi vào mọi bữa đang mở (chưa quá giờ chốt, trong 14 ngày tới), trừ bữa có đơn vắng đã duyệt; không đè đăng ký sẵn có. Trả số suất mới.';

CREATE OR REPLACE FUNCTION app.fn_meal_reminder_notify(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_m     record;
  v_n     integer := 0;
  v_meals text;
BEGIN
  IF NOT app.setting_bool('feature.meals.enabled') THEN
    RETURN 0;
  END IF;
  FOR v_m IN
    SELECT m.id, string_agg(CASE mm.meal_type WHEN 'lunch' THEN 'trưa' ELSE 'tối' END, ' và ' ORDER BY mm.meal_type) AS meals
      FROM public.members m
      JOIN public.meal_menus mm ON mm.menu_date = p_date AND mm.status = 'open' AND mm.cutoff_at > now()
     WHERE m.deleted_at IS NULL AND m.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM public.meal_registrations r WHERE r.menu_id = mm.id AND r.member_id = m.id)
       AND m.id NOT IN (SELECT x.member_id FROM app.fn_leave_absent_at(app.fn_meal_time(p_date, mm.meal_type)) x)
       AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = m.user_id)
     GROUP BY m.id
  LOOP
    INSERT INTO public.system_post_log (key, kind) VALUES ('meal-reminder:' || p_date::text || ':' || v_m.id::text, 'daily')
    ON CONFLICT (key) DO NOTHING;
    IF NOT FOUND THEN
      CONTINUE; -- đã nhắc người này hôm nay
    END IF;
    v_meals := v_m.meals;
    PERFORM app.fn_notify(v_m.id, 'meal.reminder',
      'Bạn chưa báo ăn cơm ' || v_meals || ' hôm nay',
      'Vào Bếp & Cơm báo “có ăn” hoặc “vắng” trước giờ chốt để anh em bếp nấu đủ suất.',
      jsonb_build_object('link', '/bep-com'), NULL, NULL);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_meal_reminder_notify(date) IS
  'Cron sáng: nhắc (trong ứng dụng + đẩy) thành viên đang ở CHƯA đăng ký bữa trưa/tối còn mở của ngày p_date và không có đơn vắng bao trùm bữa đó. Mỗi người một lần mỗi ngày (khóa system_post_log). Trả số người đã nhắc.';

-- ---------------------------------------------------------------------
-- 7. "Tối nay ai vắng / về muộn"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_leave_tonight()
RETURNS TABLE (leave_id uuid, member_name text, kind text, starts_at timestamptz, ends_at timestamptz, effective_ends_at timestamptz, door_for_me boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me     uuid := app.current_member_id();
  v_review boolean;
  v_d      date;
  v_from   timestamptz;
  v_to     timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  v_review := app.has_permission('leave.review');
  -- "Tối nay" = từ 18:00 hôm nay đến 06:00 hôm sau (giờ VN); trước 6 giờ sáng vẫn tính là đêm hôm trước
  v_d := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '6 hours')::date;
  v_from := (v_d + time '18:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_to := (v_d + 1 + time '06:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  RETURN QUERY
    WITH t AS (
      SELECT l.id, l.member_id, l.kind::text AS kind, l.starts_at, l.ends_at, l.door_member_id,
             GREATEST(l.ends_at, COALESCE((SELECT max(x.new_ends_at) FROM public.leave_extensions x WHERE x.leave_request_id = l.id), l.ends_at)) AS eff
        FROM public.leave_requests l
       WHERE l.status = 'approved' AND l.kind::text <> 'event_absence'
    )
    SELECT t.id, COALESCE(m.display_name, m.full_name), t.kind, t.starts_at, t.ends_at, t.eff, (t.door_member_id = v_me)
      FROM t JOIN public.members m ON m.id = t.member_id
     WHERE t.starts_at < v_to AND t.eff > v_from
       AND (v_review OR EXISTS (SELECT 1 FROM t t2 WHERE t2.door_member_id = v_me))
     ORDER BY (t.kind IN ('late_return', 'overnight_out')) DESC, t.starts_at, 2;
END
$$;
COMMENT ON FUNCTION app.fn_leave_tonight() IS
  'Đơn xin phép đã duyệt có hiệu lực tối nay (18:00 → 06:00 giờ VN; về muộn / ngủ ngoài / vắng dài ngày) cho người có leave.review và cho người đang được nhờ giữ cửa tối nay. CHỈ trả tên người xin, loại đơn, giờ (gồm giờ xin thêm) và cờ "mình được nhờ để cửa" — không lý do, nơi đến, số điện thoại.';

-- ---------------------------------------------------------------------
-- Quyền hàm
-- ---------------------------------------------------------------------
ALTER FUNCTION app.fn_leave_absent_at(timestamptz) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_time(date, meal_type_t) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_members_absent_for_meal(date, meal_type_t) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_auto_register_menu(uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_meal_menu_auto_register() OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_auto_register_day(date) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_auto_register_self() OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_reminder_notify(date) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_leave_tonight() OWNER TO luuxa_definer;

REVOKE ALL ON FUNCTION app.fn_leave_absent_at(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_meal_time(date, meal_type_t) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_members_absent_for_meal(date, meal_type_t) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_meal_auto_register_menu(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.tg_meal_menu_auto_register() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_meal_auto_register_day(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_meal_auto_register_self() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_meal_reminder_notify(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_leave_tonight() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.fn_leave_absent_at(timestamptz) TO luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_meal_time(date, meal_type_t) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_members_absent_for_meal(date, meal_type_t) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_meal_auto_register_menu(uuid) TO luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.tg_meal_menu_auto_register() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_meal_auto_register_day(date) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_meal_auto_register_self() TO luuxa_app, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_meal_reminder_notify(date) TO luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_leave_tonight() TO luuxa_app, luuxa_definer, luuxa_owner;

COMMIT;
