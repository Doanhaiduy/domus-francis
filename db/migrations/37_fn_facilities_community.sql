-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (8/8, phần 1): CƠ SỞ VẬT CHẤT & CỘNG ĐOÀN
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.80  Sự cố: SLA theo mức khẩn, máy trạng thái, nhật ký, mốc thời gian, chi phí → phiếu chi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_issue_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sla_due_at := now() + make_interval(hours => app.setting_int('facility.sla_hours.' || NEW.urgency::text)::int);
    -- Mốc tiến độ/nghiệm thu do hệ thống ghi khi chuyển trạng thái: phiếu mới (luôn ở trạng thái new) không mang theo các mốc này
    NEW.accepted_at := NULL; NEW.resolved_at := NULL; NEW.verified_by := NULL; NEW.verified_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.reporter_member_id IS DISTINCT FROM OLD.reporter_member_id THEN
    RAISE EXCEPTION 'Không đổi người báo.' USING ERRCODE = 'check_violation';
  END IF;
  -- BR-FAC-05: RLS cho người báo sửa phiếu của mình, nhưng không cho tự đổi tiến độ/hạn SLA/nghiệm thu (chỉ nội dung phiếu và hủy phiếu).
  -- Chỉ áp dụng cho vai trò chịu RLS (luuxa_app): nghiệm thu đi qua app.fn_verify_issue (SECURITY DEFINER của luuxa_definer, BYPASSRLS ⇒ không bị chặn ở đây);
  -- superuser/migration và worker cũng không bị chặn.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls))
     AND NOT app.has_any_permission(ARRAY['issue.triage', 'issue.resolve']) THEN
    IF NEW.sla_due_at IS DISTINCT FROM OLD.sla_due_at OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.duplicate_of_id IS DISTINCT FROM OLD.duplicate_of_id
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled') THEN
      RAISE EXCEPTION 'BR-FAC-05: người báo chỉ được sửa nội dung hoặc hủy phiếu của mình; tiến độ, hạn SLA, phiếu trùng và nghiệm thu do người có quyền issue.triage/issue.resolve (hoặc app.fn_verify_issue) ghi.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.urgency IS DISTINCT FROM OLD.urgency AND NEW.status IN ('new', 'in_progress', 'waiting_parts') THEN
    NEW.sla_due_at := OLD.created_at + make_interval(hours => app.setting_int('facility.sla_hours.' || NEW.urgency::text)::int);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'in_progress' AND NEW.accepted_at IS NULL THEN NEW.accepted_at := now(); END IF;
    IF NEW.status = 'done' THEN NEW.resolved_at := now(); END IF;
    IF OLD.status = 'done' AND NEW.status <> 'done' THEN
      NEW.resolved_at := NULL; NEW.verified_at := NULL; NEW.verified_by := NULL;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.tg_issue_before_write() IS 'BEFORE INSERT/UPDATE maintenance_issues: sinh sla_due_at theo settings facility.sla_hours.<mức khẩn>, ghi mốc accepted_at/resolved_at, không đổi người báo, và BR-FAC-05 (người báo không có issue.triage/issue.resolve chỉ sửa nội dung hoặc hủy phiếu).';

CREATE TRIGGER trg_maintenance_issues__before_write
  BEFORE INSERT OR UPDATE ON maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION app.tg_issue_before_write();

CREATE TRIGGER trg_maintenance_issues__state
  BEFORE INSERT OR UPDATE OF status ON maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["new"],
      "new":["in_progress","waiting_parts","cancelled","duplicate"],
      "in_progress":["waiting_parts","done","cancelled","duplicate"],
      "waiting_parts":["in_progress","done","cancelled"],
      "done":["in_progress"],
      "cancelled":[],"duplicate":[]}');

CREATE TRIGGER trg_maintenance_issues__history
  AFTER INSERT OR UPDATE OF status ON maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION app.tg_status_history('issue_status_history', 'issue_id');

CREATE TRIGGER trg_issue_status_history__immutable
  BEFORE UPDATE OR DELETE ON issue_status_history
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

CREATE OR REPLACE FUNCTION app.fn_verify_issue(p_issue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_i   public.maintenance_issues%ROWTYPE;
  v_uid uuid := app.current_user_id();
BEGIN
  SELECT * INTO v_i FROM public.maintenance_issues i WHERE i.id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sự cố không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_uid IS NULL OR NOT (v_i.reporter_member_id = app.current_member_id() OR app.has_permission('issue.resolve')) THEN
    RAISE EXCEPTION 'Chỉ người báo hoặc người có quyền xử lý mới xác nhận được.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_i.status <> 'done' THEN RAISE EXCEPTION 'Chỉ xác nhận sự cố đã xong.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.maintenance_issues SET verified_by = v_uid, verified_at = now() WHERE id = p_issue_id;
END
$$;
COMMENT ON FUNCTION app.fn_verify_issue(uuid) IS 'Xác nhận nghiệm thu sửa chữa bởi người báo hoặc người có quyền issue.resolve. SECURITY DEFINER: kiểm quyền trong thân hàm (không phụ thuộc chính sách UPDATE của RLS) và là đường duy nhất ghi verified_by/verified_at (trigger BR-FAC-05 chặn ghi trực tiếp từ luuxa_app).';

-- Phiếu chi gắn sự cố đã chi ⇒ tự ghi chi phí thực (actual)
CREATE OR REPLACE FUNCTION app.tg_voucher_paid_to_repair_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.maintenance_issue_id IS NOT NULL THEN
    INSERT INTO public.repair_costs (issue_id, cost_kind, amount_vnd, description, expense_voucher_id, created_by)
    VALUES (NEW.maintenance_issue_id, 'actual', NEW.amount_vnd, 'Chi theo phiếu ' || NEW.voucher_no || ': ' || NEW.title, NEW.id, NEW.paid_recorded_by)
    ON CONFLICT (expense_voucher_id) DO NOTHING;
  ELSIF NEW.status = 'reversed' AND OLD.status = 'paid' AND NEW.maintenance_issue_id IS NOT NULL THEN
    -- Phiếu chi đã bị đảo (tiền hoàn lại quỹ) ⇒ gỡ chi phí thực tương ứng để v_issue_costs không tính tiền đã hoàn (audit ghi lại dòng bị xóa)
    DELETE FROM public.repair_costs WHERE expense_voucher_id = NEW.id AND cost_kind = 'actual';
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_voucher_paid_to_repair_cost() IS 'AFTER UPDATE OF status expense_vouchers (SECURITY DEFINER): phiếu gắn sự cố chuyển sang paid ⇒ tự ghi chi phí thực (actual); chuyển paid → reversed ⇒ gỡ chi phí thực đó.';

CREATE TRIGGER trg_expense_vouchers__repair_cost
  AFTER UPDATE OF status ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION app.tg_voucher_paid_to_repair_cost();

CREATE OR REPLACE FUNCTION app.fn_propose_repair_expense(
  p_issue_id  uuid,
  p_amount_vnd bigint,
  p_title     text,
  p_category_id uuid,
  p_fund_id   uuid,
  p_vendor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_voucher uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('issue.cost.propose') THEN
    RAISE EXCEPTION 'Không có quyền đề xuất chi phí sửa chữa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by, maintenance_issue_id, payee_name)
  VALUES (p_title, p_amount_vnd, p_category_id, app.local_today(), p_fund_id, v_uid, p_issue_id,
          (SELECT v.name FROM public.vendors v WHERE v.id = p_vendor_id))
  RETURNING id INTO v_voucher;
  INSERT INTO public.repair_costs (issue_id, cost_kind, amount_vnd, description, vendor_id, created_by)
  VALUES (p_issue_id, 'estimate', p_amount_vnd, p_title, p_vendor_id, v_uid);
  RETURN v_voucher;
END
$$;
COMMENT ON FUNCTION app.fn_propose_repair_expense(uuid, bigint, text, uuid, uuid, uuid) IS 'Từ sự cố tạo phiếu chi NHÁP liên kết (maintenance_issue_id) + dòng dự toán; người đề xuất nộp duyệt như phiếu chi thường (BR-FAC-04). Khi phiếu paid, chi phí thực được ghi tự động.';

-- ---------------------------------------------------------------------
-- 4.5.80b  Mượn đồ dùng chung: máy trạng thái một chiều + BR-FAC-06 (chỉ đồ cho mượn đang sử dụng, người mượn đang ở)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_asset_loans__state
  BEFORE INSERT OR UPDATE OF status ON asset_loans
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["open"],
      "open":["returned","lost"],
      "returned":[],"lost":[]}');

CREATE OR REPLACE FUNCTION app.tg_asset_loan_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_asset   public.assets%ROWTYPE;
  v_mstatus member_status_t;
BEGIN
  SELECT * INTO v_asset FROM public.assets a WHERE a.id = NEW.asset_id AND a.deleted_at IS NULL;
  IF NOT FOUND OR NOT v_asset.is_loanable OR v_asset.status <> 'in_service' THEN
    RAISE EXCEPTION 'BR-FAC-06: chỉ cho mượn tài sản được đánh dấu cho mượn (is_loanable) và đang sử dụng (in_service).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT m.status INTO v_mstatus FROM public.members m WHERE m.id = NEW.borrower_member_id AND m.deleted_at IS NULL;
  IF v_mstatus IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'BR-FAC-06: chỉ thành viên đang ở được mượn đồ.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_asset_loan_rules() IS 'BEFORE INSERT asset_loans (BR-FAC-06): tài sản còn tồn tại, is_loanable = true, status = in_service; người mượn là thành viên đang ở. Chống mượn chồng do EXCLUDE ex_asset_loans__one_borrower; vòng đời open → returned | lost do trg_asset_loans__state.';

CREATE TRIGGER trg_asset_loans__rules
  BEFORE INSERT ON asset_loans
  FOR EACH ROW EXECUTE FUNCTION app.tg_asset_loan_rules();

-- ---------------------------------------------------------------------
-- 4.5.81  Đặt lịch giặt: khung giờ, hạn mức/tuần, đặt trước tối đa, tự hủy no-show, danh sách chờ
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_laundry_bookings__state
  BEFORE INSERT OR UPDATE OF status ON laundry_bookings
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["booked"],
      "booked":["checked_in","cancelled","no_show"],
      "checked_in":["completed"],
      "completed":[],"cancelled":[],"no_show":[]}');

CREATE OR REPLACE FUNCTION app.tg_laundry_booking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_machine_status text;
  v_local_date     date;
  v_slot_ok        boolean;
  v_week_start     date;
  v_week_count     integer;
  v_max_week       integer := app.setting_int('laundry.max_per_week');
  v_ahead          integer := app.setting_int('laundry.max_days_ahead');
  v_mstatus        member_status_t;
BEGIN
  SELECT lm.status INTO v_machine_status FROM public.laundry_machines lm WHERE lm.id = NEW.machine_id;
  IF v_machine_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Máy giặt không hoạt động.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT m.status INTO v_mstatus FROM public.members m WHERE m.id = NEW.member_id AND m.deleted_at IS NULL;
  IF v_mstatus IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Chỉ thành viên đang ở được đặt máy giặt.' USING ERRCODE = 'check_violation';
  END IF;

  v_local_date := app.local_date(NEW.starts_at);
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(app.setting_json('laundry.slots')) AS s
     WHERE ((v_local_date + (s ->> 0)::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') = NEW.starts_at
       AND ((v_local_date + (s ->> 1)::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') = NEW.ends_at
  ) INTO v_slot_ok;
  IF NOT v_slot_ok THEN
    RAISE EXCEPTION 'BR-LAU-01: thời gian đặt phải đúng một khung giờ cấu hình (settings laundry.slots).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.starts_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'BR-LAU-02: không đặt lượt đã qua.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.starts_at > now() + make_interval(days => v_ahead) THEN
    RAISE EXCEPTION 'BR-LAU-02: chỉ đặt trước tối đa % ngày.', v_ahead USING ERRCODE = 'check_violation';
  END IF;

  v_week_start := date_trunc('week', v_local_date)::date;
  SELECT COUNT(*) INTO v_week_count
    FROM public.laundry_bookings b
   WHERE b.member_id = NEW.member_id AND b.status IN ('booked', 'checked_in', 'completed')
     AND date_trunc('week', app.local_date(b.starts_at))::date = v_week_start;
  IF v_week_count >= v_max_week THEN
    RAISE EXCEPTION 'BR-LAU-03: đã đủ % lượt giặt trong tuần.', v_max_week USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_laundry_booking_rules() IS 'BEFORE INSERT laundry_bookings (BR-LAU-01..03): máy hoạt động, thành viên đang ở, đúng khung giờ cấu hình, không đặt quá khứ/quá xa, hạn mức lượt/tuần. Chống trùng máy do EXCLUDE ex_laundry_bookings__no_overlap.';

CREATE TRIGGER trg_laundry_bookings__rules
  BEFORE INSERT ON laundry_bookings
  FOR EACH ROW EXECUTE FUNCTION app.tg_laundry_booking_rules();

CREATE OR REPLACE FUNCTION app.tg_laundry_booking_apply_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'checked_in' AND OLD.status = 'booked' THEN
    IF now() < NEW.starts_at - interval '10 minutes' THEN
      RAISE EXCEPTION 'Chưa đến giờ bắt đầu lượt giặt.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.checked_in_at := now();
  ELSIF NEW.status IN ('cancelled', 'no_show') AND OLD.status = 'booked' THEN
    NEW.cancelled_at := now();
    IF NEW.status = 'cancelled' AND NEW.starts_at - now() < make_interval(mins => app.setting_int('laundry.cancel_min_minutes')::int)
       AND app.current_user_id() IS NOT NULL AND NOT app.has_permission('laundry.manage') THEN
      RAISE EXCEPTION 'BR-LAU-04: chỉ được hủy trước giờ bắt đầu ít nhất % phút.', app.setting_int('laundry.cancel_min_minutes')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_laundry_bookings__apply_status
  BEFORE UPDATE OF status ON laundry_bookings
  FOR EACH ROW EXECUTE FUNCTION app.tg_laundry_booking_apply_status();

-- BR-LAU-05: khung giờ/hạn mức (BR-LAU-01..03) chỉ kiểm khi INSERT, nên người đặt không được tự đổi máy/giờ/người của lượt đã đặt qua UPDATE
-- (muốn đổi lịch thì hủy và đặt lại); người có laundry.manage được điều chỉnh (exclusion constraint vẫn chống trùng).
CREATE TRIGGER trg_laundry_bookings__guard
  BEFORE UPDATE OF machine_id, member_id, starts_at, ends_at ON laundry_bookings
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-LAU-05', 'laundry.manage', 'machine_id,member_id,starts_at,ends_at', '');

CREATE OR REPLACE FUNCTION app.fn_expire_laundry_noshows()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.laundry_bookings
     SET status = 'no_show', cancelled_at = now(), cancel_reason = 'Tự động: không check-in'
   WHERE status = 'booked'
     AND starts_at + make_interval(mins => app.setting_int('laundry.noshow_cancel_minutes')::int) < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.laundry_waitlist w
     SET status = 'offered', offered_at = now()
   WHERE w.status = 'waiting' AND w.starts_at > now()
     AND EXISTS (
       SELECT 1 FROM public.laundry_machines lm
        WHERE lm.status = 'active' AND (w.machine_id IS NULL OR w.machine_id = lm.id)
          AND NOT EXISTS (SELECT 1 FROM public.laundry_bookings b
                           WHERE b.machine_id = lm.id AND b.status IN ('booked', 'checked_in')
                             AND b.during && tstzrange(w.starts_at, w.ends_at, '[)')));
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_expire_laundry_noshows() IS 'Worker chạy mỗi 5 phút: lượt booked quá laundry.noshow_cancel_minutes phút sau giờ bắt đầu mà chưa check-in ⇒ no_show (trả khung giờ); người chờ có khung giờ trống ⇒ offered.';

-- ---------------------------------------------------------------------
-- 4.5.82  Bộ đếm phi chuẩn hóa (like, ảnh, bình luận, hiệp ý)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_album_photos__count
  AFTER INSERT OR DELETE ON album_photos
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter('albums', 'photos_count', 'album_id');
CREATE TRIGGER trg_album_likes__count
  AFTER INSERT OR DELETE ON album_likes
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter('albums', 'likes_count', 'album_id');
CREATE TRIGGER trg_photo_likes__count
  AFTER INSERT OR DELETE ON photo_likes
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter('album_photos', 'likes_count', 'photo_id');
CREATE TRIGGER trg_forum_comments__count
  AFTER INSERT OR DELETE ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter('forum_posts', 'comments_count', 'post_id');
CREATE TRIGGER trg_prayer_responses__count
  AFTER INSERT OR DELETE ON prayer_responses
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter('prayer_intentions', 'prayer_count', 'intention_id');
CREATE TRIGGER trg_forum_reactions__post_ins
  AFTER INSERT ON forum_reactions
  FOR EACH ROW WHEN (NEW.post_id IS NOT NULL)
  EXECUTE FUNCTION app.tg_adjust_counter('forum_posts', 'reactions_count', 'post_id');
CREATE TRIGGER trg_forum_reactions__post_del
  AFTER DELETE ON forum_reactions
  FOR EACH ROW WHEN (OLD.post_id IS NOT NULL)
  EXECUTE FUNCTION app.tg_adjust_counter('forum_posts', 'reactions_count', 'post_id');
CREATE TRIGGER trg_forum_reactions__comment_ins
  AFTER INSERT ON forum_reactions
  FOR EACH ROW WHEN (NEW.comment_id IS NOT NULL)
  EXECUTE FUNCTION app.tg_adjust_counter('forum_comments', 'reactions_count', 'comment_id');
CREATE TRIGGER trg_forum_reactions__comment_del
  AFTER DELETE ON forum_reactions
  FOR EACH ROW WHEN (OLD.comment_id IS NOT NULL)
  EXECUTE FUNCTION app.tg_adjust_counter('forum_comments', 'reactions_count', 'comment_id');

-- ---------------------------------------------------------------------
-- 4.5.82b  Khoảnh khắc (album): BR-COM-06 bảo vệ cột, BR-COM-07 thẻ tên cần người được gắn thẻ chấp nhận
-- ---------------------------------------------------------------------
-- BR-COM-06 (album/ảnh): tác giả sửa được album/ảnh của mình (RLS) nhưng không tự đặt "nổi bật", bỏ ẩn nội dung bị kiểm duyệt hay sửa bộ đếm tim/ảnh
-- (bộ đếm chỉ do trigger SECURITY DEFINER duy trì; nổi bật/ẩn/khóa là quyền của người kiểm duyệt album.moderate)
CREATE TRIGGER trg_albums__guard
  BEFORE INSERT OR UPDATE ON albums
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-COM-06', 'album.moderate', 'is_featured,status', 'likes_count,photos_count');
CREATE TRIGGER trg_album_photos__guard
  BEFORE INSERT OR UPDATE ON album_photos
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-COM-06', 'album.moderate', 'status', 'likes_count');

-- BR-COM-07: người gắn thẻ chỉ tạo được thẻ pending; chỉ người được gắn thẻ (hoặc người kiểm duyệt album) chuyển sang accepted/declined —
-- trừ khi người được gắn thẻ đã đồng ý mục đích photo_tagging (khi đó thẻ tạo ra được accepted ngay). Thẻ đã có không đổi album/người được gắn thẻ.
-- Hàm SECURITY INVOKER: chỉ chặn phiên chịu RLS (luuxa_app); superuser/worker/hàm SECURITY DEFINER (BYPASSRLS) không bị chặn (giống app.tg_guard_columns).
CREATE OR REPLACE FUNCTION app.tg_album_tag_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.album_id IS DISTINCT FROM OLD.album_id OR NEW.member_id IS DISTINCT FROM OLD.member_id THEN
      RAISE EXCEPTION 'BR-COM-07: không đổi album hoặc người được gắn thẻ của thẻ đã có; hãy xóa rồi gắn lại.' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.responded_at IS DISTINCT FROM OLD.responded_at)
       AND NOT (app.is_self(NEW.member_id) OR app.has_permission('album.moderate')) THEN
      RAISE EXCEPTION 'BR-COM-07: chỉ người được gắn thẻ (hoặc người kiểm duyệt album) mới chấp nhận/từ chối thẻ tên.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF (NEW.status <> 'pending' OR NEW.responded_at IS NOT NULL)
        AND NOT (app.is_self(NEW.member_id) OR app.has_permission('album.moderate') OR app.has_active_consent(NEW.member_id, 'photo_tagging')) THEN
    RAISE EXCEPTION 'BR-COM-07: thẻ tên mới phải ở trạng thái pending cho đến khi người được gắn thẻ chấp nhận (trừ khi họ đã đồng ý photo_tagging).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_album_tag_rules() IS 'BEFORE INSERT/UPDATE album_member_tags (BR-COM-07): người gắn thẻ chỉ tạo thẻ pending (trừ khi người được gắn thẻ đã đồng ý photo_tagging, là chính họ hoặc người kiểm duyệt); chỉ người được gắn thẻ hoặc người có album.moderate đổi status/responded_at; không đổi album_id/member_id của thẻ đã có. Chỉ áp dụng cho phiên chịu RLS.';

CREATE TRIGGER trg_album_member_tags__rules
  BEFORE INSERT OR UPDATE ON album_member_tags
  FOR EACH ROW EXECUTE FUNCTION app.tg_album_tag_rules();

-- ---------------------------------------------------------------------
-- 4.5.83  Diễn đàn: bình luận chỉ khi bài mở, trả lời lồng tối đa 1 cấp, cập nhật hoạt động cuối
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_forum_comment_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_post_status content_status_t;
  v_parent      public.forum_comments%ROWTYPE;
BEGIN
  SELECT p.status INTO v_post_status FROM public.forum_posts p WHERE p.id = NEW.post_id AND p.deleted_at IS NULL;
  IF v_post_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'BR-COM-03: bài viết không nhận bình luận (đã khóa/ẩn/xóa).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.forum_comments c WHERE c.id = NEW.parent_id;
    IF NOT FOUND OR v_parent.post_id <> NEW.post_id THEN
      RAISE EXCEPTION 'Bình luận cha không thuộc bài viết này.' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Chỉ cho phép trả lời một cấp.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_forum_comments__rules
  BEFORE INSERT ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION app.tg_forum_comment_rules();

CREATE OR REPLACE FUNCTION app.tg_forum_post_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE public.forum_posts SET last_activity_at = now() WHERE id = NEW.post_id;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_forum_comments__activity
  AFTER INSERT ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION app.tg_forum_post_activity();

-- BR-COM-06: tác giả sửa được bài/bình luận của mình (RLS) nhưng không tự ghim, bỏ ẩn nội dung bị kiểm duyệt hay sửa bộ đếm
-- (bộ đếm chỉ do trigger SECURITY DEFINER duy trì; ghim/ẩn/khóa là quyền của người kiểm duyệt)
CREATE TRIGGER trg_forum_posts__guard
  BEFORE INSERT OR UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-COM-06', 'forum.moderate', 'is_pinned,status', 'comments_count,reactions_count,last_activity_at');
CREATE TRIGGER trg_forum_comments__guard
  BEFORE INSERT OR UPDATE ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-COM-06', 'forum.moderate', 'status', 'reactions_count');

-- ---------------------------------------------------------------------
-- 4.5.84  Ý chỉ cầu nguyện ẩn danh thật + truy cập tác giả có kiểm soát
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_post_prayer(p_content text, p_anonymous boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me uuid := app.current_member_id();
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO public.prayer_intentions (content, is_anonymous, author_member_id)
  VALUES (p_content, p_anonymous, CASE WHEN p_anonymous THEN NULL ELSE v_me END)
  RETURNING id INTO v_id;
  IF p_anonymous THEN
    INSERT INTO public.prayer_intention_authors (intention_id, author_member_id) VALUES (v_id, v_me);
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_post_prayer(text, boolean) IS 'Gửi ý chỉ cầu nguyện: ẩn danh thì tác giả chỉ được ghi ở prayer_intention_authors; bảng chính giữ author NULL.';

CREATE OR REPLACE FUNCTION app.fn_reveal_prayer_author(p_intention_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('prayer.reveal_author') THEN
    RAISE EXCEPTION 'Không có quyền xem tác giả ý cầu nguyện ẩn danh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'BR-COM-05: phải nêu lý do (≥ 10 ký tự).' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.content_reports r
                  WHERE r.entity_type = 'prayer_intention' AND r.entity_id = p_intention_id AND r.status = 'open') THEN
    RAISE EXCEPTION 'BR-COM-05: chỉ được xem tác giả khi có báo cáo vi phạm đang mở về ý chỉ này.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT a.author_member_id INTO v_author FROM public.prayer_intention_authors a WHERE a.intention_id = p_intention_id;
  PERFORM app.write_audit('READ_SENSITIVE', 'prayer_intention_authors', p_intention_id::text, p_reason);
  RETURN v_author;
END
$$;
COMMENT ON FUNCTION app.fn_reveal_prayer_author(uuid, text) IS 'Trưởng nhà xem tác giả ý chỉ ẩn danh CHỈ khi có báo cáo vi phạm mở, kèm lý do; mỗi lần gọi ghi audit READ_SENSITIVE.';

-- BR-COM-06: prayer_count do trigger đếm hiệp ý duy trì; ẩn/khóa ý chỉ (visibility) là quyền của người kiểm duyệt
CREATE TRIGGER trg_prayer_intentions__guard
  BEFORE INSERT OR UPDATE ON prayer_intentions
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-COM-06', 'prayer.moderate', 'visibility', 'prayer_count');

-- ---------------------------------------------------------------------
-- 4.5.85  Thông báo (bài đăng): mốc công bố, ghi nhận đọc/xác nhận theo từng người
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_announcement_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  IF NEW.is_pinned AND NEW.pinned_until IS NULL THEN
    NEW.pinned_until := now() + interval '14 days';
  END IF;
  IF NOT NEW.is_pinned THEN
    NEW.pinned_until := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_announcements__before_write
  BEFORE INSERT OR UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION app.tg_announcement_before_write();

-- BR-COM-06: người soạn thông báo (announcement.create) không tự ghim hay đặt "cần xác nhận đã đọc" — quyền announcement.pin
CREATE TRIGGER trg_announcements__guard
  BEFORE INSERT OR UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-COM-06', 'announcement.pin', 'is_pinned,pinned_until,requires_ack,ack_deadline', '');

CREATE OR REPLACE FUNCTION app.fn_mark_announcement_read(p_announcement_id uuid, p_acknowledge boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_me  uuid := app.current_member_id();
  v_req boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT a.requires_ack INTO v_req FROM public.announcements a WHERE a.id = p_announcement_id AND a.status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'Thông báo không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF p_acknowledge AND NOT v_req THEN
    RAISE EXCEPTION 'Thông báo này không yêu cầu xác nhận.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.announcement_reads (announcement_id, member_id, acknowledged_at)
  VALUES (p_announcement_id, v_me, CASE WHEN p_acknowledge THEN now() END)
  ON CONFLICT (announcement_id, member_id) DO UPDATE
    SET acknowledged_at = COALESCE(public.announcement_reads.acknowledged_at, EXCLUDED.acknowledged_at);
END
$$;
COMMENT ON FUNCTION app.fn_mark_announcement_read(uuid, boolean) IS 'Ghi đã đọc (và tùy chọn xác nhận) CHO CHÍNH NGƯỜI GỌI — thay cho markAnnouncementRead đặt cờ isUnread toàn cục.';

-- ---------------------------------------------------------------------
-- 4.5.86  Đăng ký bữa ăn: sau giờ chốt chỉ người quản lý sửa được
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_meal_registration_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz;
  v_status text;
BEGIN
  IF NOT app.setting_bool('feature.meals.enabled') THEN
    RAISE EXCEPTION 'Phân hệ Bếp & Cơm đang tạm hoãn theo quyết định người quản lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT m.cutoff_at, m.status INTO v_cutoff, v_status FROM public.meal_menus m WHERE m.id = NEW.menu_id;
  IF v_status NOT IN ('open') AND NOT (app.current_user_id() IS NOT NULL AND app.has_permission('meal.manage')) THEN
    RAISE EXCEPTION 'Bữa ăn không mở đăng ký.' USING ERRCODE = 'check_violation';
  END IF;
  IF now() > v_cutoff AND app.current_user_id() IS NOT NULL AND NOT app.has_permission('meal.manage') THEN
    RAISE EXCEPTION 'BR-MEAL-01: đã quá giờ chốt suất ăn.' USING ERRCODE = 'check_violation';
  END IF;
  IF app.current_user_id() IS NOT NULL AND NEW.member_id <> COALESCE(app.current_member_id(), NEW.member_id)
     AND NOT app.has_permission('meal.manage') THEN
    RAISE EXCEPTION 'BR-MEAL-02: chỉ được đăng ký suất của chính mình (đăng ký hộ cần quyền meal.manage).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.registered_by := COALESCE(app.current_user_id(), NEW.registered_by);
  NEW.registered_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_meal_registration_rules() IS 'BEFORE INSERT/UPDATE meal_registrations: tính năng phải bật (feature.meals.enabled), trước giờ chốt, chỉ tự đăng ký cho mình (FE cho phép sửa suất người khác). Phân hệ đang tạm hoãn nên mặc định bị chặn.';

CREATE TRIGGER trg_meal_registrations__rules
  BEFORE INSERT OR UPDATE ON meal_registrations
  FOR EACH ROW EXECUTE FUNCTION app.tg_meal_registration_rules();

-- ---------------------------------------------------------------------
-- 4.5.87  Nội quy: chỉ một phiên bản hiện hành; ban hành phiên bản mới
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_publish_policy(p_slug text, p_title text, p_content_md text, p_kind text DEFAULT 'house_rules')
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_ver integer;
  v_id  uuid;
BEGIN
  IF app.lacks_permission('policy.manage') THEN
    RAISE EXCEPTION 'Không có quyền ban hành nội quy.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_ver FROM public.policy_documents WHERE slug = p_slug;
  UPDATE public.policy_documents SET is_current = false WHERE slug = p_slug AND is_current;
  INSERT INTO public.policy_documents (slug, title, version, doc_kind, content_md, is_current, published_by)
  VALUES (p_slug, p_title, v_ver, p_kind, p_content_md, true, app.current_user_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_publish_policy(text, text, text, text) IS 'Ban hành phiên bản mới của một tài liệu (slug): gỡ cờ is_current của bản cũ, tăng version; thành viên phải xác nhận lại.';

-- ---------------------------------------------------------------------
-- 4.5.88  Đơn xin vào lưu xá: duyệt ⇒ tạo hồ sơ + vai trò member
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_member_applications__state
  BEFORE INSERT OR UPDATE OF status ON member_applications
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_machine(
    '{"_initial":["submitted"],
      "submitted":["under_review","approved","rejected","withdrawn"],
      "under_review":["approved","rejected","withdrawn"],
      "approved":[],"rejected":[],"withdrawn":[]}');

CREATE OR REPLACE FUNCTION app.fn_approve_member_application(p_application_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_app    public.member_applications%ROWTYPE;
  v_member uuid;
  v_name   text;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('application.review') THEN
    RAISE EXCEPTION 'Không có quyền duyệt đơn.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_app FROM public.member_applications a WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đơn không tồn tại.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_app.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Đơn đã được xử lý (%).', v_app.status USING ERRCODE = 'check_violation';
  END IF;
  v_name := COALESCE(NULLIF(regexp_replace(btrim(v_app.full_name), '^.*\s', ''), ''), v_app.full_name);
  INSERT INTO public.members (user_id, full_name, display_name, contact_phone_e164, contact_email, created_by)
  VALUES (v_app.user_id, v_app.full_name, v_name, v_app.phone_e164, v_app.email, v_uid)
  RETURNING id INTO v_member;
  IF v_app.user_id IS NOT NULL THEN
    UPDATE public.users SET status = 'active' WHERE id = v_app.user_id AND status IN ('invited');
    INSERT INTO public.user_roles (user_id, role_id, granted_by)
    SELECT v_app.user_id, r.id, v_uid FROM public.roles r WHERE r.code = 'member'
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.member_applications
     SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note, resulting_member_id = v_member
   WHERE id = p_application_id;
  RETURN v_member;
END
$$;
COMMENT ON FUNCTION app.fn_approve_member_application(uuid, text) IS 'Duyệt đơn: tạo members, kích hoạt tài khoản (nếu có), gán vai trò member, đóng đơn. SECURITY DEFINER + kiểm quyền application.review trong thân hàm: Phó nhà duyệt được dù RLS chỉ cho Trưởng nhà (auth.role.assign/auth.user.manage) ghi user_roles/users. Việc xếp phòng, ghi nhận đồng ý (consents) và sinh khoản phải thu do các bước nghiệp vụ tiếp theo thực hiện.';

-- BR-MEM-08: người nộp đơn sửa được nội dung đơn và rút đơn (RLS), nhưng không tự duyệt/từ chối hay ghi người duyệt/hồ sơ kết quả
CREATE TRIGGER trg_member_applications__guard
  BEFORE INSERT OR UPDATE ON member_applications
  FOR EACH ROW EXECUTE FUNCTION app.tg_guard_columns('BR-MEM-08', 'application.review', 'status,reviewed_by,reviewed_at,review_note,resulting_member_id', '', '{"status":["withdrawn"]}');
