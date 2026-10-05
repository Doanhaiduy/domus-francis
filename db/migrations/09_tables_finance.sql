-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (6/9): TÀI CHÍNH — SỔ CÁI BẤT BIẾN, PHIẾU CHI, THU QUỸ, CHỐT SỔ, ĐỐI SOÁT
-- Nguyên tắc:
--   1. Số dư KHÔNG phải cột sửa tay: số dư = SUM(ledger_entries) theo từng túi quỹ (view v_fund_balances).
--   2. ledger_entries là append-only (trigger chặn UPDATE/DELETE); hủy/điều chỉnh = bút toán đảo.
--   3. Kỳ tài chính đã chốt bị khóa: không ghi thêm bút toán vào kỳ đó; sửa sai ghi ở kỳ đang mở.
--   4. Mọi số tiền BIGINT đơn vị VND (không dùng FLOAT/NUMERIC thập phân), CHECK > 0.
--   5. Chuỗi băm (prev_hash → row_hash) theo từng túi quỹ giúp phát hiện sửa dữ liệu ngoài trigger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.3.40  funds — túi quỹ (tiền mặt / ngân hàng / quỹ sự kiện / dự phòng)
-- ---------------------------------------------------------------------
CREATE TABLE funds (
  id                   uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  code                 text        NOT NULL,
  name                 text        NOT NULL,
  fund_type            fund_type_t NOT NULL,
  bank_name            text,
  bank_account_last4   text,
  account_holder_name  text,
  is_personal_account  boolean     NOT NULL DEFAULT false,
  event_id             uuid,
  allow_negative       boolean     NOT NULL DEFAULT false,
  last_seq             bigint      NOT NULL DEFAULT 0,
  head_hash            text        NOT NULL DEFAULT repeat('0', 64),
  is_active            boolean     NOT NULL DEFAULT true,
  description          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              integer     NOT NULL DEFAULT 1,
  deleted_at           timestamptz,
  CONSTRAINT ux_funds__code UNIQUE (code),
  CONSTRAINT ck_funds__code CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),
  CONSTRAINT ck_funds__bank CHECK (fund_type <> 'bank' OR (bank_name IS NOT NULL AND bank_account_last4 IS NOT NULL)),
  CONSTRAINT ck_funds__last4 CHECK (bank_account_last4 IS NULL OR bank_account_last4 ~ '^[0-9]{4}$'),
  CONSTRAINT ck_funds__event CHECK ((fund_type = 'event') = (event_id IS NOT NULL)),
  CONSTRAINT ck_funds__head_hash CHECK (app.is_hex(head_hash, 64)),
  CONSTRAINT ck_funds__seq CHECK (last_seq >= 0)
);
COMMENT ON TABLE funds IS
  'Túi quỹ. last_seq/head_hash là đầu chuỗi băm của sổ cái túi này (cập nhật bởi trigger ledger). is_personal_account=true đánh dấu tài khoản đứng tên cá nhân — rủi ro quản trị (FE hiện để STK Techcombank mang tên Trưởng nhà); hệ thống cảnh báo trên dashboard Trưởng nhà/Thủ quỹ. event_id: FK thêm ở khối FK trì hoãn.';

-- ---------------------------------------------------------------------
-- 4.3.41  financial_periods — kỳ tài chính theo tháng (chốt sổ hai người)
-- ---------------------------------------------------------------------
CREATE TABLE financial_periods (
  id               uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  period_month     date            NOT NULL,
  academic_year_id uuid            REFERENCES academic_years(id) ON DELETE SET NULL,
  status           period_status_t NOT NULL DEFAULT 'open',
  closed_by        uuid            REFERENCES users(id) ON DELETE RESTRICT,
  closed_at        timestamptz,
  confirmed_by     uuid            REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at     timestamptz,
  closing_note     text,
  reopen_count     smallint        NOT NULL DEFAULT 0,
  reopened_by      uuid            REFERENCES users(id) ON DELETE RESTRICT,
  reopened_at      timestamptz,
  reopen_reason    text,
  created_at       timestamptz     NOT NULL DEFAULT now(),
  updated_at       timestamptz     NOT NULL DEFAULT now(),
  version          integer         NOT NULL DEFAULT 1,
  CONSTRAINT ux_financial_periods__month UNIQUE (period_month),
  CONSTRAINT ck_financial_periods__month_start CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT ck_financial_periods__pending CHECK (status = 'open' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL)),
  CONSTRAINT ck_financial_periods__two_person CHECK (
    status <> 'closed'
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by <> closed_by)),
  CONSTRAINT ck_financial_periods__reopen CHECK ((reopened_at IS NULL) = (reopen_reason IS NULL)),
  CONSTRAINT ck_financial_periods__reopen_reason CHECK (reopen_reason IS NULL OR app.has_text(reopen_reason, 10))
);
COMMENT ON TABLE financial_periods IS
  'Kỳ tài chính theo tháng (tạo tự động khi có bút toán đầu tiên). Chốt sổ cần HAI người khác nhau (CHECK ck_financial_periods__two_person: closed_by ≠ confirmed_by): Thủ quỹ chốt → Trưởng nhà xác nhận. Mở lại kỳ cần lý do ≥ 10 ký tự và được ghi audit. Kỳ khác open => trigger chặn ghi bút toán/sửa phiếu thuộc kỳ.';

CREATE TABLE period_fund_balances (
  period_id            uuid        NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  fund_id              uuid        NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  opening_balance_vnd  bigint      NOT NULL,
  total_in_vnd         bigint      NOT NULL,
  total_out_vnd        bigint      NOT NULL,
  closing_balance_vnd  bigint      NOT NULL,
  entry_count          integer     NOT NULL,
  head_hash            text        NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period_id, fund_id),
  CONSTRAINT ck_period_fund_balances__math CHECK (opening_balance_vnd + total_in_vnd - total_out_vnd = closing_balance_vnd),
  CONSTRAINT ck_period_fund_balances__nonneg CHECK (total_in_vnd >= 0 AND total_out_vnd >= 0 AND entry_count >= 0),
  CONSTRAINT ck_period_fund_balances__hash CHECK (app.is_hex(head_hash, 64))
);
COMMENT ON TABLE period_fund_balances IS
  'Ảnh chụp số dư từng túi quỹ khi chốt kỳ: đầu kỳ + thu − chi = cuối kỳ (CHECK). Số dư đầu kỳ sau = cuối kỳ trước (kiểm tra bởi hàm chốt kỳ). head_hash in trên báo cáo tháng để đối chiếu sau này.';

-- ---------------------------------------------------------------------
-- 4.3.42  ledger_entries — sổ cái bất biến
-- ---------------------------------------------------------------------
CREATE TABLE ledger_entries (
  id                       uuid               PRIMARY KEY DEFAULT app.uuid_v7(),
  fund_id                  uuid               NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  fund_seq                 bigint             NOT NULL,
  period_id                uuid               NOT NULL REFERENCES financial_periods(id) ON DELETE RESTRICT,
  entry_date               date               NOT NULL,
  posted_at                timestamptz        NOT NULL DEFAULT now(),
  direction                ledger_direction_t NOT NULL,
  amount_vnd               bigint             NOT NULL,
  source_type              ledger_source_t    NOT NULL,
  source_id                uuid,
  reversal_of_id           uuid               REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  transfer_group_id        uuid,
  counterparty_member_id   uuid               REFERENCES members(id) ON DELETE RESTRICT,
  description              text               NOT NULL,
  created_by               uuid               REFERENCES users(id) ON DELETE RESTRICT,
  client_request_id        uuid,
  prev_hash                text               NOT NULL,
  row_hash                 text               NOT NULL,
  CONSTRAINT ux_ledger_entries__fund_seq UNIQUE (fund_id, fund_seq),
  CONSTRAINT ck_ledger_entries__amount CHECK (amount_vnd > 0),
  CONSTRAINT ck_ledger_entries__desc CHECK (char_length(btrim(description)) BETWEEN 3 AND 500),
  CONSTRAINT ck_ledger_entries__reversal CHECK ((source_type = 'reversal') = (reversal_of_id IS NOT NULL)),
  CONSTRAINT ck_ledger_entries__transfer CHECK ((source_type = 'transfer') = (transfer_group_id IS NOT NULL)),
  CONSTRAINT ck_ledger_entries__source_ref CHECK (
    source_type IN ('transfer', 'opening_balance', 'adjustment', 'reversal', 'donation') OR source_id IS NOT NULL),
  CONSTRAINT ck_ledger_entries__hashes CHECK (app.is_hex(prev_hash, 64) AND app.is_hex(row_hash, 64))
);
COMMENT ON TABLE ledger_entries IS
  'SỔ CÁI BẤT BIẾN (append-only): mỗi dòng một bút toán thu/chi của một túi quỹ. Không UPDATE/DELETE (trigger trg_ledger_entries__immutable); sai sót được sửa bằng bút toán đảo (source_type=reversal, reversal_of_id). Mọi FK là RESTRICT vì SET NULL/CASCADE sẽ phá tính bất biến. Chuyển quỹ = hai dòng cùng transfer_group_id.';
COMMENT ON COLUMN ledger_entries.entry_date IS 'Ngày hạch toán theo giờ Việt Nam; xác định kỳ tài chính (period_id).';
COMMENT ON COLUMN ledger_entries.row_hash IS 'SHA-256 của (prev_hash | fund_id | fund_seq | entry_date | direction | amount_vnd | source_type | source_id | description). Tính bởi trigger trg_ledger_entries__chain.';

-- ---------------------------------------------------------------------
-- 4.3.43  expense_vouchers — phiếu chi (máy trạng thái: draft → pending_approval → approved → paid)
-- ---------------------------------------------------------------------
CREATE SEQUENCE expense_voucher_seq;

CREATE TABLE expense_vouchers (
  id                     uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  voucher_no             text             NOT NULL,
  title                  text             NOT NULL,
  amount_vnd             bigint           NOT NULL,
  category_id            uuid             NOT NULL,
  category_kind          category_kind_t  NOT NULL DEFAULT 'expense',
  expense_date           date             NOT NULL,
  fund_id                uuid             NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  paid_by_member_id      uuid             REFERENCES members(id) ON DELETE RESTRICT,
  payee_name             text,
  invoice_no             text,
  payment_method         payment_method_t,
  status                 expense_status_t NOT NULL DEFAULT 'draft',
  note                   text,
  no_receipt_reason      text,
  requested_by           uuid             NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  required_approvals     smallint         NOT NULL DEFAULT 1,
  approval_round         smallint         NOT NULL DEFAULT 0,
  submitted_at           timestamptz,
  approved_at            timestamptz,
  rejected_at            timestamptz,
  rejection_reason       text,
  paid_at                timestamptz,
  paid_recorded_by       uuid             REFERENCES users(id) ON DELETE RESTRICT,
  ledger_entry_id        uuid             REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  reversal_entry_id      uuid             REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  cancelled_at           timestamptz,
  cancel_reason          text,
  maintenance_issue_id   uuid,
  event_id               uuid,
  client_request_id      uuid,
  created_at             timestamptz      NOT NULL DEFAULT now(),
  updated_at             timestamptz      NOT NULL DEFAULT now(),
  version                integer          NOT NULL DEFAULT 1,
  CONSTRAINT ux_expense_vouchers__no UNIQUE (voucher_no),
  CONSTRAINT fk_expense_vouchers__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_expense_vouchers__category_kind CHECK (category_kind = 'expense'),
  CONSTRAINT ck_expense_vouchers__amount CHECK (amount_vnd > 0 AND amount_vnd <= 1000000000),
  CONSTRAINT ck_expense_vouchers__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_expense_vouchers__required_approvals CHECK (required_approvals IN (1, 2)),
  CONSTRAINT ck_expense_vouchers__submitted CHECK (status IN ('draft', 'cancelled') OR submitted_at IS NOT NULL),
  CONSTRAINT ck_expense_vouchers__approved CHECK (status NOT IN ('approved', 'paid', 'reversed') OR approved_at IS NOT NULL),
  CONSTRAINT ck_expense_vouchers__rejected CHECK (status <> 'rejected' OR (rejected_at IS NOT NULL AND app.has_text(rejection_reason, 5))),
  CONSTRAINT ck_expense_vouchers__paid CHECK (
    status NOT IN ('paid', 'reversed')
    OR (paid_at IS NOT NULL AND paid_recorded_by IS NOT NULL AND ledger_entry_id IS NOT NULL AND payment_method IS NOT NULL)),
  CONSTRAINT ck_expense_vouchers__reversed CHECK ((status = 'reversed') = (reversal_entry_id IS NOT NULL)),
  CONSTRAINT ck_expense_vouchers__cancelled CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND app.has_text(cancel_reason, 3))),
  CONSTRAINT ck_expense_vouchers__no_receipt CHECK (no_receipt_reason IS NULL OR app.has_text(no_receipt_reason, 5))
);
COMMENT ON TABLE expense_vouchers IS
  'Phiếu chi. Khác FE: có người tạo (requested_by), người ứng/chi (paid_by_member_id), túi quỹ, ngày chi do người dùng chọn, số phiếu (voucher_no), liên kết sự cố/sự kiện, bằng chứng (media_attachments, purpose=receipt). Phiếu KHÔNG bị xóa: hủy (cancelled) hoặc đảo (reversed). Trạng thái chuyển theo máy trạng thái ở trigger trg_expense_vouchers__state_machine; số chữ ký cần có (required_approvals) được đóng băng khi nộp theo ngưỡng cấu hình.';
COMMENT ON COLUMN expense_vouchers.paid_by_member_id IS 'Thành viên đã ứng tiền/chi trực tiếp (FE: paidBy). NULL nếu quỹ chi thẳng cho nhà cung cấp.';
COMMENT ON COLUMN expense_vouchers.category_kind IS 'Cột hằng (luôn expense) để FK phức hợp (category_id, category_kind) bảo đảm danh mục đúng loại.';
COMMENT ON COLUMN expense_vouchers.ledger_entry_id IS 'Bút toán chi (direction=out) tạo khi chuyển sang paid. reversal_entry_id = bút toán đảo khi reversed.';

CREATE TABLE expense_approvals (
  id               uuid                PRIMARY KEY DEFAULT app.uuid_v7(),
  voucher_id       uuid                NOT NULL REFERENCES expense_vouchers(id) ON DELETE RESTRICT,
  round            smallint            NOT NULL,
  approver_user_id uuid                NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approver_role    text                NOT NULL,
  decision         approval_decision_t NOT NULL,
  comment          text,
  decided_at       timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT ux_expense_approvals__voucher_round_approver UNIQUE (voucher_id, round, approver_user_id),
  CONSTRAINT ck_expense_approvals__role CHECK (approver_role IN ('house_head', 'treasurer', 'vice_head')),
  CONSTRAINT ck_expense_approvals__reject_comment CHECK (decision <> 'rejected' OR app.has_text(comment, 5))
);
COMMENT ON TABLE expense_approvals IS
  'Chữ ký duyệt chi theo từng vòng duyệt (round tăng mỗi lần nộp/nộp lại). Trigger trg_expense_approvals__rules chặn: người duyệt = người tạo hoặc người ứng tiền; không có quyền finance.expense.approve; phiếu ngoài trạng thái pending_approval; chữ ký đơn chỉ do house_head/treasurer; phiếu cần 2 chữ ký phải do hai người khác nhau, khác vai trò, trong đó có Trưởng nhà (vice_head chỉ được là chữ ký thứ hai). Bất biến (không sửa/xóa).';

CREATE TABLE expense_status_history (
  id           uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  voucher_id   uuid             NOT NULL REFERENCES expense_vouchers(id) ON DELETE RESTRICT,
  from_status  expense_status_t,
  to_status    expense_status_t NOT NULL,
  changed_by   uuid             REFERENCES users(id) ON DELETE RESTRICT,
  changed_at   timestamptz      NOT NULL DEFAULT now(),
  reason       text,
  CONSTRAINT ck_expense_status_history__change CHECK (from_status IS DISTINCT FROM to_status)
);
COMMENT ON TABLE expense_status_history IS 'Lịch sử chuyển trạng thái phiếu chi (ghi tự động bởi trigger, bất biến).';

-- ---------------------------------------------------------------------
-- 4.3.44  Thu quỹ: kế hoạch thu → khoản phải thu từng thành viên → phiếu thu → phân bổ
-- ---------------------------------------------------------------------
CREATE TABLE contribution_plans (
  id               uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  code             text          NOT NULL,
  name             text          NOT NULL,
  fee_type         fee_type_t    NOT NULL DEFAULT 'monthly_dues',
  academic_year_id uuid          REFERENCES academic_years(id) ON DELETE SET NULL,
  period_month     date,
  amount_vnd       bigint        NOT NULL,
  due_date         date          NOT NULL,
  fund_id          uuid          NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  event_id         uuid,
  status           plan_status_t NOT NULL DEFAULT 'draft',
  generated_at     timestamptz,
  created_by       uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  version          integer       NOT NULL DEFAULT 1,
  CONSTRAINT ux_contribution_plans__code UNIQUE (code),
  CONSTRAINT ck_contribution_plans__amount CHECK (amount_vnd > 0),
  CONSTRAINT ck_contribution_plans__month CHECK (period_month IS NULL OR period_month = date_trunc('month', period_month)::date),
  CONSTRAINT ck_contribution_plans__monthly CHECK (fee_type <> 'monthly_dues' OR period_month IS NOT NULL),
  CONSTRAINT ck_contribution_plans__code CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$')
);
COMMENT ON TABLE contribution_plans IS
  'Kế hoạch thu quỹ (quỹ sinh hoạt tháng, phí sự kiện, quyên góp…). amount_vnd lấy từ settings finance.monthly_dues_vnd khi sinh kế hoạch tháng — KHÔNG hard-code 350.000. Mỗi kế hoạch tháng duy nhất theo (fee_type, period_month) — xem index.';

CREATE TABLE contributions (
  id                  uuid                  PRIMARY KEY DEFAULT app.uuid_v7(),
  plan_id             uuid                  NOT NULL REFERENCES contribution_plans(id) ON DELETE RESTRICT,
  member_id           uuid                  NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  amount_due_vnd      bigint                NOT NULL,
  discount_vnd        bigint                NOT NULL DEFAULT 0,
  discount_reason     text,
  discount_approved_by uuid                 REFERENCES users(id) ON DELETE RESTRICT,
  paid_vnd            bigint                NOT NULL DEFAULT 0,
  status              contribution_status_t NOT NULL DEFAULT 'unpaid',
  due_date            date                  NOT NULL,
  last_reminded_at    timestamptz,
  note                text,
  created_at          timestamptz           NOT NULL DEFAULT now(),
  updated_at          timestamptz           NOT NULL DEFAULT now(),
  version             integer               NOT NULL DEFAULT 1,
  CONSTRAINT ux_contributions__plan_member UNIQUE (plan_id, member_id),
  CONSTRAINT ck_contributions__amounts CHECK (amount_due_vnd >= 0 AND discount_vnd >= 0 AND paid_vnd >= 0),
  CONSTRAINT ck_contributions__discount_le_due CHECK (discount_vnd <= amount_due_vnd),
  CONSTRAINT ck_contributions__paid_le_net CHECK (paid_vnd <= amount_due_vnd - discount_vnd),
  CONSTRAINT ck_contributions__discount_reason CHECK (
    discount_vnd = 0 OR (app.has_text(discount_reason, 5) AND discount_approved_by IS NOT NULL))
);
COMMENT ON TABLE contributions IS
  'Khoản phải thu của một thành viên trong một kế hoạch (thay cho Contribution của FE; ma trận 12 tháng = các dòng này theo plan.period_month). paid_vnd và status là DẪN XUẤT từ phân bổ thanh toán, do trigger trg_contribution_allocations__rollup cập nhật — không sửa tay. Miễn/giảm cần lý do + người duyệt (CHECK). Không lưu tên/phòng (FE lưu bản sao gây lệch).';

CREATE TABLE contribution_payments (
  id                 uuid           PRIMARY KEY DEFAULT app.uuid_v7(),
  member_id          uuid           NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  fund_id            uuid           NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  amount_vnd         bigint         NOT NULL,
  method             payment_method_t NOT NULL,
  paid_on            date           NOT NULL,
  reference_code     text,
  received_by        uuid           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ledger_entry_id    uuid           REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  note               text,
  client_request_id  uuid,
  voided_at          timestamptz,
  voided_by          uuid           REFERENCES users(id) ON DELETE RESTRICT,
  void_reason        text,
  void_ledger_entry_id uuid         REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT ck_contribution_payments__amount CHECK (amount_vnd > 0),
  CONSTRAINT ck_contribution_payments__void CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL AND void_ledger_entry_id IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND app.has_text(void_reason, 5))),
  CONSTRAINT ck_contribution_payments__bank_ref CHECK (method <> 'bank_transfer' OR reference_code IS NOT NULL)
);
COMMENT ON TABLE contribution_payments IS
  'Phiếu thu (một lần thành viên nộp tiền; có thể phân bổ cho nhiều tháng = đóng gộp). Mỗi phiếu có đúng một bút toán thu ở sổ cái. Hủy phiếu = voided_* + bút toán đảo (không xóa). Chuyển khoản bắt buộc có mã tham chiếu giao dịch. client_request_id chống ghi trùng khi bấm đúp/retry.';

CREATE TABLE contribution_payment_allocations (
  payment_id       uuid   NOT NULL REFERENCES contribution_payments(id) ON DELETE RESTRICT,
  contribution_id  uuid   NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT,
  amount_vnd       bigint NOT NULL,
  PRIMARY KEY (payment_id, contribution_id),
  CONSTRAINT ck_contribution_allocations__amount CHECK (amount_vnd > 0)
);
COMMENT ON TABLE contribution_payment_allocations IS 'Phân bổ một phiếu thu cho một hoặc nhiều khoản phải thu (đóng gộp nhiều tháng, đóng một phần). Tổng phân bổ của phiếu = amount_vnd của phiếu (kiểm tra bằng constraint trigger trì hoãn).';

-- ---------------------------------------------------------------------
-- 4.3.45  Đối soát ngân hàng
-- ---------------------------------------------------------------------
CREATE TABLE bank_statement_lines (
  id                     uuid               PRIMARY KEY DEFAULT app.uuid_v7(),
  fund_id                uuid               NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  import_batch_id        uuid               NOT NULL,
  txn_date               date               NOT NULL,
  direction              ledger_direction_t NOT NULL,
  amount_vnd             bigint             NOT NULL,
  description            text,
  bank_reference         text,
  balance_after_vnd      bigint,
  match_status           recon_match_t      NOT NULL DEFAULT 'unmatched',
  matched_ledger_entry_id uuid              REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  matched_by             uuid               REFERENCES users(id) ON DELETE SET NULL,
  matched_at             timestamptz,
  ignore_reason          text,
  imported_by            uuid               REFERENCES users(id) ON DELETE SET NULL,
  imported_at            timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT ck_bank_statement_lines__amount CHECK (amount_vnd > 0),
  CONSTRAINT ck_bank_statement_lines__match CHECK (
    (match_status = 'matched' AND matched_ledger_entry_id IS NOT NULL AND matched_at IS NOT NULL)
    OR (match_status = 'ignored' AND app.has_text(ignore_reason, 5))
    OR (match_status = 'unmatched' AND matched_ledger_entry_id IS NULL))
);
COMMENT ON TABLE bank_statement_lines IS 'Dòng sao kê ngân hàng nhập từ CSV/Excel để đối soát với sổ cái (khớp theo số tiền + ngày + mã tham chiếu; AI chỉ gợi ý, Thủ quỹ xác nhận). Không bất biến (được cập nhật trạng thái khớp).';

CREATE TABLE period_reconciliations (
  id                       uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  period_id                uuid        NOT NULL REFERENCES financial_periods(id) ON DELETE RESTRICT,
  fund_id                  uuid        NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  statement_balance_vnd    bigint      NOT NULL,
  ledger_balance_vnd       bigint      NOT NULL,
  difference_vnd           bigint      GENERATED ALWAYS AS (statement_balance_vnd - ledger_balance_vnd) STORED,
  explanation              text,
  reconciled_by            uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reconciled_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_period_reconciliations__period_fund UNIQUE (period_id, fund_id),
  CONSTRAINT ck_period_reconciliations__explain CHECK (difference_vnd = 0 OR app.has_text(explanation, 10))
);
COMMENT ON TABLE period_reconciliations IS 'Biên bản đối soát cuối tháng của một túi quỹ: số dư sao kê so với số dư sổ cái; chênh lệch ≠ 0 bắt buộc có giải trình.';
