-- =====================================================================
-- 95 — Phân hệ CỘNG ĐOÀN (Thông báo, Diễn đàn, Ý cầu nguyện, Phụng vụ, Hộp thư trong ứng dụng)
-- Bổ sung cho ứng dụng web, KHÔNG sửa đối tượng của thiết kế. Idempotent (chạy lại được nhiều lần).
--
--  1. Hai loại thông báo trong ứng dụng còn thiếu: phân công phụng vụ, bình luận mới trong chủ đề diễn đàn.
--  2. Hàm gửi thông báo theo nghiệp vụ (SECURITY DEFINER, kiểm quyền trong thân hàm): luuxa_app KHÔNG được gọi
--     app.fn_notify* trực tiếp (49_b_grants), nên mỗi luồng nghiệp vụ có một cửa vào riêng, kiểm đúng người gọi:
--       app.fn_notify_announcement(id)        — người đăng/Ban điều hành, cần notification.send
--       app.fn_notify_forum_reply(comment_id) — chính người vừa bình luận
--       app.fn_notify_liturgy_assignment(id)  — người có liturgy.manage
--  3. app.fn_set_prayer_status(id, status): tác giả (kể cả ý ẩn danh — qua prayer_intention_authors) hoặc người kiểm duyệt
--     đóng/đánh dấu "đã được nhậm lời" ý cầu nguyện. Cần hàm vì RLS UPDATE của prayer_intentions so author_member_id,
--     mà ý ẩn danh luôn có author_member_id = NULL (ẩn danh thật) ⇒ chính chủ không tự gỡ được.
--  4. app.fn_prayer_praying_members(): số anh em (DISTINCT) đang hiệp ý các ý cầu nguyện còn mở — chỉ số tổng hợp
--     (prayer_responses chỉ chính chủ đọc được, nên đếm phân biệt người cần SECURITY DEFINER).
--  5. app.fn_announcement_read_counts(id): số đã đọc/đã xác nhận TRONG đối tượng nhận (người đăng tự đọc mà không thuộc
--     đối tượng thì không bị tính), chỉ trả số thật cho người đăng / announcement.pin như RLS announcement_reads.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Loại thông báo
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('event.liturgy_assigned', 'event',  'Bạn được phân công phục vụ phụng vụ', ARRAY['in_app']::notification_channel_t[], 'normal', false, false),
  ('social.forum_reply',     'social', 'Bình luận mới trong chủ đề của bạn',  ARRAY['in_app']::notification_channel_t[], 'low',    false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2a. Gửi thông báo trong ứng dụng cho đối tượng nhận của một thông báo (bài đăng)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_notify_announcement(p_announcement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me     uuid := app.current_member_id();
  v_a      public.announcements%ROWTYPE;
  v_type   text;
  v_body   text;
  v_member uuid;
  v_n      integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.has_permission('notification.send') THEN
    RAISE EXCEPTION 'Bạn không có quyền gửi thông báo tới thành viên (notification.send).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_a FROM public.announcements a WHERE a.id = p_announcement_id AND a.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thông báo không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_a.author_member_id <> v_me AND NOT app.has_permission('announcement.pin') THEN
    RAISE EXCEPTION 'Chỉ người đăng hoặc Ban điều hành được gửi thông báo này tới thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.status <> 'published' THEN
    RAISE EXCEPTION 'Thông báo chưa được đăng.' USING ERRCODE = 'check_violation';
  END IF;

  v_type := CASE WHEN v_a.requires_ack THEN 'announcement.important' ELSE 'announcement.published' END;
  v_body := left(regexp_replace(btrim(v_a.content), '\s+', ' ', 'g'), 160);

  FOR v_member IN
    SELECT m.id
      FROM public.members m
     WHERE m.status = 'active' AND m.deleted_at IS NULL AND m.id <> v_a.author_member_id
       AND (NOT EXISTS (SELECT 1 FROM public.announcement_targets t WHERE t.announcement_id = v_a.id)
            OR EXISTS (
              SELECT 1 FROM public.announcement_targets t
               WHERE t.announcement_id = v_a.id
                 AND (   t.member_id = m.id
                      OR t.room_id  IN (SELECT ra.room_id FROM public.room_assignments ra WHERE ra.member_id = m.id AND ra.ends_on IS NULL)
                      OR t.floor_id IN (SELECT r.floor_id FROM public.room_assignments ra JOIN public.rooms r ON r.id = ra.room_id
                                         WHERE ra.member_id = m.id AND ra.ends_on IS NULL)
                      OR t.role_id  IN (SELECT ur.role_id FROM public.user_roles ur
                                         WHERE ur.user_id = m.user_id AND ur.revoked_at IS NULL
                                           AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())))))
       -- gọi lại không gửi trùng
       AND NOT EXISTS (SELECT 1 FROM public.notifications n
                        WHERE n.member_id = m.id AND n.entity_table = 'announcements' AND n.entity_id = v_a.id)
  LOOP
    PERFORM app.fn_notify(v_member, v_type, v_a.title, v_body,
                          jsonb_build_object('announcement_id', v_a.id, 'link', '/thong-bao?id=' || v_a.id::text),
                          'announcements', v_a.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_notify_announcement(uuid) IS
  'Gửi thông báo trong ứng dụng (kèm hàng đợi kênh khác theo notification_types) tới mọi thành viên đang ở thuộc đối tượng nhận của thông báo, trừ người đăng. Người gọi: người đăng hoặc người có announcement.pin, và phải có notification.send. Không gửi trùng khi gọi lại. Loại: announcement.important nếu requires_ack, ngược lại announcement.published.';

-- ---------------------------------------------------------------------
-- 2b. Bình luận mới ⇒ báo cho tác giả bài viết (và tác giả bình luận được trả lời)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_notify_forum_reply(p_comment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me     uuid := app.current_member_id();
  v_c      record;
  v_member uuid;
  v_n      integer := 0;
BEGIN
  SELECT c.id, c.author_member_id, c.content, c.parent_id, p.id AS post_id, p.title, p.author_member_id AS post_author,
         (SELECT pc.author_member_id FROM public.forum_comments pc WHERE pc.id = c.parent_id) AS parent_author,
         (SELECT m.display_name FROM public.members m WHERE m.id = c.author_member_id) AS author_name
    INTO v_c
    FROM public.forum_comments c JOIN public.forum_posts p ON p.id = c.post_id
   WHERE c.id = p_comment_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bình luận không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_me IS NULL OR v_c.author_member_id <> v_me THEN
    RAISE EXCEPTION 'Chỉ người vừa bình luận mới kích hoạt được thông báo này.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_member IN
    SELECT DISTINCT x FROM unnest(ARRAY[v_c.post_author, v_c.parent_author]) AS x
     WHERE x IS NOT NULL AND x <> v_me
       AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = x AND m.status = 'active' AND m.deleted_at IS NULL)
  LOOP
    PERFORM app.fn_notify(v_member, 'social.forum_reply',
                          left(v_c.author_name || ' đã bình luận: ' || v_c.title, 200),
                          left(regexp_replace(btrim(v_c.content), '\s+', ' ', 'g'), 160),
                          jsonb_build_object('post_id', v_c.post_id, 'comment_id', v_c.id, 'link', '/dien-dan?id=' || v_c.post_id::text),
                          'forum_posts', v_c.post_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;
COMMENT ON FUNCTION app.fn_notify_forum_reply(uuid) IS
  'Sau khi bình luận diễn đàn: báo tác giả bài viết và tác giả bình luận cha (nếu khác người bình luận, còn đang ở). Chỉ chính người bình luận gọi được.';

-- ---------------------------------------------------------------------
-- 2c. Phân công phụng vụ ⇒ báo cho người được phân công
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_notify_liturgy_assignment(p_assignment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_r record;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('liturgy.manage') THEN
    RAISE EXCEPTION 'Chỉ Ban Phụng vụ (liturgy.manage) được gửi thông báo phân công.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT la.id, la.member_id, e.title, e.starts_at, rt.name_vi
    INTO v_r
    FROM public.liturgy_assignments la
    JOIN public.events e ON e.id = la.event_id
    JOIN public.liturgy_role_types rt ON rt.id = la.role_type_id
   WHERE la.id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phân công không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_r.member_id = app.current_member_id()
     OR NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_r.member_id AND m.status = 'active' AND m.deleted_at IS NULL) THEN
    RETURN 0;
  END IF;
  PERFORM app.fn_notify(v_r.member_id, 'event.liturgy_assigned',
                        left('Phân công phụng vụ: ' || v_r.name_vi || ' — ' || v_r.title, 200),
                        to_char(v_r.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM/YYYY'),
                        jsonb_build_object('assignment_id', v_r.id, 'link', '/phung-vu'),
                        'liturgy_assignments', v_r.id);
  RETURN 1;
END
$$;
COMMENT ON FUNCTION app.fn_notify_liturgy_assignment(uuid) IS
  'Báo cho thành viên vừa được phân công phục vụ phụng vụ (vai trò, buổi, giờ). Người gọi phải có liturgy.manage; tự phân công cho mình thì không gửi.';

-- ---------------------------------------------------------------------
-- 3. Đổi trạng thái ý cầu nguyện (chính chủ — kể cả ẩn danh — hoặc người kiểm duyệt)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_set_prayer_status(p_intention_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me     uuid := app.current_member_id();
  v_author uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'answered', 'closed') THEN
    RAISE EXCEPTION 'Trạng thái ý cầu nguyện không hợp lệ.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.author_member_id INTO v_author FROM public.prayer_intentions p WHERE p.id = p_intention_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ý cầu nguyện không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  -- ý ẩn danh có author_member_id NULL: so sánh NULL phải quy về false (không để NOT (NULL OR …) lọt qua)
  IF NOT (COALESCE(v_author = v_me, false)
          OR EXISTS (SELECT 1 FROM public.prayer_intention_authors a WHERE a.intention_id = p_intention_id AND a.author_member_id = v_me)
          OR app.has_permission('prayer.moderate')) THEN
    RAISE EXCEPTION 'Chỉ người gửi ý cầu nguyện hoặc người kiểm duyệt được đổi trạng thái.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.prayer_intentions SET status = p_status WHERE id = p_intention_id;
END
$$;
COMMENT ON FUNCTION app.fn_set_prayer_status(uuid, text) IS
  'Đóng/mở lại/đánh dấu "đã được nhậm lời" một ý cầu nguyện. Cho phép tác giả (cột author_member_id hoặc prayer_intention_authors với ý ẩn danh — không làm lộ danh tính) hoặc người có prayer.moderate. Không đổi visibility (ẩn do kiểm duyệt).';

-- ---------------------------------------------------------------------
-- 4. Số anh em đang hiệp ý (chỉ số tổng hợp)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_prayer_praying_members()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE WHEN app.current_user_id() IS NOT NULL AND app.has_permission('prayer.post') THEN
    (SELECT COUNT(DISTINCT r.member_id)::integer
       FROM public.prayer_responses r
       JOIN public.prayer_intentions p ON p.id = r.intention_id
      WHERE p.visibility = 'published' AND p.status = 'open' AND p.expires_at > now())
  ELSE 0 END
$$;
COMMENT ON FUNCTION app.fn_prayer_praying_members() IS
  'Số thành viên khác nhau đang hiệp ý ít nhất một ý cầu nguyện còn mở (thẻ "x anh em đang cùng hiệp thông"). Chỉ trả số tổng hợp, không lộ ai hiệp ý ý nào.';

-- ---------------------------------------------------------------------
-- 5. Số đã đọc / đã xác nhận trong ĐỐI TƯỢNG NHẬN (tử số khớp mẫu số app.fn_announcement_target_count)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_announcement_read_counts(p_announcement_id uuid)
RETURNS TABLE (read_count integer, ack_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT count(*)::integer, (count(*) FILTER (WHERE r.acknowledged_at IS NOT NULL))::integer
    FROM public.announcement_reads r
    JOIN public.members m ON m.id = r.member_id
    JOIN public.announcements a ON a.id = r.announcement_id
   WHERE r.announcement_id = p_announcement_id
     AND m.status = 'active' AND m.deleted_at IS NULL
     AND app.current_user_id() IS NOT NULL
     AND (a.author_member_id = app.current_member_id() OR app.has_permission('announcement.pin'))
     AND (NOT EXISTS (SELECT 1 FROM public.announcement_targets t WHERE t.announcement_id = a.id)
          OR EXISTS (
            SELECT 1 FROM public.announcement_targets t
             WHERE t.announcement_id = a.id
               AND (   t.member_id = m.id
                    OR t.room_id  IN (SELECT ra.room_id FROM public.room_assignments ra WHERE ra.member_id = m.id AND ra.ends_on IS NULL)
                    OR t.floor_id IN (SELECT rr.floor_id FROM public.room_assignments ra JOIN public.rooms rr ON rr.id = ra.room_id
                                       WHERE ra.member_id = m.id AND ra.ends_on IS NULL)
                    OR t.role_id  IN (SELECT ur.role_id FROM public.user_roles ur
                                       WHERE ur.user_id = m.user_id AND ur.revoked_at IS NULL
                                         AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())))))
$$;
COMMENT ON FUNCTION app.fn_announcement_read_counts(uuid) IS
  'Số thành viên đang ở THUỘC ĐỐI TƯỢNG NHẬN đã đọc / đã xác nhận một thông báo — tử số của "x / y thành viên đã đọc" (mẫu số: app.fn_announcement_target_count). Chỉ người đăng và người có announcement.pin nhận số thật (người khác nhận 0), đúng phạm vi RLS announcement_reads; SECURITY DEFINER để đối chiếu đối tượng theo vai trò dù người đăng không đọc được user_roles.';

-- ---------------------------------------------------------------------
-- Sở hữu & quyền thực thi (INV-07/08/14 của bộ kiểm thử: ghim search_path, chủ luuxa_definer, không EXECUTE cho PUBLIC)
-- ---------------------------------------------------------------------
ALTER FUNCTION app.fn_notify_announcement(uuid)        OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_notify_forum_reply(uuid)         OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_notify_liturgy_assignment(uuid)  OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_set_prayer_status(uuid, text)    OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_prayer_praying_members()         OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_announcement_read_counts(uuid)   OWNER TO luuxa_definer;

REVOKE ALL ON FUNCTION app.fn_notify_announcement(uuid), app.fn_notify_forum_reply(uuid), app.fn_notify_liturgy_assignment(uuid),
  app.fn_set_prayer_status(uuid, text), app.fn_prayer_praying_members(), app.fn_announcement_read_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_notify_announcement(uuid), app.fn_notify_forum_reply(uuid), app.fn_notify_liturgy_assignment(uuid),
  app.fn_set_prayer_status(uuid, text), app.fn_prayer_praying_members(), app.fn_announcement_read_counts(uuid) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
