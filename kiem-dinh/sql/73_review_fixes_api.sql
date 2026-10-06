-- =====================================================================
-- 73_review_fixes_api.sql — SỬA LỆCH API ↔ RLS/GRANT (kiểm định Bước 5), chạy SAU 70, 71, 72. Idempotent.
-- Xử lý: C-002, C-004, C-005, C-006, C-008, C-009, C-010, C-011, C-012, C-017, C-018, C-019, C-020, C-021, C-022.
-- Nguồn: Phụ lục A của báo cáo API; người kiểm định chính đã sửa 1 lỗi trong bản gốc (chú thích '--' nuốt lệnh đặt lại
-- chi phí ở tg_ai_job_input_guard), bỏ hàm trùng với 72 và làm mọi lệnh chạy lại được.
-- Lưu ý: sau file này phải áp bản sửa 2 khẳng định của 60_smoke_tests.sql (dòng 824 và 1046) — xem 74_smoke_tests_patch.md.
-- =====================================================================
BEGIN;

-- ======================================================================
-- SQL SỬA ĐỀ XUẤT (kiểm định C_api) — chạy bằng luuxa_owner/superuser trong migration
-- ======================================================================

-- [C-002] BR-AUTH-22 ở DB: tài khoản giữ vai trò đặc quyền chỉ đổi định danh/khóa khi người gọi có auth.role.assign;
--         đổi email/SĐT luôn xóa dấu xác minh.
CREATE OR REPLACE FUNCTION app.is_privileged_user(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user AND ur.revoked_at IS NULL
       AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
       AND r.code IN (SELECT jsonb_array_elements_text(app.setting_json('auth.mfa_required_roles'))
                      UNION SELECT 'house_head' UNION SELECT 'treasurer' UNION SELECT 'admin'))
$$;
ALTER FUNCTION app.is_privileged_user(uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.is_privileged_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_privileged_user(uuid) TO luuxa_app;

CREATE OR REPLACE FUNCTION app.tg_users_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_ident_changed boolean;
BEGIN
  v_ident_changed := NEW.status IS DISTINCT FROM OLD.status OR NEW.locked_until IS DISTINCT FROM OLD.locked_until
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.email IS DISTINCT FROM OLD.email OR NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at;
  IF current_user = 'luuxa_app' AND v_ident_changed THEN
    IF NOT app.has_permission('auth.user.manage') THEN
      RAISE EXCEPTION 'BR-AUTH-07: người dùng chỉ được tự đổi locale/time_zone; các thuộc tính tài khoản cần quyền auth.user.manage.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.id = app.current_user_id() THEN
      RAISE EXCEPTION 'BR-AUTH-22: không tự đổi định danh đăng nhập/trạng thái tài khoản của chính mình qua quản trị.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF app.is_privileged_user(OLD.id) AND NOT app.has_permission('auth.role.assign') THEN
      RAISE EXCEPTION 'BR-AUTH-22: tài khoản giữ vai trò đặc quyền chỉ Trưởng nhà (auth.role.assign) được đổi email/SĐT, khóa hoặc vô hiệu.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN NEW.email_verified_at := NULL; END IF;
  IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164 THEN NEW.phone_verified_at := NULL; END IF;
  RETURN NEW;
END $$;

-- [C-003] fn_reveal_prayer_author đã được vá ở 72_review_fixes_security.sql (D-007, cùng logic: báo cáo phải do người khác lập)

-- [C-003/C-022] Báo cáo chỉ được lập cho nội dung tồn tại và NGƯỜI BÁO NHÌN THẤY (SECURITY INVOKER => chịu RLS người báo)
CREATE OR REPLACE FUNCTION app.tg_content_report_rules()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_ok boolean;
BEGIN
  IF app.is_rls_exempt_role() THEN RETURN NEW; END IF;
  v_ok := CASE NEW.entity_type
    WHEN 'prayer_intention' THEN EXISTS (SELECT 1 FROM public.prayer_intentions x WHERE x.id = NEW.entity_id)
    WHEN 'forum_post'       THEN EXISTS (SELECT 1 FROM public.forum_posts x WHERE x.id = NEW.entity_id)
    WHEN 'forum_comment'    THEN EXISTS (SELECT 1 FROM public.forum_comments x WHERE x.id = NEW.entity_id)
    WHEN 'album'            THEN EXISTS (SELECT 1 FROM public.albums x WHERE x.id = NEW.entity_id)
    WHEN 'album_photo'      THEN EXISTS (SELECT 1 FROM public.album_photos x WHERE x.id = NEW.entity_id)
    ELSE NULL END;              -- loại khác: để ck_content_reports__entity báo lỗi
  IF v_ok IS FALSE THEN
    RAISE EXCEPTION 'BR-COM-08: không tìm thấy nội dung cần báo cáo.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_content_reports__target ON content_reports;
CREATE TRIGGER trg_content_reports__target BEFORE INSERT ON content_reports
  FOR EACH ROW EXECUTE FUNCTION app.tg_content_report_rules();

-- [C-004] AI: kiểm quyền xem thực thể đầu vào, suy subject_member_id ở DB, không cho client đặt trạng thái/chi phí/nhà cung cấp
CREATE OR REPLACE FUNCTION app.tg_ai_job_input_guard()
RETURNS trigger LANGUAGE plpgsql AS $$   -- SECURITY INVOKER: SELECT dưới RLS của người yêu cầu
DECLARE v_found boolean := false; v_subject uuid;
BEGIN
  IF current_user <> 'luuxa_app' THEN RETURN NEW; END IF;
  -- provider do API đặt từ cấu hình máy chủ (không nhận từ client); cổng BR-AI-02 kiểm ở trg_ai_jobs__gate
  NEW.status := 'queued'; NEW.model := NULL;
  NEW.tokens_in := 0; NEW.tokens_out := 0; NEW.cost_vnd := 0;
  NEW.started_at := NULL; NEW.finished_at := NULL; NEW.blocked_reason := NULL; NEW.error_message := NULL; NEW.latency_ms := NULL;
  IF NEW.entity_table IS NULL THEN
    v_found := NEW.entity_id IS NULL; v_subject := COALESCE(NEW.subject_member_id, app.current_member_id());  -- không gắn bản ghi: cổng BR-AI-03 vẫn kiểm chủ thể khai báo
  ELSIF NEW.entity_table = 'expense_vouchers' THEN
    SELECT true, m.id INTO v_found, v_subject FROM public.expense_vouchers v LEFT JOIN public.members m ON m.user_id = v.requested_by WHERE v.id = NEW.entity_id;
  ELSIF NEW.entity_table = 'academic_records' THEN
    SELECT true, ar.member_id INTO v_found, v_subject FROM public.academic_records ar WHERE ar.id = NEW.entity_id;
  ELSIF NEW.entity_table = 'maintenance_issues' THEN
    SELECT true, mi.reporter_member_id INTO v_found, v_subject FROM public.maintenance_issues mi WHERE mi.id = NEW.entity_id;
  ELSIF NEW.entity_table = 'duty_checkins' THEN
    SELECT true, c.checked_in_by_member_id INTO v_found, v_subject FROM public.duty_checkins c WHERE c.id = NEW.entity_id;
  ELSIF NEW.entity_table IN ('forum_posts', 'prayer_intentions', 'duty_rosters', 'events') THEN
    EXECUTE format('SELECT true FROM public.%I WHERE id = $1', NEW.entity_table) INTO v_found USING NEW.entity_id;
  END IF;
  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'BR-AI-05: không tìm thấy hoặc không có quyền xem bản ghi đầu vào của tác vụ AI.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.input_ref ? 'file_id' AND NOT EXISTS (SELECT 1 FROM public.storage_files f WHERE f.id = (NEW.input_ref->>'file_id')::uuid) THEN
    RAISE EXCEPTION 'BR-AI-05: tệp đầu vào không tồn tại hoặc không được xem.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.subject_member_id := v_subject;
  RETURN NEW;
END $$;
-- tên trigger xếp trước trg_ai_jobs__gate để cổng đồng ý dùng subject_member_id đã suy ra
DROP TRIGGER IF EXISTS trg_ai_jobs__a_input_guard ON ai_jobs;
CREATE TRIGGER trg_ai_jobs__a_input_guard BEFORE INSERT ON ai_jobs FOR EACH ROW EXECUTE FUNCTION app.tg_ai_job_input_guard();

-- Cổng BR-AI-02 kiểm khi worker CHỌN nhà cung cấp (provider do worker đặt, không do client)
CREATE OR REPLACE FUNCTION app.tg_ai_job_provider_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_t public.ai_task_types%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.ai_task_types WHERE code = NEW.task_code;
  IF NEW.provider IS NOT NULL AND NOT v_t.external_call_allowed AND NEW.provider NOT IN ('self_hosted', 'local', 'rule_based') THEN
    RAISE EXCEPTION 'BR-AI-02: tác vụ % (dữ liệu %) không được gửi tới nhà cung cấp %.', NEW.task_code, v_t.data_class, NEW.provider USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.tg_ai_job_provider_guard() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_ai_jobs__provider_guard ON ai_jobs;
CREATE TRIGGER trg_ai_jobs__provider_guard BEFORE UPDATE OF provider ON ai_jobs FOR EACH ROW EXECUTE FUNCTION app.tg_ai_job_provider_guard();
-- Worker đổi provider (fallback) cũng bị kiểm lại BR-AI-02.

-- [C-006] Người xác minh chỉ được đổi các cột của quyết định xác minh
CREATE OR REPLACE FUNCTION app.tg_academic_record_verifier_cols()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.is_rls_exempt_role() OR app.is_self(OLD.member_id) THEN RETURN NEW; END IF;
  IF (NEW.has_scholarship, NEW.scholarship_note, NEW.major_snapshot, NEW.student_code_snapshot)
     IS DISTINCT FROM (OLD.has_scholarship, OLD.scholarship_note, OLD.major_snapshot, OLD.student_code_snapshot) THEN
    RAISE EXCEPTION 'BR-ACAD-21: người xác minh chỉ được đổi trạng thái, mốc xác minh và lý do từ chối; nội dung bảng điểm thuộc chính chủ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_academic_records__verifier_cols ON academic_records;
CREATE TRIGGER trg_academic_records__verifier_cols BEFORE UPDATE ON academic_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_academic_record_verifier_cols();

-- [C-008] Tách quyền sửa cấu hình bảo mật khỏi Admin kỹ thuật
INSERT INTO permissions (code, module, description, is_sensitive)
VALUES ('security.settings.write', 'auth', 'Sửa cấu hình bảo mật (auth.*): MFA bắt buộc, khóa đăng nhập, thời hạn token', true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code) SELECT id, 'security.settings.write' FROM roles WHERE code = 'house_head'
ON CONFLICT DO NOTHING;
UPDATE settings SET write_permission = 'security.settings.write' WHERE key LIKE 'auth.%';

-- [C-009] luuxa_auth không cần ghi user_roles (không endpoint AUTH-* nào gán vai trò)
REVOKE INSERT ON user_roles FROM luuxa_auth;

-- [C-010] Vai trò hẹp cho webhook công khai (thay vì luuxa_worker BYPASSRLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_webhook') THEN
    CREATE ROLE luuxa_webhook NOLOGIN NOBYPASSRLS;   -- cấp LOGIN + mật khẩu lúc triển khai như các vai trò khác (4.0)
  END IF;
END $$;
DO $$ BEGIN
  GRANT USAGE ON SCHEMA public TO luuxa_webhook;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
GRANT USAGE ON SCHEMA app TO luuxa_webhook;
GRANT SELECT (id, fund_type, bank_account_last4, is_active, deleted_at) ON funds TO luuxa_webhook;
GRANT INSERT (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, balance_after_vnd) ON bank_statement_lines TO luuxa_webhook;
GRANT SELECT (id, status, provider_message_id) , UPDATE (status, last_error, sent_at) ON notification_outbox TO luuxa_webhook;
DROP POLICY IF EXISTS funds__select__webhook ON funds;
CREATE POLICY funds__select__webhook ON funds FOR SELECT TO luuxa_webhook USING (fund_type = 'bank' AND is_active AND deleted_at IS NULL);
DROP POLICY IF EXISTS bank_statement_lines__insert__webhook ON bank_statement_lines;
CREATE POLICY bank_statement_lines__insert__webhook ON bank_statement_lines FOR INSERT TO luuxa_webhook WITH CHECK (match_status = 'unmatched' AND matched_ledger_entry_id IS NULL);
DROP POLICY IF EXISTS notification_outbox__webhook ON notification_outbox;
CREATE POLICY notification_outbox__webhook ON notification_outbox FOR ALL TO luuxa_webhook USING (provider_message_id IS NOT NULL) WITH CHECK (provider_message_id IS NOT NULL);

-- [C-011] fn_poll_results: kiểm quyền xem poll như RLS polls__select; poll ẩn danh đang mở không trả số phiếu từng phương án cho người thường
CREATE OR REPLACE FUNCTION app.fn_poll_results(p_poll_id uuid)
RETURNS TABLE (option_id uuid, label text, sort_order smallint, votes bigint, voters bigint, eligible bigint, voter_names text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_p public.polls%ROWTYPE; v_names boolean; v_hide boolean;
BEGIN
  IF app.current_user_id() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_p FROM public.polls p WHERE p.id = p_poll_id;
  IF NOT FOUND OR NOT app.has_permission('event.read')
     OR (v_p.status = 'draft' AND v_p.created_by IS DISTINCT FROM app.current_user_id() AND NOT app.has_permission('poll.manage')) THEN
    RAISE EXCEPTION 'Poll không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  v_names := NOT v_p.is_anonymous AND app.has_permission('poll.manage');
  v_hide  := v_p.is_anonymous AND v_p.status <> 'closed';
  RETURN QUERY
    SELECT o.id, o.label, o.sort_order,
           CASE WHEN v_hide THEN NULL ELSE COUNT(pv.member_id)::bigint END,
           (SELECT COUNT(DISTINCT x.member_id) FROM public.poll_votes x WHERE x.poll_id = p_poll_id)::bigint,
           (SELECT COUNT(*) FROM public.members m WHERE m.status = 'active' AND m.deleted_at IS NULL)::bigint,
           CASE WHEN v_names THEN array_agg(m2.display_name ORDER BY m2.display_name) FILTER (WHERE m2.id IS NOT NULL) END
      FROM public.poll_options o
      LEFT JOIN public.poll_votes pv ON pv.option_id = o.id
      LEFT JOIN public.members m2 ON m2.id = pv.member_id
     WHERE o.poll_id = p_poll_id
     GROUP BY o.id, o.label, o.sort_order
     ORDER BY o.sort_order;
END $$;

-- [C-012] Phiên đăng nhập: RLS chỉ chính chủ; thu hồi phiên người khác qua hàm DEFINER
DROP POLICY IF EXISTS auth_sessions__select__own_or_admin ON auth_sessions;
DROP POLICY IF EXISTS auth_sessions__select__own ON auth_sessions;
DROP POLICY IF EXISTS auth_sessions__update__own_or_admin ON auth_sessions;
DROP POLICY IF EXISTS auth_sessions__update__own ON auth_sessions;
CREATE POLICY auth_sessions__select__own ON auth_sessions FOR SELECT TO luuxa_app USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY auth_sessions__update__own ON auth_sessions FOR UPDATE TO luuxa_app
  USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));
REVOKE UPDATE ON auth_sessions FROM luuxa_app;
GRANT UPDATE (revoked_at, revoked_reason, last_seen_at) ON auth_sessions TO luuxa_app;
CREATE OR REPLACE FUNCTION app.fn_revoke_user_sessions(p_user uuid, p_reason text DEFAULT 'admin_revoked')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  IF app.lacks_permission('auth.session.revoke_any') THEN
    RAISE EXCEPTION 'Không có quyền thu hồi phiên của người khác.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason NOT IN ('admin_revoked', 'user_disabled') THEN
    RAISE EXCEPTION 'Lý do thu hồi không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF app.is_privileged_user(p_user) AND NOT app.has_permission('auth.role.assign') THEN
    RAISE EXCEPTION 'BR-AUTH-22: thu hồi phiên tài khoản đặc quyền cần Trưởng nhà.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = p_reason WHERE user_id = p_user AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM app.write_audit('PERMISSION_CHANGE', 'auth_sessions', p_user::text, 'revoke_all:' || p_reason);
  RETURN v_n;
END $$;
ALTER FUNCTION app.fn_revoke_user_sessions(uuid, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_revoke_user_sessions(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_revoke_user_sessions(uuid, text) TO luuxa_app;

-- [C-013] Dữ liệu tầng 1 học tập cho danh bạ: hàm DEFINER chỉ trả trường/ngành (không MSSV)
CREATE OR REPLACE FUNCTION app.fn_directory_study(p_member_ids uuid[])
RETURNS TABLE (member_id uuid, university_id uuid, major text, cohort_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
  SELECT sp.member_id, sp.university_id, sp.major, sp.cohort_label
    FROM public.student_profiles sp
   WHERE app.has_permission('member.read') AND sp.is_current AND sp.deleted_at IS NULL
     AND sp.member_id = ANY (p_member_ids)
$$;
ALTER FUNCTION app.fn_directory_study(uuid[]) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_directory_study(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_directory_study(uuid[]) TO luuxa_app;

-- [C-016] CCCD: luuxa_app không đọc bản mã; xem qua hàm DEFINER có kiểm quyền + ghi kiểm toán trong cùng transaction
REVOKE SELECT ON member_private_details FROM luuxa_app;
GRANT SELECT (member_id, birth_date, hometown, home_address, national_id_last4, national_id_key_version, created_at, updated_at, version)
  ON member_private_details TO luuxa_app;
CREATE OR REPLACE FUNCTION app.fn_national_id_cipher(p_member_id uuid, p_reason text)
RETURNS TABLE (national_id_enc bytea, national_id_key_version smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
BEGIN
  IF app.lacks_permission('member.national_id.read') THEN
    RAISE EXCEPTION 'Không có quyền xem CCCD.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'BR-MEM-21: phải nêu lý do (≥ 5 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app.write_audit('READ_SENSITIVE', 'member_private_details', p_member_id::text, p_reason);
  RETURN QUERY SELECT d.national_id_enc, d.national_id_key_version FROM public.member_private_details d WHERE d.member_id = p_member_id;
END $$;
ALTER FUNCTION app.fn_national_id_cipher(uuid, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_national_id_cipher(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_national_id_cipher(uuid, text) TO luuxa_app;

-- [C-017] Lý do phân phòng (BR-HOUSE-19)
REVOKE SELECT ON room_assignments FROM luuxa_app;
GRANT SELECT (id, member_id, room_id, academic_year_id, bed_label, starts_on, ends_on, assigned_by, ended_by, client_request_id, created_at, updated_at)
  ON room_assignments TO luuxa_app;
CREATE OR REPLACE FUNCTION app.fn_room_assignment_reasons(p_ids uuid[])
RETURNS TABLE (id uuid, reason text, end_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
  SELECT ra.id, ra.reason, ra.end_reason FROM public.room_assignments ra
   WHERE ra.id = ANY (p_ids) AND (app.is_self(ra.member_id) OR app.can_assign_room(ra.room_id))
$$;
ALTER FUNCTION app.fn_room_assignment_reasons(uuid[]) OWNER TO luuxa_definer;
GRANT EXECUTE ON FUNCTION app.fn_room_assignment_reasons(uuid[]) TO luuxa_app;

-- [C-024] mv_cashflow_monthly không có RLS: chỉ đọc qua hàm có kiểm quyền
REVOKE ALL ON mv_cashflow_monthly FROM luuxa_app;
CREATE OR REPLACE FUNCTION app.fn_cashflow_monthly(p_from date, p_to date, p_fund_id uuid DEFAULT NULL)
RETURNS TABLE (month date, total_in_vnd bigint, total_out_vnd bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
BEGIN
  IF app.lacks_permission('finance.summary.read') OR (p_fund_id IS NOT NULL AND app.lacks_permission('finance.ledger.read')) THEN
    RAISE EXCEPTION 'Không có quyền xem dòng tiền.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT c.month, SUM(c.total_in_vnd)::bigint, SUM(c.total_out_vnd)::bigint
                 FROM public.mv_cashflow_monthly c
                WHERE c.month BETWEEN p_from AND p_to AND (p_fund_id IS NULL OR c.fund_id = p_fund_id)
                GROUP BY c.month ORDER BY c.month;
END $$;
ALTER FUNCTION app.fn_cashflow_monthly(date, date, uuid) OWNER TO luuxa_definer;
GRANT EXECUTE ON FUNCTION app.fn_cashflow_monthly(date, date, uuid) TO luuxa_app;

-- [C-025] fn_audit_event: READ_SENSITIVE chỉ cho người có ít nhất một quyền đọc nhạy cảm
CREATE OR REPLACE FUNCTION app.fn_audit_event(p_action text, p_entity_table text DEFAULT NULL, p_entity_id text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action NOT IN ('READ_SENSITIVE', 'EXPORT', 'PRINT', 'DOWNLOAD_FILE', 'SHARE_LINK', 'LOGOUT') THEN
    RAISE EXCEPTION 'Sự kiện kiểm toán "%" không được ghi từ API.', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_action = 'READ_SENSITIVE' AND NOT app.has_any_permission(ARRAY['member.national_id.read','member.guardian.read','member.private.read',
       'catholic.read_all','academic.read_all','academic.verify','prayer.reveal_author']) THEN
    RAISE EXCEPTION 'Không có quyền đọc dữ liệu nhạy cảm.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_entity_table IS NOT NULL AND p_entity_table !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RAISE EXCEPTION 'Tên thực thể không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_action IN ('READ_SENSITIVE', 'DOWNLOAD_FILE') AND (p_entity_table IS NULL OR p_entity_id IS NULL) THEN
    RAISE EXCEPTION 'Thiếu thực thể của sự kiện kiểm toán.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM app.write_audit(p_action, COALESCE(p_entity_table, 'api'), left(p_entity_id, 200), left(p_reason, 500));
END $$;

-- Bất biến INV-14: không hàm app nào EXECUTE cho PUBLIC
REVOKE EXECUTE ON FUNCTION app.tg_content_report_rules(), app.tg_ai_job_input_guard(), app.tg_ai_job_provider_guard(),
  app.tg_academic_record_verifier_cols(), app.fn_room_assignment_reasons(uuid[]), app.fn_cashflow_monthly(date, date, uuid) FROM PUBLIC;

-- Quy ước 49_a: hàm SECURITY INVOKER thuộc luuxa_owner
ALTER FUNCTION app.tg_content_report_rules() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_ai_job_input_guard() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_academic_record_verifier_cols() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.is_privileged_user(uuid) FROM PUBLIC;

COMMIT;
