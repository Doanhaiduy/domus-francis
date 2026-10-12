-- =====================================================================
-- 1042 — ĐÓNG CỬA "DATA API" (PostgREST) CỦA SUPABASE. Chạy SAU 1041. Idempotent. Trên PostgreSQL local (không có vai trò anon/authenticated)
-- khối DO bên dưới không làm gì ngoài bật RLS cho các phân vùng nhật ký kiểm toán.
--
-- Lý do: ứng dụng KHÔNG dùng supabase-js / PostgREST (mọi truy vấn đi qua máy chủ Next.js với vai trò luuxa_api → SET LOCAL ROLE luuxa_app).
-- Nhưng Supabase mặc định cấp quyền trên mọi bảng/view/hàm trong schema public cho anon + authenticated (ALTER DEFAULT PRIVILEGES của
-- postgres). Bảng thường đã có RLS nên không lộ dòng nào, còn:
--   • các phân vùng audit_logs_YYYY_MM / audit_logs_default KHÔNG bật RLS (RLS của bảng cha chỉ áp khi truy vấn qua bảng cha),
--   • materialized view mv_cashflow_monthly không có RLS,
-- ⇒ ai có "anon key" của dự án gọi thẳng REST /rest/v1/audit_logs_2026_10 là đọc được dữ liệu cũ/mới của mọi thay đổi.
-- Việc làm: thu hồi MỌI quyền của anon/authenticated trên schema public (bảng, view, sequence, hàm), bỏ quyền mặc định cho đối tượng tạo sau,
-- và bật RLS (không chính sách nào cho anon/authenticated) ở các phân vùng audit. Nên TẮT luôn Data API trong Supabase Dashboard
-- (Project Settings → Data API) — việc đó phải làm tay trên Supabase (xem VIEC_CHUA_LAM.md ở gốc repo).
-- =====================================================================
BEGIN;

DO $$
DECLARE
  r text;
  part regclass;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- Đối tượng do vai trò hiện tại (chủ DB chạy migration) tạo sau này cũng không tự cấp cho anon/authenticated nữa
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
      -- Schema app (hàm nghiệp vụ SECURITY DEFINER): không cho anon/authenticated dùng
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app') THEN
        EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', r);
        EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
      END IF;
      -- Materialized view: không có RLS ⇒ thu hồi tường minh (phòng phiên bản PostgreSQL không tính MV vào ALL TABLES)
      IF to_regclass('public.mv_cashflow_monthly') IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON public.mv_cashflow_monthly FROM %I', r);
      END IF;
    END IF;
  END LOOP;

  -- Bật RLS (không FORCE: chủ bảng vẫn bảo trì được) cho mọi phân vùng hiện có của audit_logs.
  -- Truy vấn qua bảng cha audit_logs vẫn dùng chính sách của bảng cha như cũ; truy cập THẲNG phân vùng (không qua cha) bị từ chối mọi dòng.
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    FOR part IN SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'public.audit_logs'::regclass LOOP
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', part);
    END LOOP;
  END IF;
END
$$;

COMMIT;
