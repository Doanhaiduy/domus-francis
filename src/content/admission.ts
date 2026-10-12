// Nội dung trang công khai "Vào ở lưu xá" (/vao-o): đời sống ở nhà, các bước nhập nhà, giấy tờ cần chuẩn bị.
// Viết dưới dạng khối có cấu trúc (như legal-*.ts) để sửa lời văn mà không đụng tới giao diện (src/app/(public)/vao-o/page.tsx).
// Văn bản dùng cú pháp nhỏ của ArticleMarkdown: **đậm**, *nghiêng*, [chữ](/liên-kết).
//
// KHÔNG ghi số liệu phụ thuộc nhà ở đây (mức quỹ, tiền điện nước, chỗ trống, giờ giấc, địa chỉ, hotline): trang đọc chúng từ cấu hình
// và dữ liệu thật (app.fn_public_admission_info, Cài đặt → Cấu hình chung, Luật nhà). Đổi quy trình nhận người ⇒ sửa file này.
import { SITE_CITY } from "@/lib/public-site";
import type { PublicOrgInfo } from "@/lib/types/articles";

export interface AdmissionValue {
  /** Tên biểu tượng (lucide) do trang ánh xạ */
  icon: "pray" | "study" | "home" | "heart";
  title: string;
  text: string;
}

export interface AdmissionStep {
  title: string;
  /** Markdown một đoạn */
  text: string;
}

export interface AdmissionDocument {
  title: string;
  note?: string;
}

/** Lời mở đầu trang (dưới tiêu đề). */
export const admissionIntro = (org: PublicOrgInfo) =>
  `${org.houseName} là mái nhà chung của nam sinh viên Công giáo đang học tại ${SITE_CITY}. Dưới đây là chi phí, nhịp sinh hoạt và các bước để bạn trở thành thành viên của nhà.`;

/** "Đời sống ở nhà" — điều nhà gìn giữ và mong ở mỗi thành viên (khớp tinh thần Luật nhà). */
export const ADMISSION_VALUES: AdmissionValue[] = [
  {
    icon: "pray",
    title: "Cùng cầu nguyện",
    text: "Mỗi tối anh em đọc Kinh chung; Chúa Nhật và các lễ trọng cùng nhau tham dự Thánh lễ. Đức tin là sợi dây gắn kết cả nhà.",
  },
  {
    icon: "study",
    title: "Cùng học tập",
    text: "Việc học được đặt lên hàng đầu: giữ yên lặng giờ học, nâng đỡ nhau mùa thi. Nhà mong mỗi bạn chu toàn kết quả học tập của mình.",
  },
  {
    icon: "home",
    title: "Cùng gánh việc nhà",
    text: "Anh em luân phiên trực vệ sinh, giữ gìn tài sản chung và cùng góp quỹ sinh hoạt — mọi khoản thu chi được ghi sổ minh bạch trên ứng dụng của nhà.",
  },
  {
    icon: "heart",
    title: "Như một gia đình",
    text: "Mừng lễ Bổn mạng, những chuyến hành hương, những bữa cơm chung và cả những lúc ốm đau, xa nhà — ở đây không ai phải một mình.",
  },
];

/** Các bước vào ở (neo #cac-buoc). */
export const admissionSteps = (org: PublicOrgInfo): AdmissionStep[] => [
  {
    title: "Đăng ký tìm hiểu",
    text: `Điền [biểu mẫu đăng ký tìm hiểu](/lien-he#dang-ky)${org.phone ? ` hoặc gọi hotline **${org.phone}**` : ""}. Hãy cho chúng tôi biết bạn học trường nào, năm thứ mấy và giáo xứ nơi bạn sinh hoạt.`,
  },
  {
    title: "Trò chuyện và thăm nhà",
    text: "Người quản lý liên hệ lại để hẹn một buổi đến thăm: xem chỗ ở, gặp gỡ anh em, nghe giới thiệu nội quy và hỏi mọi điều bạn còn băn khoăn.",
  },
  {
    title: "Nộp hồ sơ",
    text: "Khi hai bên đã thống nhất, bạn nộp các giấy tờ bên dưới và đọc kỹ Luật nhà. Nhà làm thủ tục khai báo tạm trú với chính quyền địa phương theo quy định.",
  },
  {
    title: "Nhận phòng và bắt đầu",
    text: "Bạn được xếp phòng, nhận tài khoản ứng dụng của nhà (lịch sinh hoạt, quỹ chung, trực nhật, xin phép…) và bắt đầu nhịp sống chung cùng anh em.",
  },
];

/** Giấy tờ thường cần chuẩn bị (neo #giay-to). Người quản lý hướng dẫn cụ thể khi bạn đến thăm. */
export const ADMISSION_DOCUMENTS: AdmissionDocument[] = [
  { title: "Căn cước (CCCD)", note: "Để nhà khai báo tạm trú theo quy định." },
  { title: "Thẻ sinh viên hoặc giấy báo nhập học", note: "Của trường bạn đang hoặc sắp theo học." },
  { title: "Ảnh chân dung", note: "Dùng cho hồ sơ thành viên." },
  { title: "Số điện thoại của bố mẹ hoặc người giám hộ", note: "Để nhà liên lạc khi cần." },
  { title: "Thư giới thiệu của Cha xứ hoặc giấy chứng nhận Rửa tội", note: "Nếu nhà yêu cầu — người quản lý sẽ cho biết trước." },
];

export const ADMISSION_DOCUMENTS_NOTE = "Danh sách mang tính tham khảo; người quản lý sẽ hướng dẫn cụ thể khi bạn đến thăm nhà.";
