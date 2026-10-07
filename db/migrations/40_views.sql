-- =====================================================================
-- KHỐI 4.5 — VIEW & MATERIALIZED VIEW (báo cáo)
-- Mọi view dùng WITH (security_invoker = true): truy vấn chạy với quyền & RLS của NGƯỜI GỌI,
-- nên view không thể làm lộ dữ liệu mà bảng gốc đã chặn. Tổng hợp công khai cho thành viên dùng hàm SECURITY DEFINER
-- trả đúng số liệu tổng hợp (mục 4.5.120).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tài chính
-- ---------------------------------------------------------------------
CREATE VIEW v_fund_balances WITH (security_invoker = true) AS
SELECT f.id AS fund_id, f.code, f.name, f.fund_type,
       COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0)::bigint AS balance_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'), 0)::bigint  AS total_in_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out'), 0)::bigint AS total_out_vnd,
       COUNT(le.id) AS entry_count,
       MAX(le.posted_at) AS last_entry_at,
       f.head_hash
  FROM funds f
  LEFT JOIN ledger_entries le ON le.fund_id = f.id
 WHERE f.deleted_at IS NULL
 GROUP BY f.id;
COMMENT ON VIEW v_fund_balances IS 'Số dư từng túi quỹ = SUM(thu) − SUM(chi) từ sổ cái bất biến (KHÔNG có cột số dư sửa tay). Thay cho công thức fundBalance cài cứng của FE.';

CREATE VIEW v_period_cashflow WITH (security_invoker = true) AS
SELECT fp.period_month, fp.status AS period_status, le.fund_id, f.code AS fund_code,
       (COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type NOT IN ('transfer', 'reversal', 'opening_balance')), 0)
        - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'reversal'), 0))::bigint AS total_in_vnd,
       (COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type NOT IN ('transfer', 'reversal', 'opening_balance')), 0)
        - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'reversal'), 0))::bigint AS total_out_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.source_type = 'opening_balance'), 0)::bigint AS opening_balance_entries_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'transfer'), 0)::bigint AS transfer_in_vnd,
       COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'transfer'), 0)::bigint AS transfer_out_vnd,
       COUNT(le.id) AS entries
  FROM financial_periods fp
  JOIN ledger_entries le ON le.period_id = fp.id
  JOIN funds f ON f.id = le.fund_id
 GROUP BY fp.period_month, fp.status, le.fund_id, f.code;
COMMENT ON VIEW v_period_cashflow IS 'Thu – chi theo tháng và túi quỹ (nguồn biểu đồ 6 tháng; thay cho SIX_MONTH_BARS cài cứng). Thu/chi là số THUẦN: bút toán đảo trừ vào chiều gốc (đảo phiếu chi giảm tổng chi, hủy phiếu thu giảm tổng thu), chuyển quỹ nội bộ tách riêng (transfer_in/out) và số dư đầu kỳ nhập tay (opening_balance_entries_vnd) KHÔNG phải doanh thu nên cũng tách riêng. Số dư túi quỹ vẫn đúng: số dư đầu + thu − chi + chuyển đến − chuyển đi.';

CREATE VIEW v_expense_by_category WITH (security_invoker = true) AS
SELECT date_trunc('month', ev.expense_date)::date AS month, c.id AS category_id, c.code, c.name, c.color,
       COUNT(*) AS voucher_count, SUM(ev.amount_vnd)::bigint AS total_vnd
  FROM expense_vouchers ev
  JOIN categories c ON c.id = ev.category_id
 WHERE ev.status = 'paid'
 GROUP BY 1, c.id, c.code, c.name, c.color;
COMMENT ON VIEW v_expense_by_category IS 'Cơ cấu chi theo danh mục và tháng — chỉ phiếu đã chi (paid). FE cũ cộng cả phiếu chưa duyệt.';

CREATE VIEW v_contribution_matrix WITH (security_invoker = true) AS
SELECT cp.academic_year_id, ct.member_id, m.display_name AS member_name,
       (SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
         WHERE ra.member_id = m.id AND ra.ends_on IS NULL LIMIT 1) AS room_code,
       jsonb_object_agg(to_char(cp.period_month, 'YYYY-MM'),
         jsonb_build_object('contribution_id', ct.id, 'status', ct.status,
                            'due_vnd', ct.amount_due_vnd - ct.discount_vnd, 'paid_vnd', ct.paid_vnd,
                            'due_date', ct.due_date)
         ORDER BY to_char(cp.period_month, 'YYYY-MM')) AS months,
       SUM(ct.amount_due_vnd - ct.discount_vnd)::bigint AS total_due_vnd,
       SUM(ct.paid_vnd)::bigint AS total_paid_vnd,
       SUM(ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) FILTER (WHERE ct.status IN ('unpaid', 'partial'))::bigint AS outstanding_vnd,
       COUNT(*) FILTER (WHERE ct.status IN ('unpaid', 'partial') AND ct.due_date < app.local_today()) AS overdue_months
  FROM contributions ct
  JOIN contribution_plans cp ON cp.id = ct.plan_id AND cp.fee_type = 'monthly_dues' AND cp.status <> 'cancelled'
  JOIN members m ON m.id = ct.member_id
 GROUP BY cp.academic_year_id, ct.member_id, m.id, m.display_name;
COMMENT ON VIEW v_contribution_matrix IS 'Ma trận đóng quỹ thành viên × tháng của một năm học: months là JSON {"2026-10": {status, due_vnd, paid_vnd, due_date}, …}. Hỗ trợ đóng gộp, miễn giảm, nợ, quá hạn (overdue_months). Thay cho Contribution một-tháng của FE.';

CREATE VIEW v_member_debts WITH (security_invoker = true) AS
SELECT ct.member_id,
       SUM(ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd)::bigint AS outstanding_vnd,
       COUNT(*) AS open_items,
       MIN(ct.due_date) AS oldest_due_date,
       bool_or(ct.due_date < app.local_today()) AS has_overdue
  FROM contributions ct
 WHERE ct.status IN ('unpaid', 'partial')
 GROUP BY ct.member_id;
COMMENT ON VIEW v_member_debts IS 'Công nợ quỹ theo thành viên (dùng nhắc đóng quỹ và báo cáo nợ; chỉ Thủ quỹ/người quản lý thấy theo RLS).';

-- Tổng hợp công khai nội bộ (số liệu tổng, không lộ tên người nợ): chạy với quyền định nghĩa
CREATE OR REPLACE FUNCTION app.fn_finance_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_open   bigint;
  v_in     bigint;
  v_out    bigint;
  v_due    bigint;
  v_paid   bigint;
  v_cats   jsonb;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('finance.summary.read') THEN
    RAISE EXCEPTION 'Không có quyền xem tổng quan quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Khoảng thời gian không hợp lệ (tối đa 366 ngày).' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Số dư đầu kỳ = mọi bút toán trước p_from + các bút toán "số dư đầu kỳ nhập tay" nằm trong khoảng (đó không phải khoản thu)
  SELECT COALESCE(SUM(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END), 0) INTO v_open
    FROM public.ledger_entries le
   WHERE le.entry_date < p_from OR (le.entry_date BETWEEN p_from AND p_to AND le.source_type = 'opening_balance');
  SELECT COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type <> 'reversal'), 0)
         - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'reversal'), 0),
         COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type <> 'reversal'), 0)
         - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'reversal'), 0)
    INTO v_in, v_out FROM public.ledger_entries le
   WHERE le.entry_date BETWEEN p_from AND p_to AND le.source_type NOT IN ('transfer', 'opening_balance');
  SELECT COALESCE(SUM(ct.amount_due_vnd - ct.discount_vnd), 0), COALESCE(SUM(ct.paid_vnd), 0) INTO v_due, v_paid
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE cp.period_month BETWEEN date_trunc('month', p_from)::date AND p_to AND ct.status <> 'cancelled';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'color', x.color, 'total_vnd', x.total_vnd, 'count', x.cnt) ORDER BY x.total_vnd DESC), '[]'::jsonb)
    INTO v_cats
    FROM (SELECT c.code, c.name, c.color, SUM(ev.amount_vnd) AS total_vnd, COUNT(*) AS cnt
            FROM public.expense_vouchers ev JOIN public.categories c ON c.id = ev.category_id
           WHERE ev.status = 'paid' AND app.local_date(ev.paid_at) BETWEEN p_from AND p_to
           GROUP BY c.code, c.name, c.color) x;
  RETURN jsonb_build_object('from', p_from, 'to', p_to,
    'opening_balance_vnd', v_open, 'total_in_vnd', v_in, 'total_out_vnd', v_out, 'closing_balance_vnd', v_open + v_in - v_out,
    'dues_expected_vnd', v_due, 'dues_collected_vnd', v_paid,
    'collection_rate_pct', CASE WHEN v_due > 0 THEN round(100.0 * v_paid / v_due, 1) END,
    'expense_by_category', v_cats);
END
$$;
COMMENT ON FUNCTION app.fn_finance_summary(date, date) IS 'Tổng quan quỹ cho MỌI thành viên (quyền finance.summary.read): số dư đầu/cuối, tổng thu/chi, tỷ lệ thu quỹ, cơ cấu chi — không có tên người nợ hay chi tiết bút toán. Thu/chi là số thuần (bút toán đảo trừ vào chiều gốc); chuyển quỹ nội bộ không tính vào thu/chi nên số dư cuối = đầu + thu − chi vẫn khớp.';

-- ---------------------------------------------------------------------
-- Sự kiện & điểm danh
-- ---------------------------------------------------------------------
CREATE VIEW v_event_attendance WITH (security_invoker = true) AS
SELECT e.id AS event_id, e.title, e.starts_at,
       COUNT(*) FILTER (WHERE a.status = 'present')  AS present_count,
       COUNT(*) FILTER (WHERE a.status = 'late')     AS late_count,
       COUNT(*) FILTER (WHERE a.status = 'absent')   AS absent_count,
       COUNT(*) FILTER (WHERE a.status = 'excused')  AS excused_count,
       (SELECT COUNT(*) FROM members m
         WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= app.local_date(e.starts_at)
           AND (e.expected_scope = 'all' OR EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.member_id = m.id AND p.is_invited))) AS expected_count,
       CASE WHEN (SELECT COUNT(*) FROM members m2 WHERE m2.deleted_at IS NULL AND m2.status = 'active' AND m2.joined_on <= app.local_date(e.starts_at)) > 0
            THEN round(100.0 * COUNT(*) FILTER (WHERE a.status IN ('present', 'late'))
                 / NULLIF((SELECT COUNT(*) FROM members m
                            WHERE m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= app.local_date(e.starts_at)
                              AND (e.expected_scope = 'all' OR EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.member_id = m.id AND p.is_invited))), 0), 1)
       END AS attendance_rate_pct
  FROM events e
  LEFT JOIN attendance_records a ON a.event_id = e.id
 WHERE e.requires_attendance AND e.deleted_at IS NULL
 GROUP BY e.id;
COMMENT ON VIEW v_event_attendance IS 'Tỷ lệ tham gia từng sự kiện với MẪU SỐ đúng = người được kỳ vọng tham dự (thành viên đang ở trước sự kiện; hoặc danh sách mời), không phải tổng thành viên hiện tại như FE. Có mặt = present + late; excused không tính vào mẫu số bị trừ điểm.';

-- ---------------------------------------------------------------------
-- Nhà & phòng
-- ---------------------------------------------------------------------
CREATE VIEW v_room_occupancy WITH (security_invoker = true) AS
SELECT r.id AS room_id, r.code, r.name, r.floor_id, r.room_type, r.capacity, r.status,
       COUNT(ra.id) FILTER (WHERE ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on >= app.local_today())) AS occupied,
       GREATEST(r.capacity - COUNT(ra.id) FILTER (WHERE ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on >= app.local_today())), 0) AS available
  FROM rooms r
  LEFT JOIN room_assignments ra ON ra.room_id = r.id
 WHERE r.deleted_at IS NULL
 GROUP BY r.id;
COMMENT ON VIEW v_room_occupancy IS 'Phòng: sức chứa, đang ở, còn trống (không trừ gộp sai như KPI "Chỗ trống" của FE). Dùng cho thẻ KPI và bộ lọc "còn chỗ/đầy".';

CREATE VIEW v_member_current_room WITH (security_invoker = true) AS
SELECT ra.member_id, ra.room_id, r.code AS room_code, r.name AS room_name, r.floor_id, ra.starts_on AS since
  FROM room_assignments ra
  JOIN rooms r ON r.id = ra.room_id
 WHERE ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on >= app.local_today());
COMMENT ON VIEW v_member_current_room IS 'Phòng hiện tại của từng thành viên (thay cho chuỗi Member.room); thành viên chưa xếp phòng không có dòng.';

-- ---------------------------------------------------------------------
-- Trực nhật & điểm đóng góp
-- ---------------------------------------------------------------------
CREATE VIEW v_duty_week_stats WITH (security_invoker = true) AS
SELECT r.id AS roster_id, r.week_start,
       COUNT(a.id) AS total,
       COUNT(a.id) FILTER (WHERE a.status = 'approved')        AS approved,
       COUNT(a.id) FILTER (WHERE a.status = 'checked_in')      AS waiting_review,
       COUNT(a.id) FILTER (WHERE a.status = 'scheduled')       AS scheduled,
       COUNT(a.id) FILTER (WHERE a.status = 'rework_required') AS rework,
       COUNT(a.id) FILTER (WHERE a.status = 'missed')          AS missed,
       CASE WHEN COUNT(a.id) FILTER (WHERE a.status NOT IN ('cancelled', 'excused')) > 0
            THEN round(100.0 * COUNT(a.id) FILTER (WHERE a.status = 'approved')
                       / COUNT(a.id) FILTER (WHERE a.status NOT IN ('cancelled', 'excused')), 1) END AS completion_rate_pct
  FROM duty_rosters r
  LEFT JOIN duty_assignments a ON a.roster_id = r.id
 GROUP BY r.id;
COMMENT ON VIEW v_duty_week_stats IS 'Thống kê tuần: bốn thẻ "Ca hôm nay / Đã nghiệm thu / Chờ nghiệm thu / Tiến độ tuần" tính theo ROSTER TUẦN (FE tính trên toàn bộ mảng, cài cứng Thứ Sáu).';

CREATE VIEW v_duty_member_stats WITH (security_invoker = true) AS
SELECT m.id AS member_id, m.display_name, r.academic_year_id,
       COUNT(a.id) AS assigned,
       COUNT(a.id) FILTER (WHERE a.status = 'approved')        AS approved,
       COUNT(a.id) FILTER (WHERE a.status = 'rework_required') AS rework,
       COUNT(a.id) FILTER (WHERE a.status = 'missed')          AS missed,
       COALESCE((SELECT SUM(me.points) FROM merit_entries me WHERE me.member_id = m.id AND me.academic_year_id IS NOT DISTINCT FROM r.academic_year_id), 0) AS merit_points
  FROM members m
  JOIN duty_assignment_members dm ON dm.member_id = m.id
  JOIN duty_assignments a ON a.id = dm.assignment_id
  JOIN duty_rosters r ON r.id = a.roster_id
 GROUP BY m.id, m.display_name, r.academic_year_id;
COMMENT ON VIEW v_duty_member_stats IS 'Công bằng phân công: số ca được giao/đạt/làm lại/bỏ theo người và năm học + tổng điểm đóng góp. Đầu vào cho thuật toán phân công cân bằng.';

-- ---------------------------------------------------------------------
-- Học tập
-- ---------------------------------------------------------------------
CREATE VIEW v_member_gpa_latest WITH (security_invoker = true) AS
SELECT DISTINCT ON (g.member_id)
       g.member_id, g.as_of_semester_id, s.code AS semester_code, g.credits_attempted, g.credits_passed,
       g.failed_courses, g.gpa10, g.gpa4, g.rank_label, g.includes_unverified, g.computed_at
  FROM gpa_snapshots g
  JOIN semesters s ON s.id = g.as_of_semester_id
 WHERE g.scope = 'cumulative'
 ORDER BY g.member_id, s.starts_on DESC;
COMMENT ON VIEW v_member_gpa_latest IS 'GPA tích lũy mới nhất của từng thành viên (chỉ hiển thị cho người có quyền/đồng ý theo RLS của gpa_snapshots).';

CREATE OR REPLACE FUNCTION app.fn_academic_aggregate(p_semester_id uuid)
RETURNS TABLE (students integer, avg_gpa4 numeric, excellent_or_good integer, scholarship integer, need_support integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_permission('academic.read_aggregate') THEN
    RAISE EXCEPTION 'Không có quyền xem thống kê học tập tổng hợp.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT COUNT(*)::integer,
         round(AVG(g.gpa4), 2),
         COUNT(*) FILTER (WHERE g.rank_label IN ('Xuất sắc', 'Giỏi'))::integer,
         COUNT(*) FILTER (WHERE ar.has_scholarship)::integer,
         (SELECT COUNT(DISTINCT tr.mentee_member_id) FROM public.tutoring_requests tr WHERE tr.status = 'open')::integer
    FROM public.gpa_snapshots g
    JOIN public.academic_records ar ON ar.member_id = g.member_id AND ar.semester_id = g.as_of_semester_id
   WHERE g.scope = 'semester' AND g.as_of_semester_id = p_semester_id
  HAVING COUNT(*) >= 3;
END
$$;
COMMENT ON FUNCTION app.fn_academic_aggregate(uuid) IS 'Thống kê học tập TỔNG HỢP ẩn danh (4 thẻ KPI): trả dữ liệu chỉ khi nhóm có ≥ 3 thành viên (k-anonymity) để không suy ra điểm cá nhân. Trung bình có trọng số theo sinh viên, không đếm bản ghi như FE.';

-- ---------------------------------------------------------------------
-- Cơ sở vật chất, kho, thông báo, AI
-- ---------------------------------------------------------------------
CREATE VIEW v_issue_costs WITH (security_invoker = true) AS
SELECT i.id AS issue_id, i.issue_no,
       COALESCE(SUM(rc.amount_vnd) FILTER (WHERE rc.cost_kind = 'estimate'), 0)::bigint AS estimate_vnd,
       COALESCE(SUM(rc.amount_vnd) FILTER (WHERE rc.cost_kind = 'actual'), 0)::bigint   AS actual_vnd
  FROM maintenance_issues i
  LEFT JOIN repair_costs rc ON rc.issue_id = i.id
 GROUP BY i.id;
COMMENT ON VIEW v_issue_costs IS 'Dự toán và chi phí thực của sự cố (FE nhầm lẫn hai khái niệm).';

CREATE VIEW v_issue_sla WITH (security_invoker = true) AS
SELECT i.id AS issue_id, 'LOG-' || lpad(i.issue_no::text, 6, '0') AS code, i.title, i.urgency, i.status, i.created_at, i.sla_due_at,
       (i.status IN ('new', 'in_progress', 'waiting_parts') AND i.sla_due_at < now()) AS sla_breached,
       EXTRACT(EPOCH FROM (COALESCE(i.resolved_at, now()) - i.created_at)) / 3600.0 AS age_hours
  FROM maintenance_issues i;
COMMENT ON VIEW v_issue_sla IS 'Sự cố kèm mã hiển thị LOG-000108, tuổi (giờ) và cờ vi phạm SLA; nguồn KPI thời gian xử lý trung bình (MTTR) theo mức khẩn.';

CREATE VIEW v_pantry_status WITH (security_invoker = true) AS
SELECT p.id, p.name, p.unit, p.qty_on_hand, p.par_level,
       CASE WHEN p.par_level = 0 OR p.qty_on_hand >= p.par_level THEN 'ok'
            WHEN p.qty_on_hand >= p.par_level * 0.4 THEN 'low'
            ELSE 'urgent' END AS stock_status
  FROM pantry_items p WHERE p.is_active;
COMMENT ON VIEW v_pantry_status IS 'Kho bếp: ok=Đầy đủ, low=Sắp hết (< định mức), urgent=Cần mua gấp (< 40% định mức). Ngưỡng 40% là mặc định hiển thị, không ảnh hưởng dữ liệu.';

-- Mẫu số "đã nhận": số thành viên đang ở thuộc đối tượng nhận của thông báo (cùng quy tắc với app.is_announcement_target:
-- không có dòng đối tượng = toàn thể; ngược lại khớp theo thành viên / phòng / tầng / vai trò còn hiệu lực).
-- SECURITY DEFINER vì nhánh vai trò phải đọc user_roles mà RLS chỉ cho người có auth.user.read/auth.role.assign — nếu không, Phó nhà hay
-- tác giả sẽ thấy mẫu số 0 cho thông báo gửi theo vai trò. Chỉ trả MỘT con số tổng hợp; view vẫn lọc theo RLS của announcements.
CREATE OR REPLACE FUNCTION app.fn_announcement_target_count(p_announcement_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM public.announcement_targets t WHERE t.announcement_id = p_announcement_id)
              THEN (SELECT COUNT(*) FROM public.members m WHERE m.status = 'active' AND m.deleted_at IS NULL)
              ELSE (SELECT COUNT(DISTINCT m.id) FROM public.members m
                     WHERE m.status = 'active' AND m.deleted_at IS NULL AND EXISTS (
                       SELECT 1 FROM public.announcement_targets t WHERE t.announcement_id = p_announcement_id AND (
                            t.member_id = m.id
                         OR t.room_id IN (SELECT ra.room_id FROM public.room_assignments ra WHERE ra.member_id = m.id AND ra.ends_on IS NULL)
                         OR t.floor_id IN (SELECT r.floor_id FROM public.room_assignments ra JOIN public.rooms r ON r.id = ra.room_id WHERE ra.member_id = m.id AND ra.ends_on IS NULL)
                         OR t.role_id IN (SELECT ur.role_id FROM public.user_roles ur
                                           WHERE ur.user_id = m.user_id AND ur.revoked_at IS NULL
                                             AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now()))))) END
$$;
COMMENT ON FUNCTION app.fn_announcement_target_count(uuid) IS 'Số thành viên đang ở thuộc đối tượng nhận của một thông báo (mẫu số cho v_announcement_read_stats). SECURITY DEFINER để đếm được theo vai trò dù người xem không đọc được user_roles; chỉ trả số tổng hợp.';

CREATE VIEW v_announcement_read_stats WITH (security_invoker = true) AS
SELECT a.id AS announcement_id,
       app.fn_announcement_target_count(a.id) AS target_count,
       (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
       (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id AND r.acknowledged_at IS NOT NULL) AS ack_count
  FROM announcements a;
COMMENT ON VIEW v_announcement_read_stats IS 'Số người thuộc đối tượng nhận / đã đọc / đã xác nhận của từng thông báo (thay cho chuỗi cứng "12/12 thành viên đã nhận"). Mẫu số tính bằng app.fn_announcement_target_count (đúng với mọi người xem); số đã đọc/xác nhận chịu RLS của announcement_reads (tác giả và người có announcement.pin thấy đủ, thành viên thường chỉ thấy lượt của mình).';

CREATE VIEW v_ai_acceptance WITH (security_invoker = true) AS
SELECT s.task_code,
       COUNT(*) FILTER (WHERE s.status = 'accepted') AS accepted,
       COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected,
       COUNT(*) FILTER (WHERE s.status = 'expired')  AS expired,
       COUNT(*) FILTER (WHERE s.status = 'pending')  AS pending,
       CASE WHEN COUNT(*) FILTER (WHERE s.status IN ('accepted', 'rejected')) > 0
            THEN round(100.0 * COUNT(*) FILTER (WHERE s.status = 'accepted') / COUNT(*) FILTER (WHERE s.status IN ('accepted', 'rejected')), 1) END AS acceptance_rate_pct
  FROM ai_suggestions s
 GROUP BY s.task_code;
COMMENT ON VIEW v_ai_acceptance IS 'Tỷ lệ gợi ý AI được chấp nhận theo tác vụ — chỉ số quyết định tiếp tục/rút tính năng (Phần 8.4). Chỉ vai trò ai.manage đọc được (GRANT).';

-- ---------------------------------------------------------------------
-- Materialized view: dòng tiền theo tháng (làm mới hằng đêm; REFRESH … CONCURRENTLY nhờ unique index)
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_cashflow_monthly AS
SELECT date_trunc('month', le.entry_date)::date AS month,
       le.fund_id,
       (COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type NOT IN ('transfer', 'reversal', 'opening_balance')), 0)
        - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type = 'reversal'), 0))::bigint AS total_in_vnd,
       (COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'out' AND le.source_type NOT IN ('transfer', 'reversal', 'opening_balance')), 0)
        - COALESCE(SUM(le.amount_vnd) FILTER (WHERE le.direction = 'in'  AND le.source_type = 'reversal'), 0))::bigint AS total_out_vnd
  FROM ledger_entries le
 GROUP BY 1, 2
WITH DATA;
CREATE UNIQUE INDEX ux_mv_cashflow_monthly ON mv_cashflow_monthly (month, fund_id);
COMMENT ON MATERIALIZED VIEW mv_cashflow_monthly IS 'Thu/chi theo tháng và túi quỹ cho biểu đồ nhiều tháng. Không chứa dữ liệu cá nhân nên cho phép đọc theo quyền finance.summary.read ở lớp API. Làm mới: SELECT app.fn_refresh_cashflow() (worker, 02:00 hằng đêm). Chủ sở hữu là luuxa_definer (BYPASSRLS) — nếu chủ là luuxa_owner thì REFRESH chạy dưới RLS bắt buộc (FORCE) và view rỗng vĩnh viễn.';

-- REFRESH chạy truy vấn của view dưới quyền CHỦ SỞ HỮU view và chỉ chủ sở hữu/superuser được REFRESH. Bảng sổ cái bật FORCE RLS nên chủ sở hữu thường
-- (luuxa_owner, không BYPASSRLS) đọc được 0 dòng ⇒ view luôn rỗng; worker lại không phải chủ nên không tự làm mới được. Giải pháp: view thuộc luuxa_definer
-- (xem 49_b_grants.sql, mục E) và worker làm mới qua hàm SECURITY DEFINER cùng chủ này.
CREATE OR REPLACE FUNCTION app.fn_refresh_cashflow()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cashflow_monthly;
END
$$;
COMMENT ON FUNCTION app.fn_refresh_cashflow() IS 'Làm mới mv_cashflow_monthly (worker gọi lúc 02:00). SECURITY DEFINER do luuxa_definer (BYPASSRLS, chủ của view) sở hữu nên đọc được toàn bộ sổ cái; luuxa_app không có quyền gọi.';
