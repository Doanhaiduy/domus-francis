-- =====================================================================
-- KHỐI 4.3 — KHÓA NGOẠI TRÌ HOÃN (phụ thuộc vòng giữa các nhóm bảng; thêm sau khi mọi bảng đã tồn tại)
-- =====================================================================

-- Quỹ sự kiện gắn với sự kiện; xóa sự kiện không được làm mất quỹ còn tiền => RESTRICT
ALTER TABLE funds
  ADD CONSTRAINT funds_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT;

-- Kế hoạch thu phí sự kiện: sự kiện bị hủy/xóa mềm không xóa kế hoạch => SET NULL
ALTER TABLE contribution_plans
  ADD CONSTRAINT contribution_plans_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- Phiếu chi liên kết sự cố/sự kiện (nối vòng sửa chữa → đề xuất chi → sổ quỹ) => SET NULL, không mất phiếu chi
ALTER TABLE expense_vouchers
  ADD CONSTRAINT expense_vouchers_maintenance_issue_id_fkey FOREIGN KEY (maintenance_issue_id) REFERENCES maintenance_issues(id) ON DELETE SET NULL;
ALTER TABLE expense_vouchers
  ADD CONSTRAINT expense_vouchers_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- Điểm danh có phép trỏ tới đơn xin phép đã duyệt
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE SET NULL;

-- Mỗi ngày bắt đầu của lịch định kỳ chỉ sinh một sự kiện (khóa cho ON CONFLICT của app.fn_generate_recurring_events)
ALTER TABLE events
  ADD CONSTRAINT ux_events__rule_occurrence UNIQUE (recurrence_rule_id, occurrence_date);
