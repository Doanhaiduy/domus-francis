-- =====================================================================
-- 94 — Phân hệ Lịch & Sự kiện: hàm bổ sung cho ứng dụng web. Idempotent.
--
-- 1) app.fn_event_stats(uuid[]) — số liệu TỔNG HỢP (không tên người) của sự kiện cho mọi thành viên được xem lịch:
--    số RSVP theo trạng thái, số có mặt/đi muộn/vắng/có phép, số người được kỳ vọng tham dự.
--    Lý do: RLS event_participants/attendance_records chỉ cho chính chủ (hoặc ban tổ chức/người có quyền) đọc dòng,
--    nên thành viên thường không đếm được "12 người tham dự · 7 có mặt" như giao diện hiển thị.
--    Quyền xem sự kiện kiểm giống chính sách events__select (event.read, chưa xóa, nháp chỉ người tạo/quản lý).
--
-- 2) app.fn_checkin_by_code(text, uuid, text) — điểm danh bằng MÃ 6 SỐ hiển thị cạnh mã QR (cho người không quét được QR).
--    Mã 6 số là phần rút gọn của HMAC đang hiển thị: lpad((32 bit đầu của MAC) mod 10^6, 6, '0') — ứng dụng tính
--    cùng công thức từ token app.fn_qr_token() để hiển thị. Hàm dò các phiên QR đang mở (lọc theo sự kiện nếu có), so mã
--    với 2 slot gần nhất rồi chuyển cho app.fn_checkin_by_qr() — mọi luật (đăng nhập, cửa sổ điểm danh, present/late theo
--    giờ máy chủ, geofence, một thiết bị/một người) vẫn do hàm thiết kế xử lý. luuxa_app không gọi được app.fn_qr_mac và
--    không đọc được qr_sessions.secret; hàm này là SECURITY DEFINER thuộc luuxa_definer giống app.fn_checkin_by_qr.
-- =====================================================================

CREATE OR REPLACE FUNCTION app.fn_event_stats(p_event_ids uuid[])
RETURNS TABLE (
  event_id        uuid,
  rsvp_going      integer,
  rsvp_maybe      integer,
  rsvp_not_going  integer,
  present_count   integer,
  late_count      integer,
  absent_count    integer,
  excused_count   integer,
  expected_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT e.id,
         COALESCE(r.going, 0), COALESCE(r.maybe, 0), COALESCE(r.not_going, 0),
         COALESCE(a.present, 0), COALESCE(a.late, 0), COALESCE(a.absent, 0), COALESCE(a.excused, 0),
         CASE WHEN e.requires_attendance THEN (
           SELECT count(*)::int FROM public.members m
            WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= app.local_date(e.starts_at)
              AND (e.expected_scope = 'all'
                   OR EXISTS (SELECT 1 FROM public.event_participants p WHERE p.event_id = e.id AND p.member_id = m.id AND p.is_invited)))
         END
    FROM public.events e
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE p.rsvp = 'going')::int     AS going,
             count(*) FILTER (WHERE p.rsvp = 'maybe')::int     AS maybe,
             count(*) FILTER (WHERE p.rsvp = 'not_going')::int AS not_going
        FROM public.event_participants p WHERE p.event_id = e.id
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE x.status = 'present')::int AS present,
             count(*) FILTER (WHERE x.status = 'late')::int    AS late,
             count(*) FILTER (WHERE x.status = 'absent')::int  AS absent,
             count(*) FILTER (WHERE x.status = 'excused')::int AS excused
        FROM public.attendance_records x WHERE x.event_id = e.id
    ) a ON true
   WHERE e.id = ANY (p_event_ids)
     AND cardinality(p_event_ids) <= 500
     AND app.current_user_id() IS NOT NULL
     AND app.has_permission('event.read')
     AND e.deleted_at IS NULL
     AND (e.status <> 'draft' OR e.created_by = app.current_user_id() OR app.has_permission('event.manage'))
$$;
COMMENT ON FUNCTION app.fn_event_stats(uuid[]) IS
  'Số liệu tổng hợp (không có tên người) của tối đa 500 sự kiện: RSVP going/maybe/not_going, điểm danh present/late/absent/excused, số người được kỳ vọng (thành viên đang ở trước ngày sự kiện hoặc danh sách mời; NULL nếu sự kiện không bật điểm danh). Kiểm quyền xem như RLS events__select. SECURITY DEFINER vì RLS chỉ cho thấy dòng RSVP/điểm danh của chính mình.';

CREATE OR REPLACE FUNCTION app.fn_checkin_by_code(p_code text, p_event_id uuid DEFAULT NULL, p_device_hash text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_code text := regexp_replace(COALESCE(p_code, ''), '[^0-9]', '', 'g');
  v_q    record;
  v_cur  bigint;
  v_slot bigint;
  v_mac  text;
BEGIN
  IF app.current_member_id() IS NULL THEN
    RAISE EXCEPTION 'BR-EVT-04: phải đăng nhập bằng tài khoản thành viên để điểm danh.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(v_code) <> 6 THEN
    RAISE EXCEPTION 'Mã điểm danh gồm 6 chữ số.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  FOR v_q IN
    SELECT q.id, q.rotation_seconds
      FROM public.qr_sessions q
      JOIN public.events e ON e.id = q.event_id AND e.deleted_at IS NULL
     WHERE q.status = 'active' AND now() BETWEEN q.opens_at AND q.closes_at
       AND (p_event_id IS NULL OR q.event_id = p_event_id)
     ORDER BY q.created_at DESC
     LIMIT 50
  LOOP
    v_cur := floor(extract(epoch FROM now()) / v_q.rotation_seconds)::bigint;
    FOREACH v_slot IN ARRAY ARRAY[v_cur, v_cur - 1] LOOP
      v_mac := app.fn_qr_mac(v_q.id, v_slot);
      IF lpad(((('x' || substr(v_mac, 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0') = v_code THEN
        RETURN app.fn_checkin_by_qr(v_q.id::text || '.' || v_slot::text || '.' || v_mac, NULL, NULL, p_device_hash);
      END IF;
    END LOOP;
  END LOOP;
  RAISE EXCEPTION 'BR-EVT-04: mã điểm danh không đúng hoặc đã hết hạn (mã đổi cùng mã QR). Hãy nhập mã đang hiển thị trên màn hình điểm danh.'
    USING ERRCODE = 'check_violation';
END
$$;
COMMENT ON FUNCTION app.fn_checkin_by_code(text, uuid, text) IS
  'Điểm danh bằng mã 6 số rút gọn từ HMAC của mã QR đang hiển thị (2 slot gần nhất), tùy chọn giới hạn theo sự kiện. Chuyển tiếp sang app.fn_checkin_by_qr nên mọi luật BR-EVT-03/04/05 và chống một thiết bị điểm danh nhiều người vẫn áp dụng. Trả về attendance_records.id.';

ALTER FUNCTION app.fn_event_stats(uuid[]) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_checkin_by_code(text, uuid, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_event_stats(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fn_checkin_by_code(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_event_stats(uuid[]) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
GRANT EXECUTE ON FUNCTION app.fn_checkin_by_code(text, uuid, text) TO luuxa_app, luuxa_definer, luuxa_owner;
