-- =====================================================================
-- 996 — AI NHẬN XÉT THU CHI & HỌC TẬP. Chạy SAU 01–52 + 70–75 + 90…99x. Idempotent.
--   • finance.monthly_insight — nhận xét thu chi một tháng so với tháng trước. Chỉ gửi số liệu TỔNG HỢP của quỹ
--     (tổng thu/chi, hạng mục, số dư, số người đã/chưa đóng quỹ, vài khoản chi lớn đã che tên) — không tên người.
--   • academic.insight — nhận xét điểm của CHÍNH MÌNH, so với năm học trước. Cần đồng ý ai_academic_summary: chỉ gửi
--     điểm trung bình/tín chỉ/số môn theo học kỳ, đã ẩn danh (không tên, không trường, không mã sinh viên).
--   • academic.house_insight — nhận xét tình hình học tập CHUNG của nhà (Ban điều hành, academic.read_aggregate): chỉ số
--     liệu tổng hợp ẩn danh theo học kỳ, học kỳ nào có < 3 bảng điểm thì bỏ (k-anonymity).
--     Tách thành mã riêng vì cổng AI (vá E-013 + trg_ai_jobs__a_input_guard) luôn gán chủ thể dữ liệu = người gọi khi
--     job không gắn bản ghi: nếu dùng chung mã với academic.insight thì Trưởng nhà phải "đồng ý cho AI nhận xét điểm
--     của tôi" mới xem được thống kê toàn nhà — sai ý nghĩa đồng ý. Thống kê toàn nhà không chứa dữ liệu của riêng ai.
--   • Mọi tác vụ mới mặc định TẮT (is_enabled = false — smoke test khẳng định mọi tác vụ AI tắt khi mới cài):
--     người có quyền ai.manage bật ở Cài đặt → Trợ lý AI.
--   • Nhận xét là kết quả RIÊNG của người yêu cầu: chính sách RESTRICTIVE trên ai_suggestions — người duyệt AI
--     (ai.review/ai.manage) không đọc được nhận xét điểm số/thu chi của người khác qua hàng chờ gợi ý.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Mục đích đồng ý mới (điểm số là dữ liệu nhạy cảm; cần người giám hộ nếu chưa thành niên)
-- ---------------------------------------------------------------------
INSERT INTO consent_purposes (code, name_vi, description, legal_basis, is_sensitive, is_required, needs_guardian_if_minor, retention_days)
VALUES ('ai_academic_summary', 'Dùng AI nhận xét điểm học tập của tôi',
        'Cho phép gửi điểm trung bình và số môn theo học kỳ ĐÃ ẨN DANH (không tên, không trường, không mã sinh viên) tới dịch vụ AI bên ngoài để nhận nhận xét cho riêng tôi.',
        'consent', true, false, true, 180)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Ba tác vụ AI mới (mặc định tắt)
-- ---------------------------------------------------------------------
INSERT INTO ai_task_types (code, name_vi, description, technique, model_tier, data_class, required_consent_purpose,
                           human_review_required, external_call_allowed, monthly_budget_vnd)
VALUES
  ('finance.monthly_insight', 'Nhận xét thu chi theo tháng',
   'Tóm tắt và so sánh thu chi của tháng với tháng trước (tổng thu/chi, hạng mục, số dư, tình hình đóng quỹ) — chỉ gửi số liệu tổng hợp của quỹ, không tên người; số tiền do hệ thống tính.',
   'llm', 'small', 'internal_ok', NULL, false, true, 50000),
  ('academic.insight', 'Nhận xét kết quả học tập',
   'Nhận xét điểm của chính mình theo học kỳ, so với năm học trước — cần thành viên đồng ý; chỉ gửi điểm trung bình, tín chỉ, số môn đã ẩn danh (không tên, trường, mã sinh viên).',
   'llm', 'small', 'mask_required', 'ai_academic_summary', false, true, 50000),
  ('academic.house_insight', 'Nhận xét học tập toàn nhà',
   'Nhận xét tình hình học tập chung của nhà theo học kỳ, so với năm học trước — chỉ số liệu tổng hợp ẩn danh, bỏ học kỳ có dưới 3 bảng điểm; dành cho Ban điều hành.',
   'llm', 'small', 'mask_required', NULL, false, true, 30000)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Thống kê học tập toàn nhà theo học kỳ cho nhận xét AI (tổng hợp ẩn danh, k ≥ 3)
--    Mở rộng app.fn_academic_aggregate: nhiều học kỳ một lần, thêm GPA hệ 10 và phân bố xếp loại (tác vụ academic.house_insight).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_ai_academic_house_stats(p_year_ids uuid[])
RETURNS TABLE (semester_id uuid, semester_code text, semester_name text, year_id uuid, year_code text, starts_on date,
               students integer, avg_gpa4 numeric, avg_gpa10 numeric, rank_counts jsonb,
               students_with_failed integer, failed_courses integer, scholarship integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('academic.read_aggregate') THEN
    RAISE EXCEPTION 'Không có quyền xem thống kê học tập tổng hợp.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_year_ids IS NULL OR cardinality(p_year_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_year_ids) > 4 THEN
    RAISE EXCEPTION 'Tối đa 4 năm học mỗi lần.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
  SELECT s.id, s.code, s.name, y.id, y.code, s.starts_on,
         COUNT(*)::integer,
         round(AVG(g.gpa4), 2),
         round(AVG(g.gpa10), 2),
         COALESCE((SELECT jsonb_object_agg(x.lbl, x.n)
                     FROM (SELECT COALESCE(g2.rank_label, 'Chưa xếp loại') AS lbl, COUNT(*)::integer AS n
                             FROM public.gpa_snapshots g2
                            WHERE g2.scope = 'semester' AND g2.as_of_semester_id = s.id
                            GROUP BY 1) x), '{}'::jsonb),
         (COUNT(*) FILTER (WHERE g.failed_courses > 0))::integer,
         COALESCE(SUM(g.failed_courses), 0)::integer,
         (COUNT(*) FILTER (WHERE ar.has_scholarship))::integer
    FROM public.gpa_snapshots g
    JOIN public.semesters s ON s.id = g.as_of_semester_id
    JOIN public.academic_years y ON y.id = s.academic_year_id
    JOIN public.academic_records ar ON ar.member_id = g.member_id AND ar.semester_id = g.as_of_semester_id
   WHERE g.scope = 'semester' AND s.academic_year_id = ANY (p_year_ids)
   GROUP BY s.id, s.code, s.name, y.id, y.code, s.starts_on
  HAVING COUNT(*) >= 3
   ORDER BY s.starts_on;
END
$$;
COMMENT ON FUNCTION app.fn_ai_academic_house_stats(uuid[]) IS
  'Thống kê học tập TỔNG HỢP ẩn danh theo học kỳ của các năm học cho trước (tối đa 4): số bảng điểm có GPA, GPA trung bình hệ 4/hệ 10, phân bố xếp loại, số người có môn chưa đạt, tổng số môn chưa đạt, số người có học bổng. Chỉ trả học kỳ có ≥ 3 bảng điểm (k-anonymity) và chỉ cho người có academic.read_aggregate. Dùng cho tác vụ AI academic.house_insight — không có tên, trường hay mã sinh viên.';

ALTER FUNCTION app.fn_ai_academic_house_stats(uuid[]) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_ai_academic_house_stats(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_ai_academic_house_stats(uuid[]) TO luuxa_app;

-- ---------------------------------------------------------------------
-- 4. Nhận xét AI chỉ người yêu cầu đọc được (chính sách RESTRICTIVE: AND với các chính sách SELECT sẵn có).
--    Không ảnh hưởng tác vụ khác: gợi ý kiểm duyệt/sự cố/biên bản… vẫn vào hàng chờ của người duyệt như cũ.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS ai_suggestions__insight_owner_only ON ai_suggestions;
CREATE POLICY ai_suggestions__insight_owner_only ON ai_suggestions AS RESTRICTIVE FOR SELECT TO luuxa_app
  USING (task_code NOT IN ('finance.monthly_insight', 'academic.insight', 'academic.house_insight')
         OR EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = ai_suggestions.job_id AND j.requested_by = (SELECT app.current_user_id())));

COMMIT;
