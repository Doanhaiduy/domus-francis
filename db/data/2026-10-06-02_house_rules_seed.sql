-- =====================================================================
-- DỮ LIỆU 2026-10-06 — Luật nhà MẪU để xem thử giao diện. Chỉ nạp khi bảng house_rule_sections còn TRỐNG (không ghi đè luật đã soạn).
-- Đây là nội dung THAM KHẢO — Trưởng nhà/Admin chỉnh lại cho đúng thực tế ở Thông báo → Luật nhà. Idempotent.
-- =====================================================================
BEGIN;

INSERT INTO public.house_rule_sections (title, icon, description, items, sort_order)
SELECT v.title, v.icon, v.description, v.items::jsonb, v.ord
  FROM (VALUES
    ('Giờ giấc sinh hoạt chung', '⏰', 'Lịch sinh hoạt hằng ngày của cả nhà (mẫu tham khảo — Trưởng nhà chỉnh lại cho đúng thực tế).',
     '[{"time":"05:30","text":"Thức dậy, vệ sinh cá nhân, dọn giường chiếu."},
       {"time":"06:00","text":"Kinh sáng; anh em tham dự Thánh lễ sáng khi có thể."},
       {"time":"11:30","text":"Cơm trưa chung (đăng ký suất ăn trước 09:00)."},
       {"time":"17:30","text":"Cơm tối chung (đăng ký suất ăn trước 15:00)."},
       {"time":"20:30","text":"Kinh Tối chung tại nguyện đường — mọi người có mặt đúng giờ."},
       {"time":"22:30","text":"Tắt đèn, giữ yên lặng để mọi người nghỉ ngơi và học bài."},
       {"time":"23:00","text":"Đóng cổng. Về trễ phải báo trước cho Trưởng nhà."}]', 1),
    ('Đời sống đức tin', '🙏', 'Giữ nhịp cầu nguyện và đời sống phụng vụ của cộng đoàn.',
     '[{"time":null,"text":"Tham dự Thánh lễ Chúa nhật và các lễ trọng; ngày lễ buộc thì check-in trên ứng dụng theo hướng dẫn của Ban Phụng vụ."},
       {"time":null,"text":"Tham dự Kinh Tối chung. Vắng mặt vì học tập hoặc làm thêm thì báo trước cho Ban Phụng vụ."},
       {"time":null,"text":"Giữ thinh lặng và tôn kính trong nguyện đường; không dùng điện thoại trong giờ kinh."},
       {"time":null,"text":"Tham gia tĩnh tâm và các sinh hoạt tôn giáo do cộng đoàn tổ chức."}]', 2),
    ('Vệ sinh và trật tự chung', '🧹', 'Mỗi người góp một tay để nhà luôn sạch sẽ, ngăn nắp.',
     '[{"time":null,"text":"Giữ phòng ở, nhà bếp, nhà vệ sinh và hành lang sạch sẽ; đổ rác đúng nơi, đúng giờ."},
       {"time":null,"text":"Mỗi tuần 2 anh em trực vệ sinh sân nhà theo lịch của Trưởng nhà; trực xong được đánh giá, chưa đạt thì trực lại."},
       {"time":null,"text":"Không hút thuốc, không uống rượu bia, không cờ bạc trong khuôn viên nhà."},
       {"time":null,"text":"Giữ yên lặng ở khu phòng ngủ và hành lang sau 22:30; nói chuyện, nghe nhạc vừa đủ nghe."}]', 3),
    ('Ăn uống và nhà bếp', '🍚', 'Đăng ký đúng giờ để Ban Ẩm thực chuẩn bị đủ suất, tránh lãng phí.',
     '[{"time":"09:00","text":"Chốt đăng ký cơm trưa. Sau giờ này chỉ Ban Ẩm thực điều chỉnh được."},
       {"time":"15:00","text":"Chốt đăng ký cơm tối."},
       {"time":null,"text":"Ăn xong dọn dẹp chén đũa, lau bàn; đội trực bếp chịu trách nhiệm rửa và dọn bếp."},
       {"time":null,"text":"Không tự ý lấy đồ trong kho bếp; cần mua thêm gia vị, thực phẩm thì gửi đề xuất cho Ban Ẩm thực."}]', 4),
    ('Khách và ra vào nhà', '🚪', 'Bảo đảm an ninh và sự riêng tư của mọi người trong nhà.',
     '[{"time":null,"text":"Báo trước cho Trưởng nhà khi có khách đến thăm; khách chỉ tiếp ở khu tiếp khách, không vào khu phòng ngủ."},
       {"time":"21:00","text":"Khách ra về trước giờ này. Khách ở lại qua đêm phải được Trưởng nhà đồng ý."},
       {"time":null,"text":"Về quê hoặc vắng mặt từ một đêm trở lên phải báo trước cho Trưởng nhà."},
       {"time":null,"text":"Giữ chìa khóa và thẻ ra vào cẩn thận; mất thì báo ngay."}]', 5),
    ('Điện, nước và tài sản chung', '🔌', 'Tiết kiệm và giữ gìn để chi phí chung của cả nhà nhẹ gánh.',
     '[{"time":null,"text":"Tắt đèn, quạt, điều hòa, vòi nước khi ra khỏi phòng; dùng nước và điện tiết kiệm."},
       {"time":null,"text":"Thiết bị hỏng báo ngay qua mục Hậu cần → Báo hỏng trên ứng dụng, không tự ý sửa chữa."},
       {"time":null,"text":"Giữ gìn bàn ghế, thiết bị và đồ dùng chung; làm hư hỏng do bất cẩn thì cùng chịu trách nhiệm bồi hoàn."}]', 6),
    ('Tài chính chung', '💳', 'Minh bạch, đúng hạn để quỹ nhà vận hành ổn định.',
     '[{"time":null,"text":"Đóng quỹ định kỳ và tiền điện nước đúng hạn theo thông báo của Thủ quỹ; đóng xong bấm “Tôi đã đóng” trên ứng dụng."},
       {"time":null,"text":"Khoản chi chung phải có phiếu chi, hóa đơn và được duyệt theo quy trình; không tự ý chi bằng quỹ chung."},
       {"time":null,"text":"Hoàn cảnh khó khăn có thể xin miễn hoặc giảm quỹ bằng cách trao đổi với Trưởng nhà."}]', 7),
    ('Tinh thần cộng đoàn', '🤝', 'Sống tình huynh đệ theo gương thánh Phanxicô.',
     '[{"time":null,"text":"Tôn trọng, yêu thương và giúp đỡ nhau trong học tập lẫn đời sống; có mâu thuẫn thì trao đổi thẳng thắn, hòa nhã hoặc nhờ Trưởng nhà hòa giải."},
       {"time":null,"text":"Tham dự đầy đủ các buổi họp nhà, sinh hoạt chung và sự kiện cộng đoàn; vắng mặt thì xin phép trước."},
       {"time":null,"text":"Gương mẫu trong lời nói, việc làm và ngôn từ trên mạng xã hội để xứng đáng là sinh viên Công giáo."}]', 8)
  ) AS v(title, icon, description, items, ord)
 WHERE NOT EXISTS (SELECT 1 FROM public.house_rule_sections);

COMMIT;
