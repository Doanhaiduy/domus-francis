-- =====================================================================
-- 1026 — Báo cáo hoạt động quý / năm (PDF gửi Ban điều hành, Tỉnh Dòng, phụ huynh)
--   Quyền report.read: xem và xuất báo cáo tổng hợp (nhân sự, tài chính, sự kiện, trực nhật & hậu cần).
--   Báo cáo chỉ gồm số liệu TỔNG HỢP — không có dữ liệu cá nhân (điểm, hồ sơ, SĐT…).
-- =====================================================================
BEGIN;

INSERT INTO public.permissions (code, module, description, is_sensitive)
VALUES ('report.read', 'system', 'Xem và xuất báo cáo hoạt động quý/năm (số liệu tổng hợp toàn nhà)', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'report.read' FROM public.roles r WHERE r.code IN ('house_head', 'admin', 'treasurer')
ON CONFLICT DO NOTHING;

COMMIT;
