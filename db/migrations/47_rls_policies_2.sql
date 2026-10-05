-- =====================================================================
-- KHỐI 4.6 — ROW-LEVEL SECURITY (3/4, tiếp): PHẦN 2 — học tập, sự kiện, tài chính
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.6.2.6  Học tập (dữ liệu nhạy cảm: chính chủ + người có quyền khi chủ thể đồng ý)
-- ---------------------------------------------------------------------
CREATE POLICY academic_records__select ON academic_records FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id))
         OR (status IN ('submitted', 'verified') AND (SELECT app.can_view_academic(member_id))));
CREATE POLICY academic_records__insert ON academic_records FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND status = 'draft');
CREATE POLICY academic_records__update ON academic_records FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id))
         OR ((SELECT app.has_permission('academic.verify')) AND status IN ('submitted', 'verified') AND (SELECT app.can_view_academic(member_id))))
  WITH CHECK ((SELECT app.is_self(member_id))
         OR ((SELECT app.has_permission('academic.verify')) AND (SELECT app.can_view_academic(member_id))));
CREATE POLICY academic_records__delete ON academic_records FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) AND status = 'draft');

CREATE POLICY grade_records__select ON grade_records FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM academic_records ar WHERE ar.id = record_id));
CREATE POLICY grade_records__write ON grade_records FOR ALL TO luuxa_app
  USING (EXISTS (SELECT 1 FROM academic_records ar WHERE ar.id = record_id AND ar.member_id = (SELECT app.current_member_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM academic_records ar WHERE ar.id = record_id AND ar.member_id = (SELECT app.current_member_id())));

CREATE POLICY gpa_snapshots__select ON gpa_snapshots FOR SELECT TO luuxa_app USING ((SELECT app.can_view_academic(member_id)));

-- Mục tiêu học tập chia sẻ cho cộng đoàn (visibility = community) chỉ dành cho thành viên có hồ sơ — không mở cho phiên quên gắn user hay tài khoản chưa có hồ sơ
CREATE POLICY study_goals__select ON study_goals FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id))
         OR (visibility = 'community' AND (SELECT app.current_member_id()) IS NOT NULL)
         OR (visibility = 'leadership' AND (SELECT app.has_permission('academic.read_all'))));
CREATE POLICY study_goals__write ON study_goals FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));

CREATE POLICY courses__select ON courses FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY courses__insert ON courses FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.current_member_id()) IS NOT NULL);
CREATE POLICY courses__update ON courses FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('academic.scale.manage'))) WITH CHECK ((SELECT app.has_permission('academic.scale.manage')));

CREATE POLICY tutoring_offers__select ON tutoring_offers FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('tutoring.participate')));
CREATE POLICY tutoring_offers__write  ON tutoring_offers FOR ALL    TO luuxa_app
  USING ((SELECT app.is_self(tutor_member_id))) WITH CHECK ((SELECT app.is_self(tutor_member_id)));
CREATE POLICY tutoring_requests__select ON tutoring_requests FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(mentee_member_id)) OR (SELECT app.has_permission('tutoring.manage'))
         OR EXISTS (SELECT 1 FROM tutoring_matches m WHERE m.request_id = tutoring_requests.id AND m.tutor_member_id = (SELECT app.current_member_id())));
CREATE POLICY tutoring_requests__insert ON tutoring_requests FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(mentee_member_id)));
CREATE POLICY tutoring_requests__update ON tutoring_requests FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(mentee_member_id)) OR (SELECT app.has_permission('tutoring.manage')))
  WITH CHECK ((SELECT app.is_self(mentee_member_id)) OR (SELECT app.has_permission('tutoring.manage')));
CREATE POLICY tutoring_matches__select ON tutoring_matches FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(tutor_member_id)) OR (SELECT app.is_self(mentee_member_id)) OR (SELECT app.has_permission('tutoring.manage')));
CREATE POLICY tutoring_matches__insert ON tutoring_matches FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('tutoring.manage')));
CREATE POLICY tutoring_matches__update ON tutoring_matches FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(tutor_member_id)) OR (SELECT app.is_self(mentee_member_id)) OR (SELECT app.has_permission('tutoring.manage')))
  WITH CHECK ((SELECT app.is_self(tutor_member_id)) OR (SELECT app.is_self(mentee_member_id)) OR (SELECT app.has_permission('tutoring.manage')));
CREATE POLICY tutoring_sessions__select ON tutoring_sessions FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM tutoring_matches m WHERE m.id = match_id));
CREATE POLICY tutoring_sessions__insert ON tutoring_sessions FOR INSERT TO luuxa_app
  WITH CHECK (EXISTS (SELECT 1 FROM tutoring_matches m WHERE m.id = match_id AND m.tutor_member_id = (SELECT app.current_member_id())));
CREATE POLICY tutoring_sessions__update ON tutoring_sessions FOR UPDATE TO luuxa_app
  USING (EXISTS (SELECT 1 FROM tutoring_matches m WHERE m.id = match_id))
  WITH CHECK (EXISTS (SELECT 1 FROM tutoring_matches m WHERE m.id = match_id));

-- ---------------------------------------------------------------------
-- 4.6.2.7  Sự kiện, điểm danh, đơn xin phép, biểu quyết, phụng vụ
-- ---------------------------------------------------------------------
CREATE POLICY events__select ON events FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('event.read'))
         AND (deleted_at IS NULL OR (SELECT app.has_permission('event.manage')))
         AND (status <> 'draft' OR created_by = (SELECT app.current_user_id()) OR (SELECT app.has_permission('event.manage'))));
CREATE POLICY events__insert ON events FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('event.manage')));
CREATE POLICY events__update ON events FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('event.manage')) OR (SELECT app.fn_is_event_organizer(id)))
  WITH CHECK ((SELECT app.has_permission('event.manage')) OR (SELECT app.fn_is_event_organizer(id)));

CREATE POLICY event_recurrence_rules__select ON event_recurrence_rules FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('event.read')));
CREATE POLICY event_recurrence_rules__write  ON event_recurrence_rules FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('event.manage'))) WITH CHECK ((SELECT app.has_permission('event.manage')));
CREATE POLICY event_recurrence_exceptions__select ON event_recurrence_exceptions FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('event.read')));
CREATE POLICY event_recurrence_exceptions__write  ON event_recurrence_exceptions FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('event.manage'))) WITH CHECK ((SELECT app.has_permission('event.manage')));
CREATE POLICY event_organizers__select ON event_organizers FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('event.read')));
CREATE POLICY event_organizers__write  ON event_organizers FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('event.manage'))) WITH CHECK ((SELECT app.has_permission('event.manage')));

CREATE POLICY event_participants__select ON event_participants FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('event.manage')) OR (SELECT app.fn_is_event_organizer(event_id)));
CREATE POLICY event_participants__insert ON event_participants FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('event.manage')));
CREATE POLICY event_participants__update ON event_participants FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('event.manage')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('event.manage')));

CREATE POLICY qr_sessions__select ON qr_sessions FOR SELECT TO luuxa_app USING ((SELECT app.fn_can_record_attendance(event_id)));
CREATE POLICY qr_sessions__insert ON qr_sessions FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('event.qr.manage')) OR (SELECT app.fn_is_event_organizer(event_id)));
CREATE POLICY qr_sessions__update ON qr_sessions FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('event.qr.manage')) OR (SELECT app.fn_is_event_organizer(event_id)))
  WITH CHECK ((SELECT app.has_permission('event.qr.manage')) OR (SELECT app.fn_is_event_organizer(event_id)));

CREATE POLICY attendance_records__select ON attendance_records FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.fn_can_record_attendance(event_id))
         OR (SELECT app.has_permission('event.attendance.read_all')));
-- BR-EVT-17: thành viên KHÔNG tự INSERT dòng điểm danh của mình (nhánh "is_self AND method = 'self'" cũ cho phép bỏ qua QR và geofence).
-- Tự điểm danh chỉ qua app.fn_checkin_by_qr (SECURITY DEFINER, kiểm HMAC + geofence); ghi hộ chỉ dành cho người có quyền/ban tổ chức.
CREATE POLICY attendance_records__insert ON attendance_records FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.fn_can_record_attendance(event_id)));
CREATE POLICY attendance_records__update ON attendance_records FOR UPDATE TO luuxa_app
  USING ((SELECT app.fn_can_record_attendance(event_id))) WITH CHECK ((SELECT app.fn_can_record_attendance(event_id)));

CREATE POLICY leave_requests__select ON leave_requests FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('leave.review')));
CREATE POLICY leave_requests__insert ON leave_requests FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('leave.request')) AND status = 'pending');
CREATE POLICY leave_requests__update ON leave_requests FOR UPDATE TO luuxa_app
  USING (((SELECT app.is_self(member_id)) AND status = 'pending') OR (SELECT app.has_permission('leave.review')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('leave.review')));

CREATE POLICY polls__select ON polls FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('event.read'))
         AND (status <> 'draft' OR created_by = (SELECT app.current_user_id()) OR (SELECT app.has_permission('poll.manage'))));
CREATE POLICY polls__write ON polls FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('poll.manage'))) WITH CHECK ((SELECT app.has_permission('poll.manage')));
CREATE POLICY poll_options__select ON poll_options FOR SELECT TO luuxa_app USING (EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id));
CREATE POLICY poll_options__write  ON poll_options FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('poll.manage'))) WITH CHECK ((SELECT app.has_permission('poll.manage')));
CREATE POLICY poll_votes__select__own ON poll_votes FOR SELECT TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY poll_votes__insert__own ON poll_votes FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('poll.vote')));
-- BR-EVT-19: chỉ rút/đổi phiếu của mình khi cuộc biểu quyết còn mở (không "rút phiếu" sau khi đã đóng để đổi kết quả).
CREATE POLICY poll_votes__delete__own ON poll_votes FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id))
         AND EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id AND p.status = 'open' AND (p.closes_at IS NULL OR now() <= p.closes_at)));

CREATE POLICY liturgical_days__select ON liturgical_days FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY liturgical_days__write  ON liturgical_days FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('liturgy.manage'))) WITH CHECK ((SELECT app.has_permission('liturgy.manage')));
CREATE POLICY liturgy_role_types__select ON liturgy_role_types FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY liturgy_role_types__write  ON liturgy_role_types FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('liturgy.manage'))) WITH CHECK ((SELECT app.has_permission('liturgy.manage')));
CREATE POLICY liturgy_assignments__select ON liturgy_assignments FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('event.read')));
CREATE POLICY liturgy_assignments__write  ON liturgy_assignments FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('liturgy.manage'))) WITH CHECK ((SELECT app.has_permission('liturgy.manage')));
CREATE POLICY liturgy_assignments__respond ON liturgy_assignments FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));
-- Xóa mềm = UPDATE … SET deleted_at: tác giả/người quản lý phụng vụ phải còn thấy dòng vừa xóa (xem ghi chú ở 46_rls_policies_1.sql).
-- Bài đã đăng chỉ dành cho người có event.read (như lịch phụng vụ) — phiên không gắn user hay người dùng chưa có vai trò không đọc được.
CREATE POLICY reflections__select ON reflections FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR (SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('liturgy.manage')))
         AND ((status = 'published' AND (SELECT app.has_permission('event.read')))
              OR (SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('liturgy.manage'))));
CREATE POLICY reflections__insert ON reflections FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(author_member_id)));
CREATE POLICY reflections__update ON reflections FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('liturgy.manage')))
  WITH CHECK ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('liturgy.manage')));

-- ---------------------------------------------------------------------
-- 4.6.2.8  Tài chính (người thường chỉ thấy phiếu/khoản của mình; tổng quan công khai qua app.fn_finance_summary)
-- ---------------------------------------------------------------------
CREATE POLICY funds__select ON funds FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND (SELECT app.has_any_permission(ARRAY['finance.ledger.read', 'finance.fund.manage'])));
-- Túi quỹ: tạo/sửa thông tin hiển thị bằng GRANT theo cột (49_b); các cột chuỗi băm, số thứ tự, cờ cho phép âm… do hệ thống giữ
CREATE POLICY funds__insert ON funds FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('finance.fund.manage')));
CREATE POLICY funds__update ON funds FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('finance.fund.manage'))) WITH CHECK ((SELECT app.has_permission('finance.fund.manage')));

-- Kỳ tài chính, ảnh chụp số dư và sổ cái: luuxa_app CHỈ ĐỌC; mọi thay đổi đi qua hàm SECURITY DEFINER
-- (fn_close_period / fn_confirm_period_close / fn_reopen_period / fn_post_ledger_entry / fn_pay_expense…). Không có chính sách ghi,
-- đồng thời đã REVOKE quyền ghi ở 49_b: hai lớp độc lập chặn việc Thủ quỹ tự UPDATE kỳ sang 'closed' hay INSERT bút toán không phiếu.
CREATE POLICY financial_periods__select ON financial_periods FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('finance.summary.read')));
CREATE POLICY period_fund_balances__select ON period_fund_balances FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('finance.ledger.read')));
CREATE POLICY ledger_entries__select ON ledger_entries FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('finance.ledger.read')));

CREATE POLICY expense_vouchers__select ON expense_vouchers FOR SELECT TO luuxa_app
  USING (requested_by = (SELECT app.current_user_id()) OR paid_by_member_id = (SELECT app.current_member_id())
         OR (SELECT app.has_permission('finance.expense.read_all')));
CREATE POLICY expense_vouchers__insert ON expense_vouchers FOR INSERT TO luuxa_app
  WITH CHECK (requested_by = (SELECT app.current_user_id()) AND (SELECT app.has_permission('finance.expense.create')));
-- Người tạo chỉ sửa NỘI DUNG phiếu của mình (tiêu đề, số tiền, danh mục…). Mọi cột trạng thái/chữ ký/thanh toán do hệ thống giữ
-- (trigger trg_expense_vouchers__guard) và chỉ đổi qua fn_submit_expense, fn_return_expense_to_draft, fn_cancel_expense,
-- fn_decide_expense, fn_pay_expense, fn_reverse_expense (SECURITY DEFINER) — nên không cần chính sách UPDATE riêng cho người chi/đảo/hủy.
CREATE POLICY expense_vouchers__update__owner ON expense_vouchers FOR UPDATE TO luuxa_app
  USING (requested_by = (SELECT app.current_user_id()) AND status IN ('draft', 'rejected', 'pending_approval'))
  WITH CHECK (requested_by = (SELECT app.current_user_id()));

CREATE POLICY expense_approvals__select ON expense_approvals FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM expense_vouchers v WHERE v.id = voucher_id));
CREATE POLICY expense_approvals__insert ON expense_approvals FOR INSERT TO luuxa_app
  WITH CHECK (approver_user_id = (SELECT app.current_user_id()) AND (SELECT app.has_permission('finance.expense.approve')));
CREATE POLICY expense_status_history__select ON expense_status_history FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM expense_vouchers v WHERE v.id = voucher_id));

CREATE POLICY contribution_plans__select ON contribution_plans FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('finance.summary.read')));
CREATE POLICY contribution_plans__write  ON contribution_plans FOR ALL    TO luuxa_app
  USING ((SELECT app.has_permission('finance.contribution.plan.manage'))) WITH CHECK ((SELECT app.has_permission('finance.contribution.plan.manage')));

CREATE POLICY contributions__select ON contributions FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('finance.contribution.read_all')));
CREATE POLICY contributions__insert ON contributions FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('finance.contribution.plan.manage')));
CREATE POLICY contributions__update ON contributions FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_any_permission(ARRAY['finance.contribution.waive', 'finance.contribution.plan.manage'])))
  WITH CHECK ((SELECT app.has_any_permission(ARRAY['finance.contribution.waive', 'finance.contribution.plan.manage'])));

CREATE POLICY contribution_payments__select ON contribution_payments FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('finance.contribution.read_all')));
-- Phiếu thu và phân bổ: luuxa_app CHỈ ĐỌC; ghi thu/hủy thu chỉ qua fn_record_contribution_payment / fn_void_contribution_payment
CREATE POLICY contribution_payment_allocations__select ON contribution_payment_allocations FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM contribution_payments p WHERE p.id = payment_id));

CREATE POLICY bank_statement_lines__select ON bank_statement_lines FOR SELECT TO luuxa_app
  USING ((SELECT app.has_any_permission(ARRAY['finance.reconcile', 'finance.ledger.read'])));
CREATE POLICY bank_statement_lines__write ON bank_statement_lines FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('finance.reconcile'))) WITH CHECK ((SELECT app.has_permission('finance.reconcile')));
CREATE POLICY period_reconciliations__select ON period_reconciliations FOR SELECT TO luuxa_app
  USING ((SELECT app.has_any_permission(ARRAY['finance.reconcile', 'finance.ledger.read'])));
CREATE POLICY period_reconciliations__write ON period_reconciliations FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('finance.reconcile'))) WITH CHECK ((SELECT app.has_permission('finance.reconcile')));
