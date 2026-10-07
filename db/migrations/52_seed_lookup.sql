-- =====================================================================
-- KHỐI 4.7.3 — SEED DỮ LIỆU TRA CỨU & KHỞI TẠO (chạy bằng migrator; idempotent nhờ ON CONFLICT)
-- Nguồn: INITIAL_CATEGORIES/INITIAL_ROOMS/INITIAL_FLOORS (mockData.ts) + mặc định đề xuất [GIẢ ĐỊNH] ghi chú từng khối.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.7.3.1  Danh mục (categories) — gộp CategoryItem của FE + giá trị enum cứng còn thiếu
-- ---------------------------------------------------------------------
INSERT INTO categories (kind, code, name, description, color, icon_name, sort_order, is_system) VALUES
  ('expense', 'FOOD',     'Thực phẩm & Đi chợ',          'Chi phí mua thực phẩm bữa trưa/tối, gia vị, dầu ăn, gas nấu', '#f59e0b', 'UtensilsCrossed', 10, true),
  ('expense', 'UTILITY',  'Điện, Nước & Internet',        'Hóa đơn tiền điện sinh hoạt, nước máy, cước cáp quang hằng tháng', '#3b82f6', 'Zap', 20, true),
  ('expense', 'CLEAN',    'Vệ sinh & Hóa phẩm',           'Nước rửa chén, xà phòng, bao rác, chổi lau sàn các tầng', '#10b981', 'Sparkles', 30, true),
  ('expense', 'REPAIR',   'Sửa chữa & Cơ sở vật chất',    'Bóng đèn, khóa cửa, sửa vòi sen, thay linh kiện quạt', '#ef4444', 'Wrench', 40, true),
  ('expense', 'LITURGY',  'Phụng vụ & Thánh lễ',          'Nến thơm, hoa tươi bàn thờ, rượu lễ, bánh lễ', '#8b5cf6', 'Church', 50, true),
  ('expense', 'GUEST',    'Tiếp đón khách & Giao lưu',    'Hoa quả, trà nước tiếp đón quý cha, ân nhân và phụ huynh', '#ec4899', 'HeartHandshake', 60, true),
  ('expense', 'OTHER',    'Khác',                         'Khoản chi không thuộc các danh mục trên (FE Expense.category = "Khác")', '#6b7280', 'Package', 90, true),
  ('event', 'EVT_MASS',   'Phụng vụ & Thánh lễ',          'Thánh lễ bổn mạng, giờ kinh tối, tĩnh tâm tháng', '#8b5cf6', 'Church', 10, true),
  ('event', 'EVT_MEET',   'Họp nhà huynh đệ',             'Họp tổng kết tháng, họp ban đại diện, đối soát quỹ', '#3b82f6', 'Users', 20, true),
  ('event', 'EVT_PATRON', 'Đại lễ Bổn mạng',              'Lễ kính Thánh Phanxicô Assisi 04/10', '#f59e0b', 'Crown', 30, true),
  ('event', 'EVT_TRIP',   'Dã ngoại & Hành hương',        'Các chuyến đi biển, hành hương thánh địa', '#10b981', 'Compass', 40, true),
  ('event', 'EVT_CLEAN',  'Tổng vệ sinh định kỳ',         'Dọn dẹp khuôn viên, phát quang sân thượng thứ Bảy', '#06b6d4', 'Brush', 50, true),
  ('event', 'EVT_SOCIAL', 'Sinh hoạt chung',              'Sinh hoạt cộng đoàn, giao lưu, thể thao (FE: "Sinh hoạt")', '#64748b', 'Handshake', 60, true),
  ('announcement', 'ANN_URGENT',  'Quan trọng & Khẩn',     'Quy định nội quy, lịch đóng quỹ, thông báo từ Cha linh hướng', '#ef4444', 'AlertTriangle', 10, true),
  ('announcement', 'ANN_EVENT',   'Sự kiện & Hoạt động',   'Kế hoạch chương trình, đăng ký tham gia hoạt động', '#8b5cf6', 'Calendar', 20, true),
  ('announcement', 'ANN_KITCHEN', 'Bếp & Đăng ký cơm',     'Thực đơn tuần mới, giờ chốt suất ăn', '#f59e0b', 'UtensilsCrossed', 30, true),
  ('announcement', 'ANN_COMMON',  'Sinh hoạt chung',       'Nhắc nhở nếp sống, giữ gìn trật tự và vệ sinh', '#3b82f6', 'Megaphone', 40, true),
  ('forum', 'FORUM_STUDY',    'Học tập & Hướng nghiệp',    'Trao đổi tài liệu, ôn thi, kinh nghiệm phỏng vấn việc làm', '#3b82f6', 'BookOpen', 10, true),
  ('forum', 'FORUM_SPORT',    'Đi chơi & Thể thao',        'Đá bóng chiều thứ Bảy, cầu lông, leo núi', '#10b981', 'Trophy', 20, true),
  ('forum', 'FORUM_FOOD',     'Bếp & Thực đơn',            'Đề xuất món ăn, phản hồi chất lượng bữa cơm', '#f59e0b', 'UtensilsCrossed', 30, true),
  ('forum', 'FORUM_FEEDBACK', 'Góp ý xây dựng',            'Đóng góp ý kiến cải tiến cơ sở vật chất và nếp sống', '#8b5cf6', 'MessageSquare', 40, true),
  ('forum', 'FORUM_LEISURE',  'Giải trí',                  'Chuyện phiếm, phim ảnh, âm nhạc (FE ForumThread.category "Giải trí")', '#ec4899', 'Smile', 50, true),
  ('maintenance', 'MAINT_ELEC',  'Hệ thống điện & Chiếu sáng',  'Bóng đèn, quạt trần, ổ cắm, máy lạnh', '#f59e0b', 'Zap', 10, true),
  ('maintenance', 'MAINT_WATER', 'Nước & Thiết bị vệ sinh',    'Vòi sen, lavabo, bồn cầu, máy bơm nước', '#3b82f6', 'Droplet', 20, true),
  ('maintenance', 'MAINT_DOOR',  'Đồ gỗ, Cửa & Khóa',          'Bản lề, then cửa, bàn học, giường tủ', '#8b5cf6', 'Key', 30, true),
  ('maintenance', 'MAINT_APP',   'Thiết bị bếp & Máy giặt',    'Bếp gas, máy giặt, máy lọc nước, tủ lạnh', '#10b981', 'Cpu', 40, true),
  ('album', 'ALB_PILGRIM',  'Hành hương',              'Chuyến hành hương, thăm linh địa', '#8b5cf6', 'MapPin', 10, true),
  ('album', 'ALB_TRIP',     'Dã ngoại & Du lịch',      'Dã ngoại, du lịch huynh đệ', '#10b981', 'Compass', 20, true),
  ('album', 'ALB_PATRON',   'Lễ Bổn Mạng',             'Đại lễ mừng bổn mạng Thánh Phanxicô Assisi', '#f59e0b', 'Crown', 30, true),
  ('album', 'ALB_MEAL',     'Bữa cơm huynh đệ',        'Bữa cơm chung, liên hoan', '#ec4899', 'UtensilsCrossed', 40, true),
  ('album', 'ALB_DAILY',    'Sinh hoạt thường nhật',   'Sinh hoạt hằng ngày, học tập, thể thao', '#3b82f6', 'Sun', 50, true),
  ('album', 'ALB_FAREWELL', 'Chia tay & Tốt nghiệp',   'Lễ tri ân, chia tay anh em tốt nghiệp', '#64748b', 'GraduationCap', 60, true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.2  Năm học, học kỳ, nhiệm kỳ (năm học 2025-2026 đã đóng, 2026-2027 hiện hành)
-- ---------------------------------------------------------------------
INSERT INTO academic_years (code, name, starts_on, ends_on, is_current) VALUES
  ('2025-2026', 'Năm học 2025 – 2026', DATE '2025-08-15', DATE '2026-08-14', false),
  ('2026-2027', 'Năm học 2026 – 2027', DATE '2026-08-15', DATE '2027-08-14', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO semesters (academic_year_id, code, name, ordinal, starts_on, ends_on)
SELECT ay.id, x.code, x.name, x.ordinal, x.starts_on, x.ends_on
  FROM (VALUES
    ('2025-2026', 'HK1', 'Học kỳ 1', 1, DATE '2025-09-01', DATE '2026-01-15'),
    ('2025-2026', 'HK2', 'Học kỳ 2', 2, DATE '2026-02-01', DATE '2026-06-15'),
    ('2025-2026', 'HE',  'Học kỳ hè', 3, DATE '2026-06-16', DATE '2026-08-14'),
    ('2026-2027', 'HK1', 'Học kỳ 1', 1, DATE '2026-09-01', DATE '2027-01-15'),
    ('2026-2027', 'HK2', 'Học kỳ 2', 2, DATE '2027-02-01', DATE '2027-06-15'),
    ('2026-2027', 'HE',  'Học kỳ hè', 3, DATE '2027-06-16', DATE '2027-08-14')
  ) AS x(year_code, code, name, ordinal, starts_on, ends_on)
  JOIN academic_years ay ON ay.code = x.year_code
ON CONFLICT (academic_year_id, code) DO NOTHING;

INSERT INTO board_terms (academic_year_id, name, starts_on, ends_on, status, closed_at)
SELECT ay.id, x.name, x.starts_on, x.ends_on, x.status::term_status_t, x.closed_at
  FROM (VALUES
    ('2025-2026', 'Nhiệm kỳ 2025 – 2026', DATE '2025-08-15', DATE '2026-08-14', 'closed', TIMESTAMPTZ '2026-08-14 20:00:00+07'),
    ('2026-2027', 'Nhiệm kỳ 2026 – 2027', DATE '2026-08-15', DATE '2027-08-14', 'active', NULL::timestamptz)
  ) AS x(year_code, name, starts_on, ends_on, status, closed_at)
  JOIN academic_years ay ON ay.code = x.year_code
 WHERE NOT EXISTS (SELECT 1 FROM board_terms b WHERE b.name = x.name);

-- ---------------------------------------------------------------------
-- 4.7.3.3  Nhà: tầng, phòng (INITIAL_FLOORS / INITIAL_ROOMS ở commit 740ac5d), tiện ích
-- ---------------------------------------------------------------------
INSERT INTO floors (code, name, level, description, sort_order) VALUES
  ('T1', 'Tầng 1 (Tầng trệt)', 1, 'Phòng 1, Phòng 2, Phòng 3, Sảnh chung, Nhà để xe & Khu vệ sinh ngoài', 1),
  ('T2', 'Tầng 2 (Lầu 1)',     2, 'Phòng 4, Phòng 5, Sảnh nguyện đọc kinh chung & 2 Nhà vệ sinh riêng', 2)
ON CONFLICT DO NOTHING;

-- Nguồn: INITIAL_ROOMS của FE (mockData.ts:774-962 ở commit 740ac5d): 5 phòng ngủ (2+3+3+3+3 = 14 chỗ), 2 sảnh, nhà để xe, khu vệ sinh ngoài và 3 nhà vệ sinh riêng.
-- Tọa độ x, y, w, h là tọa độ trong khung 680×420 của FloorplanCanvas. FE xếp nhà vệ sinh riêng vào loại storage; giữ nguyên để ánh xạ thẳng.
INSERT INTO rooms (floor_id, code, name, room_type, capacity, status, area_m2, description, layout_x, layout_y, layout_w, layout_h)
SELECT f.id, x.code, x.name, x.room_type::room_type_t, x.capacity, 'active', x.area, x.descr, x.lx, x.ly, x.lw, x.lh
  FROM (VALUES
    ('T1', 'P.1',        'Phòng 1',                                 'bedroom', 2, 20, 'Phòng tầng 1 phía sau nhà để xe, yên tĩnh và thoáng mát.',                                              167,  67,  76, 131),
    ('T1', 'P.2',        'Phòng 2',                                 'bedroom', 3, 28, 'Phòng tầng 1 diện tích rộng rãi, có phòng tắm và nhà vệ sinh khép kín riêng biệt.',                      243,  67, 133, 131),
    ('T1', 'P.3',        'Phòng 3',                                 'bedroom', 3, 25, 'Phòng tầng 1 góc trước bên phải, 2 cửa sổ mở ra sân trước và sân phải đón nắng gió mát.',               376, 108,  96, 165),
    ('T1', 'P.SANH1',    'Sảnh Chung (Đọc kinh tối ngày thường)',   'common',  0, 32, 'Không gian sinh hoạt chính tầng trệt, nơi cộng đoàn anh em quy tụ đọc kinh tối ngày thường.',            167, 198, 209,  51),
    ('T1', 'P.XE',       'Nhà Để Xe',                               'storage', 0, 22, 'Khu vực để xe máy của toàn thể anh em sinh viên lưu xá.',                                                 107,  99,  60, 150),
    ('T1', 'P.WC_P2',    'NVS + Tắm Phòng 2',                       'storage', 0,  8, 'Nhà vệ sinh và phòng tắm khép kín riêng biệt cho Phòng 2.',                                               376,  67,  96,  41),
    ('T1', 'P.WC_NGOAI', 'Khu Vệ Sinh Ngoài T1',                    'laundry', 0, 24, 'Cụm vệ sinh ngoài gồm: 1 Nhà vệ sinh, 1 Nhà tắm, 1 Phòng giặt đồ và Bồn tiểu nam.',                      500,  15, 159,  77),
    ('T2', 'P.4',        'Phòng 4',                                 'bedroom', 3, 30, 'Phòng ngủ lớn tầng 2 chiếm trọn mặt sau, view vườn cây thoáng mát và NVS khép kín.',                    167,  67, 209,  78),
    ('T2', 'P.5',        'Phòng 5',                                 'bedroom', 3, 24, 'Phòng tầng 2 bên phải, 2 mặt thoáng nhìn ra sân phải và sân trước.',                                     376, 137,  96, 141),
    ('T2', 'P.SANH2',    'Sảnh Nguyện (Sảnh đọc kinh chung)',       'chapel',  0, 35, 'Sảnh nguyện đọc kinh chung tầng 2, không gian thánh thiêng nuôi dưỡng đời sống thiêng liêng.',            167, 145, 209, 104),
    ('T2', 'P.WC_P4',    'NVS + Tắm Phòng 4',                       'storage', 0,  8, 'Nhà vệ sinh và phòng tắm khép kín của Phòng 4.',                                                          376,  67,  96,  37),
    ('T2', 'P.WC_P5',    'NVS Phòng 5',                             'storage', 0,  7, 'Nhà vệ sinh riêng biệt dành riêng cho Phòng 5.',                                                         376, 104,  96,  33)
  ) AS x(floor_code, code, name, room_type, capacity, area, descr, lx, ly, lw, lh)
  JOIN floors f ON f.code = x.floor_code
ON CONFLICT DO NOTHING;
-- Mã phòng (P.1…P.5, P.SANH1…) KHÔNG đổi so với FE => dữ liệu cũ (Member.room) ánh xạ thẳng vào rooms.code.

INSERT INTO amenities (code, name, icon_name) VALUES
  ('ac', 'Điều hòa', 'Snowflake'), ('ensuite_wc', 'WC khép kín', 'Bath'), ('ceiling_fan', 'Quạt trần', 'Fan'),
  ('desk', 'Bàn học cá nhân', 'Table'), ('wardrobe', 'Tủ quần áo', 'Shirt'), ('balcony', 'Ban công', 'Sun'),
  ('water_heater', 'Bình nóng lạnh', 'Flame'), ('window_sun', 'Cửa sổ đón nắng', 'Sunrise'), ('bookshelf', 'Kệ / tủ sách', 'Library'),
  ('bunk_bed', 'Giường tầng', 'BedDouble'), ('gas_stove', 'Bếp gas công nghiệp', 'Flame'), ('fridge', 'Tủ lạnh', 'Refrigerator'),
  ('dining_table', 'Bàn ăn', 'Utensils'), ('ro_filter', 'Máy lọc nước RO', 'Droplet'), ('rice_cooker', 'Nồi cơm điện', 'CookingPot'),
  ('whiteboard', 'Bảng trắng', 'Presentation'), ('meeting_table', 'Bàn họp', 'Users'), ('projector', 'Máy chiếu', 'Projector'),
  ('wifi', 'Wifi tốc độ cao', 'Wifi'), ('altar', 'Bàn thờ', 'Church'), ('organ', 'Đàn Organ', 'Piano'), ('sound_system', 'Hệ thống âm thanh', 'Speaker'),
  ('kneeling_mat', 'Thảm quỳ nguyện', 'Layers'), ('washer', 'Máy giặt', 'WashingMachine'), ('drying_rack', 'Giàn phơi', 'Shirt'),
  ('pressure_washer', 'Vòi rửa áp lực', 'Droplets'), ('steel_shelf', 'Kệ sắt chịu lực', 'Archive'), ('toolbox', 'Hộp đồ nghề kỹ thuật', 'Wrench'),
  ('ladder', 'Thang nhôm', 'Ladder'), ('handrail', 'Tay vịn gỗ', 'GripVertical'), ('motion_light', 'Đèn cảm ứng', 'Lightbulb'),
  ('fire_extinguisher', 'Bình cứu hỏa', 'FireExtinguisher'), ('roof_hatch', 'Cửa sập sân thượng', 'DoorOpen'), ('roof_cover', 'Mái che lấy sáng', 'Umbrella'),
  ('window', 'Cửa sổ', 'PanelTop'), ('main_door', 'Cửa chính', 'DoorClosed'), ('stairway', 'Cầu thang thông tầng', 'Footprints'),
  ('notice_board', 'Bảng thông báo', 'Pin'), ('motorbike_parking', 'Chỗ để xe máy', 'Bike'), ('toilet', 'Bồn cầu / nhà vệ sinh', 'Toilet'),
  ('shower', 'Vòi sen / nhà tắm', 'ShowerHead'), ('lavabo', 'Lavabo', 'Droplets'), ('urinal', 'Bồn tiểu nam', 'Droplet')
ON CONFLICT (code) DO NOTHING;

INSERT INTO room_amenities (room_id, amenity_id, quantity, note)
SELECT r.id, a.id, x.qty, x.note
  FROM (VALUES
    ('P.1',        'ac', 1, NULL),               ('P.1', 'ceiling_fan', 1, NULL),         ('P.1', 'desk', 1, 'bàn học đôi'),       ('P.1', 'wardrobe', 1, 'gỗ'),            ('P.1', 'window', 1, 'thông thoáng'),
    ('P.2',        'ac', 1, NULL),               ('P.2', 'ensuite_wc', 1, 'NVS và tắm'),  ('P.2', 'ceiling_fan', 1, NULL),         ('P.2', 'desk', 1, 'bàn học cá nhân'),   ('P.2', 'wardrobe', 1, NULL),
    ('P.3',        'ac', 1, NULL),               ('P.3', 'ceiling_fan', 1, NULL),         ('P.3', 'desk', 1, NULL),                ('P.3', 'window', 2, 'đón gió sân trước và sân phải'),
    ('P.SANH1',    'altar', 1, 'chung, tôn kính'), ('P.SANH1', 'main_door', 1, '2 cánh'), ('P.SANH1', 'stairway', 1, NULL),         ('P.SANH1', 'notice_board', 1, NULL),
    ('P.XE',       'motorbike_parking', 20, 'sức chứa 20 xe máy'), ('P.XE', 'main_door', 1, 'mở ra sân trước'), ('P.XE', 'fire_extinguisher', 1, NULL),
    ('P.WC_P2',    'toilet', 1, NULL),           ('P.WC_P2', 'shower', 1, 'vòi sen tắm đứng'), ('P.WC_P2', 'water_heater', 1, NULL), ('P.WC_P2', 'lavabo', 1, 'có gương'),
    ('P.WC_NGOAI', 'toilet', 1, 'nhà vệ sinh riêng'), ('P.WC_NGOAI', 'shower', 1, 'nhà tắm riêng'), ('P.WC_NGOAI', 'washer', 1, 'phòng giặt đồ'), ('P.WC_NGOAI', 'urinal', 1, NULL),
    ('P.4',        'ac', 1, NULL),               ('P.4', 'ensuite_wc', 1, NULL),          ('P.4', 'window', 2, 'sân sau'),         ('P.4', 'desk', 1, 'bàn học dài'),       ('P.4', 'wardrobe', 1, 'gỗ'),
    ('P.5',        'ac', 1, NULL),               ('P.5', 'ensuite_wc', 1, 'riêng, liền kề'), ('P.5', 'ceiling_fan', 1, NULL),      ('P.5', 'window', 1, 'góc, 2 mặt thoáng'),
    ('P.SANH2',    'altar', 1, 'gỗ'),            ('P.SANH2', 'stairway', 1, NULL),        ('P.SANH2', 'kneeling_mat', 1, NULL),    ('P.SANH2', 'window', 3, 'đón sáng'),
    ('P.WC_P4',    'toilet', 1, NULL),           ('P.WC_P4', 'shower', 1, 'vòi sen tắm'), ('P.WC_P4', 'water_heater', 1, NULL),
    ('P.WC_P5',    'toilet', 1, NULL),           ('P.WC_P5', 'lavabo', 1, NULL)
  ) AS x(room_code, amenity_code, qty, note)
  JOIN rooms r ON r.code = x.room_code AND r.deleted_at IS NULL
  JOIN amenities a ON a.code = x.amenity_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.4  Trực nhật: khu vực, ca, mẫu checklist 4 tiêu chí
-- ---------------------------------------------------------------------
INSERT INTO cleaning_areas (code, name, icon, description, difficulty_points, min_assignees, is_whole_house, sort_order) VALUES
  ('KITCHEN',     'Bếp & bàn ăn',                    '🍳', 'Gian bếp và khu bàn ăn chung',               3, 2, false, 10),
  ('STAIRS',      'Cầu thang & hành lang',           '🪜', 'Cầu thang bộ, tay vịn và hành lang các tầng', 2, 2, false, 20),
  ('BATHROOM',    'Nhà tắm & WC',                    '🚿', 'WC và phòng tắm chung các tầng',             4, 2, false, 30),
  ('CHAPEL',      'Nguyện đường & phòng sinh hoạt',  '⛪', 'Nguyện đường Thánh Phanxicô và phòng sinh hoạt chung', 2, 2, false, 40),
  ('ROOF',        'Sân thượng & khu giặt phơi',      '🌱', 'Sân thượng, sân phơi, khu giặt và gom rác',   2, 2, false, 50),
  ('GATE',        'Cổng chính & sân trước',          '🚪', 'Cổng, sân trước và hành lang lối vào',        1, 1, false, 60),
  ('WHOLE_HOUSE', 'Tổng vệ sinh toàn nhà',           '✨', 'Tổng vệ sinh cuối tuần — toàn thể thành viên', 5, 1, true, 90)
ON CONFLICT (code) DO NOTHING;

INSERT INTO duty_shifts (code, name, start_time, end_time, sort_order) VALUES
  ('MORNING',   'Ca Sáng',  TIME '06:30', TIME '08:00', 1),
  ('AFTERNOON', 'Ca Chiều', TIME '17:30', TIME '19:00', 2),
  ('EVENING',   'Ca Tối',   TIME '21:00', TIME '22:00', 3)
ON CONFLICT (code) DO NOTHING;
COMMENT ON COLUMN duty_shifts.end_time IS 'FE chỉ có giờ bắt đầu trong nhãn ca ("Ca Sáng (06:30)"); giờ kết thúc seed là [GIẢ ĐỊNH] cần người quản lý xác nhận.';

INSERT INTO checklist_templates (area_id, name, version) SELECT NULL, 'Mẫu 4 tiêu chí chuẩn', 1
 WHERE NOT EXISTS (SELECT 1 FROM checklist_templates WHERE area_id IS NULL AND name = 'Mẫu 4 tiêu chí chuẩn');
INSERT INTO checklist_template_items (template_id, code, label, sort_order, is_required)
SELECT t.id, x.code, x.label, x.ord, true
  FROM (VALUES
    ('floor_cleaned',      'Lau / cọ sàn & bồn',                           1),
    ('trash_emptied',      'Gom & đổ rác sạch',                             2),
    ('surfaces_cleaned',   'Cọ rửa, lau kính, tay vịn & bề mặt',            3),
    ('supplies_restocked', 'Bổ sung vật tư (xà phòng, giấy, túi rác)',      4)
  ) AS x(code, label, ord)
  JOIN checklist_templates t ON t.area_id IS NULL AND t.name = 'Mẫu 4 tiêu chí chuẩn'
ON CONFLICT (template_id, code) DO NOTHING;

INSERT INTO merit_rules (code, name_vi, points, is_automatic, description) VALUES
  ('duty_approved',  'Trực nhật đạt',               3,  true,  'Cộng cho mỗi người trực khi ca được nghiệm thu đạt (nhân trọng số khu vực).'),
  ('duty_rework',    'Trực nhật phải làm lại',      -1, true,  'Trừ nhẹ khi ca bị yêu cầu làm lại lần đầu.'),
  ('duty_missed',    'Bỏ ca trực không phép',       -5, true,  'Trừ khi ca quá hạn không check-in và không có đơn xin phép.'),
  ('event_present',  'Có mặt đầy đủ sự kiện',        1, true,  'Cộng khi điểm danh có mặt/đi muộn ở sự kiện bắt buộc.'),
  ('event_absent',   'Vắng sự kiện không phép',     -1, true,  'Trừ khi vắng sự kiện bắt buộc mà không có đơn xin phép được duyệt.'),
  ('tutoring_hour',  'Kèm học một giờ',              2, true,  'Cộng cho người kèm cho mỗi giờ kèm đã được hai bên xác nhận.'),
  ('manual_adjust',  'Điều chỉnh thủ công',          1, false, 'Người quản lý cộng/trừ điểm có lý do (ghi chú bắt buộc).')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.5  Học tập: thang điểm mặc định (khớp ngưỡng chữ của FE + bổ sung D+) [GIẢ ĐỊNH — mỗi trường cấu hình riêng]
-- ---------------------------------------------------------------------
INSERT INTO grade_scales (code, name, max_score, process_weight_pct, final_weight_pct, round_decimals, rounding_mode, gpa4_mode, effective_from)
VALUES ('VN_10_LETTER_DEFAULT', 'Thang 10 → điểm chữ (mặc định, 40/60)', 10, 40, 60, 1, 'half_up', 'from_letter', DATE '2000-01-01')
ON CONFLICT (code) DO NOTHING;

INSERT INTO grade_scale_bands (scale_id, letter, min_score, gpa_points, is_pass, counts_in_gpa, sort_order)
SELECT s.id, x.letter, x.min_score, x.points, x.is_pass, true, x.ord
  FROM (VALUES
    ('A+', 9.0, 4.0, true, 1), ('A', 8.5, 4.0, true, 2), ('B+', 8.0, 3.5, true, 3), ('B', 7.0, 3.0, true, 4),
    ('C+', 6.5, 2.5, true, 5), ('C', 5.5, 2.0, true, 6), ('D+', 5.0, 1.5, true, 7), ('D', 4.0, 1.0, true, 8), ('F', 0.0, 0.0, false, 9)
  ) AS x(letter, min_score, points, is_pass, ord)
  JOIN grade_scales s ON s.code = 'VN_10_LETTER_DEFAULT'
ON CONFLICT (scale_id, letter) DO NOTHING;

INSERT INTO grade_rank_bands (scale_id, label_vi, min_gpa4, sort_order)
SELECT s.id, x.label, x.min_gpa4, x.ord
  FROM (VALUES ('Xuất sắc', 3.60, 1), ('Giỏi', 3.20, 2), ('Khá', 2.50, 3), ('Trung bình', 2.00, 4), ('Cần cố gắng', 0.00, 5)) AS x(label, min_gpa4, ord)
  JOIN grade_scales s ON s.code = 'VN_10_LETTER_DEFAULT'
ON CONFLICT (scale_id, min_gpa4) DO NOTHING;

INSERT INTO universities (code, name, short_name, city) VALUES
  ('HUST', 'Đại học Bách Khoa Hà Nội', 'ĐH Bách Khoa HN', 'Hà Nội'), ('NEU', 'Đại học Kinh tế Quốc dân', 'ĐH Kinh Tế Quốc Dân', 'Hà Nội'),
  ('HUCE', 'Đại học Xây dựng Hà Nội', 'ĐH Xây Dựng HN', 'Hà Nội'), ('FTU', 'Đại học Ngoại thương', 'ĐH Ngoại Thương', 'Hà Nội'),
  ('UTC', 'Đại học Giao thông Vận tải', 'ĐH GTVT', 'Hà Nội'), ('HNUE', 'Đại học Sư phạm Hà Nội', 'ĐH Sư Phạm HN', 'Hà Nội'),
  ('HAU', 'Đại học Kiến trúc Hà Nội', 'ĐH Kiến Trúc HN', 'Hà Nội'), ('HUS', 'ĐH Khoa học Tự nhiên (ĐHQGHN)', 'ĐH KHTN – ĐHQGHN', 'Hà Nội'),
  ('TLU', 'Đại học Thủy lợi', 'ĐH Thủy Lợi', 'Hà Nội'), ('AJC', 'Học viện Báo chí và Tuyên truyền', 'HV Báo Chí & Tuyên Truyền', 'Hà Nội'),
  ('HCMUT', 'ĐH Bách Khoa TP.HCM', 'HCMUT', 'TP. Hồ Chí Minh'), ('HCMUS', 'ĐH Khoa học Tự nhiên TP.HCM', 'HCMUS', 'TP. Hồ Chí Minh'),
  ('HCMUTE', 'ĐH Sư phạm Kỹ thuật TP.HCM', 'HCMUTE', 'TP. Hồ Chí Minh'), ('UMP', 'ĐH Y Dược TP.HCM', 'UMP', 'TP. Hồ Chí Minh'),
  ('UEH', 'ĐH Kinh tế TP.HCM', 'UEH', 'TP. Hồ Chí Minh'), ('UIT', 'ĐH Công nghệ Thông tin – ĐHQG-HCM', 'UIT', 'TP. Hồ Chí Minh'),
  ('UAH', 'ĐH Kiến trúc TP.HCM', 'UAH', 'TP. Hồ Chí Minh')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.6  Công giáo: 27 giáo phận Việt Nam (3 Tổng giáo phận)
-- ---------------------------------------------------------------------
INSERT INTO dioceses (code, name, is_archdiocese, ecclesiastical_province, sort_order) VALUES
  ('HANOI',      'Tổng Giáo phận Hà Nội',           true,  'Hà Nội', 1),  ('BACNINH',    'Giáo phận Bắc Ninh',             false, 'Hà Nội', 2),
  ('BUICHU',     'Giáo phận Bùi Chu',               false, 'Hà Nội', 3),  ('HATINH',     'Giáo phận Hà Tĩnh',              false, 'Hà Nội', 4),
  ('HAIPHONG',   'Giáo phận Hải Phòng',             false, 'Hà Nội', 5),  ('HUNGHOA',    'Giáo phận Hưng Hóa',             false, 'Hà Nội', 6),
  ('LANGSON',    'Giáo phận Lạng Sơn – Cao Bằng',   false, 'Hà Nội', 7),  ('PHATDIEM',   'Giáo phận Phát Diệm',            false, 'Hà Nội', 8),
  ('THAIBINH',   'Giáo phận Thái Bình',             false, 'Hà Nội', 9),  ('THANHHOA',   'Giáo phận Thanh Hóa',            false, 'Hà Nội', 10),
  ('VINH',       'Giáo phận Vinh',                  false, 'Hà Nội', 11),
  ('HUE',        'Tổng Giáo phận Huế',              true,  'Huế', 12),    ('BANMETHUOT','Giáo phận Ban Mê Thuột',         false, 'Huế', 13),
  ('DANANG',     'Giáo phận Đà Nẵng',               false, 'Huế', 14),    ('KONTUM',    'Giáo phận Kon Tum',              false, 'Huế', 15),
  ('NHATRANG',   'Giáo phận Nha Trang',             false, 'Huế', 16),    ('PHANTHIET', 'Giáo phận Phan Thiết',           false, 'Huế', 17),
  ('QUINHON',    'Giáo phận Qui Nhơn',              false, 'Huế', 18),
  ('HCM',        'Tổng Giáo phận TP. Hồ Chí Minh',  true,  'TP. Hồ Chí Minh', 19), ('BARIA',     'Giáo phận Bà Rịa',        false, 'TP. Hồ Chí Minh', 20),
  ('CANTHO',     'Giáo phận Cần Thơ',               false, 'TP. Hồ Chí Minh', 21), ('DALAT',     'Giáo phận Đà Lạt',        false, 'TP. Hồ Chí Minh', 22),
  ('LONGXUYEN',  'Giáo phận Long Xuyên',            false, 'TP. Hồ Chí Minh', 23), ('MYTHO',     'Giáo phận Mỹ Tho',        false, 'TP. Hồ Chí Minh', 24),
  ('PHUCUONG',   'Giáo phận Phú Cường',             false, 'TP. Hồ Chí Minh', 25), ('VINHLONG',  'Giáo phận Vĩnh Long',     false, 'TP. Hồ Chí Minh', 26),
  ('XUANLOC',    'Giáo phận Xuân Lộc',              false, 'TP. Hồ Chí Minh', 27)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.7  Chức danh (trách vụ) — khớp "duty" tự do của FE
-- ---------------------------------------------------------------------
INSERT INTO positions (code, name, kind, description, sort_order) VALUES
  ('house_head',   'Trưởng nhà',                           'leadership', 'Đại diện pháp nhân & đối ngoại Lưu Xá',                    10),
  ('vice_head',    'Phó nhà',                              'leadership', 'Hỗ trợ điều hành: kỷ luật, phòng ở, cơ sở vật chất',       20),
  ('treasurer',    'Thủ quỹ',                              'leadership', 'Thu quỹ, quản lý sổ sách tài chính và phiếu chi',          30),
  ('liturgy_head', 'Trưởng ban Phụng vụ',                  'committee',  'Giúp lễ, hát kinh Nguyện đường',                          40),
  ('kitchen_head', 'Trưởng ban Ẩm thực',                   'committee',  'Quản lý thực đơn và phân công đi chợ',                    50),
  ('logistics',    'Ban Hậu cần',                          'committee',  'Tiếp tế lương thực & dụng cụ sinh hoạt',                  60),
  ('media',        'Ban Truyền thông',                     'committee',  'Chụp ảnh, thiết kế poster, lưu khoảnh khắc',              70),
  ('library',      'Phụ trách Thư viện & phòng tự học',    'task',       NULL,                                                      80),
  ('laundry',      'Phụ trách sân phơi & giặt là',         'task',       NULL,                                                      90),
  ('sound',        'Phụ trách âm thanh Nguyện đường',      'task',       NULL,                                                     100),
  ('sysadmin',     'Admin hệ thống',                       'task',       'Quản trị phần mềm Lưu Xá & mạng LAN',                    110)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.8  Quyền riêng tư: mục đích đồng ý
-- ---------------------------------------------------------------------
INSERT INTO consent_purposes (code, name_vi, description, legal_basis, is_sensitive, is_required, needs_guardian_if_minor, retention_days) VALUES
  ('terms_of_use',              'Điều khoản sử dụng hệ thống',          'Đồng ý điều khoản sử dụng và nội quy phần mềm Lưu Xá.', 'contract', false, true,  true, NULL),
  ('privacy_notice_ack',        'Đã đọc thông báo quyền riêng tư',      'Xác nhận đã đọc cách Lưu Xá thu thập và sử dụng dữ liệu cá nhân.', 'legal_obligation', false, true, true, NULL),
  ('catholic_profile',          'Lưu hồ sơ Công giáo',                  'Lưu Tên Thánh, giáo phận, giáo xứ, linh mục quản xứ, các Bí tích (dữ liệu nhạy cảm về tôn giáo).', 'consent', true, false, true, 365),
  ('catholic_share_leadership', 'Cho người quản lý xem hồ sơ Công giáo','Cho phép Trưởng nhà/Phó nhà/Trưởng ban Phụng vụ xem hồ sơ Công giáo để phục vụ sinh hoạt phụng vụ.', 'consent', true, false, true, 365),
  ('academic_share_leadership', 'Chia sẻ bảng điểm cho người quản lý',  'Cho phép người quản lý xem điểm chi tiết để hỗ trợ học tập, xét học bổng.', 'consent', true, false, true, 365),
  ('academic_share_tutoring',   'Chia sẻ nhu cầu học tập cho người kèm', 'Cho phép người được ghép cặp phụ đạo biết môn cần hỗ trợ.', 'consent', false, false, true, 180),
  ('academic_public_ranking',   'Hiện trong thống kê học tập nội bộ',   'Cho phép điểm tổng hợp của mình tham gia thống kê ẩn danh (nhóm ≥ 3 người).', 'consent', false, false, true, 365),
  ('photo_tagging',             'Gắn thẻ tên vào ảnh/album',            'Cho phép thành viên khác gắn thẻ tên mình vào album khoảnh khắc.', 'consent', false, false, true, 365),
  ('channel_messaging',         'Nhận thông báo qua Zalo/Telegram/SMS', 'Cho phép gửi thông báo qua kênh nhắn tin bên thứ ba đã liên kết.', 'consent', false, false, true, 180),
  ('ai_processing',             'Dùng AI xử lý nội dung do tôi tạo',    'Cho phép dịch vụ AI xử lý nội dung (đã loại bỏ định danh) để gợi ý, tóm tắt, kiểm duyệt.', 'consent', false, false, true, 180),
  ('ai_academic',               'Dùng AI phân tích dữ liệu học tập',    'Cho phép phân tích điểm số để dự báo nguy cơ và gợi ý phụ đạo — chỉ chạy nội bộ/tự host.', 'consent', true, false, true, 180)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.9  Loại thông báo
-- ---------------------------------------------------------------------
INSERT INTO notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('announcement.published',   'announcement', 'Thông báo mới',                       ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('announcement.important',   'announcement', 'Thông báo quan trọng cần xác nhận',   ARRAY['in_app','web_push','email']::notification_channel_t[], 'high', true, true),
  ('finance.expense_pending',  'finance',      'Phiếu chi chờ duyệt',                 ARRAY['in_app','web_push']::notification_channel_t[], 'high', false, false),
  ('finance.expense_decided',  'finance',      'Phiếu chi đã được duyệt/từ chối',     ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('finance.dues_reminder',    'finance',      'Nhắc đóng quỹ sắp đến hạn',           ARRAY['in_app','web_push','email']::notification_channel_t[], 'normal', false, false),
  ('finance.dues_overdue',     'finance',      'Khoản quỹ quá hạn',                   ARRAY['in_app','web_push','email']::notification_channel_t[], 'high', false, false),
  ('finance.period_pending',   'finance',      'Kỳ tài chính chờ xác nhận chốt sổ',   ARRAY['in_app','web_push']::notification_channel_t[], 'high', false, false),
  ('duty.assigned',            'duty',         'Bạn được phân công trực nhật',        ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('duty.reminder',            'duty',         'Nhắc ca trực sắp bắt đầu',            ARRAY['in_app','web_push']::notification_channel_t[], 'high', false, false),
  ('duty.review_needed',       'duty',         'Ca trực chờ nghiệm thu',              ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('duty.reviewed',            'duty',         'Kết quả nghiệm thu ca trực',          ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('duty.swap_request',        'duty',         'Có người nhờ bạn đổi ca trực',        ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('duty.swap_decided',        'duty',         'Kết quả đơn đổi ca',                  ARRAY['in_app']::notification_channel_t[], 'normal', false, false),
  ('duty.missed',              'duty',         'Ca trực bị đánh dấu bỏ ca',           ARRAY['in_app','web_push']::notification_channel_t[], 'high', false, false),
  ('event.created',            'event',        'Sự kiện mới',                         ARRAY['in_app']::notification_channel_t[], 'normal', false, false),
  ('event.reminder',           'event',        'Nhắc sự kiện sắp diễn ra',            ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('event.attendance_open',    'event',        'Mở điểm danh sự kiện',                ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('event.leave_decided',      'event',        'Kết quả đơn xin phép',                ARRAY['in_app']::notification_channel_t[], 'normal', false, false),
  ('academic.record_returned', 'academic',     'Bảng điểm bị trả về cần bổ sung',     ARRAY['in_app']::notification_channel_t[], 'normal', false, false),
  ('academic.tutoring_match',  'academic',     'Đề xuất ghép cặp phụ đạo',            ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('facility.issue_new',       'facility',     'Có báo hỏng mới',                     ARRAY['in_app','web_push']::notification_channel_t[], 'high', false, false),
  ('facility.issue_updated',   'facility',     'Cập nhật tiến độ sự cố của bạn',      ARRAY['in_app']::notification_channel_t[], 'normal', false, false),
  ('facility.sla_breach',      'facility',     'Sự cố quá hạn xử lý (SLA)',           ARRAY['in_app','web_push']::notification_channel_t[], 'urgent', false, false),
  ('laundry.reminder',         'laundry',      'Nhắc lượt giặt sắp đến',              ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('laundry.waitlist_offer',   'laundry',      'Có khung giờ giặt trống cho bạn',     ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('laundry.noshow',           'laundry',      'Lượt giặt đã tự hủy vì không đến',    ARRAY['in_app']::notification_channel_t[], 'low', false, false),
  ('security.new_device',      'security',     'Đăng nhập từ thiết bị mới',           ARRAY['in_app','email']::notification_channel_t[], 'high', false, true),
  ('security.password_changed','security',     'Mật khẩu đã được thay đổi',           ARRAY['in_app','email']::notification_channel_t[], 'high', false, true),
  ('system.consent_update',    'system',       'Điều khoản/đồng ý cần xác nhận lại',  ARRAY['in_app','email']::notification_channel_t[], 'high', true, true),
  ('system.data_request',      'system',       'Cập nhật yêu cầu về dữ liệu cá nhân', ARRAY['in_app','email']::notification_channel_t[], 'normal', false, true),
  ('system.application_decided','system',      'Kết quả đơn xin vào lưu xá',          ARRAY['in_app','email']::notification_channel_t[], 'high', false, true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4.7.3.10  Phụng vụ, quỹ, máy giặt, AI
-- ---------------------------------------------------------------------
INSERT INTO liturgy_role_types (code, name_vi, sort_order) VALUES
  ('presider', 'Chủ sự', 1), ('lector', 'Đọc sách thánh', 2), ('acolyte', 'Giúp lễ', 3), ('cantor', 'Hát / ca đoàn', 4),
  ('organist', 'Đàn organ', 5), ('sound', 'Âm thanh', 6), ('usher', 'Trật tự / đón tiếp', 7)
ON CONFLICT (code) DO NOTHING;

INSERT INTO funds (code, name, fund_type, bank_name, bank_account_last4, account_holder_name, is_personal_account, description) VALUES
  ('CASH',      'Quỹ tiền mặt',                     'cash', NULL,         NULL,   NULL,            false, 'Tiền mặt do Thủ quỹ giữ (nên đựng trong két có hai người giữ chìa)'),
  ('BANK_MAIN', 'Tài khoản ngân hàng Lưu Xá',       'bank', 'Techcombank','9999', 'Trần Văn Đức',  true,  '[HIỆN CÓ ở FE Cài đặt] STK đứng tên cá nhân Trưởng nhà — rủi ro quản trị, khuyến nghị chuyển sang tài khoản đứng tên pháp nhân/người quản lý hoặc đồng sở hữu')
ON CONFLICT (code) DO NOTHING;

INSERT INTO laundry_machines (code, name, brand, capacity_kg, sort_order) VALUES
  ('AQUA9', 'Máy giặt Aqua 9kg',   'Aqua',       9.0,  1),
  ('ELX',   'Máy giặt Electrolux', 'Electrolux', NULL, 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_task_types (code, name_vi, description, technique, model_tier, data_class, required_consent_purpose, human_review_required, external_call_allowed, monthly_budget_vnd) VALUES
  ('finance.receipt_ocr',     'OCR hóa đơn/biên lai',                  'Trích số tiền, ngày, nhà cung cấp từ ảnh hóa đơn để điền sẵn phiếu chi; người tạo xác nhận.', 'ocr', 'ocr', 'mask_required', NULL, true, true, 50000),
  ('finance.anomaly_rules',   'Cảnh báo bất thường thu chi (luật)',    'Phiếu trùng, chi vượt xu hướng, lệch sao kê — thuần luật/thống kê, không cần LLM.', 'rule_based', 'none', 'internal_ok', NULL, true, false, 0),
  ('finance.dues_message',    'Soạn tin nhắc đóng quỹ',                'Soạn lời nhắc lịch sự; chỉ nhận số tiền/hạn nộp, không gửi tên người khi dùng dịch vụ ngoài.', 'llm', 'small', 'mask_required', NULL, true, true, 20000),
  ('duty.photo_check',        'Kiểm tra ảnh minh chứng vệ sinh',       'pHash/EXIF là chính; Vision chỉ gợi ý "ảnh có đúng khu vực" — quyết định cuối thuộc người nghiệm thu.', 'vision', 'vision', 'mask_required', NULL, true, true, 60000),
  ('duty.roster_solver',      'Gợi ý phân công trực nhật',             'Giải bài toán tối ưu ràng buộc cân bằng ca, tránh lịch bận — chạy nội bộ, không LLM.', 'solver', 'none', 'internal_ok', NULL, true, false, 0),
  ('academic.transcript_ocr', 'OCR bảng điểm',                         'Đọc bảng điểm từ ảnh; dữ liệu điểm cá nhân => chỉ chạy tự host.', 'ocr', 'ocr', 'never_external', 'academic_share_leadership', true, false, 0),
  ('academic.risk_forecast',  'Cảnh báo sớm nguy cơ nợ môn',           'Mô hình thống kê trên dữ liệu học tập khi có đồng ý — chạy nội bộ.', 'statistical', 'none', 'never_external', 'ai_academic', true, false, 0),
  ('community.policy_rag',    'Hỏi đáp nội quy/quy trình (RAG)',       'Trả lời dựa trên policy_documents, thông báo, lịch sự kiện; có trích nguồn, phân quyền ở tầng truy xuất.', 'llm', 'small', 'internal_ok', 'ai_processing', false, true, 80000),
  ('community.moderation',    'Hỗ trợ kiểm duyệt nội dung',            'Phát hiện nội dung xúc phạm/lộ thông tin cá nhân; không gửi danh tính tác giả.', 'llm', 'small', 'mask_required', 'ai_processing', true, true, 30000),
  ('facility.issue_triage',   'Phân loại & ưu tiên sự cố',             'Gợi ý mức khẩn, loại sự cố, gom báo hỏng trùng; Phó nhà xác nhận.', 'llm', 'small', 'internal_ok', 'ai_processing', true, true, 20000),
  ('community.minutes',       'Tóm tắt biên bản họp / bản tin',        'Tóm tắt ghi chú họp, soạn bản tin tuần từ ý chính.', 'llm', 'large', 'mask_required', 'ai_processing', true, true, 60000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_budgets (month, limit_vnd, hard_stop) VALUES (date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 200000, true)
ON CONFLICT (month) DO NOTHING;

INSERT INTO policy_documents (slug, title, version, doc_kind, content_md, is_current, requires_ack)
VALUES ('noi-quy-luu-xa', 'Nội quy Lưu Xá Phanxicô (bản mẫu)', 1, 'house_rules',
        E'# Nội quy Lưu Xá Phanxicô (BẢN MẪU)\n\n> người quản lý thay bằng nội quy chính thức trước khi dùng.\n\n1. Giờ giới nghiêm: 22:30 (xin phép trước nếu về muộn).\n2. Trực nhật theo roster tuần; check-in kèm ảnh chụp tại chỗ.\n3. Đóng quỹ sinh hoạt hạn ngày 05 hằng tháng.\n4. Giữ gìn trật tự, yên lặng giờ học và giờ kinh.\n5. Báo hỏng cơ sở vật chất qua hệ thống, không tự ý sửa chữa thiết bị điện.',
        true, true)
ON CONFLICT (slug, version) DO NOTHING;
