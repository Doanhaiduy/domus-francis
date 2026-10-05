-- =====================================================================
-- DỌN SCHEMA CŨ (bản UI-only: supabase/schema.sql + seed.sql) TRƯỚC KHI CHẠY SCHEMA MỚI
--
--   !!! XÓA VĨNH VIỄN dữ liệu của 13 bảng cũ trong schema public. Sao lưu trước nếu cần giữ. !!!
--
-- Chỉ xóa đúng những gì schema.sql cũ tạo ra:
--   bảng : rooms, profiles, transactions, contributions, cleaning_duties, duty_members, events, event_attendances,
--          announcements, announcement_reads, maintenance_issues, forum_threads, forum_replies
--   hàm  : update_updated_at, handle_new_user, get_my_role, is_manager, is_finance_manager, prevent_profile_role_self_change
--   trigger on_auth_user_created trên auth.users (do handle_new_user gắn vào)
-- KHÔNG đụng tới: auth.users (tài khoản đăng nhập Supabase), Storage, extension pgcrypto, các bảng/hàm khác của bạn.
--
-- Chạy trong SQL Editor của Supabase hoặc: psql "<URL>" -v ON_ERROR_STOP=1 -f 00_drop_legacy_schema.sql
-- Sau đó chạy gói schema mới: node scripts/db/bundle.mjs (xem README, mục Supabase).
-- Script chạy lại nhiều lần được (idempotent) và tự dừng nếu phát hiện đã có schema MỚI (tránh xóa nhầm).
-- =====================================================================

BEGIN;

DO $$
BEGIN
  -- Dấu hiệu schema mới: schema "app" hoặc bảng public.members/users của thiết kế 141 bảng.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
     OR to_regclass('public.members') IS NOT NULL
     OR to_regclass('public.ledger_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'Phát hiện schema MỚI (app / members / ledger_entries) — dừng, không xóa gì. Script này chỉ dành cho DB còn schema cũ.';
  END IF;
END $$;

-- 1. Trigger gắn trên auth.users (nếu không có quyền, bỏ qua cảnh báo và tiếp tục)
DO $$
BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
EXCEPTION
  WHEN undefined_table OR invalid_schema_name THEN NULL;   -- DB không có schema auth (không phải Supabase)
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Không đủ quyền gỡ trigger on_auth_user_created trên auth.users — hãy gỡ thủ công.';
END $$;

-- 2. Bảng (CASCADE kéo theo chính sách RLS, trigger, chỉ mục, khóa ngoại giữa các bảng cũ)
DROP TABLE IF EXISTS
  public.forum_replies,
  public.forum_threads,
  public.announcement_reads,
  public.announcements,
  public.maintenance_issues,
  public.event_attendances,
  public.events,
  public.duty_members,
  public.cleaning_duties,
  public.contributions,
  public.transactions,
  public.profiles,
  public.rooms
CASCADE;

-- 3. Hàm hỗ trợ của schema cũ
DROP FUNCTION IF EXISTS public.handle_new_user()                     CASCADE;
DROP FUNCTION IF EXISTS public.prevent_profile_role_self_change()    CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at()                   CASCADE;
DROP FUNCTION IF EXISTS public.get_my_role()                         CASCADE;
DROP FUNCTION IF EXISTS public.is_finance_manager()                  CASCADE;
DROP FUNCTION IF EXISTS public.is_manager()                          CASCADE;

-- (Tùy chọn, mặc định KHÔNG chạy) Xóa luôn các tài khoản mẫu đã tạo trong Authentication → Users:
--   DELETE FROM auth.users WHERE email IN ('<liệt kê email mẫu>');

COMMIT;

-- Kiểm tra: không còn bảng cũ nào
SELECT count(*) AS bang_cu_con_lai
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('rooms','profiles','transactions','contributions','cleaning_duties','duty_members','events',
                      'event_attendances','announcements','announcement_reads','maintenance_issues','forum_threads','forum_replies');
