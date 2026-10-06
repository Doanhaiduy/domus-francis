// Đọc tệp Excel/CSV nhập thành viên (chạy trong trình duyệt) + tạo tệp mẫu. Tiêu đề cột nhận diện theo tên tiếng Việt (không phân biệt hoa thường, dấu).

export const IMPORT_COLUMNS = [
  { key: "fullName", title: "Họ và tên", aliases: ["ho ten", "ho va ten", "ten", "full name"], example: "Nguyễn Văn An", required: true },
  { key: "gender", title: "Giới tính", aliases: ["gioi tinh", "gender"], example: "Nam" },
  { key: "phone", title: "Số điện thoại", aliases: ["sdt", "so dien thoai", "dien thoai", "phone"], example: "0912 334 782" },
  { key: "email", title: "Email", aliases: ["email", "mail", "thu dien tu"], example: "an.nguyen@gmail.com" },
  { key: "birthDate", title: "Ngày sinh", aliases: ["ngay sinh", "sinh nhat", "birth", "dob"], example: "15/03/2005" },
  { key: "hometown", title: "Quê quán", aliases: ["que quan", "que", "hometown"], example: "Phú Yên" },
  { key: "universityName", title: "Trường đại học", aliases: ["truong", "truong dai hoc", "dai hoc", "university"], example: "Đại học Nha Trang" },
  { key: "major", title: "Ngành học", aliases: ["nganh", "nganh hoc", "major"], example: "Công nghệ thông tin" },
  { key: "academicYear", title: "Năm học / Khóa", aliases: ["nam hoc", "khoa", "nam hoc khoa", "nien khoa"], example: "Năm 2" },
  { key: "studentCode", title: "Mã sinh viên", aliases: ["msv", "ma sinh vien", "ma sv"], example: "62130001" },
  { key: "roomCode", title: "Phòng", aliases: ["phong", "ma phong", "room"], example: "P.1" },
  { key: "joinedOn", title: "Ngày vào nhà", aliases: ["ngay vao nha", "ngay vao", "joined"], example: "01/09/2026" },
  { key: "fatherName", title: "Họ tên cha", aliases: ["ho ten cha", "ten cha", "cha"], example: "Nguyễn Văn Bình" },
  { key: "fatherPhone", title: "SĐT cha", aliases: ["sdt cha", "dien thoai cha"], example: "0903 111 222" },
  { key: "motherName", title: "Họ tên mẹ", aliases: ["ho ten me", "ten me", "me"], example: "Trần Thị Lan" },
  { key: "motherPhone", title: "SĐT mẹ", aliases: ["sdt me", "dien thoai me"], example: "0903 333 444" },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type ImportRowInput = Partial<Record<ImportKey, string>>;

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

/** Tệp mẫu .xlsx: dòng tiêu đề + 2 dòng ví dụ + trang hướng dẫn. */
export async function downloadImportTemplate() {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const head = IMPORT_COLUMNS.map((c) => ({ value: c.key === "fullName" ? `${c.title} *` : c.title, fontWeight: "bold" as const, backgroundColor: "#EDE9FE", align: "center" as const }));
  const ex = (n: number) => IMPORT_COLUMNS.map((c) => ({ value: n === 0 ? c.example : c.key === "fullName" ? "Trần Minh Đức" : c.key === "phone" ? "0987 654 321" : c.key === "email" ? "duc.tran@gmail.com" : c.key === "gender" ? "Nam" : c.key === "roomCode" ? "P.2" : "" , type: String }));
  const guide = [
    [{ value: "Hướng dẫn nhập thành viên hàng loạt", fontWeight: "bold" as const, fontSize: 14 }],
    [],
    [{ value: "• Chỉ cột “Họ và tên” là bắt buộc. Có thể xóa cột không dùng, nhưng giữ nguyên tên cột ở dòng tiêu đề." }],
    [{ value: "• Ngày nhập theo dạng DD/MM/YYYY (ví dụ 15/03/2005). Giới tính: Nam hoặc Nữ." }],
    [{ value: "• Số điện thoại có thể bỏ số 0 đầu (Excel hay làm mất). Mỗi số/email chỉ dùng cho một người — dòng trùng sẽ bị bỏ qua." }],
    [{ value: "• Tên trường phải trùng danh mục của lưu xá (hoặc gần giống); tên phòng theo sơ đồ nhà (ví dụ P.1). Không khớp ⇒ bỏ qua phần đó." }],
    [{ value: "• Tối đa 300 dòng mỗi lần. Thông tin Công giáo (tên thánh, giáo xứ…) KHÔNG nhập hàng loạt — thành viên tự đồng ý và điền sau." }],
    [{ value: "• Nhập xong, thành viên chưa có tài khoản đăng nhập: cấp riêng ở Cài đặt → Tài khoản." }],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(
    [
      { data: [head, ex(0), ex(1)], sheet: "Thanh vien", columns: IMPORT_COLUMNS.map((c) => ({ width: Math.max(16, c.title.length + 6) })) },
      { data: guide, sheet: "Huong dan", columns: [{ width: 120 }] },
    ]
  ).toFile("Mau_nhap_thanh_vien.xlsx");
}
