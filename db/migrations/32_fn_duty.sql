-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (3/8): TRỰC NHẬT — QUY TẮC CA, CHECK-IN, NGHIỆM THU, KHIẾU NẠI, ĐỔI CA, ĐIỂM
-- =====================================================================

CREATE OR REPLACE FUNCTION app.shift_window(p_date date, p_shift_id uuid)
RETURNS tstzrange
LANGUAGE sql
STABLE
AS $$
  SELECT tstzrange(
           (p_date + s.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
           (p_date + s.end_time)   AT TIME ZONE 'Asia/Ho_Chi_Minh')
    FROM public.duty_shifts s
   WHERE s.id = p_shift_id
$$;
COMMENT ON FUNCTION app.shift_window(date, uuid) IS 'Khoảng thời gian thực (timestamptz) của một ca trực vào một ngày, theo giờ Việt Nam.';

-- ---------------------------------------------------------------------
-- 4.5.50  Ca trực: nằm trong tuần của roster, đóng băng mẫu checklist, khóa sau khi bắt đầu
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_duty_assignment_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_week   date;
  v_status roster_status_t;
BEGIN
  SELECT r.week_start, r.status INTO v_week, v_status FROM public.duty_rosters r WHERE r.id = NEW.roster_id;
  IF NEW.duty_date < v_week OR NEW.duty_date > v_week + 6 THEN
    RAISE EXCEPTION 'BR-DUTY-06: ngày trực % nằm ngoài tuần của roster (bắt đầu %).', NEW.duty_date, v_week USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_status = 'closed' THEN
      RAISE EXCEPTION 'Roster tuần % đã đóng, không thêm ca mới.', v_week USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.checklist_template_id IS NULL THEN
      SELECT t.id INTO NEW.checklist_template_id
        FROM public.checklist_templates t
       WHERE t.is_active AND (t.area_id = NEW.area_id OR t.area_id IS NULL)
       ORDER BY (t.area_id IS NOT NULL) DESC, t.version DESC
       LIMIT 1;
    END IF;
  ELSE
    IF OLD.status <> 'scheduled' AND (NEW.duty_date <> OLD.duty_date OR NEW.area_id <> OLD.area_id OR NEW.shift_id <> OLD.shift_id) THEN
      RAISE EXCEPTION 'Ca đã phát sinh check-in/kết quả — không đổi ngày, khu vực, ca.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_duty_assignments__rules
  BEFORE INSERT OR UPDATE ON duty_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_assignment_rules();

CREATE TRIGGER trg_duty_assignments__state
  BEFORE INSERT OR UPDATE OF status ON duty_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["scheduled"],
      "scheduled":["checked_in","cancelled","missed","excused"],
      "checked_in":["approved","rework_required"],
      "rework_required":["checked_in","approved","missed","excused"],
      "missed":["excused"],
      "approved":[],"cancelled":[],"excused":[]}');

-- BR-DUTY-27: người có duty.manage (policy duty_assignments__write FOR ALL) xếp/hủy/miễn ca nhưng KHÔNG tự đặt kết quả của ca:
-- checked_in / approved / rework_required / missed chỉ phát sinh từ check-in, nghiệm thu, quyết định khiếu nại hoặc tiến trình nền
-- (các đường này chạy bằng SECURITY DEFINER/worker nên không chịu chặn). attempt_count và rework_due_at là cột hệ thống.
CREATE OR REPLACE FUNCTION app.tg_duty_assignment_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;      -- vai trò không chịu RLS (migration, worker, hàm SECURITY DEFINER) là tin cậy
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('checked_in', 'approved', 'rework_required', 'missed') THEN
    RAISE EXCEPTION 'BR-DUTY-27: trạng thái % chỉ phát sinh từ check-in, nghiệm thu, quyết định khiếu nại hoặc tiến trình nền — không đặt trực tiếp.', NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_duty_assignment_guard() IS 'BEFORE UPDATE OF status duty_assignments (BR-DUTY-27), SECURITY INVOKER: phiên chịu RLS (luuxa_app) không được tự chuyển ca sang checked_in/approved/rework_required/missed; chỉ cho xếp/hủy/miễn ca.';
CREATE TRIGGER trg_duty_assignments__guard
  BEFORE UPDATE OF status ON duty_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_assignment_guard();
CREATE TRIGGER trg_duty_assignments__guard_cols
  BEFORE INSERT OR UPDATE ON duty_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-DUTY-27', '', '', 'attempt_count,rework_due_at');

CREATE TRIGGER trg_duty_assignments__history
  AFTER INSERT OR UPDATE OF status ON duty_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_status_history('duty_status_history', 'assignment_id');

CREATE TRIGGER trg_duty_status_history__immutable
  BEFORE UPDATE OR DELETE ON duty_status_history
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

-- ---------------------------------------------------------------------
-- 4.5.51  Người trực: thành viên đang ở, không trùng bận/nghỉ phép (trừ khi ghi đè có lý do), khóa sau khi ca bắt đầu
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_duty_member_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status   duty_status_t;
  v_window   tstzrange;
  v_mstatus  member_status_t;
  v_conflict boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT a.status INTO v_status FROM public.duty_assignments a WHERE a.id = OLD.assignment_id;
    IF v_status IS NOT NULL AND v_status <> 'scheduled' AND COALESCE(current_setting('app.swap_in_progress', true), '') <> 'on' THEN
      RAISE EXCEPTION 'BR-DUTY-07: ca đã check-in/có kết quả — không đổi người trực ngoài quy trình đổi ca.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  SELECT a.status INTO v_status FROM public.duty_assignments a WHERE a.id = NEW.assignment_id;
  IF v_status <> 'scheduled' AND COALESCE(current_setting('app.swap_in_progress', true), '') <> 'on' THEN
    RAISE EXCEPTION 'BR-DUTY-07: ca đã check-in/có kết quả — không thêm người trực ngoài quy trình đổi ca.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT m.status INTO v_mstatus FROM public.members m WHERE m.id = NEW.member_id AND m.deleted_at IS NULL;
  IF v_mstatus IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Chỉ xếp trực cho thành viên đang ở (active).' USING ERRCODE = 'check_violation';
  END IF;

  v_window := app.shift_window(NEW.duty_date, NEW.shift_id);
  v_conflict :=
    EXISTS (SELECT 1 FROM public.member_unavailability u
             WHERE u.member_id = NEW.member_id AND tstzrange(u.starts_at, u.ends_at) && v_window)
    OR EXISTS (SELECT 1 FROM public.leave_requests lr
                WHERE lr.member_id = NEW.member_id AND lr.status = 'approved'
                  AND tstzrange(lr.starts_at, lr.ends_at) && v_window);
  IF v_conflict AND (NEW.override_reason IS NULL OR char_length(btrim(NEW.override_reason)) < 5) THEN
    RAISE EXCEPTION 'BR-DUTY-05: thành viên đã khai báo bận hoặc có đơn nghỉ được duyệt trong ca này; cần ghi đè có lý do.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_duty_assignment_members__rules
  BEFORE INSERT OR DELETE ON duty_assignment_members
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_member_rules();

-- ---------------------------------------------------------------------
-- 4.5.52  Check-in: người trực, khung giờ, ảnh minh chứng hợp lệ & không tái sử dụng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_duty_checkin_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_a        public.duty_assignments%ROWTYPE;
  v_win      tstzrange;
  v_start    timestamptz;
  v_end      timestamptz;
  v_file     public.storage_files%ROWTYPE;
  v_ref_time timestamptz;
  v_before   integer := app.setting_int('duty.checkin.window_before_minutes');
  v_after    integer := app.setting_int('duty.checkin.window_after_minutes');
  v_late     integer := app.setting_int('duty.checkin.late_after_minutes');
  v_maxage   integer := app.setting_int('duty.evidence.max_age_minutes');
  v_dist     integer := app.setting_int('duty.evidence.phash_max_distance');
  v_days     integer := app.setting_int('duty.evidence.dedupe_days');
BEGIN
  SELECT * INTO v_a FROM public.duty_assignments a WHERE a.id = NEW.assignment_id FOR UPDATE;
  IF v_a.status NOT IN ('scheduled', 'rework_required') THEN
    RAISE EXCEPTION 'Ca trực ở trạng thái % — không thể check-in.', v_a.status USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.duty_assignment_members m WHERE m.assignment_id = NEW.assignment_id AND m.member_id = NEW.checked_in_by_member_id) THEN
    RAISE EXCEPTION 'BR-DUTY-01: người check-in không thuộc danh sách trực của ca này.' USING ERRCODE = 'check_violation';
  END IF;

  NEW.attempt := v_a.attempt_count + 1;
  NEW.checked_in_at := now();

  v_win := app.shift_window(v_a.duty_date, v_a.shift_id);
  v_start := lower(v_win); v_end := upper(v_win);
  IF NEW.attempt >= 2 THEN
    -- BR-DUTY-26: làm lại sau nghiệm thu không còn bị khung giờ của ca gốc chặn mà bị hạn rework_due_at (duty.rework.window_hours kể từ lúc nghiệm thu)
    IF v_a.rework_due_at IS NULL OR now() > v_a.rework_due_at THEN
      RAISE EXCEPTION 'BR-DUTY-26: đã quá hạn làm lại của ca này (hạn: %).', COALESCE(v_a.rework_due_at::text, 'chưa đặt')
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.is_late := false;
    NEW.late_minutes := NULL;
  ELSE
    IF now() < v_start - make_interval(mins => v_before) OR now() > v_end + make_interval(mins => v_after) THEN
      RAISE EXCEPTION 'BR-DUTY-08: ngoài khung giờ cho phép check-in của ca (từ % phút trước ca đến % phút sau ca).', v_before, v_after
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.is_late := now() > v_end + make_interval(mins => v_late);
    NEW.late_minutes := CASE WHEN NEW.is_late THEN GREATEST(1, floor(extract(epoch FROM (now() - v_end)) / 60)::int) END;
  END IF;

  SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.evidence_file_id;
  IF NOT FOUND OR v_file.bucket <> 'cleaning-evidence' OR v_file.status <> 'ready' OR v_file.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'BR-DUTY-03: ảnh minh chứng phải là tệp hợp lệ, đã xử lý xong (ready) trong bucket cleaning-evidence.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_file.detected_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Ảnh minh chứng phải là JPEG/PNG/WebP.' USING ERRCODE = 'check_violation';
  END IF;

  v_ref_time := COALESCE(v_file.taken_at, NEW.client_captured_at);
  IF v_ref_time IS NULL THEN
    IF app.setting_bool('duty.evidence.require_exif') THEN
      RAISE EXCEPTION 'BR-DUTY-03: ảnh thiếu thời điểm chụp (EXIF/camera) — bật chụp trực tiếp bằng camera.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_ref_time < now() - make_interval(mins => v_maxage) OR v_ref_time > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'BR-DUTY-03: thời điểm chụp ảnh (%) lệch quá % phút so với lúc check-in — nghi dùng ảnh cũ.', v_ref_time, v_maxage
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_file.sha256 IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.duty_checkins dc JOIN public.storage_files f2 ON f2.id = dc.evidence_file_id
        WHERE f2.sha256 = v_file.sha256 AND f2.id <> v_file.id) THEN
    RAISE EXCEPTION 'BR-DUTY-03: ảnh trùng hoàn toàn (SHA-256) với ảnh đã dùng cho một lần check-in khác.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_file.phash IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.duty_checkins dc JOIN public.storage_files f2 ON f2.id = dc.evidence_file_id
        WHERE f2.phash IS NOT NULL AND f2.id <> v_file.id
          AND dc.checked_in_at > now() - make_interval(days => v_days)
          AND bit_count(((f2.phash # v_file.phash))::bit(64)) <= v_dist) THEN
    RAISE EXCEPTION 'BR-DUTY-03: ảnh gần giống (pHash) ảnh đã dùng trong % ngày gần đây — nghi tái sử dụng.', v_days USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_duty_checkin_rules() IS 'BEFORE INSERT duty_checkins (BR-DUTY-01/03/08): người trực, trạng thái ca, khung giờ, ảnh ready đúng bucket, thời điểm chụp gần lúc check-in, không trùng SHA-256/pHash. Toàn bộ ngưỡng đọc từ settings duty.*.';

CREATE TRIGGER trg_duty_checkins__rules
  BEFORE INSERT ON duty_checkins
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_checkin_rules();

CREATE OR REPLACE FUNCTION app.tg_duty_checkin_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE public.duty_assignments
     SET status = 'checked_in', attempt_count = NEW.attempt
   WHERE id = NEW.assignment_id;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_duty_checkins__apply
  AFTER INSERT ON duty_checkins
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_checkin_apply();

-- Mọi tiêu chí bắt buộc phải có và đạt (kiểm tra cuối transaction để cho phép chèn checkin trước, items sau)
CREATE OR REPLACE FUNCTION app.tg_duty_checkin_required_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_template uuid;
  v_missing  integer;
BEGIN
  SELECT a.checklist_template_id INTO v_template FROM public.duty_assignments a WHERE a.id = NEW.assignment_id;
  IF v_template IS NULL THEN RETURN NULL; END IF;
  SELECT COUNT(*) INTO v_missing
    FROM public.checklist_template_items i
   WHERE i.template_id = v_template AND i.is_required
     AND NOT EXISTS (SELECT 1 FROM public.checkin_items ci
                      WHERE ci.checkin_id = NEW.id AND ci.template_item_id = i.id AND ci.is_done);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'BR-DUTY-09: còn % tiêu chí bắt buộc chưa hoàn thành trong check-in.', v_missing USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER trg_duty_checkins__required_items
  AFTER INSERT ON duty_checkins
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_checkin_required_items();

-- ---------------------------------------------------------------------
-- 4.5.53  Nghiệm thu: không tự nghiệm thu, đúng quyền/phạm vi, cập nhật ca + ghi điểm đóng góp
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.can_review_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_permission('duty.review')
      OR app.has_permission('duty.review', 'cleaning_area', p_area_id)
      OR EXISTS (SELECT 1 FROM public.cleaning_areas a
                  WHERE a.id = p_area_id AND a.floor_id IS NOT NULL
                    AND app.has_permission('duty.review', 'floor', a.floor_id))
$$;
COMMENT ON FUNCTION app.can_review_area(uuid) IS 'Quyền nghiệm thu theo phạm vi: toàn nhà, theo khu vực vệ sinh hoặc theo tầng của khu vực (Phó nhà phụ trách một tầng).';

CREATE OR REPLACE FUNCTION app.tg_duty_review_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_checkin public.duty_checkins%ROWTYPE;
  v_a       public.duty_assignments%ROWTYPE;
  v_ruid    uuid;
BEGIN
  SELECT * INTO v_checkin FROM public.duty_checkins c WHERE c.id = NEW.checkin_id;
  SELECT * INTO v_a FROM public.duty_assignments a WHERE a.id = v_checkin.assignment_id FOR UPDATE;
  IF v_a.status <> 'checked_in' OR v_checkin.attempt <> v_a.attempt_count THEN
    RAISE EXCEPTION 'Chỉ nghiệm thu lần check-in mới nhất của ca đang ở trạng thái checked_in.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.duty_assignment_members m WHERE m.assignment_id = v_a.id AND m.member_id = NEW.reviewer_member_id) THEN
    RAISE EXCEPTION 'BR-DUTY-02: người trực không được nghiệm thu ca của chính mình.' USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL THEN
    SELECT m.user_id INTO v_ruid FROM public.members m WHERE m.id = NEW.reviewer_member_id;
    IF v_ruid IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'Chỉ được ghi nghiệm thu với tư cách chính mình.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT app.can_review_area(v_a.area_id) THEN
      RAISE EXCEPTION 'Không có quyền nghiệm thu khu vực này.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_duty_reviews__rules
  BEFORE INSERT ON duty_reviews
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_review_rules();

CREATE TRIGGER trg_duty_reviews__immutable
  BEFORE UPDATE OR DELETE ON duty_reviews
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

CREATE OR REPLACE FUNCTION app.fn_award_duty_merit(p_assignment_id uuid, p_rule_code text, p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_a      public.duty_assignments%ROWTYPE;
  v_area   public.cleaning_areas%ROWTYPE;
  v_rule   public.merit_rules%ROWTYPE;
  v_n      integer;
BEGIN
  SELECT * INTO v_a FROM public.duty_assignments a WHERE a.id = p_assignment_id;
  SELECT * INTO v_area FROM public.cleaning_areas ca WHERE ca.id = v_a.area_id;
  SELECT * INTO v_rule FROM public.merit_rules mr WHERE mr.code = p_rule_code AND mr.is_active;
  IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO public.merit_entries (member_id, rule_code, points, occurred_on, academic_year_id, source_table, source_id, note, created_by)
  SELECT m.member_id, v_rule.code,
         GREATEST(-100, LEAST(100, v_rule.points * (CASE WHEN v_rule.points > 0 THEN v_area.difficulty_points ELSE 1 END)))::smallint,
         v_a.duty_date,
         (SELECT r.academic_year_id FROM public.duty_rosters r WHERE r.id = v_a.roster_id),
         'duty_assignments', v_a.id, p_note, app.current_user_id()
    FROM public.duty_assignment_members m
   WHERE m.assignment_id = v_a.id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_award_duty_merit(uuid, text, text) IS 'Ghi điểm đóng góp cho mọi người trực của ca theo quy tắc merit_rules (điểm dương nhân trọng số khu vực). Idempotent nhờ ux_merit_entries__source.';

CREATE OR REPLACE FUNCTION app.tg_duty_review_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_assignment uuid;
BEGIN
  SELECT c.assignment_id INTO v_assignment FROM public.duty_checkins c WHERE c.id = NEW.checkin_id;
  IF NEW.decision = 'approved' THEN
    UPDATE public.duty_assignments SET status = 'approved', rework_due_at = NULL WHERE id = v_assignment;
    PERFORM app.fn_award_duty_merit(v_assignment, 'duty_approved', 'Nghiệm thu đạt');
  ELSE
    PERFORM set_config('app.status_reason', NEW.feedback, true);
    UPDATE public.duty_assignments
       SET status = 'rework_required', status_reason = NEW.feedback,
           rework_due_at = now() + make_interval(hours => app.setting_int('duty.rework.window_hours')::integer)
     WHERE id = v_assignment;
    PERFORM app.fn_award_duty_merit(v_assignment, 'duty_rework', 'Yêu cầu làm lại');
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_duty_reviews__apply
  AFTER INSERT ON duty_reviews
  FOR EACH ROW EXECUTE FUNCTION app.tg_duty_review_apply();

-- Khiếu nại: Trưởng nhà quyết định; chấp nhận => ca thành approved
CREATE OR REPLACE FUNCTION app.fn_decide_review_appeal(p_appeal_id uuid, p_uphold boolean, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_appeal  public.duty_review_appeals%ROWTYPE;
  v_assign  uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('duty.appeal.decide') THEN
    RAISE EXCEPTION 'Không có quyền quyết định khiếu nại.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_appeal FROM public.duty_review_appeals ap WHERE ap.id = p_appeal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Khiếu nại không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_appeal.status <> 'open' THEN RAISE EXCEPTION 'Khiếu nại đã được xử lý.' USING ERRCODE = 'check_violation'; END IF;
  IF p_note IS NULL OR char_length(btrim(p_note)) < 5 THEN
    RAISE EXCEPTION 'Phải ghi lý do quyết định (≥ 5 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT c.assignment_id INTO v_assign
    FROM public.duty_reviews r JOIN public.duty_checkins c ON c.id = r.checkin_id
   WHERE r.id = v_appeal.review_id;
  -- BR-DUTY-28: xung đột lợi ích — người thuộc ca hoặc chính người khiếu nại không quyết định khiếu nại này
  IF app.current_member_id() IS NOT NULL AND (app.current_member_id() = v_appeal.appellant_member_id OR EXISTS (
       SELECT 1 FROM public.duty_assignment_members m WHERE m.assignment_id = v_assign AND m.member_id = app.current_member_id())) THEN
    RAISE EXCEPTION 'BR-DUTY-28: người thuộc ca trực hoặc là người khiếu nại không được tự quyết định khiếu nại này.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.duty_review_appeals
     SET status = CASE WHEN p_uphold THEN 'upheld'::appeal_status_t ELSE 'dismissed'::appeal_status_t END,
         decided_by = v_uid, decided_at = now(), decision_note = p_note
   WHERE id = p_appeal_id;
  IF p_uphold THEN
    PERFORM set_config('app.status_reason', 'Khiếu nại được chấp nhận: ' || p_note, true);
    UPDATE public.duty_assignments SET status = 'approved', status_reason = NULL, rework_due_at = NULL WHERE id = v_assign AND status = 'rework_required';
    IF FOUND THEN       -- chỉ cộng điểm khi ca còn ở rework_required; ca đã bị đánh dấu missed thì quyết định chấp nhận chỉ ghi nhận, không tự cộng điểm
      PERFORM app.fn_award_duty_merit(v_assign, 'duty_approved', 'Khiếu nại được chấp nhận');
    END IF;
  END IF;
END
$$;
COMMENT ON FUNCTION app.fn_decide_review_appeal(uuid, boolean, text) IS 'Trưởng nhà quyết định khiếu nại nghiệm thu (BR-DUTY-10): chấp nhận ⇒ ca rework_required → approved và ghi điểm; bác bỏ ⇒ giữ nguyên. Cả hai đều bắt buộc lý do.';

-- ---------------------------------------------------------------------
-- 4.5.54  Đổi ca 3 bước
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_duty_swap_requests__state
  BEFORE INSERT OR UPDATE OF status ON duty_swap_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["pending_peer"],
      "pending_peer":["pending_admin","rejected","cancelled","expired"],
      "pending_admin":["approved","rejected","cancelled","expired"],
      "approved":[],"rejected":[],"cancelled":[],"expired":[]}');

CREATE TRIGGER trg_duty_swap_requests__history
  AFTER INSERT OR UPDATE OF status ON duty_swap_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_status_history('duty_swap_status_history', 'swap_id');

CREATE TRIGGER trg_duty_swap_status_history__immutable
  BEFORE UPDATE OR DELETE ON duty_swap_status_history
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

CREATE OR REPLACE FUNCTION app.fn_request_duty_swap(p_assignment_id uuid, p_to_member_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_me      uuid := app.current_member_id();
  v_a       public.duty_assignments%ROWTYPE;
  v_win     tstzrange;
  v_id      uuid;
  v_notice  integer := app.setting_int('duty.swap.min_notice_hours');
  v_ttl     integer := app.setting_int('duty.swap.request_ttl_hours');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_a FROM public.duty_assignments a WHERE a.id = p_assignment_id;
  IF NOT FOUND OR v_a.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Chỉ được xin đổi ca đang ở trạng thái scheduled.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.duty_assignment_members m WHERE m.assignment_id = v_a.id AND m.member_id = v_me) THEN
    RAISE EXCEPTION 'Bạn không thuộc danh sách trực của ca này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.duty_assignment_members m WHERE m.assignment_id = v_a.id AND m.member_id = p_to_member_id) THEN
    RAISE EXCEPTION 'Người nhận đã thuộc ca này.' USING ERRCODE = 'check_violation';
  END IF;
  v_win := app.shift_window(v_a.duty_date, v_a.shift_id);
  IF now() > lower(v_win) - make_interval(hours => v_notice) THEN
    RAISE EXCEPTION 'BR-DUTY-11: phải xin đổi ca trước giờ bắt đầu ít nhất % giờ.', v_notice USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.duty_swap_requests (assignment_id, from_member_id, to_member_id, reason, expires_at)
  VALUES (v_a.id, v_me, p_to_member_id, p_reason,
          LEAST(lower(v_win) - interval '2 hours', now() + make_interval(hours => v_ttl)))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_request_duty_swap(uuid, uuid, text) IS 'Bước 1: người trực xin đổi sang một thành viên khác (trước giờ ca tối thiểu duty.swap.min_notice_hours).';

-- BR-DUTY-21: hai bước 2 và 3 là SECURITY DEFINER (kiểm người gọi trong thân hàm) vì luuxa_app KHÔNG còn được UPDATE trực tiếp trạng thái đơn
-- ngoài việc người xin hủy đơn của mình (chính sách duty_swap_requests__update + GRANT UPDATE (status) ở 49_b).
CREATE OR REPLACE FUNCTION app.fn_peer_respond_duty_swap(p_swap_id uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me   uuid := app.current_member_id();
  v_swap public.duty_swap_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_swap FROM public.duty_swap_requests s WHERE s.id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đơn đổi ca không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_swap.to_member_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Chỉ người được nhờ đổi ca mới trả lời được.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_swap.status <> 'pending_peer' THEN
    RAISE EXCEPTION 'Đơn đổi ca không còn chờ người nhận trả lời (hiện: %).', v_swap.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_swap.expires_at < now() THEN
    RAISE EXCEPTION 'Đơn đổi ca đã hết hạn.' USING ERRCODE = 'check_violation';      -- worker (fn_housekeeping) chuyển sang expired
  END IF;
  PERFORM set_config('app.status_reason', p_note, true);
  UPDATE public.duty_swap_requests
     SET status = CASE WHEN p_accept THEN 'pending_admin'::swap_status_t ELSE 'rejected'::swap_status_t END,
         peer_responded_at = now()
   WHERE id = p_swap_id;
END
$$;
COMMENT ON FUNCTION app.fn_peer_respond_duty_swap(uuid, boolean, text) IS 'Bước 2 (SECURITY DEFINER, BR-DUTY-21): chỉ người được nhờ, chỉ khi đơn đang pending_peer và chưa hết hạn: xác nhận (→ pending_admin) hoặc từ chối (→ rejected).';

CREATE OR REPLACE FUNCTION app.fn_admin_decide_duty_swap(p_swap_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid  uuid := app.current_user_id();
  v_swap public.duty_swap_requests%ROWTYPE;
  v_a    public.duty_assignments%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('duty.swap.approve') THEN
    RAISE EXCEPTION 'Không có quyền duyệt đổi ca.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_swap FROM public.duty_swap_requests s WHERE s.id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đơn đổi ca không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_swap.status <> 'pending_admin' THEN
    RAISE EXCEPTION 'Đơn chưa được người nhận xác nhận hoặc đã xử lý (hiện: %).', v_swap.status USING ERRCODE = 'check_violation';
  END IF;
  -- BR-DUTY-28: xung đột lợi ích — người xin, người nhận hoặc người thuộc ca không tự duyệt đơn này
  IF app.current_member_id() IS NOT NULL AND (app.current_member_id() IN (v_swap.from_member_id, v_swap.to_member_id) OR EXISTS (
       SELECT 1 FROM public.duty_assignment_members m WHERE m.assignment_id = v_swap.assignment_id AND m.member_id = app.current_member_id())) THEN
    RAISE EXCEPTION 'BR-DUTY-28: người xin đổi, người nhận đổi hoặc người thuộc ca không được tự duyệt đơn đổi ca này.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_approve THEN
    SELECT * INTO v_a FROM public.duty_assignments a WHERE a.id = v_swap.assignment_id FOR UPDATE;
    IF v_a.status <> 'scheduled' THEN
      RAISE EXCEPTION 'Ca không còn ở trạng thái scheduled.' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.swap_in_progress', 'on', true);
    DELETE FROM public.duty_assignment_members WHERE assignment_id = v_a.id AND member_id = v_swap.from_member_id;
    INSERT INTO public.duty_assignment_members (assignment_id, duty_date, shift_id, member_id, added_by)
    VALUES (v_a.id, v_a.duty_date, v_a.shift_id, v_swap.to_member_id, v_uid);
    PERFORM set_config('app.swap_in_progress', 'off', true);
  END IF;
  PERFORM set_config('app.status_reason', p_note, true);
  UPDATE public.duty_swap_requests
     SET status = CASE WHEN p_approve THEN 'approved'::swap_status_t ELSE 'rejected'::swap_status_t END,
         admin_decided_by = v_uid, admin_decided_at = now(), admin_note = p_note
   WHERE id = p_swap_id;
END
$$;
COMMENT ON FUNCTION app.fn_admin_decide_duty_swap(uuid, boolean, text) IS 'Bước 3 (SECURITY DEFINER, BR-DUTY-21/28): người có duty.swap.approve và KHÔNG phải người xin/người nhận/người thuộc ca duyệt hoặc từ chối; duyệt ⇒ hoán đổi dòng duty_assignment_members (ràng buộc không trùng ca/bận vẫn được trigger kiểm tra).';

-- ---------------------------------------------------------------------
-- 4.5.55  Công bố roster + đánh dấu bỏ ca tự động (worker chạy mỗi 30 phút)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_publish_roster(p_roster_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_r     public.duty_rosters%ROWTYPE;
  v_bad   text;
  v_count integer;
BEGIN
  IF v_uid IS NOT NULL AND NOT app.has_permission('duty.manage') THEN
    RAISE EXCEPTION 'Không có quyền công bố roster.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.duty_rosters r WHERE r.id = p_roster_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Roster không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_r.status <> 'draft' THEN RAISE EXCEPTION 'Roster đã công bố/đóng.' USING ERRCODE = 'check_violation'; END IF;
  SELECT string_agg(ca.name || ' ' || a.duty_date::text, '; ') INTO v_bad
    FROM public.duty_assignments a
    JOIN public.cleaning_areas ca ON ca.id = a.area_id
   WHERE a.roster_id = p_roster_id AND NOT ca.is_whole_house
     AND (SELECT COUNT(*) FROM public.duty_assignment_members m WHERE m.assignment_id = a.id) < ca.min_assignees;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BR-DUTY-12: các ca chưa đủ số người tối thiểu: %', v_bad USING ERRCODE = 'check_violation';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.duty_assignments a WHERE a.roster_id = p_roster_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'Roster chưa có ca nào.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.duty_rosters SET status = 'published', published_at = now(), published_by = v_uid WHERE id = p_roster_id;
  RETURN v_count;
END
$$;
COMMENT ON FUNCTION app.fn_publish_roster(uuid) IS 'Công bố roster tuần: kiểm tra mỗi ca đủ số người tối thiểu của khu vực (BR-DUTY-12). Việc gửi thông báo do service/worker thực hiện sau khi hàm thành công.';

CREATE OR REPLACE FUNCTION app.fn_mark_missed_duties()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec     record;
  v_n       integer := 0;
  v_grace   integer := app.setting_int('duty.missed_after_hours');
BEGIN
  FOR v_rec IN
    SELECT a.id
      FROM public.duty_assignments a
     WHERE a.status IN ('scheduled', 'rework_required')
       AND GREATEST(upper(app.shift_window(a.duty_date, a.shift_id)) + make_interval(hours => v_grace),
                    COALESCE(a.rework_due_at, '-infinity'::timestamptz)) < now()      -- BR-DUTY-26: ca làm lại tính hạn từ rework_due_at
     FOR UPDATE OF a SKIP LOCKED
  LOOP
    PERFORM set_config('app.status_reason', 'Tự động: quá hạn check-in', true);
    UPDATE public.duty_assignments SET status = 'missed', status_reason = 'Tự động: quá hạn check-in' WHERE id = v_rec.id;
    PERFORM app.fn_award_duty_merit(v_rec.id, 'duty_missed', 'Bỏ ca (quá hạn check-in)');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_mark_missed_duties() IS 'Worker gọi định kỳ: ca scheduled quá duty.missed_after_hours giờ sau khi hết ca, hoặc ca rework_required quá hạn làm lại (rework_due_at, BR-DUTY-26) ⇒ missed + trừ điểm. Dùng SKIP LOCKED để chạy song song an toàn.';

-- Điểm đóng góp bất biến + không ghi trùng một nguồn
CREATE TRIGGER trg_merit_entries__immutable
  BEFORE UPDATE OR DELETE ON merit_entries
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();
