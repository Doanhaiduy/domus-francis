-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (5/9): HỌC TẬP — THANG ĐIỂM CẤU HÌNH ĐƯỢC, BẢNG ĐIỂM, GPA, PHỤ ĐẠO
-- Khác FE: trọng số 40/60, ngưỡng điểm chữ, quy đổi hệ 4 và ngưỡng xếp loại KHÔNG cài cứng mà nằm trong
-- grade_scales/grade_scale_bands/grade_rank_bands (mỗi trường một thang, có hiệu lực theo thời gian).
-- gpa10/gpa4/rank/letterGrade KHÔNG lưu tay: tính bằng trigger/hàm từ điểm thành phần.
-- =====================================================================

CREATE TABLE grade_scales (
  id                 uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  university_id      uuid          REFERENCES universities(id) ON DELETE CASCADE,
  code               text          NOT NULL,
  name               text          NOT NULL,
  max_score          numeric(5,2)  NOT NULL DEFAULT 10,
  process_weight_pct smallint      NOT NULL DEFAULT 40,
  final_weight_pct   smallint      NOT NULL DEFAULT 60,
  round_decimals     smallint      NOT NULL DEFAULT 1,
  rounding_mode      text          NOT NULL DEFAULT 'half_up',
  gpa_scale_max      numeric(3,1)  NOT NULL DEFAULT 4.0,
  gpa4_mode          text          NOT NULL DEFAULT 'from_letter',
  effective_from     date          NOT NULL DEFAULT DATE '2000-01-01',
  effective_to       date,
  is_active          boolean       NOT NULL DEFAULT true,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  version            integer       NOT NULL DEFAULT 1,
  CONSTRAINT ux_grade_scales__code UNIQUE (code),
  CONSTRAINT ck_grade_scales__weights CHECK (process_weight_pct BETWEEN 0 AND 100 AND process_weight_pct + final_weight_pct = 100),
  CONSTRAINT ck_grade_scales__decimals CHECK (round_decimals BETWEEN 0 AND 2),
  CONSTRAINT ck_grade_scales__rounding CHECK (rounding_mode IN ('half_up', 'truncate')),
  CONSTRAINT ck_grade_scales__gpa4_mode CHECK (gpa4_mode IN ('from_letter', 'linear')),
  CONSTRAINT ck_grade_scales__max CHECK (max_score IN (4, 10, 100)),
  CONSTRAINT ck_grade_scales__effective CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT ex_grade_scales__no_overlap EXCLUDE USING gist (
    (COALESCE(university_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  ) WHERE (is_active)
);
COMMENT ON TABLE grade_scales IS
  'Thang điểm theo trường (university_id NULL = thang mặc định toàn hệ thống). Gồm trọng số điểm quá trình/cuối kỳ, cách làm tròn, cách tính GPA hệ 4 (from_letter = theo điểm chữ như đa số trường; linear = gpa10/10×4 như FE cũ). Không cho hai thang đang hiệu lực chồng thời gian cho cùng trường (exclusion constraint). Mỗi bản ghi điểm lưu scale_id đã dùng để kết quả cũ không đổi khi thang mới ra đời.';

CREATE TABLE grade_scale_bands (
  id            uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  scale_id      uuid         NOT NULL REFERENCES grade_scales(id) ON DELETE CASCADE,
  letter        text         NOT NULL,
  min_score     numeric(5,2) NOT NULL,
  gpa_points    numeric(3,2) NOT NULL,
  is_pass       boolean      NOT NULL,
  counts_in_gpa boolean      NOT NULL DEFAULT true,
  sort_order    smallint     NOT NULL DEFAULT 0,
  CONSTRAINT ux_grade_scale_bands__letter UNIQUE (scale_id, letter),
  CONSTRAINT ux_grade_scale_bands__min UNIQUE (scale_id, min_score),
  CONSTRAINT ck_grade_scale_bands__min CHECK (min_score >= 0),
  CONSTRAINT ck_grade_scale_bands__points CHECK (gpa_points BETWEEN 0 AND 4)
);
COMMENT ON TABLE grade_scale_bands IS 'Các bậc điểm chữ của một thang: chữ cái, ngưỡng điểm tối thiểu, điểm hệ 4, đạt/không đạt. Môn có tổng kết ≥ min_score cao nhất thỏa mãn thuộc bậc đó.';

CREATE TABLE grade_rank_bands (
  id         uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  scale_id   uuid         NOT NULL REFERENCES grade_scales(id) ON DELETE CASCADE,
  label_vi   text         NOT NULL,
  min_gpa4   numeric(3,2) NOT NULL,
  sort_order smallint     NOT NULL DEFAULT 0,
  CONSTRAINT ux_grade_rank_bands__min UNIQUE (scale_id, min_gpa4),
  CONSTRAINT ux_grade_rank_bands__label UNIQUE (scale_id, label_vi),
  CONSTRAINT ck_grade_rank_bands__min CHECK (min_gpa4 BETWEEN 0 AND 4)
);
COMMENT ON TABLE grade_rank_bands IS 'Ngưỡng xếp loại học lực theo GPA hệ 4 của từng thang (Xuất sắc/Giỏi/Khá/Trung bình/Cần cố gắng — nhãn FE).';

CREATE TABLE courses (
  id               uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  university_id    uuid         NOT NULL REFERENCES universities(id) ON DELETE RESTRICT,
  code             text,
  name             text         NOT NULL,
  name_norm        text         GENERATED ALWAYS AS (app.norm_text(name)) STORED,
  default_credits  numeric(3,1),
  excluded_from_gpa boolean     NOT NULL DEFAULT false,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ux_courses__university_name UNIQUE (university_id, name_norm),
  CONSTRAINT ck_courses__name CHECK (char_length(btrim(name)) BETWEEN 2 AND 200),
  CONSTRAINT ck_courses__credits CHECK (default_credits IS NULL OR default_credits BETWEEN 0.5 AND 15)
);
COMMENT ON TABLE courses IS 'Danh mục môn học theo trường, tự tạo khi thành viên nhập điểm (tìm theo tên đã chuẩn hóa bỏ dấu name_norm). Dùng để ghép cặp phụ đạo theo môn. excluded_from_gpa: môn điều kiện (GDTC, GDQP…).';

CREATE TABLE academic_records (
  id                   uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id            uuid            NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  semester_id          uuid            NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  university_id        uuid            NOT NULL REFERENCES universities(id) ON DELETE RESTRICT,
  scale_id             uuid            NOT NULL REFERENCES grade_scales(id) ON DELETE RESTRICT,
  major_snapshot       text,
  student_code_snapshot text,
  status               record_status_t NOT NULL DEFAULT 'draft',
  has_scholarship      boolean         NOT NULL DEFAULT false,
  scholarship_note     text,
  submitted_at         timestamptz,
  verified_by          uuid            REFERENCES users(id) ON DELETE SET NULL,
  verified_at          timestamptz,
  reject_reason        text,
  created_at           timestamptz     NOT NULL DEFAULT now(),
  updated_at           timestamptz     NOT NULL DEFAULT now(),
  version              integer         NOT NULL DEFAULT 1,
  CONSTRAINT ux_academic_records__member_semester UNIQUE (member_id, semester_id),
  CONSTRAINT ck_academic_records__submitted CHECK (status = 'draft' OR submitted_at IS NOT NULL),
  CONSTRAINT ck_academic_records__verified CHECK ((status = 'verified') = (verified_at IS NOT NULL AND verified_by IS NOT NULL)),
  CONSTRAINT ck_academic_records__rejected CHECK (status <> 'rejected' OR app.has_text(reject_reason, 5))
);
COMMENT ON TABLE academic_records IS
  'Bảng điểm của một thành viên trong một học kỳ (FE AcademicRecord). Duy nhất theo (member, semester) — nhập lại là CẬP NHẬT, không tạo bản ghi trùng như FE. Dữ liệu học tập nhạy cảm: chỉ chính chủ xem chi tiết; người quản lý xem khi có đồng ý academic_share_leadership. Minh chứng bảng điểm = media_attachments(entity=academic_record, purpose=transcript). major/student_code là ảnh chụp tại thời điểm nhập.';

CREATE TABLE grade_records (
  id                    uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  record_id             uuid         NOT NULL REFERENCES academic_records(id) ON DELETE CASCADE,
  course_id             uuid         NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  credits               numeric(3,1) NOT NULL,
  process_score         numeric(5,2),
  final_score           numeric(5,2),
  official_total_score  numeric(5,2),
  total_score           numeric(5,2),
  letter_grade          text,
  gpa_points            numeric(3,2),
  is_pass               boolean,
  counts_in_gpa         boolean,
  is_retake             boolean      NOT NULL DEFAULT false,
  note                  text,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ux_grade_records__record_course UNIQUE (record_id, course_id),
  CONSTRAINT ck_grade_records__credits CHECK (credits > 0 AND credits <= 15),
  CONSTRAINT ck_grade_records__scores CHECK (
    (process_score IS NULL OR process_score >= 0) AND (final_score IS NULL OR final_score >= 0)
    AND (official_total_score IS NULL OR official_total_score >= 0)),
  CONSTRAINT ck_grade_records__has_score CHECK (final_score IS NOT NULL OR official_total_score IS NOT NULL)
);
COMMENT ON TABLE grade_records IS
  'Điểm từng môn trong bảng điểm. total_score, letter_grade, gpa_points, is_pass, counts_in_gpa do trigger trg_grade_records__compute tính từ điểm thành phần và thang scale_id của bảng điểm (hoặc lấy official_total_score nếu thành viên nhập điểm tổng kết chính thức của trường). Không nhập tay các cột dẫn xuất.';

CREATE TABLE gpa_snapshots (
  id                  uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id           uuid         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scope               text         NOT NULL,
  as_of_semester_id   uuid         NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  credits_attempted   numeric(6,1) NOT NULL,
  credits_passed      numeric(6,1) NOT NULL,
  failed_courses      integer      NOT NULL DEFAULT 0,
  gpa10               numeric(4,2),
  gpa4                numeric(3,2),
  rank_label          text,
  includes_unverified boolean      NOT NULL DEFAULT false,
  computed_at         timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ux_gpa_snapshots__key UNIQUE (member_id, scope, as_of_semester_id),
  CONSTRAINT ck_gpa_snapshots__scope CHECK (scope IN ('semester', 'cumulative')),
  CONSTRAINT ck_gpa_snapshots__credits CHECK (credits_attempted >= 0 AND credits_passed >= 0 AND credits_passed <= credits_attempted)
);
COMMENT ON TABLE gpa_snapshots IS 'GPA học kỳ và GPA tích lũy (tính bởi app.fn_recompute_gpa, trọng số tín chỉ, chỉ môn counts_in_gpa). failed_courses = số môn nợ (không đạt). Chỉ bảng điểm submitted/verified được tính. Không sửa tay.';

CREATE TABLE study_goals (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id    uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  semester_id  uuid        NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  goals        text,
  difficulties text,
  visibility   text        NOT NULL DEFAULT 'private',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_study_goals__member_semester UNIQUE (member_id, semester_id),
  CONSTRAINT ck_study_goals__visibility CHECK (visibility IN ('private', 'leadership', 'community')),
  CONSTRAINT ck_study_goals__len CHECK (char_length(COALESCE(goals, '')) <= 2000 AND char_length(COALESCE(difficulties, '')) <= 2000)
);
COMMENT ON TABLE study_goals IS 'Nguyện vọng/mục tiêu và khó khăn học tập (FE: aspirations). Mặc định riêng tư; chia sẻ cho người quản lý/cộng đoàn do chính chủ chọn.';

CREATE TABLE tutoring_offers (
  id               uuid              PRIMARY KEY DEFAULT app.uuid_v7(),
  tutor_member_id  uuid              NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  course_id        uuid              REFERENCES courses(id) ON DELETE SET NULL,
  subject_text     text              NOT NULL,
  description      text,
  schedule_note    text,
  capacity         smallint          NOT NULL DEFAULT 2,
  status           tutoring_status_t NOT NULL DEFAULT 'open',
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT ck_tutoring_offers__capacity CHECK (capacity BETWEEN 1 AND 10),
  CONSTRAINT ck_tutoring_offers__subject CHECK (char_length(btrim(subject_text)) BETWEEN 2 AND 200)
);
COMMENT ON TABLE tutoring_offers IS 'Lời đề nghị kèm học (FE: Minh Tuấn "sẵn sàng phụ đạo môn Vật lý đại cương"). Người kèm tự đăng; không cần chia sẻ điểm cá nhân.';

CREATE TABLE tutoring_requests (
  id                uuid              PRIMARY KEY DEFAULT app.uuid_v7(),
  mentee_member_id  uuid              NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  course_id         uuid              REFERENCES courses(id) ON DELETE SET NULL,
  subject_text      text              NOT NULL,
  description       text,
  status            tutoring_status_t NOT NULL DEFAULT 'open',
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT ck_tutoring_requests__subject CHECK (char_length(btrim(subject_text)) BETWEEN 2 AND 200)
);
COMMENT ON TABLE tutoring_requests IS 'Yêu cầu được kèm (FE: supportNeeded + supportSubject). Chỉ chính chủ và người quản lý/người được ghép thấy; không bắt buộc kèm điểm.';

CREATE TABLE tutoring_matches (
  id                uuid           PRIMARY KEY DEFAULT app.uuid_v7(),
  offer_id          uuid           REFERENCES tutoring_offers(id) ON DELETE SET NULL,
  request_id        uuid           NOT NULL REFERENCES tutoring_requests(id) ON DELETE RESTRICT,
  tutor_member_id   uuid           NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  mentee_member_id  uuid           NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status            match_status_t NOT NULL DEFAULT 'proposed',
  proposed_by       uuid           REFERENCES users(id) ON DELETE SET NULL,
  tutor_accepted_at timestamptz,
  mentee_accepted_at timestamptz,
  started_on        date,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT ck_tutoring_matches__distinct CHECK (tutor_member_id <> mentee_member_id),
  CONSTRAINT ck_tutoring_matches__active CHECK (status NOT IN ('active', 'completed') OR (tutor_accepted_at IS NOT NULL AND mentee_accepted_at IS NOT NULL))
);
COMMENT ON TABLE tutoring_matches IS 'Ghép cặp phụ đạo: người quản lý hoặc hệ thống đề xuất (proposed), chỉ chuyển active khi CẢ HAI bên đồng ý (CHECK). Không tiết lộ điểm của bên nào cho bên kia.';

CREATE TABLE tutoring_sessions (
  id                    uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  match_id              uuid        NOT NULL REFERENCES tutoring_matches(id) ON DELETE CASCADE,
  held_at               timestamptz NOT NULL,
  duration_minutes      smallint    NOT NULL,
  topic                 text,
  tutor_confirmed_at    timestamptz,
  mentee_confirmed_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tutoring_sessions__duration CHECK (duration_minutes BETWEEN 15 AND 300)
);
COMMENT ON TABLE tutoring_sessions IS 'Buổi kèm đã diễn ra; số giờ chỉ được tính vào "ngân hàng thời gian" và điểm đóng góp khi cả hai bên xác nhận.';
