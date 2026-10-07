-- =====================================================================
-- DỮ LIỆU 2026-10-07 — Đưa "Luật Nhà Lưu Xá Phanxicô Nha Trang" (tờ luật dán ở nhà) vào Luật nhà + Luật phạt. Idempotent.
--
-- Nguyên tắc (theo yêu cầu của Trưởng nhà): điều TRÙNG thì gộp/bỏ, điều SAI thì sửa, điều THIẾU thì thêm.
--   Tờ luật thật (9 lỗi + lời dặn cuối + biện pháp xử lý):
--     Lỗi đỏ (1–3, mời ra khỏi Nhà Chung): 1 Tham dự Thánh lễ trọng trọn vẹn · 2 Chu toàn điểm số môn học · 3 Tuyệt đối cấm dẫn nữ giới vào Nhà Chung
--     Lỗi thường (4–9): 4 Tham dự giờ Kinh phụng vụ tối và các việc đạo đức · 5 Giờ giới nghiêm 4h30–22h · 6 Trực nhà theo phân công của Trưởng nhà
--                        · 7 Sử dụng tài sản Nhà Chung có trách nhiệm · 8 Bảo vệ tài sản Nhà Chung, anh em, cá nhân cẩn trọng · 9 Nhận lỗi, sửa lỗi, tiến bộ
--     10 (lời dặn): Lưu xá là Nhà Chung; xin Đức Maria Vô Nhiễm Nguyên Tội làm Thánh quan thầy — hãy nên như Mẹ và từng bước theo Mẹ.
--     Biện pháp lỗi thường: chuyển phòng · cấm đọc Kinh chung & nói chuyện với anh em (3–14 ngày) · dự Thánh lễ ngày thường (1–7 ngày)
--                            · viếng mộ/nghĩa trang & cầu nguyện cho các linh hồn · lần chuỗi; tái phạm nhiều lần ⇒ chuyển Lỗi đỏ.
--
-- Đối chiếu với luật nhà đang dùng (production, 4 mục):
--   TRÙNG/SỬA  1.1 "Giờ Kinh Tối chung" + điều 4 ⇒ gộp   · 1.2 "Đóng cổng 22:00" + điều 5 ⇒ thêm giờ mở cổng 4:30
--              2.2 "2 bạn trực sân theo lịch" + điều 6 ⇒ gộp · 2.3 "Tắt đèn, quạt" là ví dụ của điều 7 ⇒ gộp
--   GIỮ        1.3 tắt đèn 23:00 · 2.1 giữ gìn phòng · khách (báo trước, gửi CCCD, ra về trước 21:00) · về quê · tài chính chung (không có trong tờ luật, không mâu thuẫn)
--   THÊM       điều 1, 2, 3 (Lỗi đỏ), 8, 9, 10 + mục "Xử lý vi phạm"
-- Luật phạt: bản nhập tự động cũ (mã Lnn) là bản sao của một phiên bản luật nhà trước (còn "Thức dậy 05:30", "Kinh sáng"…) ⇒ thay bằng danh mục khớp luật nhà mới:
--   L01–L09 = Lỗi 1–9 của tờ luật (L01–L03 đỏ: phạt "Mời ra khỏi Nhà Chung"; L04–L09 thường: tùy tình trạng và số lần, biện pháp ở phần mô tả),
--   L10–L17 = các điều còn lại của luật nhà (chỉ ghi nhận, Trưởng nhà tự chọn hình phạt khi ghi).
-- Điều cũ ĐÃ có bản ghi vi phạm thì KHÔNG xóa: ẩn + đổi mã (XLnn) để giữ lịch sử. Không động tới điều luật phạt do người dùng tự thêm (mã khác Lnn).
-- Tên điều luật phạt LẤY NGUYÊN VĂN từ điều khoản trong luật nhà ⇒ bấm "Nhập từ Luật nhà" lần sau sẽ không tạo bản trùng.
-- Cuối file có kiểm tra tự động; sai khác ⇒ hủy cả giao dịch.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Luật nhà: cập nhật mục đã có (khớp theo tên mục cũ/mới), thêm mục còn thiếu, đặt lại thứ tự
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _hr (match_titles text[], title text, icon text, description text, items jsonb, ord int) ON COMMIT DROP;

INSERT INTO _hr (match_titles, title, icon, description, items, ord) VALUES
  (ARRAY['Giờ giấc sinh hoạt', 'Giờ giấc sinh hoạt chung'], 'Giờ giấc sinh hoạt', '⏰', 'Lịch sinh hoạt chung hằng ngày của cả nhà.',
   $j$[{"time":"21:00","text":"Tham dự giờ Kinh phụng vụ tối chung tại nhà dưới và các việc đạo đức."},
       {"time":"04:30 – 22:00","text":"Giờ giới nghiêm: mở cổng lúc 4:30, đóng cổng lúc 22:00; về trễ phải báo trước cho Trưởng nhà."},
       {"time":"23:00","text":"Tắt đèn, giữ yên lặng để mọi người nghỉ ngơi"}]$j$::jsonb, 0),

  (ARRAY['Vệ sinh & trật tự chung', 'Vệ sinh, trật tự & tài sản chung'], 'Vệ sinh, trật tự & tài sản chung', '🧹', NULL,
   $j$[{"time":null,"text":"Giữ gìn phòng ở, trong nhà, nhà vệ sinh sạch sẽ; đổ rác đúng giờ, đúng nơi."},
       {"time":null,"text":"Trực nhà theo phân công của Trưởng nhà: mỗi tuần 2 bạn trực vệ sinh sân nhà theo lịch."},
       {"time":null,"text":"Sử dụng tài sản Nhà Chung có trách nhiệm: tắt đèn, quạt khi ra khỏi phòng."},
       {"time":null,"text":"Bảo vệ cẩn trọng tài sản của Nhà Chung, của anh em và của chính mình."}]$j$::jsonb, 1),

  (ARRAY['Khách & ra vào', 'Khách và ra vào nhà'], 'Khách & ra vào', '🚪', NULL,
   $j$[{"time":null,"text":"Tuyệt đối cấm dẫn nữ giới vào Nhà Chung (Lỗi đỏ)."},
       {"time":null,"text":"Báo trước cho Trưởng nhà khi có khách ở lại qua đêm."},
       {"time":null,"text":"Gửi lại CCCD của khách cho Trưởng nhà khi có khách ở lại qua đêm."},
       {"time":"21:00","text":"Khách đến chơi cần ra về trước giờ này"},
       {"time":null,"text":"Về quê / vắng mặt dài ngày phải báo trước."}]$j$::jsonb, 2),

  (ARRAY['Tài chính chung'], 'Tài chính chung', '💳', NULL,
   $j$[{"time":null,"text":"Đóng quỹ và tiền điện nước đúng hạn theo thông báo của Thủ quỹ."},
       {"time":null,"text":"Chi tiêu chung phải có đề nghị và được duyệt theo quy trình."}]$j$::jsonb, 3),

  (ARRAY['Đức tin & học tập'], 'Đức tin & học tập', '🙏', NULL,
   $j$[{"time":null,"text":"Tham dự Thánh lễ trọng trọn vẹn (Lỗi đỏ)."},
       {"time":null,"text":"Chu toàn điểm số môn học (Lỗi đỏ)."}]$j$::jsonb, 4),

  (ARRAY['Tinh thần Nhà Chung'], 'Tinh thần Nhà Chung', '🌹', NULL,
   $j$[{"time":null,"text":"Nhận lỗi, sửa lỗi, tiến bộ."},
       {"time":null,"text":"Lưu xá là Nhà Chung; anh em đã xin Đức Maria Vô Nhiễm Nguyên Tội làm Thánh quan thầy. Hãy nên như Mẹ và từng bước theo Mẹ."}]$j$::jsonb, 5),

  (ARRAY['Xử lý vi phạm'], 'Xử lý vi phạm', '⚖️', 'Ngày đó, Thiên Chúa sẽ thưởng phạt mọi người tùy theo việc họ làm (Rm 2, 6).',
   $j$[{"time":null,"text":"Lỗi đỏ (Tham dự Thánh lễ trọng, điểm số môn học, dẫn nữ giới vào Nhà Chung): mời ra khỏi Nhà Chung."},
       {"time":null,"text":"Các lỗi thường (Kinh phụng vụ tối và việc đạo đức, giờ giới nghiêm, trực nhà, sử dụng và bảo vệ tài sản, nhận lỗi – sửa lỗi): tùy tình trạng và số lần vi phạm, áp dụng một trong các biện pháp sau."},
       {"time":null,"text":"Chuyển phòng theo kết quả của buổi họp nhà quyết định."},
       {"time":"3–14 ngày","text":"Cấm đọc Kinh chung và nói chuyện với anh em khác trong nhà."},
       {"time":"1–7 ngày","text":"Tham dự Thánh lễ ngày thường."},
       {"time":null,"text":"Đi viếng mộ, nghĩa trang của các Cha, các thai nhi và cầu nguyện cho các linh hồn."},
       {"time":null,"text":"Lần chuỗi cầu nguyện cho Nhà Chung và cho chính mình."},
       {"time":null,"text":"Nếu lỗi lại nhiều lần, mang chiều kích xấu không thể cứu vãn thì chuyển sang hình thức Lỗi đỏ để xử lý."}]$j$::jsonb, 6);

UPDATE public.house_rule_sections s
   SET title = v.title, icon = v.icon, description = v.description, items = v.items, sort_order = v.ord, is_active = true
  FROM _hr v
 WHERE s.title = ANY (v.match_titles);

INSERT INTO public.house_rule_sections (title, icon, description, items, sort_order)
SELECT v.title, v.icon, v.description, v.items, v.ord
  FROM _hr v
 WHERE NOT EXISTS (SELECT 1 FROM public.house_rule_sections s WHERE s.title = ANY (v.match_titles));

-- ---------------------------------------------------------------------
-- 2. Luật phạt: mỗi điều = một điều khoản của luật nhà (tên lấy nguyên văn), kèm mức phạt theo tờ luật
--    tier: red = Lỗi đỏ · normal = Lỗi thường (4–9) · plain = điều còn lại (chỉ ghi nhận)
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _dr (code text, section_title text, idx int, tier text, ord int, title text, description text, kind text, note text) ON COMMIT DROP;

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
       description =
         COALESCE(
           CASE d.tier
             WHEN 'red' THEN 'Lỗi đỏ — vi phạm bị mời ra khỏi Nhà Chung.'
             WHEN 'normal' THEN 'Lỗi thường — tùy tình trạng và số lần: chuyển phòng · cấm đọc Kinh chung, nói chuyện với anh em (3–14 ngày) · dự Thánh lễ ngày thường (1–7 ngày) · viếng mộ, cầu nguyện cho các linh hồn · lần chuỗi. Lỗi lại nhiều lần ⇒ Lỗi đỏ.'
           END || ' ',
           '')
         || 'Mục “' || d.section_title || '” trong Luật nhà' || COALESCE(' (' || NULLIF(it.item ->> 'time', '') || ')', ''),
       kind = CASE d.tier WHEN 'plain' THEN 'none' ELSE 'other' END,
       note = CASE d.tier WHEN 'red' THEN 'Mời ra khỏi Nhà Chung' WHEN 'normal' THEN 'Tùy tình trạng, số lần — xem các biện pháp ở mô tả' ELSE NULL END
  FROM (
    SELECT s.title AS stitle, e.item, e.ord
      FROM public.house_rule_sections s
      CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY AS e(item, ord)
  ) it
 WHERE it.stitle = d.section_title AND it.ord = d.idx;

-- 2a. Điều cũ (mã Lnn, không còn khớp đúng mã + tên mới) mà ĐÃ có bản ghi vi phạm ⇒ ẩn và đổi mã, giữ lịch sử
UPDATE public.discipline_rules r
   SET is_active = false, code = 'X' || r.code
 WHERE r.code ~ '^L[0-9]+$'
   AND NOT EXISTS (SELECT 1 FROM _dr d WHERE d.code = r.code AND d.title = r.title)
   AND EXISTS (SELECT 1 FROM public.discipline_records x WHERE x.rule_id = r.id);

-- 2b. Điều cũ chưa ai dùng ⇒ xóa (bản sao lỗi thời của luật nhà)
DELETE FROM public.discipline_rules r
 WHERE r.code ~ '^L[0-9]+$'
   AND NOT EXISTS (SELECT 1 FROM _dr d WHERE d.code = r.code AND d.title = r.title)
   AND NOT EXISTS (SELECT 1 FROM public.discipline_records x WHERE x.rule_id = r.id);

-- 2c. Thêm / cập nhật danh mục mới
INSERT INTO public.discipline_rules (code, title, description, default_penalty_kind, default_penalty_qty, default_penalty_note, sort_order, is_active)
SELECT d.code, d.title, d.description, d.kind, NULL, d.note, d.ord, true FROM _dr d
ON CONFLICT (code) DO UPDATE
   SET title = EXCLUDED.title, description = EXCLUDED.description, default_penalty_kind = EXCLUDED.default_penalty_kind,
       default_penalty_qty = EXCLUDED.default_penalty_qty, default_penalty_note = EXCLUDED.default_penalty_note,
       sort_order = EXCLUDED.sort_order, is_active = true;

-- ---------------------------------------------------------------------
-- 3. Kiểm tra: đủ 7 mục luật nhà; đủ 17 điều luật phạt và mỗi tên khớp nguyên văn một điều khoản trong luật nhà
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_sec int;
  n_rules int;
  n_match int;
BEGIN
  SELECT count(DISTINCT title) INTO n_sec FROM public.house_rule_sections
   WHERE is_active AND title IN ('Giờ giấc sinh hoạt', 'Vệ sinh, trật tự & tài sản chung', 'Khách & ra vào', 'Tài chính chung', 'Đức tin & học tập', 'Tinh thần Nhà Chung', 'Xử lý vi phạm');
  IF n_sec <> 7 THEN RAISE EXCEPTION 'Luật nhà: cần đủ 7 mục, hiện có %', n_sec; END IF;

  SELECT count(*) INTO n_rules FROM public.discipline_rules WHERE is_active AND code ~ '^L(0[1-9]|1[0-7])$';
  SELECT count(*) INTO n_match FROM public.discipline_rules r
   WHERE r.is_active AND r.code ~ '^L(0[1-9]|1[0-7])$'
     AND EXISTS (SELECT 1 FROM public.house_rule_sections s, jsonb_array_elements(s.items) e
                  WHERE left(regexp_replace(btrim(e ->> 'text'), '\s+', ' ', 'g'), 200) = r.title);
  IF n_rules <> 17 OR n_match <> 17 THEN RAISE EXCEPTION 'Luật phạt: cần 17 điều khớp luật nhà, hiện có % (khớp %)', n_rules, n_match; END IF;
END $$;

COMMIT;
