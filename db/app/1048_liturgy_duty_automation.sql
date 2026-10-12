-- =====================================================================
-- 1048 — CHECK-IN ĐI LỄ BỚT VIỆC TAY + NHẮC NGƯỜI TRỰC VỆ SINH ĐẦU TUẦN. Chạy SAU 1047. Idempotent.
--   1. Cấu hình liturgy.auto_approve_no_photo (mặc định BẬT, quyền ghi liturgy.calendar.manage như các khóa liturgy.*):
--      check-in của ngày KHÔNG cần ảnh minh chứng (Chúa Nhật; lễ trọng / Bổn mạng / ngày đặc biệt rơi vào Chúa Nhật; ngày đặc biệt
--      tắt "cần ảnh") được TỰ XÁC NHẬN ngay khi gửi. Vẫn chờ duyệt tay khi:
--        • ngày đó cần ảnh minh chứng (lễ trọng / Bổn mạng ngày thường, ngày đặc biệt bật "cần ảnh");
--        • có kèm ảnh mà ảnh bị cảnh báo: giống ảnh của người khác cùng ngày (pHash, Hamming ≤ 6) hoặc chụp không đúng dịp lễ (EXIF);
--        • người check-in gửi lại sau khi bị đánh dấu "chưa hợp lệ" (quyết định của người duyệt không bị lách qua).
--      Cột mass_checkins.auto_approved đánh dấu bản được hệ thống tự xác nhận (reviewed_by NULL). Chính chủ được hủy bản tự xác nhận
--      của mình (vd. bấm nhầm) — ứng dụng chỉ cho trong hạn check-in.
--      Luật ngày nào cần ảnh GIỮ ĐỒNG BỘ với requirementFor() ở src/server/modules/liturgy-calendar.ts.
--   2. app.tg_mass_checkins_rules (bản 1000) được thay bằng bản có bước tự xác nhận; mọi luật cũ giữ nguyên.
--   3. app.fn_duty_week_start_notify(tuần): sáng Thứ Hai (bước cron duty-monday) báo TRONG ỨNG DỤNG cho từng người trực tuần đó
--      ("Tuần này bạn trực vệ sinh sân nhà… Bạn trực cùng …"), chống gửi trùng bằng khóa system_post_log
--      "duty-monday:<Thứ Hai>:<thành viên>" ghi CÙNG giao dịch với thông báo (lỗi giữa chừng ⇒ lượt sau gửi lại).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cấu hình
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('liturgy.auto_approve_no_photo', 'true'::jsonb, 'boolean',
   'Check-in đi lễ của ngày không cần ảnh minh chứng (Chúa Nhật…) được tự xác nhận ngay khi gửi; ngày cần ảnh, ảnh bị cảnh báo trùng/sai ngày hoặc gửi lại sau khi bị từ chối vẫn chờ Ban Phụng vụ duyệt.',
   NULL, NULL, true, 'liturgy.calendar.manage', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Cột đánh dấu tự xác nhận
-- ---------------------------------------------------------------------
ALTER TABLE public.mass_checkins ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.mass_checkins.auto_approved IS
  'true = hệ thống tự xác nhận khi gửi (ngày không cần ảnh, cấu hình liturgy.auto_approve_no_photo bật) — reviewed_by NULL. Người duyệt đổi kết quả ⇒ false. Chỉ trigger đặt (luuxa_app không có quyền ghi cột này).';
CREATE INDEX IF NOT EXISTS ix_mass_checkins__pending ON public.mass_checkins (day_date) WHERE status = 'submitted';

-- ---------------------------------------------------------------------
-- 3. Hàm phụ (SECURITY DEFINER: đọc ảnh / check-in của người khác dưới FORCE RLS để so ảnh trùng)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_mass_checkin_needs_photo(p_occasion text, p_day date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE
           WHEN p_occasion = 'sunday' OR extract(isodow FROM p_day) = 7 THEN false
           WHEN p_occasion LIKE 'special:%' THEN COALESCE((SELECT s.evidence_required FROM public.liturgy_special_days s
                                                           WHERE s.id::text = substr(p_occasion, 9)), true)
           ELSE true
         END
$$;
COMMENT ON FUNCTION app.fn_mass_checkin_needs_photo(text, date) IS
  'Ngày lễ (dịp p_occasion, ngày p_day) có cần ảnh minh chứng không: Chúa Nhật và mọi dịp rơi vào Chúa Nhật ⇒ không; ngày đặc biệt ⇒ theo evidence_required; lễ trọng / Bổn mạng ngày thường ⇒ có. Đồng bộ với requirementFor() (liturgy-calendar.ts).';

CREATE OR REPLACE FUNCTION app.fn_mass_checkin_photo_flag(p_member uuid, p_day date, p_file uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_f     public.storage_files%ROWTYPE;
  v_grace integer;
  v_taken date;
BEGIN
  IF p_file IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_f FROM public.storage_files f WHERE f.id = p_file AND f.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;
  -- Ảnh gần giống ảnh check-in của NGƯỜI KHÁC cùng ngày lễ (cùng ngưỡng với màn hình duyệt)
  IF v_f.phash IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.mass_checkins c JOIN public.storage_files f2 ON f2.id = c.evidence_file_id
        WHERE c.day_date = p_day AND c.member_id IS DISTINCT FROM p_member AND f2.id <> v_f.id AND f2.phash IS NOT NULL
          AND bit_count((f2.phash # v_f.phash)::bit(64)) <= 6) THEN
    RETURN 'duplicate';
  END IF;
  -- Ảnh chụp ngoài khoảng [hôm trước lễ (lễ vọng) … hạn check-in]
  IF v_f.taken_at IS NOT NULL THEN
    SELECT COALESCE((s.value #>> '{}')::integer, 2) INTO v_grace FROM public.settings s WHERE s.key = 'liturgy.checkin_grace_days';
    v_taken := app.local_date(v_f.taken_at);
    IF v_taken < p_day - 1 OR v_taken > p_day + COALESCE(v_grace, 2) THEN
      RETURN 'wrong_date';
    END IF;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.fn_mass_checkin_photo_flag(uuid, date, uuid) IS
  'Cảnh báo cho ảnh check-in đi lễ: duplicate (giống ảnh của người khác cùng ngày, pHash Hamming ≤ 6), wrong_date (EXIF chụp ngoài [ngày lễ − 1 … hạn check-in]), missing (không thấy tệp); NULL = không có gì bất thường. Cùng luật với màn hình duyệt (attendanceFor ở liturgy-calendar.ts).';

CREATE OR REPLACE FUNCTION app.fn_mass_checkin_auto_ok(p_member uuid, p_day date, p_occasion text, p_file uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_on boolean;
BEGIN
  SELECT CASE WHEN jsonb_typeof(s.value) = 'boolean' THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_on FROM public.settings s WHERE s.key = 'liturgy.auto_approve_no_photo';
  IF NOT COALESCE(v_on, false) THEN
    RETURN false;
  END IF;
  IF app.fn_mass_checkin_needs_photo(p_occasion, p_day) THEN
    RETURN false;
  END IF;
  RETURN p_file IS NULL OR app.fn_mass_checkin_photo_flag(p_member, p_day, p_file) IS NULL;
END
$$;
COMMENT ON FUNCTION app.fn_mass_checkin_auto_ok(uuid, date, text, uuid) IS
  'Check-in đi lễ này có được tự xác nhận không: cấu hình liturgy.auto_approve_no_photo bật + ngày không cần ảnh + (không kèm ảnh hoặc ảnh không bị cảnh báo).';

-- ---------------------------------------------------------------------
-- 4. Quy tắc ghi mass_checkins (thay bản 1000: thêm bước tự xác nhận + cột auto_approved; luật cũ giữ nguyên)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_mass_checkins_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_file    public.storage_files%ROWTYPE;
  v_manager boolean := app.has_permission('liturgy.calendar.manage');
  v_me      uuid    := app.current_member_id();
  v_auto    boolean := false; -- bản này vừa được gửi (mới / chính chủ gửi lại) ⇒ xét tự xác nhận
BEGIN
  NEW.church := NULLIF(btrim(COALESCE(NEW.church, '')), '');
  NEW.note   := NULLIF(btrim(COALESCE(NEW.note, '')), '');
  IF TG_OP = 'INSERT' THEN
    IF app.current_user_id() IS NOT NULL THEN
      NEW.member_id := v_me;
      IF v_me IS NULL THEN
        RAISE EXCEPTION 'Tài khoản chưa gắn với hồ sơ thành viên nên không check-in được.' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    IF NEW.day_date > app.local_today() + 1 THEN
      RAISE EXCEPTION 'Chưa đến ngày lễ này — chỉ check-in từ chiều hôm trước (lễ vọng) trở đi.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.status := 'submitted'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL;
    NEW.auto_approved := false;
    NEW.checked_in_at := now();
    NEW.version := 1;
    v_auto := true;
  ELSE
    NEW.day_date  := OLD.day_date;
    NEW.member_id := OLD.member_id;
    NEW.created_at := OLD.created_at;
    IF app.current_user_id() IS NOT NULL AND NOT (v_manager AND OLD.member_id IS DISTINCT FROM v_me) THEN
      -- Chính chủ sửa (bổ sung ảnh, nhà thờ, ghi chú) ⇒ quay về chờ duyệt; không tự duyệt cho mình
      IF NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id OR NEW.church IS DISTINCT FROM OLD.church OR NEW.note IS DISTINCT FROM OLD.note THEN
        NEW.status := 'submitted'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL;
        NEW.auto_approved := false;
        NEW.checked_in_at := now();
        -- Đã bị người duyệt đánh dấu "chưa hợp lệ" ⇒ lần gửi lại phải duyệt tay
        v_auto := OLD.status <> 'rejected';
      ELSE
        NEW.status := OLD.status; NEW.reviewed_by := OLD.reviewed_by; NEW.reviewed_at := OLD.reviewed_at; NEW.review_note := OLD.review_note;
        NEW.auto_approved := OLD.auto_approved;
      END IF;
    ELSE
      -- Người duyệt (hoặc tiến trình hệ thống): chỉ đổi kết quả duyệt
      NEW.evidence_file_id := OLD.evidence_file_id; NEW.church := OLD.church; NEW.note := OLD.note; NEW.occasion := OLD.occasion;
      NEW.checked_in_at := OLD.checked_in_at;
      NEW.auto_approved := OLD.auto_approved;
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
        IF NEW.status = 'submitted' THEN
          NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL;
        ELSE
          NEW.reviewed_by := app.current_user_id(); NEW.reviewed_at := now();
          NEW.review_note := NULLIF(btrim(COALESCE(NEW.review_note, '')), '');
        END IF;
        NEW.auto_approved := false;
      END IF;
    END IF;
  END IF;

  -- Ảnh minh chứng gắn mới: ảnh đã tải xong, do chính người check-in tải lên
  IF NEW.evidence_file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id) THEN
    SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.evidence_file_id AND f.deleted_at IS NULL;
    IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
      RAISE EXCEPTION 'Ảnh minh chứng không tồn tại (hoặc không phải ảnh của bạn), chưa tải lên xong hoặc đã bị xóa.' USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(v_file.detected_mime, v_file.declared_mime, '') NOT LIKE 'image/%' THEN
      RAISE EXCEPTION 'Minh chứng đi lễ phải là ảnh (JPEG, PNG hoặc WebP).' USING ERRCODE = 'check_violation';
    END IF;
    IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'Chỉ được dùng ảnh do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Tự xác nhận: ngày không cần ảnh + cấu hình bật + ảnh (nếu có) không bị cảnh báo
  IF v_auto AND app.fn_mass_checkin_auto_ok(NEW.member_id, NEW.day_date, NEW.occasion, NEW.evidence_file_id) THEN
    NEW.status := 'approved';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := now();
    NEW.review_note := NULL;
    NEW.auto_approved := true;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_mass_checkins_rules() IS
  'BEFORE INSERT/UPDATE mass_checkins (bản 1048): chủ thể = thành viên đang đăng nhập; không check-in trước ngày lễ quá một ngày (lễ vọng chiều hôm trước); chính chủ sửa ⇒ về chờ duyệt, không tự duyệt; người duyệt chỉ đổi kết quả duyệt (ghi người/giờ duyệt); ảnh minh chứng phải là ảnh đã tải xong do chính người check-in tải lên. Bản mới gửi (hoặc gửi lại khi chưa bị từ chối) của ngày không cần ảnh được tự xác nhận khi app.fn_mass_checkin_auto_ok cho phép (auto_approved = true, reviewed_by NULL).';

-- Chính chủ hủy được check-in đang chờ duyệt, hoặc bản hệ thống tự xác nhận (vd. bấm nhầm) — bản người duyệt đã xác nhận thì không
DROP POLICY IF EXISTS mass_checkins__delete ON public.mass_checkins;
CREATE POLICY mass_checkins__delete ON public.mass_checkins FOR DELETE TO luuxa_app
  USING (member_id = (SELECT app.current_member_id()) AND (status = 'submitted' OR (status = 'approved' AND auto_approved)));

-- ---------------------------------------------------------------------
-- 5. Trực vệ sinh: báo người trực đầu tuần (bước cron duty-monday, luuxa_worker)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_duty_week_start_notify(p_week_start date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_week  public.duty_weeks%ROWTYPE;
  v_m     record;
  v_other text;
  v_label text;
  v_n     integer := 0;
BEGIN
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'Tuần trực phải bắt đầu từ Thứ Hai.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_week FROM public.duty_weeks w WHERE w.week_start = p_week_start;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  v_label := app.fn_duty_week_label(p_week_start);
  FOR v_m IN
    SELECT m.id FROM public.duty_week_members wm JOIN public.members m ON m.id = wm.member_id
     WHERE wm.week_id = v_week.id AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
     ORDER BY m.display_name
  LOOP
    INSERT INTO public.system_post_log (key, kind) VALUES ('duty-monday:' || p_week_start::text || ':' || v_m.id::text, 'daily')
    ON CONFLICT (key) DO NOTHING;
    IF NOT FOUND THEN
      CONTINUE; -- đã báo người này cho tuần này
    END IF;
    SELECT string_agg(m2.display_name, ' & ' ORDER BY m2.display_name) INTO v_other
      FROM public.duty_week_members wm2 JOIN public.members m2 ON m2.id = wm2.member_id
     WHERE wm2.week_id = v_week.id AND m2.id <> v_m.id AND m2.deleted_at IS NULL;
    PERFORM app.fn_notify(v_m.id, 'duty.week_reminder',
      'Tuần này bạn trực vệ sinh sân nhà (' || v_label || ')',
      CASE WHEN v_other IS NOT NULL THEN 'Bạn trực cùng ' || v_other || '. ' ELSE 'Tuần này bạn trực một mình. ' END
        || 'Nhớ dọn dẹp sân nhà trong tuần — Trưởng nhà đánh giá sau Chúa Nhật.'
        || COALESCE(' Ghi chú: ' || NULLIF(btrim(v_week.note), ''), ''),
      jsonb_build_object('link', '/hau-can?tab=truc-nhat'), 'duty_weeks', v_week.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_duty_week_start_notify(date) IS
  'Đầu tuần (bước cron duty-monday): thông báo trong ứng dụng cho từng người trực vệ sinh của tuần p_week_start (kèm tên bạn cùng trực + ghi chú). Mỗi (tuần, người) một lần — khóa system_post_log "duty-monday:<tuần>:<thành viên>" ghi cùng giao dịch. Trả về số người vừa được báo. Chỉ tiến trình nền (luuxa_worker) gọi.';

-- ---------------------------------------------------------------------
-- 6. Chủ sở hữu + quyền
-- ---------------------------------------------------------------------
ALTER FUNCTION app.fn_mass_checkin_needs_photo(text, date)            OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_mass_checkin_photo_flag(uuid, date, uuid)       OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_mass_checkin_auto_ok(uuid, date, text, uuid)    OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_mass_checkins_rules()                           OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_duty_week_start_notify(date)                    OWNER TO luuxa_definer;

REVOKE ALL ON FUNCTION app.fn_mass_checkin_needs_photo(text, date), app.fn_mass_checkin_photo_flag(uuid, date, uuid),
                       app.fn_mass_checkin_auto_ok(uuid, date, text, uuid), app.tg_mass_checkins_rules(),
                       app.fn_duty_week_start_notify(date) FROM PUBLIC;
-- Hàm phụ chạy trong trigger của luuxa_app ⇒ cấp cho luuxa_app (chỉ trả cờ đúng/sai, không lộ dữ liệu của người khác)
GRANT EXECUTE ON FUNCTION app.fn_mass_checkin_needs_photo(text, date), app.fn_mass_checkin_photo_flag(uuid, date, uuid),
                          app.fn_mass_checkin_auto_ok(uuid, date, text, uuid), app.tg_mass_checkins_rules()
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_duty_week_start_notify(date) TO luuxa_worker;

COMMIT;
