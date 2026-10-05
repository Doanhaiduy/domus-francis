-- =====================================================================
-- KHỐI 4.4 — INDEX (2/2): B-TREE CHO MỌI KHÓA NGOẠI
-- PostgreSQL KHÔNG tự tạo index cho khóa ngoại. Thiếu index ⇒ JOIN chậm và mỗi lần DELETE/UPDATE bản ghi cha
-- phải quét toàn bảng con. Danh sách dưới đây sinh từ pg_constraint: mọi FK chưa có index dẫn đầu phù hợp.
-- =====================================================================

-- academic_records
CREATE INDEX ix_academic_records__scale_id ON academic_records (scale_id);  -- FK → grade_scales
CREATE INDEX ix_academic_records__semester_id ON academic_records (semester_id);  -- FK → semesters
CREATE INDEX ix_academic_records__university_id ON academic_records (university_id);  -- FK → universities
CREATE INDEX ix_academic_records__verified_by ON academic_records (verified_by);  -- FK → users
-- ai_jobs
CREATE INDEX ix_ai_jobs__requested_by ON ai_jobs (requested_by);  -- FK → users
CREATE INDEX ix_ai_jobs__subject_member_id ON ai_jobs (subject_member_id);  -- FK → members
CREATE INDEX ix_ai_jobs__task_code ON ai_jobs (task_code);  -- FK → ai_task_types
-- ai_suggestions
CREATE INDEX ix_ai_suggestions__job_id ON ai_suggestions (job_id);  -- FK → ai_jobs
CREATE INDEX ix_ai_suggestions__reviewed_by ON ai_suggestions (reviewed_by);  -- FK → users
CREATE INDEX ix_ai_suggestions__task_code ON ai_suggestions (task_code);  -- FK → ai_task_types
-- ai_task_types
CREATE INDEX ix_ai_task_types__required_consent_purpose ON ai_task_types (required_consent_purpose);  -- FK → consent_purposes
-- ai_usage_daily
CREATE INDEX ix_ai_usage_daily__task_code ON ai_usage_daily (task_code);  -- FK → ai_task_types
-- album_likes
CREATE INDEX ix_album_likes__member_id ON album_likes (member_id);  -- FK → members
-- album_member_tags
CREATE INDEX ix_album_member_tags__member_id ON album_member_tags (member_id);  -- FK → members
CREATE INDEX ix_album_member_tags__tagged_by_member_id ON album_member_tags (tagged_by_member_id);  -- FK → members
-- album_photos
CREATE INDEX ix_album_photos__album_id ON album_photos (album_id);  -- FK → albums
CREATE INDEX ix_album_photos__uploaded_by_member_id ON album_photos (uploaded_by_member_id);  -- FK → members
-- albums
CREATE INDEX ix_albums__author_member_id ON albums (author_member_id);  -- FK → members
CREATE INDEX ix_albums__category_id_category_kind ON albums (category_id, category_kind);  -- FK → categories
CREATE INDEX ix_albums__cover_file_id ON albums (cover_file_id);  -- FK → storage_files
CREATE INDEX ix_albums__event_id ON albums (event_id);  -- FK → events
-- announcement_reads
CREATE INDEX ix_announcement_reads__member_id ON announcement_reads (member_id);  -- FK → members
-- announcement_targets
CREATE INDEX ix_announcement_targets__announcement_id ON announcement_targets (announcement_id);  -- FK → announcements
CREATE INDEX ix_announcement_targets__floor_id ON announcement_targets (floor_id);  -- FK → floors
CREATE INDEX ix_announcement_targets__member_id ON announcement_targets (member_id);  -- FK → members
CREATE INDEX ix_announcement_targets__role_id ON announcement_targets (role_id);  -- FK → roles
CREATE INDEX ix_announcement_targets__room_id ON announcement_targets (room_id);  -- FK → rooms
-- announcements
CREATE INDEX ix_announcements__author_member_id ON announcements (author_member_id);  -- FK → members
CREATE INDEX ix_announcements__category_id_category_kind ON announcements (category_id, category_kind);  -- FK → categories
CREATE INDEX ix_announcements__event_id ON announcements (event_id);  -- FK → events
-- asset_loans
CREATE INDEX ix_asset_loans__asset_id ON asset_loans (asset_id);  -- FK → assets
CREATE INDEX ix_asset_loans__borrower_member_id ON asset_loans (borrower_member_id);  -- FK → members
CREATE INDEX ix_asset_loans__checked_out_by ON asset_loans (checked_out_by);  -- FK → users
CREATE INDEX ix_asset_loans__received_back_by ON asset_loans (received_back_by);  -- FK → users
-- asset_maintenance_schedules
CREATE INDEX ix_asset_maintenance_schedules__asset_id ON asset_maintenance_schedules (asset_id);  -- FK → assets
CREATE INDEX ix_asset_maintenance_schedules__last_done_by ON asset_maintenance_schedules (last_done_by);  -- FK → users
-- assets
CREATE INDEX ix_assets__created_by ON assets (created_by);  -- FK → users
CREATE INDEX ix_assets__room_id ON assets (room_id);  -- FK → rooms
-- attendance_records
CREATE INDEX ix_attendance_records__leave_request_id ON attendance_records (leave_request_id);  -- FK → leave_requests
CREATE INDEX ix_attendance_records__member_id ON attendance_records (member_id);  -- FK → members
CREATE INDEX ix_attendance_records__qr_session_id ON attendance_records (qr_session_id);  -- FK → qr_sessions
CREATE INDEX ix_attendance_records__recorded_by ON attendance_records (recorded_by);  -- FK → users
-- auth_sessions
CREATE INDEX ix_auth_sessions__user_id ON auth_sessions (user_id);  -- FK → users
-- bank_statement_lines
CREATE INDEX ix_bank_statement_lines__fund_id ON bank_statement_lines (fund_id);  -- FK → funds
CREATE INDEX ix_bank_statement_lines__imported_by ON bank_statement_lines (imported_by);  -- FK → users
CREATE INDEX ix_bank_statement_lines__matched_by ON bank_statement_lines (matched_by);  -- FK → users
CREATE INDEX ix_bank_statement_lines__matched_ledger_entry_id ON bank_statement_lines (matched_ledger_entry_id);  -- FK → ledger_entries
-- board_terms
CREATE INDEX ix_board_terms__academic_year_id ON board_terms (academic_year_id);  -- FK → academic_years
CREATE INDEX ix_board_terms__closed_by ON board_terms (closed_by);  -- FK → users
-- catholic_profiles
CREATE INDEX ix_catholic_profiles__diocese_id ON catholic_profiles (diocese_id);  -- FK → dioceses
-- checkin_items
CREATE INDEX ix_checkin_items__template_item_id ON checkin_items (template_item_id);  -- FK → checklist_template_items
-- checklist_templates
CREATE INDEX ix_checklist_templates__area_id ON checklist_templates (area_id);  -- FK → cleaning_areas
-- cleaning_areas
CREATE INDEX ix_cleaning_areas__floor_id ON cleaning_areas (floor_id);  -- FK → floors
CREATE INDEX ix_cleaning_areas__room_id ON cleaning_areas (room_id);  -- FK → rooms
-- consents
CREATE INDEX ix_consents__guardian_id ON consents (guardian_id);  -- FK → member_guardians
CREATE INDEX ix_consents__member_id ON consents (member_id);  -- FK → members
CREATE INDEX ix_consents__purpose_code ON consents (purpose_code);  -- FK → consent_purposes
CREATE INDEX ix_consents__recorded_by ON consents (recorded_by);  -- FK → users
-- content_reports
CREATE INDEX ix_content_reports__handled_by ON content_reports (handled_by);  -- FK → users
CREATE INDEX ix_content_reports__reporter_member_id ON content_reports (reporter_member_id);  -- FK → members
-- contribution_payment_allocations
CREATE INDEX ix_contribution_payment_allocations__contribution_id ON contribution_payment_allocations (contribution_id);  -- FK → contributions
-- contribution_payments
CREATE INDEX ix_contribution_payments__fund_id ON contribution_payments (fund_id);  -- FK → funds
CREATE INDEX ix_contribution_payments__ledger_entry_id ON contribution_payments (ledger_entry_id);  -- FK → ledger_entries
CREATE INDEX ix_contribution_payments__member_id ON contribution_payments (member_id);  -- FK → members
CREATE INDEX ix_contribution_payments__received_by ON contribution_payments (received_by);  -- FK → users
CREATE INDEX ix_contribution_payments__void_ledger_entry_id ON contribution_payments (void_ledger_entry_id);  -- FK → ledger_entries
CREATE INDEX ix_contribution_payments__voided_by ON contribution_payments (voided_by);  -- FK → users
-- contribution_plans
CREATE INDEX ix_contribution_plans__academic_year_id ON contribution_plans (academic_year_id);  -- FK → academic_years
CREATE INDEX ix_contribution_plans__created_by ON contribution_plans (created_by);  -- FK → users
CREATE INDEX ix_contribution_plans__event_id ON contribution_plans (event_id);  -- FK → events
CREATE INDEX ix_contribution_plans__fund_id ON contribution_plans (fund_id);  -- FK → funds
-- contributions
CREATE INDEX ix_contributions__discount_approved_by ON contributions (discount_approved_by);  -- FK → users
CREATE INDEX ix_contributions__member_id ON contributions (member_id);  -- FK → members
-- data_subject_requests
CREATE INDEX ix_data_subject_requests__handled_by ON data_subject_requests (handled_by);  -- FK → users
CREATE INDEX ix_data_subject_requests__member_id ON data_subject_requests (member_id);  -- FK → members
-- duty_assignment_members
CREATE INDEX ix_duty_assignment_members__added_by ON duty_assignment_members (added_by);  -- FK → users
CREATE INDEX ix_duty_assignment_members__assignment_id_duty_date_shift_id ON duty_assignment_members (assignment_id, duty_date, shift_id);  -- FK → duty_assignments
-- duty_assignments
CREATE INDEX ix_duty_assignments__area_id ON duty_assignments (area_id);  -- FK → cleaning_areas
CREATE INDEX ix_duty_assignments__checklist_template_id ON duty_assignments (checklist_template_id);  -- FK → checklist_templates
CREATE INDEX ix_duty_assignments__created_by ON duty_assignments (created_by);  -- FK → users
CREATE INDEX ix_duty_assignments__room_id ON duty_assignments (room_id);  -- FK → rooms
CREATE INDEX ix_duty_assignments__roster_id ON duty_assignments (roster_id);  -- FK → duty_rosters
CREATE INDEX ix_duty_assignments__shift_id ON duty_assignments (shift_id);  -- FK → duty_shifts
-- duty_checkins
CREATE INDEX ix_duty_checkins__checked_in_by_member_id ON duty_checkins (checked_in_by_member_id);  -- FK → members
-- duty_review_appeals
CREATE INDEX ix_duty_review_appeals__appellant_member_id ON duty_review_appeals (appellant_member_id);  -- FK → members
CREATE INDEX ix_duty_review_appeals__decided_by ON duty_review_appeals (decided_by);  -- FK → users
-- duty_reviews
CREATE INDEX ix_duty_reviews__reviewer_member_id ON duty_reviews (reviewer_member_id);  -- FK → members
-- duty_rosters
CREATE INDEX ix_duty_rosters__academic_year_id ON duty_rosters (academic_year_id);  -- FK → academic_years
CREATE INDEX ix_duty_rosters__created_by ON duty_rosters (created_by);  -- FK → users
CREATE INDEX ix_duty_rosters__published_by ON duty_rosters (published_by);  -- FK → users
-- duty_status_history
CREATE INDEX ix_duty_status_history__assignment_id ON duty_status_history (assignment_id);  -- FK → duty_assignments
CREATE INDEX ix_duty_status_history__changed_by ON duty_status_history (changed_by);  -- FK → users
-- duty_swap_requests
CREATE INDEX ix_duty_swap_requests__admin_decided_by ON duty_swap_requests (admin_decided_by);  -- FK → users
CREATE INDEX ix_duty_swap_requests__assignment_id ON duty_swap_requests (assignment_id);  -- FK → duty_assignments
CREATE INDEX ix_duty_swap_requests__from_member_id ON duty_swap_requests (from_member_id);  -- FK → members
CREATE INDEX ix_duty_swap_requests__to_member_id ON duty_swap_requests (to_member_id);  -- FK → members
-- duty_swap_status_history
CREATE INDEX ix_duty_swap_status_history__changed_by ON duty_swap_status_history (changed_by);  -- FK → users
CREATE INDEX ix_duty_swap_status_history__swap_id ON duty_swap_status_history (swap_id);  -- FK → duty_swap_requests
-- event_organizers
CREATE INDEX ix_event_organizers__member_id ON event_organizers (member_id);  -- FK → members
-- event_participants
CREATE INDEX ix_event_participants__member_id ON event_participants (member_id);  -- FK → members
-- event_recurrence_exceptions
CREATE INDEX ix_event_recurrence_exceptions__created_by ON event_recurrence_exceptions (created_by);  -- FK → users
-- event_recurrence_rules
CREATE INDEX ix_event_recurrence_rules__category_id_category_kind ON event_recurrence_rules (category_id, category_kind);  -- FK → categories
CREATE INDEX ix_event_recurrence_rules__created_by ON event_recurrence_rules (created_by);  -- FK → users
CREATE INDEX ix_event_recurrence_rules__location_room_id ON event_recurrence_rules (location_room_id);  -- FK → rooms
-- events
CREATE INDEX ix_events__category_id_category_kind ON events (category_id, category_kind);  -- FK → categories
CREATE INDEX ix_events__created_by ON events (created_by);  -- FK → users
CREATE INDEX ix_events__location_room_id ON events (location_room_id);  -- FK → rooms
-- expense_approvals
CREATE INDEX ix_expense_approvals__approver_user_id ON expense_approvals (approver_user_id);  -- FK → users
-- expense_status_history
CREATE INDEX ix_expense_status_history__changed_by ON expense_status_history (changed_by);  -- FK → users
CREATE INDEX ix_expense_status_history__voucher_id ON expense_status_history (voucher_id);  -- FK → expense_vouchers
-- expense_vouchers
CREATE INDEX ix_expense_vouchers__category_id_category_kind ON expense_vouchers (category_id, category_kind);  -- FK → categories
CREATE INDEX ix_expense_vouchers__event_id ON expense_vouchers (event_id);  -- FK → events
CREATE INDEX ix_expense_vouchers__fund_id ON expense_vouchers (fund_id);  -- FK → funds
CREATE INDEX ix_expense_vouchers__ledger_entry_id ON expense_vouchers (ledger_entry_id);  -- FK → ledger_entries
CREATE INDEX ix_expense_vouchers__maintenance_issue_id ON expense_vouchers (maintenance_issue_id);  -- FK → maintenance_issues
CREATE INDEX ix_expense_vouchers__paid_by_member_id ON expense_vouchers (paid_by_member_id);  -- FK → members
CREATE INDEX ix_expense_vouchers__paid_recorded_by ON expense_vouchers (paid_recorded_by);  -- FK → users
CREATE INDEX ix_expense_vouchers__requested_by ON expense_vouchers (requested_by);  -- FK → users
CREATE INDEX ix_expense_vouchers__reversal_entry_id ON expense_vouchers (reversal_entry_id);  -- FK → ledger_entries
-- financial_periods
CREATE INDEX ix_financial_periods__academic_year_id ON financial_periods (academic_year_id);  -- FK → academic_years
CREATE INDEX ix_financial_periods__closed_by ON financial_periods (closed_by);  -- FK → users
CREATE INDEX ix_financial_periods__confirmed_by ON financial_periods (confirmed_by);  -- FK → users
CREATE INDEX ix_financial_periods__reopened_by ON financial_periods (reopened_by);  -- FK → users
-- forum_comments
CREATE INDEX ix_forum_comments__author_member_id ON forum_comments (author_member_id);  -- FK → members
CREATE INDEX ix_forum_comments__parent_id ON forum_comments (parent_id);  -- FK → forum_comments
CREATE INDEX ix_forum_comments__post_id ON forum_comments (post_id);  -- FK → forum_posts
-- forum_posts
CREATE INDEX ix_forum_posts__author_member_id ON forum_posts (author_member_id);  -- FK → members
CREATE INDEX ix_forum_posts__category_id_category_kind ON forum_posts (category_id, category_kind);  -- FK → categories
-- forum_reactions
CREATE INDEX ix_forum_reactions__comment_id ON forum_reactions (comment_id);  -- FK → forum_comments
CREATE INDEX ix_forum_reactions__member_id ON forum_reactions (member_id);  -- FK → members
CREATE INDEX ix_forum_reactions__post_id ON forum_reactions (post_id);  -- FK → forum_posts
-- funds
CREATE INDEX ix_funds__event_id ON funds (event_id);  -- FK → events
-- gpa_snapshots
CREATE INDEX ix_gpa_snapshots__as_of_semester_id ON gpa_snapshots (as_of_semester_id);  -- FK → semesters
-- grade_records
CREATE INDEX ix_grade_records__course_id ON grade_records (course_id);  -- FK → courses
-- grade_scales
CREATE INDEX ix_grade_scales__university_id ON grade_scales (university_id);  -- FK → universities
-- issue_assignments
CREATE INDEX ix_issue_assignments__assigned_by ON issue_assignments (assigned_by);  -- FK → users
CREATE INDEX ix_issue_assignments__assignee_member_id ON issue_assignments (assignee_member_id);  -- FK → members
CREATE INDEX ix_issue_assignments__issue_id ON issue_assignments (issue_id);  -- FK → maintenance_issues
CREATE INDEX ix_issue_assignments__vendor_id ON issue_assignments (vendor_id);  -- FK → vendors
-- issue_status_history
CREATE INDEX ix_issue_status_history__changed_by ON issue_status_history (changed_by);  -- FK → users
CREATE INDEX ix_issue_status_history__issue_id ON issue_status_history (issue_id);  -- FK → maintenance_issues
-- laundry_bookings
CREATE INDEX ix_laundry_bookings__machine_id ON laundry_bookings (machine_id);  -- FK → laundry_machines
-- laundry_machines
CREATE INDEX ix_laundry_machines__room_id ON laundry_machines (room_id);  -- FK → rooms
-- laundry_waitlist
CREATE INDEX ix_laundry_waitlist__machine_id ON laundry_waitlist (machine_id);  -- FK → laundry_machines
-- leave_requests
CREATE INDEX ix_leave_requests__decided_by ON leave_requests (decided_by);  -- FK → users
CREATE INDEX ix_leave_requests__event_id ON leave_requests (event_id);  -- FK → events
CREATE INDEX ix_leave_requests__member_id ON leave_requests (member_id);  -- FK → members
-- ledger_entries
CREATE INDEX ix_ledger_entries__counterparty_member_id ON ledger_entries (counterparty_member_id);  -- FK → members
CREATE INDEX ix_ledger_entries__created_by ON ledger_entries (created_by);  -- FK → users
CREATE INDEX ix_ledger_entries__period_id ON ledger_entries (period_id);  -- FK → financial_periods
CREATE INDEX ix_ledger_entries__reversal_of_id ON ledger_entries (reversal_of_id);  -- FK → ledger_entries
-- liturgy_assignments
CREATE INDEX ix_liturgy_assignments__assigned_by ON liturgy_assignments (assigned_by);  -- FK → users
CREATE INDEX ix_liturgy_assignments__member_id ON liturgy_assignments (member_id);  -- FK → members
CREATE INDEX ix_liturgy_assignments__role_type_id ON liturgy_assignments (role_type_id);  -- FK → liturgy_role_types
-- login_attempts
CREATE INDEX ix_login_attempts__user_id ON login_attempts (user_id);  -- FK → users
-- maintenance_issues
CREATE INDEX ix_maintenance_issues__asset_id ON maintenance_issues (asset_id);  -- FK → assets
CREATE INDEX ix_maintenance_issues__category_id_category_kind ON maintenance_issues (category_id, category_kind);  -- FK → categories
CREATE INDEX ix_maintenance_issues__duplicate_of_id ON maintenance_issues (duplicate_of_id);  -- FK → maintenance_issues
CREATE INDEX ix_maintenance_issues__location_room_id ON maintenance_issues (location_room_id);  -- FK → rooms
CREATE INDEX ix_maintenance_issues__reporter_member_id ON maintenance_issues (reporter_member_id);  -- FK → members
CREATE INDEX ix_maintenance_issues__verified_by ON maintenance_issues (verified_by);  -- FK → users
-- meal_menu_cooks
CREATE INDEX ix_meal_menu_cooks__member_id ON meal_menu_cooks (member_id);  -- FK → members
-- meal_menus
CREATE INDEX ix_meal_menus__approved_by ON meal_menus (approved_by);  -- FK → users
CREATE INDEX ix_meal_menus__created_by ON meal_menus (created_by);  -- FK → users
-- meal_registrations
CREATE INDEX ix_meal_registrations__member_id ON meal_registrations (member_id);  -- FK → members
CREATE INDEX ix_meal_registrations__registered_by ON meal_registrations (registered_by);  -- FK → users
-- media_attachments
CREATE INDEX ix_media_attachments__attached_by ON media_attachments (attached_by);  -- FK → users
CREATE INDEX ix_media_attachments__file_id ON media_attachments (file_id);  -- FK → storage_files
-- member_applications
CREATE INDEX ix_member_applications__referrer_member_id ON member_applications (referrer_member_id);  -- FK → members
CREATE INDEX ix_member_applications__resulting_member_id ON member_applications (resulting_member_id);  -- FK → members
CREATE INDEX ix_member_applications__reviewed_by ON member_applications (reviewed_by);  -- FK → users
CREATE INDEX ix_member_applications__user_id ON member_applications (user_id);  -- FK → users
-- member_guardians
CREATE INDEX ix_member_guardians__member_id ON member_guardians (member_id);  -- FK → members
-- member_positions
CREATE INDEX ix_member_positions__board_term_id ON member_positions (board_term_id);  -- FK → board_terms
CREATE INDEX ix_member_positions__created_by ON member_positions (created_by);  -- FK → users
CREATE INDEX ix_member_positions__position_id ON member_positions (position_id);  -- FK → positions
-- member_unavailability
CREATE INDEX ix_member_unavailability__member_id ON member_unavailability (member_id);  -- FK → members
-- members
CREATE INDEX ix_members__avatar_file_id ON members (avatar_file_id);  -- FK → storage_files
CREATE INDEX ix_members__created_by ON members (created_by);  -- FK → users
-- merit_entries
CREATE INDEX ix_merit_entries__academic_year_id ON merit_entries (academic_year_id);  -- FK → academic_years
CREATE INDEX ix_merit_entries__created_by ON merit_entries (created_by);  -- FK → users
CREATE INDEX ix_merit_entries__rule_code ON merit_entries (rule_code);  -- FK → merit_rules
-- mfa_recovery_codes
CREATE INDEX ix_mfa_recovery_codes__user_id ON mfa_recovery_codes (user_id);  -- FK → users
-- notifications
CREATE INDEX ix_notifications__member_id ON notifications (member_id);  -- FK → members
CREATE INDEX ix_notifications__type_code ON notifications (type_code);  -- FK → notification_types
-- password_resets
CREATE INDEX ix_password_resets__user_id ON password_resets (user_id);  -- FK → users
-- period_fund_balances
CREATE INDEX ix_period_fund_balances__fund_id ON period_fund_balances (fund_id);  -- FK → funds
-- period_reconciliations
CREATE INDEX ix_period_reconciliations__fund_id ON period_reconciliations (fund_id);  -- FK → funds
CREATE INDEX ix_period_reconciliations__reconciled_by ON period_reconciliations (reconciled_by);  -- FK → users
-- photo_likes
CREATE INDEX ix_photo_likes__member_id ON photo_likes (member_id);  -- FK → members
-- policy_acknowledgements
CREATE INDEX ix_policy_acknowledgements__member_id ON policy_acknowledgements (member_id);  -- FK → members
-- policy_documents
CREATE INDEX ix_policy_documents__published_by ON policy_documents (published_by);  -- FK → users
-- poll_votes
CREATE INDEX ix_poll_votes__member_id ON poll_votes (member_id);  -- FK → members
CREATE INDEX ix_poll_votes__option_id_poll_id ON poll_votes (option_id, poll_id);  -- FK → poll_options
-- polls
CREATE INDEX ix_polls__created_by ON polls (created_by);  -- FK → users
CREATE INDEX ix_polls__event_id ON polls (event_id);  -- FK → events
-- prayer_intention_authors
CREATE INDEX ix_prayer_intention_authors__author_member_id ON prayer_intention_authors (author_member_id);  -- FK → members
-- prayer_intentions
CREATE INDEX ix_prayer_intentions__author_member_id ON prayer_intentions (author_member_id);  -- FK → members
-- prayer_responses
CREATE INDEX ix_prayer_responses__member_id ON prayer_responses (member_id);  -- FK → members
-- push_subscriptions
CREATE INDEX ix_push_subscriptions__session_id ON push_subscriptions (session_id);  -- FK → auth_sessions
CREATE INDEX ix_push_subscriptions__user_id ON push_subscriptions (user_id);  -- FK → users
-- qr_sessions
CREATE INDEX ix_qr_sessions__created_by ON qr_sessions (created_by);  -- FK → users
CREATE INDEX ix_qr_sessions__event_id ON qr_sessions (event_id);  -- FK → events
-- reflections
CREATE INDEX ix_reflections__author_member_id ON reflections (author_member_id);  -- FK → members
-- refresh_tokens
CREATE INDEX ix_refresh_tokens__replaced_by_id ON refresh_tokens (replaced_by_id);  -- FK → refresh_tokens
CREATE INDEX ix_refresh_tokens__session_id ON refresh_tokens (session_id);  -- FK → auth_sessions
CREATE INDEX ix_refresh_tokens__user_id ON refresh_tokens (user_id);  -- FK → users
-- repair_costs
CREATE INDEX ix_repair_costs__created_by ON repair_costs (created_by);  -- FK → users
CREATE INDEX ix_repair_costs__issue_id ON repair_costs (issue_id);  -- FK → maintenance_issues
CREATE INDEX ix_repair_costs__vendor_id ON repair_costs (vendor_id);  -- FK → vendors
-- role_delegations
CREATE INDEX ix_role_delegations__approved_by ON role_delegations (approved_by);  -- FK → users
CREATE INDEX ix_role_delegations__delegate_user_id ON role_delegations (delegate_user_id);  -- FK → users
CREATE INDEX ix_role_delegations__delegator_user_id ON role_delegations (delegator_user_id);  -- FK → users
CREATE INDEX ix_role_delegations__revoked_by ON role_delegations (revoked_by);  -- FK → users
CREATE INDEX ix_role_delegations__role_id ON role_delegations (role_id);  -- FK → roles
-- role_permissions
CREATE INDEX ix_role_permissions__permission_code ON role_permissions (permission_code);  -- FK → permissions
-- room_amenities
CREATE INDEX ix_room_amenities__amenity_id ON room_amenities (amenity_id);  -- FK → amenities
-- room_assignments
CREATE INDEX ix_room_assignments__academic_year_id ON room_assignments (academic_year_id);  -- FK → academic_years
CREATE INDEX ix_room_assignments__assigned_by ON room_assignments (assigned_by);  -- FK → users
CREATE INDEX ix_room_assignments__ended_by ON room_assignments (ended_by);  -- FK → users
CREATE INDEX ix_room_assignments__member_id ON room_assignments (member_id);  -- FK → members
CREATE INDEX ix_room_assignments__room_id ON room_assignments (room_id);  -- FK → rooms
-- rooms
CREATE INDEX ix_rooms__floor_id ON rooms (floor_id);  -- FK → floors
-- settings
CREATE INDEX ix_settings__updated_by ON settings (updated_by);  -- FK → users
CREATE INDEX ix_settings__write_permission ON settings (write_permission);  -- FK → permissions
-- storage_files
CREATE INDEX ix_storage_files__uploaded_by ON storage_files (uploaded_by);  -- FK → users
-- student_profiles
CREATE INDEX ix_student_profiles__member_id ON student_profiles (member_id);  -- FK → members
CREATE INDEX ix_student_profiles__university_id ON student_profiles (university_id);  -- FK → universities
-- study_goals
CREATE INDEX ix_study_goals__semester_id ON study_goals (semester_id);  -- FK → semesters
-- tutoring_matches
CREATE INDEX ix_tutoring_matches__mentee_member_id ON tutoring_matches (mentee_member_id);  -- FK → members
CREATE INDEX ix_tutoring_matches__offer_id ON tutoring_matches (offer_id);  -- FK → tutoring_offers
CREATE INDEX ix_tutoring_matches__proposed_by ON tutoring_matches (proposed_by);  -- FK → users
CREATE INDEX ix_tutoring_matches__request_id ON tutoring_matches (request_id);  -- FK → tutoring_requests
CREATE INDEX ix_tutoring_matches__tutor_member_id ON tutoring_matches (tutor_member_id);  -- FK → members
-- tutoring_offers
CREATE INDEX ix_tutoring_offers__course_id ON tutoring_offers (course_id);  -- FK → courses
CREATE INDEX ix_tutoring_offers__tutor_member_id ON tutoring_offers (tutor_member_id);  -- FK → members
-- tutoring_requests
CREATE INDEX ix_tutoring_requests__course_id ON tutoring_requests (course_id);  -- FK → courses
CREATE INDEX ix_tutoring_requests__mentee_member_id ON tutoring_requests (mentee_member_id);  -- FK → members
-- tutoring_sessions
CREATE INDEX ix_tutoring_sessions__match_id ON tutoring_sessions (match_id);  -- FK → tutoring_matches
-- user_roles
CREATE INDEX ix_user_roles__board_term_id ON user_roles (board_term_id);  -- FK → board_terms
CREATE INDEX ix_user_roles__granted_by ON user_roles (granted_by);  -- FK → users
CREATE INDEX ix_user_roles__revoked_by ON user_roles (revoked_by);  -- FK → users
CREATE INDEX ix_user_roles__role_id ON user_roles (role_id);  -- FK → roles
CREATE INDEX ix_user_roles__user_id ON user_roles (user_id);  -- FK → users
