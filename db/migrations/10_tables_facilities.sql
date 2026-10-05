-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (7/9): CƠ SỞ VẬT CHẤT — TÀI SẢN, BÁO HỎNG (SLA), SỬA CHỮA, MƯỢN ĐỒ
-- FE chỉ có MaintenanceIssue phẳng (id LOG-xxx ngẫu nhiên, mức khẩn bị bỏ, assignee là chuỗi, cost không nối quỹ).
-- =====================================================================

CREATE TABLE vendors (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  name          text        NOT NULL,
  trade         text,
  phone_e164    text,
  address       text,
  note          text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT ck_vendors__name CHECK (char_length(btrim(name)) BETWEEN 2 AND 150),
  CONSTRAINT ck_vendors__phone CHECK (app.is_e164(phone_e164))
);
COMMENT ON TABLE vendors IS 'Danh bạ thợ/nhà cung cấp bên ngoài (điện nước, sửa máy giặt…). Số điện thoại là dữ liệu của bên thứ ba, chỉ Ban điều hành/phụ trách cơ sở vật chất xem.';

CREATE TABLE assets (
  id                 uuid           PRIMARY KEY DEFAULT app.uuid_v7(),
  asset_tag          text           NOT NULL,
  name               text           NOT NULL,
  asset_type         text           NOT NULL,
  room_id            uuid           REFERENCES rooms(id) ON DELETE SET NULL,
  location_text      text,
  status             asset_status_t NOT NULL DEFAULT 'in_service',
  purchase_date      date,
  purchase_cost_vnd  bigint,
  warranty_until     date,
  supplier           text,
  serial_no          text,
  is_loanable        boolean        NOT NULL DEFAULT false,
  notes              text,
  created_by         uuid           REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  updated_at         timestamptz    NOT NULL DEFAULT now(),
  version            integer        NOT NULL DEFAULT 1,
  deleted_at         timestamptz,
  CONSTRAINT ck_assets__tag  CHECK (asset_tag ~ '^[A-Z]{2,4}-[0-9]{3,6}$'),
  CONSTRAINT ck_assets__type CHECK (asset_type IN ('furniture', 'electrical', 'appliance', 'plumbing', 'audio_visual', 'tool', 'safety', 'kitchenware', 'other')),
  CONSTRAINT ck_assets__cost CHECK (purchase_cost_vnd IS NULL OR purchase_cost_vnd >= 0),
  CONSTRAINT ck_assets__warranty CHECK (warranty_until IS NULL OR purchase_date IS NULL OR warranty_until >= purchase_date)
);
COMMENT ON TABLE assets IS 'Sổ tài sản/thiết bị: mã (asset_tag), vị trí (room_id), ngày mua, giá mua, bảo hành, có cho mượn không (is_loanable — thay cho danh sách "Mượn đồ chung" cài cứng của FE). room_id SET NULL khi phòng bị xóa mềm.';

CREATE TABLE asset_maintenance_schedules (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  asset_id       uuid        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  task           text        NOT NULL,
  interval_days  smallint    NOT NULL,
  anchor_on      date        NOT NULL DEFAULT app.local_today(),
  next_due_on    date        GENERATED ALWAYS AS (anchor_on + interval_days) STORED,
  last_done_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_asset_maintenance_schedules__interval CHECK (interval_days BETWEEN 7 AND 1825),
  CONSTRAINT ck_asset_maintenance_schedules__task CHECK (char_length(btrim(task)) BETWEEN 3 AND 200)
);
COMMENT ON TABLE asset_maintenance_schedules IS 'Lịch bảo trì định kỳ (vệ sinh máy lạnh 6 tháng, kiểm tra bình cứu hỏa hằng năm…). Khi hoàn tất, cập nhật anchor_on = ngày làm; job nhắc khi next_due_on đến hạn.';

CREATE TABLE maintenance_issues (
  id                  uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  issue_no            bigint          GENERATED ALWAYS AS IDENTITY,
  title               text            NOT NULL,
  category_id         uuid,
  category_kind       category_kind_t DEFAULT 'maintenance',
  location_room_id    uuid            REFERENCES rooms(id) ON DELETE SET NULL,
  location_text       text,
  asset_id            uuid            REFERENCES assets(id) ON DELETE SET NULL,
  reporter_member_id  uuid            NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  description         text,
  urgency             urgency_t       NOT NULL DEFAULT 'medium',
  status              issue_status_t  NOT NULL DEFAULT 'new',
  duplicate_of_id     uuid            REFERENCES maintenance_issues(id) ON DELETE SET NULL,
  sla_due_at          timestamptz,
  accepted_at         timestamptz,
  resolved_at         timestamptz,
  verified_by         uuid            REFERENCES users(id) ON DELETE SET NULL,
  verified_at         timestamptz,
  client_request_id   uuid,
  created_at          timestamptz     NOT NULL DEFAULT now(),
  updated_at          timestamptz     NOT NULL DEFAULT now(),
  version             integer         NOT NULL DEFAULT 1,
  CONSTRAINT ux_maintenance_issues__issue_no UNIQUE (issue_no),
  CONSTRAINT fk_maintenance_issues__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_maintenance_issues__category_kind CHECK (category_kind = 'maintenance'),
  CONSTRAINT ck_maintenance_issues__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_maintenance_issues__location CHECK (location_room_id IS NOT NULL OR location_text IS NOT NULL),
  CONSTRAINT ck_maintenance_issues__duplicate CHECK ((status = 'duplicate') = (duplicate_of_id IS NOT NULL)),
  CONSTRAINT ck_maintenance_issues__not_self CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id),
  CONSTRAINT ck_maintenance_issues__resolved CHECK (status <> 'done' OR resolved_at IS NOT NULL),
  CONSTRAINT ck_maintenance_issues__verified CHECK ((verified_at IS NULL) = (verified_by IS NULL))
);
COMMENT ON TABLE maintenance_issues IS
  'Phiếu báo hỏng. Mã hiển thị LOG-000108 = ''LOG-'' || lpad(issue_no, 6, ''0'') (IDENTITY, không trùng như LOG-xxx ngẫu nhiên của FE). urgency được LƯU (FE thu thập rồi bỏ) và sinh sla_due_at theo settings facility.sla_hours.*. Ảnh hiện trường = media_attachments (maintenance_issue, before_photo). Chi phí = repair_costs. Người xử lý = issue_assignments.';
COMMENT ON COLUMN maintenance_issues.sla_due_at IS 'Hạn xử lý = created_at + giờ SLA theo mức khẩn (settings). Quá hạn mà chưa done ⇒ cảnh báo vi phạm SLA.';

CREATE TABLE issue_assignments (
  id                  uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  issue_id            uuid        NOT NULL REFERENCES maintenance_issues(id) ON DELETE CASCADE,
  assignee_member_id  uuid        REFERENCES members(id) ON DELETE RESTRICT,
  vendor_id           uuid        REFERENCES vendors(id) ON DELETE RESTRICT,
  role_label          text        NOT NULL DEFAULT 'lead',
  note                text,
  assigned_by         uuid        REFERENCES users(id) ON DELETE SET NULL,
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  unassigned_at       timestamptz,
  CONSTRAINT ck_issue_assignments__one_assignee CHECK (num_nonnulls(assignee_member_id, vendor_id) = 1),
  CONSTRAINT ck_issue_assignments__role CHECK (role_label IN ('lead', 'helper')),
  CONSTRAINT ck_issue_assignments__range CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);
COMMENT ON TABLE issue_assignments IS 'Người/thợ phụ trách một sự cố (nội bộ member_id hoặc thợ ngoài vendor_id — đúng một trong hai). Thay cho chuỗi tự do assignee ở FE (trộn người + tiến độ).';

CREATE TABLE issue_status_history (
  id           uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  issue_id     uuid        NOT NULL REFERENCES maintenance_issues(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text        NOT NULL,
  changed_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  reason       text
);
COMMENT ON TABLE issue_status_history IS 'Nhật ký chuyển trạng thái sự cố (bất biến) — nguồn tính thời gian xử lý trung bình (MTTR).';

CREATE TABLE repair_costs (
  id                  uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  issue_id            uuid        NOT NULL REFERENCES maintenance_issues(id) ON DELETE RESTRICT,
  cost_kind           text        NOT NULL,
  amount_vnd          bigint      NOT NULL,
  description         text        NOT NULL,
  vendor_id           uuid        REFERENCES vendors(id) ON DELETE SET NULL,
  expense_voucher_id  uuid        REFERENCES expense_vouchers(id) ON DELETE SET NULL,
  created_by          uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_repair_costs__kind CHECK (cost_kind IN ('estimate', 'actual')),
  CONSTRAINT ck_repair_costs__amount CHECK (amount_vnd > 0),
  CONSTRAINT ck_repair_costs__desc CHECK (app.has_text(description, 3)),
  CONSTRAINT ux_repair_costs__voucher UNIQUE (expense_voucher_id)
);
COMMENT ON TABLE repair_costs IS 'Dự toán (estimate) và chi phí thực (actual) của sự cố. FE nhầm "Dự toán vật tư" với chi phí thực. Dòng actual liên kết phiếu chi (expense_voucher_id) được tạo tự động khi phiếu chi gắn maintenance_issue_id chuyển sang paid (trigger) — nối vòng sửa chữa → đề xuất chi → sổ quỹ.';

CREATE TABLE asset_loans (
  id                    uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  asset_id              uuid          NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  borrower_member_id    uuid          NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status                loan_status_t NOT NULL DEFAULT 'open',
  borrowed_at           timestamptz   NOT NULL DEFAULT now(),
  due_at                timestamptz   NOT NULL,
  returned_at           timestamptz,
  checked_out_by        uuid          REFERENCES users(id) ON DELETE SET NULL,
  received_back_by      uuid          REFERENCES users(id) ON DELETE SET NULL,
  condition_note        text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_asset_loans__due CHECK (due_at > borrowed_at AND due_at - borrowed_at <= interval '30 days'),
  CONSTRAINT ck_asset_loans__returned CHECK ((status = 'returned') = (returned_at IS NOT NULL)),
  CONSTRAINT ex_asset_loans__one_borrower EXCLUDE USING gist (
    asset_id WITH =,
    tstzrange(borrowed_at, COALESCE(returned_at, 'infinity'::timestamptz)) WITH &&
  ) WHERE (status <> 'lost')
);
COMMENT ON TABLE asset_loans IS 'Mượn/trả đồ dùng chung (máy chiếu, máy khoan, thang nhôm, loa kéo). Exclusion constraint: một tài sản chỉ có một người đang mượn tại mỗi thời điểm. Thay cho mảng borrowItems ở state cục bộ của FE (mất khi tải lại trang).';
