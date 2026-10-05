-- =====================================================================
-- 1000 — LỊCH PHỤNG VỤ ĐẦY ĐỦ TRÊN TRANG LỊCH SỰ KIỆN. Idempotent (chạy lại nhiều lần được).
--   Lịch phụng vụ (tên lễ, bậc lễ, màu áo lễ, mùa/tuần, năm A/B/C, âm lịch, Tết) do ứng dụng TỰ TÍNH theo luật phụng vụ
--   (src/lib/liturgy/engine.ts) cho mọi năm — CSDL chỉ giữ phần không tính được:
--
--   1. Quyền mới liturgy.calendar.manage (Trưởng nhà, Trưởng ban Phụng vụ, Admin): ý lễ / ghi chú theo ngày, ngày đặc biệt
--      của nhà, nạp Lời Chúa, xem & duyệt check-in đi lễ của anh em, cấu hình nhắc lễ.
--   2. liturgy_lectionary          — Sách Bài Đọc (trích dẫn + toàn văn) nạp từ dữ liệu mở trên GitHub; chỉ tiến trình hệ thống
--                                    (luuxa_worker) ghi, mọi người đã đăng nhập đọc.
--      liturgy_lectionary_imports  — nhật ký các lần nạp.
--   3. liturgy_day_notes           — "ý lễ" (ý chỉ cầu nguyện của nhà) và ghi chú cho từng ngày.
--   4. liturgy_special_days        — ngày đặc biệt của nhà (kỷ niệm, lễ riêng…), lặp hằng năm hoặc một lần; tùy chọn bắt buộc
--                                    check-in đi lễ, cần ảnh minh chứng, nhắc trước. Ngày Bổn mạng lấy từ cấu hình org.patron_feast.
--   5. mass_checkins               — anh em check-in đi lễ (Chúa Nhật: không cần ảnh; lễ trọng / Bổn mạng: kèm ảnh minh chứng).
--                                    Người duyệt (liturgy.calendar.manage) đánh dấu hợp lệ / không hợp lệ.
--   6. liturgy_notice_log          — chống gửi trùng thông báo nhắc lễ (trước 1 tuần, trước 1 ngày, nhắc check-in).
--   7. Loại thông báo + khóa cấu hình mới.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Quyền
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('liturgy.calendar.manage', 'event',
        'Cấu hình lịch phụng vụ: ý lễ theo ngày, ngày đặc biệt của nhà, nạp Lời Chúa, duyệt check-in đi lễ', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'liturgy.calendar.manage'
  FROM public.roles r
 WHERE r.code IN ('house_head', 'liturgy_lead', 'admin')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Sách Bài Đọc
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liturgy_lectionary (
  key          text        NOT NULL,
  cycle        text        NOT NULL DEFAULT '',
  variant      text        NOT NULL DEFAULT '',
  source_code  text,
  slots        jsonb       NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, cycle, variant),
  CONSTRAINT ck_liturgy_lectionary__key   CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  CONSTRAINT ck_liturgy_lectionary__cycle CHECK (cycle IN ('', 'A', 'B', 'C', 'I', 'II')),
  CONSTRAINT ck_liturgy_lectionary__slots CHECK (jsonb_typeof(slots) = 'array')
);
COMMENT ON TABLE public.liturgy_lectionary IS
  'Sách Bài Đọc Thánh lễ: mỗi dòng là bộ bài đọc của một khóa (vd. ot-27-1 năm II, saint-1001, xmas-night) — slots = [{kind r1|psalm|r2|alleluia|gospel, ref, headline, intro, text, response, verses[]}]. Khóa khớp bộ tính lịch phụng vụ src/lib/liturgy/engine.ts. Chỉ tiến trình nạp (luuxa_worker) ghi; nguồn ghi ở liturgy_lectionary_imports.';

CREATE TABLE IF NOT EXISTS public.liturgy_lectionary_imports (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  requested_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  status        text        NOT NULL DEFAULT 'running',
  source        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  stats         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  CONSTRAINT ck_liturgy_lectionary_imports__status CHECK (status IN ('running', 'succeeded', 'failed'))
);
COMMENT ON TABLE public.liturgy_lectionary_imports IS 'Nhật ký nạp Sách Bài Đọc (ai yêu cầu, nguồn, số bộ bài đọc, lỗi nếu có).';
CREATE INDEX IF NOT EXISTS ix_liturgy_lectionary_imports__started ON public.liturgy_lectionary_imports (started_at DESC);
CREATE INDEX IF NOT EXISTS ix_liturgy_lectionary_imports__requested_by ON public.liturgy_lectionary_imports (requested_by);

-- ---------------------------------------------------------------------
-- 3. Ý lễ / ghi chú theo ngày
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liturgy_day_notes (
  day_date    date        PRIMARY KEY,
  intention   text,
  note        text,
  updated_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT ck_liturgy_day_notes__intention CHECK (intention IS NULL OR char_length(btrim(intention)) BETWEEN 1 AND 1000),
  CONSTRAINT ck_liturgy_day_notes__note      CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 2000),
  CONSTRAINT ck_liturgy_day_notes__any       CHECK (intention IS NOT NULL OR note IS NOT NULL)
);
COMMENT ON TABLE public.liturgy_day_notes IS
  'Ý lễ (ý chỉ cầu nguyện của cộng đoàn trong Thánh lễ ngày đó) và ghi chú phụng vụ riêng của nhà cho từng ngày (giờ lễ, nơi dự lễ, hướng dẫn của giáo xứ…). Mọi người xem; liturgy.calendar.manage sửa.';
CREATE INDEX IF NOT EXISTS ix_liturgy_day_notes__updated_by ON public.liturgy_day_notes (updated_by);

-- ---------------------------------------------------------------------
-- 4. Ngày đặc biệt của nhà
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liturgy_special_days (
  id                 uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  title              text        NOT NULL,
  description        text,
  month              smallint    NOT NULL,
  day                smallint    NOT NULL,
  year               smallint,
  color              text        NOT NULL DEFAULT 'gold',
  requires_checkin   boolean     NOT NULL DEFAULT false,
  evidence_required  boolean     NOT NULL DEFAULT true,
  notify             boolean     NOT NULL DEFAULT true,
  is_active          boolean     NOT NULL DEFAULT true,
  created_by         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  version            integer     NOT NULL DEFAULT 1,
  CONSTRAINT ck_liturgy_special_days__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  CONSTRAINT ck_liturgy_special_days__desc  CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT ck_liturgy_special_days__date  CHECK (month BETWEEN 1 AND 12 AND day BETWEEN 1 AND 31
    AND day <= (ARRAY[31,29,31,30,31,30,31,31,30,31,30,31])[month]),
  CONSTRAINT ck_liturgy_special_days__year  CHECK (year IS NULL OR year BETWEEN 2000 AND 2100),
  CONSTRAINT ck_liturgy_special_days__color CHECK (color IN ('gold', 'purple', 'blue', 'rose', 'green', 'red'))
);
COMMENT ON TABLE public.liturgy_special_days IS
  'Ngày đặc biệt của lưu xá hiển thị nổi bật trên lịch: year NULL = lặp lại hằng năm (vd. kỷ niệm thành lập), có year = một lần. requires_checkin: anh em phải check-in đi lễ (evidence_required: kèm ảnh, trừ Chúa Nhật); notify: nhắc trước theo cấu hình liturgy.notify_days_before. Ngày Bổn mạng của nhà lấy từ cấu hình org.patron_feast (không lưu ở đây).';
CREATE INDEX IF NOT EXISTS ix_liturgy_special_days__date ON public.liturgy_special_days (month, day) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_liturgy_special_days__created_by ON public.liturgy_special_days (created_by);

-- ---------------------------------------------------------------------
-- 5. Check-in đi lễ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mass_checkins (
  id                uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  day_date          date        NOT NULL,
  member_id         uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  occasion          text        NOT NULL,
  church            text,
  note              text,
  evidence_file_id  uuid        REFERENCES public.storage_files(id) ON DELETE SET NULL,
  checked_in_at     timestamptz NOT NULL DEFAULT now(),
  status            text        NOT NULL DEFAULT 'submitted',
  reviewed_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer     NOT NULL DEFAULT 1,
  CONSTRAINT ux_mass_checkins__day_member UNIQUE (day_date, member_id),
  CONSTRAINT ck_mass_checkins__occasion CHECK (occasion ~ '^(sunday|solemnity|patron|special:[0-9a-f-]{36})$'),
  CONSTRAINT ck_mass_checkins__status   CHECK (status IN ('submitted', 'approved', 'rejected')),
  CONSTRAINT ck_mass_checkins__church   CHECK (church IS NULL OR char_length(btrim(church)) BETWEEN 2 AND 160),
  CONSTRAINT ck_mass_checkins__note     CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_mass_checkins__review   CHECK ((status = 'submitted') = (reviewed_at IS NULL)),
  CONSTRAINT ck_mass_checkins__reject   CHECK (status <> 'rejected' OR app.has_text(review_note, 3))
);
COMMENT ON TABLE public.mass_checkins IS
  'Check-in đi lễ của thành viên cho một ngày bắt buộc (Chúa Nhật, lễ trọng, lễ Bổn mạng, ngày đặc biệt có bật check-in). Ngày nào bắt buộc và có cần ảnh minh chứng do ứng dụng xác định theo lịch phụng vụ + cấu hình. Ảnh: storage_files (bucket attachments) do chính người check-in tải lên. Người duyệt (liturgy.calendar.manage) đặt approved/rejected; người check-in sửa lại ⇒ trở về submitted.';
CREATE INDEX IF NOT EXISTS ix_mass_checkins__member ON public.mass_checkins (member_id, day_date DESC);
CREATE INDEX IF NOT EXISTS ix_mass_checkins__day ON public.mass_checkins (day_date);
CREATE INDEX IF NOT EXISTS ix_mass_checkins__evidence ON public.mass_checkins (evidence_file_id);
CREATE INDEX IF NOT EXISTS ix_mass_checkins__reviewed_by ON public.mass_checkins (reviewed_by);

-- ---------------------------------------------------------------------
-- 6. Nhật ký nhắc lễ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liturgy_notice_log (
  day_date    date        NOT NULL,
  occasion    text        NOT NULL,
  kind        text        NOT NULL,
  recipients  integer     NOT NULL DEFAULT 0,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_date, occasion, kind),
  CONSTRAINT ck_liturgy_notice_log__kind CHECK (kind IN ('week_before', 'day_before', 'checkin_reminder'))
);
COMMENT ON TABLE public.liturgy_notice_log IS 'Mỗi (ngày lễ, dịp, loại nhắc) chỉ gửi một lần — tiến trình nhắc lễ (luuxa_worker) ghi trước khi gửi.';

-- ---------------------------------------------------------------------
-- 7. Quy tắc ghi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_liturgy_day_notes_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.intention  := NULLIF(btrim(COALESCE(NEW.intention, '')), '');
  NEW.note       := NULLIF(btrim(COALESCE(NEW.note, '')), '');
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  IF TG_OP = 'UPDATE' THEN
    NEW.day_date   := OLD.day_date;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.version := 1;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_liturgy_day_notes_rules() IS 'BEFORE INSERT/UPDATE liturgy_day_notes: cắt khoảng trắng, chuỗi rỗng ⇒ NULL, updated_by = người gọi, không đổi ngày.';

CREATE OR REPLACE FUNCTION app.tg_liturgy_special_days_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title       := btrim(NEW.title);
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
    NEW.version    := 1;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_liturgy_special_days_rules() IS 'BEFORE INSERT/UPDATE liturgy_special_days: chuẩn hóa tiêu đề/mô tả; created_by = người tạo (không đổi khi sửa).';

CREATE OR REPLACE FUNCTION app.tg_mass_checkins_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_file    public.storage_files%ROWTYPE;
  v_manager boolean := app.has_permission('liturgy.calendar.manage');
  v_me      uuid    := app.current_member_id();
BEGIN
  NEW.church := NULLIF(btrim(COALESCE(NEW.church, '')), '');
  NEW.note   := NULLIF(btrim(COALESCE(NEW.note, '')), '');
  IF TG_OP = 'INSERT' THEN
    IF app.current_user_id() IS NOT NULL THEN
      NEW.member_id := v_me;
      IF v_me IS NULL THEN
        RAISE EXCEPTION 'Tài khoản chưa gắn với hồ sơ thành viên nên không check-in được.' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    IF NEW.day_date > app.local_today() + 1 THEN
      RAISE EXCEPTION 'Chưa đến ngày lễ này — chỉ check-in từ chiều hôm trước (lễ vọng) trở đi.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.status := 'submitted'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL;
    NEW.checked_in_at := now();
    NEW.version := 1;
  ELSE
    NEW.day_date  := OLD.day_date;
    NEW.member_id := OLD.member_id;
    NEW.created_at := OLD.created_at;
    IF app.current_user_id() IS NOT NULL AND NOT (v_manager AND OLD.member_id IS DISTINCT FROM v_me) THEN
      -- Chính chủ sửa (bổ sung ảnh, nhà thờ, ghi chú) ⇒ quay về chờ duyệt; không tự duyệt cho mình
      IF NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id OR NEW.church IS DISTINCT FROM OLD.church OR NEW.note IS DISTINCT FROM OLD.note THEN
        NEW.status := 'submitted'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL;
        NEW.checked_in_at := now();
      ELSE
        NEW.status := OLD.status; NEW.reviewed_by := OLD.reviewed_by; NEW.reviewed_at := OLD.reviewed_at; NEW.review_note := OLD.review_note;
      END IF;
    ELSE
      -- Người duyệt: chỉ đổi kết quả duyệt
      NEW.evidence_file_id := OLD.evidence_file_id; NEW.church := OLD.church; NEW.note := OLD.note; NEW.occasion := OLD.occasion;
      NEW.checked_in_at := OLD.checked_in_at;
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
        IF NEW.status = 'submitted' THEN
          NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL;
        ELSE
          NEW.reviewed_by := app.current_user_id(); NEW.reviewed_at := now();
          NEW.review_note := NULLIF(btrim(COALESCE(NEW.review_note, '')), '');
        END IF;
      END IF;
    END IF;
  END IF;

  -- Ảnh minh chứng gắn mới: ảnh đã tải xong, do chính người check-in tải lên
  IF NEW.evidence_file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id) THEN
    SELECT * INTO v_file FROM public.storage_files f WHERE f.id = NEW.evidence_file_id AND f.deleted_at IS NULL;
    IF NOT FOUND OR v_file.status NOT IN ('uploaded', 'processing', 'ready') THEN
      RAISE EXCEPTION 'Ảnh minh chứng không tồn tại (hoặc không phải ảnh của bạn), chưa tải lên xong hoặc đã bị xóa.' USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(v_file.detected_mime, v_file.declared_mime, '') NOT LIKE 'image/%' THEN
      RAISE EXCEPTION 'Minh chứng đi lễ phải là ảnh (JPEG, PNG hoặc WebP).' USING ERRCODE = 'check_violation';
    END IF;
    IF app.current_user_id() IS NOT NULL AND v_file.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'Chỉ được dùng ảnh do chính mình tải lên.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_mass_checkins_rules() IS
  'BEFORE INSERT/UPDATE mass_checkins: chủ thể = thành viên đang đăng nhập; không check-in trước ngày lễ quá một ngày (lễ vọng chiều hôm trước); chính chủ sửa ⇒ về chờ duyệt, không tự duyệt; người duyệt chỉ đổi kết quả duyệt (ghi người/giờ duyệt); ảnh minh chứng phải là ảnh đã tải xong do chính người check-in tải lên.';

-- Gắn ảnh minh chứng ⇒ đánh dấu attached_at để tác vụ dọn tệp mồ côi không xóa (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION app.tg_mass_checkins_attach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.evidence_file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id) THEN
    UPDATE public.storage_files SET attached_at = COALESCE(attached_at, now()), updated_at = now() WHERE id = NEW.evidence_file_id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evidence_file_id IS NOT NULL AND OLD.evidence_file_id IS DISTINCT FROM NEW.evidence_file_id
     AND NOT EXISTS (SELECT 1 FROM public.mass_checkins c WHERE c.evidence_file_id = OLD.evidence_file_id)
     AND NOT EXISTS (SELECT 1 FROM public.media_attachments ma WHERE ma.file_id = OLD.evidence_file_id) THEN
    UPDATE public.storage_files SET attached_at = NULL, updated_at = now() WHERE id = OLD.evidence_file_id;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_mass_checkins_attach() IS
  'AFTER INSERT/UPDATE mass_checkins: đặt storage_files.attached_at cho ảnh minh chứng vừa gắn; ảnh cũ bị thay và không còn ai dùng thì gỡ attached_at để job dọn dẹp thu hồi.';

DROP TRIGGER IF EXISTS trg_liturgy_day_notes__rules ON public.liturgy_day_notes;
CREATE TRIGGER trg_liturgy_day_notes__rules BEFORE INSERT OR UPDATE ON public.liturgy_day_notes
  FOR EACH ROW EXECUTE FUNCTION app.tg_liturgy_day_notes_rules();
DROP TRIGGER IF EXISTS trg_liturgy_day_notes__touch ON public.liturgy_day_notes;
CREATE TRIGGER trg_liturgy_day_notes__touch BEFORE UPDATE ON public.liturgy_day_notes
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch_versioned();
DROP TRIGGER IF EXISTS trg_liturgy_day_notes__audit ON public.liturgy_day_notes;
CREATE TRIGGER trg_liturgy_day_notes__audit AFTER INSERT OR UPDATE OR DELETE ON public.liturgy_day_notes
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('day_date');

DROP TRIGGER IF EXISTS trg_liturgy_special_days__rules ON public.liturgy_special_days;
CREATE TRIGGER trg_liturgy_special_days__rules BEFORE INSERT OR UPDATE ON public.liturgy_special_days
  FOR EACH ROW EXECUTE FUNCTION app.tg_liturgy_special_days_rules();
DROP TRIGGER IF EXISTS trg_liturgy_special_days__touch ON public.liturgy_special_days;
CREATE TRIGGER trg_liturgy_special_days__touch BEFORE UPDATE ON public.liturgy_special_days
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch_versioned();
DROP TRIGGER IF EXISTS trg_liturgy_special_days__audit ON public.liturgy_special_days;
CREATE TRIGGER trg_liturgy_special_days__audit AFTER INSERT OR UPDATE OR DELETE ON public.liturgy_special_days
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

DROP TRIGGER IF EXISTS trg_mass_checkins__rules ON public.mass_checkins;
CREATE TRIGGER trg_mass_checkins__rules BEFORE INSERT OR UPDATE ON public.mass_checkins
  FOR EACH ROW EXECUTE FUNCTION app.tg_mass_checkins_rules();
DROP TRIGGER IF EXISTS trg_mass_checkins__touch ON public.mass_checkins;
CREATE TRIGGER trg_mass_checkins__touch BEFORE UPDATE ON public.mass_checkins
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch_versioned();
DROP TRIGGER IF EXISTS trg_mass_checkins__attach ON public.mass_checkins;
CREATE TRIGGER trg_mass_checkins__attach AFTER INSERT OR UPDATE ON public.mass_checkins
  FOR EACH ROW EXECUTE FUNCTION app.tg_mass_checkins_attach();
DROP TRIGGER IF EXISTS trg_mass_checkins__audit ON public.mass_checkins;
CREATE TRIGGER trg_mass_checkins__audit AFTER INSERT OR UPDATE OR DELETE ON public.mass_checkins
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.liturgy_lectionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liturgy_lectionary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liturgy_lectionary__select ON public.liturgy_lectionary;
CREATE POLICY liturgy_lectionary__select ON public.liturgy_lectionary FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));

ALTER TABLE public.liturgy_lectionary_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liturgy_lectionary_imports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liturgy_lectionary_imports__select ON public.liturgy_lectionary_imports;
CREATE POLICY liturgy_lectionary_imports__select ON public.liturgy_lectionary_imports FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));

ALTER TABLE public.liturgy_day_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liturgy_day_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liturgy_day_notes__select ON public.liturgy_day_notes;
CREATE POLICY liturgy_day_notes__select ON public.liturgy_day_notes FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));
DROP POLICY IF EXISTS liturgy_day_notes__insert ON public.liturgy_day_notes;
CREATE POLICY liturgy_day_notes__insert ON public.liturgy_day_notes FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('liturgy.calendar.manage')));
DROP POLICY IF EXISTS liturgy_day_notes__update ON public.liturgy_day_notes;
CREATE POLICY liturgy_day_notes__update ON public.liturgy_day_notes FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('liturgy.calendar.manage'))) WITH CHECK ((SELECT app.has_permission('liturgy.calendar.manage')));
DROP POLICY IF EXISTS liturgy_day_notes__delete ON public.liturgy_day_notes;
CREATE POLICY liturgy_day_notes__delete ON public.liturgy_day_notes FOR DELETE TO luuxa_app
  USING ((SELECT app.has_permission('liturgy.calendar.manage')));

ALTER TABLE public.liturgy_special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liturgy_special_days FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liturgy_special_days__select ON public.liturgy_special_days;
CREATE POLICY liturgy_special_days__select ON public.liturgy_special_days FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (deleted_at IS NULL OR (SELECT app.has_permission('liturgy.calendar.manage'))));
DROP POLICY IF EXISTS liturgy_special_days__insert ON public.liturgy_special_days;
CREATE POLICY liturgy_special_days__insert ON public.liturgy_special_days FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('liturgy.calendar.manage')) AND created_by = (SELECT app.current_user_id()));
DROP POLICY IF EXISTS liturgy_special_days__update ON public.liturgy_special_days;
CREATE POLICY liturgy_special_days__update ON public.liturgy_special_days FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('liturgy.calendar.manage'))) WITH CHECK ((SELECT app.has_permission('liturgy.calendar.manage')));

ALTER TABLE public.mass_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_checkins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mass_checkins__select ON public.mass_checkins;
CREATE POLICY mass_checkins__select ON public.mass_checkins FOR SELECT TO luuxa_app
  USING (member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('liturgy.calendar.manage')));
DROP POLICY IF EXISTS mass_checkins__insert ON public.mass_checkins;
CREATE POLICY mass_checkins__insert ON public.mass_checkins FOR INSERT TO luuxa_app
  WITH CHECK (member_id = (SELECT app.current_member_id()));
DROP POLICY IF EXISTS mass_checkins__update ON public.mass_checkins;
CREATE POLICY mass_checkins__update ON public.mass_checkins FOR UPDATE TO luuxa_app
  USING (member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('liturgy.calendar.manage')))
  WITH CHECK (member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('liturgy.calendar.manage')));
DROP POLICY IF EXISTS mass_checkins__delete ON public.mass_checkins;
CREATE POLICY mass_checkins__delete ON public.mass_checkins FOR DELETE TO luuxa_app
  USING (member_id = (SELECT app.current_member_id()) AND status = 'submitted');

-- Ảnh minh chứng: chính chủ + người duyệt xem được (các chính sách SELECT permissive được OR với nhau)
DROP POLICY IF EXISTS storage_files__select__mass_checkins ON public.storage_files;
CREATE POLICY storage_files__select__mass_checkins ON public.storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.mass_checkins c
     WHERE c.evidence_file_id = storage_files.id
       AND (c.member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('liturgy.calendar.manage')))));

ALTER TABLE public.liturgy_notice_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liturgy_notice_log FORCE ROW LEVEL SECURITY;


-- Tiến trình nền (luuxa_worker) đọc/ghi các bảng này. Trên nền tảng không cho vai trò BYPASSRLS (xem 01_foundation.sql)
-- cần chính sách riêng cho worker; nơi worker có BYPASSRLS thì các chính sách này vô hại.
DO $pol$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['liturgy_lectionary', 'liturgy_lectionary_imports', 'liturgy_day_notes', 'liturgy_special_days', 'mass_checkins', 'liturgy_notice_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '__worker', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO luuxa_worker USING (true) WITH CHECK (true)', t || '__worker', t);
  END LOOP;
END
$pol$;

-- ---------------------------------------------------------------------
-- 8b. Gửi nhắc lễ (một lần cho mỗi ngày lễ + dịp + loại nhắc) — SECURITY DEFINER như app.fn_notify_all_active
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_liturgy_notice(
  p_day          date,
  p_occasion     text,
  p_kind         text,
  p_title        text,
  p_body         text,
  p_payload      jsonb   DEFAULT '{}'::jsonb,
  p_only_missing boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_member uuid;
  v_n      integer := 0;
  v_type   text := CASE WHEN p_kind = 'checkin_reminder' THEN 'liturgy.checkin_reminder' ELSE 'liturgy.feast_upcoming' END;
BEGIN
  INSERT INTO public.liturgy_notice_log (day_date, occasion, kind) VALUES (p_day, p_occasion, p_kind)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0; -- đã gửi
  END IF;
  FOR v_member IN
    SELECT m.id FROM public.members m
     WHERE m.deleted_at IS NULL AND m.status = 'active'
       AND (NOT p_only_missing OR NOT EXISTS (
             SELECT 1 FROM public.mass_checkins c WHERE c.member_id = m.id AND c.day_date = p_day AND c.status <> 'rejected'))
  LOOP
    PERFORM app.fn_notify(v_member, v_type, p_title, p_body, COALESCE(p_payload, '{}'::jsonb));
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.liturgy_notice_log SET recipients = v_n WHERE day_date = p_day AND occasion = p_occasion AND kind = p_kind;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_liturgy_notice(date, text, text, text, text, jsonb, boolean) IS
  'Gửi nhắc lễ trọng / Bổn mạng / ngày đặc biệt / nhắc check-in cho thành viên đang ở (p_only_missing: chỉ người chưa check-in hợp lệ ngày p_day). Ghi liturgy_notice_log trước ⇒ mỗi (ngày, dịp, loại) chỉ gửi một lần. Tiến trình nền (luuxa_worker) gọi.';

-- ---------------------------------------------------------------------
-- 9. Chủ sở hữu + quyền (mẫu 49_a / 49_b)
-- ---------------------------------------------------------------------
ALTER TABLE public.liturgy_lectionary         OWNER TO luuxa_owner;
ALTER TABLE public.liturgy_lectionary_imports OWNER TO luuxa_owner;
ALTER TABLE public.liturgy_day_notes          OWNER TO luuxa_owner;
ALTER TABLE public.liturgy_special_days       OWNER TO luuxa_owner;
ALTER TABLE public.mass_checkins              OWNER TO luuxa_owner;
ALTER TABLE public.liturgy_notice_log         OWNER TO luuxa_owner;

REVOKE ALL ON public.liturgy_lectionary, public.liturgy_lectionary_imports, public.liturgy_day_notes,
              public.liturgy_special_days, public.mass_checkins, public.liturgy_notice_log FROM luuxa_app;
GRANT SELECT ON public.liturgy_lectionary, public.liturgy_lectionary_imports TO luuxa_app;
GRANT SELECT, DELETE ON public.liturgy_day_notes TO luuxa_app;
GRANT INSERT (day_date, intention, note) ON public.liturgy_day_notes TO luuxa_app;
GRANT UPDATE (intention, note) ON public.liturgy_day_notes TO luuxa_app;
GRANT SELECT ON public.liturgy_special_days TO luuxa_app;
GRANT INSERT (title, description, month, day, year, color, requires_checkin, evidence_required, notify, is_active) ON public.liturgy_special_days TO luuxa_app;
GRANT UPDATE (title, description, month, day, year, color, requires_checkin, evidence_required, notify, is_active, deleted_at) ON public.liturgy_special_days TO luuxa_app;
GRANT SELECT, DELETE ON public.mass_checkins TO luuxa_app;
GRANT INSERT (day_date, occasion, church, note, evidence_file_id) ON public.mass_checkins TO luuxa_app;
GRANT UPDATE (church, note, evidence_file_id, status, review_note) ON public.mass_checkins TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liturgy_lectionary, public.liturgy_lectionary_imports, public.liturgy_day_notes,
                                        public.liturgy_special_days, public.mass_checkins, public.liturgy_notice_log TO luuxa_worker, luuxa_definer;
-- luuxa_readonly (báo cáo) chỉ được đọc view tổng hợp — smoke test kiểm định S12e4 khẳng định điều này
REVOKE ALL ON public.liturgy_lectionary, public.liturgy_lectionary_imports, public.liturgy_day_notes,
              public.liturgy_special_days, public.mass_checkins, public.liturgy_notice_log FROM luuxa_readonly;

ALTER FUNCTION app.tg_liturgy_day_notes_rules()    OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_liturgy_special_days_rules() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_mass_checkins_rules()        OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_mass_checkins_attach()       OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_liturgy_notice(date, text, text, text, text, jsonb, boolean) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_liturgy_notice(date, text, text, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_liturgy_notice(date, text, text, text, text, jsonb, boolean) TO luuxa_worker;
REVOKE ALL ON FUNCTION app.tg_liturgy_day_notes_rules(), app.tg_liturgy_special_days_rules(), app.tg_mass_checkins_rules(),
                       app.tg_mass_checkins_attach() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_liturgy_day_notes_rules(), app.tg_liturgy_special_days_rules(), app.tg_mass_checkins_rules(),
                          app.tg_mass_checkins_attach() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 10. Loại thông báo + cấu hình
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('liturgy.feast_upcoming',   'event', 'Sắp đến lễ trọng / ngày đặc biệt của nhà', ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('liturgy.checkin_reminder', 'event', 'Nhắc check-in đi lễ',                      ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('liturgy.checkin_reviewed', 'event', 'Kết quả duyệt check-in đi lễ',             ARRAY['in_app']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('org.patron_name', '"Thánh Phanxicô Assisi"'::jsonb, 'string',
   'Tên vị thánh hoặc mầu nhiệm Bổn mạng của lưu xá (hiển thị nổi bật trên lịch vào ngày Bổn mạng).', NULL, NULL, true, 'setting.write', '""'::jsonb),
  ('liturgy.notify_days_before', '7'::jsonb, 'integer',
   'Báo cho anh em trước bao nhiêu ngày khi sắp đến lễ trọng, lễ Bổn mạng hoặc ngày đặc biệt của nhà (0 = không báo trước).', 0, 30, true, 'liturgy.calendar.manage', '7'::jsonb),
  ('liturgy.notify_day_before', 'true'::jsonb, 'boolean',
   'Nhắc thêm một lần vào hôm trước ngày lễ trọng / ngày đặc biệt.', NULL, NULL, true, 'liturgy.calendar.manage', 'true'::jsonb),
  ('liturgy.checkin_sunday', 'true'::jsonb, 'boolean',
   'Chúa Nhật: anh em check-in đã đi lễ (không cần ảnh minh chứng).', NULL, NULL, true, 'liturgy.calendar.manage', 'true'::jsonb),
  ('liturgy.checkin_solemnity', 'true'::jsonb, 'boolean',
   'Lễ trọng và lễ Bổn mạng không rơi vào Chúa Nhật: anh em phải check-in đi lễ kèm ảnh minh chứng.', NULL, NULL, true, 'liturgy.calendar.manage', 'true'::jsonb),
  ('liturgy.checkin_grace_days', '2'::jsonb, 'integer',
   'Cho phép check-in đi lễ muộn tối đa bao nhiêu ngày sau ngày lễ.', 0, 7, true, 'liturgy.calendar.manage', '2'::jsonb),
  ('liturgy.checkin_reminder_time', '"19:00"'::jsonb, 'time',
   'Giờ nhắc riêng những anh em chưa check-in trong ngày lễ bắt buộc.', NULL, NULL, true, 'liturgy.calendar.manage', '"19:00"'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
