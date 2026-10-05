-- =====================================================================
-- KHỐI 4.6.4 — CẤP QUYỀN MỨC BẢNG/CỘT CHO TỪNG VAI TRÒ DB (lớp thứ hai cạnh RLS)
-- Nguyên tắc: RLS quyết định HÀNG; GRANT quyết định BẢNG/CỘT/THAO TÁC. Bảng bất biến hoặc chỉ ghi qua hàm
-- SECURITY DEFINER thì luuxa_app KHÔNG có quyền ghi trực tiếp, kể cả khi lỡ có chính sách RLS cho phép.
-- =====================================================================

DO $$ BEGIN
  GRANT USAGE ON SCHEMA public TO luuxa_app, luuxa_worker, luuxa_readonly, luuxa_auth, luuxa_definer;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
GRANT USAGE ON SCHEMA app    TO luuxa_app, luuxa_worker, luuxa_readonly, luuxa_auth, luuxa_definer;
DO $$ BEGIN
  GRANT USAGE ON SCHEMA extensions TO luuxa_app, luuxa_worker, luuxa_readonly, luuxa_auth, luuxa_definer, luuxa_owner;
EXCEPTION WHEN invalid_schema_name OR insufficient_privilege THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- A. luuxa_app — API runtime (chịu RLS)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO luuxa_app;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO luuxa_app;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
GRANT USAGE ON SEQUENCE expense_voucher_seq TO luuxa_app, luuxa_definer;

-- A1. Thu hồi mọi quyền ghi trên các bảng bất biến / chỉ ghi qua hàm hoặc trigger SECURITY DEFINER
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, expense_approvals, duty_reviews, merit_entries FROM luuxa_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  expense_status_history, duty_status_history, duty_swap_status_history, issue_status_history,
  gpa_snapshots, ai_usage_daily, prayer_intention_authors, audit_logs FROM luuxa_app;
REVOKE INSERT, DELETE, TRUNCATE ON prayer_intentions FROM luuxa_app;
REVOKE INSERT, DELETE, TRUNCATE ON notifications FROM luuxa_app;
DO $$ BEGIN
  REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM luuxa_app;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- A2. Bảng cấu hình/tra cứu: chỉ UPDATE các cột được phép; không INSERT/DELETE trực tiếp
REVOKE INSERT, UPDATE, DELETE ON roles, permissions, role_permissions, dioceses, notification_types, consent_purposes FROM luuxa_app;
REVOKE INSERT, DELETE ON settings FROM luuxa_app;
REVOKE UPDATE ON settings FROM luuxa_app;
GRANT UPDATE (value, updated_by, updated_at, version) ON settings TO luuxa_app;
REVOKE UPDATE ON notifications FROM luuxa_app;
GRANT UPDATE (read_at, acked_at, archived_at) ON notifications TO luuxa_app;

-- A2c. Cột bất biến sau khi tạo (chống leo thang đặc quyền / sửa bằng chứng): đổi vai trò = thu hồi dòng cũ + gán dòng mới (có kiểm tra
--      admin/phạm vi); bằng chứng đồng ý chỉ được RÚT (đặt withdrawn_at), không sửa nội dung/phiên bản/phương thức.
REVOKE UPDATE ON user_roles, consents FROM luuxa_app;
GRANT UPDATE (valid_to, revoked_at, revoked_by, note) ON user_roles TO luuxa_app;
GRANT UPDATE (withdrawn_at) ON consents TO luuxa_app;

-- A2b. Tài chính: mọi thay đổi trạng thái/tiền đi qua hàm SECURITY DEFINER (kiểm quyền + ghi sổ trong thân hàm).
--      Thu hồi ghi trực tiếp để người có quyền "chi" không thể INSERT bút toán không phiếu, người có quyền "chốt" không thể
--      UPDATE kỳ sang closed kèm confirmed_by giả, người có quyền "thu" không thể sửa số tiền phiếu thu hay tự đặt paid_vnd.
REVOKE INSERT, UPDATE, DELETE ON ledger_entries, financial_periods, period_fund_balances,
  contribution_payments, contribution_payment_allocations FROM luuxa_app;
REVOKE INSERT, UPDATE ON funds, contributions FROM luuxa_app;
GRANT INSERT (code, name, fund_type, bank_name, bank_account_last4, account_holder_name, is_personal_account, event_id, description) ON funds TO luuxa_app;
GRANT UPDATE (name, bank_name, bank_account_last4, account_holder_name, description, is_active) ON funds TO luuxa_app;
GRANT INSERT (plan_id, member_id, amount_due_vnd, due_date, note) ON contributions TO luuxa_app;
GRANT UPDATE (due_date, note, last_reminded_at, discount_vnd, discount_reason) ON contributions TO luuxa_app;
-- Đơn đổi ca (BR-DUTY-21): luuxa_app chỉ được UPDATE cột status (người xin hủy đơn); mọi mốc xác nhận/quyết định do hàm SECURITY DEFINER ghi
REVOKE UPDATE ON duty_swap_requests FROM luuxa_app;
GRANT UPDATE (status) ON duty_swap_requests TO luuxa_app;
-- Dòng sao kê (BR-FIN-50): nhập mới luôn ở trạng thái unmatched; sau khi nhập chỉ đổi được kết quả khớp/bỏ qua (số tiền, ngày, mã tham chiếu là dữ liệu gốc ngân hàng)
REVOKE INSERT, UPDATE ON bank_statement_lines FROM luuxa_app;
GRANT INSERT (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, balance_after_vnd, imported_by) ON bank_statement_lines TO luuxa_app;
GRANT UPDATE (match_status, matched_ledger_entry_id, ignore_reason) ON bank_statement_lines TO luuxa_app;

-- A3. Cột bí mật: không bao giờ SELECT/UPDATE cho luuxa_app
REVOKE ALL ON users FROM luuxa_app;
GRANT SELECT (id, email, phone_e164, password_changed_at, must_change_password, status, email_verified_at, phone_verified_at,
              last_login_at, locked_until, locale, time_zone, created_at, updated_at, version, deleted_at) ON users TO luuxa_app;
GRANT INSERT (email, phone_e164, status, must_change_password, locale, time_zone) ON users TO luuxa_app;
GRANT UPDATE (email, phone_e164, status, must_change_password, locked_until, locale, time_zone, deleted_at, updated_at, version) ON users TO luuxa_app;

REVOKE ALL ON qr_sessions FROM luuxa_app;
GRANT SELECT (id, event_id, rotation_seconds, opens_at, closes_at, geofence_lat, geofence_lng, geofence_radius_m, require_geofence,
              status, created_by, created_at, closed_at) ON qr_sessions TO luuxa_app;
GRANT INSERT (event_id, rotation_seconds, opens_at, closes_at, geofence_lat, geofence_lng, geofence_radius_m, require_geofence, created_by) ON qr_sessions TO luuxa_app;
GRANT UPDATE (status, closed_at, closes_at) ON qr_sessions TO luuxa_app;

REVOKE ALL ON user_mfa_factors FROM luuxa_app;
GRANT SELECT (id, user_id, factor_type, confirmed_at, last_used_at, created_at) ON user_mfa_factors TO luuxa_app;

-- A4. Bảng thuộc luồng xác thực/hàng đợi: luuxa_app không đụng tới (RLS cũng không có chính sách)
REVOKE ALL ON refresh_tokens, password_resets, mfa_recovery_codes, notification_outbox FROM luuxa_app;
REVOKE INSERT, UPDATE, DELETE ON login_attempts, user_identities FROM luuxa_app;

-- A5. Phân vùng audit_logs: không truy cập trực tiếp (chỉ qua bảng cha, tránh vòng RLS)
DO $$
DECLARE
  v_part text;
BEGIN
  FOR v_part IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relispartition AND c.relname LIKE 'audit_logs\_%' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM luuxa_app, luuxa_readonly', v_part);
  END LOOP;
END
$$;
GRANT SELECT ON audit_logs TO luuxa_app;

-- ---------------------------------------------------------------------
-- B. luuxa_worker — tiến trình nền (BYPASSRLS); vẫn bị chặn sửa/xóa bảng bất biến bởi quyền + trigger
-- ---------------------------------------------------------------------
DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO luuxa_worker;
  GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO luuxa_worker;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, expense_approvals, duty_reviews, merit_entries, audit_logs,
  expense_status_history, duty_status_history, duty_swap_status_history, issue_status_history FROM luuxa_worker;

-- ---------------------------------------------------------------------
-- C. luuxa_auth — luồng xác thực (BYPASSRLS nhưng CHỈ các bảng dưới đây)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON users, user_identities TO luuxa_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions, refresh_tokens, password_resets, user_mfa_factors, mfa_recovery_codes TO luuxa_auth;
GRANT SELECT, INSERT ON login_attempts TO luuxa_auth;
GRANT SELECT ON roles, permissions, role_permissions, user_roles, role_delegations, members, settings, consent_purposes, consents TO luuxa_auth;
GRANT SELECT, INSERT, UPDATE ON member_applications TO luuxa_auth;
GRANT INSERT ON user_roles TO luuxa_auth;

-- ---------------------------------------------------------------------
-- D. luuxa_definer — chủ sở hữu hàm SECURITY DEFINER (NOLOGIN)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO luuxa_definer;
  GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO luuxa_definer;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, expense_approvals, duty_reviews, merit_entries, audit_logs,
  expense_status_history, duty_status_history, duty_swap_status_history, issue_status_history FROM luuxa_definer;

-- ---------------------------------------------------------------------
-- E. luuxa_readonly — báo cáo: chỉ view vật chất tổng hợp không chứa dữ liệu cá nhân
-- ---------------------------------------------------------------------
-- Chủ sở hữu view vật chất phải là vai trò BYPASSRLS (luuxa_definer): REFRESH chạy truy vấn dưới quyền chủ sở hữu, mà sổ cái bật FORCE RLS
-- (chủ luuxa_owner không có chính sách ⇒ đọc 0 dòng ⇒ view rỗng). Làm mới qua app.fn_refresh_cashflow() (xem mục F).
ALTER MATERIALIZED VIEW mv_cashflow_monthly OWNER TO luuxa_definer;
GRANT SELECT ON mv_cashflow_monthly TO luuxa_readonly;

-- ---------------------------------------------------------------------
-- F. Quyền thực thi hàm
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;
REVOKE EXECUTE ON FUNCTION app.fn_qr_mac(uuid, bigint) FROM luuxa_app, luuxa_auth;
REVOKE EXECUTE ON FUNCTION app.fn_housekeeping(), app.fn_mark_missed_duties(), app.fn_expire_laundry_noshows(),
  app.fn_close_expired_polls(), app.fn_generate_recurring_events(uuid, integer), app.ensure_monthly_partitions(regclass, integer),
  app.fn_recompute_gpa(uuid) FROM luuxa_app, luuxa_auth;
REVOKE EXECUTE ON FUNCTION app.fn_refresh_cashflow() FROM luuxa_app, luuxa_auth;
REVOKE EXECUTE ON FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid),
  app.fn_notify_roles(text[], text, text, text, jsonb, text, uuid),
  app.fn_notify_all_active(text, text, text, jsonb, text, uuid) FROM luuxa_auth, luuxa_app;
-- Hàm NỘI BỘ (SECURITY DEFINER hoặc chỉ dành cho trigger/hàm khác): người dùng gọi trực tiếp sẽ vượt kiểm soát nghiệp vụ
REVOKE EXECUTE ON FUNCTION app.ensure_period(date), app.fn_award_duty_merit(uuid, text, text), app.fn_rollup_contribution(uuid),
  app.write_audit(text, text, text, text, jsonb, jsonb) FROM luuxa_app;
REVOKE EXECUTE ON FUNCTION app.fn_audit_event(text, text, text, text) FROM luuxa_auth, luuxa_worker;
DO $$ BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE luuxa_owner IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
