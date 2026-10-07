-- =====================================================================
-- 97 — Bếp & Cơm: phần bổ sung cho ứng dụng web (kiểm định F-025 / A-018).
--
-- Thiết kế đã có: meal_menus, meal_menu_cooks, meal_registrations (trigger tg_meal_registration_rules: cờ
-- feature.meals.enabled, trạng thái bữa, giờ chốt, chỉ tự đăng ký cho mình), pantry_items + v_pantry_status.
-- Thiếu (F-025): yêu cầu mua thêm, danh sách cần mua, khảo sát món, góp ý bữa ăn — thêm ở đây theo đúng quy ước
-- thiết kế: PK uuid v7, mốc thời gian timestamptz, ENABLE + FORCE RLS, chính sách TO luuxa_app theo quyền
-- meal.manage / meal.register / app.is_self, GRANT mức cột, OWNER luuxa_owner, trigger touch/audit, IDEMPOTENT.
--
-- KHÔNG bật cờ feature.meals.enabled ở đây (smoke test kiểm định khẳng định mặc định đang tạm hoãn); việc bật là
-- quyết định của người quản lý (Cài đặt / nút "Bật lại phân hệ" trên /bep-com cho người có setting.write).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hàm tiện ích: giờ chốt mặc định theo cấu hình (meal.lunch_cutoff_time / meal.dinner_cutoff_time, giờ VN)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_meal_default_cutoff(p_date date, p_meal meal_type_t)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT ((p_date + COALESCE(NULLIF(app.setting_text(CASE p_meal WHEN 'lunch' THEN 'meal.lunch_cutoff_time' ELSE 'meal.dinner_cutoff_time' END), ''),
                             CASE p_meal WHEN 'lunch' THEN '09:00' ELSE '15:00' END)::time)
          AT TIME ZONE 'Asia/Ho_Chi_Minh')
$$;
COMMENT ON FUNCTION app.fn_meal_default_cutoff(date, meal_type_t) IS
  'Hạn chốt suất mặc định của một bữa = ngày + giờ chốt trong settings (meal.lunch_cutoff_time / meal.dinner_cutoff_time), hiểu theo giờ Việt Nam.';

-- ---------------------------------------------------------------------
-- 2. Mở "ô bữa ăn" để thành viên đăng ký khi Ban Ẩm thực chưa lập thực đơn (meal_menus chỉ meal.manage ghi được)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_meal_ensure_menu(p_date date, p_meal meal_type_t)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_id     uuid;
  v_manage boolean;
  v_cutoff timestamptz;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_manage := app.has_permission('meal.manage');
  IF NOT v_manage AND NOT app.has_permission('meal.register') THEN
    RAISE EXCEPTION 'BR-MEAL-02: bạn không có quyền đăng ký suất ăn.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.setting_bool('feature.meals.enabled') THEN
    RAISE EXCEPTION 'BR-MEAL-00: phân hệ Bếp & Cơm đang tạm hoãn theo quyết định người quản lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT m.id INTO v_id FROM public.meal_menus m WHERE m.menu_date = p_date AND m.meal_type = p_meal;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  IF p_date > app.local_today() + 31 OR p_date < app.local_today() - (CASE WHEN v_manage THEN 31 ELSE 0 END) THEN
    RAISE EXCEPTION 'BR-MEAL-03: chỉ đăng ký được suất ăn từ hôm nay đến 31 ngày tới.' USING ERRCODE = 'check_violation';
  END IF;
  v_cutoff := app.fn_meal_default_cutoff(p_date, p_meal);
  IF NOT v_manage AND now() > v_cutoff THEN
    RAISE EXCEPTION 'BR-MEAL-01: đã quá giờ chốt suất ăn.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.meal_menus (menu_date, meal_type, cutoff_at, status, created_by)
  VALUES (p_date, p_meal, v_cutoff, 'open', app.current_user_id())
  ON CONFLICT (menu_date, meal_type) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT m.id INTO v_id FROM public.meal_menus m WHERE m.menu_date = p_date AND m.meal_type = p_meal;
  END IF;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_meal_ensure_menu(date, meal_type_t) IS
  'Trả về meal_menus.id của (ngày, bữa); nếu chưa có thì mở một bữa trống (status=open, cutoff_at theo settings) để thành viên đăng ký trước khi Ban Ẩm thực điền món. Cần meal.register/meal.manage, cờ feature.meals.enabled; thành viên thường chỉ mở được bữa chưa quá giờ chốt, từ hôm nay đến +31 ngày.';

-- ---------------------------------------------------------------------
-- 3. Số suất theo bữa (mọi người cần thấy tổng, nhưng RLS chỉ cho xem đăng ký của chính mình)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_meal_counts(p_from date, p_to date)
RETURNS TABLE (menu_id uuid, menu_date date, meal_type meal_type_t, eaters bigint, guests bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (app.has_permission('meal.register') OR app.has_permission('meal.manage')) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem số suất ăn.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'Khoảng ngày không hợp lệ (tối đa 62 ngày).' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
    SELECT m.id, m.menu_date, m.meal_type,
           COUNT(r.member_id) FILTER (WHERE r.will_eat)::bigint,
           COALESCE(SUM(r.guests) FILTER (WHERE r.will_eat), 0)::bigint
      FROM public.meal_menus m
      LEFT JOIN public.meal_registrations r ON r.menu_id = m.id
     WHERE m.menu_date BETWEEN p_from AND p_to
     GROUP BY m.id, m.menu_date, m.meal_type;
END
$$;
COMMENT ON FUNCTION app.fn_meal_counts(date, date) IS
  'Tổng số suất (người ăn + khách) của từng bữa trong khoảng ngày — chỉ số đếm, không lộ ai đăng ký (RLS meal_registrations chỉ cho xem của mình / người quản lý bếp).';

-- ---------------------------------------------------------------------
-- 4. Yêu cầu mua thêm (thành viên đề xuất, Ban Ẩm thực xử lý) — A-018 mở rộng: cho phép đề xuất mặt hàng chưa có trong kho
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pantry_restock_requests (
  id               uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  pantry_item_id   uuid          REFERENCES public.pantry_items(id) ON DELETE SET NULL,
  item_name        text          NOT NULL,
  qty              numeric(10,2),
  unit             text,
  note             text,
  status           text          NOT NULL DEFAULT 'open',
  requested_by     uuid          NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  resolved_by      uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_pantry_restock_requests__status     CHECK (status IN ('open', 'approved', 'bought', 'rejected', 'cancelled')),
  CONSTRAINT ck_pantry_restock_requests__qty        CHECK (qty IS NULL OR qty > 0),
  CONSTRAINT ck_pantry_restock_requests__name       CHECK (char_length(btrim(item_name)) BETWEEN 2 AND 100),
  CONSTRAINT ck_pantry_restock_requests__unit       CHECK (unit IS NULL OR char_length(unit) <= 30),
  CONSTRAINT ck_pantry_restock_requests__note       CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_pantry_restock_requests__resolution CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500),
  CONSTRAINT ck_pantry_restock_requests__resolved   CHECK ((status = 'open') = (resolved_at IS NULL))
);
COMMENT ON TABLE public.pantry_restock_requests IS
  'Yêu cầu mua thêm đồ bếp (FE: nút "Mua thêm" từng mặt hàng, "+ Đề xuất mua thêm gia vị"). Ai cũng đề xuất được (meal.register); Ban Ẩm thực (meal.manage) duyệt → đưa vào danh sách cần mua (approved), mua xong (bought) hoặc từ chối; người đề xuất tự hủy khi còn chờ. pantry_item_id NULL = mặt hàng mới chưa có trong kho.';
CREATE INDEX IF NOT EXISTS ix_pantry_restock_requests__pantry_item_id ON public.pantry_restock_requests (pantry_item_id);
CREATE INDEX IF NOT EXISTS ix_pantry_restock_requests__requested_by ON public.pantry_restock_requests (requested_by);
CREATE INDEX IF NOT EXISTS ix_pantry_restock_requests__resolved_by ON public.pantry_restock_requests (resolved_by);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pantry_restock_requests__open_item ON public.pantry_restock_requests (pantry_item_id)
  WHERE pantry_item_id IS NOT NULL AND status IN ('open', 'approved');

CREATE OR REPLACE FUNCTION app.tg_pantry_restock_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_name   text;
  v_unit   text;
  v_active boolean;
  v_manage boolean := (app.current_user_id() IS NULL AND app.is_system_caller()) OR app.has_permission('meal.manage');
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
    NEW.resolved_by := NULL;
    NEW.resolved_at := NULL;
    NEW.resolution_note := NULL;
    NEW.item_name := btrim(COALESCE(NEW.item_name, ''));
    IF NEW.pantry_item_id IS NOT NULL THEN
      SELECT p.name, p.unit, p.is_active INTO v_name, v_unit, v_active FROM public.pantry_items p WHERE p.id = NEW.pantry_item_id;
      IF NOT FOUND OR NOT v_active THEN
        RAISE EXCEPTION 'BR-MEAL-10: mặt hàng không còn trong danh mục kho bếp.' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.item_name = '' THEN NEW.item_name := v_name; END IF;
      NEW.unit := COALESCE(NULLIF(btrim(NEW.unit), ''), v_unit);
      IF EXISTS (SELECT 1 FROM public.pantry_restock_requests x
                  WHERE x.pantry_item_id = NEW.pantry_item_id AND x.status IN ('open', 'approved')) THEN
        RAISE EXCEPTION 'BR-MEAL-11: "%" đã có yêu cầu mua thêm đang chờ xử lý.', v_name USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.pantry_item_id IS DISTINCT FROM OLD.pantry_item_id OR NEW.requested_by <> OLD.requested_by THEN
    RAISE EXCEPTION 'BR-MEAL-12: không được đổi mặt hàng hay người đề xuất của yêu cầu.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('bought', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'BR-MEAL-12: yêu cầu đã được xử lý xong, không đổi trạng thái được nữa.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'open' THEN
      RAISE EXCEPTION 'BR-MEAL-12: không mở lại yêu cầu đã xử lý — hãy tạo yêu cầu mới.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_manage AND NOT (OLD.status = 'open' AND NEW.status = 'cancelled' AND app.is_self(OLD.requested_by)) THEN
      RAISE EXCEPTION 'BR-MEAL-13: chỉ Ban Ẩm thực mới duyệt / xử lý yêu cầu mua thêm (người đề xuất chỉ được hủy khi còn chờ).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.resolved_by := COALESCE(app.current_user_id(), NEW.resolved_by);
    NEW.resolved_at := now();
  ELSIF OLD.status <> 'open' AND (NEW.qty IS DISTINCT FROM OLD.qty OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.note IS DISTINCT FROM OLD.note) THEN
    RAISE EXCEPTION 'BR-MEAL-12: yêu cầu đã được xử lý, không sửa nội dung được nữa.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_pantry_restock_rules() IS
  'BEFORE INSERT/UPDATE pantry_restock_requests: tạo mới luôn ở trạng thái open (điền tên/đơn vị từ kho), chặn yêu cầu trùng cho cùng mặt hàng đang chờ; luồng trạng thái open → approved → bought | rejected | cancelled (không quay lại); chỉ meal.manage duyệt/xử lý, người đề xuất chỉ hủy khi còn open; ghi resolved_by/resolved_at.';

DROP TRIGGER IF EXISTS trg_pantry_restock_requests__rules ON public.pantry_restock_requests;
CREATE TRIGGER trg_pantry_restock_requests__rules BEFORE INSERT OR UPDATE ON public.pantry_restock_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_pantry_restock_rules();
DROP TRIGGER IF EXISTS trg_pantry_restock_requests__touch ON public.pantry_restock_requests;
CREATE TRIGGER trg_pantry_restock_requests__touch BEFORE UPDATE ON public.pantry_restock_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_pantry_restock_requests__audit ON public.pantry_restock_requests;
CREATE TRIGGER trg_pantry_restock_requests__audit AFTER INSERT OR UPDATE OR DELETE ON public.pantry_restock_requests
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

-- ---------------------------------------------------------------------
-- 5. Danh sách cần mua (đội đi chợ) — Ban Ẩm thực ghi, mọi người xem
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id                  uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  name                text          NOT NULL,
  qty                 numeric(10,2),
  unit                text,
  note                text,
  pantry_item_id      uuid          REFERENCES public.pantry_items(id) ON DELETE SET NULL,
  restock_request_id  uuid          REFERENCES public.pantry_restock_requests(id) ON DELETE SET NULL,
  needed_on           date,
  est_cost_vnd        bigint,
  is_purchased        boolean       NOT NULL DEFAULT false,
  purchased_at        timestamptz,
  purchased_by        uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  created_by          uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_shopping_list_items__name      CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  CONSTRAINT ck_shopping_list_items__qty       CHECK (qty IS NULL OR qty > 0),
  CONSTRAINT ck_shopping_list_items__unit      CHECK (unit IS NULL OR char_length(unit) <= 30),
  CONSTRAINT ck_shopping_list_items__note      CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_shopping_list_items__cost      CHECK (est_cost_vnd IS NULL OR est_cost_vnd >= 0),
  CONSTRAINT ck_shopping_list_items__purchased CHECK (is_purchased = (purchased_at IS NOT NULL))
);
COMMENT ON TABLE public.shopping_list_items IS
  'Danh sách đồ cần mua cho bếp (FE: "Đã thêm vào danh sách đồ cần mua sáng mai" chỉ là toast). Đánh dấu đã mua ⇒ tự cộng tồn kho mặt hàng liên kết (cùng đơn vị) và đóng yêu cầu mua thêm liên quan (bought).';
CREATE INDEX IF NOT EXISTS ix_shopping_list_items__pantry_item_id ON public.shopping_list_items (pantry_item_id);
CREATE INDEX IF NOT EXISTS ix_shopping_list_items__restock_request_id ON public.shopping_list_items (restock_request_id);
CREATE INDEX IF NOT EXISTS ix_shopping_list_items__purchased_by ON public.shopping_list_items (purchased_by);
CREATE INDEX IF NOT EXISTS ix_shopping_list_items__created_by ON public.shopping_list_items (created_by);

CREATE OR REPLACE FUNCTION app.tg_shopping_list_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_name text;
  v_unit text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(app.current_user_id(), NEW.created_by);
    IF NEW.pantry_item_id IS NOT NULL THEN
      SELECT p.name, p.unit INTO v_name, v_unit FROM public.pantry_items p WHERE p.id = NEW.pantry_item_id;
      NEW.name := COALESCE(NULLIF(btrim(NEW.name), ''), v_name);
      NEW.unit := COALESCE(NULLIF(btrim(NEW.unit), ''), v_unit);
    END IF;
  ELSE
    IF OLD.is_purchased AND NOT NEW.is_purchased THEN
      RAISE EXCEPTION 'BR-MEAL-14: mục đã đánh dấu mua (kho đã được cộng) không bỏ đánh dấu được — hãy sửa số lượng tồn kho nếu cần.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.is_purchased AND (NEW.qty IS DISTINCT FROM OLD.qty OR NEW.unit IS DISTINCT FROM OLD.unit) THEN
      RAISE EXCEPTION 'BR-MEAL-14: mục đã mua không sửa số lượng được nữa.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.pantry_item_id IS DISTINCT FROM OLD.pantry_item_id OR NEW.restock_request_id IS DISTINCT FROM OLD.restock_request_id THEN
      RAISE EXCEPTION 'BR-MEAL-14: không đổi liên kết kho / yêu cầu của mục cần mua.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.is_purchased AND (TG_OP = 'INSERT' OR NOT OLD.is_purchased) THEN
    NEW.purchased_at := now();
    NEW.purchased_by := app.current_user_id();
  ELSIF NOT NEW.is_purchased THEN
    NEW.purchased_at := NULL;
    NEW.purchased_by := NULL;
  ELSE
    NEW.purchased_at := OLD.purchased_at;
    NEW.purchased_by := OLD.purchased_by;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_shopping_list_rules() IS
  'BEFORE INSERT/UPDATE shopping_list_items: điền người tạo, tên/đơn vị từ kho; ghi purchased_at/purchased_by khi đánh dấu mua; không bỏ đánh dấu / sửa số lượng mục đã mua (kho đã cộng).';

CREATE OR REPLACE FUNCTION app.tg_shopping_list_purchased()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_purchased AND (TG_OP = 'INSERT' OR NOT OLD.is_purchased) THEN
    IF NEW.pantry_item_id IS NOT NULL AND NEW.qty IS NOT NULL THEN
      UPDATE public.pantry_items p
         SET qty_on_hand = p.qty_on_hand + NEW.qty, last_restocked_on = app.local_today()
       WHERE p.id = NEW.pantry_item_id
         AND (NEW.unit IS NULL OR lower(btrim(NEW.unit)) = lower(btrim(p.unit)));
    END IF;
    IF NEW.restock_request_id IS NOT NULL THEN
      UPDATE public.pantry_restock_requests r SET status = 'bought'
       WHERE r.id = NEW.restock_request_id AND r.status IN ('open', 'approved');
    END IF;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_shopping_list_purchased() IS
  'AFTER INSERT/UPDATE shopping_list_items: khi một mục chuyển sang đã mua ⇒ cộng tồn kho mặt hàng liên kết (chỉ khi cùng đơn vị) + đặt last_restocked_on, đóng yêu cầu mua thêm liên quan. Chạy với quyền người gọi (RLS của pantry_items/pantry_restock_requests vẫn áp dụng).';

DROP TRIGGER IF EXISTS trg_shopping_list_items__rules ON public.shopping_list_items;
CREATE TRIGGER trg_shopping_list_items__rules BEFORE INSERT OR UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION app.tg_shopping_list_rules();
DROP TRIGGER IF EXISTS trg_shopping_list_items__purchased ON public.shopping_list_items;
CREATE TRIGGER trg_shopping_list_items__purchased AFTER INSERT OR UPDATE OF is_purchased ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION app.tg_shopping_list_purchased();
DROP TRIGGER IF EXISTS trg_shopping_list_items__touch ON public.shopping_list_items;
CREATE TRIGGER trg_shopping_list_items__touch BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_shopping_list_items__audit ON public.shopping_list_items;
CREATE TRIGGER trg_shopping_list_items__audit AFTER INSERT OR UPDATE OR DELETE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

-- ---------------------------------------------------------------------
-- 6. Khảo sát món ăn (Ban Ẩm thực lập, thành viên bình chọn / đề xuất thêm món). Phiếu bầu: chỉ chính chủ đọc (như poll_votes),
--    kết quả qua app.fn_meal_survey_tally (chỉ số đếm).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_surveys (
  id                 uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  title              text        NOT NULL,
  description        text,
  max_choices        smallint    NOT NULL DEFAULT 1,
  allow_suggestions  boolean     NOT NULL DEFAULT true,
  target_week        date,
  status             text        NOT NULL DEFAULT 'open',
  closes_at          timestamptz,
  closed_at          timestamptz,
  created_by         uuid        DEFAULT app.current_user_id() REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_meal_surveys__title   CHECK (char_length(btrim(title)) BETWEEN 3 AND 150),
  CONSTRAINT ck_meal_surveys__desc    CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT ck_meal_surveys__choices CHECK (max_choices BETWEEN 1 AND 10),
  CONSTRAINT ck_meal_surveys__status  CHECK (status IN ('open', 'closed')),
  CONSTRAINT ck_meal_surveys__closed  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT ck_meal_surveys__week    CHECK (target_week IS NULL OR extract(isodow FROM target_week) = 1)
);
COMMENT ON TABLE public.meal_surveys IS
  'Phiếu khảo sát món ăn (FE: "+ Đề xuất món tuần mới" chỉ là toast). target_week = thứ Hai của tuần áp dụng; quá closes_at coi như đã đóng.';
ALTER TABLE public.meal_surveys ALTER COLUMN created_by SET DEFAULT app.current_user_id();
CREATE INDEX IF NOT EXISTS ix_meal_surveys__created_by ON public.meal_surveys (created_by);

CREATE TABLE IF NOT EXISTS public.meal_survey_options (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  survey_id     uuid        NOT NULL REFERENCES public.meal_surveys(id) ON DELETE CASCADE,
  label         text        NOT NULL,
  sort_order    smallint    NOT NULL DEFAULT 0,
  suggested_by  uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_meal_survey_options__label CHECK (char_length(btrim(label)) BETWEEN 2 AND 120)
);
COMMENT ON TABLE public.meal_survey_options IS 'Các món để bình chọn; suggested_by = thành viên đề xuất thêm (NULL = Ban Ẩm thực lập).';
CREATE UNIQUE INDEX IF NOT EXISTS ux_meal_survey_options__label ON public.meal_survey_options (survey_id, lower(btrim(label)));
CREATE INDEX IF NOT EXISTS ix_meal_survey_options__suggested_by ON public.meal_survey_options (suggested_by);

CREATE TABLE IF NOT EXISTS public.meal_survey_votes (
  survey_id   uuid        NOT NULL REFERENCES public.meal_surveys(id) ON DELETE CASCADE,
  option_id   uuid        NOT NULL REFERENCES public.meal_survey_options(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (option_id, member_id)
);
COMMENT ON TABLE public.meal_survey_votes IS 'Phiếu bình chọn món: chỉ chính chủ đọc được (kể cả Ban Ẩm thực), không audit — kết quả qua app.fn_meal_survey_tally.';
CREATE INDEX IF NOT EXISTS ix_meal_survey_votes__survey_member ON public.meal_survey_votes (survey_id, member_id);
CREATE INDEX IF NOT EXISTS ix_meal_survey_votes__member_id ON public.meal_survey_votes (member_id);

CREATE OR REPLACE FUNCTION app.tg_meal_survey_option_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_s public.meal_surveys%ROWTYPE;
BEGIN
  NEW.label := btrim(NEW.label);
  SELECT * INTO v_s FROM public.meal_surveys s WHERE s.id = NEW.survey_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu khảo sát.' USING ERRCODE = 'no_data_found';
  END IF;
  IF (app.current_user_id() IS NULL AND app.is_system_caller()) OR app.has_permission('meal.manage') THEN
    RETURN NEW;
  END IF;
  IF v_s.status <> 'open' OR (v_s.closes_at IS NOT NULL AND v_s.closes_at <= now()) THEN
    RAISE EXCEPTION 'BR-MEAL-21: khảo sát đã đóng.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT v_s.allow_suggestions THEN
    RAISE EXCEPTION 'BR-MEAL-23: khảo sát này không nhận đề xuất thêm món.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.suggested_by := app.current_member_id();
  IF (SELECT count(*) FROM public.meal_survey_options o WHERE o.survey_id = NEW.survey_id AND o.suggested_by = NEW.suggested_by) >= 3 THEN
    RAISE EXCEPTION 'BR-MEAL-23: mỗi người đề xuất tối đa 3 món cho một khảo sát.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_meal_survey_option_rules() IS 'BEFORE INSERT meal_survey_options: thành viên chỉ đề xuất khi khảo sát đang mở và cho phép đề xuất, tối đa 3 món/người.';

CREATE OR REPLACE FUNCTION app.tg_meal_survey_vote_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_s      public.meal_surveys%ROWTYPE;
  v_survey uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o.survey_id INTO v_survey FROM public.meal_survey_options o WHERE o.id = NEW.option_id;
    IF v_survey IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy món trong khảo sát.' USING ERRCODE = 'no_data_found';
    END IF;
    IF NEW.survey_id IS DISTINCT FROM v_survey THEN
      RAISE EXCEPTION 'BR-MEAL-22: món không thuộc phiếu khảo sát này.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_survey := OLD.survey_id;
  END IF;
  SELECT * INTO v_s FROM public.meal_surveys s WHERE s.id = v_survey;
  IF v_s.status <> 'open' OR (v_s.closes_at IS NOT NULL AND v_s.closes_at <= now()) THEN
    RAISE EXCEPTION 'BR-MEAL-21: khảo sát đã đóng, không bình chọn / đổi phiếu được.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.meal_survey_votes v WHERE v.survey_id = v_survey AND v.member_id = NEW.member_id) >= v_s.max_choices THEN
      RAISE EXCEPTION 'BR-MEAL-22: khảo sát chỉ cho chọn tối đa % món.', v_s.max_choices USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  RETURN OLD;
END
$$;
COMMENT ON FUNCTION app.tg_meal_survey_vote_rules() IS 'BEFORE INSERT/DELETE meal_survey_votes: món phải thuộc khảo sát, khảo sát còn mở, không vượt số lựa chọn tối đa.';

DROP TRIGGER IF EXISTS trg_meal_survey_options__rules ON public.meal_survey_options;
CREATE TRIGGER trg_meal_survey_options__rules BEFORE INSERT ON public.meal_survey_options
  FOR EACH ROW EXECUTE FUNCTION app.tg_meal_survey_option_rules();
DROP TRIGGER IF EXISTS trg_meal_survey_votes__rules ON public.meal_survey_votes;
CREATE TRIGGER trg_meal_survey_votes__rules BEFORE INSERT OR DELETE ON public.meal_survey_votes
  FOR EACH ROW EXECUTE FUNCTION app.tg_meal_survey_vote_rules();
DROP TRIGGER IF EXISTS trg_meal_surveys__touch ON public.meal_surveys;
CREATE TRIGGER trg_meal_surveys__touch BEFORE UPDATE ON public.meal_surveys
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch();
DROP TRIGGER IF EXISTS trg_meal_surveys__audit ON public.meal_surveys;
CREATE TRIGGER trg_meal_surveys__audit AFTER INSERT OR UPDATE OR DELETE ON public.meal_surveys
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

CREATE OR REPLACE FUNCTION app.fn_meal_survey_tally(p_survey_ids uuid[])
RETURNS TABLE (survey_id uuid, option_id uuid, votes bigint, voters bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT o.survey_id, o.id,
           COUNT(v.member_id)::bigint,
           (SELECT COUNT(DISTINCT x.member_id) FROM public.meal_survey_votes x WHERE x.survey_id = o.survey_id)::bigint
      FROM public.meal_survey_options o
      LEFT JOIN public.meal_survey_votes v ON v.option_id = o.id
     WHERE o.survey_id = ANY (p_survey_ids)
     GROUP BY o.survey_id, o.id;
END
$$;
COMMENT ON FUNCTION app.fn_meal_survey_tally(uuid[]) IS 'Số phiếu từng món + số người đã bình chọn của các khảo sát món ăn (không lộ ai chọn gì).';

-- ---------------------------------------------------------------------
-- 7. Góp ý / chấm điểm bữa ăn (A-018): mỗi người một góp ý cho một bữa đã diễn ra; Ban Ẩm thực đọc tất cả
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_feedback (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  menu_id     uuid        NOT NULL REFERENCES public.meal_menus(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  rating      smallint    NOT NULL,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_meal_feedback__rating  CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT ck_meal_feedback__comment CHECK (comment IS NULL OR char_length(comment) <= 1000),
  CONSTRAINT ux_meal_feedback__menu_member UNIQUE (menu_id, member_id)
);
COMMENT ON TABLE public.meal_feedback IS
  'Lời khen / góp ý cho một bữa (FE: "Bình chọn món" chỉ là toast). Chính chủ và Ban Ẩm thực đọc nội dung; mọi người thấy điểm trung bình qua app.fn_meal_feedback_summary.';
CREATE INDEX IF NOT EXISTS ix_meal_feedback__member_id ON public.meal_feedback (member_id);

CREATE OR REPLACE FUNCTION app.tg_meal_feedback_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_date   date;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.menu_id <> OLD.menu_id OR NEW.member_id <> OLD.member_id) THEN
    RAISE EXCEPTION 'BR-MEAL-31: không đổi bữa ăn / người góp ý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT m.menu_date, m.status INTO v_date, v_status FROM public.meal_menus m WHERE m.id = NEW.menu_id;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy bữa ăn.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_date > app.local_today() THEN
    RAISE EXCEPTION 'BR-MEAL-31: chỉ góp ý được bữa ăn đã diễn ra (hôm nay hoặc trước đó).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_date < app.local_today() - 30 THEN
    RAISE EXCEPTION 'BR-MEAL-31: chỉ góp ý bữa ăn trong vòng 30 ngày.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'BR-MEAL-31: bữa này đã hủy, không góp ý được.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.comment := NULLIF(btrim(NEW.comment), '');
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_meal_feedback_rules() IS 'BEFORE INSERT/UPDATE meal_feedback: chỉ góp ý bữa đã diễn ra (≤ hôm nay, trong 30 ngày, không bị hủy).';

DROP TRIGGER IF EXISTS trg_meal_feedback__rules ON public.meal_feedback;
CREATE TRIGGER trg_meal_feedback__rules BEFORE INSERT OR UPDATE ON public.meal_feedback
  FOR EACH ROW EXECUTE FUNCTION app.tg_meal_feedback_rules();
DROP TRIGGER IF EXISTS trg_meal_feedback__touch ON public.meal_feedback;
CREATE TRIGGER trg_meal_feedback__touch BEFORE UPDATE ON public.meal_feedback
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch();

CREATE OR REPLACE FUNCTION app.fn_meal_feedback_summary(p_from date, p_to date)
RETURNS TABLE (menu_id uuid, avg_rating numeric, ratings bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'Khoảng ngày không hợp lệ (tối đa 62 ngày).' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
    SELECT f.menu_id, round(avg(f.rating), 1), count(*)::bigint
      FROM public.meal_feedback f JOIN public.meal_menus m ON m.id = f.menu_id
     WHERE m.menu_date BETWEEN p_from AND p_to
     GROUP BY f.menu_id;
END
$$;
COMMENT ON FUNCTION app.fn_meal_feedback_summary(date, date) IS 'Điểm trung bình + số lượt góp ý từng bữa trong khoảng ngày (không lộ nội dung / người góp ý).';

-- ---------------------------------------------------------------------
-- 8. RLS (ENABLE + FORCE) + chính sách TO luuxa_app
-- ---------------------------------------------------------------------
ALTER TABLE public.pantry_restock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_restock_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_surveys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_survey_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_survey_options FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_survey_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_survey_votes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_feedback FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pantry_restock_requests__select ON public.pantry_restock_requests;
CREATE POLICY pantry_restock_requests__select ON public.pantry_restock_requests FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));
DROP POLICY IF EXISTS pantry_restock_requests__insert ON public.pantry_restock_requests;
CREATE POLICY pantry_restock_requests__insert ON public.pantry_restock_requests FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(requested_by)) AND ((SELECT app.has_permission('meal.register')) OR (SELECT app.has_permission('meal.manage'))));
DROP POLICY IF EXISTS pantry_restock_requests__update__manage ON public.pantry_restock_requests;
CREATE POLICY pantry_restock_requests__update__manage ON public.pantry_restock_requests FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));
DROP POLICY IF EXISTS pantry_restock_requests__update__own ON public.pantry_restock_requests;
CREATE POLICY pantry_restock_requests__update__own ON public.pantry_restock_requests FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(requested_by)) AND status = 'open')
  WITH CHECK ((SELECT app.is_self(requested_by)) AND status IN ('open', 'cancelled'));

DROP POLICY IF EXISTS shopping_list_items__select ON public.shopping_list_items;
CREATE POLICY shopping_list_items__select ON public.shopping_list_items FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));
DROP POLICY IF EXISTS shopping_list_items__write ON public.shopping_list_items;
CREATE POLICY shopping_list_items__write ON public.shopping_list_items FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));

DROP POLICY IF EXISTS meal_surveys__select ON public.meal_surveys;
CREATE POLICY meal_surveys__select ON public.meal_surveys FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));
DROP POLICY IF EXISTS meal_surveys__write ON public.meal_surveys;
CREATE POLICY meal_surveys__write ON public.meal_surveys FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));

DROP POLICY IF EXISTS meal_survey_options__select ON public.meal_survey_options;
CREATE POLICY meal_survey_options__select ON public.meal_survey_options FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()));
DROP POLICY IF EXISTS meal_survey_options__insert ON public.meal_survey_options;
CREATE POLICY meal_survey_options__insert ON public.meal_survey_options FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('meal.manage'))
              OR ((SELECT app.has_permission('meal.register')) AND (SELECT app.is_self(suggested_by))));
DROP POLICY IF EXISTS meal_survey_options__update ON public.meal_survey_options;
CREATE POLICY meal_survey_options__update ON public.meal_survey_options FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));
DROP POLICY IF EXISTS meal_survey_options__delete ON public.meal_survey_options;
CREATE POLICY meal_survey_options__delete ON public.meal_survey_options FOR DELETE TO luuxa_app
  USING ((SELECT app.has_permission('meal.manage')));

DROP POLICY IF EXISTS meal_survey_votes__select__own ON public.meal_survey_votes;
CREATE POLICY meal_survey_votes__select__own ON public.meal_survey_votes FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)));
DROP POLICY IF EXISTS meal_survey_votes__insert__own ON public.meal_survey_votes;
CREATE POLICY meal_survey_votes__insert__own ON public.meal_survey_votes FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('meal.register')));
DROP POLICY IF EXISTS meal_survey_votes__delete__own ON public.meal_survey_votes;
CREATE POLICY meal_survey_votes__delete__own ON public.meal_survey_votes FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id)));

DROP POLICY IF EXISTS meal_feedback__select ON public.meal_feedback;
CREATE POLICY meal_feedback__select ON public.meal_feedback FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('meal.manage')));
DROP POLICY IF EXISTS meal_feedback__insert__own ON public.meal_feedback;
CREATE POLICY meal_feedback__insert__own ON public.meal_feedback FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('meal.register')));
DROP POLICY IF EXISTS meal_feedback__update__own ON public.meal_feedback;
CREATE POLICY meal_feedback__update__own ON public.meal_feedback FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));
DROP POLICY IF EXISTS meal_feedback__delete ON public.meal_feedback;
CREATE POLICY meal_feedback__delete ON public.meal_feedback FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('meal.manage')));

-- ---------------------------------------------------------------------
-- 9. Chủ sở hữu + quyền (mẫu 49_a / 49_b): luuxa_app chỉ ghi các cột nghiệp vụ, cột hệ thống do trigger điền
-- ---------------------------------------------------------------------
ALTER TABLE public.pantry_restock_requests OWNER TO luuxa_owner;
ALTER TABLE public.shopping_list_items OWNER TO luuxa_owner;
ALTER TABLE public.meal_surveys OWNER TO luuxa_owner;
ALTER TABLE public.meal_survey_options OWNER TO luuxa_owner;
ALTER TABLE public.meal_survey_votes OWNER TO luuxa_owner;
ALTER TABLE public.meal_feedback OWNER TO luuxa_owner;

REVOKE ALL ON public.pantry_restock_requests, public.shopping_list_items, public.meal_surveys,
  public.meal_survey_options, public.meal_survey_votes, public.meal_feedback FROM luuxa_app;
GRANT SELECT ON public.pantry_restock_requests, public.shopping_list_items, public.meal_surveys,
  public.meal_survey_options, public.meal_survey_votes, public.meal_feedback TO luuxa_app;
GRANT INSERT (pantry_item_id, item_name, qty, unit, note, requested_by) ON public.pantry_restock_requests TO luuxa_app;
GRANT UPDATE (status, resolution_note, qty, unit, note) ON public.pantry_restock_requests TO luuxa_app;
GRANT INSERT (name, qty, unit, note, pantry_item_id, restock_request_id, needed_on, est_cost_vnd, is_purchased) ON public.shopping_list_items TO luuxa_app;
GRANT UPDATE (name, qty, unit, note, needed_on, est_cost_vnd, is_purchased) ON public.shopping_list_items TO luuxa_app;
GRANT DELETE ON public.shopping_list_items TO luuxa_app;
GRANT INSERT (title, description, max_choices, allow_suggestions, target_week, closes_at) ON public.meal_surveys TO luuxa_app;
GRANT UPDATE (title, description, max_choices, allow_suggestions, target_week, closes_at, status, closed_at) ON public.meal_surveys TO luuxa_app;
GRANT DELETE ON public.meal_surveys TO luuxa_app;
GRANT INSERT (survey_id, label, sort_order, suggested_by) ON public.meal_survey_options TO luuxa_app;
GRANT UPDATE (label, sort_order) ON public.meal_survey_options TO luuxa_app;
GRANT DELETE ON public.meal_survey_options TO luuxa_app;
GRANT INSERT (survey_id, option_id, member_id) ON public.meal_survey_votes TO luuxa_app;
GRANT DELETE ON public.meal_survey_votes TO luuxa_app;
GRANT INSERT (menu_id, member_id, rating, comment) ON public.meal_feedback TO luuxa_app;
GRANT UPDATE (rating, comment) ON public.meal_feedback TO luuxa_app;
GRANT DELETE ON public.meal_feedback TO luuxa_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_restock_requests, public.shopping_list_items, public.meal_surveys,
  public.meal_survey_options, public.meal_survey_votes, public.meal_feedback TO luuxa_worker, luuxa_definer;

-- Hàm: chủ sở hữu (SECURITY DEFINER → luuxa_definer BYPASSRLS; còn lại → luuxa_owner), không EXECUTE cho PUBLIC
ALTER FUNCTION app.fn_meal_default_cutoff(date, meal_type_t) OWNER TO luuxa_owner;
ALTER FUNCTION app.fn_meal_ensure_menu(date, meal_type_t) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_counts(date, date) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_survey_tally(uuid[]) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_meal_feedback_summary(date, date) OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_meal_feedback_rules() OWNER TO luuxa_definer;
ALTER FUNCTION app.tg_pantry_restock_rules() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_shopping_list_rules() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_shopping_list_purchased() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_meal_survey_option_rules() OWNER TO luuxa_owner;
ALTER FUNCTION app.tg_meal_survey_vote_rules() OWNER TO luuxa_owner;

REVOKE ALL ON FUNCTION app.fn_meal_default_cutoff(date, meal_type_t), app.fn_meal_ensure_menu(date, meal_type_t),
  app.fn_meal_counts(date, date), app.fn_meal_survey_tally(uuid[]), app.fn_meal_feedback_summary(date, date),
  app.tg_meal_feedback_rules(), app.tg_pantry_restock_rules(), app.tg_shopping_list_rules(), app.tg_shopping_list_purchased(),
  app.tg_meal_survey_option_rules(), app.tg_meal_survey_vote_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_meal_default_cutoff(date, meal_type_t), app.fn_meal_ensure_menu(date, meal_type_t),
  app.fn_meal_counts(date, date), app.fn_meal_survey_tally(uuid[]), app.fn_meal_feedback_summary(date, date),
  app.tg_meal_feedback_rules(), app.tg_pantry_restock_rules(), app.tg_shopping_list_rules(), app.tg_shopping_list_purchased(),
  app.tg_meal_survey_option_rules(), app.tg_meal_survey_vote_rules()
  TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
