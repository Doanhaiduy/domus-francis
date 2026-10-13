-- =====================================================================
-- DỮ LIỆU 2026-10-13 — Bật 3 tác vụ AI mới của trợ lý viết bài: tra cứu tư liệu, tạo ảnh bìa/minh họa, gợi ý chú thích ảnh.
-- File chỉ chạy MỘT LẦN (migrate ghi nhận), nên Admin tắt lại ở Cài đặt → Trợ lý AI thì không bị bật lại. Công tắc tổng feature.ai.enabled
-- và khóa Cloudflare (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) vẫn quyết định ảnh/chú thích có chạy hay không.
-- =====================================================================
BEGIN;

UPDATE public.ai_task_types
   SET is_enabled = true
 WHERE code IN ('content.article_research', 'content.article_image', 'content.image_caption') AND NOT is_enabled;

COMMIT;
