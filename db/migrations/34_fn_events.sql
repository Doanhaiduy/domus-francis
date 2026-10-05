-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (7/8): SỰ KIỆN — ĐỊNH KỲ, ĐIỂM DANH QR (HMAC), ĐƠN XIN PHÉP, BIỂU QUYẾT
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.70  Máy trạng thái
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_events__state
  BEFORE INSERT OR UPDATE OF status ON events
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["draft","scheduled"],
      "draft":["scheduled","cancelled"],
      "scheduled":["ongoing","completed","cancelled","draft"],
      "ongoing":["completed","cancelled"],
      "completed":[],"cancelled":[]}');

CREATE TRIGGER trg_leave_requests__state
  BEFORE INSERT OR UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["pending"],
      "pending":["approved","rejected","cancelled"],
      "approved":["cancelled"],
      "rejected":[],"cancelled":[]}');

CREATE TRIGGER trg_polls__state
  BEFORE INSERT OR UPDATE OF status ON polls
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["draft","open"],
      "draft":["open","closed"],
      "open":["closed"],
      "closed":[]}');

CREATE TRIGGER trg_qr_sessions__state
  BEFORE INSERT OR UPDATE OF status ON qr_sessions
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["active"],"active":["closed"],"closed":[]}');

-- ---------------------------------------------------------------------
-- 4.5.71  Sinh sự kiện định kỳ (worker chạy hằng ngày; idempotent)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_generate_recurring_events(p_rule_id uuid DEFAULT NULL, p_horizon_override integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  r       public.event_recurrence_rules%ROWTYPE;
  v_from  date;
  v_to    date;
  v_d     date;
  v_match boolean;
  v_total integer := 0;
  v_ins   integer;
BEGIN
  FOR r IN SELECT * FROM public.event_recurrence_rules x WHERE x.is_active AND (p_rule_id IS NULL OR x.id = p_rule_id) LOOP
    v_from := GREATEST(r.starts_on, COALESCE(r.last_generated_through + 1, r.starts_on), app.local_today());
    v_to   := LEAST(COALESCE(r.until_date, 'infinity'::date), app.local_today() + COALESCE(p_horizon_override, r.generate_horizon_days));
    FOR v_d IN SELECT g::date FROM generate_series(v_from, v_to, interval '1 day') AS g LOOP
      v_match := false;
      IF r.freq = 'weekly' THEN
        v_match := EXTRACT(ISODOW FROM v_d)::smallint = ANY (r.by_weekday)
               AND (((v_d - date_trunc('week', r.starts_on)::date) / 7) % r.interval_n) = 0;
      ELSE
        v_match := (((EXTRACT(YEAR FROM v_d) * 12 + EXTRACT(MONTH FROM v_d))
                    - (EXTRACT(YEAR FROM r.starts_on) * 12 + EXTRACT(MONTH FROM r.starts_on)))::int % r.interval_n) = 0
               AND (
                    (r.by_monthday IS NOT NULL AND EXTRACT(DAY FROM v_d)::int = r.by_monthday)
                 OR (r.nth_weekday IS NOT NULL AND EXTRACT(ISODOW FROM v_d)::smallint = r.by_weekday[1]
                     AND (CASE WHEN r.nth_weekday = -1
                               THEN EXTRACT(MONTH FROM v_d + 7) <> EXTRACT(MONTH FROM v_d)
                               ELSE ((EXTRACT(DAY FROM v_d)::int - 1) / 7 + 1) = r.nth_weekday END)));
      END IF;
      CONTINUE WHEN NOT v_match;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.event_recurrence_exceptions e WHERE e.rule_id = r.id AND e.occurrence_date = v_d);
      INSERT INTO public.events (title, category_id, starts_at, ends_at, location_room_id, location_text, organizer_text,
                                 description, requires_attendance, recurrence_rule_id, occurrence_date, created_by)
      VALUES (r.title, r.category_id,
              (v_d + r.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
              ((v_d + r.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(mins => r.duration_minutes),
              r.location_room_id, r.location_text, r.organizer_text, r.description, r.requires_attendance, r.id, v_d, r.created_by)
      ON CONFLICT (recurrence_rule_id, occurrence_date) DO NOTHING;
      GET DIAGNOSTICS v_ins = ROW_COUNT;
      v_total := v_total + v_ins;
    END LOOP;
    UPDATE public.event_recurrence_rules SET last_generated_through = v_to WHERE id = r.id AND v_to <> 'infinity'::date;
  END LOOP;
  RETURN v_total;
END
$$;
COMMENT ON FUNCTION app.fn_generate_recurring_events(uuid, integer) IS 'Vật chất hóa các lần diễn ra của quy tắc định kỳ trong horizon (mặc định 60 ngày), bỏ qua ngày ngoại lệ, ON CONFLICT DO NOTHING nên chạy lại an toàn. Trả về số sự kiện mới.';

-- ---------------------------------------------------------------------
-- 4.5.72  Điểm danh: cửa sổ, đối tượng, tự tính present/late bằng giờ máy chủ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_is_event_organizer(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.event_organizers o WHERE o.event_id = p_event_id AND o.member_id = app.current_member_id())
$$;

CREATE OR REPLACE FUNCTION app.fn_can_record_attendance(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_permission('event.attendance.record') OR app.fn_is_event_organizer(p_event_id)
$$;
COMMENT ON FUNCTION app.fn_can_record_attendance(uuid) IS 'Người có quyền event.attendance.record hoặc thuộc ban tổ chức của chính sự kiện đó (BR-EVT-02).';

CREATE OR REPLACE FUNCTION app.tg_attendance_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ev     public.events%ROWTYPE;
  v_open   integer;
  v_grace  integer;
BEGIN
  SELECT * INTO v_ev FROM public.events e WHERE e.id = NEW.event_id;
  IF NOT FOUND OR v_ev.deleted_at IS NOT NULL OR v_ev.status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Sự kiện không tồn tại hoặc không mở điểm danh.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT v_ev.requires_attendance THEN
    RAISE EXCEPTION 'Sự kiện này không bật điểm danh.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.method = 'self' AND NOT app.is_system_caller() THEN
    RAISE EXCEPTION 'BR-EVT-17: không có kiểu điểm danh "tự xác nhận" — thành viên tự điểm danh bằng mã QR (app.fn_checkin_by_qr), ban tổ chức ghi hộ bằng kiểu manual.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ev.expected_scope = 'invitees' AND NOT EXISTS (
       SELECT 1 FROM public.event_participants p WHERE p.event_id = NEW.event_id AND p.member_id = NEW.member_id AND p.is_invited) THEN
    RAISE EXCEPTION 'Thành viên không thuộc danh sách mời của sự kiện.' USING ERRCODE = 'check_violation';
  END IF;

  v_open  := COALESCE(v_ev.attendance_open_minutes, app.setting_int('event.attendance.open_minutes_before'));
  v_grace := COALESCE(v_ev.late_grace_minutes, app.setting_int('event.attendance.late_grace_minutes'));

  IF NEW.method IN ('qr', 'self') THEN
    IF now() < v_ev.starts_at - make_interval(mins => v_open) OR now() > v_ev.ends_at THEN
      RAISE EXCEPTION 'BR-EVT-03: ngoài thời gian mở điểm danh của sự kiện (từ % phút trước giờ bắt đầu đến khi kết thúc).', v_open
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.checked_in_at := now();
    NEW.status := CASE WHEN now() <= v_ev.starts_at + make_interval(mins => v_grace) THEN 'present'::attendance_status_t
                       ELSE 'late'::attendance_status_t END;
  ELSIF NEW.method = 'manual' AND app.current_user_id() IS NOT NULL THEN
    IF NOT app.fn_can_record_attendance(NEW.event_id) THEN
      RAISE EXCEPTION 'Không có quyền điểm danh hộ cho sự kiện này.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.recorded_by := COALESCE(NEW.recorded_by, app.current_user_id());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_attendance_rules() IS 'BEFORE INSERT/UPDATE attendance_records (BR-EVT-01..03): sự kiện phải bật điểm danh và còn mở; đối tượng thuộc danh sách mời; qr/self lấy GIỜ MÁY CHỦ và tự tính present/late theo late_grace_minutes; manual cần quyền hoặc là ban tổ chức.';

CREATE TRIGGER trg_attendance_records__rules
  BEFORE INSERT OR UPDATE OF status, method, checked_in_at ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_rules();

-- ---------------------------------------------------------------------
-- 4.5.73  QR xoay vòng ký HMAC-SHA256
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_distance_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT (2 * 6371000 * asin(sqrt(
           power(sin(radians(p_lat2 - p_lat1) / 2), 2)
           + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))::integer
$$;
COMMENT ON FUNCTION app.fn_distance_m(double precision, double precision, double precision, double precision) IS 'Khoảng cách đường chim bay (mét) giữa hai tọa độ (haversine) — dùng cho geofence điểm danh.';

CREATE OR REPLACE FUNCTION app.fn_qr_mac(p_session_id uuid, p_slot bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT encode(substring(hmac((p_session_id::text || '.' || p_slot::text)::bytea, q.secret, 'sha256') FROM 1 FOR 16), 'hex')
    FROM public.qr_sessions q
   WHERE q.id = p_session_id
$$;
REVOKE ALL ON FUNCTION app.fn_qr_mac(uuid, bigint) FROM PUBLIC;
COMMENT ON FUNCTION app.fn_qr_mac(uuid, bigint) IS 'Nội bộ: HMAC-SHA256 (16 byte đầu, hex) của "<session>.<slot>" bằng khóa bí mật của phiên. Không cấp EXECUTE cho vai trò runtime.';

CREATE OR REPLACE FUNCTION app.fn_qr_token(p_session_id uuid, p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_q    public.qr_sessions%ROWTYPE;
  v_slot bigint;
BEGIN
  SELECT * INTO v_q FROM public.qr_sessions q WHERE q.id = p_session_id;
  IF NOT FOUND OR v_q.status <> 'active' OR now() < v_q.opens_at OR now() > v_q.closes_at THEN
    RAISE EXCEPTION 'Phiên điểm danh không hoạt động.' USING ERRCODE = 'check_violation';
  END IF;
  IF (app.current_user_id() IS NULL AND NOT app.is_system_caller())
     OR (app.current_user_id() IS NOT NULL AND NOT app.fn_can_record_attendance(v_q.event_id)) THEN
    RAISE EXCEPTION 'Không có quyền hiển thị mã QR của sự kiện này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_slot := floor(extract(epoch FROM p_at) / v_q.rotation_seconds)::bigint;
  RETURN v_q.id::text || '.' || v_slot::text || '.' || app.fn_qr_mac(v_q.id, v_slot);
END
$$;
COMMENT ON FUNCTION app.fn_qr_token(uuid, timestamptz) IS 'Sinh token QR hiện tại cho màn hình của ban tổ chức (client gọi lại mỗi rotation_seconds). Chỉ người có quyền điểm danh/ban tổ chức gọi được.';

CREATE OR REPLACE FUNCTION app.fn_checkin_by_qr(
  p_token       text,
  p_lat         numeric DEFAULT NULL,
  p_lng         numeric DEFAULT NULL,
  p_device_hash text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_parts   text[] := string_to_array(p_token, '.');
  v_sid     uuid;
  v_slot    bigint;
  v_cur     bigint;
  v_q       public.qr_sessions%ROWTYPE;
  v_member  uuid := app.current_member_id();
  v_dist    integer;
  v_id      uuid;
BEGIN
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'BR-EVT-04: phải đăng nhập bằng tài khoản thành viên để điểm danh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF array_length(v_parts, 1) <> 3 THEN
    RAISE EXCEPTION 'Mã QR không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  BEGIN
    v_sid  := v_parts[1]::uuid;
    v_slot := v_parts[2]::bigint;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Mã QR không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END;
  SELECT * INTO v_q FROM public.qr_sessions q WHERE q.id = v_sid;
  IF NOT FOUND OR v_q.status <> 'active' OR now() < v_q.opens_at OR now() > v_q.closes_at THEN
    RAISE EXCEPTION 'Phiên điểm danh đã đóng hoặc chưa mở.' USING ERRCODE = 'check_violation';
  END IF;
  v_cur := floor(extract(epoch FROM now()) / v_q.rotation_seconds)::bigint;
  IF v_slot NOT BETWEEN v_cur - 1 AND v_cur OR v_parts[3] IS DISTINCT FROM app.fn_qr_mac(v_sid, v_slot) THEN
    RAISE EXCEPTION 'BR-EVT-04: mã QR đã hết hạn hoặc không đúng (mã đổi mỗi % giây). Hãy quét lại mã đang hiển thị.', v_q.rotation_seconds
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_q.geofence_lat IS NOT NULL THEN
    v_dist := app.fn_distance_m(p_lat::double precision, p_lng::double precision, v_q.geofence_lat::double precision, v_q.geofence_lng::double precision);
  END IF;
  IF v_q.require_geofence AND (v_dist IS NULL OR v_dist > v_q.geofence_radius_m) THEN
    RAISE EXCEPTION 'BR-EVT-05: vị trí ngoài phạm vi điểm danh (% m > % m) hoặc chưa cho phép định vị.', COALESCE(v_dist, -1), v_q.geofence_radius_m
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.attendance_records (event_id, member_id, status, method, checked_in_at, qr_session_id, distance_m, device_hash)
  VALUES (v_q.event_id, v_member, 'present', 'qr', now(), v_q.id, v_dist, p_device_hash)
  ON CONFLICT (event_id, member_id) DO UPDATE
     SET status = EXCLUDED.status, method = 'qr', checked_in_at = EXCLUDED.checked_in_at,
         qr_session_id = EXCLUDED.qr_session_id, distance_m = EXCLUDED.distance_m, device_hash = EXCLUDED.device_hash
   WHERE public.attendance_records.status IN ('absent', 'excused')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT ar.id INTO v_id FROM public.attendance_records ar WHERE ar.event_id = v_q.event_id AND ar.member_id = v_member;
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_checkin_by_qr(text, numeric, numeric, text) IS
  'Điểm danh bằng QR (BR-EVT-04/05): bắt buộc đăng nhập (chống chụp màn hình gửi người khác vì mỗi người chỉ điểm danh cho chính mình), token đúng HMAC và còn trong 2 slot gần nhất (≈ 45–90 giây), tùy chọn geofence theo haversine. Giờ ghi nhận là giờ máy chủ; present/late do trigger tính. Idempotent: quét lại không đổi kết quả đã present/late.';

-- ---------------------------------------------------------------------
-- 4.5.74  Đóng điểm danh: sinh vắng/có phép cho người chưa điểm danh, ghi điểm chuyên cần
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_close_event_attendance(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ev      public.events%ROWTYPE;
  v_uid     uuid := app.current_user_id();
  v_abs     integer := 0;
  v_exc     integer := 0;
  v_merit   integer := 0;
BEGIN
  SELECT * INTO v_ev FROM public.events e WHERE e.id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sự kiện không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF (v_uid IS NULL AND NOT app.is_system_caller())
     OR (v_uid IS NOT NULL AND NOT app.fn_can_record_attendance(p_event_id)) THEN
    RAISE EXCEPTION 'Không có quyền đóng điểm danh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT v_ev.requires_attendance THEN
    RAISE EXCEPTION 'Sự kiện không bật điểm danh.' USING ERRCODE = 'check_violation';
  END IF;
  IF now() < v_ev.ends_at THEN
    RAISE EXCEPTION 'Sự kiện chưa kết thúc.' USING ERRCODE = 'check_violation';
  END IF;

  WITH expected AS (
    SELECT m.id AS member_id
      FROM public.members m
     WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= app.local_date(v_ev.starts_at)
       AND (v_ev.expected_scope = 'all'
            OR EXISTS (SELECT 1 FROM public.event_participants p WHERE p.event_id = v_ev.id AND p.member_id = m.id AND p.is_invited))
       AND NOT EXISTS (SELECT 1 FROM public.attendance_records a WHERE a.event_id = v_ev.id AND a.member_id = m.id)
  ), leave_match AS (
    SELECT x.member_id,
           (SELECT lr.id FROM public.leave_requests lr
             WHERE lr.member_id = x.member_id AND lr.status = 'approved'
               AND tstzrange(lr.starts_at, lr.ends_at) && tstzrange(v_ev.starts_at, v_ev.ends_at)
             ORDER BY lr.decided_at DESC LIMIT 1) AS leave_id
      FROM expected x
  ), ins AS (
    INSERT INTO public.attendance_records (event_id, member_id, status, method, recorded_by, leave_request_id, note)
    SELECT v_ev.id, l.member_id,
           CASE WHEN l.leave_id IS NULL THEN 'absent'::attendance_status_t ELSE 'excused'::attendance_status_t END,
           'import', COALESCE(v_uid, v_ev.created_by), l.leave_id,
           CASE WHEN l.leave_id IS NULL THEN 'Tự động: không điểm danh' ELSE 'Tự động: có đơn xin phép được duyệt' END
      FROM leave_match l
    RETURNING status
  )
  SELECT COUNT(*) FILTER (WHERE status = 'absent'), COUNT(*) FILTER (WHERE status = 'excused')
    INTO v_abs, v_exc FROM ins;

  INSERT INTO public.merit_entries (member_id, rule_code, points, occurred_on, source_table, source_id, note, created_by)
  SELECT a.member_id, r.code, r.points, app.local_date(v_ev.starts_at), 'attendance_records', a.id,
         'Điểm chuyên cần: ' || v_ev.title, v_uid
    FROM public.attendance_records a
    JOIN public.merit_rules r ON r.is_active AND r.code = CASE a.status WHEN 'present' THEN 'event_present' WHEN 'absent' THEN 'event_absent' END
   WHERE a.event_id = v_ev.id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_merit = ROW_COUNT;

  UPDATE public.events SET status = 'completed' WHERE id = v_ev.id AND status IN ('scheduled', 'ongoing');
  UPDATE public.qr_sessions SET status = 'closed', closed_at = now() WHERE event_id = v_ev.id AND status = 'active';
  RETURN jsonb_build_object('absent_created', v_abs, 'excused_created', v_exc, 'merit_entries', v_merit);
END
$$;
COMMENT ON FUNCTION app.fn_close_event_attendance(uuid) IS 'Đóng điểm danh sau sự kiện: người chưa điểm danh ⇒ absent, hoặc excused nếu có đơn xin phép được duyệt trùng giờ (BR-EVT-06); ghi điểm chuyên cần một lần; đóng phiên QR; sự kiện ⇒ completed. SECURITY DEFINER vì phải ghi merit_entries (sổ cái điểm, người dùng không ghi trực tiếp) — quyền được kiểm tra trong thân hàm (fn_can_record_attendance).';

-- ---------------------------------------------------------------------
-- 4.5.75  Đơn xin phép: duyệt không tự duyệt; duyệt đơn vắng sự kiện ⇒ ghi excused
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_leave_request_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    SELECT m.user_id INTO v_owner FROM public.members m WHERE m.id = NEW.member_id;
    IF app.current_user_id() IS NOT NULL THEN
      IF v_owner IS NOT DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'BR-EVT-07: không được tự duyệt đơn xin phép của chính mình.' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT app.has_permission('leave.review') THEN
        RAISE EXCEPTION 'Không có quyền duyệt đơn xin phép.' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    NEW.decided_by := COALESCE(app.current_user_id(), NEW.decided_by);
    NEW.decided_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_leave_requests__rules
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_leave_request_rules();

CREATE OR REPLACE FUNCTION app.tg_leave_request_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' AND NEW.kind = 'event_absence' AND NEW.event_id IS NOT NULL THEN
    INSERT INTO public.attendance_records (event_id, member_id, status, method, recorded_by, leave_request_id, note)
    SELECT NEW.event_id, NEW.member_id, 'excused', 'import', NEW.decided_by, NEW.id, 'Đơn xin phép được duyệt'
      FROM public.events e
     WHERE e.id = NEW.event_id AND e.requires_attendance AND e.status IN ('scheduled', 'ongoing')
    ON CONFLICT (event_id, member_id) DO NOTHING;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_leave_requests__apply
  AFTER UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_leave_request_apply();

-- ---------------------------------------------------------------------
-- 4.5.76  Biểu quyết: chỉ khi mở, tối đa max_choices, thay lựa chọn nguyên tử, kết quả tổng hợp
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

CREATE TRIGGER trg_poll_votes__rules
  BEFORE INSERT ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION app.tg_poll_vote_rules();

-- BR-EVT-19: cuộc biểu quyết đã có phiếu thì khóa cấu hình, phương án và việc xóa (rút phiếu sau khi đóng đã bị chính sách DELETE chặn).
CREATE OR REPLACE FUNCTION app.tg_poll_config_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.poll_id = OLD.id) THEN
      RAISE EXCEPTION 'BR-EVT-19: cuộc biểu quyết đã có phiếu — không xóa được, hãy đóng cuộc biểu quyết.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.question IS DISTINCT FROM OLD.question OR NEW.max_choices IS DISTINCT FROM OLD.max_choices
      OR NEW.is_multi_select IS DISTINCT FROM OLD.is_multi_select OR NEW.is_anonymous IS DISTINCT FROM OLD.is_anonymous
      OR NEW.opens_at IS DISTINCT FROM OLD.opens_at)
     AND EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.poll_id = OLD.id) THEN
    RAISE EXCEPTION 'BR-EVT-19: cuộc biểu quyết đã có phiếu — không được đổi câu hỏi, số lựa chọn tối đa, kiểu đa lựa chọn, chế độ ẩn danh hay giờ mở.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_poll_config_lock() IS 'BEFORE UPDATE/DELETE polls (BR-EVT-19): đã có phiếu ⇒ không đổi câu hỏi/max_choices/đa lựa chọn/ẩn danh/giờ mở và không xóa cuộc biểu quyết (chỉ đóng).';
CREATE TRIGGER trg_polls__config_lock
  BEFORE UPDATE OR DELETE ON polls
  FOR EACH ROW EXECUTE FUNCTION app.tg_poll_config_lock();

CREATE OR REPLACE FUNCTION app.tg_poll_option_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.polls p WHERE p.id = NEW.poll_id AND p.status = 'closed') THEN
      RAISE EXCEPTION 'BR-EVT-19: cuộc biểu quyết đã đóng — không thêm phương án.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.label IS NOT DISTINCT FROM OLD.label THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.poll_id = OLD.poll_id) THEN
    RAISE EXCEPTION 'BR-EVT-19: cuộc biểu quyết đã có phiếu — không sửa nội dung hoặc xóa phương án (xóa sẽ kéo theo mất phiếu).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
COMMENT ON FUNCTION app.tg_poll_option_lock() IS 'BEFORE INSERT/UPDATE OF label/DELETE poll_options (BR-EVT-19): không thêm phương án vào cuộc đã đóng; đã có phiếu thì không đổi nhãn/xóa phương án (FK ON DELETE CASCADE sẽ xóa phiếu).';
CREATE TRIGGER trg_poll_options__lock
  BEFORE INSERT OR UPDATE OF label OR DELETE ON poll_options
  FOR EACH ROW EXECUTE FUNCTION app.tg_poll_option_lock();

-- BR-EVT-18: người thường tự phản hồi RSVP được nhưng không tự đưa mình vào danh sách mời (is_invited do người quản lý sự kiện đặt).
CREATE OR REPLACE FUNCTION app.tg_event_participant_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;      -- vai trò không chịu RLS (migration, worker, hàm SECURITY DEFINER) là tin cậy
  END IF;
  IF app.has_permission('event.manage') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_invited := false;
  ELSIF NEW.is_invited IS DISTINCT FROM OLD.is_invited THEN
    RAISE EXCEPTION 'BR-EVT-18: chỉ người có quyền event.manage được thêm/bớt người khỏi danh sách mời.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_event_participant_rules() IS 'BEFORE INSERT/UPDATE OF is_invited event_participants (BR-EVT-18): phiên người thường tự thêm dòng RSVP thì is_invited bị ép = false và không được đổi sau đó; điểm danh sự kiện expected_scope=invitees chỉ chấp nhận is_invited = true.';
CREATE TRIGGER trg_event_participants__rules
  BEFORE INSERT OR UPDATE OF is_invited ON event_participants
  FOR EACH ROW EXECUTE FUNCTION app.tg_event_participant_rules();

CREATE OR REPLACE FUNCTION app.fn_cast_vote(p_poll_id uuid, p_option_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_me  uuid := app.current_member_id();
  v_opt uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_option_ids IS NULL OR cardinality(p_option_ids) = 0 THEN
    RAISE EXCEPTION 'Phải chọn ít nhất một phương án.' USING ERRCODE = 'check_violation';
  END IF;
  -- Tuần tự hóa các lần gọi của CÙNG một người trong CÙNG một cuộc biểu quyết: hai lệnh song song đều thấy "0 phiếu" nên nếu không khóa sẽ
  -- cùng ghi đủ max_choices phiếu (tổng gấp đôi) — BR-EVT-19.
  PERFORM pg_advisory_xact_lock(hashtextextended('poll_vote:' || p_poll_id::text || ':' || v_me::text, 0));
  DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND member_id = v_me;
  FOREACH v_opt IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_option_ids) AS x) LOOP
    INSERT INTO public.poll_votes (poll_id, option_id, member_id) VALUES (p_poll_id, v_opt, v_me);
  END LOOP;
END
$$;
COMMENT ON FUNCTION app.fn_cast_vote(uuid, uuid[]) IS 'Bỏ phiếu/đổi phiếu nguyên tử: khóa advisory theo (poll, người bỏ phiếu) để các lần gọi song song nối đuôi nhau, xóa phiếu cũ của người này trong poll rồi ghi các lựa chọn mới (trigger kiểm tra poll đang mở và số lựa chọn tối đa).';

CREATE OR REPLACE FUNCTION app.fn_poll_results(p_poll_id uuid)
RETURNS TABLE (option_id uuid, label text, sort_order smallint, votes bigint, voters bigint, eligible bigint, voter_names text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_p      public.polls%ROWTYPE;
  v_names  boolean;
BEGIN
  SELECT * INTO v_p FROM public.polls p WHERE p.id = p_poll_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Poll không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF app.current_user_id() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege'; END IF;
  v_names := NOT v_p.is_anonymous AND app.has_permission('poll.manage');
  RETURN QUERY
    SELECT o.id, o.label, o.sort_order,
           COUNT(pv.member_id)::bigint,
           (SELECT COUNT(DISTINCT x.member_id) FROM public.poll_votes x WHERE x.poll_id = p_poll_id)::bigint,
           (SELECT COUNT(*) FROM public.members m WHERE m.status = 'active' AND m.deleted_at IS NULL)::bigint,
           CASE WHEN v_names THEN array_agg(m2.display_name ORDER BY m2.display_name) FILTER (WHERE m2.id IS NOT NULL) END
      FROM public.poll_options o
      LEFT JOIN public.poll_votes pv ON pv.option_id = o.id
      LEFT JOIN public.members m2 ON m2.id = pv.member_id
     WHERE o.poll_id = p_poll_id
     GROUP BY o.id, o.label, o.sort_order
     ORDER BY o.sort_order;
END
$$;
COMMENT ON FUNCTION app.fn_poll_results(uuid) IS 'Kết quả biểu quyết: số phiếu từng phương án, số người đã bỏ phiếu (mẫu số đúng cho tỷ lệ tham gia) và số người có quyền. Tên người bỏ phiếu chỉ trả cho người có quyền poll.manage và chỉ với poll KHÔNG ẩn danh. SECURITY DEFINER để đọc được poll_votes dù RLS chỉ cho thấy phiếu của mình.';

CREATE OR REPLACE FUNCTION app.fn_close_expired_polls()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.polls SET status = 'closed' WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_close_expired_polls() IS 'Worker gọi mỗi phút: đóng poll đã quá hạn closes_at.';
