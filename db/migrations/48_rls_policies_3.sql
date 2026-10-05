-- =====================================================================
-- KHỐI 4.6 — ROW-LEVEL SECURITY (3/4, tiếp): PHẦN 3 — cơ sở vật chất, cộng đoàn, nền tảng
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.6.2.9  Cơ sở vật chất
-- ---------------------------------------------------------------------
CREATE POLICY vendors__select ON vendors FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND (SELECT app.has_any_permission(ARRAY['vendor.manage', 'issue.triage'])));
CREATE POLICY vendors__write ON vendors FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('vendor.manage'))) WITH CHECK ((SELECT app.has_permission('vendor.manage')));

CREATE POLICY assets__select ON assets FOR SELECT TO luuxa_app USING (deleted_at IS NULL AND (SELECT app.has_permission('asset.read')));
CREATE POLICY assets__write  ON assets FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('asset.manage'))) WITH CHECK ((SELECT app.has_permission('asset.manage')));
CREATE POLICY asset_maintenance_schedules__select ON asset_maintenance_schedules FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('asset.read')));
CREATE POLICY asset_maintenance_schedules__write  ON asset_maintenance_schedules FOR ALL    TO luuxa_app
  USING ((SELECT app.has_permission('asset.manage'))) WITH CHECK ((SELECT app.has_permission('asset.manage')));

CREATE POLICY asset_loans__select ON asset_loans FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('asset.read')));
CREATE POLICY asset_loans__insert ON asset_loans FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(borrower_member_id)) OR (SELECT app.has_permission('asset.manage')));
CREATE POLICY asset_loans__update ON asset_loans FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(borrower_member_id)) OR (SELECT app.has_permission('asset.manage')))
  WITH CHECK ((SELECT app.is_self(borrower_member_id)) OR (SELECT app.has_permission('asset.manage')));

CREATE POLICY maintenance_issues__select ON maintenance_issues FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('issue.read')));
CREATE POLICY maintenance_issues__insert ON maintenance_issues FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(reporter_member_id)) AND (SELECT app.has_permission('issue.create')));
CREATE POLICY maintenance_issues__update ON maintenance_issues FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(reporter_member_id)) OR (SELECT app.has_any_permission(ARRAY['issue.triage', 'issue.resolve'])))
  WITH CHECK ((SELECT app.is_self(reporter_member_id)) OR (SELECT app.has_any_permission(ARRAY['issue.triage', 'issue.resolve'])));
CREATE POLICY issue_assignments__select ON issue_assignments FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('issue.read')));
CREATE POLICY issue_assignments__write  ON issue_assignments FOR ALL    TO luuxa_app
  USING ((SELECT app.has_permission('issue.triage'))) WITH CHECK ((SELECT app.has_permission('issue.triage')));
CREATE POLICY issue_status_history__select ON issue_status_history FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM maintenance_issues i WHERE i.id = issue_id));
CREATE POLICY repair_costs__select ON repair_costs FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('issue.read')));
-- Người dùng chỉ ghi DỰ TOÁN (estimate); chi phí thực (actual) do trigger tự sinh khi phiếu chi gắn sự cố chuyển sang paid
CREATE POLICY repair_costs__write  ON repair_costs FOR ALL    TO luuxa_app
  USING (cost_kind = 'estimate' AND (SELECT app.has_permission('issue.cost.propose')))
  WITH CHECK (cost_kind = 'estimate' AND (SELECT app.has_permission('issue.cost.propose')));

-- ---------------------------------------------------------------------
-- 4.6.2.10  Cộng đoàn: khoảnh khắc, thông báo, diễn đàn, cầu nguyện
-- ---------------------------------------------------------------------
-- Album: chỉ thành viên (có hồ sơ) mới xem được album công khai trong cộng đoàn — phiên không gắn user hay tài khoản kỹ thuật không có hồ sơ thì không (ảnh có người);
-- tác giả và người kiểm duyệt (album.moderate) thấy cả album ẩn/riêng tư và album họ đã xóa mềm (xóa mềm = UPDATE … SET deleted_at;
-- PostgreSQL áp chính sách SELECT lên cả dòng MỚI của UPDATE — xem ghi chú "Xóa mềm qua UPDATE" ở phần thông báo bên dưới). API lọc deleted_at IS NULL khi liệt kê.
CREATE POLICY albums__select ON albums FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('album.moderate')))
         AND ((status = 'published' AND (SELECT app.current_member_id()) IS NOT NULL
               AND (visibility = 'community'
                    OR (visibility = 'leadership' AND (SELECT app.has_any_permission(ARRAY['album.moderate', 'member.private.read']))))
              OR author_member_id = (SELECT app.current_member_id())
              OR (SELECT app.has_permission('album.moderate')))));
CREATE POLICY albums__insert ON albums FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(author_member_id)) AND (SELECT app.has_permission('album.create')));
CREATE POLICY albums__update ON albums FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('album.moderate')))
  WITH CHECK ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('album.moderate')));

CREATE POLICY album_photos__select ON album_photos FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR (SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate')))
         AND EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id)
         AND (status = 'published' OR (SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate'))));
CREATE POLICY album_photos__insert ON album_photos FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(uploaded_by_member_id))
              AND EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id AND (a.author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('album.moderate')))));
CREATE POLICY album_photos__update ON album_photos FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate')))
  WITH CHECK ((SELECT app.is_self(uploaded_by_member_id)) OR (SELECT app.has_permission('album.moderate')));

CREATE POLICY album_member_tags__select ON album_member_tags FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id)
         AND (status = 'accepted' OR (SELECT app.is_self(member_id)) OR (SELECT app.is_self(tagged_by_member_id)) OR (SELECT app.has_permission('album.moderate'))));
CREATE POLICY album_member_tags__insert ON album_member_tags FOR INSERT TO luuxa_app
  WITH CHECK (EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id AND (a.author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('album.moderate')))));
CREATE POLICY album_member_tags__update ON album_member_tags FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('album.moderate'))
         OR EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id AND a.author_member_id = (SELECT app.current_member_id())))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('album.moderate'))
         OR EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id AND a.author_member_id = (SELECT app.current_member_id())));
CREATE POLICY album_member_tags__delete ON album_member_tags FOR DELETE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('album.moderate'))
         OR EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id AND a.author_member_id = (SELECT app.current_member_id())));

CREATE POLICY album_likes__select ON album_likes FOR SELECT TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY album_likes__insert ON album_likes FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(member_id)) AND EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id));
CREATE POLICY album_likes__delete ON album_likes FOR DELETE TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY photo_likes__select ON photo_likes FOR SELECT TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY photo_likes__insert ON photo_likes FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(member_id)) AND EXISTS (SELECT 1 FROM album_photos p WHERE p.id = photo_id));
CREATE POLICY photo_likes__delete ON photo_likes FOR DELETE TO luuxa_app USING ((SELECT app.is_self(member_id)));

-- Xóa mềm qua UPDATE … SET deleted_at: PostgreSQL áp chính sách SELECT lên cả dòng MỚI của UPDATE nên dòng vừa xóa mềm phải còn "nhìn thấy được"
-- với chính người xóa (tác giả / người kiểm duyệt), giống members__select__directory; người khác không thấy. API lọc deleted_at IS NULL khi liệt kê.
CREATE POLICY announcements__select ON announcements FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('announcement.read'))
         AND (deleted_at IS NULL OR author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('announcement.pin')))
         AND ((status = 'published' AND (expires_at IS NULL OR expires_at > now()) AND (SELECT app.is_announcement_target(id)))
              OR author_member_id = (SELECT app.current_member_id())
              OR (SELECT app.has_permission('announcement.pin'))));
CREATE POLICY announcements__insert ON announcements FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(author_member_id)) AND (SELECT app.has_permission('announcement.create')));
CREATE POLICY announcements__update ON announcements FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('announcement.pin')))
  WITH CHECK ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('announcement.pin')));
CREATE POLICY announcement_targets__select ON announcement_targets FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM announcements a WHERE a.id = announcement_id AND (a.author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('announcement.pin')))));
CREATE POLICY announcement_targets__write ON announcement_targets FOR ALL TO luuxa_app
  USING (EXISTS (SELECT 1 FROM announcements a WHERE a.id = announcement_id AND (a.author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('announcement.pin')))))
  WITH CHECK (EXISTS (SELECT 1 FROM announcements a WHERE a.id = announcement_id AND (a.author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('announcement.pin')))));
CREATE POLICY announcement_reads__select ON announcement_reads FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id))
         OR EXISTS (SELECT 1 FROM announcements a WHERE a.id = announcement_id AND (a.author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('announcement.pin')))));
CREATE POLICY announcement_reads__insert ON announcement_reads FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(member_id)));
CREATE POLICY announcement_reads__update ON announcement_reads FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));

CREATE POLICY forum_posts__select ON forum_posts FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('forum.post'))
         AND (deleted_at IS NULL OR (SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate')))
         AND (status <> 'hidden' OR (SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate'))));
CREATE POLICY forum_posts__insert ON forum_posts FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(author_member_id)) AND (SELECT app.has_permission('forum.post')));
CREATE POLICY forum_posts__update ON forum_posts FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate')))
  WITH CHECK ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate')));
CREATE POLICY forum_comments__select ON forum_comments FOR SELECT TO luuxa_app
  USING ((deleted_at IS NULL OR (SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate')))
         AND EXISTS (SELECT 1 FROM forum_posts p WHERE p.id = post_id)
         AND (status <> 'hidden' OR (SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate'))));
CREATE POLICY forum_comments__insert ON forum_comments FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(author_member_id)) AND (SELECT app.has_permission('forum.post')));
CREATE POLICY forum_comments__update ON forum_comments FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate')))
  WITH CHECK ((SELECT app.is_self(author_member_id)) OR (SELECT app.has_permission('forum.moderate')));
CREATE POLICY forum_reactions__select ON forum_reactions FOR SELECT TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY forum_reactions__insert ON forum_reactions FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('forum.post')));
CREATE POLICY forum_reactions__delete ON forum_reactions FOR DELETE TO luuxa_app USING ((SELECT app.is_self(member_id)));

CREATE POLICY content_reports__select ON content_reports FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(reporter_member_id)) OR (SELECT app.has_any_permission(ARRAY['forum.moderate', 'prayer.moderate', 'album.moderate'])));
CREATE POLICY content_reports__insert ON content_reports FOR INSERT TO luuxa_app WITH CHECK ((SELECT app.is_self(reporter_member_id)) AND status = 'open');
CREATE POLICY content_reports__update ON content_reports FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_any_permission(ARRAY['forum.moderate', 'prayer.moderate', 'album.moderate'])))
  WITH CHECK ((SELECT app.has_any_permission(ARRAY['forum.moderate', 'prayer.moderate', 'album.moderate'])));

CREATE POLICY prayer_intentions__select ON prayer_intentions FOR SELECT TO luuxa_app
  USING ((SELECT app.has_permission('prayer.post'))
         AND (visibility = 'published' OR author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('prayer.moderate'))));
CREATE POLICY prayer_intentions__update ON prayer_intentions FOR UPDATE TO luuxa_app
  USING (author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('prayer.moderate')))
  WITH CHECK (author_member_id = (SELECT app.current_member_id()) OR (SELECT app.has_permission('prayer.moderate')));
-- INSERT chỉ qua app.fn_post_prayer (SECURITY DEFINER) để bảo đảm ẩn danh đúng cách
CREATE POLICY prayer_intention_authors__select__own ON prayer_intention_authors FOR SELECT TO luuxa_app USING ((SELECT app.is_self(author_member_id)));
CREATE POLICY prayer_responses__select ON prayer_responses FOR SELECT TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY prayer_responses__insert ON prayer_responses FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND EXISTS (SELECT 1 FROM prayer_intentions p WHERE p.id = intention_id));
CREATE POLICY prayer_responses__delete ON prayer_responses FOR DELETE TO luuxa_app USING ((SELECT app.is_self(member_id)));

CREATE POLICY laundry_machines__select ON laundry_machines FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY laundry_machines__write  ON laundry_machines FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('laundry.manage'))) WITH CHECK ((SELECT app.has_permission('laundry.manage')));
CREATE POLICY laundry_bookings__select ON laundry_bookings FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('house.read')));
CREATE POLICY laundry_bookings__insert ON laundry_bookings FOR INSERT TO luuxa_app
  WITH CHECK (((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('laundry.book'))) OR (SELECT app.has_permission('laundry.manage')));
CREATE POLICY laundry_bookings__update ON laundry_bookings FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('laundry.manage')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('laundry.manage')));
CREATE POLICY laundry_waitlist__own ON laundry_waitlist FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('laundry.manage')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('laundry.manage')));

CREATE POLICY meal_menus__select ON meal_menus FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY meal_menus__write  ON meal_menus FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));
CREATE POLICY meal_menu_cooks__select ON meal_menu_cooks FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY meal_menu_cooks__write  ON meal_menu_cooks FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));
CREATE POLICY meal_registrations__select ON meal_registrations FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('meal.manage')));
CREATE POLICY meal_registrations__insert ON meal_registrations FOR INSERT TO luuxa_app
  WITH CHECK (((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('meal.register'))) OR (SELECT app.has_permission('meal.manage')));
CREATE POLICY meal_registrations__update ON meal_registrations FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('meal.manage')))
  WITH CHECK ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('meal.manage')));
CREATE POLICY pantry_items__select ON pantry_items FOR SELECT TO luuxa_app USING ((SELECT app.is_authenticated()));
CREATE POLICY pantry_items__write  ON pantry_items FOR ALL    TO luuxa_app USING ((SELECT app.has_permission('meal.manage'))) WITH CHECK ((SELECT app.has_permission('meal.manage')));

CREATE POLICY policy_documents__select ON policy_documents FOR SELECT TO luuxa_app
  USING ((SELECT app.is_authenticated()) AND (is_current OR (SELECT app.has_permission('policy.manage'))));
CREATE POLICY policy_documents__write ON policy_documents FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('policy.manage'))) WITH CHECK ((SELECT app.has_permission('policy.manage')));
CREATE POLICY policy_acknowledgements__select ON policy_acknowledgements FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('policy.manage')));
CREATE POLICY policy_acknowledgements__insert ON policy_acknowledgements FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('policy.acknowledge')));

-- ---------------------------------------------------------------------
-- 4.6.2.11  Nền tảng: tệp, nhật ký, idempotency, thông báo cá nhân, AI
-- ---------------------------------------------------------------------
CREATE POLICY storage_files__select ON storage_files FOR SELECT TO luuxa_app
  USING (deleted_at IS NULL AND (
         uploaded_by = (SELECT app.current_user_id())
      OR EXISTS (SELECT 1 FROM media_attachments ma WHERE ma.file_id = storage_files.id)
      OR EXISTS (SELECT 1 FROM album_photos ap WHERE ap.file_id = storage_files.id)
      OR EXISTS (SELECT 1 FROM albums a WHERE a.cover_file_id = storage_files.id)
      OR EXISTS (SELECT 1 FROM members m WHERE m.avatar_file_id = storage_files.id)));
CREATE POLICY storage_files__insert ON storage_files FOR INSERT TO luuxa_app
  WITH CHECK (uploaded_by = (SELECT app.current_user_id()) AND (SELECT app.has_permission('storage.upload')) AND status = 'pending_upload');
CREATE POLICY storage_files__update__uploader ON storage_files FOR UPDATE TO luuxa_app
  USING (uploaded_by = (SELECT app.current_user_id()) AND status = 'pending_upload')
  WITH CHECK (uploaded_by = (SELECT app.current_user_id()));

CREATE POLICY media_attachments__select ON media_attachments FOR SELECT TO luuxa_app
  USING ((SELECT app.can_see_attachment_target(entity_type, entity_id)));
CREATE POLICY media_attachments__insert ON media_attachments FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.can_modify_attachment_target(entity_type, entity_id)));
CREATE POLICY media_attachments__delete ON media_attachments FOR DELETE TO luuxa_app
  USING ((SELECT app.can_modify_attachment_target(entity_type, entity_id)));

-- Nhật ký chung (audit.log.read: Admin kỹ thuật, Trưởng nhà) KHÔNG gồm bảng dữ liệu cá nhân nhạy cảm — phần đó cần audit.sensitive.read (Trưởng nhà);
-- cán bộ tài chính xem nhật ký các bảng tài chính (audit.finance.read)
CREATE POLICY audit_logs__select ON audit_logs FOR SELECT TO luuxa_app
  USING (((SELECT app.has_permission('audit.log.read')) AND NOT app.is_sensitive_audit_table(entity_table))
         OR (SELECT app.has_permission('audit.sensitive.read'))
         OR ((SELECT app.has_permission('audit.finance.read')) AND app.is_finance_audit_table(entity_table)));

CREATE POLICY idempotency_keys__own ON idempotency_keys FOR ALL TO luuxa_app
  USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));

CREATE POLICY notifications__select__own ON notifications FOR SELECT TO luuxa_app USING ((SELECT app.is_self(member_id)));
CREATE POLICY notifications__update__own ON notifications FOR UPDATE TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));
-- notification_outbox: không có chính sách ⇒ chỉ worker (BYPASSRLS)

CREATE POLICY ai_jobs__select ON ai_jobs FOR SELECT TO luuxa_app
  USING (requested_by = (SELECT app.current_user_id()) OR (SELECT app.has_permission('ai.manage')));
CREATE POLICY ai_jobs__insert ON ai_jobs FOR INSERT TO luuxa_app
  WITH CHECK (requested_by = (SELECT app.current_user_id()) AND (SELECT app.has_permission('ai.use')));
CREATE POLICY ai_suggestions__select ON ai_suggestions FOR SELECT TO luuxa_app
  USING ((SELECT app.has_any_permission(ARRAY['ai.review', 'ai.manage']))
         OR EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = job_id AND j.requested_by = (SELECT app.current_user_id())));
CREATE POLICY ai_suggestions__update ON ai_suggestions FOR UPDATE TO luuxa_app
  USING ((SELECT app.has_permission('ai.review'))) WITH CHECK ((SELECT app.has_permission('ai.review')));
CREATE POLICY ai_budgets__manage ON ai_budgets FOR ALL TO luuxa_app
  USING ((SELECT app.has_permission('ai.manage'))) WITH CHECK ((SELECT app.has_permission('ai.manage')));
CREATE POLICY ai_usage_daily__select ON ai_usage_daily FOR SELECT TO luuxa_app USING ((SELECT app.has_permission('ai.manage')));
