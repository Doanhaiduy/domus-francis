// Lịch sử cập nhật của ứng dụng — hiện ở Quản trị hệ thống → Phiên bản & cập nhật.
//
// QUY TẮC (mỗi lần phát hành lên staging/production):
//   1. Tăng `version` trong package.json (node scripts/bump-version.mjs <patch|minor|major> "Tiêu đề bản phát hành" làm cả hai việc 2 và 3 một lượt)
//   2. Thêm một mục ĐẦU danh sách dưới đây (mới nhất ở trên), cùng số phiên bản và ngày phát hành (YYYY-MM-DD, giờ Việt Nam)
//   3. `pnpm build` chạy scripts/check-version.mjs: số phiên bản trong package.json phải TRÙNG mục đầu của danh sách này — lệch thì build hỏng.
// Số phiên bản: MAJOR.MINOR.PATCH — patch = sửa lỗi nhỏ; minor = thêm tính năng/màn hình; major = đổi lớn, không tương thích.
// Các bản trước 1.7.0 được dựng lại từ nhật ký phát triển (git) nên mốc ngày là gần đúng theo ngày làm.

export type ChangeKind = "feat" | "improve" | "fix" | "ops";

export interface ReleaseChange {
  kind: ChangeKind;
  text: string;
}

export interface Release {
  version: string;
  /** Ngày phát hành, YYYY-MM-DD (giờ Việt Nam). */
  date: string;
  title: string;
  changes: ReleaseChange[];
}

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  feat: "Mới",
  improve: "Cải tiến",
  fix: "Sửa lỗi",
  ops: "Vận hành",
};

export const CHANGELOG: Release[] = [
  {
    version: "1.7.0",
    date: "2026-10-14",
    title: "Trang Quản trị hệ thống riêng + phiên bản & lịch sử cập nhật",
    changes: [
      { kind: "feat", text: "Mục **Quản trị hệ thống** riêng trên thanh bên: Phân quyền, Tài khoản, Phân hệ, Tích hợp Zalo, Trợ lý AI, Dung lượng, Nhật ký hoạt động, Hệ thống. **Cài đặt** chỉ còn hồ sơ, bảo mật, thông báo của bạn và cấu hình của lưu xá (thông tin chung, danh mục, nhắc lịch)." },
      { kind: "feat", text: "Tab **Phiên bản & cập nhật**: số phiên bản đang chạy, thời điểm dựng, mã commit, môi trường và lịch sử các lần cập nhật." },
      { kind: "fix", text: "Số phiên bản hiển thị sai (từng gõ cứng \"v2.5.0\"): nay lấy từ phiên bản thật của ứng dụng; mỗi lần phát hành đều phải tăng số phiên bản." },
      { kind: "improve", text: "Tra cứu tư liệu viết bài: AI thẩm định từng tin Vatican News / Wikipedia có nói trực tiếp về đề tài không, so khớp từ khóa có dấu; nguồn tham khảo mặc định không tick, chỉ ghi nguồn bạn đã mở và đối chiếu." },
    ],
  },
  {
    version: "1.6.1",
    date: "2026-10-14",
    title: "Sửa gợi ý nguồn, chèn ảnh minh họa và chú thích ảnh AI",
    changes: [
      { kind: "fix", text: "Tra cứu Wikipedia chỉ lấy trang Công giáo, không còn ra trang đạo khác (vd. Cao Đài khi tìm \"Tòa Thánh\"); tin Vatican phải trùng đủ từ đặc trưng của đề tài." },
      { kind: "fix", text: "Ảnh minh họa chèn NGAY DƯỚI đoạn đang chọn thay vì rơi xuống cuối bài (bài xuống dòng một lần giữa các đoạn); \"AI đề xuất chỗ chèn ảnh\" cũng tách đoạn theo dòng." },
      { kind: "fix", text: "Chú thích ảnh AI gắn với nội dung bài thay vì chỉ tả ảnh, không còn bị cắt giữa chữ; nút gợi ý chú thích gửi kèm tiêu đề và đoạn văn gần ảnh." },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-10-14",
    title: "AI đề xuất chỗ chèn ảnh minh họa",
    changes: [
      { kind: "feat", text: "Menu **Ảnh minh họa AI** trên thanh công cụ soạn bài: vẽ cho đoạn đang chọn, hoặc nhờ AI đọc cả bài, đề xuất 2–4 chỗ nên có ảnh để bạn tick, vẽ song song rồi chèn một lần." },
      { kind: "improve", text: "Bỏ giới hạn 6 lượt vẽ ảnh mỗi giờ (chỉ còn mức chung của cả nhà mỗi ngày)." },
      { kind: "improve", text: "Tinh chỉnh AI viết bài bớt \"lộ AI\": một ngôi kể, thông tin thiết thực lên trước, mỗi đoạn một ý; dò thêm lời chứng chung chung, cụm từ lặp, cấu trúc \"không… mà…\"." },
    ],
  },
  {
    version: "1.5.1",
    date: "2026-10-14",
    title: "Sửa lỗi tra cứu tư liệu",
    changes: [
      { kind: "fix", text: "Tra cứu trả tối đa 12 ghi chú và bản nháp nhận tới 20 ghi chú — hết lỗi \"Dữ liệu gửi cho AI không hợp lệ\"; loại trang Wikipedia lạc đề." },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-14",
    title: "Trợ lý viết bài chân thực hơn + ảnh AI miễn phí",
    changes: [
      { kind: "feat", text: "AI viết bài dựa trên **bảng thông tin thật** (ngày, lễ phụng vụ, Bổn mạng, sự kiện sắp tới của nhà) thay vì tự suy diễn; dò ngày/giờ/số điện thoại/con số/câu trích AI tự thêm và nêu ở mục \"AI cần bạn kiểm lại\"." },
      { kind: "feat", text: "AI hỏi vài câu để bạn kể điều thật đã xảy ra; tra cứu tư liệu có nguồn (tìm kiếm Google, Vatican News, Wikipedia)." },
      { kind: "feat", text: "Tạo ảnh bìa và ảnh minh họa bằng AI (Cloudflare Workers AI, miễn phí) có nhãn \"Ảnh minh họa do AI tạo\"; AI gợi ý chú thích ảnh; chọn ảnh bìa từ Khoảnh khắc." },
      { kind: "ops", text: "Cloudflare làm văn bản dự phòng khi Groq/Gemini lỗi; thêm Turnstile chống spam cho biểu mẫu công khai; văn bản pháp lý lên 1.3 (hỏi đồng ý lại một lần)." },
    ],
  },
  {
    version: "1.4.1",
    date: "2026-10-13",
    title: "Rà soát giao diện và vận hành",
    changes: [
      { kind: "fix", text: "Rà soát bố cục điện thoại/máy tính: thanh bên chuyển ở màn hình lớn, hết tràn ngang ở nhiều trang (vd. Dung lượng)." },
      { kind: "fix", text: "Lịch sử sao lưu không còn hiện \"0 ms\"; đổi model Gemini dự phòng; sửa CI cho pnpm 11." },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-10-13",
    title: "Đợt cải tiến 12/10 — vận hành, hộp việc, tài chính, riêng tư",
    changes: [
      { kind: "feat", text: "**Vận hành**: nhật ký tác vụ nền, nhật ký lỗi gộp, nhịp tim sao lưu, cảnh báo cho Admin; thu hồi quyền Data API không dùng." },
      { kind: "feat", text: "**Hộp việc cần xử lý** cho người quản lý và **Việc của tôi hôm nay** cho thành viên; thanh điều hướng dưới điện thoại; tắt thông báo theo từng loại." },
      { kind: "feat", text: "**Phụng vụ & Trực**: check-in đi lễ tự xác nhận, duyệt hàng loạt, xếp trực tự động nhiều tuần. **Sự kiện**: chuỗi lặp, tải .ics, lịch cá nhân theo mã bí mật." },
      { kind: "feat", text: "**Tài chính**: sổ cái băm nối chuỗi, kỳ kế toán, nhắc phiếu chi chưa duyệt. **Thành viên**: rời nhà có danh sách việc treo, kích hoạt lại, ủy quyền tạm thời, xuất Excel tạm trú." },
      { kind: "feat", text: "**Quyền riêng tư**: yêu cầu xem/xóa dữ liệu cá nhân, tự ẩn danh hồ sơ quá hạn. **Trang công khai**: tuyển sinh /vao-o, báo ủng hộ VietQR, minh bạch tài chính." },
      { kind: "improve", text: "Bếp & Cơm chỉ một công tắc, \"luôn ăn trừ khi báo vắng\", nhắc đăng ký cơm; kỷ luật cảnh báo tái phạm; xem tối nay ai vắng/về muộn." },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-12",
    title: "Phiếu chi chi tiết từng món",
    changes: [
      { kind: "feat", text: "Phiếu chi ghi từng món (đi chợ nhiều món): tự tính thành tiền, tổng phiếu khớp tổng các món; báo cáo thu chi và Excel liệt kê từng món." },
      { kind: "improve", text: "Thay thành phần gốc của trình duyệt (danh sách gợi ý, ô chọn, ô ngày/giờ) bằng ô nhập/chọn dùng chung, đẹp hơn và có chế độ tối." },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-11",
    title: "Khoảnh khắc video, hộp thoại kéo xuống, tải ảnh nhanh",
    changes: [
      { kind: "feat", text: "Khoảnh khắc: tải **video** (Cloudinary/Supabase) và album chung \"Khoảnh khắc thường ngày\"." },
      { kind: "improve", text: "Mọi hộp thoại thành tờ trượt từ đáy trên điện thoại, kéo xuống để đóng; bảo vệ khi đang tải/lưu/nhập dở; toast lớn rõ." },
      { kind: "improve", text: "Tải ảnh nhanh: thu nhỏ + nén ngay trên trình duyệt, có % tiến độ và nút hủy; trình xem ảnh dùng chung (phóng to, kéo, xoay, tải về); dán ảnh Ctrl+V vào bài viết." },
      { kind: "feat", text: "Admin theo dõi **dung lượng** CSDL/Storage/Cloudinary; sửa phiếu chi sai; xin phép nhiều loại (về quê, nghỉ Tết/hè…); danh sách nhà thờ Nha Trang khi check-in đi lễ." },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-07",
    title: "Kỷ luật, ủng hộ quỹ, tổng kết và luật nhà chính thức",
    changes: [
      { kind: "feat", text: "**Vi phạm & kỷ luật** (Lỗi đỏ, hình phạt, theo dõi hoàn thành); **Luật nhà chính thức** của lưu xá; **Ủng hộ quỹ**; **Tổng kết thành viên** theo tháng/quý/năm (Excel/PDF)." },
      { kind: "feat", text: "Thu chi: quỹ chung duy nhất, số dư khởi đầu, ghi thu hàng loạt, điều chỉnh sổ quỹ, điện nước nhập theo mỗi người + trừ quỹ ngay." },
      { kind: "feat", text: "Xin phép có người để cửa + xin thêm giờ báo qua nhóm Zalo; điểm danh sự kiện bằng ảnh (bỏ QR); trang Góp ý; chọn Tên Thánh từ danh sách." },
      { kind: "ops", text: "Sao lưu tự động hằng ngày; Chính sách bảo mật và Điều khoản sử dụng công khai; Admin dọn dữ liệu rác; đổi email đăng nhập." },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-06",
    title: "Phát hành chính thức — staging và production",
    changes: [
      { kind: "ops", text: "Tách môi trường staging/production (DB, khóa, Storage riêng); giám sát, CI, xác thực 2 lớp, quên mật khẩu, thông báo đẩy và cài ứng dụng (PWA), quản lý đồng ý dữ liệu." },
      { kind: "feat", text: "Trang công khai: tin tức, giới thiệu, liên hệ, hỏi đáp, thư viện, ủng hộ; trình soạn bài viết có Trợ lý AI; giao diện tối; chân trang bản quyền." },
      { kind: "feat", text: "Nhập thành viên từ Excel (24 cột), webhook ngân hàng, cựu thành viên, đơn xin phép, báo cáo; trang Hướng dẫn mới, PDF vector; nhật ký hoạt động người dùng." },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-05",
    title: "Nền tảng đầy đủ trên PostgreSQL + Supabase",
    changes: [
      { kind: "feat", text: "Backend PostgreSQL (phân quyền theo hàng RLS) + Supabase; vai trò và phân quyền, đóng quỹ, QR thanh toán, phân hệ, tài liệu phụng vụ, danh mục học tập, thông tin chi tiết bằng AI." },
      { kind: "feat", text: "Lịch phụng vụ Công giáo, check-in đi lễ, bot Zalo gửi lịch trực/nhắc quỹ, tác vụ hằng ngày, luật nhà, trực vệ sinh theo tuần." },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-10-02",
    title: "Khởi tạo dự án",
    changes: [
      { kind: "feat", text: "Khung ứng dụng Next.js: quản lý phòng ở có kiểm sức chứa, hộp thoại xác nhận và bộ ô nhập chuẩn hóa." },
    ],
  },
];
