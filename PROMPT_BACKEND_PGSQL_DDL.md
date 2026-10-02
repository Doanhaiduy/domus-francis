# MASTER PROMPT: THIẾT KẾ TOÀN DIỆN BACKEND & BỘ POSTGRESQL DDL HOÀN CHỈNH CHO LƯU XÁ PHANXICÔ

> **HƯỚNG DẪN DÀNH CHO NGƯỜI DÙNG:**
> Copy toàn bộ nội dung trong file này và gửi cho AI (Claude 3.5 Sonnet, GPT-4o, DeepSeek V3, v.v.) kèm theo mã nguồn dự án Next.js hiện tại của bạn. Prompt đã được thiết kế chuyên sâu để AI phân tích toàn bộ UI/UX, nghiệp vụ, và xuất ra **DUY NHẤT 1 FILE THIẾT KẾ TOÀN DIỆN** (Architecture Plan + Database Schema + PostgreSQL DDL + Indexes + Triggers + RLS + Storage Pipeline + API Contracts) mà không bị cắt vụn hay bỏ sót.

---

```markdown
# SYSTEM ROLE & CONTEXT
Bạn là một **Principal Backend Architect, Lead Database Engineer (PostgreSQL Specialist) & Security Architect** có hơn 15 năm kinh nghiệm thiết kế hệ thống quản trị cộng đoàn quy mô vừa và lớn (Community & Student Dormitory Management Systems).

Tôi đang phát triển dự án **"Hệ Thống Quản Lý Lưu Xá Phanxicô"** (Lưu xá sinh viên Công giáo). Hiện tại, toàn bộ giao diện Frontend đã hoàn thiện 100% bằng **Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons, Headless UI**. Dữ liệu mẫu tạm thời đang chạy qua React Context Store (`src/lib/store.tsx`) và Mock Data (`src/lib/mockData.ts`).

---

# MỤC TIÊU CỐT LÕI CỦA BẠN (CORE OBJECTIVE)
Nhiệm vụ của bạn là **đánh giá toàn diện kiến trúc nghiệp vụ, luồng dữ liệu của Frontend hiện tại**, sau đó lập một **BẢN THIẾT KẾ HỆ THỐNG BACKEND TOÀN DIỆN VÀ BỘ POSTGRESQL DDL HOÀN CHỈNH**.

⚠️ **YÊU CẦU ĐẶC BIỆT QUAN TRỌNG VỀ ĐỊNH DẠNG ĐẦU RA:**
1. **DUY NHẤT 1 TÀI LIỆU DUY NHẤT (ALL-IN-ONE SINGLE FILE):** Tất cả nội dung (Kiến trúc, Sơ đồ ERD, Bộ DDL PostgreSQL hoàn chỉnh từ A-Z, Indexes, Triggers, RLS, Storage Upload, Danh sách API RESTful) **BẮT BUỘC phải nằm gọn trong DUY NHẤT 1 FILE**, KHÔNG ĐƯỢC tách thành 2 file hay nhiều phần rời rạc.
2. **DẠNG BẢN VẼ / THIẾT KẾ KẾ HOẠCH TOÀN DIỆN (COMPREHENSIVE PLAN & BLUEPRINT):** Chưa bắt đầu viết mã nguồn code backend (Node.js/Go/Python), mà tập trung đưa ra **bản thiết kế chuẩn mực, chi tiết và chính xác đến từng dòng lệnh DDL SQL**, để sau này bất kỳ lập trình viên Backend nào cũng có thể bám sát triển khai 100% chuẩn xác mà không cần hỏi lại.
3. **KHÔNG ĐƯỢC DÙNG PLACEHOLDER CẮT BỚT:** Tuyệt đối KHÔNG viết tắt như `-- TODO: thêm các bảng còn lại`, `-- tương tự cho các trường khác`. Mọi bảng, mọi trường dữ liệu, mọi ràng buộc khóa ngoại, enum, index đều phải được viết đầy đủ tường minh 100%.

---

# DANH SÁCH CÁC PHÂN HỆ NGHIỆP VỤ CẦN MAPPING ĐẦY ĐỦ TỪ FRONTEND

Hệ thống bao gồm 12 phân hệ nghiệp vụ chính mà Backend & Database cần hỗ trợ:

### 1. Xác thực & Phân quyền Vai trò (Auth & RBAC):
- Hệ thống vai trò phân cấp 5 cấp bậc:
  - `Admin`: Toàn quyền hệ thống, cấu hình cơ sở hạ tầng.
  - `Trưởng nhà`: Quản trị nhân sự, duyệt đơn, ký xuất quỹ, kiểm duyệt báo cáo, phê duyệt trực nhật.
  - `Phó nhà`: Hỗ trợ quản lý, điểm danh, phân công việc, quản lý lịch sự kiện.
  - `Thủ quỹ`: Quản trị sổ quỹ, ghi chép thu/chi, đối soát hóa đơn chứng từ, quản lý ma trận đóng tiền 12 tháng.
  - `Thành viên`: Sinh viên cư trú tại lưu xá, xem thông tin cá nhân, check-in dọn vệ sinh, nhập điểm số, báo hỏng, bỏ phiếu biểu quyết, đặt lịch giặt đồ.
- Đăng nhập qua Email / Số điện thoại + Mật khẩu mã hóa (Argon2id / bcrypt), hỗ trợ JWT Access Token & Refresh Token xoay vòng (Token Rotation).

### 2. Hồ sơ Thành viên & Đời sống Công giáo (Members & Catholic Life - `/thanh-vien`):
- Thông tin hành chính: Họ tên, Tên thường gọi, Ngày sinh, Giới tính, CMND/CCCD, Quê quán, Địa chỉ thường trú.
- Thông tin học tập: Trường Đại học/Cao đẳng, Chuyên ngành, Niên khóa, Mã số sinh viên.
- Thông tin gia đình: Họ tên Cha, Họ tên Mẹ, Số điện thoại phụ huynh liên lạc khẩn cấp.
- **Hồ sơ Công giáo đặc thù:**
  - Tên Thánh (Holy Name: Phanxicô, Giuse, Phaolô, Têrêsa...).
  - Giáo phận (Diocese), Giáo xứ gốc (Parish), Linh mục quản xứ (Pastor).
  - Các Bí tích đã lãnh nhận: Rửa tội, Thêm sức, Thánh Thể...
- Trách vụ tại lưu xá, ngày gia nhập lưu xá, phòng lưu trú hiện tại.
- **Ảnh chân dung / Avatar thành viên:** Hỗ trợ tải tệp ảnh trực tiếp từ máy (Local Upload / Cloud Storage).

### 3. Cấu trúc Nhà & Phòng Lưu trú (House Architecture & Floorplan - `/so-do-nha`):
- Sơ đồ cố định (Fixed Floorplan Layout) gồm nhiều Tầng (Floors: Tầng 1, Tầng 2, Tầng 3, Sân thượng) và các Phòng (Rooms: P.101, P.102, P.201, v.v.).
- Thuộc tính phòng: Tên phòng, Tầng, Loại phòng (Phòng ngủ, Phòng sinh hoạt, Nhà nguyện, Bếp, Khu giặt), Sức chứa tối đa (Capacity), Tiện ích (điều hòa, quạt, bàn học, ban công), Tọa độ hiển thị trên Canvas.
- Lịch sử phân phòng: Lưu vết việc xếp phòng và chuyển phòng của sinh viên theo từng kỳ học.

### 4. Quản lý Hậu cần, Trực nhật & Dọn vệ sinh (`/hau-can`):
- **6 Khu vực vệ sinh trọng điểm:**
  1. Gian bếp & Bàn ăn
  2. Cầu thang & Hành lang
  3. Nhà tắm & WC
  4. Nguyện đường & Phòng sinh hoạt chung
  5. Sân thượng & Khu giặt phơi
  6. Cổng chính & Sân trước
- Lịch phân công hàng tuần (Roster) theo ngày trong tuần (Thứ 2 đến Chúa Nhật) và ca trực.
- Trạng thái ca trực: `Chờ thực hiện`, `Đã check-in`, `Đạt yêu cầu`, `Cần làm lại`, `Bỏ ca`.
- **Luồng Check-in thực tế với ảnh minh chứng:**
  - Danh mục kiểm tra 4 tiêu chí bắt buộc (Lau sàn sạch bóng, Đổ rác đúng nơi, Cọ rửa bồn/thiết bị, Bổ sung vật tư).
  - **Tải ảnh chụp minh chứng từ thiết bị (Local Device File Upload):** Thành viên chụp ảnh hiện trường sau khi dọn xong tải lên hệ thống.
  - Ghi chú tình trạng phát sinh.
- **Quy trình Nghiệm thu & Phê duyệt:** Trưởng nhà / Phó nhà kiểm tra thực tế, chấm điểm nghiệm thu, đánh giá `Đạt` hoặc `Yêu cầu làm lại`, ghi chú phản hồi.
- **Quy trình Đổi ca trực (Duty Swap):** Thành viên gửi yêu cầu xin đổi ca tới thành viên khác, người nhận xác nhận, quản trị viên phê duyệt.

### 5. Quản trị Học tập & Bảng điểm Sinh viên (`/hoc-tap`):
- Quản lý kết quả học tập theo từng Học kỳ & Năm học (VD: Học kỳ 1 (2025 - 2026)).
- Danh sách môn học trong kỳ: Tên môn học, Số tín chỉ, Điểm kiểm tra / Quá trình / Giữa kỳ (hệ 10), Điểm thi Cuối kỳ (hệ 10).
- Tự động tính toán: Điểm tổng kết học phần (hệ 10), Điểm chữ (A, B+, B, C, D, F), Điểm GPA học phần (hệ 4.0), Trạng thái Đạt / Nợ môn.
- Tính toán GPA trung bình học kỳ và GPA tích lũy toàn khóa, Xếp loại học lực (Xuất sắc, Giỏi, Khá, Trung bình, Yếu).
- **Minh chứng bảng điểm (EVD - Transcript Evidence):** Tải ảnh chụp màn hình bảng điểm từ cổng thông tin đào tạo (Portal sinh viên) hoặc giấy xác nhận từ máy tính/điện thoại.
- Nguyện vọng / Mục tiêu học tập, Khó khăn gặp phải.
- Cờ phụ đạo môn học (`isTutoringEligible` - sinh viên có thể phụ đạo giúp đỡ anh em khác), Cờ học bổng (`hasScholarship`).

### 6. Quản lý Lịch sự kiện, Điểm danh & Biểu quyết (`/lich-su-kien`):
- Sự kiện & Hoạt động: Tiêu đề, Phân loại (`Họp nhà`, `Phụng vụ`, `Lễ Bổn mạng`, `Dã ngoại`, `Sinh hoạt`), Thời gian bắt đầu/kết thúc, Địa điểm, Ban tổ chức, Nội dung chi tiết.
- Lịch định kỳ (Recurring rules: Hàng tuần, Hàng tháng).
- **Điểm danh sự kiện (Event Attendance):**
  - Điểm danh bằng mã QR Token (thời gian sống ngắn hạn, chống gian lận).
  - Điểm danh thủ công 1 chạm do Trưởng nhà / Phó nhà thực hiện.
  - Thống kê tỷ lệ tham gia của từng thành viên.
- **Hệ thống Khảo sát & Bỏ phiếu (Event Polls / Voting):**
  - Tạo cuộc bình chọn gắn liền với sự kiện hoặc độc lập.
  - Câu hỏi, danh sách lựa chọn (Poll Options), cờ cho phép chọn nhiều phương án (`isMultiSelect`).
  - Ghi nhận lượt bỏ phiếu của thành viên, hiển thị tỷ lệ % trực quan thời gian thực.

### 7. Sổ Quỹ Thu - Chi & Ma Trận Đóng Quỹ Minh Bạch (`/thu-chi`):
- Quản lý số dư quỹ tiền mặt và tài khoản ngân hàng của lưu xá.
- **Sổ Ghi Chi (Expense Vouchers):**
  - Tên khoản chi, Số tiền, Danh mục (`Thực phẩm`, `Điện nước`, `Vệ sinh`, `Sửa chữa`, `Phụng vụ`, `Khác`), Ngày chi, Người chi tiền, Ghi chú.
  - Trạng thái phê duyệt: `Chờ duyệt`, `Đã duyệt`, `Từ chối`.
  - **Ảnh chụp hóa đơn / Biên lai thanh toán (Receipt Image Upload):** Tải ảnh biên lai, hóa đơn đỏ hoặc ảnh chụp giao dịch ngân hàng từ thiết bị.
- **Ma trận Quỹ tháng (Monthly Member Contributions):**
  - Theo dõi tình trạng nộp tiền quỹ lưu xá 12 tháng trong năm cho từng thành viên.
  - Hạn nộp, số tiền quy định mỗi tháng, trạng thái `Đã đóng` / `Chưa đóng`, ngày thanh toán thực tế, phương thức nộp.
- Báo cáo thu chi tháng, quý, năm và nhật ký kiểm toán (Audit Trail) chống thất thoát.

### 8. Quản lý Cơ sở Vật chất & Báo hỏng Thiết bị (`/hau-can`, `ReportIssueModal`):
- Tiếp nhận phiếu báo hỏng: Tên sự cố, Khu vực / Vị trí hỏng hóc, Người báo hỏng, Mức độ khẩn cấp (`Trung bình`, `Gấp`, `Khẩn cấp`), Mô tả hiện trạng.
- **Ảnh chụp hiện trường sự cố:** Tải ảnh chụp trực tiếp từ máy tính/điện thoại mô tả chỗ hỏng hóc.
- Tiến độ xử lý: `Mới tiếp nhận`, `Đang xử lý`, `Đã xong`.
- Phân công người sửa chữa (nội bộ sinh viên hoặc thợ ngoài), Chi phí sửa chữa phát sinh (tự động liên kết tạo đề xuất chi vào sổ quỹ).

### 9. Thư viện Khoảnh khắc & Album Hoạt động (`/khoanh-khac`):
- Album ảnh: Tên album, Mô tả, Chuyên mục (`Sinh hoạt`, `Phụng vụ`, `Dã ngoại`, `Bếp núc`, `Thể thao`, `Học tập`), Ngày chụp, Địa điểm, Gắn thẻ thành viên tham gia (Participant tags).
- **Ảnh bìa Album (Cover Photo):** Tải ảnh trực tiếp từ thiết bị.
- **Danh sách ảnh trong Album (Multi-Photo Batch Upload):**
  - Tải lên hàng loạt ảnh từ máy tính (Multi-file upload).
  - Từng ảnh có URL lưu trữ, chú thích (caption), người đăng, ngày giờ, số lượt thả tim/yêu thích (likes count).

### 10. Bảng tin Thông báo, Diễn đàn & Đời sống Tâm linh:
- **Thông báo Cộng đoàn (`/thong-bao`):** Tiêu đề, Chuyên mục (`Quan trọng`, `Sự kiện`, `Chung`), Nội dung, Người đăng, Trạng thái Ghim đầu trang (`isPinned`), Đính kèm tài liệu, Theo dõi đã đọc/chưa đọc của từng thành viên.
- **Diễn đàn Thảo luận (`/dien-dan`):** Bài viết, Chuyên mục, Tác giả, Nội dung, Danh sách bình luận trả lời (Replies), Thả tim bài viết.
- **Ý chỉ Cầu nguyện (`/loi-nguyen`):** Người xin ý chỉ, Nội dung cầu nguyện, Cờ ẩn danh (`isAnonymous`), Bộ đếm hiệp ý cầu nguyện (`prayerCount`).
- **Đặt lịch Máy giặt (`/hau-can`):** Phân chia máy giặt, các khung giờ cố định (06:00 - 22:00), thành viên đặt lịch giữ chỗ tránh trùng lặp.

### 11. Kiến trúc Lưu trữ Tệp tin (Object Storage & File Upload Pipeline):
- Xây dựng giải pháp lưu trữ ảnh tệp từ máy (S3 / Cloudflare R2 / Supabase Storage / MinIO).
- Cơ chế tạo Presigned Upload URL hoặc Multipart Upload API Route an toàn.
- Cấu trúc thư mục / Bucket:
  - `/avatars`: Ảnh chân dung thành viên
  - `/receipts`: Ảnh hóa đơn thanh toán thu chi
  - `/cleaning-evidence`: Ảnh minh chứng hoàn thành dọn vệ sinh
  - `/academic-evidence`: Ảnh chứng chỉ, bảng điểm học tập
  - `/maintenance`: Ảnh hiện trường thiết bị hỏng hóc
  - `/moments`: Ảnh kỷ niệm theo album
- Giới hạn kích thước tệp, whitelist MIME Types (`image/jpeg`, `image/png`, `image/webp`), nén ảnh WebP tự động, phân phối qua CDN.

---

# CẤU TRÚC BẮT BUỘC CỦA BẢN THIẾT KẾ DUY NHẤT (THE ALL-IN-ONE OUTPUT TEMPLATE)

Bản thiết kế của bạn **BẮT BUỘC PHẢI CHỨA ĐỦ 7 PHẦN** sau đây trong **DUY NHẤT 1 FILE**:

## PHẦN 1: TỔNG QUAN HỆ THỐNG & TECH STACK ĐỀ XUẤT
- Phân tích kiến trúc tổng thể (Monolith Clean Architecture hoặc Modular Microservices).
- Đề xuất Tech Stack hoàn chỉnh:
  - Runtime & Framework (VD: Node.js/NestJS hoặc Go/Gin hoặc FastAPI hoặc Next.js Route Handlers).
  - Database: **PostgreSQL 16+** (Native Features, Constraints, RLS, Generated Columns).
  - ORM / Query Builder: Prisma / Drizzle ORM / Kysely.
  - Caching & Message Queue: Redis (cho QR code tokens, session store, notification queue).
  - Object Storage: S3-compatible (Cloudflare R2 / AWS S3 / Supabase Storage / MinIO).
- Chiến lược xác thực & bảo mật (JWT + HttpOnly Cookies, RBAC Guards, Helmet, Rate Limiter).

## PHẦN 2: SƠ ĐỒ THỰC THỂ LIÊN KẾT (ERD) & DATA MODELING
- Sơ đồ quan hệ thực thể toàn diện bằng cú pháp **Mermaid (`erDiagram`)**.
- Phân tích chi tiết các mối quan hệ (1-1, 1-N, N-N), giải quyết các bảng nối trung gian (`junction tables`).
- Quy ước đặt tên (Naming Conventions): snake_case cho database columns, singular/plural table names, chuẩn ISO cho datetime `TIMESTAMPTZ`.

## PHẦN 3: BỘ SCRIPT DDL POSTGRESQL 16 HOÀN CHỈNH & SẴN SÀNG TRIỂN KHAI (PRODUCTION-READY DDL)
*Đây là phần quan trọng nhất - Cung cấp toàn bộ script SQL có thể copy chạy trực tiếp trên PostgreSQL:*
1. **Extensions:** `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`, `citext`, `pg_trgm`, `pgcrypto`.
2. **Custom ENUM Types:** Khởi tạo tất cả các kiểu liệt kê:
   - `user_role_enum`, `gender_enum`, `cleaning_status_enum`, `issue_urgency_enum`, `issue_status_enum`, `expense_category_enum`, `expense_status_enum`, `contribution_status_enum`, `event_category_enum`, `moment_category_enum`, `letter_grade_enum`, v.v.
3. **Các bảng dữ liệu (`CREATE TABLE`):**
   - Đầy đủ khóa chính (`UUID DEFAULT uuid_generate_v4()`).
   - Khóa ngoại với hành vi toàn vẹn dữ liệu cụ thể (`ON DELETE CASCADE`, `ON DELETE SET NULL`, `ON DELETE RESTRICT`).
   - Ràng buộc dữ liệu nghiêm ngặt (`CHECK (amount >= 0)`, `CHECK (credits > 0)`, `CHECK (score >= 0 AND score <= 10)`).
   - Giá trị mặc định và `NOT NULL` logic hợp lý.
   - Các trường dấu vết: `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `deleted_at TIMESTAMPTZ NULL` (hỗ trợ Soft Delete khi cần).
4. **Hệ thống Indexes (Tối ưu hóa hiệu năng truy vấn):**
   - B-tree Indexes trên tất cả Foreign Keys.
   - Composite Unique Indexes (VD: Đảm bảo 1 sinh viên trong 1 học kỳ chỉ có 1 bản ghi của 1 môn học cụ thể; hoặc 1 thành viên chỉ có 1 bản ghi đóng quỹ cho 1 tháng trong năm).
   - Partial Indexes (VD: lọc nhanh các khoản chi chưa duyệt, ca trực chưa hoàn thành).
   - GIN Indexes cho tìm kiếm toàn văn hoặc mảng Tags / Sacraments.
5. **Database Functions & Triggers:**
   - Function & Trigger tự động cập nhật `updated_at` mỗi khi bản ghi thay đổi.
   - Function & Trigger tự động tính toán Điểm tổng kết hệ 10, Điểm chữ và Điểm hệ 4.0 khi nhập điểm giữa kỳ và cuối kỳ.
   - Function & Trigger tự động tính toán số dư quỹ tức thời khi phiếu chi được duyệt.
6. **Chính sách Row-Level Security (RLS) của PostgreSQL:**
   - Kích hoạt `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
   - Các chính sách RLS phân định rõ ràng quyền của `Admin/Trưởng nhà` (Full Access), `Thủ quỹ` (Manage Finance), và `Thành viên` (Chỉ xem và sửa dữ liệu của chính mình).

## PHẦN 4: THIẾT KẾ HỆ THỐNG LƯU TRỮ TỆP TIN & QUY TRÌNH UPLOAD ẢNH (OBJECT STORAGE SPECIFICATION)
- Cơ chế Upload trực tiếp an toàn từ trình duyệt/máy tính lên Storage (Presigned URL Workflow).
- Đặc tả cấu trúc thư mục, đặt tên tệp (`UUID` + timestamp tránh trùng lặp, bảo mật).
- Quy tắc kiểm tra tính hợp lệ: Kích thước tối đa, định dạng MIME được phép, quét mã độc, tự động tạo thumbnail.
- Thiết kế bảng `storage_files` / `media_attachments` để quản lý metadata của tất cả các ảnh được tải lên từ máy.

## PHẦN 5: ĐẶC TẢ DANH SÁCH RESTFUL API ENDPOINTS (API CONTRACTS)
- Liệt kê đầy đủ các endpoint theo chuẩn RESTful cho toàn bộ 12 phân hệ:
  - Phương thức HTTP (GET, POST, PUT, PATCH, DELETE).
  - Đường dẫn Endpoint (VD: `/api/v1/cleaning-duties/:id/check-in`).
  - Yêu cầu xác thực & Vai trò tối thiểu (`Auth Guard & RBAC Requirement`).
  - Request Body Schema (DTO) chi tiết.
  - Success Response & Error Response Codes (200, 201, 400, 401, 403, 404, 500).

## PHẦN 6: KẾ HOẠCH BẢO MẬT, SAO LƯU & GIÁM SÁT DỮ LIỆU
- Chiến lược bảo vệ dữ liệu nhạy cảm (mật khẩu phụ huynh, số CMND, thông tin cá nhân).
- Chiến lược sao lưu tự động hàng ngày (Automated Backup & Point-in-time Recovery).
- Nhật ký kiểm toán hoạt động (Audit Logging table) ghi lại lịch sử thay đổi tài chính và phân công nhà.

## PHẦN 7: LỘ TRÌNH TRIỂN KHAI BACKEND TỪNG BƯỚC (IMPLEMENTATION ROADMAP)
- Giai đoạn 1: Khởi tạo CSDL PostgreSQL, chạy toàn bộ bộ DDL và Seeds dữ liệu mẫu ban đầu từ `src/lib/mockData.ts`.
- Giai đoạn 2: Xây dựng Module Auth, Storage Service và User Management.
- Giai đoạn 3: Triển khai các Module nghiệp vụ trọng tâm (Hậu cần/Vệ sinh, Học tập/Điểm số, Thu chi quỹ).
- Giai đoạn 4: Triển khai Lịch sự kiện, Điểm danh QR, Khảo sát biểu quyết, Album khoảnh khắc.
- Giai đoạn 5: Tích hợp Frontend Next.js hiện tại thay thế Mock Store bằng API Client / React Query / SWR.

---

# HÃY BẮT ĐẦU TRIỂN KHAI NGAY:
Bây giờ, hãy đóng vai Principal Backend & Lead Database Architect, nghiên cứu toàn bộ mô hình trên và xuất ra **BẢN THIẾT KẾ TOÀN DIỆN VÀ BỘ DDL POSTGRESQL HOÀN CHỈNH TRONG DUY NHẤT 1 TÀI LIỆU DUY NHẤT**. Hãy viết thật chi tiết, chuyên nghiệp và đầy đủ 100%!
```
