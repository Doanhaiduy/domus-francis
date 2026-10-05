-- =====================================================================
-- KHỐI 4.6 — ROW-LEVEL SECURITY (1/4): HÀM TRỢ GIÚP CHO CHÍNH SÁCH
-- Mô hình: kết nối runtime dùng một vai trò DB chung (luuxa_app). Mỗi transaction API gán
--   set_config('app.current_user_id', <uuid>, true)
-- ; vai trò & quyền của người đó được TRA TRONG DB (user_roles + role_delegations + role_permissions),
-- không tin bất kỳ "claim" nào do client/ứng dụng truyền vào.
-- RLS cùng các hàm nghiệp vụ SECURITY DEFINER (kiểm quyền trong thân hàm) là lớp THỰC THI QUYỀN Ở TẦNG DỮ LIỆU: một lỗi thiếu WHERE/IDOR
-- ở API không làm lộ hay sửa được dữ liệu ngoài quyền của người dùng. API vẫn kiểm quyền để trả lỗi thân thiện và giảm tải; cả hai lớp
-- không chống được kẻ chạy được SQL tùy ý bằng vai trò luuxa_app (xem Phần 2.5, 9). Phiên API PHẢI chạy dưới vai trò luuxa_app
-- (SET LOCAL ROLE luuxa_app ở đầu mỗi transaction) để app.is_system_caller() và các guard nhận diện đúng.
-- =====================================================================

-- Quyền toàn nhà (global) thỏa MỘT trong các quyền
CREATE OR REPLACE FUNCTION app.has_any_permission(p_permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM app.current_role_grants() g
      JOIN public.roles r             ON r.code = g.role_code
      JOIN public.role_permissions rp ON rp.role_id = r.id
     WHERE rp.permission_code = ANY (p_permissions)
       AND g.scope_type = 'global')
$$;
COMMENT ON FUNCTION app.has_any_permission(text[]) IS 'Người dùng hiện tại có (phạm vi toàn nhà) ít nhất một trong các quyền.';

-- Phó nhà phụ trách một tầng được xếp phòng cho phòng thuộc tầng đó
CREATE OR REPLACE FUNCTION app.can_assign_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_permission('house.assign')
      OR EXISTS (SELECT 1 FROM public.rooms r
                  WHERE r.id = p_room_id AND app.has_permission('house.assign', 'floor', r.floor_id))
$$;

-- Thành viên hiện tại thuộc đối tượng nhận của thông báo?
CREATE OR REPLACE FUNCTION app.is_announcement_target(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.announcement_targets t WHERE t.announcement_id = p_announcement_id)
      OR EXISTS (
        SELECT 1 FROM public.announcement_targets t
         WHERE t.announcement_id = p_announcement_id
           AND (   t.member_id = app.current_member_id()
                OR t.room_id  IN (SELECT ra.room_id FROM public.room_assignments ra
                                   WHERE ra.member_id = app.current_member_id() AND ra.ends_on IS NULL)
                OR t.floor_id IN (SELECT r.floor_id FROM public.room_assignments ra JOIN public.rooms r ON r.id = ra.room_id
                                   WHERE ra.member_id = app.current_member_id() AND ra.ends_on IS NULL)
                OR t.role_id  IN (SELECT ur.role_id FROM public.user_roles ur
                                   WHERE ur.user_id = app.current_user_id() AND ur.revoked_at IS NULL
                                     AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now()))))
$$;
COMMENT ON FUNCTION app.is_announcement_target(uuid) IS 'Thông báo không có dòng đối tượng = gửi toàn thể; ngược lại người dùng phải khớp theo thành viên/phòng/tầng/vai trò.';

-- Bảng điểm: chính chủ, hoặc người có quyền xem + chủ thể đã đồng ý
CREATE OR REPLACE FUNCTION app.can_view_academic(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_self(p_member_id)
      OR (app.has_permission('academic.read_all') AND app.has_active_consent(p_member_id, 'academic_share_leadership'))
$$;
COMMENT ON FUNCTION app.can_view_academic(uuid) IS 'BR-ACAD-01: điểm cá nhân chỉ chính chủ xem; Ban điều hành xem khi có quyền academic.read_all VÀ chủ thể còn đồng ý academic_share_leadership.';

-- Hồ sơ Công giáo: chính chủ, hoặc người có quyền + chủ thể đồng ý chia sẻ
CREATE OR REPLACE FUNCTION app.can_view_catholic(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_self(p_member_id)
      OR (app.has_permission('catholic.read_all') AND app.has_active_consent(p_member_id, 'catholic_share_leadership'))
$$;

-- Quyền xem thực thể mà tệp gắn vào (dùng cho media_attachments/storage_files): đi qua RLS của chính bảng đích (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION app.can_see_attachment_target(p_type attachment_entity_t, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_type
    WHEN 'expense_voucher'    THEN EXISTS (SELECT 1 FROM public.expense_vouchers    WHERE id = p_id)
    WHEN 'duty_checkin'       THEN EXISTS (SELECT 1 FROM public.duty_checkins       WHERE id = p_id)
    WHEN 'duty_review_appeal' THEN EXISTS (SELECT 1 FROM public.duty_review_appeals WHERE id = p_id)
    WHEN 'academic_record'    THEN EXISTS (SELECT 1 FROM public.academic_records    WHERE id = p_id)
    WHEN 'maintenance_issue'  THEN EXISTS (SELECT 1 FROM public.maintenance_issues  WHERE id = p_id)
    WHEN 'repair_cost'        THEN EXISTS (SELECT 1 FROM public.repair_costs        WHERE id = p_id)
    WHEN 'announcement'       THEN EXISTS (SELECT 1 FROM public.announcements       WHERE id = p_id)
    WHEN 'forum_post'         THEN EXISTS (SELECT 1 FROM public.forum_posts         WHERE id = p_id)
    WHEN 'leave_request'      THEN EXISTS (SELECT 1 FROM public.leave_requests      WHERE id = p_id)
    WHEN 'member_application' THEN EXISTS (SELECT 1 FROM public.member_applications WHERE id = p_id)
    WHEN 'policy_document'    THEN EXISTS (SELECT 1 FROM public.policy_documents    WHERE id = p_id)
    WHEN 'event'              THEN EXISTS (SELECT 1 FROM public.events              WHERE id = p_id)
    ELSE false
  END
$$;
COMMENT ON FUNCTION app.can_see_attachment_target(attachment_entity_t, uuid) IS 'Tệp đính kèm nhìn thấy được khi thực thể đích nhìn thấy được (đệ quy ủy quyền sang RLS của bảng đích): ai không xem được phiếu chi thì không xem được ảnh hóa đơn của phiếu đó.';

-- Quyền gắn/gỡ tệp vào một thực thể: chỉ người "sở hữu" thực thể ở trạng thái còn sửa được
CREATE OR REPLACE FUNCTION app.can_modify_attachment_target(p_type attachment_entity_t, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_type
    WHEN 'expense_voucher'    THEN EXISTS (SELECT 1 FROM public.expense_vouchers ev
                                            WHERE ev.id = p_id
                                              AND ((ev.requested_by = app.current_user_id() AND ev.status IN ('draft', 'rejected'))
                                                   -- người ghi nhận chi được đính kèm chứng từ chi (ủy nhiệm chi, biên nhận) sau khi phiếu được duyệt/đã chi
                                                   OR (ev.status IN ('approved', 'paid') AND app.has_permission('finance.expense.pay'))))
    WHEN 'duty_checkin'       THEN EXISTS (SELECT 1 FROM public.duty_checkins dc
                                            WHERE dc.id = p_id AND dc.checked_in_by_member_id = app.current_member_id())
    WHEN 'duty_review_appeal' THEN EXISTS (SELECT 1 FROM public.duty_review_appeals ap
                                            WHERE ap.id = p_id AND ap.appellant_member_id = app.current_member_id() AND ap.status = 'open')
    WHEN 'academic_record'    THEN EXISTS (SELECT 1 FROM public.academic_records ar
                                            WHERE ar.id = p_id AND ar.member_id = app.current_member_id() AND ar.status IN ('draft', 'rejected'))
    WHEN 'maintenance_issue'  THEN EXISTS (SELECT 1 FROM public.maintenance_issues mi
                                            WHERE mi.id = p_id AND (mi.reporter_member_id = app.current_member_id() OR app.has_permission('issue.triage')))
    WHEN 'repair_cost'        THEN app.has_permission('issue.cost.propose')
    WHEN 'announcement'       THEN EXISTS (SELECT 1 FROM public.announcements an
                                            WHERE an.id = p_id AND (an.author_member_id = app.current_member_id() OR app.has_permission('announcement.pin')))
    WHEN 'forum_post'         THEN EXISTS (SELECT 1 FROM public.forum_posts fp
                                            WHERE fp.id = p_id AND fp.author_member_id = app.current_member_id())
    WHEN 'leave_request'      THEN EXISTS (SELECT 1 FROM public.leave_requests lr
                                            WHERE lr.id = p_id AND lr.member_id = app.current_member_id() AND lr.status = 'pending')
    WHEN 'member_application' THEN EXISTS (SELECT 1 FROM public.member_applications ma
                                            WHERE ma.id = p_id AND ma.user_id = app.current_user_id() AND ma.status IN ('submitted', 'under_review'))
    WHEN 'policy_document'    THEN app.has_permission('policy.manage')
    WHEN 'event'              THEN app.has_permission('event.manage')
    ELSE false
  END
$$;
COMMENT ON FUNCTION app.can_modify_attachment_target(attachment_entity_t, uuid) IS 'Ai được gắn/gỡ tệp: người sở hữu thực thể khi thực thể còn ở trạng thái sửa được (nháp/bị trả về/chưa nộp), hoặc người có quyền quản lý tương ứng.';

-- Bảng chứa dữ liệu cá nhân nhạy cảm: nhật ký kiểm toán của chúng chỉ người có audit.sensitive.read (Trưởng nhà) xem được,
-- Admin kỹ thuật (audit.log.read) không đọc được qua cửa sau nhật ký
CREATE OR REPLACE FUNCTION app.is_sensitive_audit_table(p_table text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_table IN ('members', 'member_private_details', 'member_guardians', 'catholic_profiles', 'member_sacraments', 'student_profiles',
                     'academic_records', 'grade_records', 'study_goals', 'consents', 'data_subject_requests', 'leave_requests',
                     'tutoring_matches', 'member_applications')
$$;
COMMENT ON FUNCTION app.is_sensitive_audit_table(text) IS 'Tên bảng có dữ liệu cá nhân/học vụ/đồng ý nhạy cảm: dòng audit_logs của chúng bị giới hạn cho audit.sensitive.read.';

-- Khóa an toàn: quyền truy cập thực thể liên quan đến tài chính, dùng cho audit
CREATE OR REPLACE FUNCTION app.is_finance_audit_table(p_table text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_table IN ('funds', 'financial_periods', 'period_fund_balances', 'ledger_entries', 'expense_vouchers',
                     'expense_approvals', 'contribution_plans', 'contributions', 'contribution_payments',
                     'contribution_payment_allocations', 'bank_statement_lines', 'period_reconciliations')
$$;

-- Bảo vệ cột trong members: thành viên chỉ sửa được các cột hồ sơ của mình; trạng thái/xóa mềm cần quyền riêng
CREATE OR REPLACE FUNCTION app.tg_members_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.member_no IS DISTINCT FROM OLD.member_no THEN
    RAISE EXCEPTION 'Không được đổi liên kết tài khoản hoặc số thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.left_on IS DISTINCT FROM OLD.left_on
      OR NEW.left_reason IS DISTINCT FROM OLD.left_reason OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     AND NOT app.has_permission('member.status.change') THEN
    RAISE EXCEPTION 'Đổi trạng thái cư trú/xóa mềm cần quyền member.status.change.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.gender IS DISTINCT FROM OLD.gender OR NEW.joined_on IS DISTINCT FROM OLD.joined_on)
     AND NOT app.has_permission('member.update') THEN
    RAISE EXCEPTION 'Sửa họ tên/giới tính/ngày gia nhập cần quyền member.update.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_members_guard() IS 'RLS không giới hạn được theo cột; trigger này bổ sung: tự sửa chỉ gồm display_name, avatar_file_id, contact_phone_e164, contact_email, hide_phone; các cột còn lại cần quyền member.update / member.status.change.';

CREATE TRIGGER trg_members__guard
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION app.tg_members_guard();

-- Tệp: người tải lên chỉ được xác nhận tải xong (pending_upload → uploaded); các bước xử lý nền do worker thực hiện
CREATE OR REPLACE FUNCTION app.tg_storage_files_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT app.is_system_caller() THEN
    IF NOT (OLD.status = 'pending_upload' AND NEW.status = 'uploaded') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'BR-STO-04: người dùng chỉ được xác nhận tải lên xong; trạng thái xử lý do worker cập nhật.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.detected_mime IS DISTINCT FROM OLD.detected_mime
       OR NEW.phash IS DISTINCT FROM OLD.phash OR NEW.bucket IS DISTINCT FROM OLD.bucket OR NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.scan_status IS DISTINCT FROM OLD.scan_status THEN
      RAISE EXCEPTION 'BR-STO-04: các thuộc tính kiểm chứng của tệp do worker xác lập, không do client.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_storage_files__guard
  BEFORE UPDATE ON storage_files
  FOR EACH ROW EXECUTE FUNCTION app.tg_storage_files_guard();
