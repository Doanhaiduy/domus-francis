// Chính sách bảo mật & bảo vệ dữ liệu cá nhân. Mọi khẳng định ở đây phải khớp với hệ thống thật — đổi tính năng/nhà cung cấp/cách lưu trữ thì cập nhật văn bản này.
// Căn cứ pháp lý (đã đối chiếu 10/2026): Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định số 356/2025/NĐ-CP
// (thay thế Nghị định 13/2023/NĐ-CP). Không ghi thời hạn luật định cụ thể ở đây — chỉ cam kết "trong thời hạn pháp luật quy định".
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
      "**Dữ liệu nhạy cảm** (hồ sơ Công giáo, điểm học tập) chỉ được lưu và chia sẻ **khi bạn đồng ý**, từng mục riêng, và bạn rút lại được bất cứ lúc nào.",
      "Số CCCD/CMND và số điện thoại phụ huynh được **mã hóa**; mật khẩu chỉ lưu dạng băm **Argon2id**; ai xem được gì phụ thuộc vào vai trò và được kiểm soát ngay ở cơ sở dữ liệu.",
      "Chúng tôi **không bán** dữ liệu và không dùng dữ liệu của bạn để quảng cáo. Chỉ dùng các nhà cung cấp hạ tầng cần thiết (xem mục Bên thứ ba).",
      "Bạn có quyền xem, sửa, xóa, hạn chế, phản đối việc xử lý và rút lại sự đồng ý — cách thực hiện ở mục Quyền của bạn.",
    ],
    sections: [
      {
        id: "gioi-thieu",
        title: "Giới thiệu và phạm vi áp dụng",
        blocks: [
          {
            t: "md",
            text: `${house} (“**Lưu xá**”, “**chúng tôi**”) vận hành hệ thống quản lý cộng đoàn gồm trang web công khai và ứng dụng dành cho thành viên (“**Hệ thống**”). Chính sách này giải thích cách chúng tôi xử lý dữ liệu cá nhân của bạn khi bạn truy cập trang công khai, gửi đăng ký tìm hiểu, hoặc sử dụng Hệ thống với tư cách thành viên, cựu thành viên hay người ủng hộ.

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
              ["**Người truy cập trang công khai**", "Dữ liệu kỹ thuật: địa chỉ IP, loại trình duyệt và thiết bị, trang đã xem, thời điểm truy cập; số liệu truy cập và hiệu năng ở dạng tổng hợp.", "Thu tự động. Không dùng cookie quảng cáo hay theo dõi liên trang."],
              ["**Người gửi đăng ký tìm hiểu**", "Họ tên; số điện thoại/Zalo và/hoặc email; trường đang hoặc sắp học; năm học; giáo xứ; thời gian muốn đến thăm; lời nhắn.", "Bạn tự nhập ở trang Liên hệ. Chỉ dùng để liên hệ tư vấn."],
              ["**Thành viên — tài khoản**", "Email hoặc số điện thoại đăng nhập; mật khẩu (chỉ lưu bản băm); khóa xác thực hai lớp; thông tin phiên đăng nhập (thời điểm, địa chỉ IP, trình duyệt).", "Tạo khi bạn đăng ký và được duyệt, hoặc khi người quản lý cấp tài khoản."],
              ["**Thành viên — hồ sơ cơ bản**", "Họ tên, giới tính, ảnh đại diện, số điện thoại, email liên hệ, phòng ở, trường, ngành, khóa, mã sinh viên, tình trạng học tập, ngày vào nhà.", "Bạn nhập hoặc người quản lý cập nhật."],
              ["**Thành viên — thông tin riêng tư**", "Ngày sinh, số CCCD/CMND, quê quán, địa chỉ thường trú; họ tên và số điện thoại của cha, mẹ.", "Chỉ bạn và người quản lý có thẩm quyền xem được. Số CCCD/CMND và số điện thoại phụ huynh được mã hóa."],
              ["**Thành viên — hồ sơ Công giáo** (nhạy cảm)", "Tên Thánh, giáo phận, giáo xứ, linh mục quản xứ, các Bí tích đã lãnh nhận.", "Chỉ lưu khi bạn đồng ý (xem mục Dữ liệu nhạy cảm)."],
              ["**Thành viên — học tập** (nhạy cảm)", "Điểm học tập và minh chứng do bạn nhập; nhu cầu hỗ trợ môn học.", "Chỉ chia sẻ cho người khác khi bạn đồng ý."],
              ["**Thành viên — sinh hoạt chung**", "Điểm danh sự kiện và điểm danh QR (thời điểm; mã thiết bị đã băm; có thể kèm vị trí địa lý tại thời điểm điểm danh nếu sự kiện bật giới hạn theo vị trí); đơn xin phép; lịch trực tuần; vi phạm và hình phạt; thi đua; báo sự cố, bảo trì.", "Phát sinh khi bạn tham gia sinh hoạt hoặc khi người quản lý ghi nhận."],
              ["**Thành viên — tài chính**", "Các khoản đóng quỹ, phiếu chi và hoàn ứng liên quan đến bạn; tài khoản nhận tiền do bạn khai (ngân hàng, số tài khoản, chủ tài khoản, ảnh mã QR).", "Sổ quỹ được ghi bất biến (xem mục Thời gian lưu trữ)."],
              ["**Thành viên — nội dung**", "Bài đăng, bình luận, ý cầu nguyện, ảnh và album khoảnh khắc, tệp đính kèm bạn tải lên; ảnh bạn được gắn thẻ (khi bạn cho phép).", "Tệp được lưu ở kho riêng tư."],
              ["**Cựu thành viên**", "Nghề nghiệp, nơi làm việc, thành phố; việc bạn có còn giữ liên lạc hay không.", "Chỉ hiện cho thành viên khác khi bạn chọn “còn giữ liên lạc”."],
              ["**Người ủng hộ và giao dịch quỹ**", "Tên người ủng hộ, số tiền, ngày, lời nhắn (nếu có) do người quản lý ghi nhận; dòng giao dịch vào tài khoản quỹ (số tiền, nội dung chuyển khoản, thời điểm) khi có kết nối dịch vụ báo biến động số dư.", "Giao dịch ngân hàng tự động chỉ được lưu để đối chiếu; không tự ghi sổ."],
            ],
          },
          { t: "md", text: "Chúng tôi **không** thu thập dữ liệu sinh trắc học, danh bạ điện thoại hay vị trí liên tục của bạn." },
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
              ["Bảo mật và an toàn hệ thống: xác thực, chống gian lận và spam, nhật ký kiểm toán.", "Lợi ích chính đáng; nghĩa vụ bảo vệ dữ liệu."],
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
              ["Lưu hồ sơ Công giáo", "Lưu Tên Thánh, giáo xứ, giáo phận và các Bí tích."],
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
            text: `Bạn bật hoặc tắt từng mục ở **Cài đặt → Hồ sơ cá nhân** (thẻ Hồ sơ Công giáo) và **Cài đặt → Bảo mật**. Khi bạn rút lại sự đồng ý, chúng tôi ngừng xử lý theo mục đích đó; việc rút lại không ảnh hưởng đến tính hợp pháp của việc xử lý đã thực hiện trước đó.

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
            text: `- **Chính bạn**: xem và chỉnh sửa hồ sơ của mình.
- **Thành viên khác**: chỉ thấy thông tin danh bạ cơ bản (họ tên, ảnh, phòng, khóa…) và những gì bạn chủ động chia sẻ.
- **Người quản lý** (Trưởng nhà, Thủ quỹ, các Trưởng ban…): chỉ xem dữ liệu thuộc phạm vi nhiệm vụ của họ. Ví dụ Thủ quỹ xem các khoản quỹ; hồ sơ Công giáo và bảng điểm chỉ được xem khi bạn đã đồng ý chia sẻ.
- **Quản trị hệ thống**: có quyền kỹ thuật để vận hành, bảo trì và khắc phục sự cố; thao tác quản trị được ghi nhật ký.
- **Công chúng**: chỉ thấy nội dung được chủ động đăng công khai (bài viết, album công khai, phần giới thiệu). Chúng tôi chỉ đăng tin và ảnh có người liên quan khi có sự đồng ý của họ.

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
              ["**Supabase**", "Cơ sở dữ liệu và kho lưu trữ tệp (ảnh, chứng từ, tài liệu).", "Toàn bộ dữ liệu của Hệ thống.", "Seoul, Hàn Quốc"],
              ["**Vercel**", "Chạy ứng dụng, phân phối nội dung; thống kê truy cập và hiệu năng tổng hợp.", "Dữ liệu kỹ thuật khi truy cập; dữ liệu đi qua máy chủ ứng dụng.", "Hạ tầng toàn cầu"],
              ["**GitHub**", "Lưu bản sao lưu cơ sở dữ liệu đã **mã hóa** trong kho riêng tư.", "Bản sao lưu mã hóa; không đọc được nếu thiếu khóa giải mã.", "Hoa Kỳ"],
              ["**Resend** (khi bật)", "Gửi email đặt lại mật khẩu và thông báo quan trọng.", "Địa chỉ email người nhận và nội dung thư.", "Hoa Kỳ"],
              ["**Groq, Google (Gemini)** (khi bật)", "Trợ lý Lưu Xá và gợi ý soạn bài viết bằng AI.", "Câu hỏi hoặc văn bản bạn gửi cho tính năng AI, đã che email, số điện thoại, dãy số dài và liên kết.", "Hoa Kỳ"],
              ["**Cloudflare Turnstile** (khi bật)", "Chống spam ở biểu mẫu đăng ký tìm hiểu.", "Dữ liệu kỹ thuật của trình duyệt.", "Toàn cầu"],
              ["**SePay, Casso** (khi kết nối)", "Báo biến động số dư của tài khoản quỹ về Hệ thống.", "Chúng tôi chỉ nhận, không gửi đi: số tiền, nội dung, thời điểm giao dịch.", "Việt Nam"],
              ["**Zalo** (khi bật)", "Gửi thông báo vào nhóm Zalo chung của nhà.", "Nội dung thông báo.", "Việt Nam"],
              ["**Dịch vụ thông báo đẩy của trình duyệt**", "Gửi thông báo đẩy tới thiết bị bạn đã cho phép.", "Nội dung thông báo.", "Do hãng trình duyệt vận hành"],
            ],
          },
          {
            t: "md",
            text: `**Dữ liệu gửi cho AI.** Nội dung gửi tới nhà cung cấp AI gồm câu hỏi hoặc văn bản bạn nhập và tài liệu công khai của nhà (hướng dẫn, nội quy, thông báo); email, số điện thoại, dãy số dài (như CCCD, số tài khoản) và liên kết được che trước khi gửi. Chúng tôi không chủ định gửi hồ sơ cá nhân, điểm số hay dữ liệu tài chính của bạn cho AI. Riêng tính năng nhận xét điểm học tập chỉ chạy khi bạn đồng ý và chỉ dùng điểm trung bình, số môn **đã ẩn danh** (không tên, không trường, không mã sinh viên). Bạn không nên nhập thông tin nhạy cảm của người khác vào ô AI.

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
              ["Tài khoản và hồ sơ thành viên", "Trong thời gian bạn là thành viên. Sau khi rời nhà, chúng tôi giữ trong thời gian cần thiết để hoàn tất nghĩa vụ quản lý, quyết toán và giải quyết khiếu nại; sau đó xóa hoặc ẩn danh theo yêu cầu của bạn hoặc khi không còn cần thiết."],
              ["Hồ sơ cựu thành viên", "Đến khi bạn yêu cầu xóa hoặc rút lại sự đồng ý chia sẻ."],
              ["Dữ liệu dựa trên sự đồng ý (Công giáo, học tập…)", "Đến khi bạn rút lại sự đồng ý hoặc yêu cầu xóa."],
              ["Sổ quỹ, phiếu thu chi, chứng từ", "Ghi **bất biến** và giữ trong thời hạn cần thiết cho yêu cầu minh bạch tài chính và nghĩa vụ kế toán. Sai sót được đính chính bằng bút toán đảo hoặc điều chỉnh chứ không xóa. Khi bạn yêu cầu xóa dữ liệu cá nhân, chúng tôi gỡ hoặc ẩn danh phần định danh trong phạm vi pháp luật và sổ sách cho phép."],
              ["Đăng ký tìm hiểu", "Đến khi hoàn tất tư vấn; xóa khi bạn yêu cầu hoặc khi không còn cần thiết."],
              ["Phiên đăng nhập", "Mã truy cập hết hạn sau 15 phút; phiên duy trì tối đa 30 ngày hoặc đến khi bạn đăng xuất."],
              ["Nhật ký kiểm toán và bảo mật", "Trong thời gian cần thiết để bảo đảm an ninh và truy vết; các trường nhạy cảm được che."],
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
- Nhật ký kiểm toán các thao tác quan trọng, có che các trường nhạy cảm.
- Giới hạn tần suất truy cập và các biện pháp chống spam.
- Sao lưu định kỳ, mã hóa AES-256, có diễn tập khôi phục; tài khoản sao lưu chỉ có quyền đọc.`,
          },
          {
            t: "md",
            text: "Không hệ thống nào an toàn tuyệt đối. Nếu xảy ra sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ khắc phục, thông báo cho người bị ảnh hưởng và cơ quan có thẩm quyền theo quy định.\n\n**Bạn cũng góp phần bảo mật**: đặt mật khẩu riêng và đủ mạnh, bật xác thực hai lớp, không chia sẻ tài khoản và đăng xuất trên máy dùng chung.",
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

- **Tự làm trong ứng dụng**: **Cài đặt → Hồ sơ cá nhân** (sửa hồ sơ, đổi ảnh), **Cài đặt → Bảo mật** (đồng ý, mật khẩu, xác thực hai lớp); tải sơ yếu lý lịch (PDF) và bảng tổng kết của chính bạn.
- **Gửi yêu cầu cho chúng tôi** (xóa, hạn chế, phản đối, cung cấp bản sao…): liên hệ người quản lý theo mục [Liên hệ](${P}#lien-he). Chúng tôi có thể xác minh danh tính trước khi thực hiện để tránh người khác mạo danh.
- **Thời hạn và từ chối**: chúng tôi phản hồi sớm nhất có thể và thực hiện trong thời hạn pháp luật quy định, không thu phí. Nếu phải từ chối một phần (ví dụ dữ liệu bắt buộc lưu giữ theo luật, hoặc sổ quỹ bất biến), chúng tôi sẽ nêu rõ lý do.`,
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
              ["`luuxa-theme`, `luuxa-fontsize`", "Lưu trữ cục bộ", "Ghi nhớ giao diện sáng/tối và cỡ chữ.", "Đến khi bạn xóa"],
              ["`luuxa_device_id`", "Lưu trữ cục bộ", "Mã thiết bị ngẫu nhiên khi điểm danh, để một máy không điểm danh hộ nhiều người; máy chủ chỉ lưu bản băm.", "Đến khi bạn xóa"],
              ["Trang ngoại tuyến, thông báo đẩy", "Service worker", "Hiện trang ngoại tuyến; nhận thông báo đẩy khi bạn bật.", "Đến khi bạn tắt hoặc gỡ ứng dụng"],
            ],
          },
          {
            t: "md",
            text: "Công cụ thống kê truy cập của chúng tôi không dùng cookie. Nếu Cloudflare Turnstile được bật ở biểu mẫu đăng ký, Cloudflare có thể đặt cookie kỹ thuật để chống spam. Bạn có thể xóa hoặc chặn cookie trong trình duyệt, nhưng một số chức năng (như đăng nhập) sẽ không hoạt động.",
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
            text: "Bài viết, ảnh và album công khai chỉ được đăng khi có sự đồng ý của những người liên quan. Bạn có thể yêu cầu gỡ nội dung có hình ảnh hoặc thông tin của mình bất cứ lúc nào qua mục Liên hệ; chúng tôi sẽ gỡ nhanh chóng. Việc **gắn thẻ tên** bạn vào ảnh chỉ được thực hiện khi bạn đã cho phép. Nội dung đã được người khác sao chép trước khi gỡ nằm ngoài khả năng kiểm soát của chúng tôi.",
          },
        ],
      },
      {
        id: "thay-doi",
        title: "Thay đổi chính sách",
        blocks: [
          {
            t: "md",
            text: `Chúng tôi có thể cập nhật Chính sách này khi tính năng, nhà cung cấp hoặc quy định pháp luật thay đổi. Phiên bản và ngày cập nhật được ghi ở đầu trang. Với thay đổi quan trọng, chúng tôi sẽ thông báo trên trang web hoặc trong ứng dụng trước khi áp dụng. Với việc xử lý dựa trên sự đồng ý, chúng tôi sẽ xin lại sự đồng ý của bạn khi mục đích thay đổi. Việc tiếp tục sử dụng Hệ thống sau ngày có hiệu lực được hiểu là bạn đã biết nội dung cập nhật. Xem thêm [Điều khoản sử dụng](${T}).`,
          },
        ],
      },
      {
        id: "lien-he",
        title: "Liên hệ và khiếu nại",
        blocks: [
          {
            t: "md",
            text: `Mọi câu hỏi hoặc yêu cầu liên quan đến dữ liệu cá nhân, xin gửi tới người quản lý của ${house} (${contactLine(org)}). Bạn có thể gọi điện, đến trực tiếp, dùng [biểu mẫu liên hệ](/lien-he), hoặc — nếu là thành viên — báo qua người quản lý trong ứng dụng.`,
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
