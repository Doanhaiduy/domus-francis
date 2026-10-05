-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (1/8): NGỮ CẢNH NGƯỜI DÙNG, RBAC, CẤU HÌNH, AUDIT, PHÂN VÙNG
-- Cách API truyền ngữ cảnh người dùng vào DB (mỗi transaction, KHÔNG dùng SET thường):
--     SELECT set_config('app.current_user_id', '<uuid>', true),
--            set_config('app.request_id',      '<uuid>', true),
--            set_config('app.client_ip',       '<ip>',   true);
-- true = chỉ có hiệu lực trong transaction hiện tại (an toàn với connection pool).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.1  Ngữ cảnh người dùng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;
COMMENT ON FUNCTION app.current_user_id() IS 'Người dùng của request hiện tại (NULL nếu chưa đăng nhập/job hệ thống).';

CREATE OR REPLACE FUNCTION app.current_request_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.request_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_client_ip()
RETURNS inet
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.client_ip', true), '')::inet
$$;

CREATE OR REPLACE FUNCTION app.is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT app.current_user_id() IS NOT NULL
$$;

-- Người gọi là TIẾN TRÌNH HỆ THỐNG tin cậy (worker/migrator/superuser), không phải phiên API của người dùng.
-- Dùng vai trò đã SET ROLE (nếu có), nếu không thì vai trò đăng nhập; KHÔNG dùng current_user vì trong hàm SECURITY DEFINER nó là chủ hàm.
CREATE OR REPLACE FUNCTION app.is_system_caller()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT r.rolsuper OR pg_has_role(r.rolname, 'luuxa_worker', 'USAGE')
      FROM pg_catalog.pg_roles r
     WHERE r.rolname = CASE WHEN COALESCE(current_setting('role', true), 'none') IN ('none', '') THEN session_user::text
                            ELSE current_setting('role', true) END), false)
$$;
COMMENT ON FUNCTION app.is_system_caller() IS 'TRUE nếu người gọi là superuser hoặc thành viên luuxa_worker (job nền/migration). Phiên API (luuxa_app) luôn FALSE. Nhờ vậy quy ước "không có user ⇒ ngữ cảnh hệ thống" trong các hàm SECURITY DEFINER không thể bị lạm dụng bởi một request quên gắn app.current_user_id.';

-- ---------------------------------------------------------------------
-- 4.5.2  Danh tính thành viên + vai trò hiệu lực (SECURITY DEFINER để tránh đệ quy RLS;
--        chủ sở hữu = luuxa_definer, search_path được ghim)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT m.id
    FROM public.members m
   WHERE m.user_id = app.current_user_id()
     AND m.deleted_at IS NULL
   LIMIT 1
$$;
COMMENT ON FUNCTION app.current_member_id() IS 'Hồ sơ thành viên gắn với user hiện tại (NULL nếu là tài khoản kỹ thuật không có hồ sơ).';

CREATE OR REPLACE FUNCTION app.current_role_grants()
RETURNS TABLE (role_code text, scope_type scope_type_t, scope_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT r.code, ur.scope_type, ur.scope_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = app.current_user_id()
     AND ur.revoked_at IS NULL
     AND ur.valid_from <= now()
     AND (ur.valid_to IS NULL OR ur.valid_to > now())
  UNION
  SELECT r.code, d.scope_type, d.scope_id
    FROM public.role_delegations d
    JOIN public.roles r ON r.id = d.role_id
   WHERE d.delegate_user_id = app.current_user_id()
     AND d.revoked_at IS NULL
     AND d.starts_at <= now()
     AND d.ends_at > now()
$$;
COMMENT ON FUNCTION app.current_role_grants() IS 'Các vai trò đang hiệu lực của user hiện tại, gồm gán trực tiếp (user_roles, trong hạn, chưa thu hồi) và ủy quyền (role_delegations, trong cửa sổ thời gian).';

CREATE OR REPLACE FUNCTION app.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM app.current_role_grants() g WHERE g.role_code = p_role)
$$;

CREATE OR REPLACE FUNCTION app.has_any_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM app.current_role_grants() g WHERE g.role_code = ANY (p_roles))
$$;

CREATE OR REPLACE FUNCTION app.has_permission(
  p_permission text,
  p_scope_type scope_type_t DEFAULT 'global',
  p_scope_id   uuid         DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM app.current_role_grants() g
      JOIN public.roles r             ON r.code = g.role_code
      JOIN public.role_permissions rp ON rp.role_id = r.id
     WHERE rp.permission_code = p_permission
       AND (g.scope_type = 'global'
            OR (p_scope_id IS NOT NULL AND g.scope_type = p_scope_type AND g.scope_id = p_scope_id))
  )
$$;
COMMENT ON FUNCTION app.has_permission(text, scope_type_t, uuid) IS
  'Kiểm tra quyền nguyên tử theo ma trận role_permissions. Vai trò có phạm vi toàn nhà thỏa mọi yêu cầu; vai trò có phạm vi tầng/khu vực chỉ thỏa khi truyền đúng (scope_type, scope_id).';

-- Dùng trong hàm nghiệp vụ SECURITY DEFINER: TRUE = phải từ chối.
CREATE OR REPLACE FUNCTION app.lacks_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE WHEN app.current_user_id() IS NULL THEN NOT app.is_system_caller()
              ELSE NOT app.has_permission(p_permission) END
$$;
COMMENT ON FUNCTION app.lacks_permission(text) IS 'Có user ⇒ từ chối nếu thiếu quyền p_permission. Không có user ⇒ chỉ tiến trình hệ thống tin cậy được đi tiếp (xem app.is_system_caller). Thay cho mẫu "current_user_id() IS NOT NULL AND NOT has_permission(…)" vốn mở toang khi request quên gắn user.';

CREATE OR REPLACE FUNCTION app.is_self(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_member_id IS NOT NULL AND p_member_id = app.current_member_id()
$$;

CREATE OR REPLACE FUNCTION app.has_active_consent(p_member_id uuid, p_purpose text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.consents c
      JOIN public.consent_purposes cp ON cp.code = c.purpose_code
     WHERE c.member_id    = p_member_id
       AND c.purpose_code = p_purpose
       AND c.withdrawn_at IS NULL
       AND c.policy_version >= cp.current_version
  )
$$;
COMMENT ON FUNCTION app.has_active_consent(uuid, text) IS 'Còn đồng ý hiệu lực (chưa rút và đúng/cao hơn phiên bản điều khoản hiện hành) cho mục đích đã cho.';

-- ---------------------------------------------------------------------
-- 4.5.3  Đọc cấu hình (thay hard-code). Thiếu khóa => lỗi rõ ràng (không lặng lẽ dùng giá trị mặc định).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.setting_json(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_value jsonb;
BEGIN
  SELECT s.value INTO v_value FROM public.settings s WHERE s.key = p_key;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'Thiếu cấu hình hệ thống: %', p_key USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_value;
END
$$;

CREATE OR REPLACE FUNCTION app.setting_int(p_key text)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT (app.setting_json(p_key) #>> '{}')::bigint
$$;

CREATE OR REPLACE FUNCTION app.setting_text(p_key text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT app.setting_json(p_key) #>> '{}'
$$;

CREATE OR REPLACE FUNCTION app.setting_bool(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (app.setting_json(p_key) #>> '{}')::boolean
$$;

-- ---------------------------------------------------------------------
-- 4.5.4  Audit: trigger tổng quát + hàm ghi sự kiện nghiệp vụ
--   Gắn:  CREATE TRIGGER trg_<bảng>__audit AFTER INSERT OR UPDATE OR DELETE ON <bảng>
--         FOR EACH ROW EXECUTE FUNCTION app.tg_audit('<cột_khóa>[,<cột_khóa>]', '<cột_che>[,<cột_che>]');
--   TG_ARGV[0] = danh sách cột khóa (mặc định id), TG_ARGV[1] = danh sách cột phải che (REDACTED).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_row      jsonb;
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[];
  v_old_diff jsonb;
  v_new_diff jsonb;
  v_keys     text[] := string_to_array(COALESCE(NULLIF(TG_ARGV[0], ''), 'id'), ',');
  v_redact   text[] := string_to_array(COALESCE(TG_ARGV[1], ''), ',');
  v_col      text;
  v_id       text;
BEGIN
  v_row := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  SELECT string_agg(v_row ->> k, '|' ORDER BY ord)
    INTO v_id
    FROM unnest(v_keys) WITH ORDINALITY AS t(k, ord);

  IF TG_OP = 'INSERT' THEN
    v_new := v_row;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := v_row;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_changed
      FROM jsonb_each(v_new) AS n
     WHERE n.value IS DISTINCT FROM (v_old -> n.key)
       AND n.key NOT IN ('updated_at', 'version');
    IF v_changed IS NULL THEN
      RETURN NULL;  -- cập nhật không đổi dữ liệu nghiệp vụ => không ghi log
    END IF;
    SELECT jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      INTO v_old_diff, v_new_diff
      FROM unnest(v_changed) AS k;
    v_old := v_old_diff;
    v_new := v_new_diff;
  END IF;

  FOREACH v_col IN ARRAY v_redact LOOP
    CONTINUE WHEN v_col = '';
    IF v_old IS NOT NULL AND v_old ? v_col THEN v_old := jsonb_set(v_old, ARRAY[v_col], '"[REDACTED]"'::jsonb); END IF;
    IF v_new IS NOT NULL AND v_new ? v_col THEN v_new := jsonb_set(v_new, ARRAY[v_col], '"[REDACTED]"'::jsonb); END IF;
  END LOOP;

  INSERT INTO public.audit_logs (
    actor_user_id, actor_member_id, actor_roles, action, entity_table, entity_id,
    old_data, new_data, changed_fields, request_id, ip)
  VALUES (
    app.current_user_id(), app.current_member_id(),
    ARRAY(SELECT DISTINCT g.role_code FROM app.current_role_grants() g),
    TG_OP, TG_TABLE_NAME, v_id, v_old, v_new, v_changed,
    app.current_request_id(), app.current_client_ip());
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_audit() IS 'Trigger AFTER ROW ghi audit_logs (chỉ ghi các cột thay đổi khi UPDATE; che cột nhạy cảm). SECURITY DEFINER: luuxa_app không có quyền INSERT trực tiếp vào audit_logs nên không thể giả mạo nhật ký.';

CREATE OR REPLACE FUNCTION app.write_audit(
  p_action       text,
  p_entity_table text,
  p_entity_id    text  DEFAULT NULL,
  p_reason       text  DEFAULT NULL,
  p_old          jsonb DEFAULT NULL,
  p_new          jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id, actor_member_id, actor_roles, action, entity_table, entity_id,
    old_data, new_data, reason, request_id, ip)
  VALUES (
    app.current_user_id(), app.current_member_id(),
    ARRAY(SELECT DISTINCT g.role_code FROM app.current_role_grants() g),
    p_action, p_entity_table, p_entity_id, p_old, p_new, p_reason,
    app.current_request_id(), app.current_client_ip());
END
$$;
COMMENT ON FUNCTION app.write_audit(text, text, text, text, jsonb, jsonb) IS 'Ghi sự kiện kiểm toán không đến từ trigger (LOGIN_*, PERIOD_CLOSE/REOPEN, READ_SENSITIVE…). NỘI BỘ: chỉ hàm SECURITY DEFINER, luuxa_auth và worker gọi được; luuxa_app KHÔNG có EXECUTE để không ai ghi nhật ký giả — API dùng app.fn_audit_event (danh sách sự kiện cho phép).';

-- Cổng ghi kiểm toán cho API (luuxa_app): chỉ các sự kiện "đọc/xuất dữ liệu nhạy cảm" do tầng ứng dụng quan sát, người gọi phải đăng nhập
CREATE OR REPLACE FUNCTION app.fn_audit_event(
  p_action       text,
  p_entity_table text DEFAULT NULL,
  p_entity_id    text DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action NOT IN ('READ_SENSITIVE', 'EXPORT', 'PRINT', 'DOWNLOAD_FILE', 'SHARE_LINK', 'LOGOUT') THEN
    RAISE EXCEPTION 'Sự kiện kiểm toán "%" không được ghi từ API.', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_entity_table IS NOT NULL AND p_entity_table !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RAISE EXCEPTION 'Tên thực thể không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM app.write_audit(p_action, COALESCE(p_entity_table, 'api'), left(p_entity_id, 200), left(p_reason, 500));
END
$$;
COMMENT ON FUNCTION app.fn_audit_event(text, text, text, text) IS 'Cổng ghi kiểm toán cho API: READ_SENSITIVE (xem CCCD, SĐT phụ huynh, hồ sơ Công giáo), EXPORT, PRINT, DOWNLOAD_FILE, SHARE_LINK, LOGOUT. Người ghi và vai trò lấy từ ngữ cảnh DB, không tin client.';

-- audit_logs bất biến
CREATE TRIGGER trg_audit_logs__immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.tg_forbid_mutation();

-- ---------------------------------------------------------------------
-- 4.5.5  Bảo trì phân vùng theo tháng (worker gọi hằng tháng; idempotent)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_monthly_partitions(p_parent regclass, p_months_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_parent_name text;
  v_month       date;
  v_from        timestamptz;
  v_to          timestamptz;
  v_part        text;
  v_created     integer := 0;
BEGIN
  SELECT c.relname INTO v_parent_name FROM pg_class c WHERE c.oid = p_parent;
  FOR v_month IN
    SELECT g::date
      FROM generate_series(
             date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
             date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(months => p_months_ahead),
             interval '1 month') AS g
  LOOP
    v_part := format('%s_%s', v_parent_name, to_char(v_month, 'YYYY_MM'));
    IF to_regclass(format('public.%I', v_part)) IS NULL THEN
      v_from := v_month::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
      v_to   := (v_month + interval '1 month')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
                     v_part, v_parent_name, v_from, v_to);
      v_created := v_created + 1;
    END IF;
  END LOOP;
  RETURN v_created;
END
$$;
COMMENT ON FUNCTION app.ensure_monthly_partitions(regclass, integer) IS 'Tạo phân vùng tháng (giờ Việt Nam) cho bảng cha phân vùng RANGE theo thời gian: tháng hiện tại và N tháng tới. Trả về số phân vùng mới. Chạy bằng pg_cron hoặc job worker ngày 1 hằng tháng.';

-- ---------------------------------------------------------------------
-- 4.5.6  Quy tắc cho danh tính, hồ sơ, phân quyền
-- ---------------------------------------------------------------------

-- BR-AUTH-05: scope_id của user_roles/role_delegations phải trỏ tới tầng/khu vực tồn tại
CREATE OR REPLACE FUNCTION app.tg_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope_type = 'floor' THEN
    IF NOT EXISTS (SELECT 1 FROM public.floors f WHERE f.id = NEW.scope_id AND f.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'scope_id % không phải tầng hợp lệ', NEW.scope_id USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.scope_type = 'cleaning_area' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cleaning_areas a WHERE a.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'scope_id % không phải khu vực vệ sinh hợp lệ', NEW.scope_id USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- BR-AUTH-06: không ủy quyền vai trò admin; người ủy quyền phải đang giữ vai trò đó; không tự nâng quyền
CREATE OR REPLACE FUNCTION app.tg_role_delegation_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_code text;
BEGIN
  SELECT r.code INTO v_role_code FROM public.roles r WHERE r.id = NEW.role_id;
  IF v_role_code = 'admin' THEN
    RAISE EXCEPTION 'Không được ủy quyền vai trò admin (quản trị kỹ thuật).' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = NEW.delegator_user_id
       AND ur.role_id = NEW.role_id
       AND ur.revoked_at IS NULL
       AND ur.valid_from <= NEW.starts_at
       AND (ur.valid_to IS NULL OR ur.valid_to >= NEW.ends_at)
       AND (ur.scope_type = 'global' OR (ur.scope_type = NEW.scope_type AND ur.scope_id IS NOT DISTINCT FROM NEW.scope_id))
  ) THEN
    RAISE EXCEPTION 'Người ủy quyền không giữ vai trò % trong toàn bộ khoảng thời gian ủy quyền.', v_role_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- BR-MEM-04: dữ liệu tôn giáo chỉ được ghi khi có đồng ý còn hiệu lực
CREATE OR REPLACE FUNCTION app.tg_require_catholic_consent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT app.has_active_consent(NEW.member_id, 'catholic_profile') THEN
    RAISE EXCEPTION 'Thành viên % chưa đồng ý xử lý dữ liệu tôn giáo (mục đích catholic_profile).', NEW.member_id
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Ghi nhận đồng ý trong bảng consents (in_app/paper/verbal_recorded) trước khi lưu hồ sơ Công giáo.';
  END IF;
  RETURN NEW;
END
$$;

-- BR-MEM-07: tự gán member.status theo ngày rời; ghi lại người dùng bị vô hiệu khi thành viên rời lưu xá
CREATE OR REPLACE FUNCTION app.tg_member_leave_effects()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('left', 'alumni') AND OLD.status NOT IN ('left', 'alumni') THEN
    IF NEW.user_id IS NOT NULL AND NEW.status = 'left' THEN
      UPDATE public.users SET status = 'disabled' WHERE id = NEW.user_id AND status <> 'disabled';
      UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'user_disabled'
       WHERE user_id = NEW.user_id AND revoked_at IS NULL;
    END IF;
    UPDATE public.room_assignments
       SET ends_on = COALESCE(NEW.left_on, app.local_today()), end_reason = 'member_left'
     WHERE member_id = NEW.id AND ends_on IS NULL;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_member_leave_effects() IS 'Khi thành viên chuyển sang left/alumni: kết thúc phân phòng đang hiệu lực; với left còn vô hiệu hóa tài khoản và thu hồi phiên.';

-- BR-HOUSE-01..04: kiểm tra phân phòng
CREATE OR REPLACE FUNCTION app.tg_room_assignment_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_room     public.rooms%ROWTYPE;
  v_gender   gender_t;
  v_peak     integer;
  v_range    daterange;
BEGIN
  SELECT * INTO v_room FROM public.rooms r WHERE r.id = NEW.room_id AND r.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phòng không tồn tại hoặc đã xóa.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_room.room_type <> 'bedroom' THEN
    RAISE EXCEPTION 'Chỉ được xếp người vào phòng ngủ (phòng % là %).', v_room.code, v_room.room_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room.status <> 'active' THEN
    RAISE EXCEPTION 'Phòng % đang ở trạng thái % — không thể xếp thêm người.', v_room.code, v_room.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room.gender_policy IS NOT NULL THEN
    SELECT m.gender INTO v_gender FROM public.members m WHERE m.id = NEW.member_id;
    IF v_gender IS NOT NULL AND v_gender <> v_room.gender_policy THEN
      RAISE EXCEPTION 'Phòng % chỉ dành cho %.', v_room.code, v_room.gender_policy USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Sức chứa: đếm số người chồng thời gian lớn nhất tại các mốc (ngày bắt đầu mới + ngày bắt đầu của các phân phòng khác nằm trong khoảng)
  v_range := daterange(NEW.starts_on, COALESCE(NEW.ends_on, 'infinity'::date), '[]');
  SELECT COALESCE(MAX(cnt), 0) INTO v_peak
    FROM (
      SELECT p.d, COUNT(a.id) AS cnt
        FROM (
          SELECT NEW.starts_on AS d
          UNION
          SELECT a2.starts_on
            FROM public.room_assignments a2
           WHERE a2.room_id = NEW.room_id
             AND a2.id <> NEW.id
             AND daterange(a2.starts_on, COALESCE(a2.ends_on, 'infinity'::date), '[]') && v_range
             AND a2.starts_on >= NEW.starts_on
        ) AS p
        LEFT JOIN public.room_assignments a
               ON a.room_id = NEW.room_id
              AND a.id <> NEW.id
              AND daterange(a.starts_on, COALESCE(a.ends_on, 'infinity'::date), '[]') @> p.d
       GROUP BY p.d
    ) AS s;
  IF v_peak + 1 > v_room.capacity THEN
    RAISE EXCEPTION 'Phòng % đã đủ % chỗ trong khoảng thời gian này.', v_room.code, v_room.capacity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_room_assignment_rules() IS 'BEFORE INSERT/UPDATE room_assignments: chỉ phòng ngủ, phòng phải active, đúng giới (nếu phòng có gender_policy), không vượt sức chứa tại bất kỳ ngày nào trong khoảng.';

-- ---------------------------------------------------------------------
-- 4.5.7  Gắn trigger cho nhóm danh tính / hồ sơ / phòng
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_user_roles__validate_scope
  BEFORE INSERT OR UPDATE OF scope_type, scope_id ON user_roles
  FOR EACH ROW EXECUTE FUNCTION app.tg_validate_scope();

CREATE TRIGGER trg_role_delegations__validate_scope
  BEFORE INSERT OR UPDATE OF scope_type, scope_id ON role_delegations
  FOR EACH ROW EXECUTE FUNCTION app.tg_validate_scope();

CREATE TRIGGER trg_role_delegations__rules
  BEFORE INSERT OR UPDATE OF role_id, delegator_user_id, starts_at, ends_at ON role_delegations
  FOR EACH ROW EXECUTE FUNCTION app.tg_role_delegation_rules();

CREATE TRIGGER trg_catholic_profiles__require_consent
  BEFORE INSERT OR UPDATE ON catholic_profiles
  FOR EACH ROW EXECUTE FUNCTION app.tg_require_catholic_consent();

CREATE TRIGGER trg_member_sacraments__require_consent
  BEFORE INSERT OR UPDATE ON member_sacraments
  FOR EACH ROW EXECUTE FUNCTION app.tg_require_catholic_consent();

CREATE TRIGGER trg_members__leave_effects
  AFTER UPDATE OF status ON members
  FOR EACH ROW EXECUTE FUNCTION app.tg_member_leave_effects();

CREATE TRIGGER trg_room_assignments__rules
  BEFORE INSERT OR UPDATE OF room_id, member_id, starts_on, ends_on ON room_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_room_assignment_rules();

-- ---------------------------------------------------------------------
-- 4.5.8  Cấu hình: ép giới hạn min/max theo kiểu, không đổi khóa/kiểu, tự ghi người sửa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_settings_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_num numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.key IS DISTINCT FROM OLD.key OR NEW.value_type IS DISTINCT FROM OLD.value_type THEN
      RAISE EXCEPTION 'Không được đổi khóa hoặc kiểu của cấu hình "%".', OLD.key USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_by := COALESCE(app.current_user_id(), NEW.updated_by);
  END IF;
  IF NEW.value_type IN ('integer', 'number', 'vnd') THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN
      RAISE EXCEPTION 'Cấu hình "%" phải là một con số.', NEW.key USING ERRCODE = 'check_violation';
    END IF;
    v_num := (NEW.value #>> '{}')::numeric;
    IF NEW.value_type IN ('integer', 'vnd') AND v_num <> trunc(v_num) THEN
      RAISE EXCEPTION 'Cấu hình "%" phải là số nguyên.', NEW.key USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.min_value IS NOT NULL AND v_num < NEW.min_value) OR (NEW.max_value IS NOT NULL AND v_num > NEW.max_value) THEN
      RAISE EXCEPTION 'Cấu hình "%" = % ngoài giới hạn cho phép [% .. %].', NEW.key, v_num,
        COALESCE(NEW.min_value::text, '-vô cực'), COALESCE(NEW.max_value::text, '+vô cực') USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.value_type = 'time' THEN
    IF jsonb_typeof(NEW.value) <> 'string' OR (NEW.value #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Cấu hình "%" kiểu time phải có dạng HH:MM.', NEW.key USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_settings_validate() IS 'BEFORE INSERT/UPDATE settings: số phải nằm trong [min_value, max_value]; integer/vnd phải là số nguyên; time dạng HH:MM; không đổi khóa/kiểu; tự ghi updated_by. Nhờ vậy ngưỡng nghiệp vụ (ngưỡng 2 chữ ký, hạn mức…) chỉnh được qua UI nhưng không thể đặt giá trị vô lý.';

CREATE TRIGGER trg_settings__validate
  BEFORE INSERT OR UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION app.tg_settings_validate();
