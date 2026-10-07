-- =====================================================================
-- 1034 — ĐƠN XIN PHÉP: nhờ người để cửa + xin thêm giờ (về muộn / ngủ ngoài). Chạy SAU 1033. Idempotent.
--   • leave_requests.door_member_id: thành viên được nhờ để cửa (tùy chọn; chỉ dùng cho đơn về muộn / ngủ ngoài).
--   • leave_extensions: lần "xin thêm giờ" khi đã xin phép rồi mà có chuyện phát sinh — chỉ THÊM (không sửa/xóa, giữ vết); giờ về hiệu lực
--     của đơn = giờ dự kiến lớn nhất. Chỉ chính chủ, chỉ đơn về muộn / ngủ ngoài còn chờ duyệt hoặc đã duyệt, còn trong thời hạn, giờ mới phải
--     muộn hơn giờ đã báo (tối đa +24 giờ so với giờ gốc, tối đa 5 lần).
--   • app.fn_leave_door_duties(): việc "được nhờ để cửa" của người đang đăng nhập — chỉ trả tên người xin, loại đơn và giờ (KHÔNG trả lý do /
--     nơi đến / số điện thoại) nên không cần mở RLS đọc đơn cho người để cửa.
--   • 2 loại thông báo mới: event.leave_extended (báo người duyệt) và event.leave_door (báo người được nhờ để cửa).
-- =====================================================================
BEGIN;

INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('event.leave_extended', 'event', 'Có người xin thêm giờ về muộn / ngủ ngoài', ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false),
  ('event.leave_door',     'event', 'Bạn được nhờ để cửa',                     ARRAY['in_app', 'web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. Người để cửa
-- ---------------------------------------------------------------------
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS door_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.leave_requests.door_member_id IS 'Thành viên được nhờ để cửa cho người xin phép (đơn về muộn / ngủ ngoài; tùy chọn).';
CREATE INDEX IF NOT EXISTS ix_leave_requests__door_member ON public.leave_requests (door_member_id) WHERE door_member_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Xin thêm giờ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_extensions (
  id                uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  leave_request_id  uuid        NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  member_id         uuid        NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  new_ends_at       timestamptz NOT NULL,
  reason            text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_leave_extensions__reason CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500)
);
COMMENT ON TABLE public.leave_extensions IS 'Lần xin thêm giờ của đơn về muộn / ngủ ngoài (chỉ thêm, không sửa/xóa). Giờ về hiệu lực = GREATEST(leave_requests.ends_at, new_ends_at lớn nhất).';
CREATE INDEX IF NOT EXISTS ix_leave_extensions__request ON public.leave_extensions (leave_request_id, created_at);
CREATE INDEX IF NOT EXISTS ix_leave_extensions__member ON public.leave_extensions (member_id);

CREATE OR REPLACE FUNCTION app.tg_leave_extensions_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_req    public.leave_requests%ROWTYPE;
  v_cur    timestamptz;
  v_count  integer;
BEGIN
  SELECT * INTO v_req FROM public.leave_requests r WHERE r.id = NEW.leave_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn xin phép.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.member_id := v_req.member_id;
  IF app.current_user_id() IS NOT NULL AND v_req.member_id IS DISTINCT FROM app.current_member_id() THEN
    RAISE EXCEPTION 'Chỉ người xin phép được xin thêm giờ cho đơn của mình.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_req.kind NOT IN ('late_return', 'overnight_out') THEN
    RAISE EXCEPTION 'Chỉ đơn về muộn hoặc ngủ ngoài mới xin thêm giờ được.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_req.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Đơn đã bị từ chối hoặc đã hủy — không xin thêm giờ được.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT GREATEST(v_req.ends_at, COALESCE(max(x.new_ends_at), v_req.ends_at)), count(*)::int
    INTO v_cur, v_count FROM public.leave_extensions x WHERE x.leave_request_id = NEW.leave_request_id;
  IF NEW.new_ends_at <= v_cur THEN
    RAISE EXCEPTION 'Giờ mới phải muộn hơn giờ bạn đã báo.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.new_ends_at > v_req.ends_at + interval '24 hours' THEN
    RAISE EXCEPTION 'Chỉ xin thêm tối đa 24 giờ so với giờ dự kiến ban đầu — nếu lâu hơn hãy gửi đơn mới.' USING ERRCODE = 'check_violation';
  END IF;
  IF now() > v_cur + interval '12 hours' THEN
    RAISE EXCEPTION 'Đã quá thời gian của đơn này — hãy gửi đơn xin phép mới.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Mỗi đơn chỉ xin thêm giờ tối đa 5 lần.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_leave_extensions_rules() IS 'BEFORE INSERT leave_extensions: chính chủ; đơn về muộn/ngủ ngoài còn chờ duyệt hoặc đã duyệt; giờ mới muộn hơn giờ đã báo (tối đa +24 giờ so với giờ gốc); còn trong thời hạn (12 giờ sau giờ hiệu lực); tối đa 5 lần.';

DROP TRIGGER IF EXISTS trg_leave_extensions__rules ON public.leave_extensions;
CREATE TRIGGER trg_leave_extensions__rules BEFORE INSERT ON public.leave_extensions
  FOR EACH ROW EXECUTE FUNCTION app.tg_leave_extensions_rules();
DROP TRIGGER IF EXISTS trg_leave_extensions__audit ON public.leave_extensions;
CREATE TRIGGER trg_leave_extensions__audit AFTER INSERT OR UPDATE OR DELETE ON public.leave_extensions
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id', 'reason');

ALTER TABLE public.leave_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_extensions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_extensions__select ON public.leave_extensions;
CREATE POLICY leave_extensions__select ON public.leave_extensions FOR SELECT TO luuxa_app
  USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('leave.review')));
DROP POLICY IF EXISTS leave_extensions__insert ON public.leave_extensions;
CREATE POLICY leave_extensions__insert ON public.leave_extensions FOR INSERT TO luuxa_app
  WITH CHECK ((SELECT app.is_self(member_id)) AND (SELECT app.has_permission('leave.request')));

ALTER TABLE public.leave_extensions OWNER TO luuxa_owner;
REVOKE ALL ON public.leave_extensions FROM luuxa_app;
GRANT SELECT ON public.leave_extensions TO luuxa_app;
GRANT INSERT (leave_request_id, new_ends_at, reason) ON public.leave_extensions TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_extensions TO luuxa_worker, luuxa_definer;

ALTER FUNCTION app.tg_leave_extensions_rules() OWNER TO luuxa_definer; -- definer (BYPASSRLS): hàm đọc leave_requests/leave_extensions dưới FORCE RLS
REVOKE ALL ON FUNCTION app.tg_leave_extensions_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_leave_extensions_rules() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 3. Việc "được nhờ để cửa" của người đang đăng nhập (không lộ lý do / nơi đến / số điện thoại)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_leave_door_duties()
RETURNS TABLE (leave_id uuid, member_name text, kind text, status text, starts_at timestamptz, ends_at timestamptz, effective_ends_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT l.id, COALESCE(m.display_name, m.full_name), l.kind::text, l.status::text, l.starts_at, l.ends_at,
         GREATEST(l.ends_at, COALESCE((SELECT max(x.new_ends_at) FROM public.leave_extensions x WHERE x.leave_request_id = l.id), l.ends_at))
    FROM public.leave_requests l
    JOIN public.members m ON m.id = l.member_id
   WHERE l.door_member_id = app.current_member_id()
     AND app.current_member_id() IS NOT NULL
     AND l.status IN ('pending', 'approved')
     AND GREATEST(l.ends_at, COALESCE((SELECT max(x.new_ends_at) FROM public.leave_extensions x WHERE x.leave_request_id = l.id), l.ends_at)) > now() - interval '6 hours'
   ORDER BY l.starts_at
$$;
COMMENT ON FUNCTION app.fn_leave_door_duties() IS 'Các đơn về muộn / ngủ ngoài đang nhờ người đăng nhập để cửa (còn hiệu lực hoặc vừa qua dưới 6 giờ). Chỉ trả tên người xin, loại đơn, trạng thái và giờ — không trả lý do, nơi đến, số điện thoại.';
ALTER FUNCTION app.fn_leave_door_duties() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_leave_door_duties() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_leave_door_duties() TO luuxa_app, luuxa_definer, luuxa_owner;

COMMIT;
