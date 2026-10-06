// Đọc tệp Excel/CSV nhập thành viên (chạy trong trình duyệt) + tạo tệp mẫu. Tiêu đề cột nhận diện theo tên tiếng Việt (không phân biệt hoa thường, dấu).
// Danh sách cột phủ MỌI thông tin hồ sơ nhập được hàng loạt; thông tin Công giáo (cần chính thành viên đồng ý), ảnh đại diện và tài khoản thì không.

import { MAJOR_GROUPS } from "@/lib/majors";

export type ImportKey =
  | "fullName"
  | "displayName"
  | "gender"
  | "phone"
  | "email"
  | "hidePhone"
  | "joinedOn"
  | "roomCode"
  | "birthDate"
  | "nationalId"
  | "hometown"
  | "homeAddress"
  | "studentStatus"
  | "universityName"
  | "major"
  | "academicYear"
  | "enrollmentYear"
  | "expectedGraduationYear"
  | "studentCode"
  | "fatherName"
  | "fatherPhone"
  | "motherName"
  | "motherPhone"
  | "customDuesVnd";
export type ImportRowInput = Partial<Record<ImportKey, string>>;

export type ImportGroupId = "basic" | "private" | "study" | "family" | "fund";
export const IMPORT_GROUPS: readonly { id: ImportGroupId; title: string; color: string }[] = [
  { id: "basic", title: "THÔNG TIN CƠ BẢN", color: "#EDE9FE" },
  { id: "private", title: "GIẤY TỜ & ĐỊA CHỈ (riêng tư)", color: "#FCE7F3" },
  { id: "study", title: "HỌC VỤ", color: "#DBEAFE" },
  { id: "family", title: "GIA ĐÌNH (riêng tư)", color: "#FEF3C7" },
  { id: "fund", title: "QUỸ", color: "#D1FAE5" },
];

export interface ImportColumn {
  key: ImportKey;
  title: string;
  /** Tên cột khác cũng được nhận (đã bỏ dấu, chữ thường) — để tệp cũ/tự soạn vẫn đọc được */
  aliases: readonly string[];
  group: ImportGroupId;
  /** Ví dụ cho sheet Hướng dẫn */
  example: string;
  /** Giá trị chấp nhận / lưu ý */
  note: string;
  required?: boolean;
}

// Các cột cùng nhóm phải đứng liền nhau (nhóm hiển thị thành một dải màu phía trên dòng tiêu đề)
export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "fullName", title: "Họ và tên", aliases: ["ho ten", "ho va ten", "ten", "full name"], group: "basic", example: "Nguyễn Văn An", note: "Bắt buộc, tối thiểu 2 ký tự.", required: true },
  { key: "displayName", title: "Tên gọi", aliases: ["ten goi", "ten thuong goi", "bi danh", "display name"], group: "basic", example: "An", note: "Tên hiển thị trong danh bạ. Bỏ trống = tự lấy 2 chữ cuối của họ tên." },
  { key: "gender", title: "Giới tính", aliases: ["gioi tinh", "gender"], group: "basic", example: "Nam", note: "Nam hoặc Nữ." },
  { key: "phone", title: "Số điện thoại", aliases: ["sdt", "so dien thoai", "dien thoai", "phone"], group: "basic", example: "0912 334 782", note: "SĐT Việt Nam; thiếu số 0 đầu vẫn nhận. Mỗi số chỉ dùng cho một người." },
  { key: "email", title: "Email", aliases: ["email", "mail", "thu dien tu"], group: "basic", example: "an.nguyen@gmail.com", note: "Mỗi email chỉ dùng cho một người." },
  { key: "hidePhone", title: "Ẩn SĐT", aliases: ["an sdt", "an so dien thoai", "an dien thoai"], group: "basic", example: "Không", note: "Có = ẩn SĐT với thành viên khác; Không hoặc để trống = hiện." },
  { key: "joinedOn", title: "Ngày vào nhà", aliases: ["ngay vao nha", "ngay vao", "thang nam vao nha", "joined"], group: "basic", example: "09/2026", note: "DD/MM/YYYY hoặc chỉ tháng/năm (MM/YYYY). Bỏ trống = hôm nay." },
  { key: "roomCode", title: "Phòng", aliases: ["phong", "ma phong", "room"], group: "basic", example: "P.1", note: "Mã hoặc tên phòng ngủ có trong sơ đồ nhà (xem sheet “Danh muc”). Không khớp hoặc hết chỗ ⇒ để chưa xếp phòng." },
  { key: "birthDate", title: "Ngày sinh", aliases: ["ngay sinh", "sinh nhat", "birth", "dob"], group: "private", example: "15/03/2005", note: "DD/MM/YYYY." },
  { key: "nationalId", title: "Số CCCD/CMND", aliases: ["cccd", "cmnd", "so cccd", "so cmnd", "so cccd cmnd", "can cuoc", "can cuoc cong dan", "cmnd cccd"], group: "private", example: "079205001234", note: "CCCD 12 số hoặc CMND 9 số (Excel làm mất số 0 đầu thì tự thêm lại). Lưu mã hóa; mỗi số chỉ dùng cho một người." },
  { key: "hometown", title: "Quê quán", aliases: ["que quan", "que", "hometown"], group: "private", example: "Phú Yên", note: "Tỉnh/thành hoặc ghi tự do." },
  { key: "homeAddress", title: "Địa chỉ thường trú", aliases: ["dia chi thuong tru", "dia chi", "thuong tru", "home address"], group: "private", example: "12 Lê Lợi, TP. Tuy Hòa, Phú Yên", note: "Ghi tự do, tối đa 300 ký tự." },
  { key: "studentStatus", title: "Tình trạng học tập", aliases: ["tinh trang hoc tap", "tinh trang", "trang thai hoc tap", "tinh trang sinh vien"], group: "study", example: "Đang học", note: "Đang học / Đã tốt nghiệp / Bảo lưu / Thôi học. Bỏ trống = Đang học. Chỉ lưu khi xác định được Trường." },
  { key: "universityName", title: "Trường đại học", aliases: ["truong", "truong dai hoc", "dai hoc", "university"], group: "study", example: "Đại học Nha Trang", note: "Trùng (hoặc gần giống) tên/mã trường trong danh mục của lưu xá (xem sheet “Danh muc”). Không khớp ⇒ bỏ qua toàn bộ phần học vụ của dòng đó." },
  { key: "major", title: "Ngành học", aliases: ["nganh", "nganh hoc", "major"], group: "study", example: "Công nghệ thông tin", note: "Chọn từ danh sách gợi ý ở sheet “Danh muc” hoặc tự ghi." },
  { key: "academicYear", title: "Khóa", aliases: ["khoa", "nam hoc", "nam hoc khoa", "nien khoa"], group: "study", example: "K66", note: "Khóa/năm học, ví dụ K66 hoặc Năm 2. Ghi “K66 (2022 – 2026)” thì tự tách cả niên khóa." },
  { key: "enrollmentYear", title: "Năm nhập học", aliases: ["nam nhap hoc", "nhap hoc", "nam vao truong", "nam bat dau"], group: "study", example: "2022", note: "4 chữ số (1990–2100) — đầu niên khóa." },
  { key: "expectedGraduationYear", title: "Năm ra trường (dự kiến)", aliases: ["nam ra truong", "ra truong", "nam ra truong du kien", "du kien ra truong", "nam tot nghiep"], group: "study", example: "2026", note: "4 chữ số, không nhỏ hơn năm nhập học — cuối niên khóa." },
  { key: "studentCode", title: "Mã sinh viên", aliases: ["msv", "ma sinh vien", "ma sv"], group: "study", example: "62130001", note: "Ghi tự do." },
  { key: "fatherName", title: "Họ tên cha", aliases: ["ho ten cha", "ten cha", "cha"], group: "family", example: "Nguyễn Văn Bình", note: "" },
  { key: "fatherPhone", title: "SĐT cha", aliases: ["sdt cha", "dien thoai cha"], group: "family", example: "0903 111 222", note: "Cần có họ tên cha. Lưu mã hóa." },
  { key: "motherName", title: "Họ tên mẹ", aliases: ["ho ten me", "ten me", "me"], group: "family", example: "Trần Thị Lan", note: "" },
  { key: "motherPhone", title: "SĐT mẹ", aliases: ["sdt me", "dien thoai me"], group: "family", example: "0903 333 444", note: "Cần có họ tên mẹ. Lưu mã hóa." },
  { key: "customDuesVnd", title: "Định mức quỹ riêng (VNĐ)", aliases: ["dinh muc quy rieng", "dinh muc quy", "muc quy rieng", "quy rieng", "dinh muc rieng"], group: "fund", example: "", note: "Số tiền mỗi kỳ, ví dụ 150000 hoặc 150.000 (0 = miễn). Bỏ trống = tự động theo tình trạng học tập." },
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function headerKey(h: string): ImportKey | null {
  const f = fold(h.replace(/\*/g, ""));
  if (!f) return null;
  const hit = IMPORT_COLUMNS.find((c) => fold(c.title) === f || c.aliases.some((a) => a === f));
  return hit?.key ?? null;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Ô ngày của Excel: đọc theo UTC để không lệch múi giờ
    return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`;
  }
  return String(v).trim();
}

/** Bảng ô → các dòng theo tiêu đề cột. Dòng tiêu đề = dòng đầu có nhận ra ít nhất “Họ và tên”. */
export function rowsFromTable(table: unknown[][]): { rows: ImportRowInput[]; unknownHeaders: string[] } {
  let headerIdx = -1;
  let map: (ImportKey | null)[] = [];
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const m = (table[i] ?? []).map((h) => headerKey(cellText(h)));
    if (m.includes("fullName")) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Không thấy cột “Họ và tên” ở các dòng đầu của tệp. Hãy dùng tệp mẫu.");
  const unknownHeaders = (table[headerIdx] ?? []).map((h, i) => (map[i] ? null : cellText(h))).filter((h): h is string => !!h);
  const rows: ImportRowInput[] = [];
  for (const line of table.slice(headerIdx + 1)) {
    const row: ImportRowInput = {};
    let any = false;
    (line ?? []).forEach((v, i) => {
      const k = map[i];
      const t = cellText(v);
      if (k && t) {
        row[k] = t;
        any = true;
      }
    });
    if (any) rows.push(row);
  }
  return { rows, unknownHeaders };
}

/** CSV (có thể có BOM, dấu phẩy hoặc chấm phẩy, ô trong ngoặc kép). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = (src.split("\n")[0].match(/;/g)?.length ?? 0) > (src.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}

export async function readImportFile(file: File): Promise<{ rows: ImportRowInput[]; unknownHeaders: string[] }> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Tệp quá lớn (tối đa 5 MB).");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") return rowsFromTable(parseCsv(await file.text()));
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return rowsFromTable((await readSheet(file)) as unknown[][]);
  }
  throw new Error("Chỉ nhận tệp .xlsx (Excel) hoặc .csv.");
}

/** Danh mục giá trị hợp lệ của nhà này — in vào sheet “Danh muc” của tệp mẫu để điền cho khớp. */
export interface ImportTemplateRefs {
  universities?: string[];
  rooms?: { code: string; name: string }[];
}

/** Số dòng trống định dạng sẵn dạng Text (bằng số dòng tối đa mỗi lần nhập) */
const TEMPLATE_BLANK_ROWS = 300;

/**
 * Tệp mẫu .xlsx gồm 3 sheet:
 *  - “Thanh vien”: dải nhóm cột + dòng tiêu đề + các dòng trống ĐÃ ĐẶT ĐỊNH DẠNG TEXT (Excel không làm mất số 0 đầu của SĐT/CCCD, không tự đổi ngày/số);
 *  - “Huong dan”: lưu ý chung + bảng từng cột (bắt buộc, ví dụ, giá trị chấp nhận);
 *  - “Danh muc”: trường, phòng, ngành, tình trạng… hợp lệ để điền cho khớp.
 * Cố ý KHÔNG đặt dòng ví dụ ở sheet dữ liệu để không ai vô tình nhập luôn người mẫu.
 */
export async function downloadImportTemplate(refs: ImportTemplateRefs = {}) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const cols = IMPORT_COLUMNS;

  // --- Sheet dữ liệu ---
  const band: unknown[] = [];
  for (const g of IMPORT_GROUPS) {
    const n = cols.filter((c) => c.group === g.id).length;
    if (!n) continue;
    band.push({ value: g.title, fontWeight: "bold", backgroundColor: g.color, align: "center", columnSpan: n });
    for (let i = 1; i < n; i++) band.push(null);
  }
  const color = (id: ImportGroupId) => IMPORT_GROUPS.find((g) => g.id === id)?.color ?? "#EDE9FE";
  const head = cols.map((c) => ({ value: c.required ? `${c.title} *` : c.title, fontWeight: "bold", backgroundColor: color(c.group), align: "center", wrap: true, bottomBorderStyle: "thin" }));
  const blank = () => cols.map(() => ({ value: "", type: String, format: "@" }));
  const dataRows = Array.from({ length: TEMPLATE_BLANK_ROWS }, blank);
  const wide: Partial<Record<ImportKey, number>> = { fullName: 24, email: 26, homeAddress: 36, hometown: 18, universityName: 28, major: 28, fatherName: 22, motherName: 22, customDuesVnd: 22, nationalId: 18, expectedGraduationYear: 22 };

  // --- Sheet hướng dẫn ---
  const note = (t: string) => [{ value: t, columnSpan: 4, wrap: true, alignVertical: "top" }, null, null, null];
  const guide: unknown[][] = [
    [{ value: "Hướng dẫn nhập thành viên hàng loạt", fontWeight: "bold", fontSize: 14 }],
    [],
    note("• Điền mỗi người một dòng ở sheet “Thanh vien” (giữ nguyên dòng tiêu đề). Chỉ cột “Họ và tên” là bắt buộc; cột nào không có thông tin cứ để trống, hoặc xóa hẳn cột (giữ nguyên tên các cột còn lại)."),
    note("• Mọi ô đã đặt sẵn định dạng Text nên Excel sẽ không làm mất số 0 đầu của số điện thoại / CCCD và không tự đổi ngày. Ngày nhập dạng DD/MM/YYYY (15/03/2005); “Ngày vào nhà” có thể chỉ ghi tháng/năm (09/2026)."),
    note("• Trường, Phòng, Ngành, Tình trạng: xem sheet “Danh muc”. Tên trường/phòng phải trùng danh mục của lưu xá (hoặc gần giống); không khớp ⇒ bỏ qua phần đó và có cảnh báo. Thông tin học vụ chỉ lưu khi xác định được Trường."),
    note("• Mỗi số điện thoại, email, số CCCD chỉ dùng cho một người — dòng trùng với người đã có (hoặc trùng trong tệp) sẽ bị bỏ qua. Tối đa 300 dòng mỗi lần; hệ thống kiểm tra từng dòng và cho xem kết quả trước khi thêm."),
    note("• Cột riêng tư (Ngày sinh, CCCD, Quê quán, Địa chỉ, Cha/Mẹ) cần quyền ghi thông tin riêng tư; Ẩn SĐT, các cột Học vụ và Định mức quỹ riêng cần quyền sửa hồ sơ thành viên (Trưởng nhà và Admin có đủ). Thiếu quyền ⇒ cột đó bị bỏ qua và có thông báo."),
    note("• KHÔNG nhập hàng loạt: thông tin Công giáo (tên thánh, giáo phận, giáo xứ, bí tích — cần chính thành viên đồng ý, thành viên tự điền ở Cài đặt → Hồ sơ), ảnh đại diện và tài khoản đăng nhập (cấp riêng ở Cài đặt → Tài khoản)."),
    [],
    ["Cột", "Bắt buộc", "Ví dụ", "Giá trị chấp nhận / lưu ý"].map((t) => ({ value: t, fontWeight: "bold", backgroundColor: "#EDE9FE", bottomBorderStyle: "thin" })),
  ];
  for (const g of IMPORT_GROUPS) {
    guide.push([{ value: g.title, fontWeight: "bold", backgroundColor: g.color, columnSpan: 4 }, null, null, null]);
    for (const c of cols.filter((x) => x.group === g.id)) {
      guide.push([
        { value: c.title, fontWeight: "bold", alignVertical: "top" },
        { value: c.required ? "Có" : "", alignVertical: "top" },
        { value: c.example, type: String, format: "@", alignVertical: "top" },
        { value: c.note, wrap: true, alignVertical: "top" },
      ]);
    }
  }

  // --- Sheet danh mục ---
  const lists: { title: string; values: string[] }[] = [
    { title: "Giới tính", values: ["Nam", "Nữ"] },
    { title: "Ẩn SĐT", values: ["Có", "Không"] },
    { title: "Tình trạng học tập", values: ["Đang học", "Đã tốt nghiệp", "Bảo lưu", "Thôi học"] },
    { title: "Trường đại học", values: refs.universities ?? [] },
    { title: "Mã phòng", values: (refs.rooms ?? []).map((r) => r.code) },
    { title: "Tên phòng", values: (refs.rooms ?? []).map((r) => r.name) },
    { title: "Ngành học (gợi ý — có thể tự ghi)", values: MAJOR_GROUPS.flatMap((g) => g.majors) },
  ];
  const height = Math.max(...lists.map((l) => l.values.length));
  const refRows: unknown[][] = [lists.map((l) => ({ value: l.title, fontWeight: "bold", backgroundColor: "#EDE9FE", bottomBorderStyle: "thin" }))];
  for (let i = 0; i < height; i++) refRows.push(lists.map((l) => (l.values[i] ? { value: l.values[i], type: String, format: "@" } : null)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(
    [
      { data: [band, head, ...dataRows], sheet: "Thanh vien", columns: cols.map((c) => ({ width: wide[c.key] ?? Math.max(14, c.title.length + 4) })), stickyRowsCount: 2, stickyColumnsCount: 1 },
      { data: guide, sheet: "Huong dan", columns: [{ width: 26 }, { width: 10 }, { width: 34 }, { width: 100 }] },
      { data: refRows, sheet: "Danh muc", columns: [{ width: 14 }, { width: 10 }, { width: 20 }, { width: 38 }, { width: 12 }, { width: 24 }, { width: 44 }], stickyRowsCount: 1 },
    ]
  ).toFile("Mau_nhap_thanh_vien.xlsx");
}
