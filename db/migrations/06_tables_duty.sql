-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (4/9): HẬU CẦN — TRỰC NHẬT & VỆ SINH
-- FE chỉ có CleaningDuty phẳng (tên người dạng chuỗi, 1 ảnh, không checklist cấu trúc, đổi ca đổi thẳng).
-- DB: roster tuần → ca trực (khu vực × ngày × ca) → người trực (N–N, không trùng ca) →
--     check-in (ảnh minh chứng + checklist) → nghiệm thu (không tự nghiệm thu) → khiếu nại; đổi ca 3 bước.
-- =====================================================================

CREATE TABLE cleaning_areas (
  id                 uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code               text        NOT NULL,
  name               text        NOT NULL,
  icon               text,
  description        text,
  floor_id           uuid        REFERENCES floors(id) ON DELETE SET NULL,
  room_id            uuid        REFERENCES rooms(id) ON DELETE SET NULL,
  difficulty_points  smallint    NOT NULL DEFAULT 1,
  min_assignees      smallint    NOT NULL DEFAULT 2,
  is_whole_house     boolean     NOT NULL DEFAULT false,
  sort_order         integer     NOT NULL DEFAULT 0,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            integer     NOT NULL DEFAULT 1,
  CONSTRAINT ux_cleaning_areas__code UNIQUE (code),
  CONSTRAINT ck_cleaning_areas__code CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_cleaning_areas__points CHECK (difficulty_points BETWEEN 1 AND 10),
  CONSTRAINT ck_cleaning_areas__min CHECK (min_assignees BETWEEN 1 AND 20)
);
COMMENT ON TABLE cleaning_areas IS 'Khu vực vệ sinh (6 khu vực chuẩn + Tổng vệ sinh toàn nhà). Thay cho chuỗi tự do CleaningDuty.area/areaIcon. difficulty_points = trọng số công bằng/điểm đóng góp. floor_id/room_id SET NULL khi tầng/phòng bị xóa mềm.';

CREATE TABLE duty_shifts (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code        text        NOT NULL,
  name        text        NOT NULL,
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  CONSTRAINT ux_duty_shifts__code UNIQUE (code),
  CONSTRAINT ck_duty_shifts__code CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_duty_shifts__time CHECK (end_time > start_time)
);
COMMENT ON TABLE duty_shifts IS 'Ca trực (Sáng 06:30, Chiều 17:30, Tối 21:00 — FE đang nhúng giờ vào nhãn). end_time > start_time (CHECK).';

CREATE TABLE checklist_templates (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  area_id     uuid        REFERENCES cleaning_areas(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  version     integer     NOT NULL DEFAULT 1,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_checklist_templates__version CHECK (version >= 1)
);
COMMENT ON TABLE checklist_templates IS 'Mẫu tiêu chí check-in. area_id NULL = mẫu mặc định cho mọi khu vực. Mỗi ca trực đóng băng template_id tại thời điểm tạo ca (đổi mẫu sau này không làm sai lịch sử).';

CREATE TABLE checklist_template_items (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  template_id    uuid        NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  code           text        NOT NULL,
  label          text        NOT NULL,
  sort_order     integer     NOT NULL DEFAULT 0,
  is_required    boolean     NOT NULL DEFAULT true,
  CONSTRAINT ux_checklist_template_items__code UNIQUE (template_id, code),
  CONSTRAINT ck_checklist_template_items__code CHECK (code ~ '^[a-z][a-z0-9_]*$')
);
COMMENT ON TABLE checklist_template_items IS 'Tiêu chí của mẫu: 4 tiêu chí mặc định (lau sàn, đổ rác, cọ rửa, bổ sung vật tư). is_required: bắt buộc tick để nộp check-in.';

CREATE TABLE duty_rosters (
  id               uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  academic_year_id uuid            REFERENCES academic_years(id) ON DELETE SET NULL,
  week_start       date            NOT NULL,
  status           roster_status_t NOT NULL DEFAULT 'draft',
  notes            text,
  generated_by_solver boolean      NOT NULL DEFAULT false,
  published_at     timestamptz,
  published_by     uuid            REFERENCES users(id) ON DELETE SET NULL,
  created_by       uuid            REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz     NOT NULL DEFAULT now(),
  updated_at       timestamptz     NOT NULL DEFAULT now(),
  version          integer         NOT NULL DEFAULT 1,
  CONSTRAINT ux_duty_rosters__week UNIQUE (week_start),
  CONSTRAINT ck_duty_rosters__monday CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CONSTRAINT ck_duty_rosters__published CHECK (status = 'draft' OR published_at IS NOT NULL)
);
COMMENT ON TABLE duty_rosters IS 'Roster trực nhật theo tuần ISO (week_start luôn là Thứ Hai). draft chỉ người quản lý thấy; published thành viên thấy và nhận thông báo; closed khóa sau tuần.';

CREATE TABLE duty_assignments (
  id                     uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  roster_id              uuid          NOT NULL REFERENCES duty_rosters(id) ON DELETE RESTRICT,
  area_id                uuid          NOT NULL REFERENCES cleaning_areas(id) ON DELETE RESTRICT,
  shift_id               uuid          NOT NULL REFERENCES duty_shifts(id) ON DELETE RESTRICT,
  duty_date              date          NOT NULL,
  room_id                uuid          REFERENCES rooms(id) ON DELETE SET NULL,
  checklist_template_id  uuid          REFERENCES checklist_templates(id) ON DELETE SET NULL,
  status                 duty_status_t NOT NULL DEFAULT 'scheduled',
  attempt_count          smallint      NOT NULL DEFAULT 0,
  rework_due_at          timestamptz,
  status_reason          text,
  created_by             uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  version                integer       NOT NULL DEFAULT 1,
  CONSTRAINT ux_duty_assignments__slot UNIQUE (duty_date, area_id, shift_id),
  CONSTRAINT ux_duty_assignments__id_date_shift UNIQUE (id, duty_date, shift_id),
  CONSTRAINT ck_duty_assignments__attempts CHECK (attempt_count >= 0),
  CONSTRAINT ck_duty_assignments__reason CHECK (status NOT IN ('cancelled', 'excused', 'missed') OR status_reason IS NOT NULL)
);
COMMENT ON TABLE duty_assignments IS
  'Một ca trực = (khu vực, ngày, ca) thuộc một roster tuần (trigger kiểm tra duty_date nằm trong tuần của roster). status theo máy trạng thái scheduled→checked_in→approved|rework_required→checked_in…; missed/cancelled/excused phải có lý do. ON DELETE RESTRICT: không xóa ca đã có check-in.';

CREATE TABLE duty_assignment_members (
  assignment_id  uuid        NOT NULL,
  duty_date      date        NOT NULL,
  shift_id       uuid        NOT NULL,
  member_id      uuid        NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  member_role    text        NOT NULL DEFAULT 'member',
  override_reason text,
  added_by       uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, member_id),
  CONSTRAINT fk_duty_assignment_members__assignment FOREIGN KEY (assignment_id, duty_date, shift_id)
    REFERENCES duty_assignments (id, duty_date, shift_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT ux_duty_assignment_members__member_slot UNIQUE (member_id, duty_date, shift_id),
  CONSTRAINT ck_duty_assignment_members__role CHECK (member_role IN ('lead', 'member'))
);
COMMENT ON TABLE duty_assignment_members IS
  'Người trực của một ca (thay cho mảng tên assignedMembers). duty_date/shift_id được sao chép CÓ CHỦ ĐÍCH và ràng buộc bằng FK phức hợp để ux_duty_assignment_members__member_slot bảo đảm một người không bị xếp trùng ca (BR-DUTY-04). override_reason: người quản lý ghi đè cảnh báo bận/nghỉ phép.';

CREATE TABLE duty_checkins (
  id                      uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  assignment_id           uuid        NOT NULL REFERENCES duty_assignments(id) ON DELETE RESTRICT,
  attempt                 smallint    NOT NULL,
  checked_in_by_member_id uuid        NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  checked_in_at           timestamptz NOT NULL DEFAULT now(),
  client_captured_at      timestamptz,
  evidence_file_id        uuid        NOT NULL REFERENCES storage_files(id) ON DELETE RESTRICT,
  is_late                 boolean     NOT NULL DEFAULT false,
  late_minutes            integer,
  note                    text,
  client_request_id       uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_duty_checkins__assignment_attempt UNIQUE (assignment_id, attempt),
  CONSTRAINT ux_duty_checkins__evidence UNIQUE (evidence_file_id),
  CONSTRAINT ck_duty_checkins__attempt CHECK (attempt >= 1),
  CONSTRAINT ck_duty_checkins__late CHECK ((late_minutes IS NOT NULL) = is_late)
);
COMMENT ON TABLE duty_checkins IS
  'Lần check-in của ca (có thể nhiều lần sau khi bị yêu cầu làm lại). Ảnh minh chứng bắt buộc (evidence_file_id NOT NULL, UNIQUE ⇒ một tệp không dùng lại cho ca khác); trigger kiểm tra: người check-in thuộc danh sách trực (BR-DUTY-01), bucket cleaning-evidence, ảnh đã ready, thời gian chụp EXIF gần thời điểm check-in, không trùng SHA-256/pHash với ảnh trước đó (BR-DUTY-03). Thời điểm là giờ máy chủ.';

CREATE TABLE checkin_items (
  checkin_id        uuid    NOT NULL REFERENCES duty_checkins(id) ON DELETE CASCADE,
  template_item_id  uuid    NOT NULL REFERENCES checklist_template_items(id) ON DELETE RESTRICT,
  is_done           boolean NOT NULL,
  note              text,
  PRIMARY KEY (checkin_id, template_item_id)
);
COMMENT ON TABLE checkin_items IS 'Kết quả từng tiêu chí của một lần check-in (thay cho chuỗi checklist ghép vào checkInNote ở FE). Tiêu chí is_required phải is_done=true khi nộp.';

CREATE TABLE duty_reviews (
  id                  uuid              PRIMARY KEY DEFAULT app.uuid_v7(),
  checkin_id          uuid              NOT NULL REFERENCES duty_checkins(id) ON DELETE RESTRICT,
  reviewer_member_id  uuid              NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  decision            review_decision_t NOT NULL,
  score               smallint,
  feedback            text,
  reviewed_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT ux_duty_reviews__checkin UNIQUE (checkin_id),
  CONSTRAINT ck_duty_reviews__score CHECK (score IS NULL OR score BETWEEN 1 AND 5),
  CONSTRAINT ck_duty_reviews__feedback CHECK (decision = 'approved' OR app.has_text(feedback, 5)),
  CONSTRAINT ck_duty_reviews__approved_score CHECK (decision = 'rework' OR score IS NOT NULL)
);
COMMENT ON TABLE duty_reviews IS 'Nghiệm thu một lần check-in: đạt (kèm điểm 1–5) hoặc làm lại (bắt buộc nhận xét ≥ 5 ký tự). Trigger: người nghiệm thu có quyền duty.review (đúng phạm vi tầng/khu vực) và KHÔNG thuộc danh sách trực của ca (BR-DUTY-02). Bất biến; kết quả sai được xử lý qua khiếu nại.';

CREATE TABLE duty_review_appeals (
  id                   uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  review_id            uuid            NOT NULL REFERENCES duty_reviews(id) ON DELETE RESTRICT,
  appellant_member_id  uuid            NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  reason               text            NOT NULL,
  status               appeal_status_t NOT NULL DEFAULT 'open',
  decided_by           uuid            REFERENCES users(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  decision_note        text,
  created_at           timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT ux_duty_review_appeals__review UNIQUE (review_id),
  CONSTRAINT ck_duty_review_appeals__reason CHECK (app.has_text(reason, 10)),
  CONSTRAINT ck_duty_review_appeals__decided CHECK ((status IN ('upheld', 'dismissed')) = (decided_at IS NOT NULL AND decided_by IS NOT NULL))
);
COMMENT ON TABLE duty_review_appeals IS 'Khiếu nại kết quả nghiệm thu (mỗi nghiệm thu một khiếu nại, trong 48 giờ — kiểm tra ở service/setting duty.appeal.window_hours). Trưởng nhà quyết định; chấp nhận ⇒ ca chuyển approved.';

CREATE TABLE duty_swap_requests (
  id                 uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  assignment_id      uuid          NOT NULL REFERENCES duty_assignments(id) ON DELETE RESTRICT,
  from_member_id     uuid          NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  to_member_id       uuid          NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  reason             text          NOT NULL,
  status             swap_status_t NOT NULL DEFAULT 'pending_peer',
  peer_responded_at  timestamptz,
  admin_decided_by   uuid          REFERENCES users(id) ON DELETE SET NULL,
  admin_decided_at   timestamptz,
  admin_note         text,
  expires_at         timestamptz   NOT NULL,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_duty_swap_requests__distinct CHECK (from_member_id <> to_member_id),
  CONSTRAINT ck_duty_swap_requests__reason CHECK (app.has_text(reason, 5)),
  CONSTRAINT ck_duty_swap_requests__admin CHECK (status NOT IN ('approved') OR (admin_decided_at IS NOT NULL AND peer_responded_at IS NOT NULL))
);
COMMENT ON TABLE duty_swap_requests IS 'Đơn đổi ca 3 bước: người xin → người nhận xác nhận (pending_peer→pending_admin) → người quản lý duyệt (approved ⇒ trigger hoán đổi dòng trong duty_assignment_members). Thay cho swapCleaningDuty của FE (đổi thẳng, ghi đè checkInNote).';

CREATE UNIQUE INDEX ux_duty_swap_requests__open_per_assignment
  ON duty_swap_requests (assignment_id, from_member_id)
  WHERE status IN ('pending_peer', 'pending_admin');

CREATE TABLE duty_status_history (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  assignment_id  uuid        NOT NULL REFERENCES duty_assignments(id) ON DELETE CASCADE,
  from_status    text,
  to_status      text        NOT NULL,
  changed_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  reason         text
);
COMMENT ON TABLE duty_status_history IS 'Nhật ký chuyển trạng thái ca trực (ghi bởi trigger app.tg_status_history, bất biến).';

CREATE TABLE duty_swap_status_history (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  swap_id        uuid        NOT NULL REFERENCES duty_swap_requests(id) ON DELETE CASCADE,
  from_status    text,
  to_status      text        NOT NULL,
  changed_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  reason         text
);
COMMENT ON TABLE duty_swap_status_history IS 'Nhật ký chuyển trạng thái đơn đổi ca (bất biến).';

CREATE TABLE member_unavailability (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind        text        NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_member_unavailability__kind CHECK (kind IN ('exam', 'class', 'internship', 'family', 'other')),
  CONSTRAINT ck_member_unavailability__range CHECK (ends_at > starts_at),
  CONSTRAINT ck_member_unavailability__max CHECK (ends_at - starts_at <= interval '120 days')
);
COMMENT ON TABLE member_unavailability IS 'Khoảng thời gian bận do thành viên tự khai (lịch thi, thực tập…) để thuật toán phân công và trigger tránh xếp trực trùng (BR-DUTY-05). Chỉ chính chủ và người quản lý thấy.';

-- ---------------------------------------------------------------------
-- Điểm đóng góp (merit) — sổ ghi thêm, không sửa
-- ---------------------------------------------------------------------
CREATE TABLE merit_rules (
  code         text        PRIMARY KEY,
  name_vi      text        NOT NULL,
  points       smallint    NOT NULL,
  is_automatic boolean     NOT NULL DEFAULT true,
  description  text,
  is_active    boolean     NOT NULL DEFAULT true,
  CONSTRAINT ck_merit_rules__code CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_merit_rules__points CHECK (points <> 0 AND points BETWEEN -50 AND 50)
);
COMMENT ON TABLE merit_rules IS 'Quy tắc điểm đóng góp/chuyên cần (trực đạt +, bỏ ca −, dự sự kiện +, vắng không phép −, điều chỉnh thủ công). Giá trị điểm cấu hình được; thay đổi không tác động ngược các bút toán điểm cũ.';

CREATE TABLE merit_entries (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id        uuid        NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  rule_code        text        NOT NULL REFERENCES merit_rules(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  points           smallint    NOT NULL,
  occurred_on      date        NOT NULL DEFAULT app.local_today(),
  academic_year_id uuid        REFERENCES academic_years(id) ON DELETE RESTRICT,
  source_table     text,
  source_id        uuid,
  note             text,
  created_by       uuid        REFERENCES users(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_merit_entries__points CHECK (points <> 0 AND points BETWEEN -100 AND 100),
  CONSTRAINT ck_merit_entries__manual_note CHECK (rule_code <> 'manual_adjust' OR app.has_text(note, 5))
);
COMMENT ON TABLE merit_entries IS 'Sổ điểm đóng góp bất biến (trigger chặn UPDATE/DELETE); điểm cho một ca/sự kiện chỉ được ghi một lần nhờ index duy nhất (rule, source). Điều chỉnh thủ công bắt buộc có lý do.';
