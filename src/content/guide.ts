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
  { role: "admin", title: "Admin", text: "Quản trị hệ thống: tài khoản, vai trò & quyền, ẩn/hiện phân hệ, danh mục, trợ lý AI, nhật ký hoạt động. Admin không duyệt chi, không đổi tài khoản nhận quỹ và không xem dữ liệu nhạy cảm của thành viên." },
  { role: "custom", title: "Trưởng ban (vai trò tự tạo)", text: "Trưởng ban Phụng vụ, Ẩm thực, Truyền thông… do Admin tạo và chọn quyền." },
];

/** Lối tắt "Bắt đầu nhanh" ở đầu trang. */
export const GUIDE_QUICK: { icon: GuideIcon; title: string; text: string; target: string }[] = [
  { icon: "start", title: "Đăng nhập lần đầu", text: "Nhận mật khẩu tạm, đổi mật khẩu", target: "bat-dau" },
  { icon: "wallet", title: "Đóng quỹ bằng QR", text: "Quét mã, bấm “Tôi đã đóng”", target: "dong-quy" },
  { icon: "calendar", title: "Điểm danh sự kiện", text: "Quét QR hoặc nhập mã 6 số", target: "lich-su-kien" },
  { icon: "meal", title: "Đăng ký cơm", text: "Trước giờ chốt 09:00 / 15:00", target: "bep-com" },
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
      { t: "callout", tone: "tip", title: "Quên mật khẩu?", text: "Nhờ Admin hoặc Trưởng nhà vào **Cài đặt → Tài khoản → Đặt lại mật khẩu**. Bạn sẽ nhận mật khẩu tạm mới và phải đổi ngay khi đăng nhập." },
      { t: "heading", text: "Làm quen giao diện" },
      {
        t: "tabs",
        tabs: [
          {
            label: "Máy tính",
            blocks: [
              { t: "demo", name: "layout-desktop", caption: "Giao diện trên máy tính" },
              { t: "md", text: "- **① Thanh bên trái** liệt kê các phân hệ.\n- **② Tìm kiếm nhanh** (phím tắt `Ctrl + K`): mở trang, tìm anh em, tạo nhanh việc.\n- **③ Chuông**: thông báo dành cho bạn (ca trực, phiếu chi cần duyệt, phản hồi…).\n- **④ Tài khoản**: hồ sơ, đổi mật khẩu, đăng xuất." },
            ],
          },
          {
            label: "Điện thoại",
            blocks: [
              { t: "demo", name: "layout-mobile", caption: "Giao diện trên điện thoại" },
              { t: "md", text: "- **Thanh điều hướng dưới cùng**: các mục chính. Mục không có ở đó nằm trong nút **Thêm**.\n- Chạm vào một bài viết/thông báo/thành viên sẽ mở trang chi tiết; bấm **Quay lại** (hoặc nút Back của điện thoại) để trở về." },
              { t: "callout", tone: "tip", title: "Dùng như một ứng dụng", text: "Trong trình duyệt điện thoại chọn **Thêm vào màn hình chính** để mở ứng dụng nhanh như app cài sẵn." },
            ],
          },
        ],
      },
      { t: "callout", tone: "info", text: "Mục bị làm mờ với nhãn **Bảo trì**: Admin đang tạm ẩn phân hệ đó. Dữ liệu vẫn giữ nguyên, bật lại là dùng tiếp." },
      {
        t: "steps",
        title: "Khai báo tài khoản nhận tiền của tôi",
        items: [
          { title: "Mở hồ sơ", path: ["Thành Viên", "Chính tôi"], text: "Chọn chính mình để xem hồ sơ; bấm **Sửa hồ sơ** để cập nhật thông tin được phép." },
          { title: "Khai báo tài khoản", path: ["Hồ sơ", "Tài khoản nhận tiền", "Khai báo tài khoản"], text: "Chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản (có thể tải ảnh QR của ngân hàng)." },
          { title: "Xong", text: "Ứng dụng tự tạo mã **VietQR** để anh em hoặc Thủ quỹ chuyển khoản/hoàn ứng cho bạn nhanh và đúng." },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Thông báo, Lịch & Sự kiện
  {
    id: "lich-su-kien",
    title: "Thông báo, Lịch & Sự kiện",
    summary: "Đọc thông báo, báo tham dự, điểm danh bằng QR và biểu quyết.",
    icon: "calendar",
    audience: ["member", "all"],
    blocks: [
      { t: "heading", text: "Thông báo" },
      { t: "md", text: "Vào **Thông báo** để đọc bảng tin. Thông báo có nút **Xác nhận đã đọc** thì bấm để Ban điều hành biết bạn đã nắm." },
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
          { title: "Chọn khoản", path: ["Thu Chi", "Các khoản thu"], text: "Chọn chip khoản cần xem (“Quỹ T7–T12”, “ĐN T9”…) để biết bạn đã đóng hay chưa.", demo: "pay-states" },
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

  // ---------------------------------------------------------------- Cộng đồng
  {
    id: "cong-dong",
    title: "Diễn đàn, Học tập, Khoảnh khắc & Trợ lý AI",
    summary: "Trao đổi, nhập bảng điểm, xem album ảnh và hỏi trợ lý AI.",
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
              { t: "callout", tone: "info", text: "Thủ quỹ và Trưởng nhà sửa được; **Admin không đổi được nơi nhận tiền**." },
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
            title: "Báo cáo, thống kê & nhắc quỹ",
            blocks: [
              { t: "md", text: "- Tab **Thống kê & Xuất file**: thu – chi theo **tháng / quý / năm**, biểu đồ, cơ cấu chi; nút **Xuất Excel** và **Xuất PDF**.\n- **Tải báo cáo PDF**, **Gửi Zalo** để gửi nhóm; nút **Soạn tin nhắc quỹ** (AI) soạn lời nhắc không nêu tên ai.\n- Thẻ **AI nhận xét thu chi tháng** so sánh tháng này với tháng trước (khi Admin đã bật AI). Nhận xét lưu 1 giờ để khỏi tốn lượt AI; bấm **Tạo lại** khi muốn bản mới." },
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
              { t: "md", text: "- **Thành Viên → Đơn chờ duyệt**: duyệt đơn xin vào nhà và xếp phòng.\n- **Thêm thành viên** (có thể cấp tài khoản ngay — mật khẩu tạm hiện **một lần**, hãy gửi riêng cho người đó).\n- **Sơ đồ nhà**: xếp/chuyển phòng (máy tính: kéo thả; điện thoại: danh sách thẻ), sửa cấu trúc phòng." },
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
              { t: "md", text: "- Bốn vai trò hệ thống (Admin, Trưởng nhà, Thủ quỹ, Thành viên) không xóa được và bộ quyền cố định.\n- **Thêm vai trò** cho các ban (ví dụ Trưởng ban Ẩm thực): đặt tên, mô tả, chọn quyền theo nhóm phân hệ (có ô tìm quyền), rồi gán cho người phụ trách ở tab Tài khoản.\n- **Sửa / Xóa** vai trò tự tạo. Vai trò còn lịch sử sẽ được lưu trữ, người đang giữ mất quyền ngay." },
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
              { t: "md", text: "**Cài Đặt → Trợ lý AI**: bật công tắc tổng và từng tính năng (hỏi đáp nội quy, soạn tin nhắc quỹ, phân loại sự cố, tóm tắt, soát nội dung, nhận xét thu chi, nhận xét học tập), đặt ngân sách tháng, xem nhật ký. Khóa API Groq/Gemini đặt trong file `.env.local` của máy chủ." },
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
      { t: "callout", tone: "danger", title: "Giới hạn của Admin", text: "Admin **không** duyệt chi, không đổi tài khoản nhận quỹ, không xem dữ liệu nhạy cảm (CCCD, thông tin phụ huynh, hồ sơ Công giáo, điểm chi tiết của người khác) — những việc đó thuộc Trưởng nhà/Thủ quỹ." },
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
          { title: "Không thấy một mục trên thanh bên / mục bị mờ “Bảo trì”", blocks: [{ t: "md", text: "Admin đang tạm ẩn phân hệ đó, hoặc vai trò của bạn không có quyền." }] },
          { title: "Bấm nút báo “Không có quyền”", blocks: [{ t: "md", text: "Nhờ Admin kiểm tra vai trò của bạn ở Cài Đặt → Phân quyền & Vai trò." }] },
          { title: "Dữ liệu chưa cập nhật", blocks: [{ t: "md", text: "Tải lại trang (kéo xuống trên điện thoại hoặc `F5`)." }] },
          { title: "Quên mật khẩu", blocks: [{ t: "md", text: "Nhờ Admin/Trưởng nhà đặt lại; bạn nhận mật khẩu tạm và đổi ngay khi đăng nhập." }] },
          { title: "Muốn dùng AI", blocks: [{ t: "md", text: "Admin bật trong Cài đặt → Trợ lý AI; lần đầu dùng mỗi người cần bấm đồng ý." }] },
          { title: "Tin Zalo đến muộn hoặc có hai tin gần nhau", blocks: [{ t: "md", text: "Cron gói miễn phí có thể lệch tới ~1 giờ. Hai tin gần nhau thường là hai loại tin khác nhau (vd. sự kiện và lịch nhắc). Admin xem từng tin trong **Tích hợp Zalo → Lịch & lịch sử**." }] },
        ],
      },
      { t: "demo", name: "shortcuts", caption: "Phím tắt" },
    ],
  },
];
