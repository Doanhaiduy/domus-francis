# Hướng dẫn sử dụng — Lưu Xá Phanxicô

> Bản này được sinh từ cùng nội dung với trang **Hướng dẫn sử dụng** trong ứng dụng (thanh bên → Hướng dẫn sử dụng), nơi có thêm minh họa giao diện. Sửa nội dung ở `src/content/guide.ts` rồi chạy lại `node --experimental-strip-types scripts/docs/export-guide.mjs`.

## Mục lục

1. [Bắt đầu: đăng nhập & làm quen giao diện](#bat-dau) — Mọi người
2. [Thông báo, Lịch & Sự kiện](#lich-su-kien) — Thành viên, Mọi người
3. [Phụng vụ & check-in đi lễ](#phung-vu) — Thành viên, Mọi người
4. [Thu chi: đóng quỹ & tiền điện nước](#dong-quy) — Thành viên, Mọi người
5. [Bếp & Cơm](#bep-com) — Thành viên, Mọi người
6. [Hậu cần, trực vệ sinh & luật nhà](#hau-can) — Thành viên, Mọi người
7. [Diễn đàn, Học tập, Khoảnh khắc & Trợ lý AI](#cong-dong) — Thành viên, Mọi người
8. [Thủ quỹ: quỹ, điện nước, phiếu chi](#thu-quy) — Thủ quỹ
9. [Trưởng nhà: điều hành nhà](#truong-nha) — Trưởng nhà
10. [Nhắc tự động & nhóm Zalo](#zalo-tu-dong) — Trưởng nhà, Admin
11. [Admin: tài khoản, vai trò, phân hệ, hệ thống](#admin) — Admin
12. [Trưởng ban (vai trò tự tạo)](#truong-ban) — Trưởng ban (vai trò tự tạo)
13. [Câu hỏi thường gặp & phím tắt](#hoi-dap) — Mọi người

## Giới thiệu

Ứng dụng quản lý sinh hoạt của Lưu Xá Phanxicô. Mỗi người thấy và làm được những việc theo **vai trò** của mình. Một người có thể giữ nhiều vai trò (ví dụ Trưởng nhà + Thành viên).

- **Thành viên** — Mọi anh em trong nhà: xem thông báo, lịch, đăng ký cơm, lịch trực vệ sinh, luật nhà, đóng quỹ, nhập bảng điểm…
- **Thủ quỹ** — Giữ quỹ: lập kỳ thu quỹ, nhập tiền điện nước, ghi thu, lập/duyệt phiếu chi, sổ quỹ.
- **Trưởng nhà** — Điều hành: duyệt đơn vào nhà, thành viên & phòng ở, trực nhật, đồng ký chi, thông báo, nhắc tự động qua Zalo, cấu hình chung.
- **Admin** — Quản trị hệ thống: tài khoản, vai trò & quyền, ẩn/hiện phân hệ, danh mục, trợ lý AI, nhật ký hoạt động. Admin không duyệt chi, không đổi tài khoản nhận quỹ và không xem dữ liệu nhạy cảm của thành viên.
- **Trưởng ban (vai trò tự tạo)** — Trưởng ban Phụng vụ, Ẩm thực, Truyền thông… do Admin tạo và chọn quyền.

<a id="bat-dau"></a>

## Bắt đầu: đăng nhập & làm quen giao diện

*Dành cho: Mọi người* — Đăng nhập, đổi mật khẩu, nhận biết các khu vực trên màn hình và khai báo tài khoản nhận tiền.

#### Đăng nhập lần đầu

1. **Nhận tài khoản** — Admin hoặc Trưởng nhà gửi cho bạn **email** và **mật khẩu tạm** (gửi riêng, không đăng lên nhóm).
2. **Đăng nhập** — Mở ứng dụng, nhập email và mật khẩu tạm. _(minh họa trong ứng dụng)_
3. **Đổi mật khẩu** — Lần đầu hệ thống bắt buộc đặt mật khẩu mới: **ít nhất 10 ký tự**, nên có cả chữ và số.

> **Quên mật khẩu?** — Nhờ Admin hoặc Trưởng nhà vào **Cài đặt → Tài khoản → Đặt lại mật khẩu**. Bạn sẽ nhận mật khẩu tạm mới và phải đổi ngay khi đăng nhập.

### Làm quen giao diện

#### Máy tính

_[Minh họa giao diện: Giao diện trên máy tính — xem trong ứng dụng]_

- **① Thanh bên trái** liệt kê các phân hệ.
- **② Tìm kiếm nhanh** (phím tắt `Ctrl + K`): mở trang, tìm anh em, tạo nhanh việc.
- **③ Chuông**: thông báo dành cho bạn (ca trực, phiếu chi cần duyệt, phản hồi…).
- **④ Tài khoản**: hồ sơ, đổi mật khẩu, đăng xuất.

#### Điện thoại

_[Minh họa giao diện: Giao diện trên điện thoại — xem trong ứng dụng]_

- **Thanh điều hướng dưới cùng**: các mục chính. Mục không có ở đó nằm trong nút **Thêm**.
- Chạm vào một bài viết/thông báo/thành viên sẽ mở trang chi tiết; bấm **Quay lại** (hoặc nút Back của điện thoại) để trở về.

> **Dùng như một ứng dụng** — Trong trình duyệt điện thoại chọn **Thêm vào màn hình chính** để mở ứng dụng nhanh như app cài sẵn.

> **ℹ️ Lưu ý** — Mục bị làm mờ với nhãn **Bảo trì**: Admin đang tạm ẩn phân hệ đó. Dữ liệu vẫn giữ nguyên, bật lại là dùng tiếp.

#### Khai báo tài khoản nhận tiền của tôi

1. **Mở hồ sơ** _(Thành Viên → Chính tôi)_ — Chọn chính mình để xem hồ sơ; bấm **Sửa hồ sơ** để cập nhật thông tin được phép.
2. **Khai báo tài khoản** _(Hồ sơ → Tài khoản nhận tiền → Khai báo tài khoản)_ — Chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản (có thể tải ảnh QR của ngân hàng).
3. **Xong** — Ứng dụng tự tạo mã **VietQR** để anh em hoặc Thủ quỹ chuyển khoản/hoàn ứng cho bạn nhanh và đúng.

<a id="hoi-dap"></a>

## Câu hỏi thường gặp & phím tắt

*Dành cho: Mọi người* — Những tình huống hay gặp và cách xử lý nhanh.

#### Không thấy một mục trên thanh bên / mục bị mờ “Bảo trì”

Admin đang tạm ẩn phân hệ đó, hoặc vai trò của bạn không có quyền.

#### Bấm nút báo “Không có quyền”

Nhờ Admin kiểm tra vai trò của bạn ở Cài Đặt → Phân quyền & Vai trò.

#### Dữ liệu chưa cập nhật

Tải lại trang (kéo xuống trên điện thoại hoặc `F5`).

#### Quên mật khẩu

Nhờ Admin/Trưởng nhà đặt lại; bạn nhận mật khẩu tạm và đổi ngay khi đăng nhập.

#### Muốn dùng AI

Admin bật trong Cài đặt → Trợ lý AI; lần đầu dùng mỗi người cần bấm đồng ý.

#### Tin Zalo đến muộn hoặc có hai tin gần nhau

Cron gói miễn phí có thể lệch tới ~1 giờ. Hai tin gần nhau thường là hai loại tin khác nhau (vd. sự kiện và lịch nhắc). Admin xem từng tin trong **Tích hợp Zalo → Lịch & lịch sử**.

_[Minh họa giao diện: Phím tắt — xem trong ứng dụng]_

<a id="lich-su-kien"></a>

## Thông báo, Lịch & Sự kiện

*Dành cho: Thành viên, Mọi người* — Đọc thông báo, báo tham dự, điểm danh bằng QR và biểu quyết.

### Thông báo

Vào **Thông báo** để đọc bảng tin. Thông báo có nút **Xác nhận đã đọc** thì bấm để Ban điều hành biết bạn đã nắm.

### Lịch & Sự kiện

Xem lịch tháng, bấm vào ngày để xem sự kiện. Chọn một trong ba trạng thái tham dự:

_[Minh họa giao diện: Thử bấm — đây chỉ là minh họa — xem trong ứng dụng]_

#### Điểm danh sự kiện

1. **Cách 1 — quét mã QR** — Ban tổ chức mở mã QR tại chỗ. Mở camera quét mã, ứng dụng tự ghi nhận bạn có mặt.
2. **Cách 2 — nhập mã 6 số** _(Lịch & Sự kiện → Nhập mã điểm danh)_ — Gõ 6 chữ số đang hiển thị cạnh mã QR (mã đổi liên tục để chống điểm danh hộ).

> **ℹ️ Lưu ý** — Mỗi người chỉ điểm danh cho **chính mình** bằng thiết bị của mình; giờ ghi nhận là giờ máy chủ.

### Biểu quyết

Chọn phương án trong thẻ biểu quyết **trước hạn chót**. Với biểu quyết cho phép, bạn có thể đổi hoặc rút phiếu cho tới khi đóng. Biểu quyết ẩn danh không ai thấy bạn chọn gì.

<a id="phung-vu"></a>

## Phụng vụ & check-in đi lễ

*Dành cho: Thành viên, Mọi người* — Đọc lịch phụng vụ, Lời Chúa, check-in đi lễ và gửi ý cầu nguyện.

### Đọc lịch phụng vụ ngay trên lịch

_[Minh họa giao diện: Ý nghĩa các ô ngày trên Lịch & Sự kiện — xem trong ứng dụng]_

Bấm vào một ngày: khung **Phụng vụ** cho biết tên lễ, bậc lễ, mùa/tuần, năm A/B/C, ngày chay/kiêng thịt, **ý lễ** của nhà và ý cầu nguyện của Giáo hội, cùng **Lời Chúa** (bài đọc, đáp ca, Tin Mừng — bấm để đọc toàn văn; có liên kết bản chính thức của Nhóm Phiên Dịch CGKPV).

### Check-in đi lễ

| Ngày lễ | Bạn cần làm | Minh chứng |
| --- | --- | --- |
| Chúa Nhật | Bấm **Tôi đã đi lễ** | Không cần ảnh |
| Lễ trọng, lễ Bổn mạng, ngày đặc biệt (ngoài Chúa Nhật) | Bấm check-in | **Ảnh** nhà thờ / Thánh lễ bạn dự |

1. **Tìm ngày có ⛪** — Tab **Điểm Danh & Check-in** liệt kê các ngày phải đi lễ trong tháng và trạng thái của bạn.
2. **Check-in đúng hạn** — Được check-in từ **chiều hôm trước** (lễ vọng) đến hạn ghi trên thẻ (mặc định 2 ngày sau lễ).
3. **Chờ Ban Phụng vụ xác nhận** — Nếu **chưa hợp lệ** bạn nhận thông báo kèm lý do và gửi lại ảnh khác.

> **💡 Mẹo** — Ứng dụng **báo trước** khi sắp đến lễ trọng / Bổn mạng / ngày đặc biệt (mặc định trước 7 ngày và hôm trước) và nhắc buổi tối nếu bạn chưa check-in.

### Việc khác ở Phụng Vụ

- **Phân công** — Lịch phụng vụ tuần, phân công đọc sách/giúp lễ/hát; xác nhận nhiệm vụ của mình.
- **Ý cầu nguyện** — Gửi công khai hoặc **ẩn danh** (thật sự ẩn danh — không ai xem được tác giả).
- **Tài liệu phụng vụ** — Nút “📚 Tài liệu phụng vụ”: tìm kinh, lời bài hát, PDF, YouTube (gõ không dấu cũng được).

<a id="dong-quy"></a>

## Thu chi: đóng quỹ & tiền điện nước

*Dành cho: Thành viên, Mọi người* — Xem khoản phải đóng, nộp qua QR và báo “Tôi đã đóng”.

- **Quỹ sinh hoạt** — **600.000 đ/người/năm**, đóng **300.000 đ mỗi kỳ 6 tháng** (mức do Ban điều hành cấu hình).
- **Điện nước** — Tính chung cả nhà mỗi tháng rồi **chia đều** cho người đang ở.

#### Đóng một khoản

1. **Chọn khoản** _(Thu Chi → Các khoản thu)_ — Chọn chip khoản cần xem (“Quỹ T7–T12”, “ĐN T9”…) để biết bạn đã đóng hay chưa. _(minh họa trong ứng dụng)_
2. **Nộp qua QR** — Khoản chưa đóng có nút **Nộp qua QR**: mã QR tài khoản nhận quỹ đã có sẵn **số tiền và nội dung chuyển khoản** — quét bằng app ngân hàng là xong. _(minh họa trong ứng dụng)_
3. **Bấm “Tôi đã đóng”** — Chuyển khoản hoặc đưa tiền mặt xong, bấm nút này để báo. Thủ quỹ/Trưởng nhà đối chiếu rồi **Xác nhận** (hoặc từ chối kèm lý do) — bạn nhận thông báo kết quả.

> **💡 Mẹo** — Có nút sao chép **số tài khoản / số tiền / nội dung** ngay trên cửa sổ QR. Giữ đúng nội dung chuyển khoản để Thủ quỹ đối chiếu nhanh.

Tab **Ma trận đóng quỹ** cho thấy lịch sử các khoản của bạn theo từng kỳ/tháng.

<a id="bep-com"></a>

## Bếp & Cơm

*Dành cho: Thành viên, Mọi người* — Đăng ký hoặc nghỉ ăn trước giờ chốt và góp ý món ăn.

_[Minh họa giao diện: Bật/tắt từng bữa — minh họa — xem trong ứng dụng]_

| Bữa | Giờ chốt mặc định | Sau giờ chốt |
| --- | --- | --- |
| Trưa | **09:00** | Chỉ Ban Ẩm thực sửa được |
| Tối | **15:00** | Chỉ Ban Ẩm thực sửa được |

Bạn cũng có thể **chấm điểm, góp ý món ăn** và tham gia các khảo sát món do Ban Ẩm thực tạo.

<a id="hau-can"></a>

## Hậu cần, trực vệ sinh & luật nhà

*Dành cho: Thành viên, Mọi người* — Xem lịch trực dọn sân, báo hỏng và đọc nội quy.

### Trực vệ sinh sân nhà

Mỗi tuần có **2 bạn** trực dọn dẹp sân nhà. Trưởng nhà xếp lịch và bạn nhận **thông báo** khi được xếp. Hết tuần Trưởng nhà chấm điểm (0–10), nhận xét và có thể yêu cầu trực lại.

_[Minh họa giao diện: Thẻ lịch trực tuần — xem trong ứng dụng]_

#### Báo hỏng

1. **Mở Hậu Cần & Trực** _(Hậu Cần & Trực → Báo hỏng)_
2. **Mô tả sự cố** — Viết ngắn gọn, chọn **vị trí/phòng** và mức độ gấp.
3. **Chụp ảnh và gửi** — Ảnh giúp Ban Hậu cần xử lý nhanh. Theo dõi trạng thái sửa chữa ngay trong thẻ sự cố.

### Luật nhà

Mở ở: **Thông báo → Luật nhà**

Nội quy chia theo mục (giờ giấc, vệ sinh, khách…), có bảng **giờ giấc chung**. Bấm **Tải PDF** để lưu hoặc in. Trưởng nhà/Admin soạn, sửa, sắp xếp từng mục.

<a id="cong-dong"></a>

## Diễn đàn, Học tập, Khoảnh khắc & Trợ lý AI

*Dành cho: Thành viên, Mọi người* — Trao đổi, nhập bảng điểm, xem album ảnh và hỏi trợ lý AI.

- **Diễn đàn** — Tạo chủ đề, bình luận, thích; nội dung vi phạm có thể **báo cáo**.
- **Học tập** — Nhập bảng điểm từng học kỳ kèm ảnh minh chứng; Ban điều hành xác minh.
- **Khoảnh khắc** — Xem/tải album ảnh sinh hoạt của nhà.

### AI nhận xét học tập

_[Minh họa giao diện: Thẻ AI nhận xét kết quả học tập — xem trong ứng dụng]_

> **Riêng tư** — AI so sánh năm học này với năm trước, cần bạn **đồng ý một lần**, và chỉ gửi số liệu đã ẩn danh — không tên, trường, mã sinh viên. Bạn có thể rút lại đồng ý bất cứ lúc nào.

### Trợ lý AI

Nút **Trợ lý AI** (góc dưới) trả lời câu hỏi về nội quy, thông báo, lịch — luôn ghi nguồn.

> **⚠️ Chú ý** — AI chỉ **gợi ý**. Thông tin quan trọng hãy hỏi lại Ban điều hành.

<a id="thu-quy"></a>

## Thủ quỹ: quỹ, điện nước, phiếu chi

*Dành cho: Thủ quỹ* — Lập kỳ quỹ, nhập điện nước, ghi thu, duyệt phiếu chi và xem báo cáo.

#### Tài khoản nhận quỹ (mã QR)

**Thu Chi → Tài khoản nhận quỹ → Khai báo tài khoản + mã QR**

Chọn ngân hàng, nhập số tài khoản, tên chủ tài khoản (có thể tải ảnh QR của ngân hàng). Thành viên sẽ thấy QR có sẵn số tiền + nội dung khi nộp.

> **ℹ️ Lưu ý** — Thủ quỹ và Trưởng nhà sửa được; **Admin không đổi được nơi nhận tiền**.

#### Lập kỳ quỹ (6 tháng/lần)

1. **Mở form lập kỳ** _(Thu Chi → Các khoản thu → Lập kỳ quỹ)_ — Chọn kỳ (ví dụ T7–T12/2026). Mức mặc định 300.000 đ/người, hạn nộp mặc định ngày 15 tháng đầu kỳ, chọn túi quỹ nhận.
2. **Xem trước** — Hệ thống hiện “12 người × 300.000 đ = 3.600.000 đ”. _(minh họa trong ứng dụng)_
3. **Lập kỳ quỹ** — Tạo khoản phải thu cho mọi thành viên đang ở. Mỗi kỳ chỉ lập **một lần**; kỳ chưa ai nộp thì **Hủy** được.

> **💡 Mẹo** — Mức quỹ, số tháng mỗi kỳ, tháng bắt đầu, hạn nộp do Trưởng nhà chỉnh ở **Cài Đặt → Cấu hình chung**.

#### Tiền điện nước hằng tháng

1. **Nhập hóa đơn** — Bấm **Nhập tiền điện nước**, chọn tháng, nhập **tổng tiền điện + nước** của cả nhà.
2. **Chia đều** — Hệ thống chia cho số người đang ở, **làm tròn lên tới 1.000 đ** và cho xem trước (ví dụ 12 người × 155.000 đ, dư 10.000 đ).
3. **Chi trả công ty điện/nước** — Vẫn lập **phiếu chi** như thường (hạng mục Điện nước).

#### Ghi thu, hoàn tác & nhắc nợ

_[Minh họa giao diện: Các trạng thái của một khoản — xem trong ứng dụng]_

- **Tôi đã đóng**: thành viên báo → bạn đối chiếu rồi **Xác nhận** hoặc từ chối kèm lý do.
- Thủ quỹ, Trưởng nhà, Admin bấm **Đã đóng** ở dòng thành viên (tiền mặt/chuyển khoản) để ghi thay.
- Nhầm hoặc chưa thu thật: **Hoàn tác** (có lý do — hệ thống ghi bút toán đảo, không xóa dữ liệu).
- Đóng một phần/gộp nhiều khoản: **Chi tiết → Ghi thu**.
- **Nhắc nợ**: nút **Nhắc** ở từng người hoặc **Nhắc người chưa đóng** cho cả khoản — gửi thông báo trong ứng dụng và (tùy chọn) vào **nhóm Zalo**.
- **Miễn/giảm** cần lý do và quyền của Trưởng nhà.

#### Phiếu chi & duyệt

**Lập phiếu chi**: số tiền, hạng mục, người ứng/chi, ảnh hóa đơn (bắt buộc từ ngưỡng cấu hình).

_[Minh họa giao diện: Luồng duyệt phiếu chi — xem trong ứng dụng]_

> **Người lập không tự duyệt** — Người lập/người ứng tiền không bao giờ tự duyệt phiếu của mình. Nếu một trong hai người duyệt là người lập hoặc người ứng tiền thì **người còn lại ký một mình** (cấu hình “Nhà chỉ có Trưởng nhà + Thủ quỹ duyệt chi”).

_[Minh họa giao diện: Trạng thái phiếu chi — xem trong ứng dụng]_

Phiếu đã duyệt có người ứng tiền: chi tiết phiếu hiện **mã QR hoàn ứng** của người đó (có sẵn số tiền + nội dung). Chi xong bấm **Đã chi**; sổ quỹ tự ghi.

#### Báo cáo, thống kê & nhắc quỹ

- Tab **Thống kê & Xuất file**: thu – chi theo **tháng / quý / năm**, biểu đồ, cơ cấu chi; nút **Xuất Excel** và **Xuất PDF**.
- **Tải báo cáo PDF**, **Gửi Zalo** để gửi nhóm; nút **Soạn tin nhắc quỹ** (AI) soạn lời nhắc không nêu tên ai.
- Thẻ **AI nhận xét thu chi tháng** so sánh tháng này với tháng trước (khi Admin đã bật AI). Nhận xét lưu 1 giờ để khỏi tốn lượt AI; bấm **Tạo lại** khi muốn bản mới.

<a id="truong-nha"></a>

## Trưởng nhà: điều hành nhà

*Dành cho: Trưởng nhà* — Duyệt đơn, xếp phòng, xếp người trực, đăng thông báo và cấu hình chung.

- **Thành viên & phòng** — Duyệt đơn xin vào nhà, thêm thành viên (cấp tài khoản ngay), xếp/chuyển phòng ở **Sơ đồ nhà**.
- **Trực & hậu cần** — Xếp 2 bạn trực mỗi tuần, nhắc, chấm điểm; tiếp nhận báo hỏng.
- **Tài chính** — Đồng ký phiếu chi lớn, xác nhận chốt sổ tháng, duyệt miễn/giảm quỹ.

#### Thành viên & phòng ở

- **Thành Viên → Đơn chờ duyệt**: duyệt đơn xin vào nhà và xếp phòng.
- **Thêm thành viên** (có thể cấp tài khoản ngay — mật khẩu tạm hiện **một lần**, hãy gửi riêng cho người đó).
- **Sơ đồ nhà**: xếp/chuyển phòng (máy tính: kéo thả; điện thoại: danh sách thẻ), sửa cấu trúc phòng.

#### Trực vệ sinh theo tuần

1. **Xếp người trực** _(Hậu Cần & Trực → Xếp người trực)_ — Chọn 2 bạn cho mỗi tuần (có nút **Gợi ý luân phiên**). Hệ thống báo cho người được xếp.
2. **Nhắc / gửi Zalo** — Nhắc người trực hoặc gửi lịch vào nhóm Zalo bằng nút trên thẻ tuần.
3. **Đánh giá cuối tuần** — Chấm điểm 0–10, nhận xét, có thể **yêu cầu trực lại**.

_[Minh họa giao diện: duty-week — xem trong ứng dụng]_

#### Luật nhà

**Thông báo → Luật nhà**

Soạn từng mục, thêm giờ giấc, sắp xếp thứ tự, tải PDF. Thành viên đọc và tải PDF ở cùng chỗ.

#### Thông báo, sự kiện, diễn đàn

Đăng thông báo (chọn đối tượng nhận, ghim, yêu cầu xác nhận), tạo sự kiện + mã QR điểm danh, tạo biểu quyết, kiểm duyệt diễn đàn. Khi đăng thông báo hoặc tạo sự kiện có thể tick **đăng cả vào nhóm Zalo**.

#### Lịch phụng vụ, lễ Bổn mạng & đi lễ

**Lịch & Sự kiện → Cấu hình lịch phụng vụ**

- Đặt **ngày và tên Bổn mạng** của nhà (tô vàng ⭐, báo trước cho anh em, và — nếu bật — bắt buộc check-in kèm ảnh).
- Thêm **ngày đặc biệt** (kỷ niệm thành lập, lễ tạ ơn, tĩnh tâm…), chọn số ngày báo trước, giờ nhắc check-in, nạp **Lời Chúa**.
- Nhập **ý lễ** của nhà cho từng ngày; duyệt check-in và xem **Tổng hợp cả nhà** (ai vắng ngày nào) ở tab Điểm Danh & Check-in.

#### Cấu hình chung

- **Cài Đặt → Cấu hình chung & Định mức**: thông tin nhà, mức quỹ mỗi kỳ, số tháng mỗi kỳ, hạn nộp, ngưỡng duyệt chi, giờ chốt cơm, giờ kinh tối…
- **Cài Đặt → Danh mục học tập**: trường đại học, năm học kèm học kỳ, năm học hiện hành, nhiệm kỳ Ban điều hành. Mục đang có dữ liệu thì không xóa được (chỉ tạm ẩn).

<a id="zalo-tu-dong"></a>

## Nhắc tự động & nhóm Zalo

*Dành cho: Trưởng nhà, Admin* — Cách bot Zalo gửi tin vào nhóm, lịch gửi mỗi ngày, mẫu tin và lịch sử gửi.

_[Minh họa giao diện: Tin bot gửi vào nhóm: tự động có dấu 🤖, tin do người bấm ghi “Thao tác bởi …” — xem trong ứng dụng]_

Mở ở: **Cài Đặt → Tích hợp Zalo**

#### Thiết lập một lần

1. **Token bot** — Biến môi trường `ZALO_BOT_TOKEN` đặt trên Vercel (không lưu trong cơ sở dữ liệu). Trang cho biết token đã có chưa và tên bot.
2. **Mã nhóm (chat_id)** — Thêm bot vào nhóm, nhắn một câu trong nhóm rồi bấm **Dò nhóm** để lấy mã; hoặc dán tay. Bấm **Gửi tin thử** để kiểm tra.
3. **Bật công tắc** — Bật gửi tin nhóm và chọn **từng loại tin** được phép gửi.
4. **Tác vụ hằng ngày** — Cần biến `CRON_SECRET` trên Vercel để cron chạy. Dùng **Xem trước buổi sáng/tối** để biết hôm nay sẽ gửi gì (không gửi thật).

### Hệ thống tự gửi gì, lúc nào?

| Giờ | Tin |
| --- | --- |
| **~7:00 sáng** | Nhắc lễ trọng/Bổn mạng · khoản quỹ sắp/quá hạn · sự kiện hôm nay + ngày mai (**gộp một tin**) · sinh nhật · lịch nhắc lặp buổi sáng · thứ Hai: lịch trực vệ sinh tuần |
| **~19:00 tối** | Nhắc check-in đi lễ · lịch nhắc lặp buổi tối |
| **Khi có người thao tác** | Sự kiện mới, thông báo, báo hỏng, đổi phòng, thành viên mới, nhắc quỹ… kèm “— Thao tác bởi <tên>” |

> **Vì sao có thể lệch giờ?** — Gói miễn phí của Vercel chạy mỗi tác vụ **một lần/ngày** và có thể lệch tới ~1 giờ, nên tin “7:00” có khi đến lúc 7:40.

> **Không bao giờ gửi lặp** — Mỗi tin tự động có một **khóa chống trùng** theo ngày: cron chạy lại hay bấm “Chạy thật ngay” nhiều lần thì tin đã gửi trong ngày vẫn chỉ gửi một lần.

### Lịch & lịch sử tin gửi

_[Minh họa giao diện: Lịch tháng trong Tích hợp Zalo — xem trong ứng dụng]_

Mỗi ngày hiện số tin **đã gửi** (xanh), **gửi lỗi** (đỏ), **bỏ qua** (xám) và **dự kiến** (viền tím). Bấm một ngày để xem từng tin: tự động hay do ai bấm, kết quả, lý do lỗi và nội dung đầy đủ. Ngày sắp tới hiện tin dự kiến (sự kiện, sinh nhật, lịch trực, lịch nhắc lặp); nhắc quỹ và nhắc lễ trọng không dự báo trước được.

### Mẫu tin & lịch nhắc lặp

- **Mẫu tin nhắn** (cùng trang): sửa nội dung từng loại tin, chèn biến như `{title}`, xem trước ngay, **Khôi phục mẫu mặc định** khi cần. Dòng chỉ có biến rỗng tự bị bỏ.
- **Cài Đặt → Nhắc lịch**: tạo lịch nhắc lặp hằng tuần (vd. “Họp nhà tối thứ 4”), chọn nhắc 7:00 sáng hoặc 19:00 tối, trong ứng dụng và/hoặc nhóm Zalo.

<a id="admin"></a>

## Admin: tài khoản, vai trò, phân hệ, hệ thống

*Dành cho: Admin* — Quản lý tài khoản, vai trò & quyền, phân hệ, trợ lý AI và nhật ký hoạt động.

_[Minh họa giao diện: Vai trò hệ thống và vai trò tự tạo — xem trong ứng dụng]_

#### Tài khoản

**Cài Đặt → Tài khoản**

Danh sách anh em kèm trạng thái (Đang hoạt động / Bị khóa / Vô hiệu / Chưa có tài khoản), email, vai trò, lần đăng nhập cuối; lọc và tìm kiếm. Bấm **Quản lý** ở dòng của người đó:

| Việc | Kết quả |
| --- | --- |
| **Cấp tài khoản** | Nhập email → mật khẩu tạm hiện **một lần**, hãy gửi riêng cho người đó |
| **Đặt lại mật khẩu** | Mật khẩu tạm mới; mọi phiên đăng nhập cũ bị đăng xuất; lần sau phải đổi mật khẩu |
| **Khóa / Mở khóa**, **Vô hiệu / Kích hoạt lại** | Chặn hoặc cho phép đăng nhập |
| **Vai trò** | Đánh dấu các vai trò người đó giữ (hệ thống và tự tạo) |

> **ℹ️ Lưu ý** — Không thao tác được trên **chính tài khoản của mình**. Muốn đổi mật khẩu của mình: menu tài khoản → Đổi mật khẩu.

#### Vai trò & quyền

**Cài Đặt → Phân quyền & Vai trò**

- Bốn vai trò hệ thống (Admin, Trưởng nhà, Thủ quỹ, Thành viên) không xóa được và bộ quyền cố định.
- **Thêm vai trò** cho các ban (ví dụ Trưởng ban Ẩm thực): đặt tên, mô tả, chọn quyền theo nhóm phân hệ (có ô tìm quyền), rồi gán cho người phụ trách ở tab Tài khoản.
- **Sửa / Xóa** vai trò tự tạo. Vai trò còn lịch sử sẽ được lưu trữ, người đang giữ mất quyền ngay.

> **Chống leo thang quyền** — Người đang giữ một vai trò chỉ được **bớt** quyền của vai trò đó, không tự thêm. Một số quyền quản trị (gán vai trò, quản lý tài khoản, xem CCCD, xem nhật ký hoạt động…) không cấp được cho vai trò tự tạo.

#### Phân hệ (ẩn/bảo trì)

**Cài Đặt → Phân hệ**: tắt phân hệ chưa dùng (ví dụ Hậu cần & Trực, Thu Chi…) và nhập lời nhắn. Thành viên thấy mục bị làm mờ “Bảo trì”; dữ liệu giữ nguyên, bật lại là dùng tiếp.

#### Danh mục & học tập

- **Danh mục**: hạng mục chi, loại sự kiện, chuyên mục thông báo/diễn đàn…
- **Danh mục học tập**: trường đại học, năm học, học kỳ, nhiệm kỳ.

#### Lịch phụng vụ

Lịch phụng vụ do ứng dụng tự tính cho mọi năm (theo luật phụng vụ và lịch riêng của Hội đồng Giám mục Việt Nam). **Lời Chúa** được nạp tự động từ dữ liệu mở trên GitHub khi máy chủ khởi động (chỉ tải về, không gửi dữ liệu của nhà ra ngoài); nạp lại ở **Lịch & Sự kiện → Cấu hình lịch phụng vụ → Lời Chúa**.

#### Trợ lý AI

**Cài Đặt → Trợ lý AI**: bật công tắc tổng và từng tính năng (hỏi đáp nội quy, soạn tin nhắc quỹ, phân loại sự cố, tóm tắt, soát nội dung, nhận xét thu chi, nhận xét học tập), đặt ngân sách tháng, xem nhật ký. Khóa API Groq/Gemini đặt trong file `.env.local` của máy chủ.

### Nhật ký hoạt động (chỉ Admin)

**Cài Đặt → Nhật ký hoạt động**

_[Minh họa giao diện: Mỗi thao tác: ai, làm gì, kết quả, giờ, thiết bị — xem trong ứng dụng]_

- **Thao tác** — Mọi thao tác ghi (tạo, sửa, xóa, duyệt, gửi Zalo…). **Không lưu nội dung** người dùng nhập.
- **Đăng nhập** — Đăng nhập thành công/thất bại, lý do, IP, thiết bị.
- **Thay đổi dữ liệu** — Giá trị **trước → sau** của từng bản ghi (bấm để mở).

Lọc theo **người dùng**, khoảng thời gian, phân hệ, kết quả hoặc tìm theo từ khóa. Nhật ký giữ **180 ngày**. Hồ sơ cá nhân nhạy cảm và điểm học tập chỉ Trưởng nhà xem được nên không hiện ở đây.

> **Giới hạn của Admin** — Admin **không** duyệt chi, không đổi tài khoản nhận quỹ, không xem dữ liệu nhạy cảm (CCCD, thông tin phụ huynh, hồ sơ Công giáo, điểm chi tiết của người khác) — những việc đó thuộc Trưởng nhà/Thủ quỹ.

<a id="truong-ban"></a>

## Trưởng ban (vai trò tự tạo)

*Dành cho: Trưởng ban (vai trò tự tạo)* — Phạm vi làm việc tùy theo quyền Admin đã cấp cho vai trò của bạn.

#### Phụng vụ

Lịch phụng vụ tuần, phân công đọc sách/giúp lễ/hát, quản lý **Tài liệu phụng vụ** (kinh, lời bài hát, PDF, link YouTube), kiểm duyệt ý cầu nguyện.

1. **Nhập ý lễ** _(Lịch & Sự kiện → Khung Phụng vụ → Thêm ý lễ)_ — Ý lễ của nhà cho từng ngày.
2. **Duyệt check-in đi lễ** — Xem ai đã check-in và bấm **Hợp lệ / Không hợp lệ** (ảnh trùng của người khác hoặc chụp sai ngày được cảnh báo). **Tổng hợp cả nhà** ở tab Điểm Danh.
3. **Cấu hình lịch phụng vụ** — Thêm **ngày đặc biệt** (lặp hằng năm hoặc một lần, chọn màu, bắt buộc check-in, cần ảnh), đổi **ngày & tên Bổn mạng**, số ngày báo trước, giờ nhắc, **nạp Lời Chúa**.

#### Ẩm thực

Thực đơn tuần, chốt suất ăn, sửa đăng ký sau giờ chốt, kho thực phẩm, khảo sát món ăn.

#### Truyền thông

Tạo/kiểm duyệt album Khoảnh khắc, đăng bản tin.

> **Không thấy nút cần dùng?** — Nhờ Admin kiểm tra quyền của vai trò ở **Cài Đặt → Phân quyền & Vai trò**.
