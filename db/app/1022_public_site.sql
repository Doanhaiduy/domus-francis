-- =====================================================================
-- 1022 — TRANG CÔNG KHAI MỞ RỘNG. Chạy SAU 1021. Idempotent.
--   • public_articles.tags (thẻ) + public_article_revisions (lịch sử chỉnh sửa, giữ 25 bản gần nhất, khôi phục được).
--   • admission_inquiries: người ngoài gửi "đăng ký tìm hiểu / xin vào ở" từ trang công khai (chưa cần tài khoản). Ghi qua
--     app.fn_submit_admission_inquiry (chống spam theo IP, gộp trùng, báo Trưởng nhà/Admin); đọc/xử lý cần application.review.
--   • public_faqs: câu hỏi thường gặp hiện ở /hoi-dap (quản lý bằng article.manage).
--   • albums.is_public: Ban truyền thông cho phép album hiện ở /thu-vien (người ngoài xem được ảnh của album đó).
--   • settings: org.about (giới thiệu, Markdown), org.donation_enabled / org.donation_note (trang ủng hộ).
--   • app.fn_public_org_info() thêm org.about; app.fn_public_donation_info() trả tài khoản nhận ủng hộ KHI được bật;
--     app.fn_public_article_file() mở thêm ảnh của album công khai.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Thẻ + lịch sử chỉnh sửa bài viết
-- ---------------------------------------------------------------------
ALTER TABLE public.public_articles ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_public_articles__tags') THEN
    ALTER TABLE public.public_articles ADD CONSTRAINT ck_public_articles__tags CHECK (cardinality(tags) <= 8);
  END IF;
END
$$;
GRANT INSERT (tags) ON public.public_articles TO luuxa_app;
GRANT UPDATE (tags) ON public.public_articles TO luuxa_app;
CREATE INDEX IF NOT EXISTS ix_public_articles__tags ON public.public_articles USING gin (tags);

CREATE TABLE IF NOT EXISTS public.public_article_revisions (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  article_id  uuid        NOT NULL REFERENCES public.public_articles(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  summary     text,
  content     text        NOT NULL,
  saved_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.public_article_revisions IS 'Bản cũ của bài viết công khai mỗi lần tiêu đề/tóm tắt/nội dung đổi (trigger ghi; giữ 25 bản gần nhất mỗi bài).';
CREATE INDEX IF NOT EXISTS ix_public_article_revisions__article ON public.public_article_revisions (article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_public_article_revisions__saved_by ON public.public_article_revisions (saved_by);

ALTER TABLE public.public_article_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_article_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_article_revisions__select ON public.public_article_revisions;
CREATE POLICY public_article_revisions__select ON public.public_article_revisions FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('article.manage')));
ALTER TABLE public.public_article_revisions OWNER TO luuxa_owner;
REVOKE ALL ON public.public_article_revisions FROM luuxa_app;
GRANT SELECT ON public.public_article_revisions TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_article_revisions TO luuxa_worker, luuxa_definer;

CREATE OR REPLACE FUNCTION app.tg_public_articles_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.public_article_revisions (article_id, title, summary, content, saved_by)
  VALUES (OLD.id, OLD.title, OLD.summary, OLD.content, COALESCE(app.current_user_id(), OLD.updated_by));
  DELETE FROM public.public_article_revisions r
   WHERE r.article_id = OLD.id
     AND r.id NOT IN (SELECT x.id FROM public.public_article_revisions x WHERE x.article_id = OLD.id ORDER BY x.created_at DESC, x.id DESC LIMIT 25);
  RETURN NULL;
END
$$;
ALTER FUNCTION app.tg_public_articles_revision() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_public_articles_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_public_articles_revision() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
DROP TRIGGER IF EXISTS trg_public_articles__revision ON public.public_articles;
CREATE TRIGGER trg_public_articles__revision AFTER UPDATE ON public.public_articles
  FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
                     AND (OLD.title IS DISTINCT FROM NEW.title OR OLD.summary IS DISTINCT FROM NEW.summary OR OLD.content IS DISTINCT FROM NEW.content))
  EXECUTE FUNCTION app.tg_public_articles_revision();

-- ---------------------------------------------------------------------
-- 2. Đăng ký tìm hiểu / xin vào ở từ trang công khai
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory)
VALUES ('member.admission_inquiry', 'system', 'Có người đăng ký tìm hiểu vào ở từ trang công khai',
        ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admission_inquiries (
  id              uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  full_name       text        NOT NULL,
  phone           text,
  email           text,
  school          text,
  year_of_study   text,
  parish          text,
  message         text,
  preferred_visit text,
  status          text        NOT NULL DEFAULT 'new',
  note            text,
  handled_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  handled_at      timestamptz,
  ip_hash         text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_admission_inquiries__name    CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_admission_inquiries__contact CHECK (NULLIF(btrim(COALESCE(phone, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL),
  CONSTRAINT ck_admission_inquiries__phone   CHECK (phone IS NULL OR char_length(phone) <= 20),
  CONSTRAINT ck_admission_inquiries__email   CHECK (email IS NULL OR char_length(email) <= 200),
  CONSTRAINT ck_admission_inquiries__text    CHECK (COALESCE(char_length(school), 0) <= 200 AND COALESCE(char_length(year_of_study), 0) <= 60
                                                    AND COALESCE(char_length(parish), 0) <= 200 AND COALESCE(char_length(message), 0) <= 1500
                                                    AND COALESCE(char_length(preferred_visit), 0) <= 200 AND COALESCE(char_length(note), 0) <= 1000),
  CONSTRAINT ck_admission_inquiries__status  CHECK (status IN ('new', 'contacted', 'visited', 'accepted', 'rejected', 'spam'))
);
COMMENT ON TABLE public.admission_inquiries IS 'Đăng ký tìm hiểu / xin vào ở gửi từ trang công khai (người chưa có tài khoản). Ghi qua app.fn_submit_admission_inquiry; xử lý cần application.review.';
CREATE INDEX IF NOT EXISTS ix_admission_inquiries__status ON public.admission_inquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admission_inquiries__ip ON public.admission_inquiries (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admission_inquiries__handled_by ON public.admission_inquiries (handled_by);

CREATE OR REPLACE FUNCTION app.tg_admission_inquiries_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.handled_by := app.current_user_id();
    NEW.handled_at := now();
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_admission_inquiries__stamp ON public.admission_inquiries;
CREATE TRIGGER trg_admission_inquiries__stamp BEFORE UPDATE ON public.admission_inquiries
  FOR EACH ROW EXECUTE FUNCTION app.tg_admission_inquiries_stamp();
DROP TRIGGER IF EXISTS trg_admission_inquiries__audit ON public.admission_inquiries;
CREATE TRIGGER trg_admission_inquiries__audit AFTER UPDATE OR DELETE ON public.admission_inquiries
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

ALTER TABLE public.admission_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_inquiries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admission_inquiries__select ON public.admission_inquiries;
CREATE POLICY admission_inquiries__select ON public.admission_inquiries FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('application.review')));
DROP POLICY IF EXISTS admission_inquiries__update ON public.admission_inquiries;
CREATE POLICY admission_inquiries__update ON public.admission_inquiries FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('application.review'))) WITH CHECK ((SELECT app.has_permission('application.review')));
ALTER TABLE public.admission_inquiries OWNER TO luuxa_owner;
REVOKE ALL ON public.admission_inquiries FROM luuxa_app;
GRANT SELECT ON public.admission_inquiries TO luuxa_app;
GRANT UPDATE (status, note) ON public.admission_inquiries TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admission_inquiries TO luuxa_worker, luuxa_definer;
ALTER FUNCTION app.tg_admission_inquiries_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_admission_inquiries_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_admission_inquiries_stamp() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

-- Gửi đăng ký (gọi được khi CHƯA đăng nhập). Trả id; gửi lại cùng SĐT/email trong 24 giờ ⇒ trả đơn cũ (không báo trùng).
CREATE OR REPLACE FUNCTION app.fn_submit_admission_inquiry(
  p_full_name text, p_phone text, p_email text, p_school text, p_year text, p_parish text,
  p_message text, p_visit text, p_ip_hash text, p_user_agent text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
BEGIN
  IF p_ip_hash IS NOT NULL AND (SELECT count(*) FROM public.admission_inquiries WHERE ip_hash = p_ip_hash AND created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMITED: Bạn đã gửi quá nhiều lần. Vui lòng thử lại sau ít phút hoặc gọi hotline.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id INTO v_id FROM public.admission_inquiries
   WHERE created_at > now() - interval '24 hours'
     AND ((v_phone IS NOT NULL AND phone = v_phone) OR (v_email IS NOT NULL AND lower(email) = v_email))
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.admission_inquiries (full_name, phone, email, school, year_of_study, parish, message, preferred_visit, ip_hash, user_agent)
  VALUES (btrim(p_full_name), v_phone, v_email, NULLIF(btrim(COALESCE(p_school, '')), ''), NULLIF(btrim(COALESCE(p_year, '')), ''),
          NULLIF(btrim(COALESCE(p_parish, '')), ''), NULLIF(btrim(COALESCE(p_message, '')), ''), NULLIF(btrim(COALESCE(p_visit, '')), ''),
          p_ip_hash, left(p_user_agent, 300))
  RETURNING id INTO v_id;

  PERFORM app.fn_notify_roles(ARRAY['house_head', 'admin'], 'member.admission_inquiry', 'Có người đăng ký tìm hiểu vào ở',
          btrim(p_full_name) || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_school, '')), ''), ''), '{}'::jsonb, 'admission_inquiries', v_id);
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_submit_admission_inquiry(text, text, text, text, text, text, text, text, text, text) IS
  'Người ngoài gửi đăng ký tìm hiểu từ trang công khai: chống spam theo IP (3/giờ), gộp trùng 24 giờ, báo Trưởng nhà/Admin.';
ALTER FUNCTION app.fn_submit_admission_inquiry(text, text, text, text, text, text, text, text, text, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_submit_admission_inquiry(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_submit_admission_inquiry(text, text, text, text, text, text, text, text, text, text) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 3. Câu hỏi thường gặp
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_faqs (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  question    text        NOT NULL,
  answer      text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_public_faqs__question CHECK (char_length(btrim(question)) BETWEEN 5 AND 250),
  CONSTRAINT ck_public_faqs__answer   CHECK (char_length(btrim(answer)) BETWEEN 2 AND 4000)
);
CREATE INDEX IF NOT EXISTS ix_public_faqs__sort ON public.public_faqs (sort_order, created_at);
CREATE INDEX IF NOT EXISTS ix_public_faqs__created_by ON public.public_faqs (created_by);
CREATE INDEX IF NOT EXISTS ix_public_faqs__updated_by ON public.public_faqs (updated_by);

CREATE OR REPLACE FUNCTION app.tg_public_faqs_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
  END IF;
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  NEW.updated_at := now();
  NEW.question := btrim(NEW.question);
  NEW.answer := btrim(NEW.answer);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_public_faqs__stamp ON public.public_faqs;
CREATE TRIGGER trg_public_faqs__stamp BEFORE INSERT OR UPDATE ON public.public_faqs
  FOR EACH ROW EXECUTE FUNCTION app.tg_public_faqs_stamp();
DROP TRIGGER IF EXISTS trg_public_faqs__audit ON public.public_faqs;
CREATE TRIGGER trg_public_faqs__audit AFTER INSERT OR UPDATE OR DELETE ON public.public_faqs
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

ALTER TABLE public.public_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_faqs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_faqs__select ON public.public_faqs;
CREATE POLICY public_faqs__select ON public.public_faqs FOR SELECT TO luuxa_app
  USING (is_active OR (SELECT app.has_permission('article.manage')));
DROP POLICY IF EXISTS public_faqs__write ON public.public_faqs;
CREATE POLICY public_faqs__write ON public.public_faqs FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('article.manage'))) WITH CHECK ((SELECT app.has_permission('article.manage')));
ALTER TABLE public.public_faqs OWNER TO luuxa_owner;
REVOKE ALL ON public.public_faqs FROM luuxa_app;
GRANT SELECT ON public.public_faqs TO luuxa_app;
GRANT INSERT (question, answer, sort_order, is_active) ON public.public_faqs TO luuxa_app;
GRANT UPDATE (question, answer, sort_order, is_active) ON public.public_faqs TO luuxa_app;
GRANT DELETE ON public.public_faqs TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_faqs TO luuxa_worker, luuxa_definer;
ALTER FUNCTION app.tg_public_faqs_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_public_faqs_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_public_faqs_stamp() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 4. Album công khai (thư viện ảnh)
-- ---------------------------------------------------------------------
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.albums.is_public IS 'true = hiện ở /thu-vien cho người chưa đăng nhập. Chỉ người có album.moderate bật được (trigger). Người đăng ảnh phải được người trong ảnh đồng ý.';
GRANT UPDATE (is_public) ON public.albums TO luuxa_app;
CREATE INDEX IF NOT EXISTS ix_albums__public ON public.albums (taken_on DESC) WHERE is_public AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.tg_albums_public_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_public AND (TG_OP = 'INSERT' OR NEW.is_public IS DISTINCT FROM OLD.is_public) AND NOT app.is_system_caller() AND NOT app.has_permission('album.moderate') THEN
    RAISE EXCEPTION 'Chỉ người kiểm duyệt album (album.moderate) được đưa album ra thư viện công khai.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_albums__public_guard ON public.albums;
CREATE TRIGGER trg_albums__public_guard BEFORE INSERT OR UPDATE OF is_public ON public.albums
  FOR EACH ROW EXECUTE FUNCTION app.tg_albums_public_guard();
ALTER FUNCTION app.tg_albums_public_guard() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_albums_public_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_albums_public_guard() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- Người chưa đăng nhập đọc được album công khai đã đăng + ảnh trong album đó (RLS cộng thêm, không thay chính sách cũ)
DROP POLICY IF EXISTS albums__select_public ON public.albums;
CREATE POLICY albums__select_public ON public.albums FOR SELECT TO luuxa_app
  USING (is_public AND status = 'published' AND deleted_at IS NULL);
DROP POLICY IF EXISTS album_photos__select_public ON public.album_photos;
CREATE POLICY album_photos__select_public ON public.album_photos FOR SELECT TO luuxa_app
  USING (status = 'published' AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM public.albums a WHERE a.id = album_id AND a.is_public AND a.status = 'published' AND a.deleted_at IS NULL));

-- ---------------------------------------------------------------------
-- 5. Cấu hình giới thiệu + ủng hộ
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES
  ('org.about', to_jsonb(''::text), 'string', 'Phần giới thiệu lưu xá (Markdown) hiện ở trang công khai /gioi-thieu: lịch sử, tinh thần, đời sống chung.', NULL, NULL, true, 'setting.write', to_jsonb(''::text)),
  ('org.donation_enabled', 'false'::jsonb, 'boolean', 'Bật trang công khai /ung-ho (mã VietQR nhận ủng hộ lưu xá, dùng tài khoản nhận quỹ của nhà).', NULL, NULL, true, 'setting.write', 'false'::jsonb),
  ('org.donation_note', to_jsonb(''::text), 'string', 'Lời nhắn hiện trên trang ủng hộ (mục đích sử dụng, lời cảm ơn).', NULL, NULL, true, 'setting.write', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.fn_public_org_info()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    FROM public.settings s
   WHERE s.key IN ('org.house_name', 'org.motto', 'org.address', 'org.contact_phone', 'org.order_name', 'org.patron_name', 'org.about', 'org.patron_feast')
$$;

CREATE OR REPLACE FUNCTION app.fn_public_donation_info()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE
    WHEN (SELECT value FROM public.settings WHERE key = 'org.donation_enabled') = 'true'::jsonb
    THEN jsonb_build_object(
           'enabled', true,
           'note', COALESCE((SELECT value #>> '{}' FROM public.settings WHERE key = 'org.donation_note'), ''),
           'account', (SELECT value FROM public.settings WHERE key = 'finance.receiving_account'))
    ELSE jsonb_build_object('enabled', false)
  END
$$;
COMMENT ON FUNCTION app.fn_public_donation_info() IS 'Thông tin nhận ủng hộ cho trang /ung-ho: chỉ khi org.donation_enabled = true; trả tài khoản nhận quỹ của nhà (đã được công khai để chuyển khoản).';
ALTER FUNCTION app.fn_public_donation_info() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_public_donation_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_public_donation_info() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- Ảnh được phục vụ công khai: ảnh bìa/ảnh trong bài đã đăng (bucket attachments) HOẶC ảnh của album công khai (bucket moments)
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
     AND f.detected_mime IN ('image/jpeg', 'image/png', 'image/webp')
     AND (
       (f.bucket = 'attachments' AND EXISTS (
          SELECT 1 FROM public.public_articles a
           WHERE a.status = 'published' AND a.published_at <= now() AND a.deleted_at IS NULL
             AND (a.cover_file_id = f.id OR position(f.id::text IN a.content) > 0)))
       OR
       (f.bucket = 'moments' AND (
          EXISTS (SELECT 1 FROM public.album_photos ap JOIN public.albums al ON al.id = ap.album_id
                   WHERE ap.file_id = f.id AND ap.status = 'published' AND ap.deleted_at IS NULL
                     AND al.is_public AND al.status = 'published' AND al.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.albums al WHERE al.cover_file_id = f.id AND al.is_public AND al.status = 'published' AND al.deleted_at IS NULL))))
$$;

COMMIT;
