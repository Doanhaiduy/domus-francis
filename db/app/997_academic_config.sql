-- =====================================================================
-- 997 — CẤU HÌNH DANH MỤC HỌC TẬP (Cài đặt → "Danh mục học tập"): trường đại học, năm học, học kỳ, nhiệm kỳ Ban điều hành.
-- Bảng đã có ở thiết kế (04_tables_people.sql) + RLS (ghi: academic.scale.manage cho trường, term.manage cho năm học/học kỳ/
-- nhiệm kỳ). File này chỉ bổ sung các chốt chặn dữ liệu cần cho màn hình quản trị. Idempotent.
--
--   1. Xóa năm học / học kỳ chỉ khi CHƯA có dữ liệu tham chiếu. Lý do cần trigger: nhiều khóa ngoại tới hai bảng này là
--      ON DELETE CASCADE (gpa_snapshots, study_goals → semesters) hoặc SET NULL (phân phòng, lịch trực, kỳ tài chính,
--      kế hoạch thu quỹ, nhiệm kỳ → academic_years) ⇒ xóa nhầm sẽ âm thầm mất dữ liệu của thành viên thay vì báo lỗi.
--      Trigger SECURITY DEFINER (thấy mọi dòng, không bị RLS che) ném foreign_key_violation (API trả 409) kèm lý do tiếng Việt.
--   2. Học kỳ phải nằm trong khoảng ngày của năm học; ordinal suy từ mã (HK1=1, HK2=2, HE=3). Sửa ngày năm học không được
--      làm học kỳ đã có rơi ra ngoài.
--   3. Xóa mềm trường đại học đang được dùng (hồ sơ sinh viên, bảng điểm, môn học, thang điểm riêng) bị chặn: RLS ẩn trường đã
--      xóa với thành viên thường nên tên trường sẽ biến mất khỏi hồ sơ/bảng điểm cũ — hãy "Tạm ẩn" (is_active = false).
--   4. app.fn_academic_lookup_usage(): số bản ghi đang dùng từng trường/năm học/học kỳ/nhiệm kỳ (chỉ số đếm, không lộ ai) để
--      màn hình quản trị biết mục nào xóa được — cần term.manage, academic.university.manage hoặc academic.scale.manage.
--   5. Quyền MỚI academic.university.manage ("Quản lý danh mục trường đại học") cho Admin + Trưởng nhà, kèm chính sách RLS
--      permissive trên universities. Lý do: bản vá kiểm định 75 đã bỏ academic.scale.manage khỏi Admin (quyền đó gồm cả
--      THANG ĐIỂM — Admin kỹ thuật không được đổi cách xếp loại học tập) nên Admin không thêm được trường mới; tách riêng
--      danh mục trường (dữ liệu tra cứu thuần) khỏi thang điểm. Không đổi quyền có sẵn của vai trò nào.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 5. Quyền quản lý danh mục trường đại học (không gồm thang điểm) + RLS bổ sung (các chính sách permissive được OR với nhau)
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('academic.university.manage', 'academic', 'Quản lý danh mục trường đại học (thêm/sửa/tạm ẩn/xóa) — không gồm thang điểm', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'academic.university.manage'
  FROM public.roles r
 WHERE r.code IN ('admin', 'house_head')
ON CONFLICT DO NOTHING;

-- Người quản lý thấy cả trường đã xóa mềm (UPDATE … SET deleted_at cần dòng MỚI vẫn hiện dưới chính sách SELECT)
DROP POLICY IF EXISTS universities__select__university_manage ON public.universities;
CREATE POLICY universities__select__university_manage ON public.universities FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('academic.university.manage')));
DROP POLICY IF EXISTS universities__insert__university_manage ON public.universities;
CREATE POLICY universities__insert__university_manage ON public.universities FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('academic.university.manage')));
DROP POLICY IF EXISTS universities__update__university_manage ON public.universities;
CREATE POLICY universities__update__university_manage ON public.universities FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('academic.university.manage')))
  WITH CHECK ((SELECT app.has_permission('academic.university.manage')));

-- ---------------------------------------------------------------------
-- 1 + 2a. Năm học: chặn xóa khi còn dữ liệu tham chiếu; sửa ngày không làm học kỳ rơi ra ngoài
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_academic_years_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_what text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT x.label INTO v_what FROM (
      SELECT 1 AS o, 'bảng điểm' AS label WHERE EXISTS (
        SELECT 1 FROM public.academic_records ar JOIN public.semesters s ON s.id = ar.semester_id WHERE s.academic_year_id = OLD.id)
      UNION ALL SELECT 2, 'kỳ thu quỹ'           WHERE EXISTS (SELECT 1 FROM public.contribution_plans p WHERE p.academic_year_id = OLD.id)
      UNION ALL SELECT 3, 'kỳ tài chính'         WHERE EXISTS (SELECT 1 FROM public.financial_periods p WHERE p.academic_year_id = OLD.id)
      UNION ALL SELECT 4, 'phân phòng'           WHERE EXISTS (SELECT 1 FROM public.room_assignments r WHERE r.academic_year_id = OLD.id)
      UNION ALL SELECT 5, 'lịch trực nhật'       WHERE EXISTS (SELECT 1 FROM public.duty_rosters r WHERE r.academic_year_id = OLD.id)
      UNION ALL SELECT 6, 'điểm rèn luyện'       WHERE EXISTS (SELECT 1 FROM public.merit_entries m WHERE m.academic_year_id = OLD.id)
      UNION ALL SELECT 7, 'nhiệm kỳ Ban điều hành' WHERE EXISTS (SELECT 1 FROM public.board_terms b WHERE b.academic_year_id = OLD.id)
      UNION ALL SELECT 8, 'kết quả GPA / mục tiêu học tập' WHERE EXISTS (
        SELECT 1 FROM public.semesters s
         WHERE s.academic_year_id = OLD.id
           AND (EXISTS (SELECT 1 FROM public.gpa_snapshots g WHERE g.as_of_semester_id = s.id)
                OR EXISTS (SELECT 1 FROM public.study_goals sg WHERE sg.semester_id = s.id)))
    ) x ORDER BY x.o LIMIT 1;
    IF v_what IS NOT NULL THEN
      RAISE EXCEPTION 'Đang có % dùng năm học "%" — không xóa được.', v_what, OLD.name USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF OLD.is_current THEN
      RAISE EXCEPTION 'Năm học "%" đang là năm học hiện hành — hãy đặt năm học khác làm hiện hành trước khi xóa.', OLD.name
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    -- Không còn dữ liệu nào dùng ⇒ học kỳ (con của năm học, FK RESTRICT) được xóa theo năm học
    DELETE FROM public.semesters s WHERE s.academic_year_id = OLD.id;
    RETURN OLD;
  END IF;

  -- UPDATE ngày bắt đầu/kết thúc
  IF EXISTS (SELECT 1 FROM public.semesters s
              WHERE s.academic_year_id = NEW.id AND (s.starts_on < NEW.starts_on OR s.ends_on > NEW.ends_on)) THEN
    RAISE EXCEPTION 'Khoảng ngày mới của năm học "%" không còn chứa hết các học kỳ đã có — hãy sửa ngày học kỳ trước.', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_academic_years_guard() IS
  'BEFORE DELETE academic_years: chặn xóa khi còn bảng điểm, kỳ thu quỹ, kỳ tài chính, phân phòng, lịch trực, điểm rèn luyện, nhiệm kỳ, GPA/mục tiêu học tập gắn năm học (nhiều FK là CASCADE/SET NULL nên không tự báo lỗi) hoặc khi đang là năm hiện hành; qua được thì xóa luôn các học kỳ (trống) của năm. BEFORE UPDATE OF starts_on, ends_on: học kỳ đã có phải nằm trong khoảng mới.';

DROP TRIGGER IF EXISTS trg_academic_years__guard_delete ON public.academic_years;
CREATE TRIGGER trg_academic_years__guard_delete
  BEFORE DELETE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION app.tg_academic_years_guard();
DROP TRIGGER IF EXISTS trg_academic_years__guard_range ON public.academic_years;
CREATE TRIGGER trg_academic_years__guard_range
  BEFORE UPDATE OF starts_on, ends_on ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION app.tg_academic_years_guard();

-- ---------------------------------------------------------------------
-- 1 + 2b. Học kỳ: nằm trong năm học, ordinal theo mã; chặn xóa khi còn bảng điểm / GPA / mục tiêu học tập
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_semesters_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_what text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT x.label INTO v_what FROM (
      SELECT 1 AS o, 'bảng điểm' AS label WHERE EXISTS (SELECT 1 FROM public.academic_records ar WHERE ar.semester_id = OLD.id)
      UNION ALL SELECT 2, 'kết quả GPA'      WHERE EXISTS (SELECT 1 FROM public.gpa_snapshots g WHERE g.as_of_semester_id = OLD.id)
      UNION ALL SELECT 3, 'mục tiêu học tập' WHERE EXISTS (SELECT 1 FROM public.study_goals sg WHERE sg.semester_id = OLD.id)
    ) x ORDER BY x.o LIMIT 1;
    IF v_what IS NOT NULL THEN
      RAISE EXCEPTION 'Đang có % dùng học kỳ "%" — không xóa được.', v_what, OLD.name USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN OLD;
  END IF;

  NEW.ordinal := CASE NEW.code WHEN 'HK1' THEN 1 WHEN 'HK2' THEN 2 WHEN 'HE' THEN 3 ELSE NEW.ordinal END;
  SELECT * INTO v_year FROM public.academic_years y WHERE y.id = NEW.academic_year_id;
  IF FOUND AND (NEW.starts_on < v_year.starts_on OR NEW.ends_on > v_year.ends_on) THEN
    RAISE EXCEPTION 'Học kỳ "%" phải nằm trong năm học "%" (từ % đến %).', NEW.name, v_year.name,
      to_char(v_year.starts_on, 'DD/MM/YYYY'), to_char(v_year.ends_on, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_semesters_guard() IS
  'BEFORE INSERT/UPDATE semesters: ordinal theo mã (HK1=1, HK2=2, HE=3), học kỳ nằm trong năm học. BEFORE DELETE: chặn xóa khi còn bảng điểm, GPA (FK CASCADE) hoặc mục tiêu học tập (FK CASCADE) gắn học kỳ.';

DROP TRIGGER IF EXISTS trg_semesters__guard ON public.semesters;
CREATE TRIGGER trg_semesters__guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION app.tg_semesters_guard();

-- ---------------------------------------------------------------------
-- 3. Trường đại học: không xóa mềm trường đang được dùng (gợi ý "Tạm ẩn")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_universities_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_what text;
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT x.label INTO v_what FROM (
      SELECT 1 AS o, 'hồ sơ sinh viên' AS label WHERE EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.university_id = OLD.id)
      UNION ALL SELECT 2, 'bảng điểm'          WHERE EXISTS (SELECT 1 FROM public.academic_records ar WHERE ar.university_id = OLD.id)
      UNION ALL SELECT 3, 'môn học'            WHERE EXISTS (SELECT 1 FROM public.courses c WHERE c.university_id = OLD.id)
      UNION ALL SELECT 4, 'thang điểm riêng'   WHERE EXISTS (SELECT 1 FROM public.grade_scales g WHERE g.university_id = OLD.id)
    ) x ORDER BY x.o LIMIT 1;
    IF v_what IS NOT NULL THEN
      RAISE EXCEPTION 'Trường "%" đang được dùng trong % — không xóa được. Hãy chọn "Tạm ẩn" để không hiện trong danh sách chọn.', OLD.name, v_what
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_universities_delete_guard() IS
  'BEFORE UPDATE OF deleted_at universities: chặn xóa mềm trường đang có hồ sơ sinh viên, bảng điểm, môn học hoặc thang điểm riêng (RLS ẩn trường đã xóa ⇒ tên trường biến mất khỏi dữ liệu cũ). Dùng is_active = false để tạm ẩn.';

DROP TRIGGER IF EXISTS trg_universities__delete_guard ON public.universities;
CREATE TRIGGER trg_universities__delete_guard
  BEFORE UPDATE OF deleted_at ON public.universities
  FOR EACH ROW EXECUTE FUNCTION app.tg_universities_delete_guard();

-- ---------------------------------------------------------------------
-- 4. Mức sử dụng (chỉ số đếm) cho màn hình quản trị danh mục học tập
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_academic_lookup_usage()
RETURNS TABLE (entity text, id uuid, refs bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL OR NOT (app.has_permission('term.manage') OR app.has_permission('academic.university.manage')
                                           OR app.has_permission('academic.scale.manage')) THEN
    RAISE EXCEPTION 'Chỉ người quản lý danh mục học tập (năm học/nhiệm kỳ hoặc danh mục trường) xem được mức sử dụng.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT 'university'::text, u.id,
           ((SELECT count(*) FROM public.student_profiles sp WHERE sp.university_id = u.id)
          + (SELECT count(*) FROM public.academic_records ar WHERE ar.university_id = u.id)
          + (SELECT count(*) FROM public.courses c WHERE c.university_id = u.id)
          + (SELECT count(*) FROM public.grade_scales g WHERE g.university_id = u.id))::bigint
      FROM public.universities u
    UNION ALL
    SELECT 'semester'::text, s.id,
           ((SELECT count(*) FROM public.academic_records ar WHERE ar.semester_id = s.id)
          + (SELECT count(*) FROM public.gpa_snapshots g WHERE g.as_of_semester_id = s.id)
          + (SELECT count(*) FROM public.study_goals sg WHERE sg.semester_id = s.id))::bigint
      FROM public.semesters s
    UNION ALL
    SELECT 'academic_year'::text, y.id,
           ((SELECT count(*) FROM public.contribution_plans p WHERE p.academic_year_id = y.id)
          + (SELECT count(*) FROM public.financial_periods p WHERE p.academic_year_id = y.id)
          + (SELECT count(*) FROM public.room_assignments r WHERE r.academic_year_id = y.id)
          + (SELECT count(*) FROM public.duty_rosters r WHERE r.academic_year_id = y.id)
          + (SELECT count(*) FROM public.merit_entries m WHERE m.academic_year_id = y.id)
          + (SELECT count(*) FROM public.board_terms b WHERE b.academic_year_id = y.id)
          + (SELECT count(*) FROM public.academic_records ar JOIN public.semesters s ON s.id = ar.semester_id WHERE s.academic_year_id = y.id)
          + (SELECT count(*) FROM public.gpa_snapshots g JOIN public.semesters s ON s.id = g.as_of_semester_id WHERE s.academic_year_id = y.id)
          + (SELECT count(*) FROM public.study_goals sg JOIN public.semesters s ON s.id = sg.semester_id WHERE s.academic_year_id = y.id))::bigint
      FROM public.academic_years y
    UNION ALL
    SELECT 'board_term'::text, b.id,
           ((SELECT count(*) FROM public.member_positions mp WHERE mp.board_term_id = b.id)
          + (SELECT count(*) FROM public.user_roles ur WHERE ur.board_term_id = b.id))::bigint
      FROM public.board_terms b;
END
$$;
COMMENT ON FUNCTION app.fn_academic_lookup_usage() IS
  'Số bản ghi đang tham chiếu từng trường (hồ sơ sinh viên, bảng điểm, môn học, thang điểm), học kỳ (bảng điểm, GPA, mục tiêu), năm học (mọi dữ liệu theo năm + học kỳ của năm), nhiệm kỳ (chức vụ, vai trò). Chỉ số đếm cho màn hình Cài đặt → Danh mục học tập; cần term.manage, academic.university.manage hoặc academic.scale.manage.';

-- ---------------------------------------------------------------------
-- 6. Chủ sở hữu + quyền thực thi (INV-08: SECURITY DEFINER thuộc luuxa_definer; INV-14: không EXECUTE cho PUBLIC)
-- ---------------------------------------------------------------------
ALTER FUNCTION app.tg_academic_years_guard() OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_semesters_guard() OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_universities_delete_guard() OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_academic_lookup_usage() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_academic_years_guard(), app.tg_semesters_guard(), app.tg_universities_delete_guard(),
  app.fn_academic_lookup_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_academic_years_guard(), app.tg_semesters_guard(), app.tg_universities_delete_guard()
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_academic_lookup_usage() TO luuxa_app;

COMMIT;
