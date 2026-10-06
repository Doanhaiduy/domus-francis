-- =====================================================================
-- 72_review_fixes_security.sql — GIA CỐ BẢO MẬT & QUYỀN RIÊNG TƯ (sau kiểm định độc lập, Bước 6–7)
-- Chạy SAU 70, 71. Idempotent. Xử lý: D-002, D-003, D-005, D-006, D-007, D-008.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- D-002: hàm SECURITY DEFINER nhận id tùy ý không được cấp cho phiên API (oracle vượt RLS user_roles).
--        RLS và trigger vẫn dùng được vì chúng chạy dưới chủ hàm luuxa_definer (giữ EXECUTE).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION app.user_roles_of(uuid) FROM luuxa_app, luuxa_readonly;
REVOKE EXECUTE ON FUNCTION app.roles_have_permission(text[], text) FROM luuxa_app, luuxa_readonly;

-- ---------------------------------------------------------------------
-- D-005: tối thiểu đặc quyền cho pgcrypto (mặc định PUBLIC được gọi mọi hàm).
--        Giữ đúng các hàm đang được dùng: digest (chuỗi băm sổ cái, fn_verify_ledger_chain chạy quyền người gọi),
--        gen_random_bytes (DEFAULT khóa bí mật qr_sessions), hmac (app.fn_qr_mac — SECURITY DEFINER).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_schema text;
BEGIN
  -- Tìm schema chứa pgcrypto (public trên local, extensions trên Supabase)
  SELECT n.nspname INTO v_schema
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'hmac'
   LIMIT 1;

  IF v_schema IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.hmac(bytea, bytea, text), %I.hmac(text, text, text),
                                            %I.digest(bytea, text), %I.digest(text, text),
                                            %I.pgp_sym_encrypt(text, text), %I.pgp_sym_decrypt(bytea, text),
                                            %I.gen_random_bytes(integer), %I.crypt(text, text) FROM PUBLIC',
                   v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.digest(bytea, text), %I.digest(text, text)
                      TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner, luuxa_readonly', v_schema, v_schema);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.gen_random_bytes(integer)
                      TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner', v_schema);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.hmac(bytea, bytea, text), %I.hmac(text, text, text)
                      TO luuxa_definer, luuxa_owner', v_schema, v_schema);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ---------------------------------------------------------------------
-- D-006: trigger bất biến chạy cả khi session_replication_role = replica (ENABLE ALWAYS) cho MỌI bảng dùng tg_forbid_mutation
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.tgrelid::regclass AS tbl, t.tgname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE p.proname = 'tg_forbid_mutation' AND NOT t.tgisinternal AND NOT c.relispartition AND t.tgparentid = 0
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ALWAYS TRIGGER %I', r.tbl, r.tgname);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- D-008: audit bảng users che email và SĐT như audit members
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users__audit ON users;
CREATE TRIGGER trg_users__audit
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'password_hash,email,phone_e164');

-- ---------------------------------------------------------------------
-- D-007: người tự lập báo cáo không được dùng chính báo cáo đó để lộ tác giả ý chỉ ẩn danh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_reveal_prayer_author(p_intention_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_author uuid;
  v_me     uuid := app.current_member_id();
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('prayer.reveal_author') THEN
    RAISE EXCEPTION 'Không có quyền xem tác giả ý cầu nguyện ẩn danh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'BR-COM-05: phải nêu lý do (≥ 10 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.content_reports r
                  WHERE r.entity_type = 'prayer_intention' AND r.entity_id = p_intention_id AND r.status = 'open'
                    AND r.reporter_member_id IS DISTINCT FROM v_me) THEN
    RAISE EXCEPTION 'BR-COM-05/BR-COM-21: chỉ được xem tác giả khi có báo cáo vi phạm đang mở do NGƯỜI KHÁC lập về ý chỉ này.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT a.author_member_id INTO v_author FROM public.prayer_intention_authors a WHERE a.intention_id = p_intention_id;
  PERFORM app.write_audit('READ_SENSITIVE', 'prayer_intention_authors', p_intention_id::text, p_reason);
  RETURN v_author;
END
$$;
COMMENT ON FUNCTION app.fn_reveal_prayer_author(uuid, text) IS 'Xem tác giả ý chỉ ẩn danh CHỈ khi có báo cáo vi phạm mở do người khác lập (D-007, BR-COM-21), kèm lý do; mỗi lần gọi ghi audit READ_SENSITIVE.';

-- ---------------------------------------------------------------------
-- D-003: quyền xóa/ẩn danh hóa và thời hạn lưu trữ — hiện thực trong DB (trước đây chỉ có trên tài liệu)
--   Nguyên tắc: GIỮ dữ liệu tài chính/kiểm toán (nghĩa vụ chứng từ) và bằng chứng đồng ý; XÓA dữ liệu tầng 2/3
--   (CCCD, ngày sinh, quê quán, địa chỉ, người giám hộ, hồ sơ Công giáo, bí tích, liên kết tác giả ý chỉ, thông báo);
--   THAY tên/liên lạc ở members và users bằng giá trị ẩn danh; khóa tài khoản.
-- ---------------------------------------------------------------------
INSERT INTO settings (key, value, value_type, description, min_value, max_value, is_public)
VALUES ('privacy.left_member_retention_days', '365'::jsonb, 'integer',
        '[GIẢ ĐỊNH] Số ngày giữ dữ liệu cá nhân nhạy cảm sau ngày rời lưu xá (status left); quá hạn thì job app.fn_apply_member_retention ẩn danh hóa. Cựu thành viên (alumni) không tự ẩn danh.', 30, 3650, false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.fn_anonymize_member(p_member_id uuid, p_reason text, p_request_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_m        public.members%ROWTYPE;
  v_counts   jsonb;
  v_n_priv   integer; v_n_cath integer; v_n_sac integer; v_n_guard integer; v_n_pray integer; v_n_notif integer; v_n_cons integer;
BEGIN
  IF app.lacks_permission('dsr.manage') THEN
    RAISE EXCEPTION 'Không có quyền xử lý yêu cầu dữ liệu cá nhân (dsr.manage).' USING ERRCODE = 'insufficient_privilege';
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
  -- Bằng chứng đồng ý được GIỮ (ON DELETE RESTRICT — G-10) nhưng đánh dấu đã rút
  UPDATE public.consents SET withdrawn_at = now() WHERE member_id = p_member_id AND withdrawn_at IS NULL;
  GET DIAGNOSTICS v_n_cons = ROW_COUNT;

  UPDATE public.members
     SET full_name = '[Đã ẩn danh]', display_name = 'Cựu TV #' || member_no,
         contact_phone_e164 = NULL, contact_email = NULL, hide_phone = true, avatar_file_id = NULL, left_reason = NULL
   WHERE id = p_member_id;
  IF v_m.user_id IS NOT NULL THEN
    UPDATE public.users
       SET email = 'an-danh-' || id::text || '@an-danh.invalid', phone_e164 = NULL, status = 'disabled', password_hash = NULL
     WHERE id = v_m.user_id;
    UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'user_disabled'
     WHERE user_id = v_m.user_id AND revoked_at IS NULL;
  END IF;

  v_counts := jsonb_build_object('member_id', p_member_id, 'private_details', v_n_priv, 'catholic_profiles', v_n_cath,
                                 'sacraments', v_n_sac, 'guardians', v_n_guard, 'prayer_authorship', v_n_pray,
                                 'notifications', v_n_notif, 'consents_withdrawn', v_n_cons);
  IF p_request_id IS NOT NULL THEN
    UPDATE public.data_subject_requests
       SET status = 'completed', completed_at = now(), handled_by = app.current_user_id(),
           resolution_note = left('Đã ẩn danh hóa: ' || v_counts::text, 1000)
     WHERE id = p_request_id AND member_id = p_member_id AND status IN ('received', 'in_progress');
  END IF;
  PERFORM app.write_audit('STATE_CHANGE', 'members', p_member_id::text, 'MEMBER_ANONYMIZED: ' || left(p_reason, 400), NULL, v_counts);
  RETURN v_counts;
END
$$;
ALTER FUNCTION app.fn_anonymize_member(uuid, text, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_anonymize_member(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_anonymize_member(uuid, text, uuid) TO luuxa_app, luuxa_worker;
COMMENT ON FUNCTION app.fn_anonymize_member(uuid, text, uuid) IS 'D-003 (BR-SEC-05, BR-MEM-15): ẩn danh hóa hồ sơ đã rời lưu xá — xóa dữ liệu tầng 2/3, thay tên/liên lạc, khóa tài khoản, giữ chứng từ tài chính và bằng chứng đồng ý (đánh dấu đã rút); đóng yêu cầu data_subject_requests nếu truyền p_request_id; ghi audit STATE_CHANGE. Idempotent. Cần dsr.manage.';

CREATE OR REPLACE FUNCTION app.fn_apply_member_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  IF NOT app.is_system_caller() THEN
    RAISE EXCEPTION 'Chỉ tiến trình nền được chạy job thời hạn lưu trữ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_id IN
    SELECT m.id FROM public.members m
     WHERE m.status = 'left' AND m.full_name <> '[Đã ẩn danh]'
       AND m.left_on IS NOT NULL
       AND m.left_on < app.local_today() - app.setting_int('privacy.left_member_retention_days')::int
  LOOP
    PERFORM app.fn_anonymize_member(v_id, 'Hết thời hạn lưu trữ sau khi rời lưu xá (privacy.left_member_retention_days)');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
ALTER FUNCTION app.fn_apply_member_retention() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_apply_member_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_apply_member_retention() TO luuxa_worker;
COMMENT ON FUNCTION app.fn_apply_member_retention() IS 'D-003: job hằng ngày (luuxa_worker) ẩn danh hóa hồ sơ đã rời quá privacy.left_member_retention_days ngày. Trả về số hồ sơ đã xử lý.';

COMMIT;
