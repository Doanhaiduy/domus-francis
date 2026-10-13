-- =====================================================================
-- 1053 — AI VIẾT BÀI: tra cứu tư liệu, tạo ảnh bìa/minh họa, gợi ý chú thích ảnh + cờ "ảnh bìa do AI tạo". Chạy SAU 1052. Idempotent.
--   • content.article_research — tra cứu tư liệu (Gemini + tìm kiếm Google khi còn hạn mức, Vatican News, Wikipedia tiếng Việt).
--     Chỉ gửi đề tài người soạn nhập (đã che số điện thoại/email) — không có dữ liệu cá nhân của thành viên ⇒ không cần đồng ý riêng.
--   • content.article_image    — tạo ảnh bìa / ảnh minh họa bằng Cloudflare Workers AI (miễn phí trong hạn mức 10.000 neuron/ngày).
--     Chỉ gửi tiêu đề/tóm tắt/đoạn văn của bài sẽ đăng công khai + mô tả phong cách. Ảnh tạo ra lưu như ảnh người dùng tải lên.
--   • content.image_caption    — gợi ý chú thích cho ẢNH CỦA BÀI VIẾT (bucket attachments) — chỉ khi người soạn bấm; ảnh gửi Cloudflare.
--   • public_articles.cover_is_ai — ảnh bìa do AI tạo ⇒ trang công khai gắn nhãn "Ảnh minh họa do AI tạo".
-- Mặc định TẮT như mọi tác vụ AI khi mới cài; bật bằng db/data/2026-10-13-01 hoặc ở Cài đặt → Trợ lý AI. Chi phí quy đổi = 0.
-- =====================================================================
BEGIN;

INSERT INTO ai_task_types (code, name_vi, description, technique, model_tier, data_class, required_consent_purpose,
                           human_review_required, external_call_allowed, monthly_budget_vnd)
VALUES
  ('content.article_research', 'Tra cứu tư liệu cho bài viết',
   'Tra cứu thông tin mới liên quan đề tài bài viết: Gemini + tìm kiếm Google (khi còn hạn mức miễn phí), tin Vatican News tiếng Việt và Wikipedia tiếng Việt. Trả về các dữ kiện kèm nguồn để người soạn chọn và tự kiểm chứng; không tự đưa vào bài. Chỉ gửi đề tài do người soạn nhập.',
   'llm', 'small', 'internal_ok', NULL, false, true, NULL),
  ('content.article_image', 'Tạo ảnh bìa / ảnh minh họa bằng AI',
   'Tạo 1–2 phương án ảnh bìa hoặc ảnh minh họa cho bài viết công khai bằng Cloudflare Workers AI (miễn phí trong hạn mức ngày; không vẽ người, hình tượng thánh hay chữ). Chỉ gửi tiêu đề, tóm tắt, đoạn văn của bài và phong cách chọn; người soạn chọn ảnh, ảnh gắn nhãn "do AI tạo".',
   'vision', 'vision', 'internal_ok', NULL, false, true, NULL),
  ('content.image_caption', 'Gợi ý chú thích ảnh bài viết',
   'Đọc một ảnh của bài viết (bucket attachments) bằng mô hình thị giác của Cloudflare và gợi ý một câu chú thích tiếng Việt chỉ mô tả điều nhìn thấy. Chỉ chạy khi người soạn bấm; không bao giờ áp dụng cho ảnh hóa đơn, minh chứng hay hồ sơ.',
   'vision', 'vision', 'internal_ok', NULL, false, true, NULL)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.public_articles ADD COLUMN IF NOT EXISTS cover_is_ai boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.public_articles.cover_is_ai IS 'Ảnh bìa do AI tạo (Cloudflare Workers AI) — trang công khai gắn nhãn "Ảnh minh họa do AI tạo". Đổi/xóa ảnh bìa thì người soạn bỏ cờ này.';
GRANT INSERT (cover_is_ai) ON public.public_articles TO luuxa_app;
GRANT UPDATE (cover_is_ai) ON public.public_articles TO luuxa_app;

-- Văn bản pháp lý bản 1.3 (thêm Cloudflare Workers AI, tra cứu tư liệu, ảnh AI): nâng phiên bản đồng ý cho khớp LEGAL_VERSION (src/content/legal.ts) — như 1046 đã làm với 1.2
UPDATE public.consent_purposes SET current_version = 103
 WHERE code IN ('terms_of_use', 'privacy_notice_ack') AND current_version < 103;

COMMIT;
