-- =====================================================================
-- KHỐI 4.2 — KIỂU LIỆT KÊ (ENUM)
-- Nguyên tắc chọn:
--   * ENUM  : tập GIÁ TRỊ ĐÓNG, gắn với máy trạng thái hoặc logic code (đổi = phải sửa code).
--             Thêm giá trị mới: ALTER TYPE … ADD VALUE (không khóa bảng); KHÔNG xóa/đổi tên giá trị.
--   * BẢNG TRA CỨU (categories, amenities, duty_shifts, cleaning_areas, universities, dioceses,
--             positions, permissions…) : giá trị Ban điều hành tự thêm/sửa/ẩn trên màn hình Cài đặt.
-- Quy ước: tên kiểu kết thúc bằng _t; giá trị snake_case tiếng Anh; nhãn tiếng Việt nằm trong COMMENT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.2.1  Danh tính, hồ sơ, phân quyền
-- ---------------------------------------------------------------------
CREATE TYPE user_status_t AS ENUM ('invited', 'active', 'locked', 'disabled');
COMMENT ON TYPE user_status_t IS 'Trạng thái tài khoản: invited=đã mời chưa kích hoạt, active=hoạt động, locked=khóa tạm (đăng nhập sai nhiều/Admin khóa), disabled=vô hiệu hóa.';

CREATE TYPE gender_t AS ENUM ('male', 'female');
COMMENT ON TYPE gender_t IS 'Giới tính: male=Nam, female=Nữ (khớp FE: Nam | Nữ).';

CREATE TYPE member_status_t AS ENUM ('active', 'on_leave', 'alumni', 'left');
COMMENT ON TYPE member_status_t IS 'Trạng thái cư trú: active=đang ở, on_leave=tạm vắng dài hạn (thực tập/về quê), alumni=cựu thành viên, left=đã rời lưu xá.';

CREATE TYPE guardian_relation_t AS ENUM ('father', 'mother', 'guardian', 'sibling', 'other');
COMMENT ON TYPE guardian_relation_t IS 'Quan hệ của người liên lạc khẩn cấp/giám hộ: cha, mẹ, người giám hộ, anh/chị/em, khác.';

CREATE TYPE sacrament_t AS ENUM ('baptism', 'eucharist', 'confirmation', 'penance', 'anointing', 'holy_orders', 'matrimony');
COMMENT ON TYPE sacrament_t IS 'Bảy Bí tích: Rửa tội, Thánh Thể, Thêm sức, Hòa giải (Giải tội), Xức dầu bệnh nhân, Truyền chức thánh, Hôn phối.';

CREATE TYPE scope_type_t AS ENUM ('global', 'floor', 'cleaning_area');
COMMENT ON TYPE scope_type_t IS 'Phạm vi hiệu lực của một vai trò: global=toàn nhà, floor=một tầng (floors.id), cleaning_area=một khu vực vệ sinh (cleaning_areas.id).';

CREATE TYPE position_kind_t AS ENUM ('leadership', 'committee', 'task');
COMMENT ON TYPE position_kind_t IS 'Loại trách vụ: leadership=Ban điều hành, committee=trưởng/phó ban chuyên trách, task=phụ trách một việc cụ thể.';

CREATE TYPE term_status_t AS ENUM ('planned', 'active', 'closed');
COMMENT ON TYPE term_status_t IS 'Trạng thái nhiệm kỳ Ban điều hành: planned=sắp tới, active=đang hiệu lực, closed=đã bàn giao.';

CREATE TYPE application_status_t AS ENUM ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn');
COMMENT ON TYPE application_status_t IS 'Đơn xin vào lưu xá / đăng ký tài khoản chờ phê duyệt.';

-- ---------------------------------------------------------------------
-- 4.2.2  Cấu hình, danh mục, đồng ý, yêu cầu của chủ thể dữ liệu
-- ---------------------------------------------------------------------
CREATE TYPE category_kind_t AS ENUM ('expense', 'event', 'announcement', 'forum', 'maintenance', 'album');
COMMENT ON TYPE category_kind_t IS 'Loại danh mục trong bảng categories (khớp CategoryItem.type ở FE, thêm album).';

CREATE TYPE dsr_type_t AS ENUM ('access', 'rectification', 'erasure', 'restriction', 'portability', 'withdraw_consent', 'objection');
COMMENT ON TYPE dsr_type_t IS 'Quyền của chủ thể dữ liệu: truy cập, chỉnh sửa, xóa, hạn chế xử lý, di chuyển dữ liệu, rút lại đồng ý, phản đối.';

CREATE TYPE dsr_status_t AS ENUM ('received', 'in_progress', 'completed', 'rejected');
COMMENT ON TYPE dsr_status_t IS 'Trạng thái xử lý yêu cầu của chủ thể dữ liệu.';

-- ---------------------------------------------------------------------
-- 4.2.3  Lưu trữ tệp
-- ---------------------------------------------------------------------
CREATE TYPE storage_bucket_t AS ENUM ('avatars', 'receipts', 'cleaning-evidence', 'academic-evidence', 'maintenance', 'moments', 'attachments', 'documents');
COMMENT ON TYPE storage_bucket_t IS 'Bucket đối tượng: avatars, receipts (hóa đơn), cleaning-evidence, academic-evidence (bảng điểm), maintenance, moments (khoảnh khắc), attachments (đính kèm thông báo/diễn đàn), documents (nội quy, biên bản).';

CREATE TYPE file_status_t AS ENUM ('pending_upload', 'uploaded', 'processing', 'ready', 'rejected', 'quarantined', 'deleted');
COMMENT ON TYPE file_status_t IS 'Vòng đời tệp: pending_upload=đã cấp URL, chưa tải; uploaded=đã tải lên, chờ xử lý; processing=đang kiểm tra/nén; ready=sẵn sàng; rejected=không hợp lệ; quarantined=nghi nhiễm mã độc; deleted=đã xóa mềm.';

CREATE TYPE attachment_entity_t AS ENUM (
  'expense_voucher', 'duty_checkin', 'duty_review_appeal', 'academic_record', 'maintenance_issue',
  'repair_cost', 'announcement', 'forum_post', 'leave_request', 'member_application', 'policy_document', 'event'
);
COMMENT ON TYPE attachment_entity_t IS 'Loại thực thể được gắn tệp trong media_attachments (liên kết đa hình có kiểm tra tồn tại bằng trigger).';

CREATE TYPE attachment_purpose_t AS ENUM ('receipt', 'evidence', 'transcript', 'before_photo', 'after_photo', 'attachment', 'supporting_document');
COMMENT ON TYPE attachment_purpose_t IS 'Mục đích tệp đính kèm: hóa đơn, minh chứng, bảng điểm, ảnh trước/sau sửa chữa, đính kèm chung, giấy tờ bổ trợ.';

-- ---------------------------------------------------------------------
-- 4.2.4  Thông báo
-- ---------------------------------------------------------------------
CREATE TYPE notification_channel_t AS ENUM ('in_app', 'web_push', 'email', 'zalo', 'telegram', 'sms');
COMMENT ON TYPE notification_channel_t IS 'Kênh gửi thông báo.';

CREATE TYPE delivery_status_t AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped');
COMMENT ON TYPE delivery_status_t IS 'Trạng thái gửi qua một kênh: queued, sending, sent, delivered, failed (hết lượt thử), skipped (người nhận tắt kênh/giờ yên tĩnh).';

CREATE TYPE priority_t AS ENUM ('low', 'normal', 'high', 'urgent');
COMMENT ON TYPE priority_t IS 'Mức ưu tiên thông báo.';

-- ---------------------------------------------------------------------
-- 4.2.5  Nhà & phòng
-- ---------------------------------------------------------------------
CREATE TYPE room_type_t AS ENUM ('bedroom', 'common', 'chapel', 'kitchen', 'storage', 'laundry', 'stairs', 'corridor', 'other');
COMMENT ON TYPE room_type_t IS 'Loại phòng (khớp FE RoomType): bedroom=phòng ngủ, common=sinh hoạt chung, chapel=nhà nguyện, kitchen=bếp, storage=kho, laundry=khu giặt phơi, stairs=cầu thang, corridor=hành lang, other=khác.';

CREATE TYPE room_status_t AS ENUM ('active', 'maintenance', 'reserved');
COMMENT ON TYPE room_status_t IS 'Trạng thái phòng: active=sử dụng, maintenance=đang bảo trì (không xếp người), reserved=giữ chỗ.';

-- ---------------------------------------------------------------------
-- 4.2.6  Tài chính
-- ---------------------------------------------------------------------
CREATE TYPE fund_type_t AS ENUM ('cash', 'bank', 'event', 'reserve');
COMMENT ON TYPE fund_type_t IS 'Loại túi quỹ: cash=tiền mặt, bank=tài khoản ngân hàng, event=quỹ riêng cho sự kiện, reserve=quỹ dự phòng.';

CREATE TYPE ledger_direction_t AS ENUM ('in', 'out');
COMMENT ON TYPE ledger_direction_t IS 'Chiều bút toán sổ cái: in=thu vào, out=chi ra. Số tiền luôn dương; chiều quyết định dấu.';

CREATE TYPE ledger_source_t AS ENUM ('contribution', 'expense', 'transfer', 'adjustment', 'opening_balance', 'reversal', 'donation', 'refund');
COMMENT ON TYPE ledger_source_t IS 'Nguồn phát sinh bút toán: thu quỹ, chi, chuyển quỹ, điều chỉnh, số dư đầu, đảo bút toán, quyên góp, hoàn tiền.';

CREATE TYPE period_status_t AS ENUM ('open', 'pending_confirmation', 'closed');
COMMENT ON TYPE period_status_t IS 'Kỳ tài chính tháng: open=đang ghi sổ, pending_confirmation=Thủ quỹ đã chốt chờ Trưởng nhà xác nhận (đóng băng), closed=đã chốt sổ (khóa).';

CREATE TYPE expense_status_t AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'paid', 'cancelled', 'reversed');
COMMENT ON TYPE expense_status_t IS 'Phiếu chi: draft=nháp, pending_approval=Chờ duyệt, approved=Đã duyệt, rejected=Từ chối, paid=đã chi (có bút toán), cancelled=hủy trước khi chi, reversed=đã đảo sau khi chi.';

CREATE TYPE approval_decision_t AS ENUM ('approved', 'rejected');
COMMENT ON TYPE approval_decision_t IS 'Quyết định của một người duyệt.';

CREATE TYPE payment_method_t AS ENUM ('cash', 'bank_transfer', 'e_wallet', 'other');
COMMENT ON TYPE payment_method_t IS 'Phương thức thanh toán: tiền mặt, chuyển khoản, ví điện tử, khác.';

CREATE TYPE fee_type_t AS ENUM ('monthly_dues', 'event_fee', 'donation', 'deposit', 'other');
COMMENT ON TYPE fee_type_t IS 'Loại khoản thu: quỹ sinh hoạt hàng tháng, phí sự kiện, quyên góp, đặt cọc, khác.';

CREATE TYPE plan_status_t AS ENUM ('draft', 'active', 'closed', 'cancelled');
COMMENT ON TYPE plan_status_t IS 'Trạng thái kế hoạch thu quỹ.';

CREATE TYPE contribution_status_t AS ENUM ('unpaid', 'partial', 'paid', 'waived', 'cancelled');
COMMENT ON TYPE contribution_status_t IS 'Khoản phải thu của một thành viên: unpaid=Chưa đóng, partial=đóng một phần, paid=Đã đóng, waived=miễn, cancelled=hủy (thành viên rời/đổi kỳ). "Quá hạn" là trạng thái tính từ due_date, không lưu.';

CREATE TYPE recon_match_t AS ENUM ('unmatched', 'matched', 'ignored');
COMMENT ON TYPE recon_match_t IS 'Đối soát dòng sao kê: chưa khớp, đã khớp bút toán sổ cái, bỏ qua (có lý do).';

-- ---------------------------------------------------------------------
-- 4.2.7  Trực nhật & vệ sinh
-- ---------------------------------------------------------------------
CREATE TYPE roster_status_t AS ENUM ('draft', 'published', 'closed');
COMMENT ON TYPE roster_status_t IS 'Roster tuần: draft=đang soạn, published=đã công bố (thành viên thấy), closed=đã khóa sau tuần.';

CREATE TYPE duty_status_t AS ENUM ('scheduled', 'checked_in', 'approved', 'rework_required', 'missed', 'cancelled', 'excused');
COMMENT ON TYPE duty_status_t IS 'Ca trực: scheduled=Chờ thực hiện (FE pending), checked_in=Đã check-in (submitted), approved=Đạt yêu cầu, rework_required=Cần làm lại (rejected), missed=Bỏ ca, cancelled=hủy ca, excused=vắng có phép.';

CREATE TYPE review_decision_t AS ENUM ('approved', 'rework');
COMMENT ON TYPE review_decision_t IS 'Kết quả nghiệm thu: approved=đạt, rework=cần làm lại.';

CREATE TYPE appeal_status_t AS ENUM ('open', 'upheld', 'dismissed', 'withdrawn');
COMMENT ON TYPE appeal_status_t IS 'Khiếu nại kết quả nghiệm thu: open=đang chờ, upheld=chấp nhận (đổi thành đạt), dismissed=bác bỏ, withdrawn=rút.';

CREATE TYPE swap_status_t AS ENUM ('pending_peer', 'pending_admin', 'approved', 'rejected', 'cancelled', 'expired');
COMMENT ON TYPE swap_status_t IS 'Đổi ca 3 bước: pending_peer=chờ người nhận xác nhận, pending_admin=chờ Ban điều hành duyệt, approved, rejected, cancelled=người xin rút, expired=quá hạn.';

-- ---------------------------------------------------------------------
-- 4.2.8  Học tập
-- ---------------------------------------------------------------------
CREATE TYPE record_status_t AS ENUM ('draft', 'submitted', 'verified', 'rejected');
COMMENT ON TYPE record_status_t IS 'Bảng điểm một học kỳ: draft=thành viên đang nhập, submitted=đã nộp kèm minh chứng, verified=đã xác minh, rejected=minh chứng không hợp lệ (trả về sửa).';

CREATE TYPE tutoring_status_t AS ENUM ('open', 'matched', 'closed', 'cancelled');
COMMENT ON TYPE tutoring_status_t IS 'Trạng thái lời đề nghị kèm/yêu cầu được kèm: open, matched=đã ghép cặp, closed=hoàn tất/đóng, cancelled=hủy.';

CREATE TYPE match_status_t AS ENUM ('proposed', 'active', 'completed', 'declined', 'cancelled');
COMMENT ON TYPE match_status_t IS 'Ghép cặp phụ đạo: proposed=đề xuất chờ hai bên đồng ý, active=đang kèm, completed, declined=từ chối, cancelled.';

-- ---------------------------------------------------------------------
-- 4.2.9  Sự kiện, điểm danh, đơn xin phép, biểu quyết
-- ---------------------------------------------------------------------
CREATE TYPE event_status_t AS ENUM ('draft', 'scheduled', 'ongoing', 'completed', 'cancelled');
COMMENT ON TYPE event_status_t IS 'Trạng thái sự kiện: draft=nháp, scheduled=đã lên lịch, ongoing=đang diễn ra, completed=đã xong, cancelled=hủy.';

CREATE TYPE attendance_status_t AS ENUM ('present', 'late', 'absent', 'excused');
COMMENT ON TYPE attendance_status_t IS 'Điểm danh: present=Có mặt, late=Đi muộn, absent=Vắng không phép, excused=Vắng có phép (đơn xin phép được duyệt).';

CREATE TYPE attendance_method_t AS ENUM ('qr', 'manual', 'self', 'import');
COMMENT ON TYPE attendance_method_t IS 'Cách ghi nhận: qr=quét QR xoay vòng, manual=người có quyền điểm danh hộ, self=tự bấm (sự kiện không dùng QR), import=nhập từ file.';

CREATE TYPE leave_kind_t AS ENUM ('event_absence', 'late_return', 'overnight_out', 'long_leave');
COMMENT ON TYPE leave_kind_t IS 'Loại đơn xin phép: vắng một sự kiện, về muộn quá giờ giới nghiêm, ngủ ngoài, tạm vắng dài ngày.';

CREATE TYPE leave_status_t AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
COMMENT ON TYPE leave_status_t IS 'Đơn xin phép: chờ duyệt, đã duyệt, từ chối, người xin hủy.';

CREATE TYPE recurrence_freq_t AS ENUM ('weekly', 'monthly');
COMMENT ON TYPE recurrence_freq_t IS 'Tần suất lặp của sự kiện định kỳ.';

CREATE TYPE poll_status_t AS ENUM ('draft', 'open', 'closed');
COMMENT ON TYPE poll_status_t IS 'Khảo sát/biểu quyết: draft, open=đang nhận phiếu, closed=đã đóng (không nhận thêm).';

-- ---------------------------------------------------------------------
-- 4.2.10  Cơ sở vật chất & báo hỏng
-- ---------------------------------------------------------------------
CREATE TYPE urgency_t AS ENUM ('low', 'medium', 'high', 'critical');
COMMENT ON TYPE urgency_t IS 'Mức khẩn của sự cố: low=Thấp [đề xuất thêm], medium=Trung bình (SLA 48h), high=Gấp (trong ngày), critical=Khẩn cấp (ngay).';

CREATE TYPE issue_status_t AS ENUM ('new', 'in_progress', 'waiting_parts', 'done', 'cancelled', 'duplicate');
COMMENT ON TYPE issue_status_t IS 'Sự cố: new=Mới tiếp nhận, in_progress=Đang xử lý, waiting_parts=chờ vật tư/thợ, done=Đã xong, cancelled=hủy, duplicate=trùng sự cố khác.';

CREATE TYPE asset_status_t AS ENUM ('in_service', 'under_repair', 'retired', 'lost');
COMMENT ON TYPE asset_status_t IS 'Tài sản: đang dùng, đang sửa, thanh lý, thất lạc.';

CREATE TYPE loan_status_t AS ENUM ('open', 'returned', 'lost');
COMMENT ON TYPE loan_status_t IS 'Mượn đồ: open=đang mượn (quá hạn tính từ due_at), returned=đã trả, lost=thất lạc.';

-- ---------------------------------------------------------------------
-- 4.2.11  Cộng đoàn: thông báo, diễn đàn, cầu nguyện, khoảnh khắc, giặt, bếp
-- ---------------------------------------------------------------------
CREATE TYPE announce_status_t AS ENUM ('draft', 'published', 'archived');
COMMENT ON TYPE announce_status_t IS 'Thông báo: draft, published, archived.';

CREATE TYPE content_status_t AS ENUM ('published', 'hidden', 'locked');
COMMENT ON TYPE content_status_t IS 'Nội dung người dùng tạo (bài diễn đàn, bình luận, ý cầu nguyện, ảnh): published=hiển thị, hidden=bị ẩn bởi kiểm duyệt, locked=khóa bình luận.';

CREATE TYPE laundry_status_t AS ENUM ('booked', 'checked_in', 'completed', 'cancelled', 'no_show');
COMMENT ON TYPE laundry_status_t IS 'Lượt giặt: booked=đã đặt, checked_in=đã bắt đầu, completed=xong, cancelled=hủy, no_show=không đến (tự hủy).';

CREATE TYPE meal_type_t AS ENUM ('lunch', 'dinner');
COMMENT ON TYPE meal_type_t IS 'Bữa ăn: lunch=trưa, dinner=tối.';

-- ---------------------------------------------------------------------
-- 4.2.12  AI
-- ---------------------------------------------------------------------
CREATE TYPE ai_job_status_t AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'blocked');
COMMENT ON TYPE ai_job_status_t IS 'Tác vụ AI: queued, running, succeeded, failed, cancelled, blocked=bị chặn trước khi gọi (chưa đồng ý, vượt ngân sách, dữ liệu cấm gửi ra ngoài).';

CREATE TYPE ai_suggestion_status_t AS ENUM ('pending', 'accepted', 'rejected', 'expired');
COMMENT ON TYPE ai_suggestion_status_t IS 'Gợi ý của AI: pending=chờ người duyệt, accepted=người đã chấp nhận, rejected=người từ chối, expired=hết hạn không ai xử lý. KHÔNG có trạng thái tự áp dụng (human-in-the-loop).';
