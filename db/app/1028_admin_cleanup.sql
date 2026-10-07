-- =====================================================================
-- 1028 — ADMIN DỌN DỮ LIỆU RÁC: xóa vĩnh viễn một số loại bản ghi mà trước đây không xóa được
--   Quyền mới data.purge (chỉ Admin; trigger 1027 tự cấp cho Admin). Hàm app.fn_admin_delete(entity, id) kiểm quyền rồi xóa theo danh sách
--   CHO PHÉP (không nhận tên bảng từ người dùng):
--     leave        đơn xin phép
--     issue        báo hỏng / sự cố cơ sở vật chất (kèm chi phí sửa, tệp đính kèm, người phụ trách)
--     prayer       ý chỉ cầu nguyện
--     inquiry      đăng ký tìm hiểu (người ngoài gửi từ trang công khai)
--     application  đơn xin vào nhà đã xử lý (đã duyệt/từ chối) — đơn còn chờ phải duyệt hoặc từ chối trước
--   KHÔNG xóa được: sổ quỹ, phiếu chi, khoản thu, phiếu thu (có sổ cái bất biến — dùng hủy/đảo) và nhật ký kiểm toán.
--   Mọi lần xóa vẫn để lại dấu vết ở nhật ký kiểm toán (trigger tg_audit trên bảng gốc) và nhật ký hoạt động của ứng dụng.
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('data.purge', 'system',
        'Xóa vĩnh viễn bản ghi không cần thiết để dọn dữ liệu rác (đơn xin phép, báo hỏng, ý cầu nguyện, đăng ký tìm hiểu, đơn vào nhà đã xử lý) — chỉ Admin',
        true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'data.purge' FROM public.roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- Nhật ký chuyển trạng thái sự cố là bất biến; chỉ cho phép xóa khi Admin đang xóa CHÍNH sự cố đó (cờ app.purge_issue = mã sự cố,
-- do app.fn_admin_delete đặt trong cùng giao dịch). Mọi trường hợp khác vẫn bị chặn như cũ.
CREATE OR REPLACE FUNCTION app.tg_issue_history_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.purge_issue', true) = OLD.issue_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Bảng % là bất biến (append-only): không được % bản ghi. Dùng bút toán/bản ghi đảo thay thế.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Tạo bản ghi điều chỉnh/đảo (reversal) thay vì sửa hoặc xóa.';
END
$$;
ALTER FUNCTION app.tg_issue_history_guard() OWNER TO luuxa_owner;

DROP TRIGGER IF EXISTS trg_issue_status_history__immutable ON public.issue_status_history;
CREATE TRIGGER trg_issue_status_history__immutable
  BEFORE UPDATE OR DELETE ON public.issue_status_history
  FOR EACH ROW EXECUTE FUNCTION app.tg_issue_history_guard();

CREATE OR REPLACE FUNCTION app.fn_admin_delete(p_entity text, p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_n      integer := 0;
  v_status text;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_permission('data.purge') THEN
    RAISE EXCEPTION 'Chỉ Admin được xóa vĩnh viễn dữ liệu (quyền data.purge).' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_entity = 'leave' THEN
    DELETE FROM public.leave_requests WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    DELETE FROM public.media_attachments WHERE entity_type = 'leave_request' AND entity_id = p_id;

  ELSIF p_entity = 'issue' THEN
    PERFORM set_config('app.purge_issue', p_id::text, true);
    DELETE FROM public.repair_costs WHERE issue_id = p_id;
    DELETE FROM public.media_attachments WHERE entity_type IN ('maintenance_issue', 'repair_cost') AND entity_id = p_id;
    DELETE FROM public.maintenance_issues WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.purge_issue', '', true);

  ELSIF p_entity = 'prayer' THEN
    DELETE FROM public.prayer_intentions WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_entity = 'inquiry' THEN
    DELETE FROM public.admission_inquiries WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_entity = 'application' THEN
    SELECT status::text INTO v_status FROM public.member_applications WHERE id = p_id;
    IF v_status IN ('submitted', 'under_review') THEN
      RAISE EXCEPTION 'Đơn đang chờ duyệt — hãy duyệt hoặc từ chối trước rồi mới xóa.' USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.member_applications WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    DELETE FROM public.media_attachments WHERE entity_type = 'member_application' AND entity_id = p_id;

  ELSE
    RAISE EXCEPTION 'Loại dữ liệu "%" không hỗ trợ xóa.', p_entity USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy bản ghi (có thể đã được xóa).' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_n;
END
$$;
ALTER FUNCTION app.fn_admin_delete(text, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_admin_delete(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_admin_delete(text, uuid) TO luuxa_app, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_admin_delete(text, uuid) IS
  'Admin (quyền data.purge) xóa vĩnh viễn một bản ghi thuộc danh sách cho phép: leave, issue, prayer, inquiry, application. Không xóa được dữ liệu tài chính/nhật ký.';

COMMIT;
