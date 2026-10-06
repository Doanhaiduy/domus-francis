-- =====================================================================
-- KHỐI 4.8.3 — BỘ KIỂM THỬ NHANH (SMOKE TEST) TRÊN DB THẬT
-- Chạy:  psql -v ON_ERROR_STOP=1 -f 60_smoke_tests.sql   (toàn bộ nằm trong MỘT transaction và ROLLBACK ở cuối — không để lại dữ liệu)
-- Điều kiện: đã áp dụng các file 01…52 và dùng tài khoản superuser/migrator (cần SET ROLE luuxa_app).
-- Mỗi "kịch bản" dùng ASSERT hoặc app_test.expect_error(…) — sai là script dừng ngay tại kịch bản đó.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- S0. Khung kiểm thử: schema tạm app_test, đổi vai trò + ngữ cảnh người dùng, bắt lỗi kỳ vọng
-- ---------------------------------------------------------------------
CREATE SCHEMA app_test;
GRANT USAGE ON SCHEMA app_test TO luuxa_app, luuxa_worker;

CREATE FUNCTION app_test.as_user(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('app.current_user_id', COALESCE(p_user::text, ''), true);
  IF p_user IS NOT NULL THEN SET LOCAL ROLE luuxa_app; END IF;
END $$;

CREATE FUNCTION app_test.as_super() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('app.current_user_id', '', true);
END $$;

-- Phiên API nhưng QUÊN gắn user (lỗi lập trình/SQL injection): vai trò luuxa_app, không có app.current_user_id
CREATE FUNCTION app_test.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('app.current_user_id', '', true);
  SET LOCAL ROLE luuxa_app;
END $$;

-- Tiến trình nền: vai trò luuxa_worker (BYPASSRLS), không có user
CREATE FUNCTION app_test.as_worker() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('app.current_user_id', '', true);
  SET LOCAL ROLE luuxa_worker;
END $$;

-- Chạy SQL, mong đợi LỖI có chứa p_pattern (trong thông báo) — nếu không lỗi hoặc lỗi khác => thất bại
CREATE FUNCTION app_test.expect_error(p_sql text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'KY_VONG_LOI nhưng thành công: %', p_sql;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'KY_VONG_LOI%' THEN RAISE; END IF;
  IF position(p_pattern IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'Lỗi không đúng kỳ vọng. SQL=% | mong đợi chứa "%" | thực tế: %', p_sql, p_pattern, SQLERRM;
  END IF;
END $$;

-- Đếm số dòng một truy vấn trả về dưới vai trò hiện tại (để kiểm tra RLS)
CREATE FUNCTION app_test.n(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO v;
  RETURN v;
END $$;
-- Chạy một câu DML và trả số dòng bị ảnh hưởng (UPDATE/DELETE bị RLS chặn không báo lỗi, chỉ ảnh hưởng 0 dòng)
CREATE FUNCTION app_test.rows_affected(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_test TO luuxa_app, luuxa_worker;

-- ---------------------------------------------------------------------
-- S1. Dữ liệu nền (chạy bằng superuser): 1 admin kỹ thuật, Trưởng nhà, Phó nhà, Thủ quỹ, 4 thành viên
-- ---------------------------------------------------------------------
INSERT INTO users (id, email, status, password_hash) VALUES
  ('00000000-0000-7000-8000-0000000000a1', 'admin@x.vn',  'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000a2', 'head@x.vn',   'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000a3', 'vice@x.vn',   'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000a4', 'treas@x.vn',  'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000b1', 'm1@x.vn',     'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000b2', 'm2@x.vn',     'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000b3', 'm3@x.vn',     'active', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
  ('00000000-0000-7000-8000-0000000000b4', 'm4@x.vn',     'active', '$argon2id$v=19$m=1,t=1,p=1$a$b');

INSERT INTO members (id, user_id, full_name, display_name, gender, joined_on) VALUES
  ('10000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-0000000000a2', 'Trần Văn Đức',    'Văn Đức',    'male', DATE '2024-09-01'),
  ('10000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000a3', 'Lê Hoàng Long',   'Hoàng Long', 'male', DATE '2024-09-01'),
  ('10000000-0000-7000-8000-0000000000a4', '00000000-0000-7000-8000-0000000000a4', 'Phạm Gia Bảo',    'Gia Bảo',    'male', DATE '2024-09-01'),
  ('10000000-0000-7000-8000-0000000000b1', '00000000-0000-7000-8000-0000000000b1', 'Nguyễn Minh Tuấn','Minh Tuấn',  'male', DATE '2024-09-01'),
  ('10000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000b2', 'Bùi Văn Hiếu',    'Văn Hiếu',   'male', DATE '2025-09-01'),
  ('10000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b3', 'Đặng Thanh Phong','Thanh Phong','male', DATE '2025-09-01'),
  ('10000000-0000-7000-8000-0000000000b4', '00000000-0000-7000-8000-0000000000b4', 'Hoàng Đình Khôi', 'Đình Khôi',  'male', DATE '2025-09-01');

INSERT INTO user_roles (user_id, role_id)
SELECT x.uid::uuid, r.id FROM (VALUES
  ('00000000-0000-7000-8000-0000000000a1', 'admin'),
  ('00000000-0000-7000-8000-0000000000a2', 'house_head'), ('00000000-0000-7000-8000-0000000000a2', 'member'),
  ('00000000-0000-7000-8000-0000000000a3', 'vice_head'),  ('00000000-0000-7000-8000-0000000000a3', 'member'),
  ('00000000-0000-7000-8000-0000000000a4', 'treasurer'),  ('00000000-0000-7000-8000-0000000000a4', 'member'),
  ('00000000-0000-7000-8000-0000000000b1', 'member'), ('00000000-0000-7000-8000-0000000000b2', 'member'),
  ('00000000-0000-7000-8000-0000000000b3', 'member'), ('00000000-0000-7000-8000-0000000000b4', 'member')
) AS x(uid, role_code) JOIN roles r ON r.code = x.role_code;

-- ---------------------------------------------------------------------
-- S2. BẤT BIẾN LƯỢC ĐỒ (không phụ thuộc dữ liệu): bảo đảm các nguyên tắc thiết kế không bị phá khi thêm bảng mới
-- ---------------------------------------------------------------------
DO $$
DECLARE v_n integer; v_list text;
BEGIN
  -- INV-01: mọi bảng nghiệp vụ đều ENABLE + FORCE RLS
  SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  ASSERT v_list IS NULL, 'INV-01: bảng chưa bật FORCE RLS: ' || COALESCE(v_list, '');

  -- INV-02: mọi bảng có khóa chính
  SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p');
  ASSERT v_list IS NULL, 'INV-02: bảng thiếu PK: ' || COALESCE(v_list, '');

  -- INV-03: không cột thời gian nào là timestamp WITHOUT time zone
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_list
    FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'timestamp without time zone';
  ASSERT v_list IS NULL, 'INV-03: cột timestamp không múi giờ: ' || COALESCE(v_list, '');

  -- INV-04: không dùng FLOAT/REAL/DOUBLE cho cột tiền (đuôi _vnd) và mọi cột _vnd là BIGINT
  SELECT string_agg(table_name || '.' || column_name || ':' || data_type, ', ') INTO v_list
    FROM information_schema.columns WHERE table_schema = 'public' AND column_name LIKE '%\_vnd' AND data_type <> 'bigint';
  ASSERT v_list IS NULL, 'INV-04: cột tiền không phải BIGINT: ' || COALESCE(v_list, '');
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_list
    FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('real', 'double precision') AND table_name NOT IN ('qr_sessions');
  ASSERT v_list IS NULL, 'INV-04: cột số thực dấu phẩy động: ' || COALESCE(v_list, '');

  -- INV-05: mọi khóa ngoại có index dẫn đầu phù hợp (không FK nào thiếu index)
  SELECT string_agg(c.conrelid::regclass::text || '(' || c.conname || ')', ', ') INTO v_list
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indisvalid AND i.indpred IS NULL
                        AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey);
  ASSERT v_list IS NULL, 'INV-05: FK thiếu index: ' || COALESCE(v_list, '');

  -- INV-06: mọi bảng có COMMENT mô tả
  SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND obj_description(c.oid, 'pg_class') IS NULL;
  ASSERT v_list IS NULL, 'INV-06: bảng thiếu COMMENT: ' || COALESCE(v_list, '');

  -- INV-07: hàm SECURITY DEFINER đều ghim search_path
  SELECT string_agg(p.proname, ', ') INTO v_list
    FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%');
  ASSERT v_list IS NULL, 'INV-07: SECURITY DEFINER chưa ghim search_path: ' || COALESCE(v_list, '');

  -- INV-08: hàm SECURITY DEFINER thuộc luuxa_definer (trừ app.ensure_monthly_partitions thuộc luuxa_owner)
  SELECT string_agg(p.proname, ', ') INTO v_list
    FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
   WHERE p.pronamespace = 'app'::regnamespace AND p.prosecdef
     AND ((p.proname <> 'ensure_monthly_partitions' AND r.rolname <> 'luuxa_definer') OR (p.proname = 'ensure_monthly_partitions' AND r.rolname <> 'luuxa_owner'));
  ASSERT v_list IS NULL, 'INV-08: chủ sở hữu hàm SECURITY DEFINER sai: ' || COALESCE(v_list, '');

  -- INV-09: luuxa_app không bypass RLS, không phải superuser
  ASSERT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luuxa_app' AND (rolbypassrls OR rolsuper)), 'INV-09: luuxa_app không được BYPASSRLS/SUPERUSER';

  -- INV-10: luuxa_app không có quyền đọc cột mật khẩu / bí mật
  ASSERT NOT has_column_privilege('luuxa_app', 'public.users', 'password_hash', 'SELECT'), 'INV-10: luuxa_app đọc được users.password_hash';
  ASSERT NOT has_column_privilege('luuxa_app', 'public.qr_sessions', 'secret', 'SELECT'), 'INV-10: luuxa_app đọc được qr_sessions.secret';
  ASSERT NOT has_table_privilege('luuxa_app', 'public.refresh_tokens', 'SELECT'), 'INV-10: luuxa_app đọc được refresh_tokens';
  ASSERT NOT has_table_privilege('luuxa_app', 'public.ledger_entries', 'UPDATE'), 'INV-10: luuxa_app sửa được ledger_entries';
  ASSERT NOT has_table_privilege('luuxa_app', 'public.audit_logs', 'INSERT'), 'INV-10: luuxa_app ghi được audit_logs';

  -- INV-11: mọi quyền trong chính sách/RBAC được tham chiếu bằng mã tồn tại trong bảng permissions
  SELECT COUNT(*) INTO v_n FROM role_permissions rp WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = rp.permission_code);
  ASSERT v_n = 0, 'INV-11: role_permissions tham chiếu quyền không tồn tại';

  -- INV-12: 5 vai trò gốc của baseline đều có mặt
  SELECT COUNT(*) INTO v_n FROM roles WHERE code IN ('admin', 'house_head', 'vice_head', 'treasurer', 'member');
  ASSERT v_n = 5, 'INV-12: thiếu vai trò gốc';

  -- INV-13: Admin kỹ thuật KHÔNG có quyền duyệt chi / xem dữ liệu nhạy cảm của thành viên (tách bạch quyền)
  ASSERT NOT EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
                      WHERE r.code = 'admin' AND (rp.permission_code LIKE 'finance.expense.%' OR rp.permission_code IN
                        ('member.private.read', 'member.guardian.read', 'member.national_id.read', 'catholic.read_all', 'academic.read_all', 'finance.ledger.read'))),
         'INV-13: Admin kỹ thuật đang có quyền tài chính/dữ liệu nhạy cảm';

  -- INV-14: không hàm tạo/sửa dữ liệu nghiệp vụ nào trong schema app còn EXECUTE cho PUBLIC
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace AND has_function_privilege('public', p.oid, 'EXECUTE')),
         'INV-14: có hàm schema app còn EXECUTE cho PUBLIC';
  RAISE NOTICE 'S2 OK — bất biến lược đồ';
END $$;

-- ---------------------------------------------------------------------
-- S3. RBAC: quyền theo vai trò, ủy quyền, gán vai trò, tự nâng quyền
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  v_vice  uuid := '00000000-0000-7000-8000-0000000000a3'; v_treas uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1    uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_n bigint;
BEGIN
  PERFORM app_test.as_user(v_m1);
  ASSERT app.has_role('member') AND NOT app.has_role('house_head'), 'm1 chỉ là member';
  ASSERT NOT app.has_permission('finance.expense.approve'), 'member không duyệt chi';
  PERFORM app_test.as_user(v_admin);
  ASSERT app.has_permission('auth.user.manage'), 'admin quản lý tài khoản';
  ASSERT NOT app.has_permission('finance.expense.approve'), 'admin KHÔNG duyệt chi (tách Admin kỹ thuật khỏi Trưởng nhà)';
  PERFORM app_test.as_user(v_head);
  ASSERT app.has_permission('finance.expense.approve') AND app.has_permission('auth.role.assign'), 'Trưởng nhà duyệt chi + gán vai trò';

  -- Thành viên thường không tự gán vai trò, kể cả cho chính mình (RLS WITH CHECK chặn)
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO user_roles (user_id, role_id) SELECT %L, id FROM roles WHERE code = 'house_head'$q$, v_m1), 'row-level security');
  -- Trưởng nhà không tự gán vai trò cho chính mình
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$INSERT INTO user_roles (user_id, role_id) SELECT %L, id FROM roles WHERE code = 'treasurer'$q$, v_head), 'row-level security');
  -- Trưởng nhà gán vai trò cho người khác: được; nhưng KHÔNG gán được 'admin'
  EXECUTE format($q$INSERT INTO user_roles (user_id, role_id) SELECT %L, id FROM roles WHERE code = 'liturgy_lead'$q$, v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO user_roles (user_id, role_id) SELECT %L, id FROM roles WHERE code = 'admin'$q$, v_m2), 'row-level security');
  -- Không cấp hai dòng vai trò chồng thời gian cho cùng (user, role, phạm vi)
  PERFORM app_test.expect_error(format($q$INSERT INTO user_roles (user_id, role_id) SELECT %L, id FROM roles WHERE code = 'liturgy_lead'$q$, v_m2), 'ex_user_roles__no_overlap');

  -- Ủy quyền tạm thời: không ủy quyền admin; người ủy quyền phải đang giữ vai trò; thời hạn ≤ 60 ngày
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$INSERT INTO role_delegations (delegator_user_id, delegate_user_id, role_id, reason, starts_at, ends_at)
      SELECT %L, %L, id, 'đi vắng dài ngày', now(), now() + interval '90 days' FROM roles WHERE code = 'treasurer'$q$, v_treas, v_m1), 'ck_role_delegations__window');
  PERFORM app_test.expect_error(format($q$INSERT INTO role_delegations (delegator_user_id, delegate_user_id, role_id, reason, starts_at, ends_at)
      SELECT %L, %L, id, 'ủy quyền sai vai trò', now(), now() + interval '7 days' FROM roles WHERE code = 'house_head'$q$, v_treas, v_m1), 'không giữ vai trò');
  EXECUTE format($q$INSERT INTO role_delegations (delegator_user_id, delegate_user_id, role_id, reason, starts_at, ends_at)
      SELECT %L, %L, id, 'đi thực tập 1 tuần', now(), now() + interval '7 days' FROM roles WHERE code = 'treasurer'$q$, v_treas, v_m1);
  PERFORM app_test.as_user(v_m1);
  ASSERT app.has_role('treasurer'), 'm1 được ủy quyền vai trò Thủ quỹ tạm thời';
  ASSERT app.has_permission('finance.contribution.record'), 'm1 có quyền ghi thu quỹ nhờ ủy quyền';
  -- Thu hồi ủy quyền: hiệu lực chấm dứt ngay (và các bài kiểm thử sau coi m1 là thành viên thường)
  PERFORM app_test.as_user(v_treas);
  EXECUTE format($q$UPDATE role_delegations SET revoked_at = now(), revoked_by = %L WHERE delegate_user_id = %L$q$, v_treas, v_m1);
  PERFORM app_test.as_user(v_m1);
  ASSERT NOT app.has_role('treasurer') AND NOT app.has_permission('finance.contribution.record'), 'thu hồi ủy quyền ⇒ m1 mất quyền Thủ quỹ ngay';

  -- Người dùng không tự đổi trạng thái tài khoản của mình (guard trigger)
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$UPDATE users SET status = 'disabled' WHERE id = %L$q$, v_m2), 'BR-AUTH-07');
  EXECUTE format($q$UPDATE users SET locale = 'vi-VN' WHERE id = %L$q$, v_m2);
  -- Thành viên thường không đọc được danh sách tài khoản của người khác
  ASSERT app_test.n('SELECT 1 FROM users') = 1, 'm2 chỉ thấy tài khoản của chính mình';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM users') = 8, 'admin thấy mọi tài khoản';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S3 OK — RBAC';
END $$;

-- ---------------------------------------------------------------------
-- S4. Quyền riêng tư theo tầng dữ liệu + đồng ý (consent) + mã hóa cột
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1';   v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
BEGIN
  -- m1 nhập dữ liệu tầng 2 của chính mình (CCCD đã mã hóa ở tầng ứng dụng: ở đây dùng bytea giả)
  PERFORM app_test.as_user(v_m1);
  INSERT INTO member_private_details (member_id, birth_date, hometown, national_id_enc, national_id_key_version, national_id_bidx, national_id_last4)
  VALUES (v_mem1, DATE '2003-05-14', 'Nam Định', '\xdeadbeef'::bytea, 1, '\x0102'::bytea, '1892');
  INSERT INTO member_guardians (member_id, relation, full_name, phone_enc, phone_key_version, phone_last4)
  VALUES (v_mem1, 'father', 'Nguyễn Văn Thắng', '\xaa'::bytea, 1, '5678');
  PERFORM app_test.as_user(v_m2);
  INSERT INTO member_private_details (member_id, birth_date) VALUES (v_mem2, DATE '2004-03-15');
  -- m2 KHÔNG thấy dữ liệu nhạy cảm của m1; chỉ thấy của chính mình
  ASSERT app_test.n('SELECT 1 FROM member_private_details') = 1, 'm2 chỉ thấy hồ sơ tầng 2 của chính mình';
  ASSERT app_test.n('SELECT 1 FROM member_guardians') = 0, 'm2 không thấy người giám hộ của m1';
  PERFORM app_test.expect_error(format($q$INSERT INTO member_private_details (member_id) VALUES (%L)$q$, '10000000-0000-7000-8000-0000000000b3'), 'row-level security');
  -- Trùng CCCD (blind index) bị chặn
  PERFORM app_test.expect_error(format($q$UPDATE member_private_details SET national_id_enc = '\xdeadbeef'::bytea, national_id_key_version = 1, national_id_bidx = '\x0102'::bytea, national_id_last4 = '1892' WHERE member_id = %L$q$, v_mem2), 'ux_member_private__nid_bidx');
  -- Trưởng nhà/Phó nhà (quyền member.private.read) thấy cả hai; Admin kỹ thuật KHÔNG thấy
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM member_private_details') = 2, 'Trưởng nhà thấy dữ liệu tầng 2';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n('SELECT 1 FROM member_guardians') = 1, 'Phó nhà thấy người liên lạc khẩn cấp';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM member_private_details') = 0, 'Admin kỹ thuật không thấy dữ liệu tầng 2';
  ASSERT app_test.n('SELECT 1 FROM member_guardians') = 0, 'Admin kỹ thuật không thấy người giám hộ';

  -- Dữ liệu Công giáo: ghi bị chặn nếu chưa có đồng ý; sau khi đồng ý thì ghi được; Ban điều hành chỉ xem khi chủ thể đồng ý chia sẻ
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO catholic_profiles (member_id, holy_name, parish_name) VALUES (%L, 'Giuse', 'Giáo xứ Trung Lao')$q$, v_mem1), 'chưa đồng ý xử lý dữ liệu tôn giáo');
  INSERT INTO consents (member_id, purpose_code, policy_version, method) VALUES (v_mem1, 'catholic_profile', 1, 'in_app');
  INSERT INTO catholic_profiles (member_id, holy_name, parish_name) VALUES (v_mem1, 'Giuse', 'Giáo xứ Trung Lao');
  INSERT INTO member_sacraments (member_id, sacrament, received_on) VALUES (v_mem1, 'baptism', DATE '2003-07-01');
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM catholic_profiles') = 0, 'Trưởng nhà KHÔNG thấy hồ sơ Công giáo khi chưa có đồng ý chia sẻ (catholic_share_leadership)';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO consents (member_id, purpose_code, policy_version, method) VALUES (v_mem1, 'catholic_share_leadership', 1, 'in_app');
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM catholic_profiles') = 1, 'Trưởng nhà thấy hồ sơ Công giáo sau khi m1 đồng ý chia sẻ';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM catholic_profiles') = 0, 'm3 (thành viên thường) không thấy hồ sơ Công giáo của m1';
  -- Rút đồng ý => ngay lập tức mất quyền xem
  PERFORM app_test.as_user(v_m1);
  UPDATE consents SET withdrawn_at = now() WHERE member_id = v_mem1 AND purpose_code = 'catholic_share_leadership';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM catholic_profiles') = 0, 'Rút đồng ý có hiệu lực tức thì';

  -- Thành viên không tự sửa họ tên/trạng thái cư trú của mình (trigger members_guard) nhưng sửa được tên gọi
  PERFORM app_test.as_user(v_m2);
  UPDATE members SET display_name = 'Hiếu', hide_phone = true WHERE id = v_mem2;
  PERFORM app_test.expect_error(format($q$UPDATE members SET full_name = 'Tên Khác Hẳn' WHERE id = %L$q$, v_mem2), 'member.update');
  PERFORM app_test.expect_error(format($q$UPDATE members SET status = 'left', left_on = app.local_today() WHERE id = %L$q$, v_mem2), 'member.status.change');
  ASSERT app_test.rows_affected(format($q$UPDATE members SET display_name = 'Hack' WHERE id = %L$q$, v_mem1)) = 0, 'm2 không sửa được hồ sơ của m1 (RLS lọc mất dòng)';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S4 OK — quyền riêng tư & consent';
END $$;

-- ---------------------------------------------------------------------
-- S5. Nhà & phòng: sức chứa, giới tính, trạng thái, chống ở hai phòng, giường
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_vice uuid := '00000000-0000-7000-8000-0000000000a3'; v_m1 uuid := '00000000-0000-7000-8000-0000000000b1';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_p101 uuid; v_p102 uuid; v_pbep uuid; v_f1 uuid;
BEGIN
  SELECT id INTO v_p101 FROM rooms WHERE code = 'P.1'; SELECT id INTO v_p102 FROM rooms WHERE code = 'P.2';
  SELECT id INTO v_pbep FROM rooms WHERE code = 'P.SANH1'; SELECT id INTO v_f1 FROM floors WHERE code = 'T1';

  -- Thành viên thường KHÔNG xếp phòng được (RLS)
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (%L, %L, app.local_today())$q$, v_mem1, v_p101), 'row-level security');
  -- Phó nhà xếp phòng được
  PERFORM app_test.as_user(v_vice);
  INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (v_mem1, v_p101, DATE '2026-09-01');
  INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (v_mem2, v_p101, DATE '2026-09-01');
  -- BR-HOUSE-01: phòng 2 chỗ không nhận người thứ 3
  PERFORM app_test.expect_error(format($q$INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (%L, %L, DATE '2026-09-15')$q$, v_mem3, v_p101), 'đã đủ 2 chỗ');
  -- BR-HOUSE-02: chỉ phòng ngủ
  PERFORM app_test.expect_error(format($q$INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (%L, %L, DATE '2026-09-15')$q$, v_mem3, v_pbep), 'Chỉ được xếp người vào phòng ngủ');
  -- BR-HOUSE-03: một người không ở hai phòng cùng lúc (exclusion constraint)
  PERFORM app_test.expect_error(format($q$INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (%L, %L, DATE '2026-09-10')$q$, v_mem1, v_p102), 'ex_room_assignments__member_one_room');
  -- Chuyển phòng đúng quy trình: kết thúc phân phòng cũ rồi mở phân phòng mới (lịch sử được giữ)
  UPDATE room_assignments SET ends_on = DATE '2026-09-30', end_reason = 'Chuyển phòng' WHERE member_id = v_mem1 AND ends_on IS NULL;
  INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (v_mem1, v_p102, DATE '2026-10-01');
  ASSERT (SELECT count(*) FROM room_assignments WHERE member_id = v_mem1) = 2, 'giữ lịch sử phân phòng của m1';
  -- BR-HOUSE-04: phòng đang bảo trì không nhận người
  PERFORM app_test.as_super();
  UPDATE rooms SET status = 'maintenance' WHERE id = v_p102;
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (%L, %L, DATE '2026-10-05')$q$, v_mem4, v_p102), 'đang ở trạng thái maintenance');
  PERFORM app_test.as_super();
  UPDATE rooms SET status = 'active' WHERE id = v_p102;
  -- Chính sách giới tính (phòng nữ không nhận nam)
  UPDATE rooms SET gender_policy = 'female' WHERE id = v_p102;
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$INSERT INTO room_assignments (member_id, room_id, starts_on) VALUES (%L, %L, DATE '2026-10-05')$q$, v_mem4, v_p102), 'chỉ dành cho female');
  PERFORM app_test.as_super();
  UPDATE rooms SET gender_policy = NULL WHERE id = v_p102;
  -- View công suất
  ASSERT (SELECT occupied FROM v_room_occupancy WHERE code = 'P.1') = 1, 'P.1 còn m2 (m1 đã chuyển)';
  -- Thành viên rời lưu xá => phân phòng tự kết thúc + tài khoản bị vô hiệu
  UPDATE members SET status = 'left', left_on = app.local_today(), left_reason = 'Tốt nghiệp' WHERE id = v_mem2;
  ASSERT (SELECT ends_on FROM room_assignments WHERE member_id = v_mem2) IS NOT NULL, 'phân phòng tự kết thúc khi rời lưu xá';
  ASSERT (SELECT status FROM users WHERE id = '00000000-0000-7000-8000-0000000000b2') = 'disabled', 'tài khoản bị vô hiệu khi rời lưu xá';
  UPDATE members SET status = 'active', left_on = NULL, left_reason = NULL WHERE id = v_mem2;
  UPDATE users SET status = 'active' WHERE id = '00000000-0000-7000-8000-0000000000b2';
  -- [Kiểm định N-14] Rời lưu xá ⇒ vai trò đặc quyền bị thu hồi; tái nhập phải cấp lại bằng quyết định mới (không tự khôi phục)
  ASSERT NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = '00000000-0000-7000-8000-0000000000b2' AND r.code = 'liturgy_lead' AND ur.revoked_at IS NULL),
         'rời lưu xá ⇒ vai trò liturgy_lead bị thu hồi (BR-MEM-18)';
  INSERT INTO user_roles (user_id, role_id) SELECT '00000000-0000-7000-8000-0000000000b2', id FROM roles WHERE code = 'liturgy_lead';
  RAISE NOTICE 'S5 OK — nhà & phòng';
END $$;

-- ---------------------------------------------------------------------
-- S6. Trực nhật: roster, check-in (người trực, khung giờ, ảnh minh chứng), nghiệm thu, đổi ca, bỏ ca, điểm đóng góp
-- ---------------------------------------------------------------------
-- Ca thử nghiệm phủ cả ngày để kiểm thử không phụ thuộc giờ chạy
INSERT INTO duty_shifts (code, name, start_time, end_time) VALUES
  ('T_ALLDAY',  'Ca thử nghiệm cả ngày 1', TIME '00:00', TIME '23:59:59'),
  ('T_ALLDAY2', 'Ca thử nghiệm cả ngày 2', TIME '00:00', TIME '23:59:59'),
  ('T_ALLDAY3', 'Ca thử nghiệm cả ngày 3', TIME '00:00', TIME '23:59:59');

-- pHash giả lập: giá trị 64-bit ngẫu nhiên-ổn-định theo hạt giống (hai hạt giống khác nhau cách xa nhau ~32 bit)
CREATE FUNCTION app_test.ph(p_seed text) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$ SELECT ('x' || substr(md5(p_seed), 1, 16))::bit(64)::bigint $$;

CREATE FUNCTION app_test.mk_file(p_user uuid, p_bucket storage_bucket_t, p_sha text, p_phash bigint DEFAULT NULL, p_taken timestamptz DEFAULT now() - interval '5 minutes')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_id uuid := app.uuid_v7();
BEGIN
  INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, detected_mime, size_bytes, sha256, phash, taken_at, status, scan_status, uploaded_by)
  VALUES (v_id, p_bucket, 'test/' || v_id::text || '.jpg', 'x.jpg', 'image/jpeg', 'image/jpeg', 1000, p_sha, p_phash, p_taken, 'ready', 'clean', p_user);
  RETURN v_id;
END $$;

CREATE FUNCTION app_test.mk_assignment(p_date date, p_area text, p_members uuid[], p_shift text DEFAULT 'T_ALLDAY') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_roster uuid; v_a uuid := app.uuid_v7(); v_m uuid; v_week date := date_trunc('week', p_date)::date;
BEGIN
  SELECT id INTO v_roster FROM duty_rosters WHERE week_start = v_week;
  IF v_roster IS NULL THEN INSERT INTO duty_rosters (week_start, status, published_at) VALUES (v_week, 'published', now()) RETURNING id INTO v_roster; END IF;
  INSERT INTO duty_assignments (id, roster_id, area_id, shift_id, duty_date)
  VALUES (v_a, v_roster, (SELECT id FROM cleaning_areas WHERE code = p_area), (SELECT id FROM duty_shifts WHERE code = p_shift), p_date);
  FOREACH v_m IN ARRAY p_members LOOP
    INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id)
    VALUES (v_a, p_date, (SELECT id FROM duty_shifts WHERE code = p_shift), v_m);
  END LOOP;
  RETURN v_a;
END $$;

CREATE FUNCTION app_test.mk_checkin_items(p_checkin uuid, p_all_done boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
BEGIN
  INSERT INTO checkin_items (checkin_id, template_item_id, is_done)
  SELECT p_checkin, i.id, (p_all_done OR i.sort_order > 1)
    FROM duty_checkins c JOIN duty_assignments a ON a.id = c.assignment_id JOIN checklist_template_items i ON i.template_id = a.checklist_template_id
   WHERE c.id = p_checkin;
END $$;
CREATE FUNCTION app_test.mk_course(p_univ uuid, p_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO courses (university_id, name) VALUES (p_univ, p_name) ON CONFLICT (university_id, name_norm) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v;
  RETURN v;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_test TO luuxa_app;

DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_memvice uuid := '10000000-0000-7000-8000-0000000000a3';
  v_x uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid; v_f1 uuid; v_f2 uuid; v_f3 uuid; v_ck uuid; v_ck2 uuid; v_rv uuid; v_swap uuid; v_pts bigint;
BEGIN
  v_a1 := app_test.mk_assignment(app.local_today(), 'STAIRS', ARRAY[v_mem1, v_mem2]);
  ASSERT (SELECT checklist_template_id FROM duty_assignments WHERE id = v_a1) IS NOT NULL, 'ca được đóng băng mẫu checklist';
  v_f1 := app_test.mk_file(v_m1, 'cleaning-evidence', repeat('a', 64), app_test.ph('f1'));

  -- BR-DUTY-01: người không thuộc danh sách trực không check-in được
  PERFORM app_test.as_user(v_m3);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$,
      v_a1, v_mem3, app_test.mk_file(v_m3, 'cleaning-evidence', repeat('b', 64), app_test.ph('f2'))), 'BR-DUTY-01');
  -- BR-DUTY-03: ảnh không đúng bucket / ảnh cũ (EXIF lệch quá lâu) bị chặn
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.as_super();
  v_f2 := app_test.mk_file(v_m1, 'moments', repeat('c', 64), app_test.ph('f3'));
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$, v_a1, v_mem1, v_f2), 'bucket cleaning-evidence');
  PERFORM app_test.as_super();
  v_f3 := app_test.mk_file(v_m1, 'cleaning-evidence', repeat('d', 64), app_test.ph('f4'), now() - interval '6 hours');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$, v_a1, v_mem1, v_f3), 'nghi dùng ảnh cũ');

  -- Check-in hợp lệ + checklist đủ 4 tiêu chí
  INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id, note) VALUES (v_a1, 1, v_mem1, v_f1, 'Đã quét và lau cầu thang') RETURNING id INTO v_ck;
  PERFORM app_test.mk_checkin_items(v_ck);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a1) = 'checked_in', 'ca → checked_in';
  ASSERT (SELECT attempt_count FROM duty_assignments WHERE id = v_a1) = 1, 'attempt_count = 1';
  -- Thiếu tiêu chí bắt buộc: lỗi khi kiểm tra ràng buộc trì hoãn
  PERFORM app_test.as_super();
  v_a2 := app_test.mk_assignment(app.local_today(), 'KITCHEN', ARRAY[v_mem1, v_mem3], 'T_ALLDAY2');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($d$DO $x$ DECLARE c uuid; BEGIN
      INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L) RETURNING id INTO c;
      PERFORM app_test.mk_checkin_items(c, false);
      SET CONSTRAINTS ALL IMMEDIATE; END $x$
   $d$, v_a2, v_mem1, app_test.mk_file(v_m1, 'cleaning-evidence', repeat('e', 64), app_test.ph('f5'))), 'BR-DUTY-09');
  -- Ảnh trùng SHA-256 / gần giống pHash với ảnh đã dùng bị chặn (BR-DUTY-03)
  PERFORM app_test.as_super();
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$,
      v_a2, v_mem1, (SELECT app_test.mk_file(v_m1, 'cleaning-evidence', repeat('a', 64), app_test.ph('f99')))), 'trùng hoàn toàn (SHA-256)');
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$,
      v_a2, v_mem1, (SELECT app_test.mk_file(v_m1, 'cleaning-evidence', repeat('f', 64), app_test.ph('f1') # 7))), 'gần giống (pHash)');
  -- Một tệp chỉ dùng cho một lần check-in (UNIQUE evidence_file_id)
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$, v_a2, v_mem1, v_f1), 'ux_duty_checkins__evidence');

  -- Nghiệm thu: người trực (member) không có quyền; Phó nhà (không thuộc ca) nghiệm thu được và sinh điểm đóng góp
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score) VALUES (%L, %L, 'approved', 5)$q$, v_ck, v_mem1), 'BR-DUTY-02');
  PERFORM app_test.as_user(v_vice);
  INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score, feedback) VALUES (v_ck, v_memvice, 'approved', 5, 'Sạch sẽ') RETURNING id INTO v_rv;
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a1) = 'approved', 'ca → approved sau nghiệm thu đạt';
  PERFORM app_test.as_super();
  SELECT COALESCE(SUM(points), 0) INTO v_pts FROM merit_entries WHERE member_id IN (v_mem1, v_mem2) AND rule_code = 'duty_approved';
  ASSERT v_pts = 12, 'mỗi người +3 × trọng số khu vực 2 = +6; hai người = 12, thực tế ' || v_pts;
  ASSERT (SELECT COUNT(*) FROM duty_status_history WHERE assignment_id = v_a1) = 3, 'nhật ký trạng thái: scheduled → checked_in → approved';
  -- Nhật ký bất biến + điểm không sinh hai lần
  PERFORM app_test.expect_error('DELETE FROM merit_entries', 'bất biến');
  ASSERT app.fn_award_duty_merit(v_a1, 'duty_approved', 'lặp') = 0, 'điểm cho một ca chỉ ghi một lần (idempotent)';

  -- BR-DUTY-02: Phó nhà tự nghiệm thu ca của chính mình bị chặn
  v_a3 := app_test.mk_assignment(app.local_today(), 'ROOF', ARRAY[v_memvice, v_mem4]);
  PERFORM app_test.as_user(v_vice);
  INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id)
  VALUES (v_a3, 1, v_memvice, app_test.mk_file(v_vice, 'cleaning-evidence', repeat('9', 64), app_test.ph('f8'))) RETURNING id INTO v_ck2;
  PERFORM app_test.mk_checkin_items(v_ck2);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score) VALUES (%L, %L, 'approved', 5)$q$, v_ck2, v_memvice), 'BR-DUTY-02');
  -- Trưởng nhà yêu cầu làm lại (bắt buộc nhận xét) → rework_required → check-in lần 2 → duyệt
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision) VALUES (%L, '10000000-0000-7000-8000-0000000000a2', 'rework')$q$, v_ck2), 'ck_duty_reviews__feedback');
  INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, feedback) VALUES (v_ck2, '10000000-0000-7000-8000-0000000000a2', 'rework', 'Còn rác ở góc sân thượng') RETURNING id INTO v_rv;
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a3) = 'rework_required', 'ca → rework_required';
  -- Khiếu nại: chỉ người trực được khiếu nại; Trưởng nhà quyết định (chấp nhận => approved)
  PERFORM app_test.as_user(v_m3);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_review_appeals (review_id, appellant_member_id, reason) VALUES (%L, %L, 'Tôi muốn khiếu nại kết quả này')$q$, v_rv, v_mem3), 'row-level security');
  PERFORM app_test.as_user(v_m4);
  INSERT INTO duty_review_appeals (review_id, appellant_member_id, reason) VALUES (v_rv, v_mem4, 'Góc sân thượng đã dọn xong, ảnh chụp trước giờ nghiệm thu');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_decide_review_appeal((SELECT id FROM duty_review_appeals WHERE review_id = v_rv), true, 'Xem lại ảnh: đạt yêu cầu');
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a3) = 'approved', 'khiếu nại được chấp nhận ⇒ ca approved';

  -- BR-DUTY-04/05: không xếp trùng ca; người khai báo bận cần ghi đè có lý do
  PERFORM app_test.as_super();
  v_x := app_test.mk_assignment(app.local_today(), 'BATHROOM', ARRAY[v_mem3]);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id)
      SELECT a.id, a.duty_date, a.shift_id, %L FROM duty_assignments a WHERE a.id = %L$q$, v_mem1, v_x), 'ux_duty_assignment_members__member_slot');
  INSERT INTO member_unavailability (member_id, kind, starts_at, ends_at, note) VALUES (v_mem3, 'exam', now() - interval '1 day', now() + interval '2 days', 'Thi giữa kỳ');
  v_a1 := app_test.mk_assignment(app.local_today() + 1, 'GATE', ARRAY[v_mem4]);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id)
      SELECT a.id, a.duty_date, a.shift_id, %L FROM duty_assignments a WHERE a.id = %L$q$, v_mem3, v_a1), 'BR-DUTY-05');
  INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id, override_reason)
  SELECT a.id, a.duty_date, a.shift_id, v_mem3, 'Trưởng nhà xác nhận vì thiếu người' FROM duty_assignments a WHERE a.id = v_a1;

  -- Đổi ca 3 bước: m4 xin đổi sang m2 → m2 chấp nhận → Phó nhà duyệt ⇒ hoán đổi người trực
  v_a2 := app_test.mk_assignment(app.local_today() + 5, 'CHAPEL', ARRAY[v_mem4, v_mem1]);
  PERFORM app_test.as_user(v_m4);
  v_swap := app.fn_request_duty_swap(v_a2, v_mem2, 'Trùng lịch thi cuối kỳ');
  ASSERT (SELECT status FROM duty_swap_requests WHERE id = v_swap) = 'pending_peer', 'đơn đổi ca chờ người nhận';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_admin_decide_duty_swap(%L, true)$q$, v_swap), 'Không có quyền duyệt đổi ca');
  PERFORM app_test.as_user(v_m2);
  PERFORM app.fn_peer_respond_duty_swap(v_swap, true);
  PERFORM app_test.as_user(v_vice);
  PERFORM app.fn_admin_decide_duty_swap(v_swap, true, 'Đồng ý');
  ASSERT EXISTS (SELECT 1 FROM duty_assignment_members WHERE assignment_id = v_a2 AND member_id = v_mem2), 'm2 vào ca';
  ASSERT NOT EXISTS (SELECT 1 FROM duty_assignment_members WHERE assignment_id = v_a2 AND member_id = v_mem4), 'm4 ra khỏi ca';
  ASSERT (SELECT COUNT(*) FROM duty_swap_status_history WHERE swap_id = v_swap) = 3, 'nhật ký đổi ca đủ 3 bước';
  -- Xin đổi ca sát giờ (< 12 giờ) bị từ chối: ca hôm nay
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.as_super();
  v_a3 := app_test.mk_assignment(app.local_today(), 'GATE', ARRAY[v_mem1], 'T_ALLDAY3');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_request_duty_swap(%L, %L, 'Đổi sát giờ')$q$, v_a3, v_mem2), 'BR-DUTY-11');

  -- Bỏ ca tự động: ca đã qua + quá hạn → missed, trừ điểm −5/người
  PERFORM app_test.as_super();
  v_a2 := app_test.mk_assignment(app.local_today() - 2, 'BATHROOM', ARRAY[v_mem4, v_mem1]);
  ASSERT app.fn_mark_missed_duties() >= 1, 'đánh dấu bỏ ca';
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a2) = 'missed', 'ca quá hạn ⇒ missed';
  ASSERT (SELECT SUM(points) FROM merit_entries WHERE rule_code = 'duty_missed' AND source_id = v_a2) = -10, 'mỗi người −5 (điểm âm không nhân trọng số khu vực); hai người = −10';
  PERFORM app_test.expect_error(format($q$UPDATE duty_assignments SET status = 'approved' WHERE id = %L$q$, v_a2), 'Chuyển trạng thái không hợp lệ');
  RAISE NOTICE 'S6 OK — trực nhật';
END $$;

-- ---------------------------------------------------------------------
-- S7. Học tập: thang điểm cấu hình được, tính điểm tự động, khóa/xác minh, đồng ý chia sẻ, thống kê ẩn danh
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_hust uuid; v_sem1 uuid; v_sem2 uuid; v_rec uuid; v_rec2 uuid; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_file uuid; v_scale uuid;
  r record;
BEGIN
  SELECT id INTO v_hust FROM universities WHERE code = 'HUST';
  SELECT s.id INTO v_sem1 FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id WHERE y.code = '2025-2026' AND s.code = 'HK2';
  SELECT s.id INTO v_sem2 FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id WHERE y.code = '2026-2027' AND s.code = 'HK1';

  PERFORM app_test.as_user(v_m1);
  INSERT INTO academic_records (member_id, semester_id, university_id, scale_id) VALUES (v_mem1, v_sem1, v_hust, app.fn_scale_for(v_hust, DATE '2026-03-01')) RETURNING id INTO v_rec;
  INSERT INTO courses (university_id, name, default_credits) VALUES (v_hust, 'Điều khiển tự động', 3) RETURNING id INTO v_c1;
  INSERT INTO courses (university_id, name, default_credits) VALUES (v_hust, 'Vi điều khiển & PLC', 4) RETURNING id INTO v_c2;
  -- Tên môn không phân biệt dấu/hoa thường: "dieu khien tu dong" trùng môn đã có
  PERFORM app_test.expect_error(format($q$INSERT INTO courses (university_id, name) VALUES (%L, 'DIEU KHIEN TU DONG')$q$, v_hust), 'ux_courses__university_name');
  -- Tự tính tổng kết = 40% quá trình + 60% cuối kỳ, làm tròn 1 chữ số, tra bậc điểm chữ theo thang (không cài cứng)
  INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score) VALUES (v_rec, v_c1, 3, 8.0, 9.0);
  INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score) VALUES (v_rec, v_c2, 4, 7.0, 7.5);
  ASSERT (SELECT total_score FROM grade_records WHERE course_id = v_c1 AND record_id = v_rec) = 8.6, 'tổng kết 8×0.4 + 9×0.6 = 8.6';
  ASSERT (SELECT letter_grade FROM grade_records WHERE course_id = v_c1 AND record_id = v_rec) = 'A', '8.6 ⇒ A';
  ASSERT (SELECT letter_grade FROM grade_records WHERE course_id = v_c2 AND record_id = v_rec) = 'B', '7.3 ⇒ B';
  PERFORM app_test.expect_error(format($q$INSERT INTO grade_records (record_id, course_id, credits, final_score) VALUES (%L, %L, 2, 10.5)$q$, v_rec, (SELECT app_test.mk_course(v_hust, 'Giải tích 1'))), 'vượt thang tối đa');
  -- Điểm tổng kết chính thức của trường ghi đè công thức
  UPDATE grade_records SET official_total_score = 8.4 WHERE course_id = v_c1 AND record_id = v_rec;
  ASSERT (SELECT letter_grade FROM grade_records WHERE course_id = v_c1 AND record_id = v_rec) = 'B+', 'điểm chính thức 8.4 ⇒ B+ (không dùng công thức)';
  UPDATE grade_records SET official_total_score = NULL WHERE course_id = v_c1 AND record_id = v_rec;
  -- Bản nháp chưa tính vào GPA; cần minh chứng mới nộp được
  ASSERT NOT EXISTS (SELECT 1 FROM gpa_snapshots WHERE member_id = v_mem1), 'bản nháp chưa có GPA chính thức';
  PERFORM app_test.expect_error(format($q$UPDATE academic_records SET status = 'submitted' WHERE id = %L$q$, v_rec), 'BR-ACAD-04');
  v_file := app_test.mk_file(v_m1, 'academic-evidence', repeat('7', 64), NULL);
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (v_file, 'academic_record', v_rec, 'transcript');
  -- Gắn tệp sai bucket bị chặn (BR-STO-02)
  PERFORM app_test.as_super();
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'academic_record', %L, 'transcript')$q$,
      app_test.mk_file(v_m1, 'receipts', repeat('6', 64)), v_rec), 'BR-STO-02');
  UPDATE academic_records SET status = 'submitted' WHERE id = v_rec;
  -- GPA học kỳ & tích lũy: GPA10 = (8.6×3 + 7.3×4)/7 = 7.86 ; GPA4 theo điểm chữ = (4×3 + 3×4)/7 = 3.43 ⇒ "Giỏi"
  SELECT * INTO r FROM gpa_snapshots WHERE member_id = v_mem1 AND scope = 'cumulative';
  ASSERT r.gpa10 = 7.86 AND r.gpa4 = 3.43 AND r.rank_label = 'Giỏi', 'GPA: ' || r.gpa10 || ' / ' || r.gpa4 || ' / ' || COALESCE(r.rank_label, '?');
  ASSERT r.includes_unverified, 'chưa xác minh';
  -- Bảng điểm đã nộp bị khóa (BR-ACAD-03)
  PERFORM app_test.expect_error(format($q$UPDATE grade_records SET final_score = 10 WHERE record_id = %L$q$, v_rec), 'BR-ACAD-03');
  -- BR-ACAD-01: người khác không thấy; Phó nhà chưa được đồng ý nên không thấy
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM academic_records') = 0 AND app_test.n('SELECT 1 FROM grade_records') = 0 AND app_test.n('SELECT 1 FROM gpa_snapshots') = 0, 'm2 không thấy điểm của m1';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n('SELECT 1 FROM academic_records') = 0, 'Phó nhà chưa thấy khi chưa có đồng ý';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO consents (member_id, purpose_code, policy_version, method) VALUES (v_mem1, 'academic_share_leadership', 1, 'in_app');
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n('SELECT 1 FROM academic_records') = 1 AND app_test.n('SELECT 1 FROM grade_records') = 2, 'Phó nhà thấy sau khi m1 đồng ý chia sẻ';
  -- BR-ACAD-02: không tự xác minh; Phó nhà xác minh được
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE academic_records SET status = 'verified' WHERE id = %L$q$, v_rec), 'BR-ACAD-02');
  PERFORM app_test.as_user(v_vice);
  UPDATE academic_records SET status = 'verified' WHERE id = v_rec;
  ASSERT (SELECT includes_unverified FROM gpa_snapshots WHERE member_id = v_mem1 AND scope = 'cumulative') = false, 'GPA đã xác minh';
  -- Học kỳ sau có môn rớt (F): đếm môn nợ, GPA tích lũy giảm
  PERFORM app_test.as_user(v_m1);
  INSERT INTO academic_records (member_id, semester_id, university_id, scale_id) VALUES (v_mem1, v_sem2, v_hust, app.fn_scale_for(v_hust, DATE '2026-10-01')) RETURNING id INTO v_rec2;
  INSERT INTO courses (university_id, name) VALUES (v_hust, 'Vật lý đại cương 2') RETURNING id INTO v_c3;
  INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score) VALUES (v_rec2, v_c3, 2, 3.0, 4.0);
  PERFORM app_test.as_super();
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by) VALUES (app_test.mk_file(v_m1, 'academic-evidence', repeat('5', 64)), 'academic_record', v_rec2, 'transcript', v_m1);
  UPDATE academic_records SET status = 'submitted' WHERE id = v_rec2;
  SELECT * INTO r FROM gpa_snapshots WHERE member_id = v_mem1 AND scope = 'cumulative' AND as_of_semester_id = v_sem2;
  ASSERT r.failed_courses = 1 AND r.credits_attempted = 9 AND r.credits_passed = 7, 'nợ 1 môn; tín chỉ tính 9, đạt 7';
  ASSERT (SELECT is_pass FROM grade_records WHERE record_id = v_rec2) = false, 'điểm 3.6 ⇒ F, không đạt';
  -- Thang điểm KHÁC theo trường: dùng thang "linear" (gpa4 = gpa10/10×4) — chứng minh không cài cứng
  INSERT INTO grade_scales (code, name, max_score, process_weight_pct, final_weight_pct, gpa4_mode, university_id, effective_from)
  VALUES ('T_LINEAR', 'Thang thử nghiệm tuyến tính 30/70', 10, 30, 70, 'linear', (SELECT id FROM universities WHERE code = 'FTU'), DATE '2026-01-01') RETURNING id INTO v_scale;
  INSERT INTO grade_scale_bands (scale_id, letter, min_score, gpa_points, is_pass) VALUES (v_scale, 'A', 5.0, 4.0, true), (v_scale, 'F', 0, 0, false);
  INSERT INTO academic_records (member_id, semester_id, university_id, scale_id, status) VALUES (v_mem3, v_sem2, (SELECT id FROM universities WHERE code = 'FTU'), v_scale, 'draft') RETURNING id INTO v_rec;
  INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score)
  VALUES (v_rec, (SELECT app_test.mk_course((SELECT id FROM universities WHERE code = 'FTU'), 'Kinh tế vĩ mô')), 3, 8.0, 8.0);
  ASSERT (SELECT total_score FROM grade_records WHERE record_id = v_rec) = 8.0, '30/70 với 8 và 8 ⇒ 8.0';
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by) VALUES (app_test.mk_file(v_m3, 'academic-evidence', repeat('4', 64)), 'academic_record', v_rec, 'transcript', v_m3);
  UPDATE academic_records SET status = 'submitted' WHERE id = v_rec;
  ASSERT (SELECT gpa4 FROM gpa_snapshots WHERE member_id = v_mem3 AND scope = 'semester') = 3.20, 'GPA4 tuyến tính = 8.0/10×4 = 3.20';
  -- Thống kê tổng hợp ẩn danh: nhóm < 3 người thì không trả số liệu (k-anonymity)
  PERFORM app_test.as_user(v_vice);
  ASSERT (SELECT COUNT(*) FROM app.fn_academic_aggregate(v_sem2)) = 0, 'nhóm dưới 3 sinh viên ⇒ không lộ thống kê';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S7 OK — học tập';
END $$;

-- ---------------------------------------------------------------------
-- S8. Sự kiện: QR xoay vòng ký HMAC, geofence, điểm danh (đúng giờ/muộn/thủ công), đóng điểm danh, đơn xin phép, lịch định kỳ, biểu quyết
-- ---------------------------------------------------------------------
CREATE FUNCTION app_test.mk_event(p_title text, p_start interval, p_end interval, p_attendance boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v uuid := app.uuid_v7();
BEGIN
  INSERT INTO events (id, title, category_id, category_kind, status, starts_at, ends_at, location_text, requires_attendance, created_by)
  VALUES (v, p_title, (SELECT id FROM categories WHERE code = 'EVT_MEET'), 'event', 'scheduled', now() + p_start, now() + p_end, 'Phòng sinh hoạt chung T2', p_attendance,
          '00000000-0000-7000-8000-0000000000a2');
  RETURN v;
END $$;
-- Token QR dựng bằng khóa của phiên (chỉ hàm DEFINER của bộ kiểm thử gọi được fn_qr_mac)
CREATE FUNCTION app_test.qr_tok(p_sid uuid, p_slot_delta integer DEFAULT 0, p_mac text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp AS $$
DECLARE v_rot integer; v_slot bigint;
BEGIN
  SELECT rotation_seconds INTO v_rot FROM qr_sessions WHERE id = p_sid;
  v_slot := floor(extract(epoch FROM now()) / v_rot)::bigint + p_slot_delta;
  RETURN p_sid::text || '.' || v_slot::text || '.' || COALESCE(p_mac, app.fn_qr_mac(p_sid, v_slot));
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_test TO luuxa_app;

DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_memvice uuid := '10000000-0000-7000-8000-0000000000a3';
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_sid uuid; v_sid2 uuid; v_tok text; v_slot bigint; v_att uuid; v_att2 uuid;
  v_rule uuid; v_n integer; v_poll uuid; v_poll2 uuid; v_o1 uuid; v_o2 uuid; v_o3 uuid; v_leave uuid; r record; v_json jsonb;
BEGIN
  -- ===== QR HMAC xoay vòng =====
  v_e1 := app_test.mk_event('Họp nhà tháng (thử nghiệm)', interval '-5 minutes', interval '2 hours');
  PERFORM app_test.as_user(v_vice);
  INSERT INTO qr_sessions (event_id, rotation_seconds, closes_at, created_by) VALUES (v_e1, 45, now() + interval '2 hours', v_vice) RETURNING id INTO v_sid;
  -- Một sự kiện chỉ có một phiên QR hoạt động
  PERFORM app_test.expect_error(format($q$INSERT INTO qr_sessions (event_id, closes_at) VALUES (%L, now() + interval '1 hour')$q$, v_e1), 'ux_qr_sessions__active_per_event');
  -- luuxa_app không đọc được khóa bí mật của phiên
  PERFORM app_test.expect_error(format($q$SELECT secret FROM qr_sessions WHERE id = %L$q$, v_sid), 'permission denied');
  v_tok := app.fn_qr_token(v_sid);
  ASSERT v_tok LIKE v_sid::text || '.%', 'token bắt đầu bằng id phiên';
  -- Thành viên thường không sinh được token (chỉ ban tổ chức/người có quyền)
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_qr_token(%L)$q$, v_sid), 'Không có quyền hiển thị mã QR');
  -- Điểm danh bằng token hợp lệ: present (còn trong ân hạn 10 phút), giờ do máy chủ
  v_att := app.fn_checkin_by_qr(v_tok);
  ASSERT (SELECT status FROM attendance_records WHERE id = v_att) = 'present', 'đến trong ân hạn ⇒ present';
  ASSERT (SELECT method FROM attendance_records WHERE id = v_att) = 'qr', 'method = qr';
  ASSERT app.fn_checkin_by_qr(v_tok) = v_att, 'quét lại idempotent, cùng bản ghi';
  -- Token hết hạn (slot cũ 5 chu kỳ) hoặc sai MAC bị từ chối (BR-EVT-04)
  PERFORM app_test.as_user(v_m3);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L)$q$, app_test.qr_tok(v_sid, -5)), 'BR-EVT-04');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L)$q$, app_test.qr_tok(v_sid, 0, repeat('0', 32))), 'BR-EVT-04');
  PERFORM app_test.expect_error($q$SELECT app.fn_checkin_by_qr('khong-phai-token')$q$, 'Mã QR không hợp lệ');
  -- Slot liền trước vẫn được chấp nhận (chịu độ trễ mạng ≤ 1 chu kỳ)
  ASSERT app.fn_checkin_by_qr(app_test.qr_tok(v_sid, -1)) IS NOT NULL, 'slot liền trước được chấp nhận';
  -- Tài khoản không có hồ sơ thành viên (Admin kỹ thuật) không điểm danh được
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L)$q$, v_tok), 'BR-EVT-04');
  -- Geofence (BR-EVT-05): phiên mới có bán kính 100 m
  PERFORM app_test.as_user(v_vice);
  UPDATE qr_sessions SET status = 'closed', closed_at = now() WHERE id = v_sid;
  INSERT INTO qr_sessions (event_id, rotation_seconds, closes_at, geofence_lat, geofence_lng, geofence_radius_m, require_geofence, created_by)
  VALUES (v_e1, 45, now() + interval '2 hours', 21.005000, 105.843000, 100, true, v_vice) RETURNING id INTO v_sid2;
  v_tok := app.fn_qr_token(v_sid2);
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L, 21.100000, 105.900000)$q$, v_tok), 'BR-EVT-05');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L)$q$, v_tok), 'BR-EVT-05');
  v_att2 := app.fn_checkin_by_qr(v_tok, 21.005050, 105.843050);
  ASSERT (SELECT distance_m FROM attendance_records WHERE id = v_att2) < 100, 'ghi khoảng cách geofence';

  -- ===== Đi muộn: sự kiện đã bắt đầu 30 phút trước (ân hạn 10 phút) =====
  PERFORM app_test.as_super();
  v_e2 := app_test.mk_event('Giờ kinh (thử nghiệm đi muộn)', interval '-30 minutes', interval '1 hour');
  INSERT INTO qr_sessions (event_id, closes_at, created_by) VALUES (v_e2, now() + interval '1 hour', v_vice) RETURNING id INTO v_sid;
  v_tok := app_test.qr_tok(v_sid);
  PERFORM app_test.as_user(v_m4);
  v_att := app.fn_checkin_by_qr(v_tok);
  ASSERT (SELECT status FROM attendance_records WHERE id = v_att) = 'late', 'đến sau ân hạn ⇒ late';
  -- Điểm danh thủ công: người ngoài ban tổ chức bị chặn; thành viên ban tổ chức được phép (BR-EVT-02)
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at, recorded_by) VALUES (%L, %L, 'present', 'manual', now(), %L)$q$, v_e2, v_mem3, v_m1), 'Không có quyền điểm danh hộ');
  PERFORM app_test.as_super();
  INSERT INTO event_organizers (event_id, member_id, role_label) VALUES (v_e2, v_mem3, 'lead');
  PERFORM app_test.as_user(v_m3);
  INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at, recorded_by) VALUES (v_e2, v_mem1, 'present', 'manual', now(), v_m3);
  v_n := app_test.n(format('SELECT 1 FROM attendance_records WHERE event_id = %L', v_e2));
  ASSERT v_n = 2, 'ban tổ chức xem được danh sách điểm danh của sự kiện mình phụ trách (2 dòng), thực tế ' || v_n;
  ASSERT app_test.n(format('SELECT 1 FROM attendance_records WHERE event_id = %L AND member_id <> %L', v_e1, v_mem3)) = 0, 'ban tổ chức sự kiện này không thấy điểm danh của sự kiện khác';
  PERFORM app_test.as_user(v_m4);
  v_n := app_test.n('SELECT 1 FROM attendance_records');
  ASSERT v_n = 2, 'm4 thấy bản ghi của chính mình ở 2 sự kiện (e1 geofence, e2 muộn), thực tế ' || v_n;
  -- Điểm danh ngoài thời gian mở (sự kiện ngày mai) bị chặn
  PERFORM app_test.as_super();
  v_e3 := app_test.mk_event('Sự kiện ngày mai (thử nghiệm)', interval '30 hours', interval '32 hours');
  PERFORM app_test.expect_error(format($q$INSERT INTO qr_sessions (event_id, closes_at) VALUES (%L, now() + interval '25 hours')$q$, v_e3), 'ck_qr_sessions__window');
  INSERT INTO qr_sessions (event_id, closes_at, created_by) VALUES (v_e3, now() + interval '23 hours', v_vice) RETURNING id INTO v_sid;
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L)$q$, app_test.qr_tok(v_sid)), 'BR-EVT-03');

  -- ===== Đơn xin phép + đóng điểm danh =====
  PERFORM app_test.as_super();
  v_e3 := app_test.mk_event('Họp nhà đã kết thúc (thử nghiệm)', interval '-3 hours', interval '-1 hour');
  PERFORM app_test.as_user(v_m2);
  INSERT INTO leave_requests (member_id, kind, event_id, starts_at, ends_at, reason)
  VALUES (v_mem2, 'event_absence', v_e3, now() - interval '3 hours', now() - interval '1 hour', 'Có bài kiểm tra cùng giờ') RETURNING id INTO v_leave;
  -- Tự duyệt đơn của chính mình bị chặn (BR-EVT-07); thành viên thường không duyệt được
  PERFORM app_test.expect_error(format($q$UPDATE leave_requests SET status = 'approved' WHERE id = %L$q$, v_leave), 'BR-EVT-07');
  PERFORM app_test.as_user(v_vice);
  UPDATE leave_requests SET status = 'approved', decision_note = 'OK' WHERE id = v_leave;
  ASSERT (SELECT decided_by FROM leave_requests WHERE id = v_leave) = v_vice, 'ghi người duyệt';
  PERFORM app_test.as_super();
  INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at, recorded_by) VALUES (v_e3, v_mem1, 'present', 'manual', now() - interval '2 hours', v_head);
  PERFORM app_test.as_user(v_vice);
  v_json := app.fn_close_event_attendance(v_e3);
  ASSERT (v_json ->> 'absent_created')::int = 5 AND (v_json ->> 'excused_created')::int = 0, 'sự kiện đã có bản ghi excused từ lúc duyệt đơn: absent=5, excused thêm=0 — thực tế ' || v_json::text;
  ASSERT (SELECT status FROM attendance_records WHERE event_id = v_e3 AND member_id = v_mem2) = 'excused', 'm2 vắng có phép (excused)';
  ASSERT (SELECT COUNT(*) FROM attendance_records WHERE event_id = v_e3 AND status = 'absent') = 5, '5 người vắng không phép';
  ASSERT (SELECT SUM(points) FROM merit_entries WHERE source_table = 'attendance_records' AND rule_code = 'event_absent' AND source_id IN (SELECT id FROM attendance_records WHERE event_id = v_e3)) = -5, 'trừ 1 điểm mỗi người vắng không phép';
  ASSERT (SELECT status FROM events WHERE id = v_e3) = 'completed', 'sự kiện ⇒ completed';
  ASSERT (SELECT attendance_rate_pct FROM v_event_attendance WHERE event_id = v_e3) = round(100.0 * 1 / 7, 1), 'tỷ lệ tham gia = 1/7 với mẫu số đúng (7 thành viên đang ở)';
  -- Đóng điểm danh trước khi sự kiện kết thúc bị chặn
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_event_attendance(%L)$q$, v_e1), 'chưa kết thúc');

  -- ===== Lịch định kỳ =====
  PERFORM app_test.as_user(v_head);
  INSERT INTO event_recurrence_rules (title, category_id, location_text, organizer_text, start_time, duration_minutes, freq, by_weekday, starts_on, requires_attendance, created_by)
  VALUES ('Giờ Kinh Tối thứ Năm', (SELECT id FROM categories WHERE code = 'EVT_MASS'), 'Nguyện đường T3', 'Ban Phụng vụ', TIME '20:30', 60, 'weekly', ARRAY[4]::smallint[], app.local_today(), false, v_head)
  RETURNING id INTO v_rule;
  PERFORM app_test.as_super();
  v_n := app.fn_generate_recurring_events(v_rule, 28);
  ASSERT v_n BETWEEN 4 AND 5, 'sinh 4–5 lần thứ Năm trong 28 ngày, thực tế ' || v_n;
  ASSERT (SELECT COUNT(*) FROM events WHERE recurrence_rule_id = v_rule AND (starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time = TIME '20:30') = v_n, 'giờ bắt đầu 20:30 theo giờ VN';
  ASSERT (SELECT COUNT(*) FROM events WHERE recurrence_rule_id = v_rule AND EXTRACT(ISODOW FROM occurrence_date) <> 4) = 0, 'toàn thứ Năm';
  ASSERT app.fn_generate_recurring_events(v_rule, 28) = 0, 'chạy lại không sinh trùng (idempotent)';
  -- Lịch định kỳ hằng tháng: Chúa Nhật đầu tiên
  INSERT INTO event_recurrence_rules (title, category_id, start_time, duration_minutes, freq, by_weekday, nth_weekday, starts_on, created_by)
  VALUES ('Họp nhà Chúa Nhật đầu tháng', (SELECT id FROM categories WHERE code = 'EVT_MEET'), TIME '19:30', 90, 'monthly', ARRAY[7]::smallint[], 1, app.local_today(), v_head) RETURNING id INTO v_rule;
  v_n := app.fn_generate_recurring_events(v_rule, 120);
  ASSERT v_n BETWEEN 3 AND 5, 'họp nhà tháng: ' || v_n || ' lần trong ~4 tháng';
  ASSERT (SELECT COUNT(*) FROM events WHERE recurrence_rule_id = v_rule AND EXTRACT(DAY FROM occurrence_date) > 7) = 0, 'luôn rơi vào 7 ngày đầu tháng';

  -- ===== Biểu quyết: đơn lựa chọn, đổi phiếu, đóng poll, ẩn danh =====
  PERFORM app_test.as_user(v_head);
  INSERT INTO polls (question, is_multi_select, max_choices, is_anonymous, created_by) VALUES ('Khung giờ họp nhà hằng tháng?', false, 1, false, v_head) RETURNING id INTO v_poll;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Tối Thứ Sáu', 1) RETURNING id INTO v_o1;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Tối Chúa Nhật', 2) RETURNING id INTO v_o2;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Sáng Chúa Nhật', 3) RETURNING id INTO v_o3;
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_cast_vote(v_poll, ARRAY[v_o1]);
  PERFORM app.fn_cast_vote(v_poll, ARRAY[v_o2]);   -- đổi phiếu: thay thế lựa chọn cũ
  PERFORM app_test.expect_error(format($q$SELECT app.fn_cast_vote(%L, ARRAY[%L::uuid, %L::uuid])$q$, v_poll, v_o1, v_o2), 'chỉ được chọn tối đa 1');
  ASSERT app_test.n('SELECT 1 FROM poll_votes') = 1, 'm1 chỉ có 1 phiếu sau khi đổi';
  PERFORM app_test.as_user(v_m2);
  PERFORM app.fn_cast_vote(v_poll, ARRAY[v_o2]);
  -- Kết quả: mẫu số đúng (số người đã bỏ phiếu), thành viên thường không thấy tên
  PERFORM app_test.as_user(v_m1);
  SELECT * INTO r FROM app.fn_poll_results(v_poll) WHERE option_id = v_o2;
  ASSERT r.votes = 2 AND r.voters = 2 AND r.eligible = (SELECT COUNT(*) FROM members WHERE status = 'active' AND deleted_at IS NULL) AND r.voter_names IS NULL,
    format('phương án 2: 2 phiếu / 2 người bỏ phiếu / mẫu số = số thành viên đang ở; thành viên không thấy tên — thực tế votes=%s voters=%s eligible=%s names=%s', r.votes, r.voters, r.eligible, r.voter_names);
  PERFORM app_test.as_user(v_head);
  SELECT * INTO r FROM app.fn_poll_results(v_poll) WHERE option_id = v_o2;
  ASSERT r.voter_names IS NOT NULL AND cardinality(r.voter_names) = 2, 'người có quyền poll.manage thấy tên (poll không ẩn danh)';
  -- Poll ẩn danh: ngay cả người quản lý cũng không thấy tên
  INSERT INTO polls (question, is_anonymous, created_by) VALUES ('Góp ý ẩn danh về bữa cơm?', true, v_head) RETURNING id INTO v_poll2;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll2, 'Hài lòng', 1) RETURNING id INTO v_o1;
  -- Không bỏ phiếu hộ người khác (RLS WITH CHECK member_id = chính mình)
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO poll_votes (poll_id, option_id, member_id) VALUES (%L, %L, %L)$q$, v_poll2, v_o1, v_mem1), 'row-level security');
  PERFORM app_test.as_user(v_m3);
  PERFORM app.fn_cast_vote(v_poll2, ARRAY[v_o1]);
  PERFORM app_test.as_user(v_head);
  SELECT * INTO r FROM app.fn_poll_results(v_poll2);
  ASSERT r.votes IS NULL AND r.voters = 1 AND r.voter_names IS NULL, 'poll ẩn danh đang mở: không lộ tên, không lộ số phiếu từng phương án (C-011)';
  ASSERT app_test.n('SELECT 1 FROM poll_votes') = 0, 'người quản lý cũng không đọc được phiếu của người khác qua bảng';
  -- Đóng poll rồi bỏ phiếu bị từ chối (BR-EVT-08)
  UPDATE polls SET status = 'closed' WHERE id = v_poll;
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_cast_vote(%L, ARRAY[%L::uuid])$q$, v_poll, v_o3), 'BR-EVT-08');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$UPDATE polls SET status = 'open' WHERE id = %L$q$, v_poll), 'Chuyển trạng thái không hợp lệ');
  -- Poll không được sinh phiếu giả từ nhật ký audit: poll_votes không có dòng nào trong audit_logs
  PERFORM app_test.as_super();
  ASSERT NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_table = 'poll_votes'), 'không audit poll_votes (giữ ẩn danh)';
  RAISE NOTICE 'S8 OK — sự kiện, QR, điểm danh, biểu quyết';
END $$;

-- ---------------------------------------------------------------------
-- S9. Tài chính (1/2): sổ cái bất biến + chuỗi băm, phiếu chi (một/hai chữ ký, từ chối, hủy), đảo bút toán, ngưỡng cấu hình
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_treas uuid := '00000000-0000-7000-8000-0000000000a4'; v_admin uuid := '00000000-0000-7000-8000-0000000000a1';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1';
  v_cash uuid; v_bank uuid; v_cat uuid;
  v_m0 date := date_trunc('month', app.local_today())::date;
  v_p1 date; v_p2 date;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid; v_v5 uuid; v_v6 uuid; v_v7 uuid; v_v8 uuid; v_n bigint; v_bal bigint; v_entry uuid; v_rev uuid; v_orig uuid; r record;
  v_broken bigint; v_match boolean; v_json jsonb;
BEGIN
  v_p1 := (v_m0 - interval '1 month')::date;
  v_p2 := (v_m0 - interval '2 months')::date;
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';
  SELECT id INTO v_bank FROM funds WHERE code = 'BANK_MAIN';
  SELECT id INTO v_cat FROM categories WHERE kind = 'expense' AND code = 'FOOD';

  -- ===== Dữ liệu nền: số dư đầu kỳ nằm ở hai kỳ quá khứ (dùng cho bài chốt sổ ở S10) =====
  PERFORM app_test.as_super();
  INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, description) VALUES
    (v_cash, v_p2 + 14, 'in', 8000000,  'opening_balance', 'Số dư đầu kỳ tiền mặt'),
    (v_bank, v_p1 + 14, 'in', 20000000, 'opening_balance', 'Số dư đầu kỳ ngân hàng');
  ASSERT (SELECT last_seq FROM funds WHERE id = v_cash) = 1 AND (SELECT last_seq FROM funds WHERE id = v_bank) = 1, 'mỗi túi quỹ có seq riêng bắt đầu từ 1';
  ASSERT (SELECT COUNT(*) FROM financial_periods) = 2, 'kỳ tài chính tự sinh theo tháng của bút toán (2 tháng)';

  -- ===== Sổ cái =====
  PERFORM app_test.as_user(v_treas);
  ASSERT (SELECT balance_vnd FROM v_fund_balances WHERE code = 'CASH') = 8000000, 'số dư tiền mặt 8.000.000';
  SELECT * INTO r FROM app.fn_verify_ledger_chain(v_cash);
  ASSERT r.entries_checked = 1 AND r.first_broken_seq IS NULL AND r.head_matches, 'chuỗi băm nguyên vẹn';
  -- BR-FIN-16: vai trò runtime KHÔNG ghi trực tiếp vào sổ cái — kể cả Thủ quỹ; mọi bút toán đi qua hàm nghiệp vụ
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, source_id, description) VALUES (%L, app.local_today(), 'out', 9000000, 'expense', app.uuid_v7(), 'chi không phiếu')$q$, v_cash), 'permission denied');
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, description) VALUES (%L, app.local_today(), 'in', 7000000, 'adjustment', 'tự điều chỉnh tăng quỹ')$q$, v_cash), 'permission denied');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'in', 5000, 'adjustment', 'Điều chỉnh không đủ quyền hạn')$q$, v_cash), 'finance.ledger.adjust');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today() + 1, 'in', 1000, 'donation', 'Quyên góp ghi ngày tương lai')$q$, v_cash), 'ở tương lai');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'in', 1000, 'donation', 'ngắn')$q$, v_cash), 'lý do');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'out', 1000, 'donation', 'Quyên góp nhưng ghi chiều chi')$q$, v_cash), 'phải là khoản thu');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'in', 1000, 'expense', 'Nguồn expense không được ghi tay')$q$, v_cash), 'BR-FIN-16');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'in', 1000, 'opening_balance', 'Mở số dư đầu kỳ không đủ quyền')$q$, v_cash), 'finance.ledger.adjust');
  PERFORM app_test.expect_error($q$UPDATE ledger_entries SET amount_vnd = 1$q$, 'permission denied');
  PERFORM app_test.expect_error($q$DELETE FROM ledger_entries$q$, 'permission denied');
  PERFORM app_test.expect_error($q$TRUNCATE ledger_entries$q$, 'permission denied');
  -- Người không có quyền sổ cái: không thấy, không ghi
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM ledger_entries') = 0 AND app_test.n('SELECT 1 FROM funds') = 0,
    format('thành viên thường không đọc được sổ cái/túi quỹ: ledger=%s funds=%s', app_test.n('SELECT 1 FROM ledger_entries'), app_test.n('SELECT 1 FROM funds'));
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, description) VALUES (%L, app.local_today(), 'in', 1000, 'donation', 'tự ghi thu')$q$, v_cash), 'permission denied');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'in', 1000, 'donation', 'Thành viên thường tự ghi quyên góp')$q$, v_cash), 'Không có quyền ghi nhận quyên góp');
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM ledger_entries') = 0, 'Admin kỹ thuật không đọc được sổ cái (tách quyền kỹ thuật khỏi quyền tài chính)';
  -- Superuser/migrator cũng bị trigger chặn sửa/xóa
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error($q$UPDATE ledger_entries SET amount_vnd = 1$q$, 'bất biến');
  PERFORM app_test.expect_error($q$DELETE FROM ledger_entries$q$, 'bất biến');
  PERFORM app_test.expect_error($q$TRUNCATE ledger_entries CASCADE$q$, 'bất biến');

  -- ===== Phát hiện giả mạo sổ cái: sửa lén một dòng (tắt trigger bằng quyền cao nhất) thì chuỗi băm báo đứt =====
  BEGIN
    ALTER TABLE ledger_entries DISABLE TRIGGER trg_ledger_entries__immutable;
    UPDATE ledger_entries SET amount_vnd = amount_vnd + 1 WHERE fund_id = v_cash AND fund_seq = 1;
    SELECT first_broken_seq, head_matches INTO v_broken, v_match FROM app.fn_verify_ledger_chain(v_cash);
    RAISE EXCEPTION 'HOAN_TAC_GIA_MAO';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'HOAN_TAC_GIA_MAO' THEN RAISE; END IF;
  END;
  ASSERT v_broken = 1, 'sửa lén dòng #1 bị phát hiện đúng vị trí, thực tế ' || COALESCE(v_broken::text, 'NULL');
  SELECT * INTO r FROM app.fn_verify_ledger_chain(v_cash);
  ASSERT r.first_broken_seq IS NULL AND r.head_matches, 'sau khi hoàn tác, chuỗi lại nguyên vẹn';

  -- ===== PHIẾU CHI NHỎ (một chữ ký) =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, requested_by)
  VALUES ('Mua gạo tuần 1', 150000, v_cat, app.local_today(), v_cash, v_mem1, v_m1) RETURNING id INTO v_v1;
  PERFORM app_test.expect_error(format($q$INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by) VALUES ('Mạo danh người tạo', 100000, %L, app.local_today(), %L, %L)$q$, v_cat, v_cash, v_m2), 'row-level security');
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM expense_vouchers') = 0, 'thành viên khác không thấy phiếu của người khác';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_submit_expense(%L)$q$, v_v1), 'không tồn tại');
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_submit_expense(v_v1);
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v1) = 'pending_approval' AND (SELECT required_approvals FROM expense_vouchers WHERE id = v_v1) = 1, 'phiếu nhỏ: chờ duyệt, 1 chữ ký';
  -- BR-FIN-01: người tạo/người ứng không tự duyệt
  PERFORM app_test.expect_error(format($q$INSERT INTO expense_approvals (voucher_id, round, approver_user_id, approver_role, decision) VALUES (%L, 0, %L, 'treasurer', 'approved')$q$, v_v1, v_m1), 'BR-FIN-01');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v1), 'Không có quyền duyệt chi');
  -- BR-FIN-02: Phó nhà không được là chữ ký đơn
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v1), 'BR-FIN-02');
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_decide_expense(v_v1, 'approved', 'Đúng giá chợ');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v1) = 'approved', 'đủ chữ ký ⇒ approved';
  -- Sau khi duyệt không ai sửa được phiếu bằng UPDATE trực tiếp: người tạo bị RLS chặn (0 dòng); Thủ quỹ/Trưởng nhà không có chính sách UPDATE nào
  -- (đổi trạng thái/thanh toán chỉ qua hàm nghiệp vụ — BR-FIN-15); nội dung bị khóa bởi BR-FIN-05 kể cả khi người sửa là chủ phiếu đang chờ duyệt (kiểm ở phiếu v6 bên dưới)
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected(format($q$UPDATE expense_vouchers SET amount_vnd = 1 WHERE id = %L$q$, v_v1)) = 0, 'người tạo hết quyền sửa sau khi được duyệt (RLS)';
  PERFORM app_test.as_user(v_treas);
  ASSERT app_test.rows_affected(format($q$UPDATE expense_vouchers SET amount_vnd = 999999 WHERE id = %L$q$, v_v1)) = 0, 'Thủ quỹ không sửa được nội dung phiếu đã duyệt';
  ASSERT app_test.rows_affected(format($q$UPDATE expense_vouchers SET status = 'paid', ledger_entry_id = (SELECT id FROM ledger_entries ORDER BY posted_at LIMIT 1) WHERE id = %L$q$, v_v1)) = 0, 'Thủ quỹ không tự đặt phiếu thành paid trỏ vào bút toán bất kỳ';
  -- Ghi nhận chi: chỉ Thủ quỹ
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_pay_expense(%L, 'cash', app.local_today())$q$, v_v1), 'Không có quyền ghi nhận chi');
  PERFORM app_test.as_user(v_treas);
  v_entry := app.fn_pay_expense(v_v1, 'cash', app.local_today());
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v1) = 'paid', 'paid';
  ASSERT app.fn_fund_balance_at(v_cash, app.local_today()) = 8000000 - 150000, 'số dư sau chi = 7.850.000';
  ASSERT (SELECT COUNT(*) FROM expense_status_history WHERE voucher_id = v_v1) = 4, 'lịch sử 4 bước: draft→pending→approved→paid';
  ASSERT (SELECT counterparty_member_id FROM ledger_entries WHERE id = v_entry) = v_mem1, 'bút toán ghi người được hoàn ứng';
  -- Đảo phiếu: chỉ Trưởng nhà/Thủ quỹ, cần lý do, đúng một lần
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reverse_expense(%L, 'Nhập nhầm số tiền')$q$, v_v1), 'Không có quyền đảo phiếu chi');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reverse_expense(%L, 'x')$q$, v_v1), 'Phải nêu lý do');
  v_rev := app.fn_reverse_expense(v_v1, 'Nhập nhầm số tiền');
  ASSERT app.fn_fund_balance_at(v_cash, app.local_today()) = 8000000, 'đảo xong số dư trở lại 8.000.000';
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v1) = 'reversed', 'reversed';
  ASSERT (SELECT reason FROM expense_status_history WHERE voucher_id = v_v1 AND to_status = 'reversed') = 'Nhập nhầm số tiền', 'lý do đảo lưu trong lịch sử';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reverse_expense(%L, 'lần hai')$q$, v_v1), 'Chỉ phiếu đã chi');
  -- Ràng buộc ở tầng bút toán (kể cả khi bỏ qua hàm nghiệp vụ)
  PERFORM app_test.as_super();
  SELECT ledger_entry_id INTO v_orig FROM expense_vouchers WHERE id = v_v1;
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, source_id, reversal_of_id, description) VALUES (%L, app.local_today(), 'in', 150000, 'reversal', %L, %L, 'đảo lần hai')$q$, v_cash, v_v1, v_orig), 'ux_ledger_entries__reversal');
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, source_id, reversal_of_id, description) VALUES (%L, app.local_today(), 'out', 150000, 'reversal', %L, %L, 'đảo của bút toán đảo')$q$, v_cash, v_v1, v_rev), 'Không đảo một bút toán đảo');
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, source_id, reversal_of_id, description) VALUES (%L, app.local_today(), 'out', 7000000, 'reversal', %L, (SELECT id FROM ledger_entries WHERE fund_id = %L AND fund_seq = 1), 'đảo sai số tiền')$q$, v_cash, v_v1, v_cash), 'cùng số tiền');

  -- ===== PHIẾU CHI LỚN (hai chữ ký, bắt buộc hóa đơn hoặc lý do) =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, requested_by)
  VALUES ('Sửa máy giặt', 1500000, v_cat, app.local_today(), v_cash, v_mem1, v_m1) RETURNING id INTO v_v2;
  PERFORM app_test.expect_error(format($q$SELECT app.fn_submit_expense(%L)$q$, v_v2), 'BR-FIN-03');
  UPDATE expense_vouchers SET no_receipt_reason = 'Thợ không xuất hóa đơn, có ảnh hiện trường' WHERE id = v_v2;
  PERFORM app.fn_submit_expense(v_v2);
  ASSERT (SELECT required_approvals FROM expense_vouchers WHERE id = v_v2) = 2, 'phiếu từ ngưỡng: 2 chữ ký';
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_decide_expense(v_v2, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v2) = 'pending_approval', 'mới 1 chữ ký, vẫn chờ';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v2), 'BR-FIN-02');
  PERFORM app_test.as_user(v_vice);
  PERFORM app.fn_decide_expense(v_v2, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v2) = 'pending_approval', 'Thủ quỹ + Phó nhà nhưng thiếu Trưởng nhà ⇒ vẫn chờ';
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_decide_expense(v_v2, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v2) = 'approved', 'đủ 2 chữ ký có Trưởng nhà ⇒ approved';
  ASSERT (SELECT array_agg(approver_role ORDER BY approver_role) FROM expense_approvals WHERE voucher_id = v_v2) = ARRAY['house_head', 'treasurer', 'vice_head'], 'vai trò chữ ký được ghi đúng (do hệ thống điền)';
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_pay_expense(v_v2, 'cash', app.local_today());
  ASSERT app.fn_fund_balance_at(v_cash, app.local_today()) = 8000000 - 1500000, 'số dư sau khi chi 1.500.000';

  -- ===== TỪ CHỐI → TRẢ VỀ NHÁP → NỘP LẠI (vòng duyệt mới) =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, requested_by, no_receipt_reason)
  VALUES ('Mua dụng cụ vệ sinh', 300000, v_cat, app.local_today(), v_cash, v_mem1, v_m1, 'Chợ không có hóa đơn') RETURNING id INTO v_v3;
  PERFORM app.fn_submit_expense(v_v3);
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'rejected')$q$, v_v3), 'ck_expense_approvals__reject_comment');
  PERFORM app.fn_decide_expense(v_v3, 'rejected', 'Thiếu ảnh hóa đơn gốc');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v3) = 'rejected' AND (SELECT rejection_reason FROM expense_vouchers WHERE id = v_v3) = 'Thiếu ảnh hóa đơn gốc', 'bị từ chối kèm lý do';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v3), 'không ở trạng thái chờ duyệt');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_submit_expense(%L)$q$, v_v3), 'BR-FIN-04');
  PERFORM app_test.expect_error(format($q$UPDATE expense_vouchers SET status = 'draft' WHERE id = %L$q$, v_v3), 'BR-FIN-15');
  PERFORM app.fn_return_expense_to_draft(v_v3);
  UPDATE expense_vouchers SET note = 'Đã bổ sung giải trình' WHERE id = v_v3;
  PERFORM app.fn_submit_expense(v_v3);
  ASSERT (SELECT approval_round FROM expense_vouchers WHERE id = v_v3) = 2, 'nộp lại ⇒ vòng duyệt 2';
  -- BR-FIN-17: phiếu 300.000 đ vượt mức Thủ quỹ tự duyệt (200.000 đ) ⇒ phải do Trưởng nhà duyệt
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v3), 'BR-FIN-17');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_decide_expense(v_v3, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v3) = 'approved', 'vòng 2 duyệt xong';
  ASSERT (SELECT array_agg(round ORDER BY round) FROM expense_approvals WHERE voucher_id = v_v3) = ARRAY[1, 2]::smallint[], 'chữ ký từng vòng được giữ lại (vòng 1 từ chối, vòng 2 duyệt)';
  -- Chữ ký bất biến
  PERFORM app_test.expect_error($q$UPDATE expense_approvals SET decision = 'approved'$q$, 'permission denied');
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error($q$UPDATE expense_approvals SET comment = 'sửa'$q$, 'bất biến');
  PERFORM app_test.expect_error($q$UPDATE expense_status_history SET reason = 'sửa'$q$, 'bất biến');

  -- ===== HỦY PHIẾU NHÁP =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by)
  VALUES ('Phiếu nhập nhầm', 50000, v_cat, app.local_today(), v_cash, v_m1) RETURNING id INTO v_v4;
  PERFORM app_test.expect_error(format($q$UPDATE expense_vouchers SET status = 'cancelled', cancel_reason = 'Nhập nhầm' WHERE id = %L$q$, v_v4), 'BR-FIN-15');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_cancel_expense(%L, 'x')$q$, v_v4), 'lý do hủy');
  PERFORM app.fn_cancel_expense(v_v4, 'Nhập nhầm');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v4) = 'cancelled', 'người tạo hủy phiếu nháp bằng hàm nghiệp vụ';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_submit_expense(%L)$q$, v_v4), 'BR-FIN-04');
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_cancel_expense(%L, 'Người ngoài hủy hộ')$q$, v_v1), 'Không có quyền hủy');

  -- ===== NGƯỠNG LÀ CẤU HÌNH, KHÔNG HARD-CODE =====
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error($q$UPDATE settings SET value = '50000'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd'$q$, 'ngoài giới hạn');
  PERFORM app_test.expect_error($q$UPDATE settings SET value = '"abc"'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd'$q$, 'phải là một con số');
  UPDATE settings SET value = '100000'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by)
  VALUES ('Mua bóng đèn', 150000, v_cat, app.local_today(), v_cash, v_m1) RETURNING id INTO v_v5;
  PERFORM app.fn_submit_expense(v_v5);
  ASSERT (SELECT required_approvals FROM expense_vouchers WHERE id = v_v5) = 2, 'hạ ngưỡng xuống 100.000 ⇒ phiếu 150.000 cần 2 chữ ký';
  PERFORM app_test.as_super();
  UPDATE settings SET value = '1000000'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd';

  -- ===== CẤU HÌNH TÀI CHÍNH CHỈ NGƯỜI CÓ finance.settings.write (Trưởng nhà) SỬA ĐƯỢC — Admin kỹ thuật thì không =====
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.rows_affected($q$UPDATE settings SET value = '1000000000'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd'$q$) = 0, 'Admin kỹ thuật không nâng được ngưỡng hai chữ ký';
  ASSERT app_test.rows_affected($q$UPDATE settings SET value = 'false'::jsonb WHERE key = 'finance.period.close_requires_reconciliation'$q$) = 0, 'Admin không tắt được bắt buộc đối soát';
  ASSERT app_test.rows_affected($q$UPDATE settings SET value = '10'::jsonb WHERE key = 'auth.lockout_minutes'$q$) = 0, 'Admin kỹ thuật KHÔNG tự sửa cấu hình bảo mật auth.* (C-008)';
  PERFORM app_test.as_user(v_treas);
  ASSERT app_test.rows_affected($q$UPDATE settings SET value = '900000'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd'$q$) = 0, 'Thủ quỹ không tự hạ/nâng ngưỡng duyệt';
  ASSERT (SELECT COUNT(*) FROM settings WHERE key = 'finance.expense.dual_approval_min_vnd') = 1, 'nhưng Thủ quỹ đọc được ngưỡng để biết mình phải làm gì';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.rows_affected($q$UPDATE settings SET value = '1000000'::jsonb WHERE key = 'finance.expense.dual_approval_min_vnd'$q$) = 1, 'Trưởng nhà sửa được cấu hình tài chính';

  -- ===== BR-FIN-15 / BR-FIN-16 / BR-FIN-17: chặn mass-assignment, ghi tay vào sổ, tự duyệt-tự chi =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by, no_receipt_reason)
  VALUES ('Phiếu thử mass-assignment', 9000000, v_cat, app.local_today(), v_cash, v_m1, 'Thợ không xuất hóa đơn') RETURNING id INTO v_v6;
  PERFORM app.fn_submit_expense(v_v6);                                    -- ≥ ngưỡng ⇒ 2 chữ ký
  PERFORM app_test.expect_error(format($q$UPDATE expense_vouchers SET required_approvals = 1 WHERE id = %L$q$, v_v6), 'BR-FIN-15');
  PERFORM app_test.expect_error(format($q$UPDATE expense_vouchers SET status = 'approved', approved_at = now() WHERE id = %L$q$, v_v6), 'BR-FIN-15');
  PERFORM app_test.expect_error(format($q$UPDATE expense_vouchers SET status = 'paid', paid_at = now() WHERE id = %L$q$, v_v6), 'BR-FIN-15');
  PERFORM app_test.expect_error(format($q$INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by, status) VALUES ('Tạo thẳng approved', 1000, %L, app.local_today(), %L, %L, 'approved')$q$, v_cat, v_cash, v_m1), 'BR-FIN-15');
  PERFORM app_test.expect_error(format($q$UPDATE expense_vouchers SET amount_vnd = 1000 WHERE id = %L$q$, v_v6), 'BR-FIN-05');   -- nội dung khóa sau khi nộp
  -- phiếu 9.000.000 đ được Trưởng nhà + Thủ quỹ duyệt, nhưng chi vượt số dư tiền mặt bị chặn ở sổ cái
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_decide_expense(v_v6, 'approved');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_decide_expense(v_v6, 'approved');
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_pay_expense(%L, 'cash', app.local_today())$q$, v_v6), 'BR-FIN-07');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v6) = 'approved', 'chi vượt số dư bị chặn, phiếu vẫn ở approved';
  -- BR-FIN-17: phiếu một chữ ký trên mức tự duyệt của Thủ quỹ phải do Trưởng nhà duyệt
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, requested_by, no_receipt_reason)
  VALUES ('Mua thùng gạo', 600000, v_cat, app.local_today(), v_cash, v_mem1, v_m1, 'Mua ở chợ, không hóa đơn') RETURNING id INTO v_v8;
  PERFORM app.fn_submit_expense(v_v8);
  ASSERT (SELECT required_approvals FROM expense_vouchers WHERE id = v_v8) = 1, 'dưới ngưỡng hai chữ ký';
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v8), 'BR-FIN-17');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_decide_expense(v_v8, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v8) = 'approved', 'Trưởng nhà duyệt phiếu một chữ ký trên mức lặt vặt';
  -- Trưởng nhà là NGƯỜI TẠO phiếu lớn: không tự duyệt (BR-FIN-01) nhưng cũng không bế tắc — Thủ quỹ + Phó nhà là đủ hai chữ ký
  PERFORM app_test.as_user(v_head);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by, no_receipt_reason)
  VALUES ('Sửa mái tôn nhà bếp', 1500000, v_cat, app.local_today(), v_cash, v_head, 'Thợ không xuất hóa đơn') RETURNING id INTO v_v7;
  PERFORM app.fn_submit_expense(v_v7);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_expense(%L, 'approved')$q$, v_v7), 'BR-FIN-01');
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_decide_expense(v_v7, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v7) = 'pending_approval', 'mới một chữ ký';
  PERFORM app_test.as_user(v_vice);
  PERFORM app.fn_decide_expense(v_v7, 'approved');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v7) = 'approved', 'Trưởng nhà là người tạo ⇒ Thủ quỹ + Phó nhà là đủ hai chữ ký (không bế tắc)';
  -- Kỳ, ảnh chụp số dư, túi quỹ: luuxa_app không ghi trực tiếp (chỉ hàm nghiệp vụ)
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error($q$UPDATE financial_periods SET status = 'closed'$q$, 'permission denied');
  PERFORM app_test.expect_error($q$INSERT INTO period_fund_balances (period_id, fund_id, opening_balance_vnd, total_in_vnd, total_out_vnd, closing_balance_vnd, entry_count, head_hash) SELECT id, id, 0, 0, 0, 0, 0, repeat('a', 64) FROM funds LIMIT 1$q$, 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE funds SET head_hash = repeat('a', 64) WHERE id = %L$q$, v_cash), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE funds SET allow_negative = true WHERE id = %L$q$, v_cash), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE funds SET last_seq = 0 WHERE id = %L$q$, v_cash), 'permission denied');
  ASSERT app_test.rows_affected(format($q$UPDATE funds SET description = 'Tiền mặt do Thủ quỹ giữ, két có hai chìa' WHERE id = %L$q$, v_cash)) = 1, 'sửa mô tả túi quỹ (cột được phép) vẫn được';

  -- ===== Tổng hợp công khai nội bộ =====
  PERFORM app_test.as_user(v_m2);
  v_json := app.fn_finance_summary(v_m0, app.local_today());
  ASSERT (v_json ->> 'opening_balance_vnd')::bigint = 28000000 AND (v_json ->> 'total_in_vnd')::bigint = 0
     AND (v_json ->> 'total_out_vnd')::bigint = 1500000 AND (v_json ->> 'closing_balance_vnd')::bigint = 26500000,
     'tổng hợp công khai là số thuần (phiếu 150.000 đã đảo không tính): ' || v_json::text;
  ASSERT (v_json -> 'expense_by_category' -> 0 ->> 'total_vnd')::bigint = 1500000 AND jsonb_array_length(v_json -> 'expense_by_category') = 1, 'cơ cấu chi chỉ gồm phiếu paid chưa đảo';
  PERFORM app_test.as_user(v_head);
  ASSERT (SELECT total_out_vnd FROM v_period_cashflow WHERE fund_code = 'CASH' AND period_month = v_m0) = 1500000, 'v_period_cashflow: chi thuần tiền mặt tháng này = 1.500.000';
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_finance_summary(%L, app.local_today())$q$, v_m0), 'Không có quyền xem tổng quan quỹ');
  RAISE NOTICE 'S9 OK — sổ cái, phiếu chi';
END $$;

-- ---------------------------------------------------------------------
-- S10. Tài chính (2/2): kế hoạch thu quỹ, đóng gộp nhiều tháng, đóng một phần, hủy phiếu thu, miễn/giảm, chốt sổ hai người, mở lại, chuyển quỹ
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_treas uuid := '00000000-0000-7000-8000-0000000000a4'; v_admin uuid := '00000000-0000-7000-8000-0000000000a1';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_cash uuid; v_bank uuid;
  v_dues bigint := app.setting_int('finance.monthly_dues_vnd');
  v_m0 date := date_trunc('month', app.local_today())::date;
  v_p1 date; v_p2 date;
  v_plan1 uuid; v_plan0 uuid;
  v_c1_1 uuid; v_c1_0 uuid; v_c2_0 uuid; v_c3_1 uuid; v_c4_0 uuid; v_c4_1 uuid; v_c2_1 uuid;
  v_pay1 uuid; v_pay1b uuid; v_pay2 uuid; v_pay3 uuid; v_req uuid := gen_random_uuid();
  v_per2 uuid; v_per1 uuid; v_per0 uuid;
  v_n bigint; v_bank_before bigint; v_cash_before bigint; v_json jsonb; v_grp uuid; r record; v_entries_before bigint;
BEGIN
  PERFORM app_test.as_super();
  v_p1 := (v_m0 - interval '1 month')::date;
  v_p2 := (v_m0 - interval '2 months')::date;
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';
  SELECT id INTO v_bank FROM funds WHERE code = 'BANK_MAIN';

  -- ===== Kế hoạch thu quỹ: mức quỹ lấy từ cấu hình, mỗi tháng đúng một kế hoạch =====
  PERFORM app_test.as_user(v_treas);
  INSERT INTO contribution_plans (code, name, fee_type, period_month, amount_vnd, due_date, fund_id, created_by)
  VALUES ('DUES-' || to_char(v_p1, 'YYYY-MM'), 'Quỹ sinh hoạt ' || to_char(v_p1, 'MM/YYYY'), 'monthly_dues', v_p1, v_dues, v_p1 + 24, v_cash, v_treas) RETURNING id INTO v_plan1;
  INSERT INTO contribution_plans (code, name, fee_type, period_month, amount_vnd, due_date, fund_id, created_by)
  VALUES ('DUES-' || to_char(v_m0, 'YYYY-MM'), 'Quỹ sinh hoạt ' || to_char(v_m0, 'MM/YYYY'), 'monthly_dues', v_m0, v_dues, v_m0 + 24, v_cash, v_treas) RETURNING id INTO v_plan0;
  PERFORM app_test.expect_error(format($q$INSERT INTO contribution_plans (code, name, fee_type, period_month, amount_vnd, due_date, fund_id) VALUES ('DUES-TRUNG', 'Trùng tháng', 'monthly_dues', %L, 1000, %L, %L)$q$, v_m0, v_m0 + 24, v_cash), 'ux_contribution_plans__monthly');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_generate_contributions(%L)$q$, v_plan1), 'Không có quyền lập kế hoạch thu quỹ');
  PERFORM app_test.as_user(v_treas);
  ASSERT app.fn_generate_contributions(v_plan1) = 7 AND app.fn_generate_contributions(v_plan0) = 7, 'sinh khoản phải thu cho 7 thành viên đang ở';
  ASSERT app.fn_generate_contributions(v_plan1) = 0, 'chạy lại không sinh trùng';
  ASSERT (SELECT status FROM contribution_plans WHERE id = v_plan1) = 'active', 'kế hoạch ⇒ active sau khi sinh';
  SELECT id INTO v_c1_1 FROM contributions WHERE plan_id = v_plan1 AND member_id = v_mem1;
  SELECT id INTO v_c1_0 FROM contributions WHERE plan_id = v_plan0 AND member_id = v_mem1;
  SELECT id INTO v_c2_0 FROM contributions WHERE plan_id = v_plan0 AND member_id = v_mem2;
  SELECT id INTO v_c2_1 FROM contributions WHERE plan_id = v_plan1 AND member_id = v_mem2;
  SELECT id INTO v_c3_1 FROM contributions WHERE plan_id = v_plan1 AND member_id = v_mem3;
  SELECT id INTO v_c4_0 FROM contributions WHERE plan_id = v_plan0 AND member_id = v_mem4;
  SELECT id INTO v_c4_1 FROM contributions WHERE plan_id = v_plan1 AND member_id = v_mem4;
  ASSERT (SELECT amount_due_vnd FROM contributions WHERE id = v_c1_1) = v_dues AND (SELECT status FROM contributions WHERE id = v_c1_1) = 'unpaid', 'mức phải thu lấy từ cấu hình, trạng thái unpaid';

  -- ===== Thu tiền mặt kỳ trước (ghi bút toán vào kỳ M-1 đang mở) =====
  v_pay3 := app.fn_record_contribution_payment(v_mem3, v_cash, v_dues, 'cash', v_p1 + 19, NULL,
              jsonb_build_array(jsonb_build_object('contribution_id', v_c3_1, 'amount_vnd', v_dues)), gen_random_uuid(), 'Thu tiền mặt');
  ASSERT (SELECT status FROM contributions WHERE id = v_c3_1) = 'paid' AND (SELECT paid_vnd FROM contributions WHERE id = v_c3_1) = v_dues, 'm3 đã đóng đủ tháng trước';
  ASSERT (SELECT period_id FROM ledger_entries le JOIN contribution_payments cp ON cp.ledger_entry_id = le.id WHERE cp.id = v_pay3) = (SELECT id FROM financial_periods WHERE period_month = v_p1), 'bút toán thuộc kỳ M-1 theo ngày hạch toán';

  -- ===== Đóng gộp 2 tháng bằng chuyển khoản; kiểm tra các lỗi nhập liệu =====
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'bank_transfer', app.local_today(), NULL, %L::jsonb)$q$, v_mem1, v_bank, 2 * v_dues,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c1_1, 'amount_vnd', v_dues), jsonb_build_object('contribution_id', v_c1_0, 'amount_vnd', v_dues))::text), 'ck_contribution_payments__bank_ref');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem1, v_cash, v_dues,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c1_1, 'amount_vnd', v_dues - 50000))::text), 'BR-FIN-12');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem1, v_cash, v_dues,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c2_0, 'amount_vnd', v_dues))::text), 'không thuộc thành viên này');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, '[]'::jsonb)$q$, v_mem1, v_cash, v_dues), 'ít nhất một khoản');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem1, v_cash, v_dues + 1,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c1_1, 'amount_vnd', v_dues + 1))::text), 'vượt số còn phải thu');
  SELECT balance_vnd INTO v_bank_before FROM v_fund_balances WHERE code = 'BANK_MAIN';
  v_pay1 := app.fn_record_contribution_payment(v_mem1, v_bank, 2 * v_dues, 'bank_transfer', app.local_today(), 'FT26275000111',
              jsonb_build_array(jsonb_build_object('contribution_id', v_c1_1, 'amount_vnd', v_dues), jsonb_build_object('contribution_id', v_c1_0, 'amount_vnd', v_dues)), v_req, 'Đóng gộp 2 tháng');
  ASSERT (SELECT COUNT(*) FROM contributions WHERE id IN (v_c1_1, v_c1_0) AND status = 'paid') = 2, 'đóng gộp: cả hai tháng đều paid';
  ASSERT (SELECT balance_vnd FROM v_fund_balances WHERE code = 'BANK_MAIN') = v_bank_before + 2 * v_dues, 'tiền vào đúng túi quỹ ngân hàng';
  v_pay1b := app.fn_record_contribution_payment(v_mem1, v_bank, 2 * v_dues, 'bank_transfer', app.local_today(), 'FT26275000111',
              jsonb_build_array(jsonb_build_object('contribution_id', v_c1_1, 'amount_vnd', v_dues), jsonb_build_object('contribution_id', v_c1_0, 'amount_vnd', v_dues)), v_req, 'Đóng gộp 2 tháng');
  ASSERT v_pay1b = v_pay1 AND (SELECT balance_vnd FROM v_fund_balances WHERE code = 'BANK_MAIN') = v_bank_before + 2 * v_dues, 'bấm đúp/retry cùng client_request_id không ghi trùng';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem1, v_cash, v_dues,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c1_1, 'amount_vnd', v_dues))::text), 'vượt số còn phải thu');

  -- ===== Đóng một phần rồi đóng nốt =====
  v_pay2 := app.fn_record_contribution_payment(v_mem2, v_cash, 100000, 'cash', app.local_today(), NULL,
              jsonb_build_array(jsonb_build_object('contribution_id', v_c2_0, 'amount_vnd', 100000)), gen_random_uuid(), NULL);
  ASSERT (SELECT status FROM contributions WHERE id = v_c2_0) = 'partial' AND (SELECT paid_vnd FROM contributions WHERE id = v_c2_0) = 100000, 'đóng một phần ⇒ partial';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem2, v_cash, v_dues,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c2_0, 'amount_vnd', v_dues))::text), 'vượt số còn phải thu');
  PERFORM app.fn_record_contribution_payment(v_mem2, v_cash, v_dues - 100000, 'cash', app.local_today(), NULL,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c2_0, 'amount_vnd', v_dues - 100000)), gen_random_uuid(), NULL);
  ASSERT (SELECT status FROM contributions WHERE id = v_c2_0) = 'paid', 'đóng nốt ⇒ paid';

  -- ===== Hủy phiếu thu bằng bút toán đảo, khoản phải thu tự trở lại unpaid =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_void_contribution_payment(%L, 'Nhập nhầm số tiền')$q$, v_pay1), 'Không có quyền hủy phiếu thu');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, %s, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem1, v_cash, 1000,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c1_0, 'amount_vnd', 1000))::text), 'Không có quyền ghi nhận thu quỹ');
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_void_contribution_payment(v_pay1, 'Nhập nhầm số tiền');
  ASSERT (SELECT COUNT(*) FROM contributions WHERE id IN (v_c1_1, v_c1_0) AND status = 'unpaid' AND paid_vnd = 0) = 2, 'hủy phiếu ⇒ cả hai khoản trở lại unpaid';
  ASSERT (SELECT balance_vnd FROM v_fund_balances WHERE code = 'BANK_MAIN') = v_bank_before, 'số dư ngân hàng trở lại như trước nhờ bút toán đảo';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_void_contribution_payment(%L, 'Hủy lần hai')$q$, v_pay1), 'đã hủy trước đó');
  ASSERT (SELECT COUNT(*) FROM ledger_entries WHERE source_type = 'reversal' AND source_id = v_pay1) = 1, 'đúng một bút toán đảo cho phiếu thu';
  ASSERT (SELECT outstanding_vnd FROM v_member_debts WHERE member_id = v_mem1) = 2 * v_dues, 'công nợ của m1 = 2 tháng';
  ASSERT (SELECT COUNT(*) FROM v_member_debts) = 7, 'cả 7 thành viên còn nợ ít nhất một khoản';
  ASSERT (SELECT outstanding_vnd FROM v_member_debts WHERE member_id = v_mem2) = v_dues AND (SELECT outstanding_vnd FROM v_member_debts WHERE member_id = v_mem3) = v_dues, 'm2 nợ tháng trước, m3 nợ tháng này';
  ASSERT (SELECT bool_or(has_overdue) FROM v_member_debts WHERE member_id = v_mem2), 'khoản tháng trước quá hạn';
  -- Ma trận đóng quỹ: tháng × thành viên với JSON trạng thái từng tháng
  SELECT months INTO v_json FROM v_contribution_matrix WHERE member_id = v_mem3;
  ASSERT v_json -> to_char(v_p1, 'YYYY-MM') ->> 'status' = 'paid' AND v_json -> to_char(v_m0, 'YYYY-MM') ->> 'status' = 'unpaid', 'ma trận: m3 tháng trước paid, tháng này unpaid';

  -- ===== Quyền xem: thành viên chỉ thấy khoản/phiếu thu của mình =====
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM contributions') = 2 AND app_test.n('SELECT 1 FROM contributions WHERE member_id <> ' || quote_literal(v_mem1)) = 0, 'm1 chỉ thấy 2 khoản của mình';
  ASSERT app_test.n('SELECT 1 FROM contribution_payments') = 1, 'm1 chỉ thấy phiếu thu của mình';
  ASSERT (SELECT outstanding_vnd FROM v_member_debts) = 2 * v_dues AND (SELECT COUNT(*) FROM v_member_debts) = 1, 'v_member_debts của m1 chỉ có một dòng của chính mình';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM contributions') = 0, 'Admin kỹ thuật không thấy thu quỹ';

  RAISE NOTICE 'S10a OK — thu quỹ';
END $$;

-- ---------------------------------------------------------------------
-- S10b. Miễn/giảm (chỉ Trưởng nhà), chốt sổ hai người, đối soát ngân hàng, mở lại kỳ, chuyển quỹ
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_treas uuid := '00000000-0000-7000-8000-0000000000a4'; v_admin uuid := '00000000-0000-7000-8000-0000000000a1';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_cash uuid; v_bank uuid;
  v_dues bigint := app.setting_int('finance.monthly_dues_vnd');
  v_m0 date := date_trunc('month', app.local_today())::date;
  v_p1 date; v_p2 date; v_e1 date; v_e2 date;
  v_plan1 uuid; v_plan0 uuid; v_c4_0 uuid; v_c4_1 uuid; v_c2_1 uuid;
  v_per2 uuid; v_per1 uuid; v_per0 uuid;
  v_json jsonb; v_grp uuid; r record; v_bank_bal bigint; v_cash_bal bigint; v_hash text; v_cnt bigint;
  v_adj uuid; v_don uuid; v_req2 uuid := gen_random_uuid();
BEGIN
  PERFORM app_test.as_super();
  v_p1 := (v_m0 - interval '1 month')::date;
  v_p2 := (v_m0 - interval '2 months')::date;
  v_e1 := (v_p1 + interval '1 month' - interval '1 day')::date;       -- ngày cuối M-1
  v_e2 := (v_p2 + interval '1 month' - interval '1 day')::date;       -- ngày cuối M-2
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';
  SELECT id INTO v_bank FROM funds WHERE code = 'BANK_MAIN';
  SELECT id INTO v_plan1 FROM contribution_plans WHERE period_month = v_p1;
  SELECT id INTO v_plan0 FROM contribution_plans WHERE period_month = v_m0;
  SELECT id INTO v_c4_0 FROM contributions WHERE plan_id = v_plan0 AND member_id = v_mem4;
  SELECT id INTO v_c4_1 FROM contributions WHERE plan_id = v_plan1 AND member_id = v_mem4;
  SELECT id INTO v_c2_1 FROM contributions WHERE plan_id = v_plan1 AND member_id = v_mem2;
  SELECT id INTO v_per2 FROM financial_periods WHERE period_month = v_p2;
  SELECT id INTO v_per1 FROM financial_periods WHERE period_month = v_p1;
  SELECT id INTO v_per0 FROM financial_periods WHERE period_month = v_m0;

  -- ===== Miễn/giảm: chỉ người có quyền waive (Trưởng nhà); người duyệt do hệ thống ghi =====
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$UPDATE contributions SET discount_vnd = 100000, discount_reason = 'Hoàn cảnh khó khăn' WHERE id = %L$q$, v_c4_0), 'BR-FIN-14');
  -- không điền hộ người duyệt, không tự đặt đã thu / trạng thái (cột do hệ thống giữ — GRANT theo cột)
  PERFORM app_test.expect_error(format($q$UPDATE contributions SET discount_vnd = 100000, discount_reason = 'Hoàn cảnh khó khăn', discount_approved_by = %L WHERE id = %L$q$, v_head, v_c4_0), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE contributions SET paid_vnd = amount_due_vnd WHERE id = %L$q$, v_c4_0), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE contributions SET status = 'paid' WHERE id = %L$q$, v_c4_0), 'permission denied');
  PERFORM app_test.expect_error(format($q$INSERT INTO contribution_payments (member_id, fund_id, amount_vnd, method, paid_on, received_by) VALUES (%L, %L, 1000, 'cash', app.local_today(), %L)$q$, v_mem4, v_cash, v_treas), 'permission denied');
  PERFORM app_test.expect_error($q$UPDATE contribution_payments SET amount_vnd = 1$q$, 'permission denied');
  PERFORM app_test.expect_error($q$DELETE FROM contribution_payment_allocations$q$, 'permission denied');
  PERFORM app_test.as_user(v_m4);
  ASSERT app_test.rows_affected(format($q$UPDATE contributions SET discount_vnd = 100000, discount_reason = 'Tự miễn cho mình' WHERE id = %L$q$, v_c4_0)) = 0, 'thành viên không tự miễn được (RLS)';
  PERFORM app_test.as_user(v_head);
  UPDATE contributions SET discount_vnd = 100000, discount_reason = 'Hoàn cảnh khó khăn' WHERE id = v_c4_0;
  ASSERT (SELECT discount_approved_by FROM contributions WHERE id = v_c4_0) = v_head, 'người duyệt miễn giảm do hệ thống ghi = Trưởng nhà';
  UPDATE contributions SET discount_vnd = amount_due_vnd, discount_reason = 'Miễn toàn phần theo quyết định Ban điều hành' WHERE id = v_c4_1;
  ASSERT (SELECT status FROM contributions WHERE id = v_c4_1) = 'waived', 'miễn toàn phần ⇒ waived';
  PERFORM app_test.expect_error(format($q$UPDATE contributions SET discount_vnd = amount_due_vnd + 1, discount_reason = 'Quá mức' WHERE id = %L$q$, v_c4_0), 'ck_contributions__discount_le_due');
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_record_contribution_payment(%L, %L, 1000, 'cash', app.local_today(), NULL, %L::jsonb)$q$, v_mem4, v_cash,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c4_1, 'amount_vnd', 1000))::text), 'đã waived');
  PERFORM app.fn_record_contribution_payment(v_mem4, v_cash, v_dues - 100000, 'cash', app.local_today(), NULL,
            jsonb_build_array(jsonb_build_object('contribution_id', v_c4_0, 'amount_vnd', v_dues - 100000)), gen_random_uuid(), NULL);
  ASSERT (SELECT status FROM contributions WHERE id = v_c4_0) = 'paid', 'giảm 100.000 rồi đóng phần còn lại ⇒ paid';

  -- ===== Đối soát + chốt sổ hai người =====
  -- (a) Kỳ M-1 chưa chốt được vì kỳ M-2 còn mở
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per2), 'Không có quyền chốt sổ');
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per1), 'phải chốt kỳ');
  -- (b) Quỹ ngân hàng chưa đối soát ⇒ không chốt được kỳ M-2
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per2), 'BR-FIN-09');
  INSERT INTO period_reconciliations (period_id, fund_id, statement_balance_vnd, ledger_balance_vnd, reconciled_by)
  VALUES (v_per2, v_bank, app.fn_fund_balance_at(v_bank, v_e2), app.fn_fund_balance_at(v_bank, v_e2), v_treas);
  v_json := app.fn_close_period(v_per2, 'Chốt sổ tháng ' || to_char(v_p2, 'MM/YYYY'));
  ASSERT (SELECT status FROM financial_periods WHERE id = v_per2) = 'pending_confirmation' AND (SELECT closed_by FROM financial_periods WHERE id = v_per2) = v_treas, 'bước 1: pending_confirmation do Thủ quỹ';
  ASSERT jsonb_array_length(v_json -> 'funds') = 2, 'ảnh chụp cho cả hai túi quỹ';
  ASSERT (SELECT closing_balance_vnd FROM period_fund_balances WHERE period_id = v_per2 AND fund_id = v_cash) = 8000000, 'số dư cuối M-2 của tiền mặt = 8.000.000';
  -- (c) Kỳ đang chờ xác nhận đã bị khóa ghi sổ; Thủ quỹ không tự xác nhận được
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, description) VALUES (%L, %L, 'in', 1000, 'donation', 'ghi vào kỳ đã khóa')$q$, v_cash, v_p2 + 20), 'BR-FIN-06');
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_confirm_period_close(%L)$q$, v_per2), 'Không có quyền xác nhận chốt sổ');
  PERFORM app_test.expect_error(format($q$UPDATE period_reconciliations SET explanation = 'sửa sau khi đóng băng' WHERE period_id = %L$q$, v_per2), 'BR-FIN-06');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_confirm_period_close(v_per2);
  ASSERT (SELECT status FROM financial_periods WHERE id = v_per2) = 'closed' AND (SELECT confirmed_by FROM financial_periods WHERE id = v_per2) = v_head, 'bước 2: closed do Trưởng nhà';
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$DELETE FROM period_fund_balances WHERE period_id = %L$q$, v_per2), 'permission denied');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$DELETE FROM period_fund_balances WHERE period_id = %L$q$, v_per2), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE financial_periods SET status = 'open', reopened_at = now(), reopen_reason = 'Trưởng nhà tự mở lại bằng UPDATE' WHERE id = %L$q$, v_per2), 'permission denied');
  -- Chỉ super (migrator) mới chạm được snapshot của kỳ đã chốt, và trigger vẫn chặn
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$DELETE FROM period_fund_balances WHERE period_id = %L$q$, v_per2), 'BR-FIN-06');

  -- (d) Kỳ M-1: biên bản đối soát có chênh lệch phải giải trình; sau chốt snapshot khớp sổ cái
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per1), 'BR-FIN-09');
  v_bank_bal := app.fn_fund_balance_at(v_bank, v_e1);
  PERFORM app_test.expect_error(format($q$INSERT INTO period_reconciliations (period_id, fund_id, statement_balance_vnd, ledger_balance_vnd, reconciled_by) VALUES (%L, %L, %s, %s, %L)$q$, v_per1, v_bank, v_bank_bal - 15000, v_bank_bal, v_treas), 'ck_period_reconciliations__explain');
  INSERT INTO period_reconciliations (period_id, fund_id, statement_balance_vnd, ledger_balance_vnd, explanation, reconciled_by)
  VALUES (v_per1, v_bank, v_bank_bal - 15000, v_bank_bal, 'Phí quản lý tài khoản 15.000 đ chưa hạch toán vào sổ', v_treas);
  v_json := app.fn_close_period(v_per1, 'Chốt sổ tháng ' || to_char(v_p1, 'MM/YYYY'));
  SELECT * INTO r FROM period_fund_balances WHERE period_id = v_per1 AND fund_id = v_cash;
  ASSERT r.opening_balance_vnd = 8000000 AND r.total_in_vnd = v_dues AND r.total_out_vnd = 0 AND r.closing_balance_vnd = 8000000 + v_dues,
         format('M-1 tiền mặt: đầu kỳ = cuối kỳ M-2 (8.000.000), thu %s, cuối kỳ %s', v_dues, 8000000 + v_dues);
  SELECT le.row_hash INTO v_hash FROM ledger_entries le WHERE le.fund_id = v_cash AND le.entry_date <= v_e1 ORDER BY le.fund_seq DESC LIMIT 1;
  ASSERT r.head_hash = v_hash, 'head_hash của kỳ = băm bút toán cuối cùng trong kỳ';
  SELECT * INTO r FROM period_fund_balances WHERE period_id = v_per1 AND fund_id = v_bank;
  ASSERT r.opening_balance_vnd = 0 AND r.total_in_vnd = 20000000 AND r.closing_balance_vnd = 20000000, 'M-1 ngân hàng: 0 + 20.000.000';
  -- Nguyên tắc hai người ở tầng CHECK (kể cả khi bỏ qua hàm nghiệp vụ)
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$UPDATE financial_periods SET status = 'closed', confirmed_by = closed_by, confirmed_at = now() WHERE id = %L$q$, v_per1), 'ck_financial_periods__two_person');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_confirm_period_close(v_per1);
  -- Kỳ đã chốt: không sửa số phải thu/miễn giảm của kế hoạch tháng đó
  PERFORM app_test.expect_error(format($q$UPDATE contributions SET discount_vnd = 50000, discount_reason = 'Thử sửa sau chốt sổ' WHERE id = %L$q$, v_c2_1), 'BR-FIN-06');
  -- Chưa hết tháng hiện tại thì chưa chốt được
  IF app.local_today() < (v_m0 + interval '1 month' - interval '1 day')::date THEN
    PERFORM app_test.as_user(v_treas);
    PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per0), 'chưa thể chốt kỳ');
  END IF;

  -- ===== Mở lại kỳ: Trưởng nhà, lý do ≥ 10 ký tự, kỳ mới trước, đối soát cũ phải làm lại =====
  PERFORM app_test.as_user(v_treas);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reopen_period(%L, 'Phát hiện nhập nhầm phiếu thu')$q$, v_per1), 'Không có quyền mở lại');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reopen_period(%L, 'Mở lại kỳ cũ để sửa')$q$, v_per2), 'BR-FIN-11');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reopen_period(%L, 'ngắn quá')$q$, v_per1), 'ck_financial_periods__reopen_reason');
  PERFORM app.fn_reopen_period(v_per1, 'Phát hiện thiếu khoản quyên góp ngày cuối tháng');
  ASSERT (SELECT status FROM financial_periods WHERE id = v_per1) = 'open' AND (SELECT reopen_count FROM financial_periods WHERE id = v_per1) = 1, 'kỳ mở lại, đếm số lần mở';
  ASSERT (SELECT COUNT(*) FROM period_fund_balances WHERE period_id = v_per1) = 0, 'ảnh chụp cũ bị xóa khi mở lại';
  PERFORM app_test.as_super();
  ASSERT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'PERIOD_REOPEN' AND entity_id = v_per1::text AND reason LIKE 'Phát hiện thiếu khoản%'), 'ghi audit PERIOD_REOPEN kèm lý do';
  -- Ghi bổ sung vào kỳ vừa mở lại → biên bản đối soát cũ không còn khớp ⇒ phải đối soát lại trước khi chốt
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_transfer_funds(v_bank, v_cash, 1000000, v_e1, 'Rút tiền bổ sung cuối tháng');   -- chuyển quỹ nội bộ làm đổi số dư ngân hàng
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per1), 'đã cũ');
  UPDATE period_reconciliations SET statement_balance_vnd = app.fn_fund_balance_at(v_bank, v_e1) - 15000, ledger_balance_vnd = app.fn_fund_balance_at(v_bank, v_e1) WHERE period_id = v_per1 AND fund_id = v_bank;
  PERFORM app.fn_close_period(v_per1, 'Chốt lại sau khi điều chỉnh');
  ASSERT (SELECT closing_balance_vnd FROM period_fund_balances WHERE period_id = v_per1 AND fund_id = v_bank) = 19000000 AND (SELECT closing_balance_vnd FROM period_fund_balances WHERE period_id = v_per1 AND fund_id = v_cash) = 8000000 + v_dues + 1000000, 'snapshot mới phản ánh khoản chuyển quỹ';
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_confirm_period_close(v_per1);
  ASSERT (SELECT status FROM financial_periods WHERE id = v_per1) = 'closed', 'chốt lại xong';

  -- ===== Chuyển quỹ giữa hai túi (thuộc kỳ hiện tại) =====
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_transfer_funds(%L, %L, 1000, app.local_today(), 'Không có quyền')$q$, v_bank, v_cash), 'Không có quyền chuyển quỹ');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_transfer_funds(%L, %L, 1000, app.local_today(), 'Cùng một túi')$q$, v_cash, v_cash), 'phải khác nhau');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_transfer_funds(%L, %L, 999999999, app.local_today(), 'Vượt số dư')$q$, v_bank, v_cash), 'BR-FIN-07');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_transfer_funds(%L, %L, 1000, %L, 'Vào kỳ đã chốt')$q$, v_bank, v_cash, v_e1), 'BR-FIN-06');
  v_bank_bal := app.fn_fund_balance_at(v_bank, app.local_today());
  v_cash_bal := app.fn_fund_balance_at(v_cash, app.local_today());
  v_grp := app.fn_transfer_funds(v_bank, v_cash, 5000000, app.local_today(), 'Rút tiền mặt chi tiêu');
  ASSERT app.fn_fund_balance_at(v_bank, app.local_today()) = v_bank_bal - 5000000 AND app.fn_fund_balance_at(v_cash, app.local_today()) = v_cash_bal + 5000000, 'chuyển quỹ làm đổi số dư hai túi';
  ASSERT (SELECT COUNT(*) FROM ledger_entries WHERE transfer_group_id = v_grp) = 2, 'đúng hai bút toán cùng nhóm';
  v_json := app.fn_finance_summary(v_m0, app.local_today());
  ASSERT (v_json ->> 'total_in_vnd')::bigint = (SELECT COALESCE(SUM(amount_vnd), 0) FROM ledger_entries WHERE direction = 'in' AND source_type NOT IN ('transfer', 'reversal') AND entry_date >= v_m0) - (SELECT COALESCE(SUM(amount_vnd), 0) FROM ledger_entries WHERE direction = 'out' AND source_type = 'reversal' AND entry_date >= v_m0),
         'tổng hợp công khai không tính chuyển quỹ vào thu';
  -- Một dòng chuyển quỹ lẻ (không đủ cặp) bị chặn khi kiểm tra ràng buộc trì hoãn
  PERFORM app_test.as_super();
  SET CONSTRAINTS trg_ledger_entries__transfer_pair IMMEDIATE;
  PERFORM app_test.expect_error(format($q$INSERT INTO ledger_entries (fund_id, entry_date, direction, amount_vnd, source_type, transfer_group_id, description) VALUES (%L, app.local_today(), 'in', 1000, 'transfer', app.uuid_v7(), 'dòng chuyển quỹ lẻ')$q$, v_cash), 'Nhóm chuyển quỹ');
  SET CONSTRAINTS trg_ledger_entries__transfer_pair DEFERRED;

  -- ===== Ghi tay vào sổ cái (BR-FIN-16): điều chỉnh do Trưởng nhà, quyên góp do Thủ quỹ; số dư đầu kỳ chỉ một lần =====
  PERFORM app_test.as_user(v_head);
  v_cash_bal := app.fn_fund_balance_at(v_cash, app.local_today());
  v_adj := app.fn_post_ledger_entry(v_cash, app.local_today(), 'in', 20000, 'adjustment', 'Điều chỉnh: tìm lại tiền lẻ khi kiểm két cuối tháng', v_req2);
  ASSERT app.fn_post_ledger_entry(v_cash, app.local_today(), 'in', 20000, 'adjustment', 'Điều chỉnh: tìm lại tiền lẻ khi kiểm két cuối tháng', v_req2) = v_adj, 'gửi lại cùng client_request_id ⇒ cùng bút toán (idempotent)';
  ASSERT app.fn_fund_balance_at(v_cash, app.local_today()) = v_cash_bal + 20000, 'điều chỉnh làm đổi số dư đúng một lần';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_post_ledger_entry(%L, app.local_today(), 'in', 1000, 'opening_balance', 'Mở số dư đầu kỳ lần hai cho két tiền mặt')$q$, v_cash), 'MỘT lần');
  PERFORM app_test.as_user(v_treas);
  v_don := app.fn_post_ledger_entry(v_bank, app.local_today(), 'in', 100000, 'donation', 'Quyên góp của ân nhân chuyển khoản vào tài khoản chung');
  ASSERT (SELECT created_by FROM ledger_entries WHERE id = v_don) = v_treas AND (SELECT source_id FROM ledger_entries WHERE id = v_don) IS NULL, 'quyên góp ghi nhận người thực hiện, không gắn nguồn giả';
  PERFORM app_test.as_super();
  ASSERT (SELECT COUNT(*) FROM audit_logs WHERE action = 'LEDGER_MANUAL_ENTRY' AND entity_id IN (v_adj::text, v_don::text)) = 2, 'mọi bút toán ghi tay đều có dòng kiểm toán LEDGER_MANUAL_ENTRY';
  -- Số liệu công khai: số dư đầu kỳ nhập tay KHÔNG phải khoản thu (kỳ M-1 chỉ có chuyển quỹ + thu thật)
  PERFORM app_test.as_user(v_head);
  ASSERT (SELECT opening_balance_entries_vnd FROM v_period_cashflow WHERE fund_code = 'BANK_MAIN' AND period_month = v_p1) = 20000000
         AND (SELECT total_in_vnd FROM v_period_cashflow WHERE fund_code = 'BANK_MAIN' AND period_month = v_p1) = 0, 'v_period_cashflow tách số dư đầu kỳ khỏi doanh thu';

  -- ===== Toàn vẹn cuối cùng =====
  FOR r IN SELECT * FROM app.fn_verify_ledger_chain() LOOP
    ASSERT r.first_broken_seq IS NULL AND r.head_matches, format('chuỗi băm túi %s phải nguyên vẹn', r.fund_code);
  END LOOP;
  ASSERT (SELECT SUM(balance_vnd) FROM v_fund_balances) = (SELECT SUM(CASE direction WHEN 'in' THEN amount_vnd ELSE -amount_vnd END) FROM ledger_entries), 'tổng số dư các túi = tổng sổ cái';
  RAISE NOTICE 'S10 OK — thu quỹ, chốt sổ, chuyển quỹ';
END $$;

-- ---------------------------------------------------------------------
-- S10c. Phiên API quên gắn user không được hưởng quyền hệ thống; hàm nội bộ không gọi trực tiếp được; job nền vẫn chạy
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_cash uuid; v_bank uuid; v_plan uuid; v_per uuid; v_e uuid; v_qr uuid;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';
  SELECT id INTO v_bank FROM funds WHERE code = 'BANK_MAIN';
  SELECT id INTO v_plan FROM contribution_plans ORDER BY code LIMIT 1;
  SELECT id INTO v_per FROM financial_periods ORDER BY period_month LIMIT 1;
  SELECT id INTO v_e FROM events ORDER BY created_at LIMIT 1;
  SELECT id INTO v_qr FROM qr_sessions WHERE status = 'active' LIMIT 1;
  PERFORM app_test.as_anon();
  ASSERT NOT app.is_system_caller(), 'phiên API không bao giờ là ngữ cảnh hệ thống';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_transfer_funds(%L, %L, 1000, app.local_today(), 'ẩn danh')$q$, v_bank, v_cash), 'Không có quyền chuyển quỹ');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_period(%L)$q$, v_per), 'Không có quyền chốt sổ');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_confirm_period_close(%L)$q$, v_per), 'Không có quyền xác nhận chốt sổ');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reopen_period(%L, 'ẩn danh mở lại kỳ')$q$, v_per), 'Không có quyền mở lại');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_generate_contributions(%L)$q$, v_plan), 'Không có quyền lập kế hoạch');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_close_event_attendance(%L)$q$, v_e), 'Không có quyền đóng điểm danh');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_qr_token(%L)$q$, v_qr), 'Không có quyền hiển thị mã QR');
  PERFORM app_test.expect_error($q$SELECT app.fn_audit_event('READ_SENSITIVE', 'members', NULL, 'ẩn danh')$q$, 'Chưa đăng nhập');
  -- Hàm nội bộ: luuxa_app không có EXECUTE
  PERFORM app_test.expect_error($q$SELECT app.ensure_period(DATE '2030-01-01')$q$, 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.write_audit('PERIOD_CLOSE', 'financial_periods', 'x', 'giả mạo')$q$, 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.fn_award_duty_merit(app.uuid_v7(), 'duty_approved', 'tự cộng điểm')$q$, 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.fn_notify(app.uuid_v7(), 'announcement', 'Giả mạo', 'Nội dung', '{}'::jsonb, NULL, NULL)$q$, 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.fn_rollup_contribution(app.uuid_v7())$q$, 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.fn_qr_mac(app.uuid_v7(), 1)$q$, 'permission denied');
  -- Đã đăng nhập: chỉ ghi được các sự kiện kiểm toán cho phép; người ghi lấy từ ngữ cảnh DB
  PERFORM app_test.as_user('00000000-0000-7000-8000-0000000000a2');
  PERFORM app.fn_audit_event('READ_SENSITIVE', 'member_private_details', '10000000-0000-7000-8000-0000000000b1', 'Xem CCCD để làm hợp đồng');
  PERFORM app_test.expect_error($q$SELECT app.fn_audit_event('PERIOD_CLOSE', 'financial_periods', 'x', 'giả mạo sự kiện chốt sổ')$q$, 'không được ghi từ API');
  PERFORM app_test.expect_error($q$SELECT app.fn_audit_event('READ_SENSITIVE', 'Bảng; DROP TABLE x', NULL, 'tên thực thể xấu')$q$, 'Tên thực thể không hợp lệ');
  PERFORM app_test.as_super();
  ASSERT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'READ_SENSITIVE' AND entity_table = 'member_private_details'
                    AND actor_user_id = '00000000-0000-7000-8000-0000000000a2' AND reason LIKE 'Xem CCCD%'), 'READ_SENSITIVE được ghi với người thật';
  -- Tiến trình nền (luuxa_worker, không user) vẫn chạy được các hàm hệ thống
  PERFORM app_test.as_worker();
  ASSERT app.is_system_caller(), 'worker là ngữ cảnh hệ thống';
  ASSERT app.fn_generate_contributions(v_plan) = 0, 'worker chạy fn_generate_contributions (idempotent)';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S10c OK — ranh giới hệ thống/API';
END $$;

-- ---------------------------------------------------------------------
-- S11. Bất biến cho trigger bảo vệ cột (app.tg_guard_columns): cột và mã quyền được khai báo phải TỒN TẠI
--      (gõ nhầm tên cột/quyền sẽ làm trigger lặng lẽ không bảo vệ gì hoặc chặn nhầm mọi người)
-- ---------------------------------------------------------------------
DO $$
DECLARE v_list text;
BEGIN
  PERFORM app_test.as_super();
  SELECT string_agg(t.tgrelid::regclass::text || '.' || t.tgname || ' → ' || x.what, '; ') INTO v_list
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid AND p.proname = 'tg_guard_columns' AND p.pronamespace = 'app'::regnamespace
    CROSS JOIN LATERAL (SELECT string_to_array(encode(t.tgargs, 'escape'), '\000') AS a) args
    CROSS JOIN LATERAL (
      SELECT 'cột ' || c AS what
        FROM unnest(string_to_array(COALESCE(args.a[3], ''), ',') || string_to_array(COALESCE(args.a[4], ''), ',')) AS c
       WHERE c <> '' AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.tgrelid AND a.attname = c AND a.attnum > 0 AND NOT a.attisdropped)
      UNION ALL
      SELECT 'quyền ' || pc FROM unnest(string_to_array(COALESCE(args.a[2], ''), ',')) AS pc WHERE pc <> '' AND NOT EXISTS (SELECT 1 FROM permissions WHERE code = pc)
    ) x;
  ASSERT v_list IS NULL, 'trigger bảo vệ cột trỏ tới cột/quyền không tồn tại: ' || COALESCE(v_list, '');
  ASSERT (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'tg_guard_columns' AND p.pronamespace = 'app'::regnamespace) >= 6, 'các trigger bảo vệ cột (forum, bình luận, ý chỉ, thông báo, đơn xin vào, lịch giặt) có mặt';
  RAISE NOTICE 'S11 OK — bất biến trigger bảo vệ cột';
END $$;

-- ---------------------------------------------------------------------
-- S11a. Báo hỏng & sửa chữa: SLA theo mức khẩn (settings), máy trạng thái, nhật ký bất biến, giới hạn quyền người báo (BR-FAC-05),
--       nghiệm thu, đề xuất chi phí → phiếu chi → chi phí thực, view LOG-xxxxxx / chi phí / SLA
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  v_vice uuid := '00000000-0000-7000-8000-0000000000a3';  v_treas uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_memvice uuid := '10000000-0000-7000-8000-0000000000a3';
  v_cat uuid; v_exp uuid; v_cash uuid; v_vendor uuid; v_i1 uuid; v_i2 uuid; v_i3 uuid; v_x uuid; v_v uuid;
  v_total bigint; v_cash_before bigint; r record;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_cat FROM categories WHERE kind = 'maintenance' AND code = 'MAINT_ELEC';
  SELECT id INTO v_exp FROM categories WHERE kind = 'expense' AND code = 'REPAIR';
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';

  -- ===== SLA lấy từ cấu hình theo từng mức khẩn (không hard-code) =====
  PERFORM app_test.as_user(v_m1);
  FOR r IN SELECT u.u AS urgency, app.setting_int('facility.sla_hours.' || u.u) AS hours FROM unnest(ARRAY['low', 'medium', 'high', 'critical']) AS u(u) LOOP
    INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id, urgency)
    VALUES ('Thử SLA mức ' || r.urgency, v_cat, 'Hành lang T2', v_mem1, r.urgency::urgency_t) RETURNING id INTO v_x;
    ASSERT (SELECT sla_due_at - created_at FROM maintenance_issues WHERE id = v_x) = make_interval(hours => r.hours::int),
      'SLA mức ' || r.urgency || ' = ' || r.hours || ' giờ theo settings facility.sla_hours.*';
  END LOOP;
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error($q$UPDATE settings SET value = '0'::jsonb WHERE key = 'facility.sla_hours.high'$q$, 'ngoài giới hạn');
  UPDATE settings SET value = '12'::jsonb WHERE key = 'facility.sla_hours.high';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id, urgency)
  VALUES ('Thử đổi SLA mức Gấp', v_cat, 'Hành lang T2', v_mem1, 'high') RETURNING id INTO v_x;
  ASSERT (SELECT sla_due_at - created_at FROM maintenance_issues WHERE id = v_x) = interval '12 hours', 'đổi settings ⇒ SLA mới tính theo 12 giờ';
  PERFORM app_test.as_super();
  UPDATE settings SET value = '24'::jsonb WHERE key = 'facility.sla_hours.high';

  -- ===== Tạo phiếu: ràng buộc dữ liệu & danh tính người báo =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id) VALUES ('Báo hộ người khác', %L, 'Bếp', %L)$q$, v_cat, v_mem2), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO maintenance_issues (title, category_id, reporter_member_id) VALUES ('Thiếu vị trí', %L, %L)$q$, v_cat, v_mem1), 'ck_maintenance_issues__location');
  PERFORM app_test.expect_error(format($q$INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id) VALUES ('ab', %L, 'Bếp', %L)$q$, v_cat, v_mem1), 'ck_maintenance_issues__title');
  PERFORM app_test.expect_error(format($q$INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id) VALUES ('Sai loại danh mục', %L, 'Bếp', %L)$q$, v_exp, v_mem1), 'fk_maintenance_issues__category');
  PERFORM app_test.expect_error(format($q$INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id, status) VALUES ('Tạo sẵn ở trạng thái xong', %L, 'Bếp', %L, 'done')$q$, v_cat, v_mem1), 'Trạng thái khởi tạo không hợp lệ');
  INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id, urgency, description)
  VALUES ('Bóng đèn hành lang T2 cháy', v_cat, 'Hành lang T2', v_mem1, 'high', 'Tối om, dễ vấp ngã') RETURNING id INTO v_i1;
  ASSERT (SELECT code FROM v_issue_sla WHERE issue_id = v_i1) = 'LOG-' || lpad((SELECT issue_no::text FROM maintenance_issues WHERE id = v_i1), 6, '0'), 'mã hiển thị LOG-xxxxxx suy ra từ issue_no';
  ASSERT (SELECT count(*) FROM issue_status_history WHERE issue_id = v_i1 AND from_status IS NULL AND to_status = 'new' AND changed_by = v_m1) = 1, 'nhật ký ghi trạng thái khởi tạo (NULL → new) kèm người báo';

  -- ===== Quyền xem: bảng báo hỏng công khai trong cộng đoàn; chỉ người báo/nhân sự sửa; phiên quên gắn user không thấy gì =====
  PERFORM app_test.as_super();
  SELECT count(*) INTO v_total FROM maintenance_issues;
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM maintenance_issues') = v_total, 'mọi thành viên xem được bảng báo hỏng chung';
  ASSERT app_test.rows_affected(format($q$UPDATE maintenance_issues SET description = 'sửa trộm' WHERE id = %L$q$, v_i1)) = 0, 'thành viên khác không sửa được phiếu của m1 (RLS)';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM maintenance_issues') = v_total, 'Admin kỹ thuật (issue.read) xem được bảng báo hỏng';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM maintenance_issues') = 0 AND app_test.n('SELECT 1 FROM v_issue_sla') = 0, 'phiên quên gắn user không thấy phiếu nào';

  -- ===== BR-FAC-05: người báo (không có issue.triage/issue.resolve) chỉ sửa nội dung hoặc hủy phiếu =====
  PERFORM app_test.as_user(v_m1);
  UPDATE maintenance_issues SET description = 'Tối om, dễ vấp ngã — có ảnh đính kèm' WHERE id = v_i1;
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'done' WHERE id = %L$q$, v_i1), 'BR-FAC-05');
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'in_progress' WHERE id = %L$q$, v_i1), 'BR-FAC-05');
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET sla_due_at = now() + interval '1 year' WHERE id = %L$q$, v_i1), 'BR-FAC-05');
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET verified_by = %L, verified_at = now() WHERE id = %L$q$, v_m1, v_i1), 'BR-FAC-05');
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET reporter_member_id = %L WHERE id = %L$q$, v_mem2, v_i1), 'Không đổi người báo');

  -- ===== Máy trạng thái + nhật ký (nhân sự xử lý: Phó nhà có issue.triage/issue.resolve) =====
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'done' WHERE id = %L$q$, v_i1), 'Chuyển trạng thái không hợp lệ');
  UPDATE maintenance_issues SET status = 'in_progress' WHERE id = v_i1;
  ASSERT (SELECT accepted_at FROM maintenance_issues WHERE id = v_i1) IS NOT NULL, 'nhận xử lý ⇒ ghi accepted_at';
  PERFORM set_config('app.status_reason', 'Chờ thợ điện mang linh kiện', true);
  UPDATE maintenance_issues SET status = 'waiting_parts' WHERE id = v_i1;
  PERFORM set_config('app.status_reason', '', true);
  UPDATE maintenance_issues SET status = 'in_progress' WHERE id = v_i1;
  ASSERT (SELECT reason FROM issue_status_history WHERE issue_id = v_i1 AND to_status = 'waiting_parts') = 'Chờ thợ điện mang linh kiện', 'lý do chuyển trạng thái lưu vào nhật ký';
  -- phân công: đúng một trong hai (thành viên | thợ ngoài)
  INSERT INTO vendors (name, trade, phone_e164) VALUES ('Thợ điện Sáu', 'Điện dân dụng', '+84903112451') RETURNING id INTO v_vendor;
  PERFORM app_test.expect_error($q$INSERT INTO vendors (name, phone_e164) VALUES ('Thợ sai số', '0903112451')$q$, 'ck_vendors__phone');
  INSERT INTO issue_assignments (issue_id, assignee_member_id, assigned_by) VALUES (v_i1, v_memvice, v_vice);
  INSERT INTO issue_assignments (issue_id, vendor_id, role_label, assigned_by) VALUES (v_i1, v_vendor, 'helper', v_vice);
  PERFORM app_test.expect_error(format($q$INSERT INTO issue_assignments (issue_id, assignee_member_id, vendor_id) VALUES (%L, %L, %L)$q$, v_i1, v_memvice, v_vendor), 'ck_issue_assignments__one_assignee');
  PERFORM app_test.expect_error(format($q$INSERT INTO issue_assignments (issue_id) VALUES (%L)$q$, v_i1), 'ck_issue_assignments__one_assignee');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO issue_assignments (issue_id, assignee_member_id) VALUES (%L, %L)$q$, v_i1, v_mem1), 'row-level security');
  ASSERT app_test.n('SELECT 1 FROM vendors') = 0, 'thành viên thường không thấy danh bạ thợ ngoài';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n('SELECT 1 FROM vendors') >= 1, 'Phó nhà thấy danh bạ thợ';

  -- ===== Đề xuất chi phí sửa chữa → phiếu chi nháp liên kết sự cố + dòng dự toán =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_propose_repair_expense(%L, 180000, 'Thay bóng LED + công thợ', %L, %L)$q$, v_i1, v_exp, v_cash), 'Không có quyền đề xuất chi phí sửa chữa');
  PERFORM app_test.as_user(v_vice);
  v_v := app.fn_propose_repair_expense(v_i1, 180000, 'Thay bóng LED + công thợ', v_exp, v_cash, v_vendor);
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v) = 'draft' AND (SELECT maintenance_issue_id FROM expense_vouchers WHERE id = v_v) = v_i1
     AND (SELECT requested_by FROM expense_vouchers WHERE id = v_v) = v_vice AND (SELECT payee_name FROM expense_vouchers WHERE id = v_v) = 'Thợ điện Sáu', 'phiếu chi nháp liên kết sự cố, người đề xuất = Phó nhà, người nhận = thợ';
  ASSERT (SELECT estimate_vnd FROM v_issue_costs WHERE issue_id = v_i1) = 180000 AND (SELECT actual_vnd FROM v_issue_costs WHERE issue_id = v_i1) = 0, 'mới có dự toán, chưa có chi phí thực';
  PERFORM app.fn_submit_expense(v_v);
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_decide_expense(v_v, 'approved', 'Đúng giá thị trường');
  ASSERT (SELECT count(*) FROM repair_costs WHERE issue_id = v_i1 AND cost_kind = 'actual') = 0, 'duyệt xong nhưng chưa chi ⇒ chưa có chi phí thực';
  v_cash_before := app.fn_fund_balance_at(v_cash, app.local_today());
  PERFORM app.fn_pay_expense(v_v, 'cash', app.local_today());
  ASSERT (SELECT count(*) FROM repair_costs WHERE issue_id = v_i1 AND cost_kind = 'actual' AND expense_voucher_id = v_v AND amount_vnd = 180000) = 1, 'chi xong ⇒ tự ghi một dòng chi phí thực gắn phiếu chi';
  ASSERT (SELECT estimate_vnd FROM v_issue_costs WHERE issue_id = v_i1) = 180000 AND (SELECT actual_vnd FROM v_issue_costs WHERE issue_id = v_i1) = 180000, 'v_issue_costs: dự toán 180.000 / thực 180.000 (không cộng nhầm hai khái niệm)';
  ASSERT app.fn_fund_balance_at(v_cash, app.local_today()) = v_cash_before - 180000, 'quỹ tiền mặt giảm đúng số đã chi';
  PERFORM app_test.expect_error(format($q$INSERT INTO repair_costs (issue_id, cost_kind, amount_vnd, description) VALUES (%L, 'estimate', 1000, 'Thủ quỹ tự ghi dự toán')$q$, v_i1), 'row-level security');
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$INSERT INTO repair_costs (issue_id, cost_kind, amount_vnd, description, expense_voucher_id) VALUES (%L, 'actual', 180000, 'Ghi trùng cùng phiếu chi', %L)$q$, v_i1, v_v), 'ux_repair_costs__voucher');
  -- Đảo phiếu chi đã chi ⇒ chi phí thực của sự cố cũng bị gỡ (không đếm tiền đã hoàn)
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_reverse_expense(v_v, 'Thợ hoàn tiền do bóng bị lỗi');
  ASSERT (SELECT count(*) FROM repair_costs WHERE issue_id = v_i1 AND cost_kind = 'actual') = 0 AND (SELECT actual_vnd FROM v_issue_costs WHERE issue_id = v_i1) = 0
     AND (SELECT estimate_vnd FROM v_issue_costs WHERE issue_id = v_i1) = 180000, 'đảo phiếu chi ⇒ chi phí thực về 0, dự toán giữ nguyên';
  ASSERT app.fn_fund_balance_at(v_cash, app.local_today()) = v_cash_before, 'quỹ trở lại như trước nhờ bút toán đảo';

  -- ===== Nghiệm thu: người báo hoặc người có issue.resolve =====
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_verify_issue(%L)$q$, v_i1), 'Chỉ xác nhận sự cố đã xong');
  UPDATE maintenance_issues SET status = 'done' WHERE id = v_i1;
  ASSERT (SELECT resolved_at FROM maintenance_issues WHERE id = v_i1) IS NOT NULL, 'đóng sự cố ⇒ ghi resolved_at';
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_verify_issue(%L)$q$, v_i1), 'Chỉ người báo hoặc người có quyền xử lý');
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_verify_issue(%L)$q$, v_i1), 'Chỉ người báo hoặc người có quyền xử lý');
  PERFORM app_test.as_worker();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_verify_issue(%L)$q$, v_i1), 'Chỉ người báo hoặc người có quyền xử lý');
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_verify_issue(v_i1);
  ASSERT (SELECT verified_by FROM maintenance_issues WHERE id = v_i1) = v_m1 AND (SELECT verified_at FROM maintenance_issues WHERE id = v_i1) IS NOT NULL, 'người báo xác nhận nghiệm thu';
  PERFORM app_test.as_user(v_vice);
  UPDATE maintenance_issues SET status = 'in_progress' WHERE id = v_i1;
  ASSERT (SELECT resolved_at IS NULL AND verified_at IS NULL AND verified_by IS NULL FROM maintenance_issues WHERE id = v_i1), 'mở lại sự cố ⇒ xóa mốc xong & nghiệm thu';
  UPDATE maintenance_issues SET status = 'done' WHERE id = v_i1;
  PERFORM app.fn_verify_issue(v_i1);
  ASSERT (SELECT verified_by FROM maintenance_issues WHERE id = v_i1) = v_vice, 'người có issue.resolve cũng nghiệm thu được';
  ASSERT (SELECT count(*) FROM issue_status_history WHERE issue_id = v_i1) = 7, 'nhật ký đủ 7 lần: khởi tạo, nhận, chờ vật tư, tiếp tục, xong, mở lại, xong';

  -- ===== Nhật ký trạng thái bất biến (kể cả với superuser); người dùng không ghi trực tiếp =====
  PERFORM app_test.expect_error(format($q$UPDATE issue_status_history SET reason = 'sửa' WHERE issue_id = %L$q$, v_i1), 'permission denied');
  PERFORM app_test.expect_error(format($q$INSERT INTO issue_status_history (issue_id, to_status) VALUES (%L, 'done')$q$, v_i1), 'permission denied');
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$UPDATE issue_status_history SET reason = 'sửa' WHERE issue_id = %L$q$, v_i1), 'bất biến');
  PERFORM app_test.expect_error(format($q$DELETE FROM issue_status_history WHERE issue_id = %L$q$, v_i1), 'bất biến');

  -- ===== Trùng lặp / hủy: trạng thái cuối; duplicate bắt buộc trỏ phiếu gốc =====
  PERFORM app_test.as_user(v_m2);
  INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id) VALUES ('Bóng đèn hành lang tầng hai không sáng', v_cat, 'Hành lang T2', v_mem2) RETURNING id INTO v_i2;
  PERFORM app_test.as_user(v_m3);
  INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id) VALUES ('Báo nhầm, tự khắc phục được', v_cat, 'Phòng 101', v_mem3) RETURNING id INTO v_i3;
  UPDATE maintenance_issues SET status = 'cancelled' WHERE id = v_i3;
  ASSERT (SELECT status FROM maintenance_issues WHERE id = v_i3) = 'cancelled', 'người báo tự hủy phiếu của mình (được phép)';
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'in_progress' WHERE id = %L$q$, v_i3), 'Chuyển trạng thái không hợp lệ');
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'duplicate' WHERE id = %L$q$, v_i2), 'ck_maintenance_issues__duplicate');
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'duplicate', duplicate_of_id = id WHERE id = %L$q$, v_i2), 'ck_maintenance_issues__not_self');
  UPDATE maintenance_issues SET status = 'duplicate', duplicate_of_id = v_i1 WHERE id = v_i2;
  PERFORM app_test.expect_error(format($q$UPDATE maintenance_issues SET status = 'new' WHERE id = %L$q$, v_i2), 'Chuyển trạng thái không hợp lệ');

  -- ===== SLA: quá hạn khi còn mở thì cảnh báo; đã xong thì không =====
  PERFORM app_test.as_super();
  INSERT INTO maintenance_issues (title, category_id, location_text, reporter_member_id, urgency) VALUES ('Vòi sen rò nước nặng', v_cat, 'WC tầng 2', v_mem1, 'critical') RETURNING id INTO v_x;
  UPDATE maintenance_issues SET sla_due_at = now() - interval '1 hour' WHERE id = v_x;
  PERFORM app_test.as_user(v_head);
  ASSERT (SELECT sla_breached FROM v_issue_sla WHERE issue_id = v_x) AND NOT (SELECT sla_breached FROM v_issue_sla WHERE issue_id = v_i1), 'phiếu mở quá hạn SLA bị đánh dấu; phiếu đã xong thì không';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11a OK — báo hỏng & sửa chữa';
END $$;

-- ---------------------------------------------------------------------
-- S11b. Tài sản & mượn đồ: mã tài sản duy nhất, đồ cho mượn, chống mượn chồng (exclusion), trả đồ một chiều, lịch bảo trì
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_prj uuid; v_ladder uuid; v_table uuid; v_spk uuid; v_loan uuid; v_loan2 uuid;
BEGIN
  PERFORM app_test.as_super();
  PERFORM app_test.as_user(v_vice);
  -- Ràng buộc dữ liệu tài sản
  INSERT INTO assets (asset_tag, name, asset_type, is_loanable, purchase_date, purchase_cost_vnd, warranty_until)
  VALUES ('PRJ-001', 'Máy chiếu Epson EB-X06', 'audio_visual', true, app.local_today() - 400, 8500000, app.local_today() + 300) RETURNING id INTO v_prj;
  INSERT INTO assets (asset_tag, name, asset_type, is_loanable) VALUES ('LAD-001', 'Thang nhôm 3 m', 'tool', true) RETURNING id INTO v_ladder;
  INSERT INTO assets (asset_tag, name, asset_type, is_loanable) VALUES ('TBL-101', 'Bàn học phòng 101', 'furniture', false) RETURNING id INTO v_table;
  INSERT INTO assets (asset_tag, name, asset_type, is_loanable, status) VALUES ('SPK-001', 'Loa kéo (đang sửa)', 'audio_visual', true, 'under_repair') RETURNING id INTO v_spk;
  PERFORM app_test.expect_error($q$INSERT INTO assets (asset_tag, name, asset_type) VALUES ('prj1', 'Sai định dạng mã', 'tool')$q$, 'ck_assets__tag');
  PERFORM app_test.expect_error($q$INSERT INTO assets (asset_tag, name, asset_type) VALUES ('ABC-001', 'Loại không có trong danh mục', 'weapon')$q$, 'ck_assets__type');
  PERFORM app_test.expect_error($q$INSERT INTO assets (asset_tag, name, asset_type, purchase_cost_vnd) VALUES ('ABC-002', 'Giá âm', 'tool', -1)$q$, 'ck_assets__cost');
  PERFORM app_test.expect_error(format($q$INSERT INTO assets (asset_tag, name, asset_type, purchase_date, warranty_until) VALUES ('ABC-003', 'Bảo hành trước ngày mua', 'tool', %L, %L)$q$, app.local_today(), app.local_today() - 1), 'ck_assets__warranty');
  PERFORM app_test.expect_error($q$INSERT INTO assets (asset_tag, name, asset_type) VALUES ('PRJ-001', 'Trùng mã nhãn dán', 'audio_visual')$q$, 'ux_assets__asset_tag');
  UPDATE assets SET deleted_at = now() WHERE id = v_table;
  INSERT INTO assets (asset_tag, name, asset_type) VALUES ('TBL-101', 'Bàn học phòng 101 (mới)', 'furniture');   -- mã của tài sản đã xóa mềm được dùng lại
  -- Lịch bảo trì định kỳ: next_due_on sinh tự động = ngày neo + chu kỳ
  INSERT INTO asset_maintenance_schedules (asset_id, task, interval_days) VALUES (v_prj, 'Vệ sinh lọc bụi máy chiếu', 180);
  ASSERT (SELECT next_due_on FROM asset_maintenance_schedules WHERE asset_id = v_prj) = app.local_today() + 180, 'next_due_on = anchor_on + interval_days';
  PERFORM app_test.expect_error(format($q$INSERT INTO asset_maintenance_schedules (asset_id, task, interval_days) VALUES (%L, 'Chu kỳ quá ngắn', 3)$q$, v_prj), 'ck_asset_maintenance_schedules__interval');
  -- Thành viên thường xem được sổ tài sản nhưng không sửa được
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM assets') >= 3, 'thành viên xem được sổ tài sản (asset.read)';
  PERFORM app_test.expect_error($q$INSERT INTO assets (asset_tag, name, asset_type) VALUES ('XXX-001', 'Tự thêm tài sản', 'tool')$q$, 'row-level security');
  ASSERT app_test.rows_affected(format($q$UPDATE assets SET name = 'Đổi tên trộm' WHERE id = %L$q$, v_prj)) = 0, 'thành viên không sửa được tài sản (RLS)';

  -- ===== Mượn đồ (BR-FAC-06): chỉ đồ cho mượn + đang sử dụng; người mượn là thành viên đang ở =====
  PERFORM app_test.expect_error(format($q$INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (%L, %L, now() + interval '2 days')$q$, v_spk, v_mem1), 'BR-FAC-06');
  PERFORM app_test.as_user(v_vice);
  UPDATE assets SET is_loanable = false WHERE id = v_ladder;
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (%L, %L, now() + interval '2 days')$q$, v_ladder, v_mem1), 'BR-FAC-06');
  PERFORM app_test.as_user(v_vice);
  UPDATE assets SET is_loanable = true WHERE id = v_ladder;
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (%L, %L, now() + interval '2 days')$q$, v_prj, v_mem2), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (%L, %L, now() + interval '40 days')$q$, v_prj, v_mem1), 'ck_asset_loans__due');
  INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (v_prj, v_mem1, now() + interval '2 days') RETURNING id INTO v_loan;
  -- Một tài sản chỉ có một người mượn tại mỗi thời điểm
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (%L, %L, now() + interval '1 day')$q$, v_prj, v_mem2), 'ex_asset_loans__one_borrower');
  INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (v_ladder, v_mem2, now() + interval '1 day');   -- đồ khác thì mượn được
  ASSERT app_test.rows_affected(format($q$UPDATE asset_loans SET status = 'returned', returned_at = now() WHERE id = %L$q$, v_loan)) = 0, 'm2 không "trả hộ" khoản mượn của m1 (RLS)';
  -- Trả đồ: bắt buộc có thời điểm trả; trả xong thì người khác mượn được; khoản đã trả không mở lại được
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE asset_loans SET status = 'returned' WHERE id = %L$q$, v_loan), 'ck_asset_loans__returned');
  UPDATE asset_loans SET status = 'returned', returned_at = now(), condition_note = 'Nguyên vẹn' WHERE id = v_loan;
  PERFORM app_test.expect_error(format($q$UPDATE asset_loans SET status = 'open', returned_at = NULL WHERE id = %L$q$, v_loan), 'Chuyển trạng thái không hợp lệ');
  PERFORM app_test.as_user(v_m2);
  INSERT INTO asset_loans (asset_id, borrower_member_id, due_at) VALUES (v_prj, v_mem2, now() + interval '1 day') RETURNING id INTO v_loan2;
  -- Thất lạc: do người có asset.manage đánh dấu; trạng thái cuối
  PERFORM app_test.as_user(v_vice);
  UPDATE asset_loans SET status = 'lost' WHERE id = v_loan2;
  PERFORM app_test.expect_error(format($q$UPDATE asset_loans SET status = 'returned', returned_at = now() WHERE id = %L$q$, v_loan2), 'Chuyển trạng thái không hợp lệ');
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM assets') = 0 AND app_test.n('SELECT 1 FROM asset_loans') = 0, 'phiên quên gắn user không thấy tài sản/khoản mượn';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11b OK — tài sản & mượn đồ';
END $$;

-- ---------------------------------------------------------------------
-- S11c. Đặt lịch giặt: khung giờ/quota/đặt trước theo settings (BR-LAU-01..05), chống đặt trùng, hủy/check-in, no-show do worker, danh sách chờ
-- ---------------------------------------------------------------------
-- Khung giờ thứ idx của một ngày (giờ VN) theo settings laundry.slots — để bài kiểm thử đúng với mọi cấu hình
CREATE FUNCTION app_test.lslot(p_date date, p_idx integer) RETURNS TABLE (s timestamptz, e timestamptz) LANGUAGE sql STABLE AS $$
  SELECT ((p_date + (x ->> 0)::time) AT TIME ZONE 'Asia/Ho_Chi_Minh'), ((p_date + (x ->> 1)::time) AT TIME ZONE 'Asia/Ho_Chi_Minh')
    FROM jsonb_array_elements(app.setting_json('laundry.slots')) WITH ORDINALITY AS t(x, ord) WHERE ord = p_idx
$$;
CREATE FUNCTION app_test.book(p_machine uuid, p_member uuid, p_date date, p_idx integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_s timestamptz; v_e timestamptz; v_id uuid;
BEGIN
  SELECT l.s, l.e INTO v_s, v_e FROM app_test.lslot(p_date, p_idx) l;
  INSERT INTO laundry_bookings (machine_id, member_id, starts_at, ends_at) VALUES (p_machine, p_member, v_s, v_e) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION app_test.lslot(date, integer), app_test.book(uuid, uuid, date, integer) TO luuxa_app, luuxa_worker;

DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_aqua uuid; v_elx uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid;
  v_mon date := date_trunc('week', app.local_today() + 7)::date;      -- thứ Hai tuần sau: cả tuần nằm trong 14 ngày đặt trước, không phụ thuộc hôm nay là thứ mấy
  v_s timestamptz; v_e timestamptz; v_b1 uuid; v_b2 uuid; v_b3 uuid; v_bm2 uuid; v_cnt bigint; v_w uuid; v_n integer;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_aqua FROM laundry_machines WHERE code = 'AQUA9';
  SELECT id INTO v_elx FROM laundry_machines WHERE code = 'ELX';
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error($q$INSERT INTO laundry_machines (code, name) VALUES ('máy giặt', 'Mã sai định dạng')$q$, 'ck_laundry_machines__code');
  INSERT INTO laundry_machines (code, name) VALUES ('T_M1', 'Máy thử 1') RETURNING id INTO v_t1;
  INSERT INTO laundry_machines (code, name) VALUES ('T_M2', 'Máy thử 2') RETURNING id INTO v_t2;
  INSERT INTO laundry_machines (code, name) VALUES ('T_M3', 'Máy thử 3') RETURNING id INTO v_t3;
  INSERT INTO laundry_machines (code, name) VALUES ('T_M4', 'Máy thử 4') RETURNING id INTO v_t4;
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error($q$INSERT INTO laundry_machines (code, name) VALUES ('T_M9', 'Thành viên tự thêm máy')$q$, 'row-level security');

  -- ===== BR-LAU-01: đúng khung giờ cấu hình; chống đặt trùng bằng exclusion constraint =====
  v_b1 := app_test.book(v_aqua, v_mem1, v_mon, 1);
  ASSERT (SELECT lower(during) = starts_at AND upper(during) = ends_at FROM laundry_bookings WHERE id = v_b1), 'cột during sinh từ starts_at/ends_at';
  SELECT l.s, l.e INTO v_s, v_e FROM app_test.lslot(v_mon, 1) l;
  PERFORM app_test.expect_error(format($q$INSERT INTO laundry_bookings (machine_id, member_id, starts_at, ends_at) VALUES (%L, %L, %L, %L)$q$, v_aqua, v_mem1, v_s + interval '1 hour', v_e + interval '1 hour'), 'BR-LAU-01');
  PERFORM app_test.expect_error(format($q$INSERT INTO laundry_bookings (machine_id, member_id, starts_at, ends_at) VALUES (%L, %L, %L, %L)$q$, v_aqua, v_mem1, v_s, v_e + interval '2 hours'), 'BR-LAU-01');
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 1)$q$, v_aqua, v_mem2, v_mon), 'ex_laundry_bookings__no_overlap');
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 1)$q$, v_elx, v_mem1, v_mon), 'row-level security');
  v_bm2 := app_test.book(v_elx, v_mem2, v_mon, 1);   -- cùng khung giờ nhưng máy khác: được
  PERFORM app_test.as_user(v_m3);
  PERFORM app_test.book(v_elx, v_mem3, v_mon + 4, 1);
  PERFORM app_test.book(v_elx, v_mem3, v_mon + 4, 2);   -- hai khung liền kề cùng máy (nửa mở [) không chồng nhau)
  -- Gửi lại cùng client_request_id (mạng yếu): ON CONFLICT DO NOTHING không tạo lượt thứ hai và không báo lỗi
  PERFORM app_test.as_user(v_m4);
  SELECT l.s, l.e INTO v_s, v_e FROM app_test.lslot(v_mon + 4, 4) l;
  v_cnt := 0;
  FOR v_n IN 1..2 LOOP
    INSERT INTO laundry_bookings (machine_id, member_id, starts_at, ends_at, client_request_id) VALUES (v_t1, v_mem4, v_s, v_e, '7c0a4a52-0000-4000-8000-000000000011')
    ON CONFLICT (member_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
  END LOOP;
  ASSERT v_cnt = 0 AND (SELECT count(*) FROM laundry_bookings WHERE client_request_id = '7c0a4a52-0000-4000-8000-000000000011') = 1, 'bấm đúp/retry cùng client_request_id không tạo lượt thứ hai';

  -- ===== BR-LAU-03: hạn mức lượt/tuần; hủy lượt thì trả hạn mức =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.book(v_aqua, v_mem1, v_mon + 1, 2);
  v_b3 := app_test.book(v_aqua, v_mem1, v_mon + 2, 3);
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 3)$q$, v_aqua, v_mem1, v_mon + 3), 'BR-LAU-03');
  UPDATE laundry_bookings SET status = 'cancelled', cancel_reason = 'Đổi lịch' WHERE id = v_b3;
  ASSERT (SELECT cancelled_at IS NOT NULL FROM laundry_bookings WHERE id = v_b3), 'hủy lượt ⇒ ghi cancelled_at';
  PERFORM app_test.book(v_aqua, v_mem1, v_mon + 3, 3);
  -- khung giờ vừa hủy đặt lại được (exclusion chỉ tính lượt booked/checked_in)
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.book(v_aqua, v_mem2, v_mon + 2, 3);

  -- ===== BR-LAU-02: không đặt quá khứ / quá xa; BR-LAU-01..: máy phải hoạt động, người đặt phải đang ở =====
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 3)$q$, v_t2, v_mem4, app.local_today() - 1), 'BR-LAU-02');
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 3)$q$, v_t2, v_mem4, app.local_today() + 20), 'BR-LAU-02');
  PERFORM app_test.as_super();
  UPDATE laundry_machines SET status = 'maintenance' WHERE id = v_t2;
  UPDATE members SET status = 'on_leave' WHERE id = v_mem4;
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 3)$q$, v_t2, v_mem4, v_mon + 5), 'Máy giặt không hoạt động');
  PERFORM app_test.expect_error(format($q$SELECT app_test.book(%L, %L, %L, 3)$q$, v_t3, v_mem4, v_mon + 5), 'Chỉ thành viên đang ở');
  PERFORM app_test.as_super();
  UPDATE laundry_machines SET status = 'active' WHERE id = v_t2;
  UPDATE members SET status = 'active' WHERE id = v_mem4;

  -- ===== BR-LAU-05: không tự đổi máy/khung giờ/người đặt của lượt đã đặt (hủy và đặt lại); nhân sự quản lý được điều chỉnh =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day' WHERE id = %L$q$, v_b1), 'BR-LAU-05');
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET machine_id = %L WHERE id = %L$q$, v_t4, v_b1), 'BR-LAU-05');
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET member_id = %L WHERE id = %L$q$, v_mem2, v_b1), 'BR-LAU-05');
  UPDATE laundry_bookings SET cancel_reason = 'Ghi chú thêm' WHERE id = v_b1;
  PERFORM app_test.as_user(v_vice);
  UPDATE laundry_bookings SET machine_id = v_t4 WHERE id = v_b1;
  ASSERT (SELECT machine_id FROM laundry_bookings WHERE id = v_b1) = v_t4, 'người có laundry.manage được chuyển máy cho thành viên';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE laundry_bookings SET status = 'cancelled', cancel_reason = 'Hủy hộ' WHERE id = %L$q$, v_b1)) = 0, 'thành viên khác không hủy hộ lượt của m1 (RLS)';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM laundry_bookings') = 0 AND app_test.n('SELECT 1 FROM laundry_machines') = 0, 'phiên quên gắn user không thấy lịch giặt';

  -- ===== Hủy muộn (BR-LAU-04), check-in, hoàn tất =====
  PERFORM app_test.as_super();
  v_b2 := app_test.book(v_t1, v_mem2, v_mon + 5, 1);   -- dựng lượt rồi dịch giờ sang sát hiện tại (superuser không bị chặn BR-LAU-05)
  UPDATE laundry_bookings SET starts_at = now() + interval '20 minutes', ends_at = now() + interval '80 minutes' WHERE id = v_b2;
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET status = 'cancelled' WHERE id = %L$q$, v_b2), 'BR-LAU-04');
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET status = 'checked_in' WHERE id = %L$q$, v_b2), 'Chưa đến giờ bắt đầu');
  PERFORM app_test.as_super();
  UPDATE laundry_bookings SET starts_at = now() - interval '5 minutes', ends_at = now() + interval '115 minutes' WHERE id = v_b2;
  PERFORM app_test.as_user(v_m2);
  UPDATE laundry_bookings SET status = 'checked_in' WHERE id = v_b2;
  ASSERT (SELECT checked_in_at IS NOT NULL FROM laundry_bookings WHERE id = v_b2), 'check-in ghi checked_in_at';
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET status = 'cancelled' WHERE id = %L$q$, v_b2), 'Chuyển trạng thái không hợp lệ');
  UPDATE laundry_bookings SET status = 'completed' WHERE id = v_b2;
  PERFORM app_test.expect_error(format($q$UPDATE laundry_bookings SET status = 'booked' WHERE id = %L$q$, v_b2), 'Chuyển trạng thái không hợp lệ');
  -- Quản lý hủy lượt sát giờ được (laundry.manage không bị giới hạn BR-LAU-04)
  PERFORM app_test.as_super();
  v_b2 := app_test.book(v_t3, v_mem3, v_mon + 5, 2);
  UPDATE laundry_bookings SET starts_at = now() + interval '10 minutes', ends_at = now() + interval '70 minutes' WHERE id = v_b2;
  PERFORM app_test.as_user(v_admin);
  UPDATE laundry_bookings SET status = 'cancelled', cancel_reason = 'Máy hỏng đột xuất' WHERE id = v_b2;
  ASSERT (SELECT status FROM laundry_bookings WHERE id = v_b2) = 'cancelled', 'Admin (laundry.manage) hủy lượt sát giờ';

  -- ===== No-show do worker: quá laundry.noshow_cancel_minutes mà chưa check-in ⇒ no_show; luuxa_app không gọi được =====
  PERFORM app_test.as_super();
  v_b2 := app_test.book(v_t1, v_mem4, v_mon + 6, 1);   -- trễ 30 phút ⇒ no_show
  UPDATE laundry_bookings SET starts_at = now() - interval '30 minutes', ends_at = now() + interval '90 minutes' WHERE id = v_b2;
  v_b3 := app_test.book(v_t2, v_mem4, v_mon + 6, 2);   -- mới trễ 5 phút ⇒ chưa đụng tới
  UPDATE laundry_bookings SET starts_at = now() - interval '5 minutes', ends_at = now() + interval '115 minutes' WHERE id = v_b3;
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error('SELECT app.fn_expire_laundry_noshows()', 'permission denied');
  PERFORM app_test.as_worker();
  ASSERT app.fn_expire_laundry_noshows() = 1, 'job no-show chỉ hủy đúng 1 lượt quá hạn';
  ASSERT (SELECT status FROM laundry_bookings WHERE id = v_b2) = 'no_show' AND (SELECT cancelled_at IS NOT NULL AND cancel_reason LIKE 'Tự động%' FROM laundry_bookings WHERE id = v_b2), 'lượt trễ 30 phút ⇒ no_show kèm lý do tự động';
  ASSERT (SELECT status FROM laundry_bookings WHERE id = v_b3) = 'booked', 'lượt mới trễ 5 phút vẫn giữ nguyên';
  ASSERT app.fn_expire_laundry_noshows() = 0, 'chạy lại không hủy thêm (idempotent)';

  -- ===== Danh sách chờ: kín máy ⇒ vẫn waiting; có người hủy ⇒ worker chuyển offered =====
  PERFORM app_test.as_super();
  UPDATE laundry_machines SET status = 'retired' WHERE code LIKE 'T\_M%';     -- chỉ còn AQUA9 + ELX là máy hoạt động
  PERFORM app_test.as_user(v_m3);
  v_b3 := app_test.book(v_elx, v_mem3, v_mon + 1, 2);   -- AQUA9 (m1) + ELX (m3) cùng kín khung thứ Ba
  PERFORM app_test.as_user(v_m4);
  SELECT l.s, l.e INTO v_s, v_e FROM app_test.lslot(v_mon + 1, 2) l;
  INSERT INTO laundry_waitlist (member_id, starts_at, ends_at) VALUES (v_mem4, v_s, v_e) RETURNING id INTO v_w;
  PERFORM app_test.expect_error(format($q$INSERT INTO laundry_waitlist (member_id, starts_at, ends_at) VALUES (%L, %L, %L)$q$, v_mem4, v_s, v_e), 'ux_laundry_waitlist__member_slot');
  PERFORM app_test.expect_error(format($q$INSERT INTO laundry_waitlist (member_id, starts_at, ends_at) VALUES (%L, %L, %L)$q$, v_mem1, v_s, v_e), 'row-level security');
  PERFORM app_test.as_worker();
  PERFORM app.fn_expire_laundry_noshows();
  ASSERT (SELECT status FROM laundry_waitlist WHERE id = v_w) = 'waiting', 'cả hai máy còn bị chiếm ⇒ vẫn chờ';
  PERFORM app_test.as_user(v_m3);
  UPDATE laundry_bookings SET status = 'cancelled', cancel_reason = 'Bận đột xuất' WHERE id = v_b3;
  PERFORM app_test.as_worker();
  PERFORM app.fn_expire_laundry_noshows();
  ASSERT (SELECT status FROM laundry_waitlist WHERE id = v_w) = 'offered' AND (SELECT offered_at IS NOT NULL FROM laundry_waitlist WHERE id = v_w), 'có máy trống ⇒ worker chuyển người chờ sang offered';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM laundry_waitlist') = 0, 'danh sách chờ chỉ chủ nhân và người quản lý thấy';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM laundry_waitlist') >= 1, 'Admin (laundry.manage) thấy danh sách chờ';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11c OK — đặt lịch giặt';
END $$;

-- ---------------------------------------------------------------------
-- S11d. Thông báo: quyền soạn/ghim (BR-COM-06), đối tượng nhận, đã đọc/xác nhận theo từng người, mẫu số thống kê, bản nháp, hết hạn
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_treas uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_memvice uuid := '10000000-0000-7000-8000-0000000000a3';
  v_cat uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_a5 uuid; v_a6 uuid; v_room uuid; v_floor uuid; v_active bigint; v_exp bigint;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_cat FROM categories WHERE kind = 'announcement' AND code = 'ANN_URGENT';
  SELECT count(*) INTO v_active FROM members WHERE status = 'active' AND deleted_at IS NULL;

  -- ===== Ai được soạn / ghim =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO announcements (title, content, category_id, author_member_id) VALUES ('Tự đăng thông báo', 'x', %L, %L)$q$, v_cat, v_mem1), 'row-level security');
  PERFORM app_test.as_user(v_m2);       -- m2 là Trưởng ban Phụng vụ: có announcement.create nhưng KHÔNG có announcement.pin
  INSERT INTO announcements (title, content, category_id, author_member_id) VALUES ('Giờ kinh tối thứ Năm đổi sang 20h45', 'Từ tuần này giờ kinh tối lùi 15 phút.', v_cat, v_mem2) RETURNING id INTO v_a1;
  ASSERT (SELECT published_at IS NOT NULL AND pinned_until IS NULL AND NOT is_pinned AND NOT requires_ack FROM announcements WHERE id = v_a1), 'đăng ⇒ published_at tự ghi; không ghim, không bắt xác nhận';
  PERFORM app_test.expect_error(format($q$UPDATE announcements SET is_pinned = true WHERE id = %L$q$, v_a1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE announcements SET requires_ack = true, ack_deadline = now() + interval '1 day' WHERE id = %L$q$, v_a1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO announcements (title, content, category_id, author_member_id, is_pinned) VALUES ('Tự ghim', 'x', %L, %L, true)$q$, v_cat, v_mem2), 'BR-COM-06');
  UPDATE announcements SET content = 'Từ tuần này giờ kinh tối lùi 15 phút (20h45).' WHERE id = v_a1;   -- sửa nội dung của chính mình: được
  PERFORM app_test.as_user(v_vice);     -- Phó nhà có announcement.pin
  PERFORM app_test.expect_error(format($q$INSERT INTO announcements (title, content, category_id, author_member_id, requires_ack) VALUES ('Thiếu hạn xác nhận', 'x', %L, %L, true)$q$, v_cat, v_memvice), 'ck_announcements__ack');
  INSERT INTO announcements (title, content, category_id, author_member_id, requires_ack, ack_deadline, is_pinned)
  VALUES ('Họp nhà khẩn tối nay', 'Họp lúc 20h tại phòng sinh hoạt chung.', v_cat, v_memvice, true, now() + interval '2 days', true) RETURNING id INTO v_a2;
  ASSERT (SELECT pinned_until - published_at FROM announcements WHERE id = v_a2) = interval '14 days', 'ghim mà không đặt hạn ⇒ tự đặt 14 ngày';
  UPDATE announcements SET is_pinned = false WHERE id = v_a2;
  ASSERT (SELECT pinned_until IS NULL FROM announcements WHERE id = v_a2), 'bỏ ghim ⇒ xóa pinned_until';
  UPDATE announcements SET is_pinned = true WHERE id = v_a2;

  -- ===== Đã đọc / xác nhận THEO TỪNG NGƯỜI =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_mark_announcement_read(v_a2);
  PERFORM app.fn_mark_announcement_read(v_a2);
  ASSERT (SELECT count(*) FROM announcement_reads WHERE announcement_id = v_a2) = 1, 'đọc nhiều lần vẫn một dòng (idempotent)';
  ASSERT (SELECT acknowledged_at IS NULL FROM announcement_reads WHERE announcement_id = v_a2), 'chỉ đọc chưa xác nhận';
  PERFORM app.fn_mark_announcement_read(v_a2, true);
  ASSERT (SELECT acknowledged_at IS NOT NULL FROM announcement_reads WHERE announcement_id = v_a2), 'xác nhận đã đọc ghi acknowledged_at';
  PERFORM app_test.as_super();
  UPDATE announcement_reads SET read_at = now() - interval '2 hours', acknowledged_at = now() - interval '1 hour' WHERE announcement_id = v_a2;
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_mark_announcement_read(v_a2, true);
  ASSERT (SELECT acknowledged_at FROM announcement_reads WHERE announcement_id = v_a2) = now() - interval '1 hour', 'xác nhận lại không ghi đè thời điểm xác nhận đầu tiên';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_mark_announcement_read(%L, true)$q$, v_a1), 'không yêu cầu xác nhận');
  PERFORM app_test.as_user(v_m2);
  PERFORM app.fn_mark_announcement_read(v_a2);
  ASSERT app_test.n('SELECT 1 FROM announcement_reads') = 1, 'm2 chỉ thấy lượt đọc của chính mình';
  PERFORM app_test.expect_error(format($q$INSERT INTO announcement_reads (announcement_id, member_id) VALUES (%L, %L)$q$, v_a1, v_mem1), 'row-level security');
  ASSERT app_test.rows_affected(format($q$UPDATE announcement_reads SET acknowledged_at = now() WHERE member_id = %L$q$, v_mem1)) = 0, 'm2 không xác nhận hộ m1 (RLS)';
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_mark_announcement_read(%L)$q$, v_a2), 'Chưa đăng nhập bằng tài khoản thành viên');
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_mark_announcement_read(%L)$q$, v_a2), 'Chưa đăng nhập bằng tài khoản thành viên');
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n(format('SELECT 1 FROM announcement_reads WHERE announcement_id = %L', v_a2)) = 2, 'người có announcement.pin thấy mọi lượt đọc của thông báo';
  ASSERT (SELECT target_count FROM v_announcement_read_stats WHERE announcement_id = v_a2) = v_active
     AND (SELECT read_count FROM v_announcement_read_stats WHERE announcement_id = v_a2) = 2
     AND (SELECT ack_count FROM v_announcement_read_stats WHERE announcement_id = v_a2) = 1, 'thống kê: mẫu số = mọi thành viên đang ở (' || v_active || '), đã đọc 2, đã xác nhận 1';

  -- ===== Đối tượng nhận: thành viên / vai trò / phòng / tầng; không có dòng = toàn thể =====
  PERFORM app_test.as_user(v_vice);
  INSERT INTO announcements (title, content, category_id, author_member_id) VALUES ('Nhắn riêng m3', 'Lên gặp Phó nhà.', v_cat, v_memvice) RETURNING id INTO v_a3;
  INSERT INTO announcement_targets (announcement_id, member_id) VALUES (v_a3, v_mem3);
  PERFORM app_test.expect_error(format($q$INSERT INTO announcement_targets (announcement_id, member_id, room_id) VALUES (%L, %L, (SELECT id FROM rooms LIMIT 1))$q$, v_a3, v_mem1), 'ck_announcement_targets__one');
  INSERT INTO announcements (title, content, category_id, author_member_id) VALUES ('Nhắc Thủ quỹ chốt sổ', 'Đối soát sao kê trước ngày 5.', v_cat, v_memvice) RETURNING id INTO v_a4;
  INSERT INTO announcement_targets (announcement_id, role_id) SELECT v_a4, id FROM roles WHERE code = 'treasurer';
  SELECT ra.room_id, r.floor_id INTO v_room, v_floor FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id WHERE ra.member_id = v_mem1 AND ra.ends_on IS NULL;
  ASSERT v_room IS NOT NULL, 'điều kiện nền: m1 đang ở một phòng (S5)';
  INSERT INTO announcements (title, content, category_id, author_member_id) VALUES ('Thông báo theo phòng', 'Cắt nước sáng mai.', v_cat, v_memvice) RETURNING id INTO v_a5;
  INSERT INTO announcement_targets (announcement_id, room_id) VALUES (v_a5, v_room);
  INSERT INTO announcements (title, content, category_id, author_member_id) VALUES ('Thông báo theo tầng', 'Dọn hành lang tầng.', v_cat, v_memvice) RETURNING id INTO v_a6;
  INSERT INTO announcement_targets (announcement_id, floor_id) VALUES (v_a6, v_floor);
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id IN (%L, %L, %L)', v_a3, v_a4, v_a5)) = 1, 'm3 chỉ thấy thông báo nhắn riêng m3';
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a1)) = 1, 'm3 vẫn thấy thông báo toàn thể';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id IN (%L, %L)', v_a5, v_a6)) = 2 AND app_test.n(format('SELECT 1 FROM announcements WHERE id IN (%L, %L)', v_a3, v_a4)) = 0, 'm1 thấy thông báo theo phòng + tầng của mình, không thấy nhắn riêng m3/Thủ quỹ';
  PERFORM app_test.as_user(v_treas);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a4)) = 1 AND app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a3)) = 0, 'Thủ quỹ thấy thông báo gửi theo vai trò Thủ quỹ';
  PERFORM app_test.as_user(v_m4);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id IN (%L, %L, %L, %L)', v_a3, v_a4, v_a5, v_a6)) = 0, 'm4 (không thuộc đối tượng) không thấy thông báo nhắm mục tiêu';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_mark_announcement_read(%L)$q$, v_a3), 'Thông báo không tồn tại');
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id IN (%L, %L, %L, %L)', v_a3, v_a4, v_a5, v_a6)) = 0, 'Admin kỹ thuật (không có hồ sơ thành viên) không thuộc đối tượng nhắm mục tiêu';
  PERFORM app_test.as_user(v_vice);
  ASSERT (SELECT target_count FROM v_announcement_read_stats WHERE announcement_id = v_a3) = 1, 'mẫu số thống kê: nhắn riêng một thành viên = 1';
  ASSERT (SELECT target_count FROM v_announcement_read_stats WHERE announcement_id = v_a5) = (SELECT count(*) FROM room_assignments ra JOIN members m ON m.id = ra.member_id WHERE ra.room_id = v_room AND ra.ends_on IS NULL AND m.status = 'active'),
    'mẫu số thống kê: theo phòng = số thành viên đang ở phòng đó';
  ASSERT (SELECT target_count FROM v_announcement_read_stats WHERE announcement_id = v_a4) = 1,
    'mẫu số thống kê: theo vai trò Thủ quỹ = 1 người (người xem là Phó nhà), thực tế ' || (SELECT target_count FROM v_announcement_read_stats WHERE announcement_id = v_a4);
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM announcement_targets') = 0, 'bảng đối tượng nhận chỉ tác giả/người ghim thấy';

  -- ===== Bản nháp & hết hạn =====
  INSERT INTO announcements (title, content, category_id, author_member_id, status) VALUES ('Bản nháp của m2', 'Chưa đăng', v_cat, v_mem2, 'draft') RETURNING id INTO v_a3;
  ASSERT (SELECT published_at IS NULL FROM announcements WHERE id = v_a3), 'bản nháp chưa có published_at';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a3)) = 0, 'thành viên khác không thấy bản nháp';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a3)) = 1, 'người có announcement.pin thấy cả bản nháp';
  PERFORM app_test.as_user(v_m2);
  UPDATE announcements SET status = 'published' WHERE id = v_a3;
  ASSERT (SELECT published_at IS NOT NULL FROM announcements WHERE id = v_a3), 'đăng bản nháp ⇒ ghi published_at';
  UPDATE announcements SET deleted_at = now() WHERE id = v_a3;      -- tác giả xóa mềm thông báo của mình
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a3)) = 0, 'thông báo đã xóa mềm biến mất với thành viên';
  PERFORM app_test.as_user(v_vice);
  INSERT INTO announcements (title, content, category_id, author_member_id, published_at, expires_at)
  VALUES ('Thông báo đã hết hạn', 'Không còn hiệu lực.', v_cat, v_memvice, now() - interval '2 days', now() - interval '1 day') RETURNING id INTO v_a4;
  PERFORM app_test.expect_error(format($q$INSERT INTO announcements (title, content, category_id, author_member_id, published_at, expires_at) VALUES ('Hạn trước ngày đăng', 'x', %L, %L, now(), now() - interval '1 day')$q$, v_cat, v_memvice), 'ck_announcements__expiry');
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a4)) = 0, 'thông báo hết hạn ẩn với thành viên';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n(format('SELECT 1 FROM announcements WHERE id = %L', v_a4)) = 1, 'người có announcement.pin vẫn thấy thông báo hết hạn';
  -- Admin kỹ thuật chỉ thấy các thông báo toàn thể đã đăng và còn hạn; phiên quên gắn user không thấy gì
  PERFORM app_test.as_super();
  SELECT count(*) INTO v_exp FROM announcements a
   WHERE a.deleted_at IS NULL AND a.status = 'published' AND (a.expires_at IS NULL OR a.expires_at > now())
     AND NOT EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id);
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM announcements') = v_exp, 'Admin thấy đúng ' || v_exp || ' thông báo toàn thể còn hiệu lực';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM announcements') = 0 AND app_test.n('SELECT 1 FROM v_announcement_read_stats') = 0, 'phiên quên gắn user không thấy thông báo';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11d OK — thông báo';
END $$;

-- ---------------------------------------------------------------------
-- S11e. Diễn đàn: bình luận một cấp, bộ đếm do trigger, cảm xúc theo người, khóa/ẩn do kiểm duyệt, tác giả không sửa bộ đếm/ghim/bỏ ẩn (BR-COM-06)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_cat uuid; v_p1 uuid; v_p2 uuid; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_old timestamptz;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_cat FROM categories WHERE kind = 'forum' AND code = 'FORUM_SPORT';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ('Đăng hộ người khác', 'x', %L, %L)$q$, v_cat, v_mem2), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_posts (title, content, category_id, author_member_id, is_pinned) VALUES ('Tự ghim bài', 'x', %L, %L, true)$q$, v_cat, v_mem1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_posts (title, content, category_id, author_member_id, reactions_count) VALUES ('Tự bơm lượt thích', 'x', %L, %L, 99)$q$, v_cat, v_mem1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ('ab', 'x', %L, %L)$q$, v_cat, v_mem1), 'ck_forum_posts__title');
  INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ('Đá bóng chiều thứ Bảy', 'Ai đi không?', v_cat, v_mem1) RETURNING id INTO v_p1;
  INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ('Giải cầu lông cuối tháng', 'Đăng ký tại bảng tin.', v_cat, v_mem1) RETURNING id INTO v_p2;
  ASSERT (SELECT comments_count = 0 AND reactions_count = 0 AND NOT is_pinned AND status = 'published' FROM forum_posts WHERE id = v_p1), 'bài mới: bộ đếm 0, không ghim, published';

  -- ===== Bình luận: trả lời tối đa một cấp, đúng bài, nội dung hợp lệ; bộ đếm do trigger =====
  PERFORM app_test.as_super();
  UPDATE forum_posts SET last_activity_at = now() - interval '1 day' WHERE id = v_p1;
  PERFORM app_test.as_user(v_m2);
  INSERT INTO forum_comments (post_id, author_member_id, content) VALUES (v_p1, v_mem2, 'Mình đi') RETURNING id INTO v_c1;
  INSERT INTO forum_comments (post_id, parent_id, author_member_id, content) VALUES (v_p1, v_c1, v_mem2, 'Mang theo bóng nhé') RETURNING id INTO v_c2;
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, parent_id, author_member_id, content) VALUES (%L, %L, %L, 'Trả lời cấp ba')$q$, v_p1, v_c2, v_mem2), 'Chỉ cho phép trả lời một cấp');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, parent_id, author_member_id, content) VALUES (%L, %L, %L, 'Cha thuộc bài khác')$q$, v_p2, v_c1, v_mem2), 'không thuộc bài viết này');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, author_member_id, content) VALUES (%L, %L, '   ')$q$, v_p1, v_mem2), 'ck_forum_comments__content');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, author_member_id, content) VALUES (%L, %L, 'Bình luận hộ')$q$, v_p1, v_mem3), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, author_member_id, content, reactions_count) VALUES (%L, %L, 'Tự bơm', 50)$q$, v_p1, v_mem2), 'BR-COM-06');
  ASSERT (SELECT comments_count FROM forum_posts WHERE id = v_p1) = 2, 'comments_count = 2 (bình luận + trả lời)';
  ASSERT (SELECT last_activity_at > now() - interval '1 hour' FROM forum_posts WHERE id = v_p1), 'có bình luận mới ⇒ last_activity_at được cập nhật';

  -- ===== Cảm xúc theo từng người (partial unique index), bộ đếm tăng/giảm =====
  INSERT INTO forum_reactions (post_id, member_id, kind) VALUES (v_p1, v_mem2, 'heart');
  INSERT INTO forum_reactions (post_id, member_id, kind) VALUES (v_p1, v_mem2, 'thumbs_up');
  INSERT INTO forum_reactions (comment_id, member_id, kind) VALUES (v_c1, v_mem2, 'pray');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_reactions (post_id, member_id, kind) VALUES (%L, %L, 'heart')$q$, v_p1, v_mem2), 'ux_forum_reactions__post');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_reactions (comment_id, member_id, kind) VALUES (%L, %L, 'pray')$q$, v_c1, v_mem2), 'ux_forum_reactions__comment');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_reactions (post_id, member_id, kind) VALUES (%L, %L, 'angry')$q$, v_p1, v_mem2), 'ck_forum_reactions__kind');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_reactions (post_id, comment_id, member_id) VALUES (%L, %L, %L)$q$, v_p1, v_c1, v_mem2), 'ck_forum_reactions__target');
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_reactions (post_id, member_id) VALUES (%L, %L)$q$, v_p1, v_mem3), 'row-level security');
  PERFORM app_test.as_user(v_m3);
  INSERT INTO forum_reactions (post_id, member_id, kind) VALUES (v_p1, v_mem3, 'heart');
  ASSERT app_test.n('SELECT 1 FROM forum_reactions') = 1, 'cảm xúc chỉ thấy của chính mình';
  ASSERT (SELECT reactions_count FROM forum_posts WHERE id = v_p1) = 3 AND (SELECT reactions_count FROM forum_comments WHERE id = v_c1) = 1, 'bộ đếm: bài 3 cảm xúc (2 người), bình luận 1';
  DELETE FROM forum_reactions WHERE post_id = v_p1 AND member_id = v_mem3;
  ASSERT (SELECT reactions_count FROM forum_posts WHERE id = v_p1) = 2, 'bỏ cảm xúc ⇒ bộ đếm giảm';

  -- ===== BR-COM-06: tác giả không tự sửa bộ đếm / ghim / đổi trạng thái kiểm duyệt =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE forum_posts SET reactions_count = 999 WHERE id = %L$q$, v_p1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE forum_posts SET comments_count = 0 WHERE id = %L$q$, v_p1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE forum_posts SET is_pinned = true WHERE id = %L$q$, v_p1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE forum_posts SET status = 'locked' WHERE id = %L$q$, v_p1), 'BR-COM-06');
  UPDATE forum_posts SET content = 'Ai đi không? 16h sân trường.' WHERE id = v_p1;   -- sửa nội dung bài của mình: được
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$UPDATE forum_comments SET reactions_count = 99 WHERE id = %L$q$, v_c1), 'BR-COM-06');
  ASSERT app_test.rows_affected(format($q$UPDATE forum_posts SET title = 'Sửa trộm bài người khác' WHERE id = %L$q$, v_p1)) = 0, 'thành viên khác không sửa bài (RLS)';

  -- ===== Kiểm duyệt: ghim, ẩn, khóa; tác giả không bỏ ẩn; bài khóa/ẩn không nhận bình luận (BR-COM-03) =====
  PERFORM app_test.as_user(v_vice);
  UPDATE forum_posts SET is_pinned = true WHERE id = v_p1;
  UPDATE forum_posts SET status = 'hidden' WHERE id = v_p1;
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM forum_posts WHERE id = %L', v_p1)) = 0 AND app_test.n(format('SELECT 1 FROM forum_comments WHERE post_id = %L', v_p1)) = 0, 'bài bị ẩn: người khác không thấy bài lẫn bình luận';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM forum_posts WHERE id = %L', v_p1)) = 1, 'tác giả vẫn thấy bài của mình bị ẩn';
  PERFORM app_test.expect_error(format($q$UPDATE forum_posts SET status = 'published' WHERE id = %L$q$, v_p1), 'BR-COM-06');
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, author_member_id, content) VALUES (%L, %L, 'Bình luận vào bài bị ẩn')$q$, v_p1, v_mem2), 'BR-COM-03');
  PERFORM app_test.as_user(v_vice);
  UPDATE forum_posts SET status = 'locked' WHERE id = v_p1;
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO forum_comments (post_id, author_member_id, content) VALUES (%L, %L, 'Bình luận vào bài bị khóa')$q$, v_p1, v_mem2), 'BR-COM-03');
  PERFORM app_test.as_user(v_vice);
  UPDATE forum_posts SET status = 'published' WHERE id = v_p1;
  UPDATE forum_comments SET status = 'hidden' WHERE id = v_c1;
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM forum_comments WHERE id = %L', v_c1)) = 0, 'bình luận bị ẩn: người khác không thấy';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM forum_comments WHERE id = %L', v_c1)) = 1, 'tác giả bình luận vẫn thấy bình luận của mình';
  PERFORM app_test.expect_error(format($q$UPDATE forum_comments SET status = 'published' WHERE id = %L$q$, v_c1), 'BR-COM-06');

  -- ===== Xóa: người dùng không xóa cứng bình luận; xóa bằng quyền hệ thống làm giảm bộ đếm; tác giả xóa mềm bài của mình =====
  ASSERT app_test.rows_affected(format($q$DELETE FROM forum_comments WHERE id = %L$q$, v_c2)) = 0, 'luuxa_app không có chính sách DELETE bình luận';
  PERFORM app_test.as_super();
  DELETE FROM forum_comments WHERE id = v_c2;
  ASSERT (SELECT comments_count FROM forum_posts WHERE id = v_p1) = 0, 'xóa bình luận bằng quyền hệ thống ⇒ bộ đếm giảm; c1 đã bị ẩn nên không được đếm (BR-COM-31, A-005)';
  PERFORM app_test.as_user(v_m1);
  UPDATE forum_posts SET deleted_at = now() WHERE id = v_p2;
  ASSERT app_test.n(format('SELECT 1 FROM forum_posts WHERE id = %L', v_p2)) = 1, 'tác giả vẫn đọc được bài vừa xóa mềm (chính sách SELECT áp cho cả dòng mới của UPDATE; API lọc deleted_at IS NULL)';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM forum_posts WHERE id = %L', v_p2)) = 0, 'bài đã xóa mềm biến mất khỏi diễn đàn với người khác';
  PERFORM app_test.as_user(v_vice);
  UPDATE forum_comments SET deleted_at = now() WHERE id = v_c1;   -- người kiểm duyệt xóa mềm bình luận
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM forum_comments WHERE id = %L', v_c1)) = 0, 'bình luận bị người kiểm duyệt xóa mềm biến mất';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM forum_posts') = 0, 'Admin kỹ thuật không có forum.post ⇒ không thấy diễn đàn';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11e OK — diễn đàn';
END $$;

-- ---------------------------------------------------------------------
-- S11f. Ý chỉ cầu nguyện: ẩn danh THẬT, hiệp ý theo người, bộ đếm/kiểm duyệt (BR-COM-06), xem tác giả có điều kiện + audit (BR-COM-05)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_pr1 uuid; v_pr2 uuid; v_rep uuid; v_author uuid; v_n bigint;
BEGIN
  PERFORM app_test.as_super();
  PERFORM app_test.as_user(v_m1);
  v_pr1 := app.fn_post_prayer('Xin cầu nguyện cho kỳ thi cuối kỳ của anh em', false);
  v_pr2 := app.fn_post_prayer('Một ý chỉ riêng tư xin ẩn danh', true);
  ASSERT (SELECT author_member_id FROM prayer_intentions WHERE id = v_pr1) = v_mem1 AND NOT (SELECT is_anonymous FROM prayer_intentions WHERE id = v_pr1), 'ý chỉ công khai ghi tác giả';
  ASSERT (SELECT author_member_id IS NULL AND is_anonymous FROM prayer_intentions WHERE id = v_pr2), 'ý chỉ ẩn danh: cột tác giả của bảng chính luôn NULL';
  ASSERT app_test.n('SELECT 1 FROM prayer_intention_authors') = 1, 'chính chủ đọc được dòng tác giả của ý chỉ ẩn danh của mình';
  PERFORM app_test.expect_error($q$SELECT app.fn_post_prayer('abc', false)$q$, 'ck_prayer_intentions__content');
  PERFORM app_test.expect_error($q$INSERT INTO prayer_intentions (content, is_anonymous) VALUES ('Ghi thẳng vào bảng chính', true)$q$, 'permission denied');
  PERFORM app_test.expect_error(format($q$INSERT INTO prayer_intention_authors (intention_id, author_member_id) VALUES (%L, %L)$q$, v_pr1, v_mem1), 'permission denied');
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM prayer_intentions') >= 2 AND app_test.n('SELECT 1 FROM prayer_intention_authors') = 0, 'm2 thấy ý chỉ nhưng không thấy bảng tác giả';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM prayer_intention_authors') = 0, 'ngay cả Trưởng nhà cũng không đọc trực tiếp bảng tác giả';
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error($q$SELECT app.fn_post_prayer('Admin không có hồ sơ thành viên', false)$q$, 'Chưa đăng nhập bằng tài khoản thành viên');
  ASSERT app_test.n('SELECT 1 FROM prayer_intentions') = 0, 'Admin kỹ thuật không có prayer.post ⇒ không thấy ý chỉ';
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error($q$SELECT app.fn_post_prayer('Phiên quên gắn user', true)$q$, 'Chưa đăng nhập bằng tài khoản thành viên');

  -- ===== Hiệp ý cầu nguyện: theo từng người, bộ đếm do trigger =====
  PERFORM app_test.as_user(v_m2);
  INSERT INTO prayer_responses (intention_id, member_id) VALUES (v_pr2, v_mem2);
  PERFORM app_test.expect_error(format($q$INSERT INTO prayer_responses (intention_id, member_id) VALUES (%L, %L)$q$, v_pr2, v_mem2), 'prayer_responses_pkey');
  PERFORM app_test.expect_error(format($q$INSERT INTO prayer_responses (intention_id, member_id) VALUES (%L, %L)$q$, v_pr2, v_mem3), 'row-level security');
  PERFORM app_test.as_user(v_m3);
  INSERT INTO prayer_responses (intention_id, member_id) VALUES (v_pr2, v_mem3);
  ASSERT (SELECT prayer_count FROM prayer_intentions WHERE id = v_pr2) = 2 AND app_test.n('SELECT 1 FROM prayer_responses') = 1, 'prayer_count = 2 người; mỗi người chỉ thấy lượt của mình';
  DELETE FROM prayer_responses WHERE intention_id = v_pr2 AND member_id = v_mem3;
  ASSERT (SELECT prayer_count FROM prayer_intentions WHERE id = v_pr2) = 1, 'bỏ hiệp ý ⇒ bộ đếm giảm';

  -- ===== BR-COM-06: không tự sửa bộ đếm / bỏ ẩn; kiểm duyệt ẩn ý chỉ; tác giả đóng ý chỉ công khai của mình =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE prayer_intentions SET prayer_count = 99 WHERE id = %L$q$, v_pr1), 'BR-COM-06');
  UPDATE prayer_intentions SET status = 'answered' WHERE id = v_pr1;
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE prayer_intentions SET status = 'closed' WHERE id = %L$q$, v_pr1)) = 0, 'thành viên khác không đóng ý chỉ của m1 (RLS)';
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$UPDATE prayer_intentions SET prayer_count = 5 WHERE id = %L$q$, v_pr1), 'BR-COM-06');   -- kể cả người kiểm duyệt cũng không sửa bộ đếm
  UPDATE prayer_intentions SET visibility = 'hidden' WHERE id = v_pr1;
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM prayer_intentions WHERE id = %L', v_pr1)) = 0, 'ý chỉ bị ẩn: người khác không thấy';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM prayer_intentions WHERE id = %L', v_pr1)) = 1, 'tác giả công khai vẫn thấy ý chỉ của mình';
  PERFORM app_test.expect_error(format($q$UPDATE prayer_intentions SET visibility = 'published' WHERE id = %L$q$, v_pr1), 'BR-COM-06');

  -- ===== Báo cáo vi phạm =====
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO content_reports (entity_type, entity_id, reporter_member_id, reason) VALUES ('prayer_intention', %L, %L, 'ngắn')$q$, v_pr2, v_mem2), 'ck_content_reports__reason');
  PERFORM app_test.expect_error(format($q$INSERT INTO content_reports (entity_type, entity_id, reporter_member_id, reason) VALUES ('user_profile', %L, %L, 'Nội dung không phù hợp')$q$, v_pr2, v_mem2), 'ck_content_reports__entity');
  PERFORM app_test.expect_error(format($q$INSERT INTO content_reports (entity_type, entity_id, reporter_member_id, reason) VALUES ('prayer_intention', %L, %L, 'Báo hộ người khác')$q$, v_pr2, v_mem3), 'row-level security');

  -- ===== Xem tác giả ý chỉ ẩn danh (BR-COM-05): chỉ Trưởng nhà, có báo cáo mở, có lý do, mỗi lần ghi audit =====
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reveal_prayer_author(%L, 'Tò mò muốn biết tác giả là ai')$q$, v_pr2), 'BR-COM-05');
  PERFORM app_test.as_user(v_m2);
  INSERT INTO content_reports (entity_type, entity_id, reporter_member_id, reason) VALUES ('prayer_intention', v_pr2, v_mem2, 'Nội dung không phù hợp với cộng đoàn') RETURNING id INTO v_rep;
  PERFORM app_test.expect_error(format($q$INSERT INTO content_reports (entity_type, entity_id, reporter_member_id, reason) VALUES ('prayer_intention', %L, %L, 'Báo lần hai cùng ý chỉ')$q$, v_pr2, v_mem2), 'ux_content_reports__once');
  ASSERT app_test.n('SELECT 1 FROM content_reports') = 1, 'người báo thấy báo cáo của mình';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reveal_prayer_author(%L, 'Thành viên thường không được xem tác giả')$q$, v_pr2), 'Không có quyền xem tác giả');
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM content_reports') = 0, 'thành viên khác không thấy báo cáo của m2';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n('SELECT 1 FROM content_reports') = 1, 'người kiểm duyệt thấy báo cáo';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reveal_prayer_author(%L, 'Phó nhà không có quyền xem tác giả')$q$, v_pr2), 'Không có quyền xem tác giả');
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reveal_prayer_author(%L, 'Phiên quên gắn user thử xem tác giả')$q$, v_pr2), 'Không có quyền xem tác giả');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reveal_prayer_author(%L, 'ngắn')$q$, v_pr2), 'phải nêu lý do');
  v_author := app.fn_reveal_prayer_author(v_pr2, 'Có báo cáo vi phạm mở, cần liên hệ tác giả');
  ASSERT v_author = v_mem1, 'Trưởng nhà thấy đúng tác giả thật của ý chỉ ẩn danh';
  PERFORM app.fn_reveal_prayer_author(v_pr2, 'Xác minh lại trước khi nhắc nhở tác giả');
  PERFORM app_test.as_super();
  SELECT count(*) INTO v_n FROM audit_logs WHERE action = 'READ_SENSITIVE' AND entity_table = 'prayer_intention_authors' AND entity_id = v_pr2::text AND actor_user_id = v_head AND reason IS NOT NULL AND 'house_head' = ANY (actor_roles);
  ASSERT v_n = 2, 'mỗi lần xem tác giả ghi một dòng audit READ_SENSITIVE kèm lý do và vai trò người xem (thực tế ' || v_n || ')';
  -- Xử lý xong báo cáo (đóng) ⇒ không còn căn cứ xem tác giả
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE content_reports SET status = 'dismissed', handled_by = %L, handled_at = now() WHERE id = %L$q$, v_m2, v_rep)) = 0, 'người báo không tự đóng báo cáo (RLS)';
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$UPDATE content_reports SET status = 'actioned' WHERE id = %L$q$, v_rep), 'ck_content_reports__handled');
  UPDATE content_reports SET status = 'actioned', handled_by = v_vice, handled_at = now(), resolution_note = 'Đã nhắc nhở tác giả' WHERE id = v_rep;
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_reveal_prayer_author(%L, 'Xem lại sau khi báo cáo đã đóng')$q$, v_pr2), 'BR-COM-05');
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11f OK — ý chỉ cầu nguyện';
END $$;

-- ---------------------------------------------------------------------
-- S11g. Nội quy: phiên bản, đúng một bản hiện hành, xác nhận đã đọc (xác nhận lại khi có phiên bản mới)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_admin uuid := '00000000-0000-7000-8000-0000000000a1';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_v1 uuid; v_v2 uuid; v_ver1 integer; v_faq uuid;
BEGIN
  PERFORM app_test.as_super();
  SELECT id, version INTO v_v1, v_ver1 FROM policy_documents WHERE slug = 'noi-quy-luu-xa' AND is_current;
  ASSERT v_v1 IS NOT NULL, 'điều kiện nền: có nội quy mẫu hiện hành (seed)';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO policy_acknowledgements (policy_id, member_id) VALUES (v_v1, v_mem1);

  -- Ban hành phiên bản mới: chỉ người có policy.manage; phiên bản cũ mất cờ hiện hành
  PERFORM app_test.expect_error($q$SELECT app.fn_publish_policy('noi-quy-luu-xa', 'Tự soạn nội quy', 'Nội dung do thành viên tự soạn thảo')$q$, 'Không có quyền ban hành nội quy');
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error($q$SELECT app.fn_publish_policy('noi-quy-luu-xa', 'Phiên quên gắn user', 'Nội dung do phiên ẩn danh soạn thảo')$q$, 'Không có quyền ban hành nội quy');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error($q$SELECT app.fn_publish_policy('Noi-Quy', 'Sai slug', 'Nội dung đủ dài để hợp lệ')$q$, 'ck_policy_documents__slug');
  PERFORM app_test.expect_error($q$SELECT app.fn_publish_policy('noi-quy-luu-xa', 'Nội dung quá ngắn', 'ngắn')$q$, 'ck_policy_documents__content');
  PERFORM app_test.expect_error($q$SELECT app.fn_publish_policy('noi-quy-luu-xa', 'Sai loại tài liệu', 'Nội dung đủ dài để hợp lệ', 'bi_mat')$q$, 'ck_policy_documents__kind');
  v_v2 := app.fn_publish_policy('noi-quy-luu-xa', 'Nội quy Lưu Xá Phanxicô (phiên bản mới)', E'# Nội quy v2\n\nGiờ giới nghiêm 22:00, xin phép trước nếu về muộn.');
  ASSERT (SELECT version FROM policy_documents WHERE id = v_v2) = v_ver1 + 1 AND (SELECT is_current FROM policy_documents WHERE id = v_v2) AND NOT (SELECT is_current FROM policy_documents WHERE id = v_v1), 'phiên bản tăng 1, bản mới hiện hành, bản cũ hết hiện hành';
  ASSERT (SELECT published_by FROM policy_documents WHERE id = v_v2) = v_head, 'ghi người ban hành';
  ASSERT (SELECT count(*) FROM policy_documents WHERE slug = 'noi-quy-luu-xa' AND is_current) = 1, 'mỗi slug đúng một bản hiện hành';
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$UPDATE policy_documents SET is_current = true WHERE id = %L$q$, v_v1), 'ux_policy_documents__current');
  PERFORM app_test.as_worker();
  v_faq := app.fn_publish_policy('hoi-dap-chung', 'Hỏi đáp thường gặp', E'# Hỏi đáp\n\nBáo hỏng ở đâu? Trong mục Hậu cần.', 'faq');   -- worker/migration (ngữ cảnh hệ thống) ban hành được
  ASSERT (SELECT version = 1 AND published_by IS NULL FROM policy_documents WHERE id = v_faq), 'tài liệu mới bắt đầu từ phiên bản 1; ngữ cảnh hệ thống không có người ban hành';

  -- Thành viên chỉ thấy bản hiện hành; người quản lý thấy cả lịch sử phiên bản
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM policy_documents WHERE NOT is_current') = 0 AND app_test.n(format('SELECT 1 FROM policy_documents WHERE id = %L', v_v2)) = 1, 'thành viên chỉ thấy phiên bản hiện hành';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n(format('SELECT 1 FROM policy_documents WHERE id = %L', v_v1)) = 1, 'Trưởng nhà thấy cả phiên bản cũ';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM policy_documents') = 0, 'phiên quên gắn user không đọc được nội quy';

  -- ===== Xác nhận đã đọc: theo từng người, theo từng phiên bản =====
  PERFORM app_test.as_super();
  ASSERT EXISTS (SELECT 1 FROM members m WHERE m.id = v_mem1 AND NOT EXISTS (SELECT 1 FROM policy_acknowledgements a WHERE a.policy_id = v_v2 AND a.member_id = m.id)), 'm1 đã xác nhận bản cũ nhưng phải xác nhận lại bản mới';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO policy_acknowledgements (policy_id, member_id) VALUES (v_v2, v_mem1);
  PERFORM app_test.expect_error(format($q$INSERT INTO policy_acknowledgements (policy_id, member_id) VALUES (%L, %L)$q$, v_v2, v_mem1), 'policy_acknowledgements_pkey');
  PERFORM app_test.expect_error(format($q$INSERT INTO policy_acknowledgements (policy_id, member_id) VALUES (%L, %L)$q$, v_v2, v_mem2), 'row-level security');
  ASSERT app_test.rows_affected(format($q$UPDATE policy_acknowledgements SET acknowledged_at = now() - interval '1 year' WHERE member_id = %L$q$, v_mem1)) = 0
     AND app_test.rows_affected(format($q$DELETE FROM policy_acknowledgements WHERE member_id = %L$q$, v_mem1)) = 0, 'bằng chứng xác nhận không sửa/xóa được qua API';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM policy_acknowledgements') = 0, 'm2 không thấy xác nhận của m1';
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$INSERT INTO policy_acknowledgements (policy_id, member_id) VALUES (%L, %L)$q$, v_v2, v_mem2), 'row-level security');
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM policy_acknowledgements') = 2, 'người có policy.manage thấy mọi xác nhận (2: m1 bản cũ + bản mới)';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11g OK — nội quy';
END $$;

-- ---------------------------------------------------------------------
-- S11h. Đơn xin vào lưu xá: máy trạng thái, người nộp không tự duyệt (BR-MEM-08), duyệt ⇒ tạo hồ sơ + vai trò member (Phó nhà cũng duyệt được)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1';
  v_c1 uuid := '00000000-0000-7000-8000-0000000000c1'; v_c2 uuid := '00000000-0000-7000-8000-0000000000c2'; v_c3 uuid := '00000000-0000-7000-8000-0000000000c3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1';
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_mem uuid; v_members bigint;
BEGIN
  PERFORM app_test.as_super();
  INSERT INTO users (id, email, status, password_hash) VALUES
    (v_c1, 'moi1@x.vn', 'invited', '$argon2id$v=19$m=1,t=1,p=1$a$b'), (v_c2, 'moi2@x.vn', 'invited', '$argon2id$v=19$m=1,t=1,p=1$a$b'),
    (v_c3, 'moi3@x.vn', 'invited', '$argon2id$v=19$m=1,t=1,p=1$a$b');
  SELECT count(*) INTO v_members FROM members WHERE deleted_at IS NULL;

  -- ===== Nộp đơn: chỉ cho chính mình, trạng thái submitted, có liên lạc hợp lệ =====
  PERFORM app_test.as_user(v_c1);
  PERFORM app_test.expect_error(format($q$INSERT INTO member_applications (user_id, full_name, email) VALUES (%L, 'Lê Văn Mới', 'moi2@x.vn')$q$, v_c2), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO member_applications (user_id, full_name, email, status) VALUES (%L, 'Lê Văn Mới', 'moi1@x.vn', 'approved')$q$, v_c1), 'BR-MEM-08');
  PERFORM app_test.expect_error(format($q$INSERT INTO member_applications (user_id, full_name) VALUES (%L, 'Lê Văn Mới')$q$, v_c1), 'ck_member_applications__contact');
  PERFORM app_test.expect_error(format($q$INSERT INTO member_applications (user_id, full_name, phone_e164) VALUES (%L, 'Lê Văn Mới', '0912345678')$q$, v_c1), 'ck_member_applications__phone');
  INSERT INTO member_applications (user_id, full_name, email, phone_e164, university_name, message, referrer_member_id)
  VALUES (v_c1, 'Lê Văn Mới', 'moi1@x.vn', '+84912345678', 'Đại học Bách khoa Hà Nội', 'Xin vào lưu xá', v_mem1) RETURNING id INTO v_a1;
  UPDATE member_applications SET message = 'Xin vào lưu xá — em là sinh viên năm nhất' WHERE id = v_a1;   -- sửa nội dung đơn khi còn chờ: được
  -- BR-MEM-08: không tự duyệt / tự ghi kết quả
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'approved' WHERE id = %L$q$, v_a1), 'BR-MEM-08');
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'approved', reviewed_by = %L, reviewed_at = now(), resulting_member_id = %L WHERE id = %L$q$, v_c1, v_mem1, v_a1), 'BR-MEM-08');
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET reviewed_by = %L WHERE id = %L$q$, v_c1, v_a1), 'BR-MEM-08');
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET review_note = 'Đã duyệt' WHERE id = %L$q$, v_a1), 'BR-MEM-08');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a1), 'Không có quyền duyệt đơn');
  -- Đơn của người khác & rút đơn
  PERFORM app_test.as_user(v_c2);
  INSERT INTO member_applications (user_id, full_name, email) VALUES (v_c2, 'Phạm Quang Hiếu', 'moi2@x.vn') RETURNING id INTO v_a2;
  ASSERT app_test.n('SELECT 1 FROM member_applications') = 1 AND app_test.rows_affected(format($q$UPDATE member_applications SET message = 'Sửa đơn người khác' WHERE id = %L$q$, v_a1)) = 0, 'người nộp đơn chỉ thấy/sửa đơn của mình';
  UPDATE member_applications SET status = 'withdrawn' WHERE id = v_a2;
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'submitted' WHERE id = %L$q$, v_a2), 'BR-MEM-08');      -- người nộp chỉ được rút đơn, không "mở lại" đơn
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'submitted' WHERE id = %L$q$, v_a2), 'Chuyển trạng thái không hợp lệ');   -- máy trạng thái: đơn đã rút là trạng thái cuối
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM member_applications') = 0, 'thành viên thường không thấy đơn xin vào';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a1), 'Không có quyền duyệt đơn');
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a1), 'Không có quyền duyệt đơn');
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a1), 'Không có quyền duyệt đơn');

  -- ===== Phó nhà (application.review) xét duyệt ⇒ tạo hồ sơ + kích hoạt tài khoản + gán vai trò member =====
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n('SELECT 1 FROM member_applications') = 2, 'Phó nhà thấy mọi đơn';
  UPDATE member_applications SET status = 'under_review' WHERE id = v_a1;
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'approved', reviewed_by = %L, reviewed_at = now() WHERE id = %L$q$, v_vice, v_a1), 'ck_member_applications__approved');
  v_mem := app.fn_approve_member_application(v_a1, 'Giới thiệu bởi anh Tuấn, đủ điều kiện');
  PERFORM app_test.as_super();
  ASSERT (SELECT full_name = 'Lê Văn Mới' AND display_name = 'Mới' AND user_id = v_c1 AND contact_email = 'moi1@x.vn' AND contact_phone_e164 = '+84912345678' AND status = 'active'
            FROM members WHERE id = v_mem), 'hồ sơ thành viên tạo từ đơn (tên gọi = tên cuối)';
  ASSERT (SELECT status FROM users WHERE id = v_c1) = 'active', 'tài khoản chờ duyệt được kích hoạt';
  ASSERT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = v_c1 AND r.code = 'member' AND ur.granted_by = v_vice AND ur.revoked_at IS NULL), 'gán vai trò member, ghi người cấp';
  ASSERT (SELECT status = 'approved' AND reviewed_by = v_vice AND reviewed_at IS NOT NULL AND resulting_member_id = v_mem AND review_note LIKE 'Giới thiệu%'
            FROM member_applications WHERE id = v_a1), 'đơn đóng kèm người duyệt, thời điểm, hồ sơ kết quả';
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a1), 'Đơn đã được xử lý');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a2), 'Đơn đã được xử lý');
  PERFORM app_test.expect_error($q$SELECT app.fn_approve_member_application(app.uuid_v7())$q$, 'Đơn không tồn tại');
  PERFORM app_test.as_user(v_c1);
  ASSERT app.has_role('member') AND app_test.n('SELECT 1 FROM members') = v_members + 1 AND (SELECT status FROM member_applications WHERE id = v_a1) = 'approved',
    'người vừa được duyệt đã là thành viên: có vai trò member, đọc được danh bạ, thấy đơn đã duyệt';

  -- ===== Từ chối: bắt buộc ghi chú; đơn đã đóng không duyệt lại được; duyệt phải có hồ sơ kết quả =====
  PERFORM app_test.as_user(v_c3);
  INSERT INTO member_applications (user_id, full_name, phone_e164) VALUES (v_c3, 'Trần Quốc Toản', '+84988776655') RETURNING id INTO v_a3;
  INSERT INTO member_applications (user_id, full_name, phone_e164) VALUES (v_c3, 'Trần Quốc Toản', '+84988776655') RETURNING id INTO v_a4;
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'rejected', reviewed_by = %L, reviewed_at = now() WHERE id = %L$q$, v_head, v_a3), 'ck_member_applications__reject_note');
  UPDATE member_applications SET status = 'rejected', reviewed_by = v_head, reviewed_at = now(), review_note = 'Chưa đủ điều kiện, hẹn học kỳ sau' WHERE id = v_a3;
  PERFORM app_test.expect_error(format($q$SELECT app.fn_approve_member_application(%L)$q$, v_a3), 'Đơn đã được xử lý');
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'approved' WHERE id = %L$q$, v_a3), 'Chuyển trạng thái không hợp lệ');
  PERFORM app_test.expect_error(format($q$UPDATE member_applications SET status = 'approved', reviewed_by = %L, reviewed_at = now() WHERE id = %L$q$, v_head, v_a4), 'ck_member_applications__approved');
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11h OK — đơn xin vào lưu xá';
END $$;

-- ---------------------------------------------------------------------
-- S11i. Bữa ăn (cờ tính năng feature.meals.enabled) & kho bếp (v_pantry_status)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_admin uuid := '00000000-0000-7000-8000-0000000000a1';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_open uuid; v_late uuid; v_draft uuid;
BEGIN
  PERFORM app_test.as_super();
  ASSERT NOT app.setting_bool('feature.meals.enabled'), 'phân hệ Bếp & Cơm mặc định đang tạm hoãn';
  PERFORM app_test.as_user(v_head);
  INSERT INTO meal_menus (menu_date, meal_type, title, dishes, cutoff_at, status) VALUES (app.local_today() + 1, 'lunch', 'Cơm gà kho', ARRAY['Gà kho gừng', 'Canh bí'], now() + interval '5 hours', 'open') RETURNING id INTO v_open;
  INSERT INTO meal_menus (menu_date, meal_type, title, dishes, cutoff_at, status) VALUES (app.local_today() + 1, 'dinner', 'Cơm cá', ARRAY['Cá kho'], now() - interval '1 hour', 'open') RETURNING id INTO v_late;
  INSERT INTO meal_menus (menu_date, meal_type, title, cutoff_at) VALUES (app.local_today() + 2, 'lunch', 'Bản nháp', now() + interval '30 hours') RETURNING id INTO v_draft;
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_menus (menu_date, meal_type, title, cutoff_at) VALUES (%L, 'lunch', 'Trùng bữa', now())$q$, app.local_today() + 1), 'ux_meal_menus__date_type');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_menus (menu_date, meal_type, title, cutoff_at) VALUES (%L, 'dinner', 'Tự lập thực đơn', now())$q$, app.local_today() + 3), 'row-level security');

  -- ===== Cờ tắt ⇒ chặn mọi đăng ký (kể cả người quản lý); bật cờ bằng superuser ⇒ đăng ký được =====
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id) VALUES (%L, %L)$q$, v_open, v_mem1), 'tạm hoãn');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id) VALUES (%L, %L)$q$, v_open, v_mem2), 'tạm hoãn');
  PERFORM app_test.as_super();
  UPDATE settings SET value = 'true'::jsonb WHERE key = 'feature.meals.enabled';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO meal_registrations (menu_id, member_id, guests, note) VALUES (v_open, v_mem1, 2, 'Mang theo hai khách');
  ASSERT (SELECT registered_by = v_m1 AND registered_at IS NOT NULL FROM meal_registrations WHERE member_id = v_mem1), 'ghi người đăng ký và thời điểm';
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id) VALUES (%L, %L)$q$, v_open, v_mem1), 'ux_meal_registrations__menu_member');
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id) VALUES (%L, %L)$q$, v_open, v_mem2), 'BR-MEAL-02');
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id) VALUES (%L, %L)$q$, v_late, v_mem1), 'BR-MEAL-01');
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id) VALUES (%L, %L)$q$, v_draft, v_mem1), 'không mở đăng ký');
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_registrations (menu_id, member_id, guests) VALUES (%L, %L, 11)$q$, v_open, v_mem2), 'ck_meal_registrations__guests');
  INSERT INTO meal_registrations (menu_id, member_id) VALUES (v_open, v_mem2);
  UPDATE meal_registrations SET will_eat = false WHERE member_id = v_mem2;      -- sửa suất của mình trước giờ chốt: được
  -- Sau giờ chốt chỉ người quản lý (meal.manage) đăng ký/sửa hộ
  PERFORM app_test.as_user(v_head);
  INSERT INTO meal_registrations (menu_id, member_id) VALUES (v_late, v_mem2);
  ASSERT (SELECT registered_by FROM meal_registrations WHERE menu_id = v_late) = v_head, 'đăng ký hộ sau giờ chốt ghi người quản lý';
  ASSERT app_test.n('SELECT 1 FROM meal_registrations') = 3, 'người quản lý thấy mọi đăng ký';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM meal_registrations') = 0, 'm3 không thấy đăng ký của người khác';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM meal_registrations') = 2, 'm2 chỉ thấy suất của mình (2 bữa)';
  -- Tắt lại cờ ⇒ chặn cả sửa suất đã có
  PERFORM app_test.as_super();
  UPDATE settings SET value = 'false'::jsonb WHERE key = 'feature.meals.enabled';
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$UPDATE meal_registrations SET will_eat = true WHERE menu_id = %L$q$, v_open), 'tạm hoãn');

  -- ===== Kho bếp: trạng thái suy ra từ định mức (view), thành viên chỉ đọc =====
  PERFORM app_test.as_user(v_head);
  INSERT INTO pantry_items (name, unit, qty_on_hand, par_level) VALUES ('Gạo', 'kg', 20, 20), ('Nước mắm', 'chai', 3, 5), ('Dầu ăn', 'chai', 1, 5), ('Muối', 'gói', 0, 0);
  INSERT INTO pantry_items (name, unit, qty_on_hand, par_level, is_active) VALUES ('Hạt tiêu (ngưng dùng)', 'gói', 0, 3, false);
  PERFORM app_test.expect_error($q$INSERT INTO pantry_items (name, unit, qty_on_hand) VALUES ('Âm kho', 'kg', -1)$q$, 'ck_pantry_items__qty');
  PERFORM app_test.as_user(v_m1);
  ASSERT (SELECT stock_status FROM v_pantry_status WHERE name = 'Gạo') = 'ok' AND (SELECT stock_status FROM v_pantry_status WHERE name = 'Nước mắm') = 'low'
     AND (SELECT stock_status FROM v_pantry_status WHERE name = 'Dầu ăn') = 'urgent' AND (SELECT stock_status FROM v_pantry_status WHERE name = 'Muối') = 'ok', 'đủ / sắp hết (3 ≥ 40% của 5) / cần mua gấp (1 < 40% của 5) / không định mức = đủ';
  ASSERT NOT EXISTS (SELECT 1 FROM v_pantry_status WHERE name LIKE 'Hạt tiêu%'), 'mặt hàng ngưng dùng không hiện trong view';
  ASSERT app_test.rows_affected($q$UPDATE pantry_items SET qty_on_hand = 100$q$) = 0, 'thành viên thường không sửa được kho (RLS)';

  -- ===== Trực bếp (meal_menu_cooks): người đã đăng nhập đọc được, chỉ người quản lý bếp (meal.manage) ghi =====
  PERFORM app_test.as_user(v_head);
  INSERT INTO meal_menu_cooks (menu_id, member_id, role_label) VALUES (v_open, v_mem1, 'lead'), (v_open, v_mem2, 'assistant');
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_menu_cooks (menu_id, member_id, role_label) VALUES (%L, %L, 'lead')$q$, v_open, v_mem1), 'meal_menu_cooks_pkey');
  PERFORM app_test.expect_error(format($q$UPDATE meal_menu_cooks SET role_label = 'bep truong' WHERE menu_id = %L$q$, v_open), 'ck_meal_menu_cooks__role');
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM meal_menu_cooks') = 2, 'thành viên thường đọc được ai trực bếp';
  ASSERT app_test.rows_affected($q$UPDATE meal_menu_cooks SET role_label = 'shopper'$q$) = 0 AND app_test.rows_affected($q$DELETE FROM meal_menu_cooks$q$) = 0, 'thành viên thường không sửa/xóa phân công trực bếp (RLS)';
  PERFORM app_test.expect_error(format($q$INSERT INTO meal_menu_cooks (menu_id, member_id) VALUES (%L, %L)$q$, v_open, v_mem3), 'row-level security');

  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM pantry_items') = 0 AND app_test.n('SELECT 1 FROM meal_menus') = 0 AND app_test.n('SELECT 1 FROM meal_menu_cooks') = 0, 'phiên quên gắn user không thấy thực đơn/kho/phân công bếp';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11i OK — bữa ăn & kho bếp';
END $$;

-- ---------------------------------------------------------------------
-- S11j. Khoảnh khắc (album): chỉ thành viên có hồ sơ xem được; tác giả/người kiểm duyệt xóa mềm được; bảo vệ cột (BR-COM-06);
--       tệp ảnh đúng bucket & đúng người tải lên (BR-STO-05); bộ đếm ảnh/tim; tim chỉ của chính mình; thẻ tên cần người được gắn thẻ chấp nhận (BR-COM-07)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_tr uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_cat uuid; v_pub uuid; v_lead uuid; v_priv uuid; v_hid uuid; v_alb2 uuid; v_ids text;
  v_f1 uuid; v_f2 uuid; v_f3 uuid; v_f4 uuid; v_frc uuid; v_fm2 uuid; v_fav uuid; v_p1 uuid; v_p2 uuid;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_cat FROM categories WHERE kind = 'album' AND deleted_at IS NULL ORDER BY sort_order LIMIT 1;
  ASSERT v_cat IS NOT NULL, 'điều kiện nền: có danh mục album';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_albums__guard', 'trg_album_photos__guard', 'trg_album_member_tags__rules',
          'trg_album_photos__file_ref', 'trg_albums__file_ref', 'trg_members__avatar_ref')) = 6, 'đủ 6 trigger của khoảnh khắc (bảo vệ cột, thẻ tên, tham chiếu tệp)';
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('moments', 'khoanh-khac/m1-anh-0001.jpg', 1000, v_m1, 'uploaded') RETURNING id INTO v_f1;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('moments', 'khoanh-khac/m1-anh-0002.jpg', 1000, v_m1, 'uploaded') RETURNING id INTO v_f2;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('moments', 'khoanh-khac/m1-anh-0003.jpg', 1000, v_m1, 'pending_upload') RETURNING id INTO v_f3;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('moments', 'khoanh-khac/m1-anh-0004.jpg', 1000, v_m1, 'uploaded') RETURNING id INTO v_f4;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('receipts', 'hoa-don/m1-hoa-don-0001.jpg', 1000, v_m1, 'uploaded') RETURNING id INTO v_frc;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('moments', 'khoanh-khac/m2-anh-0001.jpg', 1000, v_m2, 'uploaded') RETURNING id INTO v_fm2;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('avatars', 'avatar/m1-0001.jpg', 1000, v_m1, 'uploaded') RETURNING id INTO v_fav;

  -- ===== Tạo album: RLS (tác giả = chính mình, có album.create) + bảo vệ cột + ràng buộc dữ liệu =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO albums (title, category_id, taken_on, author_member_id, tags) VALUES ('Dã ngoại Suối Tiên', v_cat, app.local_today() - 3, v_mem1, ARRAY['dangoai']) RETURNING id INTO v_pub;
  INSERT INTO albums (title, category_id, taken_on, author_member_id, visibility) VALUES ('Họp Ban điều hành', v_cat, app.local_today(), v_mem1, 'leadership') RETURNING id INTO v_lead;
  INSERT INTO albums (title, category_id, taken_on, author_member_id, visibility) VALUES ('Nháp riêng tư', v_cat, app.local_today(), v_mem1, 'private') RETURNING id INTO v_priv;
  INSERT INTO albums (title, category_id, taken_on, author_member_id) VALUES ('Giải bóng đá mùa hè', v_cat, app.local_today() - 10, v_mem1) RETURNING id INTO v_hid;
  ASSERT (SELECT likes_count = 0 AND photos_count = 0 AND NOT is_featured AND status = 'published' AND visibility = 'community' AND version = 1 FROM albums WHERE id = v_pub), 'album mới: công khai trong cộng đoàn, không nổi bật, bộ đếm 0';
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id) VALUES ('ab', %L, app.local_today(), %L)$q$, v_cat, v_mem1), 'ck_albums__title');
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id, visibility) VALUES ('Công khai toàn cầu', %L, app.local_today(), %L, 'public')$q$, v_cat, v_mem1), 'ck_albums__visibility');
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id, is_featured) VALUES ('Tự đặt nổi bật', %L, app.local_today(), %L, true)$q$, v_cat, v_mem1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id, likes_count) VALUES ('Tự bơm tim', %L, app.local_today(), %L, 50)$q$, v_cat, v_mem1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id, status) VALUES ('Tự ẩn bài', %L, app.local_today(), %L, 'hidden')$q$, v_cat, v_mem1), 'BR-COM-06');
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id) VALUES ('Mạo danh tác giả', %L, app.local_today(), %L)$q$, v_cat, v_mem1), 'row-level security');
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$INSERT INTO albums (title, category_id, taken_on, author_member_id) VALUES ('Admin không có hồ sơ', %L, app.local_today(), %L)$q$, v_cat, v_mem1), 'row-level security');

  -- ===== Ai xem được album nào: công khai (mọi thành viên) / chỉ lãnh đạo (album.moderate, member.private.read) / riêng tư (tác giả + album.moderate) =====
  v_ids := format('%L', ARRAY[v_pub, v_lead, v_priv]);
  PERFORM app_test.as_anon();
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 0, 'phiên quên gắn user không thấy album nào (ảnh có người)';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 0, 'tài khoản kỹ thuật không có hồ sơ thành viên không xem được ảnh cộng đoàn';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 1 AND app_test.n(format('SELECT 1 FROM albums WHERE id = %L', v_pub)) = 1, 'thành viên thường chỉ thấy album công khai';
  PERFORM app_test.as_user(v_tr);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 1, 'Thủ quỹ (không có album.moderate / member.private.read) chỉ thấy album công khai';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 3, 'Trưởng nhà (album.moderate) thấy cả album chỉ-lãnh-đạo và riêng tư';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 3, 'Phó nhà (album.moderate) thấy cả ba';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%s)', v_ids)) = 3, 'tác giả thấy mọi album của mình';

  -- ===== Kiểm duyệt: chỉ album.moderate đặt nổi bật / ẩn; tác giả sửa nội dung bình thường nhưng không bỏ ẩn, không sửa bộ đếm =====
  PERFORM app_test.expect_error(format($q$UPDATE albums SET is_featured = true WHERE id = %L$q$, v_pub), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE albums SET likes_count = 500 WHERE id = %L$q$, v_pub), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE albums SET photos_count = 9 WHERE id = %L$q$, v_pub), 'BR-COM-06');
  UPDATE albums SET description = 'Ảnh chuyến dã ngoại cuối tháng', tags = ARRAY['dangoai', 'thang10'] WHERE id = v_pub;
  ASSERT (SELECT version = 2 FROM albums WHERE id = v_pub), 'tác giả sửa nội dung album bình thường (version tăng)';
  PERFORM app_test.as_user(v_vice);
  UPDATE albums SET is_featured = true WHERE id = v_pub;
  UPDATE albums SET status = 'hidden' WHERE id = v_hid;
  ASSERT (SELECT is_featured FROM albums WHERE id = v_pub) AND (SELECT status = 'hidden' FROM albums WHERE id = v_hid), 'người kiểm duyệt đặt nổi bật / ẩn được';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = %L', v_hid)) = 0, 'album bị người kiểm duyệt ẩn: người khác không thấy';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = %L', v_hid)) = 1, 'tác giả vẫn thấy album bị ẩn của mình';
  PERFORM app_test.expect_error(format($q$UPDATE albums SET status = 'published' WHERE id = %L$q$, v_hid), 'BR-COM-06');

  -- ===== Xóa mềm = UPDATE … SET deleted_at (chính sách SELECT áp lên cả dòng MỚI): tác giả xóa của mình, người kiểm duyệt xóa album vi phạm =====
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE albums SET deleted_at = now() WHERE id = %L$q$, v_pub)) = 0, 'thành viên khác không xóa được album của người ta';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected(format($q$UPDATE albums SET deleted_at = now() WHERE id = %L$q$, v_priv)) = 1, 'tác giả xóa mềm album của mình';
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = %L AND deleted_at IS NULL', v_priv)) = 0, 'API lọc deleted_at IS NULL ⇒ album đã xóa không còn trong danh sách';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.rows_affected(format($q$UPDATE albums SET deleted_at = now() WHERE id = %L$q$, v_hid)) = 1, 'người kiểm duyệt xóa mềm album vi phạm';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM albums WHERE id = ANY(%L)', ARRAY[v_priv, v_hid])) = 0, 'album đã xóa mềm biến mất với người khác';

  -- ===== Ảnh: tệp đúng bucket moments, đã tải lên xong, do chính mình tải (BR-STO-05); bộ đếm do trigger; bảo vệ cột (BR-COM-06) =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO album_photos (album_id, file_id, caption, uploaded_by_member_id) VALUES (v_pub, v_f1, 'Cả nhóm trước cổng', v_mem1) RETURNING id INTO v_p1;
  INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id, sort_order) VALUES (v_pub, v_f2, v_mem1, 1) RETURNING id INTO v_p2;
  ASSERT (SELECT photos_count FROM albums WHERE id = v_pub) = 2, 'photos_count = 2 (trigger SECURITY DEFINER)';
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_pub, v_f1, v_mem1), 'ux_album_photos__file');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_pub, v_frc, v_mem1), 'bucket moments');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_pub, v_f3, v_mem1), 'chưa tải lên xong');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_pub, v_fm2, v_mem1), 'BR-STO-05');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id, caption) VALUES (%L, %L, %L, repeat('x', 501))$q$, v_pub, v_f4, v_mem1), 'ck_album_photos__caption');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id, likes_count) VALUES (%L, %L, %L, 3)$q$, v_pub, v_f4, v_mem1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_pub, v_f4, v_mem2), 'row-level security');
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_pub, v_fm2, v_mem2), 'row-level security');
  -- tệp của m1 đã gắn vào ảnh công khai nên m2 NHÌN THẤY được; vẫn không được dùng làm ảnh/ảnh bìa của m2 (BR-STO-05: chỉ dùng tệp do chính mình tải lên)
  INSERT INTO albums (title, category_id, taken_on, author_member_id) VALUES ('Album của Văn Hiếu', v_cat, app.local_today(), v_mem2) RETURNING id INTO v_alb2;
  ASSERT app_test.n(format('SELECT 1 FROM storage_files WHERE id = %L', v_f1)) = 1, 'điều kiện nền: m2 thấy tệp đã gắn vào ảnh công khai của m1';
  PERFORM app_test.expect_error(format($q$INSERT INTO album_photos (album_id, file_id, uploaded_by_member_id) VALUES (%L, %L, %L)$q$, v_alb2, v_f1, v_mem2), 'chỉ được dùng tệp do chính mình tải lên');
  PERFORM app_test.expect_error(format($q$UPDATE albums SET cover_file_id = %L WHERE id = %L$q$, v_f1, v_alb2), 'chỉ được dùng tệp do chính mình tải lên');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE album_photos SET likes_count = 500 WHERE id = %L$q$, v_p1), 'BR-COM-06');
  PERFORM app_test.expect_error(format($q$UPDATE album_photos SET status = 'hidden' WHERE id = %L$q$, v_p1), 'BR-COM-06');
  UPDATE album_photos SET caption = 'Cả nhóm trước cổng trường' WHERE id = v_p1;

  -- ===== Tim: chỉ của chính mình, chỉ với album/ảnh nhìn thấy được; bộ đếm do trigger =====
  PERFORM app_test.as_user(v_m2);
  INSERT INTO album_likes (album_id, member_id) VALUES (v_pub, v_mem2);
  INSERT INTO photo_likes (photo_id, member_id) VALUES (v_p1, v_mem2);
  ASSERT (SELECT likes_count FROM albums WHERE id = v_pub) = 1 AND (SELECT likes_count FROM album_photos WHERE id = v_p1) = 1, 'bộ đếm tim album/ảnh = 1';
  PERFORM app_test.expect_error(format($q$INSERT INTO album_likes (album_id, member_id) VALUES (%L, %L)$q$, v_pub, v_mem2), 'album_likes_pkey');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_likes (album_id, member_id) VALUES (%L, %L)$q$, v_pub, v_mem3), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_likes (album_id, member_id) VALUES (%L, %L)$q$, v_lead, v_mem2), 'row-level security');
  PERFORM app_test.as_user(v_m3);
  INSERT INTO album_likes (album_id, member_id) VALUES (v_pub, v_mem3);
  ASSERT (SELECT likes_count FROM albums WHERE id = v_pub) = 2 AND app_test.n('SELECT 1 FROM album_likes') = 1 AND app_test.n('SELECT 1 FROM photo_likes') = 0, 'm3 chỉ thấy tim của chính mình; album có 2 tim';
  DELETE FROM album_likes WHERE album_id = v_pub AND member_id = v_mem3;
  ASSERT (SELECT likes_count FROM albums WHERE id = v_pub) = 1, 'bỏ tim ⇒ bộ đếm giảm';

  -- ===== Thẻ tên (BR-COM-07): người gắn thẻ chỉ tạo thẻ pending; người được gắn thẻ mới chấp nhận/từ chối =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id) VALUES (v_pub, v_mem2, v_mem1);
  ASSERT (SELECT status = 'pending' AND responded_at IS NULL FROM album_member_tags WHERE member_id = v_mem2), 'thẻ mới tạo ở trạng thái pending';
  PERFORM app_test.expect_error(format($q$INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id, status) VALUES (%L, %L, %L, 'accepted')$q$, v_pub, v_mem3, v_mem1), 'BR-COM-07');
  PERFORM app_test.expect_error(format($q$INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id, responded_at) VALUES (%L, %L, %L, now())$q$, v_pub, v_mem3, v_mem1), 'BR-COM-07');
  PERFORM app_test.expect_error(format($q$UPDATE album_member_tags SET status = 'accepted', responded_at = now() WHERE album_id = %L AND member_id = %L$q$, v_pub, v_mem2), 'BR-COM-07');
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM album_member_tags') = 0, 'thẻ pending: người ngoài không thấy';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM album_member_tags') = 1, 'người được gắn thẻ thấy thẻ của mình';
  UPDATE album_member_tags SET status = 'accepted', responded_at = now() WHERE album_id = v_pub AND member_id = v_mem2;
  PERFORM app_test.expect_error(format($q$UPDATE album_member_tags SET member_id = %L WHERE album_id = %L AND member_id = %L$q$, v_mem3, v_pub, v_mem2), 'BR-COM-07');
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM album_member_tags') = 1, 'thẻ đã được chấp nhận: người xem album thấy';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE album_member_tags SET status = 'declined' WHERE album_id = %L AND member_id = %L$q$, v_pub, v_mem2), 'BR-COM-07');
  PERFORM app_test.as_user(v_m2);
  UPDATE album_member_tags SET status = 'declined', responded_at = now() WHERE album_id = v_pub AND member_id = v_mem2;
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n('SELECT 1 FROM album_member_tags') = 0, 'thẻ bị từ chối: người ngoài không còn thấy';
  PERFORM app_test.as_user(v_vice);
  UPDATE album_member_tags SET status = 'accepted', responded_at = now() WHERE album_id = v_pub AND member_id = v_mem2;
  UPDATE album_member_tags SET status = 'declined' WHERE album_id = v_pub AND member_id = v_mem2;
  -- Đã đồng ý photo_tagging ⇒ thẻ được accepted ngay; rút đồng ý ⇒ trở lại quy tắc pending
  PERFORM app_test.as_super();
  INSERT INTO consents (member_id, purpose_code, policy_version, method) VALUES (v_mem3, 'photo_tagging', (SELECT current_version FROM consent_purposes WHERE code = 'photo_tagging'), 'in_app');
  PERFORM app_test.as_user(v_m1);
  INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id, status, responded_at) VALUES (v_pub, v_mem3, v_mem1, 'accepted', now());
  PERFORM app_test.as_super();
  UPDATE consents SET withdrawn_at = now() WHERE member_id = v_mem3 AND purpose_code = 'photo_tagging';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id, status) VALUES (%L, %L, %L, 'accepted')$q$, v_lead, v_mem3, v_mem1), 'BR-COM-07');
  -- Gỡ thẻ: tác giả gỡ thẻ đã gắn; người bị gắn thẻ tự gỡ thẻ của mình; người khác không gỡ được
  INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id) VALUES (v_pub, v_mem4, v_mem1);
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.rows_affected(format($q$DELETE FROM album_member_tags WHERE album_id = %L AND member_id = %L$q$, v_pub, v_mem4)) = 0, 'm3 không gỡ thẻ của người khác';
  PERFORM app_test.as_user(v_m4);
  ASSERT app_test.rows_affected(format($q$DELETE FROM album_member_tags WHERE album_id = %L AND member_id = %L$q$, v_pub, v_mem4)) = 1, 'người bị gắn thẻ tự gỡ thẻ của mình';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id) VALUES (v_pub, v_mem4, v_mem1);
  ASSERT app_test.rows_affected(format($q$DELETE FROM album_member_tags WHERE album_id = %L AND member_id = %L$q$, v_pub, v_mem4)) = 1, 'tác giả gỡ thẻ đã gắn';

  -- ===== Ẩn / xóa mềm ảnh =====
  PERFORM app_test.as_user(v_vice);
  UPDATE album_photos SET status = 'hidden' WHERE id = v_p2;
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM album_photos WHERE album_id = %L', v_pub)) = 1, 'ảnh bị ẩn: người khác chỉ còn thấy 1 ảnh';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM album_photos WHERE album_id = %L', v_pub)) = 2, 'người tải lên vẫn thấy ảnh bị ẩn của mình';
  PERFORM app_test.expect_error(format($q$UPDATE album_photos SET status = 'published' WHERE id = %L$q$, v_p2), 'BR-COM-06');
  ASSERT app_test.rows_affected(format($q$UPDATE album_photos SET deleted_at = now() WHERE id = %L$q$, v_p1)) = 1, 'người tải lên xóa mềm ảnh của mình';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM album_photos WHERE album_id = %L', v_pub)) = 0, 'ảnh đã xóa mềm biến mất với người khác';
  ASSERT app_test.rows_affected(format($q$UPDATE album_photos SET deleted_at = now() WHERE id = %L$q$, v_p2)) = 0, 'm2 không xóa được ảnh của người khác';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.rows_affected(format($q$UPDATE album_photos SET deleted_at = now() WHERE id = %L$q$, v_p2)) = 1, 'người kiểm duyệt xóa mềm ảnh vi phạm';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM album_photos') = 0 AND app_test.n('SELECT 1 FROM album_member_tags') = 0 AND app_test.n('SELECT 1 FROM album_likes') = 0 AND app_test.n('SELECT 1 FROM photo_likes') = 0,
         'phiên quên gắn user không thấy ảnh/thẻ/tim';

  -- ===== Ảnh bìa & ảnh đại diện (tham chiếu tệp bằng khóa ngoại): cùng quy tắc BR-STO-05 =====
  PERFORM app_test.as_user(v_m1);
  UPDATE albums SET cover_file_id = v_f1 WHERE id = v_pub;
  PERFORM app_test.expect_error(format($q$UPDATE albums SET cover_file_id = %L WHERE id = %L$q$, v_frc, v_pub), 'bucket moments');
  PERFORM app_test.expect_error(format($q$UPDATE albums SET cover_file_id = %L WHERE id = %L$q$, v_fm2, v_pub), 'BR-STO-05');
  UPDATE members SET avatar_file_id = v_fav WHERE id = v_mem1;
  PERFORM app_test.expect_error(format($q$UPDATE members SET avatar_file_id = %L WHERE id = %L$q$, v_frc, v_mem1), 'bucket avatars');
  PERFORM app_test.expect_error(format($q$UPDATE members SET avatar_file_id = %L WHERE id = %L$q$, v_f2, v_mem1), 'bucket avatars');
  UPDATE members SET avatar_file_id = NULL WHERE id = v_mem1;
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11j OK — khoảnh khắc (album)';
END $$;

-- ---------------------------------------------------------------------
-- S11k. Xóa mềm (UPDATE … SET deleted_at) ở các bảng ngoài phân hệ cộng đoàn — cùng lớp lỗi với S11d/S11e/S11j: chính sách SELECT áp lên cả dòng MỚI
--       của UPDATE nên người được quyền sửa phải còn "nhìn thấy" dòng vừa xóa (người khác thì không thấy, không xóa được)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  v_g1 uuid; v_g2 uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid; v_sp uuid; v_uni uuid; v_u uuid;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_uni FROM universities WHERE deleted_at IS NULL ORDER BY code LIMIT 1;
  -- Người liên lạc khẩn cấp / giám hộ: chính chủ xóa mềm; Trưởng nhà (member.private.write) xóa hộ; người khác không thấy/không xóa
  PERFORM app_test.as_user(v_m1);
  INSERT INTO member_guardians (member_id, relation, full_name) VALUES (v_mem1, 'mother', 'Nguyễn Thị Mai') RETURNING id INTO v_g1;
  INSERT INTO member_guardians (member_id, relation, full_name) VALUES (v_mem1, 'father', 'Nguyễn Văn Nam') RETURNING id INTO v_g2;
  ASSERT app_test.rows_affected(format($q$UPDATE member_guardians SET deleted_at = now() WHERE id = %L$q$, v_g1)) = 1, 'chính chủ xóa mềm người liên lạc của mình';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.rows_affected(format($q$UPDATE member_guardians SET deleted_at = now() WHERE id = %L$q$, v_g2)) = 0, 'người khác không xóa được người liên lạc của m1';
  ASSERT app_test.n(format('SELECT 1 FROM member_guardians WHERE id = ANY(%L)', ARRAY[v_g1, v_g2])) = 0, 'người khác không thấy người liên lạc của m1';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.rows_affected(format($q$UPDATE member_guardians SET deleted_at = now() WHERE id = %L$q$, v_g2)) = 1, 'Trưởng nhà xóa mềm hộ';

  -- Suy niệm (bài viết phụng vụ): tác giả xóa mềm bài của mình; người quản lý phụng vụ (liturgy.manage) xóa hộ
  PERFORM app_test.as_user(v_m1);
  INSERT INTO reflections (author_member_id, body) VALUES (v_mem1, 'Suy niệm Chúa nhật: hãy sống tỉnh thức và yêu thương.') RETURNING id INTO v_r1;
  INSERT INTO reflections (author_member_id, body) VALUES (v_mem1, 'Một bài suy niệm khác của cùng tác giả.') RETURNING id INTO v_r2;
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM reflections WHERE id = ANY(%L)', ARRAY[v_r1, v_r2])) = 2, 'bài đã đăng ai cũng đọc được';
  ASSERT app_test.rows_affected(format($q$UPDATE reflections SET deleted_at = now() WHERE id = %L$q$, v_r1)) = 0, 'người khác không xóa được bài của m1';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected(format($q$UPDATE reflections SET deleted_at = now() WHERE id = %L$q$, v_r1)) = 1, 'tác giả xóa mềm bài suy niệm của mình';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.rows_affected(format($q$UPDATE reflections SET deleted_at = now() WHERE id = %L$q$, v_r2)) = 1, 'Phó nhà (liturgy.manage) xóa mềm hộ';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM reflections WHERE id = ANY(%L)', ARRAY[v_r1, v_r2])) = 0, 'bài đã xóa mềm biến mất với người khác';
  -- bài còn hiệu lực: phiên quên gắn user / người dùng chưa có vai trò không đọc được (và để S12e3 thấy bảng có dữ liệu)
  PERFORM app_test.as_user(v_m1);
  INSERT INTO reflections (author_member_id, body) VALUES (v_mem1, 'Suy niệm còn hiệu lực: bài đang được đăng.') RETURNING id INTO v_r3;
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM reflections') = 0, 'phiên quên gắn user không đọc được suy niệm';

  -- Hồ sơ học vụ: chính chủ xóa mềm; người có member.update xóa hộ
  PERFORM app_test.as_user(v_m4);
  INSERT INTO student_profiles (member_id, university_id) VALUES (v_mem4, v_uni) RETURNING id INTO v_sp;
  ASSERT app_test.rows_affected(format($q$UPDATE student_profiles SET deleted_at = now() WHERE id = %L$q$, v_sp)) = 1, 'chính chủ xóa mềm hồ sơ học vụ của mình';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM student_profiles WHERE id = %L', v_sp)) = 0, 'người khác không thấy hồ sơ học vụ đã xóa';
  PERFORM app_test.as_user(v_head);
  UPDATE student_profiles SET deleted_at = NULL WHERE id = v_sp;
  ASSERT app_test.rows_affected(format($q$UPDATE student_profiles SET deleted_at = now() WHERE id = %L$q$, v_sp)) = 1, 'Trưởng nhà (member.update) khôi phục rồi xóa mềm hộ';

  -- Danh mục trường đại học: người có academic.scale.manage xóa mềm; thành viên thường không thấy trường đã xóa và không xóa được trường khác
  PERFORM app_test.as_user(v_head);
  INSERT INTO universities (code, name) VALUES ('TESTU', 'Đại học Thử nghiệm') RETURNING id INTO v_u;
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM universities WHERE id = %L', v_u)) = 1 AND app_test.rows_affected(format($q$UPDATE universities SET deleted_at = now() WHERE id = %L$q$, v_u)) = 0, 'thành viên thường thấy trường nhưng không xóa được';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.rows_affected(format($q$UPDATE universities SET deleted_at = now() WHERE id = %L$q$, v_u)) = 1, 'người quản lý danh mục xóa mềm trường';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM universities WHERE id = %L', v_u)) = 0, 'trường đã xóa mềm biến mất với thành viên thường';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11k OK — xóa mềm ở người liên lạc, suy niệm, hồ sơ học vụ, trường đại học';
END $$;

-- ---------------------------------------------------------------------
-- S11l. Mục tiêu học tập (study_goals): riêng tư chỉ chính chủ; chia sẻ cộng đoàn chỉ thành viên có hồ sơ; chia sẻ lãnh đạo cần academic.read_all
--       (cùng lớp lỗi "nhánh chính sách không đòi danh tính" với albums/reflections: trước đây visibility = community mở cho cả phiên quên gắn user)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1';
  v_sems uuid[]; v_ids uuid[];
BEGIN
  PERFORM app_test.as_super();
  SELECT array_agg(id) INTO v_sems FROM (SELECT id FROM semesters ORDER BY code, id LIMIT 3) s;
  ASSERT cardinality(v_sems) = 3, 'điều kiện nền: có ít nhất 3 học kỳ';
  PERFORM app_test.as_user(v_m1);
  INSERT INTO study_goals (member_id, semester_id, goals, difficulties, visibility) VALUES (v_mem1, v_sems[1], 'Đạt GPA 3.2', 'Thiếu thời gian tự học', 'private');
  INSERT INTO study_goals (member_id, semester_id, goals, visibility) VALUES (v_mem1, v_sems[2], 'Hoàn thành đồ án đúng hạn', 'community');
  INSERT INTO study_goals (member_id, semester_id, goals, visibility) VALUES (v_mem1, v_sems[3], 'Xin học bổng', 'leadership');
  SELECT array_agg(id) INTO v_ids FROM study_goals WHERE member_id = v_mem1;
  ASSERT app_test.n(format('SELECT 1 FROM study_goals WHERE id = ANY(%L)', v_ids)) = 3, 'chính chủ thấy cả ba';
  PERFORM app_test.expect_error(format($q$INSERT INTO study_goals (member_id, semester_id, visibility) VALUES (%L, %L, 'public')$q$, v_mem1, v_sems[1]), 'ck_study_goals__visibility');
  PERFORM app_test.expect_error(format($q$INSERT INTO study_goals (member_id, semester_id) VALUES (%L, %L)$q$, v_mem1, v_sems[1]), 'ux_study_goals__member_semester');
  PERFORM app_test.as_anon();
  ASSERT app_test.n(format('SELECT 1 FROM study_goals WHERE id = ANY(%L)', v_ids)) = 0, 'phiên quên gắn user không đọc được mục tiêu học tập (kể cả loại chia sẻ cộng đoàn)';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n(format('SELECT 1 FROM study_goals WHERE id = ANY(%L)', v_ids)) = 0, 'tài khoản kỹ thuật không có hồ sơ thành viên không đọc được';
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM study_goals WHERE id = ANY(%L)', v_ids)) = 1 AND app_test.n(format($q$SELECT 1 FROM study_goals WHERE id = ANY(%L) AND visibility = 'community'$q$, v_ids)) = 1,
         'thành viên thường chỉ thấy mục tiêu chia sẻ cộng đoàn';
  ASSERT app_test.rows_affected(format($q$UPDATE study_goals SET visibility = 'community' WHERE id = ANY(%L)$q$, v_ids)) = 0, 'thành viên khác không sửa được';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n(format('SELECT 1 FROM study_goals WHERE id = ANY(%L)', v_ids)) = 2 AND app_test.n(format($q$SELECT 1 FROM study_goals WHERE id = ANY(%L) AND visibility = 'private'$q$, v_ids)) = 0,
         'Trưởng nhà (academic.read_all) thấy loại cộng đoàn + lãnh đạo, không thấy loại riêng tư';
  PERFORM app_test.as_user(v_vice);
  ASSERT app_test.n(format('SELECT 1 FROM study_goals WHERE id = ANY(%L)', v_ids)) = 2, 'Phó nhà (academic.read_all) cũng vậy';
  PERFORM app_test.as_super();
  RAISE NOTICE 'S11l OK — mục tiêu học tập chia sẻ theo mức';
END $$;

-- ---------------------------------------------------------------------
-- S12a. Tệp & đính kèm: đăng ký tải lên, giới hạn cứng, BR-STO-02/03/04, đính kèm đa hình theo quyền sở hữu thực thể
-- ---------------------------------------------------------------------
-- Tạo một tệp "đã tải lên xong" dưới danh nghĩa người đang đăng nhập (đúng đường đi thật: pending_upload → uploaded, qua RLS + trigger)
CREATE FUNCTION app_test.up(p_bucket storage_bucket_t, p_name text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := app.uuid_v7();
BEGIN
  INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, size_bytes, uploaded_by)
  VALUES (v, p_bucket, 'u/' || v::text || '/' || p_name, p_name, 'image/jpeg', 250000, app.current_user_id());
  UPDATE storage_files SET status = 'uploaded' WHERE id = v;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION app_test.up(storage_bucket_t, text) TO luuxa_app;

DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3';
  v_treas uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_cat uuid; v_forum uuid; v_cash uuid; v_iss uuid; v_pend uuid := app.uuid_v7(); v_f1 uuid; v_f2 uuid; v_fw uuid; v_fo uuid; v_fa uuid;
  v_v uuid; v_p1 uuid; v_p2 uuid; v_dup uuid;
BEGIN
  PERFORM app_test.as_super();
  SELECT id INTO v_cat FROM categories WHERE kind = 'expense' AND code = 'FOOD';
  SELECT id INTO v_forum FROM categories WHERE kind = 'forum' AND code = 'FORUM_FOOD';
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';
  SELECT id INTO v_iss FROM maintenance_issues WHERE title = 'Bóng đèn hành lang T2 cháy';

  -- ===== Đăng ký tải lên (presign): chỉ cho chính mình, trạng thái pending_upload, giới hạn cứng của DB =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, size_bytes, uploaded_by)
  VALUES (v_pend, 'receipts', 'u/' || v_pend::text || '/hoa-don.jpg', 'hoa-don.jpg', 'image/jpeg', 250000, v_m1);
  ASSERT (SELECT status = 'pending_upload' AND scan_status = 'pending' AND attached_at IS NULL AND sha256 IS NULL FROM storage_files WHERE id = v_pend), 'tệp mới: pending_upload, chưa quét, chưa gắn, chưa có băm';
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by) VALUES ('receipts', 'u/x/giamao.jpg', 1000, %L)$q$, v_m2), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status) VALUES ('receipts', 'u/x/ready1.jpg', 1000, %L, 'ready')$q$, v_m1), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by) VALUES ('receipts', 'u/x/qua-lon.jpg', %s, %L)$q$, 20 * 1024 * 1024 + 1, v_m1), 'ck_storage_files__size');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by) VALUES ('receipts', 'u/x/rong.jpg', 0, %L)$q$, v_m1), 'ck_storage_files__size');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by) VALUES ('receipts', 'u/x', 1000, %L)$q$, v_m1), 'ck_storage_files__key_len');
  -- BR-STO-04 (INSERT): client không tự khai thuộc tính kiểm chứng (băm, MIME thực, pHash, thời điểm chụp, kết quả quét)
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, scan_status) VALUES ('receipts', 'u/x/tu-khai-sach.jpg', 1000, %L, 'clean')$q$, v_m1), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, sha256) VALUES ('receipts', 'u/x/tu-khai-bam.jpg', 1000, %L, repeat('a', 64))$q$, v_m1), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, detected_mime) VALUES ('receipts', 'u/x/tu-khai-mime.jpg', 1000, %L, 'image/jpeg')$q$, v_m1), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, taken_at) VALUES ('receipts', 'u/x/tu-khai-gio-chup.jpg', 1000, %L, now())$q$, v_m1), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, phash) VALUES ('receipts', 'u/x/tu-khai-phash.jpg', 1000, %L, 42)$q$, v_m1), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$UPDATE storage_files SET taken_at = now() WHERE id = %L$q$, v_pend), 'BR-STO-04');
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, detected_mime) VALUES ('receipts', 'u/x/ma-doc.exe', 1000, %L, 'application/x-msdownload')$q$, v_m1), 'ck_storage_files__mime');   -- danh sách MIME cho phép là CHECK của DB
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by) VALUES ('receipts', 'u/%s/hoa-don.jpg', 1000, %L)$q$, v_pend, v_m1), 'ux_storage_files__bucket_key');
  PERFORM app_test.as_super();
  PERFORM app_test.expect_error($q$UPDATE settings SET value = '30000000'::jsonb WHERE key = 'upload.max_image_bytes'$q$, 'ngoài giới hạn');   -- trần mềm trong settings không vượt trần cứng 20 MB

  -- ===== BR-STO-04: người dùng chỉ xác nhận tải xong; thuộc tính kiểm chứng và các bước xử lý do worker =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE storage_files SET status = 'ready' WHERE id = %L$q$, v_pend), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$UPDATE storage_files SET sha256 = repeat('b', 64) WHERE id = %L$q$, v_pend), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$UPDATE storage_files SET scan_status = 'clean' WHERE id = %L$q$, v_pend), 'BR-STO-04');
  PERFORM app_test.expect_error(format($q$UPDATE storage_files SET bucket = 'documents' WHERE id = %L$q$, v_pend), 'BR-STO-04');
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE storage_files SET status = 'uploaded' WHERE id = %L$q$, v_pend)) = 0, 'm2 không xác nhận hộ tệp của m1 (RLS)';
  PERFORM app_test.as_user(v_m1);
  UPDATE storage_files SET status = 'uploaded' WHERE id = v_pend;
  ASSERT app_test.rows_affected(format($q$UPDATE storage_files SET original_name = 'doi-ten.jpg' WHERE id = %L$q$, v_pend)) = 0, 'đã xác nhận tải xong ⇒ người dùng không sửa được bản ghi tệp';
  PERFORM app_test.as_worker();
  UPDATE storage_files SET status = 'processing' WHERE id = v_pend;
  PERFORM app_test.expect_error(format($q$UPDATE storage_files SET status = 'ready' WHERE id = %L$q$, v_pend), 'ck_storage_files__ready_needs_hash');
  UPDATE storage_files SET status = 'ready', sha256 = repeat('c', 64), detected_mime = 'image/jpeg', phash = 123456789, scan_status = 'clean', width_px = 800, height_px = 600 WHERE id = v_pend;
  ASSERT (SELECT status = 'ready' AND scan_status = 'clean' FROM storage_files WHERE id = v_pend), 'worker hoàn tất xử lý: ready + băm + quét sạch';

  -- ===== Đính kèm vào phiếu chi (receipts): trạng thái tệp, đúng bucket (BR-STO-02), đúng chủ tệp (BR-STO-03), đúng chủ thực thể =====
  PERFORM app_test.as_user(v_m1);
  v_f1 := app_test.up('receipts', 'hoa-don-gao.jpg');
  v_fw := app_test.up('maintenance', 'anh-hien-truong.jpg');
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, requested_by) VALUES ('Mua gạo lớn tháng này', 250000, v_cat, app.local_today(), v_cash, v_m1) RETURNING id INTO v_v;
  PERFORM app_test.expect_error(format($q$SELECT app.fn_submit_expense(%L)$q$, v_v), 'BR-FIN-03');
  v_dup := app.uuid_v7();
  INSERT INTO storage_files (id, bucket, object_key, size_bytes, uploaded_by) VALUES (v_dup, 'receipts', 'u/' || v_dup::text || '/chua-tai-xong.jpg', 1000, v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'expense_voucher', %L, 'receipt')$q$, v_dup, v_v), 'Tệp chưa tải lên xong');
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'expense_voucher', %L, 'receipt')$q$, v_fw, v_v), 'BR-STO-02');
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'expense_voucher', app.uuid_v7(), 'receipt')$q$, v_f1), 'không tồn tại');
  PERFORM app_test.as_user(v_m2);
  v_fo := app_test.up('receipts', 'hoa-don-cua-m2.jpg');
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'expense_voucher', %L, 'receipt')$q$, v_fo, v_v), 'row-level security');
  PERFORM app_test.as_user(v_m1);
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, caption) VALUES (v_f1, 'expense_voucher', v_v, 'receipt', 'Hóa đơn chợ');
  ASSERT (SELECT attached_by = v_m1 FROM media_attachments WHERE file_id = v_f1), 'attached_by lấy từ ngữ cảnh đăng nhập';
  PERFORM app_test.as_super();
  ASSERT (SELECT attached_at IS NOT NULL FROM storage_files WHERE id = v_f1), 'gắn xong ⇒ tệp có attached_at (không bị dọn như tệp mồ côi)';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'expense_voucher', %L, 'receipt')$q$, v_f1, v_v), 'ux_media_attachments__entity_file');
  PERFORM app.fn_submit_expense(v_v);          -- có ảnh hóa đơn ⇒ qua BR-FIN-03
  v_f2 := app_test.up('receipts', 'hoa-don-bo-sung.jpg');
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'expense_voucher', %L, 'receipt')$q$, v_f2, v_v), 'row-level security');
  ASSERT app_test.rows_affected(format($q$DELETE FROM media_attachments WHERE entity_id = %L$q$, v_v)) = 0, 'phiếu đã nộp ⇒ không gỡ/thêm ảnh hóa đơn được nữa';
  -- Quyền xem tệp = quyền xem thực thể đích
  PERFORM app_test.as_user(v_treas);
  ASSERT app_test.n(format('SELECT 1 FROM media_attachments WHERE entity_id = %L', v_v)) = 1 AND app_test.n(format('SELECT 1 FROM storage_files WHERE id = %L', v_f1)) = 1, 'Thủ quỹ (xem được phiếu chi) xem được ảnh hóa đơn';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n(format('SELECT 1 FROM media_attachments WHERE entity_id = %L', v_v)) = 0 AND app_test.n(format('SELECT 1 FROM storage_files WHERE id = %L', v_f1)) = 0, 'thành viên khác không xem được hóa đơn của m1';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n(format('SELECT 1 FROM media_attachments WHERE entity_id = %L', v_v)) = 0, 'Admin kỹ thuật không xem được ảnh hóa đơn (tách quyền tài chính)';

  -- ===== BR-STO-03: không gắn lại tệp của người khác (kể cả tệp đã công khai trong một bài viết) =====
  PERFORM app_test.as_user(v_m2);
  INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ('Công thức nước chấm', 'Xem ảnh đính kèm', v_forum, v_mem2) RETURNING id INTO v_p2;
  v_fa := app_test.up('attachments', 'cong-thuc.jpg');
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (v_fa, 'forum_post', v_p2, 'attachment');
  PERFORM app_test.as_user(v_m1);
  INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ('Bài của m1', 'Tôi cũng muốn dùng ảnh đó', v_forum, v_mem1) RETURNING id INTO v_p1;
  ASSERT app_test.n(format('SELECT 1 FROM storage_files WHERE id = %L', v_fa)) = 1, 'tệp đã gắn vào bài công khai thì m1 thấy được';
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'forum_post', %L, 'attachment')$q$, v_fa, v_p1), 'BR-STO-03');

  -- ===== Ảnh hiện trường sự cố: người báo hoặc nhân sự triage; người khác không =====
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (v_fw, 'maintenance_issue', v_iss, 'before_photo');
  PERFORM app_test.as_user(v_vice);
  v_fa := app_test.up('maintenance', 'anh-sau-sua.jpg');
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (v_fa, 'maintenance_issue', v_iss, 'after_photo');
  PERFORM app_test.as_user(v_m2);
  v_fo := app_test.up('maintenance', 'anh-cua-m2.jpg');
  PERFORM app_test.expect_error(format($q$INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (%L, 'maintenance_issue', %L, 'before_photo')$q$, v_fo, v_iss), 'row-level security');
  ASSERT app_test.n(format('SELECT 1 FROM media_attachments WHERE entity_id = %L', v_iss)) = 2, 'ảnh hiện trường (trước/sau) công khai theo phiếu báo hỏng';

  -- ===== Bất biến đa hình: mọi loại thực thể đều có bucket quy định; id ngẫu nhiên không tồn tại/không sửa được với mọi loại =====
  ASSERT NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::attachment_entity_t)) AS e WHERE app.expected_bucket(e) IS NULL), 'mọi attachment_entity_t đều có bucket quy định (expected_bucket)';
  PERFORM app_test.as_user(v_m1);       -- thành viên thường: không có event.manage/policy.manage/issue.cost.propose
  ASSERT NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::attachment_entity_t)) AS e WHERE app.entity_exists(e, app.uuid_v7()) OR app.can_modify_attachment_target(e, app.uuid_v7()) OR app.can_see_attachment_target(e, app.uuid_v7())),
    'id ngẫu nhiên: không tồn tại, không nhìn thấy, thành viên thường không gắn/gỡ được — với MỌI loại thực thể';
  PERFORM app_test.as_user(v_admin);    -- Admin kỹ thuật: không có quyền nghiệp vụ nào để gắn tệp vào dữ liệu của cộng đoàn
  ASSERT NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::attachment_entity_t)) AS e WHERE app.can_modify_attachment_target(e, app.uuid_v7())), 'Admin kỹ thuật không gắn/gỡ tệp vào loại thực thể nào';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM storage_files') = 0 AND app_test.n('SELECT 1 FROM media_attachments') = 0, 'phiên quên gắn user không thấy tệp';
  PERFORM app_test.expect_error(format($q$INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by) VALUES ('receipts', 'u/x/anon.jpg', 1000, %L)$q$, v_m1), 'row-level security');
  PERFORM app_test.as_super();
  RAISE NOTICE 'S12a OK — tệp & đính kèm';
END $$;

-- ---------------------------------------------------------------------
-- S12b. Thông báo: chỉ worker/hệ thống tạo; tùy chọn kênh, giờ yên tĩnh, loại bắt buộc/khẩn; hàng đợi gửi; người dùng chỉ đọc/xác nhận thông báo của mình
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2'; v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3';
  v_memhead uuid := '10000000-0000-7000-8000-0000000000a2'; v_memtreas uuid := '10000000-0000-7000-8000-0000000000a4';
  v_now time := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
  v_n uuid; v_n2 uuid; v_cnt bigint; v_exp bigint; v_unread bigint;
BEGIN
  PERFORM app_test.as_super();
  -- ===== luuxa_app không tạo được thông báo (chống giả mạo); worker/superuser tạo =====
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_notify(%L, 'duty.assigned', 'Tự gửi')$q$, v_mem1), 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.fn_notify_roles(ARRAY['member'], 'duty.assigned', 'Tự gửi')$q$, 'permission denied');
  PERFORM app_test.expect_error($q$SELECT app.fn_notify_all_active('duty.assigned', 'Tự gửi')$q$, 'permission denied');
  PERFORM app_test.expect_error(format($q$INSERT INTO notifications (member_id, type_code, title) VALUES (%L, 'duty.assigned', 'Ghi thẳng')$q$, v_mem1), 'permission denied');
  PERFORM app_test.as_worker();
  v_n := app.fn_notify(v_mem1, 'finance.expense_pending', 'Có phiếu chi chờ duyệt', 'Phiếu cần chữ ký của bạn', '{"k":1}'::jsonb, 'expense_vouchers', app.uuid_v7());
  ASSERT (SELECT priority = 'high' AND payload = '{"k":1}'::jsonb AND entity_table = 'expense_vouchers' AND read_at IS NULL FROM notifications WHERE id = v_n), 'thông báo mang độ ưu tiên của loại + payload + liên kết thực thể';
  ASSERT (SELECT string_agg(channel::text || ':' || status::text, ',') FROM notification_outbox WHERE notification_id = v_n) = 'web_push:queued', 'in_app không vào hàng đợi; web_push xếp hàng chờ gửi';
  ASSERT (SELECT next_attempt_at <= now() AND attempts = 0 FROM notification_outbox WHERE notification_id = v_n), 'không có giờ yên tĩnh ⇒ gửi ngay';
  v_n2 := app.fn_notify(v_mem1, 'duty.swap_decided', 'Đơn đổi ca đã được duyệt');
  ASSERT NOT EXISTS (SELECT 1 FROM notification_outbox WHERE notification_id = v_n2), 'loại chỉ có kênh in_app ⇒ không có dòng hàng đợi';
  v_n2 := app.fn_notify(v_mem1, 'announcement.important', 'Thông báo quan trọng cần xác nhận');
  ASSERT (SELECT array_agg(channel::text ORDER BY channel::text) FROM notification_outbox WHERE notification_id = v_n2) = ARRAY['email', 'web_push'], 'loại nhiều kênh ⇒ mỗi kênh một dòng hàng đợi';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_notify(%L, 'khong.ton_tai', 'x')$q$, v_mem1), 'không tồn tại hoặc đã tắt');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_notify(%L, 'duty.assigned', '   ')$q$, v_mem1), 'ck_notifications__title');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_notify(%L, 'duty.assigned', 'Payload sai kiểu', NULL, '[1]'::jsonb)$q$, v_mem1), 'ck_notifications__payload');
  PERFORM app_test.as_super();
  UPDATE notification_types SET is_active = false WHERE code = 'duty.reminder';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_notify(%L, 'duty.reminder', 'Loại đã tắt')$q$, v_mem1), 'không tồn tại hoặc đã tắt');
  UPDATE notification_types SET is_active = true WHERE code = 'duty.reminder';

  -- ===== Tùy chọn của người nhận: tắt kênh (trừ loại bắt buộc), ràng buộc dữ liệu, chỉ sửa của mình =====
  PERFORM app_test.as_user(v_m2);
  INSERT INTO notification_preferences (member_id, category, channel, enabled) VALUES (v_mem2, 'finance', 'web_push', false), (v_mem2, 'security', 'email', false);
  PERFORM app_test.expect_error(format($q$INSERT INTO notification_preferences (member_id, category, channel) VALUES (%L, 'finance', 'web_push')$q$, v_mem2), 'ux_notification_preferences__member_cat_channel');
  PERFORM app_test.expect_error(format($q$INSERT INTO notification_preferences (member_id, category, channel) VALUES (%L, 'finance', 'email')$q$, v_mem1), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO notification_preferences (member_id, category, channel, quiet_start) VALUES (%L, 'duty', 'web_push', TIME '22:00')$q$, v_mem2), 'ck_notification_preferences__quiet');
  PERFORM app_test.expect_error(format($q$INSERT INTO notification_preferences (member_id, category, channel) VALUES (%L, 'khong_co', 'web_push')$q$, v_mem2), 'ck_notification_preferences__category');
  PERFORM app_test.expect_error(format($q$INSERT INTO notification_preferences (member_id, category, channel, digest_mode) VALUES (%L, 'duty', 'web_push', 'hourly')$q$, v_mem2), 'ck_notification_preferences__digest');
  PERFORM app_test.as_worker();
  v_n := app.fn_notify(v_mem2, 'finance.expense_pending', 'Chờ duyệt (m2 tắt web_push)');
  ASSERT EXISTS (SELECT 1 FROM notifications WHERE id = v_n) AND NOT EXISTS (SELECT 1 FROM notification_outbox WHERE notification_id = v_n), 'tắt kênh: vẫn có thông báo trong ứng dụng nhưng không xếp hàng web_push';
  v_n := app.fn_notify(v_mem2, 'security.new_device', 'Đăng nhập từ thiết bị mới');
  ASSERT (SELECT array_agg(channel::text) FROM notification_outbox WHERE notification_id = v_n) @> ARRAY['email'], 'loại bắt buộc (is_mandatory) bỏ qua tùy chọn tắt kênh';

  -- ===== Giờ yên tĩnh: hoãn đến hết giờ yên tĩnh, trừ loại bắt buộc và loại khẩn (urgent) =====
  PERFORM app_test.as_user(v_m3);
  INSERT INTO notification_preferences (member_id, category, channel, quiet_start, quiet_end) VALUES
    (v_mem3, 'finance',  'web_push', v_now - interval '1 hour', v_now + interval '1 hour'),
    (v_mem3, 'facility', 'web_push', v_now - interval '1 hour', v_now + interval '1 hour'),
    (v_mem3, 'security', 'email',    v_now - interval '1 hour', v_now + interval '1 hour'),
    (v_mem3, 'laundry',  'web_push', v_now + interval '2 hours', v_now + interval '3 hours');
  PERFORM app_test.as_worker();
  v_n := app.fn_notify(v_mem3, 'finance.expense_pending', 'Thông báo thường trong giờ yên tĩnh');
  ASSERT (SELECT next_attempt_at > now() AND next_attempt_at <= now() + interval '2 hours' FROM notification_outbox WHERE notification_id = v_n AND channel = 'web_push'), 'trong giờ yên tĩnh ⇒ hoãn đến hết giờ yên tĩnh';
  v_n := app.fn_notify(v_mem3, 'facility.sla_breach', 'Sự cố quá hạn SLA (khẩn)');
  ASSERT (SELECT next_attempt_at <= now() FROM notification_outbox WHERE notification_id = v_n AND channel = 'web_push'), 'loại urgent không bị hoãn';
  v_n := app.fn_notify(v_mem3, 'security.new_device', 'Đăng nhập từ thiết bị mới');
  ASSERT (SELECT next_attempt_at <= now() FROM notification_outbox WHERE notification_id = v_n AND channel = 'email'), 'loại bắt buộc không bị hoãn';
  v_n := app.fn_notify(v_mem3, 'laundry.reminder', 'Nhắc lượt giặt (ngoài giờ yên tĩnh)');
  ASSERT (SELECT next_attempt_at <= now() FROM notification_outbox WHERE notification_id = v_n AND channel = 'web_push'), 'ngoài giờ yên tĩnh ⇒ gửi ngay';

  -- ===== Gửi theo vai trò / toàn nhà =====
  SELECT count(DISTINCT m.id) INTO v_exp FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN members m ON m.user_id = ur.user_id AND m.deleted_at IS NULL AND m.status = 'active'
   WHERE r.code IN ('house_head', 'treasurer') AND ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now());
  PERFORM app_test.as_worker();
  ASSERT app.fn_notify_roles(ARRAY['house_head', 'treasurer'], 'finance.period_pending', 'Kỳ tài chính chờ xác nhận') = v_exp AND v_exp = 2, 'gửi theo vai trò: đúng 2 người (Trưởng nhà + Thủ quỹ)';
  ASSERT (SELECT array_agg(member_id ORDER BY member_id) FROM notifications WHERE type_code = 'finance.period_pending') = ARRAY[v_memhead, v_memtreas]::uuid[], 'đúng hai người nhận';
  ASSERT app.fn_notify_roles(ARRAY['kitchen_lead'], 'finance.period_pending', 'Không ai giữ vai trò này') = 0, 'vai trò không ai giữ ⇒ 0 người nhận';
  SELECT count(*) INTO v_exp FROM members WHERE status = 'active' AND deleted_at IS NULL;
  ASSERT app.fn_notify_all_active('announcement.published', 'Thông báo toàn nhà') = v_exp, 'toàn nhà: đúng số thành viên đang ở';
  ASSERT NOT EXISTS (SELECT 1 FROM members m WHERE m.status = 'active' AND m.deleted_at IS NULL AND (SELECT count(*) FROM notifications n WHERE n.member_id = m.id AND n.type_code = 'announcement.published') <> 1), 'mỗi thành viên đúng một thông báo toàn nhà';

  -- ===== Hộp thư: mỗi người chỉ đọc/xác nhận thông báo của mình; chỉ ba cột trạng thái được sửa =====
  PERFORM app_test.as_super();
  SELECT count(*) INTO v_exp FROM notifications WHERE member_id = v_mem1;
  SELECT count(*) INTO v_unread FROM notifications WHERE member_id = v_mem1 AND read_at IS NULL;
  ASSERT v_exp >= 4 AND (SELECT count(*) FROM notifications) > v_exp, 'điều kiện nền: có thông báo của nhiều người';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM notifications') = v_exp, 'm1 chỉ thấy thông báo của chính mình (' || v_exp || ')';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n('SELECT 1 FROM notifications') = (SELECT count(*) FROM notifications WHERE member_id = v_memhead), 'ngay cả Trưởng nhà cũng chỉ thấy hộp thư của mình';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM notifications') = 0, 'Admin kỹ thuật không có hồ sơ thành viên ⇒ không có hộp thư';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM notifications') = 0 AND app_test.n('SELECT 1 FROM notification_types') = 0, 'phiên quên gắn user không thấy gì';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE notifications SET read_at = now() WHERE member_id = %L$q$, v_mem1)) = 0, 'm2 không đánh dấu đã đọc hộ m1 (RLS)';
  ASSERT app_test.n('SELECT 1 FROM notification_types') >= 30, 'danh mục loại thông báo đọc được khi đã đăng nhập';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE notifications SET acked_at = now() WHERE id = %L$q$, v_n2), 'ck_notifications__ack_after_read');   -- chưa đọc không thể xác nhận
  ASSERT app_test.rows_affected('UPDATE notifications SET read_at = now() WHERE read_at IS NULL') = v_unread, 'đánh dấu đã đọc đúng số thông báo chưa đọc của m1';
  UPDATE notifications SET acked_at = now() WHERE id = v_n2;
  UPDATE notifications SET archived_at = now() WHERE id = v_n2;
  PERFORM app_test.expect_error(format($q$UPDATE notifications SET title = 'Sửa nội dung' WHERE id = %L$q$, v_n2), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE notifications SET member_id = %L WHERE id = %L$q$, v_mem2, v_n2), 'permission denied');
  PERFORM app_test.expect_error(format($q$DELETE FROM notifications WHERE id = %L$q$, v_n2), 'permission denied');
  PERFORM app_test.expect_error('SELECT 1 FROM notification_outbox', 'permission denied');
  PERFORM app_test.as_super();
  RAISE NOTICE 'S12b OK — thông báo';
END $$;

-- ---------------------------------------------------------------------
-- S12c. AI: cổng chặn trước khi gọi (tác vụ + công tắc tổng, never_external, đồng ý, ngân sách), bộ đếm sử dụng, người duyệt gợi ý
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_vice uuid := '00000000-0000-7000-8000-0000000000a3'; v_treas uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1';
  v_j uuid; v_j2 uuid; v_j3 uuid; v_sug uuid; v_sug2 uuid; v_sug3 uuid; r record; v_month date := date_trunc('month', app.local_today())::date;
BEGIN
  PERFORM app_test.as_super();
  INSERT INTO ai_budgets (month, limit_vnd) VALUES (v_month, 200000) ON CONFLICT (month) DO NOTHING;     -- seed chỉ tạo ngân sách cho tháng dựng DB; bài kiểm thử không phụ thuộc ngày chạy
  ASSERT NOT EXISTS (SELECT 1 FROM ai_task_types WHERE is_enabled) AND NOT app.setting_bool('feature.ai.enabled'), 'mặc định: mọi tác vụ AI tắt và công tắc tổng tắt';
  ASSERT NOT EXISTS (SELECT 1 FROM ai_task_types WHERE data_class = 'never_external' AND external_call_allowed), 'tác vụ never_external không bao giờ cho gọi dịch vụ ngoài';

  -- ===== Tác vụ chưa bật / công tắc tổng tắt ⇒ job bị chặn (blocked) nhưng vẫn ghi nhận =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('community.policy_rag', v_m1, v_mem1, 'anthropic') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE '%chưa được bật%' AND finished_at IS NOT NULL FROM ai_jobs WHERE id = v_j), 'tác vụ chưa bật ⇒ blocked kèm lý do và finished_at';
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$INSERT INTO ai_jobs (task_code, requested_by) VALUES ('community.policy_rag', %L)$q$, v_m1), 'row-level security');
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$INSERT INTO ai_jobs (task_code, requested_by) VALUES ('community.policy_rag', %L)$q$, v_admin), 'row-level security');   -- Admin kỹ thuật không có ai.use
  -- Chỉ người có ai.manage (Admin kỹ thuật / Trưởng nhà) bật tác vụ và công tắc tổng; never_external không thể bật gọi ngoài
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected($q$UPDATE ai_task_types SET is_enabled = true WHERE code = 'community.policy_rag'$q$) = 0, 'thành viên thường không bật được tác vụ AI (RLS)';
  PERFORM app_test.as_user(v_admin);
  UPDATE ai_task_types SET is_enabled = true WHERE code IN ('community.policy_rag', 'finance.anomaly_rules', 'academic.transcript_ocr');
  PERFORM app_test.expect_error($q$UPDATE ai_task_types SET external_call_allowed = true WHERE code = 'academic.transcript_ocr'$q$, 'ck_ai_task_types__never_external');
  PERFORM app_test.as_user(v_m1);
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('community.policy_rag', v_m1, v_mem1, 'anthropic') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE '%tắt toàn hệ thống%' FROM ai_jobs WHERE id = v_j), 'tác vụ đã bật nhưng công tắc tổng feature.ai.enabled tắt ⇒ blocked';
  PERFORM app_test.as_user(v_admin);
  UPDATE settings SET value = 'true'::jsonb WHERE key = 'feature.ai.enabled';

  -- ===== Đồng ý của chủ thể (BR-AI-03): chưa đồng ý ⇒ chặn; đồng ý ⇒ qua; rút đồng ý ⇒ chặn lại =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('community.policy_rag', v_m1, v_mem1, 'anthropic') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-03%' FROM ai_jobs WHERE id = v_j), 'chưa đồng ý ai_processing ⇒ blocked BR-AI-03';
  INSERT INTO consents (member_id, purpose_code, policy_version, method) VALUES (v_mem1, 'ai_processing', 1, 'in_app');
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('community.policy_rag', v_m1, v_mem1, 'anthropic') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'queued' AND blocked_reason IS NULL AND finished_at IS NULL FROM ai_jobs WHERE id = v_j), 'đã đồng ý + tác vụ bật + công tắc tổng bật + còn ngân sách ⇒ queued';
  UPDATE consents SET withdrawn_at = now() WHERE member_id = v_mem1 AND purpose_code = 'ai_processing';
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('community.policy_rag', v_m1, v_mem1, 'anthropic') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-03%' FROM ai_jobs WHERE id = v_j), 'rút đồng ý ⇒ chặn lại ngay';

  -- ===== Dữ liệu không được gửi ra ngoài (BR-AI-02): luật nội bộ & never_external chỉ chạy nội bộ/tự host =====
  INSERT INTO ai_jobs (task_code, requested_by, provider) VALUES ('finance.anomaly_rules', v_m1, 'anthropic') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-02%' FROM ai_jobs WHERE id = v_j), 'tác vụ không cho gọi ngoài + nhà cung cấp bên thứ ba ⇒ blocked BR-AI-02';
  INSERT INTO ai_jobs (task_code, requested_by) VALUES ('finance.anomaly_rules', v_m1) RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-02%' FROM ai_jobs WHERE id = v_j), 'không khai báo nhà cung cấp ⇒ coi là bên ngoài ⇒ blocked';
  INSERT INTO ai_jobs (task_code, requested_by, provider) VALUES ('finance.anomaly_rules', v_m1, 'rule_based') RETURNING id INTO v_j2;
  ASSERT (SELECT status FROM ai_jobs WHERE id = v_j2) = 'queued', 'luật thuần (rule_based) chạy nội bộ ⇒ queued';
  INSERT INTO ai_jobs (task_code, requested_by, provider) VALUES ('finance.anomaly_rules', v_m1, 'self_hosted') RETURNING id INTO v_j3;
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('academic.transcript_ocr', v_m1, v_mem1, 'openai') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-02%' FROM ai_jobs WHERE id = v_j), 'never_external + dịch vụ ngoài ⇒ blocked dù đã đồng ý';
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('academic.transcript_ocr', v_m1, v_mem1, 'self_hosted') RETURNING id INTO v_j;
  ASSERT (SELECT status FROM ai_jobs WHERE id = v_j) = 'queued', 'never_external + tự host + chủ thể đã đồng ý (S7) ⇒ queued';
  INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, provider) VALUES ('academic.transcript_ocr', v_m1, '10000000-0000-7000-8000-0000000000b2', 'self_hosted') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-03%' FROM ai_jobs WHERE id = v_j), 'chủ thể dữ liệu (m2) chưa đồng ý chia sẻ điểm ⇒ blocked dù tự host';

  -- ===== Ngân sách tháng (BR-AI-04): dừng cứng khi dùng hết; tắt hard_stop thì qua =====
  PERFORM app_test.as_super();
  ASSERT (SELECT used_vnd = 0 AND limit_vnd > 0 AND hard_stop FROM ai_budgets WHERE month = v_month), 'điều kiện nền: ngân sách tháng hiện tại có hạn mức, đang dừng cứng';
  UPDATE ai_budgets SET used_vnd = limit_vnd WHERE month = v_month;
  PERFORM app_test.as_user(v_m1);
  INSERT INTO ai_jobs (task_code, requested_by, provider) VALUES ('finance.anomaly_rules', v_m1, 'rule_based') RETURNING id INTO v_j;
  ASSERT (SELECT status = 'blocked' AND blocked_reason LIKE 'BR-AI-04%' FROM ai_jobs WHERE id = v_j), 'dùng hết ngân sách + hard_stop ⇒ blocked BR-AI-04';
  PERFORM app_test.as_super();
  UPDATE ai_budgets SET hard_stop = false WHERE month = v_month;
  PERFORM app_test.as_user(v_m1);
  INSERT INTO ai_jobs (task_code, requested_by, provider) VALUES ('finance.anomaly_rules', v_m1, 'rule_based') RETURNING id INTO v_j;
  ASSERT (SELECT status FROM ai_jobs WHERE id = v_j) = 'queued', 'tắt hard_stop ⇒ chỉ cảnh báo, không chặn';
  PERFORM app_test.as_super();
  UPDATE ai_budgets SET used_vnd = 0, hard_stop = true WHERE month = v_month;

  -- ===== Chỉ worker chạy job; bộ đếm sử dụng/ngân sách cộng đúng một lần khi job kết thúc =====
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected(format($q$UPDATE ai_jobs SET status = 'succeeded', finished_at = now() WHERE id = %L$q$, v_j2)) = 0, 'người dùng không tự đánh dấu job thành công (không có chính sách UPDATE)';
  ASSERT app_test.rows_affected(format($q$DELETE FROM ai_jobs WHERE id = %L$q$, v_j2)) = 0, 'người dùng không xóa job';
  PERFORM app_test.as_worker();
  UPDATE ai_jobs SET status = 'running', started_at = now() WHERE id IN (v_j2, v_j3);
  UPDATE ai_jobs SET status = 'succeeded', finished_at = now(), tokens_in = 100, tokens_out = 40, cost_vnd = 1500 WHERE id = v_j2;
  UPDATE ai_jobs SET status = 'failed', finished_at = now(), tokens_in = 10, cost_vnd = 500, error_message = 'Hết thời gian chờ' WHERE id = v_j3;
  UPDATE ai_jobs SET status = 'succeeded', latency_ms = 800 WHERE id = v_j2;      -- cập nhật lại cùng trạng thái: không cộng đôi
  PERFORM app_test.as_super();
  SELECT * INTO r FROM ai_usage_daily WHERE usage_date = app.local_today() AND task_code = 'finance.anomaly_rules';
  ASSERT r.jobs = 2 AND r.failed_jobs = 1 AND r.tokens_in = 110 AND r.tokens_out = 40 AND r.cost_vnd = 2000, format('ai_usage_daily: 2 job / 1 lỗi / 110+40 token / 2.000 đ — thực tế %s/%s/%s+%s/%s', r.jobs, r.failed_jobs, r.tokens_in, r.tokens_out, r.cost_vnd);
  ASSERT (SELECT used_vnd FROM ai_budgets WHERE month = v_month) = 2000, 'ngân sách tháng cộng đúng chi phí của các job đã kết thúc (job bị chặn không tính)';
  PERFORM app_test.expect_error(format($q$UPDATE ai_jobs SET status = 'succeeded' WHERE id = %L$q$, v_j), 'ck_ai_jobs__finished');
  PERFORM app_test.expect_error(format($q$UPDATE ai_jobs SET input_hash = 'khong-phai-hex' WHERE id = %L$q$, v_j), 'ck_ai_jobs__hash');
  -- Quyền xem: người yêu cầu thấy job của mình; ai.manage thấy tất cả; usage/budget chỉ ai.manage
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM ai_jobs') = (SELECT count(*) FROM ai_jobs WHERE requested_by = v_m1) AND app_test.n('SELECT 1 FROM ai_usage_daily') = 0 AND app_test.n('SELECT 1 FROM ai_budgets') = 0, 'm1 thấy job của mình; không thấy chi phí/ngân sách';
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM ai_jobs') = 0, 'm2 không thấy job của m1';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n('SELECT 1 FROM ai_jobs') = (SELECT count(*) FROM ai_jobs) AND app_test.n('SELECT 1 FROM ai_usage_daily') >= 1 AND app_test.n('SELECT 1 FROM ai_budgets') = 1, 'Admin (ai.manage) thấy mọi job, chi phí và ngân sách';
  PERFORM app_test.as_anon();
  ASSERT app_test.n('SELECT 1 FROM ai_jobs') = 0, 'phiên quên gắn user không thấy job';

  -- ===== BR-AI-01: gợi ý chỉ do người có ai.review duyệt (người, không phải máy) =====
  PERFORM app_test.as_super();
  INSERT INTO ai_suggestions (job_id, task_code, entity_table, entity_id, suggestion_type, payload) VALUES (v_j2, 'finance.anomaly_rules', 'expense_vouchers', app.uuid_v7(), 'duplicate_voucher', '{"score":0.92}'::jsonb) RETURNING id INTO v_sug;
  INSERT INTO ai_suggestions (job_id, task_code, entity_table, entity_id, suggestion_type, payload) VALUES (v_j2, 'finance.anomaly_rules', 'expense_vouchers', app.uuid_v7(), 'spend_spike', '{"score":0.7}'::jsonb) RETURNING id INTO v_sug2;
  INSERT INTO ai_suggestions (job_id, task_code, entity_table, entity_id, suggestion_type, payload, expires_at) VALUES (v_j2, 'finance.anomaly_rules', 'expense_vouchers', app.uuid_v7(), 'old_hint', '{}'::jsonb, now() - interval '1 hour') RETURNING id INTO v_sug3;
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM ai_suggestions') = 3, 'người yêu cầu job thấy gợi ý sinh từ job của mình';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_ai_suggestion(%L, true)$q$, v_sug), 'Không có quyền duyệt gợi ý AI');
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.n('SELECT 1 FROM ai_suggestions') = 0, 'm2 không thấy gợi ý của người khác';
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_ai_suggestion(%L, true)$q$, v_sug), 'Không có quyền duyệt gợi ý AI');   -- ai.manage ≠ ai.review
  PERFORM app_test.as_anon();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_ai_suggestion(%L, true)$q$, v_sug), 'Không có quyền duyệt gợi ý AI');
  PERFORM app_test.as_worker();
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_ai_suggestion(%L, true)$q$, v_sug), 'Không có quyền duyệt gợi ý AI');   -- máy không tự duyệt gợi ý của máy
  PERFORM app_test.as_user(v_vice);
  PERFORM app.fn_decide_ai_suggestion(v_sug, true, 'Đúng là phiếu trùng');
  ASSERT (SELECT status = 'accepted' AND reviewed_by = v_vice AND reviewed_at IS NOT NULL AND review_note = 'Đúng là phiếu trùng' FROM ai_suggestions WHERE id = v_sug), 'chấp nhận: ghi người duyệt, thời điểm, ghi chú';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_ai_suggestion(%L, false)$q$, v_sug), 'đã được xử lý hoặc hết hạn');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_ai_suggestion(%L, true)$q$, v_sug3), 'đã được xử lý hoặc hết hạn');
  PERFORM app_test.expect_error(format($q$UPDATE ai_suggestions SET status = 'accepted' WHERE id = %L$q$, v_sug2), 'ck_ai_suggestions__reviewed');   -- không "duyệt" bằng UPDATE trần thiếu người duyệt
  PERFORM app_test.as_user(v_treas);          -- Thủ quỹ cũng có ai.review
  PERFORM app.fn_decide_ai_suggestion(v_sug2, false, 'Chi tăng do mua sắm theo kế hoạch');
  ASSERT (SELECT status = 'rejected' AND reviewed_by = v_treas FROM ai_suggestions WHERE id = v_sug2), 'từ chối: ghi người duyệt';
  PERFORM app_test.as_user(v_vice);
  ASSERT (SELECT accepted = 1 AND rejected = 1 AND acceptance_rate_pct = 50.0 FROM v_ai_acceptance WHERE task_code = 'finance.anomaly_rules'), 'v_ai_acceptance: 1 chấp nhận / 1 từ chối ⇒ 50%';
  -- Trả cấu hình về mặc định cho các phần sau
  PERFORM app_test.as_super();
  UPDATE ai_task_types SET is_enabled = false WHERE is_enabled;
  UPDATE settings SET value = 'false'::jsonb WHERE key = 'feature.ai.enabled';
  RAISE NOTICE 'S12c OK — AI';
END $$;

-- ---------------------------------------------------------------------
-- S12d. app.fn_housekeeping() (worker): dọn dữ liệu quá hạn, idempotent, không đụng dữ liệu còn hiệu lực; luuxa_app không gọi được
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1';
  v_sess uuid := app.uuid_v7(); v_old uuid; v_new uuid; v_att uuid; v_ava uuid; v_poll uuid; v_hk jsonb; v_hk2 jsonb; v_keep bigint;
BEGIN
  PERFORM app_test.as_super();
  -- Dữ liệu quá hạn (phải bị dọn) và còn hạn (phải giữ nguyên)
  INSERT INTO notifications (member_id, type_code, title, read_at, created_at) VALUES (v_mem1, 'duty.assigned', 'cũ, đã đọc 100 ngày trước', now() - interval '100 days', now() - interval '110 days');
  INSERT INTO notifications (member_id, type_code, title, read_at) VALUES (v_mem1, 'duty.assigned', 'mới đọc hôm qua', now() - interval '1 day');
  INSERT INTO notifications (member_id, type_code, title, created_at) VALUES (v_mem1, 'duty.assigned', 'cũ nhưng chưa đọc', now() - interval '200 days');
  INSERT INTO login_attempts (identifier, success, failure_reason, attempted_at) VALUES ('cu@x.vn', false, 'bad_password', now() - interval '100 days'), ('moi@x.vn', false, 'bad_password', now() - interval '1 day');
  INSERT INTO idempotency_keys (user_id, idem_key, http_method, request_path, request_hash, created_at, expires_at) VALUES
    (v_m1, 'het-han-0001', 'POST', '/x', repeat('a', 64), now() - interval '3 days', now() - interval '2 days'),
    (v_m1, 'con-han-0001', 'POST', '/x', repeat('b', 64), now(), now() + interval '1 day');
  INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (v_sess, v_m1, now() - interval '60 days', now() - interval '35 days');
  INSERT INTO refresh_tokens (session_id, user_id, token_hash, issued_at, expires_at) VALUES (v_sess, v_m1, repeat('c', 64), now() - interval '60 days', now() - interval '40 days');
  INSERT INTO password_resets (user_id, token_hash, requested_at, expires_at) VALUES (v_m1, repeat('d', 64), now() - interval '20 days', now() - interval '10 days');
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status, created_at) VALUES ('attachments', 'mo-coi/cu-chua-gan.jpg', 1000, v_m1, 'uploaded', now() - interval '3 days') RETURNING id INTO v_old;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status, created_at) VALUES ('attachments', 'mo-coi/moi-chua-gan.jpg', 1000, v_m1, 'uploaded', now() - interval '1 hour') RETURNING id INTO v_new;
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status, created_at, attached_at) VALUES ('attachments', 'mo-coi/cu-da-gan.jpg', 1000, v_m1, 'uploaded', now() - interval '3 days', now() - interval '2 days') RETURNING id INTO v_att;
  -- Ảnh đại diện tham chiếu trực tiếp (attached_at vẫn NULL) quá ngưỡng 24 giờ: KHÔNG được coi là mồ côi
  INSERT INTO storage_files (bucket, object_key, size_bytes, uploaded_by, status, created_at) VALUES ('avatars', 'mo-coi/avatar-dang-dung.jpg', 1000, v_m1, 'uploaded', now() - interval '3 days') RETURNING id INTO v_ava;
  UPDATE members SET avatar_file_id = v_ava WHERE id = v_mem1;
  INSERT INTO ai_jobs (task_code, requested_by, created_at) VALUES ('finance.anomaly_rules', v_m1, now() - interval '200 days');
  INSERT INTO polls (question, opens_at, closes_at, created_by) VALUES ('Khảo sát đã quá hạn đóng', now() - interval '2 days', now() - interval '1 day', v_m1) RETURNING id INTO v_poll;
  SELECT count(*) INTO v_keep FROM ai_suggestions WHERE status = 'pending' AND expires_at < now();

  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error('SELECT app.fn_housekeeping()', 'permission denied');
  PERFORM app_test.as_worker();
  v_hk := app.fn_housekeeping();
  ASSERT (v_hk ->> 'notifications_deleted')::int = 1 AND (v_hk ->> 'login_attempts_deleted')::int = 1 AND (v_hk ->> 'idempotency_deleted')::int = 1
     AND (v_hk ->> 'refresh_tokens_deleted')::int = 1 AND (v_hk ->> 'password_resets_deleted')::int = 1 AND (v_hk ->> 'orphan_files_marked')::int = 1
     AND (v_hk ->> 'ai_jobs_deleted')::int = 1 AND (v_hk ->> 'polls_closed')::int = 1 AND (v_hk ->> 'ai_suggestions_expired')::int = v_keep, 'lần chạy đầu dọn đúng từng loại dữ liệu quá hạn: ' || v_hk::text;
  v_hk2 := app.fn_housekeeping();
  ASSERT (SELECT bool_and(value::int = 0) FROM jsonb_each_text(v_hk2)), 'chạy lại ngay: không còn gì để dọn (idempotent): ' || v_hk2::text;
  PERFORM app_test.as_super();
  ASSERT (SELECT count(*) FROM notifications WHERE title IN ('mới đọc hôm qua', 'cũ nhưng chưa đọc')) = 2 AND NOT EXISTS (SELECT 1 FROM notifications WHERE title LIKE 'cũ, đã đọc%'), 'chỉ xóa thông báo ĐÃ ĐỌC quá 90 ngày';
  ASSERT EXISTS (SELECT 1 FROM idempotency_keys WHERE idem_key = 'con-han-0001') AND EXISTS (SELECT 1 FROM login_attempts WHERE identifier = 'moi@x.vn'), 'dữ liệu còn hạn được giữ';
  ASSERT (SELECT status = 'deleted' AND deleted_at IS NOT NULL AND purge_after > now() + interval '6 days' FROM storage_files WHERE id = v_old), 'tệp mồ côi quá ngưỡng: đánh dấu xóa + hẹn dọn object sau 7 ngày';
  ASSERT (SELECT status = 'uploaded' AND deleted_at IS NULL FROM storage_files WHERE id = v_new) AND (SELECT status = 'uploaded' AND deleted_at IS NULL FROM storage_files WHERE id = v_att), 'tệp mới tải hoặc đã gắn thực thể không bị dọn';
  ASSERT (SELECT status = 'uploaded' AND deleted_at IS NULL FROM storage_files WHERE id = v_ava), 'ảnh đang được tham chiếu trực tiếp (ảnh đại diện) không bị coi là mồ côi';
  ASSERT (SELECT status = 'closed' FROM polls WHERE id = v_poll), 'poll quá hạn được đóng';
  ASSERT NOT EXISTS (SELECT 1 FROM ai_suggestions WHERE status = 'pending' AND expires_at < now()), 'gợi ý AI hết hạn chuyển sang expired';
  RAISE NOTICE 'S12d OK — dọn dẹp định kỳ';
END $$;

-- ---------------------------------------------------------------------
-- S12e. MA TRẬN RLS: ~46 bảng × 5 ngữ cảnh (phiên quên gắn user, Admin kỹ thuật, thành viên thường, Thủ quỹ, Trưởng nhà)
--   Kỳ vọng: '0' = không thấy dòng nào; '*' = thấy mọi dòng; '!' = bị từ chối quyền (permission denied); còn lại = điều kiện SQL chọn đúng tập dòng được thấy.
--   Số dòng kỳ vọng được đếm độc lập bằng superuser rồi so với số dòng thấy được dưới vai trò luuxa_app (RLS), nên không phụ thuộc lượng dữ liệu của các bài trước.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u_ad constant uuid := '00000000-0000-7000-8000-0000000000a1'; u_hd constant uuid := '00000000-0000-7000-8000-0000000000a2';
  u_tr constant uuid := '00000000-0000-7000-8000-0000000000a4'; u_m1 constant uuid := '00000000-0000-7000-8000-0000000000b1';
  m_hd constant uuid := '10000000-0000-7000-8000-0000000000a2'; m_tr constant uuid := '10000000-0000-7000-8000-0000000000a4'; m_1 constant uuid := '10000000-0000-7000-8000-0000000000b1';
  v_who uuid[] := ARRAY[NULL, u_ad, u_m1, u_tr, u_hd];
  v_name text[] := ARRAY['phiên quên gắn user', 'Admin kỹ thuật', 'thành viên b1', 'Thủ quỹ', 'Trưởng nhà'];
  r record; i integer; v_pred text; v_total bigint; v_exp bigint; v_act bigint; v_partial integer := 0; v_cells integer := 0;
BEGIN
  PERFORM app_test.as_super();
  -- Dữ liệu "của riêng từng người" cho các bảng chưa có dòng nào ở các bài trước (để ô ma trận có ý nghĩa)
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_secret) VALUES
    (u_m1, 'https://push.example.vn/sub/b1', 'khoa-cong-khai-b1', 'bi-mat-b1'), (u_tr, 'https://push.example.vn/sub/a4', 'khoa-cong-khai-a4', 'bi-mat-a4'), (u_hd, 'https://push.example.vn/sub/a2', 'khoa-cong-khai-a2', 'bi-mat-a2');
  INSERT INTO member_channel_bindings (member_id, channel, external_id) VALUES (m_1, 'zalo', 'zalo-b1'), (m_tr, 'telegram', 'tg-a4'), (m_hd, 'sms', '+84900000002');
  INSERT INTO data_subject_requests (member_id, request_type) VALUES (m_1, 'access'), (m_tr, 'erasure'), (m_hd, 'rectification');
  INSERT INTO user_identities (user_id, provider, provider_user_id, provider_email) VALUES (u_m1, 'google', 'g-b1', 'b1@gmail.test'), (u_tr, 'google', 'g-a4', 'a4@gmail.test');
  INSERT INTO album_likes (album_id, member_id) SELECT a.id, x.m FROM albums a CROSS JOIN (VALUES (m_1), (m_hd)) AS x(m) WHERE a.deleted_at IS NULL AND a.status = 'published' AND a.visibility = 'community';
  INSERT INTO photo_likes (photo_id, member_id) SELECT p.photo_id, x.m FROM (SELECT DISTINCT photo_id FROM photo_likes) p CROSS JOIN (VALUES (m_1), (m_hd)) AS x(m);
  FOR r IN SELECT * FROM (VALUES
    -- bảng,                    anon, admin, member b1, treasurer a4, house head a2
    ('users',                   '0', '*', format('id = %L', u_m1), format('id = %L', u_tr), '*'),
    ('user_roles',              '0', '*', format('user_id = %L', u_m1), format('user_id = %L', u_tr), '*'),
    ('role_delegations',        '0', '0', format('delegator_user_id = %1$L OR delegate_user_id = %1$L', u_m1), format('delegator_user_id = %1$L OR delegate_user_id = %1$L', u_tr), '*'),
    ('settings',                '0', '*', 'is_public', 'is_public OR key LIKE ''finance.%''', '*'),                                                                                -- Thủ quỹ đọc thêm cấu hình tài chính (finance.expense.read_all)
    ('categories',              '0', '*', '*', '*', '*'),
    ('members',                 '0', 'deleted_at IS NULL', 'deleted_at IS NULL', 'deleted_at IS NULL', '*'),
    ('member_private_details',  '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('catholic_profiles',       '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '0'),        -- Trưởng nhà: chủ thể đã rút đồng ý chia sẻ (S4)
    ('consents',                '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('room_assignments',        '0', '*', '*', '*', '*'),
    ('merit_entries',           '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('academic_records',        '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), format('member_id = %L AND status IN (''submitted'', ''verified'')', m_1)),   -- Trưởng nhà chỉ thấy bảng điểm đã nộp của người ĐÃ đồng ý chia sẻ (m1)
    ('events',                  '0', 'deleted_at IS NULL AND status <> ''draft''', 'deleted_at IS NULL AND status <> ''draft''', 'deleted_at IS NULL AND status <> ''draft''', '*'),
    ('attendance_records',      '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('leave_requests',          '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('poll_votes',              '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), format('member_id = %L', m_hd)),                                           -- phiếu bầu: chỉ chính chủ, kể cả Trưởng nhà
    ('funds',                   '0', '0', '0', '*', '*'),
    ('ledger_entries',          '0', '0', '0', '*', '*'),
    ('expense_vouchers',        '0', '0', format('requested_by = %L OR paid_by_member_id = %L', u_m1, m_1), '*', '*'),
    ('contributions',           '0', '0', format('member_id = %L', m_1), '*', '*'),
    ('financial_periods',       '0', '0', '*', '*', '*'),
    ('maintenance_issues',      '0', '*', '*', '*', '*'),
    ('vendors',                 '0', '0', '0', '0', 'deleted_at IS NULL'),
    ('forum_posts',             '0', '0', format('(deleted_at IS NULL OR author_member_id = %1$L) AND (status <> ''hidden'' OR author_member_id = %1$L)', m_1), 'deleted_at IS NULL AND status <> ''hidden''', '*'),
    ('prayer_intentions',       '0', '0', format('visibility = ''published'' OR author_member_id = %L', m_1), format('visibility = ''published'' OR author_member_id = %L', m_tr), '*'),
    ('prayer_intention_authors','0', '0', format('author_member_id = %L', m_1), '0', '0'),
    ('laundry_bookings',        '0', '*', '*', '*', '*'),
    ('meal_registrations',      '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('policy_documents',        '0', 'is_current', 'is_current', 'is_current', '*'),
    ('notifications',           '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), format('member_id = %L', m_hd)),
    ('audit_logs',              '0', 'NOT app.is_sensitive_audit_table(entity_table)', '0', 'app.is_finance_audit_table(entity_table)', '*'),         -- Admin kỹ thuật không đọc nhật ký của dữ liệu cá nhân nhạy cảm (audit.sensitive.read chỉ Trưởng nhà)
    ('ai_jobs',                 '0', '*', format('requested_by = %L', u_m1), format('requested_by = %L', u_tr), '*'),
    ('ai_budgets',              '0', '*', '0', '0', '*'),
    -- Khoảnh khắc (album): chỉ thành viên có hồ sơ xem được; tác giả thấy cả album/ảnh/thẻ của mình; Trưởng nhà (album.moderate) thấy tất cả, kể cả đã xóa mềm
    ('albums',                  '0', '0', format('author_member_id = %L OR (deleted_at IS NULL AND status = ''published'' AND visibility = ''community'')', m_1),
                                     'deleted_at IS NULL AND status = ''published'' AND visibility = ''community''', '*'),
    ('album_photos',            '0', '0', format('uploaded_by_member_id = %L OR (deleted_at IS NULL AND status = ''published'' AND album_id IN (SELECT id FROM albums WHERE deleted_at IS NULL AND status = ''published'' AND visibility = ''community''))', m_1),
                                     'deleted_at IS NULL AND status = ''published'' AND album_id IN (SELECT id FROM albums WHERE deleted_at IS NULL AND status = ''published'' AND visibility = ''community'')', '*'),
    ('album_member_tags',       '0', '0', format('tagged_by_member_id = %1$L OR member_id = %1$L OR status = ''accepted''', m_1), 'status = ''accepted''', '*'),
    ('album_likes',             '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), format('member_id = %L', m_hd)),                                          -- tim: chỉ của chính mình
    ('photo_likes',             '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), format('member_id = %L', m_hd)),
    ('meal_menu_cooks',         '0', '*', '*', '*', '*'),
    -- Dữ liệu gắn với từng tài khoản/hồ sơ: chỉ chính chủ (Admin kỹ thuật và Trưởng nhà có dsr.manage nên thấy hết yêu cầu của chủ thể dữ liệu)
    ('push_subscriptions',      '0', format('user_id = %L', u_ad), format('user_id = %L', u_m1), format('user_id = %L', u_tr), format('user_id = %L', u_hd)),
    ('member_channel_bindings', '0', '0', format('member_id = %L', m_1), format('member_id = %L', m_tr), format('member_id = %L', m_hd)),
    ('data_subject_requests',   '0', '*', format('member_id = %L', m_1), format('member_id = %L', m_tr), '*'),
    ('user_identities',         '0', format('user_id = %L', u_ad), format('user_id = %L', u_m1), format('user_id = %L', u_tr), format('user_id = %L', u_hd)),
    ('notification_outbox',     '!', '!', '!', '!', '!'),                                                                                                                      -- chỉ worker (REVOKE ALL)
    ('refresh_tokens',          '!', '!', '!', '!', '!')                                                                                                                       -- chỉ luuxa_auth
  ) AS m(tbl, e_anon, e_admin, e_member, e_treas, e_head) LOOP
    PERFORM app_test.as_super();
    EXECUTE format('SELECT count(*) FROM %I', r.tbl) INTO v_total;
    ASSERT v_total > 0 OR r.e_anon = '!', format('điều kiện nền: bảng %s phải có dữ liệu để phép thử có ý nghĩa', r.tbl);
    FOR i IN 1..5 LOOP
      v_pred := (ARRAY[r.e_anon, r.e_admin, r.e_member, r.e_treas, r.e_head])[i];
      PERFORM app_test.as_super();
      IF v_pred <> '!' THEN
        v_exp := CASE v_pred WHEN '0' THEN 0 WHEN '*' THEN v_total ELSE NULL END;
        IF v_exp IS NULL THEN
          EXECUTE format('SELECT count(*) FROM %I WHERE %s', r.tbl, v_pred) INTO v_exp;
        END IF;
      END IF;
      IF v_who[i] IS NULL THEN PERFORM app_test.as_anon(); ELSE PERFORM app_test.as_user(v_who[i]); END IF;
      IF v_pred = '!' THEN
        PERFORM app_test.expect_error(format('SELECT 1 FROM %I', r.tbl), 'permission denied');
      ELSE
        v_act := app_test.n(format('SELECT 1 FROM %I', r.tbl));
        ASSERT v_act = v_exp, format('RLS %s × %s: kỳ vọng %s/%s dòng, thực tế %s', r.tbl, v_name[i], v_exp, v_total, v_act);
        IF v_exp > 0 AND v_exp < v_total THEN v_partial := v_partial + 1; END IF;
      END IF;
      v_cells := v_cells + 1;
    END LOOP;
  END LOOP;
  PERFORM app_test.as_super();
  ASSERT v_partial >= 15, 'ma trận phải thực sự thử các chính sách lọc theo dòng (kết quả một phần), thực tế chỉ ' || v_partial;
  RAISE NOTICE 'S12e OK — ma trận RLS % ô, % ô lọc một phần', v_cells, v_partial;
END $$;

-- ---------------------------------------------------------------------
-- S12e2. Dữ liệu tham chiếu / cấu hình / danh mục: thành viên thường KHÔNG sửa hay xóa được dòng nào (RLS lọc mất dòng hoặc quyền bảng từ chối);
--        đối chứng dương: Trưởng nhà sửa được ở các bảng mà vai trò này có quyền quản lý (để phép thử không "xanh giả" vì bảng rỗng)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  r record; v_col text; v_n bigint; v_total bigint; v_blocked integer := 0;
BEGIN
  PERFORM app_test.as_super();
  FOR r IN SELECT t AS tbl FROM unnest(ARRAY['floors', 'rooms', 'amenities', 'room_amenities', 'categories', 'universities', 'grade_scales', 'positions', 'academic_years', 'semesters',
        'board_terms', 'duty_shifts', 'cleaning_areas', 'checklist_templates', 'liturgy_role_types', 'funds', 'financial_periods', 'vendors', 'assets', 'asset_maintenance_schedules',
        'laundry_machines', 'meal_menus', 'pantry_items', 'policy_documents', 'ai_task_types', 'ai_budgets', 'merit_rules', 'roles', 'permissions', 'role_permissions',
        'notification_types', 'consent_purposes', 'dioceses', 'settings']) AS t LOOP
    PERFORM app_test.as_super();
    EXECUTE format('SELECT count(*) FROM %I', r.tbl) INTO v_total;
    ASSERT v_total > 0, format('điều kiện nền: bảng %s phải có dữ liệu', r.tbl);
    SELECT column_name INTO v_col FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tbl ORDER BY ordinal_position LIMIT 1;
    PERFORM app_test.as_user(v_m1);
    BEGIN
      EXECUTE format('UPDATE %I SET %I = %I', r.tbl, v_col, v_col);
      GET DIAGNOSTICS v_n = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN v_n := 0;
    END;
    ASSERT v_n = 0, format('thành viên thường không sửa được bảng %s (sửa được %s dòng)', r.tbl, v_n);
    BEGIN
      EXECUTE format('DELETE FROM %I', r.tbl);
      GET DIAGNOSTICS v_n = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN v_n := 0;
    END;
    ASSERT v_n = 0, format('thành viên thường không xóa được bảng %s (xóa được %s dòng)', r.tbl, v_n);
    v_blocked := v_blocked + 1;
  END LOOP;
  -- đối chứng dương
  PERFORM app_test.as_user(v_head);
  FOR r IN SELECT t AS tbl FROM unnest(ARRAY['floors', 'rooms', 'amenities', 'categories', 'vendors', 'assets', 'laundry_machines', 'meal_menus', 'pantry_items', 'policy_documents', 'ai_task_types', 'merit_rules']) AS t LOOP
    SELECT column_name INTO v_col FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tbl ORDER BY ordinal_position LIMIT 1;
    EXECUTE format('UPDATE %I SET %I = %I', r.tbl, v_col, v_col);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n > 0, format('đối chứng: Trưởng nhà phải sửa được bảng %s', r.tbl);
  END LOOP;
  PERFORM app_test.as_super();
  RAISE NOTICE 'S12e2 OK — % bảng tham chiếu/cấu hình chặn ghi với thành viên thường', v_blocked;
END $$;

-- ---------------------------------------------------------------------
-- S12e3. Bất biến phủ MỌI bảng RLS (lấy từ danh mục hệ thống nên bảng mới thêm sau này tự được kiểm, không cần liệt kê):
--        (a) phiên luuxa_app quên gắn user không đọc được dòng nào của bất kỳ bảng nào;
--        (b) người dùng đã đăng nhập nhưng CHƯA có vai trò và chưa có hồ sơ thành viên (vừa nộp đơn) không đọc được dữ liệu cá nhân/nghiệp vụ nội bộ
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record; t text; v_total bigint; v_seen bigint; v_new uuid := '00000000-0000-7000-8000-0000000000e1';
  v_leaks text := ''; v_withdata integer := 0; v_denied integer := 0; v_checked integer := 0;
  v_internal text[] := ARRAY['members', 'member_private_details', 'member_guardians', 'catholic_profiles', 'student_profiles', 'consents', 'data_subject_requests', 'room_assignments',
    'merit_entries', 'academic_records', 'attendance_records', 'leave_requests', 'events', 'polls', 'poll_votes', 'ledger_entries', 'expense_vouchers', 'contributions', 'funds',
    'announcements', 'forum_posts', 'forum_comments', 'prayer_intentions', 'albums', 'album_photos', 'album_member_tags', 'maintenance_issues', 'assets', 'laundry_bookings',
    'meal_registrations', 'notifications', 'audit_logs', 'ai_jobs', 'ai_suggestions', 'storage_files', 'media_attachments', 'user_roles', 'role_delegations', 'member_applications',
    'push_subscriptions', 'member_channel_bindings', 'reflections', 'study_goals'];
BEGIN
  PERFORM app_test.as_super();
  -- (a) phiên quên gắn user: mọi bảng RLS phải trả 0 dòng (hoặc từ chối quyền)
  FOR r IN SELECT c.relname AS tbl FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND c.relrowsecurity ORDER BY 1 LOOP
    PERFORM app_test.as_super();
    EXECUTE format('SELECT count(*) FROM %I', r.tbl) INTO v_total;
    IF v_total > 0 THEN v_withdata := v_withdata + 1; END IF;
    PERFORM app_test.as_anon();
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I', r.tbl) INTO v_seen;
      IF v_seen > 0 THEN v_leaks := v_leaks || r.tbl || '(' || v_seen || '/' || v_total || ') '; END IF;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := v_denied + 1;
    END;
  END LOOP;
  PERFORM app_test.as_super();
  ASSERT v_leaks = '', 'phiên không gắn user đọc được dòng của: ' || v_leaks;
  ASSERT v_withdata >= 80, 'phép thử phải có ý nghĩa: ít nhất 80 bảng RLS đang có dữ liệu, thực tế ' || v_withdata;

  -- (b) tài khoản mới đăng nhập, chưa có vai trò nào, chưa có hồ sơ thành viên
  INSERT INTO users (id, email, status, password_hash) VALUES (v_new, 'nguoi-moi-chua-vai-tro@x.vn', 'active', '$argon2id$v=19$m=1,t=1,p=1$a$b');
  ASSERT NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_new) AND NOT EXISTS (SELECT 1 FROM members WHERE user_id = v_new), 'điều kiện nền: không có vai trò, không có hồ sơ';
  FOREACH t IN ARRAY v_internal LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    PERFORM app_test.as_super();
    EXECUTE format('SELECT count(*) FROM %I', t) INTO v_total;
    CONTINUE WHEN v_total = 0;
    PERFORM app_test.as_user(v_new);
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO v_seen;
    EXCEPTION WHEN insufficient_privilege THEN v_seen := 0;
    END;
    ASSERT v_seen = 0, format('người dùng chưa có vai trò đọc được %s/%s dòng của bảng %s', v_seen, v_total, t);
    v_checked := v_checked + 1;
  END LOOP;
  PERFORM app_test.as_super();
  ASSERT v_checked >= 30, 'phép thử (b) phải phủ ít nhất 30 bảng có dữ liệu, thực tế ' || v_checked;
  RAISE NOTICE 'S12e3 OK — phiên không gắn user: 0 dòng ở % bảng RLS (% bảng có dữ liệu, % bị từ chối quyền); người dùng chưa có vai trò: 0 dòng ở % bảng dữ liệu nội bộ',
    (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND c.relrowsecurity), v_withdata, v_denied, v_checked;
END $$;

-- ---------------------------------------------------------------------
-- S12f. Cột bí mật, ranh giới vai trò DB: luuxa_app không đọc được mật khẩu/khóa, không nâng quyền, không DDL; luuxa_readonly chỉ đọc mv_cashflow_monthly
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA app_test TO luuxa_readonly;
GRANT EXECUTE ON FUNCTION app_test.n(text), app_test.expect_error(text, text) TO luuxa_readonly;

DO $$
DECLARE
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_list text; v_in numeric; v_out numeric; v_mv_in numeric; v_mv_out numeric;
BEGIN
  PERFORM app_test.as_super();
  PERFORM app_test.as_user(v_m1);
  -- Cột bí mật: chặn ở tầng quyền cột (kể cả khi RLS cho thấy dòng của chính mình)
  ASSERT app_test.n('SELECT id, email, status FROM users') = 1, 'cột không bí mật của users đọc được (chỉ dòng của mình)';
  PERFORM app_test.expect_error('SELECT password_hash FROM users', 'permission denied');
  PERFORM app_test.expect_error('SELECT * FROM users', 'permission denied');
  PERFORM app_test.expect_error('UPDATE users SET password_hash = ''$argon2id$v=19$m=1,t=1,p=1$a$b''', 'permission denied');
  PERFORM app_test.expect_error('SELECT secret FROM qr_sessions', 'permission denied');
  PERFORM app_test.expect_error('SELECT secret_enc FROM user_mfa_factors', 'permission denied');
  PERFORM app_test.expect_error('SELECT secret_key_version FROM user_mfa_factors', 'permission denied');
  PERFORM app_test.expect_error(format($q$INSERT INTO user_mfa_factors (user_id, secret_enc) VALUES (%L, '\xdeadbeef'::bytea)$q$, v_m1), 'permission denied');
  ASSERT app_test.n('SELECT id, user_id, factor_type, confirmed_at FROM user_mfa_factors') = 0, 'cột không bí mật của user_mfa_factors đọc được';
  FOR v_list IN SELECT unnest(ARRAY['refresh_tokens', 'password_resets', 'mfa_recovery_codes', 'notification_outbox']) LOOP
    PERFORM app_test.expect_error(format('SELECT 1 FROM %I', v_list), 'permission denied');
  END LOOP;
  -- Không nâng quyền / không DDL / không ghi nhật ký giả
  PERFORM app_test.expect_error('CREATE TABLE public.tro_choi (x int)', 'permission denied');
  PERFORM app_test.expect_error('CREATE FUNCTION app.tro_choi() RETURNS int LANGUAGE sql AS ''SELECT 1''', 'permission denied');
  PERFORM app_test.expect_error('INSERT INTO audit_logs (action, entity_table) VALUES (''OTHER'', ''x'')', 'permission denied');
  PERFORM app_test.expect_error('TRUNCATE members CASCADE', 'permission denied');
  PERFORM app_test.as_super();
  -- Các vai trò DB không là thành viên của nhau ⇒ phiên API không thể SET ROLE sang worker/definer/owner (SET ROLE xét theo thành viên của vai trò đăng nhập;
  -- bộ kiểm thử chạy bằng superuser nên không thử trực tiếp được)
  ASSERT NOT EXISTS (SELECT 1 FROM pg_roles a, pg_roles b
                      WHERE a.rolname IN ('luuxa_app', 'luuxa_worker', 'luuxa_readonly', 'luuxa_auth', 'luuxa_definer', 'luuxa_owner')
                        AND b.rolname IN ('luuxa_app', 'luuxa_worker', 'luuxa_readonly', 'luuxa_auth', 'luuxa_definer', 'luuxa_owner')
                        AND a.oid <> b.oid AND pg_has_role(a.oid, b.oid, 'MEMBER')), 'các vai trò luuxa_* không là thành viên của nhau';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('luuxa_app', 'luuxa_readonly', 'luuxa_owner') AND (rolsuper OR rolbypassrls)), 'luuxa_app/luuxa_readonly/luuxa_owner không siêu quyền, không BYPASSRLS';
  ASSERT NOT has_function_privilege('luuxa_app', 'app.fn_housekeeping()', 'EXECUTE') AND NOT has_function_privilege('luuxa_app', 'app.fn_expire_laundry_noshows()', 'EXECUTE')
     AND NOT has_function_privilege('luuxa_app', 'app.fn_qr_mac(uuid, bigint)', 'EXECUTE'), 'luuxa_app không chạy job nền/hàm nội bộ';

  -- luuxa_readonly: chỉ đọc view vật chất tổng hợp dòng tiền, không ghi, không gọi hàm
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error('SELECT app.fn_refresh_cashflow()', 'permission denied');
  PERFORM app_test.as_super();
  ASSERT (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'mv_cashflow_monthly'::regclass) = 'luuxa_definer', 'mv_cashflow_monthly thuộc luuxa_definer (BYPASSRLS) để REFRESH đọc được sổ cái FORCE RLS';
  PERFORM app_test.as_worker();
  PERFORM app.fn_refresh_cashflow();
  PERFORM app.fn_refresh_cashflow();       -- làm mới lặp lại: an toàn
  PERFORM app_test.as_super();
  ASSERT (SELECT count(*) FROM mv_cashflow_monthly) > 0, 'sau khi worker làm mới, view vật chất có dữ liệu dòng tiền';
  SELECT string_agg(c.relname, ', ') INTO v_list FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND c.relname <> 'mv_cashflow_monthly'
     AND (has_table_privilege('luuxa_readonly', c.oid, 'SELECT') OR has_any_column_privilege('luuxa_readonly', c.oid, 'SELECT'));
  ASSERT v_list IS NULL, 'luuxa_readonly đọc được ngoài mv_cashflow_monthly: ' || COALESCE(v_list, '');
  SELECT string_agg(c.relname, ', ') INTO v_list FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND has_table_privilege('luuxa_readonly', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE');
  ASSERT v_list IS NULL, 'luuxa_readonly không được ghi bảng nào: ' || COALESCE(v_list, '');
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace AND has_function_privilege('luuxa_readonly', p.oid, 'EXECUTE')), 'luuxa_readonly không chạy được hàm nào của schema app';
  SELECT COALESCE(SUM(total_in_vnd), 0), COALESCE(SUM(total_out_vnd), 0) INTO v_in, v_out FROM v_period_cashflow;
  SET LOCAL ROLE luuxa_readonly;
  SELECT COALESCE(SUM(total_in_vnd), 0), COALESCE(SUM(total_out_vnd), 0) INTO v_mv_in, v_mv_out FROM mv_cashflow_monthly;
  ASSERT v_mv_in = v_in AND v_mv_out = v_out AND v_in > 0, format('mv_cashflow_monthly khớp v_period_cashflow: thu %s/%s, chi %s/%s', v_mv_in, v_in, v_mv_out, v_out);
  PERFORM app_test.expect_error('SELECT 1 FROM users', 'permission denied');
  PERFORM app_test.expect_error('SELECT 1 FROM v_fund_balances', 'permission denied');
  PERFORM app_test.expect_error('SELECT app.setting_int(''laundry.max_per_week'')', 'permission denied');
  PERFORM app_test.expect_error('INSERT INTO settings (key, value, value_type, description) VALUES (''a.b'', ''1''::jsonb, ''integer'', ''x'')', 'permission denied');
  RESET ROLE;
  PERFORM app_test.as_super();
  RAISE NOTICE 'S12f OK — cột bí mật & ranh giới vai trò DB';
END $$;

-- ---------------------------------------------------------------------
-- S13. Gia cố vòng 2 (phát hiện khi rà soát nghiệp vụ): leo thang vai trò, sửa bằng chứng đồng ý, đọc quá rộng, nhật ký lộ dữ liệu nhạy cảm,
--      thông báo bắt buộc bị lùi mốc, tài khoản chỉ Google
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2'; v_m3 uuid := '00000000-0000-7000-8000-0000000000b3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_ur uuid; v_cons uuid; v_uni uuid; v_notif uuid; v_n bigint; v_u uuid;
BEGIN
  PERFORM app_test.as_super();
  -- ===== user_roles: đổi vai trò không được bằng UPDATE role_id (thu hồi + gán mới, có kiểm tra admin/phạm vi) =====
  SELECT ur.id INTO v_ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = v_m2 AND r.code = 'liturgy_lead' AND ur.revoked_at IS NULL;
  ASSERT v_ur IS NOT NULL, 'điều kiện nền: b2 đang giữ vai trò liturgy_lead (S3)';
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE code = 'admin') WHERE id = %L$q$, v_ur), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE user_roles SET user_id = %L WHERE id = %L$q$, v_m3, v_ur), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE user_roles SET scope_type = 'floor' WHERE id = %L$q$, v_ur), 'permission denied');
  ASSERT app_test.rows_affected(format($q$UPDATE user_roles SET revoked_at = now(), revoked_by = %L, note = 'Hết nhiệm kỳ' WHERE id = %L$q$, v_head, v_ur)) = 1, 'thu hồi vai trò (cột được phép) vẫn làm được';
  PERFORM app_test.as_user(v_m2);
  ASSERT NOT app.has_role('liturgy_lead'), 'thu hồi có hiệu lực ngay';

  -- ===== consents: chỉ rút đồng ý (withdrawn_at); không sửa phiên bản/phương thức/bằng chứng =====
  PERFORM app_test.as_super();
  INSERT INTO consents (member_id, purpose_code, policy_version, method, recorded_by)
  SELECT v_mem1, cp.code, cp.current_version, 'in_app', v_m1 FROM consent_purposes cp WHERE cp.code = 'academic_share_leadership'
  ON CONFLICT DO NOTHING;
  SELECT c.id INTO v_cons FROM consents c WHERE c.member_id = v_mem1 AND c.purpose_code = 'academic_share_leadership' ORDER BY c.granted_at DESC LIMIT 1;
  ASSERT v_cons IS NOT NULL, 'điều kiện nền: có một bản ghi đồng ý của b1';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE consents SET policy_version = policy_version + 1 WHERE id = %L$q$, v_cons), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE consents SET evidence_note = 'tự sửa bằng chứng' WHERE id = %L$q$, v_cons), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE consents SET granted_at = now() - interval '1 year' WHERE id = %L$q$, v_cons), 'permission denied');

  -- ===== student_profiles (có MSSV): không mở cho mọi thành viên =====
  PERFORM app_test.as_super();
  SELECT id INTO v_uni FROM universities WHERE code = 'HUST';
  INSERT INTO student_profiles (member_id, university_id, major, cohort_label, enrollment_year, student_code)
  VALUES (v_mem1, v_uni, 'Công nghệ thông tin', 'K68', 2023, '20230001')
  ON CONFLICT DO NOTHING;
  PERFORM app_test.as_user(v_m3);
  ASSERT app_test.n(format('SELECT 1 FROM student_profiles WHERE member_id = %L', v_mem1)) = 0, 'thành viên khác không thấy MSSV/ngành của b1';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n(format('SELECT 1 FROM student_profiles WHERE member_id = %L', v_mem1)) = 1, 'chính chủ thấy hồ sơ học vụ của mình';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n(format('SELECT 1 FROM student_profiles WHERE member_id = %L', v_mem1)) = 1, 'Trưởng nhà (member.private.read) thấy để điều hành';

  -- ===== Nhật ký kiểm toán: dữ liệu cá nhân nhạy cảm bị che và Admin kỹ thuật không đọc được =====
  PERFORM app_test.as_super();
  ASSERT (SELECT COUNT(*) FROM audit_logs WHERE entity_table IN ('members', 'student_profiles', 'consents')) > 0, 'điều kiện nền: nhật ký có dòng của bảng nhạy cảm';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_table = 'student_profiles' AND (new_data ? 'student_code') AND new_data ->> 'student_code' <> '[REDACTED]'), 'MSSV trong nhật ký bị che';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_table = 'members' AND (new_data ? 'contact_email') AND new_data ->> 'contact_email' <> '[REDACTED]'), 'email liên hệ trong nhật ký bị che';
  PERFORM app_test.as_user(v_admin);
  ASSERT app_test.n($q$SELECT 1 FROM audit_logs WHERE entity_table IN ('members', 'student_profiles', 'consents', 'member_private_details', 'grade_records', 'academic_records')$q$) = 0,
         'Admin kỹ thuật không đọc được nhật ký của dữ liệu cá nhân nhạy cảm';
  ASSERT app_test.n($q$SELECT 1 FROM audit_logs WHERE entity_table = 'user_roles'$q$) > 0, 'nhưng vẫn đọc được nhật ký kỹ thuật (phân quyền, cấu hình)';
  PERFORM app_test.as_user(v_head);
  ASSERT app_test.n($q$SELECT 1 FROM audit_logs WHERE entity_table IN ('members', 'student_profiles', 'consents')$q$) > 0, 'Trưởng nhà (audit.sensitive.read) đọc được';

  -- ===== Thông báo: mốc đã đọc / đã xác nhận chỉ đặt một lần =====
  PERFORM app_test.as_worker();
  v_notif := app.fn_notify(v_mem1, 'announcement.important', 'Thông báo quan trọng thử mốc xác nhận');
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected(format($q$UPDATE notifications SET read_at = now(), acked_at = now() WHERE id = %L$q$, v_notif)) = 1, 'đọc và xác nhận được';
  PERFORM app_test.expect_error(format($q$UPDATE notifications SET acked_at = NULL WHERE id = %L$q$, v_notif), 'chỉ được đặt một lần');
  PERFORM app_test.expect_error(format($q$UPDATE notifications SET read_at = NULL WHERE id = %L$q$, v_notif), 'chỉ được đặt một lần');
  PERFORM app_test.expect_error(format($q$UPDATE notifications SET acked_at = now() + interval '1 day' WHERE id = %L$q$, v_notif), 'chỉ được đặt một lần');

  -- ===== Tài khoản chỉ đăng nhập Google: không mật khẩu nhưng phải có email đã xác minh =====
  PERFORM app_test.as_super();
  INSERT INTO users (email, status, email_verified_at) VALUES ('google.only@x.vn', 'active', now()) RETURNING id INTO v_u;
  ASSERT v_u IS NOT NULL, 'tài khoản Google-only có email đã xác minh được phép active';
  PERFORM app_test.expect_error($q$INSERT INTO users (email, status) VALUES ('khong.xac.minh@x.vn', 'active')$q$, 'ck_users__active_has_pw');
  RAISE NOTICE 'S13 OK — gia cố vòng 2';
END $$;

-- ---------------------------------------------------------------------
-- S14. Gia cố vòng 3 (phát hiện khi rà soát nghiệp vụ lần cuối): điểm danh bỏ qua QR, tự mời vào sự kiện, rút phiếu sau khi đóng,
--      túi quỹ không chọn được khi lập phiếu, mã giao dịch bị mất, hủy phiếu bị từ chối, sửa dòng sao kê, trực nhật (tự đặt kết quả,
--      đổi ca nhảy bước, hạn làm lại, xung đột lợi ích), bảng điểm đã nộp bị sửa vòng, môn tự loại khỏi GPA, tự xác nhận hộ bên kia ở phụ đạo
-- ---------------------------------------------------------------------
SELECT app_test.as_super();
INSERT INTO duty_shifts (code, name, start_time, end_time) VALUES
  ('T_ALLDAY4', 'Ca thử nghiệm cả ngày 4', TIME '00:00', TIME '23:59:59'),
  ('T_ALLDAY5', 'Ca thử nghiệm cả ngày 5', TIME '00:00', TIME '23:59:59');

DO $$
DECLARE
  v_admin uuid := '00000000-0000-7000-8000-0000000000a1'; v_head uuid := '00000000-0000-7000-8000-0000000000a2';
  v_vice uuid := '00000000-0000-7000-8000-0000000000a3'; v_treas uuid := '00000000-0000-7000-8000-0000000000a4';
  v_m1 uuid := '00000000-0000-7000-8000-0000000000b1'; v_m2 uuid := '00000000-0000-7000-8000-0000000000b2';
  v_m3 uuid := '00000000-0000-7000-8000-0000000000b3'; v_m4 uuid := '00000000-0000-7000-8000-0000000000b4';
  v_memhead uuid := '10000000-0000-7000-8000-0000000000a2'; v_memvice uuid := '10000000-0000-7000-8000-0000000000a3';
  v_mem1 uuid := '10000000-0000-7000-8000-0000000000b1'; v_mem2 uuid := '10000000-0000-7000-8000-0000000000b2';
  v_mem3 uuid := '10000000-0000-7000-8000-0000000000b3'; v_mem4 uuid := '10000000-0000-7000-8000-0000000000b4';
  -- sự kiện, biểu quyết
  v_e1 uuid; v_e2 uuid; v_sid uuid; v_sid2 uuid; v_poll uuid; v_oa uuid; v_ob uuid; v_oc uuid;
  -- tài chính
  v_cash uuid; v_bank uuid; v_cat uuid; v_v1 uuid; v_v2 uuid; v_entry uuid; v_le uuid; v_amt bigint; v_batch uuid; v_l1 uuid; v_l3 uuid; v_l4 uuid;
  -- trực nhật
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_a5 uuid; v_a6 uuid; v_ck uuid; v_ck2 uuid; v_ck3 uuid; v_ck5 uuid; v_f uuid; v_rv uuid; v_rv5 uuid;
  v_swap uuid; v_swap2 uuid; v_st text; v_due timestamptz;
  -- học tập, phụ đạo
  v_hust uuid; v_sem1 uuid; v_sem2 uuid; v_rec uuid; v_rec2 uuid; v_c uuid; v_scale uuid;
  v_off uuid; v_req uuid; v_req2 uuid; v_match uuid; v_match2 uuid; v_ses uuid;
BEGIN
  -- ===== BR-EVT-17: không có đường tắt điểm danh — INSERT trực tiếp (self / qr / manual) đều bị chặn, chỉ fn_checkin_by_qr =====
  PERFORM app_test.as_super();
  v_e1 := app_test.mk_event('S14 điểm danh trực tiếp', interval '-5 minutes', interval '2 hours');
  INSERT INTO qr_sessions (event_id, closes_at, created_by) VALUES (v_e1, now() + interval '2 hours', v_vice) RETURNING id INTO v_sid;
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at) VALUES (%L, %L, 'present', 'self', now())$q$, v_e1, v_mem1), 'BR-EVT-17');
  PERFORM app_test.expect_error(format($q$INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at) VALUES (%L, %L, 'present', 'qr', now())$q$, v_e1, v_mem1), 'row-level security');
  PERFORM app_test.expect_error(format($q$INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at, recorded_by) VALUES (%L, %L, 'present', 'manual', now(), %L)$q$, v_e1, v_mem1, v_m1), 'Không có quyền điểm danh hộ');
  ASSERT app_test.n(format('SELECT 1 FROM attendance_records WHERE event_id = %L', v_e1)) = 0, 'không dòng điểm danh nào lọt qua đường tắt';
  ASSERT app.fn_checkin_by_qr(app_test.qr_tok(v_sid)) IS NOT NULL, 'đường chính thức (quét QR) vẫn dùng được';

  -- ===== BR-EVT-18: tự phản hồi RSVP được nhưng không tự đưa mình vào danh sách mời =====
  PERFORM app_test.as_super();
  v_e2 := app_test.mk_event('S14 sự kiện theo danh sách mời', interval '-5 minutes', interval '2 hours');
  UPDATE events SET expected_scope = 'invitees' WHERE id = v_e2;
  INSERT INTO qr_sessions (event_id, closes_at, created_by) VALUES (v_e2, now() + interval '2 hours', v_vice) RETURNING id INTO v_sid2;
  PERFORM app_test.as_user(v_m4);
  INSERT INTO event_participants (event_id, member_id, rsvp) VALUES (v_e2, v_mem4, 'going');
  PERFORM app_test.as_super();
  ASSERT NOT (SELECT is_invited FROM event_participants WHERE event_id = v_e2 AND member_id = v_mem4), 'tự thêm dòng RSVP ⇒ is_invited bị ép = false';
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_checkin_by_qr(%L)$q$, app_test.qr_tok(v_sid2)), 'không thuộc danh sách mời');
  PERFORM app_test.expect_error(format($q$UPDATE event_participants SET is_invited = true WHERE event_id = %L AND member_id = %L$q$, v_e2, v_mem4), 'BR-EVT-18');
  ASSERT app_test.rows_affected(format($q$UPDATE event_participants SET rsvp = 'maybe' WHERE event_id = %L AND member_id = %L$q$, v_e2, v_mem4)) = 1, 'vẫn đổi được RSVP của mình';
  PERFORM app_test.as_user(v_head);
  INSERT INTO event_participants (event_id, member_id) VALUES (v_e2, v_mem3);
  ASSERT (SELECT is_invited FROM event_participants WHERE event_id = v_e2 AND member_id = v_mem3), 'người quản lý mời ⇒ is_invited = true';
  ASSERT app_test.rows_affected(format($q$UPDATE event_participants SET is_invited = true WHERE event_id = %L AND member_id = %L$q$, v_e2, v_mem4)) = 1, 'người quản lý đưa m4 vào danh sách mời';
  PERFORM app_test.as_user(v_m4);
  ASSERT app.fn_checkin_by_qr(app_test.qr_tok(v_sid2)) IS NOT NULL, 'đã được mời thì điểm danh được';

  -- ===== BR-EVT-19: biểu quyết đã có phiếu — khóa cấu hình/phương án, không rút phiếu sau khi đóng =====
  PERFORM app_test.as_user(v_head);
  INSERT INTO polls (question, is_multi_select, max_choices, is_anonymous, created_by) VALUES ('S14 Chọn hai món cho bữa tiệc?', true, 2, false, v_head) RETURNING id INTO v_poll;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Phương án A', 1) RETURNING id INTO v_oa;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Phương án B', 2) RETURNING id INTO v_ob;
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Phương án C', 3) RETURNING id INTO v_oc;
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_cast_vote(v_poll, ARRAY[v_oa, v_ob]);
  ASSERT app_test.n(format('SELECT 1 FROM poll_votes WHERE poll_id = %L', v_poll)) = 2, 'm1 có 2 phiếu';
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$UPDATE polls SET is_anonymous = true WHERE id = %L$q$, v_poll), 'BR-EVT-19');
  PERFORM app_test.expect_error(format($q$UPDATE polls SET max_choices = 1 WHERE id = %L$q$, v_poll), 'BR-EVT-19');
  PERFORM app_test.expect_error(format($q$UPDATE polls SET question = 'Đổi nghĩa câu hỏi sau khi đã có phiếu' WHERE id = %L$q$, v_poll), 'BR-EVT-19');
  PERFORM app_test.expect_error(format($q$UPDATE poll_options SET label = 'Đổi nhãn sau khi có phiếu' WHERE id = %L$q$, v_oa), 'BR-EVT-19');
  PERFORM app_test.expect_error(format($q$DELETE FROM poll_options WHERE id = %L$q$, v_oc), 'BR-EVT-19');
  PERFORM app_test.expect_error(format($q$DELETE FROM polls WHERE id = %L$q$, v_poll), 'BR-EVT-19');
  INSERT INTO poll_options (poll_id, label, sort_order) VALUES (v_poll, 'Phương án D', 4);
  ASSERT app_test.rows_affected(format($q$UPDATE polls SET description = 'Bổ sung mô tả' WHERE id = %L$q$, v_poll)) = 1, 'vẫn sửa được mô tả và thêm phương án khi poll còn mở';
  UPDATE polls SET status = 'closed' WHERE id = v_poll;
  PERFORM app_test.expect_error(format($q$INSERT INTO poll_options (poll_id, label, sort_order) VALUES (%L, 'Thêm sau khi đóng', 5)$q$, v_poll), 'BR-EVT-19');
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.rows_affected(format($q$DELETE FROM poll_votes WHERE poll_id = %L$q$, v_poll)) = 0, 'không rút được phiếu sau khi poll đã đóng';
  ASSERT app_test.n(format('SELECT 1 FROM poll_votes WHERE poll_id = %L', v_poll)) = 2, 'phiếu còn nguyên';
  PERFORM app_test.expect_error(format($q$SELECT app.fn_cast_vote(%L, ARRAY[%L]::uuid[])$q$, v_poll, v_oc), 'BR-EVT-08');
  ASSERT app_test.n(format('SELECT 1 FROM poll_votes WHERE poll_id = %L', v_poll)) = 2, 'đổi phiếu sau khi đóng bị hoàn tác trọn vẹn';

  -- ===== D-04: chọn túi quỹ khi lập phiếu chi dù không đọc được bảng funds =====
  PERFORM app_test.as_super();
  SELECT id INTO v_cash FROM funds WHERE code = 'CASH';
  SELECT id INTO v_bank FROM funds WHERE code = 'BANK_MAIN';
  SELECT id INTO v_cat FROM categories WHERE kind = 'expense' AND code = 'FOOD';
  PERFORM app_test.as_user(v_m1);
  ASSERT app_test.n('SELECT 1 FROM funds') = 0, 'thành viên thường không đọc được bảng funds';
  ASSERT app_test.n('SELECT 1 FROM app.fn_fund_options()') >= 2, 'nhưng lấy được danh sách rút gọn (id, code, name, fund_type) để chọn túi quỹ';
  PERFORM app_test.as_user(v_admin);
  PERFORM app_test.expect_error('SELECT * FROM app.fn_fund_options()', 'Không có quyền xem danh sách túi quỹ');

  -- ===== D-05 + D-18: mã giao dịch được giữ trong sổ cái; phiếu bị từ chối hủy thẳng được =====
  PERFORM app_test.as_user(v_m1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, requested_by)
  VALUES ('S14 mua đồ nhỏ', 50000, v_cat, app.local_today(), v_cash, v_mem1, v_m1) RETURNING id INTO v_v1;
  PERFORM app.fn_submit_expense(v_v1);
  INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, requested_by)
  VALUES ('S14 phiếu bị từ chối', 40000, v_cat, app.local_today(), v_cash, v_mem1, v_m1) RETURNING id INTO v_v2;
  PERFORM app.fn_submit_expense(v_v2);
  PERFORM app_test.as_user(v_treas);
  PERFORM app.fn_decide_expense(v_v1, 'approved', 'Đúng giá');
  PERFORM app.fn_decide_expense(v_v2, 'rejected', 'Thiếu chứng từ giải trình');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_pay_expense(%L, 'cash', app.local_today(), %L)$q$, v_v1, repeat('x', 101)), 'tối đa 100 ký tự');
  v_entry := app.fn_pay_expense(v_v1, 'bank_transfer', app.local_today(), 'FT26S14-0001');
  ASSERT (SELECT description FROM ledger_entries WHERE id = v_entry) LIKE '%[tham chiếu FT26S14-0001]%', 'mã tham chiếu giao dịch được giữ vĩnh viễn trong mô tả bút toán';
  PERFORM app_test.as_user(v_m1);
  PERFORM app.fn_cancel_expense(v_v2, 'Không còn cần khoản chi này');
  ASSERT (SELECT status FROM expense_vouchers WHERE id = v_v2) = 'cancelled', 'phiếu bị từ chối được người tạo hủy thẳng (rejected → cancelled)';

  -- ===== D-06 + D-19 (BR-FIN-40/50): dòng sao kê là dữ liệu gốc — nhập trùng, sửa số tiền/ngày, xóa dòng đã khớp đều bị chặn =====
  PERFORM app_test.as_super();
  SELECT le.id, le.amount_vnd INTO v_le, v_amt FROM ledger_entries le WHERE le.fund_id = v_bank AND le.fund_seq = 1 AND le.direction = 'in';
  ASSERT v_le IS NOT NULL, 'điều kiện nền: bút toán số dư đầu kỳ của quỹ ngân hàng';
  PERFORM app_test.as_user(v_treas);
  v_batch := app.uuid_v7();
  INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, imported_by)
  VALUES (v_bank, v_batch, app.local_today(), 'in', v_amt, 'S14 nhập sao kê 1', 'S14-REF-1', v_treas) RETURNING id INTO v_l1;
  PERFORM app_test.expect_error(format($q$INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, imported_by)
      VALUES (%L, %L, app.local_today(), 'in', %s, 'nhập lại cùng giao dịch', 'S14-REF-1', %L)$q$, v_bank, v_batch, v_amt, v_treas), 'ux_bank_statement_lines__ref');
  PERFORM app_test.expect_error(format($q$INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, match_status, matched_ledger_entry_id, matched_at)
      VALUES (%L, %L, app.local_today(), 'in', 5000, 'matched', %L, now())$q$, v_bank, v_batch, v_le), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE bank_statement_lines SET amount_vnd = amount_vnd + 1 WHERE id = %L$q$, v_l1), 'permission denied');
  PERFORM app_test.expect_error(format($q$UPDATE bank_statement_lines SET txn_date = txn_date - 1 WHERE id = %L$q$, v_l1), 'permission denied');
  INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, imported_by)
  VALUES (v_bank, v_batch, app.local_today(), 'out', 777000, 'S14 nhập sao kê 3', 'S14-REF-3', v_treas) RETURNING id INTO v_l3;
  PERFORM app_test.expect_error(format($q$UPDATE bank_statement_lines SET match_status = 'matched', matched_ledger_entry_id = %L WHERE id = %L$q$, v_le, v_l3), 'BR-FIN-40');
  ASSERT app_test.rows_affected(format($q$UPDATE bank_statement_lines SET match_status = 'matched', matched_ledger_entry_id = %L WHERE id = %L$q$, v_le, v_l1)) = 1, 'khớp đúng quỹ + chiều + số tiền';
  ASSERT (SELECT matched_by FROM bank_statement_lines WHERE id = v_l1) = v_treas AND (SELECT matched_at FROM bank_statement_lines WHERE id = v_l1) = now(), 'matched_at/matched_by do trigger ghi (giờ máy chủ, người đăng nhập)';
  INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, imported_by)
  VALUES (v_bank, v_batch, app.local_today(), 'in', v_amt, 'S14 nhập sao kê 4', 'S14-REF-4', v_treas) RETURNING id INTO v_l4;
  PERFORM app_test.expect_error(format($q$UPDATE bank_statement_lines SET match_status = 'matched', matched_ledger_entry_id = %L WHERE id = %L$q$, v_le, v_l4), 'ux_bank_statement_lines__ledger');
  PERFORM app_test.expect_error(format($q$DELETE FROM bank_statement_lines WHERE id = %L$q$, v_l1), 'BR-FIN-50');
  ASSERT app_test.rows_affected(format($q$UPDATE bank_statement_lines SET match_status = 'unmatched' WHERE id = %L$q$, v_l1)) = 1, 'bỏ khớp được (có audit)';
  ASSERT (SELECT matched_ledger_entry_id IS NULL AND matched_at IS NULL AND matched_by IS NULL FROM bank_statement_lines WHERE id = v_l1), 'bỏ khớp ⇒ xóa liên kết và mốc khớp';
  ASSERT app_test.rows_affected(format($q$DELETE FROM bank_statement_lines WHERE id = %L$q$, v_l1)) = 1, 'dòng chưa khớp xóa được';

  -- ===== BR-DUTY-27 + BR-DUTY-26: người có duty.manage không tự đặt kết quả ca; làm lại có hạn riêng =====
  PERFORM app_test.as_super();
  v_a1 := app_test.mk_assignment(app.local_today(), 'CHAPEL', ARRAY[v_mem1, v_mem4], 'T_ALLDAY4');
  v_f := app_test.mk_file(v_m1, 'cleaning-evidence', encode(sha256('s14-ck1'::bytea), 'hex'), app_test.ph('s14-ck1'));
  PERFORM app_test.as_user(v_m1);
  INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id, note) VALUES (v_a1, 1, v_mem1, v_f, 'S14 check-in lần 1') RETURNING id INTO v_ck;
  PERFORM app_test.mk_checkin_items(v_ck);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$UPDATE duty_assignments SET status = 'approved' WHERE id = %L$q$, v_a1), 'BR-DUTY-27');
  PERFORM app_test.expect_error(format($q$UPDATE duty_assignments SET status = 'rework_required', status_reason = 'tự đặt' WHERE id = %L$q$, v_a1), 'BR-DUTY-27');
  PERFORM app_test.expect_error(format($q$UPDATE duty_assignments SET attempt_count = 0 WHERE id = %L$q$, v_a1), 'BR-DUTY-27');
  PERFORM app_test.as_user(v_vice);
  INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, feedback) VALUES (v_ck, v_memvice, 'rework', 'S14 cần lau lại') RETURNING id INTO v_rv;
  PERFORM app_test.as_super();
  SELECT status::text, rework_due_at INTO v_st, v_due FROM duty_assignments WHERE id = v_a1;
  ASSERT v_st = 'rework_required' AND v_due BETWEEN now() + interval '23 hours' AND now() + interval '25 hours', 'hạn làm lại = lúc nghiệm thu + duty.rework.window_hours (24 giờ), thực tế ' || COALESCE(v_due::text, 'NULL');
  v_f := app_test.mk_file(v_m4, 'cleaning-evidence', encode(sha256('s14-ck2'::bytea), 'hex'), app_test.ph('s14-ck2'));
  PERFORM app_test.as_user(v_m4);
  INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (v_a1, 1, v_mem4, v_f) RETURNING id INTO v_ck2;
  PERFORM app_test.mk_checkin_items(v_ck2);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  ASSERT (SELECT attempt FROM duty_checkins WHERE id = v_ck2) = 2 AND NOT (SELECT is_late FROM duty_checkins WHERE id = v_ck2), 'lần làm lại là attempt 2 và không bị tính muộn theo ca gốc';
  PERFORM app_test.as_user(v_vice);
  INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score, feedback) VALUES (v_ck2, v_memvice, 'approved', 5, 'Đạt sau khi làm lại');
  PERFORM app_test.as_super();
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a1) = 'approved' AND (SELECT rework_due_at FROM duty_assignments WHERE id = v_a1) IS NULL, 'duyệt ⇒ approved và xóa hạn làm lại';

  -- Ca đã qua nhiều ngày vẫn cho làm lại trong hạn (không bị khung giờ của ca gốc chặn); hết hạn thì BR-DUTY-26 và tiến trình nền đánh dấu bỏ ca
  v_a2 := app_test.mk_assignment(app.local_today() - 3, 'CHAPEL', ARRAY[v_mem1, v_mem4], 'T_ALLDAY4');
  UPDATE duty_assignments SET status = 'checked_in', attempt_count = 1 WHERE id = v_a2;
  UPDATE duty_assignments SET status = 'rework_required', status_reason = 'S14 làm lại (thiết lập bởi quản trị)', rework_due_at = now() + interval '10 hours' WHERE id = v_a2;
  v_f := app_test.mk_file(v_m1, 'cleaning-evidence', encode(sha256('s14-ck3'::bytea), 'hex'), app_test.ph('s14-ck3'));
  PERFORM app_test.as_user(v_m1);
  INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (v_a2, 1, v_mem1, v_f) RETURNING id INTO v_ck3;
  PERFORM app_test.mk_checkin_items(v_ck3);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  ASSERT (SELECT attempt FROM duty_checkins WHERE id = v_ck3) = 2, 'ca 3 ngày trước vẫn check-in lại được trong hạn làm lại';
  PERFORM app_test.as_super();
  v_a3 := app_test.mk_assignment(app.local_today() - 4, 'STAIRS', ARRAY[v_mem1, v_mem4], 'T_ALLDAY4');
  UPDATE duty_assignments SET status = 'checked_in', attempt_count = 1 WHERE id = v_a3;
  UPDATE duty_assignments SET status = 'rework_required', status_reason = 'S14 làm lại quá hạn', rework_due_at = now() - interval '1 minute' WHERE id = v_a3;
  v_f := app_test.mk_file(v_m4, 'cleaning-evidence', encode(sha256('s14-ck4'::bytea), 'hex'), app_test.ph('s14-ck4'));
  PERFORM app_test.as_user(v_m4);
  PERFORM app_test.expect_error(format($q$INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (%L, 1, %L, %L)$q$, v_a3, v_mem4, v_f), 'BR-DUTY-26');
  PERFORM app_test.as_super();
  v_a4 := app_test.mk_assignment(app.local_today() - 5, 'CHAPEL', ARRAY[v_mem1, v_mem4], 'T_ALLDAY4');
  UPDATE duty_assignments SET status = 'checked_in', attempt_count = 1 WHERE id = v_a4;
  UPDATE duty_assignments SET status = 'rework_required', status_reason = 'S14 làm lại còn hạn', rework_due_at = now() + interval '10 hours' WHERE id = v_a4;
  PERFORM app.fn_mark_missed_duties();
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a4) = 'rework_required', 'còn hạn làm lại ⇒ chưa bị đánh dấu bỏ ca dù ca gốc đã qua 5 ngày';
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a3) = 'missed', 'hết hạn làm lại ⇒ missed';
  UPDATE duty_assignments SET rework_due_at = now() - interval '1 minute' WHERE id = v_a4;
  PERFORM app.fn_mark_missed_duties();
  ASSERT (SELECT status FROM duty_assignments WHERE id = v_a4) = 'missed', 'quá hạn làm lại ⇒ missed';

  -- ===== BR-DUTY-21 + BR-DUTY-28: đổi ca đúng người đúng bước; người liên quan không tự duyệt/tự quyết =====
  v_a5 := app_test.mk_assignment(app.local_today() + 21, 'GATE', ARRAY[v_memvice, v_mem4], 'T_ALLDAY4');
  PERFORM app_test.as_user(v_vice);
  v_swap := app.fn_request_duty_swap(v_a5, v_mem2, 'S14 trùng lịch học');
  PERFORM app_test.expect_error(format($q$UPDATE duty_swap_requests SET status = 'pending_admin' WHERE id = %L$q$, v_swap), 'row-level security');
  PERFORM app_test.expect_error(format($q$UPDATE duty_swap_requests SET peer_responded_at = now() WHERE id = %L$q$, v_swap), 'permission denied');
  PERFORM app_test.as_user(v_m2);
  ASSERT app_test.rows_affected(format($q$UPDATE duty_swap_requests SET status = 'pending_admin' WHERE id = %L$q$, v_swap)) = 0, 'người nhận không tự chuyển trạng thái bằng UPDATE trực tiếp';
  PERFORM app_test.as_user(v_m3);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_peer_respond_duty_swap(%L, true)$q$, v_swap), 'Chỉ người được nhờ đổi ca');
  PERFORM app_test.as_user(v_m2);
  PERFORM app.fn_peer_respond_duty_swap(v_swap, true, 'Đồng ý nhận ca');
  PERFORM app_test.expect_error(format($q$SELECT app.fn_peer_respond_duty_swap(%L, true)$q$, v_swap), 'không còn chờ người nhận');
  PERFORM app_test.as_user(v_vice);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_admin_decide_duty_swap(%L, true, 'Tự duyệt')$q$, v_swap), 'BR-DUTY-28');
  PERFORM app_test.as_user(v_head);
  PERFORM app.fn_admin_decide_duty_swap(v_swap, true, 'Đồng ý');
  ASSERT EXISTS (SELECT 1 FROM duty_assignment_members WHERE assignment_id = v_a5 AND member_id = v_mem2)
         AND NOT EXISTS (SELECT 1 FROM duty_assignment_members WHERE assignment_id = v_a5 AND member_id = v_memvice), 'sau khi Trưởng nhà duyệt: m2 vào ca, Phó nhà ra khỏi ca';
  -- Người xin hủy đơn của mình được (đường duy nhất còn lại của UPDATE trực tiếp)
  PERFORM app_test.as_super();
  v_a6 := app_test.mk_assignment(app.local_today() + 22, 'GATE', ARRAY[v_memvice, v_mem4], 'T_ALLDAY4');
  PERFORM app_test.as_user(v_vice);
  v_swap2 := app.fn_request_duty_swap(v_a6, v_mem2, 'S14 đơn sẽ hủy');
  ASSERT app_test.rows_affected(format($q$UPDATE duty_swap_requests SET status = 'cancelled' WHERE id = %L$q$, v_swap2)) = 1, 'người xin hủy được đơn đang chờ của mình';
  -- Khiếu nại: Trưởng nhà thuộc ca thì không tự quyết
  PERFORM app_test.as_super();
  v_a5 := app_test.mk_assignment(app.local_today(), 'GATE', ARRAY[v_memhead, v_mem4], 'T_ALLDAY5');
  v_f := app_test.mk_file(v_m4, 'cleaning-evidence', encode(sha256('s14-ck5'::bytea), 'hex'), app_test.ph('s14-ck5'));
  PERFORM app_test.as_user(v_m4);
  INSERT INTO duty_checkins (assignment_id, attempt, checked_in_by_member_id, evidence_file_id) VALUES (v_a5, 1, v_mem4, v_f) RETURNING id INTO v_ck5;
  PERFORM app_test.mk_checkin_items(v_ck5);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM app_test.as_user(v_vice);
  INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, feedback) VALUES (v_ck5, v_memvice, 'rework', 'S14 chưa sạch góc cổng') RETURNING id INTO v_rv5;
  PERFORM app_test.as_user(v_m4);
  INSERT INTO duty_review_appeals (review_id, appellant_member_id, reason) VALUES (v_rv5, v_mem4, 'Góc cổng đã dọn xong, ảnh chụp trước giờ nghiệm thu');
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$SELECT app.fn_decide_review_appeal((SELECT id FROM duty_review_appeals WHERE review_id = %L), true, 'S14 Trưởng nhà tự quyết ca của mình')$q$, v_rv5), 'BR-DUTY-28');

  -- ===== BR-MER-05: người có merit.adjust không tự cộng điểm cho chính mình =====
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$INSERT INTO merit_entries (member_id, rule_code, points, occurred_on, note, created_by) VALUES (%L, 'manual_adjust', 5, app.local_today(), 'Tự cộng điểm cho mình', %L)$q$, v_memhead, v_head), 'row-level security');
  INSERT INTO merit_entries (member_id, rule_code, points, occurred_on, note, created_by) VALUES (v_mem1, 'manual_adjust', 2, app.local_today(), 'Giúp việc đột xuất', v_head);

  -- ===== BR-ACAD-16 + BR-ACAD-18: bảng điểm đã nộp không bị sửa vòng; môn tự tạo luôn tính GPA =====
  PERFORM app_test.as_super();
  SELECT id INTO v_hust FROM universities WHERE code = 'HUST';
  SELECT s.id INTO v_sem1 FROM semesters s WHERE NOT EXISTS (SELECT 1 FROM academic_records ar WHERE ar.member_id = v_mem3 AND ar.semester_id = s.id) ORDER BY s.starts_on LIMIT 1;
  SELECT s.id INTO v_sem2 FROM semesters s WHERE s.id <> v_sem1 AND NOT EXISTS (SELECT 1 FROM academic_records ar WHERE ar.member_id = v_mem3 AND ar.semester_id = s.id) ORDER BY s.starts_on LIMIT 1;
  ASSERT v_sem1 IS NOT NULL AND v_sem2 IS NOT NULL, 'điều kiện nền: còn ít nhất hai học kỳ chưa có bảng điểm của m3';
  v_scale := app.fn_scale_for(v_hust, DATE '2025-10-01');
  v_c := app_test.mk_course(v_hust, 'S14 Môn thử khóa bảng điểm');
  v_f := app_test.mk_file(v_m3, 'academic-evidence', encode(sha256('s14-transcript'::bytea), 'hex'), NULL);
  PERFORM app_test.as_user(v_m3);
  INSERT INTO academic_records (member_id, semester_id, university_id, scale_id) VALUES (v_mem3, v_sem1, v_hust, v_scale) RETURNING id INTO v_rec;
  INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score) VALUES (v_rec, v_c, 3, 3.0, 4.0);
  INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose) VALUES (v_f, 'academic_record', v_rec, 'transcript');
  UPDATE academic_records SET status = 'submitted' WHERE id = v_rec;
  INSERT INTO academic_records (member_id, semester_id, university_id, scale_id) VALUES (v_mem3, v_sem2, v_hust, v_scale) RETURNING id INTO v_rec2;
  PERFORM app_test.expect_error(format($q$UPDATE academic_records SET semester_id = %L WHERE id = %L$q$, v_sem2, v_rec), 'BR-ACAD-16');
  PERFORM app_test.expect_error(format($q$DELETE FROM grade_records WHERE record_id = %L$q$, v_rec), 'BR-ACAD-16');
  PERFORM app_test.expect_error(format($q$UPDATE grade_records SET record_id = %L WHERE record_id = %L$q$, v_rec2, v_rec), 'BR-ACAD-16');
  PERFORM set_config('app.academic_unlock', 'on', true);
  PERFORM app_test.expect_error(format($q$UPDATE grade_records SET final_score = 9.9 WHERE record_id = %L$q$, v_rec), 'BR-ACAD-03');
  PERFORM set_config('app.academic_unlock', '', true);
  ASSERT (SELECT final_score FROM grade_records WHERE record_id = v_rec) = 4.0, 'điểm môn của bảng điểm đã nộp còn nguyên';
  PERFORM app_test.expect_error(format($q$INSERT INTO courses (university_id, name, excluded_from_gpa) VALUES (%L, 'S14 môn tự loại khỏi GPA', true)$q$, v_hust), 'BR-ACAD-18');
  PERFORM app_test.as_user(v_head);
  INSERT INTO courses (university_id, name, excluded_from_gpa) VALUES (v_hust, 'S14 Giáo dục thể chất (môn điều kiện)', true);

  -- ===== BR-TUT-05 + BR-TUT-06: mỗi bên chỉ xác nhận phía mình; buổi kèm thuộc cặp active và không ở tương lai =====
  PERFORM app_test.as_super();
  INSERT INTO tutoring_offers (tutor_member_id, subject_text, capacity) VALUES (v_mem1, 'S14 Giải tích', 2) RETURNING id INTO v_off;
  INSERT INTO tutoring_requests (mentee_member_id, subject_text) VALUES (v_mem2, 'S14 Giải tích') RETURNING id INTO v_req;
  INSERT INTO tutoring_requests (mentee_member_id, subject_text) VALUES (v_mem3, 'S14 Giải tích 2') RETURNING id INTO v_req2;
  PERFORM app_test.as_user(v_head);
  PERFORM app_test.expect_error(format($q$INSERT INTO tutoring_matches (offer_id, request_id, tutor_member_id, mentee_member_id, mentee_accepted_at, proposed_by) VALUES (%L, %L, %L, %L, now(), %L)$q$, v_off, v_req, v_mem1, v_mem2, v_head), 'BR-TUT-05');
  INSERT INTO tutoring_matches (offer_id, request_id, tutor_member_id, mentee_member_id, proposed_by) VALUES (v_off, v_req, v_mem1, v_mem2, v_head) RETURNING id INTO v_match;
  INSERT INTO tutoring_matches (offer_id, request_id, tutor_member_id, mentee_member_id, proposed_by) VALUES (v_off, v_req2, v_mem1, v_mem3, v_head) RETURNING id INTO v_match2;
  PERFORM app_test.expect_error(format($q$UPDATE tutoring_matches SET tutor_member_id = %L WHERE id = %L$q$, v_mem4, v_match), 'BR-TUT-05');
  PERFORM app_test.expect_error(format($q$UPDATE tutoring_matches SET tutor_accepted_at = now() WHERE id = %L$q$, v_match), 'BR-TUT-05');
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$UPDATE tutoring_matches SET mentee_accepted_at = now() WHERE id = %L$q$, v_match), 'BR-TUT-05');
  ASSERT app_test.rows_affected(format($q$UPDATE tutoring_matches SET tutor_accepted_at = now() - interval '5 days' WHERE id = %L$q$, v_match)) = 1, 'người kèm đặt mốc đồng ý của chính mình';
  ASSERT (SELECT tutor_accepted_at FROM tutoring_matches WHERE id = v_match) = now(), 'mốc đồng ý luôn là giờ máy chủ (không lùi mốc)';
  ASSERT (SELECT status FROM tutoring_matches WHERE id = v_match) = 'proposed', 'mới một bên đồng ý ⇒ vẫn proposed';
  PERFORM app_test.expect_error(format($q$UPDATE tutoring_matches SET tutor_accepted_at = NULL WHERE id = %L$q$, v_match), 'BR-TUT-05');
  PERFORM app_test.as_user(v_m2);
  UPDATE tutoring_matches SET mentee_accepted_at = now() WHERE id = v_match;
  ASSERT (SELECT status FROM tutoring_matches WHERE id = v_match) = 'active', 'cả hai tự đồng ý ⇒ cặp active';
  PERFORM app_test.as_user(v_m1);
  PERFORM app_test.expect_error(format($q$INSERT INTO tutoring_sessions (match_id, held_at, duration_minutes) VALUES (%L, now() - interval '1 hour', 60)$q$, v_match2), 'BR-TUT-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO tutoring_sessions (match_id, held_at, duration_minutes) VALUES (%L, now() + interval '1 day', 60)$q$, v_match), 'BR-TUT-06');
  PERFORM app_test.expect_error(format($q$INSERT INTO tutoring_sessions (match_id, held_at, duration_minutes, mentee_confirmed_at) VALUES (%L, now() - interval '5 hours', 300, now())$q$, v_match), 'BR-TUT-05');
  INSERT INTO tutoring_sessions (match_id, held_at, duration_minutes, topic) VALUES (v_match, now() - interval '5 hours', 300, 'S14 ôn giải tích') RETURNING id INTO v_ses;
  PERFORM app_test.expect_error(format($q$UPDATE tutoring_sessions SET mentee_confirmed_at = now() WHERE id = %L$q$, v_ses), 'BR-TUT-05');
  UPDATE tutoring_sessions SET tutor_confirmed_at = now() WHERE id = v_ses;
  PERFORM app_test.as_super();
  ASSERT NOT EXISTS (SELECT 1 FROM merit_entries WHERE source_table = 'tutoring_sessions' AND source_id = v_ses), 'mới một bên xác nhận ⇒ chưa có điểm đóng góp';
  PERFORM app_test.as_user(v_m2);
  PERFORM app_test.expect_error(format($q$UPDATE tutoring_sessions SET duration_minutes = 15 WHERE id = %L$q$, v_ses), 'BR-TUT-05');
  UPDATE tutoring_sessions SET mentee_confirmed_at = now() WHERE id = v_ses;
  PERFORM app_test.as_super();
  ASSERT (SELECT points FROM merit_entries WHERE source_table = 'tutoring_sessions' AND source_id = v_ses) = 10, 'cả hai tự xác nhận ⇒ người kèm nhận 10 điểm cho buổi 5 giờ';
  RAISE NOTICE 'S14 OK — gia cố vòng 3 (điểm danh, mời, biểu quyết, quỹ, sao kê, trực nhật, đổi ca, bảng điểm, phụ đạo)';
END $$;

-- ---------------------------------------------------------------------
-- KẾT THÚC: hoàn tác mọi thay đổi của bộ kiểm thử
-- ---------------------------------------------------------------------
ROLLBACK;
