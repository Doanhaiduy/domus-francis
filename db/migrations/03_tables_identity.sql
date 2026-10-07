-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (1/9): DANH TÍNH, XÁC THỰC, PHÂN QUYỀN, CẤU HÌNH, LƯU TRỮ TỆP
-- Quy ước chung cho toàn bộ khối 4.3:
--   * PK   : id uuid DEFAULT app.uuid_v7()
--   * Thời gian: TIMESTAMPTZ; ngày: DATE; tiền: BIGINT đơn vị VND (cột *_vnd)
--   * created_at/updated_at (trigger app.tg_touch*), version (khóa lạc quan), deleted_at (xóa mềm)
--   * FK inline REFERENCES => tên mặc định <bảng>_<cột>_fkey; ON DELETE chọn có chủ đích, ghi trong COMMENT ON TABLE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.3.1  users — danh tính đăng nhập
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                    uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  email                 citext,
  phone_e164            text,
  password_hash         text,
  password_changed_at   timestamptz,
  must_change_password  boolean       NOT NULL DEFAULT false,
  status                user_status_t NOT NULL DEFAULT 'invited',
  email_verified_at     timestamptz,
  phone_verified_at     timestamptz,
  last_login_at         timestamptz,
  locked_until          timestamptz,
  locale                text          NOT NULL DEFAULT 'vi-VN',
  time_zone             text          NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  version               integer       NOT NULL DEFAULT 1,
  deleted_at            timestamptz,
  CONSTRAINT ck_users__identifier       CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
  CONSTRAINT ck_users__phone_format     CHECK (app.is_e164(phone_e164)),
  CONSTRAINT ck_users__email_format     CHECK (email IS NULL OR email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT ck_users__password_argon2  CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
  -- Tài khoản đang hoạt động phải đăng nhập được: có mật khẩu, hoặc (tài khoản chỉ dùng Google) có email đã xác minh qua nhà cung cấp danh tính
  CONSTRAINT ck_users__active_has_pw    CHECK (status <> 'active' OR password_hash IS NOT NULL OR email_verified_at IS NOT NULL),
  CONSTRAINT ck_users__locale_len       CHECK (char_length(locale) BETWEEN 2 AND 10)
);
COMMENT ON TABLE users IS
  'Danh tính đăng nhập (Email/SĐT + mật khẩu Argon2id). Một user có thể chưa gắn thành viên (tài khoản kỹ thuật). Xóa mềm; không bao giờ xóa cứng vì audit_logs tham chiếu. Mật khẩu KHÔNG bao giờ ghi vào audit_logs. Cột password_hash/password_changed_at chỉ vai trò luuxa_auth đọc/ghi (luuxa_app không có quyền SELECT password_hash — xem khối 4.6.4).';
COMMENT ON COLUMN users.password_hash IS 'Chuỗi PHC của Argon2id (ví dụ $argon2id$v=19$m=19456,t=2,p=1$…). NULL khi tài khoản mới mời chưa đặt mật khẩu.';
COMMENT ON COLUMN users.locked_until IS 'Khóa tạm do đăng nhập sai nhiều lần; ứng dụng so sánh với now().';

-- ---------------------------------------------------------------------
-- 4.3.2  Phiên đăng nhập & refresh token (xoay vòng + phát hiện dùng lại)
-- ---------------------------------------------------------------------
CREATE TABLE auth_sessions (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label   text,
  user_agent     text,
  ip             inet,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoked_reason text,
  CONSTRAINT ck_auth_sessions__lifetime CHECK (expires_at > created_at),
  CONSTRAINT ck_auth_sessions__reason   CHECK (revoked_reason IS NULL OR revoked_reason IN
    ('logout', 'refresh_reuse_detected', 'password_changed', 'admin_revoked', 'expired', 'user_disabled', 'device_removed')),
  CONSTRAINT ck_auth_sessions__revoked_pair CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
COMMENT ON TABLE auth_sessions IS
  'Một phiên = một "họ" (family) refresh token trên một thiết bị. Phát hiện dùng lại token cũ => thu hồi cả phiên. ON DELETE CASCADE theo users (xóa user dọn sạch phiên).';

CREATE TABLE refresh_tokens (
  id                 uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  session_id         uuid        NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash         text        NOT NULL,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  rotated_at         timestamptz,
  replaced_by_id     uuid        REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  reuse_detected_at  timestamptz,
  CONSTRAINT ux_refresh_tokens__token_hash UNIQUE (token_hash),
  CONSTRAINT ck_refresh_tokens__hash_sha256 CHECK (app.is_hex(token_hash, 64)),
  CONSTRAINT ck_refresh_tokens__lifetime    CHECK (expires_at > issued_at)
);
COMMENT ON TABLE refresh_tokens IS
  'Refresh token (chỉ lưu SHA-256 của token, không lưu token gốc). Đổi token: đặt rotated_at + replaced_by_id. Nếu một token đã rotated_at bị xuất trình lại => reuse_detected_at và thu hồi auth_sessions tương ứng.';

CREATE TABLE password_resets (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text        NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  requested_ip  inet,
  user_agent    text,
  CONSTRAINT ux_password_resets__token_hash UNIQUE (token_hash),
  CONSTRAINT ck_password_resets__hash   CHECK (app.is_hex(token_hash, 64)),
  CONSTRAINT ck_password_resets__expiry CHECK (expires_at > requested_at)
);
COMMENT ON TABLE password_resets IS 'Token đặt lại mật khẩu dùng một lần, hết hạn ngắn (đề xuất 30 phút). Chỉ lưu SHA-256 của token.';

CREATE TABLE login_attempts (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  identifier     text        NOT NULL,
  user_id        uuid        REFERENCES users(id) ON DELETE SET NULL,
  ip             inet,
  user_agent     text,
  success        boolean     NOT NULL,
  failure_reason text,
  attempted_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_login_attempts__reason CHECK (failure_reason IS NULL OR failure_reason IN
    ('unknown_user', 'bad_password', 'locked', 'disabled', 'mfa_failed', 'rate_limited')),
  CONSTRAINT ck_login_attempts__success_reason CHECK (success = (failure_reason IS NULL))
);
COMMENT ON TABLE login_attempts IS
  'Nhật ký đăng nhập (thành công/thất bại) phục vụ khóa tạm, chống brute-force/credential stuffing. user_id SET NULL khi user bị xóa. Dọn định kỳ sau 90 ngày.';

CREATE TABLE user_mfa_factors (
  id                 uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id            uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type        text        NOT NULL DEFAULT 'totp',
  secret_enc         bytea       NOT NULL,
  secret_key_version smallint    NOT NULL DEFAULT 1,
  confirmed_at       timestamptz,
  last_used_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_mfa_factors__type CHECK (factor_type IN ('totp')),
  CONSTRAINT ux_user_mfa_factors__user_type UNIQUE (user_id, factor_type)
);
COMMENT ON TABLE user_mfa_factors IS 'Yếu tố xác thực hai bước (TOTP). secret_enc là ciphertext mã hóa tầng ứng dụng (AES-256-GCM); khóa nằm ngoài DB.';

CREATE TABLE mfa_recovery_codes (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text        NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_mfa_recovery_codes__hash UNIQUE (code_hash),
  CONSTRAINT ck_mfa_recovery_codes__hash CHECK (app.is_hex(code_hash, 64))
);
COMMENT ON TABLE mfa_recovery_codes IS 'Mã khôi phục dùng một lần cho MFA (lưu SHA-256).';

-- ---------------------------------------------------------------------
-- 4.3.3  RBAC: vai trò, quyền, ma trận vai trò–quyền
--        (gán vai trò cho người dùng + phạm vi + nhiệm kỳ: bảng user_roles ở khối 4.3.2 file people)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code        text        NOT NULL,
  name_vi     text        NOT NULL,
  description text,
  rank        smallint    NOT NULL,
  is_system   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_roles__code UNIQUE (code),
  CONSTRAINT ck_roles__code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_roles__rank CHECK (rank BETWEEN 0 AND 100)
);
COMMENT ON TABLE roles IS 'Vai trò hệ thống: admin (Admin kỹ thuật), house_head (Trưởng nhà), vice_head (Phó nhà), treasurer (Thủ quỹ), liturgy_lead / kitchen_lead / media_lead (trưởng ban Phụng vụ / Ẩm thực / Truyền thông), member (Thành viên). rank thấp = quyền cao (chỉ để hiển thị/sắp xếp, KHÔNG dùng để kiểm tra quyền).';

CREATE TABLE permissions (
  code         text        PRIMARY KEY,
  module       text        NOT NULL,
  description  text        NOT NULL,
  is_sensitive boolean     NOT NULL DEFAULT false,
  CONSTRAINT ck_permissions__code_format CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
COMMENT ON TABLE permissions IS 'Danh mục quyền nguyên tử dạng <phân_hệ>.<đối_tượng>.<hành_động>. Chỉ ghi qua migration; mã quyền được code kiểm tra.';

CREATE TABLE role_permissions (
  role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);
COMMENT ON TABLE role_permissions IS 'Ma trận vai trò × quyền (dữ liệu, không hard-code trong code). Là nguồn chuẩn để sinh ma trận quyền ở tài liệu.';

-- ---------------------------------------------------------------------
-- 4.3.4  settings — cấu hình thay cho hard-code (mức quỹ, ngưỡng duyệt chi, khung giờ giặt…)
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  key          text        PRIMARY KEY,
  value        jsonb       NOT NULL,
  value_type   text        NOT NULL,
  description  text        NOT NULL,
  min_value    numeric,
  max_value    numeric,
  is_public    boolean     NOT NULL DEFAULT false,
  write_permission text    NOT NULL DEFAULT 'setting.write' REFERENCES permissions(code) ON UPDATE CASCADE,
  updated_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer     NOT NULL DEFAULT 1,
  CONSTRAINT ck_settings__key_format CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT ck_settings__value_type CHECK (value_type IN ('integer', 'number', 'boolean', 'string', 'time', 'vnd', 'json')),
  CONSTRAINT ck_settings__type_matches CHECK (
       (value_type IN ('integer', 'vnd') AND jsonb_typeof(value) = 'number')
    OR (value_type = 'number'  AND jsonb_typeof(value) = 'number')
    OR (value_type = 'boolean' AND jsonb_typeof(value) = 'boolean')
    OR (value_type IN ('string', 'time') AND jsonb_typeof(value) = 'string')
    OR (value_type = 'json')),
  CONSTRAINT ck_settings__bounds CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);
COMMENT ON TABLE settings IS 'Cấu hình hệ thống dạng khóa–giá trị có kiểu. Thay đổi được ghi vào audit_logs. is_public=true: client được đọc (ví dụ khung giờ giặt, mức quỹ tháng).';
COMMENT ON COLUMN settings.write_permission IS 'Quyền cần có để SỬA cấu hình này (mặc định setting.write — Admin kỹ thuật và Trưởng nhà). Cấu hình tài chính (finance.*) yêu cầu finance.settings.write chỉ Trưởng nhà có: Admin kỹ thuật không thể hạ ngưỡng hai chữ ký hay tắt bắt buộc đối soát (tách quyền kỹ thuật khỏi quyền tài chính).';

-- ---------------------------------------------------------------------
-- 4.3.5  categories — danh mục do người quản lý quản lý (khớp màn hình Cài đặt)
--        Một bảng + cột kind; các bảng dùng danh mục tham chiếu bằng FK phức hợp (category_id, category_kind).
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id          uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  kind        category_kind_t NOT NULL,
  code        text            NOT NULL,
  name        text            NOT NULL,
  description text,
  color       text            NOT NULL DEFAULT '#64748b',
  icon_name   text,
  sort_order  integer         NOT NULL DEFAULT 0,
  is_active   boolean         NOT NULL DEFAULT true,
  is_system   boolean         NOT NULL DEFAULT false,
  created_at  timestamptz     NOT NULL DEFAULT now(),
  updated_at  timestamptz     NOT NULL DEFAULT now(),
  version     integer         NOT NULL DEFAULT 1,
  deleted_at  timestamptz,
  CONSTRAINT ux_categories__id_kind UNIQUE (id, kind),
  CONSTRAINT ck_categories__code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_categories__color CHECK (app.is_hex_color(color)),
  CONSTRAINT ck_categories__name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 100)
);
COMMENT ON TABLE categories IS
  'Danh mục dùng chung (chi phí, sự kiện, thông báo, diễn đàn, báo hỏng, album). Không xóa cứng khi đã có dữ liệu tham chiếu: tắt is_active hoặc xóa mềm. is_system=true: không cho xóa/đổi code.';
COMMENT ON COLUMN categories.code IS 'Mã ổn định để seed/migration/báo cáo tham chiếu (ví dụ FOOD, UTILITY); tên hiển thị name có thể đổi.';

-- ---------------------------------------------------------------------
-- 4.3.6  storage_files & media_attachments — metadata tệp (nội dung nằm ở Object Storage)
-- ---------------------------------------------------------------------
CREATE TABLE storage_files (
  id                 uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  bucket             storage_bucket_t NOT NULL,
  object_key         text             NOT NULL,
  original_name      text,
  declared_mime      text,
  detected_mime      text,
  size_bytes         bigint           NOT NULL,
  sha256             text,
  phash              bigint,
  width_px           integer,
  height_px          integer,
  taken_at           timestamptz,
  exif_stripped      boolean          NOT NULL DEFAULT false,
  device_info        jsonb,
  status             file_status_t    NOT NULL DEFAULT 'pending_upload',
  scan_status        text             NOT NULL DEFAULT 'pending',
  variants           jsonb            NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by        uuid             REFERENCES users(id) ON DELETE SET NULL,
  client_request_id  uuid,
  upload_expires_at  timestamptz,
  attached_at        timestamptz,
  purge_after        timestamptz,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT ux_storage_files__bucket_key UNIQUE (bucket, object_key),
  CONSTRAINT ck_storage_files__size CHECK (size_bytes > 0 AND size_bytes <= 20 * 1024 * 1024),
  CONSTRAINT ck_storage_files__sha256 CHECK (app.is_hex(sha256, 64)),
  CONSTRAINT ck_storage_files__mime CHECK (detected_mime IS NULL OR detected_mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  CONSTRAINT ck_storage_files__dims CHECK ((width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)),
  CONSTRAINT ck_storage_files__scan CHECK (scan_status IN ('pending', 'clean', 'infected', 'error', 'skipped')),
  CONSTRAINT ck_storage_files__ready_needs_hash CHECK (status <> 'ready' OR (sha256 IS NOT NULL AND detected_mime IS NOT NULL)),
  CONSTRAINT ck_storage_files__variants_obj CHECK (jsonb_typeof(variants) = 'object'),
  CONSTRAINT ck_storage_files__key_len CHECK (char_length(object_key) BETWEEN 8 AND 512)
);
COMMENT ON TABLE storage_files IS
  'Metadata tệp: bucket + khóa đối tượng, MIME thực (magic bytes), SHA-256 (chống trùng), pHash (ảnh gần giống), EXIF taken_at (GPS đã bị xóa), trạng thái xử lý nền. Nội dung tệp KHÔNG nằm trong DB. uploaded_by SET NULL khi user bị xóa.';
COMMENT ON COLUMN storage_files.phash IS 'Perceptual hash 64-bit (dHash) lưu bigint; khoảng cách Hamming = bit_count(a # b) tính ở service.';
COMMENT ON COLUMN storage_files.taken_at IS 'EXIF DateTimeOriginal nếu có. Dùng đối chiếu thời điểm check-in để chống dùng ảnh cũ.';

CREATE TABLE media_attachments (
  id           uuid                 PRIMARY KEY DEFAULT app.uuid_v7(),
  file_id      uuid                 NOT NULL REFERENCES storage_files(id) ON DELETE RESTRICT,
  entity_type  attachment_entity_t  NOT NULL,
  entity_id    uuid                 NOT NULL,
  purpose      attachment_purpose_t NOT NULL,
  position     smallint             NOT NULL DEFAULT 0,
  caption      text,
  attached_by  uuid                 REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT ux_media_attachments__entity_file UNIQUE (entity_type, entity_id, file_id),
  CONSTRAINT ck_media_attachments__position CHECK (position >= 0)
);
COMMENT ON TABLE media_attachments IS
  'Liên kết đa hình tệp ↔ thực thể (phiếu chi, check-in, bảng điểm, sự cố…). Tính toàn vẹn tham chiếu được bảo đảm bằng trigger trg_media_attachments__entity_exists (không có FK vì đa hình). ON DELETE RESTRICT: không xóa tệp đang được gắn.';
