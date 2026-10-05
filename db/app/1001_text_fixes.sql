-- =====================================================================
-- 1001 — CÂU CHỮ HIỂN THỊ CHO NGƯỜI DÙNG. Idempotent; chỉ sửa văn bản mô tả (không đổi mã, quyền, dữ liệu nghiệp vụ).
-- Mô tả gốc trong tài liệu thiết kế còn nhãn nội bộ ("[ĐỀ XUẤT]"), mã kỹ thuật ("auth.*", "roster", "URL", "SLA")
-- hoặc nhắc vai trò Phó nhà đã bỏ — các chuỗi này hiện nguyên văn ở Cài đặt → Phân quyền và hộp thư thông báo.
-- (Tên/mô tả khóa cấu hình hiển thị qua danh mục src/lib/settings-catalog.ts, không sửa ở đây.)
-- =====================================================================
BEGIN;

-- Vai trò: bỏ nhãn nội bộ ở đầu mô tả
UPDATE public.roles
   SET description = regexp_replace(description, '^\s*\[(ĐỀ XUẤT|GIẢ ĐỊNH)\]\s*', '')
 WHERE description ~ '^\s*\[(ĐỀ XUẤT|GIẢ ĐỊNH)\]';

-- Quyền: lời thường, không mã kỹ thuật
UPDATE public.permissions SET description = 'Lập lịch trực tuần, phân công, điều chỉnh người trực'
 WHERE code = 'duty.manage' AND description = 'Lập roster, phân công, điều chỉnh người trực';
UPDATE public.permissions SET description = 'Tải tệp, ảnh lên hệ thống'
 WHERE code = 'storage.upload' AND description = 'Xin URL tải lên và tải tệp';
UPDATE public.permissions SET description = 'Sửa cấu hình bảo mật đăng nhập: xác thực hai lớp bắt buộc, khóa đăng nhập, thời hạn phiên'
 WHERE code = 'security.settings.write' AND description LIKE 'Sửa cấu hình bảo mật (auth.*)%';
UPDATE public.permissions SET description = 'Phê duyệt/từ chối phiếu chi (không tự duyệt phiếu của mình; trên ngưỡng cần 2 chữ ký)'
 WHERE code = 'finance.expense.approve' AND description LIKE '%Phó nhà chỉ là chữ ký thứ hai%';

-- Loại thông báo
UPDATE public.notification_types SET name_vi = 'Sự cố quá hạn xử lý'
 WHERE code = 'facility.sla_breach' AND name_vi = 'Sự cố quá hạn xử lý (SLA)';

COMMIT;
