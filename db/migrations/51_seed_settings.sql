-- =====================================================================
-- KHỐI 4.7.2 — SEED CẤU HÌNH HỆ THỐNG (settings)
-- Mọi giá trị dưới đây là MẶC ĐỊNH KHỞI TẠO, người quản lý sửa trên màn hình Cài đặt (có audit).
-- Các số đánh dấu [GIẢ ĐỊNH] cần người quản lý xác nhận (xem Phần 0).
-- =====================================================================
INSERT INTO settings (key, value, value_type, description, min_value, max_value, is_public) VALUES
  -- Tài chính
  ('finance.monthly_dues_vnd',                    '350000'::jsonb,  'vnd',     'Mức quỹ sinh hoạt hàng tháng của mỗi thành viên (VNĐ). FE cũ cài cứng 350.000.', 0, 5000000, true),
  ('finance.dues_due_day',                        '5'::jsonb,       'integer', 'Ngày hạn nộp quỹ trong tháng (1–28). FE cũ cài cứng ngày 05.', 1, 28, true),
  ('finance.expense.dual_approval_min_vnd',       '1000000'::jsonb, 'vnd',     '[GIẢ ĐỊNH] Phiếu chi từ mức này cần 2 chữ ký (Trưởng nhà + Thủ quỹ/Phó nhà).', 100000, 1000000000, false),
  ('finance.expense.receipt_required_min_vnd',    '200000'::jsonb,  'vnd',     '[GIẢ ĐỊNH] Phiếu chi từ mức này bắt buộc đính kèm ảnh hóa đơn (hoặc nêu lý do không có).', 0, 1000000000, false),
  ('finance.expense.treasurer_solo_approve_max_vnd','200000'::jsonb,'vnd',     '[GIẢ ĐỊNH] Thủ quỹ được tự duyệt (một chữ ký) phiếu chi nhỏ đến mức này (chi lặt vặt); trên mức đó phiếu một chữ ký phải do Trưởng nhà duyệt — tách người duyệt khỏi người ghi chi (BR-FIN-17).', 0, 1000000000, false),
  ('finance.period.close_requires_reconciliation','true'::jsonb,    'boolean', 'Bắt buộc đối soát sao kê cho quỹ ngân hàng trước khi chốt sổ tháng.', NULL, NULL, false),
  ('finance.transparency.show_debtor_names',      'false'::jsonb,   'boolean', 'Cho phép mọi thành viên thấy danh sách người chưa đóng quỹ (mặc định chỉ Thủ quỹ/người quản lý; thành viên chỉ thấy số liệu tổng hợp).', NULL, NULL, true),
  ('finance.reminder.days_before_due',            '3'::jsonb,       'integer', 'Nhắc đóng quỹ trước hạn bao nhiêu ngày.', 0, 14, false),
  ('finance.reminder.overdue_every_days',         '7'::jsonb,       'integer', 'Chu kỳ nhắc nợ khi quá hạn (ngày).', 1, 30, false),
  -- Trực nhật & vệ sinh
  ('duty.checkin.window_before_minutes',          '60'::jsonb,      'integer', 'Cho phép check-in sớm hơn giờ bắt đầu ca tối đa bao nhiêu phút.', 0, 240, false),
  ('duty.checkin.window_after_minutes',           '720'::jsonb,     'integer', 'Cho phép check-in muộn tối đa bao nhiêu phút sau khi hết ca (quá hạn ⇒ không check-in được).', 0, 2880, false),
  ('duty.checkin.late_after_minutes',             '60'::jsonb,      'integer', 'Check-in sau khi hết ca bao nhiêu phút thì bị đánh dấu muộn.', 0, 720, false),
  ('duty.evidence.max_age_minutes',               '120'::jsonb,     'integer', 'Ảnh minh chứng phải được chụp trong vòng bao nhiêu phút trước lúc check-in (theo EXIF/camera).', 5, 1440, false),
  ('duty.evidence.require_exif',                  'false'::jsonb,   'boolean', 'Bắt buộc ảnh có thời điểm chụp (EXIF hoặc chụp trực tiếp bằng camera).', NULL, NULL, false),
  ('duty.evidence.phash_max_distance',            '6'::jsonb,       'integer', 'Khoảng cách Hamming pHash tối đa để coi hai ảnh là "gần giống" (0–64).', 0, 20, false),
  ('duty.evidence.dedupe_days',                   '60'::jsonb,      'integer', 'So khớp ảnh trùng với các check-in trong bao nhiêu ngày gần đây.', 1, 365, false),
  ('duty.swap.min_notice_hours',                  '12'::jsonb,      'integer', 'Phải xin đổi ca trước giờ bắt đầu ít nhất bao nhiêu giờ.', 0, 168, false),
  ('duty.swap.request_ttl_hours',                 '48'::jsonb,      'integer', 'Đơn đổi ca tự hết hạn sau bao nhiêu giờ nếu chưa được xử lý.', 1, 168, false),
  ('duty.missed_after_hours',                     '6'::jsonb,       'integer', 'Ca chưa check-in quá bao nhiêu giờ sau khi hết ca ⇒ tự đánh dấu bỏ ca.', 1, 72, false),
  ('duty.appeal.window_hours',                    '48'::jsonb,      'integer', 'Thời hạn khiếu nại kết quả nghiệm thu (giờ) kể từ lúc có kết quả.', 1, 168, false),
  ('duty.rework.window_hours',                    '24'::jsonb,      'integer', '[GIẢ ĐỊNH] Sau khi bị yêu cầu làm lại, người trực có bao nhiêu giờ để check-in lại (hạn tính từ lúc nghiệm thu); quá hạn ⇒ ca bị đánh dấu bỏ ca (BR-DUTY-26).', 1, 168, false),
  -- Sự kiện & điểm danh
  ('event.attendance.open_minutes_before',        '30'::jsonb,      'integer', 'Mở điểm danh trước giờ bắt đầu bao nhiêu phút (mặc định cho sự kiện không đặt riêng).', 0, 720, false),
  ('event.attendance.late_grace_minutes',         '10'::jsonb,      'integer', 'Ân hạn (phút) sau giờ bắt đầu vẫn tính có mặt đúng giờ; quá hạn ⇒ đi muộn.', 0, 120, false),
  ('qr.rotation_seconds',                         '45'::jsonb,      'integer', 'Chu kỳ xoay mã QR điểm danh (giây), khuyến nghị 30–60.', 15, 120, false),
  ('qr.default_geofence_radius_m',                '150'::jsonb,     'integer', 'Bán kính geofence mặc định (mét) quanh lưu xá khi bật định vị.', 20, 5000, false),
  -- Cơ sở vật chất
  ('facility.sla_hours.low',                      '168'::jsonb,     'integer', 'SLA xử lý sự cố mức Thấp (giờ) = 7 ngày [đề xuất].', 1, 720, false),
  ('facility.sla_hours.medium',                   '48'::jsonb,      'integer', 'SLA mức Trung bình (giờ) = 48h — khớp nhãn "Trung bình (48h)" ở FE.', 1, 720, true),
  ('facility.sla_hours.high',                     '24'::jsonb,      'integer', 'SLA mức Gấp (giờ) = trong ngày — khớp nhãn "Gấp (Trong ngày)" ở FE.', 1, 720, true),
  ('facility.sla_hours.critical',                 '4'::jsonb,       'integer', 'SLA mức Khẩn cấp (giờ) = "Ngay" ở FE, quy đổi 4 giờ [GIẢ ĐỊNH].', 1, 72, true),
  -- Đặt lịch giặt
  ('laundry.slots',                               '[["06:00","08:00"],["08:00","10:00"],["10:00","12:00"],["14:00","16:00"],["16:00","18:00"],["18:00","20:00"],["20:00","22:00"]]'::jsonb, 'json', 'Các khung giờ giặt trong ngày (giờ VN) — khớp 7 khung 2 giờ ở FE (không có 12:00–14:00).', NULL, NULL, true),
  ('laundry.max_per_week',                        '3'::jsonb,       'integer', '[GIẢ ĐỊNH] Số lượt giặt tối đa mỗi người mỗi tuần.', 1, 14, true),
  ('laundry.max_days_ahead',                      '14'::jsonb,      'integer', 'Cho đặt trước tối đa bao nhiêu ngày.', 1, 60, true),
  ('laundry.noshow_cancel_minutes',               '15'::jsonb,      'integer', 'Không check-in sau bao nhiêu phút kể từ giờ bắt đầu thì tự hủy (no_show).', 5, 120, true),
  ('laundry.cancel_min_minutes',                  '30'::jsonb,      'integer', 'Chỉ được tự hủy lượt trước giờ bắt đầu ít nhất bao nhiêu phút.', 0, 720, true),
  -- Cờ tính năng
  ('feature.meals.enabled',                       'false'::jsonb,   'boolean', 'Bật phân hệ Bếp & Cơm (đăng ký suất ăn). Hiện TẠM HOÃN theo quyết định người quản lý.', NULL, NULL, true),
  ('feature.ai.enabled',                          'false'::jsonb,   'boolean', 'Công tắc tổng cho mọi tính năng AI (mỗi tác vụ còn có cờ riêng ở ai_task_types).', NULL, NULL, true),
  -- Lưu trữ tệp
  ('upload.max_image_bytes',                      '10485760'::jsonb,'integer', 'Dung lượng tối đa ảnh tải lên (byte). Trần cứng của DB là 20 MB.', 102400, 20971520, true),
  ('upload.monthly_quota_bytes',                  '524288000'::jsonb,'integer','Hạn mức dung lượng tải lên mỗi thành viên mỗi tháng (byte) = 500 MB.', 0, NULL, false),
  ('upload.presign_ttl_seconds',                  '600'::jsonb,     'integer', 'Thời hạn URL tải lên presigned (giây).', 60, 3600, false),
  ('upload.orphan_ttl_hours',                     '24'::jsonb,      'integer', 'Tệp tải lên nhưng chưa gắn thực thể sau số giờ này sẽ bị dọn.', 1, 720, false),
  -- Bảo mật / phiên
  ('auth.access_token_ttl_seconds',               '900'::jsonb,     'integer', 'Thời hạn access token (giây) = 15 phút.', 60, 3600, false),
  ('auth.refresh_token_ttl_days',                 '30'::jsonb,      'integer', 'Thời hạn tuyệt đối của phiên/refresh token (ngày).', 1, 90, false),
  ('auth.max_failed_logins',                      '5'::jsonb,       'integer', 'Số lần đăng nhập sai liên tiếp trước khi khóa tạm.', 3, 20, false),
  ('auth.lockout_minutes',                        '15'::jsonb,      'integer', 'Thời gian khóa tạm sau khi vượt số lần đăng nhập sai (phút).', 1, 1440, false),
  ('auth.mfa_required_roles',                     '["admin","house_head","treasurer"]'::jsonb, 'json', 'Vai trò bắt buộc bật MFA (khuyến nghị).', NULL, NULL, false)
ON CONFLICT (key) DO NOTHING;

-- Tách quyền: cấu hình tài chính chỉ người có finance.settings.write (Trưởng nhà) sửa được; Admin kỹ thuật thì không
UPDATE settings SET write_permission = 'finance.settings.write' WHERE key LIKE 'finance.%';
