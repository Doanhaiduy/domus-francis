-- =====================================================================
-- 1039 — THEO DÕI DUNG LƯỢNG & LƯU TRỮ (chỉ Admin). Chạy SAU 1038. Idempotent.
--   • Quyền mới system.monitor (nhạy cảm; chỉ Admin).
--   • Cấu hình hạn mức gói miễn phí (sửa được ở Cài đặt → Dung lượng): monitor.supabase.db_limit_mb (500), monitor.supabase.storage_limit_mb (1024),
--     ngưỡng cảnh báo monitor.warn_percent (70) / monitor.critical_percent (90). Hạn mức Cloudinary lấy thẳng từ API của Cloudinary.
--   • app.fn_storage_items(): hợp nhất MỌI tệp còn sống (ảnh/PDF trong storage_files + video ở album_videos) — nội bộ, KHÔNG cấp cho luuxa_app.
--   • app.fn_storage_overview(p_days): số liệu tổng hợp cho trang theo dõi — kích thước CSDL, số tệp/dung lượng theo loại (ảnh / video / PDF),
--     theo bucket, theo nơi lưu, theo ngày + theo tháng, người tải lên nhiều nhất, tệp lớn nhất, tệp kẹt (chưa xử lý xong), lịch sử ảnh chụp hằng ngày.
--     Kiểm quyền system.monitor trong hàm. Chỉ ĐỌC.
--   • usage_snapshots: mỗi ngày một dòng (cron hằng ngày ghi bằng app.fn_usage_snapshot_save) để vẽ xu hướng + dự báo khi đầy; chỉ đọc qua
--     fn_storage_overview. Bảng số liệu hệ thống, không phải dữ liệu nghiệp vụ ⇒ KHÔNG gắn trigger audit (mỗi ngày một lần ghi sẽ chỉ là nhiễu).
--   • Loại thông báo system.storage_alert (cron gửi cho Admin khi một chỉ số chạm ngưỡng cảnh báo).
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('system.monitor', 'system', 'Theo dõi dung lượng lưu trữ (CSDL, Supabase Storage, Cloudinary), số tệp tải lên theo loại/ngày và chỉnh hạn mức gói — chỉ Admin', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'system.monitor' FROM public.roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('monitor.supabase.db_limit_mb', '500'::jsonb, 'integer',
   'Hạn mức dung lượng CSDL (MB) của gói Supabase đang dùng — gói miễn phí là 500 MB. Dùng để tính % đã dùng ở trang theo dõi dung lượng.',
   5, 100000000, false, 'system.monitor', '500'::jsonb),
  ('monitor.supabase.storage_limit_mb', '1024'::jsonb, 'integer',
   'Hạn mức dung lượng Supabase Storage (MB) của gói đang dùng — gói miễn phí là 1 GB (1024 MB).',
   5, 100000000, false, 'system.monitor', '1024'::jsonb),
  ('monitor.warn_percent', '70'::jsonb, 'integer',
   'Ngưỡng CẢNH BÁO (% dung lượng đã dùng): chạm mức này thì trang theo dõi chuyển vàng và Admin nhận thông báo.',
   50, 95, false, 'system.monitor', '70'::jsonb),
  ('monitor.critical_percent', '90'::jsonb, 'integer',
   'Ngưỡng NGUY HIỂM (% dung lượng đã dùng): chạm mức này thì chuyển đỏ và Admin nhận thông báo khẩn.',
   60, 99, false, 'system.monitor', '90'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.storage_alert', 'system', 'Cảnh báo dung lượng lưu trữ sắp đầy', ARRAY['in_app', 'web_push']::notification_channel_t[], 'high', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- usage_snapshots: ảnh chụp số liệu dung lượng mỗi ngày (ngày theo giờ Việt Nam)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  day                        date          PRIMARY KEY,
  db_bytes                   bigint        NOT NULL,
  storage_bytes              bigint,
  storage_source             text,
  files_count                integer       NOT NULL DEFAULT 0,
  files_bytes                bigint        NOT NULL DEFAULT 0,
  videos_count               integer       NOT NULL DEFAULT 0,
  videos_bytes               bigint        NOT NULL DEFAULT 0,
  cloudinary_credits_used    numeric(12,2),
  cloudinary_credits_limit   numeric(12,2),
  cloudinary_storage_bytes   bigint,
  cloudinary_bandwidth_bytes bigint,
  captured_at                timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_usage_snapshots__source CHECK (storage_source IS NULL OR storage_source IN ('supabase', 'local', 'estimate')),
  CONSTRAINT ck_usage_snapshots__nonneg CHECK (db_bytes >= 0 AND files_count >= 0 AND files_bytes >= 0 AND videos_count >= 0 AND videos_bytes >= 0)
);
COMMENT ON TABLE public.usage_snapshots IS 'Ảnh chụp dung lượng mỗi ngày (CSDL, Supabase Storage, Cloudinary, số tệp) do cron hằng ngày ghi — dùng vẽ xu hướng và dự báo ngày đầy. Chỉ Admin (system.monitor) xem được, qua app.fn_storage_overview.';

ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_snapshots FORCE ROW LEVEL SECURITY;
-- Nơi vai trò nền không có BYPASSRLS (Supabase) vẫn ghi/đọc được; luuxa_app KHÔNG có chính sách nào ⇒ không đọc trực tiếp được
DROP POLICY IF EXISTS usage_snapshots__system ON public.usage_snapshots;
CREATE POLICY usage_snapshots__system ON public.usage_snapshots FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);

ALTER TABLE public.usage_snapshots OWNER TO luuxa_owner;
REVOKE ALL ON public.usage_snapshots FROM luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_snapshots TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- app.fn_storage_items(): mọi tệp còn sống, một dòng một tệp (nội bộ)
--   store: 'primary' = kho tệp chính (Supabase Storage; ổ đĩa local khi chạy thử) | 'cloudinary' | 'supabase' | 'local' (nơi lưu video)
--   kind : image | pdf | video
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_storage_items()
RETURNS TABLE (store text, bucket text, kind text, bytes bigint, created_at timestamptz, id uuid, name text, member_id uuid, member_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT 'primary'::text, sf.bucket::text,
         CASE WHEN sf.detected_mime = 'application/pdf' THEN 'pdf' ELSE 'image' END,
         sf.size_bytes, sf.created_at, sf.id, sf.original_name, m.id, m.display_name
    FROM public.storage_files sf
    LEFT JOIN public.members m ON m.user_id = sf.uploaded_by AND m.deleted_at IS NULL
   WHERE sf.deleted_at IS NULL AND sf.status = 'ready'
  UNION ALL
  SELECT av.provider, 'videos'::text, 'video'::text, av.size_bytes, av.created_at, av.id, av.caption, av.uploaded_by_member_id, m.display_name
    FROM public.album_videos av
    LEFT JOIN public.members m ON m.id = av.uploaded_by_member_id
   WHERE av.deleted_at IS NULL
$$;
ALTER FUNCTION app.fn_storage_items() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_storage_items() FROM PUBLIC, luuxa_app, luuxa_auth;
GRANT EXECUTE ON FUNCTION app.fn_storage_items() TO luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- app.fn_storage_overview(p_days): số liệu cho trang theo dõi (chỉ Admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_storage_overview(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_days   integer := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
  v_today  date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_totals jsonb;
  v_kind   jsonb;
  v_bucket jsonb;
  v_store  jsonb;
  v_daily  jsonb;
  v_month  jsonb;
  v_period jsonb;
  v_upl    jsonb;
  v_big    jsonb;
  v_stale  jsonb;
  v_tables jsonb;
  v_hist   jsonb;
  v_db     bigint := pg_database_size(current_database());
BEGIN
  IF NOT app.has_permission('system.monitor') THEN
    RAISE EXCEPTION 'Chỉ Admin được xem theo dõi dung lượng (quyền system.monitor).' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object('count', count(*), 'bytes', COALESCE(sum(bytes), 0)) INTO v_totals FROM app.fn_storage_items();

  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'count', n, 'bytes', b) ORDER BY b DESC), '[]'::jsonb) INTO v_kind
    FROM (SELECT kind, count(*) AS n, sum(bytes) AS b FROM app.fn_storage_items() GROUP BY kind) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'count', n, 'bytes', b) ORDER BY b DESC), '[]'::jsonb) INTO v_bucket
    FROM (SELECT bucket, count(*) AS n, sum(bytes) AS b FROM app.fn_storage_items() GROUP BY bucket) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('store', store, 'count', n, 'bytes', b) ORDER BY b DESC), '[]'::jsonb) INTO v_store
    FROM (SELECT store, count(*) AS n, sum(bytes) AS b FROM app.fn_storage_items() GROUP BY store) t;

  -- Theo ngày (giờ VN), đủ mọi ngày kể cả ngày không có tệp nào
  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'images', images, 'videos', videos, 'pdfs', pdfs, 'bytes', bytes) ORDER BY day), '[]'::jsonb) INTO v_daily
    FROM (
      SELECT d.day AS day,
             count(i.id) FILTER (WHERE i.kind = 'image') AS images,
             count(i.id) FILTER (WHERE i.kind = 'video') AS videos,
             count(i.id) FILTER (WHERE i.kind = 'pdf')   AS pdfs,
             COALESCE(sum(i.bytes), 0) AS bytes
        FROM (SELECT (v_today - g)::date AS day FROM generate_series(0, v_days - 1) AS g) AS d
        LEFT JOIN app.fn_storage_items() i ON (i.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day
       GROUP BY d.day
    ) t;

  -- Theo tháng: 12 tháng gần nhất
  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'images', images, 'videos', videos, 'pdfs', pdfs, 'bytes', bytes) ORDER BY month), '[]'::jsonb) INTO v_month
    FROM (
      SELECT m.month AS month,
             count(i.id) FILTER (WHERE i.kind = 'image') AS images,
             count(i.id) FILTER (WHERE i.kind = 'video') AS videos,
             count(i.id) FILTER (WHERE i.kind = 'pdf')   AS pdfs,
             COALESCE(sum(i.bytes), 0) AS bytes
        FROM (SELECT date_trunc('month', v_today::timestamp) - (g * interval '1 month') AS month FROM generate_series(0, 11) AS g) AS m
        LEFT JOIN app.fn_storage_items() i ON date_trunc('month', (i.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) = m.month
       GROUP BY m.month
    ) t;

  -- Hôm nay / 7 ngày / 30 ngày / 90 ngày
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', k, 'images', images, 'videos', videos, 'pdfs', pdfs, 'bytes', bytes, 'storageBytes', storage_bytes) ORDER BY ord), '[]'::jsonb) INTO v_period
    FROM (
      SELECT p.k, p.ord,
             count(i.id) FILTER (WHERE i.kind = 'image') AS images,
             count(i.id) FILTER (WHERE i.kind = 'video') AS videos,
             count(i.id) FILTER (WHERE i.kind = 'pdf')   AS pdfs,
             COALESCE(sum(i.bytes), 0) AS bytes,
             COALESCE(sum(i.bytes) FILTER (WHERE i.store <> 'cloudinary'), 0) AS storage_bytes
        FROM (VALUES ('today', 1, 1), ('d7', 2, 7), ('d30', 3, 30), ('d90', 4, 90)) AS p(k, ord, span)
        LEFT JOIN app.fn_storage_items() i ON (i.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > v_today - p.span
       GROUP BY p.k, p.ord
    ) t;

  -- Ai tải lên nhiều nhất trong 30 ngày
  SELECT COALESCE(jsonb_agg(jsonb_build_object('memberId', member_id, 'name', COALESCE(member_name, 'Không rõ'), 'count', n, 'bytes', b) ORDER BY b DESC), '[]'::jsonb) INTO v_upl
    FROM (
      SELECT member_id, member_name, count(*) AS n, sum(bytes) AS b
        FROM app.fn_storage_items()
       WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > v_today - 30
       GROUP BY member_id, member_name
       ORDER BY sum(bytes) DESC
       LIMIT 5
    ) t;

  -- Tệp lớn nhất
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'bucket', bucket, 'kind', kind, 'store', store, 'bytes', bytes, 'createdAt', created_at, 'uploader', member_name) ORDER BY bytes DESC), '[]'::jsonb) INTO v_big
    FROM (SELECT * FROM app.fn_storage_items() ORDER BY bytes DESC LIMIT 5) t;

  -- Tệp kẹt: chưa xử lý xong / bị từ chối / cách ly, quá 1 ngày — ứng viên để dọn
  SELECT jsonb_build_object('count', count(*), 'bytes', COALESCE(sum(size_bytes), 0)) INTO v_stale
    FROM public.storage_files
   WHERE deleted_at IS NULL AND status <> 'ready' AND created_at < now() - interval '1 day';

  -- 10 bảng lớn nhất trong schema public
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', relname, 'bytes', total, 'rows', est) ORDER BY total DESC), '[]'::jsonb) INTO v_tables
    FROM (
      SELECT c.relname::text AS relname, pg_total_relation_size(c.oid) AS total, GREATEST(c.reltuples, 0)::bigint AS est
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY pg_total_relation_size(c.oid) DESC
       LIMIT 10
    ) t;

  -- Lịch sử ảnh chụp hằng ngày (tối đa 180 ngày gần nhất)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', day, 'dbBytes', db_bytes, 'storageBytes', storage_bytes, 'storageSource', storage_source,
           'filesBytes', files_bytes, 'videosBytes', videos_bytes,
           'cloudinaryCreditsUsed', cloudinary_credits_used, 'cloudinaryCreditsLimit', cloudinary_credits_limit) ORDER BY day), '[]'::jsonb) INTO v_hist
    FROM (SELECT * FROM public.usage_snapshots ORDER BY day DESC LIMIT 180) t;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'database', jsonb_build_object('sizeBytes', v_db, 'tables', v_tables),
    'files', jsonb_build_object(
      'totals', v_totals, 'byKind', v_kind, 'byBucket', v_bucket, 'byStore', v_store, 'stale', v_stale,
      'variantCount', (SELECT COALESCE(sum((SELECT count(*) FROM jsonb_object_keys(sf.variants))), 0)::bigint FROM public.storage_files sf WHERE sf.deleted_at IS NULL AND sf.status = 'ready')
    ),
    'periods', v_period,
    'daily', v_daily,
    'monthly', v_month,
    'topUploaders', v_upl,
    'largest', v_big,
    'history', v_hist
  );
END
$$;
ALTER FUNCTION app.fn_storage_overview(integer) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_storage_overview(integer) FROM PUBLIC, luuxa_auth;
GRANT EXECUTE ON FUNCTION app.fn_storage_overview(integer) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_storage_overview(integer) IS 'Theo dõi dung lượng (chỉ Admin — system.monitor): kích thước CSDL, số tệp/dung lượng theo loại, bucket, nơi lưu, ngày, tháng, người tải lên nhiều nhất, tệp lớn nhất, tệp kẹt, lịch sử ảnh chụp hằng ngày. Chỉ đọc.';

-- ---------------------------------------------------------------------
-- app.fn_usage_snapshot_save(...): cron hằng ngày (luuxa_worker) ghi/cập nhật ảnh chụp của ngày hôm nay; giữ 800 ngày
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_usage_snapshot_save(
  p_storage_bytes             bigint,
  p_storage_source            text,
  p_cloudinary_credits_used   numeric,
  p_cloudinary_credits_limit  numeric,
  p_cloudinary_storage_bytes  bigint,
  p_cloudinary_bandwidth_bytes bigint
)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_files_n integer; v_files_b bigint; v_vid_n integer; v_vid_b bigint;
BEGIN
  SELECT count(*) FILTER (WHERE kind <> 'video'), COALESCE(sum(bytes) FILTER (WHERE kind <> 'video'), 0),
         count(*) FILTER (WHERE kind = 'video'),  COALESCE(sum(bytes) FILTER (WHERE kind = 'video'), 0)
    INTO v_files_n, v_files_b, v_vid_n, v_vid_b
    FROM app.fn_storage_items();

  INSERT INTO public.usage_snapshots AS u (day, db_bytes, storage_bytes, storage_source, files_count, files_bytes, videos_count, videos_bytes,
                                           cloudinary_credits_used, cloudinary_credits_limit, cloudinary_storage_bytes, cloudinary_bandwidth_bytes, captured_at)
  VALUES (v_day, pg_database_size(current_database()), p_storage_bytes, p_storage_source, v_files_n, v_files_b, v_vid_n, v_vid_b,
          p_cloudinary_credits_used, p_cloudinary_credits_limit, p_cloudinary_storage_bytes, p_cloudinary_bandwidth_bytes, now())
  ON CONFLICT (day) DO UPDATE SET
    db_bytes = EXCLUDED.db_bytes,
    -- đo lại không được ra kết quả thì giữ số đo tốt gần nhất của ngày
    storage_bytes = COALESCE(EXCLUDED.storage_bytes, u.storage_bytes),
    storage_source = CASE WHEN EXCLUDED.storage_bytes IS NULL THEN u.storage_source ELSE EXCLUDED.storage_source END,
    files_count = EXCLUDED.files_count, files_bytes = EXCLUDED.files_bytes,
    videos_count = EXCLUDED.videos_count, videos_bytes = EXCLUDED.videos_bytes,
    cloudinary_credits_used = COALESCE(EXCLUDED.cloudinary_credits_used, u.cloudinary_credits_used),
    cloudinary_credits_limit = COALESCE(EXCLUDED.cloudinary_credits_limit, u.cloudinary_credits_limit),
    cloudinary_storage_bytes = COALESCE(EXCLUDED.cloudinary_storage_bytes, u.cloudinary_storage_bytes),
    cloudinary_bandwidth_bytes = COALESCE(EXCLUDED.cloudinary_bandwidth_bytes, u.cloudinary_bandwidth_bytes),
    captured_at = now();

  DELETE FROM public.usage_snapshots WHERE day < v_day - 800;
  RETURN v_day;
END
$$;
ALTER FUNCTION app.fn_usage_snapshot_save(bigint, text, numeric, numeric, bigint, bigint) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_usage_snapshot_save(bigint, text, numeric, numeric, bigint, bigint) FROM PUBLIC, luuxa_app, luuxa_auth;
GRANT EXECUTE ON FUNCTION app.fn_usage_snapshot_save(bigint, text, numeric, numeric, bigint, bigint) TO luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_usage_snapshot_save(bigint, text, numeric, numeric, bigint, bigint) IS 'Cron hằng ngày ghi ảnh chụp dung lượng của hôm nay (CSDL + số tệp tự tính; số đo Supabase Storage / Cloudinary do ứng dụng truyền vào, NULL = không đo được ⇒ giữ số cũ của ngày).';

COMMIT;
