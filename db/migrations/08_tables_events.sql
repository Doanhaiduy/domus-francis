-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (6/9): SỰ KIỆN, LỊCH ĐỊNH KỲ, ĐIỂM DANH (QR HMAC XOAY VÒNG), ĐƠN XIN PHÉP, BIỂU QUYẾT, PHỤNG VỤ
-- Khác FE: thời gian là timestamptz (FE lưu chuỗi "04/10/2026" + "08:30 sáng"); định danh bằng member_id (FE dùng tên);
-- có lịch định kỳ, điểm danh thủ công, đơn xin phép, biểu quyết đa lựa chọn/đóng/ẩn danh, QR ký HMAC.
-- =====================================================================

CREATE TABLE event_recurrence_rules (
  id                    uuid              PRIMARY KEY DEFAULT app.uuid_v7(),
  title                 text              NOT NULL,
  category_id           uuid              NOT NULL,
  category_kind         category_kind_t   NOT NULL DEFAULT 'event',
  location_room_id      uuid              REFERENCES rooms(id) ON DELETE SET NULL,
  location_text         text,
  organizer_text        text,
  description           text,
  start_time            time              NOT NULL,
  duration_minutes      smallint          NOT NULL DEFAULT 60,
  freq                  recurrence_freq_t NOT NULL,
  interval_n            smallint          NOT NULL DEFAULT 1,
  by_weekday            smallint[],
  by_monthday           smallint,
  nth_weekday           smallint,
  starts_on             date              NOT NULL,
  until_date            date,
  requires_attendance   boolean           NOT NULL DEFAULT false,
  generate_horizon_days smallint          NOT NULL DEFAULT 60,
  last_generated_through date,
  is_active             boolean           NOT NULL DEFAULT true,
  created_by            uuid              REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz       NOT NULL DEFAULT now(),
  updated_at            timestamptz       NOT NULL DEFAULT now(),
  version               integer           NOT NULL DEFAULT 1,
  CONSTRAINT fk_event_recurrence_rules__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_event_recurrence_rules__kind CHECK (category_kind = 'event'),
  CONSTRAINT ck_event_recurrence_rules__interval CHECK (interval_n BETWEEN 1 AND 12),
  CONSTRAINT ck_event_recurrence_rules__duration CHECK (duration_minutes BETWEEN 5 AND 1440),
  CONSTRAINT ck_event_recurrence_rules__horizon CHECK (generate_horizon_days BETWEEN 7 AND 180),
  CONSTRAINT ck_event_recurrence_rules__weekly CHECK (
    freq <> 'weekly' OR (by_weekday IS NOT NULL AND cardinality(by_weekday) BETWEEN 1 AND 7 AND by_weekday <@ ARRAY[1,2,3,4,5,6,7]::smallint[])),
  CONSTRAINT ck_event_recurrence_rules__monthly CHECK (
    freq <> 'monthly' OR
    ((by_monthday BETWEEN 1 AND 31 AND nth_weekday IS NULL)
     OR (by_monthday IS NULL AND nth_weekday IN (1, 2, 3, 4, -1) AND by_weekday IS NOT NULL AND cardinality(by_weekday) = 1 AND by_weekday <@ ARRAY[1,2,3,4,5,6,7]::smallint[]))),
  CONSTRAINT ck_event_recurrence_rules__until CHECK (until_date IS NULL OR until_date >= starts_on)
);
COMMENT ON TABLE event_recurrence_rules IS
  'Quy tắc sự kiện định kỳ (họp nhà tháng, Giờ Kinh Tối hằng ngày/tuần). Worker gọi app.fn_generate_recurring_events() để vật chất hóa các lần diễn ra vào bảng events trong horizon N ngày; sửa/hủy một lần = sửa/hủy dòng events tương ứng + event_recurrence_exceptions. by_weekday dùng ISO 1=Thứ Hai … 7=Chúa Nhật.';

CREATE TABLE events (
  id                         uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  title                      text            NOT NULL,
  category_id                uuid            NOT NULL,
  category_kind              category_kind_t NOT NULL DEFAULT 'event',
  status                     event_status_t  NOT NULL DEFAULT 'scheduled',
  starts_at                  timestamptz     NOT NULL,
  ends_at                    timestamptz     NOT NULL,
  location_room_id           uuid            REFERENCES rooms(id) ON DELETE SET NULL,
  location_text              text,
  organizer_text             text,
  description                text,
  requires_attendance        boolean         NOT NULL DEFAULT false,
  attendance_open_minutes    smallint,
  late_grace_minutes         smallint,
  expected_scope             text            NOT NULL DEFAULT 'all',
  recurrence_rule_id         uuid            REFERENCES event_recurrence_rules(id) ON DELETE SET NULL,
  occurrence_date            date,
  cancel_reason              text,
  created_by                 uuid            REFERENCES users(id) ON DELETE SET NULL,
  created_at                 timestamptz     NOT NULL DEFAULT now(),
  updated_at                 timestamptz     NOT NULL DEFAULT now(),
  version                    integer         NOT NULL DEFAULT 1,
  deleted_at                 timestamptz,
  CONSTRAINT fk_events__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_events__category_kind CHECK (category_kind = 'event'),
  CONSTRAINT ck_events__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_events__time CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '14 days'),
  CONSTRAINT ck_events__scope CHECK (expected_scope IN ('all', 'invitees')),
  CONSTRAINT ck_events__cancel CHECK (status <> 'cancelled' OR app.has_text(cancel_reason, 3)),
  CONSTRAINT ck_events__open CHECK (attendance_open_minutes IS NULL OR attendance_open_minutes BETWEEN 0 AND 720),
  CONSTRAINT ck_events__grace CHECK (late_grace_minutes IS NULL OR late_grace_minutes BETWEEN 0 AND 120),
  CONSTRAINT ck_events__occurrence CHECK ((recurrence_rule_id IS NULL) = (occurrence_date IS NULL))
);
COMMENT ON TABLE events IS
  'Sự kiện/hoạt động (FE CalendarEvent). starts_at/ends_at là timestamptz (giờ VN khi hiển thị). requires_attendance bật điểm danh. attendance_open_minutes/late_grace_minutes NULL ⇒ dùng settings event.attendance.open_minutes_before / event.attendance.late_grace_minutes. expected_scope: all=mọi thành viên đang ở, invitees=chỉ danh sách event_participants.';

CREATE TABLE event_recurrence_exceptions (
  rule_id          uuid        NOT NULL REFERENCES event_recurrence_rules(id) ON DELETE CASCADE,
  occurrence_date  date        NOT NULL,
  reason           text,
  created_by       uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, occurrence_date)
);
COMMENT ON TABLE event_recurrence_exceptions IS 'Các ngày bỏ qua của quy tắc định kỳ (lễ, nghỉ) để worker không sinh lại.';

CREATE TABLE event_organizers (
  event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role_label  text        NOT NULL DEFAULT 'member',
  PRIMARY KEY (event_id, member_id),
  CONSTRAINT ck_event_organizers__role CHECK (role_label IN ('lead', 'member'))
);
COMMENT ON TABLE event_organizers IS 'Ban tổ chức có cấu trúc (người chủ trì/thành viên); events.organizer_text vẫn giữ tên ban hiển thị. Người trong bảng này được quyền điểm danh sự kiện của mình (BR-EVT-02).';

CREATE TABLE event_participants (
  event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  is_invited  boolean     NOT NULL DEFAULT true,
  rsvp        text        NOT NULL DEFAULT 'none',
  rsvp_at     timestamptz,
  PRIMARY KEY (event_id, member_id),
  CONSTRAINT ck_event_participants__rsvp CHECK (rsvp IN ('none', 'going', 'maybe', 'not_going'))
);
COMMENT ON TABLE event_participants IS 'Danh sách mời (khi expected_scope=invitees) và phản hồi tham dự (RSVP). FE hiển thị "Tham dự" mặc định cho mọi sự kiện; DB mặc định none (chưa trả lời).';

CREATE TABLE qr_sessions (
  id                 uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  event_id           uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  secret             bytea       NOT NULL DEFAULT gen_random_bytes(32),
  rotation_seconds   smallint    NOT NULL DEFAULT 45,
  opens_at           timestamptz NOT NULL DEFAULT now(),
  closes_at          timestamptz NOT NULL,
  geofence_lat       numeric(9,6),
  geofence_lng       numeric(9,6),
  geofence_radius_m  integer,
  require_geofence   boolean     NOT NULL DEFAULT false,
  status             text        NOT NULL DEFAULT 'active',
  created_by         uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz,
  CONSTRAINT ck_qr_sessions__rotation CHECK (rotation_seconds BETWEEN 15 AND 120),
  CONSTRAINT ck_qr_sessions__window CHECK (closes_at > opens_at AND closes_at - opens_at <= interval '24 hours'),
  CONSTRAINT ck_qr_sessions__status CHECK (status IN ('active', 'closed')),
  CONSTRAINT ck_qr_sessions__geo CHECK (
    (geofence_lat IS NULL) = (geofence_lng IS NULL)
    AND (NOT require_geofence OR (geofence_lat IS NOT NULL AND geofence_radius_m IS NOT NULL))
    AND (geofence_lat IS NULL OR (geofence_lat BETWEEN -90 AND 90 AND geofence_lng BETWEEN -180 AND 180))
    AND (geofence_radius_m IS NULL OR geofence_radius_m BETWEEN 20 AND 5000)),
  CONSTRAINT ck_qr_sessions__secret CHECK (octet_length(secret) = 32)
);
COMMENT ON TABLE qr_sessions IS
  'Phiên điểm danh QR của một sự kiện. Mã QR hiển thị là token ngắn hạn <session_id>.<slot>.<HMAC-SHA256(secret)> với slot = floor(epoch/rotation_seconds) — đổi mỗi 15–120 giây (mặc định 45), chống chụp màn hình gửi người khác. secret CHỈ đọc được qua các hàm SECURITY DEFINER app.fn_qr_token()/app.fn_checkin_by_qr(); luuxa_app không có quyền SELECT cột secret. Tối đa một phiên active mỗi sự kiện (index).';

CREATE TABLE attendance_records (
  id               uuid                PRIMARY KEY DEFAULT app.uuid_v7(),
  event_id         uuid                NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  member_id        uuid                NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status           attendance_status_t NOT NULL,
  method           attendance_method_t NOT NULL,
  checked_in_at    timestamptz,
  recorded_by      uuid                REFERENCES users(id) ON DELETE SET NULL,
  qr_session_id    uuid                REFERENCES qr_sessions(id) ON DELETE SET NULL,
  leave_request_id uuid,
  distance_m       integer,
  device_hash      text,
  note             text,
  created_at       timestamptz         NOT NULL DEFAULT now(),
  updated_at       timestamptz         NOT NULL DEFAULT now(),
  version          integer             NOT NULL DEFAULT 1,
  CONSTRAINT ux_attendance_records__event_member UNIQUE (event_id, member_id),
  CONSTRAINT ck_attendance_records__checked_in CHECK (status NOT IN ('present', 'late') OR checked_in_at IS NOT NULL),
  CONSTRAINT ck_attendance_records__excused CHECK (status <> 'excused' OR leave_request_id IS NOT NULL),
  CONSTRAINT ck_attendance_records__manual CHECK (method NOT IN ('manual', 'import') OR recorded_by IS NOT NULL),
  CONSTRAINT ck_attendance_records__distance CHECK (distance_m IS NULL OR distance_m >= 0)
);
COMMENT ON TABLE attendance_records IS
  'Điểm danh (UNIQUE theo (event, member): điểm danh lại là cập nhật, không nhân đôi — khác FE ghi đè giờ). Thời điểm là giờ máy chủ. late/present do trigger tính theo late_grace_minutes. absent/excused do hàm đóng điểm danh sinh cho người chưa điểm danh. Nếu bảng phình to có thể phân vùng theo tháng của sự kiện (hiện chưa cần: 500 thành viên × ~4 sự kiện/tuần ≈ 100.000 dòng/năm).';

CREATE TABLE leave_requests (
  id                 uuid           PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id          uuid           NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  kind               leave_kind_t   NOT NULL,
  event_id           uuid           REFERENCES events(id) ON DELETE SET NULL,
  starts_at          timestamptz    NOT NULL,
  ends_at            timestamptz    NOT NULL,
  reason             text           NOT NULL,
  destination        text,
  contact_phone_e164 text,
  status             leave_status_t NOT NULL DEFAULT 'pending',
  decided_by         uuid           REFERENCES users(id) ON DELETE SET NULL,
  decided_at         timestamptz,
  decision_note      text,
  client_request_id  uuid,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  updated_at         timestamptz    NOT NULL DEFAULT now(),
  version            integer        NOT NULL DEFAULT 1,
  CONSTRAINT ck_leave_requests__range CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '120 days'),
  CONSTRAINT ck_leave_requests__reason CHECK (app.has_text(reason, 5)),
  CONSTRAINT ck_leave_requests__event CHECK (kind <> 'event_absence' OR event_id IS NOT NULL),
  CONSTRAINT ck_leave_requests__destination CHECK (kind NOT IN ('overnight_out', 'long_leave') OR destination IS NOT NULL),
  CONSTRAINT ck_leave_requests__phone CHECK (app.is_e164(contact_phone_e164)),
  CONSTRAINT ck_leave_requests__decided CHECK ((status IN ('approved', 'rejected')) = (decided_at IS NOT NULL AND decided_by IS NOT NULL)),
  CONSTRAINT ck_leave_requests__reject_note CHECK (status <> 'rejected' OR app.has_text(decision_note, 5))
);
COMMENT ON TABLE leave_requests IS 'Đơn xin phép: vắng sự kiện, về muộn quá giờ giới nghiêm, ngủ ngoài, tạm vắng dài. Đơn được duyệt ⇒ điểm danh vắng thành excused và không bị trừ điểm; đồng thời là cơ sở để không xếp trực trùng (trigger duty_assignment_members). Ban điều hành duyệt (không tự duyệt đơn của chính mình).';

CREATE TABLE polls (
  id                    uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  event_id              uuid          REFERENCES events(id) ON DELETE SET NULL,
  question              text          NOT NULL,
  description           text,
  is_multi_select       boolean       NOT NULL DEFAULT false,
  max_choices           smallint      NOT NULL DEFAULT 1,
  is_anonymous          boolean       NOT NULL DEFAULT false,
  status                poll_status_t NOT NULL DEFAULT 'open',
  opens_at              timestamptz   NOT NULL DEFAULT now(),
  closes_at             timestamptz,
  created_by            uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  version               integer       NOT NULL DEFAULT 1,
  CONSTRAINT ck_polls__question CHECK (char_length(btrim(question)) BETWEEN 5 AND 300),
  CONSTRAINT ck_polls__choices CHECK (max_choices >= 1 AND (is_multi_select OR max_choices = 1)),
  CONSTRAINT ck_polls__window CHECK (closes_at IS NULL OR closes_at > opens_at)
);
COMMENT ON TABLE polls IS 'Khảo sát/biểu quyết. Khác FE: có thể độc lập hoặc gắn sự kiện, nhiều poll/sự kiện (FE ghi đè poll cũ và xóa sạch phiếu), đơn/đa lựa chọn, đóng/hạn chót, ẩn danh (is_anonymous ⇒ không API/RLS nào để lộ người bỏ phiếu cho người khác).';

CREATE TABLE poll_options (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  poll_id     uuid        NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  sort_order  smallint    NOT NULL DEFAULT 0,
  CONSTRAINT ux_poll_options__id_poll UNIQUE (id, poll_id),
  CONSTRAINT ux_poll_options__poll_order UNIQUE (poll_id, sort_order),
  CONSTRAINT ck_poll_options__label CHECK (char_length(btrim(label)) BETWEEN 1 AND 200)
);
COMMENT ON TABLE poll_options IS 'Phương án của poll; khóa phụ (id, poll_id) để poll_votes bảo đảm phương án thuộc đúng poll.';

CREATE TABLE poll_votes (
  poll_id     uuid        NOT NULL,
  option_id   uuid        NOT NULL,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  voted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, option_id, member_id),
  CONSTRAINT fk_poll_votes__option FOREIGN KEY (option_id, poll_id) REFERENCES poll_options (id, poll_id) ON DELETE CASCADE
);
COMMENT ON TABLE poll_votes IS 'Phiếu bầu: một thành viên có thể chọn tối đa polls.max_choices phương án (trigger), chỉ khi poll đang mở (trigger). Đổi lựa chọn bằng app.fn_cast_vote() (thay toàn bộ lựa chọn trong một transaction). Poll ẩn danh: RLS chỉ cho chính chủ thấy dòng của mình; kết quả tổng hợp qua app.fn_poll_results().';

-- ---------------------------------------------------------------------
-- Phụng vụ: lịch phụng vụ (ngày lễ), vai trò phục vụ, phân công, suy niệm Lời Chúa
-- (FE hiện cài cứng toàn bộ trong JSX; bảng dưới đây thay thế cho dữ liệu cứng đó)
-- ---------------------------------------------------------------------
CREATE TABLE liturgical_days (
  day_date        date        PRIMARY KEY,
  title           text        NOT NULL,
  rank_label      text,
  color           text,
  is_abstinence   boolean     NOT NULL DEFAULT false,
  note            text,
  CONSTRAINT ck_liturgical_days__color CHECK (color IS NULL OR color IN ('white', 'red', 'green', 'violet', 'rose', 'black'))
);
COMMENT ON TABLE liturgical_days IS 'Lịch Phụng vụ Công giáo theo ngày (lễ nhớ, lễ kính, ngày kiêng thịt/ăn chay, màu áo lễ). Nhập mỗi năm từ lịch Hội đồng Giám mục. Thay cho các dòng "Thánh Têrêsa Hài Đồng Giêsu", "Ngày kiêng thịt / Đền tội" cài cứng ở FE.';

CREATE TABLE liturgy_role_types (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code        text        NOT NULL,
  name_vi     text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  CONSTRAINT ux_liturgy_role_types__code UNIQUE (code),
  CONSTRAINT ck_liturgy_role_types__code CHECK (code ~ '^[a-z][a-z0-9_]*$')
);
COMMENT ON TABLE liturgy_role_types IS 'Vai trò phục vụ phụng vụ: chủ sự, đọc sách thánh, giúp lễ, ca đoàn, đàn organ, âm thanh…';

CREATE TABLE liturgy_assignments (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  event_id      uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role_type_id  uuid        NOT NULL REFERENCES liturgy_role_types(id) ON DELETE RESTRICT,
  member_id     uuid        NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status        text        NOT NULL DEFAULT 'assigned',
  note          text,
  assigned_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_liturgy_assignments__slot UNIQUE (event_id, role_type_id, member_id),
  CONSTRAINT ck_liturgy_assignments__status CHECK (status IN ('assigned', 'confirmed', 'declined', 'served'))
);
COMMENT ON TABLE liturgy_assignments IS 'Phân công phục vụ phụng vụ cho từng buổi (đọc sách thánh/giúp lễ/hát…). Người được phân công xác nhận hoặc từ chối; từ chối ⇒ thông báo Trưởng ban Phụng vụ.';

CREATE TABLE reflections (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  author_member_id uuid     NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scripture_ref text,
  quote         text,
  body          text        NOT NULL,
  week_of       date,
  status        text        NOT NULL DEFAULT 'published',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT ck_reflections__status CHECK (status IN ('draft', 'published', 'hidden')),
  CONSTRAINT ck_reflections__body CHECK (char_length(btrim(body)) BETWEEN 10 AND 5000)
);
COMMENT ON TABLE reflections IS 'Góc chia sẻ Lời Chúa/suy niệm hằng tuần (FE: khối "Suy niệm từ Anh Minh Tuấn" cài cứng).';
