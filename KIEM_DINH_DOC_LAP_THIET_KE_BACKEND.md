# KIỂM ĐỊNH ĐỘC LẬP — TÀI LIỆU THIẾT KẾ BACKEND & POSTGRESQL DDL, HỆ THỐNG QUẢN LÝ LƯU XÁ PHANXICÔ

| | |
|---|---|
| **Đối tượng kiểm định** | `TAI_LIEU_THIET_KE_BACKEND_PGSQL_LUU_XA_PHANXICO.md` (37.195 dòng, 4,8 MB, 676.818 từ) |
| **Chuẩn đối chiếu** | Prompt gốc `PROMPT_BACKEND_PGSQL_DDL.md` (306 dòng) · Mã nguồn FE `src/` ở commit `740ac5d` (≈ 21.900 dòng) |
| **Ngày kiểm định** | 03/10/2026 |
| **Phương pháp** | Không tin khẳng định nào của tài liệu cho tới khi tự kiểm. **DDL không "chạy bằng đầu" mà chạy thật**: trích nguyên văn 38 khối SQL của Phần 4, dựng trên **PostgreSQL 16.14** (bản portable trong thư mục tạm, không đụng vào dự án), chạy toàn bộ smoke test của tác giả, rồi tấn công bằng **nhiều kết nối đồng thời** — điều bộ smoke test một-transaction của tác giả không làm được. Bảy luồng kiểm định chạy song song (DDL/RLS do kiểm định viên chính tự làm; độ phủ FE↔DB↔API; cấu trúc & nhất quán; API; bảo mật & storage; FE & AI; nghiệp vụ & kiểm soát nội bộ), mỗi luồng có DB riêng; kết quả được kiểm định viên chính rà lại, gộp trùng và chuẩn hóa mức theo thang của đề bài |
| **Sản phẩm bàn giao** | Báo cáo này · `kiem-dinh/sql/` 6 file vá idempotent (70–75) + smoke test đã rà soát · `kiem-dinh/tests/` bộ kiểm thử đa phiên 13 ca và kịch bản dry-run · `kiem-dinh/bang-chung/` báo cáo gốc của 7 luồng, script tấn công, catalog DB thật |
| **Giới hạn** | Chạy trên 16.14 (tài liệu nói 16.9) — cùng nhánh 16, không thấy khác biệt. Không có mã backend/FE để chạy end-to-end nên các khẳng định ở tầng service, S3, PWA chỉ kiểm bằng đọc. Không có trình phân tích Mermaid, không kiểm được "175 sơ đồ 0 lỗi". |

> **Cách đọc mã.** `F-xxx` = mã phát hiện cuối cùng (đánh số theo Bước 1→9, trong mỗi bước xếp từ nặng đến nhẹ). Cột **Nguồn** giữ mã của luồng kiểm định để truy vết bằng chứng: `G-` kiểm định viên chính (DDL chạy thật), `A-` độ phủ, `B-` cấu trúc, `C-` API, `D-` bảo mật/storage, `E-` FE & AI, `N-` nghiệp vụ. Cột **Vá** chỉ file vá trong `kiem-dinh/sql/` (`70`…`75`); "—" là chưa vá bằng SQL (sửa tài liệu, cần quyết định, hoặc thuộc tầng service).

---

## ① KẾT LUẬN NHANH

### Phán quyết tổng: **CẦN SỬA LỚN** — nhưng không phải làm lại từ đầu phần nào

Mục C **không phải bài của "thực tập sinh"**: DDL chạy sạch trên PostgreSQL thật, mọi con số tự công bố quan trọng đều đếm lại khớp, 2.396 trích dẫn `file:dòng` không có tệp nào bịa, thiết kế bảo mật dữ liệu (RLS + FORCE RLS + GRANT theo cột + trigger chặn mass-assignment) thuộc loại chặt. "Sửa lớn" vì ba lý do khác nhau về bản chất:

1. **DDL dùng được sau khi áp 6 file vá đã kiểm chứng** (`kiem-dinh/sql/70…75`): 5 lỗi S0 đều sửa trong vài dòng đến vài chục dòng, nhưng nếu không sửa thì hoặc hệ thống lỗi chập chờn khi vận hành (F-026), hoặc thất thoát tiền/vượt quyền được (F-040, F-041, F-042, F-058).
2. **Phần 6 (API) thiếu hợp đồng dữ liệu**: 392 endpoint có tên DTO nhưng chỉ 1/402 DTO có định nghĩa trường (F-059). Phần này phải viết bổ sung — không vá được bằng SQL.
3. **Phạm vi vượt xa tinh thần đề bài** (quan điểm có số liệu, F-001): 141 bảng, 392 endpoint, phần MUST ≈ 1.528 người-ngày ≈ 31 tháng với 4 lập trình viên, cho một lưu xá vài trăm người với "đội vận hành không chuyên". Cần Ban điều hành chốt một bản MVP (đề xuất ở ⑧).

### Điểm chất lượng từng phần (0–10)

| Phần | Điểm | Lý do một dòng |
|---|---|---|
| 0 — Tóm tắt điều hành | 6 | Số liệu đúng, trung thực về khối lượng; nhưng dài ≈ 2,5 trang (giới hạn 1 trang) và khẳng định "đã kiểm thử đối kháng" rộng hơn thực tế |
| 1 — Audit nghiệp vụ | 8 | Đủ khuôn 7 mục × 12 phân hệ, 425 BR, 1.052/1.052 tên đối tượng DB tồn tại; nhưng ≥ 9 BR được tính "DB đã chặn" mà DB không thực thi, và 3 đường vòng làm mất tiền |
| 2 — Kiến trúc | 6 | Lập luận an ninh tốt; chọn phương án dựa trên chính độ phức tạp đã thiết kế (vòng tròn); mâu thuẫn quyết định Redis |
| 3 — ERD | 8 | 141/141 thực thể khớp DDL, 0 lệch kiểu, 229 quan hệ đều có FK thật; còn 8 cột giả `_N_cot_khac_xem_DDL` |
| 4 — DDL | 7 | Chạy sạch, smoke 1.099 khẳng định xanh, thiết kế bảo vệ dữ liệu xuất sắc; nhưng 1 lỗi quyền làm ghi chập chờn, 4 race condition, 3 đường vòng mất tiền, job phân vùng hỏng từ 01/2027 |
| 5 — Storage | 8 | Luồng presigned đủ bước, không URL chuỗi trần, bucket private; kiểm MIME/EXIF/quét mã độc phụ thuộc service (đã nói rõ) |
| 6 — API | 5 | Danh mục endpoint đầy đủ và khớp tên DB; nhưng không có DTO, 13 cặp endpoint/RLS lệch nhau, hai bảng ánh xạ lỗi mâu thuẫn, chiếm tài khoản qua đổi email |
| 7 — Đề xuất FE | 7 | 7.1–7.3 trích dẫn đúng 38/38, ánh xạ 404/404 cột thật; nhưng Phần 6 dùng số dòng commit cũ, 1 khẳng định FE bịa, mục "373 FX" có trùng |
| 8 — AI | 7 | Trung thực (4 WON'T-NOW, không nhận diện khuôn mặt, chi phí tính lại khớp); cổng ngân sách/đồng ý ở DB hở, mục 8.2.7 bị chèn ≈ 1.360 dòng CREATE INDEX thừa |
| 9 — Bảo mật & riêng tư | 7 | Mã hóa CCCD tầng ứng dụng, ý chỉ ẩn danh thật, audit che cột; nhưng quyền xóa/ẩn danh khi rời đi chỉ có trên giấy (F-106) |
| 10 — Lộ trình & Backlog | 5 | Số học nhất quán tới từng người-ngày; nhưng tổng khối lượng phi thực tế với bối cảnh, có hạng mục đếm trùng |
| Self-check | 6 | Không dòng nào bịa hoàn toàn; 3/12 dòng ✔ khai quá (DTO, placeholder, 741 hạng mục) |

### Thống kê phát hiện (sau khi gộp 13 bản trùng giữa các luồng)

| S0 | S1 | S2 | S3 | BỊA ĐẶT | Mang nhãn THIẾU | **Tổng** |
|---|---|---|---|---|---|---|
| 5 | 6 | 46 | 78 | 3 | 9 (đã tính trong các mức) | **138** |

Thang mức theo đúng đề bài kiểm định: mọi lỗ hổng cho phép mất/sai tiền, vượt quyền hoặc lộ dữ liệu nhạy cảm được xếp **S0** dù sửa chỉ vài dòng; vì vậy 4 lỗi các luồng con xếp S1 đã được nâng lên S0.

### Top 10 vấn đề nghiêm trọng nhất

| # | ID | Mức | Vấn đề (đã chạy thật) | Hậu quả nếu không sửa | Vá |
|---|---|---|---|---|---|
| 1 | F-026 | S0 | Vai trò `luuxa_owner` thiếu `USAGE` trên schema `app`. Truy vấn kiểm tra khóa ngoại chạy dưới quyền chủ bảng, planner inline `app.norm_text` trong index biểu thức ⇒ `permission denied for schema app` | Mọi thao tác ghi có FK tới `members`, `albums`, `announcements`, `assets`, `forum_posts`, `maintenance_issues`, `policy_documents` lỗi **ngẫu nhiên** theo trạng thái relcache của từng kết nối (đã tái hiện: Phó nhà xếp phòng, lập phiếu chi có người ứng tiền, superuser ghi `consents`). Smoke test của tác giả không bắt được vì chạy một phiên superuser | 70 (1 dòng) |
| 2 | F-040 | S0 | Thủ quỹ tự ủy quyền vai trò `treasurer` cho một thành viên (không ai duyệt), người đó duyệt phiếu hoàn ứng của Thủ quỹ, Thủ quỹ tự ghi chi | Rút tiền lặp lại không qua Trưởng nhà | 75 |
| 3 | F-041 | S0 | Tháng chưa có bút toán không có dòng `financial_periods` ⇒ `ensure_period` tạo kỳ `open` mới kể cả cho tháng **trước** kỳ đã chốt | Ghi lùi ngày được; số dư kỳ đã ký chốt lệch sổ cái (8.000.000 đ vs 4.850.000 đ) | 75 |
| 4 | F-042 | S0 | `amount_due_vnd` được GRANT INSERT nhưng không trigger nào kiểm; Thủ quỹ chèn khoản phải thu 0 đ ⇒ tự thành `waived` | Thủ quỹ tự miễn quỹ cho mình/người thân, vượt quy tắc chỉ Trưởng nhà miễn giảm (BR-FIN-14) | 75 |
| 5 | F-058 | S0 | Đổi email tài khoản không xóa `email_verified_at`; DB chỉ kiểm `auth.user.manage` | Admin kỹ thuật chiếm tài khoản Trưởng nhà; Trưởng nhà chiếm tài khoản Thủ quỹ ⇒ một người giữ cả hai chữ ký. Tài liệu đã liệt kê rủi ro (BR-AUTH-22) nhưng DDL chưa chặn | 73 |
| 6 | F-001 | S1 (quan điểm) | Quy mô: 141 bảng, 300 policy, 392 endpoint, MUST ≈ 1.528 người-ngày (≈ 31 tháng/4 dev), 53% MUST là sửa một FE "đã hoàn thiện" | Dự án khó khởi động, phụ thuộc chuyên gia PostgreSQL, rủi ro bỏ dở cao — trái dòng 21 của prompt | — (quyết định) |
| 7 | F-059 | S1 · THIẾU | Phần 6 chỉ có tên DTO; 1/402 DTO có định nghĩa trường | FE/BE không dựng được hợp đồng từ tài liệu; Zod/OpenAPI hứa ở 7.2/6.1.10 không có nguồn; Self-check khai "500 DTO" | — (viết bổ sung) |
| 8 | F-028 | S1 | Trigger sổ cái đọc trạng thái kỳ **không khóa** rồi mới khóa túi quỹ; `fn_close_period` khóa kỳ nhưng không khóa túi quỹ | Chi tiền đúng lúc đang chốt sổ ⇒ bút toán lọt vào kỳ đã chốt (đã tái hiện bằng 2 kết nối). Trái khẳng định dòng 37134 "chốt kỳ hai người… đã kiểm thử đối kháng" | 70 |
| 9 | F-027 | S1 | `ensure_monthly_partitions` thất bại với **mọi** người gọi (kể cả superuser) vì `luuxa_owner` không có `CREATE` trên `public`; 6 phân vùng audit viết cứng 10/2026–03/2027 | Từ 01/2027 job dọn dẹp hằng giờ `fn_housekeeping` rollback toàn bộ (token, idempotency, tệp mồ côi, poll quá hạn không được dọn); từ 04/2027 audit dồn vào phân vùng default | 70 |
| 10 | F-060, F-061 | S1 | (a) Người giữ quyền xem tác giả tự lập báo cáo rồi lộ tác giả ý chỉ cầu nguyện ẩn danh; (b) `POST /ai/jobs` không kiểm quyền xem bản ghi đầu vào, bỏ trống chủ thể là lách cổng đồng ý | Lộ dữ liệu tôn giáo/ẩn danh; khi bật AI, thành viên đọc được hóa đơn/bảng điểm của người khác qua gợi ý AI | 72, 73, 71 |

Đáng chú ý ngoài top 10: **F-106** quyền xóa/ẩn danh hóa khi rời lưu xá (Phần 9.2 mô tả `fn_anonymize_member` như đã có — thực tế không tồn tại; đã viết và kiểm chứng ở file 72); **F-033** xóa mềm thành viên để tài khoản vẫn `active` và lịch trực tương lai còn tên; **F-029/F-030/F-036** ba race condition (sức chứa phòng, bỏ phiếu một lựa chọn, hạn mức giặt).

### Những gì mục C làm TỐT và nên giữ

- **DDL chạy sạch, số liệu trung thực**: 37 file 01→52 không lỗi trên 16.14; 141 bảng, 58 ENUM, 174 hàm, 300 policy, 15.607 dòng, 1.099 khẳng định smoke — **đếm lại đều khớp**.
- **Phòng thủ dữ liệu nhiều lớp**: ENABLE + FORCE RLS 141/141 bảng; 0 hàm `app.*` cho PUBLIC; 0 hàm SECURITY DEFINER thiếu `search_path`; mọi FK có index; 18/18 phép thử mass-assignment trên chính dòng của mình bị chặn (đổi email, trạng thái, `user_id`, `paid_vnd`, `verified_by`, điểm chữ…).
- **Tài chính**: sổ cái append-only có chuỗi băm và khóa hàng túi quỹ; hai chữ ký theo ngưỡng cấu hình; chặn tự duyệt trực tiếp; đảo bút toán khôi phục đúng số dư; duyệt/chi đồng thời tuần tự hóa đúng; Admin kỹ thuật không duyệt chi được.
- **Quyền riêng tư**: cổng đồng ý dữ liệu Công giáo thực thi ở DB (ghi và đọc); ý chỉ ẩn danh thật (tác giả ở bảng tách); audit che cột nhạy cảm; CCCD mã hóa tầng ứng dụng có blind index.
- **Nghiệp vụ trực nhật, đổi ca, đặt lịch giặt**: máy trạng thái chặt; chống tự nghiệm thu, chống ảnh trùng; đổi ca đủ 3 bước; exclusion constraint chống trùng lịch giặt đúng cả khi đồng thời.
- **Trung thực**: Phụ lục B tự nhận smoke test không tái hiện được hai kết nối song song (dòng 37101); `/loi-nguyen` không tồn tại được nói đúng; AI có 4 mục WON'T-NOW, không nhận diện khuôn mặt, chi phí tính lại khớp.
- **Trích dẫn FE ở Phần 7**: 38/38 mẫu đúng; bảng ánh xạ 7.2.4 có 404/404 cột và 214/214 mã endpoint tồn tại; 0 tệp/route/component bịa.


---

## ② SỔ ĐỐI CHIẾU NGUỒN (kết quả Bước 0)

Lập **trước** khi đánh giá, từ mã nguồn thật (`src/`, commit `740ac5d`) và từ prompt gốc. Đây là "bảng chuẩn" cho các bước sau. Hai điểm then chốt: (1) FE thật **khác** baseline của prompt ở nhiều chỗ (trạng thái trực nhật `pending/submitted/approved/rejected`, không có mức khẩn trong `MaintenanceIssue`, danh mục album và sự kiện khác nhãn, không có route `/loi-nguyen` — ý chỉ cầu nguyện nằm ở `/phung-vu`); (2) prompt có 122 yêu cầu kiểm được, tách theo 11 nhóm.

### ②.A Thực thể, trường, giá trị cố định, route và luồng thao tác của FE

#### 0.1 Sổ đối chiếu FE

##### 0.1.a Kiểu và thực thể khai báo trong `lib/mockData.ts` và `lib/store.tsx`

Ghi chú cột “Giá trị enum”: nhãn giữ nguyên từng ký tự như trong mã. `?` = trường tùy chọn.

| Entity | Field | Kiểu | Giá trị enum / định dạng thực tế trong mock | Nguồn file:dòng |
|---|---|---|---|---|
| RoomType | (union) | literal | `'bedroom' \| 'common' \| 'chapel' \| 'kitchen' \| 'storage' \| 'laundry' \| 'stairs' \| 'corridor' \| 'other'`; nhãn UI: Phòng ngủ, Sinh hoạt chung, Nhà nguyện, Bếp & Ăn, Giặt & Phơi, Kho & Kỹ thuật, Cầu thang, Hành lang, Tiện ích khác (app/so-do-nha/page.tsx:54-64) | lib/mockData.ts:1 |
| Room | `id` | string | 'P.1'…'P.5', 'P.SANH1', 'P.SANH2', 'P.XE', 'P.WC_P2', 'P.WC_P4', 'P.WC_P5', 'P.WC_NGOAI' (comment “P.101” ở dòng 4 đã cũ) | lib/mockData.ts:4 |
| Room | `name` | string | 'Phòng 1', 'Sảnh Chung (Đọc kinh tối ngày thường)'… | lib/mockData.ts:5 |
| Room | `floor` | number | 1 \| 2 (12 phòng trên 2 tầng) | lib/mockData.ts:6 |
| Room | `type` | RoomType | 5 bedroom, 1 common, 1 chapel, 4 storage, 1 laundry | lib/mockData.ts:7 |
| Room | `capacity` | number | 2,3,3,3,3 (14 chỗ); 0 cho phòng tiện ích | lib/mockData.ts:8 |
| Room | `amenities` | string[] | 47 lượt, 35 chuỗi khác nhau; form chọn từ 10 chuỗi AMENITY_OPTIONS (app/so-do-nha/page.tsx:41-52) | lib/mockData.ts:9 |
| Room | `status` | literal | `'active' \| 'maintenance' \| 'reserved'` (cả 12 phòng 'active'; FE không có nút đổi trạng thái — app/so-do-nha/page.tsx:258 luôn gán 'active') | lib/mockData.ts:10 |
| Room | `description?` | string | tự do | lib/mockData.ts:11 |
| Room | `areaM2?` | number | 7…35 | lib/mockData.ts:12 |
| Room | `x?`,`y?`,`w?`,`h?` | number | tọa độ khung 680×420. **Ở HEAD, FloorplanCanvas KHÔNG đọc 4 trường này**: canvas vẽ SVG cố định theo id phòng (components/FloorplanCanvas.tsx:47-56 chỉ nhận 8 prop; ví dụ P.1 vẽ cứng `x="167" y="67" width="76" height="131"` ở dòng 422-426) | lib/mockData.ts:13-16 |
| Floor | `id` | number | 1, 2 (form cho nhập, mặc định 4: app/so-do-nha/page.tsx:142) | lib/mockData.ts:20 |
| Floor | `name` | string | 'Tầng 1 (Tầng trệt)', 'Tầng 2 (Lầu 1)' | lib/mockData.ts:21 |
| Floor | `code` | string | 'T1', 'T2' | lib/mockData.ts:22 |
| Floor | `description` | string | tự do | lib/mockData.ts:23 |
| Member | `id` | string | '1'…'12' (store sinh base36: lib/store.tsx:418) | lib/mockData.ts:27 |
| Member | `name` | string | tên gọi ('Minh Tuấn'); store lấy từ cuối họ tên (lib/store.tsx:419) | lib/mockData.ts:28 |
| Member | `fullName` | string | 'Nguyễn Minh Tuấn' | lib/mockData.ts:29 |
| Member | `holyName?` | string | 'Giuse', 'Phanxicô Xaviê'… | lib/mockData.ts:30 |
| Member | `room` | string | 'P.1'…'P.5' hoặc chuỗi giả 'Chưa xếp phòng' (lib/store.tsx:212,233,278) | lib/mockData.ts:31 |
| Member | `phone` | string | '0903 112 451' (form mặc định '0900 000 000': components/Modals.tsx:620) | lib/mockData.ts:32 |
| Member | `role` | literal | `'Trưởng nhà' \| 'Phó nhà' \| 'Thủ quỹ' \| 'Admin' \| 'Thành viên'` (form chỉ cho 4 giá trị, không có 'Admin': components/Modals.tsx:658-663) | lib/mockData.ts:33 |
| Member | `joined` | string | 'MM/yyyy' ('08/2024') | lib/mockData.ts:34 |
| Member | `avatarText` | string | 'MT' (store tính: lib/store.tsx:414-415) | lib/mockData.ts:35 |
| Member | `birthDate?` | string | 'dd/MM/yyyy' | lib/mockData.ts:36 |
| Member | `gender?` | literal | `'Nam' \| 'Nữ'` (mock chỉ có 'Nam') | lib/mockData.ts:37 |
| Member | `identityCard?` | string | 12 số rõ | lib/mockData.ts:38 |
| Member | `diocese?` | string | 'Giáo phận Bùi Chu' (chỉ hiển thị, không có ô nhập ở bất kỳ form nào) | lib/mockData.ts:39 |
| Member | `parish?` | string | 'Giáo xứ Trung Lao' | lib/mockData.ts:40 |
| Member | `pastor?` | string | 'Cha Đaminh Đinh Xuân Triều' | lib/mockData.ts:41 |
| Member | `sacraments?` | string[] | mock dùng đúng 3 nhãn 'Rửa tội', 'Thánh thể', 'Thêm sức' | lib/mockData.ts:42 |
| Member | `university?` | string | 11 tên khác nhau | lib/mockData.ts:43 |
| Member | `major?` | string | tự do | lib/mockData.ts:44 |
| Member | `academicYear?` | string | 'K66 (2021 – 2026)' (khóa học, khác AcademicRecord.academicYear) | lib/mockData.ts:45 |
| Member | `studentCode?` | string | '20210892' | lib/mockData.ts:46 |
| Member | `hometown?` | string | tự do | lib/mockData.ts:47 |
| Member | `homeAddress?` | string | tự do | lib/mockData.ts:48 |
| Member | `fatherName?` | string | 'Nguyễn Văn Thắng (0912.345.678)' — SĐT nhúng trong tên | lib/mockData.ts:49 |
| Member | `motherName?` | string | như trên | lib/mockData.ts:50 |
| Member | `parentPhone?` | string | '0912 345 678' | lib/mockData.ts:51 |
| Member | `duty?` | string | 'Phó nhà – Phụ trách Kỷ luật, Phòng ở & Ban Ẩm thực'… (12 chuỗi) | lib/mockData.ts:52 |
| Member | `avatarUrl?` | string | data URL từ form (components/Modals.tsx:622) | lib/mockData.ts:53 |
| Expense | `id` | string | '1'…'18' / base36 (lib/store.tsx:331) | lib/mockData.ts:57 |
| Expense | `name` | string | tự do | lib/mockData.ts:58 |
| Expense | `amount` | number | VND nguyên (form parseInt, nhận 0: components/Modals.tsx:254) | lib/mockData.ts:59 |
| Expense | `category` | literal | `'Thực phẩm' \| 'Điện nước' \| 'Vệ sinh' \| 'Sửa chữa' \| 'Phụng vụ' \| 'Khác'`; nhãn nút: '🛒 Bếp & Cơm', '⚡ Điện nước', '🧴 Vệ sinh', '🔧 Sửa chữa', '✝ Phụng vụ', '📦 Khác' (components/Modals.tsx:294-301) | lib/mockData.ts:60 |
| Expense | `date` | string | 'dd/MM/yyyy' (store gán ngày máy khách: lib/store.tsx:332) | lib/mockData.ts:61 |
| Expense | `paidBy` | string | tên gọi ('Gia Bảo'); form cứng 'Minh Tuấn' (components/Modals.tsx:256) | lib/mockData.ts:62 |
| Expense | `status` | literal | `'Đã duyệt' \| 'Chờ duyệt' \| 'Từ chối'` (store luôn gán 'Đã duyệt': lib/store.tsx:333; mock 18/18 'Đã duyệt') | lib/mockData.ts:63 |
| Expense | `note?` | string | tự do | lib/mockData.ts:64 |
| Expense | `receiptUrl?` | string | data URL (components/Modals.tsx:258) | lib/mockData.ts:65 |
| Contribution | `memberId` | string | '1'…'12' | lib/mockData.ts:69 |
| Contribution | `name` | string | bản sao tên (dòng 473 'Lê Minh Tuấn' ≠ Member '1' 'Nguyễn Minh Tuấn') | lib/mockData.ts:70 |
| Contribution | `room` | string | bản sao mã phòng | lib/mockData.ts:71 |
| Contribution | `amount` | number | 350000 | lib/mockData.ts:72 |
| Contribution | `status` | literal | `'Đã đóng' \| 'Chưa đóng'` | lib/mockData.ts:73 |
| Contribution | `deadline` | string | '05/10/2026' | lib/mockData.ts:74 |
| Contribution | `paidDate?` | string | 'dd/MM/yyyy' | lib/mockData.ts:75 |
| Announcement | `id` | string | '1'…'3' / base36 | lib/mockData.ts:79 |
| Announcement | `title` | string | tự do | lib/mockData.ts:80 |
| Announcement | `preview` | string | cắt 100 ký tự + '...' (components/Modals.tsx:724) | lib/mockData.ts:81 |
| Announcement | `content` | string | văn bản thuần | lib/mockData.ts:82 |
| Announcement | `author` | string | tên; form cứng 'Minh Tuấn' (components/Modals.tsx:726) | lib/mockData.ts:83 |
| Announcement | `authorRole` | string | 'Trưởng nhà · Phòng 201', 'Phó nhà · Hôm qua'; form cứng 'Phó nhà' (components/Modals.tsx:727) | lib/mockData.ts:84 |
| Announcement | `date` | string | '10:30 · 01/10/2026' hoặc 'Hôm nay · HH:mm' (lib/store.tsx:390) | lib/mockData.ts:85 |
| Announcement | `category` | literal | `'Quan trọng' \| 'Sự kiện' \| 'Chung' \| 'Bếp & Cơm'` | lib/mockData.ts:86 |
| Announcement | `isPinned` | boolean | | lib/mockData.ts:87 |
| Announcement | `isUnread` | boolean | cờ dùng chung toàn cục | lib/mockData.ts:88 |
| Announcement | `fileName?` | string | 'Ke_hoach_Le_Bon_Mang_2026.pdf' (chỉ tên, tải về sinh .txt: app/thong-bao/page.tsx:40-51) | lib/mockData.ts:89 |
| MaintenanceIssue | `id` | string | 'LOG-108' / 'LOG-'+3 số ngẫu nhiên (lib/store.tsx:604) | lib/mockData.ts:93 |
| MaintenanceIssue | `title` | string | | lib/mockData.ts:94 |
| MaintenanceIssue | `location` | string | tự do; form chọn 10 giá trị: 'Phòng 1 (Tầng 1)'…'Phòng 5 (Tầng 2)', 'Sảnh chung T1', 'Sảnh nguyện T2', 'Khu vệ sinh ngoài T1', 'Nhà để xe T1', 'Sân trước / Sân sau' (components/Modals.tsx:406-417) | lib/mockData.ts:95 |
| MaintenanceIssue | `reportedBy` | string | 'Trần Hùng (P.201)'; form cứng 'Minh Tuấn (P.204)' (components/Modals.tsx:381) | lib/mockData.ts:96 |
| MaintenanceIssue | `date` | string | tương đối: 'Hôm nay 14:20', 'Hôm qua', '2 ngày trước', 'Vừa xong' | lib/mockData.ts:97 |
| MaintenanceIssue | `status` | literal | `'Mới tiếp nhận' \| 'Đang xử lý' \| 'Đã xong'` | lib/mockData.ts:98 |
| MaintenanceIssue | `description` | string | | lib/mockData.ts:99 |
| MaintenanceIssue | `assignee?` | string | trộn người + tiến độ | lib/mockData.ts:100 |
| MaintenanceIssue | `cost?` | number | 120000 | lib/mockData.ts:101 |
| MaintenanceIssue | `photoUrl?` | string | data URL (components/Modals.tsx:383) | lib/mockData.ts:102 |
| ForumThread | `id` | string | | lib/mockData.ts:106 |
| ForumThread | `title` | string | | lib/mockData.ts:107 |
| ForumThread | `content` | string | | lib/mockData.ts:108 |
| ForumThread | `author` | string | form cứng 'Minh Tuấn' (components/Modals.tsx:808) | lib/mockData.ts:109 |
| ForumThread | `authorRole` | string | 'Phó nhà', 'Thủ quỹ & Bếp', 'P.202' | lib/mockData.ts:110 |
| ForumThread | `category` | literal | `'Đi chơi' \| 'Bếp & Thực đơn' \| 'Góp ý chung' \| 'Học tập' \| 'Giải trí'`; nhãn form: '🏖️ Đi chơi & Dã ngoại', '🍳 Bếp & Thực đơn', '💡 Góp ý xây dựng', '📚 Góc học tập', '🎉 Góc vui vẻ' (components/Modals.tsx:832-836); chip lọc thiếu 'Giải trí' (app/dien-dan/page.tsx:129) | lib/mockData.ts:111 |
| ForumThread | `date` | string | tương đối | lib/mockData.ts:112 |
| ForumThread | `repliesCount` | number | | lib/mockData.ts:113 |
| ForumThread | `likesCount` | number | | lib/mockData.ts:114 |
| ForumThread | `isPinned` | boolean | | lib/mockData.ts:115 |
| ForumThread.replies[] | `id`,`author`,`content`,`time` | string | kiểu nội tuyến; addReply gán cứng 'Minh Tuấn (Bạn)' (lib/store.tsx:639) | lib/mockData.ts:116-121 |
| PrayerIntention | `id` | string | | lib/mockData.ts:125 |
| PrayerIntention | `text` | string | | lib/mockData.ts:126 |
| PrayerIntention | `author` | string | 'Ẩn danh' hoặc tên (store: lib/store.tsx:665) | lib/mockData.ts:127 |
| PrayerIntention | `date` | string | tương đối | lib/mockData.ts:128 |
| PrayerIntention | `prayingCount` | number | | lib/mockData.ts:129 |
| PrayerIntention | `hasPrayed?` | boolean | cờ dùng chung | lib/mockData.ts:130 |
| EventPollOption | `id`,`text`,`votes` | string, string, string[] | votes = mảng TÊN người bỏ phiếu | lib/mockData.ts:638-640 |
| EventPoll | `id`,`question`,`options`,`createdAt`,`isClosed?` | | createdAt 'dd/MM/yyyy'; `isClosed` không được dùng ở đâu | lib/mockData.ts:644-648 |
| EventCheckInRecord | `memberId` | string | 'm1'…'m7' (không khớp Member.id) | lib/mockData.ts:652 |
| EventCheckInRecord | `memberName` | string | trộn họ tên và tên gọi | lib/mockData.ts:653 |
| EventCheckInRecord | `room?` | string | bản sao phòng lúc điểm danh | lib/mockData.ts:654 |
| EventCheckInRecord | `checkedInAt` | string | 'HH:mm' | lib/mockData.ts:655 |
| EventCheckInRecord | `status` | literal | `'present' \| 'late' \| 'absent'` | lib/mockData.ts:656 |
| EventCheckInRecord | `note?` | string | | lib/mockData.ts:657 |
| CalendarEvent | `id` | string | 'evt-1' / 'evt-'+5 ký tự | lib/mockData.ts:661 |
| CalendarEvent | `title` | string | | lib/mockData.ts:662 |
| CalendarEvent | `date` | string | 'dd/MM/yyyy' | lib/mockData.ts:663 |
| CalendarEvent | `time` | string | chỉ giờ bắt đầu, 24h kèm hậu tố: '08:30 sáng', '19:30 tối', '20:30 tối', '06:00 sáng'; preset của CustomTimePicker còn có '11:30 trưa', '17:30 chiều', '22:00 đêm' (components/ui/FormControls.tsx:601-614) | lib/mockData.ts:664 |
| CalendarEvent | `location` | string | tự do | lib/mockData.ts:665 |
| CalendarEvent | `category` | literal | `'Phụng vụ' \| 'Họp nhà' \| 'Bổn mạng' \| 'Dã ngoại' \| 'Sinh hoạt'`; nhãn select Modals: 'Họp nhà', 'Phụng vụ', 'Lễ Bổn mạng', 'Dã ngoại', 'Sinh hoạt chung' (components/Modals.tsx:539-545) | lib/mockData.ts:666 |
| CalendarEvent | `organizer` | string | 'Ban Phụng vụ', 'Trần Văn Đức (Trưởng nhà)' | lib/mockData.ts:667 |
| CalendarEvent | `description?` | string | | lib/mockData.ts:668 |
| CalendarEvent | `hasCheckIn?` | boolean | | lib/mockData.ts:669 |
| CalendarEvent | `checkIns?` | EventCheckInRecord[] | | lib/mockData.ts:670 |
| CalendarEvent | `poll?` | EventPoll | tối đa 1 poll/sự kiện | lib/mockData.ts:671 |
| CategoryItem | `id`,`name`,`code` | string | 'cat-tc-1', 'Thực phẩm & Đi chợ', 'FOOD' | lib/mockData.ts:968-970 |
| CategoryItem | `type` | literal | `'expense' \| 'event' \| 'announcement' \| 'forum' \| 'maintenance'` (nhãn: 'Thu Chi & Quỹ', 'Lịch & Sự kiện', 'Bảng Thông báo', 'Diễn đàn Huynh đệ', 'Hậu cần & Báo hỏng' — app/cai-dat/page.tsx:44-48) | lib/mockData.ts:971 |
| CategoryItem | `description?`,`color`,`iconName?`,`count?`,`isActive` | | color hex; 10 màu COLOR_PRESETS (app/cai-dat/page.tsx:51-62); count là số cứng | lib/mockData.ts:972-976 |
| MomentPhoto | `id`,`url`,`caption?`,`uploadedBy`,`date`,`likesCount` | | url Unsplash/data URL; FE không có nút thả tim ảnh | lib/mockData.ts:1018-1023 |
| MomentAlbum | `id`,`title`,`description` | string | | lib/mockData.ts:1027-1029 |
| MomentAlbum | `category` | literal | `'Hành hương' \| 'Dã ngoại & Du lịch' \| 'Lễ Bổn Mạng' \| 'Bữa cơm huynh đệ' \| 'Sinh hoạt thường nhật' \| 'Chia tay & Tốt nghiệp'` | lib/mockData.ts:1030 |
| MomentAlbum | `date`,`year`,`month`,`location`,`coverPhoto` | | year/month lưu dư | lib/mockData.ts:1031-1035 |
| MomentAlbum | `photos` | MomentPhoto[] | 7 album / 14 ảnh | lib/mockData.ts:1036 |
| MomentAlbum | `author`,`authorRole` | string | form cứng 'Minh Tuấn' / 'Phó nhà' (app/khoanh-khac/page.tsx:313-314) | lib/mockData.ts:1037-1038 |
| MomentAlbum | `tags` | string[] | thêm '#' tự động (app/khoanh-khac/page.tsx:280-283) | lib/mockData.ts:1039 |
| MomentAlbum | `isFeatured?`,`participants`,`likesCount`,`isLiked?` | | participants = mảng TÊN | lib/mockData.ts:1040-1043 |
| SubjectScore | `id`,`subjectName`,`credits`,`midtermScore`,`finalScore`,`totalScore`,`letterGrade` | | total = round1(mid×0,4+fin×0,6) (app/hoc-tap/page.tsx:157-159); letter A+≥9,0; A≥8,5; B+≥8,0; B≥7,0; C+≥6,5; C≥5,5; D≥4,0; F (app/hoc-tap/page.tsx:161-170) | lib/mockData.ts:1301-1307 |
| AcademicRecord | `id`,`memberId`,`memberName`,`room` | | memberId 'm1'…'m7' | lib/mockData.ts:1311-1314 |
| AcademicRecord | `university`,`major`,`studentId`,`academicYear` | string | academicYear '2025-2026' | lib/mockData.ts:1315-1318 |
| AcademicRecord | `semester` | literal | `"Học kỳ 1" \| "Học kỳ 2" \| "Học kỳ hè"` | lib/mockData.ts:1319 |
| AcademicRecord | `gpa10`,`gpa4` | number | gpa4 = gpa10/10×4 tuyến tính (app/hoc-tap/page.tsx:204-206) | lib/mockData.ts:1320-1321 |
| AcademicRecord | `rank` | literal | `"Xuất sắc" \| "Giỏi" \| "Khá" \| "Trung bình" \| "Cần cố gắng"` (ngưỡng gpa4 3,6/3,2/2,5/2,0: app/hoc-tap/page.tsx:208-213) | lib/mockData.ts:1322 |
| AcademicRecord | `subjects`,`evidencePhoto?`,`aspirations`,`scholarshipEligible?`,`supportNeeded?`,`supportSubject?`,`updatedAt` | | | lib/mockData.ts:1323-1329 |
| CleaningDuty | `id` | string | 'duty-1' | lib/mockData.ts:1512 |
| CleaningDuty | `dayOfWeek` | literal | `"Thứ Hai" \| "Thứ Ba" \| "Thứ Tư" \| "Thứ Năm" \| "Thứ Sáu" \| "Thứ Bảy" \| "Chúa Nhật"` | lib/mockData.ts:1513 |
| CleaningDuty | `dateStr` | string | 'dd/MM/yyyy' hoặc 'Tuần này' (app/hau-can/page.tsx:294) | lib/mockData.ts:1514 |
| CleaningDuty | `area`,`areaIcon` | string | 8 tên khu vực tự do; icon chọn từ AREA_ICON_OPTIONS 7 giá trị (app/hau-can/page.tsx:68-76) | lib/mockData.ts:1515-1516 |
| CleaningDuty | `assignedRoom` | string | 'Phòng 1'…'Phòng 5', 'Toàn thể lưu xá', 'Phòng 4 - Phòng 5' | lib/mockData.ts:1517 |
| CleaningDuty | `assignedMembers` | string[] | tên; phần tử giả 'Tất cả thành viên' | lib/mockData.ts:1518 |
| CleaningDuty | `shift` | literal | `"Ca Sáng (06:30)" \| "Ca Chiều (17:30)" \| "Ca Tối (21:00)"` | lib/mockData.ts:1519 |
| CleaningDuty | `status` | literal | `"pending" \| "submitted" \| "approved" \| "rejected"`; nhãn lọc: '⏳ Chờ trực', '🕒 Chờ nghiệm thu', '✅ Đã nghiệm thu (Đạt)', '⚠️ Yêu cầu dọn lại' (app/hau-can/page.tsx:44-50) | lib/mockData.ts:1520 |
| CleaningDuty | `checkInTime?`,`checkInBy?`,`checkInNote?`,`evidencePhoto?` | string | giờ 'HH:mm' | lib/mockData.ts:1521-1524 |
| CleaningDuty | `reviewerName?`,`reviewNote?`,`reviewedAt?` | string | reviewer cứng 'Ban Quản Lý Lưu Xá' (app/hau-can/page.tsx:262) | lib/mockData.ts:1525-1527 |
| ToastMessage | `id`,`type`,`message` | | type `"success" \| "error" \| "warning" \| "info"` | lib/store.tsx:39-43 |
| AppContextType | 23 trạng thái + 56 hàm | | currentRole mặc định 'Phó nhà' (lib/store.tsx:170) | lib/store.tsx:45-162 |
| mealAttendance | Record<memberId,{lunch:boolean; dinner:boolean}> | | chỉ “hôm nay”; khởi tạo theo chỉ số mảng | lib/store.tsx:92, 284-293 |
| laundryBookings | Record<"day-slot", memberName> | | day 0..6, slot 0..6; khởi tạo '3-4','3-5','4-2' | lib/store.tsx:120, 296-300 |
| fundBalance | number (dẫn xuất) | | 8680000 + (totalCollected − 8×350000) − (octExpensesSpent − 2870000) = 8.680.000 với mock | lib/store.tsx:321-326 |

##### 0.1.b Thực thể chỉ khai báo inline trong trang/component (không có interface)

| Entity (đặt tên kiểm định) | Field | Kiểu | Giá trị enum / mẫu | Nguồn file:dòng |
|---|---|---|---|---|
| Đăng nhập | nút Google | Link | `<Link href="/">` 'Đăng nhập với Google' — không có form email/SĐT/mật khẩu | app/dang-nhap/page.tsx:38-51 |
| Đăng nhập | liên kết chờ duyệt | Link | 'Xem trạng thái tài khoản đang chờ phê duyệt →' | app/dang-nhap/page.tsx:54-58 |
| Phòng chờ phê duyệt | displayName, email, avatarText, statusLabel | JSX cứng | 'Nguyễn Minh Tuấn', 'nguyen.minhtuan2004@gmail.com', 'MT', 'Mới đăng ký' | app/cho-phe-duyet/page.tsx:42-49 |
| Phòng chờ phê duyệt | approverContact | JSX cứng | 'Anh Văn Đức (Trưởng nhà · P.1 · 0912 334 782)…' | app/cho-phe-duyet/page.tsx:60 |
| Phòng chờ phê duyệt | nút 'Đăng xuất', 'Kiểm tra lại' | Link | về /dang-nhap, về / kèm toast | app/cho-phe-duyet/page.tsx:66-79 |
| Dashboard | KPI | dẫn xuất | unpaidCount, eatingLunchCount, unreadCount, pendingIssues, todayDuties ('Thứ Sáu'/'02/10/2026' cứng), doneDutiesCount | app/page.tsx:130-135 |
| Dashboard | biểu đồ | hằng | MONTHLY_FINANCIAL_DATA {label 'T5'..'T10', thu, chi}; EXPENSE_CATEGORIES_DATA {label, value, color} | app/page.tsx:31-46 |
| Dashboard | khối cứng | JSX | 'Tổng thu 6T 24.850.000đ', 'Tổng chi 6T 22.790.000đ', 'Lịch trực ngày mai của bạn!' | app/page.tsx:293-297, 523 |
| Thu chi | SIX_MONTH_BARS, SIX_MONTH_TREND, MONTH_ORDER | hằng | 'T5'..'T10'; 'Tháng 5'..'Tháng 10' (6.500.000→9.730.000); ['08/2026','09/2026','10/2026'] | app/thu-chi/page.tsx:47-65 |
| Thu chi | bộ lọc/kỳ | state | activeTab 'tong-quan'\|'danh-sach'\|'bao-cao'; filterPaid 'all'\|'unpaid'\|'paid'; periodMode 'month'\|'range'; lọc trạng thái chi ['Tất cả','Đã duyệt','Chờ duyệt'] (thiếu 'Từ chối') | app/thu-chi/page.tsx:87-102, 802, 832 |
| Thu chi | currentPeriodBalance | dẫn xuất cứng | 09/2026 → 9.730.000; 08/2026 → 7.700.000 | app/thu-chi/page.tsx:169-174 |
| Bếp & Cơm (TẠM HOÃN) | banner | JSX | 'Tính năng Bếp & Cơm tạm hoãn triển khai'; Sidebar `isPaused: true` | app/bep-com/page.tsx:141-150; components/Sidebar.tsx:34 |
| Bếp & Cơm | WEEK_DAYS | {day,lunch,dinner,isToday?} | day 'T2'..'CN' | app/bep-com/page.tsx:24-32 |
| Bếp & Cơm | WEEKLY_MENUS | {day,cook,lunch[],dinner[],isToday?} | 'Thứ Hai (28/09)', cook 'Gia Bảo (Chính) · Văn Đức (Phụ)' | app/bep-com/page.tsx:34-78 |
| Bếp & Cơm | pantryItems | {id:number,name,qty,status,target,icon,category} | status `'Đầy đủ' \| 'Sắp hết' \| 'Cần mua gấp'`; category `'Lương thực' \| 'Gia vị' \| 'Thực phẩm tươi' \| 'Hóa phẩm'`; qty/target dạng '15 kg' | app/bep-com/page.tsx:86-94 |
| Bếp & Cơm | giờ chốt | JSX | 'trưa trước 9:00 sáng & tối trước 15:00 chiều' | app/bep-com/page.tsx:312 |
| Hậu cần | tabs | state | `"truc-nhat" \| "bao-hong" \| "may-giat" \| "muon-do"` | app/hau-can/page.tsx:118 |
| Hậu cần | bộ lọc ca trực | hằng | STATUS_FILTER_OPTIONS (44-50), WEEKDAY_OPTIONS (52-60), SHIFT_OPTIONS (62-66), chip ngày ['Tất cả','Hôm nay','Thứ Hai'…'Chúa Nhật'] (481) | app/hau-can/page.tsx |
| Hậu cần | checkInTasks | {scrubbed, trashEmptied, mirrorsCleaned, restocked}: boolean | nhãn: 'Cọ rửa sàn & bồn', 'Gom & đổ rác sạch', 'Lau kính & tay vịn', 'Bổ sung xà phòng'; khi gửi được ghép vào chuỗi note (240-249) | app/hau-can/page.tsx:130-135, 1005-1045 |
| Hậu cần | form thêm ca | state | newArea (tự do), newAreaIcon, newDay, newRoom, newMembersStr (chuỗi phân cách dấu phẩy), newShift | app/hau-can/page.tsx:146-152, 274-298 |
| Hậu cần | form đổi ca | state | swapFrom, swapTo, swapReason | app/hau-can/page.tsx:141-144 |
| Hậu cần | SLOTS, DAYS (lịch giặt) | hằng | 7 khung '06:00 – 08:00'…'20:00 – 22:00' (bỏ 12–14); 'T2'..'CN'; một máy duy nhất 'Sân phơi Tầng 4' | app/hau-can/page.tsx:78-88, 836 |
| Hậu cần | borrowItems | {id:number,name,loc,status,borrower,icon} | status `'Có sẵn' \| 'Đang mượn'`; borrower 'Văn Đức (Trả 18:00)' | app/hau-can/page.tsx:157-163 |
| Hậu cần | SAMPLE_CLEANING_PHOTOS | {label,url} | 4 ảnh Unsplash làm mặc định | app/hau-can/page.tsx:90-95 |
| Modal báo hỏng | issueUrgency | string | `'Trung bình' \| 'Gấp' \| 'Khẩn cấp'` (nhãn '(48h)', '(Trong ngày)', '(Ngay)') — **thu thập nhưng không truyền vào addIssue** (378-384) | components/Modals.tsx:75, 420-429 |
| Modal đổi ca (swapDuty) | ứng viên | hằng | 'Đình Khôi (P.102)', 'Văn Bình (P.103)', 'Thanh Phong (P.105)'; nút chỉ toast | components/Modals.tsx:872-925 |
| Lịch & Sự kiện | tabs | state | `"calendar" \| "checkin" \| "polls"` | app/lich-su-kien/page.tsx:81 |
| Lịch & Sự kiện | rsvpState | Record<eventId, 'tham-du' \| 'vang' \| 'chua-ro'> | nút 'Tham dự', 'Vắng phép', 'Chưa rõ' — chỉ state cục bộ | app/lich-su-kien/page.tsx:89, 724-765 |
| Lịch & Sự kiện | form sự kiện | state | title, date '04/10/2026', time '19:30 tối', location, category, organizer, description, hasCheckIn, hasPoll, pollQuestion, pollOptions | app/lich-su-kien/page.tsx:101-112 |
| Lịch & Sự kiện | form biểu quyết | state | pollSelectedEventId, pollQuestion, pollOptions (≥2) | app/lich-su-kien/page.tsx:95-98, 251-272 |
| Lịch & Sự kiện | QR modal | JSX | SVG giả; 'Mã bí mật điểm danh: LX-OCT26-ASSISI'; nút 'Xác nhận tôi đã có mặt tại đây' gọi checkInEvent(…, 'Minh Tuấn') | app/lich-su-kien/page.tsx:1101-1170, 199-201 |
| Thông báo | confirmedAnns | Record<annId, boolean> | nút 'Tôi sẽ có mặt' / '✓ Đã xác nhận có mặt' | app/thong-bao/page.tsx:38, 251-276 |
| Thông báo | thống kê nhận | JSX cứng | '12 / 12 thành viên đã nhận được thông báo' | app/thong-bao/page.tsx:248 |
| Thông báo | lọc | hằng | ['Tất cả','Quan trọng','Sự kiện','Chung','Bếp & Cơm'] | app/thong-bao/page.tsx:111 |
| Phụng vụ | thẻ đầu trang | JSX cứng | 'Kinh Tối Hôm Nay 20:30', 'Ý Cầu Nguyện Tháng', 'Thánh Lễ Sắp Tới' | app/phung-vu/page.tsx:53-92 |
| Phụng vụ | lịch tuần (LiturgyScheduleItem) | JSX cứng | dayLabel 'Thứ Năm, 01/10 · Thánh Têrêsa Hài Đồng Giêsu'; tuần 'Tuần XXVII Thường Niên'; nhãn 'Ngày kiêng thịt / Đền tội', '✪ ĐẠI LỄ BỔN MẠNG THÁNH PHANXICÔ ASSISI'; time '06:00 SÁNG'; 'Chủ sự: Minh Tuấn (P.204)' | app/phung-vu/page.tsx:98-165 |
| Phụng vụ | form ý chỉ | state | intentionInput, isAnonymous ('Gửi ẩn danh') | app/phung-vu/page.tsx:22-23, 183-219 |
| Phụng vụ | Góc Lời Chúa | JSX cứng | 'Ga 14, 27', trích dẫn, 'Suy niệm từ Anh Minh Tuấn: …' | app/phung-vu/page.tsx:248-259 |
| Cài đặt | tabs | type | `"general" \| "categories" \| "roles" \| "telegram"` | app/cai-dat/page.tsx:38 |
| Cài đặt chung | 10 trường | string | houseName, motto, houseAddress ('Số 42 ngõ 180 Triều Khúc…'), patronFeast ('04/10 (Thánh Phanxicô Assisi)'), fundRate '350000', mealRate '25000', lunchCutoff '09:00', dinnerCutoff '15:00', nightPrayerTime '20:30', bankAccount '1903688889999 - Techcombank (Trần Văn Đức)'; lưu localStorage 'luuxa_settings'; nút 'Khôi phục' và 'Lưu tất cả thay đổi' | app/cai-dat/page.tsx:84-164, 296-310 |
| Cài đặt Telegram | 5 công tắc | boolean | telegramSync ('Tự động gửi thông báo nhắc đóng quỹ qua Telegram'), remindMorningShift, reportMealSummary, alertMaintenance, remindNightPrayer — cấp NHÀ | app/cai-dat/page.tsx:96-100, 508, 823-841 |
| Cài đặt Telegram | Bot Token, Group Chat ID, nút 'Kiểm tra gửi tin nhắn Bot' | input disabled | '7482910482:AAE3hK81-xxxxxx_phanxico', '-100192847192 (Nhóm Chung Lưu Xá)' | app/cai-dat/page.tsx:799-816 |
| Cài đặt Phân quyền | ma trận 6 phân hệ × 5 vai trò | JSX tĩnh | cột 'Trưởng nhà','Phó nhà','Thủ quỹ','Thành viên','Admin HT'; giá trị 'Toàn quyền','Xem','Duyệt chi','Xem & Đối soát','Xem minh bạch','Đăng thường','Giám sát','Xếp lịch ca','Cấp tiền chợ','Báo cơm & Trực ca','Quản trị','Đăng ảnh','Đăng ảnh & Thả tim','Không' | app/cai-dat/page.tsx:690-756 |
| Cài đặt Danh mục | form | state | formCatName, formCatCode (in hoa), formCatType, formCatDesc, formCatColor, formCatActive | app/cai-dat/page.tsx:172-178 |
| Thành viên | bộ lọc | hằng | ['Tất cả','Tầng 1','Tầng 2','Tầng 3'] lọc bằng `room.startsWith('P.1')`… | app/thanh-vien/page.tsx:60-74, 210 |
| Thành viên | widget sinh nhật tháng | dẫn xuất từ birthDate | | app/thanh-vien/page.tsx:158-193 |
| Thành viên | lịch sử đóng quỹ 3 tháng | JSX cứng | '350.000đ ✓ Đã đóng' ×3 | app/thanh-vien/page.tsx:413-426 |
| Sơ yếu lý lịch (MemberCVModal) | 11 giá trị cứng | JSX | 'TỈNH DÒNG ANH EM HÈN MỌN VIỆT NAM (OFM)', 'LƯU XÁ SINH VIÊN CÔNG GIÁO PHANXICÔ ASSISI', 'Ngõ 68 Triều Khúc… Hotline: 0903 112 451', 'Niên khóa 2026 – 2027', '✓ Đã đối soát & nộp đủ', 'Trần Văn Đức', 'Lm. Phanxicô Assisi', 'LX-PX-{id}' | components/MemberCVModal.tsx:177-378 |
| Sơ đồ nhà | bộ lọc | state | viewMode 'canvas'\|'cards'; filterType 'all'\|'bedroom'\|'facility'\|'available'\|'full'; isBuilderMode | app/so-do-nha/page.tsx:90-96 |
| Sơ đồ nhà | form phòng / tầng | state | formRoomFloor, formRoomId, formRoomName, formRoomType, formRoomCapacity, formRoomArea, formRoomDescription, formRoomAmenities; formFloorId, formFloorName, formFloorCode, formFloorDesc | app/so-do-nha/page.tsx:132-145 |
| Học tập | form bảng điểm | state | selectedMemberName (chọn BẤT KỲ thành viên), formUniversity, formMajor, formStudentId, formAcademicYear, formSemester, formAspirations, formEvidencePhoto, formSupportNeeded, formSupportSubject, formScholarship, formSubjects[{subjectName,credits,midtermScore,finalScore}] | app/hoc-tap/page.tsx:76-97 |
| Học tập | RANK_BADGES | hằng | 5 nhãn xếp loại | app/hoc-tap/page.tsx:37-46 |
| Khoảnh khắc | CATEGORY_COLORS, CATEGORIES_LIST | hằng | 6 chuyên mục như MomentAlbum.category | app/khoanh-khac/page.tsx:43-62 |
| Khoảnh khắc | form album / ảnh nhanh | state | formTitle, formDescription, formCategory, formDate '02/10/2026', formLocation, formCoverPhoto, formTags, formPhotoUrls, selectedParticipants; quickPhotoUrl, quickPhotoCaption | app/khoanh-khac/page.tsx:96-98, 145-156 |
| Header | ROLE_CONFIGS | Record<role,{label,desc,icon,color,badge}> | 5 vai trò; bộ chuyển vai trò ai cũng dùng được | components/Header.tsx:25-61, 84-87 |
| Điều hướng | NAV_ITEMS | {href,label,icon,badgeKey?,isPaused?,isNew?} | 13 mục | components/Sidebar.tsx:29-43; components/MobileBottomNav.tsx:24-28 |
| Command palette | NAV_ITEMS, ACTION_ITEMS | hằng | 8 hành động nhanh (mở modal) | components/CommandPalette.tsx:40-65 |
| FinancialReportModal | props | {isOpen,onClose,periodLabel,fundBalance,expenses,contributions} | xuất PDF ở client, sao chép Zalo | components/FinancialReportModal.tsx:23-30, 62-95 |
| ImageUploadDropzone | file | data URL | nhận `image/*`, tối đa 10 MB, đọc base64 | components/ui/ImageUploadDropzone.tsx:34-77, 166 |

##### 0.1.c Chỗ FE KHÁC baseline của prompt gốc (`PROMPT_BACKEND_PGSQL_DDL.md:49-105`)

| # | Baseline prompt | FE thật (HEAD) | Bằng chứng |
|---|---|---|---|
| 1 | Đăng nhập Email/SĐT + mật khẩu Argon2id (PROMPT:53) | Chỉ có nút 'Đăng nhập với Google' (một `Link` về `/`), không form mật khẩu; có trang chờ phê duyệt | app/dang-nhap/page.tsx:38-51; app/cho-phe-duyet/page.tsx |
| 2 | Trạng thái trực nhật `Chờ thực hiện`, `Đã check-in`, `Đạt yêu cầu`, `Cần làm lại`, `Bỏ ca` (PROMPT:67) | 4 giá trị tiếng Anh `pending \| submitted \| approved \| rejected`; không có “bỏ ca” | lib/mockData.ts:1520 |
| 3 | 6 khu vực cố định (PROMPT:66) | `area` là chuỗi tự do (8 tên trong mock), form gõ tự do; icon chọn từ 7 nhóm | lib/mockData.ts:1515; app/hau-can/page.tsx:68-76, 283 |
| 4 | Check-in 4 tiêu chí “lau sàn, đổ rác, cọ rửa, bổ sung vật tư” (PROMPT:68) | 4 ô 'Cọ rửa sàn & bồn', 'Gom & đổ rác sạch', 'Lau kính & tay vịn', 'Bổ sung xà phòng', ghép vào chuỗi note | app/hau-can/page.tsx:240-249, 1005-1045 |
| 5 | Nghiệm thu “chấm điểm” (PROMPT:69) | Chỉ Đạt/Làm lại + nhận xét, không có điểm | lib/store.tsx:555-573 |
| 6 | Đổi ca 3 bước (PROMPT:69) | swapCleaningDuty đổi thẳng; modal swapDuty chỉ toast | lib/store.tsx:575-590; components/Modals.tsx:913-918 |
| 7 | Điểm chữ A, B+, B, C, D, F (PROMPT:73) | A+, A, B+, B, C+, C, D, F; không có Đạt/Nợ môn, không GPA tích lũy | app/hoc-tap/page.tsx:161-170 |
| 8 | Cờ `isTutoringEligible`, `hasScholarship` (PROMPT:74) | `scholarshipEligible`, `supportNeeded`, `supportSubject` | lib/mockData.ts:1326-1328 |
| 9 | Loại sự kiện `Lễ Bổn mạng` (PROMPT:77) | Giá trị `'Bổn mạng'` (nhãn select 'Lễ Bổn mạng') | lib/mockData.ts:666; components/Modals.tsx:542 |
| 10 | Lịch định kỳ, QR token ngắn hạn, `isMultiSelect` (PROMPT:77-79) | Không có định kỳ; QR là SVG giả + mã cứng; biểu quyết 1 lựa chọn | app/lich-su-kien/page.tsx:1133-1160; lib/store.tsx:474-490 |
| 11 | Số dư tiền mặt + ngân hàng; ma trận 12 tháng; phương thức nộp (PROMPT:82-83) | Một con số fundBalance; danh sách đóng quỹ theo 1 tháng (chỉ 3 tháng điều hướng được), không có phương thức | lib/store.tsx:321-326; app/thu-chi/page.tsx:65, 150-160 |
| 12 | Mức khẩn `Trung bình`, `Gấp`, `Khẩn cấp` (PROMPT:87) | Modal thu thập nhưng **không lưu**; MaintenanceIssue không có trường mức khẩn | components/Modals.tsx:75, 378-384, 420-429; lib/mockData.ts:92-103 |
| 13 | Phân công sửa nội bộ/thợ ngoài, chi phí liên kết đề xuất chi (PROMPT:88) | `assignee` chuỗi tự do, `cost` một con số | lib/mockData.ts:100-101 |
| 14 | Chuyên mục album `Sinh hoạt, Phụng vụ, Dã ngoại, Bếp núc, Thể thao, Học tập` (PROMPT:91) | 6 giá trị khác: Hành hương, Dã ngoại & Du lịch, Lễ Bổn Mạng, Bữa cơm huynh đệ, Sinh hoạt thường nhật, Chia tay & Tốt nghiệp | lib/mockData.ts:1030 |
| 15 | Thông báo `Quan trọng, Sự kiện, Chung` (PROMPT:95) | Thêm `Bếp & Cơm` | lib/mockData.ts:86 |
| 16 | Ý chỉ `isAnonymous`, `prayerCount` (PROMPT:97) | author = 'Ẩn danh', `prayingCount`, `hasPrayed` | lib/mockData.ts:124-131; lib/store.tsx:661-672 |
| 17 | Máy giặt nhiều máy (PROMPT:98) | Một lưới duy nhất, khóa 'day-slot', không có máy | lib/store.tsx:120, 690-704 |
| 18 | Tầng 1, 2, 3, Sân thượng; phòng P.101… (PROMPT:63) | 2 tầng T1/T2; mã P.1…P.5, P.SANH1, P.XE, P.WC_* | lib/mockData.ts:759-772, 774-962 |
| 19 | Route `/loi-nguyen` (PROMPT:218) | Không tồn tại; ý chỉ nằm ở `/phung-vu` | `src/app/` (15 route) |
| 20 | Không có phân hệ Bếp & Cơm, Mượn đồ, Telegram, Danh mục | FE có `/bep-com` (tạm hoãn), tab Mượn đồ, tab Telegram, quản lý danh mục | app/bep-com; app/hau-can/page.tsx:157-163; app/cai-dat |
| 21 | Tọa độ canvas có thể sửa | Ở HEAD canvas là SVG cố định theo id phòng, không đọc x/y/w/h, không kéo thả phòng | components/FloorplanCanvas.tsx:47-56, 406-430 |

#### Routes & luồng thao tác

15 route thật trong `src/app/` (mỗi route có `page.tsx`; 12 route có `loading.tsx`). Vỏ ứng dụng: `components/AppShell.tsx`, `Header.tsx`, `Sidebar.tsx`, `MobileBottomNav.tsx`, `CommandPalette.tsx`, `Modals.tsx` (8 modal dùng chung), `ToastContainer.tsx`. Không có route `/loi-nguyen`.

| Route | File chính | Component / khối chính | Luồng thao tác (nút → modal/form → hàm store hoặc hành vi cục bộ) | Bằng chứng |
|---|---|---|---|---|
| `/` | app/page.tsx (553) | Lời chào, KPI, biểu đồ cột thu chi, donut cơ cấu chi, hoạt động gần đây, nhắc lịch trực | Nút 'Ghi chi' → `openModal('addExpense')`; liên kết sang /hau-can; mọi số liệu tính ở client từ store; 'Tổng thu/chi 6T' và 'Lịch trực ngày mai' cứng | app/page.tsx:49-136, 293-297, 523 |
| `/dang-nhap` | app/dang-nhap/page.tsx (77) | Thẻ đăng nhập | 'Đăng nhập với Google' → `Link href="/"` (không xác thực); liên kết sang /cho-phe-duyet | app/dang-nhap/page.tsx:38-58 |
| `/cho-phe-duyet` | app/cho-phe-duyet/page.tsx (93) | Thẻ tài khoản chờ duyệt | 'Đăng xuất' → /dang-nhap; 'Kiểm tra lại' → / + toast | app/cho-phe-duyet/page.tsx:66-79 |
| `/thong-bao` | app/thong-bao/page.tsx (288) | Hộp thư 2 cột | 'Đánh dấu đã đọc' → `markAllAnnouncementsRead`; chọn tin → `markAnnouncementRead`; 'Đăng thông báo' → modal `createAnnouncement` → `addAnnouncement`; ghim → `togglePinAnnouncement`; 'Tải về' → sinh .txt; 'Tôi sẽ có mặt' → `confirmedAnns` cục bộ | app/thong-bao/page.tsx:82-88, 145, 195, 237, 251-276; components/Modals.tsx:706-787 |
| `/lich-su-kien` | app/lich-su-kien/page.tsx (1446) | 3 tab: lịch tháng, điểm danh, biểu quyết | 'Thêm sự kiện' → modal nội trang → `addEvent` (kèm checkIns giả và poll tùy chọn); 'Tạo biểu quyết' → `createEventPoll` (ghi đè poll cũ); chọn phương án → `voteEventPoll(…, 'Minh Tuấn')`; 'Mã QR Check-in' → QR modal → `checkInEvent(id,'Minh Tuấn')`; RSVP 'Tham dự/Vắng phép/Chưa rõ' → state cục bộ; 'Sao chép kết quả Zalo'; 'Đổi ca trực nhật' → modal `swapDuty` | app/lich-su-kien/page.tsx:199-272, 323-336, 652, 697, 724-765, 896, 1042, 1083, 1101-1170 |
| `/thu-chi` | app/thu-chi/page.tsx (1000) | 3 tab: tổng quan, danh sách, báo cáo; FinancialReportModal | 'Ghi chi' → modal `addExpense` → `addExpense` (luôn 'Đã duyệt'); bấm trạng thái đóng quỹ → `toggleContribution`; bước tháng 08–10/2026; lọc chi; 'Báo cáo' → PDF client; 'Copy Zalo' | app/thu-chi/page.tsx:244-275, 295-314, 707, 802, 832, 921-994; components/FinancialReportModal.tsx:62-95 |
| `/bep-com` (tạm hoãn) | app/bep-com/page.tsx (652) | 3 tab: đặt cơm & điểm danh, thực đơn tuần, kho đồ | 'Đăng ký ăn cả tuần' → `registerAllMeals()` (cả nhà, chỉ hôm nay); bật/tắt trưa/tối → `toggleMeal`; 'Copy chốt cơm Zalo'; 'Gửi phiếu khảo sát', 'Gửi lời khen', '+ Đề xuất mua thêm gia vị', 'Mua thêm' → chỉ toast | app/bep-com/page.tsx:175-216, 361-374, 512-518, 572-580, 598-645 |
| `/hau-can` | app/hau-can/page.tsx (1406) | 4 tab: trực nhật, báo hỏng, máy giặt, mượn đồ | Trực nhật: 'Check-in' → modal (4 ô + ảnh + ghi chú) → `checkInCleaningDuty`; 'Nghiệm thu' (chỉ Trưởng/Phó/Admin) → `reviewCleaningDuty(…,'Ban Quản Lý Lưu Xá',…)`; 'Đổi ca' → `swapCleaningDuty`; 'Thêm phân công' → `addCleaningDuty`; 'Copy Zalo'. Báo hỏng: 'Báo hỏng' → modal `reportIssue` → `addIssue`; 'Đang xử lý'/'Đã xong' → `updateIssueStatus`. Máy giặt: ô trống → `bookLaundry(d,s,'Minh Tuấn (Lịch của bạn)')`, ô của mình → `cancelLaundry`. Mượn đồ: `handleToggleBorrow` cục bộ | app/hau-can/page.tsx:116, 205-298, 332-406, 644-666, 807-813, 857-890, 933; components/Modals.tsx:357-469 |
| `/phung-vu` | app/phung-vu/page.tsx (267) | 3 thẻ số, lịch phụng vụ tuần (cứng), ý chỉ, Góc Lời Chúa (cứng) | 'Gửi ý cầu' (kèm 'Gửi ẩn danh') → `addPrayer(text,isAnonymous)`; tim → `togglePraying` | app/phung-vu/page.tsx:183-240 |
| `/dien-dan` | app/dien-dan/page.tsx (300) | Danh sách chủ đề, chi tiết, phản hồi | 'Tạo chủ đề' → modal `createThread` → `addThread`; tim → `toggleLikeThread` (+1 mỗi lần bấm); gửi phản hồi → `addReply` | app/dien-dan/page.tsx:64, 129, 203, 274; components/Modals.tsx:789-870 |
| `/thanh-vien` | app/thanh-vien/page.tsx (473) | Lưới/danh sách, panel chi tiết, MemberCVModal | 'Thêm thành viên' → modal `addMember` → `addMember`; 'Lý lịch' → MemberCVModal (PDF client, .txt, Zalo); 'Copy Zalo'; 'Gọi' → `tel:` | app/thanh-vien/page.tsx:121, 281-288, 434-452; components/MemberCVModal.tsx:51-144 |
| `/hoc-tap` | app/hoc-tap/page.tsx (1096) | Bảng/lưới bảng điểm, modal EVD, modal thêm | 'Thêm bảng điểm' → form (chọn bất kỳ thành viên, môn, ảnh EVD, nguyện vọng, cờ) → `addAcademicRecord` (FE tự tính tổng, chữ, GPA, xếp loại); 'EVD' → xem ảnh; 'Copy Zalo'. `updateAcademicRecord`/`deleteAcademicRecord` được lấy ra nhưng không gọi | app/hoc-tap/page.tsx:52-53, 173-240, 294-301, 576-603, 859 |
| `/so-do-nha` | app/so-do-nha/page.tsx (1621) + FloorplanCanvas (1785) | Canvas SVG cố định, thẻ phòng, dock thành viên | Kéo thả thành viên vào phòng → `moveMemberToRoom` (chặn vượt sức chứa); X → `removeMemberFromRoom`; (Trưởng/Phó/Admin) thêm/sửa/nhân bản/xóa phòng → `addRoom`/`updateRoom`/`deleteRoom`; thêm/xóa tầng → `addFloor`/`deleteFloor`; modal Điều chuyển/Xếp vào phòng → `moveMemberToRoom`. `onUpdateRoomPosition` được truyền nhưng canvas bỏ qua | app/so-do-nha/page.tsx:82, 237-350, 378-441, 681-699, 746, 972, 1149; components/FloorplanCanvas.tsx:47-56, 125-175 |
| `/khoanh-khac` | app/khoanh-khac/page.tsx (1572) | Hero album nổi bật, lưới/timeline, chi tiết album, lightbox | 'Tạo album' → `addMomentAlbum`; 'Thêm ảnh' → `addPhotoToMoment`; tim album → `toggleLikeMoment`; 'Copy Zalo'. `deleteMomentAlbum` có trong store nhưng không trang nào gọi | app/khoanh-khac/page.tsx:113, 124-128, 267-320, 389, 464, 575, 1094, 1203, 1262 |
| `/cai-dat` | app/cai-dat/page.tsx (996) | 4 tab: chung, danh mục, phân quyền, Telegram | 'Lưu tất cả thay đổi' → localStorage; 'Khôi phục' → giá trị cứng; danh mục: thêm/sửa → `addCategory`/`updateCategory`, bật/tắt → `toggleCategoryStatus`, xóa → `deleteCategory`; Telegram: công tắc cục bộ, 'Kiểm tra gửi tin nhắn Bot' → toast | app/cai-dat/page.tsx:131-164, 296-310, 564, 631, 799, 881, 977 |
| (vỏ) | Header, Sidebar, MobileBottomNav, CommandPalette, Modals | | Chuông → modal `notifications` (đọc `announcements`); đổi vai trò tự do → `setCurrentRole`; Ctrl+K → palette (8 hành động); 'Mô phỏng tải' → `simulateLoading` | components/Header.tsx:84-157, 212; components/Sidebar.tsx:179; components/CommandPalette.tsx:56-65; components/Modals.tsx:120-228 |

**Ghi nhận luồng FE quan trọng cho backend:**
- Mọi danh tính người thực hiện là chuỗi cứng 'Minh Tuấn' (components/Modals.tsx:256, 381, 726, 808; lib/store.tsx:639, 665; app/lich-su-kien/page.tsx:200, 609, 692; app/khoanh-khac/page.tsx:313).
- Hành vi chỉ toast, không có dữ liệu: khảo sát món, lời khen bữa ăn, đề xuất mua thêm (bep-com), xin đổi ca trong modal `swapDuty`, gửi thử Telegram.
- Hàm store có nhưng không được gọi: `updateFloor`, `updateAcademicRecord`, `deleteAcademicRecord`, `deleteMomentAlbum`.


### ②.B Checklist yêu cầu của prompt gốc (122 mục, kèm kết quả đối chiếu)

#### Checklist yêu cầu prompt gốc

##### A. Quy tắc định dạng và cấu trúc chung

| ID | Yêu cầu (prompt dòng) | Kết quả | Bằng chứng |
|---|---|---|---|
| P-01 | Một tài liệu duy nhất, đánh số, mục lục đầu (36) | Đạt | Một tệp; mục lục dòng 29–137 |
| P-02 | Không viết mã backend; chỉ DDL, sơ đồ, đặc tả, snippet ngắn (37) | Đạt | Chỉ 3 snippet TS/JS ngắn (6025–6031, 29216–29226, 30101–30103), 1 bash (8487–8489) |
| P-03 | Không placeholder `-- TODO`, `-- tương tự`, `...`, `(các bảng còn lại)` (38) | **Một phần** | DDL sạch (dấu … chỉ nằm trong comment/chuỗi COMMENT). Nhưng: 8 cột giả `_N_cot_khac_xem_DDL` trong ERD, 27 ô bảng bị cắt giữa câu bằng "…", 2 ô "Như trên", 3 cụm "và tương tự", 6 ví dụ phản hồi "rút gọn" — chi tiết ở mục Placeholder (B-006, B-007) |
| P-04 | Dòng `[ĐÃ XONG ĐẾN MỤC X.Y — CÒN LẠI: ...]` (39) | Đạt | Dòng 37195 |
| P-05 | Nhãn `[HIỆN CÓ]`/`[ĐỀ XUẤT]`/`[GIẢ ĐỊNH]` (40–43) | Đạt | Định nghĩa 16–20; xuất hiện trên 230 / 303 / 282 dòng |
| P-06 | Mọi đề xuất mới có MoSCoW + công sức S/M/L/XL + giá trị (44) | Đạt | 741 dòng Master Backlog, script: 0 dòng thiếu trường; MoSCoW/công sức giữa Phần 1/7/8 và Master Backlog khớp 100% (0 xung đột) |
| P-07 | Trung thực, `WON'T-NOW` có lý do (45) | Đạt | 72 hạng mục WON'T-NOW (35862); 4 AI WON'T-NOW (AI-06, AI-16, AI-21, AI-25); lý do ở 5352 |
| P-08 | Đủ 10 phần, đúng thứ tự (111) | Đạt | Phần 0–10 ở dòng 140, 179, 5952, 6211, 8463, 25055, 25645, 28763, 33233, 35344, 35838; Self-check 37174 |
| P-09 | Mapping 12 phân hệ baseline (49–105) | Đạt | 1.1–1.12 (230…4953); Phân hệ 10 được tách thành COM + LAU |

##### B. Phần 0 — Tóm tắt điều hành (prompt 113–115)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-10 | **Tối đa 1 trang** | **Không đạt** | Dòng 140–177: 1.134 từ + bảng chi phí ≈ 2–2,5 trang A4 (B-008) |
| P-11 | Hiện trạng | Đạt | 142 |
| P-12 | 10 phát hiện quan trọng nhất | Đạt | 146–157 (đủ 10) |
| P-13 | 10 quyết định kiến trúc | Đạt | 159 (ADR-01…ADR-11, đủ 10 ý) |
| P-14 | Top 5 AI | Đạt | 161 |
| P-15 | Lộ trình tóm tắt | Đạt | 163–165 |
| P-16 | Chi phí hạ tầng tối thiểu và khuyến nghị | Đạt | 167–172, khớp 2.8 từng con số |
| P-17 | Danh sách `[GIẢ ĐỊNH]` (số thành viên, Zalo/Email, đa cơ sở, ngân hàng, báo cáo giáo xứ) | Đạt | 174 + Phụ lục A (171 GD) |

##### C. Phần 1 — Audit nghiệp vụ (prompt 117–141)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-18 | Khuôn 7 mục cho **từng** phân hệ trong 12 | Đạt | 84 tiêu đề 1.N.1–1.N.7 đủ cho N = 1…12 (234…5320) |
| P-19 | Chấm 1–5 cho 5 tiêu chí + nhận xét | Đạt | Bảng tổng 209–226; từng 1.N.2 (vd 263–271) |
| P-20 | Lỗ hổng & rủi ro cụ thể | Đạt | 1.N.3 (vd 4150–4160) |
| P-21 | Quy trình có flowchart/stateDiagram, tác nhân, chuyển trạng thái, thông báo | Đạt | 1.N.4 (vd 320–553); 175 khối mermaid toàn tài liệu |
| P-22 | Business Rule đánh số, map xuống DB/trigger/service | Đạt | 425 BR; chỉ mục 1.15 (5486–5951); 413 có cơ chế DB, 12 chỉ service/quy trình; 0 mã BR được tham chiếu mà không định nghĩa |
| P-23 | Bảng tính năng mới (Tên, Mô tả, MoSCoW, Công sức, Giá trị) | Đạt | 1.N.6 (vd 602, 3237, 4920, 5301) |
| P-24 | KPI theo phân hệ | Đạt | 1.N.7 |
| P-25 | Chủ đề Tài chính (8 ý: ledger, tách thu/chi, nhiều túi, chốt sổ, bút toán đảo, miễn/giảm/nợ/gộp, nhắc tự động, minh bạch) | Đạt | 1.14.1 (5387–5398), 8/8 dòng |
| P-26 | Trực nhật (4 ý) | Đạt | 1.14.2 (5400–5407) |
| P-27 | Hồ sơ & Công giáo (4 ý) | Đạt | 1.14.3 (5409–5416) |
| P-28 | Học tập (5 ý) | Đạt | 1.14.4 (5418–5426) |
| P-29 | Sự kiện & điểm danh (4 ý) | Đạt | 1.14.5 (5428–5435) |
| P-30 | Cơ sở vật chất (4 ý) | Đạt | 1.14.6 (5437–5444) |
| P-31 | Đặt lịch giặt (4 ý) | Đạt | 1.14.7 (5446–5453) |
| P-32 | Thông báo & giao tiếp (4 ý) | Đạt | 1.14.8 (5455–5462) |
| P-33 | Phân quyền (5 ý) | Đạt | 1.14.9 (5464–5472) |
| P-34 | Chu kỳ năm học (4 ý) | Đạt | 1.14.10 (5474–5481) |
| P-35 | Đánh giá 11 phân hệ mới gợi ý, kèm MoSCoW, trung thực | Đạt | 1.13 (5338–5350): 11/11; HAND WON'T-NOW, VIS/INV/MEAL/ALU COULD |

##### D. Phần 2 — Kiến trúc (prompt 143–151)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-36 | So sánh 2–3 phương án theo chi phí, vận hành, đội nhỏ, bảo mật, lock-in; chọn 1 | Đạt (về hình thức) | 5960–5970: 3 phương án, 6 tiêu chí, chọn B (NestJS). Lập luận vòng tròn — xem B-001 (QUAN ĐIỂM) |
| P-37 | PG16+, `gen_random_uuid`, cân nhắc UUIDv7 | Đạt | `app.uuid_v7()` là DEFAULT của mọi PK (catalog) |
| P-38 | Redis, object storage, hàng đợi, sharp, thông báo | Đạt (có lý do không dùng Redis) | 2.4 (6075–6088), ADR-05 (6198). Mâu thuẫn nội bộ về Redis ở Phần 6 — B-010 |
| P-39 | JWT + cookie HttpOnly, CSRF, rotation + reuse detection, guard, rate limit, CSP, CORS | Đạt | 2.5 (6089–6111), 6.1.8–6.1.9 |
| P-40 | Quyết định RLS và cách truyền ngữ cảnh | Đạt | 2.3 (6018–6074), 6.1.2 (25711–25719) |
| P-41 | Môi trường, CI/CD, migration, secrets, IaC | Đạt | 2.6 (6112–6139) |
| P-42 | Quan sát hệ thống | Đạt | 2.7 (6140–6152) |
| P-43 | Chi phí 2 mức × 50/150/500 thành viên | Đạt | 2.8 (6153–6186); cộng lại từng ô đúng |

##### E. Phần 3 — ERD (prompt 153–166)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-44 | Mermaid `erDiagram` toàn diện, chia module, có tổng quan | **Một phần** | 21 erDiagram (6315–8162) phủ 141/141 bảng; 229 quan hệ vẽ ra đều có FK thật (0 quan hệ "ma"); 48 FK không vẽ đều là FK tới `users` (cột `*_by`). Nhưng chỉ vẽ 1.177/1.474 cột và dùng 8 cột giả `text _N_cot_khac_xem_DDL` (B-007) |
| P-45 | Phân tích 1-1, 1-N, N-N, bảng nối | Đạt | 3.3 (8168–8231) |
| P-46 | snake_case, số nhiều, `id UUID`, `TIMESTAMPTZ`, tiền không FLOAT (nêu lựa chọn) | Đạt | 3.4 (8232–8246); DB: 0 cột real/double, 0 cột timestamp không múi giờ; tiền `BIGINT` `_vnd` |
| P-47 | Sổ cái append-only, số dư là tổng hợp | Đạt | `ledger_entries` + `trg_ledger_entries__immutable` + `v_fund_balances` |
| P-48 | Soft delete + partial unique | Đạt (có ngoại lệ) | 19 bảng có `deleted_at`; 8 unique không partial (B-016) |
| P-49 | Optimistic locking `version` | Đạt | 31 bảng có `version` |
| P-50 | Idempotency key | Đạt | `idempotency_keys` + `client_request_id` |
| P-51 | State transition log (phiếu chi, ca trực, sự cố, đổi ca) | Đạt | `expense_status_history`, `duty_status_history`, `issue_status_history`, `duty_swap_status_history` |
| P-52 | Cấu hình thay hard-code | Đạt | 45 khóa `settings`, `grade_scales`, `checklist_templates` |
| P-53 | Tách bảng nhạy cảm | Đạt | `member_private_details`, `member_guardians`, `catholic_profiles` |
| P-54 | Phân vùng/lưu trữ bảng lớn | Đạt | `audit_logs` 6 partition tháng + default; lý do không phân vùng `notifications`/`attendance_records` ở 8259 |
| P-55 | `academic_years`, `terms` | Đạt | `academic_years`, `semesters`, `board_terms` |

##### F. Phần 4 — DDL (prompt 168–188)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-56 | Script chạy được theo thứ tự phụ thuộc | Đạt | Kiểm định viên chạy 38 file trên PG 16.14: không lỗi; smoke test tới ROLLBACK không lỗi |
| P-57 | Khối 1: `pgcrypto`, `citext`, `pg_trgm`, `btree_gist`, `unaccent`; `vector` chỉ khi Phần 8 chọn | Đạt | `01_foundation.sql` dòng 63–67; DB có đúng 5 extension + plpgsql; không `vector` (8.2.8 chọn full-text) |
| P-58 | Khối 2: quyết định ENUM vs bảng tra cứu | Đạt (lệch quy ước nhỏ) | 58 ENUM + bảng tra cứu; 10 cột trạng thái dùng `text + CHECK` — lựa chọn thứ ba không được nêu trong quy ước 8245 (B-012) |
| P-59 | ENUM/lookup bắt buộc (prompt 173) | Đạt | Xem bảng F1 bên dưới: 16/16 kiểu có chỗ |
| P-60 | Bảng tối thiểu (prompt 175) — **kiểm từng tên** | Đạt | Xem bảng F2: 71 tên → 66 trùng tên tuyệt đối, 5 dùng tên thay thế được phép (`a/b`) hoặc có tiền tố (`member_sacraments`, `member_guardians`), 0 thiếu |
| P-61 | Bảng cho phân hệ mới MUST/SHOULD (prompt 176) | Đạt (thừa) | LEAVE, POL, MER, LIT, TUT, KEY có bảng; thêm cả bảng cho MEAL, INV đang xếp COULD (B-017) |
| P-62 | FK có `ON DELETE` có chủ đích, **giải thích bằng COMMENT ON** (174) | **Một phần** | 299 FK: 296 khai tường minh, 3 để mặc định NO ACTION; chỉ 17/121 bảng có FK có COMMENT nói về hành vi xóa; 0 `COMMENT ON CONSTRAINT` (B-009) |
| P-63 | `CHECK` (tiền > 0, điểm 0–10, tín chỉ > 0, giờ KT > BĐ), NOT NULL, DEFAULT | Đạt (lấy mẫu) | Ví dụ `ck_storage_files__size`, `ck_storage_files__mime`; bất biến INV-04 trong smoke test |
| P-64 | `created_at/updated_at/deleted_at/created_by/updated_by` | Đạt | 303 cột timestamptz ở bảng; quy ước 9091–9093 |
| P-65 | B-tree cho mọi FK | Đạt | Truy vấn: 0/299 FK thiếu index có cột dẫn đầu |
| P-66 | Composite unique (thành viên–tháng–khoản; SV–kỳ–môn) | Đạt | `ux_contributions__plan_member`, `ux_contribution_plans__monthly`, `ux_academic_records__member_semester`, `ux_grade_records__record_course` |
| P-67 | Partial index (chi chờ duyệt, ca chưa xong, thông báo chưa đọc) | Đạt | `ix_expense_vouchers__pending`, `ix_duty_assignments__open`, `ix_notifications__unread` |
| P-68 | GIN/trigram cho tên và tags | Đạt | `ix_members__search`, `ix_albums__title_trgm`, `ix_albums__tags`, `ix_courses__name_trgm` |
| P-69 | Exclusion chống trùng giặt và trùng phòng | Đạt | `ex_laundry_bookings__no_overlap`, `ex_room_assignments__member_one_room`, `ex_room_assignments__bed_one_person` (9 exclusion constraint) |
| P-70 | Giải thích index không hiển nhiên | Đạt (lấy mẫu) | Comment trong `20_indexes_special.sql` (11969–12134) |
| P-71 | Trigger `updated_at` | Đạt | `tg_touch`/`tg_touch_versioned` (`39_triggers_boilerplate.sql`) |
| P-72 | GPA theo thang cấu hình | Đạt | `fn_scale_for`, `fn_recompute_gpa`, `grade_scale_bands` |
| P-73 | Chặn sửa/xóa ledger; chặn sửa kỳ đã chốt | Đạt | `trg_ledger_entries__immutable`, `tg_ledger_entry_before_insert` (BR-FIN-06) |
| P-74 | `*_status_history` tự động + máy trạng thái | Đạt | `tg_state_machine`, `tg_status_history` (13320–13494) |
| P-75 | Chặn tự duyệt, ngưỡng nhiều chữ ký | Đạt | `fn_decide_expense`, `tg_expense_approval_rules` (BR-FIN-01/02/17) |
| P-76 | Audit tổng quát cho tài chính, phân quyền, phân phòng, điểm | Đạt | `app.tg_audit` trên `users`, `user_roles`, `room_assignments`, `grade_records`, … |
| P-77 | View: số dư, ma trận 12 tháng, tỷ lệ tham gia, GPA tích lũy, thống kê vệ sinh | Đạt | `v_fund_balances`, `v_contribution_matrix`, `v_event_attendance`, `v_member_gpa_latest`, `v_duty_member_stats` (+16 view, 1 matview) |
| P-78 | `ENABLE` + `FORCE ROW LEVEL SECURITY` | Đạt | 141/141 bảng `rls=true force=true` |
| P-79 | Policy chi tiết từng bảng/vai trò | Đạt | 300 policy; 4 bảng không policy là cố ý (`refresh_tokens`, `password_resets`, `mfa_recovery_codes`, `notification_outbox` — chỉ `luuxa_auth`/`luuxa_worker` dùng) |
| P-80 | Helper `app.current_user_id()`, `app.has_role(...)` | Đạt | `catalog_functions.txt` dòng 14 và 21 |
| P-81 | Ma trận quyền bảng × vai trò × thao tác | Đạt | 4.6.8 (20104) và 4.6.7 (19969) |
| P-82 | Seed tra cứu: vai trò, khu vực, danh mục chi, thang điểm, checklist 4 tiêu chí, máy giặt, khung giờ | Đạt | DB: 8 roles, 7 cleaning_areas, 7 danh mục chi, 1 grade_scale, 4 checklist items, 2 máy giặt, 7 khung giờ |
| P-83 | Cách chuyển `mockData.ts` → seed | Đạt | 4.7.4 (≈21120–21128) + bảng ánh xạ 7.2 |
| P-84 | Migration: thứ tự, chia file, rollback, smoke test | Đạt | Bản đồ file 8495–8539 (15.607 dòng, khớp từng file); 4.8 (21130–25054) |

**F1 — ENUM/lookup bắt buộc (prompt 173)**

| Kiểu yêu cầu | Hiện thực | Kết quả |
|---|---|---|
| vai trò | bảng `roles` (8 dòng) | Đạt (bảng) |
| giới tính | `gender_t` (male, female) | Đạt |
| trạng thái ca trực | `duty_status_t` (7 giá trị) | Đạt |
| mức khẩn | `urgency_t` (low, medium, high, critical) | Đạt; FE 3 mức ánh xạ ở 29759 |
| trạng thái sự cố | `issue_status_t` | Đạt |
| danh mục chi | `categories` kind=expense (7 dòng) | Đạt (bảng) |
| trạng thái chi | `expense_status_t` | Đạt |
| trạng thái đóng quỹ | `contribution_status_t` | Đạt |
| loại sự kiện | `categories` kind=event | Đạt (bảng) |
| chuyên mục khoảnh khắc | `categories` kind=album | Đạt (bảng; theo FE, khác baseline — đã nêu GD-MOM-01/Q-MOM-04) |
| điểm chữ | `grade_scale_bands` (A+…F) | Đạt (bảng) |
| loại phòng | `room_type_t` (khớp từng ký tự `RoomType` của FE) | Đạt |
| loại thông báo | `notification_types` (31 dòng) + `categories` kind=announcement | Đạt (bảng) |
| trạng thái đổi ca | `swap_status_t` | Đạt |
| phương thức thanh toán | `payment_method_t` | Đạt |
| loại file | `storage_bucket_t`, `attachment_purpose_t`, CHECK MIME `ck_storage_files__mime` | Đạt |

**F2 — Bảng tối thiểu (prompt 175), kiểm từng tên với catalog thật**

| Nhóm | Số tên yêu cầu | Có đúng tên | Tên thay thế / ghi chú |
|---|---|---|---|
| Người dùng & xác thực | 6 | `users`, `roles`, `user_roles` (có `scope_type`, `scope_id`, `board_term_id`), `refresh_tokens`, `password_resets`, `login_attempts` | — |
| Hồ sơ | 4 | `members`, `catholic_profiles` | `sacraments` → `member_sacraments`; `guardians/emergency_contacts` → `member_guardians` (cột `is_emergency_contact`) |
| Nhà | 4 | `floors`, `rooms`, `room_amenities`, `room_assignments` | — |
| Vệ sinh | 8 | `cleaning_areas`, `checklist_templates`, `duty_rosters`, `duty_assignments`, `duty_checkins`, `checkin_items`, `duty_reviews`, `duty_swap_requests` | — |
| Học tập | 8 | `academic_years`, `semesters`, `courses`, `grade_scales`, `gpa_snapshots`, `study_goals`, `tutoring_offers` | `enrollments/grade_records` → `grade_records` |
| Sự kiện | 9 | `events`, `event_recurrence_rules`, `event_organizers`, `attendance_records`, `qr_sessions`, `leave_requests`, `polls`, `poll_options`, `poll_votes` | — |
| Tài chính | 7 | `ledger_entries`, `expense_vouchers`, `expense_approvals`, `contribution_plans`, `contributions`, `financial_periods` | `funds/accounts` → `funds` |
| Cơ sở vật chất | 5 | `assets`, `maintenance_issues`, `issue_status_history`, `issue_assignments`, `repair_costs` | — |
| Khoảnh khắc | 4 | `albums`, `album_photos`, `album_member_tags`, `photo_likes` | — |
| Giao tiếp | 10 | `announcements`, `announcement_reads`, `forum_posts`, `forum_comments`, `forum_reactions`, `prayer_intentions`, `prayer_responses`, `notifications`, `notification_preferences`, `push_subscriptions` | — |
| Giặt | 2 | `laundry_machines`, `laundry_bookings` | — |
| Lưu trữ | 1 | — | `storage_files/media_attachments` → cả hai đều có |
| Hạ tầng | 3 | `audit_logs`, `settings`, `idempotency_keys` | — |
| **Tổng** | **71** | 66 khớp tên | 5 thay thế hợp lệ; **0 thiếu** |

##### G. Phần 5 — Lưu trữ tệp (prompt 190–195)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-85 | Presigned workflow + sơ đồ tuần tự Mermaid | Đạt | 5.1 (25059), `sequenceDiagram` 25062 |
| P-86 | Bucket/đường dẫn/đặt tên/phân quyền | Đạt | 5.2 (25105–25123) |
| P-87 | MIME thật, EXIF/GPS, hash, pHash, thumbnail, quét mã độc | Đạt | 5.3 (25124–25138); `ck_storage_files__mime`, `ck_storage_files__scan` |
| P-88 | Tệp mồ côi, dọn dẹp, lưu trữ lạnh, quota | Đạt | 5.4 (25139–25163) |
| P-89 | DDL `storage_files` + so sánh đa hình vs riêng, chọn và nêu lý do | Đạt (khối DDL bị chèn nội dung thừa) | So sánh 25166–25178, quyết định "mô hình lai"; DDL 25182–25626 chứa 94 lệnh `CREATE INDEX` của bảng khác (B-003) |

##### H. Phần 6 — API (prompt 197–201)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-90 | Toàn bộ endpoint 12 phân hệ + mới, `/api/v1`, bảng + chi tiết | Đạt | 392 endpoint, 0 trùng mã, 0 trùng (method, path) |
| P-91 | Vai trò tối thiểu + điều kiện phạm vi | Đạt | Cột quyền có ở 392/392 dòng |
| P-92 | **Request/Query DTO có kiểu và ràng buộc; Response schema** | **Một phần — THIẾU định nghĩa DTO** | 402 tên DTO được tham chiếu, chỉ 1 có định nghĩa trường (`DecideExpenseDto`, 28584–28596); nguồn `api/schemas_*.yaml` nằm ngoài tài liệu (28498) (B-002) |
| P-93 | Mã lỗi 200…500 | Đạt | Cột mã lỗi ở mọi dòng; 6.18.3 (28626–28727) |
| P-94 | Cursor, lọc/sắp, RFC 9457, Idempotency, rate limit, versioning, OpenAPI 3.1 | Đạt | 6.1.1–6.1.12 (25653–26008), 6.18.1 |
| P-95 | SSE/WS cho biểu quyết, điểm danh QR, thông báo | Đạt | 6.16; RT-POLL-01, RT-ATT-01, RT-NTF-01, RT-WS-01 |
| P-96 | Webhook/tích hợp tùy chọn | Đạt | 6.17 (PLT-HOOK-01…04) |

##### I. Phần 7 — Frontend (prompt 203–230)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-97 | 7.1 Audit kiến trúc FE, vấn đề có file và mức | Đạt | 28782–28991 |
| P-98 | 7.2 Thư viện, api client, refresh, optimistic update, invalidation | Đạt | 28992–30178 |
| P-99 | 7.2 Bảng ánh xạ mock → bảng/cột → endpoint; field dẫn xuất và field thiếu | Đạt | 21/21 kiểu export (20 ở `mockData.ts`, 1 ở `store.tsx`); ví dụ 29648, 29759 |
| P-100 | 7.2 Strangler, feature flag, chạy song song | Đạt | 29216–29226 (`dataSource("HOUSE")`), 30101–30103 |
| P-101 | 7.3 Bảng theo từng route: Vấn đề → Đề xuất → Lý do (BR) → MoSCoW → Công sức | Đạt | 7.3.1–7.3.16 (30223–32231), 373 dòng FX; route `/loi-nguyen` không tồn tại ở FE, ý chỉ cầu nguyện nằm ở `/phung-vu` (7.3.8) |
| P-102 | 7.4 Mobile-first, PWA, upload queue, offline, WCAG | Đạt | 32574–32756 |
| P-103 | 7.5 Phân quyền và bảo mật phía FE | Đạt | 32757–32923 |
| P-104 | 7.6 Dashboard theo vai trò, báo cáo | Đạt | 32924–33075 |
| P-105 | 7.7 Kiểm thử FE | Đạt | 33076–33232 |

##### J. Phần 8 — AI (prompt 232–264)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-106 | 8.1 Bảng 10 cột cho mỗi ứng dụng; xét ≥ 16 nhóm tác vụ | Đạt | 26 tác vụ (33289–33358), đủ 10 cột (tiêu đề bảng), phủ 16/16 nhóm đề bài |
| P-107 | 8.2 Gateway, chọn mô hình, cache, hàng đợi, ngân sách, fallback, log; DDL đầy đủ | Đạt (DDL bị chèn nội dung thừa) | 8.2.1–8.2.9; DDL 8.2.7 (33445–35068) chứa 936 lệnh `CREATE INDEX` của bảng khác (B-003) |
| P-108 | 8.3 Phân loại dữ liệu, HITL, minh bạch/opt-out, rủi ro, tự host | Đạt | 8.3.1–8.3.7 (35096–35187) |
| P-109 | 8.4 Lộ trình, chỉ số, điều kiện dừng, Top 5, "không nên dùng AI" | Đạt | 8.4.1–8.4.8 (35188–35343) |

##### K. Phần 9 và Phần 10 (prompt 266–286)

| ID | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| P-110 | 9 — Phân loại dữ liệu và biện pháp | Đạt | 9.1 (35348–35394) |
| P-111 | 9 — Cơ sở pháp lý, mẫu đồng ý, quyền chủ thể, thời hạn, rời lưu xá, sự cố rò rỉ, lưu ý "không thay tư vấn pháp lý" | Đạt | 9.2.1–9.2.8; lưu ý ở dòng 12 (cơ chế ẩn danh hóa chưa có trong DDL — B-013) |
| P-112 | 9 — OWASP, brute-force, MFA, phiên, upload, chuỗi cung ứng, secret | Đạt | 9.3 (35505–35602) |
| P-113 | 9 — Sao lưu, PITR, mã hóa, diễn tập, RPO/RTO, sự cố nhà cung cấp | Đạt | 9.4 (35603–35651) |
| P-114 | 9 — `audit_logs` và báo cáo kiểm toán | Đạt | 9.5 (35652–35740) |
| P-115 | 9 — Giám sát, xử lý sự cố, quản lý thay đổi | Đạt | 9.6 (35741–35837) |
| P-116 | 10 — Giai đoạn 0–7 đúng nội dung đề bài | Đạt | 35927–35989 |
| P-117 | 10 — Mỗi giai đoạn: mục tiêu, đầu ra, DoD, rủi ro, người-ngày, phụ thuộc | Đạt | idem; tổng theo giai đoạn cộng lại khớp (1.528 / 1.194 / 356 / 3.078) |
| P-118 | 10 — Chiến lược kiểm thử tổng thể | Đạt | 10.4 (36014–36027) |
| P-119 | 10 — Master Backlog một bảng, đủ cột, sắp theo ưu tiên | **Một phần** | 741 dòng, đủ cột; 7 mục FX "đã xử lý" không vào bảng; có hạng mục trùng phạm vi (B-004, B-005) |
| P-120 | 10 — Danh sách câu hỏi mở | Đạt | 127 mã Q (36777–36911) |
| P-121 | Mục Self-Check cuối tài liệu | **Một phần** | Có (37174–37195) nhưng 3/12 dòng ✔ khai quá (B-002, B-005, B-006) |
| P-122 | **Tinh thần chung: thực tế, chi phí thấp, đơn giản vận hành, không over-engineering** (prompt 21) | **Không đạt (QUAN ĐIỂM)** | B-001 |

---


---

## ③ BÁO CÁO PHÁT HIỆN CHI TIẾT

138 phát hiện, nhóm theo Bước 1 → 9, trong mỗi nhóm xếp S0 → S1 → BỊA ĐẶT → S2 → S3. Bảng sinh tự động từ bảng phát hiện của 7 luồng (không chép tay); 13 cặp phát hiện trùng giữa các luồng được gộp (cột **Nguồn** ghi cả hai mã); mức được chuẩn hóa theo thang của đề bài. Bằng chứng (lệnh SQL + kết quả) của từng mã nguồn nằm trong `kiem-dinh/bang-chung/<luồng>.md`.

> Trong cột *Cách sửa* và trong các mục trích nguyên văn từ bằng chứng (③.bổ sung, ④, ⑤.3, ⑤.4), các cụm "Phụ lục A/B/C", "SQL A-00x", "T1…T16", "V1…V12", "A1…Q1", "S#" trỏ tới file bằng chứng của luồng tương ứng trong `kiem-dinh/bang-chung/`; bản vá đã hợp nhất và kiểm chứng lại nằm ở file ghi trong cột **Vá**.


### Bước 1 — Tuân thủ cấu trúc & độ đầy đủ

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-001** | S1 (quan điểm) | B-001 | — | Toàn tài liệu; 2.1; 10.1 | 144, 165, 5964–5970, 35860–35876; DB catalog | "141 bảng, 58 ENUM, 174 hàm, 300 chính sách RLS, 392 endpoint…"; "phạm vi MUST ≈ 1.528 người-ngày… ≈ 135 tuần (≈ 31 tháng)" | Prompt dòng 21 yêu cầu đơn giản vận hành, không over-engineering cho vài chục–vài trăm người và đội không chuyên; tài liệu gấp đôi số bảng tối thiểu, 808 người-ngày MUST là sửa FE "đã hoàn thiện", RLS + hàm DB là cơ chế chính, chọn nền tảng theo độ phức tạp đã thiết kế | Dự án khó khởi động, khó duy trì, phụ thuộc chuyên gia PostgreSQL; rủi ro bỏ dở cao | Thêm "Phần 0b — MVP" theo phương án cắt gọn ở trên; xếp lại MUST theo giá trị/vận hành; RLS chỉ cho bảng nhạy cảm | Chắc chắn về số liệu; kết luận là quan điểm |
| **F-002** | BỊA ĐẶT | C-032 | — | SELF-CHECK | 37184 | “392 endpoint trong 24 nhóm, 500 DTO; thiếu quyền: 0; thiếu response: 0” | Phần 6 có 396 tên DTO (toàn tài liệu 402), **0 định nghĩa trường** (C-001); con số 500 không truy được | Tự kiểm báo đạt sai | Sửa dòng tự kiểm thành số đo thật và ✘ cho “schema request/response” tới khi C-001 xong | Chắc chắn |
| **F-003** | S2 | B-003 + E-010 | — | 5.5, 8.2.7 | 25238–25261, 25313–25425, 33469–33803, 33875–34215, 34262–34598, 34626–34958 | Sau `CREATE INDEX ix_ai_task_types__required_consent_purpose…` là `-- album_likes`, `CREATE INDEX ix_album_likes__member_id…` … `ix_user_roles__user_id` | Tiêu đề hứa "DDL nguyên văn" của bảng lưu trữ/AI nhưng chèn 1.030 lệnh `CREATE INDEX` của 100+ bảng khác (đuôi `21_indexes_fk.sql`, lặp 6 lần); 8.2.7 có 976 câu lệnh mà chỉ 272 khác nhau *(Trùng/bổ sung từ E-010: Bốn khối khoảng 340 dòng `CREATE INDEX` của toàn lược đồ (946 lệnh, trùng nhau 97%) bị chèn vào giữa DDL AI…)* | Phình ≈ 1.450 dòng; người đọc hiểu sai phạm vi; chạy riêng khối 8.2.7 sẽ lỗi trùng index | Chỉ giữ index thuộc bảng đang trình bày; hoặc thay bằng tham chiếu "xem file 13, 21, 38" | Chắc chắn |
| **F-004** | S2 | B-004 | — | 10.5, 10.1, chú giải | 22, 26921–26922, 36185, 36202 (BL-FIN-60), BL-FIN-23, BL-TUT-06/50 | BL-ACAD-13 "Triển khai nhóm academic của mục 6.6…" và BL-ACAD-50 "Triển khai nhóm academic của mục 6.6…" (cùng MUST L); chú giải: "Công sức… (gồm FE + BE + kiểm thử)" | Hạng mục trùng phạm vi bị cộng hai lần (ACAD-13/50: 28 ngày; FIN-23 L + FIN-60 XL; TUT-06/50); đồng thời hạng mục "Nghiệp vụ" đã gồm FE+BE theo chú giải nhưng Backlog còn mục FX (FE) và mục API (BE) riêng cho cùng tính năng | Tổng 1.528/3.078 người-ngày có thể bị thổi phồng, làm méo quyết định cắt phạm vi | Gộp các cặp trùng; định nghĩa lại công sức theo lớp (FE/BE/QA) hoặc theo tính năng, không cả hai | Chắc chắn với các cặp trùng; Nghi ngờ về mức thổi phồng |
| **F-005** | S3 | B-006 | — | 3.6, 4.5, 4.5.11, 7.3, Self-check | 8279, 8298, 8457, 8459, 12508…12681 (22 ô), 17785; 1549, 28422; 30320, 32265, 32274; 37189 | "(trưởng ban Phụng…"; "(ràng buộc…"; "Như trên"; "`--color-primary` và tương tự"; Self-check: "0 mẫu bị cấm" | Prompt dòng 38 cấm `...`; mô tả bị cắt giữa từ là placeholder do công cụ cắt cụt; Self-check khẳng định 0 | Mô tả bảng/hàm không đọc được trọn ý; Self-check thiếu tin cậy | Bỏ cắt cụt (in đủ COMMENT), thay "Như trên"/"và tương tự" bằng nội dung tường minh; sửa Self-check | Chắc chắn |
| **F-006** | S3 | B-007 | — | 3.2 ERD | 6311; 6465, 7170, 7188, 7399, 7459, 7622, 7691, 8131 | `text _14_cot_khac_xem_DDL` (expense_vouchers) | Cột giả có kiểu `text` là placeholder trong sơ đồ; 297/1.474 cột không vẽ (expense_vouchers ẩn `status`, `required_approvals`, `paid_at`…) trong khi prompt dòng 154 đòi ERD toàn diện | Ai sinh mã/ERD từ sơ đồ sẽ có cột không tồn tại; ERD không dùng độc lập được | Dùng comment Mermaid (`%%`) cho ghi chú; vẽ đủ cột ở sơ đồ chi tiết hoặc ghi rõ danh sách cột ẩn | Chắc chắn |
| **F-007** | S3 | B-008 | — | Phần 0 | 140–177 | 1.134 từ + bảng 3 cột | Prompt dòng 114 "Tối đa 1 trang" | Ban điều hành khó nắm nhanh | Rút còn ≈ 450 từ; chuyển chi tiết sang Phụ lục | Chắc chắn |
| **F-008** | S3 | B-009 | — | 4.3 | 9091; DB | "ON DELETE chọn có chủ đích, ghi trong COMMENT ON TABLE" | Chỉ 17/121 bảng có FK có COMMENT giải thích hành vi xóa; 0 `COMMENT ON CONSTRAINT`; 3 FK để mặc định NO ACTION (`settings_write_permission_fkey`, `consents_purpose_code_fkey`, `notifications_type_code_fkey`) — prompt dòng 174 | Khó rà soát lý do CASCADE/RESTRICT (93 CASCADE, 107 RESTRICT, 96 SET NULL) | Thêm `COMMENT ON CONSTRAINT` hoặc bảng lý do ON DELETE theo FK; khai tường minh 3 FK còn lại | Chắc chắn |
| **F-009** | S3 | B-017 | — | 1.13 ↔ 4.3 | 5342–5343; prompt dòng 176 | MEAL "COULD… mặc định tắt"; INV "COULD"; DDL vẫn có `meal_menus`, `meal_menu_cooks`, `meal_registrations`, `pantry_items` | Prompt chỉ yêu cầu bảng cho phân hệ mới xếp MUST/SHOULD | Tăng bề mặt DDL/RLS phải duy trì | Ghi rõ ngoại lệ (FE `/bep-com` và `store.tsx:91–94` đã có dữ liệu bếp) hoặc tách ra migration tùy chọn | Nghi ngờ (có lý do FE parity) |

### Bước 2 — Độ phủ FE ↔ DB ↔ API

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-010** | BỊA ĐẶT | A-001 | — | Phần 6 — 6.3.1 (MEM-CAT-03) và 6.3.4 | dòng 26360 (cột Ghi chú MEM-CAT-03); dòng 26409 | “Thay danh sách giáo phận cứng trong Modals.tsx”; “Chọn giáo phận (`Modals.tsx`) \| Danh sách cứng” | FE không có ô chọn/danh sách giáo phận ở bất kỳ tệp nào: modal addMember chỉ có họ tên, phòng, SĐT, vai trò, ảnh (components/Modals.tsx:616-623); `diocese` chỉ được HIỂN THỊ ở components/MemberCVModal.tsx:241-242 và lib/zaloShare.ts:147. Commit cũ e4ba5fb cũng không có (`git show e4ba5fb:src/components/Modals.tsx \| grep -ci "giáo phận"` = 0) | Đội FE đi tìm “danh sách cứng” không tồn tại; ước lượng FX sai; làm giảm độ tin cậy của toàn bộ cột “Hiện trạng” | Dòng 26360: “Phục vụ ô chọn giáo phận MỚI của form hồ sơ Công giáo (FE hiện chỉ hiển thị chuỗi Member.diocese ở MemberCVModal.tsx:241-242)”. Dòng 26409: “Ô chọn giáo phận `[ĐỀ XUẤT]` \| Chưa có (diocese là chuỗi tự do, không có ô nhập) \| MEM-CAT-03” | Chắc chắn |
| **F-011** | S2 | A-002 | 74 | 7.2.4.8, 7.2.4.10, 7.2.4.15 (mâu thuẫn với 7.3.x, Phụ lục A, B.4) | 29695, 29710, 29789, 29969 ↔ 31876, 36959 (GD-COM-75), 37168 | 7.2.4: “`authorRole` … derived: positions.name … API suy từ chức danh đang hiệu lực (member_positions)”; B.4: “`PersonRefDto` chưa có chức danh” | Hai chỗ khẳng định ngược nhau; theo hợp đồng API (PersonRefDto = member_id, display_name, room_code — 36221) thì 3 trường FE `Announcement.authorRole` (lib/mockData.ts:84), `ForumThread.authorRole` (:110), `MomentAlbum.authorRole` (:1038) **không có endpoint nào trả**. DB cũng không có view “chức danh hiện hành” (catalog chỉ có v_member_current_room) | Mất nhãn “Trưởng nhà/Phó nhà” đang hiển thị cạnh tác giả (components/Modals.tsx:207; app/thong-bao/page.tsx:42, 216; dien-dan, khoanh-khac); BE và FE triển khai theo hai cách hiểu khác nhau | Thêm view `v_member_current_position` (SQL A-002, đã chạy thử) và trường `position_label` (nullable) vào `PersonRefDto` dùng ở COM-ANN-01/03, COM-FOR-01/03/06, MOM-ALB-01/03; hoặc sửa 4 dòng 7.2.4 thành “THIẾU API (GD-COM-75)” | Chắc chắn |
| **F-012** | S2 · THIẾU | A-003 | 74 | 4.7.2 (seed 51), 7.2.4.13, 7.2.4.17 T-01..T-03, B.4 | 20256-20302; 29908-29916; 30008-30010; 37154 | “[THIẾU DB] seed 51_seed_settings.sql chưa có khóa org.house_name …” | Tab Cài đặt chung có 10 trường (app/cai-dat/page.tsx:84-93); DB chỉ phủ `fundRate` (finance.monthly_dues_vnd) và `bankAccount` (funds). 8 trường (houseName, motto, houseAddress, patronFeast, mealRate, lunchCutoff, dinnerCutoff, nightPrayerTime) + 3 giá trị cứng của sơ yếu lý lịch không có khóa. Bảng `settings` chỉ có policy SELECT/UPDATE cho `luuxa_app` (catalog_policies.txt:869-874), **không có INSERT** ⇒ PATCH /settings (PLT-SET-02) không thể tạo khóa; chỉ migration mới thêm được. Tài liệu tự khai nhưng DDL “sẵn sàng triển khai” vẫn thiếu | Khi bỏ localStorage, nút ‘Lưu tất cả thay đổi’ chỉ lưu được 1/10 trường; MemberCVModal, trang chờ duyệt vẫn phải cứng tên, địa chỉ, hotline (đang lệch nhau: ‘Số 42 ngõ 180’ ↔ ‘Ngõ 68’) | Thêm 11 khóa vào `51_seed_settings.sql` (SQL A-003/A-004 — đã chạy thử, settings 45 → 59 dòng, mọi kiểm tra `ck_settings__*` và `tg_settings_validate` đều qua) | Chắc chắn |
| **F-013** | S2 · THIẾU | A-004 | 74 | 7.2.4.13; 6.14 PLT-NTF/PLT-BND; 6.17.3; B.4 | 29918-29922; 28118-28119, 28134; 28473-28478; 37158 | “telegramSync … `notification_preferences.enabled` … Bot Token và Chat ID chung nằm ở bí mật của backend” | FE là bot **cấp nhà gửi vào nhóm**: ‘Group Chat ID -100192847192 (Nhóm Chung Lưu Xá)’, 5 công tắc cấp nhà, nút ‘Kiểm tra gửi tin nhắn Bot’ (app/cai-dat/page.tsx:96-100, 508, 799-816, 823-841). Tài liệu đổi thành tùy chọn của **từng thành viên** (`notification_preferences` UNIQUE member_id+category+channel) và DM qua `member_channel_bindings` ⇒ không còn chỗ lưu chat ID nhóm, công tắc cấp nhà, không có endpoint gửi thử; `reportMealSummary` không có notification_type nhóm `meal` (notification_types chỉ có 9 nhóm, không có meal). 7.2.4 không có dòng cho Bot Token/Group Chat ID/nút gửi thử | Tab Telegram mất toàn bộ chức năng khi nối API; Ban điều hành mất nhắc nhóm 06:30, chốt cơm 09:00/15:00, cảnh báo hỏng hóc | Chọn một: (a) ghi ADR bỏ bot nhóm và đổi UI thành tùy chọn cá nhân; (b) giữ bot nhóm: thêm 3 khóa `integration.telegram.group_enabled / group_chat_id / group_events` (SQL A-003/A-004), endpoint `POST /api/v1/integrations/telegram/test` (quyền `setting.write`, 3 lần/phút, gửi 1 tin cố định qua worker, trả 202) và loại `meal.registration_closed` khi bật MEAL; thêm 3 dòng vào 7.2.4.13 | Chắc chắn |
| **F-014** | S2 | A-005 | 74 | DDL trigger `trg_forum_comments__count` (khối 16848) ↔ BR-COM-31 (4491) | 16846-16848; 29713; 4170 (R-DB-C5); 37169 | “comments_count/reactions_count do trigger duy trì” | `tg_adjust_counter` chỉ chạy AFTER INSERT OR DELETE; xóa mềm (`deleted_at`) và ẩn (`status='hidden'`) không giảm bộ đếm. **Đã chạy thật** (BEGIN…ROLLBACK): sau insert = 1, sau xóa mềm = 1, sau ẩn = 1. Vi phạm chính BR-COM-31 “bộ đếm bình luận phải loại bình luận đã xóa”; tài liệu đã biết (4170, 37169) nhưng không có SQL vá | `ForumThread.repliesCount` (app/dien-dan/page.tsx:198) luôn lớn hơn số bình luận nhìn thấy; lệch tích lũy | SQL A-005/A-006 (đã chạy thật: 1 → 0 → khôi phục 1 → ẩn rồi xóa cứng 0) + câu đếm lại một lần | Chắc chắn |
| **F-015** | S2 | A-006 | 74 | DDL trigger `trg_album_photos__count` (16837-16839); MOM-PHO-03 | 16839; 27664; 29787 | “photos_count do trigger duy trì”; MOM-PHO-03 “deleted=true đặt deleted_at” | Như A-005 cho ảnh album: xóa mềm qua MOM-PHO-03 hoặc ẩn do kiểm duyệt không giảm `albums.photos_count`. **Đã chạy thật**: sau insert = 1, sau xóa mềm = 1. Tài liệu không nhận diện lỗi này | Số ảnh trên thẻ album, KPI ‘Bức ảnh lưu giữ’ (app/khoanh-khac/page.tsx:690-700) và facets MOM-ALB-06 sai dần | SQL A-005/A-006 (đã chạy thật: 1 → 0) | Chắc chắn |
| **F-016** | S2 | A-007 | — | 7.2.4.17 | 30017 | “Không phát hiện trường FE nào thiếu endpoint tương ứng: 185 mã endpoint đã được tham chiếu và đều tồn tại” | Mâu thuẫn chính tài liệu: authorRole không có API (A-002), nhóm Telegram + gửi thử (B.4 37158), sinh nhật (B.4 37157), ‘Khôi phục’ cấu hình (A-012), ‘Mua thêm’/khảo sát món (A-018) | Người đọc tin FE đã phủ 100% ⇒ bỏ sót hạng mục khi lập backlog và nghiệm thu | Thay câu bằng danh sách “Trường/chức năng FE chưa có endpoint” (5 mục trên) và thêm T-09…T-13 vào bảng 7.2.4.17 | Chắc chắn |
| **F-017** | S3 | A-010 | — | Phụ lục B.4 | 37155, 37156 (đối chiếu 26177, 28117, 30873) | “Đã bổ sung trường `pending_applications` của `BadgesDto`”; “Đã bổ sung trường `server_time` của `MeDto`” | Phần 6 không có: AUTH-ME-01 (26177) không nhắc `server_time`; PLT-BDG-01 (28117) không nhắc `pending_applications`; 6.18 không định nghĩa schema hai DTO; 30873 vẫn ghi “đề nghị thêm `server_time` vào AUTH-ME-01” | BE tin đã có trong hợp đồng ⇒ huy hiệu đơn chờ duyệt và “hôm nay” của /hau-can không có nguồn | Thêm vào cột Response AUTH-ME-01: `MeDto.server_time: string(date-time)`; PLT-BDG-01: `BadgesDto.pending_applications: integer\|null` (chỉ người có quyền duyệt đơn); sửa câu 30873 | Chắc chắn |
| **F-018** | S3 | A-011 | — | 7.2.4.4 | 29524-29527 | “FE giữ ở state cục bộ và không gửi vào checkInCleaningDuty” | Sai: app/hau-can/page.tsx:240-249 ghép 4 ô thành chuỗi (‘Đã cọ rửa sàn/bồn · Đã gom và đổ rác · …’) nối vào `note` rồi gọi `checkInCleaningDuty`. Nhãn FE (‘Cọ rửa sàn & bồn’, ‘Gom & đổ rác sạch’, ‘Lau kính & tay vịn’, ‘Bổ sung xà phòng’ — dòng 1005-1045) khác nhãn seed DB (‘Lau / cọ sàn & bồn’, …, ‘Bổ sung vật tư (xà phòng, giấy, túi rác)’) mà tài liệu gán là nhãn FE | Di trú/ETL bỏ qua dữ liệu tiêu chí đang nằm trong `note`; UI đổi nhãn bất ngờ | Sửa ghi chú: “FE hiện gửi dạng văn bản trong note; khi nối API gửi `items[{template_item_code, is_done}]`, nhãn lấy từ `checklist_template_items.label`” | Chắc chắn |
| **F-019** | S3 · THIẾU | A-012 | 74 | (không có trong tài liệu) | FE: app/cai-dat/page.tsx:147-164, 300-305 | nút ‘Khôi phục’ của tab Cài đặt chung | `settings` không có cột giá trị mặc định, không có endpoint khôi phục; 7.2.4.13 và B.4 không nhắc | Sau khi bỏ hằng cứng ở FE, nút ‘Khôi phục’ không có nguồn dữ liệu | SQL A-012 (cột `default_value` + CHECK cùng kiểu JSON — đã chạy thử) và endpoint `POST /api/v1/settings/{key}/reset` (quyền = `write_permission` của khóa, ghi audit); hoặc bỏ nút khỏi FE | Chắc chắn (về thiếu); cách sửa là đề xuất |
| **F-020** | S3 | A-013 | — | 7.2.4.5, 7.2.4.6, 7.2.4.7 | 29562, 29608, 29661 | “room … derived: v_member_current_room.room_code” | Contribution, AcademicRecord, EventCheckInRecord là bản ghi theo thời điểm; `v_member_current_room` chỉ có phòng hiện tại (cột since). Sau khi chuyển phòng, điểm danh/đóng quỹ của kỳ trước sẽ hiện phòng mới | Báo cáo theo phòng của kỳ cũ sai | API nối `room_assignments` theo ngày của bản ghi: `LEFT JOIN room_assignments ra ON ra.member_id = x.member_id AND <ngày bản ghi> BETWEEN ra.starts_on AND COALESCE(ra.ends_on, 'infinity') LEFT JOIN rooms r ON r.id = ra.room_id` (ngày = `events.starts_at::date` / `contributions.due_date` / `semesters.ends_on`); sửa 3 dòng ánh xạ | Chắc chắn |
| **F-021** | S3 | A-014 | — | 7.2.4.8 | 29714 | “`likesCount` → `forum_posts.reactions_count`” | `ux_forum_reactions__post` = (post_id, member_id, kind), kind ∈ {heart, thumbs_up, pray} ⇒ một người góp tối đa 3 vào `reactions_count`; FE chỉ có một nút tim (app/dien-dan/page.tsx:201-208) | likesCount có thể lớn hơn số người thích | COM-FOR-09: nút tim chỉ gửi `kind='heart'`; DTO trả `reactions_by_kind` và FE hiển thị `heart`; hoặc ghi rõ likesCount = COUNT(*) FILTER (WHERE kind='heart') | Chắc chắn |
| **F-022** | S3 | A-015 | — | 7.2.4.17 | 30017 | “185 mã endpoint đã được tham chiếu” | Đếm lại 29360-30016: 194 mã endpoint khác nhau (loại BR/BL/FX/GD/Q) | Số liệu tự kiểm sai | Sửa thành 194 hoặc sinh tự động | Chắc chắn |
| **F-023** | S3 | A-016 | — | 4.7.4 | 21125 | “bỏ trường dẫn xuất (`status` ‘Đã đóng’, `balance`, `gpa`…)” | mockData không có trường `balance` hay `gpa`; có `fundBalance` trong store (lib/store.tsx:326) và `gpa10`/`gpa4` (lib/mockData.ts:1320-1321) | Script ETL viết theo tên không tồn tại | “bỏ `Contribution.status`, `fundBalance` (store), `AcademicRecord.gpa10/gpa4/rank`, `SubjectScore.totalScore/letterGrade`” | Chắc chắn |
| **F-024** | S3 | A-017 | — | 7.2.4, 7.2.4.18 | 30028 | “Dữ liệu cứng ngoài store \| 22 cấu trúc \| 116 dòng” (ngụ ý phủ đủ) | Không có dòng cho `rsvpState` (app/lich-su-kien/page.tsx:89 — ‘tham-du’/‘vang’/‘chua-ro’), `confirmedAnns` (app/thong-bao/page.tsx:38), Bot Token / Group Chat ID / nút gửi thử (app/cai-dat/page.tsx:799-816). Endpoint thì có (EVT-PAR-03, COM-ANN-05) nhưng thiếu bảng tra giá trị | Thiếu ánh xạ RSVP FE → DB (`event_participants.rsvp` ck none/going/maybe/not_going) | Thêm thực thể EventRsvp (tham-du→going, vang→not_going, chua-ro→maybe; EVT-PAR-03), AnnouncementAck (`announcement_reads.acknowledged_at`, COM-ANN-05 `acknowledge=true`, hoặc EVT-PAR-03 khi `announcements.event_id` có giá trị) và 3 dòng Telegram vào 7.2.4.13 | Chắc chắn |
| **F-025** | S3 · THIẾU | A-018 | — | 7.2.4.11 | 29838-29848 (không có dòng) | — | FE /bep-com có ‘+ Đề xuất mua thêm gia vị’, ‘Mua thêm’ từng mặt hàng (app/bep-com/page.tsx:598-605, 637-644), ‘Gửi phiếu khảo sát món ăn’, ‘Gửi lời khen/góp ý cho bữa ăn’ (513-518, 573-579) — chỉ toast; DB không có bảng danh sách cần mua hay phản hồi bữa ăn; tài liệu chỉ nhắc BL-MEAL-03 ở Phần 1 (4605) | Khi bật lại phân hệ Bếp (`feature.meals.enabled`), các nút không có backend | Ghi “THIẾU DB+API — phân hệ tạm hoãn” trong 7.2.4.11; khi bật lại dùng SQL A-018 (đã chạy thử) + endpoint `POST/PATCH /api/v1/facilities/pantry-items/{id}/restock-requests`, `PUT /api/v1/meals/menus/{menuId}/feedback` | Chắc chắn (về thiếu); thiết kế là đề xuất |

### Bước 3 — DDL như trình biên dịch (chạy thật)

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-026** | S0 | G-01 | 70 | 4.6.6 `49_b_grants.sql` | dòng 8 (tài liệu ≈19832) | `GRANT USAGE ON SCHEMA app TO luuxa_app, luuxa_worker, luuxa_readonly, luuxa_auth, luuxa_definer;` — thiếu `luuxa_owner` (trong khi dòng 129 lại `GRANT EXECUTE … TO … luuxa_owner`) | PostgreSQL chạy truy vấn kiểm tra khóa ngoại (RI) dưới quyền **chủ bảng được tham chiếu** (`luuxa_owner`). Khi lập kế hoạch truy vấn RI, planner nạp biểu thức của index `ix_members__search` (`app.norm_text(...)`) và inline hàm SQL → cần USAGE trên schema `app` → `permission denied for schema app`. Kết quả phụ thuộc relcache của từng backend (đã có ai lập kế hoạch bảng đó dưới vai trò có quyền chưa; autovacuum làm mất hiệu lực relcache sẽ tái phát). 7 bảng bị ảnh hưởng: members, albums, announcements, assets, forum_posts, maintenance_issues, policy_documents. | Đã tái hiện: (1) Phó nhà xếp phòng trên kết nối mới → lỗi; (2) thành viên lập phiếu chi có `paid_by_member_id` → lỗi; (3) **superuser** INSERT consents trên kết nối mới → lỗi. Cùng lệnh sau khi `SELECT count(*) FROM members` → thành công. Lỗi 500 chập chờn cho mọi thao tác ghi có FK tới 7 bảng trên (phân phòng, trực nhật, điểm, phiếu chi, bình luận diễn đàn, đã đọc thông báo…). Smoke test không bắt được vì một phiên superuser. | `GRANT USAGE ON SCHEMA app TO luuxa_owner;` (thêm vào 49_b). Bổ sung kiểm thử bất biến: mọi vai trò sở hữu bảng phải có USAGE trên mọi schema chứa hàm dùng trong biểu thức index. | Chắc chắn (đã chạy) |
| **F-027** | S1 | G-02 | 70 | 4.5.1 `30_fn_core.sql` 4.5.5; 4.3.10 `12_tables_platform.sql`; 4.6.6 `49_a` | `app.ensure_monthly_partitions` (SECURITY DEFINER, chủ = luuxa_owner); `12_tables_platform.sql` dòng 37–43 | `CREATE TABLE audit_logs_2026_10 … audit_logs_2027_03` (hard-code); `ALTER FUNCTION app.ensure_monthly_partitions(regclass,integer) OWNER TO luuxa_owner;` | `luuxa_owner` không có CREATE trên schema `public` → hàm thất bại với MỌI người gọi, kể cả superuser (đã chạy: `permission denied for schema public … line 22 at EXECUTE`). Phân vùng được viết cứng 6 tháng (10/2026–03/2027) theo ngày lập tài liệu, không theo ngày triển khai. | (1) Bước hậu triển khai (4.0) "chạy `app.ensure_monthly_partitions('public.audit_logs', 6)`" thất bại; (2) `app.fn_housekeeping()` (worker, hằng giờ) gọi hàm này với 3 tháng tới → từ **01/2027** (cần phân vùng 2027-04) toàn bộ job dọn dẹp rollback mỗi lần chạy: token/idempotency/tệp mồ côi/đóng poll quá hạn/hết hạn đơn đổi ca đều ngừng; (3) từ 04/2027 mọi audit rơi vào `audit_logs_default`; khi sửa job, tạo phân vùng tháng đã có dữ liệu trong default sẽ lỗi (phải di chuyển dữ liệu). Nếu triển khai sau 03/2027, ngay từ ngày đầu audit đã vào default. | `GRANT USAGE, CREATE ON SCHEMA public TO luuxa_owner;` + thay 6 lệnh CREATE TABLE cứng bằng `SELECT app.ensure_monthly_partitions('public.audit_logs', 6);` chạy lúc migration; tách `ensure_monthly_partitions` khỏi giao dịch của `fn_housekeeping` (bắt lỗi riêng, cảnh báo). | Chắc chắn (đã chạy) |
| **F-028** | S1 | G-03 | 70+75 | 4.5.6 `35_fn_finance_ledger.sql` 4.5.31 + 4.5.33 | `app.tg_ledger_entry_before_insert()` dòng 90–97; `app.fn_close_period()` dòng 356 | Trigger đọc `financial_periods.status` KHÔNG khóa rồi mới `SELECT … FROM funds … FOR UPDATE`; `fn_close_period` khóa kỳ `FOR UPDATE` nhưng không khóa funds | Hai thao tác lấy khóa theo thứ tự khác nhau và kiểm tra trạng thái kỳ trước khi chờ khóa → TOCTOU. | R-01b: bút toán chi lọt vào kỳ đã chốt; `period_fund_balances` (số dư in trên báo cáo chốt sổ, kèm head_hash) sai so với sổ cái; BR-FIN-06 bị vi phạm. | Thống nhất thứ tự khóa funds → kỳ: trigger khóa funds trước rồi đọc kỳ `FOR SHARE`; `fn_close_period` khóa tất cả funds đang dùng (`ORDER BY id FOR UPDATE`) trước khi khóa kỳ. Bản sửa đầy đủ ở ⑥. | Chắc chắn (đã chạy) |
| **F-029** | S2 | G-04 | 70 | 4.5.1 `30_fn_core.sql` 4.5.6 | `app.tg_room_assignment_rules()` | Đếm `v_peak` từ `room_assignments` không có khóa nào | Hai giao dịch cùng thấy phòng còn 1 chỗ. | R-02: phòng 2 chỗ có 3 người — đúng lỗi mà commit FE `740ac5d` ("enforce room capacity") muốn chặn. | `PERFORM pg_advisory_xact_lock(hashtextextended('room_assign:'\|\|NEW.room_id::text,0));` đầu trigger (khóa theo phòng, tuần tự hóa). | Chắc chắn (đã chạy) |
| **F-030** | S2 | G-05 + N-08 | 70 | 4.5.5 `34_fn_events.sql`; 4.6.6 `49_b` | `app.tg_poll_vote_rules()`; GRANT INSERT/DELETE poll_votes cho luuxa_app | Khóa advisory chỉ nằm trong `fn_cast_vote` (SECURITY INVOKER), còn luuxa_app INSERT trực tiếp được | Ràng buộc "tối đa max_choices" chỉ đúng khi mọi đường ghi đều qua hàm. *(Trùng/bổ sung từ N-08: Khóa chỉ trong hàm; policy vẫn cho INSERT trực tiếp và trigger đếm theo snapshot. C3 (2 kết nối): 2 phiếu trong poll 1 lựa chọn…)* | R-04: poll một lựa chọn ghi nhận 2 phiếu của cùng người → kết quả biểu quyết sai. | Đưa cùng khóa advisory vào trigger `tg_poll_vote_rules` (khóa advisory tái nhập được trong cùng transaction nên không xung đột với fn_cast_vote). | Chắc chắn (đã chạy) |
| **F-031** | S2 (quan điểm) + S3 (thông báo lỗi) | G-07 | 70+75 | 4.5.4 `33_fn_academic.sql` 4.5.61; 4.3.5 `07_tables_academic.sql` | `app.tg_grade_record_compute()`; `ck_grade_records__has_score CHECK (final_score IS NOT NULL OR official_total_score IS NOT NULL)` | `v_total := (NEW.process_score * … + NEW.final_score * …)/100.0` rồi tra bậc `min_score <= v_total` | Thiết kế CỐ Ý không cho lưu dòng chỉ có điểm giữa kỳ (CHECK), nhưng trigger BEFORE chạy trước CHECK và ném lỗi khó hiểu "chưa có bậc điểm chữ phù hợp cho điểm <NULL>". Đề bài (Bước 3.4) yêu cầu xét "chưa có điểm cuối kỳ"; thực tế sinh viên biết điểm giữa kỳ trước cả tháng. Khi `process_score` NULL thì tổng kết = 100% điểm cuối kỳ — quy tắc ngầm, không cấu hình. | KB3: không lưu được điểm giữa kỳ trước khi có điểm cuối kỳ (FE có hai ô riêng); thông báo lỗi khó hiểu. | Khuyến nghị: cho phép lưu nháp khi có ít nhất một loại điểm; tổng kết NULL ⇒ letter/gpa/is_pass NULL, counts_in_gpa = false; chặn nộp nếu còn môn thiếu tổng kết. Bản sửa ở ⑥ (đã kiểm T07). | Chắc chắn (đã chạy) |
| **F-032** | S2 | G-08 | 70 | 4.5.4 `33_fn_academic.sql` 4.5.60 | `trg_academic_records__state` | `"verified":["draft"]` và `tg_academic_record_rules` không kiểm quyền khi verified → draft | Chính chủ tự hủy trạng thái "đã xác minh" rồi sửa điểm, nộp lại; dấu xác minh bị xóa (verified_by/at = NULL). | KB3: m1 đưa bảng điểm đã được Phó nhà xác minh về nháp. Audit vẫn còn (4 dòng grade_records) nên không mất dấu vết, nhưng quy trình xác minh mất tác dụng cho học bổng/xếp loại. | Chỉ người có `academic.verify` (khác chính chủ) được mở lại bảng điểm `verified`; chính chủ gửi yêu cầu chỉnh sửa. Quyết định nghiệp vụ — xem ⑧. | Chắc chắn (đã chạy) |
| **F-033** | S2 | G-09 + N-14 | 70+75 | 4.5.1 `30_fn_core.sql` 4.5.6 + 4.3.2 | `members.deleted_at` vs `app.tg_member_leave_effects()` | Hiệu ứng rời lưu xá chỉ gắn với `UPDATE OF status` | Xóa mềm (`deleted_at`) không kéo theo khóa tài khoản, kết thúc phòng, hủy lịch tương lai; `status='left'` thì khóa tài khoản + kết thúc phòng nhưng vẫn KHÔNG gỡ ca trực/lượt giặt tương lai. *(Trùng/bổ sung từ N-14: D5 ca trực tương lai còn tên người rời (worker sẽ đánh `missed` −5); L3 lượt giặt tương lai còn `booked`; I1 Thủ quỹ alumni còn quyền chi (đã ghi nhận BR-MEM-18); ủy quyền do/cho người rời còn sống…)* | KB8: m2 bị xóa mềm vẫn `users.status = active`, vẫn đăng nhập đọc phiếu chi/lượt giặt của mình, `current_member_id()` = NULL (mọi chức năng hỏng nửa vời), vẫn có ca trực ngày mai. | Ràng buộc `CHECK (deleted_at IS NULL OR status IN ('left','alumni'))` + mở rộng hiệu ứng rời lưu xá (hủy lượt giặt tương lai, báo Phó nhà các ca tương lai). | Chắc chắn (đã chạy) |
| **F-034** | S2 | G-10 | 70 | 4.3 Khối 3 | 30+ FK `ON DELETE CASCADE` từ `members` sang `consents`, `policy_acknowledgements`, `poll_votes`, `prayer_intention_authors`, `data_subject_requests`… | `consents.member_id … ON DELETE CASCADE` | Xóa cứng hồ sơ (chỉ worker/superuser làm được vì luuxa_app không có policy DELETE trên members) sẽ xóa luôn **bằng chứng đồng ý** và **yêu cầu của chủ thể dữ liệu** — thứ cần giữ để chứng minh tuân thủ NĐ 13/2023; xóa poll_votes làm đổi kết quả biểu quyết đã đóng. | Mất bằng chứng pháp lý khi chạy script xóa dữ liệu. | Đổi `consents`, `data_subject_requests`, `policy_acknowledgements`, `poll_votes` sang `ON DELETE RESTRICT`; quy trình xóa = ẩn danh hóa (giữ khóa). | Chắc chắn (đọc catalog) |
| **F-035** | S2 | G-13 | — | 4.8 Smoke test | `60_smoke_tests.sql` dòng 7 `BEGIN;` … `ROLLBACK` | Một transaction, một phiên | Không phát hiện được G-01…G-06 (đã chứng minh). | Khẳng định "đã kiểm chứng" ở Phần 0/4.8 rộng hơn phạm vi thực. | Bổ sung bộ kiểm thử đa phiên (⑦) vào CI. | Chắc chắn |
| **F-036** | S3 (tài liệu đã tự ghi nhận, dòng 4512) | G-06 + N-09 | 70 | 4.5.8 `37_fn_facilities_community.sql` | `app.tg_laundry_booking_rules()` | `SELECT COUNT(*) INTO v_week_count … ` không khóa | Như G-04. *(Trùng/bổ sung từ N-09: Xác nhận C2: 4 lượt/tuần với hạn mức 3…)* | R-03: hạn mức 3 lượt/tuần → 4 lượt. Ảnh hưởng công bằng, không mất tiền. | Khóa advisory theo (member, tuần). | Chắc chắn (đã chạy) |
| **F-037** | S3 | G-11 | 70 | 4.5.1 `30_fn_core.sql` | `app.tg_member_leave_effects()` không SECURITY DEFINER | `UPDATE public.users SET status = 'disabled' …` chạy dưới RLS người gọi | Nếu Ban điều hành cấu hình một vai trò có `member.status.change` nhưng không có `auth.user.manage`, UPDATE users bị RLS lọc 0 dòng, không lỗi → tài khoản người rời vẫn hoạt động. Hiện chỉ house_head có cả hai quyền nên chưa lộ. | Rủi ro tiềm ẩn khi đổi ma trận quyền. | Đặt SECURITY DEFINER + `SET search_path`, chủ = luuxa_definer. | Chắc chắn (đọc + thử) |
| **F-038** | S3 | G-12 | — | 4.3 Khối 3 | unique không partial trên bảng xóa mềm: `ux_universities__code`, `ux_funds__code`, `ux_members__user_id`, `ux_storage_files__bucket_key`, `ux_album_photos__file` | — | Đa số là chủ ý (mã không tái sử dụng); riêng `universities.code` xóa mềm rồi tạo lại sẽ vướng. | Nhỏ. | Partial `WHERE deleted_at IS NULL` cho universities; ghi COMMENT lý do cho các bảng còn lại. | Chắc chắn |
| **F-039** | S3 | G-14 | — | 4.3.10 | `audit_logs` phân vùng tháng | — | Với ~150 người, audit vài chục nghìn dòng/tháng — phân vùng không cần thiết ở quy mô này, nhưng tạo ra G-02. | Độ phức tạp vận hành. | Quan điểm: bỏ phân vùng ở giai đoạn đầu, dùng index BRIN theo `occurred_at`, xem lại khi > 10 triệu dòng. | Quan điểm |

### Bước 4 — Logic nghiệp vụ & kiểm soát nội bộ

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-040** | S0 | N-02 | 75 | 1.1 ủy quyền; BR-AUTH-06/17; BR-FIN-01/35 | Dòng 556, 591, 306 (#18); policy `role_delegations__insert__delegator`; `user_roles_of`; `tg_expense_approval_rules` | "Người nhận ủy quyền … vẫn bị ràng buộc cùng quy tắc: … không tự duyệt phiếu của mình" | BR-FIN-01 chỉ so người ký với người lập/người ứng; vai trò có được do chính người lập ủy quyền vẫn ký được. Thủ quỹ tự tạo ủy quyền `treasurer` cho m2 (không ai duyệt, `approved_by` NULL), m2 ký phiếu hoàn ứng 200k của Thủ quỹ, Thủ quỹ tự ghi chi cho mình (C1–C3: `paid`) *(Kiểm định chính: theo thang đề bài, sai nghiệp vụ gây mất/sai tiền ⇒ S0; đã tái hiện bằng T10–T12 của 80_concurrency_tests.js.)* | Thủ quỹ + một thành viên bất kỳ rút tiền lặp lại không qua Trưởng nhà (kết hợp tách phiếu ≤ 200k); tương tự Trưởng nhà ủy quyền `house_head` cho người thân tín để duyệt phiếu < 1tr của mình. Tài liệu chỉ ghi "approved_by chưa kiểm — Trung bình" | vá N-02: trigger `trg_expense_approvals__sod`: từ chối chữ ký `approved` khi vai trò ký chỉ có qua ủy quyền mà người ủy quyền là người lập/người ứng của phiếu. Đã thử: BLOCKED; smoke pass. Kèm BR-AUTH-17 (ủy quyền vai trò tài chính chỉ hiệu lực khi `approved_by` ≠ delegator). Đánh đổi: không còn dùng ủy quyền để "giải" N-01 — đã có vá N-01 thay thế | Chắc chắn |
| **F-041** | S0 | N-03 | 75 | 1.7.4.9 chốt sổ; BR-FIN-06/08/18 | Dòng 3186, 2702; `app.ensure_period`, `tg_ledger_entry_before_insert` (35_fn_finance_ledger.sql), `fn_pay_expense`, `fn_post_ledger_entry` | BR-FIN-06 "Kỳ tài chính đã chốt … bị khóa: không ghi bút toán mới vào kỳ" | Khóa dựa vào dòng `financial_periods`; tháng không có bút toán (không có dòng kỳ) — kể cả tháng TRƯỚC kỳ đã chốt — được `ensure_period` tạo mới `open` và nhận bút toán. E2: Trưởng nhà ghi điều chỉnh chi 3tr ngày 04/06 khi 08/2026 đã `closed`; E3: Thủ quỹ ghi chi phiếu duyệt 03/10 với `paid_on` 06/07 *(Kiểm định chính: theo thang đề bài, sai nghiệp vụ gây mất/sai tiền ⇒ S0; đã tái hiện bằng T10–T12 của 80_concurrency_tests.js.)* | Kỳ 08/2026 đã ký: ảnh chụp cuối kỳ 8.000.000 đ, sổ cái tính lại 4.850.000 đ; số dư đầu kỳ tính lại −3.150.000 đ (âm theo ngày, né BR-FIN-07). Báo cáo đã công bố không còn khớp; một người làm được | vá N-03: trigger `trg_ledger_entries__backdate` (chạy trước `__chain`) từ chối `entry_date` thuộc tháng ≤ tháng lớn nhất có `status <> 'open'`. Đã thử: E2 BLOCKED, ghi kỳ hiện tại OK; smoke pass. Kèm vá N-19 (N-19) | Chắc chắn |
| **F-042** | S0 | N-05 | 75 | BR-FIN-14, BR-FIN-31 | Dòng 3194; `49_b_grants.sql:48` `GRANT INSERT (plan_id, member_id, amount_due_vnd, due_date, note) ON contributions`; policy `contributions__insert` (plan.manage) | "Chỉ người có quyền finance.contribution.waive (Trưởng nhà) được đặt miễn/giảm khoản phải thu" | `amount_due_vnd` được INSERT tự do; trigger chỉ kiểm `discount_vnd`. H1: Thủ quỹ chèn khoản 0 đ cho m1 ⇒ `waived`, `discount_approved_by` NULL; H2: 1.000 đ; `fn_generate_contributions` (ON CONFLICT DO NOTHING) giữ nguyên *(Kiểm định chính: theo thang đề bài, sai nghiệp vụ gây mất/sai tiền ⇒ S0; đã tái hiện bằng T10–T12 của 80_concurrency_tests.js.)* | Thủ quỹ một mình miễn quỹ cho bản thân/người thân mỗi tháng (tạo kế hoạch → chèn 0 đ → sinh cho người khác); báo cáo hiển thị "miễn" như hợp lệ | vá N-05: trigger `trg_contributions__amount_from_plan` từ chối `amount_due_vnd ≠ plan.amount_vnd` khi người gọi thiếu `finance.contribution.waive`. Đã thử: H1 BLOCKED, generate OK; smoke pass. Phương án khác: bỏ `amount_due_vnd` khỏi GRANT INSERT, luôn lấy từ kế hoạch | Chắc chắn |
| **F-043** | S2 | N-01 | 75 | 1.7.4.5; BR-FIN-01/02/17; R-DB-09 | Tài liệu dòng 2879, 2721, 2883; `tg_expense_approval_rules`, `tg_expense_approval_apply` (36_fn_finance_flows.sql) | "1 (dưới ngưỡng 2 chữ ký) — Trưởng nhà (mọi mức) hoặc Thủ quỹ (phiếu đến … 200.000 đ)" | Khi Trưởng nhà là người lập hoặc người ứng và 200.000 < số tiền < 1.000.000 đ: Trưởng nhà bị BR-FIN-01, Thủ quỹ bị BR-FIN-17, Phó nhà bị BR-FIN-02 ⇒ không ai ký được. Ngoại lệ chống bế tắc của `tg_expense_approval_apply` chỉ áp cho `required_approvals = 2` | Phiếu hoàn ứng thường gặp nhất (Trưởng nhà ứng tiền chợ, gas, thuốc) kẹt vĩnh viễn; người dùng sẽ lách bằng nhờ người khác đứng tên hoặc ủy quyền vai trò Trưởng nhà (dẫn tới N-02) | vá N-01: trigger `trg_expense_vouchers__sod` (sau `__rules`) nâng `required_approvals` 1→2 (Thủ quỹ + Phó nhà) khi người lập/người ứng giữ `house_head` và số tiền > hạn mức Thủ quỹ. Đã thử: phiếu 500k → 2 chữ ký → approved; smoke pass | Chắc chắn |
| **F-044** | S2 | N-04 + D-006 | 72+75 | BR-FIN-47; 1.7.3.2 | Dòng 3226, 2700; `trg_ledger_entries__immutable`, row_hash trong `tg_ledger_entry_before_insert`, `fn_verify_ledger_chain`; owner `luuxa_owner` | "không UPDATE/DELETE/TRUNCATE (kể cả superuser)"; "Sửa lén bằng quyền cao nhất tắt trigger: chuỗi băm báo đứt đúng dòng" | (1) row_hash không gồm `created_by`, `counterparty_member_id`, `reversal_of_id`, `transfer_group_id`, `period_id`, `client_request_id` ⇒ F1 sửa người đối ứng/người tạo: verify báo nguyên vẹn. (2) Băm không khóa, công thức công khai ⇒ F2 tăng số dư đầu kỳ 8tr→18tr và tính lại cả chuỗi + `funds.head_hash`: verify nguyên vẹn. (3) F3 `luuxa_owner` (không superuser) tự `DISABLE TRIGGER` *(Trùng/bổ sung từ D-006: Trigger chỉ `ENABLE` (không `ENABLE ALWAYS`) ⇒ bị bỏ qua khi `session_replication_role='replica'`; superuser/`luuxa_owner` có thể `ALTER … DISABLE TRIGGER` rồi sửa/xóa.…)* | Cam kết "phát hiện sửa lén" chỉ đúng với kẻ sửa vụng; người vận hành DB sửa được lịch sử không để dấu | vá N-04: event trigger `evt_protect_immutable_tables` chặn `ALTER TABLE` 5 bảng bất biến với mọi vai trò không phải superuser (đã thử: luuxa_owner BLOCKED; smoke pass) + băm thêm các cột thiếu (`_fix_hash_trg.sql`/`_fix_hash_verify.sql`, đã thử: sửa `created_by` bị phát hiện ở seq 2; cần migration tính lại chuỗi cũ) + neo `head_hash` ra ngoài DB hằng ngày (email Ban điều hành/kho WORM) và so trong verify — phần này không DDL nào thay được; sửa câu chữ tài liệu cho đúng giới hạn | Chắc chắn |
| **F-045** | S2 | N-06 + C-013 | 75 | 1.6 QR; BR-EVT-05/17 | Dòng 2440, 2226 (#13), 2313; `qr_sessions.require_geofence DEFAULT false`, `fn_checkin_by_qr` | BR-EVT-05 "Geofence tùy chọn … khi require_geofence bật thì …" | Phiên đã nhập tọa độ + bán kính 150 m nhưng cờ mặc định false ⇒ Q1 điểm danh từ cách 1.143 km vẫn `present`; cùng `device_hash` cho 2 tài khoản (phần này đã ghi nhận). Token dùng lại được bởi mọi người trong ~90 s; tọa độ do client gửi *(Trùng/bổ sung từ C-013: Đăng nhập chỉ chứng minh người **gửi** yêu cầu, không chứng minh có mặt: người trong phòng chụp mã gửi Zalo, người vắng đăng nhập tài khoản mình quét trong 45–90 s là được. `require_geofence` mặc định `false` (catalog), …)* | Chụp QR gửi người vắng + mượn tài khoản ⇒ điểm danh hộ; ban tổ chức tưởng đã bật geofence | vá N-06: `CHECK (geofence_lat IS NULL OR require_geofence)` + unique `(event_id, device_hash) WHERE method='qr'`. Đã thử: cả hai BLOCKED; smoke pass. Đánh đổi: điện thoại dùng chung bị chặn → điểm danh thủ công | Chắc chắn |
| **F-046** | S2 | N-07 | 75 | BR-AUTH-06 | Dòng 580; `current_role_grants`, `user_roles_of` (không kiểm vai trò gốc), `tg_role_delegation_rules` (chỉ INSERT) | "người ủy quyền phải đang trực tiếp giữ vai trò đó … trong toàn bộ khoảng thời gian ủy quyền" | I2: thu hồi `treasurer` của Thủ quỹ; m2 (ủy quyền 60 ngày) vẫn `finance.expense.pay = true` | Thủ quỹ bị bãi nhiệm vẫn để lại người cầm quyền chi tới 60 ngày | vá N-07: trigger `trg_user_roles__cascade_delegations` thu hồi ủy quyền khi vai trò gốc bị thu hồi/rút hạn. Đã thử: m2 mất quyền; smoke pass | Chắc chắn |
| **F-047** | S2 | N-10 | 75 | 1.4.3 bảng lỗ hổng #4; BR-DUTY-28 | Dòng 1440 (#4), 1713; policy `duty_review_appeals__update` (46_rls_policies_1.sql) | "#4 Trưởng nhà thuộc ca tự quyết định khiếu nại của ca mình … Đã khép (S14)" | Chỉ hàm `fn_decide_review_appeal` kiểm xung đột; policy UPDATE cho `duty.appeal.decide` sửa thẳng bảng. D2b: Trưởng nhà tự đặt khiếu nại của chính mình `upheld`, `decided_by` = mình; ca vẫn `rework_required` | Lách xung đột lợi ích; hồ sơ khiếu nại ghi "chấp nhận" do chính đương sự, mâu thuẫn trạng thái ca | vá N-10: `DROP POLICY duty_review_appeals__update; REVOKE UPDATE ON duty_review_appeals FROM luuxa_app;` (hàm DEFINER vẫn chạy). Đã thử; smoke pass | Chắc chắn |
| **F-048** | S2 | N-11 | 75 | BR-ACAD-07 | Dòng 2037; `tg_grade_record_compute` (33_fn_academic.sql) | "điểm chính thức của trường nếu thành viên nhập, nếu không là trung bình có trọng số của thang" | (1) `process_score` NULL ⇒ tổng = cuối kỳ (ngầm 100%): AC1 3,0/9,0 → C+ nhưng bỏ trống quá trình → A+. (2) Điểm chính thức tự khai không đối chiếu: AC2 2,0/2,0 + 9,5 → A+. (3) Thiếu cuối kỳ → thông báo sai "chưa có bậc điểm chữ… cho điểm NULL" | Thổi GPA chỉ bằng bỏ trống một ô; toàn bộ phụ thuộc người xác minh đọc ảnh | vá N-11: trigger `trg_grade_records__completeness` (thiếu quá trình khi trọng số > 0 ⇒ phải nhập điểm chính thức; thiếu cuối kỳ ⇒ thông báo đúng). Đã thử BLOCKED. **Đánh đổi:** smoke S7 đang chèn môn chỉ có `final_score` ⇒ phải sửa dữ liệu thử hoặc thêm cờ `final_only` cho môn chỉ thi cuối kỳ. Thêm cờ "điểm chính thức lệch > 0,5 so với thành phần" cho người xác minh | Chắc chắn |
| **F-049** | S2 | N-12 | 75 | BR-ACAD-06; GD-ACAD-01 | Dòng 2036, 36918; policy `grade_scale_bands__write__scale_manage`; vai trò `admin` có `academic.scale.manage` | GD-ACAD-01 "sửa dữ liệu thang, không đổi mã; bảng điểm đã nộp giữ scale_id cũ nên không đổi kết quả" | Bậc sửa tại chỗ; dòng đã tính giữ chữ cũ, dòng mới theo bậc mới ⇒ AC5: cùng bảng điểm, cùng thang, cùng 8,5 → A và B+. Admin kỹ thuật sửa được (AC5a) | Kết quả học tập không tái lập; Admin kỹ thuật can thiệp xếp loại | vá N-12: trigger khóa sửa bậc/tham số của thang đã được bảng điểm submitted/verified dùng (buộc tạo thang mới) + xóa `academic.scale.manage` khỏi admin. Đã thử; smoke pass | Chắc chắn |
| **F-050** | S2 | N-16 | 75 | BR-FIN-32/17/02 | Dòng 3197, 3212; `settings` finance.expense.* (min..max 0..1 tỷ); `tg_settings_validate` | "Ngưỡng là cấu hình chỉ Trưởng nhà sửa được" | Một người nâng hạn mức Thủ quỹ và ngưỡng 2 chữ ký lên 50tr (G1, G2) ⇒ phiếu 9tr chỉ chữ ký Thủ quỹ và Thủ quỹ tự chi (G3, G4); không có bất biến hạn mức Thủ quỹ < ngưỡng 2 chữ ký | Tắt phân tách nhiệm vụ trong vài giây, chỉ còn audit | vá N-16: trần cứng `max_value` (Thủ quỹ ≤ 500k, 2 chữ ký ≤ 5tr, hóa đơn ≤ 1tr — chỉ migration đổi) + constraint trigger hạn mức Thủ quỹ < ngưỡng 2 chữ ký. Đã thử; smoke pass. Khuyến nghị thêm: đổi nhóm `finance.*` cần người thứ hai xác nhận hoặc hiệu lực sau 7 ngày | Chắc chắn |
| **F-051** | S2 (quan điểm) | N-17 | — | BR-FIN-16 | Dòng 3196; `fn_post_ledger_entry` | "điều chỉnh (finance.ledger.adjust — Trưởng nhà) … lý do ≥ 10 ký tự … audit LEDGER_MANUAL_ENTRY" | Bút toán điều chỉnh chiều chi, số tiền bất kỳ (E2: 3tr), một người, không chứng từ, không người thứ hai — trái nguyên tắc hai người đã áp cho chốt sổ | Kênh hợp thức hóa thất thoát tiền mặt | Phương án: (a) adjustment `out` > X đ vào hàng đợi chờ Thủ quỹ/Phó nhà xác nhận (an toàn nhất, thêm bảng + hàm); (b) chỉ cho adjustment gắn `period_reconciliations` có chênh lệch giải trình (gọn, ít linh hoạt). Khuyến nghị (a). Chưa viết SQL — thay đổi luồng | Chắc chắn (hành vi) |
| **F-052** | S3 | N-13 | 75 | BR-ACAD-08 vs FX-HOCTAP-04 | Dòng 2038, 30926; `fn_recompute_gpa` | Tài liệu chê FE "áp xếp loại lên gpa4 đã làm tròn … 8,99 → 3,60 → Xuất sắc" | DB làm y hệt: AC4 GPA4 thật 3,595 → 3,60 → "Xuất sắc" | Xếp loại/khen thưởng sai ở biên; tự mâu thuẫn | vá N-13 (`_fix_gpa_fn.sql`): thêm `g4_raw` chưa làm tròn để tra `grade_rank_bands`, giữ `gpa4` làm tròn để hiển thị. Đã thử: 3,60 / "Giỏi"; smoke pass. Nếu quy chế trường làm tròn trước khi xếp loại thì ghi rõ GD và bỏ lời chê FE | Chắc chắn (mâu thuẫn); quy tắc đúng tùy quy chế |
| **F-053** | S3 | N-15 | 75 | BR-LAU-04/12/17 | Dòng 4513, 4521, 4526; `tg_laundry_booking_apply_status` | BR-LAU-12 "Hiện thành viên tự đặt no_show sát giờ để né quy tắc hủy" | Xác nhận L2c/L2d (tự no_show trả hạn mức), L3 (máy bảo trì giữ lượt), L1 (giữ 2 máy cùng khung — quan điểm) | Né hạn hủy, chiếm máy | vá N-15: trigger `trg_laundry_bookings__noshow_guard` (chỉ worker/`laundry.manage` đặt no_show). Đã thử; smoke pass. Cân nhắc EXCLUDE `(member_id, during)` nếu nội quy cấm giữ 2 máy | Chắc chắn |
| **F-054** | S3 | N-18 | 75 | 1.7.3.2 | Dòng 2699 | "Thủ quỹ chia nhỏ khoản chi thành nhiều phiếu dưới hạn mức tự ký … giảm bằng đối soát tháng … cảnh báo (AI/luật, Phần 8)" | Xác nhận B, B2; DB không có kiểm soát phát hiện nào | Lách ngưỡng 2 chữ ký | View `v_expense_split_alerts` (Phụ lục A, vá N-19 phụ trợ): ≥ 2 phiếu một chữ ký cùng đối tượng nhận trong tuần có tổng ≥ ngưỡng. Đã thử: 10 × 200k → 1 cảnh báo; smoke pass (INV-04) | Chắc chắn |
| **F-055** | S3 | N-19 | 75 | BR-FIN-18 | `fn_pay_expense(p_paid_on)` | "ngày chi do người dùng chọn" | `p_paid_on` không ràng buộc ≥ ngày duyệt: E3 phiếu duyệt 03/10 ghi chi 06/07 | Chi "trước khi duyệt"; vector của N-03 | vá N-19: trigger `trg_ledger_entries__expense_date` (source `expense`: `entry_date ≥ app.local_date(approved_at)`). Đã thử: lùi 5 ngày BLOCKED, hôm nay OK; smoke pass | Chắc chắn |
| **F-056** | S3 | N-20 | — | BR-DUTY-16/25 | Dòng 1443 (#6), 1444 (#7), 1701, 1710 | "chấp nhận khiếu nại không bù trừ điểm duty_rework" | Xác nhận D1 (−1 còn), D3 (miễn ca sau `missed` vẫn −5 — trường hợp miễn thủ công không nằm trong #6), M1 (nghỉ phép duyệt sau không miễn ca) | Điểm rèn luyện sai | Đề xuất: trigger AFTER UPDATE status sang `excused`/`approved` từ `missed`/`rework_required` ghi bút toán bù (quy tắc mới `duty_penalty_reversal`); worker excuse ca trùng đơn nghỉ đã duyệt (BL-DUTY-12) | Chắc chắn |
| **F-057** | S3 | N-21 | — | 1.15 thống kê & chỉ mục | Dòng 5493–5520; `biz/_br_check.tsv` | "Có cơ chế ở DB: 413"; "Mỗi quy tắc có ít nhất một cơ chế thực thi cụ thể" | BR-MEM-18, BR-ACAD-17, BR-DUTY-16, BR-DUTY-25, BR-LAU-12, BR-LAU-17, BR-AUTH-17, BR-AUTH-22, BR-FIN-35 liệt kê đối tượng DB (ví dụ BR-DUTY-16 chỉ có `shift_window`) nhưng DB không thực thi; 160/413 dòng không có kiểm thử DB | Người đọc tưởng DB đã chặn | Thêm cột "Thực thi DB: Đã chặn / Một phần / Chưa"; không đếm BR chưa có DDL vào "Có cơ chế ở DB" | Chắc chắn |

### Bước 5 — API

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-058** | S0 | C-002 | 73 | 6.2.5 USR-ACC-04/05; 2.3 | 26200, 26201, 26022; 6068 | “Đổi email/SĐT hoặc khóa tài khoản đang giữ vai trò thuộc auth.mfa_required_roles chỉ được khi người gọi có thêm auth.role.assign”; “gửi tới email/SĐT đã xác minh của chính chủ” | (1) DB `tg_users_guard` (46_rls_policies_1.sql:73-88) chỉ kiểm `auth.user.manage` ⇒ Admin kỹ thuật đổi email/khóa/vô hiệu Trưởng nhà (T1a/T1b rows=1). (2) Đổi email **không xóa `email_verified_at`** (T1c) và USR-ACC-04 không yêu cầu xác minh lại ⇒ email do người quản trị gõ được coi là “đã xác minh của chính chủ”. (3) Không gửi cảnh báo tới địa chỉ cũ *(Ghi chú kiểm định chính: tài liệu đã liệt kê rủi ro này ở BR-AUTH-22 (dòng 305) nhưng DDL chưa chặn; theo thang đề bài — vượt quyền + lộ dữ liệu nhạy cảm — xếp S0.)* | Người có `auth.user.manage` (Admin) đổi email bất kỳ thành viên thường rồi gọi USR-ACC-05/AUTH-PWD-01 ⇒ nhận liên kết đặt mật khẩu ⇒ chiếm tài khoản, đọc dữ liệu nhạy cảm (trái BR-AUTH-22 “Admin không đặt hộ mật khẩu, không xem dữ liệu nhạy cảm”). Trưởng nhà làm điều tương tự với Thủ quỹ ⇒ một người ký cả hai chữ ký (BR-FIN-02) và chốt sổ hai bước (BR-FIN-10). Phá tuyên bố 2.3 “RLS là chốt chặn chính” | DB: SQL **Phụ lục A §C-002** (`app.is_privileged_user`, viết lại `tg_users_guard`: chặn tự đổi, chặn đổi định danh tài khoản đặc quyền khi thiếu `auth.role.assign`, luôn xóa `email_verified_at`/`phone_verified_at` khi đổi). Đã chạy: V1 chặn Admin, V1c xóa dấu xác minh. Đặc tả USR-ACC-04/05 viết lại ở **Phụ lục C.2** (đổi định danh ⇒ trạng thái chờ xác minh, mã gửi địa chỉ mới, thông báo địa chỉ cũ, USR-ACC-05 từ chối 422 khi kênh chưa được chính chủ xác minh) | Chắc chắn |
| **F-059** | S1 · THIẾU | C-001 + B-002 | — | 6 (toàn phần); prompt dòng 198 | 26172 … 28431 (cột Request/Response); 25946, 28498 | “body: `CreateExpenseDto`”, “200: `ExpenseDetailDto`”; “Gộp từ các tệp `api/schemas_*.yaml`” | Đề bài đòi “Request Body/Query Schema (DTO với kiểu và ràng buộc), Response schema”. Phần 6 nêu **396 tên DTO** nhưng **không định nghĩa trường** nào (tên JSON, kiểu, bắt buộc, min/max, enum, nullable) — trừ `DecideExpenseDto` (28584-28596). Các tệp `api/schemas_*.yaml` được viện dẫn không có trong tài liệu. 7.2.4 chỉ ánh xạ trường FE → cột DB → mã endpoint *(Trùng/bổ sung từ B-002: Prompt dòng 198 đòi DTO với kiểu và ràng buộc cho request/query và response schema; tài liệu chỉ có tên DTO (402 tên), duy nhất `DecideExpenseDto` có trường; nguồn YAML nằm ngoài "một tài liệu duy nhất"; ví dụ phản hồi l…)* | Không thể kiểm “TÊN, KIỂU, BẮT BUỘC khớp cột DB”; hai nhóm lập trình sẽ tự đặt tên trường khác nhau; không sinh được OpenAPI/Zod như 6.1.10 hứa; cột NOT NULL (vd `expense_vouchers.fund_id`) có thể bị DTO để tùy chọn | Thêm mục “6.x.y DTO” cho mỗi nhóm theo khuôn ở **Phụ lục C.1** (bảng Trường · Kiểu (cú pháp 6.18.2) · Bắt buộc · Ràng buộc · Cột DB/dẫn xuất); CI so DTO với `information_schema.columns` (NOT NULL không default ⇒ bắt buộc, `check` ⇒ min/max). Đã viết mẫu đầy đủ 3 DTO (CreateExpenseDto, LoginDto, CreateLaundryBookingDto) | Chắc chắn |
| **F-060** | S1 (tài liệu đã tự ghi nhận BL-COM-14) | C-003 + D-007 | 72+73 | 6.11.3, COM-PRA-05, COM-REP-01 | 27779, 27830, 27831 | “Chỉ khi có `content_reports` đang mở về đúng ý chỉ đó Trưởng nhà mới gọi được COM-PRA-05” | `fn_reveal_prayer_author` (37_fn_facilities_community.sql:478-500) chỉ kiểm `EXISTS(content_reports … status='open')`; COM-REP-01 cho mọi `authenticated` (Trưởng nhà cũng giữ vai trò `member`, GD-FIN-63) tự lập báo cáo. T2: HH lập báo cáo rồi gọi hàm ⇒ trả đúng `author_member_id` của b2 *(Trùng/bổ sung từ D-007: Hàm chỉ đòi "có báo cáo mở" + quyền; **không** chặn người báo cáo trùng người tiết lộ, không cần chữ ký thứ hai.…)* | Bảo đảm “ẩn danh thật” (6.7.2/6.11.3) và BR-COM-05 vô hiệu với chính người có quyền xem; lộ tác giả ý chỉ cầu nguyện (dữ liệu tôn giáo, nhạy cảm) | DB: **Phụ lục A §C-003** — báo cáo phải do người khác lập (`reporter_member_id IS DISTINCT FROM current_member_id`) + trigger `trg_content_reports__target` chỉ cho báo cáo nội dung tồn tại và người báo nhìn thấy (đã chạy: V2, V2b chặn; smoke S11f xanh). Đặc tả COM-PRA-05 viết lại **Phụ lục C.3** (thêm: người xem không phải người báo; báo cáo đã được người kiểm duyệt khác chuyển “escalated”; thông báo cho tác giả rằng danh tính đã được xem) | Chắc chắn |
| **F-061** | S1 | C-004 + E-013 | 71+73 | 6.15 AIX-JOB-01, AIX-SUG-01 | 28255, 28258, 28221-28228 | “requested_by = người gọi. Chỉ truyền con trỏ tới bản ghi (input_ref)… Trigger tg_ai_job_gate chặn … chủ thể dữ liệu chưa đồng ý” | `ai_jobs__insert` chỉ kiểm `requested_by=self AND ai.use` (mọi vai trò có `ai.use`). `tg_ai_job_gate` (38_fn_platform.sql:266-299) chỉ kiểm đồng ý khi `NEW.subject_member_id IS NOT NULL` — giá trị do client khai. Không kiểm người gọi có quyền xem `entity_id`/`input_ref.file_id`. T4: b1 tạo job OCR trên phiếu chi/bảng điểm không thuộc mình ⇒ `queued`; bỏ `subject` ⇒ không kiểm đồng ý. `ai_suggestions__select` cho người yêu cầu đọc payload *(Trùng/bổ sung từ E-013: Bỏ trống `subject_member_id` là đi qua kiểm đồng ý; RLS insert không bắt buộc chủ thể…)* | Khi bật AI: thành viên thường lấy được nội dung hóa đơn, bảng điểm (dữ liệu `never_external`) của người khác qua worker BYPASSRLS + AIX-SUG-01; BR-AI-03 bị vô hiệu | DB: **Phụ lục A §C-004** — `trg_ai_jobs__a_input_guard` (INVOKER: bản ghi/tệp phải nhìn thấy dưới RLS người gọi; suy `subject_member_id` từ bản ghi; ép `status=queued`, chi phí 0) + `trg_ai_jobs__provider_guard` (kiểm BR-AI-02 khi worker chọn nhà cung cấp). Đã chạy: V3 chặn; smoke S12 AI xanh. Đặc tả AIX-JOB-01/AIX-SUG-01 viết lại **Phụ lục C.4** | Chắc chắn |
| **F-062** | BỊA ĐẶT | C-031 | — | 6.3 “Phụ thuộc DDL” | 26417 | “`student_profiles__select` cho mọi `member.read` đọc `student_code`” | Sai với DB: policy chỉ cho self/`member.private.read`/`academic.read_all`/`academic.read_aggregate`/`member.update` (T5a 0 dòng). Mâu thuẫn chính BL-MEM-20 (26426) “DDL đã giới hạn student_profiles” | Che khuất C-017 | Sửa câu: “`student_profiles__select` chỉ cho chính chủ và Ban điều hành nên danh bạ cần `fn_directory_study`” | Chắc chắn |
| **F-063** | S2 | C-005 | 73 | 6.2.4 AUTH-SES-01/02/03, 6.2.5 USR-ACC-06 | 26189-26191, 26202 | “RLS auth_sessions__select__own_or_admin. Chỉ phiên chưa thu hồi…”; “UPDATE auth_sessions … (RLS: chính chủ). Phiên khác người dùng trả 404”; “Thu hồi mọi phiên của chính mình trừ phiên hiện tại” | Policy thật: `user_id = current_user_id OR has_permission('auth.session.revoke_any')` (HH, Admin). Đặc tả dựa vào RLS để giới hạn “của tôi” nên với HH/Admin truy vấn `/me/*` trả và sửa phiên của **mọi người**. T16: HH thấy 4 phiên; lệnh “đăng xuất thiết bị khác” thu hồi 3 phiên của người khác | Trưởng nhà/Admin bấm “Đăng xuất mọi thiết bị khác” làm cả nhà mất phiên; GET /me/sessions lộ IP/thiết bị của mọi người | DB: **Phụ lục A §C-012 (phiên)** — policy chỉ chính chủ, GRANT UPDATE theo cột, hàm `app.fn_revoke_user_sessions` cho USR-ACC-06 (đã chạy V6/V6b). Đặc tả AUTH-SES-01..03, USR-ACC-06 viết lại **Phụ lục C.5** (bắt buộc `WHERE user_id = :me`; USR-ACC-06 gọi hàm; thêm USR-ACC-07 xem phiên của một người) | Chắc chắn |
| **F-064** | S2 | C-006 | 73 | 6.6 ACD-REC-07 | 26869 | “RLS academic_records__update cho academic.verify khi bảng điểm submitted … đặt verified_at, verified_by” | Policy UPDATE cho người xác minh không giới hạn cột; `tg_academic_record_guard` chỉ khóa `member_id`, `scale_id`, `semester_id`, `university_id`. T15: VH sửa `has_scholarship=true`, `scholarship_note`, `major_snapshot` bảng điểm đã nộp của b2 (rows=1) | Người xác minh làm giả học bổng/ngành của người khác; ảnh hưởng thống kê học bổng (ACD-AGG-01) và báo cáo gửi ngoài | DB: **Phụ lục A §C-006** `trg_academic_records__verifier_cols` (không phải chính chủ ⇒ không đổi 4 cột nội dung) — V7 chặn, smoke S7 xanh. Đặc tả ACD-REC-07: thêm câu “Thân chỉ nhận `decision`, `reject_reason`; mọi cột nội dung thuộc chính chủ (BR-ACAD-21 mới)” | Chắc chắn |
| **F-065** | S2 | C-007 | — | 6.1.7 vs 6.18.3, FIN-EXP-07, ACD-REC-02 | 25853, 25862, 25871, 25896; 28628, 28640-28645, 28705-28706, 28723, 28725; 27181; 26864, 26850 | 6.1.7: “`check_violation`, thông báo bắt đầu `BR-XXX-NN:` → 422”, “23000 … → 409 IMMUTABLE_RECORD”, “40001 → 409 SERIALIZATION_CONFLICT”, `IDEMPOTENCY_KEY_REUSED`; 6.18.3: “BR-FIN-01 403”, “BR-FIN-06 423”, “23000 … 423 với BR-FIN-06”, “40001 → 503”, `ERR-PLT-IDEMPOTENCY-MISMATCH` | Hai bảng ánh xạ cho **“một middleware duy nhất”** (25849) cho kết quả khác nhau với cùng lỗi DB: BR-FIN-01/02/17 (DB phát 23514 — 36_fn_finance_flows.sql:152-187) ⇒ 422 hay 403; BR-FIN-06 (DB phát 23000 — 35_fn_finance_ledger.sql:93-94) ⇒ 409 hay 423; BR-ACAD-03 (23514) ⇒ 26850/ACD-REC-02 nói 409, 6.1.7 ⇒ 422; 40001 ⇒ 409 hay 503; mã idempotency hai họ tên; 423 không có trong 6.1.7 | FE rẽ nhánh theo `code`/HTTP sai; kiểm thử hợp đồng không thể cùng đúng hai bảng | Thay hai bảng bằng **một bảng duy nhất** (Phụ lục C.6): thứ tự ưu tiên tiền tố `BR-` → tra danh mục BR (cột HTTP riêng mỗi mã) → tên ràng buộc → SQLSTATE; chuẩn hóa mã idempotency `IDEMPOTENCY_KEY_REUSED` (422) / `IDEMPOTENCY_IN_PROGRESS` (409); 40001/40P01 ⇒ 409 `SERIALIZATION_CONFLICT` sau 3 lần thử; thêm 423 vào 6.1.7 | Chắc chắn |
| **F-066** | S2 | C-008 | 73 | 6.14 PLT-SET-02; 6.8 nguyên tắc 2 | 28138, 28146, 27135 | “mặc định setting.write (Admin kỹ thuật và Trưởng nhà); khóa finance.* … chỉ Trưởng nhà” | Tách được khóa `finance.*` (T13 Admin 0 dòng — đúng) nhưng khóa bảo mật `auth.mfa_required_roles`, `auth.max_failed_logins`, `auth.lockout_minutes`, `auth.access_token_ttl_seconds`, `auth.refresh_token_ttl_days` vẫn `setting.write` ⇒ Admin kỹ thuật một mình bỏ HH/TQ khỏi danh sách bắt buộc MFA (T13b rows=1). Smoke dòng 1046 còn khẳng định “Admin vẫn chỉnh được cấu hình kỹ thuật” | Hạ MFA của người duyệt chi rồi kết hợp C-002 ⇒ chiếm tài khoản tài chính; trái mục tiêu “Admin kỹ thuật không tự nới ngưỡng” (28146) | DB: **Phụ lục A §C-008** — quyền mới `security.settings.write` (chỉ HH), `write_permission` của `auth.%` đổi sang quyền này (V4/V4b). Đặc tả PLT-SET-02: thêm “khóa `auth.*` cần `security.settings.write` và step-up” | Chắc chắn |
| **F-067** | S2 | C-009 | 73 | 6.1.2 (vai trò DB) | 25729 | “`luuxa_auth` … BYPASSRLS … thêm `login_attempts`, `user_roles`” | Không endpoint AUTH-* nào cần gán vai trò (AUTH-REG-01, AUTH-OID-02 chỉ tạo `users` invited; duyệt đơn dùng `fn_approve_member_application` của `luuxa_app`). Nhưng `luuxa_auth` (kết nối của các endpoint `public`) có INSERT `user_roles` + BYPASSRLS ⇒ T14 chèn được vai trò `admin` cho b1 | Một lỗi SQL injection/logic ở đăng nhập, đăng ký, OIDC (bề mặt công khai) leo thẳng lên admin, qua mặt `user_roles__insert__assign` | DB: `REVOKE INSERT ON user_roles FROM luuxa_auth;` (V12 chặn). Sửa bảng 6.1.2: bỏ `user_roles` khỏi quyền ghi của `luuxa_auth` | Chắc chắn |
| **F-068** | S2 | C-010 | 73 | 6.17.1, PLT-HOOK-01..04 | 28436, 28428 | “Webhook chạy bằng kết nối worker (BYPASSRLS) và chỉ được thực hiện đúng một hành động hẹp” | “Hẹp” chỉ là kỷ luật mã; `luuxa_worker` BYPASSRLS có INSERT `user_roles`, UPDATE `users`, UPDATE `expense_vouchers`, EXECUTE `fn_post_ledger_entry` (T14c: tất cả `t`) và `fn_post_ledger_entry` cho phép ngữ cảnh hệ thống | Endpoint công khai Internet sở hữu quyền gần tối đa: lỗi phân tích payload ⇒ ghi sổ cái, đổi quyền | DB: vai trò `luuxa_webhook` NOBYPASSRLS chỉ INSERT cột của `bank_statement_lines`, SELECT hẹp `funds`, cập nhật trạng thái `notification_outbox` (**Phụ lục A §C-010**, đã tạo thử). Đặc tả 6.17.1 mục 2: thay “kết nối worker” bằng “kết nối `luuxa_webhook`; liên kết kênh Telegram/Zalo qua hàm DEFINER `fn_bind_channel(code, external_id)`” | Chắc chắn |
| **F-069** | S2 | C-011 | 73 | 6.7.2, EVT-POLL-05, RT-POLL-01, 6.16 | 26949, 26986, 28337, 28345, 28406 | “Biểu quyết ẩn danh thật … luồng SSE không bao giờ phát tên”; “poll.tally (sau mỗi lô phiếu, tối đa 1 lần/giây)” | Ẩn danh không chỉ là ẩn tên: với poll ẩn danh đang mở, số phiếu từng phương án được phát gần như theo từng phiếu (≤1 s) và `voters` tăng 1 ⇒ ai quan sát lúc một người bấm (cùng phòng họp, cùng giờ) suy ra lựa chọn. `fn_poll_results` trả `votes` từng phương án cho mọi người ngay cả khi chỉ có 1 người bỏ phiếu (smoke dòng 824 khẳng định `votes = 1` thấy được khi poll ẩn danh đang mở) | Lộ phiếu trong các cuộc biểu quyết ẩn danh nhỏ (≤ 50 người) — đúng loại dữ liệu cần bảo vệ | DB: **Phụ lục A §C-011** — `fn_poll_results` trả `votes = NULL` cho poll ẩn danh khi chưa `closed` (chỉ `voters`/`eligible`). Đặc tả EVT-POLL-05/RT-POLL-01 (**Phụ lục C.7**): poll ẩn danh chỉ phát `voters`, `turnout_pct` khi mở; kết quả từng phương án sau khi đóng; nếu Ban điều hành cần trực tiếp thì gom theo ngưỡng k ≥ 5 phiếu mới và chu kỳ ≥ 60 s | Chắc chắn |
| **F-070** | S2 | C-012 | 73 | EVT-POLL-05, 6.16.5 | 26986, 28406 | “fn_poll_results SECURITY DEFINER” | Hàm (34_fn_events.sql:549-576) chỉ kiểm `current_user_id IS NOT NULL`; không kiểm `event.read`, không áp quy tắc `polls__select` (poll nháp chỉ người tạo/poll.manage). T3: tài khoản `invited` 0 vai trò đọc nhãn phương án + số phiếu poll nháp; thành viên đọc poll nháp | Phòng thủ chiều sâu hỏng: API quên kiểm là lộ; SSE dùng worker BYPASSRLS càng phụ thuộc API | DB: cùng SQL §C-011 (kiểm `event.read` + điều kiện nháp, trả `no_data_found`) — V5 chặn | Chắc chắn |
| **F-071** | S2 | C-014 | — | 6.8 vs 2.5, AUTH-LOG-05 | 6096, 26176; 27181-27202 | 2.5: “thao tác nhạy cảm (duyệt chi, chốt sổ, mở lại kỳ) yêu cầu xác thực lại trong 5 phút (BL-FIN-27)”; AUTH-LOG-05: “áp dụng cho … các thao tác tài chính nhạy cảm ở nhóm finance” | Không hàng FIN-* nào ghi `step-up` (script: 0/24 endpoint ghi của FIN có chữ step-up) trong khi 6.2/6.3 ghi rõ ở từng hàng | Lập trình viên làm theo bảng endpoint sẽ bỏ step-up cho duyệt chi, ghi chi, đảo, ghi tay sổ cái, chuyển quỹ, chốt/xác nhận/mở lại kỳ | Đặc tả: thêm “Step-up (≤ 300 s), MFA bắt buộc” vào cột phạm vi của FIN-EXP-07, FIN-EXP-08, FIN-EXP-09, FIN-LED-03, FIN-FUND-05, FIN-PER-03, FIN-PER-04, FIN-PER-05, FIN-DUE-02 (miễn/giảm), PLT-SET-02 (khóa finance.*/auth.*); thêm `403 STEP_UP_REQUIRED` vào cột Lỗi | Chắc chắn |
| **F-072** | S2 | C-015 | — | 6.1.10 vs 6.18.1 | 25943-25956; 28504, 28509, 28516, 28503 | 6.1.10: `operationId: DUT-CIN-01`, `x-permission`, `x-rate`, securitySchemes `cookieAuth`, `bearerAuth`, `csrfHeader`, “nhiều mã nối bằng dấu gạch chéo (/)”; 6.18.1: “`FIN-EXP-07` ⇒ `finExp07`”, `x-required-permissions`, `x-rate-limit-class`, chỉ `cookieAuth` và `bearerAuth`, “ngăn cách bằng dấu gạch đứng” | Hai quy ước sinh OpenAPI cho cùng một tài liệu; danh sách tag khác nhau; nửa sau **không khai `csrfHeader`** | Client sinh tự động cho 6.7–6.17 không gửi `X-CSRF-Token` ⇒ mọi thao tác ghi nửa sau 403 ở chế độ cookie, hoặc middleware CSRF dựa vào khai báo security sẽ bỏ kiểm; diff phá vỡ giả | Đặc tả: giữ một quy ước (đề xuất của 6.1.10: `operationId` = mã endpoint, `x-permission` với `x-permission-mode: any`, mọi thao tác không an toàn có `security: [{cookieAuth: [], csrfHeader: []}, {bearerAuth: []}]`); xóa bảng ánh xạ trùng ở 6.18.1; thêm luật lint “mọi POST/PUT/PATCH/DELETE có `csrfHeader`” | Chắc chắn |
| **F-073** | S2 | C-016 | — | 6.1.6 vs 6.14.2; MEM-PRO-07 | 25813, 25822, 25826; 28164-28177; 26374 | “Header là tùy chọn với đa số endpoint …, bắt buộc với HSE-ASG-05 và các endpoint ghi tiền”; 6.14.2: “middleware áp dụng cho mọi POST/PUT/PATCH/DELETE có tiêu đề Idempotency-Key … lưu response_status và response_body” | (1) Danh sách bắt buộc lệch nhau (6.14.2 bỏ FIN-LED-03, FIN-EXP-10/11; MEM-PRO-07 tự ghi “bắt buộc”). (2) Hai bộ mã lỗi (C-007). (3) Không có danh sách loại trừ: client gửi khóa với AUTH-MFA-01/03 (bí mật TOTP, mã khôi phục), MEM-PRV-03 (CCCD), MEM-GRD-05 (SĐT), COM-PRA-05 (tác giả), STO-FILE-04 (URL ký) ⇒ thân phản hồi bản rõ lưu 24 giờ trong `idempotency_keys.response_body` (jsonb, có trong bản sao lưu) | Bí mật “chỉ hiện một lần” (26180-26182) và dữ liệu đã giải mã nằm trong DB/backup; COM-PRA-05 “cố ý không idempotent” bị phát lại | Đặc tả (**Phụ lục C.9**): một danh sách bắt buộc duy nhất; endpoint trả bí mật/dữ liệu giải mã khai `x-idempotent: false`, middleware **từ chối** `Idempotency-Key` (400 `IDEMPOTENCY_NOT_SUPPORTED`) hoặc chỉ lưu `response_status` + băm thân; mã lỗi thống nhất | Chắc chắn |
| **F-074** | S2 | C-017 | 73 | 6.3 MEM-DIR-01, MEM-PRO-02 | 26309, 26361, 26369 | “Tầng 1: Tên, ảnh, trạng thái, phòng, chức danh, trường/ngành … Mọi `member.read`”; “Trả tầng 1 cùng hồ sơ học tập hiện hành (student_profiles)” | `student_profiles__select` chỉ cho self hoặc `member.private.read`/`academic.read_all`/`academic.read_aggregate`/`member.update`. T5a: thành viên b1 đọc `student_profiles` của b2 = **0 dòng** (đọc `members` = 1) | Danh bạ trả trường/ngành rỗng cho thành viên thường; bộ lọc `university_id` âm thầm trả rỗng; FE hiển thị sai | DB: hàm DEFINER `app.fn_directory_study(uuid[])` chỉ trả `university_id, major, cohort_label` (không MSSV) cho `member.read` (**Phụ lục A §C-013**, V9 = 1 dòng). Đặc tả MEM-DIR-01/MEM-PRO-02: ghi “trường/ngành lấy qua `fn_directory_study`; MSSV chỉ chính chủ và `member.private.read`” | Chắc chắn |
| **F-075** | S2 · THIẾU | C-047 | — | 6.2, 6.14 PLT-DSR | 26178, 26200, 28126-28127 | AUTH-ME-02: “Chỉ locale và time_zone”; PLT-DSR-03: “Việc xóa/ẩn danh hóa thực hiện bằng quy trình riêng” | Không có endpoint tự đổi email/SĐT đăng nhập có xác minh (buộc dùng USR-ACC-04 — nguồn C-002); không có endpoint xuất dữ liệu cá nhân cho yêu cầu `access`/`portability` | Quyền chủ thể dữ liệu (NĐ 13/2023) thực hiện thủ công; đổi định danh qua người quản trị | Thêm AUTH-ME-04/05 và PLT-DSR-04/05 (**Phụ lục C.12**) | Chắc chắn |
| **F-076** | S3 | C-018 | 73 | 6.3 MEM-PRV-01/03 | 26375, 26377 | “CCCD đầy đủ chỉ qua MEM-PRV-03 … `member.national_id.read` … Chỉ Trưởng nhà” | GRANT SELECT mọi cột `member_private_details` cho `luuxa_app`; policy cho `member.private.read` (VH). T9c: VH đọc `national_id_enc`. Quyền `member.national_id.read`, ghi `READ_SENSITIVE` trước giải mã chỉ ở API | Một lỗi tuần tự hóa DTO ở MEM-PRV-01 gửi bản mã + khóa ở cùng tiến trình ⇒ lộ CCCD cho Phó nhà mà không có nhật ký | DB: **Phụ lục A §C-016** — thu SELECT cột `national_id_enc`, hàm `fn_national_id_cipher(member_id, reason)` kiểm quyền + ghi audit trong cùng transaction (V8 chặn). Đặc tả MEM-PRV-03: “API gọi `fn_national_id_cipher` rồi giải mã” | Chắc chắn |
| **F-077** | S3 | C-019 | 73 | 6.4 HSE-ASG-01, HSE-ROOM-03 | 26474, 26464, 26501 | “reason và end_reason chỉ có khi người gọi là chính chủ hoặc có house.assign (BR-HOUSE-19)” | `room_assignments__select` = `house.read` (mọi vai trò), GRANT mọi cột. T9b: b1 đọc “Chuyển phòng vì lý do sức khỏe tâm lý” của b2. Tài liệu tự nhận (BL-HOUSE-14) nhưng 2.3 lại khẳng định RLS là chốt chặn | Lộ lý do nhạy cảm khi API quên che | DB: **Phụ lục A §C-017** — thu SELECT cột `reason`, `end_reason`; hàm `fn_room_assignment_reasons(uuid[])` | Chắc chắn |
| **F-078** | S3 | C-020 | 73 | 6.8 FIN-RPT-02 | 27214 | “Nguồn mv_cashflow_monthly … cho mọi thành viên; tham số fund_id chỉ dùng được với finance.ledger.read” | Materialized view không có RLS; ACL thực `luuxa_app=arwd` (T10a) trái với 49_b_grants.sql:122-123 (chỉ cấp `luuxa_readonly`). Mọi phiên `luuxa_app`, kể cả invited không vai trò, đọc dòng tiền từng quỹ | Phân quyền theo quỹ chỉ ở API | DB: **Phụ lục A §C-024** `REVOKE ALL ON mv_cashflow_monthly FROM luuxa_app;` + `fn_cashflow_monthly(from,to,fund)` kiểm quyền (V10). Đặc tả FIN-RPT-02: “DB: `fn_cashflow_monthly`” | Chắc chắn |
| **F-079** | S3 | C-021 | 73 | 6.14 PLT-AUD-03; MEM-ACC-01 | 28116, 26357 | “Từ client chỉ nhận action ∈ {PRINT, SHARE_LINK}; READ_SENSITIVE … do server tự ghi” | `fn_audit_event` cho mọi người đăng nhập ghi cả `READ_SENSITIVE`/`EXPORT` với thực thể và lý do tùy ý (T7: 2 dòng) | Nhật ký “ai đã xem dữ liệu của tôi” (MEM-ACC-01) có thể bị làm nhiễu; ràng buộc chỉ ở API | DB: **Phụ lục A §C-025** — `READ_SENSITIVE` chỉ cho người có quyền đọc nhạy cảm; bắt buộc thực thể (V11) | Chắc chắn |
| **F-080** | S3 | C-022 | 73 | 6.11 COM-REP-01 | 27831 | “Người báo = người gọi, chỉ báo nội dung mình nhìn thấy” | `content_reports__insert` không kiểm đối tượng tồn tại/nhìn thấy; T8 chấp nhận UUID không tồn tại | Rác hàng chờ kiểm duyệt; mở đường C-003 | DB: trigger `trg_content_reports__target` (**Phụ lục A §C-003**) — V2b chặn | Chắc chắn |
| **F-081** | S3 | C-023 | — | 6.12 LAU-BOOK-01, LAU-SLOT-01 | 27873, 27881 | “Thành viên mặc định mine=true; laundry.manage lọc theo bất kỳ member_id” | `laundry_bookings__select` = `house.read`: thành viên đặt `mine=false`/`member_id` vẫn thấy mọi lượt (T9a) — API ngụ ý hạn chế nhưng không nêu | Hành vi không xác định; lộ lịch sinh hoạt từng người | Chọn một: (a) ghi rõ ở LAU-BOOK-01 “mọi người có `house.read` xem mọi lượt (tên + phòng), chỉ `laundry.manage` lọc theo `member_id`”; hoặc (b) DB `ALTER POLICY laundry_bookings__select ON laundry_bookings USING ((SELECT app.is_self(member_id)) OR (SELECT app.has_permission('laundry.manage')));` và LAU-SLOT-01 dùng hàm DEFINER trả ô `booked` không kèm tên | Chắc chắn |
| **F-082** | S3 | C-024 | — | 6.1.11; FIN-RPT-04, PLT-AUD-02, USR-REV-01, STO-FILE-04 | 25981, 26377, 27216, 28115, 26208, 28001 | MEM-PRV-03: “Là POST vì có tác dụng phụ (ghi nhật ký) và không được cache”; FIN-RPT-04 `GET … Mỗi lần xuất ghi audit EXPORT` | Bốn GET ghi `EXPORT`/`DOWNLOAD_FILE` mà không đòi tiêu đề tùy biến; cookie `SameSite=Lax` gửi kèm khi trang lạ điều hướng cấp cao ⇒ trang lạ khiến Trưởng nhà sinh dòng EXPORT và tiêu hạn mức `export` (5/phút) mà không cần CSRF | Nhật ký kiểm toán sai lệch, từ chối dịch vụ xuất báo cáo; mâu thuẫn quy ước tự đặt | Đổi sang POST: `POST /finance/reports/monthly/exports`, `POST /audit-logs/exports`, `POST /reports/access-reviews`, `POST /storage/files/{id}/download-urls` (đặc tả **Phụ lục C.10**) | Chắc chắn |
| **F-083** | S3 | C-025 | — | 6.1.11; nhiều nhóm | 25974, 26235 (ví dụ), danh sách ở “Endpoint thiếu” | “`POST /{tập}` — 201 Created kèm Location”; `Location: /api/v1/user-roles/0199c0e3…` | 45 tài nguyên tạo bằng POST 201 không có `GET /{tập}/{id}`; 14 endpoint đòi `If-Match` (HSE-FLR-03/04/05, HSE-ROOM-06, DUT-ARE-02, ACD-SCL-03, EVT-REC-03, FIN-DUE-02, FIN-FUND-03, FIN-PLAN-03, FAC-AST-03, PLT-CAT-03, MEM-PRO-05, ACD-REC-02) không có GET cùng đường dẫn để lấy `ETag` | `Location` trỏ 404; FE phải lấy `version` từ danh sách | Thêm GET theo id cho các tài nguyên nêu ở “Endpoint thiếu” (mẫu **Phụ lục C.11**) hoặc ghi rõ `Location` trỏ danh sách lọc theo id và DTO danh sách luôn có `version` | Chắc chắn |
| **F-084** | S3 | C-026 | — | 6.1.11 quy ước tên | 26966, 28259, 27564, 26869, 27875, 26731, 27661, 27816, 26969 | `/leave-requests/{id}/decision`, `/ai/suggestions/{id}/decision` vs `/…/decisions`; `/verification` vs `/verifications`; `/check-in` vs `/checkins`; `PUT /moments/likes`; `PUT /liturgy/days` | Lệch quy ước 6.1.11 (danh từ số nhiều cho bản ghi quyết định); PUT không định danh tài nguyên; PUT upsert một phần. Route tĩnh/tham số chồng: `/members/stats`, `/member-applications/me`, `/finance/expenses/totals`, `/facilities/maintenance-issues/summary`, `/moments/albums/facets` | Sinh client không nhất quán; router dễ bắt nhầm `stats` thành `{id}` | Đổi: `/decisions`, `/verifications`, `/checkins`; `PUT /moments/albums/{id}/likes/me`, `PUT /moments/photos/{id}/likes/me`, `PUT /forum/threads/{id}/reactions/me/{type}`; `POST /liturgy/days/batch`; khai báo route tĩnh trước, `{id}` có `format: uuid` | Chắc chắn |
| **F-085** | S3 | C-027 | — | 2.5 vs 6.1.8, 6.1.2 | 6094, 6097-6106; 25690-25693, 25904-25921 | 2.5: auth “10 lần mỗi 15 phút”, default “300/phút”, export “5 lần mỗi giờ”, CSRF “X-Requested-With hoặc double-submit”; 6.1.8: auth 20/phút/IP, default 120/phút, export 5/phút + 30/giờ; CSRF = HMAC(sid) | Hai bộ số và hai cơ chế CSRF | Cấu hình/ kiểm thử theo nguồn nào không rõ | Giữ 6.1.8 và 6.1.2 làm chuẩn; sửa 2.5 trỏ về 6.1.8 | Chắc chắn |
| **F-086** | S3 | C-028 | — | AUTH-LOG-01 | 26019, 26172 | “Đếm lần sai theo (identifier, IP) …: đạt auth.max_failed_logins thì đặt users.locked_until” | Đếm theo cặp nhưng khóa toàn tài khoản ⇒ bất kỳ ai biết email Trưởng nhà gửi 5 mật khẩu sai là khóa 15 phút, lặp lại vô hạn | Từ chối dịch vụ người duyệt chi đúng ngày chốt sổ | Đặc tả: chỉ chặn cặp (identifier, IP) bằng `429 LOGIN_THROTTLED`; `users.locked_until` chỉ đặt khi ≥ 20 lần sai từ ≥ 3 IP trong 1 giờ; bật CAPTCHA sau 3 lần sai | Chắc chắn |
| **F-087** | S3 | C-029 | — | AUTH-OID-02 vs AUTH-REG-01 | 26185, 26188 | “chưa có thì INSERT users (invited) và user_identities”; “AUTH-REG-01 … Chỉ bật khi Trưởng nhà cho phép đăng ký mở (Q-AUTH-01)” | OIDC tạo tài khoản bất kể cờ đăng ký mở | Tài khoản rác, tài khoản invited đọc được các danh mục `authenticated` (lịch phụng vụ, nội quy, cấu hình trực nhật) | Đặc tả AUTH-OID-02: khi đăng ký mở tắt và không có lời mời khớp email ⇒ 403 `REGISTRATION_CLOSED`, không tạo `users` | Chắc chắn |
| **F-088** | S3 | C-030 | — | AUTH-LOG-04 | 26175 | “`authenticated` … thu hồi phiên mang sid của access token” | Access token hết hạn (15 phút) thì 401, cookie refresh 30 ngày vẫn sống; “Đăng xuất” trên máy dùng chung không có tác dụng | Phiên tồn tại sau đăng xuất | Đặc tả: AUTH-LOG-04 nhận cả refresh cookie/`refresh_token` (miễn access token), tra `refresh_tokens.token_hash` ⇒ thu hồi `session_id`; luôn xóa cookie và trả 204 | Chắc chắn |
| **F-089** | S3 | C-033 | — | DUT-STA-01 | 26746 | “merit_points chỉ có số thật với chính chủ và người có merit.read_all …, người khác thấy null” | `v_duty_member_stats` dùng `COALESCE(SUM…, 0)` (40_views.sql:199) ⇒ người khác thấy **0** | FE hiển thị “0 điểm” sai, sắp xếp theo `merit_points` vô nghĩa | Đặc tả: API đặt `merit_points = null` khi người gọi không phải chính chủ và thiếu `merit.read_all`; hoặc sửa view bỏ `COALESCE` | Chắc chắn |
| **F-090** | S3 | C-034 | — | 6.1.2 | 25728 | “`luuxa_app` … Không làm được: … ghi sổ cái, nhật ký kiểm toán, `merit_entries`” | `luuxa_app` có INSERT `merit_entries` (kiểm `has_table_privilege` = true) qua policy `merit_entries__insert__manual`, và DUT-MER-03 dùng đúng đường này | Mâu thuẫn nội bộ | Sửa: “chỉ chèn bút toán `manual_adjust` qua policy (DUT-MER-03); không ghi bút toán tự động” | Chắc chắn |
| **F-091** | S3 | C-035 | — | USR-ROL-03 | 26211 vs 26294 | “Chưa chặn đổi role_id sang admin ở UPDATE (BL-AUTH-17) nên API không mở PATCH” | GRANT UPDATE `user_roles` chỉ `(valid_to, revoked_at, revoked_by, note)` (49_b_grants.sql:36-37) — đã khép; chính bảng 26294 nói “đã khép đường leo thang” | Mâu thuẫn, dẫn sai backlog | Sửa câu: “`role_id` không UPDATE được (GRANT cột); API không mở PATCH vì đổi vai trò = thu hồi + gán mới” | Chắc chắn |
| **F-092** | S3 | C-036 | — | STO-ATT-03, DUT-CIN-01 vs 6.13.4, 6.18.4b | 27997, 26731; 28087, 28753 | “[ĐỀ XUẤT sửa DDL, D-12] … tham chiếu trực tiếp … chưa bao giờ đặt attached_at nên tệp đang dùng có nguy cơ bị dọn nhầm” vs “D-12, [HIỆN CÓ - đã khép]” | Ba chỗ nói ba trạng thái khác nhau của cùng D-12 | Đội vận hành không biết tệp minh chứng có bị dọn hay không | Sửa STO-ATT-03 và DUT-CIN-01 theo 6.13.4: “`fn_housekeeping` đã loại tệp đang được tham chiếu trực tiếp; còn mở: tệp đã gỡ giữ `attached_at`” | Chắc chắn |
| **F-093** | S3 | C-037 | — | 6.5 ví dụ check-in | 26591, 26600 | `"client_request_id": "0199c0f2-a3b4-75c6-97d8-4d5e6f7a8b9a"` … phản hồi `"id": "0199c0f2-a3b4-75c6-97d8-4d5e6f7a8b9a"` | `duty_checkins.id` mặc định `app.uuid_v7()`, `client_request_id` là cột riêng; ví dụ gợi ý dùng mã client làm khóa chính | Lập trình viên có thể dùng giá trị client làm `id` | Sửa ví dụ: `id` khác `client_request_id`, phản hồi có cả hai | Chắc chắn |
| **F-094** | S3 | C-038 | — | BL-MEM-50, MEM-PRO-07 | 26425, 26374 | “(29 endpoint MEM)”; “chuyển trạng thái cư trú (MEM-ACC-01)” | Đếm thực 30 (21+5+4); MEM-ACC-01 là nhật ký truy cập, endpoint đúng là MEM-PRO-04 | Sai dẫn chiếu | Sửa “30 endpoint MEM”, “(MEM-PRO-04)” | Chắc chắn |
| **F-095** | S3 | C-039 | — | ACD-CRS-01 | 26857 | “RLS courses__select__authenticated” | Policy thực tên `courses__select` | Tra cứu sai | Sửa tên policy | Chắc chắn |
| **F-096** | S3 | C-040 | — | AUTH-LOG-01, RT-NTF-01, PLT-NTF-01 | 26172, 28344, 28130 | “Thiết bị mới kích hoạt thông báo bắt buộc security.new_device”; “Mỗi người một luồng cho chính mình (member_id từ phiên)” | `notifications.member_id` NOT NULL, `notifications__select__own` dùng `is_self(member_id)`: Admin kỹ thuật/tài khoản invited không có hồ sơ ⇒ không có hộp thư, SSE | Cảnh báo đăng nhập lạ của tài khoản quản trị không tới trong ứng dụng | Đặc tả: thông báo `security.*` cho tài khoản không có hồ sơ gửi email bắt buộc; hoặc DB thêm `notifications.user_id` (nullable `member_id`) và policy theo `user_id` | Chắc chắn |
| **F-097** | S3 | C-041 | — | AIX-JOB-01, 6.15.2 | 28255, 28248 | “Các tác vụ chạy cục bộ … dùng provider là local … nên không bị chặn bởi BR-AI-02” | Thân yêu cầu không có `provider`; `tg_ai_job_gate` coi `provider` NULL là bên ngoài ⇒ mọi tác vụ `never_external`/`external_call_allowed=false` bị chặn nếu API không tự điền; ngược lại client đặt được `status`, `cost_vnd`, `provider` khi INSERT (T4c chèn `succeeded`) | Hoặc tính năng cục bộ không chạy, hoặc nhật ký AI giả | Đặc tả: “API điền `provider` từ cấu hình máy chủ theo `task_code`; không nhận từ client”. DB: §C-004 ép `status/chi phí`, kiểm BR-AI-02 lại khi worker đổi `provider` | Chắc chắn |
| **F-098** | S3 | C-042 | — | 6.1.4; 6.7–6.17 | 25770-25791; ví dụ 26959, 27175, 27556, 27882, 27211 | “Trường lọc và sắp xếp được phép của các danh sách trong nửa này” | Bảng trường `sort` chỉ cho 6.2–6.6; 30+ endpoint nửa sau nhận `sort` nhưng không nêu trường hợp lệ trong khi “Tham số lạ ⇒ 400”; `LAU-WAIT-01`, `FIN-REC-05` trả `list<>` không giới hạn | Hành vi `sort` không xác định; danh sách phình theo thời gian | Thêm bảng sort/lọc cho 6.7–6.17; đổi LAU-WAIT-01, FIN-REC-05 sang `page<>` | Chắc chắn |
| **F-099** | S3 | C-043 | — | 6.16.3; 6.7.4 | 28390, 25700; 27059 vs 28343 | “kiểm lại mỗi 5 phút”; “token bị từ chối ngay khi phiên bị thu hồi”; “mở SSE attendance-stream” vs kênh `attendance-live` | Phiên đã thu hồi còn nhận sự kiện ≤ 5 phút; tên kênh lẫn | Cửa sổ lộ thông báo sau khi khóa tài khoản | Đặc tả: bus nội bộ phát `session.revoked` (theo `sid`) để đóng luồng ngay; thống nhất tên `attendance-live` | Chắc chắn |
| **F-100** | S3 | C-044 | — | PLT-BND-02, PLT-HOOK-02/03 | 28119, 28475-28476 | “Mã dùng một lần, sống 10 phút, lưu ở bộ nhớ đệm … Bot nhận mã qua webhook … ghi member_channel_bindings” | Ai gửi mã đúng trước thì kênh Telegram/Zalo của người đó gắn vào tài khoản; mã trong bộ nhớ tiến trình mất khi khởi động lại/nhiều instance | Người khác nhận thông báo của thành viên | Đặc tả: mã ≥ 8 ký tự base32, giới hạn 5 lần thử/chat/giờ; sau khi bot nhận mã, tạo liên kết “chờ xác nhận” và thành viên bấm xác nhận trong ứng dụng (hiện tên tài khoản Telegram) trước khi đặt `verified_at`; lưu mã băm trong DB/Redis | Nghi ngờ (phụ thuộc hiện thực bot) |
| **F-101** | S3 | C-045 | — | PLT-HOOK-01 | 28465 | “xác định quỹ theo account_last4 (khớp funds.bank_account_last4, loại bank)” | Hai tài khoản ngân hàng cùng 4 số cuối ⇒ dòng sao kê vào nhầm quỹ | Đối soát sai | Đặc tả: ánh xạ theo `(provider, provider_account_id)` cấu hình trước; không khớp duy nhất ⇒ 422 và cảnh báo | Chắc chắn |
| **F-102** | S3 | C-046 | — | COM-ANN-02 | 27802 | “gửi status = draft kèm publish_at; worker chuyển bản nháp có published_at ở tương lai” | Cột là `published_at`; trigger `tg_announcement_before_write` không xử lý `published_at` tương lai | Tên trường không khớp DB | Đặc tả: dùng `published_at`; ghi rõ API cho phép đặt `published_at > now()` khi `status=draft` | Chắc chắn |
| **F-103** | S3 · THIẾU | C-048 | — | AUTH-OID-02; USR-DLG; DUT-APL | 26185, 26203-26206, 26728 | “409 ACCOUNT_EXISTS, hướng dẫn đăng nhập mật khẩu rồi liên kết” | Không có endpoint liên kết/gỡ Google; không có từ chối ủy quyền; không có rút khiếu nại | Luồng được mô tả nhưng không làm được | Thêm AUTH-OID-03 (POST/DELETE `/me/identities/google`, step-up), USR-DLG-05 (`POST /role-delegations/{id}/decisions` approve/reject), DUT-APL-04 (`POST /duty/appeals/{id}/withdraw`, cần policy mới) | Chắc chắn |

### Bước 6–7 — Storage, bảo mật & quyền riêng tư

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-104** | S2 (rủi ro tài liệu đã chấp nhận ở B.3) | D-001 | — | Bước 7 §2.3/2.5/9 | `app.current_user_id()` = `current_setting('app.current_user_id')`; policy mọi bảng | B5.1: dưới `luuxa_app`/b1 chạy `set_config('app.current_user_id','<a2>',true)` → `has_permission('member.private.read')=true`, `member_private_details` **1 dòng** | Ngữ cảnh người dùng chỉ là **GUC không ký, không khóa**; `luuxa_app` có toàn quyền `set_config` trên GUC tùy biến. Không có cơ chế ký/khóa danh tính. | Một lỗ **SQL injection** ở tầng API (chạy được 1 câu SQL tùy ý dưới `luuxa_app`) ⇒ **chiếm bất kỳ danh tính nào** ⇒ đọc mọi dữ liệu nhạy cảm, duyệt chi, gán vai trò. RLS/GRANT **không** chống được (tài liệu 2.3/9 thừa nhận). | Không vá được hoàn toàn ở DB với GUC thuần. Giảm thiểu: (a) tuyệt đối tham số hóa + chặn multi‑statement ở driver; (b) cân nhắc đặt ngữ cảnh bằng **bản ghi phiên có ký** thay GUC, hoặc dùng `SET ROLE` theo từng người (không khả thi với pooler); (c) WAF/kiểm thử injection T16. (Khuyến nghị quy trình, không có SQL một dòng.) | Chắc chắn |
| **F-105** | S2 | D-002 | 72 | Bước 7 §4.5.2 / §4.6 | `app.user_roles_of(uuid)`, `app.roles_have_permission(text[],text)`, `app.has_active_consent(uuid,text)` (SECURITY DEFINER, EXECUTE cho `luuxa_app`) | E8: bảng `user_roles` lọc 0 dòng cho b1 **nhưng** `app.user_roles_of('<a2>')` trả `{house_head,member}`; `has_active_consent('<b2>','catholic_profile')=true` | Hàm SECURITY DEFINER nhận **id tùy ý**, không kiểm người gọi là chính chủ/có quyền ⇒ **oracle vượt RLS**. `user_roles_of/roles_have_permission` chỉ được các hàm DEFINER khác dùng, không cần cấp cho `luuxa_app`. | Thành viên thường **liệt kê vai trò bất kỳ ai** (vượt RLS `user_roles`) và **dò trạng thái consent** của người khác (suy ra tồn tại dữ liệu tôn giáo/điểm). | Đã chạy OK (FIX‑1/FIX‑2): <br>`REVOKE EXECUTE ON FUNCTION app.user_roles_of(uuid) FROM luuxa_app;`<br>`REVOKE EXECUTE ON FUNCTION app.roles_have_permission(text[],text) FROM luuxa_app;`<br>(xác minh RLS duyệt chi/catholic vẫn chạy vì chủ hàm `luuxa_definer` giữ EXECUTE). `has_active_consent` **phải giữ** cho `luuxa_app` vì RLS catholic/academic gọi trực tiếp — rò rỉ boolean còn lại là mức thấp, xử lý ở tầng app. | Chắc chắn |
| **F-106** | S2 · THIẾU | D-003 + B-013 | 72 | Bước 7 §9.2.3–9.2.5 | Không có hàm; `data_subject_requests`; `fn_housekeeping` | B9.2: `… proname ILIKE '%anonymi%'` → **0**; B9: sau khi `left`, CCCD/Công giáo **vẫn còn**, `nid_last4='0000'` | Quyền **xóa/ẩn danh** (BR‑MEM‑15, BR‑SEC‑05, "khi rời lưu xá") **không có hiện thực DB**. `fn_anonymize_member` không tồn tại; không job áp `retention_days`; `data_subject_requests` chỉ là phiếu. *(Trùng/bổ sung từ B-013: `fn_assign_room` không tồn tại (thực tế: INSERT `room_assignments` + `tg_room_assignment_rules`); `fn_anonymize_member` chưa có trong DDL (BL-MEM-20, SHOULD) nhưng 9.2 mô tả như cơ chế đang có cho quyền xóa dữ liệu…)* | Yêu cầu "quyền được xóa"/retention là **khẩu hiệu**: dữ liệu rất nhạy cảm của người đã rời tồn tại vô thời hạn; không đáp ứng Nghị định 13/2023 như tài liệu tuyên bố. | Cần bổ sung hàm thật (ngoài phạm vi 1 dòng). Khung tối thiểu đã chạy thử (ẩn danh members + xóa tầng 2/3):<br>`UPDATE member_private_details SET national_id_enc=NULL,national_id_bidx=NULL,national_id_last4=NULL,national_id_key_version=NULL,birth_date=NULL,hometown=NULL,home_address=NULL WHERE member_id=$1;`<br>`DELETE FROM catholic_profiles WHERE member_id=$1; DELETE FROM member_sacraments WHERE member_id=$1; DELETE FROM member_guardians WHERE member_id=$1;`<br>`UPDATE members SET full_name='[đã ẩn danh]',display_name='TV'\|\|member_no,contact_phone_e164=NULL,contact_email=NULL,avatar_file_id=NULL WHERE id=$1;` (bọc trong `app.fn_anonymize_member` SECURITY DEFINER + ghi audit). | Chắc chắn |
| **F-107** | S3 | D-004 | — | Bước 7 §1.2 / danh bạ | `members.contact_phone_e164/contact_email`; GRANT cột cho `luuxa_app`; RLS `members__select__directory` | E1: b1 `SELECT contact_phone_e164 FROM members WHERE id=b2` → **trả số** dù `hide_phone=true` | `hide_phone`/che một phần chỉ ở **service** ("API danh bạ che số"); DB cấp SELECT cột cho mọi người có `member.read` (tức mọi thành viên). | Lộ SĐT/email mọi thành viên cho bất kỳ thành viên nào nếu truy vấn trực tiếp (hoặc qua D‑001). `hide_phone` không có hiệu lực ở lớp dữ liệu. | Không bịt bằng RLS (RLS theo dòng, không theo ô). Giải pháp đúng: phục vụ danh bạ qua **view `v_member_directory`** che SĐT/email (đã nằm backlog BL‑MEM‑20) và thu hồi SELECT trực tiếp 2 cột này khỏi `luuxa_app`, chỉ để lộ qua view/own‑row. (Thay đổi thiết kế, không 1 dòng.) | Chắc chắn |
| **F-108** | S3 | D-005 | 72 | Bước 7 §4.1.3 | `public.hmac/digest/pgp_sym_*/gen_random_bytes/crypt` | E7: `proacl IS NULL` (mặc định) → PUBLIC EXECUTE; `luuxa_app` gọi được hmac/digest/pgp/gen_random_bytes | pgcrypto cài vào `public` giữ **EXECUTE mặc định cho PUBLIC**; không REVOKE. | Rủi ro thấp (khóa cột ở ngoài DB, cột `qr_sessions.secret` không đọc được) nhưng vi phạm tối thiểu đặc quyền; nếu lộ secret ở nơi khác thì hmac sẵn có để giả mạo. | Đã chạy OK:<br>`REVOKE EXECUTE ON FUNCTION public.hmac(bytea,bytea,text),public.hmac(text,text,text),public.digest(bytea,text),public.digest(text,text),public.pgp_sym_encrypt(text,text),public.pgp_sym_decrypt(bytea,text),public.gen_random_bytes(integer),public.crypt(text,text) FROM PUBLIC;`<br>`GRANT EXECUTE ON FUNCTION public.hmac(bytea,bytea,text) TO luuxa_definer;` (cho `fn_qr_mac`). | Chắc chắn |
| **F-109** | S3 | D-008 | 72 | Bước 7 §9.5.1 | `trg_users__audit = tg_audit('id','password_hash')` | B3.2: `new_data` của `users` chứa `email`/`phone_e164` **rõ** (chỉ `password_hash` bị che) | Audit `members` che `contact_phone_e164/contact_email` nhưng audit `users` không che email/SĐT ⇒ người có `audit.log.read` (gồm Admin kỹ thuật) thấy email/SĐT rõ. | Rò rỉ liên lạc tầng‑2 cho Admin kỹ thuật qua cửa audit; thiếu nhất quán che dữ liệu. | Đã chạy OK:<br>`DROP TRIGGER trg_users__audit ON users;`<br>`CREATE TRIGGER trg_users__audit AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id','password_hash,email,phone_e164');` | Chắc chắn |
| **F-110** | S3 | D-010 | — | Bước 6 §5.3 | `ck_storage_files__size` (≤20 MiB) | Chỉ có trần cứng ở DB; trần mềm 10 MB + S3 `content-length-range` ở service | Ép dung lượng thực tế (và MIME magic‑bytes, quét mã độc, EXIF) **không ở DB** | Nếu quên cấu hình POST‑policy/HEAD‑recheck ở API, có thể nạp tệp tới 20 MiB hoặc sai loại; DB không phải lớp chặn thứ hai cho các kiểm tra này | Giữ nguyên thiết kế nhưng **bắt buộc** policy S3 `content-length-range` + `Content-Type` trong URL ký và re‑HEAD ở `complete` (6.13.1). (Kiểm thử T21/T22.) | Chắc chắn** (giới hạn DB) |
| **F-111** | S3 | D-011 | — | Bước 6 §5.4 | `fn_housekeeping`; `media_attachments` (đa hình) | Tệp đã gỡ giữ `attached_at`; xóa thực thể để lại liên kết mồ côi | Dọn mồ côi chỉ theo `attached_at IS NULL`; không reset khi gỡ; không cascade cho liên kết đa hình | Rò rỉ dung lượng mức thấp (đã ghi BL‑STO‑07/D‑12) | Thêm trigger `AFTER DELETE ON media_attachments` đặt lại `attached_at=NULL` khi tệp không còn liên kết nào; job thống kê tệp không tham chiếu. | Nghi ngờ** (đã tài liệu hóa) |

### Bước 8 — Đề xuất FE & AI

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-112** | S2 | E-001 + A-008 | — | Phần 1 (1.1.1, 1.2.1, 1.12), Phần 6, 7.5 | dòng 245, 656, 4966, 4970, 26402, 26485, 26489, 26705, 26731–26755, 26864, 26899–26901, 32759 | "`store.tsx:291,315,373,402` (23 chỗ); `store.tsx:308,316,374,404`"; "`addMember` (`store.tsx:397-409`)"; "`so-do-nha/page.tsx:81`, `hau-can/page.tsx:76`" | Số dòng thuộc `e4ba5fb` (ghi chú audit cũ), không phải `740ac5d`: `Math.random` thực ở 307/331/389/418; `addMember` ở 413; `canReviewDuties` ở `hau-can/page.tsx:116`; `canManageHouse` ở 82. Kiểm hệ thống: 14/15 trích dẫn hàm `store.tsx` ở Phần 2–6 khớp commit cũ *(Trùng/bổ sung từ A-008: Đây là số dòng của commit **e4ba5fb** (đã kiểm: `git show e4ba5fb:src/lib/store.tsx` có addMember ở 397). Ở HEAD 740ac5d chúng trỏ vào mã khác: store.tsx:397-409 là markAllAnnouncementsRead/markAnnouncementRead; hau-can/…)* | Trái với khẳng định "đã kiểm trên 740ac5d" (dòng 28782); người đọc mở sai dòng; giảm độ tin của truy vết | Chạy lại ánh xạ dòng `e4ba5fb→740ac5d` (`git diff` hoặc tìm theo tên hàm) cho Phần 1 và Phần 6; thêm kiểm tra CI "mỗi `file:dòng` chứa định danh được nêu" | Chắc chắn |
| **F-113** | S2 | E-002 + A-009 | — | 6.4.3 | dòng 26484, 26488, 26490 | "`addRoom` (…; nút Nhân bản `so-do-nha/page.tsx:291`)"; "`moveMemberToRoom` (`store.tsx:241-256`…) Không kiểm sức chứa…"; "Lưu vị trí phòng trên canvas (`FloorplanCanvas.tsx:456-466`)" | Mô tả FE của commit cũ: ở `740ac5d`, `moveMemberToRoom` **có** chặn phòng đầy (`store.tsx:251-259`, chính tài liệu dòng 1063 thừa nhận); không còn nút "Nhân bản" (`onDuplicateRoom` khai ở `FloorplanCanvas.tsx:43` nhưng không dùng); `FloorplanCanvas.tsx:456-466` là nhãn SVG "x/y chỗ", canvas không còn gọi `updateRoom` *(Trùng/bổ sung từ A-009: HEAD: moveMemberToRoom **đã chặn** vượt sức chứa phòng ngủ (lib/store.tsx:251-260; canvas cũng chặn ở components/FloorplanCanvas.tsx:131-170) — chính 7.2.4.3 dòng 29469 cũng ghi vậy. Canvas HEAD vẽ SVG cố định theo id ph…)* | Bảng ánh xạ chức năng sang endpoint mô tả sai hiện trạng; mâu thuẫn nội bộ với 1.3.1 và 7.3.4 | Cập nhật 6.4.3 theo `740ac5d` (bỏ "nút Nhân bản", sửa "Không kiểm sức chứa" thành "chỉ kiểm sức chứa ở client theo tổng chỗ", bỏ dòng lưu tọa độ hoặc ghi là mã chết) | Chắc chắn |
| **F-114** | S2 | E-011 | 71 | 8.2.5, 8.3.4, DDL `tg_ai_job_gate` | dòng 33426, 34965–34999, seed 21097 | "`ai_task_types.monthly_budget_vnd` là trần riêng từng tác vụ (ví dụ OCR hóa đơn 50.000 đ…)" | Không hàm hay trigger nào đọc `monthly_budget_vnd` | Một tác vụ có thể dùng hết ngân sách chung; "trần riêng" chỉ có trên giấy | Trong gate cộng `ai_usage_daily.cost_vnd` của tháng theo `task_code` và chặn khi ≥ `monthly_budget_vnd` | Chắc chắn |
| **F-115** | S2 | E-012 | 71 | DDL `tg_ai_job_gate`, `tg_ai_job_usage` | dòng 34987–34990, 35021–35022, 21111 | `IF FOUND AND v_b.hard_stop AND v_b.used_vnd >= v_b.limit_vnd` | Thiếu dòng `ai_budgets` của tháng thì không chặn (mở khi lỗi) và chi phí không được cộng | Tháng nào job tạo ngân sách chạy hỏng thì AI không có trần, mất số liệu chi phí | Mặc định chặn khi `NOT FOUND`, hoặc gate tự `INSERT … ON CONFLICT` dòng tháng từ `settings` | Chắc chắn |
| **F-116** | S2 | E-014 | — | 8.1 (AI-10, AI-20), 8.2.7 `fn_decide_ai_suggestion`, 7.5.3 | dòng 33312, 33339, 35038, 35071 | "thành viên xác nhận từng dòng" (AI-10); "người đăng chấp nhận hoặc sửa từng chú thích" (AI-20); `IF … NOT app.has_permission('ai.review')` | `ai.review` chỉ có Trưởng nhà, Phó nhà, Thủ quỹ; Thành viên, Ban TT chỉ có `ai.use` | Người được giao duyệt không ghi nhận được quyết định; gợi ý thành `expired`; `v_ai_acceptance`, chỉ số dùng cho điều kiện dừng, sai với các tác vụ này | Cho chủ thể hoặc người yêu cầu được quyết định gợi ý trên dữ liệu của chính mình (điều kiện `requested_by = current_user` và tác vụ cho phép tự duyệt), hoặc sửa mô tả AI-10/20 | Chắc chắn |
| **F-117** | S2 | E-017 | — | 8.1 AI-03, 8.3.1, seed | dòng 33295, 35108, 21100 | AI-03 "Vào: tên gọi, số tháng nợ, số tiền, hạn nộp"; 8.3.1 "Chỉ số tổng hợp mới được gửi; không gửi theo từng người"; seed "không gửi tên người" | Ba chỗ mâu thuẫn; AI-03 gửi nợ của từng người kèm tên gọi tới LLM bên ngoài | Vi phạm chính quy tắc riêng tư của tài liệu; lại là tác vụ không cần LLM | LLM (nếu dùng) chỉ sinh **mẫu** có biến `{ten}`, `{so_tien}`; điền biến cục bộ; hoặc bỏ AI-03, dùng mẫu cố định | Chắc chắn |
| **F-118** | S3 | E-003 | — | 1.4.1 | dòng 1347, 1351 | "Check-in \| `page.tsx:231-257`"; "Copy Zalo \| `page.tsx:205-229`" | Đảo nhãn: 205 là `handleOpenCheckInModal`, 231 là `handleCopyDutyScheduleZalo` | Dẫn sai đoạn mã | Đổi chỗ hai khoảng dòng | Chắc chắn |
| **F-119** | S3 | E-005 | — | 7.3 | FX-SHARED-29 với FX-KHOANHKHAC-29 (dòng 32265, 31660); `error.tsx` ở 6 FX; `react-hook-form` ở 16 FX | "Lớp Tailwind không có hiệu lực…" (lặp ở 9 FX) | Cùng một sửa đổi xuất hiện ở mục chung và nhiều mục route; công sức có thể cộng hai lần | Người-ngày FE (1.550) có thể bị thổi khoảng vài phần trăm | Đánh dấu mục route là "áp dụng FX-SHARED-xx", công sức 0 hoặc S; gộp FX-KHOANHKHAC-29 vào FX-SHARED-29 | Nghi ngờ |
| **F-120** | S3 | E-006 | — | 7.2.2.1 (5), 7.2.3.2 | dòng 29069, 29213–29225 | "Cờ được Next.js thay giá trị lúc build nên nhánh mock là mã chết và bị loại khỏi bundle" và ví dụ `const source = dataSource("HOUSE")` | Next chỉ thay `process.env.NEXT_PUBLIC_X` viết literal; tra động không được thay; nhánh qua lời gọi hàm thường không bị DCE | Adapter mock có thể vào bundle production (CI quét sẽ bắt, gây làm lại) | Trong `flags.ts` đọc từng biến bằng literal và export hằng; dùng `import()` động cho adapter mock | Nghi ngờ |
| **F-121** | S3 | E-007 | — | 7.2.3.2 | dòng 29213–29225 (ví dụ `useRooms`) | `api.GET("/rooms", …).then(toRooms)` | `openapi-fetch` trả `{data, error, response}`, không ném lỗi | Lỗi API thành dữ liệu rỗng nếu `toRooms` không mở gói, TanStack Query không vào trạng thái lỗi | Ví dụ nên `const {data, error} = await api.GET(...); if (error) throw toApiError(error)` hoặc middleware ném | Nghi ngờ |
| **F-122** | S3 | E-015 | — | 8.2.5, nguyên tắc 5, DDL | dòng 33243, 34987, 35012–35022 | "Trần chi phí cứng. Ngân sách tháng ở DB, vượt thì job mới bị chặn" | Kiểm-rồi-làm không khóa, không giữ chỗ chi phí; chỉ cộng khi job kết thúc `succeeded`/`failed`; job `queued` không kiểm lại khi chạy (kể cả khi đồng ý đã rút) | Vượt trần bằng số job đang chạy (nhỏ ở quy mô này); job đã tốn phí nhưng `cancelled` không được tính | Giữ chỗ chi phí ước tính lúc INSERT (`reserved_vnd`) dưới `SELECT … FOR UPDATE`; worker gọi lại gate trước khi gọi nhà cung cấp; tính cả `cancelled` có `cost_vnd > 0` | Chắc chắn (cơ chế); mức thiệt hại nhỏ |
| **F-123** | S3 | E-016 | — | Phần 8 nguyên tắc 3, 8.3.1 | dòng 33241, 35098 | "Phân loại … được ép bởi cổng DB" | `provider` do ứng dụng tự khai; gate chỉ so nhãn | Một lỗi ở worker vẫn gửi dữ liệu `never_external` ra ngoài | Nói rõ đây là phòng thủ thêm một lớp; bổ sung chặn mạng ra (egress) cho worker tự host và kiểm thử tích hợp | Chắc chắn |
| **F-124** | S3 | E-018 | — | 8.2.2 với AIX-JOB-01 | dòng 33382, 28255, 36932 | "Bị chặn … API-->>FE: 409 kèm lý do" và "Luôn 202; nếu bị chặn thì AiJobDto.status=blocked" | Hai hợp đồng phản hồi khác nhau | FE và BE hiện thực lệch nhau | Chọn một (202 + `status=blocked` theo Phần 6) và sửa sơ đồ | Chắc chắn |
| **F-125** | S3 | E-019 | — | Phần 0, 8.4.4, Phần 10 | dòng 161, 35246–35258, 35975, 36903, 35188 | "(1) … AI-08 … (2) … AI-07" và "1 AI-07, 2 AI-08"; "Giai đoạn 6 — AI giai đoạn 1 (các mục Top 5)"; "≥ 3 tháng" và "quyết định sau 6 tháng" | Thứ tự Top 5 lệch; 3/5 mục Top 5 ở GĐ 3; mốc AI-13 lệch | Người đọc điều hành nhận thông điệp khác nhau | Thống nhất thứ tự; ghi "GĐ 6: AI-01, AI-13 (LLM) của Top 5"; chọn một mốc cho AI-13 | Chắc chắn |
| **F-126** | S3 | E-020 | — | 8.1, 8.4.3, 8.4.6, GD-AI-03 | dòng 33346, 35237, 35275–35283, 36929 | AI-13 "khoảng 20 câu mỗi tuần" và chi phí theo "300 câu hỏi"; AI-01 dừng khi "chi phí trên 20.000 đ" và seed trần 50.000 đ | Giả định khối lượng và ngưỡng không nhất quán; giả định token mỗi lượt không nêu nên chi phí không tái lập được | Lợi ích hoặc chi phí AI-13 lệch khoảng 3,4 lần; khó kiểm toán ước tính | Nêu bảng giả định token/lượt; dùng một khối lượng cho cả lợi ích và chi phí; đồng bộ trần seed với điều kiện dừng | Chắc chắn |
| **F-127** | S3 (quan điểm) | E-021 | — | 8.4.4, Phần 10 GĐ 6 | dòng 35246–35258, 35858 | "Top 5 … lý do định lượng"; GĐ 6 = 3/6 + 8/40 người-ngày | Không so lợi ích với chi phí xây hạ tầng LLM: khoảng 46 người-ngày để tiết kiệm khoảng 5,6 giờ/tháng (hoàn vốn khoảng 66 tháng); 3/5 "ứng dụng AI" thực ra không phải AI | Nguy cơ "AI cho có" ở tầng LLM; dễ hiểu nhầm phạm vi AI | Đổi tên nhóm luật và solver thành "tự động hóa"; đặt AI-01/AI-13 sau điều kiện "tìm kiếm + FAQ không đủ"; đưa chi phí xây dựng vào tiêu chí Top 5 | Quan điểm |
| **F-128** | S3 | E-022 | — | 8.1 AI-22 | dòng 33323 | "Phát hiện bất thường điểm danh QR (nhiều người cùng thiết bị, tọa độ bất khả thi)… Vào: … tọa độ và giờ quét" | `attendance_records` chỉ có `distance_m`, `device_hash`, `checked_in_at` (catalog), không có tọa độ | Không làm được vế "tọa độ bất khả thi" | Bỏ vế tọa độ hoặc thêm cột (cân nhắc riêng tư vị trí) | Chắc chắn |
| **F-129** | S3 | E-023 | — | Phần 4 với 8.2.8 | dòng 8469, 35084, 37104 | "`pgvector` không bắt buộc — chỉ cần nếu bật khối tùy chọn ở Phần 8" | Phần 8 không có khối vector nào ("DDL không chứa bảng vector") | Tham chiếu chéo lỗi thời | Sửa câu ở Phần 4 thành "chỉ cần khi thêm migration vector trong tương lai (8.2.8)" | Chắc chắn |
| **F-130** | S3 · THIẾU | E-024 | — | 8.1 AI-21, AI-16 | dòng 33340, 33349 | "Khuôn mặt là dữ liệu sinh trắc học, cần … đánh giá rủi ro pháp lý"; "Giọng nói … là dữ liệu sinh trắc học" | Phần 8 không dẫn văn bản pháp lý (Phần 9 có); câu về giọng nói quá rộng | Thiếu căn cứ khi Ban điều hành cân nhắc | Dẫn chéo 9.2 (Luật BVDLCN 2025 hiệu lực 01/01/2026; trạng thái Nghị định 13/2023 cần luật sư xác nhận); sửa câu về giọng nói thành "chỉ là sinh trắc học khi dùng để nhận dạng người nói" | Nghi ngờ (hiện trạng văn bản: KHÔNG XÁC MINH ĐƯỢC) |
| **F-131** | S3 | E-025 | — | 8.3.1, seed `community.policy_rag` | dòng 35098–35112, 21105 | `community.policy_rag` … `internal_ok` | Phân loại dựa trên nguồn (nội quy), bỏ qua **câu hỏi tự do** của thành viên, vốn có thể chứa thông tin cá nhân hoặc nhạy cảm; không có bước ẩn danh hóa câu hỏi | Thông tin cá nhân có thể rời hệ thống | Xếp `mask_required` cho câu hỏi; lọc PII (SĐT, CCCD, tên) trước khi gửi; cảnh báo trên giao diện | Nghi ngờ |

### Bước 9 — Nhất quán xuyên suốt

| ID | Mức | Nguồn | Vá | Phần/Mục | Vị trí cụ thể | Trích đoạn lỗi | Vì sao sai | Hậu quả | Cách sửa (tóm tắt) | Chắc chắn/Nghi ngờ |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-132** | S3 | B-010 | — | 2.4/ADR-05 ↔ 6.1/6.16/6.17 | 159, 6080, 6198, 25902 ↔ 26007, 28406, 28439 | ADR-05 "chưa dùng Redis"; BL-ALL-50 (MUST) "hạn mức theo nhóm ở Redis"; 28406 "Redis pub/sub (đã nằm trong kiến trúc Phần 2)"; 28439 "Bộ nhớ tạm (Redis) giữ khóa 48 giờ" | Cùng một quyết định kiến trúc bị mô tả ngược nhau | Đội dựng hạ tầng sai (thêm Redis) hoặc thiếu chỗ lưu khóa webhook | Sửa 3 vị trí theo ADR-05 (bộ nhớ tiến trình / bảng DB), Redis chỉ khi ≥ 2 instance | Chắc chắn |
| **F-133** | S3 | B-011 | — | 1.10.3.2 ↔ 4.7.2, BR-LAU-01 | 4156 ↔ 4510, 20740, 37014 | Lỗ hổng FE mức Cao: "thiếu khung 12:00 đến 14:00"; seed `laundry.slots` cũng không có 12:00–14:00 | Gọi một hành vi là lỗi nghiêm trọng của FE nhưng giữ nguyên làm mặc định DB | Người đọc không biết đây là lỗi hay quy tắc nhà | Xếp lại thành `[GIẢ ĐỊNH]` (Q-LAU-01) và bỏ khỏi bảng lỗ hổng, hoặc thêm khung vào seed | Chắc chắn |
| **F-134** | S3 | B-012 | — | 3.4 ↔ DDL | 8245; DB | Quy ước: "ENUM cho tập đóng gắn với máy trạng thái… bảng cho giá trị Ban điều hành tự sửa" | 10 cột trạng thái dùng `text + CHECK` (`album_member_tags`, `content_reports`, `laundry_machines`, `laundry_waitlist`, `liturgy_assignments`, `meal_menus`, `prayer_intentions`, `qr_sessions`, `reflections`, `storage_files.scan_status`) — lựa chọn thứ ba không nêu | Mã sinh kiểu/Zod phải đọc CHECK; không đồng nhất | Ghi quy ước "text + CHECK" kèm tiêu chí, hoặc chuyển sang ENUM | Chắc chắn |
| **F-135** | S3 | B-014 | — | Chú giải, Phần 0, 1 | 26, 142, 209 | Chú giải FE-XX không có `ST`, `LD`; "13 phân hệ" vs "Tổng quan điểm số 12 phân hệ" (13 dòng) | Nhãn và số đếm lệch nhau | Nhầm lẫn nhỏ khi tra mã | Bổ sung `ST` (state), `LD` (lịch giặt) vào chú giải; sửa tiêu đề "13 phân hệ (12 baseline, tách COM/LAU)" | Chắc chắn |
| **F-136** | S3 | B-015 | — | Phần 0 | 142, 165 | "hơn 1.000 khẳng định"; "Công sức (hiệu suất 70%, dự phòng 20%): phạm vi MUST ≈ 1.528 người-ngày" | 574 ASSERT + 525 kỳ vọng lỗi (B.1 ghi đúng "khẳng định và kỳ vọng lỗi"); 1.528 là người-ngày thô, 70%/20% chỉ áp vào số tuần (35862) | Diễn đạt dễ hiểu sai | Sửa câu chữ cho khớp 37100 và 35862 | Chắc chắn |
| **F-137** | S3 | B-016 | — | 3.5 #2 ↔ DDL | 8252; DB | "unique chỉ trên bản ghi chưa xóa" | 8 unique trên bảng có `deleted_at` không có `WHERE deleted_at IS NULL` (`ux_members__member_no`, `ux_members__user_id`, `ux_funds__code`, `ux_universities__code`, `ux_categories__id_kind`, `ux_storage_files__bucket_key`, `ux_album_photos__file`, `ux_events__rule_occurrence`) | Khẳng định nguyên tắc không đúng tuyệt đối; có thể cố ý (mã không tái sử dụng) nhưng không ghi | Ghi danh sách ngoại lệ có chủ đích trong 3.5 | Nghi ngờ (có thể là thiết kế cố ý) |
| **F-138** | S3 | E-004 + B-005 | — | Phần 0, 7.3, Phần 10 | dòng 144, 30220 (bảng tổng 366), 37185 | "373 hạng mục sửa Frontend"; "741 hạng mục (349 BL, 373 FX, 26 AI)" | 7 trong 373 FX là "đã xử lý" (không MoSCoW, không công sức); backlog có 366 FX; 349 + 373 + 26 = 748 ≠ 741; dòng 37185 còn ghi "thiếu trường: 0" dù 7 FX không có MoSCoW *(Trùng/bổ sung từ B-005: 349 + 373 + 26 = 748; Backlog có 366 FX — 7 mục "đã xử lý" (FX-CAIDAT-15, FX-SHARED-54, FX-SODONHA-30…34) không vào bảng…)* | Số liệu điều hành tự mâu thuẫn, thổi nhẹ khối lượng việc | Ghi "366 hạng mục cần làm + 7 đã xử lý"; sửa phép cộng | Chắc chắn |


### ③.bổ sung Bước 4 — kiểm mẫu Business Rules, quy trình còn thiếu, mâu thuẫn tài liệu ↔ DDL

#### Kiểm mẫu Business Rules

**Đối chiếu toàn bộ chỉ mục 1.15 (425 dòng)** với catalog thật của `luuxa_biz` (`biz/br_check.js`): 413 dòng nêu đối tượng DB, **1052/1052 tên đối tượng tồn tại (100%)** — tài liệu không bịa tên. Cột "Kiểm thử": 253 dòng là mục smoke (S#), 146 dòng `service`, 26 dòng `process`. Như vậy **160/413 dòng "có cơ chế ở DB" không có kiểm thử DB nào**, và ít nhất 9 BR liệt kê đối tượng DB nhưng DB **không thực thi** quy tắc đó (N-21).

**Mẫu ngẫu nhiên 45 BR** (LCG hạt giống 20261003, `biz/_br_sample.tsv`). "Thử" = tôi chạy kịch bản trong `F_tests.sql`; "Smoke" = mục S# của tác giả, tôi chạy lại toàn bộ — pass.

| BR | Đối tượng DB (≤3 trong chỉ mục) | Tồn tại? | Chặn thật? |
|---|---|---|---|
| BR-AUTH-05 | trg_user_roles__validate_scope, trg_role_delegations__validate_scope, tg_validate_scope | Có | Không kiểm (test = service) |
| BR-MEM-02 | ck_member_private__nid_complete, ck_member_private__nid_last4, ux_member_private__nid_bidx | Có | Có (Smoke S4) |
| BR-MEM-07 | trg_members__leave_effects, tg_member_leave_effects, ck_members__left_status | Có | **Có (Thử)**: alumni thiếu left_on bị chặn |
| BR-MEM-09 | trg_members__guard, tg_members_guard, members__update__self_or_staff | Có | **Có (Thử)**: đổi full_name/user_id bị chặn, display_name được |
| BR-MEM-10 | ix_members__search | Có | Không — chỉ là chỉ mục, không thể "chặn" |
| BR-MEM-11 | member_guardians, consent_purposes, consents | Có | Không kiểm (service) |
| BR-MEM-16 | ck_consent_purposes__retention, consent_purposes | Có | Không kiểm (service) |
| BR-MEM-18 | trg_members__leave_effects, user_roles | Có | **Không — DB chưa làm (Thử I1)** |
| BR-HOUSE-02 | trg_room_assignments__rules, tg_room_assignment_rules, ck_rooms__bed_only | Có | **Có (Thử)**: xếp người vào nhà nguyện bị chặn |
| BR-HOUSE-15 | rooms__write, room_status_t | Có | Không kiểm (service) |
| BR-HOUSE-16 | ck_rooms__layout, ck_floors__canvas | Có | Không kiểm (service) |
| BR-HOUSE-17 | ux_amenities__code, ck_room_amenities__quantity, amenities__write__house_manage | Có | Không kiểm (test = service) |
| BR-DUTY-03 | trg_duty_checkins__rules, tg_duty_checkin_rules, ux_duty_checkins__evidence | Có | **Một phần (Thử D4)**: SHA/pHash/bucket chặn; giờ chụp dựa giờ client khai |
| BR-DUTY-18 | cleaning_areas, ck_cleaning_areas__points, ck_cleaning_areas__min | Có | **Có (Thử)** |
| BR-ACAD-10 | courses, ux_courses__university_name, courses__update | Có | **Có (Thử)**: "GIAI TICH 1" trùng "Giải Tích 1" |
| BR-EVT-04 | fn_checkin_by_qr, fn_qr_mac, fn_qr_token | Có | **Có (Thử)**: token cũ/MAC giả bị chặn |
| BR-EVT-07 | trg_leave_requests__rules, tg_leave_request_rules, leave_requests__update | Có | **Có (Thử)** |
| BR-EVT-11 | ux_qr_sessions__active_per_event, ck_qr_sessions__window, trg_qr_sessions__state | Có | **Có (Thử)** |
| BR-EVT-13 | fn_generate_recurring_events, ux_events__rule_occurrence, event_recurrence_exceptions | Có | Có (Smoke S8) |
| BR-EVT-16 | fn_close_event_attendance, merit_rules, ux_merit_entries__source | Có | Có (Smoke S8) |
| BR-FIN-01 | trg_expense_approvals__rules, tg_expense_approval_rules, expense_approvals__insert | Có | **Một phần (Thử)**: trực tiếp chặn (A3, người ứng); lách qua ủy quyền (C1–C3) |
| BR-FIN-18 | trg_ledger_entries__chain, ensure_period, ck_financial_periods__month_start | Có | **Một phần (Thử)**: ngày tương lai chặn; ghi lùi qua tháng trống không chặn (E2/E3) |
| BR-FIN-20 | ck_ledger_entries__amount, ck_expense_vouchers__amount, ck_contribution_payments__amount | Có | **Có (Thử)**: 0 đ và 1.000.000.001 đ bị chặn |
| BR-FIN-25 | fn_contribution_status, trg_contributions__before_write, trg_contribution_allocations__rollup | Có | **Có (Thử)**: sửa tay paid_vnd/status bị từ chối |
| BR-FIN-34 | ck_ledger_entries__source_ref, fn_pay_expense, fn_record_contribution_payment | Có | **Có (Thử)** |
| BR-FIN-42 | funds, finance.period.close_requires_reconciliation | Có | Không kiểm (process) |
| BR-FAC-03 | fn_verify_issue, ck_maintenance_issues__verified, trg_maintenance_issues__before_write | Có | Có (Smoke S11a) |
| BR-FAC-06 | trg_asset_loans__rules, tg_asset_loan_rules, trg_asset_loans__state | Có | Có (Smoke S11b) |
| BR-FAC-11 | vendors__select, vendors__write, ck_vendors__phone | Có | **Có (Thử)**: SĐT sai chặn; thành viên thấy 0 dòng |
| BR-FAC-15 | finance.expense.dual_approval_min_vnd, fn_propose_repair_expense | Có | Không kiểm (process) |
| BR-MOM-08 | ux_album_photos__file | Có | Có (Smoke S11j) |
| BR-COM-09 | fn_notify, notification_preferences, ck_notification_preferences__quiet | Có | Có (Smoke S12b) |
| BR-COM-14 | forum_posts__select, forum_posts__update, forum_comments__update | Có | Có (Smoke S11e) |
| BR-COM-31 | forum_posts__update, forum_comments__update, trg_forum_comments__count | Có | Có (Smoke S11e) |
| BR-LAU-16 | laundry_bookings__insert, laundry_bookings__update, laundry_machines__write | Có | Một phần (Smoke S11c; thông báo người bị ảnh hưởng ở service) |
| BR-STO-10 | file_status_t, trg_storage_files__guard, ck_storage_files__scan | Có | **Có (Thử)**: tự đặt `ready` bị chặn |
| BR-STO-19 | consent_purposes, fn_housekeeping | Có | Không kiểm (service) |
| BR-SEC-07 | fn_audit_event, write_audit, ck_audit_logs__action | Có | Có (Smoke S10c) |
| BR-SEC-10 | — (quy trình) | n/a | Không ở DB |
| BR-AI-01 | ai_suggestions, fn_decide_ai_suggestion, ai_suggestions__update | Có | Có (Smoke S12c) |
| BR-MER-01 | trg_merit_entries__immutable, merit_entries | Có | **Có (Thử)**: superuser UPDATE và Phó nhà DELETE bị chặn |
| BR-MER-04 | fn_award_duty_merit, ck_cleaning_areas__points | Có | **Có (Thử D1)**: +9 = 3 × độ khó 3; −1 không nhân |
| BR-MER-05 | ck_merit_entries__manual_note, merit_entries__insert__manual | Có | **Có (Thử)**: tự cộng/thiếu lý do bị chặn (cộng chéo +100 giữa hai lãnh đạo vẫn được — đã ghi nhận BL-MER-02) |
| BR-MER-08 | — (quy trình) | n/a | Không ở DB |
| BR-LIT-05 | — (service) | n/a | Không ở DB |

**Tỷ lệ (mẫu 45):** có đối tượng DB 42/45 — tồn tại 42/42 (**100%**). BR khẳng định kiểm thử ở DB (S#): 31/45; tôi tự thử 20 (19 BR có S# + BR-MEM-18) → **16 chặn đúng, 3 chặn một phần** (BR-DUTY-03, BR-FIN-01, BR-FIN-18), **1 không thực thi** (BR-MEM-18); 12 BR S# còn lại dựa smoke đã pass khi chạy lại. 14/45 BR chỉ ở service/process (không kiểm được bằng DB); riêng BR-MEM-10 chỉ gắn một chỉ mục — về bản chất không thể "chặn".

**Thử thêm ngoài mẫu (17 BR):** chặn đúng — BR-FIN-02 (nhưng gây bế tắc N-01), BR-FIN-07 (cả đồng thời C6), BR-FIN-17, BR-FIN-32 (Admin bị lọc; điểm yếu chính sách ở N-16), BR-LAU-01, BR-EVT-19 (đường hàm); một phần/lách được — BR-FIN-06 (N-03), BR-FIN-14 (N-05), BR-FIN-47 (N-04), BR-LAU-03 (C2), BR-LAU-04 (L2c), BR-EVT-05 (N-06), BR-EVT-08 (C3), BR-DUTY-28 (N-10), BR-AUTH-06 (N-07), BR-ACAD-07 (N-11), BR-ACAD-08 (xếp loại biên, N-13).
**Tổng 37 BR thử chặn thật: 22 chặn đúng hoàn toàn (59%), 14 chặn một phần/lách được (38%), 1 không thực thi ở DB (3%).**

---

#### Quy trình còn thiếu

| Quy trình | Hiện trạng DB | Hệ quả | Đề xuất |
|---|---|---|---|
| Thành viên rời / thành cựu thành viên | Chỉ kết thúc phân phòng; `left` vô hiệu tài khoản; `alumni` giữ tài khoản + mọi vai trò | Ca trực tương lai, lượt giặt tương lai, ủy quyền, vai trò đặc quyền, khoản phải thu tháng sau, đơn đổi ca/khiếu nại mở, cặp phụ đạo vẫn treo (D5, L3, I1) | FX-14 (đã thử) + hàm hủy khoản phải thu tương lai (khoản `cancelled` hiện không có đường vào) |
| Bàn giao nhiệm kỳ / đổi Thủ quỹ | `board_terms` chỉ là bảng; quyền `term.handover` không được hàm nào dùng; BR-FIN-43 là "quy trình" | Đổi vai trò không bắt buộc chốt kỳ/đối soát; ủy quyền của người cũ vẫn sống (N-07) | Hàm `fn_handover_term(term, from, to)` trong một transaction: yêu cầu kỳ liền trước `closed`, có `period_reconciliations` cho mọi quỹ ngân hàng, thu hồi vai trò + ủy quyền người cũ, cấp vai trò người mới, ghi biên bản |
| Mở năm học mới | Không có hàm sinh 12 kế hoạch thu, roster, kỳ học | "Đóng trước nhiều tháng" phụ thuộc việc lập tay từng kế hoạch; `contribution_plans.academic_year_id` không tự điền (đã ghi nhận) | `fn_open_academic_year(year)` sinh kế hoạch 12 tháng theo `finance.monthly_dues_vnd`, ngày hạn theo `finance.dues_due_day` |
| Hoàn tiền quỹ (một phần / khi rời giữa năm) | Chỉ hủy toàn bộ phiếu thu; `ledger_source_t.refund` chưa có hàm | Phải hủy cả phiếu rồi thu lại phần giữ — khó đối soát | `fn_refund_contribution(payment, amount, reason)` sinh bút toán `out` source `refund` + phân bổ âm có kiểm soát (2 người) |
| Khiếu nại về tài chính (thu sai, bị ghi nợ sai) | Không có bảng/luồng | Tranh chấp xử lý ngoài hệ thống, không vết | Bảng `finance_disputes` (thành viên mở, Trưởng nhà xử lý, liên kết phiếu thu/khoản phải thu) |
| Điều chỉnh sổ cái hai người | `fn_post_ledger_entry` adjustment do một người (N-17) | Hợp thức hóa thất thoát bằng 1 bút toán có lý do | Hàng đợi `ledger_adjustment_requests` cần người thứ hai |
| Thay đổi tham số kiểm soát (ngưỡng tài chính) | Một người (Trưởng nhà) đổi tức thời (N-16) | Tắt phân tách nhiệm vụ trong vài giây | FX-15 + yêu cầu xác nhận người thứ hai/hiệu lực trễ |
| Rút khiếu nại trực nhật, cửa sổ 48 giờ | `withdrawn` không có đường vào; 48 giờ chỉ ở service (đã ghi nhận #7) | — | Hàm `fn_withdraw_appeal`; kiểm cửa sổ trong policy INSERT |
| Bù trừ điểm rèn luyện khi miễn ca / khiếu nại thắng / nghỉ phép duyệt sau | Không có (D1, D3, M1; đã ghi nhận BR-DUTY-16/25) | Điểm rèn luyện sai | Trigger ghi bút toán bù khi ca → `excused`/`approved` sau `missed`/`rework` |
| Hủy hàng loạt lượt giặt khi máy bảo trì | Không có (đã ghi nhận BR-LAU-17) | Người đặt tới nơi mới biết máy hỏng | BL-LAU-05 |

---

#### Mâu thuẫn tài liệu ↔ DDL

| # | Tài liệu nói | DB thực tế (bằng chứng) |
|---|---|---|
| 1 | Bảng số chữ ký (dòng 2879): phiếu 1 chữ ký do "Trưởng nhà (mọi mức) hoặc Thủ quỹ (≤ 200.000 đ)"; R-DB-09 (dòng 2721) "đã khép" bế tắc | Bế tắc vẫn còn ở dải 200.000–999.999 đ khi Trưởng nhà là người lập/người ứng (A1–A5) |
| 2 | Dòng 556: người nhận ủy quyền "không tự duyệt phiếu của mình" (ngụ ý an toàn) | Người nhận duyệt được phiếu của chính người ủy quyền (C1–C3) |
| 3 | BR-AUTH-06 (dòng 580): người ủy quyền phải giữ vai trò "trong toàn bộ khoảng thời gian ủy quyền" | Chỉ kiểm lúc INSERT; thu hồi vai trò gốc không chấm dứt ủy quyền (I2) |
| 4 | BR-FIN-47 (dòng 3226) "kể cả superuser… fn_verify_ledger_chain phát hiện sửa lén"; dòng 2700 "chuỗi băm báo đứt đúng dòng" | Chủ bảng tắt trigger được; sửa cột ngoài băm hoặc tính lại chuỗi không bị phát hiện (F1–F3) |
| 5 | BR-FIN-06/08: kỳ đã chốt bị khóa, chốt tuần tự | Ghi được vào tháng trống trước kỳ đã chốt; ảnh chụp kỳ đã chốt lệch sổ cái (E) |
| 6 | BR-FIN-14 (dòng 3194): chỉ Trưởng nhà miễn/giảm | Thủ quỹ đặt số phải thu 0 đ khi INSERT (H1) |
| 7 | BR-EVT-08/19 (dòng 2443, 2454): không vượt `max_choices`, song song được khóa | Chỉ đường `fn_cast_vote` được khóa; INSERT trực tiếp song song → 2 phiếu (C3) |
| 8 | Bảng lỗ hổng trực nhật #4 (dòng 1440) "Đã khép (S14)" | Policy `duty_review_appeals__update` vẫn cho đương sự tự đặt `upheld` (D2b) |
| 9 | GD-ACAD-01 (dòng 36918): "bảng điểm đã nộp giữ scale_id cũ nên không đổi kết quả" khi "sửa dữ liệu thang" | Sửa thang tại chỗ → cùng 8,5 ra A và B+ trong cùng bảng điểm (AC5) |
| 10 | FX-HOCTAP-04 (dòng 30926) chê FE xếp loại trên `gpa4` đã làm tròn | `fn_recompute_gpa` làm đúng điều đó (AC4) |
| 11 | Bảng thống kê 1.15 (dòng 5493…): "Có cơ chế ở DB: 413" | ≥ 9 BR không có thực thi DB vẫn được đếm (N-21) |
| 12 | BR-EVT-05 "geofence tùy chọn theo phiên" + giao diện nhập tọa độ | Nhập tọa độ mà quên cờ thì không có tác dụng — chỉ ghi `distance_m` (Q1) |

---


---

## ④ MA TRẬN ĐỘ PHỦ & BẢNG TUÂN THỦ

### ④.A Tuân thủ cấu trúc (Bước 1) và nhất quán (Bước 9)

#### Bảng tuân thủ

| Nhóm | Số yêu cầu | Đạt | Một phần | Không đạt |
|---|---|---|---|---|
| A. Quy tắc định dạng, cấu trúc | 9 | 8 | 1 (P-03) | 0 |
| B. Phần 0 | 8 | 7 | 0 | 1 (P-10) |
| C. Phần 1 | 18 | 18 | 0 | 0 |
| D. Phần 2 | 8 | 8 | 0 | 0 |
| E. Phần 3 | 12 | 11 | 1 (P-44) | 0 |
| F. Phần 4 | 29 | 28 | 1 (P-62) | 0 |
| G. Phần 5 | 5 | 5 | 0 | 0 |
| H. Phần 6 | 7 | 6 | 1 (P-92) | 0 |
| I. Phần 7 | 9 | 9 | 0 | 0 |
| J. Phần 8 | 4 | 4 | 0 | 0 |
| K. Phần 9, 10, Self-check, tinh thần | 13 | 10 | 2 (P-119, P-121) | 1 (P-122, quan điểm) |
| **Tổng** | **122** | **114 (93%)** | **6** | **2** |

Kết luận ngắn: về **cấu trúc và độ phủ hình thức**, tài liệu tuân thủ gần như trọn vẹn (đủ 10 phần, đủ khuôn 7 mục × 12 phân hệ, đủ 71 bảng tối thiểu, đủ ENUM, helper RLS, ma trận quyền, seed, smoke test). Các điểm hụt khách quan nằm ở: Phần 0 dài hơn 1 trang, hợp đồng DTO của API không có trong tài liệu, ERD/bảng tóm tắt có placeholder và ô bị cắt, giải thích `ON DELETE` thiếu. Điểm hụt lớn nhất là **tinh thần "không over-engineering"** (quan điểm, B-001).

---

#### Placeholder

Quét toàn bộ 37.195 dòng bằng `placeholders.py` + `ellip.py`, tách khối mã (318 khối: 175 mermaid, 62 sql, 53 json, 17 http, 5 text, 2 ts, 2 yaml, 1 bash, 1 js) và văn xuôi.

**1. Trong khối mã**

| Loại | Vị trí | Trích | Đánh giá |
|---|---|---|---|
| SQL — dấu `…` | 37 lần, ví dụ 8786, 8859, 8861, 9125, 9258, 9371, 9567, 13322, 13327, 18115, 18718, 21165, 23695, 25306 | `-- Thêm giá trị mới: ALTER TYPE … ADD VALUE`; `COMMENT ON TABLE positions IS '… Trưởng ban Ẩm thực…'` | **Không phải placeholder**: chỉ nằm trong comment hoặc chuỗi `COMMENT ON`, không thay cho cột/bảng/lệnh |
| SQL — "v.v" | 15915, 16135, 16232, 16473 | `v.voucher_no`, `v.voided_at` | Dương tính giả (biến bản ghi `v`) |
| SQL — TODO/TBD/FIXME/"tương tự"/"(các bảng còn lại)" | — | — | 0 |
| bash | 8487, 8489 | `export PGHOST=… PGUSER=postgres`; `# 01 … 52` | Giá trị kết nối mẫu trong hướng dẫn; chấp nhận được |
| **Mermaid ERD — cột giả** | 6465, 7170, 7188, 7399, 7459, 7622, 7691, 8131 | `text _6_cot_khac_xem_DDL` (storage_files), `text _14_cot_khac_xem_DDL` (expense_vouchers), `text _5_cot_khac_xem_DDL` (ai_jobs)… | **Placeholder thật** dưới dạng cột kiểu `text` không tồn tại (B-007) |
| JSON / HTTP / YAML / TS | — | — | 0 |

**2. Ngoài khối mã**

| Loại | Vị trí | Trích (đuôi ô) | Đánh giá |
|---|---|---|---|
| Ô bảng bị **cắt giữa câu** bằng "…" (mô tả bảng 3.6) | 8279, 8298, 8457, 8459 | `roles`: "…(trưởng ban Phụng…"; `ai_jobs`: "…nội dung đầu ra có…"; `ai_task_types`: "…never_external (CCCD, điểm cá nhân…" | Placeholder do cắt cụt tự động (B-006) |
| Ô bảng bị cắt (danh mục hàm 4.5) | 12508, 12515, 12516, 12519, 12532, 12616, 12617, 12619, 12621, 12624, 12626, 12630, 12640, 12642, 12644, 12645, 12651, 12654, 12659, 12664, 12680, 12681 | `fn_admin_decide_duty_swap`: "…duty_assignment_members (ràng buộc…"; `fn_checkin_by_qr`: "…(≈ 45–90 giây), tùy…"; `tg_ledger_entry_before_insert`: "…(cùng quỹ/số tiền, ngược chiều);…" | Như trên |
| Ô bảng bị cắt (danh mục view) | 17785 | `v_event_attendance`: "…excused không tính vào mẫu số bị…" | Như trên |
| Liệt kê cột kết thúc "…" (3.3) | 8188, 8195, 8198, 8201 | `academic_records`: "…scholarship_note, submitted_at…" | Liệt kê không đầy đủ trong mục phân tích quan hệ |
| Liệt kê "…" thay "v.v." | 6222, 6223, 8252, 8537, 27996 (và các ô mô tả 8273, 8292, 8294, 8301, 8312, 8313, 8336, 8369, 8370, 8384, 8400, 8406, 8444, 8448) | "…định dạng…", "…lịch giặt…" | Văn phong liệt kê ví dụ; chấp nhận được ở mô tả, không phải đặc tả bắt buộc |
| "Như trên" | 1549, 28422 | `… | Như trên |` | Ô tham chiếu dòng trên (nhỏ) |
| "và tương tự" | 30320 (= 36208), 32265 (= 36166), 32274 (= 36293) | "`useFinanceSnapshot`, `useMyDutiesToday` và tương tự"; "`--color-primary` và tương tự" | Danh sách hook/token để mở trong đặc tả FE (nhỏ) |
| Ví dụ phản hồi "rút gọn" | 27255, 27595, 27692, 27899, 28026, 28410 | "Phản hồi `201` (rút gọn các trường không đổi qua các bước)" | Vì không có định nghĩa DTO (B-002), các trường bị lược không được đặc tả ở đâu khác |
| TODO / TBD / FIXME / etc / v.v. / "(các bảng còn lại)" / "tương tự như trên" | — | — | 0 |
| "…" hợp lệ trong văn xuôi | Còn lại (≈ 130 lần): mã mẫu `BL-…`, `ux_…`, `ALTER … OWNER`, khoảng giá trị `60 … 3600` (20258–20302), mã nhóm `COM-ANN-01…07` | — | Hợp lệ |

Tổng: placeholder thật **38 vị trí** (8 cột giả ERD + 27 ô cắt cụt + 2 "Như trên" + 1 nhóm 3 cụm "và tương tự" tính một lần) + 6 ví dụ "rút gọn" + 4 liệt kê cột "…" ở 3.3. Dòng Self-check 37189 khẳng định "quét văn bản ngoài khối mã: 0 mẫu bị cấm" → **khai quá** (B-006).

---

#### Kiểm đếm số liệu tự công bố

| Công bố | Vị trí | Thực tế | Cách đếm | Kết luận |
|---|---|---|---|---|
| 141 bảng | 144, 37181 | 141 (+7 partition `audit_logs`) | `pg_class` relkind r/p, `relispartition = false` | Khớp |
| 58 ENUM | 144 | 58 | `pg_type typtype='e'` | Khớp |
| 174 hàm | 144, 37181 | 174 (schema `app`) | `pg_proc` nspname='app' | Khớp |
| 300 chính sách RLS | 144 | 300 | `pg_policies` | Khớp |
| 299 khóa ngoại, 17 view | 37181 | 299 FK; 16 view + 1 matview | `pg_constraint contype='f'`; `pg_views`, `pg_matviews` | Khớp |
| 392 endpoint REST | 144, 37184 | 392 mã duy nhất (FIN 46, EVT 42, PLT 36 gồm 4 webhook, DUT 35, ACD 33, COM 33, MEM 30, FAC 26, USR 22, AUTH 20, HSE 20, MOM 12, LAU 12, AIX 11, STO 10, RT 4) | regex dòng bảng `| **XXX-YYY-NN** | \`METHOD /api/v1…\`` ở 25645–28763 | Khớp (gồm 4 SSE/WS và 4 webhook nên "REST" là cách gọi rộng) |
| 24 nhóm | 144, 37184 | 24 tag: 13 (25942) + 11 (28503) | đếm danh sách `tags` | Khớp |
| 500 DTO | 37184 | 402 tên DTO khác nhau xuất hiện trong tài liệu; 1 có định nghĩa | regex `\b[A-Z]\w*Dto\b` | **Không kiểm chứng được** từ tài liệu (B-002) |
| 425 quy tắc BR | 144, 37182 | 425 định nghĩa (dòng in đậm), 425 mã được tham chiếu, 0 mã treo | `br.py` | Khớp |
| 413 cơ chế DB / 12 service | 37182 | 12 dòng có cột DB "—" (BR-AUTH-10, 20, 24; ACAD-20; COM-25; PLAT-09; SEC-10, 11, 12; LEAVE-07; MER-08; LIT-05) | chỉ mục 1.15 | Khớp (1 BR — BR-EVT-21 — có "cơ chế DB" chỉ là khóa `settings`) |
| 85 mã BR trong DDL | 37182 | 85 trong file DDL; 61 trong `RAISE EXCEPTION`; 0 không định nghĩa | regex trên 37 file | Khớp |
| 445 vấn đề FE | 26, 142, 207, 37190 | 445 mã `FE-XX-nn` khác nhau, 19 tiền tố | regex | Khớp số; chú giải dòng 26 thiếu tiền tố `ST`, `LD` (B-014) |
| 349 hạng mục BL | 144, 37185 | 349 | Master Backlog 36029–36776 | Khớp |
| 373 hạng mục FX | 144, 37185 | 373 trong Phần 7; **366** trong Master Backlog | regex | **Lệch**: 7 mục "đã xử lý" không vào Backlog |
| 741 hạng mục = 349 BL + 373 FX + 26 AI | 37185 | 741 = 349 + **366** + 26; còn 349 + 373 + 26 = **748** | cộng | **Mâu thuẫn số học** (B-005) |
| 26 tác vụ AI, 4 WON'T-NOW | 144, 161 | 26 (AI-01…26); 4 WON'T-NOW | 8.1 và Master Backlog | Khớp |
| 15.607 dòng | 8539 | 15.607 (tổng 38 file đã trích) | `wc -l` | Khớp từng file |
| 37 file 01–52 | 142, 37181 | 37 (+ `60_smoke_tests.sql`) | thư mục `ex/sql` | Khớp |
| "Hơn 1.000 khẳng định" | 142, 37100 | 574 `ASSERT` + 525 `app_test.expect_error(` = 1.099 | grep `60_smoke_tests.sql` | Khớp nếu tính cả kỳ vọng lỗi (như 37100 viết); Phần 0 gọi tất cả là "khẳng định" (B-015) |
| 34 mục NOTICE OK | 37181 | 34 | grep `RAISE NOTICE 'S…` | Khớp |
| 30 lỗi thiết kế | 157 | 30 dòng (25015–25054) | đếm bảng | Khớp |
| 13 phân hệ TB 1,6; chống gian lận 1,0; đúng đắn 1,4 | 142 | 20,8/13 = 1,60; 13/13 = 1,0; 18/13 = 1,38 | tính lại bảng 211–225 | Khớp |
| 15 màn hình | 142 | 14 thư mục route + trang gốc = 15 `page.tsx` | `ls src/app` | Khớp |
| 8 vai trò, 104 quyền | 5468, 26209… | 8 `roles`, 104 `permissions` | truy vấn DB | Khớp |
| 21/21 kiểu export | 37183 | 20 (`mockData.ts`) + 1 (`store.tsx`) | grep `^export (interface|type)` | Khớp |
| 171 giả định, 127 câu hỏi mở | 37187 | 171 GD, 127 Q | regex | Khớp |
| 315 cột timestamptz | 37188 | 303 ở bảng + 7 ở partition + 5 ở view = 315 | `pg_attribute` | Khớp (cách đếm gồm partition và view) |
| 45 khóa settings, 1 thang điểm, RLS 141/141 | 37188 | 45; 1; 141/141 | truy vấn DB | Khớp |
| 175 khối Mermaid, 0 lỗi cú pháp | 37191 | 175 khối | đếm fence | Số khớp; "0 lỗi" **không kiểm chứng được** (môi trường không có trình phân tích Mermaid) |
| Số dòng P0…P10 | 37180 | 39 / 5773 / 259 / 2252 / 16592 / 590 / 3118 / 4470 / 2111 / 494 / 1074 | từ tiêu đề phần | Khớp tuyệt đối |
| Chi phí tiết kiệm 357k / 701k / 1,53tr; khuyến nghị 1,084tr / 3,188tr / 5,1tr | 171–172, 6167–6184 | 14 / 27,5 / 60 USD và 42,5 / 125 / 200 USD × 25.500 | cộng từng hạng mục | Khớp |
| AI Top 5 ≈ 39.000 đ/tháng | 161, 35258, 35280 | 4.600 + 34.400 (+3 tác vụ 0 đ) | cộng | Khớp |
| Công sức 1.528 / 2.722 / 3.078 người-ngày; 135 tuần ≈ 31 tháng | 165, 35860, 35868, 35873 | MUST 260 mục = 1.528; SHOULD 299 = 1.194; COULD 110 = 356; WON'T-NOW 72 = 1.032 | quy đổi S=2, M=6, L=14, XL=30 trên Master Backlog | Khớp; tuần theo giai đoạn (6+38+40+42+6+1+1+1 = 135) khớp |
| Lát cắt 556 + 418 + 548 + 6 | 35918–35921 | = 1.528 | cộng | Khớp |

Nhận xét: **số liệu tự công bố gần như đều đúng** (sai số học duy nhất ở 741/373; "500 DTO" và "Mermaid 0 lỗi" không kiểm chứng được). Không phát hiện con số BỊA ĐẶT.

---

#### Mâu thuẫn nội bộ

**(a) ERD ↔ DDL thật.** 141 thực thể ERD = 141 bảng catalog (0 thừa, 0 thiếu). 1.177 cột ERD (trừ 8 cột giả) đều có trong DB, so kiểu nghiêm ngặt: **0 lệch kiểu** (kể cả tên ENUM). 229 quan hệ ERD đều có FK thật; 48 FK không vẽ đều trỏ tới `users` (cột `*_by`, theo quy ước đọc ở 6311). Bất nhất duy nhất: 8 cột giả `_N_cot_khac_xem_DDL` và 297 cột không vẽ (210 cột chuẩn thời gian/version + 87 cột nghiệp vụ, ví dụ `expense_vouchers` ẩn 16 cột gồm `status`, `required_approvals`, `paid_at`) — B-007.

**(b) Danh mục bảng 3.6 ↔ catalog.** 141/141 tên khớp; tổng 11 nhóm khai báo = 141; số cột: 141/141 khớp; số policy: 141/141 khớp; cờ "xóa mềm"/"version": khớp toàn bộ; cờ "audit": khớp trừ `audit_logs` (dương tính giả do tên trigger `trg_audit_logs__immutable`). Lỗi trình bày: 4 mô tả bị cắt cụt (8279, 8298, 8457, 8459).

**(c) DDL 5.5 và 8.2.7 ↔ Phần 4.** So từng câu lệnh (đã chuẩn hóa khoảng trắng, bỏ comment): 5.5 có 138 câu (119 khác nhau), 8.2.7 có 976 câu (272 khác nhau); **100% câu lệnh trùng nguyên văn với Phần 4, 0 câu khác nội dung**. Do đó không có xung đột phiên bản: **DDL Phần 4 là bản đúng và đủ** (5.5/8.2.7 thiếu các lệnh `ENABLE/FORCE RLS` và `OWNER` vốn ở file 45/49_a — chấp nhận được). Nhưng 5.5 và 8.2.7 bị **chèn 1.030 lệnh `CREATE INDEX` của 100+ bảng không liên quan** (phần đuôi của `21_indexes_fk.sql` từ vị trí bảng đang trích tới hết file, lặp 6 lần) — B-003.

**(d) Số liệu tự công bố.** Xem bảng kiểm đếm: khớp, trừ 741 = 349 + 373 + 26 (sai số học, đúng là 366 FX) và "500 DTO" (không kiểm được).

**(e) Chi phí và công sức Phần 0 ↔ 2.8 ↔ 10.** Chi phí hạ tầng: 6 con số Phần 0 trùng 2.8 và cộng lại đúng. Công sức: Phần 0 ↔ 10.1 ↔ 10.1.1 ↔ 10.1.2 ↔ 10.1.3 ↔ gantt 10.3 ↔ Master Backlog khớp đến từng người-ngày. Hai điểm diễn đạt: Phần 0 dòng 165 ghi "Công sức (hiệu suất 70%, dự phòng 20%): MUST ≈ 1.528 người-ngày" trong khi 1.528 là người-ngày thô, 70%/20% chỉ áp vào số tuần (35862) — B-015; và tổng công sức có dấu hiệu đếm trùng (B-004), nên tính nhất quán số học không bảo đảm tính đúng của ước lượng.

**(f) "Đã chạy trên PostgreSQL 16.9".** Phần 0 (142), 4.0 (8469), B.1 (37099), Self-check (37181) đều nói 16.9 (EDB, Windows). Kiểm định viên chạy lại trên 16.14: toàn bộ DDL + smoke test không lỗi → khẳng định "chạy được trên PG 16" **đứng vững**; không có mâu thuẫn. Bản 16.9 cụ thể không tái lập được nhưng không ảnh hưởng kết luận.

**(g) Tên ENUM/giá trị ERD ↔ DDL ↔ API ↔ FE.** ERD ↔ DDL: 0 lệch. API (Phần 6) ↔ DDL: các giá trị trạng thái nêu trong endpoint (vd `waiting/offered/fulfilled/expired` 27882, `assigned/confirmed` 31255) khớp CHECK trong DB; `overdue` (27171) và `granted/outdated/none` (26384) được ghi rõ là giá trị suy ra. FE ↔ DB: `RoomType` và `Room.status` khớp từng ký tự với `room_type_t`, `room_status_t`; `EventCheckInRecord.status` khớp 3/4 giá trị `attendance_status_t`; các nhãn tiếng Việt (`'Đã duyệt'`, `'Mới tiếp nhận'`, `'Trung bình'/'Gấp'/'Khẩn cấp'`, `'Xuất sắc'…'Cần cố gắng'`, chuyên mục album, danh mục chi/sự kiện/diễn đàn) đều có bảng ánh xạ tường minh ở 7.2 (vd 29648, 29759) và seed tương ứng (`EVT_SOCIAL`, `FORUM_LEISURE`, `OTHER` được thêm để phủ nhãn FE). Không thấy lệch ký tự. Bất nhất về **kiểu mô hình hóa**: 10 cột trạng thái dùng `text + CHECK` thay vì ENUM/bảng (B-012).

**(h) Cùng khái niệm, tên khác nhau.** `users` (đăng nhập) và `members` (hồ sơ) tách bạch nhất quán: 63 cột `*_by` đều trỏ `users`, 65 cột `*member_id` đều trỏ `members`, 15 cột `*user_id` đều trỏ `users`; 0 ngoại lệ. `duty_assignments` thống nhất giữa ERD, DDL, API (`/duty/assignments`), FE (`CleaningDuty` ánh xạ ở 7.2). Tên khác đề bài nhưng có ánh xạ: `member_sacraments`, `member_guardians`, `grade_records`, `funds`. Lệch tên/khái niệm phát hiện: (1) "12 phân hệ" (tiêu đề 209) nhưng bảng có 13 dòng, Phần 0 nói "13 phân hệ" (142); (2) hàm `fn_assign_room` (33328, 35122) không tồn tại; (3) quyết định Redis mâu thuẫn giữa ADR-05 và Phần 6 (B-010); (4) khung giặt 12:00–14:00 vừa là "lỗ hổng mức Cao" của FE vừa là cấu hình mặc định của DB (B-011).

**(i) Self-check (37174–37195) có khai man không.** 12/12 dòng đánh ✔. Kết quả kiểm lại:

| Dòng Self-check | Kết luận kiểm định |
|---|---|
| Đủ 10 phần, không rút gọn | Đúng |
| DDL không placeholder, đúng thứ tự, FK hợp lệ (16.9; 141 bảng; 299 FK; 174 hàm; 17 view; 34 NOTICE) | Đúng (tái lập trên 16.14) |
| 425 BR (413 DB / 12 service; 85 mã trong DDL) | Đúng |
| 21/21 kiểu `mockData.ts` + `store.tsx` có chỗ trong DB và API | Đúng (348 dòng trường, 44 thực thể: không đếm lại) |
| **392 endpoint, 500 DTO; thiếu quyền 0; thiếu response 0** | **Khai quá**: "response" chỉ là tên DTO; 401/402 DTO không có định nghĩa trong tài liệu; "500" không kiểm chứng được (B-002) |
| **741 hạng mục (349 BL, 373 FX, 26 AI)** | **Sai số học**: 349 + 373 + 26 = 748; Backlog thực có 366 FX (B-005) |
| AI có rủi ro, quyền riêng tư, "không nên dùng AI" | Đúng |
| 171 giả định + 127 câu hỏi mở | Đúng |
| Không FLOAT; TIMESTAMPTZ; không hard-code; RLS 141/141 | Đúng |
| **Không placeholder trong văn bản: 0 mẫu bị cấm** | **Khai quá**: 27 ô bị cắt giữa câu bằng "…", 2 "Như trên", 3 cụm "và tương tự" (B-006) |
| 445/445 vấn đề FE được 373 FX phủ | Đúng (mọi mã FE xuất hiện trong ít nhất một dòng FX) |
| 175 khối Mermaid 0 lỗi | Không kiểm chứng được |

Kết luận: **không có dòng nào bịa đặt hoàn toàn**, nhưng 3 dòng ✔ là khai quá hoặc sai số học. Self-check bỏ qua yêu cầu "Phần 0 tối đa 1 trang" và "không over-engineering" — hai điểm tài liệu không đạt.

---

#### Đánh giá tính thực tế so với prompt (QUAN ĐIỂM có lập luận)

Prompt dòng 21: "vài chục đến vài trăm thành viên, ngân sách hạ tầng thấp, đội vận hành không chuyên về kỹ thuật. **Mọi đề xuất phải cân nhắc tính thực tế này** (đơn giản để vận hành, chi phí thấp, không over-engineering)".

| Chỉ số | Tài liệu | Mức hợp lý theo ước lượng của kiểm định viên cho MVP |
|---|---|---|
| Bảng | 141 (đề bài tối thiểu 71) | 45–55 |
| ENUM | 58 | 15–25 |
| Hàm PL/pgSQL | 174 (file 30–40 ≈ 5.380 dòng) | 20–40 |
| Chính sách RLS / trigger / index | 300 / 240 / 591 | RLS 30–60 chỉ trên bảng nhạy cảm |
| Vai trò DB | 6 (3 có `BYPASSRLS`) | 2–3 |
| Endpoint | 392 (2,6 endpoint mỗi thành viên ở quy mô 150) | 90–130 |
| Vai trò ứng dụng / quyền | 8 / 104 (+ phạm vi, ủy quyền) | 4–5 / 25–40 |
| Công sức MUST | 1.528 người-ngày ≈ 31 tháng (4 lập trình viên), ≈ 62 tháng (2 lập trình viên) | 250–400 người-ngày ≈ 4–6 tháng (2–3 lập trình viên) |
| Trong đó sửa FE ở mức MUST | 158 mục / 808 người-ngày (53% MUST) dù prompt nói FE "đã hoàn thiện giao diện" | Chỉ phần nối API, che dữ liệu nhạy cảm, phân quyền |
| Độ dài tài liệu | 676.818 từ (≈ 56 giờ đọc ở 200 từ/phút), Phần 1 dành cho Ban điều hành dài 5.773 dòng | ≤ 30 trang chính + phụ lục kỹ thuật |

**Lập luận cho kết luận "vi phạm tinh thần prompt".**
1. Chi phí hạ tầng thấp (0,36–3,2 triệu đ/tháng) — điểm tốt — nhưng tổng chi phí sở hữu do nhân công quyết định: 1.528 người-ngày chỉ cho MUST tương đương ≈ 7 người-năm. Chính tài liệu thừa nhận (35876): "phạm vi MUST đầy đủ là khối lượng nhiều năm-người, không phải một dự án vài tháng".
2. "Đội vận hành không chuyên": mô hình "quy tắc nằm trong DB" với 174 hàm (nhiều hàm `SECURITY DEFINER`), 300 policy, GRANT theo cột, 6 vai trò DB, chuỗi băm sổ cái, phân vùng theo tháng cần job, mã hóa cột có phiên bản khóa — mỗi thay đổi nhỏ (thêm một trường) chạm DDL + RLS + GRANT cột + trigger audit + DTO + FE. Đây là năng lực của kỹ sư PostgreSQL bảo mật, không phải đội không chuyên.
3. Lựa chọn nền tảng ở 2.1 tự quy chiếu: hai tiêu chí quyết định ("Hợp với thiết kế logic trong DB + RLS", "cấu trúc rõ cho 400 endpoint", dòng 5964, 5967) được suy ra từ chính độ phức tạp đã thiết kế, nên phương án đơn giản (A, C) bị chấm thấp vì không khớp thiết kế nặng, không phải vì không hợp nhu cầu.
4. Prompt dòng 148 cho phép RLS là "lớp phòng thủ chiều sâu thay vì cơ chế phân quyền chính" — tài liệu chọn hướng nặng nhất (RLS + hàm DB là cơ chế chính cho mọi bảng).
5. Nhiều tính năng MUST vượt nhu cầu lưu xá vài trăm người: sổ cái có chuỗi băm, chốt sổ hai người kèm đối soát sao kê, k-ẩn danh cho thống kê điểm, QR HMAC xoay vòng + geofence + băm thiết bị, pHash ảnh trực nhật, outbox đa kênh có giờ yên tĩnh và tóm tắt, ủy quyền tạm thời có phê duyệt.

**Lập luận phản biện (công bằng với tài liệu).** Dữ liệu tôn giáo, người dưới 18 tuổi và tiền quỹ đòi hỏi kiểm soát nghiêm hơn ứng dụng nội bộ thông thường; DDL đã chạy và có kiểm thử; tài liệu trung thực về khối lượng và có đề xuất lát cắt (10.1.3); AI được tiết chế (Top 5 ≈ 39.000 đ/tháng, 4 WON'T-NOW). Tuy vậy ngay lát cắt 1 + 2 của tài liệu đã cần 974 người-ngày MUST (48 + 36 = 84 tuần ≈ 19 tháng với 4 lập trình viên) trước khi có sự kiện, thông báo, giặt.

**Phương án cắt gọn (MVP) đề xuất — khoảng 50 bảng, 100–120 endpoint:**
- *Định danh & nền tảng (13):* `users`, `auth_sessions`, `refresh_tokens`, `password_resets`, `login_attempts`, `roles`, `user_roles` (giữ `scope_type`; bỏ `permissions`/`role_permissions`/`role_delegations` → 4–5 vai trò cố định trong code), `settings`, `categories`, `audit_logs` (không phân vùng), `idempotency_keys`, `storage_files`, `media_attachments`.
- *Hồ sơ (7):* `members`, `member_private_details` (CCCD mã hóa), `member_guardians`, `catholic_profiles` (bí tích dạng bảng con hoặc mảng), `consents` (mục đích là ENUM), `academic_years`, `semesters`.
- *Nhà (3):* `floors`, `rooms`, `room_assignments` (giữ exclusion).
- *Trực nhật (9–10):* `cleaning_areas`, `duty_shifts`, `checklist_template_items`, `duty_rosters`, `duty_assignments`, `duty_assignment_members`, `duty_checkins` (+ `checkin_items`; SHA-256 + giờ chụp EXIF, chưa pHash), `duty_reviews`, `duty_swap_requests` (+ `duty_status_history`).
- *Tài chính (8):* `funds`, `ledger_entries` (append-only + trigger chặn sửa, **bỏ chuỗi băm**), `financial_periods` (chốt một người + audit), `expense_vouchers`, `expense_approvals` (ngưỡng hai chữ ký trong `settings`), `contribution_plans`, `contributions`, `contribution_payments`; view `v_fund_balances`, `v_contribution_matrix`.
- *Giao tiếp, sự kiện, giặt, báo hỏng (12):* `announcements`, `announcement_reads`, `notifications` (in-app + email), `events`, `attendance_records` (thủ công + QR ký HMAC ở API, chưa geofence), `polls`, `poll_options`, `poll_votes`, `laundry_machines`, `laundry_bookings`, `maintenance_issues`, `issue_status_history`.
- *Hoãn sang sau MVP:* động cơ GPA đầy đủ và phụ đạo, điểm đóng góp, phụng vụ, bữa ăn/kho, tài sản/mượn trả/bảo trì định kỳ, diễn đàn và ý chỉ ẩn danh tách bảng, gắn thẻ album có đồng ý, đối soát sao kê, chuỗi băm, k-ẩn danh, bảng yêu cầu quyền chủ thể (xử lý thủ công có biên bản), phân vùng, toàn bộ AI có LLM.
- *Kiến trúc:* một ứng dụng + PostgreSQL managed có PITR; phân quyền chính ở tầng service với 4–5 vai trò; RLS chỉ là phòng thủ chiều sâu cho bảng nhạy cảm (hồ sơ tầng 2–3, Công giáo, sổ quỹ); FE chỉ thay store bằng API trên màn hình MVP, giữ giao diện hiện có.
- *Ước lượng thô (kiểm định viên):* 250–400 người-ngày, 4–6 tháng với 2–3 lập trình viên; DDL hiện có vẫn là "kho linh kiện" để lấy dần khi có nhu cầu thật.

---


### ④.B Ma trận độ phủ FE ↔ DB ↔ API (Bước 2)

#### 2 Ma trận độ phủ

**Cách đọc.** Cột DB đã đối chiếu từng tên với catalog thật (`_cols.tsv`, 1.599 cột của bảng + view); cột API là mã endpoint đã đối chiếu với 392 định nghĩa ở Phần 6 (bảng giải mã ở cuối mục). Trạng thái:
- **Đủ** — có cột và endpoint, kiểu tương thích.
- **Đủ (map)** — có cột và endpoint nhưng cần chuyển đổi định dạng/enum/khóa (ghi ở cột Ghi chú).
- **Derived hợp lý** — không có cột riêng, suy ra từ cột/view/trigger đúng nghĩa.
- **Derived (lệch)** — suy ra được nhưng nghĩa khác FE (ghi rõ).
- **Thiếu DB / Thiếu API** — không có nơi lưu / không có endpoint.
- **Sai kiểu** — có cột nhưng kiểu không chứa được giá trị FE.
- **UI** — trạng thái giao diện, không cần DB.

Kết quả tổng: **không phát hiện trường FE nào “Sai kiểu”** ở mức cột (tiền đều `bigint` — truy vấn mọi cột `*_vnd|amount|cost|price|balance` trong catalog: chỉ `repair_costs.cost_kind` là `text` và đó là nhãn, không phải số tiền; ngày là `date`, thời điểm là `timestamptz`, giờ là `time`, mảng là `text[]` hoặc bảng con, cờ là `boolean`). Các chỗ thiếu/lệch tập trung ở: chức danh tác giả (API), cấu hình nhà và nhóm Telegram (DB+API), bộ đếm sau xóa mềm (DB), và vài chức năng chỉ-toast của FE.

##### 2.1 Member (lib/mockData.ts:26-54)

| Field | Bảng.cột (catalog) | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| id | members.id uuid, members.member_no bigint | MEM-DIR-01, MEM-PRO-02 | Đủ (map) | '1' → UUIDv7; mã hiển thị từ member_no |
| name | members.display_name text (1–60) | MEM-PRO-03 | Đủ | |
| fullName | members.full_name text (2–120) | MEM-PRO-01, MEM-PRO-03 | Đủ | |
| holyName | catholic_profiles.holy_name text | MEM-CAT-01, MEM-CAT-02 | Đủ | cần đồng ý `catholic_profile` (trigger require_consent) |
| room | room_assignments.room_id → rooms.code; v_member_current_room.room_code | HSE-ASG-01..04, MEM-DIR-01 | Derived hợp lý | 'Chưa xếp phòng' → NULL; lịch sử theo khoảng ngày |
| phone | members.contact_phone_e164 (ck is_e164), members.hide_phone | MEM-PRO-03 | Đủ (map) | '0903 112 451' → '+84903112451' |
| role | user_roles.role_id → roles.code/name_vi; member_positions | AUTH-ME-01, USR-ROL-02, USR-ROL-03 | Đủ (map) | 'Trưởng nhà'→house_head, 'Phó nhà'→vice_head, 'Thủ quỹ'→treasurer, 'Admin'→admin, 'Thành viên'→member (roles seed 8 dòng) |
| joined | members.joined_on date | MEM-PRO-01, MEM-PRO-03 | Đủ (map) | 'MM/yyyy' → ngày 01 |
| avatarText | — (members.full_name) | — | Derived hợp lý | |
| birthDate | member_private_details.birth_date date | MEM-PRV-01, MEM-PRV-02 | Đủ (map) | 'dd/MM/yyyy' → DATE |
| gender | members.gender gender_t {male,female} | MEM-PRO-01, MEM-PRO-03 | Đủ (map) | Nam→male, Nữ→female |
| identityCard | member_private_details.national_id_enc bytea, national_id_last4, national_id_bidx | MEM-PRV-02, MEM-PRV-03 | Đủ | mã hóa ở tầng ứng dụng |
| diocese | catholic_profiles.diocese_id → dioceses.name (27 dòng) | MEM-CAT-02, MEM-CAT-03 | Đủ (map) | chuỗi → FK |
| parish | catholic_profiles.parish_name | MEM-CAT-02 | Đủ | |
| pastor | catholic_profiles.pastor_name | MEM-CAT-02 | Đủ | |
| sacraments | member_sacraments.sacrament sacrament_t (+received_on, place) | MEM-CAT-02 | Đủ (map) | Rửa tội→baptism, Thánh thể→eucharist, Thêm sức→confirmation; ux (member,sacrament) |
| university | student_profiles.university_id → universities (17) | MEM-PRO-05, ACD-UNI-01 | Đủ (map) | chỉ 2/11 tên mock khớp tuyệt đối ('ĐH Kinh Tế Quốc Dân', 'ĐH Thủy Lợi' = short_name) |
| major | student_profiles.major | MEM-PRO-05 | Đủ | |
| academicYear | student_profiles.cohort_label, enrollment_year, expected_graduation_year | MEM-PRO-05 | Đủ (map) | |
| studentCode | student_profiles.student_code | MEM-PRO-05 | Đủ | |
| hometown | member_private_details.hometown | MEM-PRV-01, MEM-PRV-02 | Đủ | |
| homeAddress | member_private_details.home_address | MEM-PRV-01, MEM-PRV-02 | Đủ | |
| fatherName | member_guardians.full_name, relation=father | MEM-GRD-01, MEM-GRD-02 | Đủ (map) | tách SĐT nhúng trong chuỗi |
| motherName | member_guardians.full_name, relation=mother | MEM-GRD-01, MEM-GRD-02 | Đủ (map) | như trên |
| parentPhone | member_guardians.phone_enc, phone_last4 | MEM-GRD-02, MEM-GRD-05 | Đủ (map) | gắn vào dòng giám hộ is_emergency_contact |
| duty | member_positions.position_id, responsibilities (board_term_id NOT NULL) | MEM-POS-02, MEM-POS-03 | Đủ (map) | 11 chức danh seed phủ đủ 12 chuỗi duty của mock |
| avatarUrl | members.avatar_file_id → storage_files (bucket avatars) | STO-FILE-01, STO-FILE-02, STO-FILE-04, MEM-PRO-03 | Đủ | |

##### 2.2 Room, Floor, RoomType, Amenity (lib/mockData.ts:1-24; app/so-do-nha/page.tsx:41-64)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| RoomType (9) | rooms.room_type room_type_t (9 giá trị trùng khớp) | HSE-ROOM-01 | Đủ | |
| Room.id | rooms.code (ck `^P\.[A-Z0-9_]{1,10}$`), rooms.id | HSE-ROOM-01, HSE-ROOM-03 | Đủ (map) | seed 12 phòng khớp tuyệt đối mã, tên, tầng, loại, sức chứa, diện tích, tọa độ (đã truy vấn đối chiếu) |
| Room.name | rooms.name | HSE-ROOM-02, HSE-ROOM-04 | Đủ | |
| Room.floor | rooms.floor_id → floors.level | HSE-ROOM-01, HSE-ROOM-02 | Đủ (map) | |
| Room.type | rooms.room_type | HSE-ROOM-02, HSE-ROOM-04 | Đủ | |
| Room.capacity | rooms.capacity smallint (ck bedroom⇔>0; ≤20) | HSE-ROOM-02, HSE-ROOM-04 | Đủ | FE form đã ép 0 cho phòng không phải bedroom (app/so-do-nha/page.tsx:254) |
| Room.amenities | room_amenities(room_id, amenity_id, quantity, note) + amenities.name (43) | HSE-ROOM-02, HSE-ROOM-04, HSE-AMN-01 | Đủ (map) | seed 47 dòng room_amenities = 47 lượt mock |
| Room.status | rooms.status room_status_t (3 giá trị trùng) | HSE-ROOM-06 | Đủ | FE không có thao tác đổi |
| Room.description | rooms.description | HSE-ROOM-02, HSE-ROOM-04 | Đủ | |
| Room.areaM2 | rooms.area_m2 numeric(6,2) | HSE-ROOM-02, HSE-ROOM-04 | Đủ | |
| Room.x/y/w/h | rooms.layout_x/y/w/h integer (ck cùng có/cùng trống) | HSE-FLR-05, HSE-ROOM-02 | Đủ | FE HEAD không đọc/ghi các trường này trên canvas (xem A-009) |
| Floor.id | floors.level smallint, floors.id | HSE-FLR-01 | Đủ (map) | |
| Floor.name / code / description | floors.name / floors.code (ck) / floors.description | HSE-FLR-02, HSE-FLR-03 | Đủ | |
| AMENITY_OPTIONS (10) | amenities.name, code | HSE-AMN-01..03 | Đủ (map) | 3 nhãn lệch tên danh mục |
| Phòng hiện tại / sĩ số | v_room_occupancy, v_member_current_room | HSE-SUM-01 | Derived hợp lý | |

##### 2.3 CleaningDuty và form trực nhật (lib/mockData.ts:1511-1528; app/hau-can/page.tsx)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| id | duty_assignments.id | DUT-ASG-01, DUT-ASG-03 | Đủ (map) | |
| dayOfWeek | — (duty_assignments.duty_date) | DUT-ASG-01 | Derived hợp lý | |
| dateStr | duty_assignments.duty_date date | DUT-ASG-02, DUT-ASG-04 | Đủ (map) | 'Tuần này' (app/hau-can/page.tsx:294) không phải ngày → phải chọn ngày |
| area | duty_assignments.area_id → cleaning_areas.name (6 + WHOLE_HOUSE) | DUT-CFG-01, DUT-ARE-01 | Đủ (map) | FE gõ tự do; DB chỉ nhận khu vực danh mục |
| areaIcon | cleaning_areas.icon | DUT-CFG-01, DUT-ARE-01 | Đủ (map) | icon thuộc khu vực, không thuộc ca |
| assignedRoom | duty_assignments.room_id (một phòng) | DUT-ASG-02, DUT-ASG-04 | Đủ (map) | 'Phòng 4 - Phòng 5' phải tách ca; 'Toàn thể lưu xá' → is_whole_house |
| assignedMembers | duty_assignment_members(member_id, member_role) | DUT-ASG-02, DUT-ASG-04 | Đủ (map) | tên → member_id |
| shift | duty_assignments.shift_id → duty_shifts (MORNING 06:30–08:00, AFTERNOON 17:30–19:00, EVENING 21:00–22:00) | DUT-CFG-01, DUT-SHF-01 | Đủ (map) | |
| status | duty_assignments.status duty_status_t (7) | DUT-ASG-01, DUT-ASG-05 | Đủ (map) | pending→scheduled, submitted→checked_in, approved→approved, rejected→rework_required (+missed, cancelled, excused) |
| checkInTime | duty_checkins.checked_in_at timestamptz | DUT-CIN-01 | Đủ (map) | 'HH:mm' → timestamptz máy chủ |
| checkInBy | duty_checkins.checked_in_by_member_id | DUT-CIN-01 | Đủ (map) | lấy từ phiên |
| checkInNote | duty_checkins.note | DUT-CIN-01 | Đủ | |
| evidencePhoto | duty_checkins.evidence_file_id NOT NULL UNIQUE → storage_files | DUT-CIN-01, STO-FILE-01/02/04 | Đủ | |
| reviewerName | duty_reviews.reviewer_member_id | DUT-REV-01 | Đủ (map) | |
| reviewNote | duty_reviews.feedback | DUT-REV-01 | Đủ | |
| reviewedAt | duty_reviews.reviewed_at timestamptz | DUT-REV-01 | Đủ (map) | |
| checkInTasks.* (4 ô) | checkin_items.is_done + checklist_template_items.code {floor_cleaned, trash_emptied, surfaces_cleaned, supplies_restocked} | DUT-CIN-01, DUT-CFG-01 | Đủ (map) | FE gửi dạng chuỗi trong note (xem A-011) |
| điểm nghiệm thu (prompt) | duty_reviews.score smallint | DUT-REV-01 | Đủ | FE chưa có ô |
| swapFrom/swapTo/swapReason | duty_swap_requests.from_member_id/to_member_id/reason (+status 3 bước) | DUT-SWP-01..05 | Đủ | |
| Ứng viên đổi ca (modal swapDuty) | — | — | Thiếu API (đã khai B.4: BL-DUTY-51) | |
| Copy Zalo lịch trực | duty_* | DUT-ROS-05 | Đủ | |

##### 2.4 Expense, Contribution, quỹ và biểu đồ (lib/mockData.ts:56-76; lib/store.tsx:321-357)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Expense.id | expense_vouchers.id, voucher_no | FIN-EXP-01, FIN-EXP-04 | Đủ (map) | |
| Expense.name | expense_vouchers.title (3–200) | FIN-EXP-03, FIN-EXP-05 | Đủ | |
| Expense.amount | expense_vouchers.amount_vnd **bigint** (1..1e9) | FIN-EXP-03 | Đủ | FE cho 0 → bị từ chối |
| Expense.category | expense_vouchers.category_id → categories(kind expense) | FIN-EXP-03, PLT-CAT-01 | Đủ (map) | Thực phẩm→FOOD, Điện nước→UTILITY, Vệ sinh→CLEAN, Sửa chữa→REPAIR, Phụng vụ→LITURGY, Khác→OTHER (seed có cả 7) |
| Expense.date | expense_vouchers.expense_date date | FIN-EXP-03 | Đủ (map) | |
| Expense.paidBy | expense_vouchers.paid_by_member_id (+payee_name) | FIN-EXP-03 | Đủ (map) | |
| Expense.status | expense_vouchers.status expense_status_t (7) | FIN-EXP-06, FIN-EXP-07, FIN-EXP-08 | Đủ (map) | 'Chờ duyệt'→pending_approval, 'Từ chối'→rejected, 'Đã duyệt'→approved hoặc paid |
| Expense.note | expense_vouchers.note | FIN-EXP-03 | Đủ | |
| Expense.receiptUrl | media_attachments(entity_type expense_voucher, purpose receipt) → storage_files(bucket receipts) | STO-FILE-01/02, STO-ATT-02 | Đủ | |
| Contribution.memberId | contributions.member_id | FIN-DUE-01 | Đủ | |
| Contribution.name | — (members.full_name) | FIN-DUE-01 | Derived hợp lý | |
| Contribution.room | — (v_member_current_room.room_code) | FIN-DUE-01 | Derived (lệch) | phòng hiện tại, không phải phòng của kỳ (A-013) |
| Contribution.amount | contributions.amount_due_vnd **bigint**, discount_vnd | FIN-DUE-01, FIN-PLAN-02 | Đủ | |
| Contribution.status | contributions.status contribution_status_t (trigger rollup) | FIN-PAY-01, FIN-PAY-03 | Đủ (map) | Đã đóng→paid, Chưa đóng→unpaid (+partial, waived, cancelled) |
| Contribution.deadline | contributions.due_date date | FIN-DUE-01 | Đủ (map) | |
| Contribution.paidDate | contribution_payments.paid_on (qua contribution_payment_allocations) | FIN-PAY-01, FIN-PAY-02 | Derived hợp lý | |
| Phương thức nộp (prompt) | contribution_payments.method payment_method_t | FIN-PAY-01 | Đủ | FE không có |
| Ma trận 12 tháng (prompt) | v_contribution_matrix | FIN-DUE-03 | Đủ | FE chỉ có danh sách 1 tháng |
| fundBalance | v_fund_balances.balance_vnd (2 quỹ CASH, BANK_MAIN) | FIN-FUND-01, FIN-RPT-01 | Derived hợp lý | |
| SIX_MONTH_BARS / MONTHLY_FINANCIAL_DATA | v_period_cashflow.total_in_vnd/total_out_vnd, mv_cashflow_monthly | FIN-RPT-02 | Derived hợp lý | |
| SIX_MONTH_TREND | period_fund_balances.closing_balance_vnd | FIN-RPT-02, FIN-PER-02 | Derived hợp lý | |
| EXPENSE_CATEGORIES_DATA | v_expense_by_category.total_vnd, name, color | FIN-RPT-03 | Derived hợp lý | |
| bankAccount (Cài đặt) | funds.bank_name, bank_account_last4, account_holder_name, is_personal_account | FIN-FUND-02, FIN-FUND-03 | Đủ (map) | chỉ lưu 4 số cuối |
| fundRate (Cài đặt) | settings['finance.monthly_dues_vnd'] (vnd) | PLT-SET-02 | Đủ (map) | chuỗi '350000' → số |

##### 2.5 AcademicRecord, SubjectScore (lib/mockData.ts:1300-1330; app/hoc-tap/page.tsx)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| id | academic_records.id (ux member+semester) | ACD-REC-01, ACD-REC-03 | Đủ (map) | |
| memberId | academic_records.member_id | ACD-REC-02 | Đủ (map) | API chỉ cho chính chủ nhập (ACD-REC-02); FE cho chọn bất kỳ thành viên → luồng nhập hộ bị bỏ có chủ đích |
| memberName | — (members.full_name) | ACD-REC-01 | Derived hợp lý | |
| room | — (v_member_current_room) | ACD-REC-01 | Derived (lệch) | A-013 |
| university | academic_records.university_id | ACD-REC-02, ACD-UNI-01 | Đủ (map) | |
| major | academic_records.major_snapshot | ACD-REC-02 | Đủ | |
| studentId | academic_records.student_code_snapshot | ACD-REC-02 | Đủ | |
| academicYear | semesters.academic_year_id → academic_years.code | PLT-ACY-01 | Derived hợp lý | |
| semester | academic_records.semester_id → semesters.code {HK1, HK2, HE} | ACD-REC-02 | Đủ (map) | |
| gpa10 | gpa_snapshots.gpa10 numeric(4,2); v_member_gpa_latest | ACD-GPA-01 | Derived hợp lý | |
| gpa4 | gpa_snapshots.gpa4 numeric(3,2) | ACD-GPA-01 | Derived (lệch) | DB `gpa4_mode='from_letter'` (bậc chữ) ≠ FE tuyến tính gpa10×0,4 — thay đổi có chủ đích, tài liệu đã nêu |
| rank | gpa_snapshots.rank_label; grade_rank_bands (3,60/3,20/2,50/2,00/0) | ACD-GPA-01 | Derived hợp lý | ngưỡng trùng FE |
| subjects | grade_records.record_id | ACD-REC-02, ACD-REC-03 | Đủ | |
| evidencePhoto | media_attachments(academic_record, transcript) → storage_files(academic-evidence) | STO-FILE-01/02, STO-ATT-02, ACD-REC-05 | Đủ | |
| aspirations | study_goals.goals, difficulties (theo member+semester) | ACD-GOL-01, ACD-GOL-02 | Đủ (map) | tách 1 ô thành 2 cột |
| scholarshipEligible | academic_records.has_scholarship boolean | ACD-REC-02 | Đủ | |
| supportNeeded | — (tutoring_requests.status='open') | ACD-TUT-04, ACD-TUT-05 | Derived hợp lý | |
| supportSubject | tutoring_requests.subject_text (+course_id) | ACD-TUT-05 | Đủ | |
| updatedAt | academic_records.updated_at timestamptz | ACD-REC-01 | Đủ (map) | |
| SubjectScore.id | grade_records.id | ACD-REC-03 | Đủ (map) | |
| subjectName | grade_records.course_id → courses.name (name_norm) | ACD-CRS-01, ACD-CRS-02 | Đủ (map) | |
| credits | grade_records.credits numeric(3,1) | ACD-REC-02 | Đủ | |
| midtermScore | grade_records.process_score numeric(5,2) | ACD-REC-02 | Đủ (map) | “giữa kỳ” = điểm quá trình (trọng số 40) |
| finalScore | grade_records.final_score numeric(5,2) | ACD-REC-02 | Đủ | |
| totalScore | grade_records.total_score (trigger) | ACD-REC-03 | Derived hợp lý | |
| letterGrade | grade_records.letter_grade (trigger, grade_scale_bands có D+ ≥5,0) | ACD-REC-03 | Derived (lệch) | điểm 5,0–5,4: FE 'D', DB 'D+' |

##### 2.6 CalendarEvent, điểm danh, biểu quyết, RSVP (lib/mockData.ts:637-672; app/lich-su-kien/page.tsx)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| id | events.id | EVT-EVENT-01, EVT-EVENT-03 | Đủ (map) | |
| title | events.title (3–200) | EVT-EVENT-02, EVT-EVENT-04 | Đủ | |
| date + time | events.starts_at timestamptz | EVT-EVENT-01, EVT-EVENT-02 | Đủ (map) | ghép 'dd/MM/yyyy' + 'HH:mm' (bỏ hậu tố sáng/trưa/chiều/tối/đêm, giờ đã là 24h) theo Asia/Ho_Chi_Minh |
| (giờ kết thúc) | events.ends_at NOT NULL, ck ≤14 ngày | EVT-EVENT-02 | Đủ (map) | FE không có → mặc định +60 phút (GD-EVT-70) |
| location | events.location_room_id / location_text | EVT-EVENT-02, HSE-ROOM-01 | Đủ (map) | |
| category | events.category_id → categories(kind event) | EVT-EVENT-02, PLT-CAT-01 | Đủ (map) | Phụng vụ→EVT_MASS, Họp nhà→EVT_MEET, Bổn mạng→EVT_PATRON, Dã ngoại→EVT_TRIP, Sinh hoạt→EVT_SOCIAL |
| organizer | events.organizer_text + event_organizers.member_id | EVT-EVENT-02, EVT-ORG-01 | Đủ (map) | |
| description | events.description | EVT-EVENT-02 | Đủ | |
| hasCheckIn | events.requires_attendance boolean | EVT-EVENT-02 | Đủ | |
| checkIns | attendance_records (ux event+member) | EVT-ATT-01, EVT-ATT-02, EVT-QR-04 | Đủ | |
| poll | polls.event_id | EVT-POLL-01, EVT-POLL-02 | Đủ | DB cho nhiều poll/sự kiện |
| EventCheckInRecord.memberId | attendance_records.member_id | EVT-ATT-01 | Đủ (map) | |
| .memberName | — | EVT-ATT-01 | Derived hợp lý | |
| .room | — (v_member_current_room) | EVT-ATT-01 | Derived (lệch) | A-013 |
| .checkedInAt | attendance_records.checked_in_at timestamptz | EVT-ATT-01, EVT-QR-04 | Đủ (map) | |
| .status | attendance_records.status attendance_status_t | EVT-ATT-02 | Đủ | present/late/absent trùng; +excused |
| .note | attendance_records.note | EVT-ATT-02 | Đủ | |
| EventPoll.id/question/createdAt | polls.id / question (5–300) / created_at | EVT-POLL-01, EVT-POLL-02 | Đủ | |
| EventPoll.options | poll_options(label, sort_order) | EVT-POLL-02 | Đủ | |
| EventPoll.isClosed | polls.status poll_status_t (closed) | EVT-POLL-06 | Đủ (map) | |
| EventPollOption.text | poll_options.label | EVT-POLL-02 | Đủ | |
| EventPollOption.votes | poll_votes(poll_id, option_id, member_id) + fn_cast_vote | EVT-POLL-03, EVT-POLL-05, RT-POLL-01 | Đủ (map) | tên → member_id |
| isMultiSelect (prompt) | polls.is_multi_select, max_choices | EVT-POLL-02 | Đủ | |
| rsvpState 'tham-du'/'vang'/'chua-ro' (app/lich-su-kien/page.tsx:89) | event_participants.rsvp (ck none/going/maybe/not_going) | EVT-PAR-03 | Đủ (map) | tham-du→going, vang→not_going, chua-ro→maybe. **Không có dòng ở 7.2.4** (A-017) |
| QR 'LX-OCT26-ASSISI' | qr_sessions.secret bytea(32), rotation_seconds | EVT-QR-01..04 | Đủ | |
| Lịch định kỳ (prompt) | event_recurrence_rules, event_recurrence_exceptions | EVT-REC-01..03 | Đủ | |

##### 2.7 Announcement, ForumThread, PrayerIntention (lib/mockData.ts:78-131)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Announcement.id/title/content | announcements.id/title (3–200)/content (≤20000) | COM-ANN-01..04 | Đủ | |
| .preview | — (cắt từ content) | COM-ANN-01 | Derived hợp lý | |
| .author | announcements.author_member_id | COM-ANN-01, COM-ANN-02 | Đủ (map) | |
| .authorRole | — | COM-ANN-01 (PersonRefDto không có chức danh) | **Thiếu API** | 7.2.4 ghi “derived positions.name” nhưng DTO không có (A-002) |
| .date | announcements.published_at timestamptz | COM-ANN-01 | Đủ (map) | |
| .category | announcements.category_id | COM-ANN-02, PLT-CAT-01 | Đủ (map) | Quan trọng→ANN_URGENT, Sự kiện→ANN_EVENT, Chung→ANN_COMMON, Bếp & Cơm→ANN_KITCHEN |
| .isPinned | announcements.is_pinned (+pinned_until) | COM-ANN-04 | Đủ | |
| .isUnread | — (announcement_reads theo thành viên) | COM-ANN-05, COM-ANN-06, PLT-BDG-01 | Derived hợp lý | |
| .fileName | media_attachments(announcement, attachment) + storage_files.original_name | STO-ATT-01, STO-ATT-02 | Đủ | PDF được phép (ck_storage_files__mime) |
| '12 / 12 thành viên đã nhận' | v_announcement_read_stats | COM-ANN-03 | Derived hợp lý | chỉ tác giả/announcement.pin xem |
| confirmedAnns 'Tôi sẽ có mặt' | announcement_reads.acknowledged_at hoặc event_participants.rsvp (qua announcements.event_id) | COM-ANN-05, EVT-PAR-03 | Đủ (map) | không có dòng ở 7.2.4 (A-017) |
| ForumThread.id/title/content | forum_posts.id/title/content | COM-FOR-01..04 | Đủ | |
| .author | forum_posts.author_member_id | COM-FOR-02 | Đủ (map) | |
| .authorRole | — | COM-FOR-01 | **Thiếu API** | A-002 |
| .category | forum_posts.category_id | COM-FOR-02 | Đủ (map) | Đi chơi→FORUM_SPORT, Bếp & Thực đơn→FORUM_FOOD, Góp ý chung→FORUM_FEEDBACK, Học tập→FORUM_STUDY, Giải trí→FORUM_LEISURE |
| .date | forum_posts.created_at, last_activity_at | COM-FOR-01 | Đủ (map) | |
| .repliesCount | forum_posts.comments_count (trigger) | COM-FOR-01 | Derived (lệch) | không giảm khi xóa mềm/ẩn bình luận — đã chạy thử (A-005) |
| .likesCount | forum_posts.reactions_count (trigger) | COM-FOR-09 | Derived (lệch) | đếm cả 3 loại heart/thumbs_up/pray (A-014) |
| .isPinned | forum_posts.is_pinned | COM-FOR-04 | Đủ | |
| .replies[].id/author/content/time | forum_comments.id/author_member_id/content/created_at | COM-FOR-06, COM-FOR-07 | Đủ (map) | |
| PrayerIntention.id/text | prayer_intentions.id/content (5–1000) | COM-PRA-01, COM-PRA-02 | Đủ | |
| .author | prayer_intentions.is_anonymous, author_member_id (+prayer_intention_authors) | COM-PRA-02, COM-PRA-05 | Đủ (map) | 'Ẩn danh' → is_anonymous=true, author NULL |
| .date | prayer_intentions.created_at | COM-PRA-01 | Đủ (map) | |
| .prayingCount | prayer_intentions.prayer_count (trigger) | COM-PRA-01 | Derived hợp lý | |
| .hasPrayed | — (prayer_responses) | COM-PRA-04 | Derived hợp lý | |

##### 2.8 MaintenanceIssue, mượn đồ (lib/mockData.ts:92-103; app/hau-can/page.tsx:157-163; components/Modals.tsx:72-76)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| id | maintenance_issues.issue_no bigint (IDENTITY), id | FAC-ISS-01, FAC-ISS-03 | Đủ (map) | 'LOG-108' = 'LOG-'+issue_no |
| title | maintenance_issues.title (3–200) | FAC-ISS-02, FAC-ISS-04 | Đủ | |
| location | location_room_id / location_text (ck một trong hai) | FAC-ISS-02, HSE-ROOM-01 | Đủ (map) | 10 lựa chọn form đều ánh xạ được (P.1..P.5, P.SANH1, P.SANH2, P.WC_NGOAI, P.XE, text) |
| reportedBy | reporter_member_id | FAC-ISS-02 | Đủ (map) | |
| date | created_at timestamptz | FAC-ISS-01 | Đủ (map) | chuỗi tương đối trong mock không chuyển đổi chính xác được |
| status | issue_status_t | FAC-ISS-05, FAC-ISS-09 | Đủ (map) | Mới tiếp nhận→new, Đang xử lý→in_progress, Đã xong→done (+waiting_parts, cancelled, duplicate) |
| description | description | FAC-ISS-02 | Đủ | |
| assignee | issue_assignments.assignee_member_id / vendor_id, note | FAC-ISS-06, FAC-VEN-01 | Đủ (map) | |
| cost | repair_costs.amount_vnd **bigint**, cost_kind; v_issue_costs | FAC-ISS-07, FAC-ISS-08 | Đủ (map) | |
| photoUrl | media_attachments(maintenance_issue, before_photo) → storage_files(maintenance) | STO-FILE-01/02, STO-ATT-02 | Đủ | |
| issueUrgency (form) | maintenance_issues.urgency urgency_t {low,medium,high,critical} | FAC-ISS-02 | Đủ (map) | Trung bình→medium, Gấp→high, Khẩn cấp→critical; SLA từ settings facility.sla_hours.* |
| BorrowItem.id/name/loc | assets.id/name/location_text, room_id (is_loanable) | FAC-AST-01, FAC-AST-02 | Đủ (map) | |
| BorrowItem.status | — (asset_loans.status=open) | FAC-LOAN-01..03 | Derived hợp lý | |
| BorrowItem.borrower | asset_loans.borrower_member_id, due_at | FAC-LOAN-02 | Đủ (map) | tách chuỗi 'Văn Đức (Trả 18:00)' |
| BorrowItem.icon | — | — | Thiếu DB (đã khai T-06) | |

##### 2.9 MomentAlbum, MomentPhoto (lib/mockData.ts:1017-1044)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Album.id/title/description | albums.id/title (3–200)/description | MOM-ALB-01..04 | Đủ | |
| .category | albums.category_id → categories(kind album, 6 dòng ALB_*) | MOM-ALB-02, PLT-CAT-01 | Đủ (map) | seed khớp 6 nhãn FE |
| .date | albums.taken_on date | MOM-ALB-02 | Đủ (map) | |
| .year/.month | — (taken_on) | MOM-ALB-06 | Derived hợp lý | |
| .location | albums.location_text | MOM-ALB-02 | Đủ | |
| .coverPhoto | albums.cover_file_id → storage_files(moments) | MOM-ALB-02, STO-FILE-04 | Đủ | |
| .photos | album_photos.album_id | MOM-PHO-01, MOM-PHO-02 | Đủ | số ảnh = albums.photos_count: **không giảm khi xóa mềm ảnh** — đã chạy thử (A-006) |
| .author | albums.author_member_id | MOM-ALB-02 | Đủ (map) | |
| .authorRole | — | MOM-ALB-01 | **Thiếu API** | A-002 |
| .tags | albums.tags text[] (≤20) | MOM-ALB-02 | Đủ | |
| .isFeatured | albums.is_featured | MOM-ALB-04 | Đủ | |
| .participants | album_member_tags(member_id, status pending/accepted/declined) | MOM-TAG-01, MOM-TAG-02 | Đủ (map) | cần đồng ý photo_tagging |
| .likesCount | albums.likes_count (trigger album_likes) | MOM-LIKE-01 | Derived hợp lý | |
| .isLiked | — (album_likes) | MOM-LIKE-01 | Derived hợp lý | |
| Photo.id/url/caption | album_photos.id/file_id/caption | MOM-PHO-01..03, STO-FILE-04 | Đủ (map) | |
| Photo.uploadedBy | album_photos.uploaded_by_member_id | MOM-PHO-02 | Đủ (map) | |
| Photo.date | album_photos.taken_at / created_at | MOM-PHO-01 | Đủ (map) | |
| Photo.likesCount | album_photos.likes_count (trigger photo_likes) | MOM-LIKE-01 | Derived hợp lý | |
| deleteMomentAlbum (store) | albums.deleted_at | MOM-ALB-05 | Đủ | không trang nào gọi |

##### 2.10 CategoryItem, cấu hình, Telegram, vai trò (lib/mockData.ts:967-977; app/cai-dat/page.tsx; components/Header.tsx)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| CategoryItem.id/name/code | categories.id/name (1–100)/code (ck in hoa) | PLT-CAT-01..03 | Đủ | |
| .type | categories.kind category_kind_t (+album) | PLT-CAT-01, PLT-CAT-02 | Đủ | |
| .description/.color/.iconName | categories.description/color (ck hex)/icon_name | PLT-CAT-02, PLT-CAT-03 | Đủ | |
| .count | — (usage_count do PLT-CAT-01 đếm) | PLT-CAT-01 | Derived hợp lý | |
| .isActive | categories.is_active | PLT-CAT-03 | Đủ | xóa = xóa mềm (deleted_at) |
| houseName, motto, houseAddress, patronFeast | settings (chưa có khóa org.*) | PLT-SET-01, PLT-SET-02 | **Thiếu DB** | đã khai T-01/B.4 nhưng DDL chưa có; app không có quyền INSERT settings (A-003) |
| mealRate, lunchCutoff, dinnerCutoff | settings (chưa có meal.*) ; meal_menus.cost_per_serving_vnd, cutoff_at theo từng thực đơn | PLT-SET-02, COM-MEAL-02 | **Thiếu DB** (giá trị mặc định) | A-003 |
| nightPrayerTime | event_recurrence_rules.start_time; settings (chưa có liturgy.night_prayer_time) | EVT-REC-02, EVT-REC-03 | Đủ (map) / thiếu khóa mặc định | |
| fundRate | settings['finance.monthly_dues_vnd'] | PLT-SET-02 | Đủ (map) | |
| bankAccount | funds.* | FIN-FUND-02, FIN-FUND-03 | Đủ (map) | |
| nút 'Khôi phục' | — (settings không có giá trị mặc định) | — | **Thiếu DB + Thiếu API** | A-012 |
| telegramSync, remindMorningShift, reportMealSummary, alertMaintenance, remindNightPrayer (công tắc cấp NHÀ) | notification_preferences.enabled (theo TỪNG thành viên × nhóm × kênh) | PLT-NTF-04, PLT-NTF-05 | **Derived (lệch) / Thiếu DB** | ngữ nghĩa nhà → cá nhân; reportMealSummary không có notification_type nhóm meal (A-004) |
| Bot Token | secret backend (ngoài DB) | — | UI/không lưu DB (hợp lý) | |
| Group Chat ID | — | — | **Thiếu DB** | A-004 |
| 'Kiểm tra gửi tin nhắn Bot' | — | — | **Thiếu API** | A-004 (B.4 đã khai) |
| Ma trận phân quyền (tab Phân quyền) | roles, permissions (104), role_permissions | USR-ROL-01 | Đủ | |
| ROLE_CONFIGS.label/desc | roles.name_vi / roles.description | USR-ROL-01 | Đủ | icon/color/badge là UI |
| currentRole + bộ chuyển vai trò | user_roles, role_delegations (current_role_grants) | AUTH-ME-01 | Đủ (map) | bỏ bộ chuyển ở production |

##### 2.11 Bếp & Cơm, giặt, phụng vụ, tài khoản (inline)

| Field | Bảng.cột | API | Trạng thái | Ghi chú |
|---|---|---|---|---|
| mealAttendance[memberId].lunch/.dinner | meal_registrations.will_eat + meal_menus(menu_date, meal_type lunch/dinner) | COM-MEAL-03, COM-MEAL-04, COM-MEAL-05 | Đủ (map) | phân hệ tạm hoãn (settings feature.meals.enabled=false) |
| WEEKLY_MENUS.day/isToday | meal_menus.menu_date | COM-MEAL-01 | Đủ (map) / Derived | |
| WEEKLY_MENUS.cook | meal_menu_cooks(member_id, role_label) | COM-MEAL-01, COM-MEAL-02 | Đủ (map) | |
| WEEKLY_MENUS.lunch[]/dinner[] | meal_menus.dishes text[] (≤20) | COM-MEAL-02 | Đủ | |
| WEEK_DAYS.lunch/dinner | — (COUNT meal_registrations.will_eat + guests) | COM-MEAL-01 | Derived hợp lý | |
| pantryItems.id/name/icon | pantry_items.id/name/icon | FAC-PAN-01..03 | Đủ | |
| pantryItems.qty/target | pantry_items.qty_on_hand, par_level numeric(10,2), unit | FAC-PAN-01, FAC-PAN-03 | Đủ (map) | tách '15 kg' |
| pantryItems.status | — (v_pantry_status.stock_status ok/low/urgent) | FAC-PAN-01 | Derived hợp lý | |
| pantryItems.category | — | — | **Thiếu DB** (đã khai T-05) | |
| 'Mua thêm', '+ Đề xuất mua thêm gia vị' | — | — | **Thiếu DB + API** | A-018 |
| 'Gửi phiếu khảo sát', 'Gửi lời khen/góp ý bữa ăn' | — | — | **Thiếu DB + API** | A-018 |
| laundryBookings key day/slot | laundry_bookings.starts_at/ends_at timestamptz (EXCLUDE chống trùng theo machine_id) | LAU-SLOT-01, LAU-BOOK-02 | Đủ (map) | |
| laundryBookings value (tên) | laundry_bookings.member_id | LAU-BOOK-01, LAU-BOOK-02, LAU-BOOK-05 | Đủ (map) | |
| (máy giặt) | laundry_bookings.machine_id → laundry_machines (2 máy seed) | LAU-MCH-01 | Đủ | FE chưa chọn máy |
| SLOTS | settings['laundry.slots'] (7 khung khớp FE) | PLT-SET-01, LAU-SLOT-01 | Đủ | |
| DAYS | — | — | UI | |
| Lịch phụng vụ: dayLabel / rankBadge | liturgical_days.day_date, title, rank_label, is_abstinence, color | EVT-LIT-01, EVT-LIT-02 | Đủ (map) | |
| Lịch phụng vụ: weekLabel | — | — | Thiếu DB (đã khai T-08) | |
| Lịch phụng vụ: time/title/place | events.starts_at/title/location_* | EVT-EVENT-01, EVT-REC-01 | Đủ (map) | |
| Lịch phụng vụ: presider ('Chủ sự') | liturgy_assignments(member_id, role_type_id) + liturgy_role_types (7) | EVT-LIT-04..06 | Đủ (map) | |
| Góc Lời Chúa: reference/quote/body/author | reflections.scripture_ref/quote/body/author_member_id | EVT-LIT-08..10 | Đủ | |
| Đăng nhập Google | user_identities(provider='google' ck), users | AUTH-OID-01, AUTH-OID-02 | Đủ | |
| Đăng nhập mật khẩu (prompt) | users.password_hash (ck `$argon2id$%`), refresh_tokens (rotated_at, replaced_by_id, reuse_detected_at) | AUTH-LOG-01..04 | Đủ | FE chưa có form |
| Chờ duyệt: displayName/email/statusLabel | member_applications.full_name/email/status application_status_t | USR-APP-02 | Đủ (map) | 'Mới đăng ký' → submitted |
| Chờ duyệt: avatarText | — | — | Derived hợp lý | |
| Chờ duyệt: approverContact | member_positions / settings org.contact_phone (chưa có) | MEM-POS-02 | Đủ (map) / thiếu khóa | |
| Chờ duyệt: 'Đăng xuất' / 'Kiểm tra lại' | auth_sessions / member_applications | AUTH-LOG-04 / USR-APP-02 | Đủ | |
| Thành viên: widget sinh nhật | member_private_details.birth_date (tầng 2, không công khai) | — | **Thiếu API** (đã khai B.4: BL-MEM-11) | |
| Thành viên: lịch sử đóng quỹ 3 tháng | contributions | FIN-DUE-01 (member_id) | Đủ | |
| MemberCVModal: 11 giá trị cứng | settings org.* (chưa có), academic_years, v_member_debts, member_positions | MEM-PRO-06, PLT-SET-01 | Đủ một phần / Thiếu DB (org.*) | A-003 |
| Dashboard: unreadCount / pendingIssues | PLT-BDG-01, v_issue_sla | PLT-BDG-01, FAC-ISS-10 | Derived hợp lý | không có endpoint gộp cho Tổng quan (đã khai B.4) |
| Dashboard: todayDuties/doneDutiesCount | v_duty_week_stats; duty_assignments | DUT-ASG-01 | Derived hợp lý | |
| ToastMessage, activeModal, mobileMenuOpen, isCommandPaletteOpen, isLoadingSkeleton | — | — | UI | |

##### 2.12 Giải mã mã endpoint dùng trong ma trận (đã đối chiếu Phần 6)

| Mã | Endpoint | Mã | Endpoint |
|---|---|---|---|
| AUTH-ME-01 | GET /api/v1/me | AUTH-OID-01/02 | GET /api/v1/auth/oidc/google[/callback] |
| AUTH-LOG-01/04 | POST /api/v1/auth/login · /auth/logout | USR-ROL-01 | GET /api/v1/permissions/matrix |
| USR-ROL-02/03 | GET/POST /api/v1/user-roles | USR-APP-02 | GET /api/v1/member-applications/me |
| MEM-DIR-01 | GET /api/v1/members | MEM-PRO-01/02/03 | POST /members · GET/PATCH /members/{id} |
| MEM-PRO-05 | PUT /members/{id}/student-profile | MEM-PRO-06 | POST /members/{id}/cv-exports |
| MEM-PRV-01/02/03 | GET/PUT /members/{id}/private · POST …/national-id-reveals | MEM-GRD-01/02/05 | GET/POST /members/{id}/guardians · POST …/phone-reveals |
| MEM-CAT-01/02/03 | GET/PUT /members/{id}/catholic-profile · GET /dioceses | MEM-POS-02/03 | GET/POST /board-terms/{id}/appointments |
| HSE-ROOM-01..06 | GET/POST /rooms · GET/PATCH/DELETE /rooms/{id} · PATCH /rooms/{id}/status | HSE-FLR-01..05 | GET/POST /floors · PATCH/DELETE /floors/{id} · PUT /floors/{id}/layout |
| HSE-ASG-01..04 | GET/POST /room-assignments · POST …/{id}/transfer · …/{id}/end | HSE-AMN-01..03 · HSE-SUM-01 | /amenities · GET /housing/summary |
| DUT-ASG-01..05 | GET/POST /duty/assignments · GET/PATCH /{id} · POST /{id}/transitions | DUT-CIN-01 · DUT-REV-01 | POST /duty/assignments/{id}/checkins · POST /duty/checkins/{id}/reviews |
| DUT-SWP-01..05 | /duty/swap-requests (+peer-responses, decisions, cancel) | DUT-CFG-01 · DUT-ARE-01 · DUT-SHF-01 · DUT-ROS-05 | GET /duty/config · POST /duty/areas · POST /duty/shifts · GET /duty/rosters/{id}/export |
| FIN-EXP-01..08 | /finance/expenses (+totals, {id}, submit, decisions, payments) | FIN-PAY-01..03 | /finance/contribution-payments (+void) |
| FIN-DUE-01/03/04 | GET /finance/contributions · /contribution-matrix · /member-debts | FIN-FUND-01..03 · FIN-PLAN-02 | /finance/funds · POST /finance/contribution-plans |
| FIN-RPT-01/02/03 · FIN-PER-02 | GET /finance/summary · /reports/cashflow · /reports/expense-breakdown · /periods/{id} | ACD-REC-01..07 | /academic/records, PUT /academic/my-records/{semesterId}, submit, reopen, verifications |
| ACD-GPA-01 · ACD-GOL-01/02 | GET /academic/gpa-snapshots · /academic/study-goals[/{semesterId}] | ACD-UNI-01 · ACD-CRS-01/02 · ACD-TUT-04/05 | /academic/universities · /academic/courses · /academic/tutoring/requests |
| EVT-EVENT-01..04 · EVT-ORG-01 | /events, /events/{id} · PUT /events/{id}/organizers | EVT-ATT-01/02 · EVT-QR-01..04 | /events/{id}/attendance[/{memberId}] · qr-sessions, POST /attendance/qr-checkins |
| EVT-POLL-01..06 · RT-POLL-01 | /polls, PUT /polls/{id}/votes, /results, /close · SSE | EVT-PAR-03 · EVT-REC-01..03 | PUT /events/{id}/rsvp · /event-recurrence-rules |
| EVT-LIT-01/02/04..06/08..10 | /liturgy/days · /liturgy/assignments · /liturgy/reflections | COM-ANN-01..06 | /announcements (+{id}, reads, read-all) |
| COM-FOR-01..09 | /forum/threads, comments, PUT /forum/reactions | COM-PRA-01..05 | /prayer-intentions (+response, author-reveals) |
| COM-MEAL-01..05 | /meals/menus, registrations, bulk | FAC-ISS-01..10 · FAC-VEN-01 | /facilities/maintenance-issues (…) · /facilities/vendors |
| FAC-AST-01/02 · FAC-LOAN-01..03 · FAC-PAN-01..03 | /facilities/assets · /asset-loans · /pantry-items | LAU-SLOT-01 · LAU-BOOK-01..05 · LAU-MCH-01 | GET /laundry/availability · /laundry/bookings · GET /laundry/machines |
| MOM-ALB-01..06 · MOM-PHO-01..03 · MOM-LIKE-01 · MOM-TAG-01/02 | /moments/albums, /photos, PUT /moments/likes, member-tags | PLT-CAT-01..04 · PLT-SET-01/02 | /categories · GET/PATCH /settings |
| PLT-NTF-04/05 · PLT-BND-01..03 · PLT-BDG-01 · PLT-ACY-01 | /notification-preferences · /channel-bindings · GET /badges · GET /academic-years | STO-FILE-01/02/04 · STO-ATT-01/02 | POST /storage/files, /{id}/complete, GET /{id}/download-url · /attachments |

#### Kiểm chứng Phần 7.2, Phụ lục B.4, Phần 4.7 và các tham chiếu FE của Phần 6

##### K.1 Kiểm tự động bảng ánh xạ 7.2.4 (dòng 29360–30030)

| Phép kiểm | Kết quả | Kết luận |
|---|---|---|
| Mọi `bảng.cột` trong 7.2.4 và B.4 có trong catalog (`check_refs.py 29360-30030,37148-37173`) | 457 tham chiếu đúng; 3 tham chiếu không tồn tại: `assets.icon` (29770), `pantry_items.category` (29848, 30012) — cả 3 đều được tài liệu tự gắn nhãn `[THIẾU DB]`/`none:` và là đề xuất thêm cột | ĐÚNG — không có cột bịa |
| Mọi tên đối tượng DB (`trg_/fn_/v_/ux_/ck_/ex_`) trong 7.2.4 và B.4 (`check_objs.py`) | 0 tên không tồn tại | ĐÚNG |
| Mọi mã endpoint trong 7.2.4 và B.4 có định nghĩa ở Phần 6 (`check_eps.py`) | 194 mã endpoint khác nhau, tất cả tồn tại (6 mã GD-* là giả định, có ở Phụ lục A) | ĐÚNG; riêng câu “185 mã” (30017) đếm sai (A-015) |
| Trích dẫn `file:dòng` FE của 7.2.4 (`check_fe_lines.py`) | 348 dòng ánh xạ, 348 trích dẫn; 29 “lệch” đều là tên trường do tài liệu tự đặt cho JSX cứng (AccountRequest, MemberCv, LiturgyScheduleItem…) và dòng trích dẫn chứa đúng nội dung | ĐÚNG ở HEAD 740ac5d |
| Chuỗi tiếng Việt tài liệu gán cho FE (`check_strings.py 29360 30030`) | 17 chuỗi không có nguyên văn trong `src/`: đều là nhãn DB seed, đề xuất UI hoặc văn bản của chính tài liệu; không có chuỗi “FE” bịa | ĐÚNG |
| Đếm 7.2.4.18: 19 interface, 197 trường; 23 trạng thái, 56 hàm; 48 dẫn xuất + 14 không lưu | Đếm lại: 19 interface / 197 trường (+4 trường reply nội tuyến); AppContextType 23 trạng thái / 56 hàm; 48 dòng `derived:`, 14 dòng `none:`; tổng 348 dòng | ĐÚNG |
| Số liệu mock tài liệu nêu (7 album/14 ảnh; 7 bảng điểm/28 môn; 8 khu vực; 47 lượt/35 tiện ích; fundBalance = 8.680.000; 11 trường ĐH, 2 khớp) | Chạy lại trên mockData.ts: khớp toàn bộ | ĐÚNG |
| Seed DB tài liệu nêu (12 phòng, 2 tầng, 32 danh mục, 17 trường, 27 giáo phận, 43 tiện ích, 47 room_amenities, 45 khóa settings, 2 máy giặt, ngưỡng xếp loại 3,6/3,2/2,5/2,0, thang chữ có D+) | Truy vấn catalog: khớp toàn bộ; 12 phòng khớp từng giá trị với INITIAL_ROOMS | ĐÚNG |

##### K.2 Các dòng 7.2.4 / 7.2.3 sai hoặc thiếu về ngữ nghĩa (không phát hiện được bằng kiểm cú pháp)

| Dòng tài liệu | Nội dung | Phán quyết | Bằng chứng |
|---|---|---|---|
| 29695, 29710, 29789, 29969 | `authorRole` → “derived: positions.name … API suy từ chức danh đang hiệu lực” qua COM-ANN-01/COM-FOR-01/MOM-ALB-01 | **SAI** (mâu thuẫn nội bộ) | 31876, 36959 (GD-COM-75), 37168: `PersonRefDto` không có chức danh — A-002 |
| 29474 | Room.x: “Lưu cả tầng … thay vì gọi updateRoom và toast từng phòng (components/FloorplanCanvas.tsx)” | **SAI (lỗi thời)** | Canvas HEAD không gọi updateRoom/onUpdateRoomPosition — A-009 |
| 29524 | checkInTasks: “FE giữ ở state cục bộ và không gửi vào checkInCleaningDuty” | **SAI** | app/hau-can/page.tsx:240-249 ghép 4 ô vào `fullNote` rồi gọi `checkInCleaningDuty` — A-011 |
| 29918-29922 | 5 công tắc Telegram → `notification_preferences.enabled` | **Lệch ngữ nghĩa** (cấp nhà → cấp cá nhân); Bot Token/Group Chat ID/nút gửi thử không có dòng | A-004 |
| 30017 | “Không phát hiện trường FE nào thiếu endpoint tương ứng: 185 mã endpoint…” | **SAI** | A-002, A-004, A-007, A-012, B.4 37157-37158 |
| 7.2.4 (toàn mục) | Không có dòng cho `rsvpState` (app/lich-su-kien/page.tsx:89) và `confirmedAnns` (app/thong-bao/page.tsx:38) dù 7.2.4.18 nói phủ đủ 22 cấu trúc cứng | **THIẾU dòng** | A-017 |
| 29562, 29608, 29661 | `room` của Contribution/AcademicRecord/EventCheckInRecord → `v_member_current_room` | **Lệch** (phòng hiện tại thay cho phòng tại thời điểm bản ghi) | A-013 |
| 29714 | `likesCount` → `forum_posts.reactions_count` | **Lệch** (đếm cả 3 loại cảm xúc) | A-014 |
| 29713 | `repliesCount` → `forum_posts.comments_count` “bộ đếm do trigger duy trì” | **Đúng cột nhưng giá trị sai sau xóa mềm** | A-005 |
| 29787 | `photos` → `albums.photos_count` “do trigger duy trì” | **Đúng cột nhưng giá trị sai sau xóa mềm** | A-006 |
| 29269-29315 (7.2.3.5) | 56 hàm store → endpoint | ĐÚNG: mọi mã tồn tại, ngữ nghĩa khớp (addMember→MEM-PRO-01/05+HSE-ASG-02; deleteMomentAlbum→MOM-ALB-05; toggleLikeThread→COM-FOR-09 …) | eps.json |

##### K.3 Phụ lục B.4 (dòng 37148–37171) — kiểm từng dòng

| Dòng | Khẳng định của B.4 | Phán quyết | Bằng chứng |
|---|---|---|---|
| 37154 | Chưa có khóa settings: tên lưu xá, địa chỉ, khẩu hiệu, bổn mạng, Tỉnh Dòng, linh hướng, giá suất cơm, giờ chốt cơm, giờ Kinh Tối, số ghim tối đa, kênh liên hệ | ĐÚNG (catalog `settings` 45 khóa, không có `org.*`, `meal.*`, `liturgy.*`) | truy vấn settings; FE app/cai-dat/page.tsx:84-93 |
| 37155 | “Đã bổ sung trường `pending_applications` của BadgesDto” | **SAI** — PLT-BDG-01 (28117) không nhắc trường này; Phần 6 không định nghĩa BadgesDto | A-010 |
| 37156 | “Đã bổ sung trường `server_time` của MeDto” | **SAI** — AUTH-ME-01 (26177) không có; 30873 vẫn ghi “đề nghị thêm server_time vào AUTH-ME-01” | A-010 |
| 37157 | Sinh nhật tự nguyện: chưa có mục đích `birthday_share` và endpoint | ĐÚNG (consent_purposes có 11 mã, không có birthday_share) | truy vấn consent_purposes |
| 37158 | Cấu hình nhóm Telegram và nút gửi thử: không có bảng, chưa có endpoint | ĐÚNG (nhưng mâu thuẫn với 7.2.4.13 và 30017) | A-004 |
| 37159 | Biên bản rà soát quyền: có endpoint đọc, chưa có endpoint lưu | KHÔNG XÁC MINH ĐƯỢC liên hệ FE (FE không có chức năng này) | — |
| 37160 | Người nộp đơn chọn người giới thiệu: thiếu `member.read` | ĐÚNG về DB (member_applications.referrer_member_id có); FE không có ô này | catalog |
| 37161 | Lịch sử cấu hình finance.* | KHÔNG XÁC MINH ĐƯỢC liên hệ FE | — |
| 37162 | as_of, số phòng bảo trì, người chưa xếp phòng; xuất sơ đồ | ĐÚNG (v_room_occupancy không có tham số; không có fn_room_occupancy) | _names.txt |
| 37163 | Ứng viên đổi ca; realtime roster/lưới giặt | ĐÚNG (không có fn_swap_candidates; FE modal swapDuty dùng danh sách cứng) | components/Modals.tsx:888-892 |
| 37164-37166 | Báo cáo học tập ngoài; iCal; thùng rác album… | ĐÚNG là chưa có; FE cũng không có các chức năng này | — |
| 37167 | COM-ANN-03 chỉ trả số đếm | ĐÚNG (27803) | |
| 37168 | `PersonRefDto` chưa có chức danh | ĐÚNG — nhưng mâu thuẫn 7.2.4 (A-002) | |
| 37169 | `comments_count` cần sửa ở DDL | ĐÚNG — đã chạy thử xác nhận; DDL vẫn chưa sửa (A-005) | fix_test.sql |
| 37170 | Báo cáo chốt suất ăn; pantry chưa có nhóm hàng; notifications.member_id bắt buộc | ĐÚNG (notifications.member_id NOT NULL) | catalog |
| 37171 | `allowed_actions` chỉ có ở ExpenseDto và MaintenanceIssueDto; Tổng quan ghép 4–8 lời gọi | ĐÚNG (chỉ thấy ở ví dụ 27269-27307 tài chính và 27610 báo hỏng) | grep Phần 6 |
| (thiếu) | Không có dòng cho: nút 'Khôi phục' cấu hình (A-012); 'Mua thêm'/khảo sát món (A-018); bộ đếm ảnh album sau xóa mềm (A-006) | THIẾU | |

##### K.4 Phần 4.7 (dòng 20252–21129)

| Dòng | Nội dung | Phán quyết |
|---|---|---|
| 20256-20302 | Bảng 45 khóa settings | ĐÚNG, khớp catalog từng khóa/giá trị |
| 20767-20871 | Seed lookup “khớp bộ mock của FE ở commit 740ac5d”: 12 phòng, 2 tầng, mã P.* giữ nguyên | ĐÚNG (đối chiếu từng giá trị phòng ở mục 2.2) |
| 20928 | `duty_shifts.end_time` là [GIẢ ĐỊNH] vì FE chỉ có giờ bắt đầu | ĐÚNG |
| 21125 | “bỏ trường dẫn xuất (`status` 'Đã đóng', `balance`, `gpa`…)” | **SAI nhỏ** — mockData không có trường `balance`/`gpa` (A-016) |

##### K.5 Tham chiếu FE trong Phần 6 (dòng 25645–28762)

| Phép kiểm | Kết quả |
|---|---|
| Mọi `file:dòng` có nằm trong độ dài tệp (`check_idents.py`) | 0 tham chiếu vượt độ dài |
| Số dòng `store.tsx` gắn với tên hàm (`check_store_lines.py`) | 14 tham chiếu trong 26402–26901 là số dòng của commit `e4ba5fb` (ví dụ `addMember (store.tsx:397-409)` ở 26402; HEAD là 413-426) — A-008 |
| Trích dẫn `hau-can/page.tsx`, `so-do-nha/page.tsx`, `FloorplanCanvas.tsx` ở 6.4.3, 6.5.4 | Trỏ vào mã không liên quan ở HEAD (ví dụ `hau-can/page.tsx:209` HEAD là một dòng chuỗi Zalo, commit cũ là lời gọi checkInCleaningDuty) — A-008 |
| Khẳng định hành vi FE | “moveMemberToRoom … không kiểm sức chứa” (26488; cũng ở ghi chú HSE-ASG-02 dòng 26475) sai ở HEAD; “Lưu vị trí phòng trên canvas … updateRoom từng phòng” (26490) sai ở HEAD — A-009 |
| Khẳng định chức năng FE không tồn tại | “Thay danh sách giáo phận cứng trong Modals.tsx” (26360) và “Chọn giáo phận (`Modals.tsx`) – Danh sách cứng” (26409): không có ô chọn giáo phận ở HEAD lẫn commit cũ — **BỊA ĐẶT** (A-001) |

#### Bảng/cột thừa

Phân loại 141 bảng của catalog (gồm bảng cha phân vùng `audit_logs`; không tính 7 partition `audit_logs_*`) theo lý do tồn tại. “FE” = có trường/luồng FE dùng; “Prompt” = prompt gốc yêu cầu dù FE chưa có; “Đề xuất” = phân hệ mới do tài liệu đề xuất, có BR/BL tham chiếu; “Nghi bịa” = không có lý do truy được.

| Nhóm | Bảng | Số bảng | Kết luận |
|---|---|---|---|
| Phục vụ FE trực tiếp | members, member_private_details, member_guardians, catholic_profiles, member_sacraments, dioceses, student_profiles, universities, member_positions, positions, user_identities, member_applications, roles, permissions, role_permissions, user_roles, floors, rooms, amenities, room_amenities, room_assignments, cleaning_areas, duty_shifts, duty_rosters, duty_assignments, duty_assignment_members, duty_checkins, checklist_templates, checklist_template_items, checkin_items, duty_reviews, duty_swap_requests, expense_vouchers, contributions, contribution_plans, contribution_payments, contribution_payment_allocations, funds, ledger_entries, academic_records, grade_records, courses, semesters, academic_years, grade_scales, grade_scale_bands, grade_rank_bands, gpa_snapshots, study_goals, tutoring_requests, events, event_organizers, event_participants, attendance_records, qr_sessions, polls, poll_options, poll_votes, announcements, announcement_reads, forum_posts, forum_comments, forum_reactions, prayer_intentions, prayer_responses, maintenance_issues, issue_assignments, repair_costs, assets, asset_loans, albums, album_photos, album_likes, album_member_tags, categories, settings, storage_files, media_attachments, laundry_machines, laundry_bookings, meal_menus, meal_menu_cooks, meal_registrations, pantry_items, liturgical_days, liturgy_role_types, liturgy_assignments, reflections, member_channel_bindings, notification_preferences | 90 | Cần thiết |
| Prompt yêu cầu (FE chưa có) | users, auth_sessions, refresh_tokens, password_resets, login_attempts (Argon2id + JWT rotation/reuse — PROMPT:53); event_recurrence_rules, event_recurrence_exceptions (lịch định kỳ — PROMPT:77); expense_approvals, expense_status_history, financial_periods, period_fund_balances (duyệt, báo cáo, audit trail — PROMPT:82-84); vendors (thợ ngoài — PROMPT:88); duty_swap_status_history, duty_status_history, issue_status_history (lịch sử trạng thái/audit); notifications, notification_types, notification_outbox, push_subscriptions (đẩy/email — PROMPT:105); audit_logs (PROMPT:105); idempotency_keys (hạ tầng API) | 21 | Cần thiết |
| Đề xuất mở rộng có lý do | user_mfa_factors, mfa_recovery_codes (MFA cho vai trò tài chính); role_delegations, board_terms (ủy quyền, nhiệm kỳ); consents, consent_purposes, data_subject_requests (Nghị định 13/2023 — Phần 9); announcement_targets (đối tượng nhận); prayer_intention_authors (ẩn danh thật); photo_likes (FE không có tim ảnh); content_reports (kiểm duyệt); leave_requests (vắng có phép, nối 'Vắng phép' của RSVP); duty_review_appeals, member_unavailability (khiếu nại, khai bận cho bộ xếp lịch); tutoring_offers, tutoring_matches, tutoring_sessions (FE chỉ có cờ supportNeeded); bank_statement_lines, period_reconciliations (đối soát sao kê); asset_maintenance_schedules; laundry_waitlist; policy_documents, policy_acknowledgements (nội quy); ai_budgets, ai_jobs, ai_suggestions, ai_task_types, ai_usage_daily (Phần 8 prompt yêu cầu AI); merit_rules, merit_entries (điểm đóng góp trực nhật) | 30 | Thừa so với FE nhưng có lý do; KHÔNG XÁC MINH ĐƯỢC mức cần thiết của `merit_rules`/`merit_entries` (điểm đóng góp), `asset_maintenance_schedules`, `laundry_waitlist` — không có trong FE lẫn prompt, phụ thuộc quyết định Ban điều hành |
| Nghi bịa | — | 0 | Không phát hiện bảng nào không truy được lý do |

> Ghi chú đếm: 90 + 21 + 30 = 141 (kiểm bằng script so với `catalog_tablelist.txt`, không trùng, không sót).

**Cột thừa so với FE nhưng có lý do (không nghi bịa):**
- Định danh/an toàn: `members.member_no`, `members.hide_phone`, `members.status/left_on` (vòng đời cư trú), `users.locale/time_zone`.
- Sơ đồ nhà: `rooms.gender_policy` (FE không có giới tính phòng; lưu xá hiện chỉ nam — GD-HOUSE-01), `floors.canvas_width/canvas_height/sort_order`, `rooms.layout_*` (prompt yêu cầu tọa độ canvas, dù canvas HEAD không đọc), `room_assignments.bed_label/reason`.
- Trực nhật: `duty_checkins.client_captured_at/is_late/late_minutes/client_request_id`, `duty_assignments.attempt_count/rework_due_at`, `cleaning_areas.difficulty_points/min_assignees` (bộ xếp lịch).
- Sự kiện: `events.expected_scope/attendance_open_minutes/late_grace_minutes/status/cancel_reason`, `attendance_records.method/distance_m/device_hash/qr_session_id`, `qr_sessions.geofence_*`, `polls.is_anonymous/max_choices/opens_at/closes_at`.
- Tài chính: `contributions.discount_*`, `expense_vouchers.required_approvals/approval_round/payee_name/invoice_no/no_receipt_reason/maintenance_issue_id/event_id`, `ledger_entries.prev_hash/row_hash`, `funds.last_seq/head_hash`.
- Tệp: `storage_files.phash/device_info/exif_stripped/scan_status/variants`.
- Nội dung: `albums.visibility/status/event_id`, `prayer_intentions.status/visibility/expires_at`, `forum_comments.parent_id`, `meal_registrations.guests/note`, `laundry_machines.capacity_kg/brand`.
- Lưu ý đặt tên (S3, không phải bịa): `prayer_intentions.visibility` có kiểu `content_status_t` (published/hidden/locked) — thực chất là trạng thái kiểm duyệt, trong khi `prayer_intentions.status` (open/answered/closed) mới là trạng thái nghiệp vụ; dễ nhầm khi viết API.

#### Độ phủ theo phân hệ

| Phân hệ (prompt gốc) | Bảng chính (đã có trong catalog) | API (Phần 6) | FE route | Kết luận | Ghi chú |
|---|---|---|---|---|---|
| 1. Xác thực & RBAC (5 vai trò, Argon2id, JWT rotation + reuse) | users (ck `$argon2id$%`), auth_sessions, refresh_tokens (rotated_at, replaced_by_id, reuse_detected_at), password_resets, login_attempts, user_identities (google), roles (8), permissions (104), role_permissions, user_roles, role_delegations, user_mfa_factors | AUTH-*, USR-* (AUTH-LOG-01..04, AUTH-OID-01/02, AUTH-ME-01, USR-ROL-01..03) | /dang-nhap, /cho-phe-duyet, Header | **Đủ** | 3 vai trò trưởng ban thêm ngoài 5 vai trò FE |
| 2. Hồ sơ thành viên & đời sống Công giáo | members, member_private_details, member_guardians, catholic_profiles, member_sacraments, dioceses, student_profiles, universities, positions, member_positions, consents | MEM-* (29 endpoint) | /thanh-vien | **Đủ** | MEM-CAT-03 có ghi chú bịa về FE (A-001) — không ảnh hưởng độ phủ |
| 3. Sơ đồ nhà & phòng (+ lịch sử phân phòng) | floors, rooms, amenities, room_amenities, room_assignments (EXCLUDE 1 người/1 phòng), v_room_occupancy, v_member_current_room | HSE-* | /so-do-nha | **Đủ** | tọa độ canvas có cột + HSE-FLR-05 nhưng FE HEAD không dùng (A-009) |
| 4. Hậu cần, trực nhật, vệ sinh + đổi ca 3 bước | cleaning_areas (6 + toàn nhà), duty_shifts (3), duty_rosters, duty_assignments (7 trạng thái), duty_assignment_members, duty_checkins (ảnh bắt buộc), checklist_templates/items (4 tiêu chí), checkin_items, duty_reviews (score), duty_swap_requests (pending_peer → pending_admin → approved), duty_*_history | DUT-* | /hau-can | **Đủ** | ứng viên đổi ca chưa có API (đã khai) |
| 5. Học tập & bảng điểm + EVD | academic_years, semesters, grade_scales (40/60, from_letter), grade_scale_bands (A+…F, có D+), grade_rank_bands, courses, academic_records, grade_records (is_pass), gpa_snapshots (học kỳ/tích lũy), study_goals, tutoring_*, media_attachments (transcript), bucket academic-evidence | ACD-*, STO-* | /hoc-tap | **Đủ** | gpa4 khác công thức FE (chủ đích) |
| 6. Sự kiện, điểm danh QR, biểu quyết | events, event_recurrence_rules/exceptions, event_organizers, event_participants (RSVP), qr_sessions (secret 32 byte, xoay 15–120 s), attendance_records, polls (is_multi_select), poll_options, poll_votes (fn_cast_vote), leave_requests, v_event_attendance | EVT-*, RT-POLL-01, RT-ATT-01 | /lich-su-kien | **Đủ** | |
| 7. Sổ quỹ thu chi + ma trận 12 tháng | funds (cash/bank), financial_periods, ledger_entries (chuỗi băm), period_fund_balances, contribution_plans, contributions, contribution_payments (method), allocations, expense_vouchers (7 trạng thái), expense_approvals, v_contribution_matrix, v_fund_balances, mv_cashflow_monthly | FIN-* (FIN-DUE-03 = ma trận) | /thu-chi | **Đủ** | tiền đều BIGINT VND |
| 8. Cơ sở vật chất & báo hỏng | maintenance_issues (urgency, issue_no, sla_due_at), issue_assignments (nội bộ/vendor), issue_status_history, repair_costs (liên kết expense_voucher), vendors, assets, v_issue_sla, v_issue_costs | FAC-ISS-*, FAC-VEN-* | /hau-can, ReportIssueModal | **Đủ** | FE chưa gửi urgency (lỗi FE, tài liệu đã nêu) |
| 9. Khoảnh khắc & album | albums, album_photos, album_likes, photo_likes, album_member_tags, categories(kind album) | MOM-* | /khoanh-khac | **Đủ (có lỗi bộ đếm)** | photos_count sai sau xóa mềm (A-006) |
| 10a. Thông báo + đã đọc | announcements, announcement_targets, announcement_reads (read_at, acknowledged_at), v_announcement_read_stats | COM-ANN-* | /thong-bao, modal chuông | **Đủ (thiếu chức danh tác giả)** | A-002 |
| 10b. Diễn đàn | forum_posts, forum_comments (1 cấp trả lời), forum_reactions, content_reports | COM-FOR-* | /dien-dan | **Đủ (có lỗi bộ đếm)** | A-005, A-014 |
| 10c. Ý chỉ cầu nguyện | prayer_intentions (is_anonymous, prayer_count), prayer_intention_authors, prayer_responses | COM-PRA-* | /phung-vu | **Đủ** | |
| 10d. Đặt lịch giặt (nhiều máy, 06–22, chống trùng) | laundry_machines (2), laundry_bookings (EXCLUDE theo machine_id + tstzrange), laundry_waitlist, settings laundry.slots | LAU-* | /hau-can tab máy giặt | **Đủ** | |
| 11. Object storage & upload | storage_files (bucket enum: avatars, receipts, cleaning-evidence, academic-evidence, maintenance, moments, attachments, documents; MIME jpeg/png/webp/pdf; ≤20 MB; sha256, phash), media_attachments | STO-* | mọi dropzone | **Đủ** | FE nhận `image/*` (HEIC/GIF) — tài liệu đã nêu chuyển đổi |
| 12. Hạ tầng xuyên suốt | audit_logs (partition tháng), settings, notifications/outbox/push, idempotency_keys | PLT-*, RT-* | — | **Đủ một phần** | settings thiếu khóa cấu hình nhà (A-003) và nhóm Telegram (A-004) |
| (FE) Bếp & Cơm — tạm hoãn | meal_menus, meal_menu_cooks, meal_registrations, pantry_items, v_pantry_status | COM-MEAL-*, FAC-PAN-* | /bep-com | **Đủ một phần** | thiếu nhóm hàng (đã khai), danh sách cần mua/khảo sát món (A-018) |
| (FE) Mượn đồ | assets (is_loanable), asset_loans (EXCLUDE 1 người mượn) | FAC-AST-*, FAC-LOAN-* | /hau-can tab mượn đồ | **Đủ** | icon thiếu (đã khai) |
| (FE) Phụng vụ | liturgical_days, liturgy_role_types (7), liturgy_assignments, reflections, events (EVT_MASS) | EVT-LIT-*, EVT-REC-* | /phung-vu | **Đủ** | nhãn tuần phụng vụ thiếu (đã khai) |
| (FE) Danh mục, cài đặt, Telegram | categories (32), settings, member_channel_bindings, notification_preferences | PLT-CAT-*, PLT-SET-*, PLT-BND-*, PLT-NTF-*, PLT-HOOK-02 | /cai-dat | **Thiếu** cho tab Cài đặt chung và tab Telegram | A-003, A-004, A-012 |


### ④.C Độ phủ API: đối tượng DB không tồn tại, endpoint thiếu, ma trận API ↔ RLS (Bước 5)

#### Endpoint tham chiếu đối tượng DB không tồn tại

**Cách kiểm:** script `scratchpad/api/check.py` và `check2.py` quét toàn văn Phần 6 theo mẫu `fn_*`, `tg_*`, `trg_*__*`, `(ux|ix|ck|ex)_*__*`, `v_*`/`mv_*`, mọi định danh dạng `bảng__tên` (policy), mọi `bảng.cột`, mọi chuỗi chấm (mã quyền/khóa settings/loại thông báo), cộng toàn bộ danh sách `DB:` của 390 endpoint, đối chiếu catalog `luuxa_api`. Thêm kiểm bằng SQL: số lượng seed (27 giáo phận, 11 chức danh, 11 mục đích đồng ý, 7 quy tắc điểm, 8 vai trò, 104 quyền, 31 loại thông báo) — **đều khớp** tài liệu; giá trị enum dạng CHECK (`role_label`, `doc_kind`, `status` của 18 bảng) — **đều khớp**.

**Kết quả: 0 bảng/cột/trigger/ràng buộc/chỉ mục/quyền/khóa settings không tồn tại** ngoài danh sách dưới.

| # | Tham chiếu | Dòng | Thực tế trong DB | Đánh giá |
|---|---|---|---|---|
| 1 | `courses__select__authenticated` (ACD-CRS-01) | 26857 | Không có; policy thật là `courses__select` (USING `app.is_authenticated()`) | Sai tên — C-039 (S3) |
| 2 | `app.fn_academic_history` (ACD-REC-08) | 26870 | Không có | Đã gắn `[ĐỀ XUẤT, BL-ACAD-07]` — chấp nhận |
| 3 | `app.fn_my_access_log` (MEM-ACC-01) | 26357 | Không có | `[ĐỀ XUẤT, BL-MEM-12]` — chấp nhận |
| 4 | `app.fn_close_roster` (DUT-ROS-04) | 26713, 26766 | Không có | `[ĐỀ XUẤT, BL-DUTY-11]` |
| 5 | `app.fn_assign_all_members`, `app.fn_create_review_appeal` | 26705, 26728, 26767 | Không có | “sau khi vá BL-DUTY-12” |
| 6 | `app.fn_swap_candidates` | 26776 | Không có | `[ĐỀ XUẤT, BL-DUTY-51]` |
| 7 | `app.fn_room_occupancy` (HSE-SUM-01) | 26468 | Không có | `[ĐỀ XUẤT]` |
| 8 | `app.fn_link_member_user`, `app.fn_anonymize_member` | 26427, 26426 | Không có | BL-MEM-51, BL-MEM-20 |
| 9 | `app.fn_handover_board_term` (PLT-TRM-04) | 28142, 28148, 28751 | Không có | D-10 `[ĐỀ XUẤT]` — logic bàn giao không nguyên tử cho tới khi có |
| 10 | `app.fn_update_my_prayer`/`fn_close_my_prayer` (COM-PRA-03) | 27828, 28750 | Không có | D-09 `[ĐỀ XUẤT]` |
| 11 | `app.fn_send_notification`, `app.fn_advance_event_status`, `app.fn_cancel_contribution` | 28752, 28755, 28757 | Không có | D-11, D-15, D-17 `[ĐỀ XUẤT]` |
| 12 | `v_member_directory`, `v_members_missing_guardian`, `v_unassigned_members` | 26426, 26508 | Không có | BL-MEM-20, BL-HOUSE-14 |
| 13 | Loại thông báo `house.room_assigned`, `event.cancelled`, `facility.maintenance_due` | 26475, 26963, 27637 | Không có trong `notification_types` (31 loại) | Đã ghi `[ĐỀ XUẤT]` |
| 14 | Khóa settings `academic.aggregate.min_group` | 26856 | Không có (45 khóa) | Đề xuất của BR-ACAD-14 — chấp nhận |
| 15 | Trường `current_loan_id` của tài sản (FAC-AST-01) | 27553 | `assets` không có cột này | Là trường DTO suy ra từ `asset_loans`; nên ghi rõ “dẫn xuất” (gộp C-001) |
| 16 | Trường `publish_at` (COM-ANN-02) | 27802 | `announcements` chỉ có `published_at` | Hai tên cho cùng ý — C-046 |

Đối tượng **tồn tại nhưng tài liệu mô tả sai hành vi** (chi tiết ở Phát hiện): `student_profiles__select` (C-031 BỊA ĐẶT), `v_duty_member_stats.merit_points` (C-033), `merit_entries` GRANT cho `luuxa_app` (C-034), GRANT UPDATE `user_roles` (C-035), `mv_cashflow_monthly` GRANT (C-020), `auth_sessions__*__own_or_admin` (C-005), `fn_poll_results` (C-011/C-012), `fn_reveal_prayer_author` (C-003), `tg_users_guard` (C-002), `tg_ai_job_gate` (C-004/C-041).

#### Endpoint thiếu

| Nhu cầu | Có? | Endpoint hiện có / thiếu | Mức |
|---|---|---|---|
| Đăng ký | Có | AUTH-REG-01 (mặc định tắt); nhưng AUTH-OID-02 vẫn tạo tài khoản bất kể cờ đăng ký mở (C-029) | — |
| Đăng nhập, MFA, step-up | Có | AUTH-LOG-01/02/05 | — |
| Làm mới token | Có | AUTH-LOG-03 (xoay vòng, phát hiện dùng lại) | — |
| Đăng xuất | Có, hở | AUTH-LOG-04 đòi access token còn hạn; hết hạn thì không thu hồi được phiên (C-030) | S3 |
| Đổi mật khẩu / quên / đặt lại | Có | AUTH-ME-03, AUTH-PWD-01, AUTH-PWD-02 | — |
| **Đổi email/SĐT đăng nhập của chính mình có xác minh** | **Không** | Chỉ USR-ACC-04 (người quản trị đổi hộ, không xác minh lại) — nguồn gốc C-002 | THIẾU·S2 (C-047) |
| **Liên kết Google cho tài khoản đã có** | **Không** | AUTH-OID-02 trả 409 “hướng dẫn đăng nhập mật khẩu rồi liên kết” nhưng không có endpoint liên kết | THIẾU·S3 (C-048) |
| Presigned upload + xác nhận | Có | STO-FILE-01, STO-FILE-02, STO-FILE-03, STO-ATT-02 | — |
| Duyệt/từ chối | Có | USR-APP-06, USR-DLG-03, FIN-EXP-07, EVT-LEAVE-03, ACD-REC-07, DUT-SWP-04, DUT-APL-03, COM-REP-03, AIX-SUG-02; **thiếu** từ chối ủy quyền (USR-DLG chỉ có approve/revoke), **thiếu** rút khiếu nại (Q-DUTY-50) | S3 |
| Lịch sử | Một phần | FIN-EXP-12, HSE-ASG-01, DUT-ASG-03, FAC-ISS-03, ACD-REC-08 `[ĐỀ XUẤT]`; **thiếu** lịch sử trạng thái thành viên, đơn xin phép, đổi ca (`duty_swap_status_history` không có GET) | S3 |
| Báo cáo/xuất tệp | Một phần | FIN-RPT-04, DUT-ROS-05, MEM-PRO-06, PLT-AUD-02, USR-REV-01; **thiếu** xuất điểm danh (EVT-ATT-04 chỉ JSON), **thiếu xuất dữ liệu cá nhân cho chủ thể (quyền truy cập/di chuyển dữ liệu — NĐ 13/2023)**: PLT-DSR chỉ ghi nhận yêu cầu | THIẾU·S2 (C-047) |
| Đánh dấu đã đọc | Có | PLT-NTF-02/03, COM-ANN-05/06, COM-POL-04 | — |
| Tìm kiếm | Một phần | Tham số `q` trên từng danh sách; không có tìm kiếm tổng hợp cho Command Palette (FE phải gọi nhiều endpoint) | S3 |
| Phân trang | Có | cursor + `PageMeta`; một số `list<>` không chặn kích thước theo thời gian (LAU-WAIT-01, FIN-REC-05) (C-042) | S3 |
| **GET theo id cho tài nguyên vừa tạo (Location)** | **Không** cho 45 tài nguyên | ví dụ `/user-roles/{id}`, `/role-delegations/{id}`, `/leave-requests/{id}`, `/polls/{id}`, `/finance/funds/{id}`, `/finance/contribution-plans/{id}`, `/finance/ledger-entries/{id}`, `/finance/contribution-payments/{id}`, `/facilities/assets/{id}`, `/laundry/bookings/{id}`, `/content-reports/{id}`, `/duty/swap-requests/{id}`, `/duty/appeals/{id}`, `/floors/{id}`, `/categories/{id}`… (C-025) | S3 |
| Liệt kê phiên của một người dùng cho quản trị | Không | USR-ACC-06 thu hồi “mù” không xem trước được (C-005) | S3 |

Đặc tả đầy đủ cho các endpoint mới đề xuất ở **Phụ lục C**.

#### Ma trận API ↔ RLS

Kiểm 24 endpoint nhạy cảm; “Bằng chứng” trỏ tới kịch bản chạy thật (T*) hoặc mã nguồn SQL đã đọc. Vai trò mặc định lấy từ `role_permissions` thực (admin, house_head=HH, vice_head=VH, treasurer=TQ, member).

| Endpoint | Vai trò API (tài liệu) | RLS / GRANT / hàm thực | Khớp? | Bằng chứng |
|---|---|---|---|---|
| FIN-EXP-07 duyệt phiếu chi (27181) | `finance.expense.approve` (HH, VH, TQ) + BR-FIN-01/02/17; trả 403 | `fn_decide_expense` SECURITY DEFINER kiểm `finance.expense.approve`; `trg_expense_approvals__rules` phát BR-FIN-01/02/17 bằng `check_violation` (23514) | Khớp quyền; **lệch mã HTTP** với 6.1.7 (422) và **thiếu step-up** | `36_fn_finance_flows.sql:316-332, 152-187`; C-007, C-014 |
| FIN-LED-03 ghi tay sổ cái (27194) | `finance.ledger.adjust` (HH) / `finance.contribution.record` (TQ, chỉ donation) | `fn_post_ledger_entry` DEFINER: donation ⇒ `lacks_permission('finance.contribution.record')`, nguồn khác ⇒ `finance.ledger.adjust`; `luuxa_app` chỉ SELECT `ledger_entries` | **Khớp** (thiếu step-up) | `35_fn_finance_ledger.sql:226-279`; GRANT `ledger_entries`=SELECT |
| ACD-REC-02 sửa điểm (26864) | `academic.write_own`, chính chủ, nháp | `grade_records__write` (ar.member_id = current_member_id) + `tg_grade_record_lock` | **Khớp** | `33_fn_academic.sql:372-394`; catalog policy |
| ACD-REC-07 xác minh (26869) | `academic.verify` chỉ đổi trạng thái | `academic_records__update` cho verify + `can_view_academic`, **không giới hạn cột** | **Không** — RLS rộng hơn: VH sửa `has_scholarship`, `major_snapshot` bảng điểm người khác | T15 rows=1; C-006 |
| ACD-REC-03 xem điểm người khác (26865) | `academic.read_all` + đồng ý + `X-Access-Reason` | `academic_records__select`: self OR (submitted/verified AND `can_view_academic`) | **Khớp** (lý do/ghi audit chỉ ở API) | catalog policy |
| MEM-PRV-03 xem CCCD (26377) | `member.national_id.read` (chỉ HH) + step-up + lý do | `member_private_details__select`: self OR `member.private.read` (HH, VH); GRANT SELECT mọi cột kể cả `national_id_enc` | **Không** — VH đọc được bản mã; kiểm quyền/ghi audit chỉ ở API | T9c `deadbeef`; C-018 |
| COM-PRA-05 xem tác giả ẩn danh (27830) | `prayer.reveal_author` (HH) + báo cáo mở + lý do ≥ 10 | `fn_reveal_prayer_author` kiểm quyền, lý do, “tồn tại báo cáo mở” — không quan tâm ai lập | Khớp chữ, **hở thực chất**: HH tự lập báo cáo | T2 trả đúng tác giả; C-003 |
| COM-REP-01 báo cáo vi phạm (27831) | authenticated, “chỉ báo nội dung mình nhìn thấy” | `content_reports__insert`: reporter = self, status=open; không kiểm đối tượng tồn tại/nhìn thấy | **Không** — RLS rộng hơn | T8 chấp nhận id không tồn tại; C-022 |
| DUT-REV-01 nghiệm thu (26732) | `duty.review` toàn nhà/tầng/khu vực (`can_review_area`) | `duty_reviews__insert`: reviewer = self AND `has_permission('duty.review')` (mặc định global) | **Không** — RLS hẹp hơn với vai trò theo tầng (tài liệu tự nhận BL-AUTH-12) | catalog policy |
| USR-ROL-03 gán vai trò (26211) | `auth.role.assign` (HH), không tự gán, không admin, BR-AUTH-10 | `user_roles__insert__assign` khớp 3 điều đầu; BR-AUTH-10 không ở DB; **`luuxa_auth` có INSERT `user_roles` + BYPASSRLS** | Một phần | T11a chặn admin; T11b HH gán `house_head` cho tài khoản admin; T14 `luuxa_auth` chèn admin; C-009 |
| USR-ACC-04 khóa/sửa tài khoản (26200) | `auth.user.manage` + `auth.role.assign` nếu đích giữ vai trò đặc quyền + step-up | `users__update__self_or_manage` + `tg_users_guard` chỉ kiểm `auth.user.manage`; không reset `email_verified_at` | **Không** — RLS rộng hơn | T1: Admin đổi email + vô hiệu HH, `email_verified_at` giữ nguyên; C-002 |
| AUTH-SES-01/02/03 phiên của tôi (26189-26191) | authenticated, “RLS: chính chủ” | `auth_sessions__select/update__own_or_admin`: own OR `auth.session.revoke_any` (HH, Admin) | **Không** — RLS rộng hơn | T16: HH thấy 4 phiên, “đăng xuất thiết bị khác” thu hồi 3 phiên người khác; C-005 |
| EVT-QR-04 điểm danh QR (26991) | authenticated, chỉ cho chính mình | `fn_checkin_by_qr` DEFINER (current_member_id, HMAC 2 slot, geofence tùy chọn); `attendance_records__insert` chỉ `fn_can_record_attendance` | **Khớp**; nhưng không chống chuyển tiếp mã (C-013) | `34_fn_events.sql:219-287` |
| EVT-ATT-02 điểm danh hộ (26955) | `event.attendance.record` hoặc ban tổ chức | `attendance_records__insert/update`: `fn_can_record_attendance(event_id)` | **Khớp** | catalog policy |
| EVT-POLL-03 bỏ phiếu (26984) | `poll.vote`, thành viên đang ở | `fn_cast_vote` INVOKER + `poll_votes__insert__own` (self + poll.vote) + `tg_poll_vote_rules` (mở, max_choices, active) | **Khớp** | `34_fn_events.sql:416-436, 526-547` |
| EVT-POLL-05 / RT-POLL-01 kết quả (26986, 28345) | `event.read`; tên chỉ `poll.manage` và poll không ẩn danh | `fn_poll_results` DEFINER **chỉ kiểm đã đăng nhập**, không kiểm `event.read`/poll nháp; luồng SSE tính bằng worker BYPASSRLS | **Không** — DB rộng hơn | T3: tài khoản invited (0 vai trò) đọc kết quả poll nháp; C-011, C-012 |
| LAU-BOOK-02 đặt lịch giặt (27874) | `laundry.book` (self) / `laundry.manage` | `laundry_bookings__insert` khớp; `ex_laundry_bookings__no_overlap` (booked, checked_in) ⇒ 23P01 ⇒ 409 | **Khớp** | catalog constraint |
| LAU-BOOK-01 xem lượt giặt (27873) | thành viên mặc định `mine=true`; `laundry.manage` lọc mọi người | `laundry_bookings__select`: `house.read` (mọi vai trò) | Lệch nhẹ — RLS rộng hơn | T9a: b1 thấy lượt của b2; C-023 |
| HSE-ASG-01 lịch sử phân phòng (26474) | `reason`, `end_reason` chỉ chính chủ/`house.assign` | `room_assignments__select`: `house.read`; GRANT SELECT mọi cột | **Không** (tài liệu tự nhận BL-HOUSE-14) | T9b đọc được “lý do sức khỏe tâm lý”; C-019 |
| MEM-DIR-01 danh bạ tầng 1 (26361) | `member.read` thấy trường/ngành | `student_profiles__select`: self hoặc `member.private.read`/`academic.read_all`/`academic.read_aggregate`/`member.update` | **Không** — RLS hẹp hơn: thành viên thường nhận 0 dòng | T5a: 0 dòng; C-017 |
| FIN-RPT-02 dòng tiền (27214) | `finance.summary.read`; `fund_id` cần `finance.ledger.read` | `mv_cashflow_monthly` không có RLS; ACL `luuxa_app=arwd` | **Không** — DB rộng hơn | T10a; C-020 |
| PLT-SET-02 sửa cấu hình (28138) | `setting.write` / `finance.settings.write` theo khóa | `settings__update__setting_write` theo `write_permission`; mọi `auth.*` = `setting.write` (Admin) | Khớp API, **thiết kế hở**: Admin hạ MFA bắt buộc | T13: finance 0 dòng (đúng), `auth.mfa_required_roles` 1 dòng; C-008 |
| PLT-AUD-02 xuất nhật ký (28115) | `audit.log.read` / `audit.sensitive.read` | `audit_logs__select` thêm nhánh `audit.finance.read` (TQ) | API hẹp hơn (TQ đọc được nhưng không xuất được) — chấp nhận, nên ghi rõ | catalog policy |
| AIX-JOB-01 tạo tác vụ AI (28255) | `ai.use`, chỉ truyền con trỏ | `ai_jobs__insert`: requested_by = self AND `ai.use`; cổng dựa `subject_member_id`, `provider`, `status` do client đặt | **Không** — RLS rộng hơn | T4: job trên phiếu chi người khác `queued`; bỏ chủ thể ⇒ không kiểm đồng ý; tự chèn `status=succeeded`; C-004, C-041 |
| MEM-CON-04 rút đồng ý (26386) | `self / dsr.manage` | `consents__update__withdraw`: self OR `dsr.manage` (Admin, HH) | **Khớp** (lưu ý: Admin kỹ thuật rút đồng ý hộ được) | catalog policy |

#### Realtime (SSE/WebSocket) và webhook — đánh giá

- **Xác thực/kênh:** SSE dùng cookie HttpOnly cùng nguồn + kiểm `Origin`, không đặt token trên URL, kiểm lại quyền mỗi 5 phút, đóng sau 30 phút (28389-28391) — hợp lý. WebSocket dự phòng kiểm Origin và quyền mỗi `subscribe` (28410) — hợp lý. Lệch: thu hồi phiên “có hiệu lực ngay” (25700) nhưng luồng SSE còn nhận sự kiện tới 5 phút (C-043).
- **Kênh `poll-results`:** không bao giờ phát tên (đúng), nhưng phát **số phiếu từng phương án sau mỗi lô ≤ 1 lần/giây** cho poll ẩn danh đang mở ⇒ người quan sát gắn được thay đổi tổng với một người vừa bỏ phiếu ⇒ lộ lựa chọn (C-011). Tổng hợp tính bằng kết nối worker BYPASSRLS (28406) nên mọi kiểm tra “poll nhìn thấy được” phải nằm ở API; hàm DB `fn_poll_results` không kiểm (C-012).
- **Kênh `attendance-live`:** chỉ người điểm danh được/ban tổ chức; mang token QR — hợp lý. Tuy nhiên chính token QR có thể chuyển tiếp cho người vắng mặt trong 45–90 giây (C-013). Tên kênh/đường dẫn lẫn `attendance-live`/`attendance-stream` (27059 vs 28343).
- **Kênh `notifications`:** gắn `member_id`; tài khoản không có hồ sơ thành viên (Admin kỹ thuật, invited) không có hộp thư ⇒ thông báo bảo mật bắt buộc không tới trong ứng dụng (C-040).
- **Webhook:** chữ ký HMAC trên thân thô + dấu thời gian ±5 phút, chống trùng theo khóa nhà cung cấp — đúng chuẩn. Hở: chạy bằng `luuxa_worker` BYPASSRLS có INSERT `user_roles`, UPDATE `users`, EXECUTE `fn_post_ledger_entry` (T14c) cho endpoint công khai (C-010); xác định quỹ chỉ bằng 4 số cuối tài khoản (C-045); liên kết Telegram/Zalo gán kênh cho ai gửi mã trước, mã lưu bộ nhớ tiến trình (C-044).


### ④.D Độ chính xác trích dẫn FE của tài liệu (Bước 8)

#### Kiểm chứng trích dẫn FE

##### 1. Thống kê tự động trên toàn tài liệu

| Chỉ số | Giá trị |
|---|---|
| Tham chiếu tệp FE (dạng `…/x.tsx`, `x.ts`, có hoặc không có dòng) | 2.902 |
| Trong đó có số dòng `:NN(-MM)` | 2.396 (Phần 1: 180; Phần 4: 1; Phần 6: 67; Phần 7: 2.128; Phần 10: 20) |
| Phân giải được về tệp có thật trong `src/` | 2.368; **100% số dòng nằm trong độ dài tệp** (1 ca ngoài phạm vi là do script gán nhầm ngữ cảnh `page.tsx` trơn, không phải lỗi tài liệu) |
| Tệp cấu hình gốc (`package.json`, `next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`) | 28 tham chiếu có dòng, tất cả trong phạm vi |
| Đường dẫn không tồn tại (`middleware.ts`, `error.tsx`, `not-found.tsx`, `routes.ts`, `src/lib/api/*`, `src/features/*`, `ui/Dialog.tsx`, `app/manifest.ts`…) | 44 tên, **tất cả** được viết là "không có …" hoặc là tệp đề xuất tạo mới. Không có tệp, component hay hàm nào bị khẳng định là đang tồn tại mà thực tế không có |
| Kiểm tên định danh (PascalCase/camelCase trong backtick ở Phần 1 và 7.1) không có trong `src/` | Chỉ còn tên được nêu là "không có" (`updateMember`, `deleteMember`), tên cột DB, hoặc tên ở `next.config.mjs` (`remotePatterns`). Không phát hiện bịa đặt |

Kiểm riêng các khẳng định tồn tại mà đề bài nêu:

| Khẳng định | Thực tế | Kết luận |
|---|---|---|
| Route `/loi-nguyen` | Không có trong `src/app`. Tài liệu nói đúng: "mã FE không có route đó và ý cầu nguyện nằm ngay trong `/phung-vu`" (dòng 30183, 31248) | Đúng |
| `ReportIssueModal` | Không có component này; báo hỏng là nhánh `activeModal === "reportIssue"` trong `src/components/Modals.tsx:357`. Tài liệu **không** nhắc tên `ReportIssueModal` (grep 0 kết quả) | Không có bịa đặt |
| 15 route, 13 `loading.tsx`, 10 tệp `components/`, 6 tệp `components/ui/`, 5 tệp `lib/`, 52 tệp `.ts/.tsx` (7.1.1) | Đếm lại khớp từng số | Đúng |
| `"use client"` 33 tệp; `aria-*` 3 (1 tệp); `role=` 0 (trong TSX); `htmlFor`/`tabIndex`/`sr-only`/`dark:` 0; `Math.random` 10; `Date.now` 14; "Minh Tuấn" 60 lần ở 13 tệp; `fixed inset-0` 27 lần ở 13 tệp; `z-50` 30/14; `text-[10px]` 150; `text-[11px]` 146; `<img>` 10 ở 4 tệp; Unsplash 43 ở 6 tệp; `localStorage` 4 ở 1 tệp; `useApp()` 23 tệp | Đếm lại khớp; `as any`/`: any` là 16 dòng ở 6 tệp (tài liệu ghi 17 chỗ, lệch 1) | Đúng |
| `mockData.ts`: 19 `interface`, 197 trường, 14 hằng `INITIAL_*`; `AppContextType`: 56 hàm + 23 trạng thái (7.2, 7.2.4.18) | Đếm lại khớp chính xác | Đúng |
| "năm lệnh `window.confirm` được thay ở 740ac5d" (7.1.12) | `e4ba5fb` có 5 lệnh `confirm(` (cai-dat 1, so-do-nha 3, FloorplanCanvas 1); `740ac5d` có `ConfirmDialog` ở `cai-dat/page.tsx:972`, `so-do-nha/page.tsx:736,962,1137,1609` | Đúng |
| Lớp `shadow-xs`, `shadow-2xs` "không có hiệu lực ở Tailwind 3.4.17" | `tailwind.config.ts` không khai `boxShadow`; Tailwind v3 không có `shadow-xs` | Đúng |
| 0 sink XSS (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `window.open`) (7.5) | grep `src/`: 0 | Đúng |

##### 2. Mẫu ngẫu nhiên 74 trích dẫn (ưu tiên Phần 1, 7.1, 7.3), mở mã thật từng cái

Quy ước: **Đúng** = dòng trích chứa đúng nội dung mô tả (dung sai ±2 dòng ghi "Đúng*"); **SAI** = lệch dòng hoặc nội dung không còn đúng ở `740ac5d`; **BỊA** = tệp/hàm/component không tồn tại.

| # | Trích dẫn | Dòng TL | Thực tế ở `740ac5d` | KL |
|---|---|---|---|---|
| 1 | `dang-nhap/page.tsx:38-51` | 240 | `<Link href="/">` nút Google; link `/cho-phe-duyet` ở 53-59; "Phê duyệt bởi Trưởng nhà" ở 66 | Đúng |
| 2 | `Header.tsx:84-87,188-225` | 243 | `handleRoleChange` 84-87; banner "Thử nghiệm vai trò" 188+ | Đúng |
| 3 | `Sidebar.tsx:150-155` | 244 | "MT", "Minh Tuấn"; `Header.tsx:181` "· P.204" | Đúng |
| 4 | `CommandPalette.tsx:56-65` | 245 | `ACTION_ITEMS` mở `addExpense`, `addMember` không kiểm vai trò | Đúng |
| 5 | `cai-dat/page.tsx:693-755` | 246 | Bảng 6 phân hệ × 5 vai trò; "dòng 715" là hàng Thu Chi (ô Admin ở 720); "dòng 298" thực là 297 | Đúng* |
| 6 | `ImageUploadDropzone.tsx:35-78,172-193` | 659 | `maxSizeMB = 10`, chế độ URL; `avatarUrl` chỉ ghi ở `Modals.tsx:622`, không nơi hiển thị | Đúng |
| 7 | `store.tsx:200-281` | 1063 | 7 hàm phòng/tầng; kiểm sức chứa 246-260 | Đúng |
| 8 | `page.tsx:81` (so-do-nha) | 1064 | `canManageHouse` ở dòng 82 (dòng 81 ở `e4ba5fb`) | Đúng* |
| 9 | `Modals.tsx:73,99,641-652` | 1067 | "Hành lang Tầng 2", `memRoom`, danh sách phòng cứng | Đúng |
| 10 | `mockData.ts:1300-1331` | 1810 | `SubjectScore`, `AcademicRecord` | Đúng |
| 11 | `hoc-tap/page.tsx:173-239` | 1812 | `handleCreateRecordSubmit`; nút 305; modal 831; `store.tsx:512-520` | Đúng |
| 12 | `lich-su-kien/page.tsx:1133-1159` | 2148 | SVG QR vẽ tay; "LX-OCT26-ASSISI" ở 1159 | Đúng |
| 13 | `store.tsx:474-509` | 2151 | `voteEventPoll`, `createEventPoll` | Đúng |
| 14 | `lich-su-kien/page.tsx:251-288` | 2151 | `handleCreatePollSubmit` | Đúng |
| 15 | `mockData.ts:56-66` | 2609 | `Expense`; `receiptUrl` chỉ được ghi (`Modals.tsx:258`) | Đúng |
| 16 | `FinancialReportModal.tsx:345-367,214-215` | 2623 | "Phạm Gia Bảo", "Trần Văn Đức" (360); "MẪU SỐ: LX-TC/2026" | Đúng |
| 17 | `Header.tsx:45` | 2629 | "Ghi phiếu chi, duyệt khoản chi…" | Đúng |
| 18 | `khoanh-khac/page.tsx:174-197` | 3739 | `filteredMoments` lọc chuỗi con | Đúng |
| 19 | `khoanh-khac/page.tsx:116` | 3762 | `uploadedBy: "Minh Tuấn"` | Đúng |
| 20 | `Modals.tsx:706-784` | 4048 | modal `createAnnouncement` | Đúng |
| 21 | `app/page.tsx:132` | 4049 | `unreadCount … isUnread` | Đúng |
| 22 | `Sidebar.tsx:56` | 4049 | `unreadAnnCount` | Đúng |
| 23 | `phung-vu/page.tsx:171-245` | 4051 | khối "Ý cầu nguyện cộng đoàn", ô ẩn danh | Đúng |
| 24 | `store.tsx:661` | 4077 | `addPrayer(text, isAnonymous)`; dòng 665 ghi "Ẩn danh"/"Minh Tuấn", không lưu cờ | Đúng |
| 25 | `Modals.tsx:318,432,675` | 4682 | ba `<ImageUploadDropzone` | Đúng |
| 26 | `Modals.tsx:675` | 4690 | dropzone ảnh thành viên | Đúng |
| 27 | `store.tsx:693-725` | 4966 | Ở `740ac5d` danh mục ở 709-741 (693-725 là số dòng `e4ba5fb`); khoảng trích vẫn phủ `addCategory` 709 đến `deleteCategory` 725 | Đúng* |
| 28 | `store.tsx:291,315,373,402` và `308,316,374,404` | 4970 | `Math.random` thực ở 307, 331, 389, 418; dòng 308/316/374/404 là `setToasts`, `};`, `if (memberId)`, `markAllAnnouncementsRead` — đúng từng dòng của `e4ba5fb` | **SAI** (số dòng cũ) |
| 29 | `thanh-vien/page.tsx:131-194` | 26362 | thẻ số cứng "12 thành viên", "12/14 chỗ" | Đúng |
| 30 | `so-do-nha/page.tsx:291` "nút Nhân bản" | 26484 | Dòng 291 trống; `handleDuplicateRoom` ở 305 và **không có nút Nhân bản nào được render** (prop `onDuplicateRoom` khai ở `FloorplanCanvas.tsx:43` nhưng không dùng); ở `e4ba5fb` có nút "Nhân bản phòng này" (`FloorplanCanvas.tsx:900-902`) | **SAI** (mô tả FE cũ) |
| 31 | `page.tsx:252` "form Sửa" (so-do-nha, mục 6.4.3) | 26485 | Ở `740ac5d` dòng 252 thuộc `handleSaveAddRoom`; form Sửa (`handleSaveEditRoom`) ở 265; 252 là số dòng `e4ba5fb` | **SAI** (số dòng cũ) |
| 32 | `FormControls.tsx:534-573` | 28831 | `CustomDateRangePicker` không nơi dùng | Đúng |
| 33 | `CommandPalette.tsx:59-64` | 28841 | 6 hành động nhanh | Đúng |
| 34 | `CommandPalette.tsx:40-54` | 28859 | `NAV_ITEMS` (có `/hau-can` hai lần) | Đúng |
| 35 | `Modals.tsx:64-102,260-262` | 28860 | state 8 modal sống ngoài vòng đời | Đúng |
| 36 | `Modals.tsx:75,378-387,422` | 28871 | `issueUrgency` có ô nhập nhưng `addIssue` không nhận | Đúng |
| 37 | `phung-vu/page.tsx:20,24,25` | 28882 | `if (isLoadingSkeleton)` return sớm, hook khai sau | Đúng |
| 38 | `dien-dan/page.tsx:150` | 28883 | `filteredThreads.map` không trạng thái rỗng | Đúng |
| 39 | `thong-bao/page.tsx:136-182` | 28883 | danh sách không trạng thái rỗng | Đúng |
| 40 | `hau-can/page.tsx:873` | 28885 | `cancelLaundry(dIdx, sIdx)` không hỏi | Đúng |
| 41 | `store.tsx:170` | 28905 | `currentRole` mặc định "Phó nhà" | Đúng |
| 42 | `Sidebar.tsx:146-195` | 28908 | menu người dùng cứng | Đúng |
| 43 | `Modals.tsx:878-916` | 28947 | modal đổi ca chỉ `showToast` | Đúng |
| 44 | `store.tsx:420` | 29379 | `joined: new Date().toLocaleDateString(…)` | Đúng |
| 45 | `Header.tsx:33` | 29433 | `color: "from-amber-500 …"` | Đúng |
| 46 | `mockData.ts:69` | 29560 | `memberId: string` | Đúng |
| 47 | `store.tsx:104` | 29950 | `issues: MaintenanceIssue[]` | Đúng |
| 48 | `FloorplanCanvas.tsx:48-57` | 30569 | destructuring không nhận `onUpdateRoomPosition` | Đúng |
| 49 | `FloorplanCanvas.tsx:1694-1703` | 30572 | thẻ `draggable`; tệp có 0 `tabIndex/role/aria-/onKeyDown` | Đúng |
| 50 | `hau-can/page.tsx:178` | 30711 | `todayDuties` lọc "Thứ Sáu" / "02/10/2026" | Đúng |
| 51 | `hau-can/page.tsx:803-817` | 30736 | hai nút "Nhận xử lý ca này", "Đánh dấu đã sửa xong" | Đúng |
| 52 | `ImageUploadDropzone.tsx:77` | 30929 | `reader.readAsDataURL(file)`; `required` chỉ vẽ dấu * (128) | Đúng |
| 53 | `lich-su-kien/page.tsx:1102` | 31056 | `{qrModalEvent &&` | Đúng |
| 54 | `lich-su-kien/page.tsx:868-980` | 31073 | `eventsWithCheckIn.map` render toàn roster | Đúng |
| 55 | `FormControls.tsx:126-130,390-394` | 31097 | `<label>` không `htmlFor` | Đúng |
| 56 | `phung-vu/page.tsx:54,67,80,98,…` | 31252 | `shadow-xs` | Đúng |
| 57 | `phung-vu/page.tsx:83-86` | 31254 | "Chúa Nhật 04/10", "08:30 sáng · Đại lễ Bổn mạng" | Đúng |
| 58 | `store.tsx:666-668` | 31258 | `date: "Hôm nay"`, `hasPrayed: true` | Đúng |
| 59 | `store.tsx:665` | 31259 | author "Ẩn danh"/"Minh Tuấn" | Đúng |
| 60 | `thu-chi/page.tsx:65,170-174,941-946` | 31369 | `MONTH_ORDER`, số dư kỳ cứng, "Số dư đầu kỳ" | Đúng |
| 61 | `Header.tsx:78,156-165` | 31536 | chuông chỉ đếm `announcements` | Đúng |
| 62 | `mockData.ts:1050` | 31650 | "quý Cha linh hướng, quý Dì, quý ân nhân…" | Đúng |
| 63 | `store.tsx:655-659` | 31916 | `toggleLikeThread` chỉ +1 | Đúng |
| 64 | `dien-dan/page.tsx:116-143,270-292` | 31917 | thanh lọc 4 chuyên mục thiếu "Giải trí" (129) | Đúng |
| 65 | `zaloShare.ts:88-135` | 32031 | "/ 12 suất" cứng ở 114, 123 | Đúng |
| 66 | `MobileBottomNav.tsx:23-29` | 32233 | mảng 5 tab | Đúng |
| 67 | `Modals.tsx:679` | 32259 | `value={memAvatar}` (URL tùy ý) | Đúng |
| 68 | `types/declarations.d.ts:1-4` | 32266 | `declare module "*.css"` default export | Đúng |
| 69 | `store.tsx:900-906` | 32292 | `useApp` | Đúng |
| 70 | `layout.tsx:19-22` | 32576 | `metadata` chỉ title, description | Đúng |
| 71 | `hau-can/page.tsx:76` (mục 7.5) | 32759 | Dòng 76 là `];` của mảng khu vực; kiểm vai trò `canReviewDuties` ở **116** (dòng 76 ở `e4ba5fb`) | **SAI** (số dòng cũ) |
| 72 | `Sidebar.tsx:171-191` | 32759 | "Chuyển vai trò thử nghiệm" | Đúng |
| 73 | `app/page.tsx:113-124,468-511` | 33059 | `recentExpenses`, khối "Hoạt động gần đây" | Đúng |
| 74 | `page.tsx:493` (trang chủ) | 36161 | `py-0.2` | Đúng |

**Tỷ lệ:** Đúng 70/74 = **94,6%** (khớp chính xác 67/74 = 90,5%; 3 ca lệch ≤ 2 dòng); SAI 4/74 = 5,4%; **BỊA ĐẶT 0**.

Theo phần: Phần 1: 27/28; **7.1: 12/12; 7.2: 4/4; 7.3: 22/22**; 7.4–7.7: 3/4; Phần 6 và 10: 2/4.

##### 3. Nguyên nhân gốc của các ca SAI: trích dẫn chép từ ghi chú audit của commit cũ

Ghi chú audit gốc (`…/79591587-…/scratchpad/notes/fe_*.md`) được viết trên `e4ba5fb` (ví dụ `fe_hau_can.md` ghi `hau-can/page.tsx` 1.442 dòng, `store.tsx` 890 dòng; ở `740ac5d` là 1.406 và 906). Phần 7 đã được cập nhật số dòng, nhưng một số chỗ ngoài Phần 7 (và một câu ở 7.5) vẫn mang số dòng cũ.

Kiểm có hệ thống bằng vị trí định nghĩa hàm (`const X =`) ở hai commit cho mọi trích dẫn tới tệp đã đổi ở `740ac5d`:

| Phần | Khớp `740ac5d` | Khớp `e4ba5fb` (cũ) |
|---|---|---|
| Phần 2–6 | 1 | **14** (mọi trích dẫn hàm `store.tsx` ở 6.3.x, 6.4.3, 6.5.x, 6.6.x: `addMember 397-409`, `removeMemberFromRoom 258-265`, `checkInCleaningDuty 518-537`, `reviewCleaningDuty 539-557`, `swapCleaningDuty 559-574`, `addCleaningDuty 576-583`, `addAcademicRecord 496-504`, `updateAcademicRecord 506-511`, `deleteAcademicRecord 513-516`) |
| Phần 7 | 78 | 0 |
| Phần 1 | 6 | 0 bằng phép kiểm này; kiểm tay thấy thêm ít nhất 5 chỗ cũ (dòng 245, 656, 4966, 4970) |

Tài liệu tự khẳng định ở 7.1 (dòng 28782): "số dòng trích dẫn đã được mở lại và kiểm trên `740ac5d`". Khẳng định này đúng cho Phần 7 nhưng không đúng cho Phần 6 và một phần Phần 1.

Ca không ngẫu nhiên phát hiện thêm: dòng 1347 và 1351 (Phần 1.4) đảo nhãn hai đoạn: "Check-in `page.tsx:231-257`" thực là `handleCopyDutyScheduleZalo` (231) và "Copy Zalo `page.tsx:205-229`" thực là `handleOpenCheckInModal` (205).

---


---

## ⑤ KẾT QUẢ DRY-RUN

Không dừng ở "chạy bằng đầu": cả 8 kịch bản bắt buộc và các kịch bản tấn công đều **chạy thật** trên PostgreSQL 16.14.


### ⑤.1 Tám kịch bản bắt buộc (Bước 3.7)

Môi trường: PostgreSQL 16.14, DB tạo từ 37 file 01…52 nguyên văn. Mỗi bước là **một kết nối mới + một transaction + `set_config('app.current_user_id')` + `SET LOCAL ROLE luuxa_app`** — đúng mô hình API qua connection pool mà tài liệu mô tả ở 2.3/6.1.2. Script: `kiem-dinh/scripts/dryrun.js`.

| # | Kịch bản | Diễn biến thực tế | Đúng/Sai | Liên kết lỗi |
|---|---|---|---|---|
| KB1 | Thành viên mới + hồ sơ Công giáo + phân phòng | Nộp đơn → Phó nhà duyệt (`fn_approve_member_application`) tạo hồ sơ + vai trò ✔. Lưu hồ sơ Công giáo khi chưa đồng ý → bị chặn đúng (BR-MEM-04) ✔. Ghi đồng ý rồi lưu ✔, bí tích ✔. **Phó nhà xếp phòng P.2 → `permission denied for schema app`** ✘. Thành viên khác và Trưởng nhà (chưa có đồng ý chia sẻ) đọc hồ sơ Công giáo → 0 dòng ✔. | **SAI** ở bước xếp phòng | F-026 |
| KB2 | Hai người cùng đặt một khung giờ giặt đồng thời | Phiên 2 chờ khóa rồi nhận `23P01 ex_laundry_bookings__no_overlap` | ĐÚNG (cần API map 23P01 → 409) | — |
| KB3 | Nhập điểm giữa kỳ + cuối kỳ, biên, sửa lần hai | 8,5/8,5 → 8,50 **A** 4,00 ✔; 7,0/7,0 → 7,00 **B** 3,00 ✔; 8,0/8,42 → 8,30 B+ ✔ (40/60, làm tròn 1 số lẻ). Chỉ có giữa kỳ → lỗi khó hiểu "không có bậc cho điểm <NULL>" ✘. Nộp → GPA học kỳ 7,93 / 3,50 "Giỏi" ✔. Sửa sau khi nộp → RLS lọc 0 dòng ✔. **Chính chủ đưa bảng điểm ĐÃ XÁC MINH về nháp** ✘. Mọi lần sửa điểm có audit (4 dòng) ✔. | Một phần | F-031, F-032 |
| KB4 | Phiếu chi → duyệt → số dư; hủy/đảo | Số dư đầu kỳ 10.000.000 ✔. Phiếu 1.500.000 đ (≥ 1.000.000 ⇒ 2 chữ ký) ✔. Người lập tự duyệt → chặn ✔. Chi khi mới 1/2 chữ ký → chặn ✔. Đủ 2 chữ ký → chi ✔ → số dư 8.500.000 ✔. Hủy phiếu đã chi → chặn ✔. Đảo (`fn_reverse_expense`) → số dư 10.000.000 ✔. Thủ quỹ DELETE sổ cái → `permission denied` ✔. Chuỗi băm nguyên vẹn ✔. **Riêng race chốt sổ ∥ chi tiền: bút toán lọt kỳ đã chốt** ✘ (kịch bản R-01b). | ĐÚNG (tuần tự) / SAI (đồng thời) | F-028 |
| KB5 | A cố đọc/sửa dữ liệu của B | Đọc phiếu chi B → 0; sửa → 0 dòng; đọc/sửa điểm B → 0; đọc chi tiết riêng tư (CCCD, ngày sinh) → 0; tự gán vai trò Thủ quỹ → RLS chặn; đọc audit_logs → 0. 18 phép thử mass-assignment trên dòng của chính mình đều bị chặn. | ĐÚNG | — |
| KB6 | Check-in vệ sinh 4 tiêu chí + ảnh → "Cần làm lại" → check-in lại | Check-in + 4 tiêu chí trong một transaction ✔ (tách hai transaction ⇒ ràng buộc trì hoãn BR-DUTY-09 chặn — đúng thiết kế, API phải ghi cùng transaction). Người cùng ca tự nghiệm thu → chặn (BR-DUTY-02) ✔. Phó nhà "rework" → ca `rework_required`, có hạn làm lại ✔. Check-in lại bằng ảnh cũ → chặn (`ux_duty_checkins__evidence`) ✔. Ảnh mới → Phó nhà duyệt → `approved`, attempt 2 ✔. | ĐÚNG | — |
| KB7 | Đổi ca: xin → nhận → duyệt; người nhận từ chối | Người không được nhờ trả lời → chặn ✔. Phó nhà duyệt khi chưa có xác nhận → chặn ✔. Người xin tự duyệt → chặn ✔. Đủ 3 bước → thành phần ca đổi đúng ✔. Người nhận từ chối → đơn `rejected`, Phó nhà không duyệt được nữa ✔. | ĐÚNG | — |
| KB8 | Xóa mềm thành viên đã có dữ liệu liên quan | Trưởng nhà đặt `deleted_at` cho m2 khi m2 vẫn `active` → được phép; **tài khoản m2 vẫn `active`**, vẫn đăng nhập đọc phiếu chi/lượt giặt của mình, `current_member_id()` = NULL; **ca trực ngày mai vẫn còn**. Dữ liệu tài chính còn nguyên (FK RESTRICT) ✔. Luồng chính thức `status='left'` → khóa tài khoản ✔ nhưng vẫn không gỡ lịch tương lai. | **SAI** | F-033 |

### ⑤.2 Kịch bản đồng thời bổ sung (smoke test của tác giả không thể kiểm vì chạy một phiên)
| Mã | Kịch bản | DB gốc | DB đã vá (⑥) |
|---|---|---|---|
| T01 | Phó nhà xếp phòng trên kết nối mới | FAIL `permission denied for schema app` | PASS |
| T01b | Superuser ghi `consents` trên kết nối mới | FAIL (cùng lỗi) | PASS |
| T02 | Worker tạo phân vùng audit 9 tháng tới | FAIL `permission denied for schema public` | PASS |
| T03 | Hai phiên xếp giường cuối phòng 2 chỗ | FAIL — 3 người | PASS — 2 người |
| T04 | Hai lượt giặt song song khi đã 2/3 | FAIL — 4 lượt | PASS — 3 lượt |
| T05 | Hai INSERT phiếu song song, poll 1 lựa chọn | FAIL — 2 phiếu | PASS — 1 phiếu |
| T06 | Chi tiền ∥ chốt sổ | FAIL — snapshot 1 ≠ sổ cái 2 | PASS — chi bị chặn BR-FIN-06 |
| T07 | Lưu điểm giữa kỳ trước | FAIL — lỗi `<NULL>` | PASS — tổng kết để trống |
| T08 | Chính chủ mở lại bảng điểm đã xác minh | FAIL — đổi được | PASS — BR-ACAD-18 |
| T09 | Xóa mềm hồ sơ đang ở | FAIL — xóa được, tài khoản active | PASS — CHECK chặn |
| — | `60_smoke_tests.sql` của tác giả | ROLLBACK, không lỗi | ROLLBACK, không lỗi (không hồi quy) |


### ⑤.3 Kịch bản tấn công bảo mật đã chạy (Bước 7)

#### Kịch bản tấn công đã chạy

| # | Kịch bản | Lệnh (rút gọn) | Kết quả thật | Đánh giá |
|---|---|---|---|---|
| B1.1 | Thành viên thường đọc CCCD/giám hộ/Công giáo/bí tích/consent/audit của người khác (qua **bảng**) | `SELECT … FROM member_private_details/member_guardians/catholic_profiles/member_sacraments/consents/audit_logs WHERE member_id=<b2>` dưới b1 | **0 dòng** mọi bảng | ĐẠT — RLS chặn |
| B1.2/E8 | Đọc qua **hàm SECURITY DEFINER** nhận id tùy ý | `app.user_roles_of('<a2>')` ; `app.has_active_consent('<b2>','catholic_profile')` ; `app.roles_have_permission(…)` | **user_roles_of trả `{house_head,member}`** dù bảng `user_roles` lọc 0 dòng; **has_active_consent trả `true`** cho chủ thể khác; roles_have_permission trả true | **LỖ HỔNG D‑002** (oracle vượt RLS) |
| B1.3/E6 | Đọc dữ liệu nhạy cảm qua **view báo cáo** | `SELECT count(*) FROM v_member_debts/v_member_gpa_latest/v_member_current_room/mv_cashflow_monthly` dưới b1 | 0 (view là `security_invoker=true`) | ĐẠT |
| B2.1 | Ý chỉ ẩn danh có lộ tác giả ở **bảng chính**? | `SELECT is_anonymous, author_member_id FROM prayer_intentions …` | `is_anonymous=true, author_member_id=NULL` | ĐẠT — ẩn danh thật |
| B2.2 | b1 đọc **bảng tác giả thật** `prayer_intention_authors` | `SELECT count(*) …` | **0** | ĐẠT (RLS `__select__own`) |
| B2.3 | b1 (không quyền) gọi hàm lộ tác giả | `app.fn_reveal_prayer_author(id,'…')` | ERROR `Không có quyền…` | ĐẠT |
| B2.4 | Trưởng nhà lộ tác giả **khi chưa có báo cáo mở** | `app.fn_reveal_prayer_author(id,'…')` | ERROR `BR-COM-05: chỉ … khi có báo cáo vi phạm đang mở` | ĐẠT |
| B2.5‑6 | Chuỗi: b1 tự lập báo cáo → a2 lộ tác giả | `INSERT content_reports(reporter=b1)` → `fn_reveal_prayer_author` dưới a2 | **Trả về author_member_id = b2** | **D‑007** (reporter ≠ revealer chưa bị ép — đã ghi ĐỀ XUẤT BR‑COM‑21) |
| B2.7 | Lộ tác giả có ghi nhật ký? | `SELECT … FROM audit_logs WHERE entity_table='prayer_intention_authors'` | 1 dòng `READ_SENSITIVE` kèm lý do | ĐẠT |
| B3.1 | Admin kỹ thuật đọc audit của bảng dữ liệu cá nhân / tài chính | `SELECT count(*) FROM audit_logs WHERE entity_table IN (…)` dưới a1 | **0** mọi nhóm | ĐẠT (hai quyền đọc `is_sensitive/finance_audit_table`) |
| B3.2 | Giá trị trước/sau trong audit có lộ CCCD/điểm? | đọc `old_data/new_data` dưới a2 | Cột nhạy cảm là **`[REDACTED]`** (nid, birth_date, hometown, home_address, holy_name, phone…) | ĐẠT (users: email **không** che — D‑008) |
| B3.3 | Thành viên thường đọc audit_logs | `SELECT count(*) FROM audit_logs` dưới b1 | **0** | ĐẠT |
| B4.1 | Tự gán vai trò `house_head` cho mình | `INSERT user_roles(user_id=b1, house_head)` | ERROR `row-level security` | ĐẠT |
| B4.2 | Tự ủy quyền `house_head` cho mình | `INSERT role_delegations(delegate=b1)` | ERROR `Người ủy quyền không giữ vai trò…` | ĐẠT |
| B4.3 | Đọc password_hash / refresh_tokens / mfa của người khác | `SELECT password_hash FROM users…`; `… refresh_tokens`; `… user_mfa_factors` | ERROR `permission denied` cả ba | ĐẠT (GRANT theo cột/bảng) |
| B4.4 | Tự kích hoạt / đổi email / mở khóa tài khoản mình | `UPDATE users SET status='active', email=…, locked_until=NULL WHERE id=b1` | ERROR `BR-AUTH-07` | ĐẠT (trigger `tg_users_guard`) |
| B4.5 | Sửa sổ cái trực tiếp | `UPDATE ledger_entries SET amount_vnd=…` | ERROR `permission denied` | ĐẠT (REVOKE UPDATE) |
| **B5.1** | **Giả mạo ngữ cảnh**: b1 tự đổi `app.current_user_id` sang a2 | `SELECT set_config('app.current_user_id','<a2>',true)` rồi đọc | `current_user_id()`→a2, `has_permission('member.private.read')`→**true**, `member_private_details`→**1 dòng** | **D‑001 — chiếm danh tính qua GUC** |
| B5.2 | Quên gắn user → có thành "hệ thống"? | xóa GUC, giữ role luuxa_app | `is_system_caller()=false`, dữ liệu nhạy cảm **0 dòng** | ĐẠT (fail‑safe) |
| B6 | Trưởng nhà đọc hồ sơ Công giáo **khi chưa có consent chia sẻ** | `SELECT count(*) FROM catholic_profiles WHERE member_id=b2` dưới a2 | **0** (catholic) | ĐẠT — consent gate ở RLS |
| B6′ | …`member_sacraments` cùng điều kiện | `SELECT count(*) FROM member_sacraments …` | **1** | **D‑009** — bí tích KHÔNG bị chặn bởi consent gate như hồ sơ Công giáo |
| B7.1/E7 | luuxa_app gọi pgcrypto | `has_function_privilege('luuxa_app','public.hmac…')` | **true** (hmac/digest/pgp_sym_*/gen_random_bytes/crypt đều PUBLIC) | **D‑005** (gia cố) |
| B7.2 | luuxa_app gọi `fn_qr_mac` (giả MAC điểm danh) | `has_function_privilege('luuxa_app','app.fn_qr_mac…')` | **false** | ĐẠT |
| B8 | luuxa_app ghi / worker sửa‑xóa audit_logs | `INSERT` (app); `UPDATE/DELETE` (worker) | app: `permission denied`; worker: `permission denied` | ĐẠT (xem D‑006 về superuser) |
| B9 | Xóa mềm thành viên có dữ liệu | `UPDATE members SET status='left'…` dưới a2 | user→`disabled`, phiên→0, phòng đóng; **CCCD/Công giáo vẫn còn, nid_last4='0000'** | một phần ĐẠT (xem D‑003) |
| B9.2 | Có hàm ẩn danh hóa? | `SELECT count(*) … proname ILIKE '%anonymi%'` | **0** | **D‑003** (THIẾU) |
| E1 | Thành viên đọc SĐT người khác dù `hide_phone=true` | `SELECT contact_phone_e164 FROM members WHERE id=b2` dưới b1 | **trả về số + email** (hide_phone bị bỏ qua) | **D‑004** |
| E3 | Thành viên đọc tổng hợp quỹ | `app.fn_finance_summary(...)` | trả JSON tổng hợp (0đ, chưa có dữ liệu) | ĐẠT (thiết kế: tầng "công khai nội bộ") |
| E4 | Thành viên đọc thống kê học tập | `app.fn_academic_aggregate(...)` | ERROR `Không có quyền…` | ĐẠT |
| E5 | Thành viên đọc `login_attempts` | `SELECT count(*)…` | 0 | ĐẠT |
| E9 | Thành viên đọc `storage_files` của người khác | `SELECT count(*) FROM storage_files` | 0 | ĐẠT |

Bất biến nền (từ bộ smoke test S2/S12e3, chạy lại OK): mọi bảng nghiệp vụ **ENABLE + FORCE RLS**;
`luuxa_app` **không** BYPASSRLS/superuser, **không** CREATE trên schema `public`/`app`; **174** hàm schema `app`
**0 hàm còn EXECUTE cho PUBLIC**; **0** hàm SECURITY DEFINER thiếu `SET search_path`; 0 hàm DEFINER ngoài schema `app`.

---


### ⑤.4 Kịch bản nghiệp vụ & kiểm soát nội bộ đã chạy (Bước 4)

#### Kịch bản đã chạy

Ký hiệu: Đúng = DB hành xử đúng nghiệp vụ; **Sai** = DB cho phép điều nghiệp vụ cấm (hoặc chặn điều cần làm). Nhãn khớp NOTICE trong `F_tests.sql`.

| Kịch bản | Kết quả | Đúng/Sai |
|---|---|---|
| A1–A3 Trưởng nhà lập phiếu 500.000 đ (1 chữ ký): Thủ quỹ / Phó nhà / Trưởng nhà ký | BR-FIN-17 / BR-FIN-02 / BR-FIN-01 — phiếu kẹt `pending_approval` | **Sai** (N-01) |
| A4–A5 Thành viên lập, Trưởng nhà là người ứng tiền 500k | Thủ quỹ, Phó nhà đều bị chặn — kẹt | **Sai** (N-01) |
| B 5 phiếu × 200.000 đ cùng người nhận cùng ngày, Thủ quỹ duyệt + chi | 1.000.000 đ đã chi, 0 chữ ký Trưởng nhà | **Sai** (N-18, đã ghi nhận) |
| B2 2 phiếu × 999.999 đ | mỗi phiếu `required_approvals = 1` | **Sai** (N-18) |
| C1–C3 Thủ quỹ tự ủy quyền `treasurer` cho m2 → m2 duyệt phiếu hoàn ứng của Thủ quỹ → Thủ quỹ tự chi | cả 3 OK; `approved_by` của ủy quyền NULL | **Sai** (N-02) |
| D1 Admin gọi `fn_decide_expense` | "Không có quyền duyệt chi." | Đúng |
| D2 Admin tự gán `house_head` | vi phạm RLS `user_roles` | Đúng |
| D3 Admin thêm `finance.expense.approve` vào vai trò admin | permission denied `role_permissions` | Đúng |
| D4 Admin nâng ngưỡng 2 chữ ký | lệnh chạy nhưng 0 dòng (giá trị vẫn 1.000.000) | Đúng |
| D5 Admin đổi email Trưởng nhà | OK (đã ghi nhận BR-AUTH-22, dòng 305) | Sai đã ghi nhận |
| E1 Ghi điều chỉnh vào kỳ 08/2026 đã chốt | BR-FIN-06 chặn | Đúng |
| E2 Trưởng nhà ghi điều chỉnh chi 3tr ngày 04/06/2026 (trước kỳ đã chốt, tháng chưa có dòng kỳ) | OK, tạo kỳ 06/2026 `open` | **Sai** (N-03) |
| E3 Thủ quỹ ghi chi phiếu duyệt 03/10 với `paid_on` 06/07/2026 | OK; kỳ 07/2026 tạo mới | **Sai** (N-03, N-19) |
| E kiểm số dư kỳ đã chốt 08/2026 | ảnh chụp 8.000.000 vs sổ cái 4.850.000; số dư đầu kỳ tính lại −3.150.000 | **Sai** (N-03) |
| F1 (superuser tắt trigger) đổi `counterparty_member_id`, `created_by` | `fn_verify_ledger_chain`: nguyên vẹn | **Sai** (N-04) |
| F2 tăng số dư đầu kỳ 8tr→18tr rồi tính lại chuỗi + `funds.head_hash` | nguyên vẹn; số dư 14.850.000 | **Sai** (N-04) |
| F3 `luuxa_owner` (không superuser) `ALTER TABLE ledger_entries DISABLE TRIGGER` | OK | **Sai** (N-04) |
| G1–G2 Trưởng nhà một mình nâng hạn mức Thủ quỹ và ngưỡng 2 chữ ký lên 50tr | OK (giới hạn cấu hình 0..1 tỷ) | **Sai** (N-16) |
| G3–G4 Phiếu 9tr: Thủ quỹ một mình duyệt và chi | `paid`, 1 chữ ký | **Sai** (N-16) |
| H1 Thủ quỹ INSERT khoản phải thu 0 đ cho m1 | OK → `waived`, `discount_approved_by` NULL | **Sai** (N-05) |
| H2 Thủ quỹ INSERT khoản phải thu 1.000 đ | OK, `fn_generate_contributions` giữ nguyên | **Sai** (N-05) |
| H3 Thủ quỹ đặt `discount_vnd` | BR-FIN-14 chặn | Đúng |
| I1 Thủ quỹ chuyển `alumni` | user active, vai trò treasurer còn, `finance.expense.pay = true` | **Sai** (N-14, đã ghi nhận BR-MEM-18) |
| I2 Thu hồi vai trò Thủ quỹ; m2 đang được ủy quyền | m2 vẫn `finance.expense.pay = true` | **Sai** (N-07) |
| AC1 Cùng quá trình 3,0 / cuối kỳ 9,0: nhập đủ vs bỏ trống quá trình | 6,6 C+ vs **9,0 A+** | **Sai** (N-11) |
| AC2 Quá trình 2,0 / cuối kỳ 2,0 / chính thức tự khai 9,5 | A+ | **Sai** (N-11) |
| AC3 Biên: 8,0/8,75 → 8,5; 7,0/7,0; 3,95/3,95 | A; B; 4,0 → D (đạt) | Đúng theo thang |
| AC3b Thiếu điểm cuối kỳ | bị chặn nhưng thông báo "chưa có bậc điểm chữ… cho điểm NULL" | Sai thông báo (N-11) |
| AC4 GPA hệ 4 thật 3,595 | lưu 3,60 → "Xuất sắc" | **Sai** (N-13) |
| AC5 Admin kỹ thuật sửa bậc A 8,5→8,7 trên thang đang dùng | OK; cùng bảng điểm 8,5 → A (cũ) và B+ (mới) | **Sai** (N-12) |
| AC7 Chủ bảng điểm submitted → draft | OK (phải nộp/xác minh lại) | Đúng |
| AC8 m2 / Trưởng nhà (chưa có đồng ý) đọc điểm m1 | 0 dòng / 0 dòng | Đúng |
| M2 Sửa điểm lần 2 | GPA tính lại; `audit_logs` 2 dòng | Đúng |
| D1 (trực nhật) Khiếu nại được chấp nhận | ca approved; điểm m1: `duty_rework −1` vẫn giữ + `duty_approved +9` | Sai đã ghi nhận (BR-DUTY-25) |
| D2a Trưởng nhà thuộc ca gọi `fn_decide_review_appeal` cho khiếu nại của mình | BR-DUTY-28 chặn | Đúng |
| D2b Trưởng nhà UPDATE trực tiếp khiếu nại của mình → upheld | OK; ca vẫn `rework_required` | **Sai** (N-10) |
| D3 Ca `missed` (−5) sau đó được miễn `excused` | −5 vẫn giữ | Sai đã ghi nhận (BR-DUTY-16 liên quan) |
| D4 Ảnh không EXIF, `client_captured_at = now()` do client khai | check-in OK | Sai đã ghi nhận (dòng 1448 #11) |
| D5 m4 rời lưu xá | còn 1 ca tương lai mang tên m4 | **Sai** (N-14) |
| M1 Đơn nghỉ dài ngày được duyệt sau khi xếp ca | ca vẫn `scheduled`, m1 vẫn trong danh sách | Sai đã ghi nhận (dòng 1443 #6) |
| Q1a–b Điểm danh QR từ Hà Nội (1.143 km) với phiên có geofence 150 m; m1, m2 cùng `device_hash` | cả hai `present` | **Sai** (N-06; phần thiết bị đã ghi nhận) |
| Q1 Quyền đọc `qr_sessions.secret` | luuxa_app: không; luuxa_readonly: không; luuxa_worker: có | Đúng (worker tin cậy) |
| BR-EVT-04a/b token 2 slot trước / MAC giả | chặn | Đúng |
| BR-EVT-11a/b phiên QR active thứ 2 / thành viên lấy token | chặn / chặn | Đúng |
| L1 m1 giữ 2 máy cùng khung giờ | OK | Quan điểm (N-15) |
| L2a–b hạn mức 3 lượt/tuần | lượt 4 bị BR-LAU-03 | Đúng (tuần tự) |
| L2c–d m1 tự đặt `no_show` cho lượt chưa tới giờ rồi đặt lượt 4 | OK / OK | Sai đã ghi nhận (BR-LAU-12) |
| L3 Máy chuyển bảo trì; m2 rời lưu xá | 3 lượt và 1 lượt tương lai vẫn `booked` | Sai đã ghi nhận (BR-LAU-17) / **Sai** (N-14) |
| L4a Đặt 12:00–14:00 (ngoài slots) | BR-LAU-01 chặn | Đúng |
| L4b Đặt 06:00–08:00 gửi bằng giờ UTC 23:00 hôm trước | OK (cùng thời điểm tuyệt đối) | Đúng (múi giờ) |
| P1 Poll 1 lựa chọn: INSERT 2 phương án tuần tự | lần 2 BR-EVT-08 chặn | Đúng |
| P2 Mở lại poll đã đóng | máy trạng thái chặn | Đúng |
| C1 (đồng thời) 2 người đặt cùng máy cùng khung | 1 OK, 1 lỗi EXCLUDE | Đúng |
| C2 (đồng thời) m2 có 2 lượt, đặt thêm 2 lượt song song | 4 lượt/tuần | **Sai** (N-09, đã ghi nhận) |
| C3 (đồng thời) m1 INSERT trực tiếp 2 phương án poll 1 lựa chọn | 2 phiếu | **Sai** (N-08) |
| C4 (đồng thời) Trưởng nhà + Thủ quỹ duyệt phiếu 1 chữ ký | 1 chữ ký, người sau bị từ chối | Đúng |
| C5 (đồng thời) Trưởng nhà + Thủ quỹ duyệt phiếu 2 chữ ký | approved, 2 chữ ký | Đúng |
| C6 (đồng thời) chi 2 phiếu 2tr khi quỹ còn 3tr | 1 OK, 1 BR-FIN-07; số dư 1tr | Đúng |
| C7 (đồng thời) ghi chi trùng 1 phiếu | 1 bút toán | Đúng |
| 28 kiểm tra BR-… (khối t_br) | xem mục kiểm mẫu | 27 Đúng (gồm MEM-09c được phép đúng), 1 quan điểm (MER-05c) |
| Chạy lại `60_smoke_tests.sql` (bản gốc) | toàn bộ S2…S14 OK | Đúng |
| K8: áp FX-01…FX-16 rồi chạy lại kịch bản tấn công | các kịch bản Sai ở trên đều bị chặn; luồng hợp lệ vẫn OK (FX-01a/b, FX-04b, FX-06b, FX-08b, FX-15d, FX-16b) | — |
| Hồi quy: FX-01…16 + smoke 60 (bỏ FX-10, FX-14) | toàn bộ S2…S14 OK | — |

---


---


## ⑥ BẢN SỬA LỖI (PATCH SET)

### ⑥.1 Giả định, thứ tự chạy, cách đã kiểm chứng

**Giả định (cần xác nhận):** DB theo thiết kế **chưa** được triển khai có dữ liệu thật (tài liệu lập ngày 03/10/2026, chưa có mã backend). Vì vậy bản sửa được đóng gói thành **migration chạy sau file 52**, giữ nguyên 37 file gốc để đối chiếu; mọi file vá chạy lại nhiều lần không lỗi (idempotent). Nếu DB đã có dữ liệu thì xem lưu ý ở F-044 (đổi công thức chuỗi băm) trước khi chạy file 75.

**Thứ tự chạy** (`psql -X -v ON_ERROR_STOP=1 -f`, tài khoản migrator/superuser):

```bash
for f in sql/[0-5][0-9]_*.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$f" || exit 1; done   # 01…52 của tài liệu, nguyên văn
for f in kiem-dinh/sql/7[0-5]_*.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$f" || exit 1; done   # 70…75 của kiểm định
psql -X -q -v ON_ERROR_STOP=1 -f kiem-dinh/sql/60_smoke_tests_reviewed.sql                      # chỉ DB dev/CI, tự ROLLBACK
(cd kiem-dinh/tests && npm i pg && PGDATABASE=<db_ci_riêng> node 80_concurrency_tests.js)          # chỉ DB CI riêng: COMMIT dữ liệu thử
```

| File | Dòng | Nội dung | Kiểm chứng đã chạy (PostgreSQL 16.14) |
|---|---|---|---|
| `70_review_fixes_ddl.sql` | 660 | Quyền schema của `luuxa_owner`; job phân vùng an toàn; thứ tự khóa sổ cái/chốt sổ; khóa chống race (phòng, bỏ phiếu, hạn mức giặt); điểm thiếu cuối kỳ; mở lại bảng điểm đã xác minh; xóa mềm sau khi rời; FK giữ bằng chứng đồng ý | T01–T09 của `80_concurrency_tests.js`: DB gốc **FAIL 10/10** → DB vá **PASS 10/10** |
| `71_review_fixes_ai.sql` | 116 | Cổng AI: đóng khi thiếu ngân sách tháng, trần riêng theo tác vụ, bắt buộc nêu chủ thể khi cần đồng ý | `tests/ai_gate.sql`: DB gốc 3/3 job lọt `queued` → DB vá: chặn, tự tạo ngân sách, chặn |
| `72_review_fixes_security.sql` | 204 | Thu hồi hàm "oracle"; tối thiểu đặc quyền pgcrypto; trigger bất biến `ENABLE ALWAYS`; che email/SĐT trong audit; người tự báo cáo không lộ được tác giả ẩn danh; **hàm ẩn danh hóa + job thời hạn lưu trữ** | `tests/sec_check.sql`: 5/5 đạt (oracle bị từ chối; ẩn danh hóa xóa CCCD/Công giáo/bí tích, giữ bằng chứng đồng ý, khóa tài khoản) |
| `73_review_fixes_api.sql` | 329 | 15 lệch API ↔ RLS/GRANT (đổi email tài khoản đặc quyền, phiên "của tôi", cột người xác minh, cấu hình bảo mật, vai trò webhook, kết quả poll ẩn danh, CCCD/lý do phân phòng theo cột, dòng tiền, audit event, báo cáo vi phạm, đầu vào AI) | `tests/api_check.sql`: Admin không đổi được email Trưởng nhà; đổi email Thủ quỹ xóa dấu xác minh; client tự khai `succeeded`/chi phí bị đặt lại `queued`/0 |
| `74_review_fixes_coverage.sql` | 105 | View chức danh hiện hành; 14 khóa cấu hình FE cần; bộ đếm bình luận/ảnh chỉ tính bản ghi hiển thị; giá trị mặc định cấu hình | `tests/cov_check.sql`: bình luận xóa mềm ⇒ bộ đếm 1 → 0 |
| `75_review_fixes_business.sql` | 597 | 16 bản vá nghiệp vụ: bế tắc duyệt, tự duyệt qua ủy quyền, ghi lùi ngày, miễn quỹ 0 đ, ủy quyền dây chuyền, khiếu nại tự quyết, thang điểm bất biến khi đã dùng, xếp loại GPA chưa làm tròn, geofence bắt buộc khi có tọa độ, trần ngưỡng tài chính, ngày chi ≥ ngày duyệt, cảnh báo tách phiếu, chuỗi băm phủ mọi cột, chặn `ALTER` bảng bất biến; hợp nhất 3 hàm bị hai luồng cùng sửa | T10–T12 (DB gốc FAIL → vá PASS) + `tests/biz_check.sql` 5/5 đạt (trên DB gốc ca N-01 tái hiện bế tắc) |
| `60_smoke_tests_reviewed.sql` | 3.858 | Smoke test của tác giả, đổi **đúng 4 chỗ** vốn mã hóa hành vi hở (xem ⑦.1) | Xanh S2→S14 trên DB 01…52 + 70…75; bản gốc vẫn xanh trên DB 01…52 |

Toàn bộ chuỗi 01…52 → 70…75 đã chạy **hai lần liên tiếp** trên cùng DB (kiểm idempotent), sau đó smoke test rà soát và bộ 13 ca đa phiên đều xanh; không còn hàm `app.*` nào EXECUTE cho PUBLIC.

### ⑥.2 Sửa nhỏ — TRƯỚC → SAU

| ID | Vị trí | TRƯỚC | SAU |
|---|---|---|---|
| F-026 | `49_b_grants.sql` dòng 8 (tài liệu dòng 19832) | `GRANT USAGE ON SCHEMA app TO luuxa_app, luuxa_worker, luuxa_readonly, luuxa_auth, luuxa_definer;` | `GRANT USAGE ON SCHEMA app TO luuxa_app, luuxa_worker, luuxa_readonly, luuxa_auth, luuxa_definer, luuxa_owner;` |
| F-027 | `49_b_grants.sql` (thêm) + `12_tables_platform.sql` dòng 37–42 | 6 lệnh `CREATE TABLE audit_logs_2026_10 … audit_logs_2027_03 PARTITION OF audit_logs …` viết cứng; `luuxa_owner` không có `CREATE` trên `public` | `GRANT USAGE, CREATE ON SCHEMA public TO luuxa_owner;` và thay 6 lệnh cứng bằng `SELECT app.ensure_monthly_partitions('public.audit_logs'::regclass, 6);`; `fn_housekeeping` gọi `app.fn_ensure_audit_partitions_safe()` (bắt lỗi riêng) |
| F-029 | `tg_room_assignment_rules` dòng đầu thân hàm | (không khóa) | `PERFORM pg_advisory_xact_lock(hashtextextended('room_assign:' \|\| NEW.room_id::text, 0));` |
| F-030 | `tg_poll_vote_rules` dòng đầu thân hàm | (khóa chỉ nằm trong `fn_cast_vote`) | `PERFORM pg_advisory_xact_lock(hashtextextended('poll_vote:' \|\| NEW.poll_id::text \|\| ':' \|\| NEW.member_id::text, 0));` |
| F-033 | `members` | (không ràng buộc) | `ALTER TABLE members ADD CONSTRAINT ck_members__deleted_requires_left CHECK (deleted_at IS NULL OR status IN ('left', 'alumni'));` |
| F-034 | `consents`, `data_subject_requests`, `policy_acknowledgements`, `poll_votes` | `FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE` | `… ON DELETE RESTRICT` (xóa dữ liệu cá nhân bằng `app.fn_anonymize_member`, không xóa cứng) |
| F-067 | `49_b_grants.sql` | `luuxa_auth` có `INSERT` trên `user_roles` | `REVOKE INSERT ON user_roles FROM luuxa_auth;` |
| F-078 | `mv_cashflow_monthly` | ACL thực `luuxa_app=arwd` | `REVOKE ALL ON mv_cashflow_monthly FROM luuxa_app;` + đọc qua `app.fn_cashflow_monthly(from, to, fund)` |
| F-108 | pgcrypto | `EXECUTE` mặc định cho PUBLIC | `REVOKE … FROM PUBLIC`; cấp lại `digest`, `gen_random_bytes` cho vai trò cần; `hmac` chỉ `luuxa_definer` |
| F-045 | `qr_sessions` | `require_geofence boolean NOT NULL DEFAULT false`, không ràng buộc | `CHECK (geofence_lat IS NULL OR require_geofence)` + `UNIQUE (event_id, device_hash) WHERE device_hash IS NOT NULL AND method = 'qr'` |

**Sửa câu chữ trong tài liệu (không phải SQL)**

| ID | Dòng tài liệu | TRƯỚC | SAU |
|---|---|---|---|
| F-028 | 37134 | "Không điểm nào cho phép vượt qua các bất biến về tiền: sổ cái bất biến, chốt kỳ hai người và phiếu chi hai chữ ký đều đã được kiểm thử đối kháng" | "Các bất biến về tiền đã được kiểm thử đối kháng **trong một phiên**; kiểm định độc lập phát hiện 4 đường vượt (chi tiền đồng thời lúc chốt sổ, ghi lùi ngày vào tháng trống, tự duyệt qua ủy quyền, miễn quỹ bằng khoản 0 đ) — đã vá ở migration 70/75 và có kiểm thử đa phiên `80_concurrency_tests.js`." |
| F-035 | 142, 12 | "toàn bộ DDL … đã chạy liên tiếp … và vượt bộ kiểm thử S2–S14 (hơn 1.000 khẳng định…)" | Giữ, thêm: "Bộ kiểm thử chạy trong một transaction nên không kiểm được race condition và lỗi quyền phụ thuộc kết nối; CI phải chạy thêm bộ kiểm thử đa phiên." |
| F-002 | 37184 (Self-check) | "✔ … 392 endpoint trong 24 nhóm, 500 DTO; thiếu quyền: 0; thiếu response: 0" | "✘ 392 endpoint có quyền tối thiểu; **chỉ 1/402 DTO có định nghĩa trường** — schema request/response chưa đạt (F-059)" |
| F-005 | 37189 (Self-check) | "✔ … quét văn bản ngoài khối mã: 0 mẫu bị cấm" | "✘ 27 ô bảng bị cắt giữa câu bằng '…', 2 ô 'Như trên', 3 cụm 'và tương tự', 8 cột giả trong ERD" |
| F-138 | 144, 37185 | "373 hạng mục sửa Frontend"; "741 hạng mục (349 BL, 373 FX, 26 AI)" | "366 hạng mục FX cần làm (+ 7 đã xử lý ở 740ac5d)"; "741 hạng mục (349 BL, 366 FX, 26 AI)" |
| F-010 | 26360, 26409 | "Thay danh sách giáo phận cứng trong Modals.tsx"; "Chọn giáo phận (`Modals.tsx`) \| Danh sách cứng" | "Phục vụ ô chọn giáo phận MỚI `[ĐỀ XUẤT]` (FE hiện chỉ hiển thị chuỗi `Member.diocese` ở `MemberCVModal.tsx:241-242`)"; "Ô chọn giáo phận `[ĐỀ XUẤT]` \| Chưa có" |
| F-062 | 26417 | "`student_profiles__select` cho mọi `member.read` đọc `student_code`" | "`student_profiles__select` chỉ cho chính chủ và Ban điều hành; danh bạ lấy trường/ngành qua `app.fn_directory_study` (migration 73)" |
| F-106 | 35447, 35465, 35476 | "Hàm `fn_anonymize_member` (BL-MEM-20) ẩn danh hồ sơ…" (mô tả như đã có) | "`app.fn_anonymize_member` + job `app.fn_apply_member_retention` — hiện thực ở migration 72 kiểm định; nâng BL-MEM-20 lên MUST" |
| F-044 | 3226, 2700 | "không UPDATE/DELETE/TRUNCATE (kể cả superuser)… chuỗi băm báo đứt đúng dòng" | "Chặn UPDATE/DELETE/TRUNCATE với mọi vai trò runtime và chủ bảng (event trigger chặn ALTER); superuser vẫn tính lại được cả chuỗi ⇒ phải neo `head_hash` ra ngoài DB hằng ngày" |
| F-047 | 1440 | "#4 … Đã khép (S14)" | "#4 … khép ở `fn_decide_review_appeal`; đường UPDATE trực tiếp đã khép ở migration 75 (thu policy UPDATE)" |
| F-113 | 26484–26492 (6.4.3) | "`moveMemberToRoom` … Không kiểm sức chứa"; "nút Nhân bản `so-do-nha/page.tsx:291`"; "Lưu vị trí phòng (`FloorplanCanvas.tsx:456-466`)" | "chỉ chặn sức chứa phòng ngủ ở client (`store.tsx:251-260`)"; bỏ "nút Nhân bản"; "canvas HEAD là SVG cố định, không dùng x/y/w/h" |

### ⑥.3 Sửa vừa — đối tượng được viết lại toàn bộ (nằm trong file vá, không placeholder)

| File | Đối tượng (viết lại đầy đủ hoặc tạo mới) | Xử lý |
|---|---|---|
| 70 | `app.fn_ensure_audit_partitions_safe()` (mới), `app.fn_housekeeping()`, `app.fn_close_period()`, `app.fn_transfer_funds()`, `app.tg_room_assignment_rules()`, `app.tg_poll_vote_rules()`, `app.tg_laundry_booking_rules()`, `app.tg_academic_record_rules()`, ràng buộc `ck_grade_records__has_score`, `ck_members__deleted_requires_left`, 4 FK | F-026, F-027, F-028, F-029, F-030, F-031, F-032, F-033, F-034, F-036, F-037 |
| 71 | `app.ensure_ai_budget_month()` (mới), `app.tg_ai_job_gate()`, `app.tg_ai_job_usage()`, khóa `ai.monthly_budget_default_vnd` | F-114, F-115, F-061 |
| 72 | `app.fn_reveal_prayer_author()`, `app.fn_anonymize_member()` (mới), `app.fn_apply_member_retention()` (mới), trigger `trg_users__audit`, khóa `privacy.left_member_retention_days` | F-060, F-105, F-106, F-108, F-109, F-044 |
| 73 | `app.is_privileged_user()`, `app.tg_users_guard()`, `app.tg_content_report_rules()`, `app.tg_ai_job_input_guard()`, `app.tg_ai_job_provider_guard()`, `app.tg_academic_record_verifier_cols()`, `app.fn_poll_results()`, `app.fn_revoke_user_sessions()`, `app.fn_directory_study()`, `app.fn_national_id_cipher()`, `app.fn_room_assignment_reasons()`, `app.fn_cashflow_monthly()`, `app.fn_audit_event()`; policy `auth_sessions__*__own`; vai trò `luuxa_webhook` + 3 policy; quyền `security.settings.write` | F-058, F-060, F-061, F-063, F-064, F-066, F-067, F-068, F-069, F-070, F-074, F-076, F-077, F-078, F-079, F-080 |
| 74 | `v_member_current_position`, 14 khóa `settings`, `app.tg_adjust_counter_visible()` + 2 trigger bộ đếm, cột `settings.default_value` | F-011, F-012, F-013, F-014, F-015, F-019 |
| 75 | `app.tg_expense_voucher_head_conflict()`, `app.tg_expense_approval_delegation_sod()`, `app.tg_user_roles_cascade_delegations()`, `app.tg_ledger_entry_no_backdate()`, event trigger `evt_protect_immutable_tables`, `app.tg_contribution_amount_from_plan()`, `app.tg_laundry_noshow_guard()`, `app.fn_scale_in_use()` + 2 trigger khóa thang, `app.fn_recompute_gpa()`, `app.tg_settings_finance_invariants()`, `app.tg_ledger_expense_date_guard()`, `v_expense_split_alerts`, và **3 hàm hợp nhất** `app.tg_ledger_entry_before_insert()`, `app.tg_grade_record_compute()`, `app.tg_member_leave_effects()`, `app.fn_verify_ledger_chain()` | F-040, F-041, F-042, F-043, F-044, F-045, F-046, F-047, F-048, F-049, F-050, F-052, F-053, F-054, F-055, F-028, F-031, F-033 |

**Hai lỗi do chính bản vá của các luồng con, đã được kiểm định viên chính phát hiện và sửa khi hợp nhất:** (1) bản vá AI-input của luồng API có chú thích `--` nuốt mất `NEW.tokens_in := 0; NEW.tokens_out := 0; NEW.cost_vnd := 0;` nên client vẫn tự khai chi phí — đã tách dòng và kiểm lại; (2) bản vá điểm số của tôi (G-07) ban đầu giữ quy tắc ngầm "thiếu điểm quá trình ⇒ cuối kỳ 100%" mà luồng nghiệp vụ chứng minh là lách được (C+ thành A+) — hàm hợp nhất ở file 75 xử lý cả hai.

### ⑥.4 Sửa lớn — phần phải viết lại ở mức đặc tả (không vá được bằng SQL)

- **F-059 (DTO của Phần 6).** Nguồn `api/schemas_*.yaml` mà tài liệu viện dẫn không có trong tài liệu, nên không thể viết lại 402 DTO "từ tài liệu" mà không bịa. Đã làm: khuôn DTO bắt buộc (Trường · Kiểu · Bắt buộc · Ràng buộc · Cột DB/dẫn xuất) và **3 DTO viết đầy đủ** (`CreateExpenseDto`, `LoginDto`, `CreateLaundryBookingDto`) ở Phụ lục C.1 của `kiem-dinh/bang-chung/C_api.md`; đặc tả viết lại cho 11 nhóm endpoint bị hở (C.2–C.12: đổi email có xác minh, báo cáo vi phạm, tác vụ AI, phiên đăng nhập, bảng ánh xạ lỗi thống nhất thay hai bảng mâu thuẫn, kết quả poll ẩn danh, QR, idempotency, xuất tệp bằng POST, GET theo id, quyền chủ thể dữ liệu). Việc còn lại: sinh phụ lục DTO từ YAML và thêm kiểm tra CI "DTO ↔ `information_schema.columns`".
- **F-001 (phạm vi).** Không phải lỗi khách quan; cần Ban điều hành quyết định. Phương án MVP ≈ 50 bảng, 100–120 endpoint, 250–400 người-ngày nằm ở ⑧ và ở `bang-chung/B_cau_truc_nhat_quan.md` mục "Đánh giá tính thực tế". DDL hiện có giữ làm "kho linh kiện".

### ⑥.5 Không sửa (và lý do)

| ID | Lý do không vá |
|---|---|
| F-104 | Chiếm danh tính qua `set_config('app.current_user_id')` khi đã có SQL injection: giới hạn cố hữu của RLS dựa GUC, tài liệu đã chấp nhận ở B.3. Giảm thiểu ở tầng ứng dụng (tham số hóa tuyệt đối, chặn multi-statement, kiểm thử injection) |
| F-051 | Bút toán điều chỉnh do một người: cần chọn thiết kế (hàng đợi người thứ hai hay chỉ cho điều chỉnh gắn biên bản đối soát) — quyết định ở ⑧ |
| F-107 | `hide_phone` chưa thực thi ở DB: cần view danh bạ và đổi hợp đồng API (BL-MEM-20); thay đổi thiết kế, không phải một dòng |
| F-025 | Bảng cho phân hệ Bếp & Cơm (đang tạm hoãn): SQL đã thử nằm ở `bang-chung/A_do_phu_FE_DB_API.md`, chỉ áp khi bật lại phân hệ |
| F-127 | Quan điểm về giá trị của tầng LLM — quyết định đầu tư |
| Các S3 về văn bản/trình bày | Sửa trực tiếp trong tài liệu theo cột "Cách sửa" của ③; không ảnh hưởng vận hành |
| F-110, F-111 | Kiểm MIME bằng magic bytes, giới hạn dung lượng thực tế, dọn tệp đã gỡ — thuộc worker/S3 policy; đặc tả đã có ở Phần 5, cần kiểm thử tích hợp khi có mã |

---

## ⑦ BỘ KIỂM THỬ SAU KHI SỬA

### ⑦.1 Smoke test của tác giả, bản đã rà soát (`kiem-dinh/sql/60_smoke_tests_reviewed.sql`)

Giữ nguyên 3.853 dòng, chỉ đổi 4 chỗ mà bản gốc **khẳng định đúng hành vi hở**:

| Dòng gốc | Bản gốc khẳng định | Bản rà soát khẳng định | Lý do |
|---|---|---|---|
| 366–367 (S5) | (không kiểm vai trò sau khi rời) | Rời lưu xá ⇒ `liturgy_lead` bị thu hồi; tái nhập cấp lại bằng quyết định mới | F-033 (BR-MEM-18) |
| 824 (S8) | `r.votes = 1` với poll ẩn danh đang mở | `r.votes IS NULL AND r.voters = 1` | F-069: số phiếu từng phương án theo thời gian thực làm lộ lựa chọn |
| 1046 (S10b) | Admin kỹ thuật sửa được `auth.lockout_minutes` (1 dòng) | 0 dòng | F-066: Admin không tự hạ cấu hình bảo mật/MFA |
| 2122 (S11e) | Bộ đếm bình luận = 1 sau khi xóa c2 (c1 đã bị ẩn) | = 0 | F-014: bộ đếm loại bình luận ẩn/xóa (BR-COM-31 của chính tài liệu) |

### ⑦.2 Bộ kiểm thử đa phiên (`kiem-dinh/tests/80_concurrency_tests.js`) — 13 ca, mỗi request là một kết nối mới

| Ca | Phát hiện | Phải thất bại trên DB gốc vì | DB gốc | DB đã vá |
|---|---|---|---|---|
| T01 | F-026 | Phó nhà xếp phòng trên kết nối mới ⇒ `permission denied for schema app` | FAIL | PASS |
| T01b | F-026 | Superuser ghi `consents` trên kết nối mới ⇒ cùng lỗi | FAIL | PASS |
| T02 | F-027 | Worker tạo phân vùng ⇒ `permission denied for schema public` | FAIL | PASS |
| T03 | F-029 | 2 phiên xếp giường cuối ⇒ 3 người/phòng 2 chỗ | FAIL | PASS (2) |
| T04 | F-036 | 2 lượt giặt song song ⇒ 4/3 | FAIL | PASS (3) |
| T05 | F-030 | 2 INSERT song song poll 1 lựa chọn ⇒ 2 phiếu | FAIL | PASS (1) |
| T06 | F-028 | Chi tiền lúc đang chốt sổ ⇒ snapshot 1 ≠ sổ cái 2 | FAIL | PASS (bị chặn BR-FIN-06) |
| T07 | F-031 | Lưu điểm giữa kỳ trước ⇒ lỗi `<NULL>` | FAIL | PASS |
| T08 | F-032 | Chính chủ mở lại bảng điểm đã xác minh | FAIL | PASS (BR-ACAD-18) |
| T09 | F-033 | Xóa mềm hồ sơ đang ở, tài khoản vẫn active | FAIL | PASS |
| T10 | F-040 | Người được Thủ quỹ ủy quyền duyệt phiếu của Thủ quỹ | FAIL | PASS (BR-FIN-35) |
| T11 | F-041 | Ghi bút toán vào tháng trống trước kỳ đã chốt | FAIL | PASS (BR-FIN-06) |
| T12 | F-042 | Thủ quỹ chèn khoản phải thu 0 đ ⇒ `waived` | FAIL | PASS (BR-FIN-14) |

### ⑦.3 Kịch bản SQL kiểm chứng từng nhóm vá (tự ROLLBACK)

`tests/ai_gate.sql` (F-061, F-114, F-115) · `tests/sec_check.sql` (F-105, F-106, F-108, F-044) · `tests/api_check.sql` (F-058, F-061) · `tests/cov_check.sql` (F-014) · `tests/biz_check.sql` (F-043, F-046, F-047, F-050, F-055) · `tests/catalog_checks.sql` + `tests/idx.sql` (bất biến lược đồ: CASCADE, `*_id` không FK, unique vỡ khi xóa mềm, `updated_at`, audit, kiểu tiền, SECURITY DEFINER, PUBLIC EXECUTE, FK thiếu index, index trùng) · `tests/dryrun.js` (8 kịch bản ⑤). Trên DB gốc các kịch bản "phải thất bại" đều lọt; trên DB vá đều bị chặn.

### ⑦.4 Checklist kiểm thử API và phân quyền cần chạy khi có mã backend

Mỗi dòng chạy bằng tài khoản thật qua HTTP, kỳ vọng mã lỗi ghi trong ngoặc; nguồn chi tiết là ma trận API ↔ RLS ở ④.

- [ ] Thành viên A gọi `GET/PATCH` tài nguyên của B theo id (phiếu chi, bảng điểm, hồ sơ riêng tư, lượt giặt, phiên đăng nhập) ⇒ 404, không lộ sự tồn tại.
- [ ] Người lập phiếu tự duyệt; người được ủy quyền duyệt phiếu của người ủy quyền; Thủ quỹ duyệt phiếu > hạn mức ⇒ 403/422 theo bảng lỗi thống nhất (C.6).
- [ ] Tách phiếu dưới ngưỡng hai chữ ký ⇒ xuất hiện trong `v_expense_split_alerts`.
- [ ] Admin kỹ thuật đổi email/khóa tài khoản Trưởng nhà hoặc Thủ quỹ ⇒ 403; Trưởng nhà đổi email Thủ quỹ ⇒ trạng thái chờ xác minh, thư báo tới địa chỉ cũ.
- [ ] Đặt lại mật khẩu tới email chưa được chính chủ xác minh ⇒ 422.
- [ ] Admin sửa `auth.*` ⇒ 403; Trưởng nhà sửa ⇒ cần step-up.
- [ ] Mọi thao tác FIN ghi (duyệt, chi, đảo, ghi tay sổ cái, chuyển quỹ, chốt/xác nhận/mở lại kỳ, miễn giảm) ⇒ 403 `STEP_UP_REQUIRED` khi chưa xác thực lại trong 300 giây.
- [ ] Ghi bút toán có `entry_date` thuộc hoặc trước kỳ đã chốt ⇒ 423/409; ghi chi trước ngày duyệt ⇒ 422.
- [ ] Hai request đồng thời: đặt cùng khung giặt (409), bỏ phiếu đôi (1 phiếu), xếp giường cuối (409), chi tiền khi đang chốt sổ (423).
- [ ] `/me/sessions` của Trưởng nhà chỉ trả phiên của chính mình; "đăng xuất thiết bị khác" không thu hồi phiên người khác.
- [ ] Kết quả poll ẩn danh đang mở không trả số phiếu từng phương án (API, SSE).
- [ ] Điểm danh QR: token quá 2 slot, MAC giả, tọa độ ngoài geofence (khi có tọa độ), một thiết bị cho hai tài khoản ⇒ bị từ chối.
- [ ] Xem CCCD đầy đủ: thiếu `member.national_id.read` ⇒ 403; có quyền ⇒ dòng `READ_SENSITIVE` trong audit **trước** khi trả dữ liệu.
- [ ] Báo cáo vi phạm cho id không tồn tại hoặc không nhìn thấy ⇒ 404; người tự báo cáo gọi xem tác giả ẩn danh ⇒ 422.
- [ ] `POST /ai/jobs` trên bản ghi không được xem ⇒ 403; client gửi `status`, `cost_vnd`, `provider` ⇒ bị bỏ qua.
- [ ] Idempotency: gửi `Idempotency-Key` tới endpoint trả bí mật (MFA, CCCD, tác giả) ⇒ 400 `IDEMPOTENCY_NOT_SUPPORTED`.
- [ ] CSRF: mọi POST/PUT/PATCH/DELETE ở chế độ cookie thiếu `X-CSRF-Token` ⇒ 403 (kiểm cả nửa sau Phần 6).
- [ ] Rate limit đăng nhập theo cặp (identifier, IP) ⇒ 429 mà không khóa cả tài khoản Trưởng nhà.
- [ ] Rời lưu xá ⇒ tài khoản bị khóa, phiên bị thu hồi, ca trực và lượt giặt tương lai bị gỡ, vai trò đặc quyền và ủy quyền bị thu hồi; ẩn danh hóa giữ chứng từ tài chính và bằng chứng đồng ý.
- [ ] Upload: tệp > giới hạn ở URL ký, MIME khai sai so với magic bytes, ảnh có GPS ⇒ bị từ chối hoặc bị gỡ EXIF; tệp không gắn sau 24 giờ ⇒ được đánh dấu xóa.

---

## ⑧ DANH SÁCH VIỆC CÒN TỒN ĐỌNG & CÂU HỎI MỞ

### ⑧.1 Điều chưa kiểm chứng được và vì sao

| Hạng mục | Vì sao chưa kiểm được |
|---|---|
| "175 sơ đồ Mermaid 0 lỗi" | Không có trình phân tích Mermaid trong môi trường kiểm định |
| "500 DTO" | Nguồn YAML không có trong tài liệu (F-059) |
| Hành vi trên dịch vụ PostgreSQL managed (giới hạn `CREATE ROLE`, `BYPASSRLS`, event trigger) | Chỉ có bản tự quản 16.14; file 75 dùng event trigger cần superuser — nhiều dịch vụ managed không cho tạo |
| Argon2id tham số, xoay vòng refresh token, rate limit, CSRF, SSE | Thuộc mã backend chưa có; chỉ kiểm được ràng buộc DB (`$argon2id$`, băm SHA-256 token, `reuse_detected_at`) |
| Kiểm MIME bằng magic bytes, gỡ EXIF, quét mã độc, giới hạn dung lượng thật | Thuộc worker và chính sách S3 |
| Đơn giá OCR, nhận dạng giọng nói, tỷ giá | Tài liệu ghi là giả định; không có báo giá |
| Hiệu lực hiện hành của Nghị định 13/2023 sau khi Luật Bảo vệ dữ liệu cá nhân có hiệu lực | Không xác minh được; cần luật sư |
| Hiệu năng, kế hoạch truy vấn, kiểm thử tải | Không có dữ liệu lớn |

### ⑧.2 Quyết định cần Ban điều hành chốt

1. **Phạm vi MVP (F-001).** Đề xuất: ≈ 50 bảng (định danh & phân quyền 4–5 vai trò cố định; hồ sơ + CCCD mã hóa + Công giáo có đồng ý; nhà & phòng; trực nhật; quỹ: sổ cái append-only, phiếu chi hai chữ ký, thu quỹ, chốt sổ; thông báo; sự kiện + điểm danh + biểu quyết; giặt; báo hỏng), 100–120 endpoint, 250–400 người-ngày với 2–3 lập trình viên; RLS chỉ là lớp phòng thủ cho bảng nhạy cảm; hoãn phụ đạo, điểm đóng góp, phụng vụ, bếp/kho, tài sản, đối soát sao kê, chuỗi băm, k-ẩn danh, AI có LLM.
2. **Mở lại bảng điểm đã xác minh (F-032):** chỉ người xác minh mở lại (bản vá hiện tại) hay chính chủ được tự mở nhưng mất dấu xác minh (thiết kế gốc)?
3. **Nhập điểm giữa kỳ trước (F-031, F-048):** cho lưu nháp chỉ có điểm quá trình (bản vá) hay bắt buộc đủ điểm như thiết kế gốc? Môn chỉ thi cuối kỳ: dùng điểm tổng kết chính thức hay thêm cờ `final_only`?
4. **Rời lưu xá / cựu thành viên (F-033):** thu hồi vai trò đặc quyền cả với `alumni` (bản vá) — tái nhập phải cấp lại.
5. **Bút toán điều chỉnh (F-051):** cần người thứ hai xác nhận trên ngưỡng nào?
6. **Ngưỡng tài chính (F-050):** trần cứng đề xuất — Thủ quỹ tự duyệt ≤ 500.000 đ, hai chữ ký từ ≤ 5.000.000 đ, bắt buộc hóa đơn ≤ 1.000.000 đ; đổi trần cần migration.
7. **Biểu quyết ẩn danh (F-069):** ẩn số phiếu từng phương án đến khi đóng (bản vá) hay hiển thị trực tiếp theo ngưỡng k ≥ 5?
8. **QR điểm danh (F-045):** bật geofence mặc định cho sự kiện bắt buộc; có dùng chế độ "ban tổ chức quét mã cá nhân" cho sự kiện quan trọng?
9. **Bot Telegram nhóm (F-013):** giữ bot cấp nhà (thêm 3 khóa cấu hình + endpoint gửi thử) hay chuyển hẳn sang tùy chọn cá nhân?
10. **Thời hạn giữ dữ liệu sau khi rời (F-106):** mặc định 365 ngày rồi ẩn danh hóa — cần luật sư và Ban điều hành xác nhận.
11. **Neo `head_hash` ra ngoài DB (F-044):** gửi email Ban điều hành hay lưu kho WORM hằng ngày?
12. **AI-03 nhắc đóng quỹ (F-117):** bỏ LLM, dùng mẫu cố định (khuyến nghị) hay chỉ cho LLM sinh mẫu có biến?

### ⑧.3 Rủi ro còn lại sau khi áp bản vá

- RLS dựa GUC không chống được kẻ đã chạy được SQL tùy ý dưới `luuxa_app` (F-104) — chống SQL injection ở tầng ứng dụng là điều kiện sống còn.
- Superuser vẫn viết lại được sổ cái và tính lại chuỗi băm — chỉ phát hiện được nếu `head_hash` được neo ra ngoài.
- Hợp đồng DTO chưa có ⇒ rủi ro lệch FE/BE cao nhất ở giai đoạn tích hợp.
- Thay đổi công thức chuỗi băm (file 75) cần migration tính lại chuỗi nếu DB đã có bút toán.
- Event trigger ở file 75 cần superuser; trên dịch vụ managed không cho tạo thì phải thay bằng kiểm soát quy trình (không cấp quyền chủ bảng cho người vận hành).
- Các kiểm tra thuộc service (MIME, EXIF, step-up, rate limit, CSRF, SSE thu hồi phiên tức thời) chưa có mã để kiểm.

---

## ⑨ SELF-CHECK CUỐI CÙNG

- [x] **Mọi phát hiện đều có vị trí, trích đoạn, cách sửa** — 138/138 dòng của ③ có đủ 11 cột (sinh tự động từ 7 bảng nguồn, đã kiểm mỗi dòng đúng 9 ô gốc; 13 cặp trùng được gộp, ghi cả hai mã nguồn).
- [x] **Mọi lỗi S0 và S1 đều có bản sửa đầy đủ ở ⑥ hoặc lý do chưa sửa** — 5/5 S0 có SQL đã kiểm (F-026, F-040, F-041, F-042, F-058); S1: F-027, F-028, F-060, F-061 có SQL đã kiểm; F-059 (DTO) có khuôn + 3 DTO đầy đủ + lý do không viết hết (nguồn YAML không có trong tài liệu); F-001 là quan điểm cần quyết định (phương án ở ⑧.2).
- [x] **Bản sửa không tự tạo lỗi mới** — chuỗi 01…52 → 70…75 chạy hai lần liên tiếp không lỗi; smoke test rà soát xanh S2→S14; bộ 13 ca đa phiên xanh; không còn hàm `app.*` EXECUTE cho PUBLIC; thứ tự phụ thuộc: 70→75 chỉ tham chiếu đối tượng đã có từ 01…52 hoặc tạo ở file trước; tên bảng/cột đối chiếu catalog thật. Hai lỗi phát sinh trong quá trình vá (chú thích nuốt lệnh ở bản vá AI; quy tắc ngầm 100% cuối kỳ) đã được phát hiện và sửa (⑥.3).
- [x] **Không còn placeholder trong phần sửa** — 6 file vá viết đầy đủ từng hàm/trigger/policy; chỗ duy nhất mô tả bằng lời là quy trình tính lại chuỗi băm cho DB đã có dữ liệu (cố ý không tự động vì cần tắt trigger bất biến có biên bản).
- [x] **Đã nêu rõ phần nào chắc chắn, phần nào nghi ngờ/chưa chạy thật** — cột "Chắc chắn/Nghi ngờ" ở ③; ⑧.1 liệt kê những gì chưa kiểm được; mọi khẳng định "đã chạy" trong báo cáo đều có script trong `kiem-dinh/tests` hoặc `kiem-dinh/bang-chung`.
- [ ] **Chưa làm:** đặc tả đầy đủ 402 DTO; kiểm thử end-to-end qua HTTP (chưa có mã backend); kiểm trên dịch vụ PostgreSQL managed.

`[ĐÃ XONG ĐẾN MỤC ⑨ — CÒN LẠI: không còn mục nào của định dạng đầu ra; việc tồn đọng ở ⑧]`
