-- =====================================================================
-- KHỐI 4.6 — ROW-LEVEL SECURITY (3/4): CHÍNH SÁCH CHI TIẾT — PHẦN 1: tra cứu, cấu hình, danh tính, hồ sơ, nhà, trực nhật
-- Quy ước: tên chính sách <bảng>__<thao_tác>__<đối_tượng>; mọi chính sách áp dụng cho vai trò runtime luuxa_app.
-- (SELECT app.fn()) bọc hàm STABLE để PostgreSQL tính MỘT LẦN mỗi câu lệnh (InitPlan) thay vì mỗi dòng.
-- Bảng không có chính sách INSERT/UPDATE/DELETE nghĩa là luuxa_app KHÔNG được thực hiện thao tác đó trực tiếp
-- (thao tác chỉ qua hàm SECURITY DEFINER đã kiểm tra nghiệp vụ, hoặc qua worker/migration).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.6.2.1  Bảng tra cứu & cấu hình (đọc: mọi người dùng đã đăng nhập; ghi: theo quyền quản lý tương ứng)
-- ---------------------------------------------------------------------
CREATE POLICY roles__select__authenticated            ON roles            FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY permissions__select__authenticated      ON permissions      FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY role_permissions__select__authenticated ON role_permissions FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));

-- Đọc: khóa công khai; hoặc người có quyền sửa (setting.write / quyền riêng của khóa); hoặc cán bộ tài chính đọc cấu hình tài chính (ngưỡng duyệt, hóa đơn)
CREATE POLICY settings__select__public_or_admin ON settings FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (
         is_public
      OR (SELECT app.has_permission('setting.write'))
      OR (SELECT app.has_permission(write_permission))
      OR (key LIKE 'finance.%' AND (SELECT app.has_permission('finance.expense.read_all')))));
-- Sửa: theo QUYỀN RIÊNG của từng khóa (write_permission) — cấu hình tài chính cần finance.settings.write (Admin kỹ thuật không có)
CREATE POLICY settings__update__setting_write ON settings FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission(write_permission))) WITH CHECK ((SELECT app.has_permission(write_permission)));

CREATE POLICY categories__select__authenticated ON categories FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY categories__insert__manage        ON categories FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('category.manage')) AND NOT is_system);
CREATE POLICY categories__update__manage        ON categories FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('category.manage'))) WITH CHECK ((SELECT app.has_permission('category.manage')));
CREATE POLICY categories__delete__manage        ON categories FOR DELETE TO luuxa_app USING ((SELECT app.has_permission('category.manage')) AND NOT is_system);

CREATE POLICY dioceses__select__authenticated   ON dioceses   FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));

-- Xóa mềm = UPDATE … SET deleted_at, mà PostgreSQL áp chính sách SELECT lên cả dòng MỚI của UPDATE: người được quyền sửa phải còn "nhìn thấy" dòng vừa xóa
-- (universities, member_guardians, student_profiles ở file này; reflections ở 47; album/thông báo/diễn đàn ở 48). API lọc deleted_at IS NULL khi liệt kê.
CREATE POLICY universities__select__authenticated ON universities FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (deleted_at IS NULL OR (SELECT app.has_permission('academic.scale.manage'))));
CREATE POLICY universities__insert__scale_manage   ON universities FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('academic.scale.manage')));
CREATE POLICY universities__update__scale_manage   ON universities FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('academic.scale.manage'))) WITH CHECK ((SELECT app.has_permission('academic.scale.manage')));

CREATE POLICY grade_scales__select__authenticated      ON grade_scales      FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY grade_scales__write__scale_manage        ON grade_scales      FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('academic.scale.manage'))) WITH CHECK ((SELECT app.has_permission('academic.scale.manage')));
CREATE POLICY grade_scale_bands__select__authenticated ON grade_scale_bands FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY grade_scale_bands__write__scale_manage   ON grade_scale_bands FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('academic.scale.manage'))) WITH CHECK ((SELECT app.has_permission('academic.scale.manage')));
CREATE POLICY grade_rank_bands__select__authenticated  ON grade_rank_bands  FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY grade_rank_bands__write__scale_manage    ON grade_rank_bands  FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('academic.scale.manage'))) WITH CHECK ((SELECT app.has_permission('academic.scale.manage')));

CREATE POLICY amenities__select__authenticated ON amenities FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY amenities__write__house_manage   ON amenities FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('house.structure.manage'))) WITH CHECK ((SELECT app.has_permission('house.structure.manage')));

CREATE POLICY positions__select__authenticated ON positions FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY positions__write__position_manage ON positions FOR ALL   TO luuxa_app USING ((SELECT app.has_permission('position.manage'))) WITH CHECK ((SELECT app.has_permission('position.manage')));

CREATE POLICY academic_years__select__authenticated ON academic_years FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY academic_years__write__term_manage    ON academic_years FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('term.manage'))) WITH CHECK ((SELECT app.has_permission('term.manage')));
CREATE POLICY semesters__select__authenticated      ON semesters      FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY semesters__write__term_manage         ON semesters      FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('term.manage'))) WITH CHECK ((SELECT app.has_permission('term.manage')));
CREATE POLICY board_terms__select__authenticated    ON board_terms    FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY board_terms__write__term_manage       ON board_terms    FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('term.manage'))) WITH CHECK ((SELECT app.has_permission('term.manage')));

CREATE POLICY notification_types__select__authenticated ON notification_types FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY consent_purposes__select__authenticated   ON consent_purposes   FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY merit_rules__select__authenticated        ON merit_rules        FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY merit_rules__write__setting_write         ON merit_rules        FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('setting.write'))) WITH CHECK ((SELECT app.has_permission('setting.write')));
CREATE POLICY ai_task_types__select__authenticated      ON ai_task_types      FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY ai_task_types__write__ai_manage           ON ai_task_types      FOR UPDATE TO luuxa_app USING ((SELECT app.has_permission('ai.manage'))) WITH CHECK ((SELECT app.has_permission('ai.manage')));

-- ---------------------------------------------------------------------
-- 4.6.2.2  Tài khoản, phiên, MFA, gán vai trò, ủy quyền
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_users_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'luuxa_app' AND NOT app.has_permission('auth.user.manage') THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.locked_until IS DISTINCT FROM OLD.locked_until
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.email IS DISTINCT FROM OLD.email OR NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'BR-AUTH-07: người dùng chỉ được tự đổi locale/time_zone; các thuộc tính tài khoản cần quyền auth.user.manage.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_users_guard() IS 'Người dùng thường chỉ sửa được locale/time_zone của chính mình; mật khẩu và định danh đăng nhập đi qua vai trò luuxa_auth.';
CREATE TRIGGER trg_users__guard BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.tg_users_guard();

CREATE POLICY users__select__self_or_admin ON users FOR SELECT TO luuxa_app
  USING (id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.user.read')));
CREATE POLICY users__insert__manage ON users FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('auth.user.manage')));
CREATE POLICY users__update__self_or_manage ON users FOR UPDATE TO luuxa_app
  USING (id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.user.manage')))
  WITH CHECK (id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.user.manage')));

CREATE POLICY auth_sessions__select__own_or_admin ON auth_sessions FOR SELECT TO luuxa_app
  USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.session.revoke_any')));
CREATE POLICY auth_sessions__update__own_or_admin ON auth_sessions FOR UPDATE TO luuxa_app
  USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.session.revoke_any')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.session.revoke_any')));

-- refresh_tokens, password_resets, mfa_recovery_codes: KHÔNG có chính sách ⇒ luuxa_app bị từ chối hoàn toàn (chỉ luuxa_auth)
CREATE POLICY login_attempts__select__auditor ON login_attempts FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('audit.log.read')));

CREATE POLICY user_mfa_factors__own ON user_mfa_factors FOR ALL TO luuxa_app
  USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));

CREATE POLICY user_roles__select__own_or_staff ON user_roles FOR SELECT TO luuxa_app
  USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_any_permission(ARRAY['auth.user.read', 'auth.role.assign'])));
CREATE POLICY user_roles__insert__assign ON user_roles FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.has_permission('auth.role.assign'))
              AND user_id <> (SELECT app.current_user_id())
              AND (NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.code = 'admin') OR (SELECT app.has_role('admin'))));
CREATE POLICY user_roles__update__assign ON user_roles FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('auth.role.assign')) AND user_id <> (SELECT app.current_user_id()))
  WITH CHECK ((SELECT app.has_permission('auth.role.assign')) AND user_id <> (SELECT app.current_user_id()));

CREATE POLICY role_delegations__select__party_or_assigner ON role_delegations FOR SELECT TO luuxa_app
  USING (delegator_user_id = (SELECT app.current_user_id()) OR delegate_user_id = (SELECT app.current_user_id())
         OR (SELECT app.has_permission('auth.role.assign')));
CREATE POLICY role_delegations__insert__delegator ON role_delegations FOR INSERT TO luuxa_app
  WITH CHECK (delegator_user_id = (SELECT app.current_user_id()) AND (SELECT app.has_permission('auth.role.delegate')));
CREATE POLICY role_delegations__update__revoke ON role_delegations FOR UPDATE TO luuxa_app
  USING (delegator_user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.role.assign')))
  WITH CHECK (delegator_user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('auth.role.assign')));

CREATE POLICY user_identities__select__own ON user_identities FOR SELECT TO luuxa_app USING (user_id = (SELECT app.current_user_id()));

-- ---------------------------------------------------------------------
-- 4.6.2.3  Hồ sơ thành viên theo 3 tầng dữ liệu
-- ---------------------------------------------------------------------
CREATE POLICY members__select__directory ON members FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('member.read')) AND (deleted_at IS NULL OR (SELECT app.has_permission('member.status.change'))));
CREATE POLICY members__insert__create ON members FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('member.create')));
CREATE POLICY members__update__self_or_staff ON members FOR UPDATE TO luuxa_app
  USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_any_permission(ARRAY['member.update', 'member.status.change'])))
  WITH CHECK (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_any_permission(ARRAY['member.update', 'member.status.change'])));

CREATE POLICY member_private_details__select ON member_private_details FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.read')));
CREATE POLICY member_private_details__insert ON member_private_details FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));
CREATE POLICY member_private_details__update ON member_private_details FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));

CREATE POLICY member_guardians__select ON member_guardians FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR (SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')))
         AND ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.guardian.read'))));
CREATE POLICY member_guardians__insert ON member_guardians FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));
CREATE POLICY member_guardians__update ON member_guardians FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));

CREATE POLICY catholic_profiles__select ON catholic_profiles FOR SELECT TO luuxa_app USING ((SELECT app.can_view_catholic(member_id)));
CREATE POLICY catholic_profiles__insert ON catholic_profiles FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));
CREATE POLICY catholic_profiles__update ON catholic_profiles FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));
CREATE POLICY member_sacraments__select ON member_sacraments FOR SELECT TO luuxa_app USING ((SELECT app.can_view_catholic(member_id)));
CREATE POLICY member_sacraments__write ON member_sacraments FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));

-- Hồ sơ học vụ (có MSSV): chính chủ, hoặc cán bộ có quyền xem dữ liệu tầng 2 / bảng điểm — không mở cho mọi thành viên
CREATE POLICY student_profiles__select ON student_profiles FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR (SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')))
         AND ((SELECT app.is_self(member_id))
              OR (SELECT app.has_any_permission(ARRAY['member.private.read', 'academic.read_all', 'academic.read_aggregate', 'member.update']))));
CREATE POLICY student_profiles__insert ON student_profiles FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));
CREATE POLICY student_profiles__update ON student_profiles FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.update')));

CREATE POLICY member_positions__select ON member_positions FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('member.read')));
CREATE POLICY member_positions__write  ON member_positions FOR ALL    TO luuxa_app
  USING ((SELECT app.has_permission('position.manage'))) WITH CHECK ((SELECT app.has_permission('position.manage')));

CREATE POLICY consents__select ON consents FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('consent.read_all')));
CREATE POLICY consents__insert ON consents FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('member.private.write')));
CREATE POLICY consents__update__withdraw ON consents FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('dsr.manage')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('dsr.manage')));

CREATE POLICY data_subject_requests__select ON data_subject_requests FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('dsr.manage')));
CREATE POLICY data_subject_requests__insert ON data_subject_requests FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(member_id)));
CREATE POLICY data_subject_requests__update ON data_subject_requests FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('dsr.manage'))) WITH CHECK ((SELECT app.has_permission('dsr.manage')));

CREATE POLICY member_applications__select ON member_applications FOR SELECT TO luuxa_app
  USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('application.review')));
CREATE POLICY member_applications__insert ON member_applications FOR INSERT TO luuxa_app
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND status = 'submitted');
CREATE POLICY member_applications__update ON member_applications FOR UPDATE TO luuxa_app
  USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('application.review')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) OR (SELECT app.has_permission('application.review')));

CREATE POLICY push_subscriptions__own ON push_subscriptions FOR ALL TO luuxa_app
  USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));
CREATE POLICY member_channel_bindings__own ON member_channel_bindings FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));
CREATE POLICY notification_preferences__own ON notification_preferences FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));

-- ---------------------------------------------------------------------
-- 4.6.2.4  Nhà & phòng
-- ---------------------------------------------------------------------
CREATE POLICY floors__select ON floors FOR SELECT TO luuxa_app USING (deleted_at IS NULL AND (SELECT app.has_permission('house.read')));
CREATE POLICY floors__write  ON floors FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('house.structure.manage'))) WITH CHECK ((SELECT app.has_permission('house.structure.manage')));
CREATE POLICY rooms__select  ON rooms  FOR SELECT TO luuxa_app USING (deleted_at IS NULL AND (SELECT app.has_permission('house.read')));
CREATE POLICY rooms__write   ON rooms  FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('house.structure.manage'))) WITH CHECK ((SELECT app.has_permission('house.structure.manage')));
CREATE POLICY room_amenities__select ON room_amenities FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('house.read')));
CREATE POLICY room_amenities__write  ON room_amenities FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('house.structure.manage'))) WITH CHECK ((SELECT app.has_permission('house.structure.manage')));
CREATE POLICY room_assignments__select ON room_assignments FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('house.read')));
CREATE POLICY room_assignments__insert ON room_assignments FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.can_assign_room(room_id)));
CREATE POLICY room_assignments__update ON room_assignments FOR UPDATE TO luuxa_app
  USING ((SELECT app.can_assign_room(room_id))) WITH CHECK ((SELECT app.can_assign_room(room_id)));

-- ---------------------------------------------------------------------
-- 4.6.2.5  Trực nhật & vệ sinh
-- ---------------------------------------------------------------------
CREATE POLICY duty_shifts__select           ON duty_shifts           FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY duty_shifts__write            ON duty_shifts           FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('duty.area.manage'))) WITH CHECK ((SELECT app.has_permission('duty.area.manage')));
CREATE POLICY cleaning_areas__select        ON cleaning_areas        FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY cleaning_areas__write         ON cleaning_areas        FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('duty.area.manage'))) WITH CHECK ((SELECT app.has_permission('duty.area.manage')));
CREATE POLICY checklist_templates__select   ON checklist_templates   FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY checklist_templates__write    ON checklist_templates   FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('duty.area.manage'))) WITH CHECK ((SELECT app.has_permission('duty.area.manage')));
CREATE POLICY checklist_template_items__select ON checklist_template_items FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY checklist_template_items__write  ON checklist_template_items FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('duty.area.manage'))) WITH CHECK ((SELECT app.has_permission('duty.area.manage')));

CREATE POLICY duty_rosters__select ON duty_rosters FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('duty.read')) AND (status <> 'draft' OR (SELECT app.has_permission('duty.manage'))));
CREATE POLICY duty_rosters__write  ON duty_rosters FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('duty.manage'))) WITH CHECK ((SELECT app.has_permission('duty.manage')));

CREATE POLICY duty_assignments__select ON duty_assignments FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM duty_rosters r WHERE r.id = roster_id));
CREATE POLICY duty_assignments__write  ON duty_assignments FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('duty.manage'))) WITH CHECK ((SELECT app.has_permission('duty.manage')));

CREATE POLICY duty_assignment_members__select ON duty_assignment_members FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM duty_assignments a WHERE a.id = assignment_id));
CREATE POLICY duty_assignment_members__insert ON duty_assignment_members FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.has_permission('duty.manage')));
CREATE POLICY duty_assignment_members__delete ON duty_assignment_members FOR DELETE TO luuxa_app USING ((SELECT app.has_permission('duty.manage')));

CREATE POLICY duty_checkins__select ON duty_checkins FOR SELECT TO luuxa_app
  USING (checked_in_by_member_id = (SELECT app.current_member_id())
         OR EXISTS (SELECT 1 FROM duty_assignment_members m WHERE m.assignment_id = duty_checkins.assignment_id AND m.member_id = (SELECT app.current_member_id()))
         OR (SELECT app.has_any_permission(ARRAY['duty.manage', 'duty.review'])));
CREATE POLICY duty_checkins__insert ON duty_checkins FOR INSERT TO luuxa_app
  WITH CHECK (checked_in_by_member_id = (SELECT app.current_member_id()) AND (SELECT app.has_permission('duty.checkin')));

CREATE POLICY checkin_items__select ON checkin_items FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM duty_checkins c WHERE c.id = checkin_id));
CREATE POLICY checkin_items__insert ON checkin_items FOR INSERT TO luuxa_app
  WITH CHECK (EXISTS (SELECT 1 FROM duty_checkins c WHERE c.id = checkin_id AND c.checked_in_by_member_id = (SELECT app.current_member_id())));

CREATE POLICY duty_reviews__select ON duty_reviews FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM duty_checkins c WHERE c.id = checkin_id));
CREATE POLICY duty_reviews__insert ON duty_reviews FOR INSERT TO luuxa_app
  WITH CHECK (reviewer_member_id = (SELECT app.current_member_id()) AND (SELECT app.has_permission('duty.review')));

CREATE POLICY duty_review_appeals__select ON duty_review_appeals FOR SELECT TO luuxa_app
  USING (appellant_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_any_permission(ARRAY['duty.appeal.decide', 'duty.review'])));
CREATE POLICY duty_review_appeals__insert ON duty_review_appeals FOR INSERT TO luuxa_app
  WITH CHECK (appellant_member_id = (SELECT app.current_member_id())
              AND EXISTS (SELECT 1 FROM duty_reviews r
                            JOIN duty_checkins c ON c.id = r.checkin_id
                            JOIN duty_assignment_members m ON m.assignment_id = c.assignment_id AND m.member_id = (SELECT app.current_member_id())
                           WHERE r.id = review_id));
CREATE POLICY duty_review_appeals__update ON duty_review_appeals FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('duty.appeal.decide'))) WITH CHECK ((SELECT app.has_permission('duty.appeal.decide')));

CREATE POLICY duty_swap_requests__select ON duty_swap_requests FOR SELECT TO luuxa_app
  USING (from_member_id = (SELECT app.current_member_id()) OR to_member_id = (SELECT app.current_member_id())
         OR (SELECT app.has_permission('duty.swap.approve')));
CREATE POLICY duty_swap_requests__insert ON duty_swap_requests FOR INSERT TO luuxa_app
  WITH CHECK (from_member_id = (SELECT app.current_member_id()) AND (SELECT app.has_permission('duty.swap.request')));
-- BR-DUTY-21: UPDATE trực tiếp chỉ dành cho người xin HỦY đơn còn đang chờ của chính mình (GRANT UPDATE (status) ở 49_b);
-- xác nhận của người nhận và quyết định của Ban điều hành đi qua fn_peer_respond_duty_swap / fn_admin_decide_duty_swap (SECURITY DEFINER).
CREATE POLICY duty_swap_requests__update ON duty_swap_requests FOR UPDATE TO luuxa_app
  USING (from_member_id = (SELECT app.current_member_id()) AND status IN ('pending_peer', 'pending_admin'))
  WITH CHECK (from_member_id = (SELECT app.current_member_id()) AND status = 'cancelled');

CREATE POLICY duty_status_history__select ON duty_status_history FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM duty_assignments a WHERE a.id = assignment_id));
CREATE POLICY duty_swap_status_history__select ON duty_swap_status_history FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM duty_swap_requests s WHERE s.id = swap_id));

CREATE POLICY member_unavailability__select ON member_unavailability FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('duty.manage')));
CREATE POLICY member_unavailability__write ON member_unavailability FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));

CREATE POLICY merit_entries__select ON merit_entries FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('merit.read_all')));
-- BR-MER-05: người có merit.adjust điều chỉnh điểm của NGƯỜI KHÁC, không tự cộng/trừ điểm của chính mình (bút toán tự điều chỉnh phải do người thứ hai ghi)
CREATE POLICY merit_entries__insert__manual ON merit_entries FOR INSERT TO luuxa_app
  WITH CHECK (rule_code = 'manual_adjust' AND (SELECT app.has_permission('merit.adjust')) AND created_by = (SELECT app.current_user_id())
              AND NOT (SELECT app.is_self(member_id)));
