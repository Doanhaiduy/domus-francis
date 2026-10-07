-- =====================================================================
-- 1035 — GÓP Ý VỀ ỨNG DỤNG: thành viên gửi góp ý (lỗi, đề xuất, khó dùng…), người quản lý xem, phân loại và trả lời. Chạy SAU 1034. Idempotent.
--   • app_feedback: loại góp ý, nội dung, màn hình liên quan (tùy chọn), ảnh chụp màn hình (tùy chọn), "ẩn tên" (người quản lý không thấy tên
--     — ứng dụng che tên khi hiển thị; hệ thống vẫn lưu người gửi để họ xem được trả lời của chính mình), trạng thái new/reviewing/done/declined,
--     câu trả lời của người quản lý.
--   • Quyền: feedback.manage (Admin, Trưởng nhà) xem mọi góp ý, đổi trạng thái, trả lời, xóa. Mỗi thành viên luôn xem/xóa (khi còn "mới") góp ý của CHÍNH MÌNH.
--   • Ghi trực tiếp dưới RLS; thông báo do ứng dụng gửi bằng vai trò worker (app.fn_notify không cấp cho luuxa_app).
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('feedback.manage', 'feedback', 'Xem, phân loại và trả lời góp ý của thành viên về ứng dụng', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'feedback.manage' FROM public.roles r WHERE r.code IN ('house_head', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.feedback_new',   'system', 'Có góp ý mới về ứng dụng',        ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false),
  ('system.feedback_reply', 'system', 'Góp ý của bạn đã được trả lời',  ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id        uuid        NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  category         text        NOT NULL DEFAULT 'idea',
  content          text        NOT NULL,
  page_path        text,
  is_anonymous     boolean     NOT NULL DEFAULT false,
  evidence_file_id uuid        REFERENCES public.storage_files(id) ON DELETE SET NULL,
  status           text        NOT NULL DEFAULT 'new',
  response         text,
  responded_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  responded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_app_feedback__category CHECK (category IN ('bug', 'idea', 'ux', 'other')),
  CONSTRAINT ck_app_feedback__content  CHECK (char_length(btrim(content)) BETWEEN 10 AND 2000),
  CONSTRAINT ck_app_feedback__page     CHECK (page_path IS NULL OR char_length(page_path) <= 200),
  CONSTRAINT ck_app_feedback__status   CHECK (status IN ('new', 'reviewing', 'done', 'declined')),
  CONSTRAINT ck_app_feedback__response CHECK (response IS NULL OR char_length(btrim(response)) BETWEEN 2 AND 1000)
);
COMMENT ON TABLE public.app_feedback IS 'Góp ý của thành viên về ứng dụng (lỗi / đề xuất / khó dùng / khác). is_anonymous = ẩn tên khi người quản lý xem (ứng dụng che tên); member_id vẫn được lưu để người gửi xem trả lời.';
CREATE INDEX IF NOT EXISTS ix_app_feedback__member ON public.app_feedback (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_app_feedback__status ON public.app_feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_app_feedback__evidence ON public.app_feedback (evidence_file_id) WHERE evidence_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_app_feedback__responded_by ON public.app_feedback (responded_by);

CREATE OR REPLACE FUNCTION app.tg_app_feedback_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.member_id := COALESCE(app.current_member_id(), NEW.member_id);
    NEW.created_at := now();
    NEW.status := 'new';
    NEW.response := NULL; NEW.responded_by := NULL; NEW.responded_at := NULL;
    NEW.content := btrim(NEW.content);
    IF NEW.evidence_file_id IS NOT NULL THEN
      SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.evidence_file_id AND f.deleted_at IS NULL;
      IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
        RAISE EXCEPTION 'Không tìm thấy ảnh đính kèm (hoặc ảnh chưa tải lên xong).' USING ERRCODE = 'check_violation';
      END IF;
      IF COALESCE(v_file.detected_mime, v_file.declared_mime, '') NOT LIKE 'image/%' THEN
        RAISE EXCEPTION 'Ảnh đính kèm phải là ảnh (JPEG, PNG hoặc WebP).' USING ERRCODE = 'check_violation';
      END IF;
      IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'Chỉ được dùng ảnh do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now() WHERE id = NEW.evidence_file_id;
    END IF;
  ELSE
    -- Chỉ trạng thái và câu trả lời được đổi; nội dung góp ý giữ nguyên
    NEW.member_id := OLD.member_id; NEW.category := OLD.category; NEW.content := OLD.content; NEW.page_path := OLD.page_path;
    NEW.is_anonymous := OLD.is_anonymous; NEW.evidence_file_id := OLD.evidence_file_id; NEW.created_at := OLD.created_at;
    IF NEW.response IS DISTINCT FROM OLD.response THEN
      NEW.response := NULLIF(btrim(COALESCE(NEW.response, '')), '');
      NEW.responded_by := app.current_user_id();
      NEW.responded_at := CASE WHEN NEW.response IS NULL THEN NULL ELSE now() END;
    ELSE
      NEW.responded_by := OLD.responded_by; NEW.responded_at := OLD.responded_at;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_app_feedback_rules() IS 'BEFORE INSERT/UPDATE app_feedback: người gửi = thành viên đang đăng nhập, luôn bắt đầu ở trạng thái new; ảnh đính kèm phải là ảnh đã tải xong do chính người gửi tải lên (đánh dấu attached_at); sau đó chỉ trạng thái và câu trả lời được đổi (ghi người/giờ trả lời).';

DROP TRIGGER IF EXISTS trg_app_feedback__rules ON public.app_feedback;
CREATE TRIGGER trg_app_feedback__rules BEFORE INSERT OR UPDATE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION app.tg_app_feedback_rules();
DROP TRIGGER IF EXISTS trg_app_feedback__audit ON public.app_feedback;
CREATE TRIGGER trg_app_feedback__audit AFTER INSERT OR UPDATE OR DELETE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'content,response');

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_feedback__select ON public.app_feedback;
CREATE POLICY app_feedback__select ON public.app_feedback FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('feedback.manage')));
DROP POLICY IF EXISTS app_feedback__insert ON public.app_feedback;
CREATE POLICY app_feedback__insert ON public.app_feedback FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)));
DROP POLICY IF EXISTS app_feedback__update ON public.app_feedback;
CREATE POLICY app_feedback__update ON public.app_feedback FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('feedback.manage'))) WITH CHECK ((SELECT app.has_permission('feedback.manage')));
DROP POLICY IF EXISTS app_feedback__delete ON public.app_feedback;
CREATE POLICY app_feedback__delete ON public.app_feedback FOR DELETE TO luuxa_app
  USING (((SELECT app.is_self(member_id)) AND status = 'new') OR (SELECT app.has_permission('feedback.manage')));

-- Ảnh chụp màn hình: người gửi + người quản lý góp ý xem được (các chính sách SELECT permissive được OR với nhau)
DROP POLICY IF EXISTS storage_files__select__app_feedback ON public.storage_files;
CREATE POLICY storage_files__select__app_feedback ON public.storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.app_feedback f
     WHERE f.evidence_file_id = storage_files.id
       AND ((SELECT app.is_self(f.member_id)) OR (SELECT app.has_permission('feedback.manage')))));

ALTER TABLE public.app_feedback OWNER TO luuxa_owner;
REVOKE ALL ON public.app_feedback FROM luuxa_app;
GRANT SELECT ON public.app_feedback TO luuxa_app;
GRANT INSERT (member_id, category, content, page_path, is_anonymous, evidence_file_id) ON public.app_feedback TO luuxa_app;
GRANT UPDATE (status, response) ON public.app_feedback TO luuxa_app;
GRANT DELETE ON public.app_feedback TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_feedback TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_app_feedback_rules() OWNER TO luuxa_definer; -- definer (BYPASSRLS): hàm đọc/cập nhật storage_files dưới FORCE RLS
REVOKE ALL ON FUNCTION app.tg_app_feedback_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_app_feedback_rules() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
