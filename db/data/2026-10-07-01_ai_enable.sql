-- =====================================================================
-- DỮ LIỆU 2026-10-07 — Bật công tắc AI tổng (feature.ai.enabled) CÓ NGÂN SÁCH. Chạy MỘT LẦN (migrate ghi nhận).
--   • AI chỉ chạy khi: công tắc tổng bật + tác vụ được bật + có khóa API (GROQ_API_KEY/GEMINI_API_KEY) + người dùng có quyền ai.use.
--     Mặc định chỉ "Trợ lý viết bài công khai" (content.article_assist) đang bật; các tác vụ khác Admin bật ở Cài đặt → Trợ lý AI.
--   • Ngân sách tháng này: 100.000đ, tự dừng khi hết (hard_stop), cảnh báo ở 80% — Admin chỉnh ở Cài đặt → Trợ lý AI.
--   • Admin tắt lại công tắc thì file này KHÔNG bật lại (đã ghi nhận trong app_migrations).
-- =====================================================================
BEGIN;

UPDATE public.settings SET value = 'true'::jsonb WHERE key = 'feature.ai.enabled';

INSERT INTO public.ai_budgets (month, limit_vnd, alert_threshold_pct, hard_stop)
VALUES (date_trunc('month', app.local_today())::date, 100000, 80, true)
ON CONFLICT (month) DO NOTHING;

COMMIT;
