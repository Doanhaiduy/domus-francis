-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (3/9): CẤU TRÚC NHÀ, PHÒNG, PHÂN PHÒNG
-- FE hiện chỉ ghi đè Member.room (chuỗi) => DB bổ sung: lịch sử phân phòng theo thời gian,
-- chặn trùng (exclusion constraint), kiểm tra sức chứa/trạng thái/giới tính bằng trigger.
-- =====================================================================

CREATE TABLE floors (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code          text        NOT NULL,
  name          text        NOT NULL,
  level         smallint    NOT NULL,
  description   text,
  canvas_width  integer     NOT NULL DEFAULT 680,
  canvas_height integer     NOT NULL DEFAULT 420,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer     NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  CONSTRAINT ck_floors__code   CHECK (code ~ '^[A-Z0-9_]{1,10}$'),
  CONSTRAINT ck_floors__level  CHECK (level BETWEEN -2 AND 50),
  CONSTRAINT ck_floors__canvas CHECK (canvas_width BETWEEN 200 AND 5000 AND canvas_height BETWEEN 200 AND 5000)
);
COMMENT ON TABLE floors IS 'Tầng (T1, T2, T3…). canvas_* là kích thước khung sơ đồ (FE: viewBox 680×420 của FloorplanCanvas.tsx ở commit 740ac5d). Xóa mềm; không xóa được tầng còn phòng (rooms.floor_id ON DELETE RESTRICT).';

CREATE TABLE rooms (
  id            uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  floor_id      uuid          NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  code          text          NOT NULL,
  name          text          NOT NULL,
  room_type     room_type_t   NOT NULL,
  capacity      smallint      NOT NULL DEFAULT 0,
  status        room_status_t NOT NULL DEFAULT 'active',
  gender_policy gender_t,
  area_m2       numeric(6,2),
  description   text,
  layout_x      integer,
  layout_y      integer,
  layout_w      integer,
  layout_h      integer,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  version       integer       NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  CONSTRAINT ck_rooms__code     CHECK (code ~ '^P\.[A-Z0-9_]{1,10}$'),
  CONSTRAINT ck_rooms__capacity CHECK (capacity >= 0 AND capacity <= 20),
  CONSTRAINT ck_rooms__bed_only CHECK ((room_type = 'bedroom') = (capacity > 0)),
  CONSTRAINT ck_rooms__area     CHECK (area_m2 IS NULL OR area_m2 > 0),
  CONSTRAINT ck_rooms__layout   CHECK (
    (layout_x IS NULL AND layout_y IS NULL AND layout_w IS NULL AND layout_h IS NULL)
    OR (layout_x >= 0 AND layout_y >= 0 AND layout_w > 0 AND layout_h > 0))
);
COMMENT ON TABLE rooms IS
  'Phòng/khu vực trong nhà (FE Room: id "P.1", "P.SANH1", "P.WC_P2" => code, dạng P. cộng 1–10 ký tự chữ in hoa, số hoặc gạch dưới). capacity > 0 chỉ với phòng ngủ. gender_policy NULL = không giới hạn giới tính [ĐỀ XUẤT]. layout_x/y/w/h = tọa độ canvas. floor_id ON DELETE RESTRICT: không xóa tầng còn phòng. Xóa mềm để giữ lịch sử phân phòng.';

CREATE TABLE amenities (
  id         uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code       text        NOT NULL,
  name       text        NOT NULL,
  icon_name  text,
  is_active  boolean     NOT NULL DEFAULT true,
  CONSTRAINT ux_amenities__code UNIQUE (code),
  CONSTRAINT ck_amenities__code CHECK (code ~ '^[a-z][a-z0-9_]*$')
);
COMMENT ON TABLE amenities IS 'Danh mục tiện ích phòng (điều hòa, WC khép kín, bàn học…) để lọc/tìm kiếm; thay cho chuỗi tự do Room.amenities.';

CREATE TABLE room_amenities (
  room_id     uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  amenity_id  uuid        NOT NULL REFERENCES amenities(id) ON DELETE RESTRICT,
  quantity    smallint    NOT NULL DEFAULT 1,
  note        text,
  PRIMARY KEY (room_id, amenity_id),
  CONSTRAINT ck_room_amenities__quantity CHECK (quantity BETWEEN 1 AND 100)
);
COMMENT ON TABLE room_amenities IS 'Tiện ích của từng phòng (N–N). note giữ chi tiết như "Electrolux", "16 chỗ". ON DELETE CASCADE theo rooms.';

CREATE TABLE room_assignments (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id        uuid        NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  room_id          uuid        NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  academic_year_id uuid        REFERENCES academic_years(id) ON DELETE SET NULL,
  bed_label        text,
  starts_on        date        NOT NULL,
  ends_on          date,
  reason           text,
  end_reason       text,
  assigned_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  ended_by         uuid        REFERENCES users(id) ON DELETE SET NULL,
  client_request_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_room_assignments__range CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT ck_room_assignments__ended_by CHECK (ended_by IS NULL OR ends_on IS NOT NULL),
  CONSTRAINT ck_room_assignments__bed CHECK (bed_label IS NULL OR bed_label ~ '^G[0-9]{1,2}$'),
  CONSTRAINT ex_room_assignments__member_one_room EXCLUDE USING gist (
    member_id WITH =,
    daterange(starts_on, COALESCE(ends_on, 'infinity'::date), '[]') WITH &&),
  CONSTRAINT ex_room_assignments__bed_one_person EXCLUDE USING gist (
    room_id WITH =, bed_label WITH =,
    daterange(starts_on, COALESCE(ends_on, 'infinity'::date), '[]') WITH &&
  ) WHERE (bed_label IS NOT NULL)
);
COMMENT ON TABLE room_assignments IS
  'Lịch sử phân/chuyển phòng theo thời gian (khoảng ngày đóng [starts_on, ends_on]; ends_on NULL = đang ở). Exclusion constraint: một thành viên chỉ ở một phòng tại mỗi thời điểm; một giường chỉ một người. Sức chứa/trạng thái phòng/giới tính kiểm tra bằng trigger trg_room_assignments__rules. member_id/room_id ON DELETE RESTRICT để không mất lịch sử.';
