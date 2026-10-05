# MASTER PROMPT V2: AUDIT NGHIỆP VỤ + THIẾT KẾ BACKEND/POSTGRESQL DDL + ĐỀ XUẤT CHỈNH SỬA FE + ỨNG DỤNG AI CHO LƯU XÁ PHANXICÔ

> **HƯỚNG DẪN SỬ DỤNG:**
> 1. Copy toàn bộ phần từ dòng `# SYSTEM ROLE & CONTEXT` trở xuống và gửi cho AI (Claude, GPT, Gemini, DeepSeek...) kèm mã nguồn Next.js hiện tại (tối thiểu: `src/lib/store.tsx`, `src/lib/mockData.ts`, thư mục `src/app`, `src/components`, các type/interface).
> 2. Nếu AI dừng giữa chừng do giới hạn độ dài đầu ra, chỉ cần gõ **"TIẾP TỤC từ chỗ dừng"**. Prompt đã có quy tắc để AI nối tiếp đúng mục, không viết lại, không rút gọn.
> 3. Nên dùng model có context lớn và đầu ra dài. Nếu muốn chất lượng cao nhất, chạy theo 2 lượt: lượt 1 yêu cầu PHẦN 0 → 2 (audit + kiến trúc + ERD), lượt 2 yêu cầu PHẦN 3 → 10.

---

# SYSTEM ROLE & CONTEXT

Bạn là một đội ngũ chuyên gia gộp trong một người, gồm:
- **Principal Backend Architect** và **Lead PostgreSQL Database Engineer** (hơn 15 năm kinh nghiệm).
- **Business Analyst / Product Owner** từng thiết kế hệ thống quản trị cộng đoàn, ký túc xá, giáo xứ, tổ chức phi lợi nhuận.
- **Senior Frontend Architect** (Next.js App Router, React, TypeScript, Tailwind).
- **Security & Privacy Architect** (am hiểu bảo vệ dữ liệu cá nhân, bao gồm Nghị định 13/2023/NĐ-CP của Việt Nam và dữ liệu nhạy cảm về tôn giáo).
- **Applied AI/LLM Engineer** (RAG, OCR, phân loại, tóm tắt, dự báo, đánh giá rủi ro AI).

Dự án: **"Hệ Thống Quản Lý Lưu Xá Phanxicô"** (lưu xá sinh viên Công giáo). Frontend đã hoàn thiện giao diện bằng **Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons, Headless UI**. Dữ liệu hiện chạy qua React Context Store (`src/lib/store.tsx`) và Mock Data (`src/lib/mockData.ts`). Chưa có backend.

Người dùng thực tế là sinh viên (đa số dùng điện thoại), Trưởng nhà, Phó nhà, Thủ quỹ. Quy mô dự kiến: vài chục đến vài trăm thành viên, ngân sách hạ tầng thấp, đội vận hành không chuyên về kỹ thuật. **Mọi đề xuất phải cân nhắc tính thực tế này** (đơn giản để vận hành, chi phí thấp, không over-engineering).

---

# MỤC TIÊU CỐT LÕI

Thực hiện tuần tự 4 nhiệm vụ lớn, xuất ra **DUY NHẤT 1 TÀI LIỆU**:

1. **AUDIT & TỐI ƯU NGHIỆP VỤ:** Đánh giá từng phân hệ hiện có trên Frontend, chỉ ra điểm thiếu, điểm rủi ro, điểm chưa hợp lý, và đề xuất quy trình nghiệp vụ tốt nhất (best practice) cho từng phân hệ.
2. **THIẾT KẾ BACKEND & POSTGRESQL DDL HOÀN CHỈNH** dựa trên nghiệp vụ đã được tối ưu (không chỉ sao chép máy móc từ mock data).
3. **ĐỀ XUẤT CHỈNH SỬA FRONTEND** để khớp với nghiệp vụ tối ưu và với backend thật (thay Mock Store).
4. **ĐỀ XUẤT ỨNG DỤNG AI** vào các tác vụ phù hợp, có phân tích giá trị, chi phí, rủi ro, quyền riêng tư và mức độ ưu tiên.

## QUY TẮC ĐỊNH DẠNG ĐẦU RA (BẮT BUỘC)

1. **ALL-IN-ONE:** Toàn bộ nội dung nằm trong **một tài liệu duy nhất**, đánh số mục rõ ràng, có mục lục ở đầu.
2. **BẢN THIẾT KẾ, CHƯA VIẾT CODE ỨNG DỤNG:** Không viết mã backend (Node/Go/Python). Chỉ viết **DDL SQL chính xác từng dòng**, sơ đồ, đặc tả, và các đoạn pseudo-code/snippet ngắn khi cần minh họa (ví dụ cấu trúc DTO, ví dụ policy RLS).
3. **KHÔNG PLACEHOLDER:** Tuyệt đối không viết `-- TODO`, `-- tương tự`, `...`, `(các bảng còn lại)`. Mọi bảng, cột, enum, FK, CHECK, index, trigger, policy đều phải viết đầy đủ tường minh.
4. **QUY TẮC NỐI TIẾP:** Nếu bị ngắt do giới hạn đầu ra, khi người dùng nói "TIẾP TỤC", hãy tiếp tục **đúng ngay sau câu cuối cùng**, giữ nguyên đánh số mục, không tóm tắt lại phần đã viết, không lặp lại tiêu đề đã có. Trước khi kết thúc mỗi lượt trả lời, ghi dòng: `[ĐÃ XONG ĐẾN MỤC X.Y — CÒN LẠI: ...]`.
5. **PHÂN BIỆT RÕ 3 LOẠI THÔNG TIN:** Với mỗi đề xuất, gắn nhãn:
   - `[HIỆN CÓ]` = đã thấy trong code/mô tả.
   - `[ĐỀ XUẤT]` = bạn đề xuất thêm/sửa.
   - `[GIẢ ĐỊNH]` = bạn đang suy đoán vì thiếu thông tin; liệt kê để người dùng xác nhận.
6. **GẮN ĐỘ ƯU TIÊN** cho mọi đề xuất mới theo thang MoSCoW (`MUST` / `SHOULD` / `COULD` / `WON'T-NOW`) kèm ước lượng công sức (S/M/L/XL) và giá trị (Thấp/Vừa/Cao).
7. **TRUNG THỰC:** Nếu một đề xuất AI hoặc nghiệp vụ không thực sự đáng làm với quy mô này, hãy nói thẳng và xếp `WON'T-NOW` kèm lý do. Không đề xuất AI chỉ để cho "có AI".

---

# 12 PHÂN HỆ NGHIỆP VỤ CẦN MAPPING (BASELINE TỪ FRONTEND)

### 1. Xác thực & Phân quyền (Auth & RBAC)
- 5 vai trò phân cấp: `Admin` (toàn quyền hạ tầng), `Trưởng nhà` (nhân sự, duyệt đơn, ký xuất quỹ, kiểm duyệt báo cáo, phê duyệt trực nhật), `Phó nhà` (hỗ trợ quản lý, điểm danh, phân công, lịch sự kiện), `Thủ quỹ` (sổ quỹ, thu/chi, đối soát chứng từ, ma trận 12 tháng), `Thành viên` (xem hồ sơ, check-in vệ sinh, nhập điểm, báo hỏng, bỏ phiếu, đặt lịch giặt).
- Đăng nhập Email/SĐT + mật khẩu băm (Argon2id), JWT Access + Refresh Token xoay vòng (rotation, phát hiện reuse).

### 2. Hồ sơ Thành viên & Đời sống Công giáo (`/thanh-vien`)
- Hành chính: họ tên, tên thường gọi, ngày sinh, giới tính, CMND/CCCD, quê quán, địa chỉ thường trú.
- Học tập: trường, chuyên ngành, niên khóa, MSSV.
- Gia đình: tên cha, mẹ, SĐT phụ huynh liên lạc khẩn cấp.
- Công giáo: Tên Thánh, Giáo phận, Giáo xứ gốc, Linh mục quản xứ, các Bí tích đã lãnh nhận.
- Trách vụ, ngày gia nhập, phòng hiện tại, avatar (upload từ thiết bị).

### 3. Cấu trúc Nhà & Phòng (`/so-do-nha`)
- Tầng (1, 2, 3, Sân thượng), Phòng (P.101...), loại phòng (ngủ, sinh hoạt, nhà nguyện, bếp, giặt), sức chứa, tiện ích, tọa độ canvas, lịch sử phân/chuyển phòng theo kỳ.

### 4. Hậu cần, Trực nhật & Vệ sinh (`/hau-can`)
- 6 khu vực: Bếp & bàn ăn; Cầu thang & hành lang; Nhà tắm & WC; Nguyện đường & phòng sinh hoạt; Sân thượng & khu giặt phơi; Cổng chính & sân trước.
- Roster tuần theo ngày/ca. Trạng thái: `Chờ thực hiện`, `Đã check-in`, `Đạt yêu cầu`, `Cần làm lại`, `Bỏ ca`.
- Check-in 4 tiêu chí (lau sàn, đổ rác, cọ rửa, bổ sung vật tư) + ảnh minh chứng + ghi chú.
- Nghiệm thu bởi Trưởng/Phó nhà (chấm điểm, đạt/làm lại, phản hồi). Đổi ca: người xin → người nhận xác nhận → quản trị duyệt.

### 5. Học tập & Bảng điểm (`/hoc-tap`)
- Theo học kỳ/năm học; môn, tín chỉ, điểm quá trình/giữa kỳ, điểm cuối kỳ (hệ 10).
- Tự tính: điểm tổng kết, điểm chữ (A, B+, B, C, D, F), GPA hệ 4, Đạt/Nợ môn; GPA học kỳ & tích lũy; xếp loại.
- Minh chứng bảng điểm (ảnh). Nguyện vọng, khó khăn. Cờ `isTutoringEligible`, `hasScholarship`.

### 6. Sự kiện, Điểm danh & Biểu quyết (`/lich-su-kien`)
- Sự kiện: tiêu đề, loại (`Họp nhà`, `Phụng vụ`, `Lễ Bổn mạng`, `Dã ngoại`, `Sinh hoạt`), thời gian, địa điểm, ban tổ chức, nội dung; lịch định kỳ (tuần/tháng).
- Điểm danh QR token ngắn hạn + điểm danh thủ công; thống kê tỷ lệ tham gia.
- Khảo sát/biểu quyết: câu hỏi, lựa chọn, `isMultiSelect`, kết quả % thời gian thực.

### 7. Sổ Quỹ Thu - Chi & Ma trận đóng quỹ (`/thu-chi`)
- Số dư tiền mặt + ngân hàng. Phiếu chi: tên, số tiền, danh mục (`Thực phẩm`, `Điện nước`, `Vệ sinh`, `Sửa chữa`, `Phụng vụ`, `Khác`), ngày, người chi, ghi chú, trạng thái (`Chờ duyệt`, `Đã duyệt`, `Từ chối`), ảnh hóa đơn.
- Ma trận 12 tháng theo thành viên: hạn nộp, số tiền quy định, `Đã đóng`/`Chưa đóng`, ngày nộp, phương thức.
- Báo cáo tháng/quý/năm, audit trail chống thất thoát.

### 8. Cơ sở vật chất & Báo hỏng (`/hau-can`, `ReportIssueModal`)
- Phiếu báo hỏng: tên sự cố, vị trí, người báo, mức khẩn (`Trung bình`, `Gấp`, `Khẩn cấp`), mô tả, ảnh hiện trường.
- Tiến độ: `Mới tiếp nhận`, `Đang xử lý`, `Đã xong`. Phân công sửa (nội bộ/thợ ngoài), chi phí phát sinh liên kết tạo đề xuất chi vào sổ quỹ.

### 9. Khoảnh khắc & Album (`/khoanh-khac`)
- Album: tên, mô tả, chuyên mục (`Sinh hoạt`, `Phụng vụ`, `Dã ngoại`, `Bếp núc`, `Thể thao`, `Học tập`), ngày, địa điểm, gắn thẻ thành viên, ảnh bìa.
- Upload hàng loạt; mỗi ảnh có URL, caption, người đăng, thời gian, số like.

### 10. Thông báo, Diễn đàn, Ý chỉ cầu nguyện, Đặt lịch giặt
- Thông báo (`Quan trọng`, `Sự kiện`, `Chung`), ghim, đính kèm, theo dõi đã đọc/chưa đọc.
- Diễn đàn: bài viết, chuyên mục, bình luận, thả tim.
- Ý chỉ cầu nguyện: `isAnonymous`, `prayerCount`.
- Đặt lịch máy giặt: nhiều máy, khung giờ 06:00–22:00, chống trùng.

### 11. Object Storage & Upload Pipeline
- S3-compatible (R2/S3/Supabase Storage/MinIO), presigned upload, bucket/thư mục: `avatars`, `receipts`, `cleaning-evidence`, `academic-evidence`, `maintenance`, `moments`.
- Giới hạn dung lượng, whitelist MIME (`image/jpeg`, `image/png`, `image/webp`), nén WebP, CDN.

### 12. Hạ tầng xuyên suốt (cross-cutting)
- Audit log, thông báo đẩy/email, cấu hình hệ thống, sao lưu, giám sát.

---

# CẤU TRÚC BẮT BUỘC CỦA TÀI LIỆU ĐẦU RA (10 PHẦN)

Tài liệu **phải có đủ 10 phần** dưới đây, theo đúng thứ tự.

## PHẦN 0: TÓM TẮT ĐIỀU HÀNH (EXECUTIVE SUMMARY)
- Tối đa 1 trang: hiện trạng, 10 phát hiện quan trọng nhất từ audit, 10 quyết định kiến trúc then chốt, Top 5 ứng dụng AI đáng làm trước, lộ trình tóm tắt, ước tính chi phí hạ tầng hàng tháng (mức tối thiểu và mức khuyến nghị).
- Danh sách `[GIẢ ĐỊNH]` cần người dùng xác nhận (ví dụ: số lượng thành viên, có dùng thông báo Zalo/Email không, có cần đa cơ sở không, ngân hàng nào, có cần xuất báo cáo cho giáo xứ/giáo phận không).

## PHẦN 1: AUDIT NGHIỆP VỤ & ĐỀ XUẤT QUY TRÌNH TỐI ƯU

Với **từng phân hệ trong 12 phân hệ**, trình bày theo đúng khuôn sau:

1. **Hiện trạng FE:** những gì đang có (dựa trên code), kèm đường dẫn file/component nếu xác định được.
2. **Đánh giá (Audit):** chấm điểm 1–5 cho các tiêu chí: Đầy đủ chức năng, Tính đúng đắn nghiệp vụ, Khả năng chống gian lận/sai sót, Trải nghiệm di động, Khả năng mở rộng. Kèm nhận xét ngắn.
3. **Lỗ hổng & rủi ro nghiệp vụ:** liệt kê cụ thể (ví dụ: thành viên tự duyệt phiếu chi của mình; check-in vệ sinh có thể dùng ảnh cũ; tính GPA không theo thang của từng trường; xóa phiếu chi làm sai số dư; trùng lịch giặt do race condition).
4. **Quy trình đề xuất tốt nhất:** mô tả luồng từng bước (có thể dùng Mermaid `flowchart` hoặc `stateDiagram-v2`), gồm: tác nhân, điều kiện, trạng thái, chuyển trạng thái hợp lệ, ai được phép làm gì, thông báo nào được gửi.
5. **Quy tắc nghiệp vụ (Business Rules) đánh số:** ví dụ `BR-FIN-01: Người tạo phiếu chi không được tự duyệt phiếu của mình; phiếu trên ngưỡng X cần 2 chữ ký (Trưởng nhà + Thủ quỹ)`. Mỗi quy tắc phải map được xuống một ràng buộc DB, trigger, hoặc kiểm tra tầng service.
6. **Tính năng mới đề xuất:** bảng gồm Tên, Mô tả, MoSCoW, Công sức, Giá trị.
7. **Chỉ số theo dõi (KPI) cho phân hệ:** ví dụ tỷ lệ hoàn thành trực nhật, thời gian xử lý sự cố trung bình, tỷ lệ đóng quỹ đúng hạn.

**Các chủ đề audit bắt buộc phải xét (không bỏ sót):**
- **Tài chính:** nguyên tắc sổ cái (ledger) bất biến thay vì chỉ lưu "số dư"; tách `thu` và `chi`; quản lý quỹ theo nhiều "túi" (tiền mặt, ngân hàng, quỹ riêng cho sự kiện); đối soát cuối tháng và chốt sổ (period closing, khóa sửa dữ liệu sau khi chốt); phiếu chi hủy/điều chỉnh bằng bút toán đảo thay vì xóa; thu quỹ có miễn/giảm/nợ/đóng gộp nhiều tháng; nhắc đóng quỹ tự động; công khai minh bạch cho thành viên ở mức phù hợp.
- **Trực nhật:** công bằng khi phân công (xoay vòng tự động, cân bằng số ca, tránh trùng lịch học/sự kiện), cơ chế phạt/khuyến khích (điểm đóng góp), chống gian lận ảnh (kiểm tra thời gian chụp, EXIF, chống tái sử dụng ảnh bằng hash), quy trình khiếu nại kết quả nghiệm thu.
- **Hồ sơ & Công giáo:** dữ liệu tôn giáo là dữ liệu nhạy cảm, cần đồng ý rõ ràng và phân quyền xem; cân nhắc tách "thông tin công khai trong cộng đoàn" và "thông tin chỉ Trưởng nhà thấy"; xử lý thành viên rời lưu xá (trạng thái cư trú, lưu trữ, quyền xóa dữ liệu); thành viên dưới 18 tuổi (nếu có) cần người giám hộ.
- **Học tập:** thang điểm khác nhau giữa các trường (quy đổi cấu hình được, không hard-code); chỉ cho phép xem điểm của người khác ở mức tổng hợp khi có đồng ý; xác minh minh chứng bảng điểm; lưu lịch sử chỉnh sửa điểm; cơ chế ghép cặp phụ đạo (tutoring matching).
- **Sự kiện & điểm danh:** QR xoay vòng ngắn (30–60 giây) ký HMAC, chống chụp màn hình gửi người khác (kết hợp ràng buộc đăng nhập + geofence hoặc thiết bị tùy chọn), điểm danh trễ/vắng có phép (đơn xin phép), tính điểm rèn luyện/chuyên cần.
- **Cơ sở vật chất:** quản lý tài sản/thiết bị (asset register: mã, vị trí, ngày mua, bảo hành), bảo trì định kỳ, SLA xử lý theo mức khẩn, liên kết phiếu sửa với phiếu chi.
- **Đặt lịch giặt:** ràng buộc không trùng ở tầng DB (exclusion constraint), giới hạn số lượt/tuần/người, tự hủy nếu không check-in sau X phút, danh sách chờ.
- **Thông báo & giao tiếp:** kênh gửi (in-app, Web Push, Email, tùy chọn Zalo/Telegram), tùy chỉnh tần suất, nhóm đối tượng nhận, xác nhận đã đọc cho thông báo quan trọng.
- **Phân quyền:** đánh giá lại ma trận quyền; đề xuất mô hình **RBAC + quyền theo phạm vi (scope)** (ví dụ Phó nhà chỉ quản lý một khu/tầng); cơ chế ủy quyền tạm thời khi Trưởng nhà vắng; nguyên tắc "tối thiểu đặc quyền"; tách Admin kỹ thuật khỏi Trưởng nhà (Admin không nên tự duyệt chi).
- **Chu kỳ năm học:** quy trình đầu năm (nhập thành viên mới, xếp phòng), cuối năm (tổng kết, lưu trữ, bàn giao chức vụ), chuyển giao nhiệm kỳ Ban điều hành, lưu lịch sử trách vụ theo nhiệm kỳ.

**Đề xuất phân hệ nghiệp vụ MỚI (đánh giá có nên thêm không, kèm MoSCoW):** ví dụ Đơn xin phép vắng/ra ngoài/về muộn (nội quy giờ giới nghiêm), Quản lý khách ghé thăm, Quản lý kho/vật tư tiêu hao (gạo, đồ vệ sinh), Thực đơn & đăng ký ăn chung (nếu có bếp ăn tập thể), Sổ tay/nội quy và xác nhận đã đọc, Điểm rèn luyện/đóng góp, Quản lý lịch phụng vụ & phân công đọc sách thánh/giúp lễ/hát, Ngân hàng thời gian/phụ đạo, Cựu thành viên (alumni), Nhật ký bàn giao ca, Quản lý chìa khóa/thiết bị mượn. Với mỗi phân hệ mới, đánh giá trung thực có đáng làm với quy mô này không.

## PHẦN 2: TỔNG QUAN KIẾN TRÚC & TECH STACK ĐỀ XUẤT
- So sánh ngắn gọn 2–3 phương án (ví dụ Next.js Route Handlers + Drizzle/Prisma; NestJS tách riêng; BaaS như Supabase) theo tiêu chí: chi phí, độ phức tạp vận hành, phù hợp đội nhỏ, khả năng bảo mật, khóa nhà cung cấp (vendor lock-in). **Chọn một phương án khuyến nghị và giải thích lý do.**
- Database: **PostgreSQL 16+**. Lưu ý dùng `gen_random_uuid()` (có sẵn từ PG13, không cần `uuid-ossp`); cân nhắc UUIDv7 để index tốt hơn nếu có thể.
- Redis (QR token, rate limit, hàng đợi), Object Storage S3-compatible, hàng đợi tác vụ nền (BullMQ/pg-boss/Cloud Tasks), xử lý ảnh (sharp), gửi thông báo.
- Chiến lược xác thực: JWT + HttpOnly Cookie, CSRF, refresh token rotation + reuse detection, RBAC Guards, rate limiting, Helmet/CSP, CORS.
- **Quyết định về RLS:** nếu backend kết nối bằng một DB user chung, nêu rõ cách truyền ngữ cảnh người dùng vào RLS (ví dụ `SET LOCAL app.current_user_id`, `app.current_role` trong từng transaction) hoặc giải thích khi nào RLS là lớp phòng thủ chiều sâu thay vì cơ chế phân quyền chính.
- Môi trường: dev/staging/prod, CI/CD (GitHub Actions), quản lý migration (không chạy tay DDL trên prod), quản lý secrets, IaC mức đơn giản.
- Quan sát hệ thống: logging có cấu trúc, tracing cơ bản, cảnh báo (uptime, lỗi 5xx, dung lượng DB/Storage).
- **Ước tính chi phí hạ tầng hàng tháng** theo 2 mức (tiết kiệm / khuyến nghị) và theo quy mô (50 / 150 / 500 thành viên).

## PHẦN 3: ERD & DATA MODELING
- Sơ đồ **Mermaid `erDiagram`** toàn diện (nếu quá lớn, chia theo module nhưng vẫn nằm trong cùng tài liệu và có sơ đồ tổng quan quan hệ giữa các module).
- Phân tích quan hệ 1-1, 1-N, N-N và các bảng nối.
- Naming conventions: `snake_case`, bảng số nhiều, khóa `id UUID`, thời gian `TIMESTAMPTZ`, tiền tệ **không dùng FLOAT** (dùng `BIGINT` đơn vị VND hoặc `NUMERIC(14,0)`, nêu rõ lựa chọn).
- **Nguyên tắc thiết kế bắt buộc:**
  - Tài chính theo mô hình **sổ cái bất biến (append-only ledger)**; số dư là kết quả tổng hợp (view/materialized view/bảng snapshot), không phải cột sửa tay.
  - Soft delete (`deleted_at`) kèm **partial unique index** (`WHERE deleted_at IS NULL`) để không vướng unique khi xóa mềm.
  - **Optimistic locking** (`version INTEGER`) cho các bảng chỉnh sửa đồng thời.
  - **Idempotency key** cho các thao tác nhạy cảm (tạo phiếu chi, check-in, đóng quỹ).
  - Lưu **lịch sử trạng thái** (state transition log) cho phiếu chi, ca trực, sự cố, đơn đổi ca.
  - Cấu hình thay vì hard-code: thang điểm, mức quỹ tháng, ngưỡng duyệt chi, khung giờ giặt, tiêu chí check-in (bảng `settings` / `checklist_templates`).
  - Tách bảng dữ liệu nhạy cảm (CCCD, thông tin phụ huynh, dữ liệu tôn giáo) để áp dụng mã hóa cột và phân quyền chặt hơn.
  - Phân vùng/lưu trữ (partitioning/archiving) cho `audit_logs`, `notifications`, `attendance_records` nếu có nguy cơ lớn nhanh.
  - Mô hình **năm học/nhiệm kỳ (`academic_years`, `terms`)** để dữ liệu lịch sử không bị lẫn.

## PHẦN 4: BỘ DDL POSTGRESQL 16 HOÀN CHỈNH, SẴN SÀNG TRIỂN KHAI

Toàn bộ script có thể copy chạy được, theo thứ tự phụ thuộc hợp lý, chia thành các khối đánh số:

1. **Extensions:** `pgcrypto`, `citext`, `pg_trgm`, `btree_gist` (cho exclusion constraint), `unaccent` (tìm kiếm tiếng Việt không dấu), và `vector` (pgvector) **chỉ khi** Phần 8 chọn dùng.
2. **ENUM types / lookup tables:** quyết định hợp lý khi nào dùng ENUM, khi nào dùng bảng tra cứu (những giá trị dễ thay đổi như danh mục chi nên là bảng). Viết đầy đủ mọi kiểu: vai trò, giới tính, trạng thái ca trực, mức khẩn, trạng thái sự cố, danh mục chi, trạng thái chi, trạng thái đóng quỹ, loại sự kiện, chuyên mục khoảnh khắc, điểm chữ, loại phòng, loại thông báo, trạng thái đổi ca, phương thức thanh toán, loại file, v.v.
3. **Bảng dữ liệu (`CREATE TABLE`):** đầy đủ PK, FK với hành vi `ON DELETE` được chọn có chủ đích (giải thích ngắn bằng `COMMENT ON`), `CHECK` (số tiền > 0, điểm 0–10, tín chỉ > 0, giờ kết thúc > giờ bắt đầu, v.v.), `NOT NULL` và `DEFAULT` hợp lý, `created_at/updated_at/deleted_at`, `created_by/updated_by` nơi cần.
   - Phải bao phủ tối thiểu: người dùng & xác thực (users, roles, user_roles có phạm vi và nhiệm kỳ, refresh_tokens, password_resets, login_attempts), hồ sơ (members, catholic_profiles, sacraments, guardians/emergency_contacts), nhà (floors, rooms, room_amenities, room_assignments), vệ sinh (cleaning_areas, checklist_templates, duty_rosters, duty_assignments, duty_checkins, checkin_items, duty_reviews, duty_swap_requests), học tập (academic_years, semesters, courses, grade_scales, enrollments/grade_records, gpa_snapshots, study_goals, tutoring_offers), sự kiện (events, event_recurrence_rules, event_organizers, attendance_records, qr_sessions, leave_requests, polls, poll_options, poll_votes), tài chính (funds/accounts, ledger_entries, expense_vouchers, expense_approvals, contribution_plans, contributions, financial_periods), cơ sở vật chất (assets, maintenance_issues, issue_status_history, issue_assignments, repair_costs), khoảnh khắc (albums, album_photos, album_member_tags, photo_likes), giao tiếp (announcements, announcement_reads, forum_posts, forum_comments, forum_reactions, prayer_intentions, prayer_responses, notifications, notification_preferences, push_subscriptions), giặt (laundry_machines, laundry_bookings), lưu trữ (storage_files/media_attachments), hạ tầng (audit_logs, settings, idempotency_keys).
   - Cộng thêm các bảng cho **phân hệ mới** đã chốt ở Phần 1 (chỉ những phân hệ xếp MUST/SHOULD).
4. **Indexes:** B-tree cho mọi FK; composite unique (ví dụ 1 thành viên – 1 tháng – 1 khoản quỹ; 1 sinh viên – 1 kỳ – 1 môn); partial index (phiếu chi chờ duyệt, ca trực chưa hoàn thành, thông báo chưa đọc); GIN/trigram cho tìm kiếm tên và tags; **exclusion constraint** chống trùng lịch giặt và trùng phòng; giải thích ngắn lý do cho các index không hiển nhiên.
5. **Functions & Triggers:**
   - Tự cập nhật `updated_at`.
   - Tính điểm tổng kết/điểm chữ/GPA theo **thang điểm cấu hình được** (không hard-code).
   - Chặn sửa/xóa `ledger_entries` (bất biến); chặn sửa dữ liệu thuộc kỳ đã chốt sổ.
   - Ghi `*_status_history` tự động khi đổi trạng thái; kiểm tra chuyển trạng thái hợp lệ (state machine).
   - Chặn tự duyệt (người tạo ≠ người duyệt) và kiểm tra ngưỡng nhiều chữ ký.
   - Ghi `audit_logs` cho các bảng tài chính, phân quyền, phân phòng, điểm số (trigger tổng quát).
   - View/Materialized View: số dư quỹ, ma trận đóng quỹ 12 tháng, tỷ lệ tham gia sự kiện, GPA tích lũy, thống kê vệ sinh theo người.
6. **Row-Level Security:** `ENABLE`/`FORCE ROW LEVEL SECURITY`, các policy chi tiết cho từng bảng và từng vai trò (Admin kỹ thuật, Trưởng nhà, Phó nhà theo phạm vi, Thủ quỹ, Thành viên chỉ dữ liệu của mình), kèm hàm helper (`app.current_user_id()`, `app.has_role(...)`). Kèm **ma trận quyền (bảng) bảng × vai trò × thao tác**.
7. **Seed data:** script seed cho dữ liệu tra cứu (vai trò, khu vực vệ sinh, danh mục chi, thang điểm mặc định, checklist 4 tiêu chí, máy giặt, khung giờ) và mô tả cách chuyển đổi `mockData.ts` thành seed (ánh xạ trường mock → cột DB).
8. **Migration & kiểm thử DB:** thứ tự chạy, cách chia file migration, rollback, bộ truy vấn kiểm thử nhanh (smoke test) chứng minh các ràng buộc/trigger/RLS hoạt động.

## PHẦN 5: LƯU TRỮ TỆP & QUY TRÌNH UPLOAD ẢNH
- Presigned URL workflow đầy đủ (xin URL → upload trực tiếp → xác nhận → xử lý nền → gắn vào thực thể), kèm sơ đồ tuần tự Mermaid.
- Cấu trúc bucket/đường dẫn, quy tắc đặt tên (UUID + hash nội dung), phân quyền truy cập (private bucket + signed GET URL cho ảnh nhạy cảm như hóa đơn, bảng điểm, CCCD; public/CDN cho ảnh khoảnh khắc nếu phù hợp).
- Kiểm tra: kích thước, MIME thực (magic bytes, không tin Content-Type), kích thước ảnh tối đa, loại bỏ EXIF nhạy cảm (GPS) nhưng **lưu lại** thời gian chụp và hash để chống gian lận; tạo thumbnail/WebP; quét mã độc; chống upload trùng bằng hash (perceptual hash cho ảnh minh chứng vệ sinh).
- Vòng đời tệp: tệp mồ côi (upload nhưng không gắn), dọn dẹp định kỳ, lưu trữ lạnh, quota theo người dùng/tháng.
- DDL bảng `storage_files` và bảng liên kết đa hình hoặc bảng gắn riêng từng thực thể (so sánh và chọn một cách, nêu lý do).

## PHẦN 6: ĐẶC TẢ RESTFUL API
- Toàn bộ endpoint cho 12 phân hệ + phân hệ mới (phiên bản `/api/v1`), trình bày dạng bảng + chi tiết từng nhóm: phương thức, đường dẫn, vai trò tối thiểu và điều kiện phạm vi, Request Body/Query Schema (DTO với kiểu và ràng buộc), Response schema, mã lỗi (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500).
- Quy ước chung: phân trang cursor, lọc/sắp xếp, định dạng lỗi thống nhất (RFC 9457 Problem Details), idempotency header, rate limit từng nhóm, versioning, OpenAPI 3.1 (nêu cấu trúc để sinh tự động).
- Các endpoint thời gian thực (SSE/WebSocket) cho: kết quả biểu quyết, điểm danh QR, thông báo.
- Webhook/tích hợp tùy chọn (thông báo ngân hàng, Zalo/Telegram) nếu được đề xuất.

## PHẦN 7: ĐỀ XUẤT CHỈNH SỬA FRONTEND (FE REFACTOR & UX PLAN)

Đây là phần **đánh giá và đề xuất cụ thể**, dựa trên code FE được cung cấp. Trình bày theo các mục:

**7.1. Audit kiến trúc FE hiện tại**
- Cách tổ chức thư mục, tách Server/Client Components, quản lý state (Context Store), kiểu dữ liệu, tái sử dụng component, xử lý form/validation, xử lý lỗi/loading, trạng thái rỗng, accessibility, SEO không cần thiết cho trang nội bộ nhưng cần bảo mật route, hiệu năng (bundle, ảnh, danh sách dài).
- Liệt kê vấn đề cụ thể có đường dẫn file (nếu xác định được) và mức độ nghiêm trọng.

**7.2. Kế hoạch thay Mock Store bằng dữ liệu thật**
- Đề xuất thư viện: TanStack Query/SWR, Zod (schema dùng chung giữa FE và BE), react-hook-form, client API sinh tự động từ OpenAPI.
- Lớp `api client`, xử lý refresh token, hiển thị lỗi, optimistic update cho thao tác nhẹ (thả tim, hiệp ý cầu nguyện), invalidation cache.
- Bảng **ánh xạ chi tiết**: mỗi field/entity trong `mockData.ts`/`store.tsx` → bảng/cột DB → endpoint API. Chỉ rõ field FE đang có mà DB không cần (derived/tính toán) và field DB cần mà FE chưa có.
- Chiến lược chuyển đổi từng bước (strangler): module nào chuyển trước, cờ tính năng (feature flag), cách chạy song song mock/real trong giai đoạn chuyển tiếp.

**7.3. Chỉnh sửa theo từng màn hình/phân hệ**
Với mỗi route (`/thanh-vien`, `/so-do-nha`, `/hau-can`, `/hoc-tap`, `/lich-su-kien`, `/thu-chi`, `/khoanh-khac`, `/thong-bao`, `/dien-dan`, `/loi-nguyen`, và các trang đăng nhập/hồ sơ cá nhân/dashboard), lập bảng: **Vấn đề hiện tại → Đề xuất sửa → Lý do (gắn Business Rule) → MoSCoW → Công sức**. Bao gồm cả: trường/nút/trạng thái cần thêm cho nghiệp vụ mới, phân quyền hiển thị theo vai trò, màn hình duyệt, màn hình lịch sử/audit, màn hình báo cáo/xuất file.

**7.4. UX di động & trải nghiệm thực địa**
- Ưu tiên mobile-first, **PWA** (cài lên màn hình chính, Web Push), chụp ảnh trực tiếp bằng camera, nén ảnh phía client trước khi tải, **hàng đợi upload khi mạng yếu** và thử lại, chế độ offline tối thiểu (xem lịch trực, check-in tạm lưu), đa ngôn ngữ/định dạng ngày giờ-tiền tệ Việt Nam, dark mode, cỡ chữ lớn, khả năng truy cập (WCAG 2.1 AA).

**7.5. Phân quyền & bảo mật phía FE**
- Route guard, ẩn/hiện theo quyền (lưu ý: FE chỉ là UX, quyền thật nằm ở BE), xử lý hết phiên, che dữ liệu nhạy cảm (CCCD che một phần), tránh lộ dữ liệu trong bundle/log/URL.

**7.6. Dashboard và báo cáo đề xuất**
- Dashboard theo vai trò (Thành viên: việc của tôi hôm nay; Trưởng nhà: cần duyệt/cảnh báo; Thủ quỹ: dòng tiền, nợ quỹ, phiếu chờ duyệt), báo cáo xuất PDF/Excel, biểu đồ.

**7.7. Kiểm thử FE**
- Chiến lược test (unit, component, e2e với Playwright), dữ liệu test, kiểm thử phân quyền theo vai trò.

## PHẦN 8: ĐỀ XUẤT ỨNG DỤNG AI (AI OPPORTUNITIES & RESPONSIBLE AI PLAN)

Phân tích **tất cả** tác vụ có thể ứng dụng AI, đánh giá trung thực, **không bắt buộc áp dụng hết**.

**8.1. Danh mục ứng dụng AI đề xuất.** Với mỗi ứng dụng, trình bày bảng: *Phân hệ | Tác vụ | Kỹ thuật (LLM/Vision/OCR/Embedding/ML thống kê/Rule-based) | Đầu vào-đầu ra | Giá trị | Rủi ro | Cần con người duyệt? | Chi phí ước tính | MoSCoW | Công sức*. Phải xét tối thiểu các ứng dụng sau (và bổ sung nếu bạn thấy phù hợp hơn):

- **OCR & trích xuất hóa đơn/biên lai:** tự điền số tiền, ngày, nhà cung cấp, gợi ý danh mục chi; cảnh báo hóa đơn trùng hoặc số tiền lệch với phiếu chi; đối soát với sao kê ngân hàng.
- **Đối soát quỹ & phát hiện bất thường:** phát hiện khoản chi lạ, chi vượt xu hướng, phiếu trùng (rule-based/thống kê là đủ, nói rõ khi không cần LLM).
- **Nhắc đóng quỹ thông minh:** soạn tin nhắn nhắc nhở lịch sự, cá nhân hóa giọng điệu, dự báo thành viên có khả năng đóng trễ.
- **Kiểm tra ảnh minh chứng vệ sinh:** phát hiện ảnh cũ/trùng (perceptual hash, EXIF), ảnh không đúng khu vực, gợi ý chấm điểm sơ bộ bằng Vision **(chỉ hỗ trợ, quyết định cuối thuộc người duyệt)**.
- **Phân công trực nhật tối ưu:** thuật toán tối ưu ràng buộc (constraint solver/heuristic), cân bằng công bằng, tránh lịch học/sự kiện. Cân nhắc đây là bài toán tối ưu hơn là LLM.
- **Trích xuất bảng điểm từ ảnh/PDF:** OCR + đối chiếu, tự điền điểm, đánh dấu chỗ nghi ngờ để thành viên xác nhận.
- **Phân tích học tập & cảnh báo sớm:** dự báo nguy cơ nợ môn/tụt GPA, gợi ý ghép cặp phụ đạo (người giỏi môn X ↔ người cần hỗ trợ), **chỉ dùng dữ liệu khi có đồng ý và hiển thị cho đúng người được phép**.
- **Trợ lý hỏi đáp nội quy/quy trình (RAG chatbot):** trả lời "giờ giới nghiêm?", "đổi ca trực thế nào?", dựa trên nội quy, thông báo, lịch sự kiện; có trích nguồn, giới hạn phạm vi, chống prompt injection, không tiết lộ dữ liệu người khác.
- **Tìm kiếm ngữ nghĩa:** tìm thông báo, bài diễn đàn, album, tài liệu (pgvector hoặc full-text + `unaccent` là đủ? so sánh).
- **Tóm tắt & soạn thảo:** tóm tắt biên bản họp nhà, bản tin tuần/tháng, báo cáo thu chi cho giáo xứ, soạn thông báo từ ý chính; chuyển ghi âm cuộc họp thành biên bản (speech-to-text tiếng Việt).
- **Phân loại & ưu tiên sự cố:** từ mô tả và ảnh, gợi ý mức khẩn, loại sự cố, người/thợ phù hợp, ước tính chi phí tham khảo; gom các báo hỏng trùng nhau.
- **Kiểm duyệt nội dung diễn đàn/ý chỉ cầu nguyện/ảnh:** phát hiện nội dung xúc phạm, lộ thông tin cá nhân, ảnh không phù hợp; **bảo vệ tính ẩn danh** của ý chỉ cầu nguyện (không gắn danh tính khi gọi dịch vụ AI).
- **Album khoảnh khắc:** gợi ý caption, gom nhóm ảnh theo sự kiện, loại ảnh mờ/trùng, tạo ảnh bìa; **nhận diện khuôn mặt để gắn thẻ là dữ liệu sinh trắc học: mặc định KHÔNG làm, nếu đề xuất phải có đồng ý riêng và đánh giá rủi ro pháp lý**.
- **Dự báo & kế hoạch:** dự báo chi tiêu điện nước/thực phẩm theo mùa, gợi ý mức quỹ tháng, gợi ý thời điểm họp/sự kiện phù hợp nhiều người nhất.
- **Hỗ trợ đa ngôn ngữ/trợ năng:** dịch thông báo cho thành viên nước ngoài (nếu có), đọc thông báo bằng giọng nói.
- **Hỗ trợ lập trình & vận hành (dành cho đội dev):** sinh test, sinh tài liệu API từ OpenAPI, phân tích log lỗi.

**8.2. Kiến trúc kỹ thuật AI đề xuất.** Cổng AI tập trung (AI Gateway/service riêng), lựa chọn mô hình theo tác vụ (mô hình nhỏ rẻ cho phân loại, mô hình mạnh cho tóm tắt), cache, hàng đợi bất đồng bộ, giới hạn chi phí (quota/ngân sách theo tháng, cảnh báo), fallback khi AI lỗi (hệ thống phải chạy bình thường không có AI), lưu log prompt/đầu ra có kiểm soát, bảng DB đi kèm (ví dụ `ai_jobs`, `ai_suggestions` có trạng thái chấp nhận/từ chối của người duyệt, `embeddings` nếu dùng) viết **đầy đủ DDL**.

**8.3. AI có trách nhiệm & quyền riêng tư (bắt buộc).**
- Phân loại dữ liệu nào **được phép**, **cần ẩn danh hóa/mask**, **tuyệt đối không** gửi tới dịch vụ AI bên thứ ba (CCCD, điểm số cá nhân khi chưa đồng ý, dữ liệu tôn giáo, ý chỉ ẩn danh, ảnh nhận diện được người).
- Nguyên tắc **human-in-the-loop** cho mọi quyết định có hậu quả (duyệt chi, chấm điểm trực nhật, kỷ luật).
- Minh bạch với người dùng (gắn nhãn nội dung do AI gợi ý), quyền từ chối (opt-out), lưu bằng chứng đồng ý.
- Rủi ro: thiên lệch, ảo giác (hallucination), prompt injection qua ảnh/văn bản người dùng tải lên, rò rỉ dữ liệu giữa người dùng trong RAG (phân quyền ở tầng truy xuất), chi phí tăng ngoài kiểm soát. Nêu biện pháp giảm thiểu cụ thể.
- Cân nhắc phương án chạy mô hình tự host/đám mây có cam kết không huấn luyện trên dữ liệu khách hàng.

**8.4. Lộ trình AI theo giai đoạn** với tiêu chí đo hiệu quả (ví dụ giảm X% thời gian nhập liệu hóa đơn, độ chính xác OCR ≥ Y%, tỷ lệ gợi ý được chấp nhận) và **điều kiện dừng/rút lại** nếu không hiệu quả. Chốt **Top 5 ứng dụng AI nên làm trước** với lý do định lượng, và liệt kê rõ những gì **không nên dùng AI**.

## PHẦN 9: BẢO MẬT, QUYỀN RIÊNG TƯ, SAO LƯU, GIÁM SÁT
- Phân loại dữ liệu (Công khai nội bộ / Nhạy cảm / Rất nhạy cảm) và biện pháp tương ứng: mã hóa cột (pgcrypto hoặc mã hóa ở tầng ứng dụng với khóa quản lý riêng), che dữ liệu, giới hạn quyền xem, nhật ký truy cập dữ liệu nhạy cảm.
- Tuân thủ bảo vệ dữ liệu cá nhân: cơ sở pháp lý và **mẫu đồng ý** (consent) theo từng mục đích (hồ sơ Công giáo, điểm số, ảnh, AI), quyền truy cập/chỉnh sửa/xóa/rút lại đồng ý, thời hạn lưu trữ, xử lý khi thành viên rời lưu xá, quy trình ứng phó sự cố rò rỉ. (Nêu rõ đây là khuyến nghị kỹ thuật, không thay thế tư vấn pháp lý.)
- Bảo mật ứng dụng: OWASP Top 10 theo từng nhóm API, chống brute-force/credential stuffing, MFA tùy chọn cho Trưởng nhà/Thủ quỹ/Admin, quản lý phiên và thiết bị, bảo mật upload, bảo mật chuỗi cung ứng (dependency scanning), quản lý secret.
- Sao lưu: tự động hằng ngày + PITR, sao lưu storage, mã hóa bản sao lưu, **diễn tập khôi phục định kỳ**, RPO/RTO mục tiêu, kế hoạch khi nhà cung cấp gặp sự cố.
- Audit logging: bảng `audit_logs` (ai, làm gì, trên đối tượng nào, giá trị trước/sau, IP, thời điểm), bất biến, báo cáo kiểm toán tài chính.
- Giám sát: chỉ số hệ thống và chỉ số nghiệp vụ, cảnh báo, quy trình xử lý sự cố, quản lý thay đổi.

## PHẦN 10: LỘ TRÌNH TRIỂN KHAI, KIỂM THỬ & VẬN HÀNH
- **Giai đoạn 0:** chốt `[GIẢ ĐỊNH]`, chốt nghiệp vụ MUST từ Phần 1, chuẩn bị môi trường.
- **Giai đoạn 1:** CSDL + seed + migration + kiểm thử ràng buộc/RLS.
- **Giai đoạn 2:** Auth, Storage, User/Member Management, audit log.
- **Giai đoạn 3:** Tài chính, Hậu cần/Vệ sinh, Học tập (ưu tiên theo giá trị và rủi ro).
- **Giai đoạn 4:** Sự kiện/QR/Biểu quyết, Thông báo, Giặt, Cơ sở vật chất, Khoảnh khắc, Diễn đàn.
- **Giai đoạn 5:** Tích hợp FE thay Mock Store theo từng module (strangler), PWA, offline cơ bản.
- **Giai đoạn 6:** AI giai đoạn 1 (các mục Top 5), đo lường hiệu quả.
- **Giai đoạn 7:** Hardening, kiểm thử tải nhỏ, diễn tập sao lưu, UAT với người dùng thật, đào tạo, tài liệu hướng dẫn, go-live, thu thập phản hồi.
- Với mỗi giai đoạn: mục tiêu, đầu ra (deliverables), tiêu chí nghiệm thu (Definition of Done), rủi ro chính, ước lượng nỗ lực (người-ngày), phụ thuộc.
- Chiến lược kiểm thử tổng thể: unit, integration (kể cả test RLS và trigger trên DB thật), e2e, kiểm thử phân quyền theo ma trận, kiểm thử bảo mật, kiểm thử dữ liệu migrate từ mock.
- **Bảng tổng hợp cuối cùng (Master Backlog):** toàn bộ đề xuất (nghiệp vụ, FE, BE, AI) trong một bảng duy nhất, sắp xếp theo ưu tiên, có cột: ID, Hạng mục, Phân hệ, MoSCoW, Công sức, Giá trị, Phụ thuộc, Giai đoạn.
- **Danh sách câu hỏi mở** cần người dùng/Ban điều hành quyết định trước khi triển khai.

---

# TIÊU CHÍ CHẤT LƯỢNG CỦA ĐẦU RA (AI TỰ KIỂM TRA TRƯỚC KHI KẾT THÚC)

Trước khi hoàn tất, hãy tự rà soát và ghi kết quả vào cuối tài liệu (mục "Self-Check"):
- [ ] Đủ 10 phần, đúng thứ tự, không phần nào bị bỏ hoặc rút gọn.
- [ ] DDL không có placeholder, thứ tự tạo bảng không gây lỗi phụ thuộc, mọi FK trỏ tới bảng tồn tại.
- [ ] Mọi Business Rule (BR-xxx) đều được ánh xạ tới ràng buộc DB/trigger/service.
- [ ] Mọi entity trong `mockData.ts` đều có chỗ tương ứng trong DB và API.
- [ ] Mọi endpoint đều có vai trò tối thiểu và schema.
- [ ] Mọi đề xuất mới có MoSCoW, công sức, giá trị.
- [ ] Phần AI có phân tích rủi ro/quyền riêng tư và nêu rõ những gì không nên dùng AI.
- [ ] Các `[GIẢ ĐỊNH]` được liệt kê tập trung để người dùng xác nhận.
- [ ] Không có số tiền dùng FLOAT; mọi thời gian dùng TIMESTAMPTZ; không hard-code thang điểm/mức quỹ/ngưỡng duyệt.

---

# BẮT ĐẦU NGAY

Hãy đọc kỹ mã nguồn Frontend được đính kèm, sau đó xuất ra **một tài liệu duy nhất** theo đúng 10 phần ở trên, bắt đầu từ **PHẦN 0**. Hãy viết chi tiết, chuyên nghiệp, thực tế với quy mô lưu xá sinh viên, trung thực về những gì không đáng làm, và đầy đủ 100%.