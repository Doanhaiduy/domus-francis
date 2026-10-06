-- =====================================================================
-- 74_review_fixes_coverage.sql — VÁ ĐỘ PHỦ FE ↔ DB (kiểm định Bước 2), chạy SAU 70–73. Idempotent.
-- Xử lý: A-002 (chức danh tác giả), A-003/A-004 (khóa cấu hình tổ chức/Bếp/Phụng vụ/nhóm Telegram), A-005/A-006 (bộ đếm
-- bình luận/ảnh không giảm khi xóa mềm hoặc ẩn), A-012 (giá trị mặc định cho nút 'Khôi phục').
-- Không gồm A-018 (bảng cho phân hệ Bếp đang tạm hoãn) — xem mục ⑧ của báo cáo.
-- =====================================================================
BEGIN;

-- [A-002]
CREATE OR REPLACE VIEW public.v_member_current_position
WITH (security_invoker = true, security_barrier = true) AS
SELECT DISTINCT ON (mp.member_id)
       mp.member_id,
       p.code  AS position_code,
       p.name  AS position_name,
       mp.board_term_id
FROM public.member_positions mp
JOIN public.positions p ON p.id = mp.position_id
WHERE mp.starts_on <= app.local_today()
  AND (mp.ends_on IS NULL OR mp.ends_on >= app.local_today())
ORDER BY mp.member_id,
         CASE p.kind WHEN 'leadership' THEN 0 WHEN 'committee' THEN 1 ELSE 2 END,
         p.sort_order;
ALTER VIEW public.v_member_current_position OWNER TO luuxa_owner;
GRANT SELECT ON public.v_member_current_position TO luuxa_app;
COMMENT ON VIEW public.v_member_current_position IS
  'Một chức danh hiện hành ưu tiên cao nhất của mỗi thành viên; nguồn của PersonRefDto.position_label (FE authorRole).';

-- [A-003/A-004] — khóa nhóm Telegram chỉ dùng khi Ban điều hành chọn giữ bot nhóm (phương án b); để false là vô hại
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission) VALUES
  ('org.house_name',   to_jsonb('Lưu Xá Sinh Viên Phanxicô Assisi'::text),   'string', 'Tên lưu xá chính thức (Cài đặt chung, sơ yếu lý lịch).', NULL, NULL, true,  'setting.write'),
  ('org.motto',        to_jsonb('Bình An và Thiện Hảo (Pax et Bonum)'::text), 'string', 'Khẩu hiệu cộng đoàn.', NULL, NULL, true,  'setting.write'),
  ('org.address',      to_jsonb('Số 42 ngõ 180 Triều Khúc, Thanh Xuân, Hà Nội'::text), 'string', '[GIẢ ĐỊNH] Địa chỉ duy nhất (CV đang ghi Ngõ 68) — Ban điều hành chốt.', NULL, NULL, true, 'setting.write'),
  ('org.patron_feast', to_jsonb('10-04'::text), 'string', 'Ngày lễ Bổn mạng MM-DD; tên lễ lấy từ liturgical_days.', NULL, NULL, true, 'setting.write'),
  ('org.contact_phone', to_jsonb(''::text), 'string', 'Hotline công khai của lưu xá (không dùng SĐT cá nhân).', NULL, NULL, true, 'setting.write'),
  ('org.order_name',   to_jsonb('Tỉnh Dòng Anh Em Hèn Mọn Việt Nam (OFM)'::text), 'string', 'Tên Tỉnh Dòng in trên sơ yếu lý lịch.', NULL, NULL, false, 'setting.write'),
  ('org.chaplain_name', to_jsonb(''::text), 'string', 'Tên Cha linh hướng ký trên sơ yếu lý lịch.', NULL, NULL, false, 'setting.write'),
  ('meal.price_per_serving_vnd', '25000'::jsonb, 'vnd', 'Giá tham chiếu một suất cơm.', 0, 1000000, true, 'meal.manage'),
  ('meal.lunch_cutoff_time',  to_jsonb('09:00'::text), 'time', 'Giờ chốt suất trưa mặc định.', NULL, NULL, true, 'meal.manage'),
  ('meal.dinner_cutoff_time', to_jsonb('15:00'::text), 'time', 'Giờ chốt suất tối mặc định.', NULL, NULL, true, 'meal.manage'),
  ('liturgy.night_prayer_time', to_jsonb('20:30'::text), 'time', 'Giờ Kinh Tối mặc định khi lập quy tắc lặp.', NULL, NULL, true, 'liturgy.manage'),
  -- chỉ khi chọn phương án (b) của A-004:
  ('integration.telegram.group_enabled', 'false'::jsonb, 'boolean', 'Bật gửi tin tự động vào nhóm Telegram chung.', NULL, NULL, false, 'setting.write'),
  ('integration.telegram.group_chat_id', to_jsonb(''::text), 'string', 'Chat ID nhóm Telegram (không phải bí mật; Bot Token ở secret backend).', NULL, NULL, false, 'setting.write'),
  ('integration.telegram.group_events',
   '{"dues_reminder": true, "duty_morning": true, "meal_summary": true, "facility_new": true, "night_prayer": true}'::jsonb,
   'json', 'Công tắc cấp nhà cho 5 loại tin gửi vào nhóm.', NULL, NULL, false, 'setting.write')
ON CONFLICT (key) DO NOTHING;

-- [A-005/A-006]
CREATE OR REPLACE FUNCTION app.tg_adjust_counter_visible()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app, pg_temp AS $$
DECLARE
  v_parent  text := TG_ARGV[0];
  v_col     text := TG_ARGV[1];
  v_fk      text := TG_ARGV[2];
  v_old_vis boolean := false;
  v_new_vis boolean := false;
  v_moved   boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old_vis := (OLD.deleted_at IS NULL AND OLD.status = 'published'); END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN v_new_vis := (NEW.deleted_at IS NULL AND NEW.status = 'published'); END IF;
  IF TG_OP = 'UPDATE' THEN v_moved := (to_jsonb(OLD) ->> v_fk) IS DISTINCT FROM (to_jsonb(NEW) ->> v_fk); END IF;
  IF v_old_vis AND (NOT v_new_vis OR v_moved) THEN
    EXECUTE format('UPDATE public.%I SET %I = GREATEST(%I - 1, 0) WHERE id = $1', v_parent, v_col, v_col)
      USING (to_jsonb(OLD) ->> v_fk)::uuid;
  END IF;
  IF v_new_vis AND (NOT v_old_vis OR v_moved) THEN
    EXECUTE format('UPDATE public.%I SET %I = %I + 1 WHERE id = $1', v_parent, v_col, v_col)
      USING (to_jsonb(NEW) ->> v_fk)::uuid;
  END IF;
  RETURN NULL;
END $$;
ALTER FUNCTION app.tg_adjust_counter_visible() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_adjust_counter_visible() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_forum_comments__count ON public.forum_comments;
CREATE TRIGGER trg_forum_comments__count
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at, status, post_id ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter_visible('forum_posts', 'comments_count', 'post_id');

DROP TRIGGER IF EXISTS trg_album_photos__count ON public.album_photos;
CREATE TRIGGER trg_album_photos__count
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at, status, album_id ON public.album_photos
  FOR EACH ROW EXECUTE FUNCTION app.tg_adjust_counter_visible('albums', 'photos_count', 'album_id');

-- Đếm lại một lần (chạy bằng vai trò migration có BYPASSRLS; luuxa_owner bị FORCE RLS nên không thấy dòng):
UPDATE public.forum_posts p
   SET comments_count = (SELECT count(*) FROM public.forum_comments c
                          WHERE c.post_id = p.id AND c.deleted_at IS NULL AND c.status = 'published');
UPDATE public.albums a
   SET photos_count = (SELECT count(*) FROM public.album_photos ph
                        WHERE ph.album_id = a.id AND ph.deleted_at IS NULL AND ph.status = 'published');

-- [A-012]
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_value jsonb;
UPDATE public.settings SET default_value = value WHERE default_value IS NULL;
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS ck_settings__default_type;
ALTER TABLE public.settings ADD CONSTRAINT ck_settings__default_type
  CHECK (default_value IS NULL OR jsonb_typeof(default_value) = jsonb_typeof(value));
COMMENT ON COLUMN public.settings.default_value IS
  'Giá trị mặc định cho POST /api/v1/settings/{key}/reset; cùng kiểu JSON với value.';

COMMIT;
