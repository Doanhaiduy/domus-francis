-- =====================================================================
-- 1038 — KHOẢNH KHẮC: VIDEO + ALBUM CHUNG "KHOẢNH KHẮC THƯỜNG NGÀY". Chạy SAU 1037. Idempotent.
--   [1] albums.is_shared / shared_key: album CHUNG của cả nhà — mọi thành viên (có hồ sơ) tự thêm ảnh / video, chỉ người kiểm duyệt (album.moderate)
--       sửa thông tin, ẩn / hiện. Album chung duy nhất "daily" (Khoảnh khắc thường ngày) được tạo khi có người dùng đầu tiên
--       (app.fn_ensure_daily_album). Không ai đổi được cờ này từ ứng dụng (trigger bảo vệ).
--   [2] album_videos: video của album. Tệp video KHÔNG nằm trong storage_files (ràng buộc cũ chỉ cho ảnh / PDF ≤ 20 MB) mà ở nhà cung cấp lưu trữ:
--       cloudinary (miễn phí 25 credits/tháng, tự chuyển mã + HLS), supabase (Storage, ≤ 50 MB ở gói miễn phí) hoặc local (chỉ máy dev).
--       Ảnh bìa video (poster) là ảnh thường trong storage_files, chụp khung hình ngay trên trình duyệt trước khi tải lên.
--   RLS giống album_photos: xem theo quyền xem album; thêm khi là tác giả / người kiểm duyệt / album chung; sửa (kể cả xóa mềm) khi là người tải lên
--   hoặc người kiểm duyệt.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- [1] Album chung
-- ---------------------------------------------------------------------
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS shared_key text;
COMMENT ON COLUMN public.albums.is_shared IS 'Album chung của cả nhà: mọi thành viên thêm được ảnh / video; chỉ album.moderate sửa thông tin, ẩn / hiện; không xóa được.';
COMMENT ON COLUMN public.albums.shared_key IS 'Khóa định danh album chung (vd. daily = Khoảnh khắc thường ngày); duy nhất.';
CREATE UNIQUE INDEX IF NOT EXISTS ux_albums__shared_key ON public.albums (shared_key) WHERE shared_key IS NOT NULL;

CREATE OR REPLACE FUNCTION app.tg_albums_shared_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_shared OR NEW.shared_key IS NOT NULL THEN
      RAISE EXCEPTION 'Album chung chỉ do hệ thống tạo (app.fn_ensure_daily_album).' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.is_shared IS DISTINCT FROM OLD.is_shared OR NEW.shared_key IS DISTINCT FROM OLD.shared_key THEN
    RAISE EXCEPTION 'Không đổi được thuộc tính album chung.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_albums_shared_guard() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_albums__shared_guard ON public.albums;
CREATE TRIGGER trg_albums__shared_guard BEFORE INSERT OR UPDATE ON public.albums
  FOR EACH ROW EXECUTE FUNCTION app.tg_albums_shared_guard();

-- Thêm ảnh vào album chung: mọi thành viên (chính mình là người tải lên)
DROP POLICY IF EXISTS album_photos__insert ON public.album_photos;
CREATE POLICY album_photos__insert ON public.album_photos FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(uploaded_by_member_id))
              AND EXISTS (SELECT 1 FROM public.albums a WHERE a.id = album_id
                           AND (a.author_member_id = (SELECT app.current_member_id()) OR a.is_shared OR (SELECT app.has_permission('album.moderate')))));

-- Tạo (nếu chưa có) và trả mã album chung "Khoảnh khắc thường ngày"; thành viên nào mở trang Khoảnh khắc cũng gọi được
CREATE OR REPLACE FUNCTION app.fn_ensure_daily_album()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me  uuid := app.current_member_id();
  v_id  uuid;
  v_cat uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chỉ thành viên có hồ sơ mới dùng được album chung.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT a.id INTO v_id FROM public.albums a WHERE a.shared_key = 'daily' AND a.deleted_at IS NULL;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT c.id INTO v_cat FROM public.categories c WHERE c.kind = 'album' AND c.code = 'ALB_DAILY' AND c.deleted_at IS NULL;
  IF v_cat IS NULL THEN
    SELECT c.id INTO v_cat FROM public.categories c WHERE c.kind = 'album' AND c.is_active AND c.deleted_at IS NULL ORDER BY c.sort_order, c.name LIMIT 1;
  END IF;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'Chưa có chủ đề album nào để tạo album chung.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.albums (title, description, category_id, taken_on, author_member_id, is_shared, shared_key, tags)
  VALUES ('Khoảnh khắc thường ngày',
          'Album chung của cả nhà — anh em tự đăng ảnh và video sinh hoạt thường ngày ở lưu xá: bữa cơm, giờ học, tập thể thao, những phút nghỉ ngơi bên nhau.',
          v_cat, app.local_today(), v_me, true, 'daily', ARRAY['ThuongNgay'])
  ON CONFLICT (shared_key) WHERE shared_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT a.id INTO v_id FROM public.albums a WHERE a.shared_key = 'daily' AND a.deleted_at IS NULL;
  END IF;
  RETURN v_id;
END
$$;
ALTER FUNCTION app.fn_ensure_daily_album() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_ensure_daily_album() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_ensure_daily_album() TO luuxa_app, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_ensure_daily_album() IS 'Trả mã album chung "Khoảnh khắc thường ngày" (shared_key = daily), tạo nếu chưa có (người gọi lần đầu ghi là tác giả danh nghĩa). Chỉ thành viên có hồ sơ.';

-- ---------------------------------------------------------------------
-- [2] Video của album
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_videos (
  id                    uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  album_id              uuid             NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  provider              text             NOT NULL,
  object_key            text             NOT NULL,
  provider_meta         jsonb            NOT NULL DEFAULT '{}'::jsonb,
  mime                  text,
  size_bytes            bigint           NOT NULL,
  duration_ms           integer,
  width_px              integer,
  height_px             integer,
  poster_file_id        uuid             REFERENCES public.storage_files(id) ON DELETE SET NULL,
  caption               text,
  uploaded_by_member_id uuid             NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  sort_order            integer          NOT NULL DEFAULT 0,
  status                content_status_t NOT NULL DEFAULT 'published',
  created_at            timestamptz      NOT NULL DEFAULT now(),
  updated_at            timestamptz      NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT ck_album_videos__provider CHECK (provider IN ('cloudinary', 'supabase', 'local')),
  CONSTRAINT ck_album_videos__key      CHECK (char_length(object_key) BETWEEN 3 AND 300),
  CONSTRAINT ck_album_videos__size     CHECK (size_bytes > 0 AND size_bytes <= 200 * 1024 * 1024),
  CONSTRAINT ck_album_videos__duration CHECK (duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 3600000)),
  CONSTRAINT ck_album_videos__dims     CHECK ((width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)),
  CONSTRAINT ck_album_videos__caption  CHECK (caption IS NULL OR char_length(caption) <= 500),
  CONSTRAINT ux_album_videos__object   UNIQUE (provider, object_key)
);
COMMENT ON TABLE public.album_videos IS 'Video của album khoảnh khắc. Tệp nằm ở nhà cung cấp lưu trữ (cloudinary / supabase / local), không nằm trong storage_files; poster là ảnh thường trong storage_files.';
CREATE INDEX IF NOT EXISTS ix_album_videos__album ON public.album_videos (album_id, sort_order, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_album_videos__uploader ON public.album_videos (uploaded_by_member_id);
CREATE INDEX IF NOT EXISTS ix_album_videos__poster ON public.album_videos (poster_file_id) WHERE poster_file_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.tg_album_videos_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.uploaded_by_member_id := COALESCE(app.current_member_id(), NEW.uploaded_by_member_id);
    NEW.created_at := now();
    IF NEW.poster_file_id IS NOT NULL THEN
      SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.poster_file_id AND f.deleted_at IS NULL;
      IF NOT FOUND OR v_file.status <> 'ready' THEN
        RAISE EXCEPTION 'Ảnh bìa video chưa tải lên xong hoặc không tồn tại.' USING ERRCODE = 'check_violation';
      END IF;
      IF COALESCE(v_file.detected_mime, '') NOT LIKE 'image/%' THEN
        RAISE EXCEPTION 'Ảnh bìa video phải là ảnh.' USING ERRCODE = 'check_violation';
      END IF;
      IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'Chỉ được dùng ảnh bìa do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now() WHERE id = NEW.poster_file_id;
    END IF;
  ELSE
    -- Chỉ chú thích, trạng thái ẩn / hiện, thứ tự và xóa mềm được đổi; tệp và người tải lên giữ nguyên
    NEW.album_id := OLD.album_id; NEW.provider := OLD.provider; NEW.object_key := OLD.object_key; NEW.provider_meta := OLD.provider_meta;
    NEW.mime := OLD.mime; NEW.size_bytes := OLD.size_bytes; NEW.duration_ms := OLD.duration_ms; NEW.width_px := OLD.width_px;
    NEW.height_px := OLD.height_px; NEW.poster_file_id := OLD.poster_file_id; NEW.uploaded_by_member_id := OLD.uploaded_by_member_id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.caption := NULLIF(btrim(COALESCE(NEW.caption, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_album_videos_rules() OWNER TO luuxa_definer;
DROP TRIGGER IF EXISTS trg_album_videos__rules ON public.album_videos;
CREATE TRIGGER trg_album_videos__rules BEFORE INSERT OR UPDATE ON public.album_videos
  FOR EACH ROW EXECUTE FUNCTION app.tg_album_videos_rules();
DROP TRIGGER IF EXISTS trg_album_videos__audit ON public.album_videos;
CREATE TRIGGER trg_album_videos__audit AFTER INSERT OR UPDATE OR DELETE ON public.album_videos
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'provider_meta');

ALTER TABLE public.album_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_videos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.album_videos OWNER TO luuxa_owner;
REVOKE ALL ON public.album_videos FROM luuxa_app;
GRANT SELECT, INSERT, UPDATE ON public.album_videos TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.album_videos TO luuxa_definer, luuxa_worker;

DROP POLICY IF EXISTS album_videos__select ON public.album_videos;
CREATE POLICY album_videos__select ON public.album_videos FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR (SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate')))
         AND EXISTS (SELECT 1 FROM public.albums a WHERE a.id = album_id)
         AND (status = 'published' OR (SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate'))));
DROP POLICY IF EXISTS album_videos__insert ON public.album_videos;
CREATE POLICY album_videos__insert ON public.album_videos FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(uploaded_by_member_id))
              AND EXISTS (SELECT 1 FROM public.albums a WHERE a.id = album_id
                           AND (a.author_member_id = (SELECT app.current_member_id()) OR a.is_shared OR (SELECT app.has_permission('album.moderate')))));
DROP POLICY IF EXISTS album_videos__update ON public.album_videos;
CREATE POLICY album_videos__update ON public.album_videos FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate')))
  WITH CHECK ((SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate')));

-- Poster của video: người xem được video thì xem được ảnh bìa (storage_files có RLS riêng)
DROP POLICY IF EXISTS storage_files__select__album_videos ON public.storage_files;
CREATE POLICY storage_files__select__album_videos ON public.storage_files FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM public.album_videos v WHERE v.poster_file_id = storage_files.id));

COMMIT;
