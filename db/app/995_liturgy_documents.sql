-- =====================================================================
-- 995 — THƯ VIỆN TÀI LIỆU PHỤNG VỤ (trang /phung-vu, khu "Tài liệu phụng vụ"). Idempotent (chạy lại nhiều lần được).
--   Lưu kinh nguyện, lời bài hát/thánh ca, video YouTube, tệp PDF, liên kết, ghi chú/bài đọc để anh em tìm đọc, tham khảo.
--
--   1. Quyền mới liturgy.document.manage ("Thêm/sửa/xóa tài liệu phụng vụ", cùng nhóm 'event' với liturgy.manage) — cấp cho
--      Trưởng nhà, Trưởng ban Phụng vụ, Admin. Quyền MỚI nên được cấp ở db/app (không đổi quyền có sẵn của vai trò nào).
--   2. Bảng liturgy_documents: mọi người đã đăng nhập xem (tài liệu chưa xóa); ghi cần liturgy.document.manage. Xóa = xóa mềm.
--      Ràng buộc theo loại: youtube/link bắt buộc URL http(s) (youtube chỉ nhận youtube.com / youtu.be); pdf bắt buộc tệp PDF
--      thuộc bucket documents; kinh/bài hát/ghi chú bắt buộc có lời văn (≤ 50.000 ký tự).
--   3. Tìm kiếm không dấu: cột search_norm (app.norm_text của tiêu đề + chuyên mục + thẻ + loại + lời văn) do trigger điền,
--      chỉ mục trigram.
--   4. Tệp PDF tham chiếu trực tiếp bằng file_id (không qua media_attachments) nên: (a) chính sách SELECT riêng cho
--      storage_files — ai xem được tài liệu thì mở được tệp; (b) trigger SECURITY DEFINER đặt storage_files.attached_at để
--      tác vụ dọn tệp mồ côi không xóa tệp sau 24 giờ (thay tệp ⇒ tệp cũ trở lại diện mồ côi nếu không còn ai dùng).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Quyền
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('liturgy.document.manage', 'event', 'Thêm/sửa/xóa tài liệu phụng vụ (kinh nguyện, bài hát, video, PDF, liên kết)', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'liturgy.document.manage'
  FROM public.roles r
 WHERE r.code IN ('house_head', 'liturgy_lead', 'admin')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Bảng
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liturgy_documents (
  id           uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  title        text          NOT NULL,
  kind         text          NOT NULL,
  category     text,
  tags         text[]        NOT NULL DEFAULT '{}'::text[],
  content      text,
  url          text,
  file_id      uuid          REFERENCES public.storage_files(id) ON DELETE RESTRICT,
  is_pinned    boolean       NOT NULL DEFAULT false,
  search_norm  text          NOT NULL DEFAULT '',
  created_by   uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  version      integer       NOT NULL DEFAULT 1,
  CONSTRAINT ck_liturgy_documents__title            CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT ck_liturgy_documents__kind             CHECK (kind IN ('prayer', 'song', 'youtube', 'pdf', 'link', 'note')),
  CONSTRAINT ck_liturgy_documents__category         CHECK (category IS NULL OR char_length(btrim(category)) BETWEEN 1 AND 60),
  CONSTRAINT ck_liturgy_documents__tags             CHECK (cardinality(tags) <= 12),
  CONSTRAINT ck_liturgy_documents__content          CHECK (content IS NULL OR char_length(content) <= 50000),
  CONSTRAINT ck_liturgy_documents__content_required CHECK (kind NOT IN ('prayer', 'song', 'note') OR char_length(btrim(COALESCE(content, ''))) > 0),
  CONSTRAINT ck_liturgy_documents__url_format       CHECK (url IS NULL OR (char_length(url) <= 2000 AND url ~* '^https?://[^[:space:]/?#]+[^[:space:]]*$')),
  CONSTRAINT ck_liturgy_documents__url_required     CHECK (kind NOT IN ('youtube', 'link') OR url IS NOT NULL),
  CONSTRAINT ck_liturgy_documents__youtube          CHECK (kind <> 'youtube' OR url ~* '^https?://([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)([/?#:]|$)'),
  CONSTRAINT ck_liturgy_documents__file             CHECK ((kind = 'pdf') = (file_id IS NOT NULL)),
  CONSTRAINT ck_liturgy_documents__version          CHECK (version >= 1)
);
COMMENT ON TABLE public.liturgy_documents IS
  'Thư viện tài liệu phụng vụ: kinh nguyện (prayer), bài hát/thánh ca (song), video YouTube (youtube), tệp PDF (pdf, file_id → storage_files bucket documents), liên kết (link), ghi chú/bài đọc (note). Mọi thành viên xem; liturgy.document.manage thêm/sửa/xóa mềm/ghim. search_norm (không dấu) do trigger điền.';
COMMENT ON COLUMN public.liturgy_documents.content IS 'Lời kinh / lời bài hát / nội dung ghi chú (giữ nguyên xuống dòng), hoặc mô tả ngắn cho video, PDF, liên kết. ≤ 50.000 ký tự.';
COMMENT ON COLUMN public.liturgy_documents.url IS 'Liên kết http(s): bắt buộc với youtube (youtube.com / youtu.be) và link; tùy chọn (liên kết tham khảo) với kinh, bài hát, ghi chú.';
COMMENT ON COLUMN public.liturgy_documents.search_norm IS 'Chuỗi tìm kiếm không dấu, chữ thường (app.norm_text) — do trigger điền, ứng dụng không ghi.';

CREATE INDEX IF NOT EXISTS ix_liturgy_documents__file_id    ON public.liturgy_documents (file_id);
CREATE INDEX IF NOT EXISTS ix_liturgy_documents__created_by ON public.liturgy_documents (created_by);
CREATE INDEX IF NOT EXISTS ix_liturgy_documents__list       ON public.liturgy_documents (is_pinned DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_liturgy_documents__search     ON public.liturgy_documents USING gin (search_norm gin_trgm_ops) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 3. Quy tắc ghi (BEFORE INSERT/UPDATE, quyền người gọi): chuẩn hóa, cột hệ thống, kiểm tệp PDF, chuỗi tìm kiếm
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_liturgy_documents_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
BEGIN
  NEW.title    := btrim(NEW.title);
  NEW.category := NULLIF(btrim(COALESCE(NEW.category, '')), '');
  NEW.url      := NULLIF(btrim(COALESCE(NEW.url, '')), '');
  NEW.content  := CASE WHEN btrim(COALESCE(NEW.content, '')) = '' THEN NULL ELSE NEW.content END;
  -- Thẻ: bỏ khoảng trắng thừa, bỏ thẻ rỗng, bỏ trùng (không phân biệt hoa/thường), giữ thứ tự nhập
  NEW.tags := ARRAY(
    SELECT s.t FROM (
      SELECT DISTINCT ON (lower(btrim(x))) btrim(x) AS t, o
        FROM unnest(COALESCE(NEW.tags, '{}'::text[])) WITH ORDINALITY AS u(x, o)
       WHERE btrim(x) <> ''
       ORDER BY lower(btrim(x)), o) s
    ORDER BY s.o);
  IF EXISTS (SELECT 1 FROM unnest(NEW.tags) AS x WHERE char_length(x) > 30) THEN
    RAISE EXCEPTION 'Mỗi thẻ tối đa 30 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  -- Chỉ tài liệu PDF mới gắn tệp
  IF NEW.kind <> 'pdf' THEN
    NEW.file_id := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
    NEW.version    := 1;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;

  -- Tệp PDF (chỉ kiểm khi gắn tệp mới): đã tải lên xong, đúng bucket documents, đúng là PDF, do chính người thao tác tải lên (BR-STO-05)
  IF NEW.file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.file_id IS DISTINCT FROM OLD.file_id) THEN
    SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.file_id AND f.deleted_at IS NULL;
    IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
      RAISE EXCEPTION 'BR-STO-05: tệp PDF không tồn tại (hoặc không phải tệp của bạn), chưa tải lên xong hoặc đã bị xóa.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_file.bucket::text <> 'documents' THEN
      RAISE EXCEPTION 'BR-STO-05: tài liệu phụng vụ chỉ nhận tệp tải lên mục "documents", không phải %.', v_file.bucket USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(v_file.detected_mime, v_file.declared_mime, '') <> 'application/pdf' THEN
      RAISE EXCEPTION 'Tài liệu loại PDF chỉ nhận tệp PDF (tệp đã chọn là %).', COALESCE(v_file.detected_mime, v_file.declared_mime, 'không rõ định dạng')
        USING ERRCODE = 'check_violation';
    END IF;
    IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'BR-STO-05: chỉ được dùng tệp do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  NEW.search_norm := app.norm_text(concat_ws(' ',
    NEW.title, NEW.category, array_to_string(NEW.tags, ' '),
    CASE NEW.kind WHEN 'prayer' THEN 'kinh nguyện' WHEN 'song' THEN 'bài hát thánh ca' WHEN 'youtube' THEN 'video youtube'
                  WHEN 'pdf' THEN 'tài liệu pdf' WHEN 'link' THEN 'liên kết' ELSE 'ghi chú bài đọc' END,
    left(COALESCE(NEW.content, ''), 20000)));
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_liturgy_documents_rules() IS
  'BEFORE INSERT/UPDATE liturgy_documents: chuẩn hóa tiêu đề/chuyên mục/thẻ/URL; created_by = người gọi (không đổi khi sửa); chỉ loại pdf mới giữ file_id; tệp gắn mới phải thuộc bucket documents, là PDF, đã tải xong và do chính người gọi tải lên (BR-STO-05); điền search_norm (không dấu) cho tìm kiếm.';

-- Gắn/thay tệp PDF ⇒ đánh dấu attached_at (SECURITY DEFINER: luuxa_app không UPDATE được storage_files sau khi tải xong)
CREATE OR REPLACE FUNCTION app.tg_liturgy_documents_attach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.file_id IS DISTINCT FROM OLD.file_id) THEN
    UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now() WHERE id = NEW.file_id;
  END IF;
  -- Tệp cũ bị thay/bỏ và không còn tài liệu hay đính kèm nào dùng ⇒ trả về diện "mồ côi" để tác vụ dọn dẹp thu hồi
  IF TG_OP = 'UPDATE' AND OLD.file_id IS NOT NULL AND OLD.file_id IS DISTINCT FROM NEW.file_id
     AND NOT EXISTS (SELECT 1 FROM public.liturgy_documents d WHERE d.file_id = OLD.file_id)
     AND NOT EXISTS (SELECT 1 FROM public.media_attachments ma WHERE ma.file_id = OLD.file_id) THEN
    UPDATE public.storage_files SET attached_at = NULL, updated_at = now() WHERE id = OLD.file_id;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_liturgy_documents_attach() IS
  'AFTER INSERT/UPDATE liturgy_documents (khi file_id đổi): đặt storage_files.attached_at cho tệp PDF vừa gắn (tránh bị dọn như tệp mồ côi); tệp cũ không còn ai dùng thì gỡ attached_at để job dọn dẹp thu hồi.';

DROP TRIGGER IF EXISTS trg_liturgy_documents__rules ON public.liturgy_documents;
CREATE TRIGGER trg_liturgy_documents__rules
  BEFORE INSERT OR UPDATE ON public.liturgy_documents
  FOR EACH ROW EXECUTE FUNCTION app.tg_liturgy_documents_rules();
DROP TRIGGER IF EXISTS trg_liturgy_documents__touch ON public.liturgy_documents;
CREATE TRIGGER trg_liturgy_documents__touch
  BEFORE UPDATE ON public.liturgy_documents
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch_versioned();
-- Không dùng "UPDATE OF file_id": đổi loại khỏi pdf thì trigger rules (BEFORE) mới là nơi gỡ file_id — PostgreSQL chỉ xét cột
-- có trong câu SET nên trigger "OF file_id" sẽ không chạy; hàm tự so OLD/NEW.
DROP TRIGGER IF EXISTS trg_liturgy_documents__attach ON public.liturgy_documents;
CREATE TRIGGER trg_liturgy_documents__attach
  AFTER INSERT OR UPDATE ON public.liturgy_documents
  FOR EACH ROW EXECUTE FUNCTION app.tg_liturgy_documents_attach();
DROP TRIGGER IF EXISTS trg_liturgy_documents__audit ON public.liturgy_documents;
CREATE TRIGGER trg_liturgy_documents__audit
  AFTER INSERT OR UPDATE OR DELETE ON public.liturgy_documents
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'search_norm');

-- ---------------------------------------------------------------------
-- 4. RLS
--    Xóa mềm = UPDATE … SET deleted_at, mà PostgreSQL áp chính sách SELECT lên cả dòng MỚI của UPDATE ⇒ người quản lý vẫn
--    phải "nhìn thấy" dòng đã xóa (API tự lọc deleted_at IS NULL khi liệt kê).
-- ---------------------------------------------------------------------
ALTER TABLE public.liturgy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liturgy_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS liturgy_documents__select ON public.liturgy_documents;
CREATE POLICY liturgy_documents__select ON public.liturgy_documents FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (deleted_at IS NULL OR (SELECT app.has_permission('liturgy.document.manage'))));
DROP POLICY IF EXISTS liturgy_documents__insert ON public.liturgy_documents;
CREATE POLICY liturgy_documents__insert ON public.liturgy_documents FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('liturgy.document.manage')) AND created_by = (SELECT app.current_user_id()));
DROP POLICY IF EXISTS liturgy_documents__update ON public.liturgy_documents;
CREATE POLICY liturgy_documents__update ON public.liturgy_documents FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('liturgy.document.manage')))
  WITH CHECK ((SELECT app.has_permission('liturgy.document.manage')));

-- Tệp PDF của tài liệu (chưa xóa): ai xem được tài liệu thì mở được tệp (các chính sách SELECT permissive được OR với nhau)
DROP POLICY IF EXISTS storage_files__select__liturgy_documents ON public.storage_files;
CREATE POLICY storage_files__select__liturgy_documents ON public.storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.liturgy_documents d WHERE d.file_id = storage_files.id AND d.deleted_at IS NULL));

-- ---------------------------------------------------------------------
-- 5. Chủ sở hữu + quyền (mẫu 49_a / 49_b): luuxa_app chỉ ghi cột nghiệp vụ; cột hệ thống do trigger điền; không xóa cứng
-- ---------------------------------------------------------------------
ALTER TABLE public.liturgy_documents OWNER TO luuxa_owner;

REVOKE ALL ON public.liturgy_documents FROM luuxa_app;
GRANT SELECT ON public.liturgy_documents TO luuxa_app;
GRANT INSERT (title, kind, category, tags, content, url, file_id, is_pinned) ON public.liturgy_documents TO luuxa_app;
GRANT UPDATE (title, kind, category, tags, content, url, file_id, is_pinned, deleted_at) ON public.liturgy_documents TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liturgy_documents TO luuxa_worker, luuxa_definer;
-- luuxa_readonly (báo cáo) chỉ được đọc view tổng hợp mv_cashflow_monthly — smoke test kiểm định S12e4 khẳng định điều này
REVOKE ALL ON public.liturgy_documents FROM luuxa_readonly;

ALTER FUNCTION app.tg_liturgy_documents_rules() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_liturgy_documents_attach() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_liturgy_documents_rules(), app.tg_liturgy_documents_attach() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_liturgy_documents_rules(), app.tg_liturgy_documents_attach()
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

COMMIT;
