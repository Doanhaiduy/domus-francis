-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (9/9): HẠ TẦNG XUYÊN SUỐT — AUDIT, IDEMPOTENCY, THÔNG BÁO
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.3.90  audit_logs — nhật ký bất biến, phân vùng theo tháng
--   * Không có FK (bản ghi phải tồn tại cả khi user/thực thể bị xóa).
--   * Phân vùng RANGE theo occurred_at: xóa/lưu trữ cả tháng bằng DETACH/DROP PARTITION.
--   * Bất biến: trigger trg_audit_logs__immutable + REVOKE UPDATE, DELETE.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id              uuid        NOT NULL DEFAULT app.uuid_v7(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id   uuid,
  actor_member_id uuid,
  actor_roles     text[],
  action          text        NOT NULL,
  entity_table    text        NOT NULL,
  entity_id       text,
  old_data        jsonb,
  new_data        jsonb,
  changed_fields  text[],
  reason          text,
  request_id      uuid,
  ip              inet,
  user_agent      text,
  PRIMARY KEY (id, occurred_at),
  CONSTRAINT ck_audit_logs__action CHECK (action IN (
    'INSERT', 'UPDATE', 'DELETE', 'STATE_CHANGE',
    'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_CHANGE', 'MFA_CHANGE',
    'PERMISSION_CHANGE', 'READ_SENSITIVE', 'EXPORT', 'PRINT', 'DOWNLOAD_FILE', 'SHARE_LINK',
    'PERIOD_CLOSE', 'PERIOD_REOPEN', 'LEDGER_MANUAL_ENTRY', 'SETTING_CHANGE', 'OTHER'))
) PARTITION BY RANGE (occurred_at);
COMMENT ON TABLE audit_logs IS
  'Nhật ký kiểm toán bất biến (ai, làm gì, trên đối tượng nào, giá trị trước/sau, IP, thời điểm). Ghi bởi trigger app.tg_audit() trên bảng tài chính/phân quyền/phân phòng/điểm số và bởi API cho sự kiện nghiệp vụ (đăng nhập, xem dữ liệu nhạy cảm, xuất file). Phân vùng theo tháng.';

CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs FOR VALUES FROM ('2026-10-01 00:00:00+07') TO ('2026-11-01 00:00:00+07');
CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs FOR VALUES FROM ('2026-11-01 00:00:00+07') TO ('2026-12-01 00:00:00+07');
CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs FOR VALUES FROM ('2026-12-01 00:00:00+07') TO ('2027-01-01 00:00:00+07');
CREATE TABLE audit_logs_2027_01 PARTITION OF audit_logs FOR VALUES FROM ('2027-01-01 00:00:00+07') TO ('2027-02-01 00:00:00+07');
CREATE TABLE audit_logs_2027_02 PARTITION OF audit_logs FOR VALUES FROM ('2027-02-01 00:00:00+07') TO ('2027-03-01 00:00:00+07');
CREATE TABLE audit_logs_2027_03 PARTITION OF audit_logs FOR VALUES FROM ('2027-03-01 00:00:00+07') TO ('2027-04-01 00:00:00+07');
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;
COMMENT ON TABLE audit_logs_default IS 'Phân vùng mặc định — chỉ hứng bản ghi khi job app.ensure_monthly_partitions() chưa kịp tạo phân vùng tháng mới. Cảnh báo nếu có > 0 dòng.';

-- ---------------------------------------------------------------------
-- 4.3.91  idempotency_keys — chống xử lý trùng cho thao tác nhạy cảm (header Idempotency-Key)
-- ---------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idem_key         text        NOT NULL,
  http_method      text        NOT NULL,
  request_path     text        NOT NULL,
  request_hash     text        NOT NULL,
  state            text        NOT NULL DEFAULT 'in_progress',
  response_status  smallint,
  response_body    jsonb,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT ux_idempotency_keys__user_key UNIQUE (user_id, idem_key),
  CONSTRAINT ck_idempotency_keys__key_len CHECK (char_length(idem_key) BETWEEN 8 AND 128),
  CONSTRAINT ck_idempotency_keys__state CHECK (state IN ('in_progress', 'completed')),
  CONSTRAINT ck_idempotency_keys__method CHECK (http_method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
  CONSTRAINT ck_idempotency_keys__hash CHECK (app.is_hex(request_hash, 64)),
  CONSTRAINT ck_idempotency_keys__completed CHECK (state <> 'completed' OR response_status IS NOT NULL),
  CONSTRAINT ck_idempotency_keys__expiry CHECK (expires_at > created_at)
);
COMMENT ON TABLE idempotency_keys IS
  'Khóa idempotency cho API (tạo phiếu chi, check-in, đóng quỹ…). Cùng (user, key) + cùng request_hash => trả lại response đã lưu; khác hash => 422. Dọn các dòng hết hạn mỗi giờ. Song song với client_request_id ở các bảng nghiệp vụ (chống trùng ngay tại DB).';

-- ---------------------------------------------------------------------
-- 4.3.92  Thông báo: loại, hộp thư trong ứng dụng, hàng đợi gửi đa kênh, tùy chọn, push, liên kết kênh
-- ---------------------------------------------------------------------
CREATE TABLE notification_types (
  code             text                      PRIMARY KEY,
  category         text                      NOT NULL,
  name_vi          text                      NOT NULL,
  default_channels notification_channel_t[]  NOT NULL DEFAULT ARRAY['in_app']::notification_channel_t[],
  priority         priority_t                NOT NULL DEFAULT 'normal',
  requires_ack     boolean                   NOT NULL DEFAULT false,
  is_mandatory     boolean                   NOT NULL DEFAULT false,
  is_active        boolean                   NOT NULL DEFAULT true,
  CONSTRAINT ck_notification_types__code CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT ck_notification_types__category CHECK (category IN
    ('announcement', 'finance', 'duty', 'event', 'academic', 'facility', 'laundry', 'meal', 'social', 'security', 'system')),
  CONSTRAINT ck_notification_types__channels CHECK (cardinality(default_channels) >= 1)
);
COMMENT ON TABLE notification_types IS 'Danh mục loại thông báo (duty.assigned, finance.expense_pending, event.reminder…). is_mandatory=true: không cho tắt (bảo mật, quan trọng). requires_ack: cần xác nhận đã đọc.';

CREATE TABLE notifications (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id    uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type_code    text        NOT NULL REFERENCES notification_types(code) ON UPDATE CASCADE,
  title        text        NOT NULL,
  body         text,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  entity_table text,
  entity_id    uuid,
  priority     priority_t  NOT NULL DEFAULT 'normal',
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  acked_at     timestamptz,
  archived_at  timestamptz,
  expires_at   timestamptz,
  CONSTRAINT ck_notifications__title CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT ck_notifications__payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT ck_notifications__ack_after_read CHECK (acked_at IS NULL OR read_at IS NOT NULL)
);
COMMENT ON TABLE notifications IS
  'Hộp thư trong ứng dụng, MỖI NGƯỜI NHẬN MỘT DÒNG (khắc phục cờ isUnread dùng chung toàn cục ở FE). Không phân vùng: ~10^6 dòng/năm ở quy mô 500 thành viên; dọn bằng job (đã đọc > 90 ngày). ON DELETE CASCADE theo members.';

CREATE TABLE notification_outbox (
  id                  uuid                  PRIMARY KEY DEFAULT app.uuid_v7(),
  notification_id     uuid                  NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel             notification_channel_t NOT NULL,
  status              delivery_status_t     NOT NULL DEFAULT 'queued',
  attempts            smallint              NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz           NOT NULL DEFAULT now(),
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz           NOT NULL DEFAULT now(),
  CONSTRAINT ux_notification_outbox__notification_channel UNIQUE (notification_id, channel),
  CONSTRAINT ck_notification_outbox__attempts CHECK (attempts BETWEEN 0 AND 10),
  CONSTRAINT ck_notification_outbox__sent CHECK (status NOT IN ('sent', 'delivered') OR sent_at IS NOT NULL)
);
COMMENT ON TABLE notification_outbox IS 'Hàng đợi gửi theo kênh (transactional outbox): ghi cùng transaction nghiệp vụ, worker lấy bằng FOR UPDATE SKIP LOCKED, thử lại theo backoff đến 10 lần.';

CREATE TABLE notification_preferences (
  id                uuid                   PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id         uuid                   NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category          text                   NOT NULL,
  channel           notification_channel_t NOT NULL,
  enabled           boolean                NOT NULL DEFAULT true,
  digest_mode       text                   NOT NULL DEFAULT 'immediate',
  quiet_start       time,
  quiet_end         time,
  updated_at        timestamptz            NOT NULL DEFAULT now(),
  CONSTRAINT ux_notification_preferences__member_cat_channel UNIQUE (member_id, category, channel),
  CONSTRAINT ck_notification_preferences__category CHECK (category IN
    ('announcement', 'finance', 'duty', 'event', 'academic', 'facility', 'laundry', 'meal', 'social', 'security', 'system')),
  CONSTRAINT ck_notification_preferences__digest CHECK (digest_mode IN ('immediate', 'daily', 'weekly')),
  CONSTRAINT ck_notification_preferences__quiet CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
);
COMMENT ON TABLE notification_preferences IS 'Tùy chọn của từng thành viên: bật/tắt theo nhóm × kênh, tần suất tóm tắt, giờ yên tĩnh. Loại is_mandatory bỏ qua tùy chọn này.';

CREATE TABLE push_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    uuid        REFERENCES auth_sessions(id) ON DELETE SET NULL,
  endpoint      text        NOT NULL,
  p256dh        text        NOT NULL,
  auth_secret   text        NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  CONSTRAINT ux_push_subscriptions__endpoint UNIQUE (endpoint),
  CONSTRAINT ck_push_subscriptions__endpoint CHECK (endpoint LIKE 'https://%')
);
COMMENT ON TABLE push_subscriptions IS 'Đăng ký Web Push (VAPID) theo thiết bị. Endpoint hết hạn/410 Gone => revoked_at.';

CREATE TABLE member_channel_bindings (
  id            uuid                   PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id     uuid                   NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  channel       notification_channel_t NOT NULL,
  external_id   text                   NOT NULL,
  verified_at   timestamptz,
  created_at    timestamptz            NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT ck_member_channel_bindings__channel CHECK (channel IN ('zalo', 'telegram', 'sms')),
  CONSTRAINT ux_member_channel_bindings__member_channel UNIQUE (member_id, channel),
  CONSTRAINT ux_member_channel_bindings__external UNIQUE (channel, external_id)
);
COMMENT ON TABLE member_channel_bindings IS 'Liên kết tài khoản Zalo/Telegram/SMS của thành viên (tùy chọn, cần thành viên chủ động xác minh).';
