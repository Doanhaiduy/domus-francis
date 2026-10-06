-- =====================================================================
-- DỮ LIỆU 2026-10-06 — Bật tác vụ AI "Trợ lý viết bài công khai" (content.article_assist) cho lưu xá.
-- File chỉ chạy MỘT LẦN (migrate ghi nhận), nên Admin tắt lại ở Cài đặt → Trợ lý AI thì không bị bật lại. Công tắc tổng
-- feature.ai.enabled và khóa API (GROQ_API_KEY / GEMINI_API_KEY) vẫn quyết định AI có chạy hay không.
-- =====================================================================
BEGIN;

UPDATE public.ai_task_types SET is_enabled = true WHERE code = 'content.article_assist' AND NOT is_enabled;

COMMIT;
