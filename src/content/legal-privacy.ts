// Chính sách bảo mật & bảo vệ dữ liệu cá nhân. Mọi khẳng định ở đây phải khớp với hệ thống thật — đổi tính năng/nhà cung cấp/cách lưu trữ thì cập nhật văn bản này.
// Căn cứ pháp lý (đã đối chiếu 10/2026): Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định số 356/2025/NĐ-CP
// (thay thế Nghị định 13/2023/NĐ-CP). Không ghi thời hạn luật định cụ thể ở đây — chỉ cam kết "trong thời hạn pháp luật quy định"
// (72 giờ là mục tiêu phản hồi NỘI BỘ của nhà, đúng hạn mặc định của bảng data_subject_requests).
// Bản 1.2 (12/10/2026): đồng ý theo phiên bản (hỏi lại khi văn bản đổi), "Tải dữ liệu của tôi", yêu cầu về dữ liệu trong ứng dụng (72 giờ),
// rút đồng ý hồ sơ Công giáo = xóa, thời hạn lưu + tự ẩn danh người đã rời nhà (khi người quản lý bật), Cloudinary (video), email thông báo
// (Resend), nhật ký lỗi kỹ thuật / lượt chạy tác vụ nền / hoạt động, giới hạn tần suất bằng khóa băm, đường dẫn đồng bộ lịch có mã riêng,
// Trợ lý Lưu Xá che tên thành viên + đọc Luật nhà chính thức; cookie ghi nhớ đã đăng nhập (luuxa_hs), báo ủng hộ công khai (/ung-ho),
// báo cáo vi phạm CSP, trang Vào ở lưu xá (/vao-o — bản đồ chỉ mở khi bấm, không nhúng bên thứ ba).
import type { PublicOrgInfo } from "@/lib/types/articles";
import { LEGAL_PATHS, contactLine, houseOf, type LegalDoc } from "./legal";

const P = LEGAL_PATHS.privacy;
const T = LEGAL_PATHS.terms;

export function privacyPolicy(org: PublicOrgInfo): LegalDoc {
  const house = houseOf(org);
  return {
    title: "Chính sách bảo mật & bảo vệ dữ liệu cá nhân",
    subtitle: `Chúng tôi thu thập dữ liệu nào, dùng vào việc gì, bảo vệ ra sao và bạn có những quyền gì khi dùng trang web và ứng dụng của ${house}.`,
    summary: [
      "Chúng tôi chỉ thu thập dữ liệu cần thiết để vận hành đời sống chung của cộng đoàn: hồ sơ thành viên, điểm danh, trực tuần, quỹ chung, thông báo.",
      "**Dữ liệu nhạy cảm** (hồ sơ Công giáo, điểm học tập) chỉ được lưu và chia sẻ **khi bạn đồng ý**, từng mục riêng; rút đồng ý lưu hồ sơ Công giáo thì hồ sơ đó **bị xóa**.",
      "Số CCCD/CMND và số điện thoại phụ huynh được **mã hóa**; mật khẩu chỉ lưu dạng băm **Argon2id**; ai xem được gì phụ thuộc vào vai trò và được kiểm soát ngay ở cơ sở dữ liệu.",
      "Chúng tôi **không bán** dữ liệu và không dùng dữ liệu của bạn để quảng cáo. Chỉ dùng các nhà cung cấp hạ tầng cần thiết (xem mục Bên thứ ba).",
      "Bạn **tự tải dữ liệu của mình** và **gửi yêu cầu xem, sửa, xóa, rút đồng ý** ngay trong ứng dụng; người quản lý phản hồi trong **72 giờ**.",
    ],
    sections: [
      {
        id: "gioi-thieu",
        title: "Giới thiệu và phạm vi áp dụng",
        blocks: [
          {
            t: "md",
            text: `${house} (“**Lưu xá**”, “**chúng tôi**”) vận hành hệ thống quản lý cộng đoàn gồm trang web công khai và ứng dụng dành cho thành viên (“**Hệ thống**”). Chính sách này giải thích cách chúng tôi xử lý dữ liệu cá nhân của bạn khi bạn truy cập trang công khai (bản tin, giới thiệu, vào ở lưu xá, hỏi đáp, thư viện, ủng hộ…), gửi đăng ký tìm hiểu hoặc báo đã ủng hộ, hoặc sử dụng Hệ thống với tư cách thành viên, cựu thành viên hay người ủng hộ.

Chúng tôi là **bên kiểm soát dữ liệu** đối với dữ liệu được nêu trong Chính sách này. Việc xử lý tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, Nghị định số 356/2025/NĐ-CP quy định chi tiết và biện pháp thi hành Luật này, cùng các quy định pháp luật liên quan của Việt Nam.`,
          },
          {
            t: "callout",
            tone: "info",
            text: `Chính sách này đi cùng [Điều khoản sử dụng](${T}). Khi hai văn bản khác nhau về việc xử lý dữ liệu cá nhân, Chính sách này được ưu tiên áp dụng.`,
          },
        ],
      },
      {
        id: "du-lieu-thu-thap",
        title: "Dữ liệu chúng tôi thu thập",
        blocks: [
          { t: "md", text: "Chúng tôi chỉ thu thập dữ liệu ở mức cần thiết cho từng mục đích. Bảng dưới đây liệt kê theo nhóm đối tượng." },
          {
            t: "table",
            head: ["Nhóm", "Dữ liệu", "Nguồn và ghi chú"],
            widths: ["w-[22%]", "w-[46%]", "w-[32%]"],
            rows: [
              ["**Người truy cập trang công khai**", "Dữ liệu kỹ thuật: địa chỉ IP, loại trình duyệt và thiết bị, trang đã xem, thời điểm truy cập; số liệu truy cập và hiệu năng ở dạng tổng hợp. Báo cáo kỹ thuật tự động của trình duyệt khi trang bị chặn tải một nội dung không được phép (chỉ đường dẫn trang đã bỏ tham số và nguồn bị chặn ở dạng rút gọn).", "Thu tự động. Không dùng cookie quảng cáo hay theo dõi liên trang; địa chỉ IP chỉ dùng ở dạng băm để giới hạn tần suất."],
              ["**Người gửi đăng ký tìm hiểu**", "Họ tên; số điện thoại/Zalo và/hoặc email; trường đang hoặc sắp học; năm học; giáo xứ; thời gian muốn đến thăm; lời nhắn.", "Bạn tự nhập ở trang Liên hệ. Chỉ dùng để liên hệ tư vấn."],
              ["**Người tự đăng ký tài khoản**", "Họ tên, email, số điện thoại, trường đang học, lời nhắn cho người quản lý; việc bạn tick đồng ý Điều khoản sử dụng và Chính sách bảo mật (phiên bản văn bản, thời điểm, địa chỉ IP, trình duyệt).", "Bạn tự nhập ở trang đăng nhập. Đơn chờ người quản lý duyệt; khi được duyệt, bằng chứng đồng ý được chuyển vào hồ sơ của bạn."],
              ["**Thành viên — tài khoản**", "Email hoặc số điện thoại đăng nhập; mật khẩu (chỉ lưu bản băm); khóa xác thực hai lớp; thông tin phiên đăng nhập (thời điểm, địa chỉ IP, trình duyệt); bằng chứng các lần đồng ý (mục đích, phiên bản văn bản, thời điểm, cách ghi nhận).", "Tạo khi bạn đăng ký và được duyệt, hoặc khi người quản lý cấp tài khoản."],
              ["**Thành viên — hồ sơ cơ bản**", "Họ tên, giới tính, ảnh đại diện, số điện thoại, email liên hệ, phòng ở, trường, ngành, khóa, mã sinh viên, tình trạng học tập, ngày vào nhà.", "Bạn nhập hoặc người quản lý cập nhật."],
              ["**Thành viên — thông tin riêng tư**", "Ngày sinh, số CCCD/CMND, quê quán, địa chỉ thường trú; họ tên và số điện thoại của cha, mẹ.", "Chỉ bạn và người quản lý có thẩm quyền xem được. Số CCCD/CMND và số điện thoại phụ huynh được mã hóa."],
              ["**Thành viên — hồ sơ Công giáo** (nhạy cảm)", "Tên Thánh, giáo phận, giáo xứ, linh mục quản xứ, các Bí tích đã lãnh nhận.", "Chỉ lưu khi bạn đồng ý (xem mục Dữ liệu nhạy cảm)."],
              ["**Thành viên — học tập** (nhạy cảm)", "Điểm học tập và minh chứng do bạn nhập; nhu cầu hỗ trợ môn học.", "Chỉ chia sẻ cho người khác khi bạn đồng ý."],
              ["**Thành viên — sinh hoạt chung**", "Điểm danh sự kiện (thời điểm điểm danh và **ảnh bạn chụp gửi lại** làm minh chứng); check-in đi lễ (nhà thờ, ảnh minh chứng); đơn xin phép (lý do, nơi đến, giờ dự kiến về, người bạn nhờ để cửa, các lần xin thêm giờ); lịch trực tuần; vi phạm và hình phạt; thi đua; báo sự cố, bảo trì; đăng ký cơm.", "Phát sinh khi bạn tham gia sinh hoạt hoặc khi người quản lý ghi nhận. Ảnh điểm danh chỉ bạn và người phụ trách điểm danh xem được."],
              ["**Thành viên — góp ý và yêu cầu về dữ liệu**", "Góp ý về ứng dụng (nội dung, loại, trang đang dùng, ảnh chụp màn hình nếu có, câu trả lời); yêu cầu về dữ liệu cá nhân (loại yêu cầu, mô tả, thời điểm gửi, hạn phản hồi, kết quả xử lý).", "Bạn tự gửi. Góp ý có thể **ẩn tên** với người quản lý (hệ thống vẫn nhận ra góp ý là của bạn để bạn xem lại hoặc rút lại)."],
              ["**Thành viên — tài chính**", "Các khoản đóng quỹ, phiếu chi và hoàn ứng liên quan đến bạn; tài khoản nhận tiền do bạn khai (ngân hàng, số tài khoản, chủ tài khoản, ảnh mã QR).", "Sổ quỹ được ghi bất biến (xem mục Thời gian lưu trữ)."],
              ["**Thành viên — nội dung**", "Bài đăng, bình luận, ý cầu nguyện, ảnh, **video** và album khoảnh khắc, tệp đính kèm bạn tải lên; ảnh bạn được gắn thẻ (khi bạn cho phép).", "Ảnh và tệp được lưu ở kho riêng tư; video lưu ở nhà cung cấp video (xem mục Bên thứ ba)."],
              ["**Thành viên — đường dẫn đồng bộ lịch** (khi bạn tạo)", "Mã bí mật riêng trong đường dẫn để ứng dụng lịch (Google Calendar, iPhone…) đọc lịch sinh hoạt của bạn; thời điểm tạo, lần dùng gần nhất.", "Chỉ lưu dạng băm của mã. Ai có đường dẫn đều xem được lịch trong đó — bạn thu hồi và tạo lại bất cứ lúc nào."],
              ["**Cựu thành viên**", "Nghề nghiệp, nơi làm việc, thành phố; việc bạn có còn giữ liên lạc hay không.", "Chỉ hiện cho thành viên khác khi bạn chọn “còn giữ liên lạc”."],
              ["**Người ủng hộ và giao dịch quỹ**", "Tên người ủng hộ, số tiền, ngày, lời nhắn (nếu có) do người quản lý ghi nhận; khi bạn tự **báo đã ủng hộ** ở trang Ủng hộ: tên hoặc danh xưng (hoặc ẩn danh), số tiền, ngày, lời nhắn, thông tin liên hệ nếu bạn để lại; dòng giao dịch vào tài khoản quỹ (số tiền, nội dung chuyển khoản, thời điểm) khi có kết nối dịch vụ báo biến động số dư.", "Chỉ người quản lý quỹ (Thủ quỹ, Trưởng nhà) xem. Khoản tự báo chỉ vào sổ quỹ sau khi được đối chiếu và xác nhận; giao dịch ngân hàng tự động chỉ được lưu để đối chiếu, không tự ghi sổ."],
              ["**Dữ liệu kỹ thuật khi dùng ứng dụng**", "Nhật ký hoạt động (thao tác ghi dữ liệu: chức năng, kết quả, thời điểm, địa chỉ IP, trình duyệt — không lưu nội dung bạn gửi); nhật ký lỗi kỹ thuật (nơi xảy ra lỗi, thông điệp lỗi đã **che email và dãy số**, mã yêu cầu, tài khoản gặp lỗi); nhật ký lượt chạy tác vụ tự động; số lượt dùng của một số thao tác để chống lạm dụng (lưu dưới dạng **khóa đã băm**, không lưu địa chỉ IP thô).", "Thu tự động để bảo đảm an toàn và sửa lỗi. Chỉ người quản trị hệ thống xem được."],
            ],
          },
          { t: "md", text: "Chúng tôi **không** thu thập dữ liệu sinh trắc học, danh bạ điện thoại hay vị trí (định vị) của bạn; thông tin vị trí (GPS) trong ảnh bạn tải lên được xóa trước khi lưu." },
        ],
      },
      {
        id: "muc-dich",
        title: "Mục đích và cơ sở xử lý",
        blocks: [
          {
            t: "table",
            head: ["Mục đích", "Cơ sở xử lý"],
            widths: ["w-[58%]", "w-[42%]"],
            rows: [
              ["Quản lý thành viên và đời sống chung: hồ sơ, phòng ở, điểm danh, trực tuần, xin phép, kỷ luật, thi đua, thông báo.", "Cần thiết để thực hiện thỏa thuận cư trú và nội quy của Lưu xá; lợi ích chính đáng của cộng đoàn trong việc quản lý."],
              ["Quản lý quỹ chung minh bạch: thu, chi, hoàn ứng, ủng hộ, đối chiếu ngân hàng.", "Như trên, kèm yêu cầu minh bạch và kiểm soát tài chính của cộng đoàn."],
              ["Sinh hoạt phụng vụ và đời sống đức tin (hồ sơ Công giáo).", "**Sự đồng ý** của bạn, cho từng mục đích riêng."],
              ["Hỗ trợ học tập: xem điểm, ghép phụ đạo, thống kê nội bộ.", "**Sự đồng ý** của bạn, cho từng mục đích riêng."],
              ["Bảo mật và an toàn hệ thống: xác thực, chống gian lận và spam, giới hạn tần suất, nhật ký kiểm toán, nhật ký hoạt động.", "Lợi ích chính đáng; nghĩa vụ bảo vệ dữ liệu."],
              ["Vận hành ổn định: ghi nhận và sửa lỗi kỹ thuật, theo dõi các tác vụ tự động (nhắc lịch, sao lưu…).", "Lợi ích chính đáng."],
              ["Thực hiện quyền của bạn với dữ liệu cá nhân (cung cấp bản sao, sửa, xóa, rút đồng ý) và lưu bằng chứng đồng ý.", "Nghĩa vụ theo quy định về bảo vệ dữ liệu cá nhân."],
              ["Tư vấn cho người đăng ký tìm hiểu.", "Yêu cầu của chính bạn khi gửi biểu mẫu."],
              ["Gửi thông báo: trong ứng dụng, thông báo đẩy, email, nhóm Zalo.", "Thực hiện nội quy đối với thông báo bắt buộc; **sự đồng ý** của bạn đối với kênh nhắn tin bên thứ ba."],
              ["Cải thiện chất lượng hệ thống bằng số liệu tổng hợp, ẩn danh.", "Lợi ích chính đáng."],
            ],
          },
          {
            t: "md",
            text: "Chúng tôi không xử lý dữ liệu của bạn cho mục đích khác khi chưa thông báo và, nếu pháp luật yêu cầu, chưa được bạn đồng ý.\n\n**Chúng tôi không bán, cho thuê hay trao đổi dữ liệu cá nhân của bạn và không dùng dữ liệu đó để quảng cáo.** Các tính năng AI chỉ đưa ra gợi ý; mọi quyết định liên quan đến bạn do người quản lý đưa ra.",
          },
        ],
      },
      {
        id: "dong-y",
        title: "Dữ liệu nhạy cảm và sự đồng ý",
        blocks: [
          {
            t: "md",
            text: "Một số dữ liệu — như thông tin về đức tin, tôn giáo và điểm học tập — được chúng tôi coi là **dữ liệu nhạy cảm**. Chúng tôi chỉ lưu hoặc chia sẻ chúng khi bạn đồng ý, và tách riêng từng mục đích: đồng ý mục này không kéo theo đồng ý mục khác. Việc từ chối **không** ảnh hưởng đến quyền cư trú hay quyền lợi khác của bạn.",
          },
          {
            t: "table",
            head: ["Mục đồng ý", "Cho phép"],
            widths: ["w-[38%]", "w-[62%]"],
            rows: [
              ["Lưu hồ sơ Công giáo", "Lưu Tên Thánh, giáo xứ, giáo phận và các Bí tích. **Rút lại thì hồ sơ Công giáo của bạn bị xóa ngay.**"],
              ["Cho người quản lý xem hồ sơ Công giáo", "Trưởng nhà, Trưởng ban Phụng vụ xem để phục vụ sinh hoạt phụng vụ."],
              ["Chia sẻ bảng điểm cho người quản lý", "Người quản lý xem điểm chi tiết để hỗ trợ học tập và xét học bổng."],
              ["Chia sẻ nhu cầu học tập cho người kèm", "Người được ghép cặp phụ đạo biết môn bạn cần hỗ trợ."],
              ["Tham gia thống kê học tập nội bộ", "Điểm tổng hợp của bạn nằm trong thống kê ẩn danh (nhóm từ 3 người trở lên)."],
              ["Cho gắn thẻ tên vào ảnh", "Thành viên khác có thể gắn thẻ tên bạn trong album Khoảnh khắc."],
              ["Nhận thông báo qua Zalo, Telegram, SMS", "Gửi thông báo qua kênh nhắn tin bên thứ ba đã liên kết."],
            ],
          },
          {
            t: "md",
            text: `Bạn bật hoặc tắt từng mục ở **Cài đặt → Bảo mật** (và thẻ Hồ sơ Công giáo ở **Cài đặt → Hồ sơ cá nhân**). Khi bạn rút lại sự đồng ý, chúng tôi ngừng xử lý theo mục đích đó; riêng **rút đồng ý lưu hồ sơ Công giáo** thì hệ thống **xóa hẳn** Tên Thánh, giáo phận, giáo xứ, linh mục quản xứ và các Bí tích của bạn (ứng dụng hỏi lại trước khi xóa). Việc rút lại không ảnh hưởng đến tính hợp pháp của việc xử lý đã thực hiện trước đó. Bằng chứng về việc bạn đã đồng ý hay rút lại (mục đích, phiên bản, thời điểm) được giữ lại để chứng minh việc tuân thủ.

**Đồng ý Điều khoản sử dụng và Chính sách bảo mật.** Khi tự đăng ký, bạn tick đồng ý hai văn bản này; tài khoản do người quản lý cấp hoặc nhập từ danh sách sẽ được hỏi ở lần đăng nhập đầu tiên. Mỗi khi văn bản đổi **phiên bản**, ứng dụng hiện hộp thoại tóm tắt điểm chính để bạn xem và xác nhận lại. Hệ thống lưu phiên bản, thời điểm, địa chỉ IP và trình duyệt lúc bạn xác nhận.

**Dữ liệu của người thứ ba.** Khi bạn cung cấp thông tin của cha, mẹ hoặc người thân, bạn cam đoan đã thông báo cho họ và có cơ sở hợp pháp để cung cấp. Người đó cũng có các quyền nêu ở mục [Quyền của bạn](${P}#quyen).`,
          },
        ],
      },
      {
        id: "truy-cap",
        title: "Ai được truy cập dữ liệu của bạn",
        blocks: [
          {
            t: "md",
            text: `- **Chính bạn**: xem và chỉnh sửa hồ sơ của mình, tải bản sao dữ liệu của mình.
- **Thành viên khác**: chỉ thấy thông tin danh bạ cơ bản (họ tên, ảnh, phòng, khóa…) và những gì bạn chủ động chia sẻ.
- **Người quản lý** (Trưởng nhà, Thủ quỹ, các Trưởng ban…): chỉ xem dữ liệu thuộc phạm vi nhiệm vụ của họ. Ví dụ Thủ quỹ xem các khoản quỹ; hồ sơ Công giáo và bảng điểm chỉ được xem khi bạn đã đồng ý chia sẻ; yêu cầu về dữ liệu cá nhân chỉ Trưởng nhà và Admin xử lý.
- **Quản trị hệ thống**: có quyền kỹ thuật để vận hành, bảo trì và khắc phục sự cố (gồm nhật ký lỗi, nhật ký hoạt động); thao tác quản trị được ghi nhật ký.
- **Công chúng**: chỉ thấy nội dung được chủ động đăng công khai (bài viết, album công khai, phần giới thiệu, hỏi đáp). Chúng tôi chỉ đăng tin và ảnh có người liên quan khi có sự đồng ý của họ.

Quyền truy cập được kiểm soát **ngay ở tầng cơ sở dữ liệu** (kiểm soát truy cập theo từng dòng dữ liệu), không chỉ ở giao diện, nhằm hạn chế việc dữ liệu bị xem vượt quyền.`,
          },
        ],
      },
      {
        id: "ben-thu-ba",
        title: "Bên thứ ba và chuyển dữ liệu ra nước ngoài",
        blocks: [
          { t: "md", text: "Chúng tôi dùng một số nhà cung cấp dịch vụ để vận hành Hệ thống. Họ chỉ xử lý dữ liệu để cung cấp dịch vụ cho chúng tôi, không dùng cho mục đích riêng của họ." },
          {
            t: "table",
            head: ["Nhà cung cấp", "Mục đích", "Dữ liệu liên quan", "Nơi xử lý"],
            widths: ["w-[17%]", "w-[31%]", "w-[34%]", "w-[18%]"],
            rows: [
              ["**Supabase**", "Cơ sở dữ liệu và kho lưu trữ tệp (ảnh, chứng từ, tài liệu; video khi không dùng Cloudinary).", "Toàn bộ dữ liệu của Hệ thống.", "Seoul, Hàn Quốc"],
              ["**Vercel**", "Chạy ứng dụng, phân phối nội dung; thống kê truy cập và hiệu năng tổng hợp.", "Dữ liệu kỹ thuật khi truy cập; dữ liệu đi qua máy chủ ứng dụng.", "Hạ tầng toàn cầu"],
              ["**Cloudinary** (khi bật)", "Lưu trữ, chuyển định dạng và phát video Khoảnh khắc.", "Tệp video bạn tải lên (lưu dưới mã ngẫu nhiên, không kèm tên người hay tên album). Liên kết phát video chỉ hiện trong ứng dụng nhưng không có hạn dùng — đừng chia sẻ ra ngoài.", "Hoa Kỳ"],
              ["**GitHub**", "Lưu bản sao lưu cơ sở dữ liệu đã **mã hóa** trong kho riêng tư.", "Bản sao lưu mã hóa; không đọc được nếu thiếu khóa giải mã.", "Hoa Kỳ"],
              ["**Resend** (khi bật)", "Gửi email đặt lại mật khẩu và email thông báo (theo các loại thông báo bạn để bật).", "Địa chỉ email đăng nhập, tiêu đề và nội dung thông báo, liên kết mở ứng dụng.", "Hoa Kỳ"],
              ["**Groq, Cloudflare (Workers AI), Google (Gemini)** (khi bật)", "Trợ lý Lưu Xá, gợi ý soạn bài viết, tạo ảnh minh họa và gợi ý chú thích ảnh cho bài viết, tra cứu tư liệu, và một số gợi ý tự động khác bằng AI.", "Nội dung tối thiểu cho từng tác vụ (xem đoạn “Dữ liệu gửi cho AI” bên dưới).", "Hoa Kỳ và hạ tầng toàn cầu của Cloudflare"],
              ["**Cloudflare Turnstile** (khi bật)", "Chống spam ở biểu mẫu đăng ký tìm hiểu và báo đã ủng hộ.", "Dữ liệu kỹ thuật của trình duyệt.", "Toàn cầu"],
              ["**SePay, Casso** (khi kết nối)", "Báo biến động số dư của tài khoản quỹ về Hệ thống.", "Chúng tôi chỉ nhận, không gửi đi: số tiền, nội dung, thời điểm giao dịch.", "Việt Nam"],
              ["**Zalo** (khi bật)", "Gửi thông báo vào nhóm Zalo chung của nhà, kể cả tin về **đơn xin phép về muộn / ngủ ngoài / xin thêm giờ** để mọi người trong nhà biết và để cửa.", "Nội dung thông báo (với đơn xin phép: tên bạn, nơi đến, lý do, giờ dự kiến về, người để cửa).", "Việt Nam"],
              ["**Dịch vụ thông báo đẩy của trình duyệt**", "Gửi thông báo đẩy tới thiết bị bạn đã cho phép.", "Nội dung thông báo.", "Do hãng trình duyệt vận hành"],
              ["**Ứng dụng lịch bạn chọn** (khi bạn tự thêm đường dẫn đồng bộ lịch)", "Hiện lịch sinh hoạt của bạn trong Google Calendar, Lịch iPhone…", "Các sự kiện, lịch trực trong đường dẫn — do chính ứng dụng lịch tải về theo đường dẫn bạn cung cấp.", "Theo nhà cung cấp lịch bạn chọn"],
            ],
          },
          {
            t: "md",
            text: `**Dữ liệu gửi cho AI.** Mỗi tác vụ AI chỉ gửi phần nội dung cần cho tác vụ đó, và trước khi gửi, email, số điện thoại, dãy số dài (như CCCD, số tài khoản) và liên kết đều được che:
- **Trợ lý Lưu Xá** (hỏi đáp): câu hỏi của bạn, vài lượt trò chuyện gần nhất và các đoạn tài liệu liên quan mà chính bạn được xem (Luật nhà, hỏi đáp công khai, thông báo, lịch, hướng dẫn sử dụng). **Tên thành viên được thay bằng nhãn** (“Thành viên A”) trước khi gửi; tên thật chỉ được điền lại trong câu trả lời hiển thị cho bạn.
- **Gợi ý soạn bài viết**: nội dung bài do người soạn nhập để đăng công khai và thông tin công khai của nhà (tên nhà, ngày lễ, lịch sự kiện sắp tới, tiêu đề các bài đã đăng) — không che vì là nội dung để công bố; đừng đưa thông tin riêng tư vào bài.
- **Tra cứu tư liệu cho bài viết**: chỉ đề tài do người soạn nhập (đã che email, số điện thoại), gửi tới Google (Gemini, công cụ tìm kiếm); ngoài ra Hệ thống đọc tin Vatican News và Wikipedia tiếng Việt công khai. Theo điều khoản của nhà cung cấp, nội dung gửi qua gói miễn phí có thể được họ dùng để cải thiện dịch vụ.
- **Ảnh bìa / ảnh minh họa do AI tạo** (Cloudflare Workers AI): tiêu đề, tóm tắt, đoạn văn của bài sắp đăng và phong cách người soạn chọn. Ảnh tạo ra lưu như ảnh người dùng tải lên và được gắn nhãn “Ảnh minh họa do AI tạo” khi đăng công khai.
- **Gợi ý chú thích ảnh** (Cloudflare Workers AI): chỉ khi người soạn bấm, và chỉ với ảnh của bài viết (không bao giờ ảnh hóa đơn, minh chứng hay hồ sơ). Ảnh được thu nhỏ rồi gửi đi; không dùng để nhận diện người.
- **Các gợi ý khác** (khi người quản lý bật — kiểm duyệt nội dung, tóm tắt biên bản, phân loại báo hỏng, soạn tin nhắc quỹ, nhận xét thu chi, nhận xét học tập): chỉ gửi văn bản hoặc số liệu cần thiết; kiểm duyệt và tóm tắt biên bản che cả tên thành viên; nhận xét học tập chỉ chạy khi bạn đồng ý và chỉ dùng điểm trung bình, số môn **đã ẩn danh** (không tên, không trường, không mã sinh viên).

Chúng tôi không chủ định gửi hồ sơ cá nhân, điểm số hay dữ liệu tài chính của bạn cho AI. Bạn không nên nhập thông tin nhạy cảm của người khác vào ô AI.

**Cơ quan nhà nước.** Chúng tôi chỉ cung cấp dữ liệu cho cơ quan có thẩm quyền khi pháp luật yêu cầu.

**Chuyển dữ liệu ra nước ngoài.** Một số nhà cung cấp ở trên xử lý dữ liệu ngoài lãnh thổ Việt Nam. Việc chuyển dữ liệu được thực hiện theo quy định của pháp luật Việt Nam về chuyển dữ liệu cá nhân ra nước ngoài, kèm các biện pháp như mã hóa khi truyền, mã hóa các trường nhạy cảm, chỉ gửi lượng dữ liệu tối thiểu cần thiết, và ưu tiên nhà cung cấp có cam kết bảo mật rõ ràng.`,
          },
        ],
      },
      {
        id: "luu-tru",
        title: "Thời gian lưu trữ",
        blocks: [
          {
            t: "table",
            head: ["Loại dữ liệu", "Thời gian lưu"],
            widths: ["w-[30%]", "w-[70%]"],
            rows: [
              ["Tài khoản và hồ sơ thành viên", "Trong thời gian bạn là thành viên. Sau khi bạn rời nhà, chúng tôi giữ trong thời gian cần thiết để hoàn tất nghĩa vụ quản lý, quyết toán và giải quyết khiếu nại. Người quản lý có thể đặt **thời hạn lưu** (số ngày kể từ ngày rời nhà); khi đã đặt, hệ thống báo trước người quản lý và **tự động ẩn danh hóa** hồ sơ quá hạn — xóa thông tin cá nhân, khóa tài khoản. Chưa đặt thời hạn thì chúng tôi xóa hoặc ẩn danh khi bạn yêu cầu hoặc khi không còn cần thiết. Cựu thành viên chọn **giữ liên lạc** thì không bị tự ẩn danh."],
              ["Hồ sơ cựu thành viên", "Đến khi bạn yêu cầu xóa hoặc rút lại sự đồng ý chia sẻ."],
              ["Dữ liệu dựa trên sự đồng ý (Công giáo, học tập…)", "Đến khi bạn rút lại sự đồng ý hoặc yêu cầu xóa. Rút đồng ý lưu hồ sơ Công giáo thì hồ sơ đó bị xóa ngay."],
              ["Sổ quỹ, phiếu thu chi, chứng từ", "Ghi **bất biến** và giữ trong thời hạn cần thiết cho yêu cầu minh bạch tài chính và nghĩa vụ kế toán. Sai sót được đính chính bằng bút toán đảo hoặc điều chỉnh chứ không xóa. Khi hồ sơ được ẩn danh hóa, các khoản này vẫn được giữ nhưng không còn gắn với tên, liên lạc của bạn."],
              ["Bằng chứng đồng ý và yêu cầu về dữ liệu", "Giữ để chứng minh việc tuân thủ (kể cả sau khi hồ sơ được ẩn danh hóa)."],
              ["Đăng ký tìm hiểu", "Đến khi hoàn tất tư vấn; xóa khi bạn yêu cầu hoặc khi không còn cần thiết."],
              ["Phiên đăng nhập", "Mã truy cập hết hạn sau 15 phút; phiên duy trì tối đa 30 ngày hoặc đến khi bạn đăng xuất."],
              ["Nhật ký đăng nhập, thông báo đã đọc", "90 ngày."],
              ["Nhật ký hoạt động, nhật ký lượt chạy tác vụ tự động", "180 ngày."],
              ["Nhật ký lỗi kỹ thuật", "90 ngày kể từ lần lỗi xảy ra gần nhất."],
              ["Khóa giới hạn tần suất (đã băm)", "2 ngày."],
              ["Nhật ký kiểm toán", "Trong thời gian cần thiết để bảo đảm an ninh và truy vết; các trường nhạy cảm (CCCD, SĐT, Tên Thánh, giáo xứ…) được che."],
              ["Bản sao lưu", "Giữ có thời hạn và được mã hóa. Dữ liệu đã xóa khỏi hệ thống chính có thể còn trong bản sao lưu cho đến khi bản đó hết hạn; nếu phải khôi phục từ bản sao lưu, chúng tôi sẽ xóa lại những dữ liệu đã có yêu cầu xóa."],
            ],
          },
          { t: "md", text: "Với một số loại dữ liệu, pháp luật có thể yêu cầu lưu giữ lâu hơn; khi đó chúng tôi chỉ giữ ở mức tối thiểu cần thiết." },
        ],
      },
      {
        id: "bao-mat",
        title: "Biện pháp bảo mật",
        blocks: [
          {
            t: "md",
            text: `- Mã hóa đường truyền (HTTPS) trên toàn bộ Hệ thống.
- Mật khẩu chỉ lưu dưới dạng băm **Argon2id**, kèm quy định độ mạnh tối thiểu.
- **Xác thực hai lớp** (TOTP) và mã dự phòng — bắt buộc với một số vai trò quản lý.
- Cookie đăng nhập đặt cờ HttpOnly, Secure, SameSite; có cơ chế chống giả mạo yêu cầu (CSRF).
- **Mã hóa ở cấp trường dữ liệu** đối với số CCCD/CMND và số điện thoại phụ huynh.
- Phân quyền theo vai trò và kiểm soát truy cập theo dòng dữ liệu ở cơ sở dữ liệu; mỗi truy vấn chạy dưới quyền của chính người dùng.
- Tệp (ảnh, chứng từ, tài liệu) lưu ở kho riêng tư, chỉ truy cập qua liên kết có kiểm tra quyền.
- Nhật ký kiểm toán các thao tác quan trọng (kể cả việc tải dữ liệu cá nhân), có che các trường nhạy cảm; nhật ký lỗi tự che email và dãy số.
- Giới hạn tần suất truy cập (lưu bằng khóa đã băm) và các biện pháp chống spam; khóa tạm tài khoản khi nhập sai mật khẩu nhiều lần.
- Sao lưu định kỳ, mã hóa AES-256, có diễn tập khôi phục; tài khoản sao lưu chỉ có quyền đọc.`,
          },
          {
            t: "md",
            text: "Không hệ thống nào an toàn tuyệt đối. Nếu xảy ra sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ khắc phục, thông báo cho người bị ảnh hưởng và cơ quan có thẩm quyền theo quy định.\n\n**Bạn cũng góp phần bảo mật**: đặt mật khẩu riêng và đủ mạnh, bật xác thực hai lớp, không chia sẻ tài khoản, giữ kín đường dẫn đồng bộ lịch và tệp dữ liệu đã tải về, đăng xuất trên máy dùng chung.",
          },
        ],
      },
      {
        id: "quyen",
        title: "Quyền của bạn",
        blocks: [
          {
            t: "md",
            text: `Theo quy định của pháp luật, bạn có các quyền:

1. Được biết về hoạt động xử lý dữ liệu cá nhân của mình;
2. Đồng ý hoặc không đồng ý, và rút lại sự đồng ý đã cho;
3. Xem, chỉnh sửa hoặc yêu cầu chỉnh sửa dữ liệu của mình;
4. Yêu cầu cung cấp bản sao dữ liệu của mình;
5. Yêu cầu xóa dữ liệu;
6. Yêu cầu hạn chế việc xử lý;
7. Phản đối việc xử lý;
8. Khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường thiệt hại theo quy định;
9. Tự bảo vệ dữ liệu của mình hoặc yêu cầu cơ quan, tổ chức có thẩm quyền bảo vệ.

### Cách thực hiện

- **Tự làm trong ứng dụng**: **Cài đặt → Hồ sơ cá nhân** (sửa hồ sơ, đổi ảnh); **Cài đặt → Bảo mật** (bật/tắt từng đồng ý, mật khẩu, xác thực hai lớp); tải sơ yếu lý lịch (PDF) và bảng tổng kết của chính bạn.
- **Tải dữ liệu của tôi**: ở **Cài đặt → Hồ sơ cá nhân → Quyền riêng tư & dữ liệu của tôi**, bạn tải ngay một tệp (định dạng JSON, máy đọc được) gồm hồ sơ, đồng ý, phòng ở, khoản quỹ, xin phép, điểm danh, trực, học tập, góp ý, thiết bị đăng nhập… của riêng bạn. Số CCCD và số điện thoại phụ huynh chỉ ghi 4 số cuối; việc tải được ghi vào nhật ký kiểm toán.
- **Gửi yêu cầu trong ứng dụng** (xem / nhận bản sao, sửa, xóa, rút đồng ý, hạn chế, phản đối, yêu cầu khác): cũng ở mục trên. Người quản lý (Trưởng nhà, Admin) nhận thông báo ngay và **phản hồi trong 72 giờ**; bạn nhận thông báo khi có trả lời và xem kết quả ở cùng chỗ. Nếu không đăng nhập được, hãy liên hệ theo mục [Liên hệ](${P}#lien-he).
- **Xóa dữ liệu**: khi bạn còn ở nhà, dữ liệu cần cho sinh hoạt chung chưa xóa được; sau khi rời nhà, hồ sơ được **ẩn danh hóa** — xóa thông tin cá nhân (hồ sơ riêng tư, Công giáo, liên lạc, tài khoản nhận tiền, ảnh), khóa tài khoản; sổ quỹ và chứng từ được giữ ở dạng không gắn với bạn.
- **Xác minh và thời hạn**: chúng tôi có thể xác minh danh tính trước khi thực hiện để tránh người khác mạo danh; thực hiện trong thời hạn pháp luật quy định, không thu phí. Nếu phải từ chối một phần (ví dụ dữ liệu bắt buộc lưu giữ theo luật, hoặc sổ quỹ bất biến), chúng tôi sẽ nêu rõ lý do.`,
          },
        ],
      },
      {
        id: "cookie",
        title: "Cookie và lưu trữ trên thiết bị",
        blocks: [
          { t: "md", text: "Hệ thống chỉ dùng cookie và lưu trữ cục bộ **thiết yếu** để đăng nhập, bảo mật và ghi nhớ tùy chọn giao diện. Chúng tôi không dùng cookie quảng cáo hay công cụ theo dõi liên trang." },
          {
            t: "table",
            head: ["Tên", "Loại", "Mục đích", "Thời hạn"],
            widths: ["w-[26%]", "w-[16%]", "w-[40%]", "w-[18%]"],
            rows: [
              ["`__Host-luuxa_at`", "Cookie (HttpOnly)", "Mã truy cập sau khi đăng nhập.", "15 phút"],
              ["`__Secure-luuxa_rt`", "Cookie (HttpOnly)", "Duy trì đăng nhập.", "Tối đa 30 ngày"],
              ["`__Host-luuxa_csrf`", "Cookie", "Chống giả mạo yêu cầu.", "Theo phiên trình duyệt"],
              ["`__Host-luuxa_hs`", "Cookie (HttpOnly)", "Ghi nhớ trình duyệt này đang đăng nhập (chỉ chứa ngày, không có dữ liệu cá nhân) — để người chưa đăng nhập mở trang chủ được đưa tới trang Giới thiệu.", "Tối đa 30 ngày; xóa khi đăng xuất"],
              ["`luuxa-theme`, `luuxa-fontsize` và các ghi nhớ giao diện khác", "Lưu trữ cục bộ", "Ghi nhớ giao diện sáng/tối, cỡ chữ, gợi ý bạn đã ẩn (vd. gợi ý cài ứng dụng).", "Đến khi bạn xóa"],
              ["Lưu trữ theo phiên (sessionStorage)", "Lưu trữ cục bộ", "Cuộc trò chuyện gần nhất với Trợ lý Lưu Xá, lượt xem trang tin đã đếm, thẻ gợi ý đã đóng.", "Đến khi đóng thẻ trình duyệt"],
              ["Trang ngoại tuyến, thông báo đẩy", "Service worker", "Hiện trang ngoại tuyến; nhận thông báo đẩy khi bạn bật.", "Đến khi bạn tắt hoặc gỡ ứng dụng"],
            ],
          },
          {
            t: "md",
            text: "Công cụ thống kê truy cập của chúng tôi không dùng cookie. Trang công khai không nhúng bản đồ, video hay tiện ích của bên thứ ba: nút mở bản đồ ở trang Vào ở lưu xá chỉ chuyển bạn sang Google Maps / OpenStreetMap khi bạn bấm (khi đó chính sách của nhà cung cấp bản đồ áp dụng). Nếu Cloudflare Turnstile được bật ở biểu mẫu đăng ký tìm hiểu / báo ủng hộ, Cloudflare có thể đặt cookie kỹ thuật để chống spam. Bạn có thể xóa hoặc chặn cookie trong trình duyệt, nhưng một số chức năng (như đăng nhập) sẽ không hoạt động.",
          },
        ],
      },
      {
        id: "tre-em",
        title: "Người chưa thành niên",
        blocks: [
          {
            t: "md",
            text: "Hệ thống dành cho sinh viên và thanh niên. Với người **chưa thành niên**, việc xử lý dữ liệu cá nhân cần có sự đồng ý của cha mẹ hoặc người giám hộ hợp pháp, và chúng tôi chỉ xử lý ở mức tối thiểu cần thiết. Nếu bạn là cha mẹ hoặc người giám hộ và cho rằng con mình đã cung cấp dữ liệu mà chưa có sự đồng ý của bạn, hãy liên hệ để chúng tôi xử lý.",
          },
        ],
      },
      {
        id: "hinh-anh",
        title: "Hình ảnh và nội dung công khai",
        blocks: [
          {
            t: "md",
            text: "Bài viết, ảnh và album công khai chỉ được đăng khi có sự đồng ý của những người liên quan. Bạn có thể yêu cầu gỡ nội dung có hình ảnh hoặc thông tin của mình bất cứ lúc nào (gửi yêu cầu “Phản đối xử lý” trong ứng dụng hoặc qua mục Liên hệ); chúng tôi sẽ gỡ nhanh chóng. Việc **gắn thẻ tên** bạn vào ảnh chỉ được thực hiện khi bạn đã cho phép. Nội dung đã được người khác sao chép trước khi gỡ nằm ngoài khả năng kiểm soát của chúng tôi.",
          },
        ],
      },
      {
        id: "thay-doi",
        title: "Thay đổi chính sách",
        blocks: [
          {
            t: "md",
            text: `Chúng tôi có thể cập nhật Chính sách này khi tính năng, nhà cung cấp hoặc quy định pháp luật thay đổi. Phiên bản và ngày cập nhật được ghi ở đầu trang. Mỗi khi đổi **phiên bản**, ứng dụng hiện hộp thoại tóm tắt điểm chính để bạn xem và **xác nhận lại** trước khi dùng tiếp; hệ thống lưu phiên bản và thời điểm bạn xác nhận. Với việc xử lý dựa trên sự đồng ý, chúng tôi sẽ xin lại sự đồng ý của bạn khi mục đích thay đổi. Xem thêm [Điều khoản sử dụng](${T}).`,
          },
        ],
      },
      {
        id: "lien-he",
        title: "Liên hệ và khiếu nại",
        blocks: [
          {
            t: "md",
            text: `Mọi câu hỏi hoặc yêu cầu liên quan đến dữ liệu cá nhân, xin gửi tới người quản lý của ${house} (${contactLine(org)}). Nếu là thành viên, cách nhanh nhất là gửi yêu cầu trong ứng dụng (**Cài đặt → Hồ sơ cá nhân → Quyền riêng tư & dữ liệu của tôi**); bạn cũng có thể gọi điện, đến trực tiếp hoặc dùng [biểu mẫu liên hệ](/lien-he).`,
          },
          { t: "contact" },
          {
            t: "md",
            text: "Nếu chưa hài lòng với cách chúng tôi xử lý, bạn có quyền khiếu nại tới cơ quan chuyên trách về bảo vệ dữ liệu cá nhân thuộc Bộ Công an hoặc khởi kiện theo quy định của pháp luật.",
          },
        ],
      },
    ],
  };
}
