// Danh sách nhà thờ / giáo xứ của Giáo phận Nha Trang (Khánh Hòa) cho ô "Nhà thờ / giáo xứ đã dự lễ" khi check-in đi lễ.
// Nguồn đối chiếu (tháng 10/2026): danh sách giáo hạt – giáo xứ của Giáo phận Nha Trang (giaophannhatrang.org, sotayconggiao.com) và
// địa chỉ tham khảo từ các trang giới thiệu nhà thờ Nha Trang. Từ 1/7/2025 tỉnh Khánh Hòa sáp nhập Ninh Thuận nên danh sách gồm cả
// các giáo hạt Phan Rang. Giáo xứ nào chưa có trong danh sách (nhà thờ tỉnh khác, nhà nguyện, giáo họ…) thì người dùng tự nhập.
// Thêm / sửa giáo xứ: chỉ cần sửa mảng bên dưới — giá trị lưu là CHUỖI VĂN BẢN tự do (`mass_checkins.church`), không cần migration.
import { foldVi } from "@/lib/geo";

export interface ChurchItem {
  /** Chuỗi hiển thị và lưu vào hồ sơ check-in */
  name: string;
  /** Gợi ý phụ (địa chỉ tham khảo, tên thường gọi) */
  hint?: string;
  /** Chuỗi đã bỏ dấu để tìm kiếm */
  key: string;
}
export interface ChurchGroup {
  label: string;
  items: ChurchItem[];
}

// [tên giáo xứ, gợi ý?] — tên đầy đủ "Giáo xứ …" sinh tự động; chuỗi bắt đầu bằng "!" được dùng nguyên văn
type Raw = string | [string, string];
const GROUPS: { label: string; items: Raw[] }[] = [
  {
    label: "Giáo hạt Nha Trang (thành phố)",
    items: [
      ["!Nhà thờ Chánh Tòa Chúa Kitô Vua (Nhà thờ Núi)", "31 Thái Nguyên — Chánh Tòa Giáo phận"],
      "Ba Làng",
      ["Bắc Thành", "38 Lê Thánh Tôn"],
      "Cầu Ké",
      "Chợ Mới",
      ["Thánh Giuse (Quân Trấn)", "53 Hùng Vương"],
      ["Hòa Thuận", "Fatima — Nguyễn Bỉnh Khiêm"],
      "Khiết Tâm",
      "Lương Sơn",
      "Ngọc Thủy",
      ["Phước Hải", "30 Trương Định"],
      "Phước Hòa",
      "Phước Đồng",
      "Thanh Hải",
      "Vĩnh Phước",
      "Núi Sạn",
      ["Thánh Gia (Vĩnh Trung)", "Vĩnh Nguyên"],
      "Bình Cang",
    ],
  },
  {
    label: "Giáo hạt Diên Khánh",
    items: ["Cây Vông", "Đại Điền", "Đồng Hộ", "Hà Dừa", "Đồng Dài", "Khánh Vĩnh", "Đồng Trăng", "Diên Đồng", "Cư Thịnh"],
  },
  {
    label: "Giáo hạt Vạn Ninh (gồm Ninh Hòa, Vạn Giã)",
    items: ["Ninh Hòa", "Vạn Giã", "Gò Muồng", "Diêm Điền", "Dục Mỹ", "Định Hòa", "Hòa Thanh", "Mỹ Hoán", "Ninh Trang", "Thạch Định", "Xuân Sơn", "Ninh Mã", "!Giáo họ Anna"],
  },
  {
    label: "Giáo hạt Cam Lâm",
    items: ["Tân Bình", "Bắc Vĩnh", "Hòa Nghĩa", "Hòa Tân", "Hòa Yên", "Cù Hin", "Hòa Bình", "Vĩnh Hòa", "Vĩnh An", "Vĩnh Bình", "Vĩnh Thái", "Vĩnh Trang", "Suối Hòa", "Suối Dầu"],
  },
  {
    label: "Giáo hạt Cam Ranh",
    items: ["Nghĩa Phú", "Phú Nhơn", "Ba Ngòi", "Phú Phong", "Hòa Do", "Mỹ Thanh", "Xuân Ninh", "Sông Cầu (Thánh Antôn)", "Phú Đức", "Khánh Sơn"],
  },
  {
    label: "Giáo hạt Phan Rang",
    items: ["Phan Rang", "Tân Hội", "Tấn Tài", "Mỹ Đức", "Tân Xuân", "Cầu Bảo"],
  },
  {
    label: "Giáo hạt Ninh Hải",
    items: ["Bà Râu", "Bình Chính", "Gò Đền", "Gò Sạn", "Gò Thao", "Hòn Thiên", "Thủy Lợi", "Thái Hòa", "Thanh Điền", "Hộ Diêm", "Ninh Căn"],
  },
  {
    label: "Giáo hạt Ninh Phước",
    items: ["Bảo Vinh", "Bình Quý", "Đá Trắng", "Liên Sơn", "Nhị Hà", "Phú Quý", "Phước An", "Phước Thiện", "Đá Hàn", "Cà Ná"],
  },
  {
    label: "Giáo hạt Ninh Sơn",
    items: ["Hạnh Trí", ["Quảng Thuận", "Đức Mẹ La Vang"], "Song Mỹ", "Sông Pha", "Thạch Hà", "Triệu Phong", "Tầm Ngân", "Đồng Mé", "Trà Giang"],
  },
];

export const NHA_TRANG_CHURCH_GROUPS: ChurchGroup[] = GROUPS.map((g) => ({
  label: g.label,
  items: g.items.map((r) => {
    const [raw, hint] = Array.isArray(r) ? r : [r, undefined];
    const name = raw.startsWith("!") ? raw.slice(1) : `Giáo xứ ${raw}`;
    return { name, hint, key: foldVi(`${name} ${hint ?? ""} ${g.label}`) };
  }),
}));

/** Lọc theo chữ gõ (không phân biệt dấu / hoa thường); bỏ nhóm không còn mục nào. */
export function searchChurches(q: string): ChurchGroup[] {
  const k = foldVi(q.trim());
  if (!k) return NHA_TRANG_CHURCH_GROUPS;
  return NHA_TRANG_CHURCH_GROUPS.map((g) => ({ label: g.label, items: g.items.filter((i) => i.key.includes(k)) })).filter((g) => g.items.length > 0);
}
