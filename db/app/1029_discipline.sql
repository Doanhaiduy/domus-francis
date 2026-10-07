-- =====================================================================
-- 1029 — VI PHẠM & KỶ LUẬT: danh mục luật nhà kèm mức phạt gợi ý + sổ ghi nhận vi phạm của thành viên
--   • discipline_rules: điều luật (mã, tên, mô tả) + hình phạt gợi ý (lần chuỗi / đi lễ / trực nhật / khác + số lượng). Danh mục để trống,
--     người quản lý nhập sau (hoặc nhập từ phần "Luật nhà" có sẵn).
--   • discipline_records: ghi nhận vi phạm — thành viên, điều luật (lưu cả bản sao tên để sửa luật sau này không đổi lịch sử), ngày vi phạm,
--     hình phạt (loại, số lượng, chi tiết), ngày bắt đầu/kết thúc chấp hành, trạng thái (đang xử lý / đã hoàn thành / được miễn).
--   • Quyền: discipline.read (xem cả nhà), discipline.manage (ghi/sửa/xóa) — Trưởng nhà + Admin. Mỗi thành viên luôn xem được vi phạm của CHÍNH MÌNH.
--   Ghi trực tiếp dưới RLS (không cần hàm riêng); thông báo cho thành viên do ứng dụng gửi bằng vai trò worker.
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive) VALUES
  ('discipline.read',   'house', 'Xem vi phạm và hình phạt của mọi thành viên (mỗi người luôn xem được của chính mình)', true),
  ('discipline.manage', 'house', 'Quản lý danh mục luật phạt; ghi, sửa, xóa vi phạm và hình phạt của thành viên', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r CROSS JOIN (VALUES ('discipline.read'), ('discipline.manage')) AS p(code)
 WHERE r.code IN ('house_head', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory)
VALUES ('system.discipline_recorded', 'system', 'Có ghi nhận vi phạm / hình phạt', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. Danh mục điều luật + mức phạt gợi ý
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discipline_rules (
  id                    uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code                  text        NOT NULL,
  title                 text        NOT NULL,
  description           text,
  default_penalty_kind  text        NOT NULL DEFAULT 'none',
  default_penalty_qty   integer,
  default_penalty_note  text,
  sort_order            integer     NOT NULL DEFAULT 0,
  is_active             boolean     NOT NULL DEFAULT true,
  created_by            uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_discipline_rules__code UNIQUE (code),
  CONSTRAINT ck_discipline_rules__code  CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,19}$'),
  CONSTRAINT ck_discipline_rules__title CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT ck_discipline_rules__desc  CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT ck_discipline_rules__kind  CHECK (default_penalty_kind IN ('none', 'rosary', 'mass', 'duty', 'other')),
  CONSTRAINT ck_discipline_rules__qty   CHECK (default_penalty_qty IS NULL OR default_penalty_qty BETWEEN 1 AND 365),
  CONSTRAINT ck_discipline_rules__note  CHECK (default_penalty_note IS NULL OR char_length(default_penalty_note) <= 200)
);
COMMENT ON TABLE public.discipline_rules IS
  'Danh mục điều luật nhà dùng để ghi nhận vi phạm, kèm hình phạt gợi ý (loại: lần chuỗi / đi lễ / trực nhật / khác + số lượng). Người quản lý nhập; thành viên chỉ đọc điều đang áp dụng.';
CREATE INDEX IF NOT EXISTS ix_discipline_rules__sort ON public.discipline_rules (sort_order, code);
CREATE INDEX IF NOT EXISTS ix_discipline_rules__created_by ON public.discipline_rules (created_by);
CREATE INDEX IF NOT EXISTS ix_discipline_rules__updated_by ON public.discipline_rules (updated_by);

-- ---------------------------------------------------------------------
-- 2. Ghi nhận vi phạm + hình phạt
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discipline_records (
  id                  uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id           uuid        NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  rule_id             uuid        REFERENCES public.discipline_rules(id) ON DELETE SET NULL,
  rule_code           text,
  rule_title          text        NOT NULL,
  occurred_on         date        NOT NULL,
  note                text,
  penalty_kind        text        NOT NULL DEFAULT 'none',
  penalty_qty         integer,
  penalty_detail      text,
  penalty_starts_on   date,
  penalty_ends_on     date,
  status              text        NOT NULL DEFAULT 'open',
  completed_at        timestamptz,
  completed_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  waived_at           timestamptz,
  waived_by           uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  waive_reason        text,
  created_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_discipline_records__title  CHECK (char_length(btrim(rule_title)) BETWEEN 2 AND 200),
  CONSTRAINT ck_discipline_records__note   CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT ck_discipline_records__kind   CHECK (penalty_kind IN ('none', 'rosary', 'mass', 'duty', 'other')),
  CONSTRAINT ck_discipline_records__qty    CHECK (penalty_qty IS NULL OR penalty_qty BETWEEN 1 AND 365),
  CONSTRAINT ck_discipline_records__qty_req CHECK (penalty_kind NOT IN ('rosary', 'mass', 'duty') OR penalty_qty IS NOT NULL),
  CONSTRAINT ck_discipline_records__detail CHECK (penalty_detail IS NULL OR char_length(penalty_detail) <= 200),
  CONSTRAINT ck_discipline_records__other  CHECK (penalty_kind <> 'other' OR char_length(btrim(COALESCE(penalty_detail, ''))) >= 2),
  CONSTRAINT ck_discipline_records__range  CHECK (penalty_ends_on IS NULL OR penalty_starts_on IS NULL OR penalty_ends_on >= penalty_starts_on),
  CONSTRAINT ck_discipline_records__status CHECK (status IN ('open', 'completed', 'waived')),
  CONSTRAINT ck_discipline_records__done   CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT ck_discipline_records__waived CHECK ((status = 'waived') = (waived_at IS NOT NULL)),
  CONSTRAINT ck_discipline_records__waive_reason CHECK (status <> 'waived' OR char_length(btrim(COALESCE(waive_reason, ''))) >= 5)
);
COMMENT ON TABLE public.discipline_records IS
  'Sổ vi phạm của thành viên: điều luật (kèm bản sao tên), ngày vi phạm, hình phạt (loại, số lượng, chi tiết), ngày bắt đầu/kết thúc chấp hành, trạng thái open/completed/waived. Giai đoạn (sắp tới/đang chấp hành/quá hạn) tính từ ngày, không lưu.';
CREATE INDEX IF NOT EXISTS ix_discipline_records__member_date ON public.discipline_records (member_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS ix_discipline_records__date ON public.discipline_records (occurred_on DESC);
CREATE INDEX IF NOT EXISTS ix_discipline_records__open ON public.discipline_records (penalty_ends_on) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ix_discipline_records__rule_id ON public.discipline_records (rule_id);
CREATE INDEX IF NOT EXISTS ix_discipline_records__completed_by ON public.discipline_records (completed_by);
CREATE INDEX IF NOT EXISTS ix_discipline_records__waived_by ON public.discipline_records (waived_by);
CREATE INDEX IF NOT EXISTS ix_discipline_records__created_by ON public.discipline_records (created_by);
CREATE INDEX IF NOT EXISTS ix_discipline_records__updated_by ON public.discipline_records (updated_by);

-- ---------------------------------------------------------------------
-- 3. Dấu thời gian / người sửa; tự đóng dấu hoàn thành / miễn khi đổi trạng thái
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_discipline_rules_stamp()
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
  NEW.code := upper(btrim(NEW.code));
  NEW.title := btrim(NEW.title);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.tg_discipline_records_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
    NEW.created_at := now();
    NEW.status := 'open';
    NEW.completed_at := NULL; NEW.completed_by := NULL; NEW.waived_at := NULL; NEW.waived_by := NULL; NEW.waive_reason := NULL;
  ELSE
    -- đóng dấu khi chuyển trạng thái; mở lại thì xóa dấu
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      NEW.completed_at := now(); NEW.completed_by := app.current_user_id();
    ELSIF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL; NEW.completed_by := NULL;
    ELSE
      NEW.completed_at := OLD.completed_at; NEW.completed_by := OLD.completed_by;
    END IF;
    IF NEW.status = 'waived' AND OLD.status <> 'waived' THEN
      NEW.waived_at := now(); NEW.waived_by := app.current_user_id();
    ELSIF NEW.status <> 'waived' THEN
      NEW.waived_at := NULL; NEW.waived_by := NULL; NEW.waive_reason := NULL;
    ELSE
      NEW.waived_at := OLD.waived_at; NEW.waived_by := OLD.waived_by;
    END IF;
  END IF;
  NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  NEW.updated_at := now();
  NEW.rule_title := btrim(NEW.rule_title);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_discipline_rules__stamp ON public.discipline_rules;
CREATE TRIGGER trg_discipline_rules__stamp BEFORE INSERT OR UPDATE ON public.discipline_rules
  FOR EACH ROW EXECUTE FUNCTION app.tg_discipline_rules_stamp();
DROP TRIGGER IF EXISTS trg_discipline_rules__audit ON public.discipline_rules;
CREATE TRIGGER trg_discipline_rules__audit AFTER INSERT OR UPDATE OR DELETE ON public.discipline_rules
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

DROP TRIGGER IF EXISTS trg_discipline_records__stamp ON public.discipline_records;
CREATE TRIGGER trg_discipline_records__stamp BEFORE INSERT OR UPDATE ON public.discipline_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_discipline_records_stamp();
DROP TRIGGER IF EXISTS trg_discipline_records__audit ON public.discipline_records;
CREATE TRIGGER trg_discipline_records__audit AFTER INSERT OR UPDATE OR DELETE ON public.discipline_records
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'note,penalty_detail,waive_reason');

-- ---------------------------------------------------------------------
-- 4. RLS + quyền cột
-- ---------------------------------------------------------------------
ALTER TABLE public.discipline_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discipline_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.discipline_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discipline_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discipline_rules__select ON public.discipline_rules;
CREATE POLICY discipline_rules__select ON public.discipline_rules FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (is_active OR (SELECT app.has_permission('discipline.manage'))));
DROP POLICY IF EXISTS discipline_rules__write ON public.discipline_rules;
CREATE POLICY discipline_rules__write ON public.discipline_rules FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('discipline.manage'))) WITH CHECK ((SELECT app.has_permission('discipline.manage')));

DROP POLICY IF EXISTS discipline_records__select ON public.discipline_records;
CREATE POLICY discipline_records__select ON public.discipline_records FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_any_permission(ARRAY['discipline.read', 'discipline.manage'])));
DROP POLICY IF EXISTS discipline_records__write ON public.discipline_records;
CREATE POLICY discipline_records__write ON public.discipline_records FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('discipline.manage'))) WITH CHECK ((SELECT app.has_permission('discipline.manage')));

ALTER TABLE public.discipline_rules OWNER TO luuxa_owner;
ALTER TABLE public.discipline_records OWNER TO luuxa_owner;
REVOKE ALL ON public.discipline_rules FROM luuxa_app;
REVOKE ALL ON public.discipline_records FROM luuxa_app;

GRANT SELECT ON public.discipline_rules TO luuxa_app;
GRANT INSERT (code, title, description, default_penalty_kind, default_penalty_qty, default_penalty_note, sort_order, is_active) ON public.discipline_rules TO luuxa_app;
GRANT UPDATE (code, title, description, default_penalty_kind, default_penalty_qty, default_penalty_note, sort_order, is_active) ON public.discipline_rules TO luuxa_app;
GRANT DELETE ON public.discipline_rules TO luuxa_app;

GRANT SELECT ON public.discipline_records TO luuxa_app;
GRANT INSERT (member_id, rule_id, rule_code, rule_title, occurred_on, note, penalty_kind, penalty_qty, penalty_detail, penalty_starts_on, penalty_ends_on)
  ON public.discipline_records TO luuxa_app;
GRANT UPDATE (rule_id, rule_code, rule_title, occurred_on, note, penalty_kind, penalty_qty, penalty_detail, penalty_starts_on, penalty_ends_on, status, waive_reason)
  ON public.discipline_records TO luuxa_app;
GRANT DELETE ON public.discipline_records TO luuxa_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_rules, public.discipline_records TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_discipline_rules_stamp() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_discipline_records_stamp() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_discipline_rules_stamp(), app.tg_discipline_records_stamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_discipline_rules_stamp(), app.tg_discipline_records_stamp()
  TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
