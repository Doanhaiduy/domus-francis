-- =====================================================================
-- DỮ LIỆU 2026-10-07 — Đổi mọi chữ "Ban điều hành" thành "người quản lý" trong CSDL (idempotent, chạy lại không đổi gì thêm).
--   Phạm vi (schema public + app):
--     1. Thân hàm/thủ tục (thông báo lỗi, tiêu đề/nội dung thông báo… trong RAISE/INSERT) — dựng lại bằng pg_get_functiondef + CREATE OR REPLACE
--        (giữ nguyên chủ sở hữu, quyền, SECURITY DEFINER, search_path).
--     2. Chú thích (COMMENT) của bảng, cột, hàm, kiểu enum.
--     3. Dữ liệu chữ/JSON trong các bảng nghiệp vụ (cấu hình, danh mục, nội quy, thông báo, bài viết…).
--        KHÔNG đụng nhật ký/lịch sử bất biến (audit, *_log(s), login_attempts, ai_jobs, outbox, phiên đăng nhập…).
--   Viết hoa đầu câu: "Ban điều hành xem…" → "Người quản lý xem…"; giữa câu: "gửi Ban điều hành" → "gửi người quản lý".
--   Mọi bước đều bọc xử lý lỗi từng đối tượng: một bảng/hàm không sửa được (trigger bất biến…) chỉ bị bỏ qua + RAISE NOTICE.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.bdh_has(t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT t LIKE '%Ban điều hành%' OR t LIKE '%ban điều hành%' OR t LIKE '%BAN ĐIỀU HÀNH%' OR t LIKE '%Ban Điều Hành%'
$f$;

CREATE OR REPLACE FUNCTION pg_temp.bdh_fix(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT replace(replace(replace(replace(
           regexp_replace(t, '(^|[.!?]\s+|\n\s*(?:[-*•]\s+|[0-9]+[.)]\s+)?)Ban điều hành', '\1Người quản lý', 'g'),
           'Ban Điều Hành', 'Người Quản Lý'),
           'BAN ĐIỀU HÀNH', 'NGƯỜI QUẢN LÝ'),
           'Ban điều hành', 'người quản lý'),
           'ban điều hành', 'người quản lý')
$f$;

-- 1. Hàm / thủ tục
DO $mig$
DECLARE
  r     record;
  v_def text;
  v_new text;
  v_n   integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'app') AND p.prokind IN ('f', 'p')
       AND pg_temp.bdh_has(p.prosrc)
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      v_def := pg_get_functiondef(r.oid);
      v_new := pg_temp.bdh_fix(v_def);
      IF v_new <> v_def THEN
        EXECUTE v_new;
        v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Bỏ qua hàm %.%: %', r.nspname, r.proname, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Đã cập nhật % hàm/thủ tục', v_n;
END
$mig$;

-- 2. Chú thích (bảng, cột, chỉ mục, hàm, enum)
DO $mig$
DECLARE
  r    record;
  v_n  integer := 0;
  v_kw text;
BEGIN
  FOR r IN
    SELECT d.classoid::regclass::text AS cls, d.objoid, d.objsubid, d.description,
           CASE WHEN d.classoid = 'pg_class'::regclass THEN c.relkind::text END AS relkind,
           CASE WHEN d.classoid = 'pg_class'::regclass AND d.objsubid > 0
                THEN (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = d.objoid AND a.attnum = d.objsubid) END AS attname
      FROM pg_description d
      LEFT JOIN pg_class c ON d.classoid = 'pg_class'::regclass AND c.oid = d.objoid
      LEFT JOIN pg_proc p ON d.classoid = 'pg_proc'::regclass AND p.oid = d.objoid
      LEFT JOIN pg_type t ON d.classoid = 'pg_type'::regclass AND t.oid = d.objoid
      LEFT JOIN pg_namespace n ON n.oid = COALESCE(c.relnamespace, p.pronamespace, t.typnamespace)
     WHERE pg_temp.bdh_has(d.description)
       AND d.classoid IN ('pg_class'::regclass, 'pg_proc'::regclass, 'pg_type'::regclass)
       AND n.nspname IN ('public', 'app')
  LOOP
    BEGIN
      IF r.cls = 'pg_class' AND r.objsubid > 0 THEN
        EXECUTE format('COMMENT ON COLUMN %s.%I IS %L', r.objoid::regclass, r.attname, pg_temp.bdh_fix(r.description));
      ELSIF r.cls = 'pg_class' THEN
        v_kw := CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'i' THEN 'INDEX' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END;
        EXECUTE format('COMMENT ON %s %s IS %L', v_kw, r.objoid::regclass, pg_temp.bdh_fix(r.description));
      ELSIF r.cls = 'pg_proc' THEN
        EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.objoid::regprocedure, pg_temp.bdh_fix(r.description));
      ELSE
        EXECUTE format('COMMENT ON TYPE %s IS %L', r.objoid::regtype, pg_temp.bdh_fix(r.description));
      END IF;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Bỏ qua chú thích (% %): %', r.cls, r.objoid, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Đã cập nhật % chú thích', v_n;
END
$mig$;

-- 3. Dữ liệu trong bảng (chữ + JSON)
DO $mig$
DECLARE
  r      record;
  v_rows bigint;
  v_tot  bigint := 0;
  v_expr text;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, a.attname, t.typname
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid AND c.relkind IN ('r', 'p')
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
       AND t.typname IN ('text', 'varchar', 'citext', 'bpchar', 'jsonb')
       AND c.relname !~ '(audit|_logs?$|login_attempts|app_migrations|ai_jobs|ai_usage|history|revision|outbox|zalo_message|auth_sessions|refresh_tokens|password_resets)'
     ORDER BY c.relname, a.attnum
  LOOP
    BEGIN
      v_expr := CASE WHEN r.typname = 'jsonb'
                     THEN format('pg_temp.bdh_fix(%I::text)::jsonb', r.attname)
                     ELSE format('pg_temp.bdh_fix(%I::text)::%s', r.attname, r.typname) END;
      EXECUTE format('UPDATE %I.%I SET %I = %s WHERE pg_temp.bdh_has(%I::text)', r.nspname, r.relname, r.attname, v_expr, r.attname);
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN
        v_tot := v_tot + v_rows;
        RAISE NOTICE 'Đã cập nhật % dòng ở %.%', v_rows, r.relname, r.attname;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Bỏ qua %.%: %', r.relname, r.attname, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Tổng % dòng dữ liệu đã cập nhật', v_tot;
END
$mig$;

COMMIT;
