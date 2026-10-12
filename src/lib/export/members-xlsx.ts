// Xuất Excel danh sách thành viên (chạy ở trình duyệt, nạp động write-excel-file): Danh bạ (cột người xem được phép thấy) và Danh sách tạm trú (CCCD đầy đủ).
import type { Member } from "@/lib/types/members";
import type { ResidenceExportDto } from "@/lib/types/members-lifecycle";

type Cell = { value: string; type: StringConstructor; fontWeight?: "bold"; backgroundColor?: string; align?: "center" };
const head = (v: string) => ({ value: v, type: String, fontWeight: "bold" as const, backgroundColor: "#EDE9FE", align: "center" as const });
const cell = (v: string | null | undefined): Cell => ({ value: v ?? "", type: String });

async function write(file: string, sheet: string, widths: number[], rows: Cell[][]) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)([{ data: rows, sheet, columns: widths.map((width) => ({ width })) }]).toFile(file);
}

/**
 * Danh bạ thành viên đang ở: họ tên, tên gọi, phòng, SĐT (thành viên ẩn SĐT thì hiện "Đã ẩn" trừ khi người xuất có quyền xem — dữ liệu từ API đã lọc sẵn),
 * email liên hệ, trường / ngành / niên khóa. Chỉ có cột nào người xem được phép thấy (API trả sẵn theo quyền); cột trống cả danh sách thì bỏ.
 */
export async function exportMemberDirectory(members: Member[]) {
  const rows = members.filter((m) => m.status === "active" || m.status === "on_leave");
  const anyEmail = rows.some((m) => m.email);
  const anyStudy = rows.some((m) => m.university || m.major || m.academicYear);
  const anyHoly = rows.some((m) => m.holyName);
  const cols: { title: string; width: number; get: (m: Member) => string }[] = [
    { title: "STT", width: 6, get: () => "" },
    { title: "Họ và tên", width: 28, get: (m) => m.fullName },
    { title: "Tên gọi", width: 14, get: (m) => m.name },
    ...(anyHoly ? [{ title: "Tên Thánh", width: 16, get: (m: Member) => m.holyName ?? "" }] : []),
    { title: "Phòng", width: 10, get: (m) => m.room ?? "" },
    { title: "Số điện thoại", width: 16, get: (m) => m.phone || (m.hidePhone ? "Đã ẩn" : "") },
    ...(anyEmail ? [{ title: "Email liên hệ", width: 30, get: (m: Member) => m.email ?? "" }] : []),
    ...(anyStudy
      ? [
          { title: "Trường", width: 30, get: (m: Member) => m.university ?? "" },
          { title: "Ngành", width: 24, get: (m: Member) => m.major ?? "" },
          { title: "Niên khóa", width: 16, get: (m: Member) => m.academicYear ?? "" },
        ]
      : []),
    { title: "Chức vụ", width: 18, get: (m) => (m.role && m.role !== "Thành viên" ? m.role : "") },
  ];
  const data: Cell[][] = [
    cols.map((c) => head(c.title)),
    ...rows.map((m, i) => cols.map((c, j) => cell(j === 0 ? String(i + 1) : c.get(m)))),
  ];
  await write("Danh_ba_thanh_vien.xlsx", "Danh ba", cols.map((c) => c.width), data);
}

/** Danh sách tạm trú (khai báo với công an): họ tên, ngày sinh, quê / địa chỉ thường trú, CCCD đầy đủ, ngày vào ở, phòng + dòng ghi lý do xuất ở trang thứ hai. */
export async function exportResidenceList(dto: ResidenceExportDto) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const main: Cell[][] = [
    ["STT", "Họ và tên", "Ngày sinh", "Quê quán", "Địa chỉ thường trú", "Số CCCD", "Ngày vào ở", "Phòng"].map(head),
    ...dto.rows.map((r, i) => [String(i + 1), r.fullName, r.birthDate, r.hometown, r.homeAddress, r.nationalId, r.joinedOn, r.room].map(cell)),
  ];
  const when = new Date(dto.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const note: Cell[][] = [
    [head("Thông tin xuất")],
    [cell(`Thời điểm xuất: ${when}`)],
    [cell(`Lý do: ${dto.reason}`)],
    [cell(`Số thành viên: ${dto.rows.length} (chưa có CCCD: ${dto.missingNationalId})`)],
    [cell("Tệp chứa số CCCD đầy đủ — dữ liệu nhạy cảm, chỉ dùng đúng mục đích đã ghi và xóa sau khi dùng.")],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)([
    { data: main, sheet: "Tam tru", columns: [6, 28, 12, 28, 40, 18, 14, 10].map((width) => ({ width })) },
    { data: note, sheet: "Thong tin", columns: [90].map((width) => ({ width })) },
  ]).toFile("Danh_sach_tam_tru.xlsx");
}
