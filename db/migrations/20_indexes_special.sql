-- =====================================================================
-- KHỐI 4.4 — INDEX (1/2): UNIQUE MỘT PHẦN, TRUY VẤN NÓNG, TÌM KIẾM KHÔNG DẤU
-- (Phần 2/2: index B-tree cho MỌI khóa ngoại — file 21_indexes_fk.sql — sinh từ danh mục hệ thống để không bỏ sót.)
-- Quy ước tên: ux_ = unique, ix_ = thường; hai dấu gạch dưới tách bảng và mục đích.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. UNIQUE MỘT PHẦN — giữ ràng buộc duy nhất khi xóa mềm (WHERE deleted_at IS NULL) và cho điều kiện nghiệp vụ
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX ux_users__email ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX ux_users__phone ON users (phone_e164) WHERE deleted_at IS NULL AND phone_e164 IS NOT NULL;
COMMENT ON INDEX ux_users__email IS 'Email duy nhất giữa các tài khoản chưa xóa mềm (citext ⇒ không phân biệt hoa/thường).';

CREATE UNIQUE INDEX ux_member_private__nid_bidx ON member_private_details (national_id_bidx) WHERE national_id_bidx IS NOT NULL;
COMMENT ON INDEX ux_member_private__nid_bidx IS 'Chống trùng CCCD mà không cần giải mã: so khớp blind index (HMAC-SHA256).';

CREATE UNIQUE INDEX ux_student_profiles__current ON student_profiles (member_id) WHERE is_current AND deleted_at IS NULL;
CREATE UNIQUE INDEX ux_student_profiles__code ON student_profiles (university_id, student_code) WHERE student_code IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_academic_years__current ON academic_years ((true)) WHERE is_current;
COMMENT ON INDEX ux_academic_years__current IS 'Chỉ cho phép đúng một năm học hiện hành (chỉ mục trên hằng số, một phần theo is_current).';

CREATE UNIQUE INDEX ux_board_terms__active ON board_terms ((true)) WHERE status = 'active';
COMMENT ON INDEX ux_board_terms__active IS 'Chỉ một nhiệm kỳ Ban điều hành ở trạng thái active tại một thời điểm.';

CREATE UNIQUE INDEX ux_categories__kind_code ON categories (kind, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_floors__code ON floors (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_floors__level ON floors (level) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_rooms__code ON rooms (code) WHERE deleted_at IS NULL;
COMMENT ON INDEX ux_rooms__code IS 'Mã phòng (P.1) duy nhất giữa các phòng chưa xóa — khắc phục lỗi FE tự sinh id có thể trùng sau khi xóa phòng.';
CREATE UNIQUE INDEX ux_assets__asset_tag ON assets (asset_tag) WHERE deleted_at IS NULL;
COMMENT ON INDEX ux_assets__asset_tag IS 'Mã tài sản (nhãn dán trên thiết bị, ví dụ PRJ-001) duy nhất giữa các tài sản chưa xóa mềm; mã của tài sản đã xóa mềm được dùng lại.';

CREATE UNIQUE INDEX ux_consents__active ON consents (member_id, purpose_code) WHERE withdrawn_at IS NULL;
COMMENT ON INDEX ux_consents__active IS 'Mỗi (thành viên, mục đích) chỉ có một đồng ý còn hiệu lực; rút lại rồi đồng ý lại = dòng mới.';

CREATE UNIQUE INDEX ux_policy_documents__current ON policy_documents (slug) WHERE is_current;
CREATE UNIQUE INDEX ux_qr_sessions__active_per_event ON qr_sessions (event_id) WHERE status = 'active';
COMMENT ON INDEX ux_qr_sessions__active_per_event IS 'Một sự kiện chỉ có tối đa một phiên QR đang hoạt động.';

CREATE UNIQUE INDEX ux_contribution_plans__monthly ON contribution_plans (fee_type, period_month) WHERE fee_type = 'monthly_dues' AND status <> 'cancelled';
COMMENT ON INDEX ux_contribution_plans__monthly IS 'Mỗi tháng chỉ một kế hoạch thu quỹ sinh hoạt (BR-FIN-13) — tránh sinh khoản phải thu trùng.';

CREATE UNIQUE INDEX ux_ledger_entries__reversal ON ledger_entries (reversal_of_id) WHERE reversal_of_id IS NOT NULL;
COMMENT ON INDEX ux_ledger_entries__reversal IS 'Một bút toán chỉ được đảo đúng một lần.';

CREATE UNIQUE INDEX ux_merit_entries__source ON merit_entries (rule_code, source_table, source_id, member_id) WHERE source_id IS NOT NULL;
COMMENT ON INDEX ux_merit_entries__source IS 'Một sự kiện nguồn (ca trực, buổi kèm, điểm danh) chỉ sinh điểm một lần cho mỗi người và mỗi quy tắc.';

CREATE UNIQUE INDEX ux_forum_reactions__post ON forum_reactions (post_id, member_id, kind) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX ux_forum_reactions__comment ON forum_reactions (comment_id, member_id, kind) WHERE comment_id IS NOT NULL;

-- Idempotency ở mức bảng nghiệp vụ: gửi lại cùng client_request_id (mạng yếu, bấm đúp) không tạo bản ghi thứ hai
CREATE UNIQUE INDEX ux_ledger_entries__client_req        ON ledger_entries         (created_by, client_request_id)              WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_expense_vouchers__client_req      ON expense_vouchers       (requested_by, client_request_id)            WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_contribution_payments__client_req ON contribution_payments  (received_by, client_request_id)             WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_duty_checkins__client_req         ON duty_checkins          (checked_in_by_member_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_storage_files__client_req         ON storage_files          (uploaded_by, client_request_id)             WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_leave_requests__client_req        ON leave_requests         (member_id, client_request_id)               WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_maintenance_issues__client_req    ON maintenance_issues     (reporter_member_id, client_request_id)      WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_room_assignments__client_req      ON room_assignments       (assigned_by, client_request_id)             WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_laundry_bookings__client_req      ON laundry_bookings       (member_id, client_request_id)               WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- B. INDEX CHO TRUY VẤN NÓNG (partial index nhỏ, khớp đúng điều kiện WHERE của màn hình)
-- ---------------------------------------------------------------------
-- Tài chính
CREATE INDEX ix_expense_vouchers__pending   ON expense_vouchers (submitted_at) WHERE status = 'pending_approval';
CREATE INDEX ix_expense_vouchers__approved  ON expense_vouchers (approved_at)  WHERE status = 'approved';
CREATE INDEX ix_expense_vouchers__date      ON expense_vouchers (expense_date DESC, created_at DESC);
CREATE INDEX ix_ledger_entries__fund_date   ON ledger_entries (fund_id, entry_date, fund_seq);
CREATE INDEX ix_ledger_entries__source      ON ledger_entries (source_type, source_id);
CREATE INDEX ix_ledger_entries__member      ON ledger_entries (counterparty_member_id, entry_date DESC) WHERE counterparty_member_id IS NOT NULL;
CREATE INDEX ix_contributions__open         ON contributions (due_date) WHERE status IN ('unpaid', 'partial');
COMMENT ON INDEX ix_contributions__open IS 'Danh sách còn nợ/quá hạn (nhắc đóng quỹ, báo cáo nợ) — chỉ chứa các dòng chưa đóng đủ nên nhỏ dù bảng lớn.';
CREATE INDEX ix_contribution_plans__period  ON contribution_plans (period_month DESC) WHERE status <> 'cancelled';
CREATE INDEX ix_bank_statement_lines__open  ON bank_statement_lines (fund_id, txn_date) WHERE match_status = 'unmatched';
-- D-06: nhập lại cùng một sao kê (hoặc webhook gửi lại) không tạo dòng trùng; dòng không có mã tham chiếu không bị ràng buộc
CREATE UNIQUE INDEX ux_bank_statement_lines__ref ON bank_statement_lines (fund_id, bank_reference, txn_date, direction, amount_vnd) WHERE bank_reference IS NOT NULL;
-- BR-FIN-40: mỗi bút toán sổ cái chỉ được ghép với tối đa một dòng sao kê
CREATE UNIQUE INDEX ux_bank_statement_lines__ledger ON bank_statement_lines (matched_ledger_entry_id) WHERE matched_ledger_entry_id IS NOT NULL;

-- Trực nhật
CREATE INDEX ix_duty_assignments__open      ON duty_assignments (duty_date, shift_id) WHERE status IN ('scheduled', 'checked_in', 'rework_required');
CREATE INDEX ix_duty_assignments__to_review ON duty_assignments (duty_date) WHERE status = 'checked_in';
CREATE INDEX ix_duty_checkins__phash        ON storage_files (phash) WHERE phash IS NOT NULL AND bucket = 'cleaning-evidence';
COMMENT ON INDEX ix_duty_checkins__phash IS 'Hỗ trợ so khớp ảnh gần giống (pHash) của bucket cleaning-evidence khi chống tái sử dụng ảnh.';
CREATE INDEX ix_merit_entries__member_date  ON merit_entries (member_id, occurred_on DESC);
CREATE INDEX ix_member_unavailability__range ON member_unavailability USING gist (member_id, tstzrange(starts_at, ends_at));
COMMENT ON INDEX ix_member_unavailability__range IS 'Tìm nhanh khoảng bận chồng lên ca trực (btree_gist: member_id "=" + tstzrange "&&").';

-- Sự kiện & điểm danh
CREATE INDEX ix_events__starts              ON events (starts_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_events__attendance_open     ON events (starts_at) WHERE requires_attendance AND status IN ('scheduled', 'ongoing');
CREATE INDEX ix_attendance_records__event   ON attendance_records (event_id, status);
CREATE INDEX ix_leave_requests__open        ON leave_requests (starts_at) WHERE status IN ('pending', 'approved');
CREATE INDEX ix_leave_requests__range       ON leave_requests USING gist (member_id, tstzrange(starts_at, ends_at)) WHERE status = 'approved';
CREATE INDEX ix_polls__open                 ON polls (closes_at) WHERE status = 'open';

-- Nhà, phòng, tài sản, sự cố
CREATE INDEX ix_room_assignments__room_now   ON room_assignments (room_id) WHERE ends_on IS NULL;
CREATE INDEX ix_room_assignments__member_now ON room_assignments (member_id) WHERE ends_on IS NULL;
CREATE INDEX ix_maintenance_issues__open     ON maintenance_issues (urgency, sla_due_at) WHERE status IN ('new', 'in_progress', 'waiting_parts');
COMMENT ON INDEX ix_maintenance_issues__open IS 'Hàng đợi sự cố mở sắp theo mức khẩn rồi hạn SLA; cũng dùng cho đếm badge chấm đỏ ở thanh bên.';
CREATE INDEX ix_asset_maintenance_schedules__due ON asset_maintenance_schedules (next_due_on) WHERE is_active;
CREATE UNIQUE INDEX ux_issue_assignments__one_lead ON issue_assignments (issue_id) WHERE role_label = 'lead' AND unassigned_at IS NULL;
COMMENT ON INDEX ux_issue_assignments__one_lead IS 'Mỗi sự cố chỉ có MỘT người/thợ phụ trách chính (lead) đang hiệu lực; có thể có nhiều helper.';
CREATE INDEX ix_asset_loans__open            ON asset_loans (due_at) WHERE status = 'open';
CREATE INDEX ix_assets__loanable             ON assets (name) WHERE is_loanable AND deleted_at IS NULL;

-- Cộng đoàn
CREATE INDEX ix_announcements__feed   ON announcements (is_pinned DESC, published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX ix_forum_posts__feed     ON forum_posts (is_pinned DESC, last_activity_at DESC) WHERE status <> 'hidden' AND deleted_at IS NULL;
CREATE INDEX ix_forum_comments__post  ON forum_comments (post_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_albums__feed          ON albums (taken_on DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX ix_album_photos__album   ON album_photos (album_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX ix_prayer_intentions__feed ON prayer_intentions (created_at DESC) WHERE visibility = 'published' AND status = 'open';
CREATE INDEX ix_laundry_bookings__upcoming ON laundry_bookings (starts_at) WHERE status IN ('booked', 'checked_in');
CREATE INDEX ix_laundry_bookings__member   ON laundry_bookings (member_id, starts_at DESC);
CREATE INDEX ix_meal_registrations__menu   ON meal_registrations (menu_id) WHERE will_eat;
CREATE INDEX ix_content_reports__open      ON content_reports (created_at) WHERE status = 'open';

-- Thông báo
CREATE INDEX ix_notifications__inbox   ON notifications (member_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX ix_notifications__unread  ON notifications (member_id) WHERE read_at IS NULL AND archived_at IS NULL;
COMMENT ON INDEX ix_notifications__unread IS 'Đếm nhanh số thông báo chưa đọc (chấm đỏ/chuông) — index chỉ chứa dòng chưa đọc.';
CREATE INDEX ix_notification_outbox__due ON notification_outbox (next_attempt_at) WHERE status IN ('queued', 'sending');

-- Xác thực & phiên
CREATE INDEX ix_user_roles__active           ON user_roles (user_id, role_id) WHERE revoked_at IS NULL;
COMMENT ON INDEX ix_user_roles__active IS 'Truy vấn quyền hiệu lực của người dùng — được gọi trong MỌI chính sách RLS nên phải rất nhanh.';
CREATE INDEX ix_role_delegations__delegate   ON role_delegations (delegate_user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_sessions__user_active   ON auth_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_refresh_tokens__expiry       ON refresh_tokens (expires_at);
CREATE INDEX ix_login_attempts__identifier   ON login_attempts (identifier, attempted_at DESC);
CREATE INDEX ix_login_attempts__ip           ON login_attempts (ip, attempted_at DESC);
CREATE INDEX ix_idempotency_keys__expiry     ON idempotency_keys (expires_at);

-- Tệp
CREATE INDEX ix_storage_files__sha256        ON storage_files (bucket, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX ix_storage_files__pending       ON storage_files (created_at) WHERE status IN ('pending_upload', 'uploaded', 'processing');
CREATE INDEX ix_storage_files__orphans       ON storage_files (created_at) WHERE attached_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_media_attachments__entity    ON media_attachments (entity_type, entity_id);

-- Audit (đặt trên bảng cha ⇒ tự tạo trên từng phân vùng)
CREATE INDEX ix_audit_logs__entity           ON audit_logs (entity_table, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_logs__actor            ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX ix_audit_logs__action           ON audit_logs (action, occurred_at DESC) WHERE action IN ('READ_SENSITIVE', 'EXPORT', 'PERMISSION_CHANGE', 'PERIOD_CLOSE', 'PERIOD_REOPEN', 'LOGIN_FAILURE');

-- AI
CREATE INDEX ix_ai_jobs__created             ON ai_jobs (created_at DESC);
CREATE INDEX ix_ai_suggestions__pending      ON ai_suggestions (task_code, created_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- C. TÌM KIẾM TIẾNG VIỆT KHÔNG DẤU: trigram (khớp mờ tên người/tiêu đề) + FTS 'simple' trên văn bản đã bỏ dấu
-- ---------------------------------------------------------------------
CREATE INDEX ix_members__search ON members USING gin (app.norm_text(full_name || ' ' || display_name) gin_trgm_ops) WHERE deleted_at IS NULL;
COMMENT ON INDEX ix_members__search IS 'Tìm thành viên theo tên không dấu ("nguyen minh tuan" khớp "Nguyễn Minh Tuấn"); truy vấn: WHERE app.norm_text(full_name || '' '' || display_name) ILIKE ''%'' || app.norm_text(:q) || ''%''.';
CREATE INDEX ix_courses__name_trgm       ON courses       USING gin (name_norm gin_trgm_ops);
CREATE INDEX ix_assets__name_trgm        ON assets        USING gin (app.norm_text(name) gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX ix_announcements__fts       ON announcements USING gin (to_tsvector('simple', app.immutable_unaccent(title || ' ' || content))) WHERE deleted_at IS NULL;
CREATE INDEX ix_forum_posts__fts         ON forum_posts   USING gin (to_tsvector('simple', app.immutable_unaccent(title || ' ' || content))) WHERE deleted_at IS NULL;
CREATE INDEX ix_albums__title_trgm       ON albums        USING gin (app.norm_text(title) gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX ix_albums__tags             ON albums        USING gin (tags) WHERE deleted_at IS NULL;
CREATE INDEX ix_policy_documents__fts    ON policy_documents USING gin (to_tsvector('simple', app.immutable_unaccent(title || ' ' || content_md)));
CREATE INDEX ix_maintenance_issues__title_trgm ON maintenance_issues USING gin (app.norm_text(title) gin_trgm_ops);
