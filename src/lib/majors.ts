// Danh sách ngành học phổ biến ở các trường đại học/cao đẳng Việt Nam — dùng cho ô chọn "Ngành học"
// (chọn sẵn cho nhanh; ngành không có trong danh sách thì chọn "Khác" và tự nhập). Sắp theo nhóm ngành.

export const MAJOR_GROUPS: { group: string; majors: string[] }[] = [
  {
    group: "Công nghệ thông tin",
    majors: [
      "Công nghệ thông tin",
      "Khoa học máy tính",
      "Kỹ thuật phần mềm",
      "Hệ thống thông tin",
      "An toàn thông tin",
      "Trí tuệ nhân tạo",
      "Khoa học dữ liệu",
      "Kỹ thuật máy tính",
      "Mạng máy tính và truyền thông dữ liệu",
      "Thiết kế đồ họa / Truyền thông đa phương tiện",
    ],
  },
  {
    group: "Kỹ thuật & Công nghệ",
    majors: [
      "Kỹ thuật điện – điện tử",
      "Kỹ thuật điều khiển và tự động hóa",
      "Kỹ thuật điện tử – viễn thông",
      "Cơ khí",
      "Kỹ thuật cơ điện tử",
      "Kỹ thuật ô tô",
      "Kỹ thuật xây dựng",
      "Kỹ thuật xây dựng công trình giao thông",
      "Kiến trúc",
      "Kỹ thuật hóa học",
      "Công nghệ thực phẩm",
      "Công nghệ sinh học",
      "Kỹ thuật môi trường",
      "Công nghệ chế biến thủy sản",
    ],
  },
  {
    group: "Kinh tế & Quản trị",
    majors: [
      "Quản trị kinh doanh",
      "Marketing",
      "Kinh doanh quốc tế",
      "Thương mại điện tử",
      "Kinh tế",
      "Kinh tế quốc tế",
      "Tài chính – Ngân hàng",
      "Kế toán",
      "Kiểm toán",
      "Logistics và Quản lý chuỗi cung ứng",
      "Quản trị nhân lực",
      "Du lịch và Lữ hành",
      "Quản trị khách sạn",
    ],
  },
  {
    group: "Luật, Xã hội & Nhân văn",
    majors: [
      "Luật",
      "Luật kinh tế",
      "Tâm lý học",
      "Xã hội học",
      "Công tác xã hội",
      "Báo chí",
      "Quan hệ công chúng",
      "Triết học",
      "Thần học / Mục vụ",
      "Văn học",
      "Lịch sử",
    ],
  },
  {
    group: "Ngoại ngữ",
    majors: ["Ngôn ngữ Anh", "Ngôn ngữ Trung Quốc", "Ngôn ngữ Nhật", "Ngôn ngữ Hàn Quốc", "Ngôn ngữ Pháp", "Ngôn ngữ Đức"],
  },
  {
    group: "Sư phạm & Giáo dục",
    majors: ["Sư phạm Toán", "Sư phạm Ngữ văn", "Sư phạm Tiếng Anh", "Sư phạm Vật lý", "Sư phạm Hóa học", "Giáo dục tiểu học", "Giáo dục mầm non", "Giáo dục thể chất"],
  },
  {
    group: "Sức khỏe",
    majors: ["Y khoa", "Răng – Hàm – Mặt", "Dược học", "Điều dưỡng", "Y tế công cộng", "Kỹ thuật xét nghiệm y học", "Y học cổ truyền", "Thú y"],
  },
  {
    group: "Khoa học tự nhiên & Nông – Lâm – Ngư",
    majors: ["Toán học", "Toán ứng dụng", "Thống kê", "Vật lý", "Hóa học", "Sinh học", "Nông học", "Nuôi trồng thủy sản", "Lâm nghiệp", "Quản lý đất đai"],
  },
  {
    group: "Nghệ thuật",
    majors: ["Mỹ thuật", "Thiết kế đồ họa", "Thiết kế nội thất", "Âm nhạc", "Sân khấu – Điện ảnh"],
  },
];

export const MAJOR_OTHER = "__other__";

/** Phẳng, sắp theo bảng chữ cái tiếng Việt — dùng khi cần danh sách một cấp. */
export const ALL_MAJORS: string[] = MAJOR_GROUPS.flatMap((g) => g.majors).sort((a, b) => a.localeCompare(b, "vi"));

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
const BY_FOLD = new Map(ALL_MAJORS.map((m) => [fold(m), m]));

/** Tên chuẩn trong danh sách nếu `value` trùng (không phân biệt hoa/thường/dấu), ngược lại null. */
export const canonicalMajor = (value: string): string | null => BY_FOLD.get(fold(value)) ?? null;
