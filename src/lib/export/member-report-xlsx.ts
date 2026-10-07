"use client";

// Xuất tổng kết theo thành viên ra Excel (.xlsx): trang "Tổng quan" (số liệu cả nhà), "Thành viên" (mỗi người một dòng),
// và — nếu người xuất có quyền — "Vi phạm" và "Ủng hộ" liệt kê chi tiết. Chạy hoàn toàn trong trình duyệt.
import type { MemberReportDto } from "@/lib/types/member-report";
import { PHASE_LABEL, type DisciplinePhase } from "@/lib/types/discipline";
import { DONATION_METHOD_LABEL, type DonationMethod } from "@/lib/types/donations";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

type Cell = { value: string | number | null; [k: string]: unknown } | null;
const head = (value: string, color = "#EDE9FE"): Cell => ({ value, fontWeight: "bold", backgroundColor: color, align: "center", alignVertical: "center", wrap: true, bottomBorderStyle: "thin" });
const txt = (value: string | null | undefined): Cell => ({ value: value ?? "", type: String });
const n = (value: number | null | undefined): Cell => (value === null || value === undefined ? { value: "—", align: "center" } : { value, type: Number, align: "right" });
const money = (value: number | null | undefined): Cell => (value === null || value === undefined ? { value: "—", align: "center" } : { value, type: Number, format: "#,##0", align: "right" });
const pct = (value: number | null | undefined): Cell => (value === null || value === undefined ? { value: "—", align: "center" } : { value: value / 100, type: Number, format: "0.0%", align: "right" });

export async function downloadMemberReportXlsx(r: MemberReportDto) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const s = r.sections;
  const t = r.house_totals;

  // ---------------- Tổng quan ----------------
  const kv = (k: string, v: Cell): Cell[] => [{ value: k, fontWeight: "bold" }, v];
  const band = (title: string): Cell[] => [{ value: title, fontWeight: "bold", backgroundColor: "#EDE9FE", columnSpan: 2 }, null];
  const overview: Cell[][] = [
    [{ value: `TỔNG KẾT ${r.label.toUpperCase()}`, fontWeight: "bold", fontSize: 14 }, null],
    [{ value: `${r.house.name}${r.house.orderName ? ` — ${r.house.orderName}` : ""}` }, null],
    [{ value: `Kỳ: ${dmy(r.from)} – ${dmy(r.to)} · ${r.scope === "me" ? "Của riêng bạn" : `${t.memberCount} thành viên`}` }, null],
    [],
    band("Sự kiện & sinh hoạt"),
    kv("Số sự kiện (không tính đã hủy)", n(t.events.total)),
    kv("Đã diễn ra", n(t.events.completed)),
    kv("Đã hủy", n(t.events.cancelled)),
    kv("Hành hương", n(t.events.pilgrimages)),
    kv("Lần chuỗi & kinh nguyện chung", n(t.events.rosary)),
    ...t.events.byCategory.map((c) => kv(`  • ${c.name}`, n(c.count))),
  ];
  if (t.attendance) {
    overview.push([], band("Điểm danh"));
    overview.push(kv("Lượt có mặt", n(t.attendance.present)), kv("Lượt đi trễ", n(t.attendance.late)), kv("Vắng có phép", n(t.attendance.excused)), kv("Vắng không phép", n(t.attendance.absent)), kv("Tỉ lệ có mặt", pct(t.attendance.ratePct)));
  }
  if (t.leave) {
    overview.push([], band("Xin phép"));
    overview.push(kv("Tổng số đơn", n(t.leave.total)), kv("Đã duyệt", n(t.leave.approved)), kv("Về muộn", n(t.leave.lateReturn)), kv("Ngủ ngoài", n(t.leave.overnightOut)), kv("Tạm vắng nhiều ngày", n(t.leave.longLeave)), kv("Vắng sự kiện", n(t.leave.eventAbsence)));
  }
  if (t.duty) overview.push([], band("Trực vệ sinh sân nhà"), kv("Số lượt người trực", n(t.duty.weeks)), kv("Điểm trung bình (0–10)", n(t.duty.avgScore)));
  if (t.merit) overview.push([], band("Điểm thi đua"), kv("Tổng điểm cộng/trừ trong kỳ", n(t.merit.points)));
  if (t.discipline) {
    overview.push([], band("Vi phạm & kỷ luật"));
    overview.push(kv("Số ghi nhận vi phạm", n(t.discipline.count)), kv("Số người bị ghi nhận", n(t.discipline.people)), kv("Đang xử lý", n(t.discipline.active)), kv("Quá hạn chưa xong", n(t.discipline.overdue)), kv("Đã hoàn thành", n(t.discipline.completed)), kv("Được miễn", n(t.discipline.waived)), kv("Tổng lần chuỗi", n(t.discipline.rosary)), kv("Tổng ngày đi lễ", n(t.discipline.mass)), kv("Tổng ca trực nhật phạt", n(t.discipline.duty)), kv("Hình phạt khác", n(t.discipline.other)));
  }
  if (t.finance) {
    overview.push([], band("Đóng quỹ (khoản đến hạn trong kỳ)"));
    overview.push(kv("Phải thu", money(t.finance.dueVnd)), kv("Đã đóng", money(t.finance.paidVnd)), kv("Còn nợ", money(t.finance.owedVnd)), kv("Trong đó quá hạn", money(t.finance.overdueVnd)), kv("Số khoản chưa đóng", n(t.finance.unpaidCount)));
  }
  if (t.donations) {
    overview.push([], band("Ủng hộ quỹ (đã nhận)"));
    overview.push(kv("Số khoản", n(t.donations.count)), kv("Tổng tiền", money(t.donations.totalVnd)), kv("Số người ủng hộ", n(t.donations.donors)), kv("Trong đó thành viên trong nhà", n(t.donations.memberDonors)), kv("Đang chờ xác nhận", n(t.donations.pendingCount)));
  }

  // ---------------- Thành viên ----------------
  type Col = { group: string; color: string; title: string; width: number; get: (m: MemberReportDto["members"][number]) => Cell };
  const cols: Col[] = [
    { group: "", color: "#EDE9FE", title: "Họ và tên", width: 26, get: (m) => txt(m.fullName) },
    { group: "", color: "#EDE9FE", title: "Phòng", width: 8, get: (m) => txt(m.room) },
  ];
  const add = (on: boolean, group: string, color: string, defs: [string, number, Col["get"]][]) => {
    if (on) for (const [title, width, get] of defs) cols.push({ group, color, title, width, get });
  };
  add(s.attendance, "ĐIỂM DANH", "#DBEAFE", [
    ["Có mặt", 9, (m) => n(m.attendance?.present)],
    ["Đi trễ", 9, (m) => n(m.attendance?.late)],
    ["Vắng có phép", 11, (m) => n(m.attendance?.excused)],
    ["Vắng không phép", 12, (m) => n(m.attendance?.absent)],
    ["Tỉ lệ có mặt", 11, (m) => pct(m.attendance?.ratePct)],
  ]);
  add(s.leave, "XIN PHÉP", "#FEF3C7", [
    ["Tổng đơn", 9, (m) => n(m.leave?.total)],
    ["Đã duyệt", 9, (m) => n(m.leave?.approved)],
    ["Về muộn", 9, (m) => n(m.leave?.lateReturn)],
    ["Ngủ ngoài", 9, (m) => n(m.leave?.overnightOut)],
    ["Tạm vắng dài", 11, (m) => n(m.leave?.longLeave)],
    ["Vắng sự kiện", 11, (m) => n(m.leave?.eventAbsence)],
  ]);
  add(s.duty, "TRỰC NHẬT", "#D1FAE5", [
    ["Số tuần trực", 11, (m) => n(m.duty?.weeks)],
    ["Điểm TB (0–10)", 12, (m) => n(m.duty?.avgScore)],
    ["Phải trực lại", 11, (m) => n(m.duty?.redo)],
  ]);
  add(s.merit, "THI ĐUA", "#FCE7F3", [["Điểm cộng/trừ", 13, (m) => n(m.merit?.points)]]);
  add(s.discipline, "VI PHẠM & KỶ LUẬT", "#FEE2E2", [
    ["Số lần", 8, (m) => n(m.discipline?.count)],
    ["Đang xử lý", 10, (m) => n(m.discipline?.active)],
    ["Quá hạn", 9, (m) => n(m.discipline?.overdue)],
    ["Đã xong", 9, (m) => n(m.discipline?.completed)],
    ["Được miễn", 9, (m) => n(m.discipline?.waived)],
    ["Lần chuỗi", 9, (m) => n(m.discipline?.rosary)],
    ["Ngày đi lễ", 10, (m) => n(m.discipline?.mass)],
    ["Ca trực nhật", 11, (m) => n(m.discipline?.duty)],
    ["Phạt khác", 9, (m) => n(m.discipline?.other)],
  ]);
  add(s.finance, "ĐÓNG QUỸ", "#E0E7FF", [
    ["Phải thu", 13, (m) => money(m.finance?.dueVnd)],
    ["Đã đóng", 13, (m) => money(m.finance?.paidVnd)],
    ["Còn nợ", 13, (m) => money(m.finance?.owedVnd)],
    ["Quá hạn", 13, (m) => money(m.finance?.overdueVnd)],
  ]);
  add(s.donations, "ỦNG HỘ", "#FFEDD5", [
    ["Số lần", 8, (m) => n(m.donations?.count)],
    ["Tổng tiền", 13, (m) => money(m.donations?.totalVnd)],
  ]);
  add(s.academic, "HỌC TẬP (nếu đã chia sẻ)", "#CFFAFE", [
    ["Học kỳ", 16, (m) => txt(m.academic?.semester)],
    ["GPA hệ 10", 10, (m) => n(m.academic?.gpa10)],
    ["GPA hệ 4", 10, (m) => n(m.academic?.gpa4)],
  ]);

  const bandRow: Cell[] = [];
  for (let i = 0; i < cols.length; ) {
    const g = cols[i].group;
    let j = i;
    while (j < cols.length && cols[j].group === g) j++;
    bandRow.push({ value: g, fontWeight: "bold", backgroundColor: cols[i].color, align: "center", columnSpan: j - i });
    for (let k = i + 1; k < j; k++) bandRow.push(null);
    i = j;
  }
  const headRow = cols.map((c) => head(c.title, c.color));
  const body = r.members.map((m) => cols.map((c) => c.get(m)));

  const sheets: unknown[] = [
    { data: overview, sheet: "Tong quan", columns: [{ width: 46 }, { width: 20 }] },
    { data: [bandRow, headRow, ...body], sheet: "Thanh vien", columns: cols.map((c) => ({ width: c.width })), stickyRowsCount: 2, stickyColumnsCount: 1 },
  ];
  if (r.details.discipline) {
    const rows = r.details.discipline.map((d): Cell[] => [txt(d.memberName), txt(dmy(d.occurredOn)), txt(d.ruleTitle), txt(d.penalty), txt(d.startsOn ? dmy(d.startsOn) : ""), txt(d.endsOn ? dmy(d.endsOn) : ""), txt(PHASE_LABEL[d.status as DisciplinePhase] ?? d.status)]);
    sheets.push({ data: [["Thành viên", "Ngày vi phạm", "Điều luật", "Hình phạt", "Bắt đầu", "Kết thúc", "Tình trạng"].map((h) => head(h, "#FEE2E2")), ...rows], sheet: "Vi pham", columns: [{ width: 26 }, { width: 14 }, { width: 44 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 18 }], stickyRowsCount: 1 });
  }
  if (r.details.donations) {
    const rows = r.details.donations.map((d): Cell[] => [txt(d.donorName), txt(d.isMember ? "Thành viên" : "Người ngoài"), txt(dmy(d.donatedOn)), money(d.amountVnd), txt(DONATION_METHOD_LABEL[d.method as DonationMethod] ?? d.method), txt(d.fundName)]);
    sheets.push({ data: [["Người ủng hộ", "Loại", "Ngày", "Số tiền (đ)", "Hình thức", "Vào quỹ"].map((h) => head(h, "#FFEDD5")), ...rows], sheet: "Ung ho", columns: [{ width: 30 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 24 }], stickyRowsCount: 1 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`Tong_ket_${slug(r.label)}${r.scope === "me" ? "_ca_nhan" : ""}.xlsx`);
}
