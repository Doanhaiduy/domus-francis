-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (2/9): THÀNH VIÊN, DỮ LIỆU NHẠY CẢM, ĐỒNG Ý, NĂM HỌC–NHIỆM KỲ, GÁN VAI TRÒ
-- Nguyên tắc phân tầng dữ liệu (xem Phần 9):
--   Tầng 1 (hiển thị nội bộ): members, student_profiles (một phần), member_positions
--   Tầng 2 (nhạy cảm)       : member_private_details, member_guardians   — chỉ chính chủ + người quản lý
--   Tầng 3 (rất nhạy cảm)   : catholic_profiles, member_sacraments, CCCD (cột *_enc) — cần đồng ý rõ ràng + nhật ký truy cập
-- =====================================================================

CREATE TYPE student_status_t AS ENUM ('studying', 'graduated', 'suspended', 'dropped_out');
COMMENT ON TYPE student_status_t IS 'Tình trạng học tập: studying=đang học, graduated=đã tốt nghiệp, suspended=bảo lưu, dropped_out=thôi học.';

-- ---------------------------------------------------------------------
-- 4.3.7  Tra cứu: Giáo phận, Trường đại học
-- ---------------------------------------------------------------------
CREATE TABLE dioceses (
  id                     uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code                   text        NOT NULL,
  name                   text        NOT NULL,
  is_archdiocese         boolean     NOT NULL DEFAULT false,
  ecclesiastical_province text       NOT NULL,
  sort_order             integer     NOT NULL DEFAULT 0,
  is_active              boolean     NOT NULL DEFAULT true,
  CONSTRAINT ux_dioceses__code UNIQUE (code),
  CONSTRAINT ux_dioceses__name UNIQUE (name),
  CONSTRAINT ck_dioceses__province CHECK (ecclesiastical_province IN ('Hà Nội', 'Huế', 'TP. Hồ Chí Minh'))
);
COMMENT ON TABLE dioceses IS 'Danh mục 27 (Tổng) Giáo phận Việt Nam, chia 3 giáo tỉnh. Dữ liệu seed, ít thay đổi.';

CREATE TABLE universities (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code        text        NOT NULL,
  name        text        NOT NULL,
  short_name  text,
  city        text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT ux_universities__code UNIQUE (code),
  CONSTRAINT ck_universities__code_format CHECK (code ~ '^[A-Z0-9_]+$')
);
COMMENT ON TABLE universities IS 'Danh mục trường đại học/học viện của thành viên. Thang điểm gắn qua grade_scales.university_id (mỗi trường có thể một thang điểm riêng).';

-- ---------------------------------------------------------------------
-- 4.3.8  members — hồ sơ thành viên (Tầng 1: hiển thị nội bộ)
-- ---------------------------------------------------------------------
CREATE TABLE members (
  id                  uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  member_no           bigint        GENERATED ALWAYS AS IDENTITY,
  user_id             uuid          REFERENCES users(id) ON DELETE SET NULL,
  full_name           text          NOT NULL,
  display_name        text          NOT NULL,
  avatar_file_id      uuid          REFERENCES storage_files(id) ON DELETE SET NULL,
  gender              gender_t,
  contact_phone_e164  text,
  contact_email       citext,
  hide_phone          boolean       NOT NULL DEFAULT false,
  status              member_status_t NOT NULL DEFAULT 'active',
  joined_on           date          NOT NULL DEFAULT app.local_today(),
  left_on             date,
  left_reason         text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  version             integer       NOT NULL DEFAULT 1,
  created_by          uuid          REFERENCES users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,
  CONSTRAINT ux_members__member_no UNIQUE (member_no),
  CONSTRAINT ux_members__user_id   UNIQUE (user_id),
  CONSTRAINT ck_members__full_name  CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_members__display_name CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 60),
  CONSTRAINT ck_members__phone      CHECK (app.is_e164(contact_phone_e164)),
  CONSTRAINT ck_members__left_dates CHECK (left_on IS NULL OR left_on >= joined_on),
  CONSTRAINT ck_members__left_status CHECK ((status IN ('alumni', 'left')) = (left_on IS NOT NULL))
);
COMMENT ON TABLE members IS
  'Hồ sơ cộng đoàn (tầng 1, mọi thành viên đăng nhập đều xem được tên/ảnh/trạng thái). Dữ liệu nhạy cảm tách sang member_private_details, member_guardians, catholic_profiles. user_id ON DELETE SET NULL: hồ sơ giữ lại khi tài khoản bị xóa (lưu trữ cựu thành viên). Xóa mềm; quyền xóa dữ liệu xử lý bằng ẩn danh hóa (Phần 9).';
COMMENT ON COLUMN members.member_no IS 'Số thứ tự thành viên tăng dần (IDENTITY). Mã hiển thị TV0001 do ứng dụng định dạng.';
COMMENT ON COLUMN members.hide_phone IS 'Thành viên chọn không chia sẻ SĐT cho thành viên khác; API danh bạ che số trừ chính chủ và người quản lý.';

CREATE TABLE member_private_details (
  member_id               uuid        PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  birth_date              date,
  hometown                text,
  home_address            text,
  national_id_enc         bytea,
  national_id_key_version smallint,
  national_id_bidx        bytea,
  national_id_last4       text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 integer     NOT NULL DEFAULT 1,
  CONSTRAINT ck_member_private__birth_range CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1940-01-01' AND DATE '2100-01-01'),
  CONSTRAINT ck_member_private__nid_complete CHECK (
    (national_id_enc IS NULL AND national_id_bidx IS NULL AND national_id_last4 IS NULL AND national_id_key_version IS NULL)
    OR (national_id_enc IS NOT NULL AND national_id_bidx IS NOT NULL AND national_id_last4 IS NOT NULL AND national_id_key_version IS NOT NULL)),
  CONSTRAINT ck_member_private__nid_last4 CHECK (national_id_last4 IS NULL OR national_id_last4 ~ '^[0-9]{4}$')
);
COMMENT ON TABLE member_private_details IS
  'Tầng 2 (nhạy cảm): ngày sinh, quê quán, địa chỉ thường trú, CCCD. CCCD lưu dạng national_id_enc (AES-256-GCM tầng ứng dụng, khóa quản lý ngoài DB), national_id_bidx (HMAC-SHA256 "blind index" để chống trùng/tìm đúng), national_id_last4 (hiển thị che •••• 1892). ON DELETE CASCADE theo members.';

CREATE TABLE member_guardians (
  id                    uuid                PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id             uuid                NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  relation              guardian_relation_t NOT NULL,
  full_name             text                NOT NULL,
  phone_enc             bytea,
  phone_key_version     smallint,
  phone_last4           text,
  is_emergency_contact  boolean             NOT NULL DEFAULT true,
  is_legal_guardian     boolean             NOT NULL DEFAULT false,
  created_at            timestamptz         NOT NULL DEFAULT now(),
  updated_at            timestamptz         NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT ck_member_guardians__name  CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_member_guardians__phone CHECK (
    (phone_enc IS NULL AND phone_key_version IS NULL AND phone_last4 IS NULL)
    OR (phone_enc IS NOT NULL AND phone_key_version IS NOT NULL AND phone_last4 ~ '^[0-9]{4}$'))
);
COMMENT ON TABLE member_guardians IS
  'Tầng 2: cha/mẹ/người giám hộ/người liên lạc khẩn cấp (FE: fatherName, motherName, parentPhone). SĐT mã hóa tầng ứng dụng. Thành viên < 18 tuổi bắt buộc có ít nhất một người giám hộ hợp pháp (kiểm tra ở service + báo cáo). ON DELETE CASCADE theo members.';

CREATE TABLE catholic_profiles (
  member_id    uuid        PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  holy_name    text,
  diocese_id   uuid        REFERENCES dioceses(id) ON DELETE SET NULL,
  parish_name  text,
  pastor_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer     NOT NULL DEFAULT 1,
  CONSTRAINT ck_catholic_profiles__holy_name CHECK (holy_name IS NULL OR char_length(btrim(holy_name)) BETWEEN 2 AND 80)
);
COMMENT ON TABLE catholic_profiles IS
  'Tầng 3 (dữ liệu tôn giáo = dữ liệu cá nhân nhạy cảm): Tên Thánh, Giáo phận, Giáo xứ, Linh mục quản xứ. Trigger trg_catholic_profiles__require_consent chặn ghi nếu chưa có đồng ý (consents, mục đích catholic_profile) còn hiệu lực.';

CREATE TABLE member_sacraments (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id    uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  sacrament    sacrament_t NOT NULL,
  received_on  date,
  place        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_member_sacraments__member_type UNIQUE (member_id, sacrament)
);
COMMENT ON TABLE member_sacraments IS 'Tầng 3: các Bí tích đã lãnh nhận (FE: Rửa tội, Thánh thể, Thêm sức). Cùng cơ chế đồng ý với catholic_profiles.';

CREATE TABLE student_profiles (
  id                        uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id                 uuid             NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  university_id             uuid             NOT NULL REFERENCES universities(id) ON DELETE RESTRICT,
  major                     text,
  cohort_label              text,
  enrollment_year           smallint,
  expected_graduation_year  smallint,
  student_code              text,
  status                    student_status_t NOT NULL DEFAULT 'studying',
  is_current                boolean          NOT NULL DEFAULT true,
  created_at                timestamptz      NOT NULL DEFAULT now(),
  updated_at                timestamptz      NOT NULL DEFAULT now(),
  version                   integer          NOT NULL DEFAULT 1,
  deleted_at                timestamptz,
  CONSTRAINT ck_student_profiles__years CHECK (
    (enrollment_year IS NULL OR enrollment_year BETWEEN 1990 AND 2100)
    AND (expected_graduation_year IS NULL OR expected_graduation_year BETWEEN 1990 AND 2110)
    AND (enrollment_year IS NULL OR expected_graduation_year IS NULL OR expected_graduation_year >= enrollment_year))
);
COMMENT ON TABLE student_profiles IS
  'Hồ sơ học tập hiện tại/lịch sử của thành viên (FE: university, major, academicYear "K66 (2021 – 2026)", studentCode). Mỗi thành viên có tối đa một dòng is_current. university_id ON DELETE RESTRICT: không xóa trường đang có sinh viên.';

-- ---------------------------------------------------------------------
-- 4.3.9  Đồng ý (consent) & yêu cầu của chủ thể dữ liệu
-- ---------------------------------------------------------------------
CREATE TABLE consent_purposes (
  code                    text        PRIMARY KEY,
  name_vi                 text        NOT NULL,
  description             text        NOT NULL,
  legal_basis             text        NOT NULL DEFAULT 'consent',
  is_sensitive            boolean     NOT NULL DEFAULT false,
  is_required             boolean     NOT NULL DEFAULT false,
  needs_guardian_if_minor boolean     NOT NULL DEFAULT true,
  current_version         integer     NOT NULL DEFAULT 1,
  retention_days          integer,
  is_active               boolean     NOT NULL DEFAULT true,
  CONSTRAINT ck_consent_purposes__code CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_consent_purposes__basis CHECK (legal_basis IN ('consent', 'contract', 'legitimate_interest', 'legal_obligation')),
  CONSTRAINT ck_consent_purposes__version CHECK (current_version >= 1),
  CONSTRAINT ck_consent_purposes__retention CHECK (retention_days IS NULL OR retention_days > 0)
);
COMMENT ON TABLE consent_purposes IS 'Danh mục mục đích xử lý dữ liệu cần đồng ý (hồ sơ Công giáo, chia sẻ điểm số, ảnh/gắn thẻ, AI…). Mỗi lần đổi nội dung điều khoản tăng current_version và yêu cầu đồng ý lại.';

CREATE TABLE consents (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id      uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  purpose_code   text        NOT NULL REFERENCES consent_purposes(code) ON UPDATE CASCADE,
  policy_version integer     NOT NULL,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  withdrawn_at   timestamptz,
  method         text        NOT NULL,
  guardian_id    uuid        REFERENCES member_guardians(id) ON DELETE SET NULL,
  evidence_note  text,
  ip             inet,
  user_agent     text,
  recorded_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_consents__method CHECK (method IN ('in_app', 'paper', 'verbal_recorded', 'import')),
  CONSTRAINT ck_consents__withdraw_after_grant CHECK (withdrawn_at IS NULL OR withdrawn_at >= granted_at),
  CONSTRAINT ck_consents__version CHECK (policy_version >= 1)
);
COMMENT ON TABLE consents IS
  'Bằng chứng đồng ý: ai, mục đích nào, phiên bản điều khoản nào, khi nào, bằng cách nào (ứng dụng/giấy/ghi nhận miệng). Rút đồng ý = đặt withdrawn_at (không xóa). Tại một thời điểm chỉ có tối đa một dòng còn hiệu lực cho mỗi (member, purpose).';

CREATE TABLE data_subject_requests (
  id              uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id       uuid          NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  request_type    dsr_type_t    NOT NULL,
  status          dsr_status_t  NOT NULL DEFAULT 'received',
  details         text,
  received_at     timestamptz   NOT NULL DEFAULT now(),
  due_at          timestamptz   NOT NULL DEFAULT (now() + interval '72 hours'),
  completed_at    timestamptz,
  handled_by      uuid          REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_dsr__completed CHECK ((status IN ('completed', 'rejected')) = (completed_at IS NOT NULL)),
  CONSTRAINT ck_dsr__due CHECK (due_at > received_at)
);
COMMENT ON TABLE data_subject_requests IS
  'Yêu cầu quyền của chủ thể dữ liệu (truy cập, sửa, xóa, rút đồng ý…). due_at mặc định 72 giờ [GIẢ ĐỊNH: theo khuyến nghị Nghị định 13/2023/NĐ-CP — cần tư vấn pháp lý xác nhận].';

-- ---------------------------------------------------------------------
-- 4.3.10  Năm học, học kỳ, nhiệm kỳ người quản lý, trách vụ
-- ---------------------------------------------------------------------
CREATE TABLE academic_years (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code        text        NOT NULL,
  name        text        NOT NULL,
  starts_on   date        NOT NULL,
  ends_on     date        NOT NULL,
  is_current  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_academic_years__code UNIQUE (code),
  CONSTRAINT ck_academic_years__code CHECK (code ~ '^[0-9]{4}-[0-9]{4}$'),
  CONSTRAINT ck_academic_years__range CHECK (ends_on > starts_on),
  CONSTRAINT ex_academic_years__no_overlap EXCLUDE USING gist (daterange(starts_on, ends_on, '[]') WITH &&)
);
COMMENT ON TABLE academic_years IS 'Năm học của lưu xá (ví dụ 2026-2027). Mọi dữ liệu theo kỳ (phòng, trực nhật, quỹ, điểm, nhiệm kỳ) gắn vào đây để lịch sử không bị lẫn. Chỉ một dòng is_current (xem index).';

CREATE TABLE semesters (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  academic_year_id uuid        NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  code             text        NOT NULL,
  name             text        NOT NULL,
  ordinal          smallint    NOT NULL,
  starts_on        date        NOT NULL,
  ends_on          date        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_semesters__year_code UNIQUE (academic_year_id, code),
  CONSTRAINT ck_semesters__code CHECK (code IN ('HK1', 'HK2', 'HE')),
  CONSTRAINT ck_semesters__range CHECK (ends_on > starts_on),
  CONSTRAINT ck_semesters__ordinal CHECK (ordinal BETWEEN 1 AND 3),
  CONSTRAINT ex_semesters__no_overlap EXCLUDE USING gist (academic_year_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
);
COMMENT ON TABLE semesters IS 'Học kỳ tham chiếu của lưu xá (HK1, HK2, HE = học kỳ hè) — dùng để nhóm điểm số. Lịch học thật của từng trường có thể lệch vài tuần; không dùng bảng này để suy ra lịch học.';

CREATE TABLE board_terms (
  id               uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  academic_year_id uuid          REFERENCES academic_years(id) ON DELETE SET NULL,
  name             text          NOT NULL,
  starts_on        date          NOT NULL,
  ends_on          date          NOT NULL,
  status           term_status_t NOT NULL DEFAULT 'planned',
  handover_notes   text,
  closed_at        timestamptz,
  closed_by        uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_board_terms__range CHECK (ends_on > starts_on),
  CONSTRAINT ck_board_terms__closed CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT ex_board_terms__no_overlap EXCLUDE USING gist (daterange(starts_on, ends_on, '[]') WITH &&)
);
COMMENT ON TABLE board_terms IS 'Nhiệm kỳ người quản lý. Vai trò/trách vụ gắn nhiệm kỳ; khi đóng nhiệm kỳ, các user_roles có valid_to = ends_on tự hết hiệu lực. handover_notes = biên bản bàn giao.';

CREATE TABLE positions (
  id          uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  code        text            NOT NULL,
  name        text            NOT NULL,
  kind        position_kind_t NOT NULL,
  description text,
  sort_order  integer         NOT NULL DEFAULT 0,
  is_active   boolean         NOT NULL DEFAULT true,
  CONSTRAINT ux_positions__code UNIQUE (code),
  CONSTRAINT ck_positions__code CHECK (code ~ '^[a-z][a-z0-9_]*$')
);
COMMENT ON TABLE positions IS 'Danh mục chức danh/trách vụ (Trưởng nhà, Phó nhà, Trưởng ban Phụng vụ, Trưởng ban Ẩm thực…). Chức danh KHÔNG tự cấp quyền; quyền do user_roles quyết định.';

CREATE TABLE member_positions (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id     uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position_id   uuid        NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  board_term_id uuid        NOT NULL REFERENCES board_terms(id) ON DELETE RESTRICT,
  responsibilities text,
  starts_on     date        NOT NULL,
  ends_on       date,
  created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_member_positions__range CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT ux_member_positions__unique UNIQUE (member_id, position_id, board_term_id)
);
COMMENT ON TABLE member_positions IS 'Lịch sử trách vụ theo nhiệm kỳ (thay cho chuỗi tự do Member.duty ở FE). responsibilities giữ mô tả công việc cụ thể.';

-- ---------------------------------------------------------------------
-- 4.3.11  user_roles & role_delegations — gán vai trò có phạm vi, nhiệm kỳ, ủy quyền tạm thời
-- ---------------------------------------------------------------------
CREATE TABLE user_roles (
  id             uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id        uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id        uuid         NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  scope_type     scope_type_t NOT NULL DEFAULT 'global',
  scope_id       uuid,
  board_term_id  uuid         REFERENCES board_terms(id) ON DELETE RESTRICT,
  valid_from     timestamptz  NOT NULL DEFAULT now(),
  valid_to       timestamptz,
  granted_by     uuid         REFERENCES users(id) ON DELETE SET NULL,
  revoked_at     timestamptz,
  revoked_by     uuid         REFERENCES users(id) ON DELETE SET NULL,
  note           text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_roles__scope_pair CHECK ((scope_type = 'global') = (scope_id IS NULL)),
  CONSTRAINT ck_user_roles__validity   CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ck_user_roles__revoked_by CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL),
  CONSTRAINT ex_user_roles__no_overlap EXCLUDE USING gist (
    user_id WITH =, role_id WITH =, scope_type WITH =,
    (COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    tstzrange(valid_from, valid_to) WITH &&
  ) WHERE (revoked_at IS NULL)
);
COMMENT ON TABLE user_roles IS
  'Gán vai trò cho tài khoản kèm phạm vi (toàn nhà / một tầng / một khu vực vệ sinh), nhiệm kỳ và thời hạn. Thu hồi bằng revoked_at (giữ lịch sử). Không cho hai dòng còn hiệu lực chồng thời gian cho cùng (user, role, phạm vi). scope_id đa hình => trigger trg_user_roles__validate_scope kiểm tra tồn tại.';

CREATE TABLE role_delegations (
  id                 uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  delegator_user_id  uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_user_id   uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id            uuid         NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  scope_type         scope_type_t NOT NULL DEFAULT 'global',
  scope_id           uuid,
  reason             text         NOT NULL,
  starts_at          timestamptz  NOT NULL,
  ends_at            timestamptz  NOT NULL,
  approved_by        uuid         REFERENCES users(id) ON DELETE SET NULL,
  revoked_at         timestamptz,
  revoked_by         uuid         REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_role_delegations__distinct CHECK (delegator_user_id <> delegate_user_id),
  CONSTRAINT ck_role_delegations__window   CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '60 days'),
  CONSTRAINT ck_role_delegations__scope_pair CHECK ((scope_type = 'global') = (scope_id IS NULL)),
  CONSTRAINT ck_role_delegations__reason   CHECK (app.has_text(reason, 5))
);
COMMENT ON TABLE role_delegations IS
  'Ủy quyền tạm thời (ví dụ Trưởng nhà đi vắng): người được ủy quyền hưởng vai trò trong cửa sổ thời gian tối đa 60 ngày. Trigger chặn ủy quyền vai trò admin và chặn ủy quyền nếu người ủy quyền không đang giữ vai trò đó. Mọi thao tác ghi audit_logs.';
