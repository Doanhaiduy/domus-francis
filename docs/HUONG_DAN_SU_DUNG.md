# Hướng dẫn sử dụng — Lưu Xá Phanxicô

> Bản này được sinh từ cùng nội dung với trang **Hướng dẫn sử dụng** trong ứng dụng (thanh bên → Hướng dẫn sử dụng), nơi có thêm minh họa giao diện. Sửa nội dung ở `src/content/guide.ts` rồi chạy lại `node --experimental-strip-types scripts/docs/export-guide.mjs`.

## Mục lục

1. [Bắt đầu: đăng nhập & làm quen giao diện](#bat-dau) — Mọi người
2. [Cài ứng dụng & bật thông báo](#cai-ung-dung) — Mọi người
3. [Thông báo, Lịch, Sự kiện & Xin phép](#lich-su-kien) — Thành viên, Mọi người
4. [Bảo mật & thông báo của tôi](#bao-mat) — Mọi người
5. [Phụng vụ & check-in đi lễ](#phung-vu) — Thành viên, Mọi người
6. [Thu chi: đóng quỹ & tiền điện nước](#dong-quy) — Thành viên, Mọi người
7. [Bếp & Cơm](#bep-com) — Thành viên, Mọi người
8. [Hậu cần, trực vệ sinh & luật nhà](#hau-can) — Thành viên, Mọi người
9. [Thành viên, hồ sơ, sơ đồ nhà & cựu thành viên](#thanh-vien) — Thành viên, Mọi người
10. [Diễn đàn, Học tập, Khoảnh khắc & Trợ lý AI](#cong-dong) — Thành viên, Mọi người
11. [Thủ quỹ: quỹ, điện nước, phiếu chi](#thu-quy) — Thủ quỹ
12. [Trưởng nhà: điều hành nhà](#truong-nha) — Trưởng nhà
13. [Nhắc tự động & nhóm Zalo](#zalo-tu-dong) — Trưởng nhà, Admin
14. [Admin: tài khoản, vai trò, phân hệ, hệ thống](#admin) — Admin
15. [Trưởng ban (vai trò tự tạo)](#truong-ban) — Trưởng ban (vai trò tự tạo)
16. [Câu hỏi thường gặp & phím tắt](#hoi-dap) — Mọi người

## Giới thiệu

Ứng dụng quản lý sinh hoạt của Lưu Xá Phanxicô. Mỗi người thấy và làm được những việc theo **vai trò** của mình. Một người có thể giữ nhiều vai trò (ví dụ Trưởng nhà + Thành viên).

- **Thành viên** — Mọi anh em trong nhà: xem thông báo, lịch, đăng ký cơm, lịch trực vệ sinh, luật nhà, đóng quỹ, nhập bảng điểm…
- **Thủ quỹ** — Giữ quỹ: lập kỳ thu quỹ, nhập tiền điện nước, ghi thu, lập/duyệt phiếu chi, sổ quỹ.
- **Trưởng nhà** — Điều hành: duyệt đơn vào nhà, thành viên & phòng ở, trực nhật, đồng ký chi, thông báo, nhắc tự động qua Zalo, cấu hình chung.
- **Admin** — Quản trị hệ thống với **toàn quyền**: có mọi quyền của mọi vai trò (kể cả quyền được thêm về sau) — tài khoản, vai trò & quyền, phân hệ, danh mục, trợ lý AI, nhật ký hoạt động, và cả duyệt chi, duyệt đơn xin phép, ghi thu, đăng bài công khai… Chỉ các quy tắc **tách người** (không tự duyệt phiếu/đơn của chính mình) vẫn áp dụng cho mọi người.
- **Trưởng ban (vai trò tự tạo)** — Trưởng ban Phụng vụ, Ẩm thực, Truyền thông… do Admin tạo và chọn quyền.

<a id="bat-dau"></a>

## Bắt đầu: đăng nhập & làm quen giao diện

*Dành cho: Mọi người* — Đăng nhập, đổi mật khẩu, nhận biết các khu vực trên màn hình và khai báo tài khoản nhận tiền.

#### Đăng nhập lần đầu

1. **Nhận tài khoản** — Admin hoặc Trưởng nhà gửi cho bạn **email** và **mật khẩu tạm** (gửi riêng, không đăng lên nhóm).
2. **Đăng nhập** — Mở ứng dụng, nhập email và mật khẩu tạm. _(minh họa trong ứng dụng)_
3. **Đổi mật khẩu** — Lần đầu hệ thống bắt buộc đặt mật khẩu mới: **ít nhất 10 ký tự**, nên có cả chữ và số.

> **Quên mật khẩu?** — Ở trang đăng nhập bấm **Quên mật khẩu?**, nhập email — ứng dụng gửi đường dẫn đặt lại (có hiệu lực **30 phút**, dùng một lần). Nếu chưa nhận được thư hoặc nhà chưa cấu hình email, nhờ Admin/Trưởng nhà vào **Cài đặt → Tài khoản → Đặt lại mật khẩu** để nhận mật khẩu tạm.

### Làm quen giao diện

#### Máy tính

_[Minh họa giao diện: Giao diện trên máy tính — xem trong ứng dụng]_

- **① Thanh bên trái** liệt kê các phân hệ. Vài mục **gộp chung** cho gọn (*Thông báo & Diễn đàn*, *Lịch & Xin phép*, *Thu Chi & Báo cáo*, *Thành Viên & Nhà*, *Cài Đặt & Hướng dẫn*) — trong trang có **thanh tab** để chuyển qua lại giữa các phần.
- **② Tìm kiếm nhanh** (phím tắt `Ctrl + K`): mở trang, tìm anh em, tạo nhanh việc.
- **③ Chuông**: thông báo dành cho bạn (ca trực, phiếu chi cần duyệt, phản hồi…).
- **④ Tài khoản**: hồ sơ, đổi mật khẩu, đăng xuất.

#### Điện thoại

_[Minh họa giao diện: Giao diện trên điện thoại — xem trong ứng dụng]_

- **Thanh điều hướng dưới cùng**: các mục chính. Mục không có ở đó nằm trong nút **Thêm**.
- Chạm vào một bài viết/thông báo/thành viên sẽ mở trang chi tiết; bấm **Quay lại** (hoặc nút Back của điện thoại) để trở về.

> **Dùng như một ứng dụng** — Trong trình duyệt điện thoại chọn **Thêm vào màn hình chính** (iPhone: nút Chia sẻ → Thêm vào Màn hình chính) để mở ứng dụng nhanh như app cài sẵn và nhận **thông báo đẩy** — làm theo từng bước ở mục “Cài ứng dụng & bật thông báo” ngay bên dưới.

> **Giao diện tối** — Bấm biểu tượng **mặt trăng/mặt trời** ở thanh trên cùng để đổi giữa giao diện sáng và tối. Muốn tự theo cài đặt của máy: **Cài đặt → Hồ sơ cá nhân → Giao diện → Hệ thống**. Ở đó cũng chọn được **cỡ chữ** (Vừa / Lớn / Rất lớn) cho dễ đọc. Lựa chọn nhớ riêng cho từng thiết bị.

> **ℹ️ Lưu ý** — Mục bị làm mờ với nhãn **Bảo trì**: Admin đang tạm ẩn phân hệ đó. Dữ liệu vẫn giữ nguyên, bật lại là dùng tiếp.

#### Khai báo tài khoản nhận tiền của tôi

1. **Mở hồ sơ** _(Thành Viên & Nhà → Chính tôi)_ — Chọn chính mình để xem hồ sơ; bấm **Sửa hồ sơ** để cập nhật thông tin được phép.
2. **Khai báo tài khoản** _(Hồ sơ → Tài khoản nhận tiền → Khai báo tài khoản)_ — Chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản (có thể tải ảnh QR của ngân hàng).
3. **Xong** — Ứng dụng tự tạo mã **VietQR** để anh em hoặc Thủ quỹ chuyển khoản/hoàn ứng cho bạn nhanh và đúng.

<a id="cai-ung-dung"></a>

## Cài ứng dụng & bật thông báo

*Dành cho: Mọi người* — Đưa ứng dụng ra màn hình chính điện thoại và bật thông báo đẩy — làm một lần cho mỗi thiết bị, có hướng dẫn riêng cho iPhone, Android và máy tính.

> **Để làm gì?** — Cài ứng dụng ra **màn hình chính** thì mở nhanh như app thường, toàn màn hình. Bật **thông báo đẩy** thì điện thoại báo ngay khi có thông báo mới (ca trực, sự kiện, kết quả đơn xin phép, phiếu cần duyệt…) **kể cả khi bạn không mở ứng dụng**. Chỉ cần làm **một lần cho mỗi thiết bị**.

> **iPhone / iPad: bắt buộc cài ra màn hình chính trước** — iPhone chỉ nhận thông báo đẩy khi ứng dụng đã được **Thêm vào Màn hình chính** và bạn mở ứng dụng từ biểu tượng đó. Máy cần **iOS 16.4 trở lên** (xem ở Cài đặt → Cài đặt chung → Giới thiệu → Phiên bản iOS; thấp hơn thì vào Cài đặt chung → Cập nhật phần mềm).

### Bước 1 — Đưa ứng dụng ra màn hình chính

#### iPhone / iPad

1. **Mở bằng Safari** — Mở ứng dụng **Safari** (biểu tượng la bàn xanh), vào địa chỉ ứng dụng của nhà rồi đăng nhập. Đừng mở từ trong Zalo, Messenger hay Facebook — trình duyệt nhúng trong các ứng dụng đó **không có** nút thêm vào màn hình chính.
2. **Bấm nút Chia sẻ** — Là biểu tượng **ô vuông có mũi tên hướng lên**: ở thanh dưới cùng (iPhone) hoặc góc trên bên phải (iPad).
3. **Chọn “Thêm vào Màn hình chính”** — Vuốt danh sách hiện ra lên trên, tìm dòng **Thêm vào Màn hình chính** (biểu tượng dấu +) và bấm vào.
4. **Bấm “Thêm”** — Để nguyên tên gợi ý rồi bấm **Thêm** ở góc trên bên phải. Biểu tượng ứng dụng xuất hiện ở màn hình chính.
5. **Mở ứng dụng từ biểu tượng mới** — Từ giờ **luôn mở bằng biểu tượng này**, không mở lại bằng Safari. Làm Bước 2 ngay trong cửa sổ vừa mở.

#### Android

1. **Mở bằng Chrome** — Vào địa chỉ ứng dụng của nhà bằng **Chrome** và đăng nhập.
2. **Cài ứng dụng** _(Cài Đặt & Hướng dẫn → Cài đặt → Thông báo)_ — Ở thẻ **Cài ứng dụng lên màn hình chính** bấm **Cài ứng dụng**, rồi bấm **Cài đặt** khi Chrome hỏi.
3. **Hoặc cài bằng menu Chrome** — Nếu không thấy nút trên: bấm **dấu ba chấm ⋮** góc trên bên phải của Chrome → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**) → xác nhận. Tên mục có thể hơi khác tùy máy.
4. **Mở từ biểu tượng mới** — Biểu tượng xuất hiện ở màn hình chính hoặc trong danh sách ứng dụng. Mở ứng dụng bằng biểu tượng đó rồi làm Bước 2.

#### Máy tính

1. **Mở bằng Chrome hoặc Edge** — Vào địa chỉ ứng dụng và đăng nhập.
2. **Cài ứng dụng (không bắt buộc)** — Bấm biểu tượng **cài đặt** ở bên phải thanh địa chỉ (hình màn hình nhỏ có mũi tên), hoặc menu **⋮** → **Cài đặt ứng dụng**; hoặc bấm nút **Cài ứng dụng** ở Cài đặt → Thông báo. Ứng dụng sẽ mở thành cửa sổ riêng, có biểu tượng trên màn hình nền.

> **💡 Mẹo** — Trên máy tính **không cần cài** vẫn bật được thông báo ở Bước 2 — cài chỉ để mở cho tiện.

### Bước 2 — Bật thông báo đẩy trên thiết bị này

1. **Mở ứng dụng và đăng nhập** — iPhone: mở bằng **biểu tượng ở màn hình chính** (Bước 1).
2. **Vào tab Thông báo** _(Cài Đặt & Hướng dẫn → Cài đặt → Thông báo)_
3. **Bấm “Bật thông báo đẩy”** — Nút nằm ở thẻ **Thông báo đẩy trên thiết bị này**.
4. **Bấm “Cho phép”** — Điện thoại/trình duyệt hiện hộp thoại hỏi quyền gửi thông báo — chọn **Cho phép** (Allow). Nếu lỡ bấm *Không cho phép*, xem mục “Gặp sự cố?” bên dưới.
5. **Kiểm tra đã bật** — Thành công khi ứng dụng báo **Đã bật thông báo đẩy trên thiết bị này**, nút đổi thành **Tắt trên thiết bị này** và dòng “Bạn có N thiết bị đã đăng ký” tăng thêm 1.
6. **Chọn loại muốn nhận (tùy chọn)** — Ở thẻ **Nhận thông báo đẩy về…** tắt nhóm không cần (Lịch & sự kiện, Trực nhật, Thu chi…) và đặt **giờ yên tĩnh** — trong giờ đó thông báo được giữ lại, gửi sau khi hết giờ (trừ thông báo khẩn). Thông báo bắt buộc luôn được gửi.

### Cần biết

- Mỗi thiết bị bật **riêng**: dùng cả điện thoại lẫn laptop thì bật trên cả hai.
- Thông báo do **chính bạn** tạo (đăng thông báo, bình luận…) **không gửi ngược lại cho bạn**. Muốn thử, nhờ một người khác đăng thông báo hoặc gửi cho bạn.
- Không bật thông báo đẩy thì bạn vẫn thấy mọi thông báo ở **chuông** trong ứng dụng.

### Gặp sự cố?

#### Trang báo “Bạn đã chặn thông báo cho trang này”

Bạn đã lỡ chọn không cho phép nên phải mở lại quyền:
- **Chrome/Edge (máy tính, Android trong trình duyệt)**: bấm biểu tượng **ổ khóa** cạnh địa chỉ → **Thông báo** → **Cho phép**, rồi tải lại trang và bấm **Bật thông báo đẩy**.
- **Android (đã cài ứng dụng)**: nhấn giữ biểu tượng ứng dụng → **Thông tin ứng dụng** → **Thông báo** → bật.
- **iPhone**: **Cài đặt → Thông báo** → chọn ứng dụng trên màn hình chính → bật **Cho phép thông báo**.

#### iPhone báo “trình duyệt chưa hỗ trợ” hoặc không thấy nút bật

Gần như luôn do **chưa mở từ biểu tượng ở màn hình chính**, hoặc máy dưới iOS 16.4. Làm lại Bước 1 bằng **Safari**, xóa biểu tượng cũ nếu đã thêm sai rồi thêm lại, và mở ứng dụng bằng biểu tượng mới.

#### Trang báo “Máy chủ chưa bật thông báo đẩy”

Đây là cấu hình của hệ thống, bạn không tự sửa được — nhờ **Admin** kiểm tra cấu hình thông báo đẩy của hệ thống. Trong lúc chờ, bạn vẫn nhận thông báo ở chuông trong ứng dụng.

#### Đã bật nhưng không thấy thông báo hiện lên

Kiểm tra lần lượt:
- Có đang trong **giờ yên tĩnh** không (Cài đặt → Thông báo)? Thông báo được giữ lại tới hết giờ.
- Nhóm thông báo đó có bị **tắt** ở thẻ **Nhận thông báo đẩy về…** không?
- Điện thoại có đang bật **Không làm phiền / Tập trung / Tiết kiệm pin** không?
- Thông báo có phải do **chính bạn** tạo không? (Không gửi ngược lại cho người tạo.)
- Thông báo được tạo **trước khi** bạn bật thiết bị thì không đẩy lại — nhưng vẫn có trong chuông.

#### Đổi điện thoại, cài lại máy hoặc xóa ứng dụng

Làm lại Bước 1 và Bước 2 trên thiết bị mới. Thiết bị cũ không còn dùng sẽ tự bị hệ thống bỏ khỏi danh sách khi gửi tới không được.

<a id="bao-mat"></a>

## Bảo mật & thông báo của tôi

*Dành cho: Mọi người* — Bật xác thực 2 bước, đổi email đăng nhập và mật khẩu, chỉnh quyền riêng tư và cỡ chữ. (Cài ứng dụng & thông báo đẩy có mục riêng.)

Mở ở: **Cài Đặt & Hướng dẫn → Cài đặt → Bảo mật / Thông báo / Hồ sơ cá nhân**

#### Bật xác thực 2 bước (khuyến nghị — bắt buộc với vai trò quyền cao)

1. **Mở tab Bảo mật** — Bấm **Bật xác thực 2 bước**.
2. **Quét mã QR** — Dùng ứng dụng như Google Authenticator, Microsoft Authenticator, Authy hoặc 1Password quét mã, rồi nhập **mã 6 số** đang hiển thị để xác nhận.
3. **Lưu 8 mã khôi phục** — Các mã chỉ hiện **một lần**; mỗi mã dùng được một lần khi mất điện thoại. Hãy chép hoặc tải về cất nơi an toàn.

> **ℹ️ Lưu ý** — Từ đó mỗi lần đăng nhập, sau mật khẩu bạn nhập thêm mã 6 số (hoặc một mã khôi phục). Mất cả điện thoại lẫn mã khôi phục: nhờ Admin **gỡ xác thực 2 bước** cho bạn ở Cài đặt → Tài khoản (rồi bật lại).

### Email đăng nhập & mật khẩu

#### Đổi email đăng nhập

1. **Mở tab Bảo mật** _(Cài Đặt & Hướng dẫn → Cài đặt → Bảo mật)_ — Thẻ **Email đăng nhập** cho biết email bạn đang dùng để đăng nhập.
2. **Bấm “Đổi email đăng nhập”** — Nhập **email mới** và **mật khẩu hiện tại** để xác nhận, rồi bấm **Đổi email**.
3. **Đăng nhập lại bằng email mới** — Hệ thống **không gửi thư xác nhận**, nên hãy gõ cẩn thận. Từ lần sau chỉ đăng nhập được bằng email mới; email cũ không còn dùng được.

> **Email đăng nhập ≠ Email liên hệ** — Ô **Email liên hệ** trong Hồ sơ cá nhân chỉ để người quản lý liên lạc với bạn, **không dùng để đăng nhập**. Muốn đổi email đăng nhập phải làm ở tab **Bảo mật** như trên. Email phải chưa có ai dùng; nếu báo trùng, hãy chọn email khác hoặc nhờ Admin/Trưởng nhà kiểm tra.

Đổi mật khẩu cũng ở tab **Bảo mật** (thẻ **Mật khẩu**); đổi xong mọi thiết bị khác bị đăng xuất.

### Thông báo đẩy & cài ứng dụng

> **Có hướng dẫn riêng, từng bước** — Cách đưa ứng dụng ra màn hình chính (iPhone, Android, máy tính) và bật thông báo đẩy được viết chi tiết ở mục **Cài ứng dụng & bật thông báo**. Chọn nhóm thông báo muốn nhận và **giờ yên tĩnh** ở **Cài đặt → Thông báo**.

### Quyền riêng tư & đồng ý

Ở tab **Bảo mật** có các công tắc đồng ý do **chính bạn** bật/tắt (mặc định tắt): lưu hồ sơ Công giáo, cho người quản lý xem hồ sơ Công giáo, chia sẻ bảng điểm, nhu cầu học tập, gắn thẻ tên vào ảnh, nhận thông báo qua kênh thứ ba… Rút đồng ý bất cứ lúc nào, hệ thống chặn việc dùng dữ liệu đó ngay.

### Giao diện & cỡ chữ

**Cài đặt → Hồ sơ cá nhân → Giao diện**: chọn Sáng / Tối / Theo hệ thống và **cỡ chữ** Vừa / Lớn / Rất lớn (phóng cả giao diện). Bàn phím: nhấn `Tab` rồi `Enter` ở liên kết **“Bỏ qua đến nội dung chính”** để nhảy thẳng tới nội dung.

<a id="hoi-dap"></a>

## Câu hỏi thường gặp & phím tắt

*Dành cho: Mọi người* — Những tình huống hay gặp và cách xử lý nhanh.

#### Không thấy một mục trên thanh bên / mục bị mờ “Bảo trì”

Admin đang tạm ẩn phân hệ đó, hoặc vai trò của bạn không có quyền. Lưu ý một số mục đã **gộp chung**: *Diễn đàn* nằm ở tab trong **Thông báo & Diễn đàn**, *Xin phép* trong **Lịch & Xin phép**, *Báo cáo* trong **Thu Chi & Báo cáo**, *Sơ đồ nhà* trong **Thành Viên & Nhà**, *Bắt đầu thiết lập* và *Hướng dẫn* trong **Cài Đặt & Hướng dẫn**.

#### Bấm nút báo “Không có quyền”

Nhờ Admin kiểm tra vai trò của bạn ở Cài Đặt → Phân quyền & Vai trò.

#### Dữ liệu chưa cập nhật

Tải lại trang (kéo xuống trên điện thoại hoặc `F5`).

#### Quên mật khẩu

Ở trang đăng nhập bấm **Quên mật khẩu?** để nhận email đặt lại (hiệu lực 30 phút). Chưa nhận được thư: kiểm tra mục Thư rác, hoặc nhờ Admin/Trưởng nhà đặt lại — bạn nhận mật khẩu tạm và đổi ngay khi đăng nhập.

#### Mất điện thoại đang dùng xác thực 2 bước

Đăng nhập bằng một **mã khôi phục** (đã lưu lúc bật 2 bước). Hết mã: nhờ Admin **gỡ xác thực 2 bước** cho bạn ở Cài đặt → Tài khoản, rồi bật lại và lưu bộ mã mới.

#### Không nhận được thông báo đẩy

Vào **Cài đặt → Thông báo**: đã bật trên thiết bị này chưa, có đang trong giờ yên tĩnh không, nhóm thông báo có bị tắt không. iPhone cần **Thêm vào Màn hình chính** và mở ứng dụng từ biểu tượng đó. Thông báo do **chính bạn** tạo không gửi ngược lại cho bạn. Nếu trang báo máy chủ chưa bật thông báo đẩy thì nhờ Admin cấu hình. Xem đầy đủ ở mục **Cài ứng dụng & bật thông báo**.

#### Đổi email xong mà đăng nhập bằng email đó không được

Rất có thể bạn đã sửa **Email liên hệ** trong Hồ sơ — email đó **không dùng để đăng nhập**. Hãy vẫn đăng nhập bằng email cũ, rồi vào **Cài đặt → Bảo mật → Đổi email đăng nhập** để đổi đúng email đăng nhập (cần mật khẩu hiện tại).

#### Muốn dùng AI

Admin bật trong Cài đặt → Trợ lý AI; lần đầu dùng mỗi người cần bấm đồng ý.

#### Tin Zalo đến muộn hoặc có hai tin gần nhau

Cron gói miễn phí có thể lệch tới ~1 giờ. Hai tin gần nhau thường là hai loại tin khác nhau (vd. sự kiện và lịch nhắc). Admin xem từng tin trong **Tích hợp Zalo → Lịch & lịch sử**.

_[Minh họa giao diện: Phím tắt — xem trong ứng dụng]_

<a id="lich-su-kien"></a>

## Thông báo, Lịch, Sự kiện & Xin phép

*Dành cho: Thành viên, Mọi người* — Đọc thông báo, báo tham dự, điểm danh bằng QR, biểu quyết và gửi đơn xin phép.

### Thông báo & Diễn đàn

Mở ở: **Thông báo & Diễn đàn**

Mục này có hai tab: **Thông báo** (bảng tin chính thức, luật nhà) và **Diễn đàn** (trao đổi, góp ý). Thông báo có nút **Xác nhận đã đọc** thì bấm để người quản lý biết bạn đã nắm. Chuông ở góc trên là **thông báo dành riêng cho bạn** (ca trực, phiếu cần duyệt, kết quả đơn xin phép…).

### Lịch & Sự kiện

Xem lịch tháng, bấm vào ngày để xem sự kiện. Chọn một trong ba trạng thái tham dự:

_[Minh họa giao diện: Thử bấm — đây chỉ là minh họa — xem trong ứng dụng]_

#### Điểm danh sự kiện

1. **Cách 1 — quét mã QR** — Ban tổ chức mở mã QR tại chỗ. Mở camera quét mã, ứng dụng tự ghi nhận bạn có mặt.
2. **Cách 2 — nhập mã 6 số** _(Lịch & Sự kiện → Nhập mã điểm danh)_ — Gõ 6 chữ số đang hiển thị cạnh mã QR (mã đổi liên tục để chống điểm danh hộ).

> **ℹ️ Lưu ý** — Mỗi người chỉ điểm danh cho **chính mình** bằng thiết bị của mình; giờ ghi nhận là giờ máy chủ.

### Biểu quyết

Chọn phương án trong thẻ biểu quyết **trước hạn chót**. Với biểu quyết cho phép, bạn có thể đổi hoặc rút phiếu cho tới khi đóng. Biểu quyết ẩn danh không ai thấy bạn chọn gì.

### Xin phép (vắng, về muộn, ngủ ngoài, đi xa)

Mở ở: **Lịch & Xin phép → Xin phép**

#### Gửi đơn xin phép

1. **Bấm “Gửi đơn xin phép”** — Chọn **loại đơn**: vắng một sự kiện · về muộn quá giờ giới nghiêm · ngủ ngoài · tạm vắng nhiều ngày.
2. **Điền thông tin** — Vắng sự kiện: chọn sự kiện (giờ lấy theo sự kiện). Các loại khác: chọn **từ — đến** (ngày + giờ), ghi **lý do**; ngủ ngoài / tạm vắng cần cho biết **nơi đến** và nên để số liên lạc.
3. **Chờ duyệt** — Trưởng nhà/người quản lý nhận thông báo và duyệt hoặc từ chối (kèm lý do). Bạn nhận thông báo kết quả; còn đang chờ thì bạn **hủy đơn** được.

> **💡 Mẹo** — Đơn **vắng sự kiện được duyệt** thì điểm danh sự kiện đó ghi **“có phép”** và không bị trừ điểm chuyên cần. Không ai tự duyệt được đơn của chính mình.

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
- **Tài liệu phụng vụ** — Tab **Tài liệu phụng vụ** (tab thứ hai ở trang Phụng Vụ): tìm kinh, lời bài hát, PDF, YouTube (gõ không dấu cũng được).

<a id="dong-quy"></a>

## Thu chi: đóng quỹ & tiền điện nước

*Dành cho: Thành viên, Mọi người* — Xem khoản phải đóng, nộp qua QR và báo “Tôi đã đóng”.

- **Quỹ sinh hoạt** — **600.000 đ/người/năm**, đóng **300.000 đ mỗi kỳ 6 tháng** (mức do người quản lý cấu hình).
- **Điện nước** — Tính chung cả nhà mỗi tháng rồi **chia đều** cho người đang ở.

#### Đóng một khoản

1. **Chọn khoản** _(Thu Chi & Báo cáo → Các khoản thu)_ — Chọn chip khoản cần xem (“Quỹ T7–T12”, “ĐN T9”…) để biết bạn đã đóng hay chưa. _(minh họa trong ứng dụng)_
2. **Nộp qua QR** — Khoản chưa đóng có nút **Nộp qua QR**: mã QR tài khoản nhận quỹ đã có sẵn **số tiền và nội dung chuyển khoản** — quét bằng app ngân hàng là xong. _(minh họa trong ứng dụng)_
3. **Bấm “Tôi đã đóng”** — Chuyển khoản hoặc đưa tiền mặt xong, bấm nút này để báo. Thủ quỹ/Trưởng nhà đối chiếu rồi **Xác nhận** (hoặc từ chối kèm lý do) — bạn nhận thông báo kết quả.

> **💡 Mẹo** — Có nút sao chép **số tài khoản / số tiền / nội dung** ngay trên cửa sổ QR. Giữ đúng nội dung chuyển khoản để Thủ quỹ đối chiếu nhanh.

Tab **Ma trận đóng quỹ** cho thấy lịch sử các khoản của bạn theo từng kỳ/tháng.

### Ủng hộ quỹ nhà

#### Báo một khoản ủng hộ tự nguyện

1. **Mở tab Ủng hộ** _(Thu Chi & Báo cáo → Thu chi → Ủng hộ)_ — Ngoài các khoản phải đóng định kỳ, bạn có thể ủng hộ thêm cho quỹ nhà bằng tiền mặt hoặc chuyển khoản (dùng mã QR ở trang Thu chi).
2. **Bấm “Tôi đã ủng hộ”** — Nhập **số tiền**, **ngày**, **hình thức**, mã giao dịch (nếu chuyển khoản) và lời nhắn. Bạn có thể **rút lại** khi Thủ quỹ chưa xác nhận.
3. **Chờ Thủ quỹ xác nhận** — Khi tiền về, Thủ quỹ xác nhận và khoản được **ghi vào sổ quỹ**; bạn nhận thông báo. Nếu chưa thấy tiền, Thủ quỹ sẽ báo lại kèm lý do.

> **ℹ️ Lưu ý** — Bạn chỉ thấy các khoản ủng hộ **của chính mình**.

### Tổng kết của riêng tôi

Vào **Thu Chi & Báo cáo → Báo cáo & tổng kết → Tổng kết của tôi**: chọn tháng/quý/năm để xem số buổi có mặt/vắng, xin phép, trực nhật, điểm thi đua, vi phạm, đóng quỹ, ủng hộ và GPA của **riêng bạn**; bấm **Tải PDF/Excel** để lưu lại.

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

<a id="thanh-vien"></a>

## Thành viên, hồ sơ, sơ đồ nhà & cựu thành viên

*Dành cho: Thành viên, Mọi người* — Danh bạ, cập nhật hồ sơ của mình (ngành, niên khóa, ngày vào nhà), xem sơ đồ nhà và mạng lưới cựu.

Mở ở: **Thành Viên & Nhà**

Mục này có ba tab: **Thành viên** (danh bạ, đơn xin vào nhà, cựu thành viên), **Sơ đồ nhà** (phòng ở, ai ở phòng nào) và **Vi phạm & kỷ luật** (xem bên dưới).

#### Cập nhật hồ sơ của tôi

1. **Mở hồ sơ** _(Cài Đặt & Hướng dẫn → Cài đặt → Hồ sơ cá nhân)_ — Hoặc ở danh bạ chọn chính mình rồi bấm **Sửa hồ sơ**.
2. **Học vụ & Tình trạng** — Chọn **trường**, **ngành học** (chọn trong danh sách ngành phổ biến — ngành khác thì chọn **Khác** rồi tự nhập), **khóa** (ví dụ K66), **niên khóa** (năm nhập học → năm dự kiến ra trường), mã sinh viên và tình trạng (đang học, đã tốt nghiệp, bảo lưu, thôi học).
3. **Thông tin riêng tư & Công giáo** — Ngày sinh, quê quán, phụ huynh… chỉ bạn và người quản lý xem được. **Hồ sơ Công giáo** (tên thánh, giáo xứ…) chỉ lưu khi bạn đã **đồng ý** ở tab Bảo mật.

> **ℹ️ Lưu ý** — **Tháng/năm vào nhà lưu xá** do người quản lý cập nhật (ảnh hưởng việc tính quỹ theo kỳ); bạn xem được ngay trong hồ sơ.

### Cựu thành viên

Tab **Cựu thành viên** liệt kê anh em đã ra trường hoặc đã rời nhà: nghề nghiệp, nơi làm việc, thành phố. Bạn chỉ thấy thông tin của cựu **đã đồng ý chia sẻ** (có nhãn “Còn giữ liên lạc”). Cựu thành viên hoặc người quản lý sửa hồ sơ cựu bằng nút bút chì trên thẻ.

### Vi phạm & kỷ luật

Mở ở: **Thành Viên & Nhà → Vi phạm & kỷ luật**

- Tab **Của tôi**: các lần bạn được người quản lý ghi nhận vi phạm theo luật nhà, kèm **hình phạt** (lần chuỗi, đi lễ, trực nhật…), **ngày bắt đầu – kết thúc** chấp hành và tình trạng (sắp tới, đang chấp hành, đã hoàn thành, được miễn). Có ghi nhận mới bạn sẽ nhận thông báo.
- Tab **Luật & mức phạt**: danh mục các điều luật của nhà và mức phạt tương ứng — để anh em biết trước.
- Chỉ **bạn và người quản lý** xem được mục của bạn; anh em khác không thấy.

> **ℹ️ Lưu ý** — Thắc mắc về một ghi nhận? Hãy trao đổi trực tiếp với Trưởng nhà — chỉ người quản lý mới sửa, miễn hoặc xóa được.

<a id="cong-dong"></a>

## Diễn đàn, Học tập, Khoảnh khắc & Trợ lý AI

*Dành cho: Thành viên, Mọi người* — Trao đổi (tab Diễn đàn), nhập bảng điểm, xem album ảnh và hỏi trợ lý AI.

- **Diễn đàn** — Tạo chủ đề, bình luận, thích; nội dung vi phạm có thể **báo cáo**.
- **Học tập** — Nhập bảng điểm từng học kỳ kèm ảnh minh chứng; người quản lý xác minh.
- **Khoảnh khắc** — Xem/tải album ảnh sinh hoạt của nhà.

### AI nhận xét học tập

_[Minh họa giao diện: Thẻ AI nhận xét kết quả học tập — xem trong ứng dụng]_

> **Riêng tư** — AI so sánh năm học này với năm trước, cần bạn **đồng ý một lần**, và chỉ gửi số liệu đã ẩn danh — không tên, trường, mã sinh viên. Bạn có thể rút lại đồng ý bất cứ lúc nào.

### Trợ lý AI

Nút **Trợ lý AI** (góc dưới bên phải) mở khung chat **Trợ lý Lưu Xá**. Bạn hỏi bằng tiếng Việt, ví dụ “làm sao bật thông báo đẩy trên iPhone?”, “đăng ký cơm chốt mấy giờ?”, “giờ giới nghiêm là mấy giờ?”.
- Trợ lý **hướng dẫn thao tác từng bước** (dựa trên sách hướng dẫn này), tra **nội quy**, **thông báo** và **lịch** mà bạn được xem — luôn ghi **nguồn**.
- Có **nút mở thẳng trang** liên quan (vd. “Cài đặt → Thông báo”) để bạn bấm sang làm ngay.
- Nhớ vài câu trước đó nên bạn hỏi tiếp ngắn gọn được (“còn trên Android thì sao?”). Bấm biểu tượng ↻ để bắt đầu cuộc trò chuyện mới.
- Trợ lý biết **vai trò** của bạn: việc cần quyền bạn chưa có thì nó nói rõ cần nhờ ai. Nó **không** tự thao tác thay bạn và không cho xem dữ liệu của người khác.
- Máy tính: khung nổi ở góc, vẫn dùng được trang phía sau; bấm biểu tượng phóng to để mở rộng. Điện thoại: phủ kín màn hình. Enter để gửi, Shift+Enter để xuống dòng.

> **⚠️ Chú ý** — AI chỉ **gợi ý**. Thông tin quan trọng hãy hỏi lại người quản lý.

<a id="thu-quy"></a>

## Thủ quỹ: quỹ, điện nước, phiếu chi

*Dành cho: Thủ quỹ* — Lập kỳ quỹ, nhập điện nước, ghi thu, duyệt phiếu chi và xem báo cáo.

#### Tài khoản nhận quỹ (mã QR)

**Thu Chi → Tài khoản nhận quỹ → Khai báo tài khoản + mã QR**

Chọn ngân hàng, nhập số tài khoản, tên chủ tài khoản (có thể tải ảnh QR của ngân hàng). Thành viên sẽ thấy QR có sẵn số tiền + nội dung khi nộp.

> **ℹ️ Lưu ý** — Thủ quỹ, Trưởng nhà và Admin sửa được. Hãy đảm bảo tài khoản đứng tên pháp nhân/người quản lý (tránh tài khoản cá nhân) để minh bạch.

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

#### Giao dịch ngân hàng tự động (ghi thu nhanh)

**Thu Chi & Báo cáo → Tổng quan → Giao dịch ngân hàng**

Khi nhà đã kết nối SePay/Casso (Admin cấu hình — xem mục Admin), mỗi khoản **tiền vào** tài khoản hiện ở thẻ này kèm **gợi ý** khoản phải thu khớp (theo tên người nộp trong nội dung chuyển khoản, mã kỳ quỹ và đúng số tiền).

1. **Xem gợi ý** — Nhãn **Khớp cao** = đúng tên + đúng số tiền; **Có thể** = khớp tên nhưng lệch số tiền; **Tham khảo** = chỉ đúng tiền + mã kỳ.
2. **Bấm Ghi thu** — Tạo phiếu thu thật cho khoản đó (đúng số tiền giao dịch). Giao dịch nhỏ hơn số còn nợ thì ghi thu **một phần**; lớn hơn thì ghi thủ công ở bảng quỹ.
3. **Hoặc Bỏ qua** — Tiền không phải quỹ (ủng hộ, hoàn tiền…): bỏ qua kèm lý do; khôi phục lại được.

> **ℹ️ Lưu ý** — Hệ thống **không bao giờ tự ghi sổ** từ ngân hàng — luôn do Thủ quỹ bấm xác nhận. Bấm hai lần không ghi thu hai lần.

#### Ủng hộ / quyên góp vào quỹ

**Thu Chi & Báo cáo → Thu chi → Ủng hộ**

Dùng cho khoản ủng hộ **tự nguyện** (khác khoản phải đóng định kỳ), của thành viên trong nhà **hoặc người ngoài** (ân nhân, khách).
- **Ghi nhận ủng hộ**: chọn thành viên hoặc nhập tên người ngoài (có thể ghi “Ẩn danh”), số tiền, ngày, hình thức. Chọn **Đã nhận tiền** ⇒ chọn túi quỹ, khoản được **ghi vào sổ quỹ ngay** (nguồn “quyên góp”, không sửa/xóa được — sai thì dùng bút toán đảo). Chọn **Mới hứa / chưa nhận** ⇒ chỉ ghi lại, chưa vào quỹ.
- Thành viên tự báo **“Tôi đã ủng hộ”** ⇒ bạn nhận thông báo, đối chiếu sao kê rồi **Đã nhận tiền** (ghi sổ) hoặc **Chưa nhận được** (kèm lý do, thành viên sẽ thấy). Khoản mới hứa nhận tiền sau thì bấm **Đã nhận tiền** để ghi sổ.
- Đầu tab có số liệu: tổng đã nhận, số người ủng hộ (trong nhà / ngoài), số khoản chờ xác nhận, số khoản mới hứa. Lọc theo thời gian, trạng thái, tìm theo tên hoặc mã giao dịch.
- Tổng ủng hộ và số người ủng hộ cũng nằm trong **Tổng kết thành viên** theo tháng/quý/năm.

> **ℹ️ Lưu ý** — Thủ quỹ, Trưởng nhà và Admin thấy mọi khoản ủng hộ; thành viên thường chỉ thấy khoản của mình.

#### Báo cáo, thống kê & nhắc quỹ

- Mục **Báo cáo & tổng kết** (cạnh tab Thu chi): tab **Tổng kết thành viên** (từng người theo **tháng / quý / năm**, có cột đóng quỹ và ủng hộ; Thủ quỹ chỉ thấy các cột liên quan đến quỹ) và tab **Báo cáo hoạt động** (số liệu tổng hợp quý/năm, **Tải báo cáo PDF** để gửi Tỉnh Dòng, người quản lý hay phụ huynh). Xuất được **Excel/PDF**.
- Tab **Thống kê & Xuất file**: thu – chi theo **tháng / quý / năm**, biểu đồ, cơ cấu chi; nút **Xuất Excel** và **Xuất PDF**.
- **Gửi Zalo** để gửi nhóm; nút **Soạn tin nhắc quỹ** (AI) soạn lời nhắc không nêu tên ai.
- Thẻ **AI nhận xét thu chi tháng** so sánh tháng này với tháng trước (khi Admin đã bật AI). Nhận xét lưu 1 giờ để khỏi tốn lượt AI; bấm **Tạo lại** khi muốn bản mới.

<a id="truong-nha"></a>

## Trưởng nhà: điều hành nhà

*Dành cho: Trưởng nhà* — Duyệt đơn, xếp phòng, xếp người trực, đăng thông báo và cấu hình chung.

- **Thành viên & phòng** — Duyệt đơn xin vào nhà, thêm thành viên (cấp tài khoản ngay), xếp/chuyển phòng ở **Sơ đồ nhà**.
- **Trực & hậu cần** — Xếp 2 bạn trực mỗi tuần, nhắc, chấm điểm; tiếp nhận báo hỏng.
- **Tài chính** — Đồng ký phiếu chi lớn, xác nhận chốt sổ tháng, duyệt miễn/giảm quỹ.

#### Thành viên & phòng ở

- **Thành Viên & Nhà → Thành viên → Đơn chờ duyệt**: duyệt đơn xin vào nhà và xếp phòng.
- **Thêm thành viên** (có thể cấp tài khoản ngay — mật khẩu tạm hiện **một lần**, hãy gửi riêng cho người đó). Nhớ chọn **tháng/năm vào nhà** — quỹ theo kỳ chỉ tính cho người đã vào nhà trước hạn nộp.
- **Sửa hồ sơ** thành viên: trường, **ngành** (chọn trong danh sách hoặc tự nhập), **niên khóa**, **tháng/năm vào nhà**, tình trạng học tập.
- **Sơ đồ nhà** (tab cạnh Thành viên): xếp/chuyển phòng (máy tính: kéo thả; điện thoại: danh sách thẻ), sửa cấu trúc phòng.

#### Nhập nhiều thành viên từ Excel / CSV

**Thành Viên & Nhà → Thành viên → Nhập từ Excel**

1. **Tải tệp mẫu** — Bấm **Tải tệp mẫu (.xlsx)**, điền mỗi người một dòng. Chỉ cột **Họ và tên** là bắt buộc; cột nào chưa có thông tin cứ để trống hoặc xóa cột. Tệp mẫu có 3 sheet: **Thanh vien** (các ô đã đặt dạng Text để Excel không làm mất số 0 đầu của SĐT/CCCD), **Huong dan** (giải thích từng cột kèm ví dụ) và **Danh muc** (trường, phòng, ngành, tình trạng hợp lệ của lưu xá).
2. **Chọn tệp để kiểm tra** — Hệ thống kiểm tra **từng dòng** trước khi thêm: số điện thoại/email sai hoặc **trùng** (trong tệp hoặc với người đã có), **CCCD** sai hoặc trùng trong tệp (trùng với người đã có thì dòng đó báo lỗi lúc bấm thêm), ngày hoặc năm sai định dạng, năm ra trường trước năm nhập học, trường/phòng không có trong danh mục… Dòng lỗi bị bỏ qua, dòng có cảnh báo vẫn thêm được.
3. **Xác nhận thêm** — Bấm **Thêm N thành viên**. Tối đa 300 dòng mỗi lần.

**Nhập được 24 cột:** họ và tên, tên gọi, giới tính, số điện thoại, email, ẩn SĐT, ngày vào nhà (đủ ngày hoặc chỉ tháng/năm), phòng (theo mã hoặc tên), ngày sinh, số CCCD/CMND (lưu mã hóa), quê quán, địa chỉ thường trú, tình trạng học tập, trường, ngành, khóa, **năm nhập học, năm ra trường (niên khóa)**, mã sinh viên, họ tên và SĐT cha/mẹ, định mức quỹ riêng.

> **ℹ️ Lưu ý** — Nhập hàng loạt **không** gồm thông tin Công giáo (tên thánh, giáo phận, giáo xứ, bí tích — cần chính thành viên đồng ý, thành viên tự điền ở Cài đặt → Hồ sơ), **ảnh đại diện** và **tài khoản đăng nhập** (cấp riêng ở Cài đặt → Tài khoản).

> **ℹ️ Lưu ý** — Thông tin học vụ chỉ lưu khi dòng đó xác định được **Trường**. Cột riêng tư (ngày sinh, CCCD, quê quán, địa chỉ, cha/mẹ) cần quyền ghi thông tin riêng tư; ẩn SĐT, học vụ và định mức quỹ cần quyền sửa hồ sơ thành viên (Trưởng nhà và Admin có đủ) — thiếu quyền thì cột đó bị bỏ qua và hệ thống báo ngay ở màn hình kiểm tra.

#### Đơn xin phép của anh em

**Lịch & Xin phép → Xin phép → Chờ tôi duyệt**

Đơn mới gửi thông báo cho Trưởng nhà/Admin; số đơn chờ hiện ở thanh bên. Bấm **Duyệt** hoặc **Từ chối** (từ chối phải ghi lý do ≥ 5 ký tự, người xin sẽ thấy). Đơn **vắng sự kiện** được duyệt tự ghi điểm danh “có phép”. Bạn không duyệt được đơn của chính mình.

#### Cựu thành viên

**Thành Viên & Nhà → Thành viên → Cựu thành viên**

Khi thành viên ra trường hoặc rời nhà, đổi **trạng thái** ở hồ sơ (Cựu thành viên / Đã rời). Ở tab **Cựu thành viên** bấm bút chì để ghi **năm ra trường, nghề nghiệp, nơi làm việc, thành phố**. Chỉ bật **“Còn giữ liên lạc & đồng ý chia sẻ”** sau khi đã hỏi ý kiến người đó — khi bật, các thành viên khác mới xem được. Có nút **Xuất Excel** danh sách cựu.

#### Trực vệ sinh theo tuần

1. **Xếp người trực** _(Hậu Cần & Trực → Xếp người trực)_ — Chọn 2 bạn cho mỗi tuần (có nút **Gợi ý luân phiên**). Hệ thống báo cho người được xếp.
2. **Nhắc / gửi Zalo** — Nhắc người trực hoặc gửi lịch vào nhóm Zalo bằng nút trên thẻ tuần.
3. **Đánh giá cuối tuần** — Chấm điểm 0–10, nhận xét, có thể **yêu cầu trực lại**.

_[Minh họa giao diện: duty-week — xem trong ứng dụng]_

#### Luật nhà

**Thông báo → Luật nhà**

Soạn từng mục, thêm giờ giấc, sắp xếp thứ tự, tải PDF. Thành viên đọc và tải PDF ở cùng chỗ.

#### Trang công khai: bài viết, hỏi đáp, đăng ký tìm hiểu

**Trang công khai**

Người ngoài xem được (**không cần đăng nhập**): `/tin-tuc` (bản tin, tuyển sinh), `/gioi-thieu`, `/lien-he` (đăng ký tìm hiểu), `/hoi-dap`, `/thu-vien` (album), `/ung-ho`. Các liên kết chính cũng nằm ở chân trang. Mục **Trang công khai** ở thanh bên có ba tab: **Bài viết**, **Hỏi đáp**, **Đăng ký tìm hiểu**.

#### Bài viết

1. **Soạn bài** _(Trang công khai → Viết bài mới)_ — Nhập tiêu đề, tóm tắt (hiện khi chia sẻ link), chọn chuyên mục (Tuyển sinh, Tin tức, Hoạt động, Chia sẻ, Thông báo), tải **ảnh bìa**, thêm **thẻ** (vd. “tuyển sinh 2026”). Thanh công cụ giúp in đậm, tạo tiêu đề, danh sách, trích dẫn và **chèn ảnh vào bài**; khung **Trợ lý AI** bên phải giúp gợi ý đề tài, viết nháp, chỉnh văn (khi Admin đã bật AI).
2. **Lưu nháp, đăng hoặc hẹn giờ** — **Lưu nháp** thì chỉ người quản lý thấy. **Đăng công khai** thì bài lên ngay. Bật **Hẹn giờ đăng** để bài tự hiện đúng ngày giờ đã chọn (hiện nhãn “Hẹn giờ” ở danh sách; chưa đến giờ thì người ngoài chưa thấy).
3. **Lịch sử chỉnh sửa** — Nút **Lịch sử** ở trình soạn giữ 25 bản gần nhất; xem lại và **Khôi phục** khi lỡ sửa nhầm.
4. **Chia sẻ** — Ở danh sách bài, bấm biểu tượng **chép liên kết** rồi dán vào Zalo/Facebook — hình bìa và tóm tắt hiện đẹp khi chia sẻ.

> **Lưu ý** — Đừng đăng số điện thoại, địa chỉ cá nhân hay hình ảnh của người chưa đồng ý. Muốn bài hiện lớn đầu trang, bấm ngôi sao **Nổi bật**. Gỡ bài về bản nháp hoặc xóa bài thì link cũ không mở được nữa.

#### Hỏi đáp

Tab **Hỏi đáp**: thêm câu hỏi thường gặp (chi phí, điều kiện vào ở, giờ giấc…), sắp thứ tự bằng mũi tên, **ẩn** câu chưa cần hiện. Câu trả lời hỗ trợ **đậm**, danh sách, liên kết. Trang `/hoi-dap` giúp Google hiển thị câu trả lời trực tiếp.

#### Đăng ký tìm hiểu

Người ngoài điền biểu mẫu ở `/lien-he` → xuất hiện ở tab **Đăng ký tìm hiểu** (kèm thông báo và huy hiệu số đơn mới). Liên hệ rồi đổi trạng thái (Mới → Đã liên hệ → Đã đến thăm → Đã nhận / Không nhận / Rác) và ghi chú để cả nhóm theo dõi. Biểu mẫu có chống thư rác (ô bẫy, giới hạn 3 đơn/giờ mỗi địa chỉ). Quyền xử lý: `application.review`.

#### Giới thiệu, thư viện ảnh & ủng hộ

- **Giới thiệu**: viết ở **Cài đặt → Cấu hình chung → Nội dung trang công khai** (hỗ trợ ## tiêu đề, **đậm**, danh sách). Để trống thì dùng đoạn mặc định.
- **Thư viện ảnh**: ở **Khoảnh Khắc → Sửa album** (người có quyền kiểm duyệt album) bật **“Hiện ở trang công khai”** — người ngoài xem được TOÀN BỘ ảnh album, nên chỉ bật khi những người trong ảnh đã đồng ý.
- **Ủng hộ**: cũng ở Nội dung trang công khai — bật **Trang Ủng hộ** để hiện mã VietQR của tài khoản nhận quỹ (Thủ quỹ cài ở Thu chi) cùng lời nhắn.

Quyền đăng bài (`article.manage`) mặc định có ở Trưởng nhà, Admin và Trưởng ban Truyền thông; Admin chỉnh được ở Cài đặt → Phân quyền & Vai trò.

#### Tổng kết từng thành viên & cả nhà (tháng / quý / năm)

**Thu Chi & Báo cáo → Báo cáo & tổng kết → Tổng kết thành viên**

Chọn **tháng, quý hoặc năm** để xem **mỗi thành viên một dòng**: số buổi có mặt / trễ / vắng, số đơn xin phép (về muộn, ngủ ngoài…), trực vệ sinh (số tuần, điểm trung bình), điểm thi đua, vi phạm và hình phạt, đóng quỹ (còn nợ), ủng hộ, GPA.
- Phía trên là số liệu **cả nhà**: số sự kiện theo loại (**hành hương**, **lần chuỗi**…), tỉ lệ có mặt, tổng đơn xin phép, vi phạm, đóng quỹ, tổng ủng hộ và số người ủng hộ.
- Sắp xếp theo vắng nhiều nhất, xin phép nhiều nhất, vi phạm nhiều nhất, nợ quỹ nhiều nhất, điểm thi đua; tìm theo tên/phòng.
- **Tải Excel** (có thêm trang chi tiết **Vi phạm** và **Ủng hộ**) hoặc **Tải PDF** (khổ ngang, có khung chữ ký).
- Mỗi cột chỉ hiện khi bạn có quyền xem mục đó; **GPA** chỉ có với thành viên đã đồng ý chia sẻ bảng điểm cho người quản lý.

> **💡 Mẹo** — Cuối năm chọn **Theo năm** rồi tải Excel để tổng kết: ai vắng bao nhiêu lần, bị phạt gì, đóng góp ra sao. Muốn đếm đúng số buổi lần chuỗi / hành hương, hãy chọn đúng **loại sự kiện** (“Lần chuỗi & Kinh nguyện chung”, “Hành hương”) khi tạo sự kiện.

#### Vi phạm & kỷ luật

**Thành Viên & Nhà → Vi phạm & kỷ luật**

##### Thiết lập và ghi nhận

1. **Nhập danh mục luật phạt** _(Vi phạm & kỷ luật → Luật & mức phạt)_ — Bấm **Thêm điều luật** (mã, tên, mức phạt gợi ý: **lần chuỗi / đi lễ / trực nhật / khác** + số lượng). Đã có **Luật nhà** rồi thì bấm **Nhập từ Luật nhà** để lấy sẵn các điều khoản. Điều không còn dùng thì **Ẩn** (lịch sử vẫn giữ).
2. **Ghi vi phạm** _(Vi phạm & kỷ luật → Cả nhà → Ghi vi phạm)_ — Chọn **thành viên**, **điều luật** (hoặc tự ghi tên điều vi phạm), **ngày vi phạm**, ghi chú. Mức phạt tự điền theo điều luật, bạn sửa được: **loại, số lượng**, **ngày bắt đầu – kết thúc** chấp hành. Thành viên nhận thông báo.
3. **Theo dõi & đóng việc** — Mỗi ghi nhận tự cho biết **sắp chấp hành / đang chấp hành / quá hạn chưa xong**. Khi đã làm xong bấm **Hoàn thành**; muốn bỏ hình phạt bấm **Miễn** (ghi lý do). **Mở lại**, **Sửa**, **Xóa** khi nhập nhầm.

> **ℹ️ Lưu ý** — Chỉ Trưởng nhà và Admin ghi/sửa/xóa vi phạm (quyền `discipline.manage`); xem cả nhà cần `discipline.read`. Thành viên luôn xem được **của chính mình**. Vi phạm được cộng vào **Tổng kết thành viên** (số lần, tổng lần chuỗi / ngày đi lễ / ca trực nhật bị phạt, không tính khoản được miễn).

#### Báo cáo hoạt động quý / năm

**Thu Chi & Báo cáo → Báo cáo & tổng kết → Báo cáo hoạt động**

Chọn **theo quý** hoặc **theo năm**: xem nhanh sĩ số, vào/ra nhà, thu chi và tỉ lệ thu quỹ, số sự kiện và tỉ lệ có mặt, ca trực hoàn thành, báo hỏng. Bấm **Tải báo cáo PDF** để có bản in có khung chữ ký. Quyền xem: `report.read` (Trưởng nhà, Admin, Thủ quỹ). Báo cáo này **không có dữ liệu cá nhân** — muốn xem từng người, dùng tab **Tổng kết thành viên**.

#### Thông báo, sự kiện, diễn đàn

Đăng thông báo (chọn đối tượng nhận, ghim, yêu cầu xác nhận), tạo sự kiện + mã QR điểm danh, tạo biểu quyết, kiểm duyệt diễn đàn. Khi đăng thông báo hoặc tạo sự kiện có thể tick **đăng cả vào nhóm Zalo**.

#### Lịch phụng vụ, lễ Bổn mạng & đi lễ

**Lịch & Sự kiện → Cấu hình lịch phụng vụ**

- Đặt **ngày và tên Bổn mạng** của nhà (tô vàng ⭐, báo trước cho anh em, và — nếu bật — bắt buộc check-in kèm ảnh).
- Thêm **ngày đặc biệt** (kỷ niệm thành lập, lễ tạ ơn, tĩnh tâm…), chọn số ngày báo trước, giờ nhắc check-in, nạp **Lời Chúa**.
- Nhập **ý lễ** của nhà cho từng ngày; duyệt check-in và xem **Tổng hợp cả nhà** (ai vắng ngày nào) ở tab Điểm Danh & Check-in.

#### Cấu hình chung

- **Cài Đặt → Cấu hình chung & Định mức**: thông tin nhà, mức quỹ mỗi kỳ, số tháng mỗi kỳ, hạn nộp, ngưỡng duyệt chi, giờ chốt cơm, giờ kinh tối…
- **Cài Đặt → Danh mục học tập**: trường đại học, năm học kèm học kỳ, năm học hiện hành, nhiệm kỳ người quản lý. Mục đang có dữ liệu thì không xóa được (chỉ tạm ẩn).

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
| **Gỡ xác thực 2 bước** | Khi người đó mất điện thoại và mã khôi phục: họ đăng nhập chỉ bằng mật khẩu, bị đăng xuất mọi thiết bị và cần bật lại 2 bước |
| **Vai trò** | Đánh dấu các vai trò người đó giữ (hệ thống và tự tạo) |

> **ℹ️ Lưu ý** — Không thao tác được trên **chính tài khoản của mình**. Muốn đổi mật khẩu của mình: menu tài khoản → Đổi mật khẩu.

#### Vai trò & quyền

**Cài Đặt → Phân quyền & Vai trò**

- Bốn vai trò hệ thống (Admin, Trưởng nhà, Thủ quỹ, Thành viên) không xóa được và bộ quyền cố định (**Admin luôn có toàn bộ quyền**).
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

#### Dọn dữ liệu rác (xóa vĩnh viễn)

Admin có thêm nút **Xóa** (biểu tượng thùng rác) để dọn các bản ghi không cần thiết — ví dụ dữ liệu thử:
- **Đơn xin phép** (Lịch & Xin phép → Xin phép): xóa được ở mọi trạng thái.
- **Báo hỏng / sự cố** (Hậu Cần & Trực → Báo hỏng): nút thùng rác cạnh ngày ở phần chi tiết.
- **Ý cầu nguyện** (Phụng Vụ): nút **Xóa** ở mỗi ý.
- **Đăng ký tìm hiểu** (Bài viết công khai → Đăng ký tìm hiểu).
- **Đơn xin vào nhà đã xử lý** (Thành Viên → tab Đơn chờ duyệt, tích “Hiện cả đơn đã xử lý”); đơn đang chờ phải duyệt hoặc từ chối trước.
Xóa là **vĩnh viễn**, luôn hỏi xác nhận và vẫn để lại dấu vết ở nhật ký hoạt động. Dữ liệu **tài chính** (phiếu chi, khoản thu, sổ quỹ) **không xóa được** — dùng Hủy/Hoàn tác để sổ quỹ luôn khớp. Quyền này tên là **data.purge**, chỉ Admin có.

#### Trợ lý AI

**Cài Đặt → Trợ lý AI**: bật công tắc tổng và từng tính năng (hỏi đáp nội quy, soạn tin nhắc quỹ, phân loại sự cố, tóm tắt, soát nội dung, nhận xét thu chi, nhận xét học tập), đặt ngân sách tháng, xem nhật ký. Khóa API Groq/Gemini đặt ở biến môi trường của máy chủ (`GROQ_API_KEY`, `GEMINI_API_KEY` — trên Vercel).

### Nhật ký hoạt động (chỉ Admin)

**Cài Đặt → Nhật ký hoạt động**

_[Minh họa giao diện: Mỗi thao tác: ai, làm gì, kết quả, giờ, thiết bị — xem trong ứng dụng]_

- **Thao tác** — Mọi thao tác ghi (tạo, sửa, xóa, duyệt, gửi Zalo…). **Không lưu nội dung** người dùng nhập.
- **Đăng nhập** — Đăng nhập thành công/thất bại, lý do, IP, thiết bị.
- **Thay đổi dữ liệu** — Giá trị **trước → sau** của từng bản ghi (bấm để mở).

Lọc theo **người dùng**, khoảng thời gian, phân hệ, kết quả hoặc tìm theo từ khóa. Nhật ký giữ **180 ngày**. Hồ sơ cá nhân nhạy cảm và điểm học tập chỉ Trưởng nhà xem được nên không hiện ở đây.

> **Admin có toàn quyền** — Admin có **mọi quyền** của hệ thống — và quyền thêm về sau cũng tự được cấp. Admin cũng được tính là Trưởng nhà + Thủ quỹ khi duyệt chi. Những điều vẫn giữ nguyên cho MỌI người, kể cả Admin: **không tự duyệt phiếu chi / đơn xin phép do chính mình lập** (cần người khác duyệt), và dữ liệu cần sự **đồng ý của thành viên** (hồ sơ Công giáo, chia sẻ bảng điểm…) chỉ xem được khi họ đã đồng ý. Mỗi lần xem CCCD đầy đủ đều phải nhập lý do và được ghi vào nhật ký.

#### Bảo mật tài khoản: 2 bước, quên mật khẩu, thông báo đẩy, email

- **Xác thực 2 bước** (TOTP + 8 mã khôi phục) bắt buộc với vai trò quyền cao (Admin, Trưởng nhà, Thủ quỹ — cấu hình ở **Cài đặt → Cấu hình chung → Bảo mật đăng nhập**). Người mất điện thoại và mã khôi phục: **Cài đặt → Tài khoản → Quản lý → Gỡ xác thực 2 bước**.
- **Quên mật khẩu** tự phục vụ qua email cần biến `RESEND_API_KEY` và `EMAIL_FROM` (tên miền đã xác minh ở Resend). Thiếu thì người dùng nhờ Admin đặt lại mật khẩu.
- **Thông báo đẩy** cần `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (sinh bằng `pnpm env:keys`). Thiếu thì chỉ có thông báo trong ứng dụng.
- Biến môi trường đặt ở **Vercel → Settings → Environment Variables** rồi **deploy lại**. Chi tiết và cách xoay khóa: file `VAN_HANH.md` trong mã nguồn.

#### Giao dịch ngân hàng tự động (SePay / Casso)

Đặt biến `BANK_WEBHOOK_SECRET` (≥ 16 ký tự) rồi trong SePay/Casso tạo webhook tới `https://<tên miền>/api/v1/public/bank-webhook` với cùng khóa xác thực. Tiền vào tài khoản sẽ hiện ở **Thu Chi & Báo cáo → Tổng quan → Giao dịch ngân hàng** để Thủ quỹ xác nhận ghi thu (xem mục Thủ quỹ). Webhook chỉ **lưu** giao dịch, không tự ghi sổ.

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
