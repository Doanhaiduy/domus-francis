# Hướng dẫn sử dụng — Lưu Xá Phanxicô

> Bản này được sinh từ cùng nội dung với trang **Hướng dẫn sử dụng** trong ứng dụng (thanh bên → Hướng dẫn sử dụng). Sửa nội dung ở `src/content/guide.ts` rồi chạy lại `node --experimental-strip-types scripts/docs/export-guide.mjs`.

## Mục lục

1. [Bắt đầu: đăng nhập & làm quen giao diện](#bat-dau) — Mọi người
2. [Việc hằng ngày của thành viên](#thanh-vien) — Thành viên, Mọi người
3. [Thủ quỹ: quỹ, điện nước, phiếu chi](#thu-quy) — Thủ quỹ
4. [Trưởng nhà: điều hành nhà](#truong-nha) — Trưởng nhà
5. [Admin: tài khoản, vai trò, phân hệ, hệ thống](#admin) — Admin
6. [Trưởng ban (vai trò tự tạo)](#truong-ban) — Trưởng ban (vai trò tự tạo)
7. [Câu hỏi thường gặp](#hoi-dap) — Mọi người

## Giới thiệu

Ứng dụng quản lý sinh hoạt của Lưu Xá Phanxicô. Mỗi người thấy và làm được những việc theo **vai trò** của mình:

- **Thành viên** — mọi anh em trong nhà: xem thông báo, lịch, đăng ký cơm, trực nhật, đóng quỹ, nhập bảng điểm…
- **Thủ quỹ** — giữ quỹ: lập kỳ thu quỹ, nhập tiền điện nước, ghi thu, lập/duyệt phiếu chi, sổ quỹ.
- **Trưởng nhà** — điều hành: duyệt đơn vào nhà, thành viên & phòng ở, trực nhật, đồng ký chi, thông báo, cấu hình chung.
- **Admin** — quản trị hệ thống: tài khoản, vai trò & quyền, ẩn/hiện phân hệ, danh mục, năm học, trợ lý AI. Admin **không** duyệt chi, không đổi tài khoản nhận quỹ và không xem dữ liệu nhạy cảm của thành viên.
- **Vai trò tự tạo** (Trưởng ban Phụng vụ, Trưởng ban Ẩm thực, Trưởng ban Truyền thông…) — do Admin tạo và chọn quyền.

Một người có thể giữ nhiều vai trò (ví dụ Trưởng nhà + Thành viên).

<a id="bat-dau"></a>

## Bắt đầu: đăng nhập & làm quen giao diện

*Dành cho: Mọi người*

### Đăng nhập lần đầu
1. Nhận email và **mật khẩu tạm** từ Admin hoặc Trưởng nhà.
2. Mở ứng dụng, đăng nhập. Lần đầu hệ thống bắt buộc **đổi mật khẩu** (ít nhất 10 ký tự, nên có chữ và số).
3. Quên mật khẩu: nhờ Admin hoặc Trưởng nhà vào Cài đặt → Tài khoản → **Đặt lại mật khẩu**, bạn sẽ nhận mật khẩu tạm mới.

### Giao diện
- **Máy tính**: thanh bên trái là các phân hệ; góc trên có ô **Tìm kiếm nhanh** (phím tắt Ctrl+K) để mở trang, tìm anh em, tạo nhanh việc.
- **Điện thoại**: thanh điều hướng dưới cùng; mục không có ở đó nằm trong nút **Thêm**. Chạm vào một bài viết/thông báo/thành viên sẽ mở trang chi tiết, bấm **Quay lại** (hoặc nút Back của điện thoại) để trở về.
- **Chuông** ở góc trên: thông báo dành cho bạn (ca trực, phiếu chi cần duyệt, phản hồi…).
- Mục bị làm mờ với nhãn **Bảo trì**: Admin đang tạm ẩn phân hệ đó.
- Mẹo: trên điện thoại chọn "Thêm vào màn hình chính" của trình duyệt để mở như một ứng dụng.

### Hồ sơ & tài khoản nhận tiền của tôi
- Vào **Thành Viên**, chọn chính mình để xem hồ sơ; bấm **Sửa hồ sơ** để cập nhật thông tin được phép.
- Thẻ **Tài khoản nhận tiền** trong hồ sơ → **Khai báo tài khoản**: chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản (có thể tải ảnh QR của ngân hàng). Ứng dụng tự tạo mã VietQR để anh em hoặc Thủ quỹ chuyển khoản/hoàn ứng cho bạn nhanh và đúng.

<a id="hoi-dap"></a>

## Câu hỏi thường gặp

*Dành cho: Mọi người*

- **Không thấy một mục trên thanh bên / mục bị mờ “Bảo trì”**: Admin đang tạm ẩn phân hệ đó, hoặc vai trò của bạn không có quyền.
- **Bấm nút báo “Không có quyền”**: nhờ Admin kiểm tra vai trò của bạn.
- **Dữ liệu chưa cập nhật**: tải lại trang (kéo xuống trên điện thoại hoặc F5).
- **Quên mật khẩu**: nhờ Admin/Trưởng nhà đặt lại.
- **Muốn dùng AI**: Admin bật trong Cài đặt → Trợ lý AI; lần đầu dùng mỗi người cần bấm đồng ý.

<a id="thanh-vien"></a>

## Việc hằng ngày của thành viên

*Dành cho: Thành viên, Mọi người*

### Thông báo
- **Thông báo**: đọc bảng tin; thông báo có nút **Xác nhận đã đọc** thì bấm để Ban điều hành biết.

### Lịch & Sự kiện
- Xem lịch tháng, bấm vào ngày để xem sự kiện; chọn **Tham dự / Vắng / Chưa rõ**.
- **Điểm danh**: quét mã QR tại chỗ hoặc bấm **Nhập mã điểm danh** và gõ mã được đọc to.
- **Biểu quyết**: chọn phương án trong thẻ biểu quyết trước hạn chót.

### Thu chi — đóng quỹ & tiền điện nước
- Quỹ sinh hoạt: **600.000 đ/người/năm**, đóng **300.000 đ mỗi kỳ 6 tháng** (mức do Ban điều hành cấu hình).
- Tiền **điện nước** tính chung cả nhà mỗi tháng rồi chia đều cho người đang ở.
- Ở trang **Thu Chi** → khối **Các khoản thu**: chọn khoản (chip “Quỹ T7–T12”, “ĐN T9”…) để xem bạn đã đóng hay chưa. Khoản chưa đóng có nút **Nộp qua QR**: mở mã QR tài khoản nhận quỹ đã có sẵn **số tiền và nội dung chuyển khoản** — quét bằng app ngân hàng là xong (có nút sao chép số tài khoản/số tiền/nội dung). Thủ quỹ ghi nhận khi nhận được tiền.
- Tab **Ma trận đóng quỹ** cho thấy lịch sử các khoản của bạn theo từng kỳ/tháng.

### Bếp & Cơm
- Đăng ký/nghỉ ăn trưa, tối **trước giờ chốt** (mặc định 09:00 cho bữa trưa, 15:00 cho bữa tối). Sau giờ chốt chỉ Ban Ẩm thực sửa được.
- Có thể chấm điểm, góp ý món ăn.

### Hậu cần & Trực nhật
- Xem **ca trực** của mình; đến giờ bấm **Check-in** và chụp ảnh khu vực đã làm sạch.
- Bận đột xuất: **Đổi ca** với một anh em khác (người nhận đồng ý, Ban điều hành duyệt), xin trước ít nhất 12 giờ.
- **Báo hỏng**: nút “Báo hỏng” — mô tả, chọn vị trí, chụp ảnh. Theo dõi trạng thái sửa chữa.
- **Giặt đồ**: đặt lượt máy giặt theo khung giờ, đến đúng giờ.

### Phụng vụ
- Lịch phụng vụ tuần, phân công đọc sách/giúp lễ/hát; xác nhận nhiệm vụ của mình.
- **Ý cầu nguyện**: gửi công khai hoặc **ẩn danh** (thật sự ẩn danh — không ai xem được tác giả).
- **Tài liệu phụng vụ** (nút “📚 Tài liệu phụng vụ” đầu trang Phụng Vụ): tìm kinh, lời bài hát, file PDF, link YouTube (gõ không dấu cũng được), lọc theo loại/chuyên mục; sao chép lời kinh, mở/tải PDF, mở YouTube hoặc bấm **Xem tại đây**.

### Diễn đàn, Học tập, Khoảnh khắc
- **Diễn đàn**: tạo chủ đề, bình luận, thích; nội dung vi phạm có thể báo cáo.
- **Học tập**: nhập bảng điểm từng học kỳ kèm ảnh minh chứng; Ban điều hành xác minh. Thẻ **AI nhận xét kết quả học tập** so sánh năm học này với năm trước (cần đồng ý một lần; chỉ gửi số liệu đã ẩn danh — không tên, trường, mã sinh viên).
- **Khoảnh khắc**: xem/tải album ảnh sinh hoạt.

### Trợ lý AI
- Nút **Trợ lý AI** (góc dưới) trả lời câu hỏi về nội quy, thông báo, lịch — luôn ghi nguồn. AI chỉ gợi ý; thông tin quan trọng hãy hỏi lại Ban điều hành.

<a id="thu-quy"></a>

## Thủ quỹ: quỹ, điện nước, phiếu chi

*Dành cho: Thủ quỹ*

### Tài khoản nhận quỹ (mã QR)
- Trang **Thu Chi** → thẻ **Tài khoản nhận quỹ** → **Khai báo tài khoản + mã QR** (hoặc **Sửa**): chọn ngân hàng, nhập số tài khoản, tên chủ tài khoản (có thể tải ảnh QR của ngân hàng). Thành viên sẽ thấy QR có sẵn số tiền + nội dung khi nộp. Thủ quỹ và Trưởng nhà sửa được; Admin không đổi được nơi nhận tiền.

### Lập kỳ quỹ (6 tháng/lần)
1. **Thu Chi** → khối **Các khoản thu** → **Lập kỳ quỹ** → chọn kỳ (ví dụ T7–T12/2026); mức mặc định 300.000 đ/người (≈ 600.000 đ/năm), hạn nộp mặc định ngày 15 tháng đầu kỳ, chọn túi quỹ nhận.
2. Xem trước “12 người × 300.000 đ = 3.600.000 đ” rồi bấm **Lập kỳ quỹ** — hệ thống tạo khoản phải thu cho mọi thành viên đang ở. Mỗi kỳ chỉ lập một lần; kỳ chưa ai nộp thì **Hủy** được.
3. Mức quỹ, số tháng mỗi kỳ, tháng bắt đầu kỳ, hạn nộp do Trưởng nhà chỉnh ở Cài Đặt → Cấu hình chung.

### Tiền điện nước hằng tháng
1. Khi có hóa đơn: **Nhập tiền điện nước** → chọn tháng, nhập **tổng tiền điện + nước** của cả nhà.
2. Hệ thống chia đều cho số người đang ở, **làm tròn lên tới 1.000 đ** và cho xem trước (ví dụ 12 người × 155.000 đ, dư 10.000 đ) trước khi lưu.
3. Khoản chi trả cho công ty điện/nước vẫn lập **phiếu chi** như bình thường (hạng mục Điện nước).

### Ghi thu
- Trong danh sách khoản thu, bấm **Thu tiền** ở dòng thành viên: chọn hình thức (tiền mặt/chuyển khoản), túi quỹ, ngày; một phiếu thu có thể trả nhiều khoản. Nhầm thì **Hủy phiếu thu** (có lý do — hệ thống ghi bút toán đảo, không xóa dữ liệu).
- **Miễn/giảm** cần lý do và quyền của Trưởng nhà.

### Phiếu chi
- **Lập phiếu chi**: số tiền, hạng mục, người ứng/chi, ảnh hóa đơn (bắt buộc từ ngưỡng cấu hình).
- Phiếu nhỏ dưới ngưỡng Thủ quỹ tự duyệt; từ ngưỡng **2 chữ ký** cần Trưởng nhà + Thủ quỹ. Người lập/người ứng tiền không bao giờ tự duyệt phiếu của mình — nếu một trong hai người duyệt là người lập hoặc người ứng tiền thì **người còn lại ký một mình** (cấu hình “Nhà chỉ có Trưởng nhà + Thủ quỹ duyệt chi”).
- Phiếu đã duyệt có người ứng tiền: phần chi tiết phiếu hiện **mã QR hoàn ứng** của người đó (có sẵn số tiền + nội dung).
- Khi chi xong bấm **Đã chi**; sổ quỹ tự ghi.

### Báo cáo & nhắc quỹ
- **Tải báo cáo PDF**, **Copy Zalo** để gửi nhóm; nút **Soạn tin nhắc quỹ** (AI) soạn lời nhắc không nêu tên ai.
- Thẻ **AI nhận xét thu chi tháng** tự so sánh tháng này với tháng trước (khi Admin đã bật AI).

<a id="truong-nha"></a>

## Trưởng nhà: điều hành nhà

*Dành cho: Trưởng nhà*

### Thành viên & phòng ở
- **Thành Viên** → tab **Đơn chờ duyệt**: duyệt đơn xin vào nhà và xếp phòng.
- **Thêm thành viên** (có thể cấp tài khoản ngay — mật khẩu tạm hiện một lần, hãy gửi riêng cho người đó).
- **Sơ đồ nhà**: xếp/chuyển phòng (máy tính: kéo thả; điện thoại: danh sách thẻ), sửa cấu trúc phòng.

### Trực nhật & hậu cần
- **Hậu Cần & Trực** → **Phân công ca mới** hoặc sao chép roster tuần trước; công bố roster; nghiệm thu ca đã check-in; duyệt đơn đổi ca; tiếp nhận báo hỏng.

### Tài chính
- Đồng ký phiếu chi lớn, xác nhận chốt sổ tháng, duyệt miễn/giảm quỹ.

### Thông báo, sự kiện, diễn đàn
- Đăng thông báo (chọn đối tượng nhận, ghim, yêu cầu xác nhận), tạo sự kiện + mã QR điểm danh, tạo biểu quyết, kiểm duyệt diễn đàn.

### Cấu hình chung
- **Cài Đặt → Cấu hình chung & Định mức**: thông tin nhà, mức quỹ mỗi kỳ, số tháng mỗi kỳ, hạn nộp, ngưỡng duyệt chi, giờ chốt cơm, giờ kinh tối…
- **Cài Đặt → Danh mục học tập** (hoặc nút **Trường & năm học** ở trang Học Tập): thêm/sửa/tạm ẩn trường đại học, năm học (niên khóa) kèm học kỳ, đặt năm học hiện hành, nhiệm kỳ Ban điều hành. Mục đang có dữ liệu dùng tới thì không xóa được (chỉ tạm ẩn).

<a id="admin"></a>

## Admin: tài khoản, vai trò, phân hệ, hệ thống

*Dành cho: Admin*

### Tài khoản
- **Cài Đặt → Tài khoản**: danh sách anh em kèm trạng thái (Đang hoạt động / Bị khóa / Vô hiệu / Chưa có tài khoản), email, vai trò, lần đăng nhập cuối; lọc và tìm kiếm.
- Bấm **Quản lý** ở dòng của người đó:
  - **Cấp tài khoản** cho người chưa có (nhập email → mật khẩu tạm hiện một lần, hãy gửi riêng cho người đó).
  - **Đặt lại mật khẩu** khi có người quên (mật khẩu tạm mới; mọi phiên đăng nhập cũ bị đăng xuất; lần đăng nhập sau phải đổi mật khẩu).
  - **Khóa tài khoản / Mở khóa**, **Vô hiệu hóa / Kích hoạt lại**.
  - Đánh dấu các **vai trò** người đó giữ (vai trò hệ thống và vai trò tự tạo).
- Không thao tác được trên chính tài khoản của mình (muốn đổi mật khẩu của mình: menu tài khoản → Đổi mật khẩu).

### Vai trò & quyền
- **Cài Đặt → Phân quyền & Vai trò**. Bốn vai trò hệ thống (Admin, Trưởng nhà, Thủ quỹ, Thành viên) không xóa được và bộ quyền cố định.
- **Thêm vai trò** cho các ban (ví dụ Trưởng ban Ẩm thực): đặt tên, mô tả, chọn quyền theo nhóm phân hệ (có ô tìm quyền), rồi gán vai trò cho người phụ trách ở tab Tài khoản.
- Người đang giữ một vai trò chỉ được bớt quyền của vai trò đó, không tự thêm quyền (chống tự nâng quyền).
- **Sửa / Xóa** vai trò tự tạo. Vai trò còn lịch sử sẽ được lưu trữ, người đang giữ mất quyền ngay.
- Vì an toàn, một số quyền quản trị (gán vai trò, quản lý tài khoản, xem CCCD…) không cấp được cho vai trò tự tạo.

### Phân hệ (ẩn/bảo trì)
- **Cài Đặt → Phân hệ**: tắt phân hệ chưa dùng (ví dụ Hậu cần & Trực, Thu Chi…) và nhập lời nhắn. Thành viên thấy mục bị làm mờ “Bảo trì”; dữ liệu giữ nguyên, bật lại là dùng tiếp.

### Danh mục & học tập
- **Danh mục**: hạng mục chi, loại sự kiện, chuyên mục thông báo/diễn đàn…
- **Danh mục học tập**: trường đại học, năm học, học kỳ, nhiệm kỳ.

### Trợ lý AI
- **Cài Đặt → Trợ lý AI**: bật công tắc tổng và từng tính năng (hỏi đáp nội quy, soạn tin nhắc quỹ, phân loại sự cố, tóm tắt, soát nội dung, nhận xét thu chi, nhận xét học tập), đặt ngân sách tháng, xem nhật ký. Khóa API Groq/Gemini đặt trong file `.env.local` của máy chủ.

### Giới hạn của Admin
- Không duyệt chi, không đổi tài khoản nhận quỹ, không xem dữ liệu nhạy cảm (CCCD, thông tin phụ huynh, hồ sơ Công giáo, điểm chi tiết của người khác) — những việc đó thuộc Trưởng nhà/Thủ quỹ.

<a id="truong-ban"></a>

## Trưởng ban (vai trò tự tạo)

*Dành cho: Trưởng ban (vai trò tự tạo)*

Phạm vi làm việc tùy theo quyền Admin đã cấp cho vai trò của bạn. Thường gặp:

- **Trưởng ban Phụng vụ**: lịch phụng vụ tuần, phân công đọc sách/giúp lễ/hát, quản lý **Tài liệu phụng vụ** (thêm kinh, lời bài hát, PDF, link YouTube), kiểm duyệt ý cầu nguyện.
- **Trưởng ban Ẩm thực**: thực đơn tuần, chốt suất ăn, sửa đăng ký sau giờ chốt, kho thực phẩm, khảo sát món ăn.
- **Trưởng ban Truyền thông**: tạo/kiểm duyệt album Khoảnh khắc, đăng bản tin.

Không thấy nút cần dùng? Nhờ Admin kiểm tra quyền của vai trò ở Cài Đặt → Phân quyền & Vai trò.
