-- =====================================================================
-- DỮ LIỆU 2026-10-12 (bản 50) — Gỡ "Nội quy Lưu Xá Phanxicô (BẢN MẪU)" khỏi danh sách tài liệu hiện hành. Idempotent.
--   Bản mẫu của thiết kế (db/migrations/52_seed_lookup.sql) ghi giờ giới nghiêm 22:30 — SAI so với Luật nhà chính thức (cổng đóng 22:00,
--   db/data/2026-10-07-06/07). Trước đây Trợ lý Lưu Xá (community.policy_rag) truy xuất bản mẫu này nên có thể trả lời sai giờ.
--   Từ db/app/1046 trợ lý đọc Luật nhà chính thức (house_rule_sections) + Hỏi đáp công khai (public_faqs); file này gỡ cờ is_current của
--   bản mẫu để không còn nơi nào coi nó là văn bản đang áp dụng (bản ghi được GIỮ, không xóa).
-- =====================================================================
BEGIN;

UPDATE public.policy_documents
   SET is_current = false
 WHERE is_current
   AND (content_md LIKE '%(BẢN MẪU)%' OR title ILIKE '%(bản mẫu)%');

COMMIT;
