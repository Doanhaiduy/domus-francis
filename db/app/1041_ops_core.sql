-- =====================================================================
-- 1041 — NỀN GIÁM SÁT & VẬN HÀNH. Chạy SAU 1040. Idempotent.
--   • job_runs: mỗi lượt chạy tác vụ nền (cron sáng/tối, đo dung lượng, nhịp tim sao lưu từ repo sao lưu…) một dòng — giờ bắt đầu/kết thúc,
--     từng bước (tên, đạt/lỗi, thời gian, thông điệp lỗi). Admin (system.monitor) xem ở Cài đặt → Hệ thống; /api/health?deep=1 dùng để
--     phát hiện cron ngừng chạy. Không gắn audit (nhật ký hệ thống, ghi mỗi ngày — chỉ là nhiễu).
--   • error_events: lỗi máy chủ / lỗi giao diện / lỗi cron đã GỘP theo dấu vân tay (cùng nơi + cùng mã + cùng thông điệp ⇒ một dòng, đếm số lần).
--     Vercel Hobby chỉ giữ log ~1 giờ nên lỗi phải lưu lại trong CSDL. Không lưu nội dung request/cookie; thông điệp cắt 500 ký tự.
--   • rate_limit_hits + app.fn_rate_limit_hit(): giới hạn tần suất DÙNG CHUNG lưu trong CSDL (đúng cả khi chạy serverless nhiều instance) —
--     đăng ký tài khoản, báo lỗi giao diện, báo cáo CSP… Khóa do ứng dụng băm (không lưu IP thô).
--   • Loại thông báo: system.ops_alert (cron/sổ quỹ/sao lưu lỗi → Admin), system.error_digest (tóm tắt lỗi mới mỗi sáng → Admin),
--     security.account_locked (tài khoản quản lý bị khóa tạm do đăng nhập sai → Admin), member.application_new (có người tự đăng ký tài khoản
--     → Trưởng nhà/Admin).
--   • Cấu hình auth.registration_open: tắt = trang đăng nhập ẩn "Đăng ký tài khoản" và API từ chối đăng ký mới.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- job_runs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_runs (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  kind         text        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  ok           boolean,
  steps        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  summary      text,
  request_id   text,
  CONSTRAINT ck_job_runs__kind    CHECK (kind ~ '^[a-z][a-z0-9_:.-]{1,60}$'),
  CONSTRAINT ck_job_runs__steps   CHECK (jsonb_typeof(steps) = 'array'),
  CONSTRAINT ck_job_runs__summary CHECK (summary IS NULL OR char_length(summary) <= 2000),
  CONSTRAINT ck_job_runs__time    CHECK (finished_at IS NULL OR finished_at >= started_at)
);
COMMENT ON TABLE public.job_runs IS 'Nhật ký từng lượt chạy tác vụ nền (cron:morning, cron:evening, cron:storage, cron:manual, backup, backup:storage…): giờ chạy, kết quả từng bước. Admin (system.monitor) đọc; worker ghi. Giữ 180 ngày.';
CREATE INDEX IF NOT EXISTS ix_job_runs__kind_time ON public.job_runs (kind, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_job_runs__time ON public.job_runs (started_at DESC);

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_runs__system ON public.job_runs;
CREATE POLICY job_runs__system ON public.job_runs FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS job_runs__monitor_read ON public.job_runs;
CREATE POLICY job_runs__monitor_read ON public.job_runs FOR SELECT TO luuxa_app USING (app.has_permission('system.monitor'));

ALTER TABLE public.job_runs OWNER TO luuxa_owner;
REVOKE ALL ON public.job_runs FROM luuxa_app;
GRANT SELECT ON public.job_runs TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_runs TO luuxa_worker, luuxa_definer;

-- ---------------------------------------------------------------------
-- error_events
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.error_events (
  id                uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  fingerprint       text        NOT NULL,
  source            text        NOT NULL,
  route             text,
  code              text,
  message           text        NOT NULL,
  sample_request_id text,
  sample_user_id    uuid,
  count             integer     NOT NULL DEFAULT 1,
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  status            text        NOT NULL DEFAULT 'new',
  notified_at       timestamptz,
  resolved_at       timestamptz,
  resolved_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT ux_error_events__fingerprint UNIQUE (fingerprint),
  CONSTRAINT ck_error_events__source  CHECK (source IN ('server', 'client', 'cron', 'csp', 'auth')),
  CONSTRAINT ck_error_events__status  CHECK (status IN ('new', 'ack', 'resolved')),
  CONSTRAINT ck_error_events__message CHECK (char_length(message) BETWEEN 1 AND 500),
  CONSTRAINT ck_error_events__route   CHECK (route IS NULL OR char_length(route) <= 300),
  CONSTRAINT ck_error_events__code    CHECK (code IS NULL OR char_length(code) <= 60),
  CONSTRAINT ck_error_events__count   CHECK (count >= 1)
);
COMMENT ON TABLE public.error_events IS 'Lỗi đã gộp theo dấu vân tay (nơi xảy ra + mã + thông điệp): số lần, lần đầu/lần cuối, mã request mẫu. status new → ack (đã xem) → resolved (đã sửa; tái diễn ⇒ new lại). Admin (system.monitor) xem/đổi trạng thái. Giữ 90 ngày kể từ lần cuối.';
CREATE INDEX IF NOT EXISTS ix_error_events__last_seen ON public.error_events (last_seen DESC);
CREATE INDEX IF NOT EXISTS ix_error_events__status ON public.error_events (status, last_seen DESC);
CREATE INDEX IF NOT EXISTS ix_error_events__resolved_by ON public.error_events (resolved_by);

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS error_events__system ON public.error_events;
CREATE POLICY error_events__system ON public.error_events FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS error_events__monitor_read ON public.error_events;
CREATE POLICY error_events__monitor_read ON public.error_events FOR SELECT TO luuxa_app USING (app.has_permission('system.monitor'));
DROP POLICY IF EXISTS error_events__monitor_update ON public.error_events;
CREATE POLICY error_events__monitor_update ON public.error_events FOR UPDATE TO luuxa_app
  USING (app.has_permission('system.monitor')) WITH CHECK (app.has_permission('system.monitor'));

ALTER TABLE public.error_events OWNER TO luuxa_owner;
REVOKE ALL ON public.error_events FROM luuxa_app;
GRANT SELECT ON public.error_events TO luuxa_app;
GRANT UPDATE (status, resolved_at, resolved_by) ON public.error_events TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_events TO luuxa_worker, luuxa_definer;

-- Ghi/gộp một lỗi. Trả id (NULL nếu bị bỏ qua vì đang có quá nhiều lỗi MỚI trong 1 giờ — chống lấp bảng khi bị spam).
CREATE OR REPLACE FUNCTION app.fn_error_event_record(
  p_fingerprint text,
  p_source      text,
  p_route       text,
  p_code        text,
  p_message     text,
  p_request_id  text DEFAULT NULL,
  p_user_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_id  uuid;
  v_msg text := left(COALESCE(NULLIF(btrim(p_message), ''), '(không có thông điệp)'), 500);
BEGIN
  IF p_fingerprint IS NULL OR char_length(p_fingerprint) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'Dấu vân tay lỗi không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE public.error_events e
     SET count = e.count + 1,
         last_seen = now(),
         sample_request_id = COALESCE(left(p_request_id, 100), e.sample_request_id),
         sample_user_id = COALESCE(p_user_id, e.sample_user_id),
         -- lỗi đã đánh dấu "đã sửa" mà xảy ra lại ⇒ mở lại để Admin thấy (và được tóm tắt lại)
         status = CASE WHEN e.status = 'resolved' THEN 'new' ELSE e.status END,
         notified_at = CASE WHEN e.status = 'resolved' THEN NULL ELSE e.notified_at END,
         resolved_at = CASE WHEN e.status = 'resolved' THEN NULL ELSE e.resolved_at END,
         resolved_by = CASE WHEN e.status = 'resolved' THEN NULL ELSE e.resolved_by END
   WHERE e.fingerprint = p_fingerprint
   RETURNING e.id INTO v_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF (SELECT count(*) FROM public.error_events WHERE first_seen > now() - interval '1 hour') >= 200 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.error_events (fingerprint, source, route, code, message, sample_request_id, sample_user_id)
  VALUES (p_fingerprint,
          CASE WHEN p_source IN ('server', 'client', 'cron', 'csp', 'auth') THEN p_source ELSE 'server' END,
          left(p_route, 300), left(p_code, 60), v_msg, left(p_request_id, 100), p_user_id)
  ON CONFLICT (fingerprint) DO UPDATE SET count = public.error_events.count + 1, last_seen = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
ALTER FUNCTION app.fn_error_event_record(text, text, text, text, text, text, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_error_event_record(text, text, text, text, text, text, uuid) FROM PUBLIC, luuxa_app, luuxa_auth;
GRANT EXECUTE ON FUNCTION app.fn_error_event_record(text, text, text, text, text, text, uuid) TO luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_error_event_record(text, text, text, text, text, text, uuid) IS 'Ghi/gộp một lỗi vào error_events (đếm số lần, mở lại lỗi đã sửa nếu tái diễn). Tối đa 200 lỗi MỚI mỗi giờ. Chỉ worker gọi.';

-- ---------------------------------------------------------------------
-- rate_limit_hits + app.fn_rate_limit_hit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key  text        NOT NULL,
  at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rate_limit_hits__key CHECK (char_length(key) BETWEEN 3 AND 200)
);
COMMENT ON TABLE public.rate_limit_hits IS 'Mỗi lần dùng một thao tác có giới hạn tần suất (đăng ký, báo lỗi, báo cáo CSP…) một dòng; khóa đã băm (không lưu IP thô). Chỉ truy cập qua app.fn_rate_limit_hit; dọn sau 2 ngày.';
CREATE INDEX IF NOT EXISTS ix_rate_limit_hits__key_at ON public.rate_limit_hits (key, at DESC);
CREATE INDEX IF NOT EXISTS ix_rate_limit_hits__at ON public.rate_limit_hits (at);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_hits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_hits__system ON public.rate_limit_hits;
CREATE POLICY rate_limit_hits__system ON public.rate_limit_hits FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);
ALTER TABLE public.rate_limit_hits OWNER TO luuxa_owner;
REVOKE ALL ON public.rate_limit_hits FROM luuxa_app;
GRANT SELECT, INSERT, DELETE ON public.rate_limit_hits TO luuxa_worker, luuxa_definer;

-- true = được phép (đã ghi một lần dùng); false = đã chạm giới hạn p_max lần trong p_window_seconds giây (không ghi thêm).
CREATE OR REPLACE FUNCTION app.fn_rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_key IS NULL OR char_length(p_key) NOT BETWEEN 3 AND 200 OR p_window_seconds NOT BETWEEN 1 AND 172800 OR p_max NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Tham số giới hạn tần suất không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- khóa tư vấn theo khóa giới hạn: hai request đồng thời không cùng lọt qua
  PERFORM pg_advisory_xact_lock(hashtextextended('rl:' || p_key, 0));
  SELECT count(*) INTO v_n FROM public.rate_limit_hits WHERE key = p_key AND at > now() - make_interval(secs => p_window_seconds);
  IF v_n >= p_max THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limit_hits (key) VALUES (p_key);
  RETURN true;
END
$$;
ALTER FUNCTION app.fn_rate_limit_hit(text, integer, integer) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_rate_limit_hit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_rate_limit_hit(text, integer, integer) TO luuxa_app, luuxa_auth, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_rate_limit_hit(text, integer, integer) IS 'Giới hạn tần suất lưu trong CSDL: true = được phép (đã ghi một lần dùng), false = vượt p_max lần trong p_window_seconds giây. Khóa do ứng dụng băm.';

-- ---------------------------------------------------------------------
-- Loại thông báo mới
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.ops_alert',        'system',   'Cảnh báo vận hành hệ thống (tác vụ nền, sổ quỹ, sao lưu)', ARRAY['in_app', 'web_push']::notification_channel_t[], 'high',   false, false),
  ('system.error_digest',     'system',   'Tóm tắt lỗi hệ thống mới',                                 ARRAY['in_app']::notification_channel_t[],             'normal', false, false),
  ('security.account_locked', 'security', 'Tài khoản bị khóa tạm do đăng nhập sai nhiều lần',         ARRAY['in_app', 'web_push']::notification_channel_t[], 'high',   false, false),
  ('member.application_new',  'system',   'Có đơn đăng ký tài khoản mới chờ duyệt',                   ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Cấu hình: mở/đóng tự đăng ký tài khoản
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('auth.registration_open', 'true'::jsonb, 'boolean',
   'Cho phép người ngoài TỰ ĐĂNG KÝ tài khoản (đơn chờ duyệt) ở trang đăng nhập. Tắt khi đã đủ người / ngoài mùa tuyển — người quản lý vẫn tạo tài khoản được ở trang Thành viên.',
   NULL, NULL, false, 'auth.user.manage', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
