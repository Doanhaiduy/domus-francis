-- =====================================================================
-- DỮ LIỆU 2026-10-07 (bản 07) — Chỉnh lại luật nhà cho dễ đọc, rõ ràng, chuyên nghiệp + đánh dấu LỖI ĐỎ bằng cờ riêng. Idempotent.
--   Sau bản 06 (đưa tờ luật nhà thật vào hệ thống):
--   • Bỏ chữ "(Lỗi đỏ)" nằm trong câu: điều Lỗi đỏ mang cờ {"red": true} ⇒ giao diện hiện nhãn LỖI ĐỎ, nền/viền đỏ (db/app/1032 thêm discipline_rules.is_red).
--   • Viết lại câu chữ gọn, đủ ý, cùng một văn phong (không bắt buộc giống nguyên văn tờ luật).
--   • Mục "Xử lý vi phạm" thành cấu trúc rõ: Lỗi đỏ → Lỗi thường (các biện pháp là điều con {"sub": true}, thụt vào) → tái phạm; ghi chú {"note": true}
--     (không phải điều để ghi vi phạm — "Nhập từ Luật nhà" bỏ qua điều con và ghi chú).
--   • Luật phạt L01–L17: cập nhật TẠI CHỖ theo mã (không xóa/tạo lại, giữ nguyên liên kết với vi phạm đã ghi); tên điều luật vẫn lấy nguyên văn từ điều khoản
--     luật nhà; L01–L03 is_red = true.
-- Cuối file có kiểm tra tự động; sai khác ⇒ hủy cả giao dịch.
-- =====================================================================
BEGIN;

CREATE TEMP TABLE _hr (match_titles text[], title text, icon text, description text, items jsonb, ord int) ON COMMIT DROP;

INSERT INTO _hr (match_titles, title, icon, description, items, ord) VALUES
  (ARRAY['Giờ giấc sinh hoạt', 'Giờ giấc sinh hoạt chung'], 'Giờ giấc sinh hoạt', '⏰', 'Lịch sinh hoạt chung hằng ngày của cả nhà.',
   $j$[{"time":"21:00","text":"Tham dự đầy đủ giờ Kinh phụng vụ tối chung tại nhà dưới và các việc đạo đức."},
       {"time":"04:30 – 22:00","text":"Giờ giới nghiêm: cổng mở lúc 4:30 và đóng lúc 22:00. Về trễ phải báo trước cho Trưởng nhà."},
       {"time":"23:00","text":"Tắt đèn, giữ yên lặng để mọi người nghỉ ngơi."}]$j$::jsonb, 0),

  (ARRAY['Vệ sinh, trật tự & tài sản chung', 'Vệ sinh & trật tự chung'], 'Vệ sinh, trật tự & tài sản chung', '🧹', 'Cùng giữ nhà sạch sẽ, ngăn nắp và gìn giữ tài sản chung.',
   $j$[{"time":null,"text":"Giữ phòng ở, nhà vệ sinh và các khu vực trong nhà luôn sạch sẽ; đổ rác đúng giờ, đúng nơi."},
       {"time":null,"text":"Trực nhà theo phân công của Trưởng nhà; mỗi tuần có 2 bạn trực vệ sinh sân nhà theo lịch."},
       {"time":null,"text":"Sử dụng tài sản của Nhà Chung có trách nhiệm: tắt đèn, quạt khi ra khỏi phòng."},
       {"time":null,"text":"Bảo vệ cẩn trọng tài sản của Nhà Chung, của anh em và của chính mình."}]$j$::jsonb, 1),

  (ARRAY['Khách & ra vào', 'Khách và ra vào nhà'], 'Khách & ra vào', '🚪', 'Giữ an ninh và sự riêng tư cho mọi người trong nhà.',
   $j$[{"time":null,"text":"Tuyệt đối không dẫn nữ giới vào Nhà Chung.","red":true},
       {"time":null,"text":"Báo trước cho Trưởng nhà khi có khách ở lại qua đêm."},
       {"time":null,"text":"Gửi lại CCCD của khách cho Trưởng nhà khi khách ở lại qua đêm."},
       {"time":"21:00","text":"Khách đến chơi phải ra về trước 21:00."},
       {"time":null,"text":"Về quê hoặc vắng mặt dài ngày phải báo trước."}]$j$::jsonb, 2),

  (ARRAY['Tài chính chung'], 'Tài chính chung', '💳', 'Đóng góp đúng hạn, chi tiêu minh bạch.',
   $j$[{"time":null,"text":"Đóng quỹ và tiền điện nước đúng hạn theo thông báo của Thủ quỹ."},
       {"time":null,"text":"Mọi khoản chi chung phải có đề nghị và được duyệt theo quy trình."}]$j$::jsonb, 3),

  (ARRAY['Đức tin & học tập'], 'Đức tin & học tập', '🙏', 'Sống đức tin và chu toàn việc học.',
   $j$[{"time":null,"text":"Tham dự trọn vẹn các Thánh lễ trọng.","red":true},
       {"time":null,"text":"Chu toàn việc học: đạt điểm số các môn học.","red":true}]$j$::jsonb, 4),

  (ARRAY['Tinh thần Nhà Chung'], 'Tinh thần Nhà Chung', '🌹', NULL,
   $j$[{"time":null,"text":"Biết nhận lỗi, sửa lỗi và tiến bộ."},
       {"time":null,"text":"Lưu xá là Nhà Chung. Anh em đã xin Đức Maria Vô Nhiễm Nguyên Tội làm Thánh quan thầy: hãy nên giống Mẹ và từng bước theo chân Mẹ.","note":true}]$j$::jsonb, 5),

  (ARRAY['Xử lý vi phạm'], 'Xử lý vi phạm', '⚖️', 'Ngày đó, Thiên Chúa sẽ thưởng phạt mọi người tùy theo việc họ làm (Rm 2, 6).',
   $j$[{"time":null,"text":"Mời ra khỏi Nhà Chung. Áp dụng khi vi phạm một trong ba điều: không tham dự trọn vẹn Thánh lễ trọng; không chu toàn điểm số môn học; dẫn nữ giới vào Nhà Chung.","red":true,"note":true},
       {"time":null,"text":"Lỗi thường (Kinh tối và việc đạo đức, giờ giới nghiêm, trực nhà, sử dụng và bảo vệ tài sản, nhận lỗi – sửa lỗi): tùy tình trạng và số lần vi phạm, áp dụng một trong các biện pháp sau:","note":true},
       {"time":null,"text":"Chuyển phòng theo quyết định của buổi họp nhà.","sub":true},
       {"time":"3–14 ngày","text":"Cấm đọc Kinh chung và nói chuyện với anh em khác trong nhà.","sub":true},
       {"time":"1–7 ngày","text":"Tham dự Thánh lễ ngày thường.","sub":true},
       {"time":null,"text":"Đi viếng mộ, nghĩa trang của các Cha, các thai nhi và cầu nguyện cho các linh hồn.","sub":true},
       {"time":null,"text":"Lần chuỗi cầu nguyện cho Nhà Chung và cho chính mình.","sub":true},
       {"time":null,"text":"Tái phạm nhiều lần, gây hậu quả xấu không thể cứu vãn: chuyển sang xử lý như Lỗi đỏ.","note":true}]$j$::jsonb, 6);

UPDATE public.house_rule_sections s
   SET title = v.title, icon = v.icon, description = v.description, items = v.items, sort_order = v.ord, is_active = true
  FROM _hr v
 WHERE s.title = ANY (v.match_titles);

INSERT INTO public.house_rule_sections (title, icon, description, items, sort_order)
SELECT v.title, v.icon, v.description, v.items, v.ord
  FROM _hr v
 WHERE NOT EXISTS (SELECT 1 FROM public.house_rule_sections s WHERE s.title = ANY (v.match_titles));

-- ---------------------------------------------------------------------
-- Luật phạt L01–L17: cập nhật tại chỗ theo mã. Tên = nguyên văn điều khoản (khớp "Nhập từ Luật nhà"); is_red lấy từ cờ red của điều khoản.
--   tier: red · normal (lỗi thường 4–9) · plain (điều còn lại, chỉ ghi nhận)
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _dr (code text, section_title text, idx int, tier text, ord int, title text, description text, kind text, note text, is_red boolean) ON COMMIT DROP;

INSERT INTO _dr (code, section_title, idx, tier, ord) VALUES
  ('L01', 'Đức tin & học tập',                1, 'red',    10),
  ('L02', 'Đức tin & học tập',                2, 'red',    20),
  ('L03', 'Khách & ra vào',                   1, 'red',    30),
  ('L04', 'Giờ giấc sinh hoạt',               1, 'normal', 40),
  ('L05', 'Giờ giấc sinh hoạt',               2, 'normal', 50),
  ('L06', 'Vệ sinh, trật tự & tài sản chung', 2, 'normal', 60),
  ('L07', 'Vệ sinh, trật tự & tài sản chung', 3, 'normal', 70),
  ('L08', 'Vệ sinh, trật tự & tài sản chung', 4, 'normal', 80),
  ('L09', 'Tinh thần Nhà Chung',              1, 'normal', 90),
  ('L10', 'Giờ giấc sinh hoạt',               3, 'plain',  100),
  ('L11', 'Vệ sinh, trật tự & tài sản chung', 1, 'plain',  110),
  ('L12', 'Khách & ra vào',                   2, 'plain',  120),
  ('L13', 'Khách & ra vào',                   3, 'plain',  130),
  ('L14', 'Khách & ra vào',                   4, 'plain',  140),
  ('L15', 'Khách & ra vào',                   5, 'plain',  150),
  ('L16', 'Tài chính chung',                  1, 'plain',  160),
  ('L17', 'Tài chính chung',                  2, 'plain',  170);

UPDATE _dr d
   SET title = left(regexp_replace(btrim(it.item ->> 'text'), '\s+', ' ', 'g'), 200),
       is_red = COALESCE((it.item ->> 'red')::boolean, false),
       description =
         CASE d.tier
           WHEN 'red' THEN 'Vi phạm nghiêm trọng — bị mời ra khỏi Nhà Chung.'
           WHEN 'normal' THEN 'Lỗi thường — tùy tình trạng và số lần: chuyển phòng · cấm đọc Kinh chung, nói chuyện với anh em (3–14 ngày) · dự Thánh lễ ngày thường (1–7 ngày) · viếng mộ, cầu nguyện cho các linh hồn · lần chuỗi. Tái phạm nhiều lần: xử lý như Lỗi đỏ.'
           ELSE 'Mục “' || d.section_title || '” trong Luật nhà' || COALESCE(' (' || NULLIF(it.item ->> 'time', '') || ')', '')
         END,
       kind = CASE d.tier WHEN 'plain' THEN 'none' ELSE 'other' END,
       note = CASE d.tier WHEN 'red' THEN 'Mời ra khỏi Nhà Chung' WHEN 'normal' THEN 'Tùy tình trạng và số lần — xem biện pháp ở mô tả' ELSE NULL END
  FROM (
    SELECT s.title AS stitle, e.item, e.ord
      FROM public.house_rule_sections s
      CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY AS e(item, ord)
  ) it
 WHERE it.stitle = d.section_title AND it.ord = d.idx;

INSERT INTO public.discipline_rules (code, title, description, default_penalty_kind, default_penalty_qty, default_penalty_note, is_red, sort_order, is_active)
SELECT d.code, d.title, d.description, d.kind, NULL, d.note, d.is_red, d.ord, true FROM _dr d
ON CONFLICT (code) DO UPDATE
   SET title = EXCLUDED.title, description = EXCLUDED.description, default_penalty_kind = EXCLUDED.default_penalty_kind,
       default_penalty_qty = EXCLUDED.default_penalty_qty, default_penalty_note = EXCLUDED.default_penalty_note,
       is_red = EXCLUDED.is_red, sort_order = EXCLUDED.sort_order, is_active = true;

-- ---------------------------------------------------------------------
-- Kiểm tra: 7 mục; 4 điều Lỗi đỏ trong luật nhà; 17 điều luật phạt khớp nguyên văn điều khoản; đúng 3 điều luật phạt là Lỗi đỏ (L01–L03)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_sec int;
  n_red_items int;
  n_rules int;
  n_match int;
  n_red_rules int;
BEGIN
  SELECT count(DISTINCT title) INTO n_sec FROM public.house_rule_sections
   WHERE is_active AND title IN ('Giờ giấc sinh hoạt', 'Vệ sinh, trật tự & tài sản chung', 'Khách & ra vào', 'Tài chính chung', 'Đức tin & học tập', 'Tinh thần Nhà Chung', 'Xử lý vi phạm');
  IF n_sec <> 7 THEN RAISE EXCEPTION 'Luật nhà: cần đủ 7 mục, hiện có %', n_sec; END IF;

  SELECT count(*) INTO n_red_items FROM public.house_rule_sections s, jsonb_array_elements(s.items) e
   WHERE s.is_active AND (e ->> 'red') = 'true';
  IF n_red_items <> 4 THEN RAISE EXCEPTION 'Luật nhà: cần 4 điều Lỗi đỏ, hiện có %', n_red_items; END IF;

  SELECT count(*) INTO n_rules FROM public.discipline_rules WHERE is_active AND code ~ '^L(0[1-9]|1[0-7])$';
  SELECT count(*) INTO n_match FROM public.discipline_rules r
   WHERE r.is_active AND r.code ~ '^L(0[1-9]|1[0-7])$'
     AND EXISTS (SELECT 1 FROM public.house_rule_sections s, jsonb_array_elements(s.items) e
                  WHERE left(regexp_replace(btrim(e ->> 'text'), '\s+', ' ', 'g'), 200) = r.title);
  IF n_rules <> 17 OR n_match <> 17 THEN RAISE EXCEPTION 'Luật phạt: cần 17 điều khớp luật nhà, hiện có % (khớp %)', n_rules, n_match; END IF;

  SELECT count(*) INTO n_red_rules FROM public.discipline_rules WHERE is_red AND code IN ('L01', 'L02', 'L03');
  IF n_red_rules <> 3 THEN RAISE EXCEPTION 'Luật phạt: L01–L03 phải là Lỗi đỏ, hiện có %', n_red_rules; END IF;
END $$;

COMMIT;
