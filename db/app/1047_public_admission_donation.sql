-- =====================================================================
-- 1047 — TRANG CÔNG KHAI: "VÀO Ở LƯU XÁ", BÁO ỦNG HỘ CÔNG KHAI, MINH BẠCH ỦNG HỘ. Chạy SAU 1046. Idempotent.
--   • Cấu hình mới:
--       org.show_vacancies        hiện số chỗ trống ở /vao-o (mặc định BẬT; người quản lý tắt khi không muốn công bố).
--       org.donation_transparency hiện khối "Minh bạch" ở /ung-ho (mặc định TẮT; quyết định tài chính ⇒ cần finance.settings.write).
--   • app.fn_public_admission_info(): số liệu TỔNG QUÁT cho trang /vao-o (người chưa đăng nhập gọi được):
--       mức quỹ theo cấu hình finance.dues_* + kỳ quỹ đang thu (tên, mức, hạn — KHÔNG ai đã/chưa đóng),
--       tiền điện nước bình quân/người của tối đa 3 tháng gần nhất (trong 6 tháng qua),
--       chỗ trống = sức chứa phòng ngủ đang dùng − số người đang được xếp ở (chỉ khi org.show_vacancies bật),
--       nhịp sinh hoạt: giờ Kinh tối (liturgy.night_prayer_time), giờ chốt cơm (khi phân hệ Bếp bật), mục "Giờ giấc" của Luật nhà.
--   • app.fn_public_donation_report(...): người ngoài báo "tôi đã ủng hộ" từ /ung-ho ⇒ một khoản donations 'pending' (CHƯA vào sổ quỹ),
--       donor_member_id NULL + self_reported = true (dấu hiệu "báo từ trang công khai"); lời nhắn + liên hệ ghi vào note (audit che note).
--       Báo Thủ quỹ + Trưởng nhà (finance.donation_pending, link /thu-chi?tab=ung-ho). Chống spam: 3 lần/giờ/IP băm + 30 lần/giờ toàn hệ thống
--       (app.fn_rate_limit_hit), tối đa 50 khoản công khai đang chờ, gộp trùng 24 giờ (cùng tên + số tiền + ngày). Chỉ khi trang Ủng hộ đang bật.
--   • app.fn_public_donation_transparency(p_year): tổng tiền ủng hộ ĐÃ XÁC NHẬN + số lượt, tổng chi ĐÃ CHI theo hạng mục của một năm —
--       chỉ khi bật cả org.donation_enabled và org.donation_transparency. CHỈ số tổng, không tên người, không nội dung phiếu.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cấu hình
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value) VALUES
  ('org.show_vacancies', 'true'::jsonb, 'boolean',
   'Hiện số chỗ trống (sức chứa phòng ngủ − số người đang ở) ở trang công khai “Vào ở lưu xá”. Tắt nếu không muốn công bố.',
   NULL, NULL, true, 'setting.write', 'true'::jsonb),
  ('org.donation_transparency', 'false'::jsonb, 'boolean',
   'Hiện khối “Minh bạch” ở trang Ủng hộ: tổng tiền ủng hộ đã nhận + số lượt và tổng chi theo hạng mục từng năm (chỉ số tổng, không tên người).',
   NULL, NULL, true, 'finance.settings.write', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Số liệu cho trang "Vào ở lưu xá"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_public_admission_info()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_today date := app.local_today();
  s       jsonb;
  v_meals boolean;
  v_vac   jsonb := jsonb_build_object('enabled', false);
  v_cap   integer;
  v_res   integer;
  v_plan  jsonb;
  v_util  jsonb;
  v_sched jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(x.key, x.value), '{}'::jsonb) INTO s
    FROM public.settings x
   WHERE x.key IN ('org.show_vacancies', 'finance.dues_cycle_amount_vnd', 'finance.dues_cycle_months', 'finance.dues_cycle_start_month',
                   'finance.dues_cycle_due_day', 'finance.dues_cycle_graduated_amount_vnd', 'liturgy.night_prayer_time',
                   'feature.meals.enabled', 'meal.lunch_cutoff_time', 'meal.dinner_cutoff_time', 'ui.disabled_modules');

  -- Chỗ trống: chỉ phòng ngủ đang dùng (bảo trì / giữ chỗ không tính)
  IF COALESCE(s -> 'org.show_vacancies', 'true'::jsonb) = 'true'::jsonb THEN
    SELECT COALESCE(sum(r.capacity), 0)::int INTO v_cap
      FROM public.rooms r
     WHERE r.room_type = 'bedroom' AND r.status = 'active' AND r.deleted_at IS NULL;
    SELECT count(DISTINCT ra.member_id)::int INTO v_res
      FROM public.room_assignments ra
      JOIN public.rooms r ON r.id = ra.room_id AND r.room_type = 'bedroom' AND r.status = 'active' AND r.deleted_at IS NULL
     WHERE ra.starts_on <= v_today AND (ra.ends_on IS NULL OR ra.ends_on >= v_today);
    IF v_cap > 0 THEN
      v_vac := jsonb_build_object('enabled', true, 'capacity', v_cap, 'residents', v_res, 'free', GREATEST(v_cap - v_res, 0));
    END IF;
  END IF;

  -- Kỳ quỹ đang thu: chỉ tên + mức mỗi người + kỳ + hạn
  SELECT jsonb_build_object(
           'name', p.name,
           'amountVnd', p.amount_vnd,
           'from', to_char(p.period_month, 'YYYY-MM'),
           'to', to_char(COALESCE(p.period_end_month, p.period_month), 'YYYY-MM'),
           'dueDate', to_char(p.due_date, 'YYYY-MM-DD'))
    INTO v_plan
    FROM public.contribution_plans p
   WHERE p.fee_type IN ('periodic_dues', 'monthly_dues') AND p.status = 'active'
   ORDER BY p.period_month DESC NULLS LAST, p.created_at DESC
   LIMIT 1;

  -- Tiền điện nước: bình quân mỗi người của tối đa 3 tháng gần nhất (bỏ kế hoạch đã hủy, chỉ trong 6 tháng qua)
  SELECT CASE WHEN count(*) > 0 THEN jsonb_build_object(
           'avgPerPersonVnd', (round(avg(u.amount_vnd) / 1000.0) * 1000)::bigint,
           'months', count(*),
           'from', to_char(min(u.period_month), 'YYYY-MM'),
           'to', to_char(max(u.period_month), 'YYYY-MM')) END
    INTO v_util
    FROM (SELECT p.amount_vnd, p.period_month
            FROM public.contribution_plans p
           WHERE p.fee_type = 'utility' AND p.status <> 'cancelled'
             AND p.period_month >= (date_trunc('month', v_today) - interval '6 months')::date
           ORDER BY p.period_month DESC
           LIMIT 3) u;

  -- Mục "Giờ giấc" của Luật nhà (điều khoản: giờ + nội dung; cờ ghi chú / điều con giữ nguyên)
  SELECT jsonb_build_object(
           'title', h.title,
           'description', h.description,
           'items', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'time', NULLIF(btrim(e.item ->> 'time'), ''),
                      'text', btrim(e.item ->> 'text'),
                      'note', COALESCE((e.item -> 'note') = 'true'::jsonb, false),
                      'sub', COALESCE((e.item -> 'sub') = 'true'::jsonb, false)) ORDER BY e.ord)
               FROM jsonb_array_elements(h.items) WITH ORDINALITY AS e(item, ord)
              WHERE jsonb_typeof(e.item) = 'object' AND NULLIF(btrim(e.item ->> 'text'), '') IS NOT NULL), '[]'::jsonb))
    INTO v_sched
    FROM public.house_rule_sections h
   WHERE h.is_active AND h.title ILIKE '%giờ giấc%'
   ORDER BY h.sort_order, h.created_at
   LIMIT 1;

  v_meals := COALESCE(s -> 'feature.meals.enabled', 'false'::jsonb) = 'true'::jsonb
             AND NOT (jsonb_typeof(s -> 'ui.disabled_modules') = 'object' AND (s -> 'ui.disabled_modules') ? '/bep-com');

  RETURN jsonb_build_object(
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'dues', jsonb_build_object(
      'cycleAmountVnd', s -> 'finance.dues_cycle_amount_vnd',
      'cycleMonths', s -> 'finance.dues_cycle_months',
      'cycleStartMonth', s -> 'finance.dues_cycle_start_month',
      'cycleDueDay', s -> 'finance.dues_cycle_due_day',
      'graduatedAmountVnd', s -> 'finance.dues_cycle_graduated_amount_vnd',
      'currentPlan', v_plan),
    'utilities', v_util,
    'vacancies', v_vac,
    'rhythm', jsonb_build_object(
      'nightPrayerTime', s ->> 'liturgy.night_prayer_time',
      'mealsEnabled', v_meals,
      'lunchCutoff', CASE WHEN v_meals THEN s ->> 'meal.lunch_cutoff_time' END,
      'dinnerCutoff', CASE WHEN v_meals THEN s ->> 'meal.dinner_cutoff_time' END),
    'schedule', v_sched);
END
$$;
COMMENT ON FUNCTION app.fn_public_admission_info() IS
  'Số liệu tổng quát cho trang công khai /vao-o: mức quỹ (cấu hình + kỳ đang thu), điện nước bình quân 3 tháng, chỗ trống (khi org.show_vacancies bật), nhịp sinh hoạt (Kinh tối, chốt cơm, mục Giờ giấc của Luật nhà). Không trả tên hay ai nợ.';
ALTER FUNCTION app.fn_public_admission_info() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_public_admission_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_public_admission_info() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 3. Người ngoài báo "đã ủng hộ" từ trang công khai
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_public_donation_report(
  p_donor_name text, p_amount_vnd bigint, p_donated_on date, p_message text, p_contact text, p_ip_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_today   date := app.local_today();
  v_name    text := NULLIF(btrim(regexp_replace(COALESCE(p_donor_name, ''), '\s+', ' ', 'g')), '');
  v_msg     text := NULLIF(btrim(regexp_replace(COALESCE(p_message, ''), '\s+', ' ', 'g')), '');
  v_contact text := NULLIF(btrim(regexp_replace(COALESCE(p_contact, ''), '\s+', ' ', 'g')), '');
  v_ip      text := NULLIF(btrim(COALESCE(p_ip_hash, '')), '');
  v_id      uuid;
BEGIN
  IF (SELECT value FROM public.settings WHERE key = 'org.donation_enabled') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'DONATION_DISABLED: Trang ủng hộ đang tạm tắt.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd < 1000 OR p_amount_vnd > 1000000000 THEN
    RAISE EXCEPTION 'Số tiền ủng hộ phải từ 1.000 đ đến 1.000.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donated_on IS NULL OR p_donated_on > v_today THEN
    RAISE EXCEPTION 'Ngày ủng hộ không được ở tương lai.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donated_on < v_today - 366 THEN
    RAISE EXCEPTION 'Chỉ báo được khoản ủng hộ trong vòng một năm trở lại — khoản cũ hơn xin liên hệ trực tiếp người quản lý.' USING ERRCODE = 'check_violation';
  END IF;
  v_name := COALESCE(v_name, 'Ẩn danh');
  IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Tên / danh xưng từ 2 đến 120 ký tự (để trống nếu muốn ẩn danh).' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(COALESCE(v_msg, '')) > 300 THEN
    RAISE EXCEPTION 'Lời nhắn tối đa 300 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(COALESCE(v_contact, '')) > 120 THEN
    RAISE EXCEPTION 'Thông tin liên hệ tối đa 120 ký tự.' USING ERRCODE = 'check_violation';
  END IF;

  -- Chống spam (đếm lưu trong CSDL, đúng cả khi chạy nhiều instance). Khóa IP do ứng dụng băm — không lưu IP thô.
  IF v_ip IS NOT NULL AND NOT app.fn_rate_limit_hit('donation-public:' || left(v_ip, 64), 3600, 3) THEN
    RAISE EXCEPTION 'RATE_LIMITED: Bạn đã gửi quá nhiều lần. Vui lòng thử lại sau ít phút hoặc gọi hotline của nhà.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT app.fn_rate_limit_hit('donation-public:all', 3600, 30) THEN
    RAISE EXCEPTION 'RATE_LIMITED: Hệ thống đang nhận quá nhiều báo ủng hộ. Vui lòng thử lại sau.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.donations d WHERE d.donor_member_id IS NULL AND d.self_reported AND d.status = 'pending') >= 50 THEN
    RAISE EXCEPTION 'RATE_LIMITED: Đang có nhiều báo ủng hộ chờ Thủ quỹ đối chiếu. Vui lòng thử lại sau hoặc gọi hotline của nhà.' USING ERRCODE = 'check_violation';
  END IF;

  -- Gửi lại cùng một khoản (cùng tên + số tiền + ngày) trong 24 giờ ⇒ trả khoản cũ, không báo trùng
  SELECT d.id INTO v_id
    FROM public.donations d
   WHERE d.donor_member_id IS NULL AND d.self_reported AND d.status = 'pending'
     AND d.amount_vnd = p_amount_vnd AND d.donated_on = p_donated_on AND lower(d.donor_name) = lower(v_name)
     AND d.created_at > now() - interval '24 hours'
   ORDER BY d.created_at DESC
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.donations (donor_member_id, donor_name, amount_vnd, donated_on, method, note, status, self_reported)
  VALUES (NULL, v_name, p_amount_vnd, p_donated_on, 'bank_transfer',
          left(concat_ws(' · ', 'Báo từ trang Ủng hộ công khai', 'Lời nhắn: ' || v_msg, 'Liên hệ: ' || v_contact), 500),
          'pending', true)
  RETURNING id INTO v_id;

  PERFORM app.fn_notify_roles(ARRAY['treasurer', 'house_head'], 'finance.donation_pending',
    v_name || ' báo đã ủng hộ quỹ ' || app.fn_vnd(p_amount_vnd),
    'Báo từ trang Ủng hộ công khai (chuyển khoản ngày ' || to_char(p_donated_on, 'DD/MM/YYYY') || '). Đối chiếu sao kê rồi xác nhận ở Thu chi → Ủng hộ.',
    jsonb_build_object('link', '/thu-chi?tab=ung-ho'), 'donations', v_id);
  RETURN v_id;
END
$$;
COMMENT ON FUNCTION app.fn_public_donation_report(text, bigint, date, text, text, text) IS
  'Người ngoài báo đã ủng hộ từ trang /ung-ho (không cần tài khoản): tạo khoản donations pending (chưa vào sổ), báo Thủ quỹ/Trưởng nhà. Chống spam: 3/giờ/IP băm, 30/giờ toàn hệ thống, tối đa 50 khoản công khai đang chờ, gộp trùng 24 giờ.';
ALTER FUNCTION app.fn_public_donation_report(text, bigint, date, text, text, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_public_donation_report(text, bigint, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_public_donation_report(text, bigint, date, text, text, text) TO luuxa_app, luuxa_definer, luuxa_owner;

-- ---------------------------------------------------------------------
-- 4. Minh bạch: tổng ủng hộ + tổng chi theo hạng mục của một năm
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_public_donation_transparency(p_year integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_this   integer := extract(year FROM app.local_today())::int;
  v_year   integer;
  v_from   date;
  v_to     date;
  v_years  jsonb;
  v_dcount integer;
  v_dtotal bigint;
  v_exp    jsonb;
  v_etotal bigint;
BEGIN
  IF (SELECT value FROM public.settings WHERE key = 'org.donation_enabled') IS DISTINCT FROM 'true'::jsonb
     OR (SELECT value FROM public.settings WHERE key = 'org.donation_transparency') IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;
  v_year := CASE WHEN p_year BETWEEN 2000 AND v_this THEN p_year ELSE v_this END;
  v_from := make_date(v_year, 1, 1);
  v_to   := make_date(v_year, 12, 31);

  SELECT COALESCE(jsonb_agg(b.y ORDER BY b.y DESC), '[]'::jsonb) INTO v_years
    FROM (SELECT a.y
            FROM (SELECT v_this AS y
                  UNION SELECT extract(year FROM d.donated_on)::int FROM public.donations d WHERE d.status = 'confirmed'
                  UNION SELECT extract(year FROM e.expense_date)::int FROM public.expense_vouchers e WHERE e.status = 'paid') a
           WHERE a.y BETWEEN 2000 AND v_this
           ORDER BY a.y DESC
           LIMIT 6) b;

  SELECT count(*)::int, COALESCE(sum(d.amount_vnd), 0)::bigint INTO v_dcount, v_dtotal
    FROM public.donations d
   WHERE d.status = 'confirmed' AND d.donated_on BETWEEN v_from AND v_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', x.name, 'totalVnd', x.total) ORDER BY x.total DESC, x.name), '[]'::jsonb),
         COALESCE(sum(x.total), 0)::bigint
    INTO v_exp, v_etotal
    FROM (SELECT c.name, sum(e.amount_vnd)::bigint AS total
            FROM public.expense_vouchers e
            JOIN public.categories c ON c.id = e.category_id
           WHERE e.status = 'paid' AND e.expense_date BETWEEN v_from AND v_to
           GROUP BY c.name) x;

  RETURN jsonb_build_object(
    'enabled', true,
    'year', v_year,
    'years', v_years,
    'donationCount', v_dcount,
    'donationTotalVnd', v_dtotal,
    'expenseTotalVnd', v_etotal,
    'expenseByCategory', v_exp,
    'asOf', to_char(app.local_today(), 'YYYY-MM-DD'));
END
$$;
COMMENT ON FUNCTION app.fn_public_donation_transparency(integer) IS
  'Khối minh bạch ở /ung-ho (khi bật org.donation_enabled + org.donation_transparency): tổng ủng hộ đã xác nhận + số lượt, tổng chi đã chi theo hạng mục của một năm. Chỉ số tổng.';
ALTER FUNCTION app.fn_public_donation_transparency(integer) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_public_donation_transparency(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_public_donation_transparency(integer) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

COMMIT;
