// Nội dung "Hướng dẫn sử dụng" — dùng chung cho trang /huong-dan và file docs/HUONG_DAN_SU_DUNG.md
// (xuất bằng: node --experimental-strip-types scripts/docs/export-guide.mjs). Không import gì để Node đọc trực tiếp được.
//
// Nội dung là danh sách KHỐI có kiểu (bước, ghi chú, đường dẫn, bảng, thẻ, minh họa giao diện…) để trang hiển thị trực quan.
// Chữ trong khối hỗ trợ **đậm**, `mã`, [liên kết](/duong-dan).

export type GuideAudience = "all" | "member" | "treasurer" | "house_head" | "admin" | "custom";

export type GuideIcon =
  | "start" | "bell" | "calendar" | "church" | "wallet" | "meal" | "wrench" | "rules" | "users" | "sparkles"
  | "shield" | "settings" | "zalo" | "help" | "school" | "activity" | "home" | "book" | "receipt";

/** Minh họa giao diện dựng bằng chính các thành phần của ứng dụng (xem GuideDemos.tsx). */
export type GuideDemo =
  | "login" | "layout-desktop" | "layout-mobile" | "rsvp" | "calendar-legend" | "pay-states" | "pay-qr" | "meal"
  | "duty-week" | "zalo-bubble" | "zalo-calendar" | "approval-flow" | "fund-preview" | "roles" | "activity-log"
  | "ai-card" | "shortcuts" | "expense-states";

export type CalloutTone = "tip" | "info" | "warn" | "danger";

export type GuideBlock =
  | { t: "md"; text: string }
  | { t: "heading"; text: string }
  | { t: "callout"; tone: CalloutTone; title?: string; text: string }
  | { t: "steps"; title?: string; items: { title: string; text?: string; path?: string[]; demo?: GuideDemo }[] }
  | { t: "path"; label?: string; items: string[] }
  | { t: "cards"; cols?: 2 | 3; items: { icon: GuideIcon; title: string; text: string }[] }
  | { t: "demo"; name: GuideDemo; caption?: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "tabs"; tabs: { label: string; blocks: GuideBlock[] }[] }
  | { t: "accordion"; items: { title: string; blocks: GuideBlock[] }[] };

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  icon: GuideIcon;
  /** Ai cần đọc mục này (vai trò hệ thống; "custom" = vai trò tự tạo như Trưởng ban Phụng vụ/Ẩm thực). */
  audience: GuideAudience[];
  blocks: GuideBlock[];
}

export const GUIDE_AUDIENCE_LABEL: Record<GuideAudience, string> = {
  all: "Mọi người",
  member: "Thành viên",
  treasurer: "Thủ quỹ",
  house_head: "Trưởng nhà",
  admin: "Admin",
  custom: "Trưởng ban (vai trò tự tạo)",
};

export const GUIDE_INTRO = "Ứng dụng quản lý sinh hoạt của Lưu Xá Phanxicô. Mỗi người thấy và làm được những việc theo **vai trò** của mình. Một người có thể giữ nhiều vai trò (ví dụ Trưởng nhà + Thành viên).";

export const GUIDE_ROLES: { role: GuideAudience; title: string; text: string }[] = [
  { role: "member", title: "Thành viên", text: "Mọi anh em trong nhà: xem thông báo, lịch, đăng ký cơm, lịch trực vệ sinh, luật nhà, đóng quỹ, nhập bảng điểm…" },
  { role: "treasurer", title: "Thủ quỹ", text: "Giữ quỹ: lập kỳ thu quỹ, nhập tiền điện nước, ghi thu, lập/duyệt phiếu chi, sổ quỹ." },
  { role: "house_head", title: "Trưởng nhà", text: "Điều hành: duyệt đơn vào nhà, thành viên & phòng ở, trực nhật, đồng ký chi, thông báo, nhắc tự động qua Zalo, cấu hình chung." },
  { role: "admin", title: "Admin", text: "Quản trị hệ thống với **toàn quyền**: có mọi quyền của mọi vai trò (kể cả quyền được thêm về sau) — tài khoản, vai trò & quyền, phân hệ, danh mục, trợ lý AI, nhật ký hoạt động, và cả duyệt chi, duyệt đơn xin phép, ghi thu, đăng bài công khai… Chỉ các quy tắc **tách người** (không tự duyệt phiếu/đơn của chính mình) vẫn áp dụng cho mọi người." },
  { role: "custom", title: "Trưởng ban (vai trò tự tạo)", text: "Trưởng ban Phụng vụ, Ẩm thực, Truyền thông… do Admin tạo và chọn quyền." },
];

/** Lối tắt "Bắt đầu nhanh" ở đầu trang. */
export const GUIDE_QUICK: { icon: GuideIcon; title: string; text: string; target: string }[] = [
  { icon: "start", title: "Đăng nhập lần đầu", text: "Nhận mật khẩu tạm, đổi mật khẩu", target: "bat-dau" },
  { icon: "wallet", title: "Đóng quỹ bằng QR", text: "Quét mã, bấm “Tôi đã đóng”", target: "dong-quy" },
  { icon: "calendar", title: "Điểm danh sự kiện", text: "Quét QR hoặc nhập mã 6 số", target: "lich-su-kien" },
  { icon: "meal", title: "Đăng ký cơm", text: "Trước giờ chốt 09:00 / 15:00", target: "bep-com" },
  { icon: "bell", title: "Cài app & bật thông báo", text: "Đưa ra màn hình chính, nhận thông báo đẩy", target: "cai-ung-dung" },
  { icon: "shield", title: "Bảo mật tài khoản", text: "Xác thực 2 bước, đổi email, mật khẩu, cỡ chữ", target: "bao-mat" },
];

export const GUIDE_SECTIONS: GuideSection[] = [
  // ---------------------------------------------------------------- Bắt đầu
  {
    id: "bat-dau",
    title: "Bắt đầu: đăng nhập & làm quen giao diện",
    summary: "Đăng nhập, đổi mật khẩu, nhận biết các khu vực trên màn hình và khai báo tài khoản nhận tiền.",
    icon: "start",
    audience: ["all"],
    blocks: [
      {
        t: "steps",
        title: "Đăng nhập lần đầu",
        items: [
          { title: "Nhận tài khoản", text: "Admin hoặc Trưởng nhà gửi cho bạn **email** và **mật khẩu tạm** (gửi riêng, không đăng lên nhóm)." },
          { title: "Đăng nhập", text: "Mở ứng dụng, nhập email và mật khẩu tạm.", demo: "login" },
          { title: "Đổi mật khẩu", text: "Lần đầu hệ thống bắt buộc đặt mật khẩu mới: **ít nhất 10 ký tự**, nên có cả chữ và số." },
        ],
      },
      { t: "callout", tone: "tip", title: "Quên mật khẩu?", text: "Ở trang đăng nhập bấm **Quên mật khẩu?**, nhập email — ứng dụng gửi đường dẫn đặt lại (có hiệu lực **30 phút**, dùng một lần). Nếu chưa nhận được thư hoặc nhà chưa cấu hình email, nhờ Admin/Trưởng nhà vào **Cài đặt → Tài khoản → Đặt lại mật khẩu** để nhận mật khẩu tạm." },
      { t: "heading", text: "Làm quen giao diện" },
      {
        t: "tabs",
        tabs: [
          {
            label: "Máy tính",
            blocks: [
              { t: "demo", name: "layout-desktop", caption: "Giao diện trên máy tính" },
              { t: "md", text: "- **① Thanh bên trái** liệt kê các phân hệ. Vài mục **gộp chung** cho gọn (*Thông báo & Diễn đàn*, *Lịch & Xin phép*, *Thu Chi & Báo cáo*, *Thành Viên & Nhà*, *Cài Đặt & Hướng dẫn*) — trong trang có **thanh tab** để chuyển qua lại giữa các phần.\n- **② Tìm kiếm nhanh** (phím tắt `Ctrl + K`): mở trang, tìm anh em, tạo nhanh việc.\n- **③ Chuông**: thông báo dành cho bạn (ca trực, phiếu chi cần duyệt, phản hồi…).\n- **④ Tài khoản**: hồ sơ, đổi mật khẩu, đăng xuất." },
            ],
          },
          {
            label: "Điện thoại",
            blocks: [
              { t: "demo", name: "layout-mobile", caption: "Giao diện trên điện thoại" },
              { t: "md", text: "- **Thanh điều hướng dưới cùng**: các mục chính. Mục không có ở đó nằm trong nút **Thêm**.\n- Chạm vào một bài viết/thông báo/thành viên sẽ mở trang chi tiết; bấm **Quay lại** (hoặc nút Back của điện thoại) để trở về." },
              { t: "callout", tone: "tip", title: "Dùng như một ứng dụng", text: "Trong trình duyệt điện thoại chọn **Thêm vào màn hình chính** (iPhone: nút Chia sẻ → Thêm vào Màn hình chính) để mở ứng dụng nhanh như app cài sẵn và nhận **thông báo đẩy** — làm theo từng bước ở mục “Cài ứng dụng & bật thông báo” ngay bên dưới." },
            ],
          },
        ],
      },
      { t: "callout", tone: "tip", title: "Giao diện tối", text: "Bấm biểu tượng **mặt trăng/mặt trời** ở thanh trên cùng để đổi giữa giao diện sáng và tối. Muốn tự theo cài đặt của máy: **Cài đặt → Hồ sơ cá nhân → Giao diện → Hệ thống**. Ở đó cũng chọn được **cỡ chữ** (Vừa / Lớn / Rất lớn) cho dễ đọc. Lựa chọn nhớ riêng cho từng thiết bị." },
      { t: "callout", tone: "info", text: "Mục bị làm mờ với nhãn **Bảo trì**: Admin đang tạm ẩn phân hệ đó. Dữ liệu vẫn giữ nguyên, bật lại là dùng tiếp." },
      {
        t: "steps",
        title: "Khai báo tài khoản nhận tiền của tôi",
        items: [
          { title: "Mở hồ sơ", path: ["Thành Viên & Nhà", "Chính tôi"], text: "Chọn chính mình để xem hồ sơ; bấm **Sửa hồ sơ** để cập nhật thông tin được phép." },
          { title: "Khai báo tài khoản", path: ["Hồ sơ", "Tài khoản nhận tiền", "Khai báo tài khoản"], text: "Chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản (có thể tải ảnh QR của ngân hàng)." },
          { title: "Xong", text: "Ứng dụng tự tạo mã **VietQR** để anh em hoặc Thủ quỹ chuyển khoản/hoàn ứng cho bạn nhanh và đúng." },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Cài ứng dụng & bật thông báo
  {
    id: "cai-ung-dung",
    title: "Cài ứng dụng & bật thông báo",
    summary: "Đưa ứng dụng ra màn hình chính điện thoại và bật thông báo đẩy — làm một lần cho mỗi thiết bị, có hướng dẫn riêng cho iPhone, Android và máy tính.",
    icon: "bell",
    audience: ["all"],
    blocks: [
      { t: "callout", tone: "info", title: "Để làm gì?", text: "Cài ứng dụng ra **màn hình chính** thì mở nhanh như app thường, toàn màn hình. Bật **thông báo đẩy** thì điện thoại báo ngay khi có thông báo mới (ca trực, sự kiện, kết quả đơn xin phép, phiếu cần duyệt…) **kể cả khi bạn không mở ứng dụng**. Chỉ cần làm **một lần cho mỗi thiết bị**." },
      { t: "callout", tone: "warn", title: "iPhone / iPad: bắt buộc cài ra màn hình chính trước", text: "iPhone chỉ nhận thông báo đẩy khi ứng dụng đã được **Thêm vào Màn hình chính** và bạn mở ứng dụng từ biểu tượng đó. Máy cần **iOS 16.4 trở lên** (xem ở Cài đặt → Cài đặt chung → Giới thiệu → Phiên bản iOS; thấp hơn thì vào Cài đặt chung → Cập nhật phần mềm)." },

      { t: "heading", text: "Bước 1 — Đưa ứng dụng ra màn hình chính" },
      {
        t: "tabs",
        tabs: [
          {
            label: "iPhone / iPad",
            blocks: [
              {
                t: "steps",
                items: [
                  { title: "Mở bằng Safari", text: "Mở ứng dụng **Safari** (biểu tượng la bàn xanh), vào địa chỉ ứng dụng của nhà rồi đăng nhập. Đừng mở từ trong Zalo, Messenger hay Facebook — trình duyệt nhúng trong các ứng dụng đó **không có** nút thêm vào màn hình chính." },
                  { title: "Bấm nút Chia sẻ", text: "Là biểu tượng **ô vuông có mũi tên hướng lên**: ở thanh dưới cùng (iPhone) hoặc góc trên bên phải (iPad)." },
                  { title: "Chọn “Thêm vào Màn hình chính”", text: "Vuốt danh sách hiện ra lên trên, tìm dòng **Thêm vào Màn hình chính** (biểu tượng dấu +) và bấm vào." },
                  { title: "Bấm “Thêm”", text: "Để nguyên tên gợi ý rồi bấm **Thêm** ở góc trên bên phải. Biểu tượng ứng dụng xuất hiện ở màn hình chính." },
                  { title: "Mở ứng dụng từ biểu tượng mới", text: "Từ giờ **luôn mở bằng biểu tượng này**, không mở lại bằng Safari. Làm Bước 2 ngay trong cửa sổ vừa mở." },
                ],
              },
            ],
          },
          {
            label: "Android",
            blocks: [
              {
                t: "steps",
                items: [
                  { title: "Mở bằng Chrome", text: "Vào địa chỉ ứng dụng của nhà bằng **Chrome** và đăng nhập." },
                  { title: "Cài ứng dụng", path: ["Cài Đặt & Hướng dẫn", "Cài đặt", "Thông báo"], text: "Ở thẻ **Cài ứng dụng lên màn hình chính** bấm **Cài ứng dụng**, rồi bấm **Cài đặt** khi Chrome hỏi." },
                  { title: "Hoặc cài bằng menu Chrome", text: "Nếu không thấy nút trên: bấm **dấu ba chấm ⋮** góc trên bên phải của Chrome → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**) → xác nhận. Tên mục có thể hơi khác tùy máy." },
                  { title: "Mở từ biểu tượng mới", text: "Biểu tượng xuất hiện ở màn hình chính hoặc trong danh sách ứng dụng. Mở ứng dụng bằng biểu tượng đó rồi làm Bước 2." },
                ],
              },
            ],
          },
          {
            label: "Máy tính",
            blocks: [
              {
                t: "steps",
                items: [
                  { title: "Mở bằng Chrome hoặc Edge", text: "Vào địa chỉ ứng dụng và đăng nhập." },
                  { title: "Cài ứng dụng (không bắt buộc)", text: "Bấm biểu tượng **cài đặt** ở bên phải thanh địa chỉ (hình màn hình nhỏ có mũi tên), hoặc menu **⋮** → **Cài đặt ứng dụng**; hoặc bấm nút **Cài ứng dụng** ở Cài đặt → Thông báo. Ứng dụng sẽ mở thành cửa sổ riêng, có biểu tượng trên màn hình nền." },
                ],
              },
              { t: "callout", tone: "tip", text: "Trên máy tính **không cần cài** vẫn bật được thông báo ở Bước 2 — cài chỉ để mở cho tiện." },
            ],
          },
        ],
      },

      { t: "heading", text: "Bước 2 — Bật thông báo đẩy trên thiết bị này" },
      {
        t: "steps",
        items: [
          { title: "Mở ứng dụng và đăng nhập", text: "iPhone: mở bằng **biểu tượng ở màn hình chính** (Bước 1)." },
          { title: "Vào tab Thông báo", path: ["Cài Đặt & Hướng dẫn", "Cài đặt", "Thông báo"] },
          { title: "Bấm “Bật thông báo đẩy”", text: "Nút nằm ở thẻ **Thông báo đẩy trên thiết bị này**." },
          { title: "Bấm “Cho phép”", text: "Điện thoại/trình duyệt hiện hộp thoại hỏi quyền gửi thông báo — chọn **Cho phép** (Allow). Nếu lỡ bấm *Không cho phép*, xem mục “Gặp sự cố?” bên dưới." },
          { title: "Kiểm tra đã bật", text: "Thành công khi ứng dụng báo **Đã bật thông báo đẩy trên thiết bị này**, nút đổi thành **Tắt trên thiết bị này** và dòng “Bạn có N thiết bị đã đăng ký” tăng thêm 1." },
          { title: "Chọn loại muốn nhận (tùy chọn)", text: "Ở thẻ **Nhận thông báo đẩy về…** tắt nhóm không cần (Lịch & sự kiện, Trực nhật, Thu chi…) và đặt **giờ yên tĩnh** — trong giờ đó thông báo được giữ lại, gửi sau khi hết giờ (trừ thông báo khẩn). Thông báo bắt buộc luôn được gửi." },
        ],
      },
      { t: "heading", text: "Cần biết" },
      { t: "md", text: "- Mỗi thiết bị bật **riêng**: dùng cả điện thoại lẫn laptop thì bật trên cả hai.\n- Thông báo do **chính bạn** tạo (đăng thông báo, bình luận…) **không gửi ngược lại cho bạn**. Muốn thử, nhờ một người khác đăng thông báo hoặc gửi cho bạn.\n- Không bật thông báo đẩy thì bạn vẫn thấy mọi thông báo ở **chuông** trong ứng dụng." },

      { t: "heading", text: "Gặp sự cố?" },
      {
        t: "accordion",
        items: [
          {
            title: "Trang báo “Bạn đã chặn thông báo cho trang này”",
            blocks: [{ t: "md", text: "Bạn đã lỡ chọn không cho phép nên phải mở lại quyền:\n- **Chrome/Edge (máy tính, Android trong trình duyệt)**: bấm biểu tượng **ổ khóa** cạnh địa chỉ → **Thông báo** → **Cho phép**, rồi tải lại trang và bấm **Bật thông báo đẩy**.\n- **Android (đã cài ứng dụng)**: nhấn giữ biểu tượng ứng dụng → **Thông tin ứng dụng** → **Thông báo** → bật.\n- **iPhone**: **Cài đặt → Thông báo** → chọn ứng dụng trên màn hình chính → bật **Cho phép thông báo**." }],
          },
          {
            title: "iPhone báo “trình duyệt chưa hỗ trợ” hoặc không thấy nút bật",
            blocks: [{ t: "md", text: "Gần như luôn do **chưa mở từ biểu tượng ở màn hình chính**, hoặc máy dưới iOS 16.4. Làm lại Bước 1 bằng **Safari**, xóa biểu tượng cũ nếu đã thêm sai rồi thêm lại, và mở ứng dụng bằng biểu tượng mới." }],
          },
          {
            title: "Trang báo “Máy chủ chưa bật thông báo đẩy”",
            blocks: [{ t: "md", text: "Đây là cấu hình của hệ thống, bạn không tự sửa được — nhờ **Admin** kiểm tra cấu hình thông báo đẩy của hệ thống. Trong lúc chờ, bạn vẫn nhận thông báo ở chuông trong ứng dụng." }],
          },
          {
            title: "Đã bật nhưng không thấy thông báo hiện lên",
            blocks: [{ t: "md", text: "Kiểm tra lần lượt:\n- Có đang trong **giờ yên tĩnh** không (Cài đặt → Thông báo)? Thông báo được giữ lại tới hết giờ.\n- Nhóm thông báo đó có bị **tắt** ở thẻ **Nhận thông báo đẩy về…** không?\n- Điện thoại có đang bật **Không làm phiền / Tập trung / Tiết kiệm pin** không?\n- Thông báo có phải do **chính bạn** tạo không? (Không gửi ngược lại cho người tạo.)\n- Thông báo được tạo **trước khi** bạn bật thiết bị thì không đẩy lại — nhưng vẫn có trong chuông." }],
          },
          {
            title: "Đổi điện thoại, cài lại máy hoặc xóa ứng dụng",
            blocks: [{ t: "md", text: "Làm lại Bước 1 và Bước 2 trên thiết bị mới. Thiết bị cũ không còn dùng sẽ tự bị hệ thống bỏ khỏi danh sách khi gửi tới không được." }],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Thông báo, Lịch & Sự kiện
  {
    id: "lich-su-kien",
    title: "Thông báo, Lịch, Sự kiện & Xin phép",
    summary: "Đọc thông báo, báo tham dự, điểm danh bằng QR, biểu quyết và gửi đơn xin phép.",
    icon: "calendar",
    audience: ["member", "all"],
    blocks: [
      { t: "heading", text: "Thông báo & Diễn đàn" },
      { t: "path", label: "Mở ở", items: ["Thông báo & Diễn đàn"] },
      { t: "md", text: "Mục này có hai tab: **Thông báo** (bảng tin chính thức, luật nhà) và **Diễn đàn** (trao đổi, góp ý). Thông báo có nút **Xác nhận đã đọc** thì bấm để Ban điều hành biết bạn đã nắm. Chuông ở góc trên là **thông báo dành riêng cho bạn** (ca trực, phiếu cần duyệt, kết quả đơn xin phép…)." },
      { t: "heading", text: "Lịch & Sự kiện" },
      { t: "md", text: "Xem lịch tháng, bấm vào ngày để xem sự kiện. Chọn một trong ba trạng thái tham dự:" },
      { t: "demo", name: "rsvp", caption: "Thử bấm — đây chỉ là minh họa" },
      {
        t: "steps",
        title: "Điểm danh sự kiện",
        items: [
          { title: "Cách 1 — quét mã QR", text: "Ban tổ chức mở mã QR tại chỗ. Mở camera quét mã, ứng dụng tự ghi nhận bạn có mặt." },
          { title: "Cách 2 — nhập mã 6 số", path: ["Lịch & Sự kiện", "Nhập mã điểm danh"], text: "Gõ 6 chữ số đang hiển thị cạnh mã QR (mã đổi liên tục để chống điểm danh hộ)." },
        ],
      },
      { t: "callout", tone: "info", text: "Mỗi người chỉ điểm danh cho **chính mình** bằng thiết bị của mình; giờ ghi nhận là giờ máy chủ." },
      { t: "heading", text: "Biểu quyết" },
      { t: "md", text: "Chọn phương án trong thẻ biểu quyết **trước hạn chót**. Với biểu quyết cho phép, bạn có thể đổi hoặc rút phiếu cho tới khi đóng. Biểu quyết ẩn danh không ai thấy bạn chọn gì." },
      { t: "heading", text: "Xin phép (vắng, về muộn, ngủ ngoài, đi xa)" },
      { t: "path", label: "Mở ở", items: ["Lịch & Xin phép", "Xin phép"] },
      {
        t: "steps",
        title: "Gửi đơn xin phép",
        items: [
          { title: "Bấm “Gửi đơn xin phép”", text: "Chọn **loại đơn**: vắng một sự kiện · về muộn quá giờ giới nghiêm · ngủ ngoài · tạm vắng nhiều ngày." },
          { title: "Điền thông tin", text: "Vắng sự kiện: chọn sự kiện (giờ lấy theo sự kiện). Các loại khác: chọn **từ — đến** (ngày + giờ), ghi **lý do**; ngủ ngoài / tạm vắng cần cho biết **nơi đến** và nên để số liên lạc." },
          { title: "Chờ duyệt", text: "Trưởng nhà/Ban điều hành nhận thông báo và duyệt hoặc từ chối (kèm lý do). Bạn nhận thông báo kết quả; còn đang chờ thì bạn **hủy đơn** được." },
        ],
      },
      { t: "callout", tone: "tip", text: "Đơn **vắng sự kiện được duyệt** thì điểm danh sự kiện đó ghi **“có phép”** và không bị trừ điểm chuyên cần. Không ai tự duyệt được đơn của chính mình." },
    ],
  },

  // ---------------------------------------------------------------- Bảo mật & thông báo của tôi
  {
    id: "bao-mat",
    title: "Bảo mật & thông báo của tôi",
    summary: "Bật xác thực 2 bước, đổi email đăng nhập và mật khẩu, chỉnh quyền riêng tư và cỡ chữ. (Cài ứng dụng & thông báo đẩy có mục riêng.)",
    icon: "shield",
    audience: ["all"],
    blocks: [
      { t: "path", label: "Mở ở", items: ["Cài Đặt & Hướng dẫn", "Cài đặt", "Bảo mật / Thông báo / Hồ sơ cá nhân"] },
      {
        t: "steps",
        title: "Bật xác thực 2 bước (khuyến nghị — bắt buộc với vai trò quyền cao)",
        items: [
          { title: "Mở tab Bảo mật", text: "Bấm **Bật xác thực 2 bước**." },
          { title: "Quét mã QR", text: "Dùng ứng dụng như Google Authenticator, Microsoft Authenticator, Authy hoặc 1Password quét mã, rồi nhập **mã 6 số** đang hiển thị để xác nhận." },
          { title: "Lưu 8 mã khôi phục", text: "Các mã chỉ hiện **một lần**; mỗi mã dùng được một lần khi mất điện thoại. Hãy chép hoặc tải về cất nơi an toàn." },
        ],
      },
      { t: "callout", tone: "info", text: "Từ đó mỗi lần đăng nhập, sau mật khẩu bạn nhập thêm mã 6 số (hoặc một mã khôi phục). Mất cả điện thoại lẫn mã khôi phục: nhờ Admin **gỡ xác thực 2 bước** cho bạn ở Cài đặt → Tài khoản (rồi bật lại)." },
      { t: "heading", text: "Email đăng nhập & mật khẩu" },
      {
        t: "steps",
        title: "Đổi email đăng nhập",
        items: [
          { title: "Mở tab Bảo mật", path: ["Cài Đặt & Hướng dẫn", "Cài đặt", "Bảo mật"], text: "Thẻ **Email đăng nhập** cho biết email bạn đang dùng để đăng nhập." },
          { title: "Bấm “Đổi email đăng nhập”", text: "Nhập **email mới** và **mật khẩu hiện tại** để xác nhận, rồi bấm **Đổi email**." },
          { title: "Đăng nhập lại bằng email mới", text: "Hệ thống **không gửi thư xác nhận**, nên hãy gõ cẩn thận. Từ lần sau chỉ đăng nhập được bằng email mới; email cũ không còn dùng được." },
        ],
      },
      { t: "callout", tone: "warn", title: "Email đăng nhập ≠ Email liên hệ", text: "Ô **Email liên hệ** trong Hồ sơ cá nhân chỉ để Ban điều hành liên lạc với bạn, **không dùng để đăng nhập**. Muốn đổi email đăng nhập phải làm ở tab **Bảo mật** như trên. Email phải chưa có ai dùng; nếu báo trùng, hãy chọn email khác hoặc nhờ Admin/Trưởng nhà kiểm tra." },
      { t: "md", text: "Đổi mật khẩu cũng ở tab **Bảo mật** (thẻ **Mật khẩu**); đổi xong mọi thiết bị khác bị đăng xuất." },
      { t: "heading", text: "Thông báo đẩy & cài ứng dụng" },
      { t: "callout", tone: "tip", title: "Có hướng dẫn riêng, từng bước", text: "Cách đưa ứng dụng ra màn hình chính (iPhone, Android, máy tính) và bật thông báo đẩy được viết chi tiết ở mục **Cài ứng dụng & bật thông báo**. Chọn nhóm thông báo muốn nhận và **giờ yên tĩnh** ở **Cài đặt → Thông báo**." },
      { t: "heading", text: "Quyền riêng tư & đồng ý" },
      { t: "md", text: "Ở tab **Bảo mật** có các công tắc đồng ý do **chính bạn** bật/tắt (mặc định tắt): lưu hồ sơ Công giáo, cho Ban điều hành xem hồ sơ Công giáo, chia sẻ bảng điểm, nhu cầu học tập, gắn thẻ tên vào ảnh, nhận thông báo qua kênh thứ ba… Rút đồng ý bất cứ lúc nào, hệ thống chặn việc dùng dữ liệu đó ngay." },
      { t: "heading", text: "Giao diện & cỡ chữ" },
      { t: "md", text: "**Cài đặt → Hồ sơ cá nhân → Giao diện**: chọn Sáng / Tối / Theo hệ thống và **cỡ chữ** Vừa / Lớn / Rất lớn (phóng cả giao diện). Bàn phím: nhấn `Tab` rồi `Enter` ở liên kết **“Bỏ qua đến nội dung chính”** để nhảy thẳng tới nội dung." },
    ],
  },

  // ---------------------------------------------------------------- Phụng vụ
  {
    id: "phung-vu",
    title: "Phụng vụ & check-in đi lễ",
    summary: "Đọc lịch phụng vụ, Lời Chúa, check-in đi lễ và gửi ý cầu nguyện.",
    icon: "church",
    audience: ["member", "all"],
    blocks: [
      { t: "heading", text: "Đọc lịch phụng vụ ngay trên lịch" },
      { t: "demo", name: "calendar-legend", caption: "Ý nghĩa các ô ngày trên Lịch & Sự kiện" },
      { t: "md", text: "Bấm vào một ngày: khung **Phụng vụ** cho biết tên lễ, bậc lễ, mùa/tuần, năm A/B/C, ngày chay/kiêng thịt, **ý lễ** của nhà và ý cầu nguyện của Giáo hội, cùng **Lời Chúa** (bài đọc, đáp ca, Tin Mừng — bấm để đọc toàn văn; có liên kết bản chính thức của Nhóm Phiên Dịch CGKPV)." },
      { t: "heading", text: "Check-in đi lễ" },
      {
        t: "table",
        head: ["Ngày lễ", "Bạn cần làm", "Minh chứng"],
        rows: [
          ["Chúa Nhật", "Bấm **Tôi đã đi lễ**", "Không cần ảnh"],
          ["Lễ trọng, lễ Bổn mạng, ngày đặc biệt (ngoài Chúa Nhật)", "Bấm check-in", "**Ảnh** nhà thờ / Thánh lễ bạn dự"],
        ],
      },
      {
        t: "steps",
        items: [
          { title: "Tìm ngày có ⛪", text: "Tab **Điểm Danh & Check-in** liệt kê các ngày phải đi lễ trong tháng và trạng thái của bạn." },
          { title: "Check-in đúng hạn", text: "Được check-in từ **chiều hôm trước** (lễ vọng) đến hạn ghi trên thẻ (mặc định 2 ngày sau lễ)." },
          { title: "Chờ Ban Phụng vụ xác nhận", text: "Nếu **chưa hợp lệ** bạn nhận thông báo kèm lý do và gửi lại ảnh khác." },
        ],
      },
      { t: "callout", tone: "tip", text: "Ứng dụng **báo trước** khi sắp đến lễ trọng / Bổn mạng / ngày đặc biệt (mặc định trước 7 ngày và hôm trước) và nhắc buổi tối nếu bạn chưa check-in." },
      { t: "heading", text: "Việc khác ở Phụng Vụ" },
      {
        t: "cards",
        cols: 3,
        items: [
          { icon: "church", title: "Phân công", text: "Lịch phụng vụ tuần, phân công đọc sách/giúp lễ/hát; xác nhận nhiệm vụ của mình." },
          { icon: "shield", title: "Ý cầu nguyện", text: "Gửi công khai hoặc **ẩn danh** (thật sự ẩn danh — không ai xem được tác giả)." },
          { icon: "book", title: "Tài liệu phụng vụ", text: "Nút “📚 Tài liệu phụng vụ”: tìm kinh, lời bài hát, PDF, YouTube (gõ không dấu cũng được)." },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Đóng quỹ
  {
    id: "dong-quy",
    title: "Thu chi: đóng quỹ & tiền điện nước",
    summary: "Xem khoản phải đóng, nộp qua QR và báo “Tôi đã đóng”.",
    icon: "wallet",
    audience: ["member", "all"],
    blocks: [
      {
        t: "cards",
        cols: 2,
        items: [
          { icon: "wallet", title: "Quỹ sinh hoạt", text: "**600.000 đ/người/năm**, đóng **300.000 đ mỗi kỳ 6 tháng** (mức do Ban điều hành cấu hình)." },
          { icon: "home", title: "Điện nước", text: "Tính chung cả nhà mỗi tháng rồi **chia đều** cho người đang ở." },
        ],
      },
      {
        t: "steps",
        title: "Đóng một khoản",
        items: [
          { title: "Chọn khoản", path: ["Thu Chi & Báo cáo", "Các khoản thu"], text: "Chọn chip khoản cần xem (“Quỹ T7–T12”, “ĐN T9”…) để biết bạn đã đóng hay chưa.", demo: "pay-states" },
          { title: "Nộp qua QR", text: "Khoản chưa đóng có nút **Nộp qua QR**: mã QR tài khoản nhận quỹ đã có sẵn **số tiền và nội dung chuyển khoản** — quét bằng app ngân hàng là xong.", demo: "pay-qr" },
          { title: "Bấm “Tôi đã đóng”", text: "Chuyển khoản hoặc đưa tiền mặt xong, bấm nút này để báo. Thủ quỹ/Trưởng nhà đối chiếu rồi **Xác nhận** (hoặc từ chối kèm lý do) — bạn nhận thông báo kết quả." },
        ],
      },
      { t: "callout", tone: "tip", text: "Có nút sao chép **số tài khoản / số tiền / nội dung** ngay trên cửa sổ QR. Giữ đúng nội dung chuyển khoản để Thủ quỹ đối chiếu nhanh." },
      { t: "md", text: "Tab **Ma trận đóng quỹ** cho thấy lịch sử các khoản của bạn theo từng kỳ/tháng." },
    ],
  },

  // ---------------------------------------------------------------- Bếp & Cơm
  {
    id: "bep-com",
    title: "Bếp & Cơm",
    summary: "Đăng ký hoặc nghỉ ăn trước giờ chốt và góp ý món ăn.",
    icon: "meal",
    audience: ["member", "all"],
    blocks: [
      { t: "demo", name: "meal", caption: "Bật/tắt từng bữa — minh họa" },
      {
        t: "table",
        head: ["Bữa", "Giờ chốt mặc định", "Sau giờ chốt"],
        rows: [
          ["Trưa", "**09:00**", "Chỉ Ban Ẩm thực sửa được"],
          ["Tối", "**15:00**", "Chỉ Ban Ẩm thực sửa được"],
        ],
      },
      { t: "md", text: "Bạn cũng có thể **chấm điểm, góp ý món ăn** và tham gia các khảo sát món do Ban Ẩm thực tạo." },
    ],
  },

  // ---------------------------------------------------------------- Hậu cần & luật nhà
  {
    id: "hau-can",
    title: "Hậu cần, trực vệ sinh & luật nhà",
    summary: "Xem lịch trực dọn sân, báo hỏng và đọc nội quy.",
    icon: "wrench",
    audience: ["member", "all"],
    blocks: [
      { t: "heading", text: "Trực vệ sinh sân nhà" },
      { t: "md", text: "Mỗi tuần có **2 bạn** trực dọn dẹp sân nhà. Trưởng nhà xếp lịch và bạn nhận **thông báo** khi được xếp. Hết tuần Trưởng nhà chấm điểm (0–10), nhận xét và có thể yêu cầu trực lại." },
      { t: "demo", name: "duty-week", caption: "Thẻ lịch trực tuần" },
      {
        t: "steps",
        title: "Báo hỏng",
        items: [
          { title: "Mở Hậu Cần & Trực", path: ["Hậu Cần & Trực", "Báo hỏng"] },
          { title: "Mô tả sự cố", text: "Viết ngắn gọn, chọn **vị trí/phòng** và mức độ gấp." },
          { title: "Chụp ảnh và gửi", text: "Ảnh giúp Ban Hậu cần xử lý nhanh. Theo dõi trạng thái sửa chữa ngay trong thẻ sự cố." },
        ],
      },
      { t: "heading", text: "Luật nhà" },
      { t: "path", label: "Mở ở", items: ["Thông báo", "Luật nhà"] },
      { t: "md", text: "Nội quy chia theo mục (giờ giấc, vệ sinh, khách…), có bảng **giờ giấc chung**. Bấm **Tải PDF** để lưu hoặc in. Trưởng nhà/Admin soạn, sửa, sắp xếp từng mục." },
    ],
  },

  // ---------------------------------------------------------------- Thành viên & nhà
  {
    id: "thanh-vien",
    title: "Thành viên, hồ sơ, sơ đồ nhà & cựu thành viên",
    summary: "Danh bạ, cập nhật hồ sơ của mình (ngành, niên khóa, ngày vào nhà), xem sơ đồ nhà và mạng lưới cựu.",
    icon: "users",
    audience: ["member", "all"],
    blocks: [
      { t: "path", label: "Mở ở", items: ["Thành Viên & Nhà"] },
      { t: "md", text: "Mục này có hai tab: **Thành viên** (danh bạ, đơn xin vào nhà, cựu thành viên) và **Sơ đồ nhà** (phòng ở, ai ở phòng nào)." },
      {
        t: "steps",
        title: "Cập nhật hồ sơ của tôi",
        items: [
          { title: "Mở hồ sơ", path: ["Cài Đặt & Hướng dẫn", "Cài đặt", "Hồ sơ cá nhân"], text: "Hoặc ở danh bạ chọn chính mình rồi bấm **Sửa hồ sơ**." },
          { title: "Học vụ & Tình trạng", text: "Chọn **trường**, **ngành học** (chọn trong danh sách ngành phổ biến — ngành khác thì chọn **Khác** rồi tự nhập), **khóa** (ví dụ K66), **niên khóa** (năm nhập học → năm dự kiến ra trường), mã sinh viên và tình trạng (đang học, đã tốt nghiệp, bảo lưu, thôi học)." },
          { title: "Thông tin riêng tư & Công giáo", text: "Ngày sinh, quê quán, phụ huynh… chỉ bạn và Ban điều hành xem được. **Hồ sơ Công giáo** (tên thánh, giáo xứ…) chỉ lưu khi bạn đã **đồng ý** ở tab Bảo mật." },
        ],
      },
      { t: "callout", tone: "info", text: "**Tháng/năm vào nhà lưu xá** do Ban điều hành cập nhật (ảnh hưởng việc tính quỹ theo kỳ); bạn xem được ngay trong hồ sơ." },
      { t: "heading", text: "Cựu thành viên" },
      { t: "md", text: "Tab **Cựu thành viên** liệt kê anh em đã ra trường hoặc đã rời nhà: nghề nghiệp, nơi làm việc, thành phố. Bạn chỉ thấy thông tin của cựu **đã đồng ý chia sẻ** (có nhãn “Còn giữ liên lạc”). Cựu thành viên hoặc Ban điều hành sửa hồ sơ cựu bằng nút bút chì trên thẻ." },
    ],
  },

  // ---------------------------------------------------------------- Cộng đồng
  {
    id: "cong-dong",
    title: "Diễn đàn, Học tập, Khoảnh khắc & Trợ lý AI",
    summary: "Trao đổi (tab Diễn đàn), nhập bảng điểm, xem album ảnh và hỏi trợ lý AI.",
    icon: "users",
    audience: ["member", "all"],
    blocks: [
      {
        t: "cards",
        cols: 3,
        items: [
          { icon: "users", title: "Diễn đàn", text: "Tạo chủ đề, bình luận, thích; nội dung vi phạm có thể **báo cáo**." },
          { icon: "school", title: "Học tập", text: "Nhập bảng điểm từng học kỳ kèm ảnh minh chứng; Ban điều hành xác minh." },
          { icon: "home", title: "Khoảnh khắc", text: "Xem/tải album ảnh sinh hoạt của nhà." },
        ],
      },
      { t: "heading", text: "AI nhận xét học tập" },
      { t: "demo", name: "ai-card", caption: "Thẻ AI nhận xét kết quả học tập" },
      { t: "callout", tone: "info", title: "Riêng tư", text: "AI so sánh năm học này với năm trước, cần bạn **đồng ý một lần**, và chỉ gửi số liệu đã ẩn danh — không tên, trường, mã sinh viên. Bạn có thể rút lại đồng ý bất cứ lúc nào." },
      { t: "heading", text: "Trợ lý AI" },
      { t: "md", text: "Nút **Trợ lý AI** (góc dưới) trả lời câu hỏi về nội quy, thông báo, lịch — luôn ghi nguồn." },
      { t: "callout", tone: "warn", text: "AI chỉ **gợi ý**. Thông tin quan trọng hãy hỏi lại Ban điều hành." },
    ],
  },

  // ---------------------------------------------------------------- Thủ quỹ
  {
    id: "thu-quy",
    title: "Thủ quỹ: quỹ, điện nước, phiếu chi",
    summary: "Lập kỳ quỹ, nhập điện nước, ghi thu, duyệt phiếu chi và xem báo cáo.",
    icon: "receipt",
    audience: ["treasurer"],
    blocks: [
      {
        t: "accordion",
        items: [
          {
            title: "Tài khoản nhận quỹ (mã QR)",
            blocks: [
              { t: "path", items: ["Thu Chi", "Tài khoản nhận quỹ", "Khai báo tài khoản + mã QR"] },
              { t: "md", text: "Chọn ngân hàng, nhập số tài khoản, tên chủ tài khoản (có thể tải ảnh QR của ngân hàng). Thành viên sẽ thấy QR có sẵn số tiền + nội dung khi nộp." },
              { t: "callout", tone: "info", text: "Thủ quỹ, Trưởng nhà và Admin sửa được. Hãy đảm bảo tài khoản đứng tên pháp nhân/Ban điều hành (tránh tài khoản cá nhân) để minh bạch." },
            ],
          },
          {
            title: "Lập kỳ quỹ (6 tháng/lần)",
            blocks: [
              {
                t: "steps",
                items: [
                  { title: "Mở form lập kỳ", path: ["Thu Chi", "Các khoản thu", "Lập kỳ quỹ"], text: "Chọn kỳ (ví dụ T7–T12/2026). Mức mặc định 300.000 đ/người, hạn nộp mặc định ngày 15 tháng đầu kỳ, chọn túi quỹ nhận." },
                  { title: "Xem trước", text: "Hệ thống hiện “12 người × 300.000 đ = 3.600.000 đ”.", demo: "fund-preview" },
                  { title: "Lập kỳ quỹ", text: "Tạo khoản phải thu cho mọi thành viên đang ở. Mỗi kỳ chỉ lập **một lần**; kỳ chưa ai nộp thì **Hủy** được." },
                ],
              },
              { t: "callout", tone: "tip", text: "Mức quỹ, số tháng mỗi kỳ, tháng bắt đầu, hạn nộp do Trưởng nhà chỉnh ở **Cài Đặt → Cấu hình chung**." },
            ],
          },
          {
            title: "Tiền điện nước hằng tháng",
            blocks: [
              {
                t: "steps",
                items: [
                  { title: "Nhập hóa đơn", text: "Bấm **Nhập tiền điện nước**, chọn tháng, nhập **tổng tiền điện + nước** của cả nhà." },
                  { title: "Chia đều", text: "Hệ thống chia cho số người đang ở, **làm tròn lên tới 1.000 đ** và cho xem trước (ví dụ 12 người × 155.000 đ, dư 10.000 đ)." },
                  { title: "Chi trả công ty điện/nước", text: "Vẫn lập **phiếu chi** như thường (hạng mục Điện nước)." },
                ],
              },
            ],
          },
          {
            title: "Ghi thu, hoàn tác & nhắc nợ",
            blocks: [
              { t: "demo", name: "pay-states", caption: "Các trạng thái của một khoản" },
              { t: "md", text: "- **Tôi đã đóng**: thành viên báo → bạn đối chiếu rồi **Xác nhận** hoặc từ chối kèm lý do.\n- Thủ quỹ, Trưởng nhà, Admin bấm **Đã đóng** ở dòng thành viên (tiền mặt/chuyển khoản) để ghi thay.\n- Nhầm hoặc chưa thu thật: **Hoàn tác** (có lý do — hệ thống ghi bút toán đảo, không xóa dữ liệu).\n- Đóng một phần/gộp nhiều khoản: **Chi tiết → Ghi thu**.\n- **Nhắc nợ**: nút **Nhắc** ở từng người hoặc **Nhắc người chưa đóng** cho cả khoản — gửi thông báo trong ứng dụng và (tùy chọn) vào **nhóm Zalo**.\n- **Miễn/giảm** cần lý do và quyền của Trưởng nhà." },
            ],
          },
          {
            title: "Phiếu chi & duyệt",
            blocks: [
              { t: "md", text: "**Lập phiếu chi**: số tiền, hạng mục, người ứng/chi, ảnh hóa đơn (bắt buộc từ ngưỡng cấu hình)." },
              { t: "demo", name: "approval-flow", caption: "Luồng duyệt phiếu chi" },
              { t: "callout", tone: "warn", title: "Người lập không tự duyệt", text: "Người lập/người ứng tiền không bao giờ tự duyệt phiếu của mình. Nếu một trong hai người duyệt là người lập hoặc người ứng tiền thì **người còn lại ký một mình** (cấu hình “Nhà chỉ có Trưởng nhà + Thủ quỹ duyệt chi”)." },
              { t: "demo", name: "expense-states", caption: "Trạng thái phiếu chi" },
              { t: "md", text: "Phiếu đã duyệt có người ứng tiền: chi tiết phiếu hiện **mã QR hoàn ứng** của người đó (có sẵn số tiền + nội dung). Chi xong bấm **Đã chi**; sổ quỹ tự ghi." },
            ],
          },
          {
            title: "Giao dịch ngân hàng tự động (ghi thu nhanh)",
            blocks: [
              { t: "path", items: ["Thu Chi & Báo cáo", "Tổng quan", "Giao dịch ngân hàng"] },
              { t: "md", text: "Khi nhà đã kết nối SePay/Casso (Admin cấu hình — xem mục Admin), mỗi khoản **tiền vào** tài khoản hiện ở thẻ này kèm **gợi ý** khoản phải thu khớp (theo tên người nộp trong nội dung chuyển khoản, mã kỳ quỹ và đúng số tiền)." },
              {
                t: "steps",
                items: [
                  { title: "Xem gợi ý", text: "Nhãn **Khớp cao** = đúng tên + đúng số tiền; **Có thể** = khớp tên nhưng lệch số tiền; **Tham khảo** = chỉ đúng tiền + mã kỳ." },
                  { title: "Bấm Ghi thu", text: "Tạo phiếu thu thật cho khoản đó (đúng số tiền giao dịch). Giao dịch nhỏ hơn số còn nợ thì ghi thu **một phần**; lớn hơn thì ghi thủ công ở bảng quỹ." },
                  { title: "Hoặc Bỏ qua", text: "Tiền không phải quỹ (ủng hộ, hoàn tiền…): bỏ qua kèm lý do; khôi phục lại được." },
                ],
              },
              { t: "callout", tone: "info", text: "Hệ thống **không bao giờ tự ghi sổ** từ ngân hàng — luôn do Thủ quỹ bấm xác nhận. Bấm hai lần không ghi thu hai lần." },
            ],
          },
          {
            title: "Báo cáo, thống kê & nhắc quỹ",
            blocks: [
              { t: "md", text: "- Tab **Báo cáo hoạt động** (cạnh tab Thu chi): báo cáo **quý / năm** gồm nhân sự, tài chính, sự kiện & chuyên cần, trực nhật & hậu cần — bấm **Tải báo cáo PDF** để gửi Tỉnh Dòng, Ban điều hành hay phụ huynh. Chỉ có số liệu tổng hợp, không có thông tin cá nhân.\n- Tab **Thống kê & Xuất file**: thu – chi theo **tháng / quý / năm**, biểu đồ, cơ cấu chi; nút **Xuất Excel** và **Xuất PDF**.\n- **Tải báo cáo PDF**, **Gửi Zalo** để gửi nhóm; nút **Soạn tin nhắc quỹ** (AI) soạn lời nhắc không nêu tên ai.\n- Thẻ **AI nhận xét thu chi tháng** so sánh tháng này với tháng trước (khi Admin đã bật AI). Nhận xét lưu 1 giờ để khỏi tốn lượt AI; bấm **Tạo lại** khi muốn bản mới." },
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Trưởng nhà
  {
    id: "truong-nha",
    title: "Trưởng nhà: điều hành nhà",
    summary: "Duyệt đơn, xếp phòng, xếp người trực, đăng thông báo và cấu hình chung.",
    icon: "home",
    audience: ["house_head"],
    blocks: [
      {
        t: "cards",
        cols: 3,
        items: [
          { icon: "users", title: "Thành viên & phòng", text: "Duyệt đơn xin vào nhà, thêm thành viên (cấp tài khoản ngay), xếp/chuyển phòng ở **Sơ đồ nhà**." },
          { icon: "wrench", title: "Trực & hậu cần", text: "Xếp 2 bạn trực mỗi tuần, nhắc, chấm điểm; tiếp nhận báo hỏng." },
          { icon: "receipt", title: "Tài chính", text: "Đồng ký phiếu chi lớn, xác nhận chốt sổ tháng, duyệt miễn/giảm quỹ." },
        ],
      },
      {
        t: "accordion",
        items: [
          {
            title: "Thành viên & phòng ở",
            blocks: [
              { t: "md", text: "- **Thành Viên & Nhà → Thành viên → Đơn chờ duyệt**: duyệt đơn xin vào nhà và xếp phòng.\n- **Thêm thành viên** (có thể cấp tài khoản ngay — mật khẩu tạm hiện **một lần**, hãy gửi riêng cho người đó). Nhớ chọn **tháng/năm vào nhà** — quỹ theo kỳ chỉ tính cho người đã vào nhà trước hạn nộp.\n- **Sửa hồ sơ** thành viên: trường, **ngành** (chọn trong danh sách hoặc tự nhập), **niên khóa**, **tháng/năm vào nhà**, tình trạng học tập.\n- **Sơ đồ nhà** (tab cạnh Thành viên): xếp/chuyển phòng (máy tính: kéo thả; điện thoại: danh sách thẻ), sửa cấu trúc phòng." },
            ],
          },
          {
            title: "Nhập nhiều thành viên từ Excel / CSV",
            blocks: [
              { t: "path", items: ["Thành Viên & Nhà", "Thành viên", "Nhập từ Excel"] },
              {
                t: "steps",
                items: [
                  { title: "Tải tệp mẫu", text: "Bấm **Tải tệp mẫu (.xlsx)**, điền mỗi người một dòng. Chỉ cột **Họ và tên** là bắt buộc; cột nào chưa có thông tin cứ để trống hoặc xóa cột. Tệp mẫu có 3 sheet: **Thanh vien** (các ô đã đặt dạng Text để Excel không làm mất số 0 đầu của SĐT/CCCD), **Huong dan** (giải thích từng cột kèm ví dụ) và **Danh muc** (trường, phòng, ngành, tình trạng hợp lệ của lưu xá)." },
                  { title: "Chọn tệp để kiểm tra", text: "Hệ thống kiểm tra **từng dòng** trước khi thêm: số điện thoại/email sai hoặc **trùng** (trong tệp hoặc với người đã có), **CCCD** sai hoặc trùng trong tệp (trùng với người đã có thì dòng đó báo lỗi lúc bấm thêm), ngày hoặc năm sai định dạng, năm ra trường trước năm nhập học, trường/phòng không có trong danh mục… Dòng lỗi bị bỏ qua, dòng có cảnh báo vẫn thêm được." },
                  { title: "Xác nhận thêm", text: "Bấm **Thêm N thành viên**. Tối đa 300 dòng mỗi lần." },
                ],
              },
              { t: "md", text: "**Nhập được 24 cột:** họ và tên, tên gọi, giới tính, số điện thoại, email, ẩn SĐT, ngày vào nhà (đủ ngày hoặc chỉ tháng/năm), phòng (theo mã hoặc tên), ngày sinh, số CCCD/CMND (lưu mã hóa), quê quán, địa chỉ thường trú, tình trạng học tập, trường, ngành, khóa, **năm nhập học, năm ra trường (niên khóa)**, mã sinh viên, họ tên và SĐT cha/mẹ, định mức quỹ riêng." },
              { t: "callout", tone: "info", text: "Nhập hàng loạt **không** gồm thông tin Công giáo (tên thánh, giáo phận, giáo xứ, bí tích — cần chính thành viên đồng ý, thành viên tự điền ở Cài đặt → Hồ sơ), **ảnh đại diện** và **tài khoản đăng nhập** (cấp riêng ở Cài đặt → Tài khoản)." },
              { t: "callout", tone: "info", text: "Thông tin học vụ chỉ lưu khi dòng đó xác định được **Trường**. Cột riêng tư (ngày sinh, CCCD, quê quán, địa chỉ, cha/mẹ) cần quyền ghi thông tin riêng tư; ẩn SĐT, học vụ và định mức quỹ cần quyền sửa hồ sơ thành viên (Trưởng nhà và Admin có đủ) — thiếu quyền thì cột đó bị bỏ qua và hệ thống báo ngay ở màn hình kiểm tra." },
            ],
          },
          {
            title: "Đơn xin phép của anh em",
            blocks: [
              { t: "path", items: ["Lịch & Xin phép", "Xin phép", "Chờ tôi duyệt"] },
              { t: "md", text: "Đơn mới gửi thông báo cho Trưởng nhà/Admin; số đơn chờ hiện ở thanh bên. Bấm **Duyệt** hoặc **Từ chối** (từ chối phải ghi lý do ≥ 5 ký tự, người xin sẽ thấy). Đơn **vắng sự kiện** được duyệt tự ghi điểm danh “có phép”. Bạn không duyệt được đơn của chính mình." },
            ],
          },
          {
            title: "Cựu thành viên",
            blocks: [
              { t: "path", items: ["Thành Viên & Nhà", "Thành viên", "Cựu thành viên"] },
              { t: "md", text: "Khi thành viên ra trường hoặc rời nhà, đổi **trạng thái** ở hồ sơ (Cựu thành viên / Đã rời). Ở tab **Cựu thành viên** bấm bút chì để ghi **năm ra trường, nghề nghiệp, nơi làm việc, thành phố**. Chỉ bật **“Còn giữ liên lạc & đồng ý chia sẻ”** sau khi đã hỏi ý kiến người đó — khi bật, các thành viên khác mới xem được. Có nút **Xuất Excel** danh sách cựu." },
            ],
          },
          {
            title: "Trực vệ sinh theo tuần",
            blocks: [
              {
                t: "steps",
                items: [
                  { title: "Xếp người trực", path: ["Hậu Cần & Trực", "Xếp người trực"], text: "Chọn 2 bạn cho mỗi tuần (có nút **Gợi ý luân phiên**). Hệ thống báo cho người được xếp." },
                  { title: "Nhắc / gửi Zalo", text: "Nhắc người trực hoặc gửi lịch vào nhóm Zalo bằng nút trên thẻ tuần." },
                  { title: "Đánh giá cuối tuần", text: "Chấm điểm 0–10, nhận xét, có thể **yêu cầu trực lại**." },
                ],
              },
              { t: "demo", name: "duty-week" },
            ],
          },
          {
            title: "Luật nhà",
            blocks: [
              { t: "path", items: ["Thông báo", "Luật nhà"] },
              { t: "md", text: "Soạn từng mục, thêm giờ giấc, sắp xếp thứ tự, tải PDF. Thành viên đọc và tải PDF ở cùng chỗ." },
            ],
          },
          {
            title: "Trang công khai: bài viết, hỏi đáp, đăng ký tìm hiểu",
            blocks: [
              { t: "path", items: ["Trang công khai"] },
              { t: "md", text: "Người ngoài xem được (**không cần đăng nhập**): `/tin-tuc` (bản tin, tuyển sinh), `/gioi-thieu`, `/lien-he` (đăng ký tìm hiểu), `/hoi-dap`, `/thu-vien` (album), `/ung-ho`. Các liên kết chính cũng nằm ở chân trang. Mục **Trang công khai** ở thanh bên có ba tab: **Bài viết**, **Hỏi đáp**, **Đăng ký tìm hiểu**." },
              { t: "heading", text: "Bài viết" },
              {
                t: "steps",
                items: [
                  { title: "Soạn bài", path: ["Trang công khai", "Viết bài mới"], text: "Nhập tiêu đề, tóm tắt (hiện khi chia sẻ link), chọn chuyên mục (Tuyển sinh, Tin tức, Hoạt động, Chia sẻ, Thông báo), tải **ảnh bìa**, thêm **thẻ** (vd. “tuyển sinh 2026”). Thanh công cụ giúp in đậm, tạo tiêu đề, danh sách, trích dẫn và **chèn ảnh vào bài**; khung **Trợ lý AI** bên phải giúp gợi ý đề tài, viết nháp, chỉnh văn (khi Admin đã bật AI)." },
                  { title: "Lưu nháp, đăng hoặc hẹn giờ", text: "**Lưu nháp** thì chỉ Ban điều hành thấy. **Đăng công khai** thì bài lên ngay. Bật **Hẹn giờ đăng** để bài tự hiện đúng ngày giờ đã chọn (hiện nhãn “Hẹn giờ” ở danh sách; chưa đến giờ thì người ngoài chưa thấy)." },
                  { title: "Lịch sử chỉnh sửa", text: "Nút **Lịch sử** ở trình soạn giữ 25 bản gần nhất; xem lại và **Khôi phục** khi lỡ sửa nhầm." },
                  { title: "Chia sẻ", text: "Ở danh sách bài, bấm biểu tượng **chép liên kết** rồi dán vào Zalo/Facebook — hình bìa và tóm tắt hiện đẹp khi chia sẻ." },
                ],
              },
              { t: "callout", tone: "warn", title: "Lưu ý", text: "Đừng đăng số điện thoại, địa chỉ cá nhân hay hình ảnh của người chưa đồng ý. Muốn bài hiện lớn đầu trang, bấm ngôi sao **Nổi bật**. Gỡ bài về bản nháp hoặc xóa bài thì link cũ không mở được nữa." },
              { t: "heading", text: "Hỏi đáp" },
              { t: "md", text: "Tab **Hỏi đáp**: thêm câu hỏi thường gặp (chi phí, điều kiện vào ở, giờ giấc…), sắp thứ tự bằng mũi tên, **ẩn** câu chưa cần hiện. Câu trả lời hỗ trợ **đậm**, danh sách, liên kết. Trang `/hoi-dap` giúp Google hiển thị câu trả lời trực tiếp." },
              { t: "heading", text: "Đăng ký tìm hiểu" },
              { t: "md", text: "Người ngoài điền biểu mẫu ở `/lien-he` → xuất hiện ở tab **Đăng ký tìm hiểu** (kèm thông báo và huy hiệu số đơn mới). Liên hệ rồi đổi trạng thái (Mới → Đã liên hệ → Đã đến thăm → Đã nhận / Không nhận / Rác) và ghi chú để cả nhóm theo dõi. Biểu mẫu có chống thư rác (ô bẫy, giới hạn 3 đơn/giờ mỗi địa chỉ). Quyền xử lý: `application.review`." },
              { t: "heading", text: "Giới thiệu, thư viện ảnh & ủng hộ" },
              { t: "md", text: "- **Giới thiệu**: viết ở **Cài đặt → Cấu hình chung → Nội dung trang công khai** (hỗ trợ ## tiêu đề, **đậm**, danh sách). Để trống thì dùng đoạn mặc định.\n- **Thư viện ảnh**: ở **Khoảnh Khắc → Sửa album** (người có quyền kiểm duyệt album) bật **“Hiện ở trang công khai”** — người ngoài xem được TOÀN BỘ ảnh album, nên chỉ bật khi những người trong ảnh đã đồng ý.\n- **Ủng hộ**: cũng ở Nội dung trang công khai — bật **Trang Ủng hộ** để hiện mã VietQR của tài khoản nhận quỹ (Thủ quỹ cài ở Thu chi) cùng lời nhắn." },
              { t: "md", text: "Quyền đăng bài (`article.manage`) mặc định có ở Trưởng nhà, Admin và Trưởng ban Truyền thông; Admin chỉnh được ở Cài đặt → Phân quyền & Vai trò." },
            ],
          },
          {
            title: "Báo cáo hoạt động quý / năm",
            blocks: [
              { t: "path", items: ["Thu Chi & Báo cáo", "Báo cáo hoạt động"] },
              { t: "md", text: "Chọn **theo quý** hoặc **theo năm**: xem nhanh sĩ số, vào/ra nhà, thu chi và tỉ lệ thu quỹ, số sự kiện và tỉ lệ có mặt, ca trực hoàn thành, báo hỏng. Bấm **Tải báo cáo PDF** để có bản in có khung chữ ký. Quyền xem: `report.read` (Trưởng nhà, Admin, Thủ quỹ). Báo cáo **không có dữ liệu cá nhân**." },
            ],
          },
          {
            title: "Thông báo, sự kiện, diễn đàn",
            blocks: [
              { t: "md", text: "Đăng thông báo (chọn đối tượng nhận, ghim, yêu cầu xác nhận), tạo sự kiện + mã QR điểm danh, tạo biểu quyết, kiểm duyệt diễn đàn. Khi đăng thông báo hoặc tạo sự kiện có thể tick **đăng cả vào nhóm Zalo**." },
            ],
          },
          {
            title: "Lịch phụng vụ, lễ Bổn mạng & đi lễ",
            blocks: [
              { t: "path", items: ["Lịch & Sự kiện", "Cấu hình lịch phụng vụ"] },
              { t: "md", text: "- Đặt **ngày và tên Bổn mạng** của nhà (tô vàng ⭐, báo trước cho anh em, và — nếu bật — bắt buộc check-in kèm ảnh).\n- Thêm **ngày đặc biệt** (kỷ niệm thành lập, lễ tạ ơn, tĩnh tâm…), chọn số ngày báo trước, giờ nhắc check-in, nạp **Lời Chúa**.\n- Nhập **ý lễ** của nhà cho từng ngày; duyệt check-in và xem **Tổng hợp cả nhà** (ai vắng ngày nào) ở tab Điểm Danh & Check-in." },
            ],
          },
          {
            title: "Cấu hình chung",
            blocks: [
              { t: "md", text: "- **Cài Đặt → Cấu hình chung & Định mức**: thông tin nhà, mức quỹ mỗi kỳ, số tháng mỗi kỳ, hạn nộp, ngưỡng duyệt chi, giờ chốt cơm, giờ kinh tối…\n- **Cài Đặt → Danh mục học tập**: trường đại học, năm học kèm học kỳ, năm học hiện hành, nhiệm kỳ Ban điều hành. Mục đang có dữ liệu thì không xóa được (chỉ tạm ẩn)." },
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Zalo & tự động
  {
    id: "zalo-tu-dong",
    title: "Nhắc tự động & nhóm Zalo",
    summary: "Cách bot Zalo gửi tin vào nhóm, lịch gửi mỗi ngày, mẫu tin và lịch sử gửi.",
    icon: "zalo",
    audience: ["house_head", "admin"],
    blocks: [
      { t: "demo", name: "zalo-bubble", caption: "Tin bot gửi vào nhóm: tự động có dấu 🤖, tin do người bấm ghi “Thao tác bởi …”" },
      { t: "path", label: "Mở ở", items: ["Cài Đặt", "Tích hợp Zalo"] },
      {
        t: "steps",
        title: "Thiết lập một lần",
        items: [
          { title: "Token bot", text: "Biến môi trường `ZALO_BOT_TOKEN` đặt trên Vercel (không lưu trong cơ sở dữ liệu). Trang cho biết token đã có chưa và tên bot." },
          { title: "Mã nhóm (chat_id)", text: "Thêm bot vào nhóm, nhắn một câu trong nhóm rồi bấm **Dò nhóm** để lấy mã; hoặc dán tay. Bấm **Gửi tin thử** để kiểm tra." },
          { title: "Bật công tắc", text: "Bật gửi tin nhóm và chọn **từng loại tin** được phép gửi." },
          { title: "Tác vụ hằng ngày", text: "Cần biến `CRON_SECRET` trên Vercel để cron chạy. Dùng **Xem trước buổi sáng/tối** để biết hôm nay sẽ gửi gì (không gửi thật)." },
        ],
      },
      { t: "heading", text: "Hệ thống tự gửi gì, lúc nào?" },
      {
        t: "table",
        head: ["Giờ", "Tin"],
        rows: [
          ["**~7:00 sáng**", "Nhắc lễ trọng/Bổn mạng · khoản quỹ sắp/quá hạn · sự kiện hôm nay + ngày mai (**gộp một tin**) · sinh nhật · lịch nhắc lặp buổi sáng · thứ Hai: lịch trực vệ sinh tuần"],
          ["**~19:00 tối**", "Nhắc check-in đi lễ · lịch nhắc lặp buổi tối"],
          ["**Khi có người thao tác**", "Sự kiện mới, thông báo, báo hỏng, đổi phòng, thành viên mới, nhắc quỹ… kèm “— Thao tác bởi <tên>”"],
        ],
      },
      { t: "callout", tone: "info", title: "Vì sao có thể lệch giờ?", text: "Gói miễn phí của Vercel chạy mỗi tác vụ **một lần/ngày** và có thể lệch tới ~1 giờ, nên tin “7:00” có khi đến lúc 7:40." },
      { t: "callout", tone: "tip", title: "Không bao giờ gửi lặp", text: "Mỗi tin tự động có một **khóa chống trùng** theo ngày: cron chạy lại hay bấm “Chạy thật ngay” nhiều lần thì tin đã gửi trong ngày vẫn chỉ gửi một lần." },
      { t: "heading", text: "Lịch & lịch sử tin gửi" },
      { t: "demo", name: "zalo-calendar", caption: "Lịch tháng trong Tích hợp Zalo" },
      { t: "md", text: "Mỗi ngày hiện số tin **đã gửi** (xanh), **gửi lỗi** (đỏ), **bỏ qua** (xám) và **dự kiến** (viền tím). Bấm một ngày để xem từng tin: tự động hay do ai bấm, kết quả, lý do lỗi và nội dung đầy đủ. Ngày sắp tới hiện tin dự kiến (sự kiện, sinh nhật, lịch trực, lịch nhắc lặp); nhắc quỹ và nhắc lễ trọng không dự báo trước được." },
      { t: "heading", text: "Mẫu tin & lịch nhắc lặp" },
      { t: "md", text: "- **Mẫu tin nhắn** (cùng trang): sửa nội dung từng loại tin, chèn biến như `{title}`, xem trước ngay, **Khôi phục mẫu mặc định** khi cần. Dòng chỉ có biến rỗng tự bị bỏ.\n- **Cài Đặt → Nhắc lịch**: tạo lịch nhắc lặp hằng tuần (vd. “Họp nhà tối thứ 4”), chọn nhắc 7:00 sáng hoặc 19:00 tối, trong ứng dụng và/hoặc nhóm Zalo." },
    ],
  },

  // ---------------------------------------------------------------- Admin
  {
    id: "admin",
    title: "Admin: tài khoản, vai trò, phân hệ, hệ thống",
    summary: "Quản lý tài khoản, vai trò & quyền, phân hệ, trợ lý AI và nhật ký hoạt động.",
    icon: "shield",
    audience: ["admin"],
    blocks: [
      { t: "demo", name: "roles", caption: "Vai trò hệ thống và vai trò tự tạo" },
      {
        t: "accordion",
        items: [
          {
            title: "Tài khoản",
            blocks: [
              { t: "path", items: ["Cài Đặt", "Tài khoản"] },
              { t: "md", text: "Danh sách anh em kèm trạng thái (Đang hoạt động / Bị khóa / Vô hiệu / Chưa có tài khoản), email, vai trò, lần đăng nhập cuối; lọc và tìm kiếm. Bấm **Quản lý** ở dòng của người đó:" },
              {
                t: "table",
                head: ["Việc", "Kết quả"],
                rows: [
                  ["**Cấp tài khoản**", "Nhập email → mật khẩu tạm hiện **một lần**, hãy gửi riêng cho người đó"],
                  ["**Đặt lại mật khẩu**", "Mật khẩu tạm mới; mọi phiên đăng nhập cũ bị đăng xuất; lần sau phải đổi mật khẩu"],
                  ["**Khóa / Mở khóa**, **Vô hiệu / Kích hoạt lại**", "Chặn hoặc cho phép đăng nhập"],
                  ["**Gỡ xác thực 2 bước**", "Khi người đó mất điện thoại và mã khôi phục: họ đăng nhập chỉ bằng mật khẩu, bị đăng xuất mọi thiết bị và cần bật lại 2 bước"],
                  ["**Vai trò**", "Đánh dấu các vai trò người đó giữ (hệ thống và tự tạo)"],
                ],
              },
              { t: "callout", tone: "info", text: "Không thao tác được trên **chính tài khoản của mình**. Muốn đổi mật khẩu của mình: menu tài khoản → Đổi mật khẩu." },
            ],
          },
          {
            title: "Vai trò & quyền",
            blocks: [
              { t: "path", items: ["Cài Đặt", "Phân quyền & Vai trò"] },
              { t: "md", text: "- Bốn vai trò hệ thống (Admin, Trưởng nhà, Thủ quỹ, Thành viên) không xóa được và bộ quyền cố định (**Admin luôn có toàn bộ quyền**).\n- **Thêm vai trò** cho các ban (ví dụ Trưởng ban Ẩm thực): đặt tên, mô tả, chọn quyền theo nhóm phân hệ (có ô tìm quyền), rồi gán cho người phụ trách ở tab Tài khoản.\n- **Sửa / Xóa** vai trò tự tạo. Vai trò còn lịch sử sẽ được lưu trữ, người đang giữ mất quyền ngay." },
              { t: "callout", tone: "warn", title: "Chống leo thang quyền", text: "Người đang giữ một vai trò chỉ được **bớt** quyền của vai trò đó, không tự thêm. Một số quyền quản trị (gán vai trò, quản lý tài khoản, xem CCCD, xem nhật ký hoạt động…) không cấp được cho vai trò tự tạo." },
            ],
          },
          {
            title: "Phân hệ (ẩn/bảo trì)",
            blocks: [
              { t: "md", text: "**Cài Đặt → Phân hệ**: tắt phân hệ chưa dùng (ví dụ Hậu cần & Trực, Thu Chi…) và nhập lời nhắn. Thành viên thấy mục bị làm mờ “Bảo trì”; dữ liệu giữ nguyên, bật lại là dùng tiếp." },
            ],
          },
          {
            title: "Danh mục & học tập",
            blocks: [
              { t: "md", text: "- **Danh mục**: hạng mục chi, loại sự kiện, chuyên mục thông báo/diễn đàn…\n- **Danh mục học tập**: trường đại học, năm học, học kỳ, nhiệm kỳ." },
            ],
          },
          {
            title: "Lịch phụng vụ",
            blocks: [
              { t: "md", text: "Lịch phụng vụ do ứng dụng tự tính cho mọi năm (theo luật phụng vụ và lịch riêng của Hội đồng Giám mục Việt Nam). **Lời Chúa** được nạp tự động từ dữ liệu mở trên GitHub khi máy chủ khởi động (chỉ tải về, không gửi dữ liệu của nhà ra ngoài); nạp lại ở **Lịch & Sự kiện → Cấu hình lịch phụng vụ → Lời Chúa**." },
            ],
          },
          {
            title: "Trợ lý AI",
            blocks: [
              { t: "md", text: "**Cài Đặt → Trợ lý AI**: bật công tắc tổng và từng tính năng (hỏi đáp nội quy, soạn tin nhắc quỹ, phân loại sự cố, tóm tắt, soát nội dung, nhận xét thu chi, nhận xét học tập), đặt ngân sách tháng, xem nhật ký. Khóa API Groq/Gemini đặt ở biến môi trường của máy chủ (`GROQ_API_KEY`, `GEMINI_API_KEY` — trên Vercel)." },
            ],
          },
        ],
      },
      { t: "heading", text: "Nhật ký hoạt động (chỉ Admin)" },
      { t: "path", items: ["Cài Đặt", "Nhật ký hoạt động"] },
      { t: "demo", name: "activity-log", caption: "Mỗi thao tác: ai, làm gì, kết quả, giờ, thiết bị" },
      {
        t: "cards",
        cols: 3,
        items: [
          { icon: "activity", title: "Thao tác", text: "Mọi thao tác ghi (tạo, sửa, xóa, duyệt, gửi Zalo…). **Không lưu nội dung** người dùng nhập." },
          { icon: "shield", title: "Đăng nhập", text: "Đăng nhập thành công/thất bại, lý do, IP, thiết bị." },
          { icon: "book", title: "Thay đổi dữ liệu", text: "Giá trị **trước → sau** của từng bản ghi (bấm để mở)." },
        ],
      },
      { t: "md", text: "Lọc theo **người dùng**, khoảng thời gian, phân hệ, kết quả hoặc tìm theo từ khóa. Nhật ký giữ **180 ngày**. Hồ sơ cá nhân nhạy cảm và điểm học tập chỉ Trưởng nhà xem được nên không hiện ở đây." },
      { t: "callout", tone: "info", title: "Admin có toàn quyền", text: "Admin có **mọi quyền** của hệ thống — và quyền thêm về sau cũng tự được cấp. Admin cũng được tính là Trưởng nhà + Thủ quỹ khi duyệt chi. Những điều vẫn giữ nguyên cho MỌI người, kể cả Admin: **không tự duyệt phiếu chi / đơn xin phép do chính mình lập** (cần người khác duyệt), và dữ liệu cần sự **đồng ý của thành viên** (hồ sơ Công giáo, chia sẻ bảng điểm…) chỉ xem được khi họ đã đồng ý. Mỗi lần xem CCCD đầy đủ đều phải nhập lý do và được ghi vào nhật ký." },
      {
        t: "accordion",
        items: [
          {
            title: "Bảo mật tài khoản: 2 bước, quên mật khẩu, thông báo đẩy, email",
            blocks: [
              { t: "md", text: "- **Xác thực 2 bước** (TOTP + 8 mã khôi phục) bắt buộc với vai trò quyền cao (Admin, Trưởng nhà, Thủ quỹ — cấu hình ở **Cài đặt → Cấu hình chung → Bảo mật đăng nhập**). Người mất điện thoại và mã khôi phục: **Cài đặt → Tài khoản → Quản lý → Gỡ xác thực 2 bước**.\n- **Quên mật khẩu** tự phục vụ qua email cần biến `RESEND_API_KEY` và `EMAIL_FROM` (tên miền đã xác minh ở Resend). Thiếu thì người dùng nhờ Admin đặt lại mật khẩu.\n- **Thông báo đẩy** cần `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (sinh bằng `pnpm env:keys`). Thiếu thì chỉ có thông báo trong ứng dụng.\n- Biến môi trường đặt ở **Vercel → Settings → Environment Variables** rồi **deploy lại**. Chi tiết và cách xoay khóa: file `VAN_HANH.md` trong mã nguồn." },
            ],
          },
          {
            title: "Giao dịch ngân hàng tự động (SePay / Casso)",
            blocks: [
              { t: "md", text: "Đặt biến `BANK_WEBHOOK_SECRET` (≥ 16 ký tự) rồi trong SePay/Casso tạo webhook tới `https://<tên miền>/api/v1/public/bank-webhook` với cùng khóa xác thực. Tiền vào tài khoản sẽ hiện ở **Thu Chi & Báo cáo → Tổng quan → Giao dịch ngân hàng** để Thủ quỹ xác nhận ghi thu (xem mục Thủ quỹ). Webhook chỉ **lưu** giao dịch, không tự ghi sổ." },
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Trưởng ban
  {
    id: "truong-ban",
    title: "Trưởng ban (vai trò tự tạo)",
    summary: "Phạm vi làm việc tùy theo quyền Admin đã cấp cho vai trò của bạn.",
    icon: "sparkles",
    audience: ["custom"],
    blocks: [
      {
        t: "tabs",
        tabs: [
          {
            label: "Phụng vụ",
            blocks: [
              { t: "md", text: "Lịch phụng vụ tuần, phân công đọc sách/giúp lễ/hát, quản lý **Tài liệu phụng vụ** (kinh, lời bài hát, PDF, link YouTube), kiểm duyệt ý cầu nguyện." },
              {
                t: "steps",
                items: [
                  { title: "Nhập ý lễ", path: ["Lịch & Sự kiện", "Khung Phụng vụ", "Thêm ý lễ"], text: "Ý lễ của nhà cho từng ngày." },
                  { title: "Duyệt check-in đi lễ", text: "Xem ai đã check-in và bấm **Hợp lệ / Không hợp lệ** (ảnh trùng của người khác hoặc chụp sai ngày được cảnh báo). **Tổng hợp cả nhà** ở tab Điểm Danh." },
                  { title: "Cấu hình lịch phụng vụ", text: "Thêm **ngày đặc biệt** (lặp hằng năm hoặc một lần, chọn màu, bắt buộc check-in, cần ảnh), đổi **ngày & tên Bổn mạng**, số ngày báo trước, giờ nhắc, **nạp Lời Chúa**." },
                ],
              },
            ],
          },
          { label: "Ẩm thực", blocks: [{ t: "md", text: "Thực đơn tuần, chốt suất ăn, sửa đăng ký sau giờ chốt, kho thực phẩm, khảo sát món ăn." }] },
          { label: "Truyền thông", blocks: [{ t: "md", text: "Tạo/kiểm duyệt album Khoảnh khắc, đăng bản tin." }] },
        ],
      },
      { t: "callout", tone: "tip", title: "Không thấy nút cần dùng?", text: "Nhờ Admin kiểm tra quyền của vai trò ở **Cài Đặt → Phân quyền & Vai trò**." },
    ],
  },

  // ---------------------------------------------------------------- FAQ
  {
    id: "hoi-dap",
    title: "Câu hỏi thường gặp & phím tắt",
    summary: "Những tình huống hay gặp và cách xử lý nhanh.",
    icon: "help",
    audience: ["all"],
    blocks: [
      {
        t: "accordion",
        items: [
          { title: "Không thấy một mục trên thanh bên / mục bị mờ “Bảo trì”", blocks: [{ t: "md", text: "Admin đang tạm ẩn phân hệ đó, hoặc vai trò của bạn không có quyền. Lưu ý một số mục đã **gộp chung**: *Diễn đàn* nằm ở tab trong **Thông báo & Diễn đàn**, *Xin phép* trong **Lịch & Xin phép**, *Báo cáo* trong **Thu Chi & Báo cáo**, *Sơ đồ nhà* trong **Thành Viên & Nhà**, *Bắt đầu thiết lập* và *Hướng dẫn* trong **Cài Đặt & Hướng dẫn**." }] },
          { title: "Bấm nút báo “Không có quyền”", blocks: [{ t: "md", text: "Nhờ Admin kiểm tra vai trò của bạn ở Cài Đặt → Phân quyền & Vai trò." }] },
          { title: "Dữ liệu chưa cập nhật", blocks: [{ t: "md", text: "Tải lại trang (kéo xuống trên điện thoại hoặc `F5`)." }] },
          { title: "Quên mật khẩu", blocks: [{ t: "md", text: "Ở trang đăng nhập bấm **Quên mật khẩu?** để nhận email đặt lại (hiệu lực 30 phút). Chưa nhận được thư: kiểm tra mục Thư rác, hoặc nhờ Admin/Trưởng nhà đặt lại — bạn nhận mật khẩu tạm và đổi ngay khi đăng nhập." }] },
          { title: "Mất điện thoại đang dùng xác thực 2 bước", blocks: [{ t: "md", text: "Đăng nhập bằng một **mã khôi phục** (đã lưu lúc bật 2 bước). Hết mã: nhờ Admin **gỡ xác thực 2 bước** cho bạn ở Cài đặt → Tài khoản, rồi bật lại và lưu bộ mã mới." }] },
          { title: "Không nhận được thông báo đẩy", blocks: [{ t: "md", text: "Vào **Cài đặt → Thông báo**: đã bật trên thiết bị này chưa, có đang trong giờ yên tĩnh không, nhóm thông báo có bị tắt không. iPhone cần **Thêm vào Màn hình chính** và mở ứng dụng từ biểu tượng đó. Thông báo do **chính bạn** tạo không gửi ngược lại cho bạn. Nếu trang báo máy chủ chưa bật thông báo đẩy thì nhờ Admin cấu hình. Xem đầy đủ ở mục **Cài ứng dụng & bật thông báo**." }] },
          { title: "Đổi email xong mà đăng nhập bằng email đó không được", blocks: [{ t: "md", text: "Rất có thể bạn đã sửa **Email liên hệ** trong Hồ sơ — email đó **không dùng để đăng nhập**. Hãy vẫn đăng nhập bằng email cũ, rồi vào **Cài đặt → Bảo mật → Đổi email đăng nhập** để đổi đúng email đăng nhập (cần mật khẩu hiện tại)." }] },
          { title: "Muốn dùng AI", blocks: [{ t: "md", text: "Admin bật trong Cài đặt → Trợ lý AI; lần đầu dùng mỗi người cần bấm đồng ý." }] },
          { title: "Tin Zalo đến muộn hoặc có hai tin gần nhau", blocks: [{ t: "md", text: "Cron gói miễn phí có thể lệch tới ~1 giờ. Hai tin gần nhau thường là hai loại tin khác nhau (vd. sự kiện và lịch nhắc). Admin xem từng tin trong **Tích hợp Zalo → Lịch & lịch sử**." }] },
        ],
      },
      { t: "demo", name: "shortcuts", caption: "Phím tắt" },
    ],
  },
];
