-- =====================================================================
-- 1011 — LUẬT NHÀ (nội quy lưu xá). Chạy SAU 1010. Idempotent.
--   • Luật nhà chia theo MỤC (vd. "Giờ giấc sinh hoạt", "Vệ sinh chung", "Khách & ra vào"); mỗi mục có danh sách điều khoản,
--     điều khoản có thể kèm GIỜ (vd. "22:30" — tắt đèn). Mọi thành viên xem được và tải PDF.
--   • Quyền mới house.rules.manage (Trưởng nhà + Admin) để soạn/sửa/xóa/sắp xếp mục. Ghi trực tiếp dưới RLS (không cần hàm riêng).
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('house.rules.manage', 'house', 'Soạn, sửa và sắp xếp luật nhà (nội quy)', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'house.rules.manage' FROM public.roles r WHERE r.code IN ('house_head', 'admin')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.house_rule_sections (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  title        text        NOT NULL,
  icon         text,
  description  text,
  items        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_house_rule_sections__title CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  CONSTRAINT ck_house_rule_sections__icon CHECK (icon IS NULL OR char_length(icon) <= 8),
  CONSTRAINT ck_house_rule_sections__desc CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT ck_house_rule_sections__items CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 60)
);
COMMENT ON TABLE public.house_rule_sections IS
  'Mục của luật nhà. items = [{"time": "22:30"?, "text": "…"}, …] (time là giờ/khung giờ tùy chọn, dạng chuỗi ≤ 30 ký tự).';
CREATE INDEX IF NOT EXISTS ix_house_rule_sections__sort ON public.house_rule_sections (sort_order, created_at);
CREATE INDEX IF NOT EXISTS ix_house_rule_sections__created_by ON public.house_rule_sections (created_by);
CREATE INDEX IF NOT EXISTS ix_house_rule_sections__updated_by ON public.house_rule_sections (updated_by);

CREATE OR REPLACE FUNCTION app.tg_house_rule_sections_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
    NEW.created_at := now();
  END IF;
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  NEW.updated_at := now();
  NEW.title := btrim(NEW.title);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_house_rule_sections__stamp ON public.house_rule_sections;
CREATE TRIGGER trg_house_rule_sections__stamp BEFORE INSERT OR UPDATE ON public.house_rule_sections
  FOR EACH ROW EXECUTE FUNCTION app.tg_house_rule_sections_stamp();
DROP TRIGGER IF EXISTS trg_house_rule_sections__audit ON public.house_rule_sections;
CREATE TRIGGER trg_house_rule_sections__audit AFTER INSERT OR UPDATE OR DELETE ON public.house_rule_sections
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

ALTER TABLE public.house_rule_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_rule_sections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS house_rule_sections__select ON public.house_rule_sections;
CREATE POLICY house_rule_sections__select ON public.house_rule_sections FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (is_active OR (SELECT app.has_permission('house.rules.manage'))));
DROP POLICY IF EXISTS house_rule_sections__write ON public.house_rule_sections;
CREATE POLICY house_rule_sections__write ON public.house_rule_sections FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('house.rules.manage'))) WITH CHECK ((SELECT app.has_permission('house.rules.manage')));

ALTER TABLE public.house_rule_sections OWNER TO luuxa_owner;
REVOKE ALL ON public.house_rule_sections FROM luuxa_app;
GRANT SELECT ON public.house_rule_sections TO luuxa_app;
GRANT INSERT (title, icon, description, items, sort_order, is_active) ON public.house_rule_sections TO luuxa_app;
GRANT UPDATE (title, icon, description, items, sort_order, is_active) ON public.house_rule_sections TO luuxa_app;
GRANT DELETE ON public.house_rule_sections TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.house_rule_sections TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_house_rule_sections_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_house_rule_sections_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_house_rule_sections_stamp() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
