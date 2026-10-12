-- =====================================================================
-- DỮ LIỆU 2026-10-12 — Câu hỏi thường gặp MẪU cho trang công khai /hoi-dap. Idempotent (theo nội dung câu hỏi).
--   • 8 câu NHÁP (is_active = false ⇒ CHƯA hiện công khai, Trợ lý AI cũng chưa dùng): chi phí, giờ giấc, giấy tờ, phụ huynh thăm,
--     người chưa phải Công giáo, cơm nước, an ninh, cách đăng ký.
--   • Người quản lý (quyền article.manage) đọc lại, sửa cho đúng thực tế của nhà rồi bật "Hiện" ở Bài viết → Hỏi đáp.
--   • Không ghi con số cụ thể: mức quỹ / điện nước / chỗ trống được trang /vao-o đọc tự động từ cấu hình và dữ liệu thật.
--   • Câu đã có (kể cả đã sửa nội dung trả lời) thì KHÔNG thêm lại; câu đã xóa thì chạy lại file này sẽ thêm lại dạng nháp.
-- =====================================================================
BEGIN;

WITH v(ord, q, a) AS (
  VALUES
  (1, 'Ở lưu xá mỗi tháng tốn khoảng bao nhiêu?',
   E'Anh em cùng góp **quỹ sinh hoạt chung** theo kỳ và **chia đều tiền điện nước** theo hóa đơn thực tế mỗi tháng. Mức quỹ hiện hành, tiền điện nước bình quân những tháng gần đây và số chỗ còn trống được cập nhật tự động ở trang [Vào ở lưu xá](/vao-o).\n\nNếu gia đình đang gặp khó khăn, bạn cứ chia sẻ riêng với người quản lý khi đến thăm nhà để được lắng nghe và tư vấn.'),
  (2, 'Giờ giấc sinh hoạt ở lưu xá thế nào?',
   E'Nhà có giờ mở – đóng cổng, giờ Kinh tối chung và giờ giữ yên lặng buổi tối để mọi người học tập, nghỉ ngơi. Lịch cụ thể nằm trong Luật nhà và được tóm tắt ở mục **Nhịp sinh hoạt** của trang [Vào ở lưu xá](/vao-o#nhip-sinh-hoat).\n\nKhi cần về muộn, ngủ ngoài hay về quê, anh em xin phép trước với Trưởng nhà.'),
  (3, 'Cần chuẩn bị giấy tờ gì để vào ở?',
   E'Thường gồm:\n- Căn cước (CCCD) để nhà làm thủ tục cư trú theo quy định.\n- Thẻ sinh viên hoặc giấy báo nhập học.\n- Ảnh chân dung để làm hồ sơ.\n- Số điện thoại của bố mẹ hoặc người giám hộ.\n- Thư giới thiệu của Cha xứ hoặc giấy tờ Bí tích (nếu nhà yêu cầu).\n\nNgười quản lý sẽ hướng dẫn cụ thể khi bạn đến thăm nhà — xem thêm [các bước vào ở](/vao-o#cac-buoc).'),
  (4, 'Phụ huynh có thể đến thăm không?',
   E'Gia đình luôn được chào đón. Phụ huynh vui lòng liên hệ trước với Trưởng nhà để được hướng dẫn thời gian và nơi gặp gỡ phù hợp với nội quy của nhà.'),
  (5, 'Bạn chưa phải người Công giáo có ở được không?',
   E'Lưu xá là cộng đoàn sinh viên Công giáo, đời sống chung gắn với giờ kinh nguyện và Thánh lễ. Nếu bạn chưa phải là người Công giáo nhưng muốn tìm hiểu, hãy [liên hệ với chúng tôi](/lien-he#dang-ky) để được tư vấn cụ thể.'),
  (6, 'Ăn uống ở lưu xá như thế nào?',
   E'Tùy từng giai đoạn, nhà có thể tổ chức bếp chung (anh em đăng ký suất ăn trước giờ chốt) hoặc mỗi người tự lo bữa ăn của mình. Bạn hãy hỏi người quản lý khi đến thăm nhà để biết cách đang áp dụng hiện nay.'),
  (7, 'Ở lưu xá có an toàn không?',
   E'Nhà có giờ mở – đóng cổng, khách đến phải báo trước và mọi người cùng gìn giữ tài sản chung. Anh em xin phép khi về muộn hay ngủ ngoài nên người quản lý luôn biết ai đang vắng nhà. Bạn vẫn nên tự cất giữ cẩn thận giấy tờ và đồ dùng có giá trị.'),
  (8, 'Làm sao để đăng ký vào ở?',
   E'Bạn điền biểu mẫu [Đăng ký tìm hiểu](/lien-he#dang-ky) hoặc gọi hotline của nhà. Người quản lý sẽ liên hệ lại, hẹn bạn đến thăm nhà, trò chuyện và giới thiệu nội quy. Khi được nhận, bạn nộp giấy tờ, nhận phòng và được cấp tài khoản ứng dụng của nhà.')
)
INSERT INTO public.public_faqs (question, answer, sort_order, is_active)
SELECT v.q, v.a, COALESCE((SELECT max(f.sort_order) FROM public.public_faqs f), 0) + v.ord, false
  FROM v
 WHERE NOT EXISTS (SELECT 1 FROM public.public_faqs f WHERE lower(btrim(f.question)) = lower(btrim(v.q)))
 ORDER BY v.ord;

COMMIT;
