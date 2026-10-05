-- =====================================================================
-- KHỐI 4.5 — HÀM & TRIGGER (2/8): TRIGGER TỔNG QUÁT — MÁY TRẠNG THÁI, NHẬT KÝ TRẠNG THÁI, ĐẾM, BẢO VỆ CỘT
-- Dùng lại cho: ca trực, đổi ca, sự cố, đơn xin phép, đơn xin vào lưu xá…
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.5.8  Máy trạng thái khai báo ngay tại CREATE TRIGGER (bảng chuyển hợp lệ nhìn thấy trực tiếp trong DDL)
--   TG_ARGV[0] = JSON {"<trạng_thái_cũ>": ["<trạng_thái_mới>", …], …, "_initial": ["<trạng_thái_khi_INSERT>", …]}
--   TG_ARGV[1] = tên cột trạng thái (mặc định "status")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_map jsonb := TG_ARGV[0]::jsonb;
  v_col text  := COALESCE(NULLIF(TG_ARGV[1], ''), 'status');
  v_old text;
  v_new text;
BEGIN
  v_new := to_jsonb(NEW) ->> v_col;
  IF TG_OP = 'INSERT' THEN
    IF v_map ? '_initial' AND NOT ((v_map -> '_initial') ? v_new) THEN
      RAISE EXCEPTION 'Trạng thái khởi tạo không hợp lệ cho %: %', TG_TABLE_NAME, v_new USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  v_old := to_jsonb(OLD) ->> v_col;
  IF v_new IS DISTINCT FROM v_old AND NOT (COALESCE(v_map -> v_old, '[]'::jsonb) ? v_new) THEN
    RAISE EXCEPTION 'Chuyển trạng thái không hợp lệ (%.%): % → %', TG_TABLE_NAME, v_col, v_old, v_new
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_state_machine() IS 'BEFORE INSERT/UPDATE: chỉ cho phép các chuyển trạng thái nằm trong bản đồ JSON truyền ở TG_ARGV[0].';

-- ---------------------------------------------------------------------
-- 4.5.9  Nhật ký trạng thái dùng chung (ca trực, đổi ca, sự cố, đơn xin phép…)
--   TG_ARGV[0] = bảng nhật ký, TG_ARGV[1] = cột khóa ngoại trong bảng nhật ký, TG_ARGV[2] = cột trạng thái (mặc định status)
--   Lý do lấy từ GUC app.status_reason (API/hàm gán bằng set_config(…, true)).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_hist text := TG_ARGV[0];
  v_fk   text := TG_ARGV[1];
  v_col  text := COALESCE(NULLIF(TG_ARGV[2], ''), 'status');
  v_old  text;
  v_new  text;
BEGIN
  v_new := to_jsonb(NEW) ->> v_col;
  IF TG_OP = 'INSERT' THEN
    v_old := NULL;
  ELSE
    v_old := to_jsonb(OLD) ->> v_col;
    IF v_old IS NOT DISTINCT FROM v_new THEN
      RETURN NULL;
    END IF;
  END IF;
  EXECUTE format(
    'INSERT INTO public.%I (%I, from_status, to_status, changed_by, reason) VALUES ($1, $2, $3, $4, $5)',
    v_hist, v_fk)
    USING NEW.id, v_old, v_new, app.current_user_id(), NULLIF(current_setting('app.status_reason', true), '');
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_status_history() IS 'AFTER INSERT/UPDATE: ghi một dòng vào bảng nhật ký trạng thái chỉ định. SECURITY DEFINER để người dùng không thể giả mạo nhật ký.';

-- ---------------------------------------------------------------------
-- 4.5.10  Bộ đếm phi chuẩn hóa (số like, số lượt hiệp ý, số bình luận)
--   TG_ARGV: [0]=bảng cha, [1]=cột đếm trong bảng cha, [2]=cột khóa ngoại ở bảng con trỏ tới cha
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_adjust_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_parent text := TG_ARGV[0];
  v_col    text := TG_ARGV[1];
  v_fk     text := TG_ARGV[2];
  v_id     uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_id := (to_jsonb(NEW) ->> v_fk)::uuid;
    EXECUTE format('UPDATE public.%I SET %I = %I + 1 WHERE id = $1', v_parent, v_col, v_col) USING v_id;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_id := (to_jsonb(OLD) ->> v_fk)::uuid;
    EXECUTE format('UPDATE public.%I SET %I = GREATEST(%I - 1, 0) WHERE id = $1', v_parent, v_col, v_col) USING v_id;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_adjust_counter() IS 'AFTER INSERT/DELETE ở bảng con: tăng/giảm bộ đếm ở bảng cha (số like, hiệp ý, bình luận). SECURITY DEFINER để cập nhật được dù người dùng không có quyền sửa bản ghi cha.';

-- ---------------------------------------------------------------------
-- 4.5.11  Bảo vệ cột: RLS lọc được HÀNG chứ không lọc được CỘT, nên người sửa được dòng của mình vẫn có thể tự ghim bài,
--         bỏ ẩn bài bị kiểm duyệt, sửa bộ đếm, tự duyệt đơn… (mass-assignment). Trigger này chặn các cột đó.
--   TG_ARGV[0] = mã quy tắc nghiệp vụ dùng trong thông báo lỗi (ví dụ 'BR-COM-06')
--   TG_ARGV[1] = danh sách quyền (cách nhau dấu phẩy): người có MỘT trong các quyền này được đổi các cột ở TG_ARGV[2]
--   TG_ARGV[2] = cột "chỉ người có quyền được đổi" (ghim, kiểm duyệt, duyệt đơn…)
--   TG_ARGV[3] = cột "do hệ thống duy trì" (bộ đếm…): không ai được ghi trực tiếp qua luuxa_app
--   TG_ARGV[4] = (tùy chọn) JSON ngoại lệ {"cột": ["giá trị", …]}: người thường vẫn được đổi cột đó sang các giá trị này (ví dụ rút đơn)
--   Chỉ áp dụng cho vai trò CHỊU RLS (current_user không phải superuser/BYPASSRLS), tức luuxa_app. Superuser/migration, worker, luuxa_auth
--   và hàm/trigger SECURITY DEFINER (chủ luuxa_definer, ví dụ tg_adjust_counter duy trì bộ đếm) là vai trò tin cậy nên không bị chặn.
--   UPDATE: giá trị mới phải bằng giá trị cũ; INSERT: phải bằng DEFAULT của cột.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_rls_exempt_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_user IN ('postgres', 'supabase_admin', 'luuxa_owner', 'luuxa_worker', 'luuxa_auth', 'luuxa_definer')
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls))
$$;
COMMENT ON FUNCTION app.is_rls_exempt_role() IS 'TRUE nếu vai trò hiện hành (current_user) KHÔNG chịu RLS: superuser/migration, luuxa_worker, luuxa_auth, hoặc chủ hàm SECURITY DEFINER luuxa_definer. Các trigger bảo vệ (tg_guard_columns, khóa trạng thái, khóa xác nhận) chỉ ràng buộc phiên chịu RLS (luuxa_app); gọi từ hàm SECURITY DEFINER thì current_user là chủ hàm nên các đường nghiệp vụ hợp lệ không bị chặn.';

CREATE OR REPLACE FUNCTION app.tg_guard_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_perms  text[]  := string_to_array(NULLIF(TG_ARGV[1], ''), ',');
  v_exc    jsonb   := COALESCE(NULLIF(TG_ARGV[4], '')::jsonb, '{}'::jsonb);
  v_priv   boolean;
  v_new    jsonb;
  v_old    jsonb;
  v_col    text;
  v_system boolean;
  v_ref    jsonb;
  v_expr   text;
BEGIN
  IF app.is_rls_exempt_role() THEN
    RETURN NEW;      -- vai trò KHÔNG chịu RLS (superuser/migration, worker, luuxa_auth, chủ hàm SECURITY DEFINER luuxa_definer) là tin cậy
  END IF;
  v_new  := to_jsonb(NEW);
  v_old  := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_priv := v_perms IS NOT NULL AND app.has_any_permission(v_perms);
  FOR v_col, v_system IN
    SELECT c, false FROM unnest(string_to_array(COALESCE(TG_ARGV[2], ''), ',')) AS c WHERE c <> ''
    UNION ALL
    SELECT c, true  FROM unnest(string_to_array(COALESCE(TG_ARGV[3], ''), ',')) AS c WHERE c <> ''
  LOOP
    IF NOT (v_new ? v_col) THEN
      RAISE EXCEPTION 'Cấu hình trigger bảo vệ cột sai: bảng % không có cột %.', TG_TABLE_NAME, v_col;
    END IF;
    CONTINUE WHEN v_priv AND NOT v_system;
    IF TG_OP = 'UPDATE' THEN
      v_ref := v_old -> v_col;
    ELSE
      SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_expr
        FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
       WHERE d.adrelid = TG_RELID AND a.attname = v_col;
      IF v_expr IS NULL THEN v_ref := 'null'::jsonb; ELSE EXECUTE format('SELECT to_jsonb(%s)', v_expr) INTO v_ref; END IF;
    END IF;
    IF v_new -> v_col IS DISTINCT FROM v_ref THEN
      CONTINUE WHEN NOT v_system AND COALESCE((v_exc -> v_col) ? (v_new ->> v_col), false);
      IF v_system THEN
        RAISE EXCEPTION '%: cột %.% do hệ thống duy trì (bộ đếm/mốc thời gian), không được ghi trực tiếp.', TG_ARGV[0], TG_TABLE_NAME, v_col
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RAISE EXCEPTION '%: cột %.% chỉ người có quyền % mới được thay đổi.', TG_ARGV[0], TG_TABLE_NAME, v_col, array_to_string(v_perms, ' hoặc ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_guard_columns() IS 'BEFORE INSERT/UPDATE: chặn phiên người dùng (luuxa_app) tự ghi cột của hệ thống (bộ đếm) hoặc cột dành cho người có quyền (ghim, kiểm duyệt, duyệt đơn, đổi máy/giờ giặt). Tham số: mã BR, danh sách quyền, cột theo quyền, cột của hệ thống, JSON ngoại lệ. Chỉ áp dụng cho vai trò chịu RLS (luuxa_app); superuser, worker, luuxa_auth và hàm/trigger SECURITY DEFINER của luuxa_definer (đều không chịu RLS) không bị chặn.';
