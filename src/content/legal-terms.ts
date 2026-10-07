// Điều khoản sử dụng. Khẳng định về tính năng (quỹ bất biến, Thủ quỹ xác nhận ghi thu, AI chỉ gợi ý…) phải khớp hệ thống thật.
import type { PublicOrgInfo } from "@/lib/types/articles";
import { LEGAL_PATHS, contactLine, houseOf, type LegalDoc } from "./legal";

const P = LEGAL_PATHS.privacy;

export function termsOfUse(org: PublicOrgInfo): LegalDoc {
  const house = houseOf(org);
  return {
    title: "Điều khoản sử dụng",
    subtitle: `Những quy tắc khi dùng trang web và ứng dụng của ${house} — để mái nhà chung vận hành minh bạch, an toàn và tôn trọng lẫn nhau.`,
    summary: [
      "Tài khoản do cộng đoàn cấp hoặc duyệt; **mỗi người một tài khoản**, không cho mượn, không dùng chung.",
      "Dùng Hệ thống đúng mục đích sinh hoạt chung; không gian lận điểm danh, không xâm nhập hay làm gián đoạn hệ thống.",
      "Chức năng Thu chi **ghi nhận và minh bạch hóa** quỹ chung; Hệ thống **không phải** dịch vụ thanh toán — tiền được chuyển qua ngân hàng của bạn.",
      "Trợ lý AI chỉ mang tính **gợi ý** và có thể sai; hãy kiểm tra lại trước khi dùng.",
      "Nội dung vi phạm có thể bị gỡ và tài khoản có thể bị tạm khóa; mọi việc xử lý theo quy trình của cộng đoàn.",
    ],
    sections: [
      {
        id: "chap-nhan",
        title: "Chấp nhận điều khoản",
        blocks: [
          {
            t: "md",
            text: `Khi truy cập hoặc sử dụng trang web và ứng dụng của ${house} (“**Hệ thống**”), bạn đồng ý với Điều khoản sử dụng này và [Chính sách bảo mật](${P}). Nếu không đồng ý, vui lòng ngừng sử dụng Hệ thống.

Trong văn bản này, “**Lưu xá**” hoặc “**chúng tôi**” là ${house}; “**bạn**” là người truy cập hoặc người dùng Hệ thống; “**người quản lý**” là những thành viên được cộng đoàn giao nhiệm vụ quản lý (Trưởng nhà, Thủ quỹ, các Trưởng ban…); “**nội dung**” là mọi dữ liệu, văn bản, hình ảnh, tệp bạn đưa lên Hệ thống.

Điều khoản này điều chỉnh việc **dùng Hệ thống**. Đời sống chung của nhà do **Luật nhà** điều chỉnh; hai văn bản cùng áp dụng cho thành viên.`,
          },
        ],
      },
      {
        id: "tai-khoan",
        title: "Điều kiện sử dụng và tài khoản",
        blocks: [
          {
            t: "md",
            text: `- Trang công khai (bản tin, giới thiệu, hỏi đáp, thư viện, liên hệ) ai cũng xem được. Các chức năng còn lại dành cho **thành viên, cựu thành viên** và người được cộng đoàn mời hoặc duyệt.
- Tài khoản được tạo khi bạn đăng ký và được người quản lý duyệt, hoặc do quản trị viên cấp (kèm mật khẩu tạm — bạn phải đổi ngay ở lần đăng nhập đầu tiên).
- Bạn cung cấp thông tin **chính xác** và cập nhật khi có thay đổi.
- Bạn giữ bí mật mật khẩu và mã xác thực, **chịu trách nhiệm** về mọi hoạt động dưới tài khoản của mình. Nếu nghi tài khoản bị lộ, hãy đổi mật khẩu ở **Cài đặt → Bảo mật** và báo ngay cho người quản lý.
- **Mỗi người một tài khoản.** Không cho người khác mượn, không dùng tài khoản của người khác.
- Quyền truy cập phụ thuộc vào vai trò và có thể thay đổi theo nhiệm kỳ hoặc khi bạn rời nhà.`,
          },
        ],
      },
      {
        id: "trach-nhiem",
        title: "Trách nhiệm của người dùng",
        blocks: [
          {
            t: "md",
            text: `- Dùng Hệ thống đúng mục đích sinh hoạt chung của cộng đoàn và tuân thủ Luật nhà, pháp luật Việt Nam.
- **Trung thực**: điểm danh, đơn xin phép (kể cả giờ dự kiến về và các lần xin thêm giờ), báo sự cố, chứng từ tài chính, điểm học tập và mọi khai báo khác phải đúng sự thật.
- **Tôn trọng quyền riêng tư**: dữ liệu về thành viên khác (số điện thoại, hồ sơ, ảnh…) chỉ dùng cho sinh hoạt chung; không sao chép, chia sẻ hay công bố ra ngoài khi chưa được họ đồng ý.
- Ứng xử văn minh, đúng tinh thần của một cộng đoàn sinh viên Công giáo.`,
          },
        ],
      },
      {
        id: "cam",
        title: "Hành vi bị nghiêm cấm",
        blocks: [
          {
            t: "md",
            text: `Bạn không được:

- Truy cập trái phép, vượt quyền, dò quét hoặc khai thác lỗ hổng, làm quá tải hay gián đoạn Hệ thống. Nếu phát hiện lỗ hổng, hãy báo cho người quản lý thay vì khai thác.
- Giả mạo danh tính, giả mạo điểm danh (kể cả nhờ người khác điểm danh hộ, gửi ảnh chụp lại từ trước hoặc ảnh không phải do chính bạn chụp tại sự kiện), gian lận số liệu hoặc chứng từ.
- Tải lên mã độc hoặc nội dung vi phạm pháp luật, xúc phạm, kỳ thị, khiêu dâm, xâm phạm quyền riêng tư hay quyền sở hữu trí tuệ của người khác.
- Gửi spam, quảng cáo, thu thập dữ liệu hàng loạt bằng công cụ tự động.
- Dùng tính năng AI để tạo hoặc phát tán nội dung vi phạm.
- Lợi dụng Hệ thống để gây hại cho cộng đoàn hoặc bất kỳ cá nhân nào.`,
          },
        ],
      },
      {
        id: "noi-dung",
        title: "Nội dung do bạn tạo",
        blocks: [
          {
            t: "md",
            text: `Bạn giữ quyền sở hữu đối với nội dung của mình. Bạn cấp cho Lưu xá quyền **không độc quyền, miễn phí bản quyền** để lưu trữ, sao lưu, hiển thị (cho đối tượng phù hợp với chức năng bạn dùng), tạo ảnh thu nhỏ và xử lý kỹ thuật nội dung đó — chỉ nhằm vận hành Hệ thống.

Bạn bảo đảm có quyền đối với nội dung bạn đăng, và đã được sự đồng ý của người xuất hiện trong ảnh hoặc được nhắc tới. Chúng tôi có thể ẩn hoặc gỡ nội dung vi phạm Điều khoản hay pháp luật, hoặc theo yêu cầu hợp lệ của người có quyền. Nội dung do AI hỗ trợ soạn vẫn thuộc trách nhiệm của người đăng.`,
          },
        ],
      },
      {
        id: "quy",
        title: "Thu chi và quỹ chung",
        blocks: [
          {
            t: "md",
            text: `- Chức năng Thu chi dùng để **ghi nhận, đối chiếu và công khai** tình hình quỹ chung. Hệ thống **không giữ tiền**, không phải trung gian thanh toán hay dịch vụ ngân hàng; việc chuyển tiền thực hiện qua ngân hàng hoặc ví của bạn.
- Mã **VietQR** được tạo từ thông tin tài khoản đã khai. Hãy **tự kiểm tra tên chủ tài khoản, số tiền và nội dung** trước khi chuyển.
- Một khoản thu chỉ được ghi vào sổ quỹ khi **Thủ quỹ** (người có thẩm quyền) xác nhận. Giao dịch ngân hàng tự động chỉ để gợi ý đối chiếu, không tự ghi sổ.
- Sổ quỹ **bất biến**: không sửa hay xóa bút toán đã ghi; sai sót được đính chính bằng bút toán đảo hoặc điều chỉnh có nêu lý do và lưu vết.
- Chi quỹ theo quy trình duyệt và ngưỡng do cộng đoàn quy định.
- **Ủng hộ** là tự nguyện, không bắt buộc, dành cho mục đích của Lưu xá và không được hoàn lại, trừ trường hợp nhầm lẫn rõ ràng được người quản lý xác nhận.
- Nếu có thắc mắc về số liệu, hãy gửi Thủ quỹ hoặc Trưởng nhà sớm để được đối chiếu.`,
          },
        ],
      },
      {
        id: "ai",
        title: "Trợ lý AI và gợi ý tự động",
        blocks: [
          {
            t: "md",
            text: `Các tính năng AI (như Trợ lý Lưu Xá, gợi ý soạn bài viết) chỉ **hỗ trợ**. Kết quả có thể thiếu chính xác hoặc lỗi thời, **không thay thế** ý kiến của người quản lý, tư vấn pháp lý, y tế hay tài chính. Bạn cần kiểm tra lại trước khi dùng.

Đừng nhập mật khẩu, số CCCD, số tài khoản hay thông tin nhạy cảm của người khác vào ô AI. Cách dữ liệu được xử lý khi dùng AI được nêu ở [Chính sách bảo mật](${P}#ben-thu-ba). Chúng tôi có thể đặt hạn mức sử dụng, hoặc tạm tắt tính năng AI bất cứ lúc nào; mọi việc vẫn làm thủ công được như bình thường.`,
          },
        ],
      },
      {
        id: "phung-vu",
        title: "Nội dung phụng vụ và thông tin tham khảo",
        blocks: [
          {
            t: "md",
            text: "Lịch phụng vụ, bài đọc, kinh nguyện và các tài liệu phụng vụ trong Hệ thống chỉ mang tính **tham khảo** để thuận tiện cho sinh hoạt. Bản chính thức là bản do Hội đồng Giám mục Việt Nam và giáo phận, giáo xứ của bạn ban hành.",
          },
        ],
      },
      {
        id: "thong-bao",
        title: "Thông báo và liên lạc",
        blocks: [
          {
            t: "md",
            text: "Chúng tôi gửi thông báo qua ứng dụng, thông báo đẩy, email hoặc nhóm Zalo chung. **Thông báo quan trọng** (như thông báo cần xác nhận, nhắc đóng quỹ) có thể là bắt buộc. Bạn chọn loại thông báo, kênh và giờ yên tĩnh ở **Cài đặt → Thông báo**. Chúng tôi không gửi quảng cáo.",
          },
        ],
      },
      {
        id: "so-huu-tri-tue",
        title: "Sở hữu trí tuệ",
        blocks: [
          {
            t: "md",
            text: `Phần mềm, giao diện, thiết kế, tên gọi và biểu tượng của Hệ thống thuộc quyền của ${house} hoặc bên cấp phép. Bạn được cấp quyền sử dụng cá nhân, không độc quyền, không chuyển nhượng, chỉ để dùng Hệ thống theo Điều khoản này. Bạn không được sao chép, chỉnh sửa, phân phối hay dịch ngược Hệ thống, trừ khi pháp luật cho phép. Hệ thống dùng một số thành phần mã nguồn mở theo giấy phép của từng thành phần.`,
          },
        ],
      },
      {
        id: "dich-vu",
        title: "Tính sẵn sàng và thay đổi dịch vụ",
        blocks: [
          {
            t: "md",
            text: "Chúng tôi cố gắng giữ Hệ thống hoạt động ổn định nhưng **không bảo đảm** không gián đoạn hay không có lỗi; có thể có thời gian bảo trì hoặc sự cố ngoài tầm kiểm soát (đường truyền, nhà cung cấp hạ tầng…). Chúng tôi có thể thêm, đổi hoặc ngừng một tính năng khi cần. Hệ thống có sao lưu định kỳ, nhưng với giấy tờ quan trọng, hãy giữ bản của riêng bạn.",
          },
        ],
      },
      {
        id: "cham-dut",
        title: "Tạm khóa và chấm dứt",
        blocks: [
          {
            t: "md",
            text: `Người quản lý có thể **tạm khóa hoặc thu hồi** tài khoản khi có vi phạm Điều khoản, Luật nhà hoặc pháp luật, hoặc để bảo vệ an toàn Hệ thống; việc này thực hiện theo quy trình của cộng đoàn và bạn có quyền giải trình. Khi bạn rời nhà, tài khoản được chuyển trạng thái phù hợp (cựu thành viên hoặc ngừng hoạt động). Bạn có thể yêu cầu đóng tài khoản bất cứ lúc nào. Dữ liệu sau đó được xử lý theo [Chính sách bảo mật](${P}#luu-tru). Các điều khoản về sổ quỹ, sở hữu trí tuệ, giới hạn trách nhiệm và giải quyết tranh chấp vẫn có hiệu lực sau khi chấm dứt.`,
          },
        ],
      },
      {
        id: "gioi-han",
        title: "Miễn trừ và giới hạn trách nhiệm",
        blocks: [
          {
            t: "md",
            text: `Hệ thống được cung cấp trên cơ sở “**như hiện có**”, nhằm phục vụ sinh hoạt của cộng đoàn. Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp, mất cơ hội hay mất dữ liệu do sự cố ngoài tầm kiểm soát, do lỗi thiết bị hoặc đường truyền của bạn, do bạn để lộ mật khẩu, hoặc do dịch vụ của bên thứ ba. Điều này không loại trừ trách nhiệm của chúng tôi khi có lỗi cố ý hoặc vi phạm nghĩa vụ bảo vệ dữ liệu cá nhân theo quy định của pháp luật, và không hạn chế quyền lợi hợp pháp của bạn.`,
          },
        ],
      },
      {
        id: "tranh-chap",
        title: "Luật áp dụng và giải quyết tranh chấp",
        blocks: [
          {
            t: "md",
            text: "Điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi bất đồng trước hết được giải quyết bằng thương lượng, hòa giải với người quản lý và Trưởng nhà trên tinh thần xây dựng. Nếu không đạt được thỏa thuận, tranh chấp được giải quyết tại Tòa án có thẩm quyền theo quy định của pháp luật Việt Nam.",
          },
        ],
      },
      {
        id: "thay-doi",
        title: "Thay đổi điều khoản",
        blocks: [
          {
            t: "md",
            text: `Chúng tôi có thể cập nhật Điều khoản này; phiên bản và ngày cập nhật được ghi ở đầu trang. Với thay đổi quan trọng, chúng tôi sẽ thông báo trên trang web hoặc trong ứng dụng trước khi áp dụng. Việc tiếp tục sử dụng Hệ thống sau ngày có hiệu lực được hiểu là bạn chấp nhận nội dung đã cập nhật. Văn bản này đi cùng [Chính sách bảo mật](${P}); bản hiện hành luôn được đăng tại trang này.`,
          },
        ],
      },
      {
        id: "lien-he",
        title: "Liên hệ",
        blocks: [
          { t: "md", text: `Mọi câu hỏi về Điều khoản này, xin liên hệ người quản lý của ${house} (${contactLine(org)}) hoặc dùng [biểu mẫu liên hệ](/lien-he).` },
          { t: "contact" },
        ],
      },
    ],
  };
}
