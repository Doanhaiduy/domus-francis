-- =====================================================================
-- 1052 — TRẢI NGHIỆM THÀNH VIÊN (gói H): tắt thông báo theo TỪNG LOẠI + xác nhận đã đọc LUẬT NHÀ. Chạy SAU 1051. Idempotent.
--   • notification_type_mutes (member_id, type_code): thành viên tự tắt riêng một loại thông báo (vd. "Có anh em xin phép vắng / về muộn"
--     event.leave_notice, sinh nhật, các tin nhắc lặp) thay vì tắt cả nhóm. Loại is_mandatory (bảo mật, thông báo quan trọng, kết quả đơn…)
--     KHÔNG tắt được (trigger chặn). Chỉ chính chủ đọc/ghi (RLS).
--   • app.fn_notify(): thay bằng bản kiểm thêm tùy chọn trên — người nhận đã tắt loại đó (và loại không bắt buộc) ⇒ KHÔNG tạo thông báo trong
--     ứng dụng lẫn dòng hàng đợi gửi (trả NULL; count(app.fn_notify(...)) không tính người này). Mọi hành vi khác GIỮ NGUYÊN như
--     db/migrations/38_fn_platform.sql: tắt kênh theo nhóm (notification_preferences), giờ yên tĩnh, loại bắt buộc/khẩn bỏ qua giờ yên tĩnh.
--   • Loại thông báo mới: system.birthday (tin chúc mừng sinh nhật anh em — để tắt riêng), system.house_rules_ack (nhắc đọc + xác nhận Luật nhà).
--   • house_rule_acknowledgements (member_id, version, …): "Tôi đã đọc phiên bản …" của Luật nhà. policy_acknowledgements của thiết kế gắn với
--     policy_documents (văn bản Markdown theo số phiên bản) — KHÔNG khớp Luật nhà dạng mục (house_rule_sections) nên dùng bảng riêng.
--     Phiên bản = dấu vân tay nội dung các mục đang hiển thị (app.fn_house_rules_version(): md5 của id + tên + mô tả + điều khoản các mục
--     is_active theo thứ tự) ⇒ sửa / thêm / xóa / ẩn / sắp xếp lại mục đều ra phiên bản mới và cần xác nhận lại; đổi biểu tượng thì không.
--     Chính chủ chỉ xác nhận được PHIÊN BẢN HIỆN HÀNH (trigger kiểm lại), không sửa/xóa (bằng chứng); người có house.rules.manage xem của mọi người.
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('system.birthday',         'system', 'Sinh nhật anh em trong nhà',          ARRAY['in_app', 'web_push']::notification_channel_t[], 'low',    false, false),
  ('system.house_rules_ack',  'system', 'Mời đọc và xác nhận Luật nhà',        ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. Tắt thông báo theo từng loại
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_type_mutes (
  member_id  uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type_code  text        NOT NULL REFERENCES public.notification_types(code) ON UPDATE CASCADE ON DELETE CASCADE,
  muted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, type_code)
);
COMMENT ON TABLE public.notification_type_mutes IS
  'Loại thông báo thành viên đã TẮT riêng (Cài đặt → Thông báo → Theo từng loại). app.fn_notify bỏ qua người nhận đã tắt loại đó (không tạo thông báo, không xếp hàng gửi), trừ loại is_mandatory.';
CREATE INDEX IF NOT EXISTS ix_notification_type_mutes__type_code ON public.notification_type_mutes (type_code);

CREATE OR REPLACE FUNCTION app.tg_notification_type_mutes_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notification_types t WHERE t.code = NEW.type_code AND t.is_mandatory) THEN
    RAISE EXCEPTION 'Loại thông báo bắt buộc (bảo mật, thông báo quan trọng, kết quả đơn) không tắt được.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.muted_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_notification_type_mutes_rules() IS 'BEFORE INSERT/UPDATE notification_type_mutes: chặn tắt loại thông báo bắt buộc (is_mandatory); giờ tắt = giờ máy chủ.';

DROP TRIGGER IF EXISTS trg_notification_type_mutes__rules ON public.notification_type_mutes;
CREATE TRIGGER trg_notification_type_mutes__rules BEFORE INSERT OR UPDATE ON public.notification_type_mutes
  FOR EACH ROW EXECUTE FUNCTION app.tg_notification_type_mutes_rules();

ALTER TABLE public.notification_type_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_type_mutes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_type_mutes__own ON public.notification_type_mutes;
CREATE POLICY notification_type_mutes__own ON public.notification_type_mutes FOR ALL TO luuxa_app
  USING ((SELECT app.is_self(member_id))) WITH CHECK ((SELECT app.is_self(member_id)));

ALTER TABLE public.notification_type_mutes OWNER TO luuxa_owner;
REVOKE ALL ON public.notification_type_mutes FROM luuxa_app;
GRANT SELECT, DELETE ON public.notification_type_mutes TO luuxa_app;
GRANT INSERT (member_id, type_code) ON public.notification_type_mutes TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_type_mutes TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_notification_type_mutes_rules() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_notification_type_mutes_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_notification_type_mutes_rules() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 2. app.fn_notify: tôn trọng loại người nhận đã tắt (thân hàm còn lại GIỮ NGUYÊN 38_fn_platform.sql)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_notify(
  p_member_id    uuid,
  p_type_code    text,
  p_title        text,
  p_body         text  DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb,
  p_entity_table text  DEFAULT NULL,
  p_entity_id    uuid  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_type    public.notification_types%ROWTYPE;
  v_id      uuid;
  v_ch      notification_channel_t;
  v_pref    public.notification_preferences%ROWTYPE;
  v_next    timestamptz;
  v_lnow    timestamp;
  v_in_quiet boolean;
BEGIN
  SELECT * INTO v_type FROM public.notification_types t WHERE t.code = p_type_code AND t.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loại thông báo % không tồn tại hoặc đã tắt.', p_type_code USING ERRCODE = 'no_data_found';
  END IF;
  -- Người nhận đã tắt RIÊNG loại này (Cài đặt → Thông báo → Theo từng loại) ⇒ không tạo thông báo nào; loại bắt buộc vẫn gửi
  IF NOT v_type.is_mandatory AND EXISTS (
       SELECT 1 FROM public.notification_type_mutes x WHERE x.member_id = p_member_id AND x.type_code = p_type_code) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (member_id, type_code, title, body, payload, entity_table, entity_id, priority)
  VALUES (p_member_id, p_type_code, p_title, p_body, COALESCE(p_payload, '{}'::jsonb), p_entity_table, p_entity_id, v_type.priority)
  RETURNING id INTO v_id;

  FOREACH v_ch IN ARRAY v_type.default_channels LOOP
    CONTINUE WHEN v_ch = 'in_app';
    SELECT * INTO v_pref FROM public.notification_preferences p
     WHERE p.member_id = p_member_id AND p.category = v_type.category AND p.channel = v_ch;
    IF FOUND AND NOT v_pref.enabled AND NOT v_type.is_mandatory THEN CONTINUE; END IF;
    v_next := now();
    IF FOUND AND v_pref.quiet_start IS NOT NULL AND NOT v_type.is_mandatory AND v_type.priority <> 'urgent' THEN
      v_lnow := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
      v_in_quiet := CASE WHEN v_pref.quiet_start <= v_pref.quiet_end
                         THEN v_lnow::time >= v_pref.quiet_start AND v_lnow::time < v_pref.quiet_end
                         ELSE v_lnow::time >= v_pref.quiet_start OR v_lnow::time < v_pref.quiet_end END;
      IF v_in_quiet THEN
        v_next := ((v_lnow::date + CASE WHEN v_pref.quiet_end <= v_lnow::time THEN 1 ELSE 0 END) + v_pref.quiet_end) AT TIME ZONE 'Asia/Ho_Chi_Minh';
      END IF;
    END IF;
    INSERT INTO public.notification_outbox (notification_id, channel, next_attempt_at)
    VALUES (v_id, v_ch, v_next)
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END LOOP;
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid) IS 'Tạo một thông báo trong ứng dụng cho một người + xếp hàng gửi các kênh còn lại theo notification_types.default_channels. Người nhận đã tắt riêng loại này (notification_type_mutes) ⇒ không tạo gì, trả NULL (trừ loại is_mandatory). Bỏ qua kênh người nhận đã tắt theo nhóm (trừ loại is_mandatory); trì hoãn đến hết giờ yên tĩnh (trừ mandatory/urgent). Gọi cùng transaction nghiệp vụ (transactional outbox).';

ALTER FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid) FROM luuxa_auth, luuxa_app;
GRANT EXECUTE ON FUNCTION app.fn_notify(uuid, text, text, text, jsonb, text, uuid) TO luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 3. Phiên bản Luật nhà hiện hành (dấu vân tay nội dung)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_house_rules_version()
RETURNS TABLE (version text, updated_at timestamptz, sections integer, clauses integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE WHEN count(*) > 0 THEN
              left(md5(string_agg(concat_ws(E'\x1f', s.id::text, s.title, COALESCE(s.description, ''), s.items::text), E'\x1e'
                                  ORDER BY s.sort_order, s.created_at, s.id)), 16)
         END,
         max(s.updated_at),
         count(*)::integer,
         COALESCE(sum((SELECT count(*) FROM jsonb_array_elements(s.items) AS i(x)
                        WHERE COALESCE(i.x ->> 'sub', '') <> 'true' AND COALESCE(i.x ->> 'note', '') <> 'true')), 0)::integer
    FROM public.house_rule_sections s
   WHERE s.is_active
$$;
COMMENT ON FUNCTION app.fn_house_rules_version() IS
  'Phiên bản Luật nhà đang hiển thị với thành viên: version = 16 ký tự đầu md5 của (id, tên, mô tả, điều khoản) các mục is_active theo thứ tự (NULL khi chưa có mục nào); updated_at = lần sửa gần nhất của các mục đó; sections / clauses = số mục / số điều khoản (không tính điều con, ghi chú). Nội dung đổi ⇒ version đổi ⇒ cần xác nhận lại.';

ALTER FUNCTION app.fn_house_rules_version() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_house_rules_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_house_rules_version() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 4. Xác nhận đã đọc Luật nhà
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.house_rule_acknowledgements (
  member_id         uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  version           text        NOT NULL,
  rules_updated_at  timestamptz,
  sections          integer,
  acknowledged_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, version),
  CONSTRAINT ck_house_rule_acknowledgements__version CHECK (version ~ '^[0-9a-f]{16}$')
);
COMMENT ON TABLE public.house_rule_acknowledgements IS
  'Thành viên xác nhận "Tôi đã đọc Luật nhà phiên bản …" (bằng chứng, không sửa/xóa qua ứng dụng). version = app.fn_house_rules_version().version lúc xác nhận; rules_updated_at = ngày cập nhật của phiên bản đó (để hiển thị).';
CREATE INDEX IF NOT EXISTS ix_house_rule_acknowledgements__version ON public.house_rule_acknowledgements (version);

CREATE OR REPLACE FUNCTION app.tg_house_rule_ack_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM app.fn_house_rules_version();
  IF v.version IS NULL THEN
    RAISE EXCEPTION 'Nhà chưa có luật nhà để xác nhận.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version IS DISTINCT FROM v.version THEN
    RAISE EXCEPTION 'Luật nhà vừa được cập nhật — hãy tải lại trang, đọc bản mới rồi xác nhận.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.rules_updated_at := v.updated_at;
  NEW.sections := v.sections;
  NEW.acknowledged_at := now();
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_house_rule_ack_rules() IS 'BEFORE INSERT house_rule_acknowledgements: chỉ xác nhận được phiên bản Luật nhà HIỆN HÀNH; ghi ngày cập nhật + số mục của phiên bản và giờ máy chủ.';

DROP TRIGGER IF EXISTS trg_house_rule_acknowledgements__rules ON public.house_rule_acknowledgements;
CREATE TRIGGER trg_house_rule_acknowledgements__rules BEFORE INSERT ON public.house_rule_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION app.tg_house_rule_ack_rules();
DROP TRIGGER IF EXISTS trg_house_rule_acknowledgements__audit ON public.house_rule_acknowledgements;
CREATE TRIGGER trg_house_rule_acknowledgements__audit AFTER INSERT OR UPDATE OR DELETE ON public.house_rule_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('member_id,version');

ALTER TABLE public.house_rule_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_rule_acknowledgements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS house_rule_acknowledgements__select ON public.house_rule_acknowledgements;
CREATE POLICY house_rule_acknowledgements__select ON public.house_rule_acknowledgements FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('house.rules.manage')));
DROP POLICY IF EXISTS house_rule_acknowledgements__insert ON public.house_rule_acknowledgements;
CREATE POLICY house_rule_acknowledgements__insert ON public.house_rule_acknowledgements FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)));

ALTER TABLE public.house_rule_acknowledgements OWNER TO luuxa_owner;
REVOKE ALL ON public.house_rule_acknowledgements FROM luuxa_app;
GRANT SELECT ON public.house_rule_acknowledgements TO luuxa_app;
GRANT INSERT (member_id, version) ON public.house_rule_acknowledgements TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.house_rule_acknowledgements TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_house_rule_ack_rules() OWNER TO luuxa_owner;
REVOKE ALL ON FUNCTION app.tg_house_rule_ack_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_house_rule_ack_rules() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

COMMIT;
