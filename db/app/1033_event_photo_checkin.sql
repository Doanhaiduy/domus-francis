-- =====================================================================
-- 1033 — ĐIỂM DANH SỰ KIỆN BẰNG ẢNH (thay cho QR). Chạy SAU 1032. Idempotent.
--   • Thành viên chụp ảnh gửi lại là được điểm danh (không cần mã QR/mã 6 số/định vị/mã thiết bị): kiểu ghi nhận mới 'photo'
--     + cột attendance_records.evidence_file_id (ảnh minh chứng). Giờ ghi nhận là GIỜ MÁY CHỦ; có mặt/đi muộn do trigger tính theo late_grace_minutes
--     như trước; chỉ trong cửa sổ điểm danh của sự kiện; đúng danh sách mời; mỗi người một dòng mỗi sự kiện.
--   • app.fn_checkin_by_photo(event, file): SECURITY DEFINER (thành viên vẫn KHÔNG tự INSERT dòng điểm danh — BR-EVT-17). Ảnh phải là ảnh
--     đã tải xong do CHÍNH người điểm danh tải lên (ảnh bị xóa EXIF/GPS ở máy chủ khi lưu).
--   • Ban tổ chức / người có quyền điểm danh xem được ảnh (chính sách storage_files); người ghi hộ vẫn đổi được trạng thái (manual).
--   • QR cũ: bảng qr_sessions và các hàm fn_checkin_by_qr/by_code GIỮ NGUYÊN trong DB (không xóa dữ liệu), nhưng ứng dụng không còn dùng.
-- =====================================================================
BEGIN;

ALTER TYPE public.attendance_method_t ADD VALUE IF NOT EXISTS 'photo';

ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS evidence_file_id uuid REFERENCES public.storage_files(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.attendance_records.evidence_file_id IS 'Ảnh điểm danh (method = photo): ảnh chụp thành viên gửi lại làm minh chứng có mặt.';
CREATE INDEX IF NOT EXISTS ix_attendance_records__evidence_file_id ON public.attendance_records (evidence_file_id) WHERE evidence_file_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Luật điểm danh: 'photo' được xử lý như 'qr' (giờ máy chủ + cửa sổ điểm danh + có mặt/đi muộn). Thay thế hàm trong 34_fn_events.sql.
-- ---------------------------------------------------------------------
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
    RAISE EXCEPTION 'BR-EVT-17: không có kiểu điểm danh "tự xác nhận" — thành viên tự điểm danh bằng ảnh (app.fn_checkin_by_photo), ban tổ chức ghi hộ bằng kiểu manual.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ev.expected_scope = 'invitees' AND NOT EXISTS (
       SELECT 1 FROM public.event_participants p WHERE p.event_id = NEW.event_id AND p.member_id = NEW.member_id AND p.is_invited) THEN
    RAISE EXCEPTION 'Thành viên không thuộc danh sách mời của sự kiện.' USING ERRCODE = 'check_violation';
  END IF;

  v_open  := COALESCE(v_ev.attendance_open_minutes, app.setting_int('event.attendance.open_minutes_before'));
  v_grace := COALESCE(v_ev.late_grace_minutes, app.setting_int('event.attendance.late_grace_minutes'));

  IF NEW.method IN ('qr', 'self', 'photo') THEN
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
COMMENT ON FUNCTION app.tg_attendance_rules() IS 'BEFORE INSERT/UPDATE attendance_records (BR-EVT-01..03): sự kiện phải bật điểm danh và còn mở; đối tượng thuộc danh sách mời; qr/self/photo lấy GIỜ MÁY CHỦ và tự tính present/late theo late_grace_minutes; manual cần quyền hoặc là ban tổ chức.';

-- ---------------------------------------------------------------------
-- Thành viên tự điểm danh bằng ảnh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_checkin_by_photo(p_event_id uuid, p_file_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_member uuid := app.current_member_id();
  v_user   uuid := app.current_user_id();
  v_file   public.storage_files%ROWTYPE;
  v_id     uuid;
BEGIN
  IF v_member IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'Phải đăng nhập bằng tài khoản thành viên để điểm danh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_event_id IS NULL OR p_file_id IS NULL THEN
    RAISE EXCEPTION 'Hãy chụp ảnh điểm danh trước khi gửi.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_file FROM public.storage_files f WHERE f.id = p_file_id AND f.deleted_at IS NULL;
  IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
    RAISE EXCEPTION 'Không tìm thấy ảnh điểm danh (hoặc ảnh chưa tải lên xong) — vui lòng chụp và gửi lại.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_file.detected_mime, v_file.declared_mime, '') NOT LIKE 'image/%' THEN
    RAISE EXCEPTION 'Ảnh điểm danh phải là ảnh (JPEG, PNG hoặc WebP).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_file.uploaded_by IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Chỉ được dùng ảnh do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Trạng thái present chỉ là giá trị khởi tạo: trigger tg_attendance_rules đặt lại present/late theo giờ máy chủ + kiểm tra cửa sổ điểm danh
  INSERT INTO public.attendance_records (event_id, member_id, status, method, checked_in_at, evidence_file_id)
  VALUES (p_event_id, v_member, 'present', 'photo', now(), p_file_id)
  ON CONFLICT (event_id, member_id) DO UPDATE
     SET status = EXCLUDED.status, method = 'photo', checked_in_at = EXCLUDED.checked_in_at, evidence_file_id = EXCLUDED.evidence_file_id
   WHERE public.attendance_records.status IN ('absent', 'excused')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    -- Đã điểm danh trước đó (có mặt/đi muộn): giữ nguyên kết quả, không đổi giờ
    SELECT ar.id INTO v_id FROM public.attendance_records ar WHERE ar.event_id = p_event_id AND ar.member_id = v_member;
  ELSE
    UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now() WHERE id = p_file_id;
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_checkin_by_photo(uuid, uuid) IS
  'Điểm danh bằng ảnh: thành viên đang đăng nhập gửi ảnh do chính mình tải lên làm minh chứng có mặt. Giờ ghi nhận = giờ máy chủ; present/late do trigger tính; sự kiện phải bật điểm danh, đang trong cửa sổ điểm danh và thành viên thuộc danh sách mời. Idempotent: đã có mặt/đi muộn thì giữ nguyên. Trả về attendance_records.id.';

ALTER FUNCTION app.fn_checkin_by_photo(uuid, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_checkin_by_photo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_checkin_by_photo(uuid, uuid) TO luuxa_app, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- Ảnh điểm danh: chính chủ + người điểm danh hộ/ban tổ chức/người xem toàn bộ điểm danh xem được (các chính sách SELECT permissive được OR với nhau)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS storage_files__select__attendance_photos ON public.storage_files;
CREATE POLICY storage_files__select__attendance_photos ON public.storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.attendance_records a
     WHERE a.evidence_file_id = storage_files.id
       AND ((SELECT app.is_self(a.member_id))
            OR (SELECT app.fn_can_record_attendance(a.event_id))
            OR (SELECT app.has_permission('event.attendance.read_all')))));

COMMIT;
