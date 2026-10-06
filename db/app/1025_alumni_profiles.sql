-- =====================================================================
-- 1025 — Hồ sơ cựu thành viên (mạng lưới cựu): nghề nghiệp, nơi làm việc, thành phố, năm ra trường, còn giữ liên lạc không.
--   Người xem: ban điều hành (member.update), chính chủ, hoặc mọi thành viên khi hồ sơ được đánh dấu "còn giữ liên lạc"
--   (cựu đã đồng ý chia sẻ — Ban điều hành chỉ bật cờ này sau khi hỏi ý kiến). Ghi: member.update hoặc chính chủ.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.alumni_profiles (
  member_id        uuid        PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  graduation_year  smallint,
  occupation       text,
  workplace        text,
  city             text,
  keeps_contact    boolean     NOT NULL DEFAULT false,
  note             text,
  updated_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_alumni_profiles__year CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1980 AND 2100),
  CONSTRAINT ck_alumni_profiles__occupation CHECK (occupation IS NULL OR char_length(occupation) <= 120),
  CONSTRAINT ck_alumni_profiles__workplace CHECK (workplace IS NULL OR char_length(workplace) <= 200),
  CONSTRAINT ck_alumni_profiles__city CHECK (city IS NULL OR char_length(city) <= 100),
  CONSTRAINT ck_alumni_profiles__note CHECK (note IS NULL OR char_length(note) <= 500)
);
COMMENT ON TABLE public.alumni_profiles IS 'Hồ sơ cựu thành viên: nghề nghiệp, nơi làm việc, thành phố, còn giữ liên lạc (cờ chia sẻ trong cộng đoàn).';
CREATE INDEX IF NOT EXISTS ix_alumni_profiles__updated_by ON public.alumni_profiles (updated_by);

CREATE OR REPLACE FUNCTION app.tg_alumni_profiles_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_alumni_profiles__stamp ON public.alumni_profiles;
CREATE TRIGGER trg_alumni_profiles__stamp BEFORE INSERT OR UPDATE ON public.alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION app.tg_alumni_profiles_stamp();
DROP TRIGGER IF EXISTS trg_alumni_profiles__audit ON public.alumni_profiles;
CREATE TRIGGER trg_alumni_profiles__audit AFTER INSERT OR UPDATE OR DELETE ON public.alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('member_id');

ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alumni_profiles__select ON public.alumni_profiles;
CREATE POLICY alumni_profiles__select ON public.alumni_profiles FOR SELECT TO luuxa_app
  USING (keeps_contact OR (SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));
DROP POLICY IF EXISTS alumni_profiles__insert ON public.alumni_profiles;
CREATE POLICY alumni_profiles__insert ON public.alumni_profiles FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));
DROP POLICY IF EXISTS alumni_profiles__update ON public.alumni_profiles;
CREATE POLICY alumni_profiles__update ON public.alumni_profiles FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));
ALTER TABLE public.alumni_profiles OWNER TO luuxa_owner;
REVOKE ALL ON public.alumni_profiles FROM luuxa_app;
GRANT SELECT ON public.alumni_profiles TO luuxa_app;
GRANT INSERT (member_id, graduation_year, occupation, workplace, city, keeps_contact, note) ON public.alumni_profiles TO luuxa_app;
GRANT UPDATE (graduation_year, occupation, workplace, city, keeps_contact, note) ON public.alumni_profiles TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumni_profiles TO luuxa_worker, luuxa_definer;
ALTER FUNCTION app.tg_alumni_profiles_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_alumni_profiles_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_alumni_profiles_stamp() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
