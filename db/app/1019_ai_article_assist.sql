-- =====================================================================
-- 1019 — AI TRỢ LÝ VIẾT BÀI CÔNG KHAI. Chạy SAU 1018. Idempotent.
--   • content.article_assist — gợi ý đề tài, viết nháp, chỉnh văn, gợi ý tiêu đề + tóm tắt cho bài đăng công khai (/bai-viet).
--     Chỉ gửi nội dung người soạn đang viết + thông tin giới thiệu cộng đoàn đã công khai (app.fn_public_org_info) —
--     không có dữ liệu cá nhân của thành viên nên không cần đồng ý riêng (required_consent_purpose = NULL).
--   • Mặc định TẮT như mọi tác vụ AI khi mới cài (smoke test); bật ở Cài đặt → Trợ lý AI hoặc bằng db/data/2026-10-06-03.
-- =====================================================================
BEGIN;

INSERT INTO ai_task_types (code, name_vi, description, technique, model_tier, data_class, required_consent_purpose,
                           human_review_required, external_call_allowed, monthly_budget_vnd)
VALUES
  ('content.article_assist', 'Trợ lý viết bài công khai',
   'Gợi ý đề tài, viết nháp bài, chỉnh văn (làm mượt, rút gọn, mở rộng, đổi giọng) và gợi ý tiêu đề + tóm tắt cho bài đăng công khai. Chỉ gửi nội dung người soạn đang viết cùng thông tin giới thiệu cộng đoàn đã công khai; người soạn xem và tự quyết định trước khi đăng.',
   'llm', 'small', 'internal_ok', NULL, false, true, 60000)
ON CONFLICT (code) DO NOTHING;

COMMIT;
