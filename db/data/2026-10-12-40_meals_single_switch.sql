-- =====================================================================
-- DỮ LIỆU 2026-10-12 (bản 40) — Bếp & Cơm: MỘT công tắc duy nhất (Cài đặt → Phân hệ). Idempotent.
--   Trước đây bật/tắt Bếp & Cơm nằm ở 3 nơi (tab Phân hệ = ui.disabled_modules['/bep-com'], khóa nâng cao feature.meals.enabled,
--   hộp "Cấu hình bếp") và có thể lệch nhau. Từ nay tab Phân hệ là nguồn duy nhất; máy chủ đồng bộ cờ feature.meals.enabled theo
--   (PUT /api/v1/ui/modules). File này làm cho hai giá trị KHỚP NHAU ở thời điểm triển khai, giữ nguyên HÀNH VI hiện tại:
--     • cờ đang TẮT (mặc định "tạm hoãn")  ⇒ ghi '/bep-com' vào danh sách phân hệ đang ẩn (tab Phân hệ hiện "Bảo trì");
--     • cờ đang BẬT mà '/bep-com' đang ẩn   ⇒ coi tab Phân hệ là đúng: tắt cờ.
-- =====================================================================
BEGIN;

UPDATE public.settings s
   SET value = s.value || jsonb_build_object('/bep-com', jsonb_build_object(
         'message', 'Bếp & Cơm đang tạm hoãn theo quyết định người quản lý.',
         'since', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
 WHERE s.key = 'ui.disabled_modules'
   AND NOT (s.value ? '/bep-com')
   AND (SELECT f.value FROM public.settings f WHERE f.key = 'feature.meals.enabled') = 'false'::jsonb;

UPDATE public.settings f
   SET value = 'false'::jsonb
 WHERE f.key = 'feature.meals.enabled'
   AND f.value = 'true'::jsonb
   AND EXISTS (SELECT 1 FROM public.settings m WHERE m.key = 'ui.disabled_modules' AND m.value ? '/bep-com');

COMMIT;
