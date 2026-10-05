-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (8/8, phần 2): NỀN TẢNG — TỆP ĐÍNH KÈM, THÔNG BÁO, AI, DỌN DẸP ĐỊNH KỲ
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.90  Tệp đính kèm đa hình: kiểm tra thực thể tồn tại, đúng bucket, đúng người tải lên
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.entity_exists(p_type attachment_entity_t, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE p_type
    WHEN 'expense_voucher'     THEN EXISTS (SELECT 1 FROM public.expense_vouchers      WHERE id = p_id)
    WHEN 'duty_checkin'        THEN EXISTS (SELECT 1 FROM public.duty_checkins         WHERE id = p_id)
    WHEN 'duty_review_appeal'  THEN EXISTS (SELECT 1 FROM public.duty_review_appeals   WHERE id = p_id)
    WHEN 'academic_record'     THEN EXISTS (SELECT 1 FROM public.academic_records      WHERE id = p_id)
    WHEN 'maintenance_issue'   THEN EXISTS (SELECT 1 FROM public.maintenance_issues    WHERE id = p_id)
    WHEN 'repair_cost'         THEN EXISTS (SELECT 1 FROM public.repair_costs          WHERE id = p_id)
    WHEN 'announcement'        THEN EXISTS (SELECT 1 FROM public.announcements         WHERE id = p_id)
    WHEN 'forum_post'          THEN EXISTS (SELECT 1 FROM public.forum_posts           WHERE id = p_id)
    WHEN 'leave_request'       THEN EXISTS (SELECT 1 FROM public.leave_requests        WHERE id = p_id)
    WHEN 'member_application'  THEN EXISTS (SELECT 1 FROM public.member_applications   WHERE id = p_id)
    WHEN 'policy_document'     THEN EXISTS (SELECT 1 FROM public.policy_documents      WHERE id = p_id)
    WHEN 'event'               THEN EXISTS (SELECT 1 FROM public.events                WHERE id = p_id)
    ELSE false
  END
$$;
COMMENT ON FUNCTION app.entity_exists(attachment_entity_t, uuid) IS 'Kiểm tra bản ghi đích của liên kết tệp đa hình có tồn tại (thay cho FK vì liên kết đa hình). SECURITY DEFINER chỉ trả boolean.';

CREATE OR REPLACE FUNCTION app.expected_bucket(p_type attachment_entity_t)
RETURNS storage_bucket_t
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'expense_voucher'     THEN 'receipts'::storage_bucket_t
    WHEN 'duty_checkin'        THEN 'cleaning-evidence'::storage_bucket_t
    WHEN 'duty_review_appeal'  THEN 'cleaning-evidence'::storage_bucket_t
    WHEN 'academic_record'     THEN 'academic-evidence'::storage_bucket_t
    WHEN 'maintenance_issue'   THEN 'maintenance'::storage_bucket_t
    WHEN 'repair_cost'         THEN 'maintenance'::storage_bucket_t
    WHEN 'announcement'        THEN 'attachments'::storage_bucket_t
    WHEN 'forum_post'          THEN 'attachments'::storage_bucket_t
    WHEN 'leave_request'       THEN 'attachments'::storage_bucket_t
    WHEN 'member_application'  THEN 'attachments'::storage_bucket_t
    WHEN 'policy_document'     THEN 'documents'::storage_bucket_t
    WHEN 'event'               THEN 'attachments'::storage_bucket_t
  END
$$;
COMMENT ON FUNCTION app.expected_bucket(attachment_entity_t) IS 'Bucket duy nhất được phép lưu tệp của từng loại thực thể (hóa đơn không lẫn vào bucket ảnh công khai).';

CREATE OR REPLACE FUNCTION app.tg_media_attachment_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
BEGIN
  IF NOT app.entity_exists(NEW.entity_type, NEW.entity_id) THEN
    RAISE EXCEPTION 'Thực thể % % không tồn tại.', NEW.entity_type, NEW.entity_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.file_id AND f.deleted_at IS NULL;
  IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
    RAISE EXCEPTION 'Tệp chưa tải lên xong hoặc đã bị từ chối/xóa.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_file.bucket <> app.expected_bucket(NEW.entity_type) THEN
    RAISE EXCEPTION 'BR-STO-02: tệp thuộc bucket % không được gắn vào %.', v_file.bucket, NEW.entity_type USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'BR-STO-03: chỉ được gắn tệp do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.attached_by := COALESCE(NEW.attached_by, app.current_user_id());
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_media_attachment_rules() IS 'BEFORE INSERT media_attachments (BR-STO-02/03): thực thể đích tồn tại, tệp đã tải lên, đúng bucket theo loại thực thể, chỉ người tải lên mới gắn được tệp của mình.';

CREATE TRIGGER trg_media_attachments__entity_exists
  BEFORE INSERT ON media_attachments
  FOR EACH ROW EXECUTE FUNCTION app.tg_media_attachment_rules();

CREATE OR REPLACE FUNCTION app.tg_media_attachment_mark_attached()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now() WHERE id = NEW.file_id;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_media_attachments__mark_attached
  AFTER INSERT ON media_attachments
  FOR EACH ROW EXECUTE FUNCTION app.tg_media_attachment_mark_attached();

-- BR-STO-04 (phần INSERT): thuộc tính kiểm chứng của tệp (băm, MIME thực, pHash, thời điểm chụp EXIF, kết quả quét) do worker xác lập — phiên người dùng
-- không tự gán khi đăng ký tải lên (nếu không, client tự khai scan_status = 'clean' hay taken_at gần giờ check-in). Phần UPDATE do
-- trg_storage_files__guard (44_rls_helpers.sql) giữ; trigger này bổ sung cột taken_at và phủ cả INSERT.
CREATE TRIGGER trg_storage_files__verified_cols
  BEFORE INSERT OR UPDATE ON storage_files
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-STO-04', '', '', 'sha256,detected_mime,phash,taken_at,scan_status');

-- BR-STO-05: tham chiếu tệp TRỰC TIẾP bằng khóa ngoại (ảnh album, ảnh bìa album, ảnh đại diện) không đi qua media_attachments nên cũng phải
-- đúng bucket và đúng người tải lên như BR-STO-02/03 (nếu không, hóa đơn của người khác có thể bị "gắn" vào album công khai).
--   TG_ARGV[0] = bucket bắt buộc, TG_ARGV[1] = tên cột chứa storage_files.id. Chỉ kiểm khi cột được gán giá trị mới.
CREATE OR REPLACE FUNCTION app.tg_file_ref_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_id   uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
  v_file public.storage_files%ROWTYPE;
BEGIN
  IF v_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND v_id IS NOT DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[1])::uuid THEN RETURN NEW; END IF;
  SELECT * INTO v_file FROM public.storage_files f WHERE f.id = v_id AND f.deleted_at IS NULL;
  IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
    RAISE EXCEPTION 'BR-STO-05: tệp của %.% không tồn tại (hoặc không phải tệp của bạn), chưa tải lên xong hoặc đã bị từ chối/xóa.', TG_TABLE_NAME, TG_ARGV[1] USING ERRCODE = 'check_violation';
  END IF;
  IF v_file.bucket::text <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'BR-STO-05: %.% chỉ nhận tệp thuộc bucket %, không phải %.', TG_TABLE_NAME, TG_ARGV[1], TG_ARGV[0], v_file.bucket USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'BR-STO-05: chỉ được dùng tệp do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_file_ref_rules() IS 'BEFORE INSERT/UPDATE OF <cột tệp> (BR-STO-05): tệp được tham chiếu trực tiếp (album_photos.file_id, albums.cover_file_id → bucket moments; members.avatar_file_id → bucket avatars) phải tồn tại, đã tải lên xong và do chính người đang thao tác tải lên. Tham số: bucket, tên cột. Giống BR-STO-02/03 của media_attachments.';

CREATE TRIGGER trg_album_photos__file_ref
  BEFORE INSERT OR UPDATE OF file_id ON album_photos
  FOR EACH ROW EXECUTE FUNCTION app.tg_file_ref_rules('moments', 'file_id');
CREATE TRIGGER trg_albums__file_ref
  BEFORE INSERT OR UPDATE OF cover_file_id ON albums
  FOR EACH ROW EXECUTE FUNCTION app.tg_file_ref_rules('moments', 'cover_file_id');
CREATE TRIGGER trg_members__avatar_ref
  BEFORE INSERT OR UPDATE OF avatar_file_id ON members
  FOR EACH ROW EXECUTE FUNCTION app.tg_file_ref_rules('avatars', 'avatar_file_id');

-- ---------------------------------------------------------------------
-- 4.5.91  Tạo thông báo + hàng đợi gửi đa kênh (tôn trọng tùy chọn, giờ yên tĩnh)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_notify(
  p_member_id    uuid,
  p_type_code    text,
  p_title        text,
  p_body         text  DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb,
  p_entity_table text  DEFAULT NULL,
  p_entity_id    uuid  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_type    public.notification_types%ROWTYPE;
  v_id      uuid;
  v_ch      notification_channel_t;
  v_pref    public.notification_preferences%ROWTYPE;
  v_next    timestamptz;
  v_lnow    timestamp;
  v_in_quiet boolean;
BEGIN
  SELECT * INTO v_type FROM public.notification_types t WHERE t.code = p_type_code AND t.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loại thông báo % không tồn tại hoặc đã tắt.', p_type_code USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.notifications (member_id, type_code, title, body, payload, entity_table, entity_id, priority)
  VALUES (p_member_id, p_type_code, p_title, p_body, COALESCE(p_payload, '{}'::jsonb), p_entity_table, p_entity_id, v_type.priority)
  RETURNING id INTO v_id;

  FOREACH v_ch IN ARRAY v_type.default_channels LOOP
    CONTINUE WHEN v_ch = 'in_app';
    SELECT * INTO v_pref FROM public.notification_preferences p
     WHERE p.member_id = p_member_id AND p.category = v_type.category AND p.channel = v_ch;
    IF FOUND AND NOT v_pref.enabled AND NOT v_type.is_mandatory THEN CONTINUE; END IF;
    v_next := now();
    IF FOUND AND v_pref.quiet_start IS NOT NULL AND NOT v_type.is_mandatory AND v_type.priority <> 'urgent' THEN
      v_lnow := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
      v_in_quiet := CASE WHEN v_pref.quiet_start <= v_pref.quiet_end
                         THEN v_lnow::time >= v_pref.quiet_start AND v_lnow::time < v_pref.quiet_end
                         ELSE v_lnow::time >= v_pref.quiet_start OR v_lnow::time < v_pref.quiet_end END;
      IF v_in_quiet THEN
        v_next := ((v_lnow::date + CASE WHEN v_pref.quiet_end <= v_lnow::time THEN 1 ELSE 0 END) + v_pref.quiet_end) AT TIME ZONE 'Asia/Ho_Chi_Minh';
      END IF;
    END IF;
    INSERT INTO public.notification_outbox (notification_id, channel, next_attempt_at)
    VALUES (v_id, v_ch, v_next)
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END LOOP;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid) IS 'Tạo một thông báo trong ứng dụng cho một người + xếp hàng gửi các kênh còn lại theo notification_types.default_channels. Bỏ qua kênh người nhận đã tắt (trừ loại is_mandatory); trì hoãn đến hết giờ yên tĩnh (trừ mandatory/urgent). Gọi cùng transaction nghiệp vụ (transactional outbox).';

CREATE OR REPLACE FUNCTION app.fn_notify_roles(
  p_role_codes   text[],
  p_type_code    text,
  p_title        text,
  p_body         text  DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb,
  p_entity_table text  DEFAULT NULL,
  p_entity_id    uuid  DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_member uuid;
  v_n      integer := 0;
BEGIN
  FOR v_member IN
    SELECT DISTINCT m.id
      FROM public.user_roles ur
      JOIN public.roles r   ON r.id = ur.role_id AND r.code = ANY (p_role_codes)
      JOIN public.members m ON m.user_id = ur.user_id AND m.deleted_at IS NULL AND m.status = 'active'
     WHERE ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
  LOOP
    PERFORM app.fn_notify(v_member, p_type_code, p_title, p_body, p_payload, p_entity_table, p_entity_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_notify_roles(text[], text, text, text, jsonb, text, uuid) IS 'Gửi thông báo cho mọi thành viên đang giữ một trong các vai trò (ví dụ phiếu chi chờ duyệt ⇒ house_head + treasurer).';

CREATE OR REPLACE FUNCTION app.fn_notify_all_active(
  p_type_code    text,
  p_title        text,
  p_body         text  DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb,
  p_entity_table text  DEFAULT NULL,
  p_entity_id    uuid  DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_member uuid;
  v_n      integer := 0;
BEGIN
  FOR v_member IN SELECT m.id FROM public.members m WHERE m.deleted_at IS NULL AND m.status = 'active' LOOP
    PERFORM app.fn_notify(v_member, p_type_code, p_title, p_body, p_payload, p_entity_table, p_entity_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_notify_all_active(text, text, text, jsonb, text, uuid) IS 'Gửi thông báo cho toàn bộ thành viên đang ở (thông báo toàn nhà).';

-- ---------------------------------------------------------------------
-- 4.5.92  AI: cổng chặn trước khi gọi (bật/tắt, dữ liệu cấm gửi ra ngoài, đồng ý, ngân sách) + tổng hợp chi phí
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_ai_job_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_t      public.ai_task_types%ROWTYPE;
  v_b      public.ai_budgets%ROWTYPE;
  v_reason text;
BEGIN
  SELECT * INTO v_t FROM public.ai_task_types t WHERE t.code = NEW.task_code;
  IF NOT v_t.is_enabled THEN
    v_reason := 'Tính năng AI chưa được bật.';
  ELSIF NOT app.setting_bool('feature.ai.enabled') THEN
    v_reason := 'Tính năng AI đang tắt toàn hệ thống (settings feature.ai.enabled).';
  ELSIF NOT v_t.external_call_allowed AND COALESCE(NEW.provider, 'unspecified') NOT IN ('self_hosted', 'local', 'rule_based') THEN
    v_reason := 'BR-AI-02: dữ liệu loại ' || v_t.data_class || ' không được gửi tới dịch vụ AI bên thứ ba.';
  ELSIF v_t.required_consent_purpose IS NOT NULL AND NEW.subject_member_id IS NOT NULL
        AND NOT app.has_active_consent(NEW.subject_member_id, v_t.required_consent_purpose) THEN
    v_reason := 'BR-AI-03: chủ thể dữ liệu chưa đồng ý mục đích ' || v_t.required_consent_purpose || '.';
  ELSE
    SELECT * INTO v_b FROM public.ai_budgets b WHERE b.month = date_trunc('month', app.local_today())::date;
    IF FOUND AND v_b.hard_stop AND v_b.used_vnd >= v_b.limit_vnd THEN
      v_reason := 'BR-AI-04: đã vượt ngân sách AI tháng này.';
    END IF;
  END IF;
  IF v_reason IS NOT NULL THEN
    NEW.status := 'blocked';
    NEW.blocked_reason := v_reason;
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_ai_job_gate() IS 'BEFORE INSERT ai_jobs: chặn (status=blocked + lý do) nếu tác vụ chưa bật hoặc công tắc tổng settings feature.ai.enabled đang tắt, dữ liệu never_external gọi dịch vụ ngoài, thiếu đồng ý còn hiệu lực, hoặc vượt ngân sách cứng. Hệ thống nghiệp vụ không phụ thuộc kết quả AI.';

CREATE TRIGGER trg_ai_jobs__gate
  BEFORE INSERT ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION app.tg_ai_job_gate();

CREATE OR REPLACE FUNCTION app.tg_ai_job_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('succeeded', 'failed') AND OLD.status NOT IN ('succeeded', 'failed') THEN
    INSERT INTO public.ai_usage_daily (usage_date, task_code, jobs, failed_jobs, tokens_in, tokens_out, cost_vnd)
    VALUES (app.local_today(), NEW.task_code, 1, CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END, NEW.tokens_in, NEW.tokens_out, NEW.cost_vnd)
    ON CONFLICT (usage_date, task_code) DO UPDATE
      SET jobs = public.ai_usage_daily.jobs + 1,
          failed_jobs = public.ai_usage_daily.failed_jobs + EXCLUDED.failed_jobs,
          tokens_in = public.ai_usage_daily.tokens_in + EXCLUDED.tokens_in,
          tokens_out = public.ai_usage_daily.tokens_out + EXCLUDED.tokens_out,
          cost_vnd = public.ai_usage_daily.cost_vnd + EXCLUDED.cost_vnd;
    UPDATE public.ai_budgets SET used_vnd = used_vnd + NEW.cost_vnd, updated_at = now()
     WHERE month = date_trunc('month', app.local_today())::date;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_ai_jobs__usage
  AFTER UPDATE OF status ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION app.tg_ai_job_usage();

CREATE OR REPLACE FUNCTION app.fn_decide_ai_suggestion(p_suggestion_id uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := app.current_user_id();
  v_s   public.ai_suggestions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('ai.review') THEN
    RAISE EXCEPTION 'Không có quyền duyệt gợi ý AI.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_s FROM public.ai_suggestions s WHERE s.id = p_suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gợi ý không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_s.status <> 'pending' OR v_s.expires_at < now() THEN
    RAISE EXCEPTION 'Gợi ý đã được xử lý hoặc hết hạn.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.ai_suggestions
     SET status = CASE WHEN p_accept THEN 'accepted'::ai_suggestion_status_t ELSE 'rejected'::ai_suggestion_status_t END,
         reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
   WHERE id = p_suggestion_id;
END
$$;
COMMENT ON FUNCTION app.fn_decide_ai_suggestion(uuid, boolean, text) IS 'Người có quyền ai.review chấp nhận/từ chối gợi ý (BR-AI-01). Việc áp dụng thực tế vào nghiệp vụ do chính người duyệt thao tác ở màn hình nghiệp vụ; AI không tự ghi.';

-- Mốc "đã đọc" / "đã xác nhận" của thông báo chỉ đặt MỘT lần: người dùng không xóa/lùi mốc đã xác nhận một thông báo bắt buộc
CREATE OR REPLACE FUNCTION app.tg_notifications_monotonic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
     OR (OLD.acked_at IS NOT NULL AND NEW.acked_at IS DISTINCT FROM OLD.acked_at) THEN
    RAISE EXCEPTION 'Mốc đã đọc/đã xác nhận của thông báo chỉ được đặt một lần, không sửa hay xóa.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_notifications_monotonic() IS 'BEFORE UPDATE notifications: read_at/acked_at đã có giá trị thì bất biến (bằng chứng đã đọc/đã xác nhận).';

CREATE TRIGGER trg_notifications__monotonic
  BEFORE UPDATE OF read_at, acked_at ON notifications
  FOR EACH ROW EXECUTE FUNCTION app.tg_notifications_monotonic();

-- ---------------------------------------------------------------------
-- 4.5.93  Dọn dẹp & hết hạn định kỳ (worker gọi mỗi giờ; idempotent)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_housekeeping()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_notif  integer;
  v_login  integer;
  v_idem   integer;
  v_tokens integer;
  v_resets integer;
  v_orphan integer;
  v_ai     integer;
  v_sug    integer;
  v_swaps  integer;
  v_polls  integer;
  v_parts  integer;
BEGIN
  DELETE FROM public.notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days';
  GET DIAGNOSTICS v_notif = ROW_COUNT;
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '90 days';
  GET DIAGNOSTICS v_login = ROW_COUNT;
  DELETE FROM public.idempotency_keys WHERE expires_at < now();
  GET DIAGNOSTICS v_idem = ROW_COUNT;
  DELETE FROM public.refresh_tokens WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS v_tokens = ROW_COUNT;
  DELETE FROM public.password_resets WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_resets = ROW_COUNT;
  UPDATE public.storage_files
     SET status = 'deleted', deleted_at = now(), purge_after = now() + interval '7 days'
   WHERE deleted_at IS NULL AND attached_at IS NULL
     AND status IN ('pending_upload', 'uploaded', 'processing', 'ready', 'rejected')
     AND created_at < now() - make_interval(hours => app.setting_int('upload.orphan_ttl_hours')::int)
     -- Tệp được tham chiếu TRỰC TIẾP bằng khóa ngoại (ảnh album, ảnh bìa, ảnh đại diện, ảnh minh chứng check-in) không đi qua media_attachments
     -- nên attached_at vẫn NULL: không được coi là mồ côi (nếu không, ảnh đang dùng bị xóa sau 24 giờ).
     AND NOT EXISTS (SELECT 1 FROM public.album_photos ap WHERE ap.file_id = storage_files.id)
     AND NOT EXISTS (SELECT 1 FROM public.albums al WHERE al.cover_file_id = storage_files.id)
     AND NOT EXISTS (SELECT 1 FROM public.members mb WHERE mb.avatar_file_id = storage_files.id)
     AND NOT EXISTS (SELECT 1 FROM public.duty_checkins dc WHERE dc.evidence_file_id = storage_files.id);
  GET DIAGNOSTICS v_orphan = ROW_COUNT;
  DELETE FROM public.ai_jobs WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_ai = ROW_COUNT;
  UPDATE public.ai_suggestions SET status = 'expired' WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_sug = ROW_COUNT;
  UPDATE public.duty_swap_requests SET status = 'expired' WHERE status IN ('pending_peer', 'pending_admin') AND expires_at < now();
  GET DIAGNOSTICS v_swaps = ROW_COUNT;
  v_polls := app.fn_close_expired_polls();
  v_parts := app.ensure_monthly_partitions('public.audit_logs'::regclass, 3);
  RETURN jsonb_build_object(
    'notifications_deleted', v_notif, 'login_attempts_deleted', v_login, 'idempotency_deleted', v_idem,
    'refresh_tokens_deleted', v_tokens, 'password_resets_deleted', v_resets, 'orphan_files_marked', v_orphan,
    'ai_jobs_deleted', v_ai, 'ai_suggestions_expired', v_sug, 'swap_requests_expired', v_swaps,
    'polls_closed', v_polls, 'audit_partitions_created', v_parts);
END
$$;
COMMENT ON FUNCTION app.fn_housekeeping() IS 'Dọn dẹp hằng giờ: thông báo đã đọc > 90 ngày, nhật ký đăng nhập > 90 ngày, khóa idempotency/token hết hạn, tệp mồ côi quá ngưỡng (đánh dấu xóa; worker xóa object ở storage khi purge_after; tệp đang được ảnh album, ảnh bìa, ảnh đại diện hoặc ảnh minh chứng check-in tham chiếu trực tiếp thì không bị coi là mồ côi), tác vụ AI > 180 ngày, hết hạn gợi ý AI và đơn đổi ca, đóng poll quá hạn, tạo phân vùng audit_logs 3 tháng tới. Chạy bằng tài khoản luuxa_worker (BYPASSRLS).';
