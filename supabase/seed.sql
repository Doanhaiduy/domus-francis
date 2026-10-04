-- ============================================================
-- SEED DATA: HỆ THỐNG QUẢN LÝ LƯU XÁ PHANXICÔ (MVP)
-- Lưu ý: Trong Supabase, bảng `profiles` liên kết với `auth.users(id)`.
-- Khi Trưởng nhà tạo tài khoản qua Supabase Auth (hoặc sinh viên đăng ký),
-- trigger hoặc code sẽ tạo bản ghi trong `profiles`.
--
-- File seed này chứa dữ liệu mẫu để import vào Supabase SQL Editor
-- hoặc dùng cho môi trường kiểm thử / local Supabase.
-- ============================================================

-- ============================================================
-- 1. TẠO TÀI KHOẢN MẪU (AUTH.USERS + PROFILES)
-- ============================================================
-- Ghi chú: Nếu chạy trên Supabase Dashboard Cloud, hãy tạo user trước
-- trong mục Authentication > Users với email/password, sau đó
-- cập nhật role trong `profiles`.
-- Đoạn dưới đây dùng DO block an toàn: chỉ insert profile nếu có user
-- hoặc tạo user giả lập (nếu chạy local / docker postgres).

-- ============================================================
-- 2. DỮ LIỆU ĐÓNG QUỸ MẪU (KỲ 2 / 2026: 01/07/2026 - 31/12/2026)
-- Mức quỹ chốt: 600.000 đ / 6 tháng
-- ============================================================

-- Cấu hình mặc định cho các kỳ đóng quỹ:
-- 2026-S1: 01/01/2026 - 30/06/2026 (600.000 đ)
-- 2026-S2: 01/07/2026 - 31/12/2026 (600.000 đ)
-- 2027-S1: 01/01/2027 - 30/06/2027 (600.000 đ)

-- ============================================================
-- 3. GIAO DỊCH THU - CHI MẪU (TRANSACTIONS)
-- Quy tắc: Thủ quỹ ghi (created_by), Trưởng nhà duyệt (approved_by)
-- ============================================================

INSERT INTO public.transactions (type, amount, category, description, txn_date, status, note)
VALUES
  ('expense', 1450000, 'Thực phẩm', 'Tiền chợ tuần 1 mừng lễ Bổn mạng (Thịt, cá, gia vị)', '2026-10-04', 'approved', 'Chuẩn bị tiệc lễ thánh Phanxicô'),
  ('expense', 240000,  'Vệ sinh',   'Nước rửa chén, túi rác & bột giặt tổng vệ sinh',     '2026-10-03', 'approved', 'Tổng vệ sinh trước đại lễ'),
  ('expense', 350000,  'Điện nước', 'Cước Internet cáp quang Viettel T10 (300Mbps)',       '2026-10-02', 'approved', 'Gói mạng hỗ trợ học tập'),
  ('expense', 230000,  'Phụng vụ',  'Nến thơm, hoa tươi bàn thờ & ảnh lưu niệm bổn mạng', '2026-10-01', 'approved', 'Trang trí nguyện đường'),
  ('expense', 420000,  'Thực phẩm', 'Đổi bình gas bếp chính 12kg Petrolimex',              '2026-10-01', 'approved', 'Bình gas nấu ăn chung'),
  ('expense', 180000,  'Sửa chữa',  'Thay 2 bóng đèn tuýp LED Rạng Đông tầng 2',          '2026-10-01', 'approved', 'Khắc phục đèn hành lang'),
  ('expense', 320000,  'Sửa chữa',  'Thay vòi sen inox phòng tắm tầng 1 bị rỉ nước',      '2026-10-03', 'pending',  'Chờ Trưởng nhà phê duyệt hoàn ứng'),
  ('expense', 150000,  'Khác',      'Mua 2 ổ cắm nối dài phòng sinh hoạt chung',           '2026-10-03', 'pending',  'Đề xuất từ anh em học nhóm');

-- ============================================================
-- 4. THÔNG BÁO MẪU (ANNOUNCEMENTS)
-- ============================================================

INSERT INTO public.announcements (title, content, category, is_pinned)
VALUES
  (
    'Thông báo đóng tiền quỹ lưu xá Kỳ 2/2026 (600.000đ / 6 tháng)',
    'Kính gửi toàn thể anh em Lưu Xá Phanxicô,\n\nBan Đại Diện xin thông báo thu tiền quỹ lưu xá Kỳ 2/2026 (giai đoạn từ 01/07/2026 đến 31/12/2026).\n- Mức đóng: 600.000 VNĐ / thành viên.\n- Hạn chót hoàn thành: Ngày 15/10/2026.\n- Hình thức nộp: Tiền mặt trực tiếp cho Thủ quỹ hoặc chuyển khoản vào tài khoản quỹ chung của lưu xá.\n\nXin anh em sắp xếp hoàn thành đúng hạn để ban tài chính kịp cân đối chi tiêu các hoạt động mừng Lễ Bổn Mạng sắp tới.\nThân ái trong Thánh Phanxicô Assisi!',
    'Quan trọng',
    true
  ),
  (
    'Đại Lễ Mừng Kính Thánh Phanxicô Assisi Quan Thầy 04/10',
    'Thánh lễ Tạ ơn sẽ diễn ra vào lúc 08:30 sáng Chúa Nhật 04/10/2026 tại Nguyện đường lưu xá. Sau Thánh lễ sẽ có tiệc ngọt huynh đệ và chụp hình lưu niệm toàn nhà. Đề nghị anh em trang phục chỉnh tề (áo sơ mi trắng).',
    'Sự kiện',
    true
  ),
  (
    'Phân công tổng vệ sinh cuối tuần đón chào năm học mới',
    'Chiều thứ Bảy tuần này (15:00) toàn thể anh em sẽ tham gia tổng vệ sinh toàn diện khuôn viên nhà: phát quang sân thượng, lau chùi nhà xe và vệ sinh hệ thống lọc nước. Mong anh em có mặt đầy đủ.',
    'Chung',
    false
  );

-- ============================================================
-- 5. SỰ KIỆN MẪU (EVENTS)
-- ============================================================

INSERT INTO public.events (title, category, event_date, time_start, location, organizer, description, has_checkin)
VALUES
  (
    'Thánh lễ Bổn mạng Lưu Xá Phanxicô',
    'Bổn mạng',
    '2026-10-04',
    '08:30 sáng',
    'Nhà nguyện Lưu xá',
    'Trưởng nhà & Ban Phụng vụ',
    'Thánh lễ tạ ơn mừng quan thầy Thánh Phanxicô Assisi, tiệc ngọt huynh đệ.',
    true
  ),
  (
    'Họp nhà định kỳ Tháng 10',
    'Họp nhà',
    '2026-10-04',
    '19:30 tối',
    'Phòng sinh hoạt chung T1',
    'Trần Văn Đức (Trưởng nhà)',
    'Tổng kết tháng 9, triển khai nội quy năm học mới và đối soát thu chi quỹ chung.',
    true
  ),
  (
    'Giờ Kinh Tối & Chầu Thánh Thể đầu tháng',
    'Phụng vụ',
    '2026-10-02',
    '20:30 tối',
    'Sảnh nguyện T2',
    'Ban Phụng vụ',
    'Hiệp thông cầu nguyện cho quý ân nhân và gia đình các thành viên.',
    true
  ),
  (
    'Dã ngoại Chân Đền Thánh Giuse (Núi Cúi)',
    'Dã ngoại',
    '2026-10-18',
    '06:00 sáng',
    'Khu dã ngoại Núi Cúi',
    'Ban Sinh hoạt & Hậu cần',
    'Chuyến đi gắn kết tinh thần huynh đệ đầu năm học mới.',
    false
  );

-- ============================================================
-- 6. BÁO HỎNG MẪU (MAINTENANCE_ISSUES)
-- ============================================================

INSERT INTO public.maintenance_issues (title, location, description, status, assignee, cost)
VALUES
  (
    'Bóng đèn tuýp LED hành lang T2 chập chờn',
    'Hành lang T2',
    'Bóng đèn nhấp nháy liên tục vào buổi tối, cần thay bóng LED mới.',
    'new',
    NULL,
    120000
  ),
  (
    'Vòi sen phòng tắm tầng 1 rỉ nước nhẹ',
    'Phòng tắm T1',
    'Nước nhỏ giọt gây lãng phí nước sinh hoạt chung của dãy.',
    'in_progress',
    'Thủ quỹ (đã mua van thay thế)',
    65000
  ),
  (
    'Bản lề cửa sổ phòng 4 bị kẹt then gài',
    'Phòng 4 (T2)',
    'Đã thay bản lề cối inox mới, đóng mở êm ái.',
    'done',
    'Trưởng nhà',
    120000
  );

-- ============================================================
-- 7. DIỄN ĐÀN MẪU (FORUM_THREADS)
-- ============================================================

INSERT INTO public.forum_threads (title, content, category, is_pinned)
VALUES
  (
    'Kế hoạch dã ngoại Núi Cúi kỷ niệm Lễ Bổn Mạng: Xin ý kiến anh em!',
    'Chào anh em, Ban Đại Diện dự kiến tổ chức chuyến đi vào Chúa Nhật ngày 18/10. Chi phí trích 30% từ quỹ chung, phần còn lại anh em đóng góp nhẹ. Mời anh em cho ý kiến về phương tiện di chuyển (xe máy hay thuê xe du lịch 29 chỗ).',
    'Đi chơi',
    true
  ),
  (
    'Đề xuất cải thiện thực đơn bữa cơm huynh đệ tối thứ Tư',
    'Nhiều anh em đề xuất thứ Tư tuần tới chuyển sang món bún bò hoặc lẩu gà lá é cho đổi vị. Anh em cho ý kiến nhé!',
    'Bếp & Thực đơn',
    false
  ),
  (
    'Đề xuất mua thêm ổ cắm dài chịu tải cao cho sảnh học tập',
    'Buổi tối anh em ngồi học chung và làm bài tập thường thiếu ổ cắm laptop. Đề xuất thủ quỹ xuất quỹ mua 1 ổ chịu tải khoảng 150k.',
    'Góp ý chung',
    false
  );
