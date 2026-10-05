-- =====================================================================
-- KHỐI 4.1 — NỀN TẢNG: SCHEMA, VAI TRÒ DB, EXTENSION, HÀM DÙNG CHUNG
-- Chạy bằng tài khoản migrator (superuser hoặc owner có BYPASSRLS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1.1  Schema
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;
COMMENT ON SCHEMA app IS
  'Hàm hỗ trợ (trigger, RLS helper, tiện ích). Không chứa bảng dữ liệu nghiệp vụ. Dữ liệu nằm ở schema public.';

CREATE SCHEMA IF NOT EXISTS extensions;
COMMENT ON SCHEMA extensions IS
  'Schema chứa các extension (pgcrypto, unaccent...). Tương thích chuẩn Supabase và Cloud PostgreSQL.';

-- ---------------------------------------------------------------------
-- 4.1.2  Vai trò cơ sở dữ liệu (KHÔNG chứa mật khẩu; gán LOGIN + mật khẩu
--        ngoài script này bằng bộ quản lý bí mật của hạ tầng)
--   luuxa_owner    : sở hữu mọi đối tượng, chạy migration
--   luuxa_app      : API runtime — luôn chịu RLS
--   luuxa_worker   : tiến trình nền (hàng đợi, thông báo, dọn dẹp) — BYPASSRLS
--   luuxa_readonly : báo cáo/BI — chỉ SELECT trên view báo cáo, chịu RLS
--   luuxa_auth     : luồng xác thực (đăng nhập, làm mới token, đặt lại mật khẩu, đăng ký) chạy TRƯỚC khi có
--                    ngữ cảnh người dùng nên không thể dựa vào RLS; BYPASSRLS nhưng chỉ được GRANT trên
--                    các bảng xác thực (xem khối 4.6.3) => quyền tối thiểu.
--   luuxa_definer  : CHỈ sở hữu một số ít hàm SECURITY DEFINER dùng trong chính sách RLS
--                    (tránh đệ quy chính sách khi đọc user_roles/members); BYPASSRLS nhưng
--                    không có LOGIN và chỉ được SELECT vài bảng phân quyền.
-- Ghi chú: một số nhà cung cấp DB được quản lý không cho tạo vai trò BYPASSRLS;
--          khi đó (a) luuxa_worker KHÔNG BYPASSRLS + thêm policy "TO luuxa_worker USING (true)"
--          cho các bảng worker cần đọc/ghi; (b) không FORCE RLS trên các bảng phân quyền
--          user_roles, role_delegations để hàm SECURITY DEFINER (chủ sở hữu = luuxa_owner) đọc được.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_owner') THEN
    CREATE ROLE luuxa_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_app') THEN
    CREATE ROLE luuxa_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_worker') THEN
    BEGIN
      CREATE ROLE luuxa_worker NOLOGIN BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      CREATE ROLE luuxa_worker NOLOGIN;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_readonly') THEN
    CREATE ROLE luuxa_readonly NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_definer') THEN
    BEGIN
      CREATE ROLE luuxa_definer NOLOGIN BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      CREATE ROLE luuxa_definer NOLOGIN;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_auth') THEN
    BEGIN
      CREATE ROLE luuxa_auth NOLOGIN BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      CREATE ROLE luuxa_auth NOLOGIN;
    END;
  END IF;
  -- Cấp quyền thành viên cho người dùng hiện hành (ví dụ postgres trên Supabase)
  -- để sau này có thể thực hiện lệnh OWNER TO luuxa_owner / luuxa_definer
  BEGIN
    EXECUTE format('GRANT luuxa_owner, luuxa_definer TO %I', CURRENT_USER);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Cấp quyền CREATE trên schema public và app cho luuxa_owner và luuxa_definer
  -- BẮT BUỘC: PostgreSQL yêu cầu chủ sở hữu mới phải có quyền CREATE trên schema của đối tượng khi thực hiện ALTER ... OWNER TO
  BEGIN
    GRANT USAGE, CREATE ON SCHEMA public TO luuxa_owner;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    GRANT USAGE, CREATE ON SCHEMA app TO luuxa_owner, luuxa_definer;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- ---------------------------------------------------------------------
-- 4.1.3  Extension (đều là contrib chuẩn của PostgreSQL 16)
--   pgcrypto   : digest()/hmac()/pgp_sym_* — băm chuỗi hash ledger, mã hóa cột tùy chọn
--   citext     : email không phân biệt hoa/thường
--   pg_trgm    : tìm kiếm mờ tên người/tiêu đề
--   btree_gist : exclusion constraint kết hợp "=" (uuid) với "&&" (range)
--   unaccent   : tìm kiếm tiếng Việt không dấu
-- gen_random_uuid() có sẵn từ PG13 (không cần uuid-ossp).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE EXTENSION IF NOT EXISTS citext;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 4.1.4  UUID v7 (sắp xếp theo thời gian => B-tree index ít phân mảnh)
--   PG16 chưa có uuidv7() native (có từ PG18). Khi nâng cấp chỉ cần thay thân
--   hàm bằng:  SELECT uuidv7();  — không phải đổi bất kỳ bảng nào.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.uuid_v7()
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL SAFE
AS $$
  SELECT encode(
           set_bit(
             set_bit(
               overlay(uuid_send(gen_random_uuid())
                       PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                       FROM 1 FOR 6),
               52, 1),
             53, 1),
           'hex')::uuid
$$;
COMMENT ON FUNCTION app.uuid_v7() IS
  'UUID phiên bản 7 (48-bit mili-giây + 74-bit ngẫu nhiên). Dùng làm DEFAULT cho mọi khóa chính.';

-- ---------------------------------------------------------------------
-- 4.1.5  Chuẩn hóa văn bản tiếng Việt cho tìm kiếm
--   unaccent() mặc định là STABLE => không dùng được trong index; bọc lại IMMUTABLE
--   với từ điển chỉ định tường minh (an toàn vì từ điển cố định).
--   Hỗ trợ cả môi trường local (schema public) lẫn Supabase (schema extensions).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.immutable_unaccent(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
BEGIN
  BEGIN
    RETURN public.unaccent('public.unaccent'::regdictionary, p_text);
  EXCEPTION WHEN undefined_object THEN
    RETURN extensions.unaccent('extensions.unaccent'::regdictionary, p_text);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION app.norm_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT lower(btrim(regexp_replace(app.immutable_unaccent(p_text), '\s+', ' ', 'g')))
$$;
COMMENT ON FUNCTION app.norm_text(text) IS
  'Chuẩn hóa tìm kiếm: bỏ dấu, hạ chữ thường, gộp khoảng trắng. Dùng trong index trigram.';

-- ---------------------------------------------------------------------
-- 4.1.6  Múi giờ nghiệp vụ & tiện ích ngày
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.local_date(p_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT (p_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
$$;
COMMENT ON FUNCTION app.local_date(timestamptz) IS
  'Ngày theo giờ Việt Nam (UTC+7) của một thời điểm. Mọi nghiệp vụ "theo ngày/tháng" dùng hàm này, không dùng ::date trực tiếp.';

CREATE OR REPLACE FUNCTION app.local_today()
RETURNS date
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT app.local_date(now())
$$;

CREATE OR REPLACE FUNCTION app.month_start(p_date date)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT date_trunc('month', p_date)::date
$$;

-- ---------------------------------------------------------------------
-- 4.1.7  Hàm kiểm tra định dạng dùng trong CHECK (thuần, IMMUTABLE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_e164(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_value IS NULL OR p_value ~ '^\+[1-9][0-9]{7,14}$'
$$;
COMMENT ON FUNCTION app.is_e164(text) IS 'Số điện thoại quốc tế E.164, ví dụ +84903112451. NULL hợp lệ.';

CREATE OR REPLACE FUNCTION app.is_hex(p_value text, p_length integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_value IS NULL OR (char_length(p_value) = p_length AND p_value ~ '^[0-9a-f]+$')
$$;
COMMENT ON FUNCTION app.is_hex(text, integer) IS 'Chuỗi hex thường có đúng độ dài (ví dụ SHA-256 = 64 ký tự).';

-- Chuỗi có nội dung (sau khi cắt khoảng trắng) tối thiểu p_min ký tự. NULL => FALSE.
-- Dùng trong CHECK thay cho "char_length(btrim(col)) >= n": biểu thức đó trả NULL khi col NULL và CHECK COI NULL LÀ HỢP LỆ
-- (PostgreSQL chỉ từ chối khi biểu thức là FALSE) => lọt dữ liệu thiếu lý do.
CREATE OR REPLACE FUNCTION app.has_text(p_value text, p_min integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_value IS NOT NULL AND char_length(btrim(p_value)) >= p_min
$$;
COMMENT ON FUNCTION app.has_text(text, integer) IS 'TRUE nếu chuỗi không NULL và có ít nhất p_min ký tự sau btrim. Dùng cho CHECK "lý do/ghi chú bắt buộc" để NULL không lọt qua.';

CREATE OR REPLACE FUNCTION app.is_hex_color(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_value IS NULL OR p_value ~ '^#[0-9a-fA-F]{6}$'
$$;

-- ---------------------------------------------------------------------
-- 4.1.8  Trigger dùng chung: cập nhật updated_at / version (khóa lạc quan)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_touch() IS 'BEFORE UPDATE: gán updated_at = now() (bảng không có cột version).';

CREATE OR REPLACE FUNCTION app.tg_touch_versioned()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version    := OLD.version + 1;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_touch_versioned() IS
  'BEFORE UPDATE: updated_at = now() và version = version + 1. API cập nhật bằng "WHERE id = $1 AND version = $2" và coi 0 dòng là xung đột (HTTP 409).';

-- ---------------------------------------------------------------------
-- 4.1.9  Trigger dùng chung: chặn UPDATE/DELETE (bảng chỉ-ghi-thêm / bất biến)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % là bất biến (append-only): không được % bản ghi. Dùng bút toán/bản ghi đảo thay thế.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Tạo bản ghi điều chỉnh/đảo (reversal) thay vì sửa hoặc xóa.';
END
$$;
COMMENT ON FUNCTION app.tg_forbid_mutation() IS
  'BEFORE UPDATE OR DELETE: luôn ném lỗi. Gắn cho ledger_entries, audit_logs, *_status_history, merit_entries…';
