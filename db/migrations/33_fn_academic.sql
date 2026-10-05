-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (6/8): HỌC TẬP — TÍNH ĐIỂM/GPA THEO THANG CẤU HÌNH, KHÓA & XÁC MINH BẢNG ĐIỂM, PHỤ ĐẠO
-- =====================================================================

-- Chọn thang điểm hiệu lực của một trường tại một ngày (ưu tiên thang riêng của trường, sau đó thang mặc định)
CREATE OR REPLACE FUNCTION app.fn_scale_for(p_university_id uuid, p_on date)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT s.id
    FROM public.grade_scales s
   WHERE s.is_active
     AND (s.university_id = p_university_id OR s.university_id IS NULL)
     AND s.effective_from <= p_on
     AND (s.effective_to IS NULL OR s.effective_to > p_on)
   ORDER BY (s.university_id IS NOT NULL) DESC, s.effective_from DESC
   LIMIT 1
$$;
COMMENT ON FUNCTION app.fn_scale_for(uuid, date) IS 'Thang điểm hiệu lực: thang riêng của trường nếu có, nếu không dùng thang mặc định (university_id NULL).';

-- ---------------------------------------------------------------------
-- 4.5.60  Bảng điểm: mặc định thang điểm + ảnh chụp ngành/MSSV; máy trạng thái; điều kiện nộp/xác minh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_academic_record_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_start date;
BEGIN
  IF NEW.scale_id IS NULL THEN
    SELECT s.starts_on INTO v_start FROM public.semesters s WHERE s.id = NEW.semester_id;
    NEW.scale_id := app.fn_scale_for(NEW.university_id, v_start);
    IF NEW.scale_id IS NULL THEN
      RAISE EXCEPTION 'Chưa cấu hình thang điểm cho trường này và không có thang mặc định.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  IF NEW.major_snapshot IS NULL OR NEW.student_code_snapshot IS NULL THEN
    SELECT COALESCE(NEW.major_snapshot, sp.major), COALESCE(NEW.student_code_snapshot, sp.student_code)
      INTO NEW.major_snapshot, NEW.student_code_snapshot
      FROM public.student_profiles sp
     WHERE sp.member_id = NEW.member_id AND sp.is_current AND sp.deleted_at IS NULL
     LIMIT 1;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_academic_records__defaults
  BEFORE INSERT ON academic_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_academic_record_defaults();

CREATE TRIGGER trg_academic_records__state
  BEFORE INSERT OR UPDATE OF status ON academic_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["draft"],
      "draft":["submitted"],
      "submitted":["verified","rejected","draft"],
      "rejected":["draft"],
      "verified":["draft"]}');

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
    NEW.verified_at := NULL; NEW.verified_by := NULL; NEW.submitted_at := NULL;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_academic_record_rules() IS 'BEFORE UPDATE OF status academic_records: nộp cần ≥1 môn + minh chứng, không dùng chung ảnh với người khác (BR-ACAD-04/05); xác minh phải do người có quyền và khác chính chủ (BR-ACAD-02); mở lại về draft xóa dấu xác minh.';

CREATE TRIGGER trg_academic_records__rules
  BEFORE UPDATE OF status ON academic_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_academic_record_rules();

-- ---------------------------------------------------------------------
-- 4.5.61  Điểm môn: tính tổng kết/điểm chữ/điểm hệ 4/đạt-nợ theo thang, khóa khi đã nộp
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
     AND NOT (app.is_system_caller() AND COALESCE(current_setting('app.academic_unlock', true), '') = 'on') THEN     -- chỉ migration/worker mới mở khóa được, phiên người dùng đặt biến này vô hiệu
    RAISE EXCEPTION 'BR-ACAD-03: bảng điểm đã nộp/xác minh — trả về bản nháp trước khi sửa (mọi thay đổi được ghi audit).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_scale FROM public.grade_scales s WHERE s.id = v_rec.scale_id;
  IF COALESCE(NEW.process_score, 0) > v_scale.max_score OR COALESCE(NEW.final_score, 0) > v_scale.max_score
     OR COALESCE(NEW.official_total_score, 0) > v_scale.max_score THEN
    RAISE EXCEPTION 'Điểm vượt thang tối đa % của thang "%".', v_scale.max_score, v_scale.name USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.official_total_score IS NOT NULL THEN
    v_total := NEW.official_total_score;
  ELSIF NEW.process_score IS NULL THEN
    v_total := NEW.final_score;
  ELSE
    v_total := (NEW.process_score * v_scale.process_weight_pct + NEW.final_score * v_scale.final_weight_pct) / 100.0;
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
COMMENT ON FUNCTION app.tg_grade_record_compute() IS 'BEFORE INSERT/UPDATE grade_records: tổng kết = điểm chính thức của trường (nếu có) hoặc trung bình có trọng số theo scale; làm tròn theo scale; tra bậc điểm chữ; gán điểm hệ 4, đạt/nợ, có tính GPA hay không. Không có trọng số/ngưỡng nào cài cứng trong code.';

CREATE TRIGGER trg_grade_records__compute
  BEFORE INSERT OR UPDATE ON grade_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_grade_record_compute();

-- ---------------------------------------------------------------------
-- 4.5.62  GPA học kỳ & tích lũy
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_recompute_gpa(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  DELETE FROM public.gpa_snapshots WHERE member_id = p_member_id;

  INSERT INTO public.gpa_snapshots (member_id, scope, as_of_semester_id, credits_attempted, credits_passed, failed_courses, gpa10, gpa4, rank_label, includes_unverified)
  WITH base AS (
    SELECT ar.semester_id, sem.starts_on, ar.scale_id, ar.status,
           gr.credits, gr.total_score, gr.gpa_points, gr.is_pass, gr.counts_in_gpa,
           gs.gpa4_mode, gs.max_score
      FROM public.academic_records ar
      JOIN public.semesters sem    ON sem.id = ar.semester_id
      JOIN public.grade_records gr ON gr.record_id = ar.id
      JOIN public.grade_scales gs  ON gs.id = ar.scale_id
     WHERE ar.member_id = p_member_id AND ar.status IN ('submitted', 'verified')
  ), per_sem AS (
    SELECT semester_id, starts_on, scale_id,
           COALESCE(SUM(credits) FILTER (WHERE counts_in_gpa), 0)                     AS cr_att,
           COALESCE(SUM(credits) FILTER (WHERE counts_in_gpa AND is_pass), 0)         AS cr_pass,
           COUNT(*) FILTER (WHERE NOT is_pass)                                        AS failed,
           COALESCE(SUM(total_score * credits) FILTER (WHERE counts_in_gpa), 0)       AS w10,
           COALESCE(SUM((CASE WHEN gpa4_mode = 'linear' THEN total_score / max_score * 4 ELSE gpa_points END) * credits)
                    FILTER (WHERE counts_in_gpa), 0)                                  AS w4,
           bool_or(status <> 'verified')                                              AS unverified
      FROM base
     GROUP BY semester_id, starts_on, scale_id
  ), cum AS (
    SELECT p.*,
           SUM(cr_att)   OVER w AS c_att,  SUM(cr_pass) OVER w AS c_pass, SUM(failed) OVER w AS c_failed,
           SUM(w10)      OVER w AS c_w10,  SUM(w4)      OVER w AS c_w4,
           bool_or(unverified) OVER w AS c_unverified
      FROM per_sem p
    WINDOW w AS (ORDER BY starts_on ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), flat AS (
    SELECT semester_id, scale_id, 'semester'::text AS scope, cr_att AS att, cr_pass AS pas, failed AS fl,
           CASE WHEN cr_att > 0 THEN round(w10 / cr_att, 2) END AS g10,
           CASE WHEN cr_att > 0 THEN round(w4 / cr_att, 2) END  AS g4,
           unverified AS unv
      FROM cum
    UNION ALL
    SELECT semester_id, scale_id, 'cumulative', c_att, c_pass, c_failed,
           CASE WHEN c_att > 0 THEN round(c_w10 / c_att, 2) END,
           CASE WHEN c_att > 0 THEN round(c_w4 / c_att, 2) END,
           c_unverified
      FROM cum
  )
  SELECT p_member_id, f.scope, f.semester_id, f.att, f.pas, f.fl::integer, f.g10, f.g4,
         (SELECT rb.label_vi FROM public.grade_rank_bands rb
           WHERE rb.scale_id = f.scale_id AND f.g4 IS NOT NULL AND rb.min_gpa4 <= f.g4
           ORDER BY rb.min_gpa4 DESC LIMIT 1),
         f.unv
    FROM flat f;
END
$$;
COMMENT ON FUNCTION app.fn_recompute_gpa(uuid) IS 'Tính lại toàn bộ gpa_snapshots của một thành viên: GPA từng học kỳ và GPA tích lũy (lũy kế theo thời gian), trọng số tín chỉ, chỉ môn counts_in_gpa. Hệ 4 theo gpa4_mode của thang (from_letter hoặc linear). Chỉ bảng điểm submitted/verified. Số môn nợ = số môn is_pass=false.';

CREATE OR REPLACE FUNCTION app.tg_gpa_after_grade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_member uuid;
BEGIN
  SELECT ar.member_id INTO v_member
    FROM public.academic_records ar
   WHERE ar.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.record_id ELSE NEW.record_id END;
  IF v_member IS NOT NULL THEN
    PERFORM app.fn_recompute_gpa(v_member);
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_grade_records__gpa
  AFTER INSERT OR UPDATE OR DELETE ON grade_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_gpa_after_grade_change();

CREATE OR REPLACE FUNCTION app.tg_gpa_after_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.fn_recompute_gpa(NEW.member_id);
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_academic_records__gpa
  AFTER UPDATE OF status, scale_id ON academic_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_gpa_after_record_change();

-- ---------------------------------------------------------------------
-- 4.5.63  Phụ đạo: ghép cặp hai bên đồng ý; điểm đóng góp theo giờ kèm được cả hai xác nhận
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_tutoring_matches__state
  BEFORE INSERT OR UPDATE OF status ON tutoring_matches
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["proposed"],
      "proposed":["active","declined","cancelled"],
      "active":["completed","cancelled"],
      "declined":[],"completed":[],"cancelled":[]}');

CREATE OR REPLACE FUNCTION app.tg_tutoring_match_auto_activate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'proposed' AND NEW.tutor_accepted_at IS NOT NULL AND NEW.mentee_accepted_at IS NOT NULL THEN
    NEW.status := 'active';
    NEW.started_on := COALESCE(NEW.started_on, app.local_today());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_tutoring_matches__activate
  BEFORE UPDATE OF tutor_accepted_at, mentee_accepted_at ON tutoring_matches
  FOR EACH ROW EXECUTE FUNCTION app.tg_tutoring_match_auto_activate();

CREATE OR REPLACE FUNCTION app.tg_tutoring_session_merit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tutor uuid;
  v_rule  public.merit_rules%ROWTYPE;
BEGIN
  IF NEW.tutor_confirmed_at IS NOT NULL AND NEW.mentee_confirmed_at IS NOT NULL
     AND (OLD.tutor_confirmed_at IS NULL OR OLD.mentee_confirmed_at IS NULL) THEN
    SELECT m.tutor_member_id INTO v_tutor FROM public.tutoring_matches m WHERE m.id = NEW.match_id;
    SELECT * INTO v_rule FROM public.merit_rules r WHERE r.code = 'tutoring_hour' AND r.is_active;
    IF FOUND THEN
      INSERT INTO public.merit_entries (member_id, rule_code, points, occurred_on, source_table, source_id, note)
      VALUES (v_tutor, v_rule.code, GREATEST(1, round(v_rule.points * NEW.duration_minutes / 60.0))::smallint,
              app.local_date(NEW.held_at), 'tutoring_sessions', NEW.id, 'Buổi kèm học được hai bên xác nhận')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_tutoring_sessions__merit
  AFTER UPDATE OF tutor_confirmed_at, mentee_confirmed_at ON tutoring_sessions
  FOR EACH ROW EXECUTE FUNCTION app.tg_tutoring_session_merit();

-- ---------------------------------------------------------------------
-- 4.5.64  Khóa bảng điểm đã nộp/xác minh (BR-ACAD-16), môn do thành viên tạo (BR-ACAD-18), mốc đồng ý/xác nhận của từng bên (BR-TUT-05/06)
--         RLS chỉ lọc HÀNG; các trigger dưới đây chặn việc chính chủ (hoặc một bên của cặp) ghi cột mà họ không được ghi.
--         Tất cả là SECURITY INVOKER và chỉ ràng buộc phiên chịu RLS (app.is_rls_exempt_role()).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_academic_record_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;
  END IF;
  IF NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'BR-ACAD-16: không được đổi chủ sở hữu của bảng điểm.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.scale_id, NEW.semester_id, NEW.university_id) IS DISTINCT FROM (OLD.scale_id, OLD.semester_id, OLD.university_id) THEN
    RAISE EXCEPTION 'BR-ACAD-16: bảng điểm đã nộp/xác minh — trả về bản nháp trước khi đổi thang điểm, học kỳ hoặc trường.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_academic_record_guard() IS 'BEFORE UPDATE academic_records (BR-ACAD-16), SECURITY INVOKER: phiên người dùng không đổi chủ bảng điểm; bảng điểm đã nộp/xác minh không đổi scale_id/semester_id/university_id (đổi thang điểm là cách làm GPA tăng mà vẫn ở trạng thái verified).';
CREATE TRIGGER trg_academic_records__guard
  BEFORE UPDATE ON academic_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_academic_record_guard();

CREATE OR REPLACE FUNCTION app.tg_grade_record_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status record_status_t;
BEGIN
  IF app.is_system_caller() AND COALESCE(current_setting('app.academic_unlock', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT ar.status INTO v_status FROM public.academic_records ar WHERE ar.id = OLD.record_id;
  IF v_status IN ('submitted', 'verified') THEN
    RAISE EXCEPTION 'BR-ACAD-16: bảng điểm đã nộp/xác minh — không sửa, xóa hay chuyển dòng điểm môn; trả về bản nháp trước.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.record_id IS DISTINCT FROM OLD.record_id THEN
    RAISE EXCEPTION 'BR-ACAD-16: không chuyển dòng điểm môn sang bảng điểm khác — xóa rồi nhập lại trong bản nháp đích.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
COMMENT ON FUNCTION app.tg_grade_record_lock() IS 'BEFORE UPDATE/DELETE grade_records (BR-ACAD-16): khóa cả đường XÓA và đường CHUYỂN record_id của bảng điểm đã nộp/xác minh (trg_grade_records__compute chỉ kiểm bảng điểm đích khi INSERT/UPDATE). Chỉ migration/worker đặt app.academic_unlock = on để sửa dữ liệu có kiểm soát.';
CREATE TRIGGER trg_grade_records__lock
  BEFORE UPDATE OR DELETE ON grade_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_grade_record_lock();

-- Môn học do thành viên tạo khi nhập điểm luôn tính vào GPA; chỉ người quản lý thang điểm được loại môn khỏi GPA (môn điều kiện GDTC, GDQP)
CREATE TRIGGER trg_courses__guard
  BEFORE INSERT OR UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-ACAD-18', 'academic.scale.manage', 'excluded_from_gpa', '');

CREATE OR REPLACE FUNCTION app.tg_tutoring_match_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.tutor_accepted_at IS NOT NULL OR NEW.mentee_accepted_at IS NOT NULL OR NEW.started_on IS NOT NULL THEN
      RAISE EXCEPTION 'BR-TUT-05: cặp mới ở trạng thái đề xuất, mỗi bên tự đặt mốc đồng ý của mình sau đó.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.tutor_member_id IS DISTINCT FROM OLD.tutor_member_id OR NEW.mentee_member_id IS DISTINCT FROM OLD.mentee_member_id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.offer_id IS DISTINCT FROM OLD.offer_id THEN
    RAISE EXCEPTION 'BR-TUT-05: không đổi người kèm, người được kèm hay yêu cầu của cặp đã tạo — hủy và đề xuất cặp mới.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.tutor_accepted_at IS DISTINCT FROM OLD.tutor_accepted_at THEN
    IF OLD.tutor_accepted_at IS NOT NULL OR NOT app.is_self(OLD.tutor_member_id) THEN
      RAISE EXCEPTION 'BR-TUT-05: chỉ chính người kèm được đặt mốc đồng ý của mình (một lần).' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.tutor_accepted_at := now();
  END IF;
  IF NEW.mentee_accepted_at IS DISTINCT FROM OLD.mentee_accepted_at THEN
    IF OLD.mentee_accepted_at IS NOT NULL OR NOT app.is_self(OLD.mentee_member_id) THEN
      RAISE EXCEPTION 'BR-TUT-05: chỉ chính người được kèm được đặt mốc đồng ý của mình (một lần).' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.mentee_accepted_at := now();
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_tutoring_match_guard() IS 'BEFORE INSERT/UPDATE tutoring_matches (BR-TUT-05), SECURITY INVOKER: mỗi bên chỉ đặt mốc đồng ý của chính mình (một lần, giờ máy chủ); cặp chỉ tự active khi CẢ HAI đã đồng ý; không đổi hai thành viên của cặp.';
CREATE TRIGGER trg_tutoring_matches__guard
  BEFORE INSERT OR UPDATE ON tutoring_matches
  FOR EACH ROW EXECUTE FUNCTION app.tg_tutoring_match_guard();

CREATE OR REPLACE FUNCTION app.tg_tutoring_session_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_m public.tutoring_matches%ROWTYPE;
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_m FROM public.tutoring_matches m WHERE m.id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cặp phụ đạo không tồn tại hoặc không thuộc về bạn.' USING ERRCODE = 'no_data_found';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_m.status <> 'active' THEN
      RAISE EXCEPTION 'BR-TUT-06: chỉ ghi buổi kèm cho cặp đang hoạt động (hiện: %).', v_m.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.held_at > now() THEN
      RAISE EXCEPTION 'BR-TUT-06: buổi kèm chưa diễn ra thì chưa ghi nhận được.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.tutor_confirmed_at IS NOT NULL OR NEW.mentee_confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION 'BR-TUT-05: mỗi bên xác nhận buổi kèm sau khi buổi được ghi, không đặt sẵn lúc tạo.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.match_id IS DISTINCT FROM OLD.match_id THEN
    RAISE EXCEPTION 'BR-TUT-05: không chuyển buổi kèm sang cặp khác.' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.held_at IS DISTINCT FROM OLD.held_at OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes)
     AND (OLD.tutor_confirmed_at IS NOT NULL OR OLD.mentee_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'BR-TUT-05: buổi kèm đã có xác nhận — không đổi thời điểm hoặc thời lượng (điểm đóng góp tính theo đó).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.held_at IS DISTINCT FROM OLD.held_at AND NEW.held_at > now() THEN
    RAISE EXCEPTION 'BR-TUT-06: buổi kèm chưa diễn ra thì chưa ghi nhận được.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tutor_confirmed_at IS DISTINCT FROM OLD.tutor_confirmed_at THEN
    IF OLD.tutor_confirmed_at IS NOT NULL OR NOT app.is_self(v_m.tutor_member_id) THEN
      RAISE EXCEPTION 'BR-TUT-05: chỉ chính người kèm được xác nhận phía mình (một lần).' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.tutor_confirmed_at := now();
  END IF;
  IF NEW.mentee_confirmed_at IS DISTINCT FROM OLD.mentee_confirmed_at THEN
    IF OLD.mentee_confirmed_at IS NOT NULL OR NOT app.is_self(v_m.mentee_member_id) THEN
      RAISE EXCEPTION 'BR-TUT-05: chỉ chính người được kèm được xác nhận phía mình (một lần).' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.mentee_confirmed_at := now();
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_tutoring_session_guard() IS 'BEFORE INSERT/UPDATE tutoring_sessions (BR-TUT-05/06), SECURITY INVOKER: buổi kèm thuộc cặp active, không ở tương lai; mỗi bên chỉ xác nhận phía mình (một lần, giờ máy chủ); sau khi có xác nhận không đổi held_at/duration_minutes; điểm tutoring_hour chỉ phát sinh khi cả hai bên tự xác nhận.';
CREATE TRIGGER trg_tutoring_sessions__guard
  BEFORE INSERT OR UPDATE ON tutoring_sessions
  FOR EACH ROW EXECUTE FUNCTION app.tg_tutoring_session_guard();
