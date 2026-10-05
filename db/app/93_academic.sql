-- =====================================================================
-- 93 — Học tập: thao tác của NGƯỜI XÁC MINH khi kết quả không còn nhìn thấy được với họ.
--
-- Vì sao cần: với UPDATE có WHERE, PostgreSQL áp chính sách SELECT lên CẢ dòng mới. Chính sách
-- academic_records__select chỉ cho người có quyền (khác chính chủ) thấy bảng điểm 'submitted'/'verified',
-- nên phiên luuxa_app của Phó nhà/Trưởng nhà không thể tự UPDATE sang 'rejected' (trả lại, BR-ACAD-04)
-- hay 'draft' (mở lại bảng điểm đã xác minh, G-08/BR-ACAD-18) dù thiết kế cho phép — dòng mới "biến mất"
-- khỏi tầm nhìn ⇒ lỗi RLS. Hàm dưới đây làm đúng hai chuyển trạng thái đó sau khi tự kiểm:
--   • người gọi đăng nhập, có academic.verify, KHÔNG phải chính chủ (BR-ACAD-02);
--   • người gọi xem được bảng điểm theo đúng luật thiết kế (status submitted/verified + app.can_view_academic
--     = quyền academic.read_all VÀ chủ thể còn đồng ý academic_share_leadership);
--   • trạng thái nguồn hợp lệ; trả lại phải có lý do ≥ 5 ký tự.
-- Các trigger thiết kế (máy trạng thái, tg_academic_record_rules, audit, tính lại GPA) vẫn chạy như thường.
-- Xác minh (submitted → verified) KHÔNG cần hàm này: dòng mới vẫn nhìn thấy được nên API UPDATE trực tiếp dưới RLS.
-- Idempotent (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION app.fn_academic_review(p_record_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS record_status_t
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_rec    public.academic_records%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('reject', 'reopen') THEN
    RAISE EXCEPTION 'Thao tác duyệt bảng điểm không hợp lệ: %.', COALESCE(p_action, '(trống)') USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Lý do tối đa 500 ký tự.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_rec FROM public.academic_records ar WHERE ar.id = p_record_id FOR UPDATE;
  -- Không lộ sự tồn tại của bảng điểm mà người gọi không được xem
  IF NOT FOUND OR v_rec.status NOT IN ('submitted', 'verified') OR NOT app.can_view_academic(v_rec.member_id) THEN
    RAISE EXCEPTION 'Không tìm thấy bảng điểm hoặc bạn không được xem bảng điểm này.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.has_permission('academic.verify') THEN
    RAISE EXCEPTION 'Không có quyền xác minh bảng điểm.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app.is_self(v_rec.member_id) THEN
    RAISE EXCEPTION 'BR-ACAD-02: không được tự duyệt, trả lại hay mở lại bảng điểm của chính mình.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_action = 'reject' THEN
    IF v_rec.status <> 'submitted' THEN
      RAISE EXCEPTION 'Chỉ trả lại được bảng điểm đang chờ xác minh — bảng điểm đã xác minh hãy dùng "Mở lại".' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT app.has_text(v_reason, 5) THEN
      RAISE EXCEPTION 'Nhập lý do trả lại (tối thiểu 5 ký tự) để thành viên biết cần sửa gì.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.academic_records SET status = 'rejected', reject_reason = v_reason WHERE id = p_record_id;
    RETURN 'rejected';
  END IF;

  -- reopen: submitted|verified → draft (tg_academic_record_rules xóa mốc nộp/xác minh, kiểm academic.verify khi nguồn là verified)
  UPDATE public.academic_records SET status = 'draft', reject_reason = v_reason WHERE id = p_record_id;
  RETURN 'draft';
END
$$;
COMMENT ON FUNCTION app.fn_academic_review(uuid, text, text) IS
  'Người xác minh (academic.verify, khác chính chủ, xem được bảng điểm theo app.can_view_academic) trả lại bảng điểm đang chờ (reject, cần lý do ≥ 5 ký tự) hoặc mở lại về nháp (reopen, từ submitted/verified). Cần hàm vì dòng kết quả rejected/draft không còn nằm trong chính sách SELECT của người xác minh nên UPDATE trực tiếp dưới RLS bị chặn. Máy trạng thái, luật G-08/BR-ACAD-18, audit và tính lại GPA vẫn do trigger thiết kế đảm nhiệm.';

ALTER FUNCTION app.fn_academic_review(uuid, text, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_academic_review(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_academic_review(uuid, text, text) TO luuxa_app;
