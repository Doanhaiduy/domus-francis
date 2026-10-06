-- =====================================================================
-- 1018 — BÀI VIẾT CÔNG KHAI ("bản tin" cho người ngoài xem, kể cả chưa đăng nhập). Chạy SAU 1017. Idempotent.
--   • public_articles: bài viết do Ban điều hành soạn (tuyển sinh, tin tức, hoạt động, chia sẻ…). Bài ở trạng thái 'published'
--     (đã tới giờ đăng, chưa xóa) đọc được KHÔNG cần đăng nhập — qua RLS, không qua hàm đặc quyền; bản nháp chỉ người có
--     article.manage thấy. Nội dung là Markdown tối giản; ảnh bìa + ảnh trong bài là tệp thuộc bucket 'attachments'.
--   • Quyền article.manage (Trưởng nhà, Admin, Trưởng ban Truyền thông): soạn, sửa, đăng/gỡ, ghim nổi bật, xóa (xóa mềm).
--   • app.fn_public_org_info(): thông tin giới thiệu cộng đoàn (tên, khẩu hiệu, địa chỉ, hotline…) — chỉ vài khóa org.* được
--     liệt kê sẵn — cho chân trang/trang công khai. settings vốn chỉ đọc được khi đã đăng nhập.
--   • app.fn_article_view(slug): +1 lượt xem cho bài đã đăng (người ngoài không có quyền UPDATE).
--   • app.fn_public_article_file(id): thông tin tệp CHỈ khi tệp đang được một bài đã đăng dùng (ảnh bìa hoặc có mặt trong nội
--     dung) — để phục vụ ảnh công khai mà không mở quyền đọc storage_files.
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('article.manage', 'community', 'Soạn, đăng/gỡ và xóa bài viết công khai (người ngoài xem được)', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'article.manage' FROM public.roles r WHERE r.code IN ('house_head', 'admin', 'media_lead')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.public_articles (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  slug          text        NOT NULL,
  title         text        NOT NULL,
  summary       text,
  content       text        NOT NULL DEFAULT '',
  category      text        NOT NULL DEFAULT 'tin-tuc',
  cover_file_id uuid        REFERENCES public.storage_files(id) ON DELETE SET NULL,
  byline        text,
  status        text        NOT NULL DEFAULT 'draft',
  is_featured   boolean     NOT NULL DEFAULT false,
  published_at  timestamptz,
  view_count    integer     NOT NULL DEFAULT 0,
  created_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT ck_public_articles__slug     CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 120),
  CONSTRAINT ck_public_articles__title    CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_public_articles__summary  CHECK (summary IS NULL OR char_length(summary) <= 400),
  CONSTRAINT ck_public_articles__content  CHECK (char_length(content) <= 60000),
  CONSTRAINT ck_public_articles__category CHECK (category ~ '^[a-z]+(-[a-z]+)*$' AND char_length(category) <= 30),
  CONSTRAINT ck_public_articles__byline   CHECK (byline IS NULL OR char_length(byline) <= 120),
  CONSTRAINT ck_public_articles__status   CHECK (status IN ('draft', 'published')),
  CONSTRAINT ck_public_articles__views    CHECK (view_count >= 0),
  -- bài đã đăng phải có nội dung và ngày đăng
  CONSTRAINT ck_public_articles__published CHECK (status <> 'published' OR (published_at IS NOT NULL AND char_length(btrim(content)) > 0))
);
COMMENT ON TABLE public.public_articles IS
  'Bài viết công khai (đọc được khi chưa đăng nhập nếu status=published, published_at ≤ now(), chưa xóa). content = Markdown tối giản; ảnh trong bài dạng ![mô tả](/api/v1/public/files/<id>).';
CREATE UNIQUE INDEX IF NOT EXISTS ux_public_articles__slug ON public.public_articles (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_public_articles__listing ON public.public_articles (published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_public_articles__cover ON public.public_articles (cover_file_id);
CREATE INDEX IF NOT EXISTS ix_public_articles__created_by ON public.public_articles (created_by);
CREATE INDEX IF NOT EXISTS ix_public_articles__updated_by ON public.public_articles (updated_by);

CREATE OR REPLACE FUNCTION app.tg_public_articles_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
    NEW.created_at := now();
    NEW.view_count := 0;
  ELSE
    -- Chỉ tăng lượt xem (app.fn_article_view): không coi là sửa bài — giữ nguyên người sửa/ngày sửa
    IF NEW.view_count IS DISTINCT FROM OLD.view_count THEN
      NEW.updated_by := OLD.updated_by;
      NEW.updated_at := OLD.updated_at;
      RETURN NEW;
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  NEW.updated_at := now();
  NEW.title := btrim(NEW.title);
  NEW.summary := NULLIF(btrim(COALESCE(NEW.summary, '')), '');
  NEW.byline := NULLIF(btrim(COALESCE(NEW.byline, '')), '');
  IF NEW.status = 'published' THEN
    -- đăng lần đầu (hoặc đăng lại sau khi gỡ) ⇒ ngày đăng = bây giờ, trừ khi người soạn đã đặt ngày
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  ELSE
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_public_articles__stamp ON public.public_articles;
CREATE TRIGGER trg_public_articles__stamp BEFORE INSERT OR UPDATE ON public.public_articles
  FOR EACH ROW EXECUTE FUNCTION app.tg_public_articles_stamp();
-- Nhật ký kiểm toán: thêm/sửa/xóa bài; KHÔNG ghi mỗi lượt xem (UPDATE chỉ đổi view_count)
DROP TRIGGER IF EXISTS trg_public_articles__audit ON public.public_articles;
CREATE TRIGGER trg_public_articles__audit AFTER INSERT OR DELETE ON public.public_articles
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');
DROP TRIGGER IF EXISTS trg_public_articles__audit_upd ON public.public_articles;
CREATE TRIGGER trg_public_articles__audit_upd AFTER UPDATE ON public.public_articles
  FOR EACH ROW WHEN (OLD.view_count = NEW.view_count) EXECUTE FUNCTION app.tg_audit('id');

ALTER TABLE public.public_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_articles FORCE ROW LEVEL SECURITY;

-- Đọc: KHÔNG yêu cầu đăng nhập đối với bài đã đăng; bản nháp / bài đã xóa chỉ người có article.manage
DROP POLICY IF EXISTS public_articles__select ON public.public_articles;
CREATE POLICY public_articles__select ON public.public_articles FOR SELECT TO luuxa_app
  USING ((status = 'published' AND published_at <= now() AND deleted_at IS NULL) OR (SELECT app.has_permission('article.manage')));
DROP POLICY IF EXISTS public_articles__write ON public.public_articles;
CREATE POLICY public_articles__write ON public.public_articles FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('article.manage'))) WITH CHECK ((SELECT app.has_permission('article.manage')));

ALTER TABLE public.public_articles OWNER TO luuxa_owner;
REVOKE ALL ON public.public_articles FROM luuxa_app;
GRANT SELECT ON public.public_articles TO luuxa_app;
GRANT INSERT (slug, title, summary, content, category, cover_file_id, byline, status, is_featured, published_at) ON public.public_articles TO luuxa_app;
GRANT UPDATE (slug, title, summary, content, category, cover_file_id, byline, status, is_featured, published_at, deleted_at) ON public.public_articles TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_articles TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_public_articles_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_public_articles_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_public_articles_stamp() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- Thông tin cộng đoàn công khai (chỉ các khóa được liệt kê)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_public_org_info()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    FROM public.settings s
   WHERE s.key IN ('org.house_name', 'org.motto', 'org.address', 'org.contact_phone', 'org.order_name', 'org.patron_name')
$$;
COMMENT ON FUNCTION app.fn_public_org_info() IS
  'Thông tin giới thiệu cộng đoàn cho trang công khai / chân trang (tên, khẩu hiệu, địa chỉ, hotline, Tỉnh Dòng, bổn mạng). Gọi được khi chưa đăng nhập.';

-- ---------------------------------------------------------------------
-- +1 lượt xem
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_article_view(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  UPDATE public.public_articles
     SET view_count = view_count + 1
   WHERE slug = p_slug AND status = 'published' AND published_at <= now() AND deleted_at IS NULL
$$;
COMMENT ON FUNCTION app.fn_article_view(text) IS 'Tăng lượt xem của bài công khai đã đăng (gọi được khi chưa đăng nhập).';

-- ---------------------------------------------------------------------
-- Tệp ảnh đang được bài đã đăng sử dụng (ảnh bìa hoặc có đường dẫn trong nội dung)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_public_article_file(p_id uuid)
RETURNS TABLE (bucket text, object_key text, detected_mime text, variants jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT f.bucket::text, f.object_key, f.detected_mime, f.variants
    FROM public.storage_files f
   WHERE f.id = p_id AND f.status = 'ready' AND f.deleted_at IS NULL
     AND f.bucket = 'attachments' AND f.detected_mime IN ('image/jpeg', 'image/png', 'image/webp')
     AND EXISTS (
       SELECT 1 FROM public.public_articles a
        WHERE a.status = 'published' AND a.published_at <= now() AND a.deleted_at IS NULL
          AND (a.cover_file_id = f.id OR position(f.id::text IN a.content) > 0))
$$;
COMMENT ON FUNCTION app.fn_public_article_file(uuid) IS
  'Metadata tệp ảnh (bucket attachments) CHỈ khi đang được một bài công khai đã đăng dùng — không mở quyền đọc storage_files cho người ngoài.';

ALTER FUNCTION app.fn_public_org_info()            OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_article_view(text)           OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_public_article_file(uuid)    OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_public_org_info(), app.fn_article_view(text), app.fn_public_article_file(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_public_org_info(), app.fn_article_view(text), app.fn_public_article_file(uuid)
  TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- Gắn ảnh bìa + ảnh trong bài ⇒ đánh dấu attached_at để tác vụ dọn tệp mồ côi (24 giờ) KHÔNG xóa ảnh đang dùng
-- (SECURITY DEFINER: luuxa_app không UPDATE được storage_files sau khi tải xong). Ảnh gỡ khỏi bài thì giữ nguyên (vô hại).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_public_articles_attach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT m[1]::uuid), ARRAY[]::uuid[]) INTO v_ids
    FROM regexp_matches(NEW.content, '/api/v1/(?:public/)?files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') AS m;
  IF NEW.cover_file_id IS NOT NULL THEN v_ids := array_append(v_ids, NEW.cover_file_id); END IF;
  IF cardinality(v_ids) > 0 THEN
    UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now()
     WHERE id = ANY(v_ids) AND bucket = 'attachments' AND deleted_at IS NULL AND attached_at IS NULL;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_public_articles_attach() IS
  'AFTER INSERT/UPDATE public_articles: đặt storage_files.attached_at cho ảnh bìa và ảnh có đường dẫn trong nội dung (tránh bị dọn như tệp mồ côi).';
ALTER FUNCTION app.tg_public_articles_attach() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_public_articles_attach() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_public_articles_attach() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
DROP TRIGGER IF EXISTS trg_public_articles__attach ON public.public_articles;
CREATE TRIGGER trg_public_articles__attach AFTER INSERT OR UPDATE OF content, cover_file_id ON public.public_articles
  FOR EACH ROW EXECUTE FUNCTION app.tg_public_articles_attach();

COMMIT;
