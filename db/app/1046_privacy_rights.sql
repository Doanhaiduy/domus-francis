-- =====================================================================
-- 1046 — QUYỀN RIÊNG TƯ: đồng ý Điều khoản theo phiên bản, yêu cầu về dữ liệu cá nhân, rút đồng ý hồ sơ Công giáo = xóa dữ liệu,
--        hạn lưu dữ liệu người đã rời nhà. Chạy sau 1045. Idempotent.
--   • Quyền privacy.manage (Trưởng nhà, Admin): xem + xử lý mọi yêu cầu về dữ liệu cá nhân (data_subject_requests), ẩn danh hóa hồ sơ người
--     đã rời nhà theo yêu cầu, nhận cảnh báo hồ sơ sắp được tự ẩn danh. RLS của bảng yêu cầu nhận privacy.manage HOẶC dsr.manage (quyền gốc
--     của thiết kế). luuxa_app chỉ INSERT (member_id, request_type, details) — người gửi không tự đặt trạng thái/hạn — và chỉ UPDATE
--     (status, completed_at, handled_by, resolution_note). dsr_type_t thêm 'other' (yêu cầu khác).
--   • Điều khoản sử dụng + Chính sách bảo mật theo PHIÊN BẢN: consent_purposes.current_version của terms_of_use / privacy_notice_ack = 102
--     (văn bản 1.2; quy ước major*100 + minor — ứng dụng so với LEGAL_VERSION ở src/content/legal.ts, đổi phiên bản ⇒ mọi người được hỏi lại).
--   • Đồng ý khi TỰ ĐĂNG KÝ: người đăng ký chưa có hồ sơ thành viên (consents.member_id NOT NULL) ⇒ bằng chứng lưu trên đơn
--     (member_applications.terms_version / terms_accepted_at / terms_ip / terms_user_agent — bất biến sau khi ghi) và trigger chuyển thành
--     2 dòng consents (method in_app, granted_at = lúc đăng ký, IP/trình duyệt lúc đăng ký) khi đơn được duyệt.
--   • Rút đồng ý hồ sơ Công giáo = XÓA dữ liệu: app.fn_withdraw_catholic_consent() (chính chủ) rút catholic_profile + catholic_share_leadership
--     rồi xóa catholic_profiles + member_sacraments của mình (luuxa_app không có quyền DELETE catholic_profiles). Nhật ký kiểm toán đã che
--     Tên Thánh, giáo xứ, linh mục quản xứ, nơi lãnh Bí tích.
--   • Hạn lưu người đã rời nhà: privacy.left_member_retention_days — 0 = TẮT (mặc định; bản vá 72 đặt 365 nhưng chưa từng có job chạy nên
--     đổi về 0 nếu chưa ai sửa, để không tự xóa dữ liệu khi người quản lý chưa chủ động bật). app.fn_apply_member_retention() thay bản 72:
--     0/trống ⇒ không làm gì; tối đa 50 hồ sơ mỗi lượt; chỉ hồ sơ 'left' (cựu thành viên 'alumni' giữ liên lạc thì không tự ẩn danh) VÀ đã
--     được báo trước cho người quản lý ≥ 7 ngày (bước cron privacy-retention báo trước 30 ngày, ghi khóa system_post_log
--     "privacy-retention-warn:<member_id>") — tránh ẩn danh hàng loạt ngay khi vừa bật thời hạn.
--   • app.fn_anonymize_member() thay bản 72 (giữ nguyên hành vi cũ + dọn thêm dữ liệu cá nhân ở các bảng có sau thiết kế): tài khoản nhận tiền,
--     hồ sơ cựu thành viên, mã sinh viên, liên kết Zalo/Telegram, thiết bị nhận thông báo đẩy, 2FA, nhật ký đăng nhập theo email/SĐT, IP và trình
--     duyệt của các phiên, nội dung đơn đăng ký, liên kết lịch cá nhân (nếu có); gỡ "đang dùng" (attached_at) của ảnh đại diện, ảnh QR, ảnh
--     điểm danh / check-in đi lễ, minh chứng học tập ⇒ tác vụ dọn tệp mồ côi xóa hẳn khỏi kho. KHÔNG đụng sổ quỹ, phiếu thu/chi, khoản đóng,
--     ủng hộ (nghĩa vụ chứng từ — bất biến); GIỮ bằng chứng đồng ý (đánh dấu rút) và yêu cầu dữ liệu. Quyền: privacy.manage hoặc dsr.manage
--     (tiến trình nền được phép).
--   • Loại thông báo: system.data_request thêm kênh web_push; mới system.privacy_retention (hồ sơ sắp / vừa được ẩn danh → người quản lý).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Quyền privacy.manage
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('privacy.manage', 'member', 'Xem và xử lý yêu cầu về dữ liệu cá nhân của thành viên (xem, sửa, xóa, rút đồng ý); ẩn danh hóa hồ sơ người đã rời nhà; nhận cảnh báo hồ sơ sắp được tự ẩn danh', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'privacy.manage' FROM public.roles r WHERE r.code IN ('house_head', 'admin')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- [2] Yêu cầu về dữ liệu cá nhân (data_subject_requests — bảng có sẵn của thiết kế)
-- ---------------------------------------------------------------------
ALTER TYPE public.dsr_type_t ADD VALUE IF NOT EXISTS 'other';

DROP POLICY IF EXISTS data_subject_requests__select ON public.data_subject_requests;
CREATE POLICY data_subject_requests__select ON public.data_subject_requests FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('privacy.manage')) OR (SELECT app.has_permission('dsr.manage')));
DROP POLICY IF EXISTS data_subject_requests__update ON public.data_subject_requests;
CREATE POLICY data_subject_requests__update ON public.data_subject_requests FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('privacy.manage')) OR (SELECT app.has_permission('dsr.manage')))
  WITH CHECK ((SELECT app.has_permission('privacy.manage')) OR (SELECT app.has_permission('dsr.manage')));
-- (chính sách INSERT gốc giữ nguyên: chỉ gửi yêu cầu cho CHÍNH MÌNH)

REVOKE INSERT, UPDATE, DELETE ON public.data_subject_requests FROM luuxa_app;
GRANT SELECT ON public.data_subject_requests TO luuxa_app;
GRANT INSERT (member_id, request_type, details) ON public.data_subject_requests TO luuxa_app;
GRANT UPDATE (status, completed_at, handled_by, resolution_note) ON public.data_subject_requests TO luuxa_app;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.data_subject_requests'::regclass AND conname = 'ck_dsr__text_len') THEN
    ALTER TABLE public.data_subject_requests ADD CONSTRAINT ck_dsr__text_len
      CHECK ((details IS NULL OR char_length(details) <= 2000) AND (resolution_note IS NULL OR char_length(resolution_note) <= 2000));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_data_subject_requests__open ON public.data_subject_requests (due_at) WHERE status IN ('received', 'in_progress');
CREATE INDEX IF NOT EXISTS ix_data_subject_requests__member_time ON public.data_subject_requests (member_id, received_at DESC);

-- ---------------------------------------------------------------------
-- [3] Loại thông báo
-- ---------------------------------------------------------------------
UPDATE public.notification_types
   SET default_channels = default_channels || ARRAY['web_push']::notification_channel_t[]
 WHERE code = 'system.data_request' AND NOT ('web_push'::notification_channel_t = ANY (default_channels));

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.privacy_retention', 'system', 'Hồ sơ người đã rời nhà sắp / vừa được ẩn danh', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- [4] Phiên bản Điều khoản sử dụng + Chính sách bảo mật (1.2 ⇒ 102)
-- ---------------------------------------------------------------------
UPDATE public.consent_purposes SET current_version = 102
 WHERE code IN ('terms_of_use', 'privacy_notice_ack') AND current_version < 102;
UPDATE public.consent_purposes
   SET description = 'Đồng ý Điều khoản sử dụng hệ thống (trang /dieu-khoan-su-dung). Phiên bản = văn bản (1.2 ⇒ 102); đổi văn bản ⇒ hỏi lại.'
 WHERE code = 'terms_of_use' AND description <> 'Đồng ý Điều khoản sử dụng hệ thống (trang /dieu-khoan-su-dung). Phiên bản = văn bản (1.2 ⇒ 102); đổi văn bản ⇒ hỏi lại.';
UPDATE public.consent_purposes
   SET description = 'Xác nhận đã đọc Chính sách bảo mật & bảo vệ dữ liệu cá nhân (trang /chinh-sach-bao-mat). Phiên bản = văn bản (1.2 ⇒ 102).'
 WHERE code = 'privacy_notice_ack' AND description <> 'Xác nhận đã đọc Chính sách bảo mật & bảo vệ dữ liệu cá nhân (trang /chinh-sach-bao-mat). Phiên bản = văn bản (1.2 ⇒ 102).';

-- ---------------------------------------------------------------------
-- [5] Bằng chứng đồng ý khi tự đăng ký (trên đơn) + chuyển thành consents khi duyệt
-- ---------------------------------------------------------------------
ALTER TABLE public.member_applications ADD COLUMN IF NOT EXISTS terms_version integer;
ALTER TABLE public.member_applications ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE public.member_applications ADD COLUMN IF NOT EXISTS terms_ip inet;
ALTER TABLE public.member_applications ADD COLUMN IF NOT EXISTS terms_user_agent text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.member_applications'::regclass AND conname = 'ck_member_applications__terms') THEN
    ALTER TABLE public.member_applications ADD CONSTRAINT ck_member_applications__terms
      CHECK ((terms_version IS NULL) = (terms_accepted_at IS NULL)
             AND (terms_version IS NULL OR terms_version >= 1)
             AND (terms_user_agent IS NULL OR char_length(terms_user_agent) <= 400));
  END IF;
END $$;
COMMENT ON COLUMN public.member_applications.terms_version IS
  'Phiên bản Điều khoản sử dụng + Chính sách bảo mật người đăng ký đã tick đồng ý (1.2 ⇒ 102). Chuyển thành 2 dòng consents khi đơn được duyệt.';
COMMENT ON COLUMN public.member_applications.terms_accepted_at IS 'Thời điểm tick đồng ý khi đăng ký (bằng chứng; bất biến).';
COMMENT ON COLUMN public.member_applications.terms_ip IS 'IP lúc đồng ý khi đăng ký (bằng chứng; bất biến).';
COMMENT ON COLUMN public.member_applications.terms_user_agent IS 'Trình duyệt lúc đồng ý khi đăng ký (bằng chứng; bất biến).';

-- Bằng chứng không sửa được sau khi đã ghi (kể cả người duyệt đơn)
CREATE OR REPLACE FUNCTION app.tg_member_applications_terms_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.terms_accepted_at IS NOT NULL
     AND (NEW.terms_version IS DISTINCT FROM OLD.terms_version OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
          OR NEW.terms_ip IS DISTINCT FROM OLD.terms_ip OR NEW.terms_user_agent IS DISTINCT FROM OLD.terms_user_agent) THEN
    RAISE EXCEPTION 'Bằng chứng đồng ý điều khoản khi đăng ký không được sửa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_member_applications_terms_guard() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_member_applications_terms_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_member_applications_terms_guard() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
DROP TRIGGER IF EXISTS trg_member_applications__terms_guard ON public.member_applications;
CREATE TRIGGER trg_member_applications__terms_guard BEFORE UPDATE ON public.member_applications
  FOR EACH ROW EXECUTE FUNCTION app.tg_member_applications_terms_guard();

-- Đơn được duyệt (đã có hồ sơ thành viên) ⇒ ghi 2 đồng ý theo bằng chứng trên đơn. SECURITY DEFINER: người duyệt (Phó nhà…) không cần quyền
-- ghi consents của người khác; consents.recorded_by = chính người đăng ký.
CREATE OR REPLACE FUNCTION app.tg_member_applications_terms_consents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.consents (member_id, purpose_code, policy_version, granted_at, method, ip, user_agent, recorded_by, evidence_note)
  SELECT NEW.resulting_member_id, cp.code, NEW.terms_version, NEW.terms_accepted_at, 'in_app', NEW.terms_ip, NEW.terms_user_agent, NEW.user_id,
         'Tick đồng ý Điều khoản sử dụng + Chính sách bảo mật khi tự đăng ký tài khoản (đơn ' || NEW.id::text || ')'
    FROM public.consent_purposes cp
   WHERE cp.code IN ('terms_of_use', 'privacy_notice_ack')
  ON CONFLICT (member_id, purpose_code) WHERE withdrawn_at IS NULL DO NOTHING;
  RETURN NULL;
END
$$;
ALTER FUNCTION app.tg_member_applications_terms_consents() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_member_applications_terms_consents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_member_applications_terms_consents() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.tg_member_applications_terms_consents() IS
  'AFTER UPDATE member_applications: đơn chuyển sang approved (đã có resulting_member_id) và có bằng chứng tick đồng ý khi đăng ký ⇒ ghi consents terms_of_use + privacy_notice_ack đúng phiên bản, thời điểm, IP, trình duyệt lúc đăng ký.';
DROP TRIGGER IF EXISTS trg_member_applications__terms_consents ON public.member_applications;
CREATE TRIGGER trg_member_applications__terms_consents AFTER UPDATE OF status ON public.member_applications
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.resulting_member_id IS NOT NULL AND NEW.terms_accepted_at IS NOT NULL)
  EXECUTE FUNCTION app.tg_member_applications_terms_consents();

-- ---------------------------------------------------------------------
-- [6] Rút đồng ý hồ sơ Công giáo = xóa dữ liệu Công giáo của chính mình
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_withdraw_catholic_consent()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me     uuid := app.current_member_id();
  v_n_cons integer;
  v_n_cath integer;
  v_n_sac  integer;
  v_out    jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chỉ thành viên đã được duyệt mới rút được đồng ý của mình.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.consents SET withdrawn_at = now()
   WHERE member_id = v_me AND purpose_code IN ('catholic_profile', 'catholic_share_leadership') AND withdrawn_at IS NULL;
  GET DIAGNOSTICS v_n_cons = ROW_COUNT;
  DELETE FROM public.member_sacraments WHERE member_id = v_me;
  GET DIAGNOSTICS v_n_sac = ROW_COUNT;
  DELETE FROM public.catholic_profiles WHERE member_id = v_me;
  GET DIAGNOSTICS v_n_cath = ROW_COUNT;
  v_out := jsonb_build_object('consents_withdrawn', v_n_cons, 'catholic_profiles_deleted', v_n_cath, 'sacraments_deleted', v_n_sac);
  PERFORM app.write_audit('STATE_CHANGE', 'catholic_profiles', v_me::text,
                          'Thành viên rút đồng ý lưu hồ sơ Công giáo — hệ thống đã xóa hồ sơ Công giáo và các Bí tích của người này', NULL, v_out);
  RETURN v_out;
END
$$;
ALTER FUNCTION app.fn_withdraw_catholic_consent() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_withdraw_catholic_consent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_withdraw_catholic_consent() TO luuxa_app;
COMMENT ON FUNCTION app.fn_withdraw_catholic_consent() IS
  'Chính chủ rút đồng ý lưu hồ sơ Công giáo: rút catholic_profile + catholic_share_leadership (giữ dòng bằng chứng, đặt withdrawn_at) và XÓA catholic_profiles + member_sacraments của chính mình; ghi audit STATE_CHANGE (chỉ số đếm).';

-- ---------------------------------------------------------------------
-- [7] Hạn lưu dữ liệu người đã rời nhà
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, default_value)
VALUES ('privacy.left_member_retention_days', '0'::jsonb, 'integer',
        'Số ngày giữ dữ liệu cá nhân sau ngày rời lưu xá (trạng thái left); quá hạn thì cron tối (bước privacy-retention) ẩn danh hóa bằng app.fn_apply_member_retention. 0 = tắt. Cựu thành viên (alumni) không tự ẩn danh.',
        0, 3650, false, '0'::jsonb)
ON CONFLICT (key) DO NOTHING;
UPDATE public.settings
   SET min_value = 0,
       description = 'Số ngày giữ dữ liệu cá nhân sau ngày rời lưu xá (trạng thái left); quá hạn thì cron tối (bước privacy-retention) ẩn danh hóa bằng app.fn_apply_member_retention. 0 = tắt. Cựu thành viên (alumni) không tự ẩn danh.'
 WHERE key = 'privacy.left_member_retention_days'
   AND (min_value IS DISTINCT FROM 0 OR description NOT LIKE '%0 = tắt%');
-- Bản vá 72 đặt 365 nhưng chưa từng có job áp dụng ⇒ giữ đúng hành vi thực tế (không tự xóa) cho tới khi người quản lý tự đặt số ngày
UPDATE public.settings SET value = '0'::jsonb, default_value = '0'::jsonb
 WHERE key = 'privacy.left_member_retention_days' AND updated_by IS NULL AND value = '365'::jsonb;
UPDATE public.settings SET default_value = '0'::jsonb
 WHERE key = 'privacy.left_member_retention_days' AND default_value IS DISTINCT FROM '0'::jsonb;

-- Ẩn danh hóa một hồ sơ đã rời nhà (thay bản vá 72 — giữ nguyên hành vi cũ, dọn thêm các bảng có sau thiết kế)
CREATE OR REPLACE FUNCTION app.fn_anonymize_member(p_member_id uuid, p_reason text, p_request_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_m          public.members%ROWTYPE;
  v_u_email    text;
  v_u_phone    text;
  v_anon_email text;
  v_files      uuid[];
  v_counts     jsonb;
  v_n_priv integer := 0; v_n_cath integer := 0; v_n_sac integer := 0; v_n_guard integer := 0; v_n_pray integer := 0;
  v_n_notif integer := 0; v_n_cons integer := 0; v_n_pay integer := 0; v_n_alumni integer := 0; v_n_student integer := 0;
  v_n_bind integer := 0; v_n_files integer := 0; v_n_push integer := 0; v_n_mfa integer := 0; v_n_login integer := 0;
  v_n_apps integer := 0; v_n_sess integer := 0;
BEGIN
  IF app.lacks_permission('privacy.manage') AND app.lacks_permission('dsr.manage') THEN
    RAISE EXCEPTION 'Không có quyền xử lý yêu cầu về dữ liệu cá nhân.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'BR-SEC-05: phải nêu căn cứ ẩn danh hóa (≥ 10 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_m FROM public.members m WHERE m.id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hồ sơ không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_m.status NOT IN ('left', 'alumni') THEN
    RAISE EXCEPTION 'BR-SEC-05: chỉ ẩn danh hóa hồ sơ đã rời lưu xá (hiện: %). Chuyển trạng thái rời trước.', v_m.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_m.full_name = '[Đã ẩn danh]' THEN
    RETURN jsonb_build_object('member_id', p_member_id, 'already_anonymized', true);
  END IF;

  -- Tệp ảnh/giấy tờ cá nhân: gỡ cờ "đang dùng" ⇒ tác vụ dọn tệp mồ côi đánh dấu xóa rồi xóa hẳn khỏi kho (không sửa các dòng nghiệp vụ)
  v_files := ARRAY(
    SELECT DISTINCT f FROM (
      SELECT v_m.avatar_file_id AS f
      UNION ALL SELECT pa.qr_file_id FROM public.member_payment_accounts pa WHERE pa.member_id = p_member_id
      UNION ALL SELECT mc.evidence_file_id FROM public.mass_checkins mc WHERE mc.member_id = p_member_id
      UNION ALL SELECT ar.evidence_file_id FROM public.attendance_records ar WHERE ar.member_id = p_member_id
      UNION ALL SELECT ma.file_id FROM public.media_attachments ma
                 WHERE (ma.entity_type = 'academic_record' AND ma.entity_id IN (SELECT r.id FROM public.academic_records r WHERE r.member_id = p_member_id))
                    OR (ma.entity_type = 'leave_request' AND ma.entity_id IN (SELECT l.id FROM public.leave_requests l WHERE l.member_id = p_member_id))
    ) x WHERE f IS NOT NULL);
  IF array_length(v_files, 1) > 0 THEN
    UPDATE public.storage_files SET attached_at = NULL, updated_at = now() WHERE id = ANY (v_files) AND attached_at IS NOT NULL;
    GET DIAGNOSTICS v_n_files = ROW_COUNT;
  END IF;

  UPDATE public.member_private_details
     SET birth_date = NULL, hometown = NULL, home_address = NULL,
         national_id_enc = NULL, national_id_bidx = NULL, national_id_last4 = NULL, national_id_key_version = NULL
   WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_priv = ROW_COUNT;
  DELETE FROM public.member_sacraments WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_sac = ROW_COUNT;
  DELETE FROM public.catholic_profiles WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_cath = ROW_COUNT;
  UPDATE public.member_guardians
     SET full_name = '[Đã ẩn danh]', phone_enc = NULL, phone_key_version = NULL, phone_last4 = NULL,
         deleted_at = COALESCE(deleted_at, now())
   WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_guard = ROW_COUNT;
  DELETE FROM public.prayer_intention_authors WHERE author_member_id = p_member_id;
  GET DIAGNOSTICS v_n_pray = ROW_COUNT;
  DELETE FROM public.notifications WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_notif = ROW_COUNT;
  DELETE FROM public.member_payment_accounts WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_pay = ROW_COUNT;
  DELETE FROM public.alumni_profiles WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_alumni = ROW_COUNT;
  UPDATE public.student_profiles SET student_code = NULL WHERE member_id = p_member_id AND student_code IS NOT NULL;
  GET DIAGNOSTICS v_n_student = ROW_COUNT;
  DELETE FROM public.member_channel_bindings WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_n_bind = ROW_COUNT;
  -- Bằng chứng đồng ý được GIỮ (G-10: không xóa) nhưng đánh dấu đã rút
  UPDATE public.consents SET withdrawn_at = now() WHERE member_id = p_member_id AND withdrawn_at IS NULL;
  GET DIAGNOSTICS v_n_cons = ROW_COUNT;
  -- Liên kết lịch cá nhân theo mã bí mật (bảng có thể chưa có ở môi trường cũ)
  IF to_regclass('public.calendar_feed_tokens') IS NOT NULL THEN
    BEGIN
      EXECUTE 'UPDATE public.calendar_feed_tokens SET revoked_at = now() WHERE member_id = $1 AND revoked_at IS NULL' USING p_member_id;
    EXCEPTION WHEN undefined_column OR undefined_table OR insufficient_privilege THEN NULL;
    END;
  END IF;

  UPDATE public.members
     SET full_name = '[Đã ẩn danh]', display_name = 'Cựu TV #' || member_no,
         contact_phone_e164 = NULL, contact_email = NULL, hide_phone = true, avatar_file_id = NULL, left_reason = NULL
   WHERE id = p_member_id;
  IF v_m.user_id IS NOT NULL THEN
    SELECT u.email::text, u.phone_e164 INTO v_u_email, v_u_phone FROM public.users u WHERE u.id = v_m.user_id;
    v_anon_email := 'an-danh-' || v_m.user_id::text || '@an-danh.invalid';
    UPDATE public.users
       SET email = v_anon_email, phone_e164 = NULL, status = 'disabled', password_hash = NULL
     WHERE id = v_m.user_id;
    UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'user_disabled'
     WHERE user_id = v_m.user_id AND revoked_at IS NULL;
    UPDATE public.auth_sessions SET ip = NULL, user_agent = NULL, device_label = NULL
     WHERE user_id = v_m.user_id AND (ip IS NOT NULL OR user_agent IS NOT NULL OR device_label IS NOT NULL);
    GET DIAGNOSTICS v_n_sess = ROW_COUNT;
    DELETE FROM public.push_subscriptions WHERE user_id = v_m.user_id;
    GET DIAGNOSTICS v_n_push = ROW_COUNT;
    DELETE FROM public.user_mfa_factors WHERE user_id = v_m.user_id;
    GET DIAGNOSTICS v_n_mfa = ROW_COUNT;
    DELETE FROM public.mfa_recovery_codes WHERE user_id = v_m.user_id;
    DELETE FROM public.login_attempts
     WHERE user_id = v_m.user_id
        OR (v_u_email IS NOT NULL AND identifier = lower(v_u_email))
        OR (v_u_phone IS NOT NULL AND identifier = v_u_phone);
    GET DIAGNOSTICS v_n_login = ROW_COUNT;
    UPDATE public.member_applications
       SET full_name = '[Đã ẩn danh]', email = v_anon_email, phone_e164 = NULL, university_name = NULL, message = NULL
     WHERE (user_id = v_m.user_id OR resulting_member_id = p_member_id) AND full_name <> '[Đã ẩn danh]';
    GET DIAGNOSTICS v_n_apps = ROW_COUNT;
  END IF;

  v_counts := jsonb_build_object('member_id', p_member_id, 'private_details', v_n_priv, 'catholic_profiles', v_n_cath,
                                 'sacraments', v_n_sac, 'guardians', v_n_guard, 'prayer_authorship', v_n_pray,
                                 'notifications', v_n_notif, 'consents_withdrawn', v_n_cons, 'payment_accounts', v_n_pay,
                                 'alumni_profiles', v_n_alumni, 'student_codes', v_n_student, 'channel_bindings', v_n_bind,
                                 'files_released', v_n_files, 'push_subscriptions', v_n_push, 'mfa_factors', v_n_mfa,
                                 'login_attempts', v_n_login, 'sessions_scrubbed', v_n_sess, 'applications', v_n_apps);
  IF p_request_id IS NOT NULL THEN
    UPDATE public.data_subject_requests
       SET status = 'completed', completed_at = now(), handled_by = app.current_user_id(),
           resolution_note = left('Đã ẩn danh hóa hồ sơ: xóa dữ liệu cá nhân (hồ sơ riêng tư, Công giáo, liên hệ, tài khoản nhận tiền, ảnh), khóa tài khoản đăng nhập; giữ sổ quỹ và chứng từ theo nghĩa vụ kế toán.', 1000)
     WHERE id = p_request_id AND member_id = p_member_id AND status IN ('received', 'in_progress');
  END IF;
  PERFORM app.write_audit('STATE_CHANGE', 'members', p_member_id::text, 'MEMBER_ANONYMIZED: ' || left(p_reason, 400), NULL, v_counts);
  RETURN v_counts;
END
$$;
ALTER FUNCTION app.fn_anonymize_member(uuid, text, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_anonymize_member(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_anonymize_member(uuid, text, uuid) TO luuxa_app, luuxa_worker;
COMMENT ON FUNCTION app.fn_anonymize_member(uuid, text, uuid) IS
  'BR-SEC-05/BR-MEM-15 (bản 1046): ẩn danh hóa hồ sơ đã rời lưu xá — xóa dữ liệu tầng 2/3, tài khoản nhận tiền, hồ sơ cựu thành viên, mã sinh viên, liên kết kênh nhắn tin, thông báo; thay tên/liên lạc; khóa tài khoản + xóa 2FA, thiết bị nhận thông báo, nhật ký đăng nhập theo email/SĐT, IP/trình duyệt của phiên; gỡ "đang dùng" của ảnh cá nhân để tác vụ dọn tệp xóa hẳn. GIỮ sổ quỹ/chứng từ, bằng chứng đồng ý (đánh dấu rút), yêu cầu dữ liệu. Đóng data_subject_requests nếu truyền p_request_id. Cần privacy.manage hoặc dsr.manage (tiến trình nền được phép). Idempotent.';

-- Áp hạn lưu: chỉ khi đã đặt số ngày (> 0); tối đa 50 hồ sơ mỗi lượt (bước cron tối privacy-retention)
CREATE OR REPLACE FUNCTION app.fn_apply_member_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_days integer;
  v_id   uuid;
  v_n    integer := 0;
BEGIN
  IF NOT app.is_system_caller() THEN
    RAISE EXCEPTION 'Chỉ tiến trình nền được chạy job thời hạn lưu trữ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT CASE WHEN jsonb_typeof(s.value) = 'number' THEN floor((s.value #>> '{}')::numeric)::integer END
    INTO v_days
    FROM public.settings s WHERE s.key = 'privacy.left_member_retention_days';
  IF v_days IS NULL OR v_days <= 0 THEN
    RETURN 0;
  END IF;
  FOR v_id IN
    SELECT m.id FROM public.members m
     WHERE m.status = 'left' AND m.full_name <> '[Đã ẩn danh]'
       AND m.left_on IS NOT NULL
       AND m.left_on < app.local_today() - v_days
       -- An toàn: chỉ ẩn danh hồ sơ đã được BÁO TRƯỚC cho người quản lý ít nhất 7 ngày (bước cron privacy-retention ghi khóa này khi báo;
       -- bình thường báo trước 30 ngày; lần đầu bật thời hạn thì những hồ sơ đã quá hạn được báo rồi 7 ngày sau mới ẩn danh)
       AND EXISTS (SELECT 1 FROM public.system_post_log l
                    WHERE l.key = 'privacy-retention-warn:' || m.id::text AND l.created_at <= now() - interval '7 days')
     ORDER BY m.left_on, m.id
     LIMIT 50
  LOOP
    PERFORM app.fn_anonymize_member(v_id, 'Hết thời hạn lưu dữ liệu sau khi rời lưu xá (' || v_days || ' ngày — privacy.left_member_retention_days)');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
ALTER FUNCTION app.fn_apply_member_retention() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_apply_member_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_apply_member_retention() TO luuxa_worker;
COMMENT ON FUNCTION app.fn_apply_member_retention() IS
  'Bản 1046: job hằng ngày (luuxa_worker, cron tối — bước privacy-retention) ẩn danh hóa hồ sơ trạng thái left đã rời quá privacy.left_member_retention_days ngày VÀ đã được báo trước cho người quản lý ≥ 7 ngày (khóa system_post_log "privacy-retention-warn:<member_id>"). Khóa cấu hình = 0 hoặc trống ⇒ không làm gì. Tối đa 50 hồ sơ mỗi lượt. Trả về số hồ sơ đã xử lý.';

COMMIT;
