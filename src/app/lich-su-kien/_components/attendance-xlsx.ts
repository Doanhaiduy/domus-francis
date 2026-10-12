"use client";

// Xuất điểm danh ra Excel (.xlsx) — chạy hoàn toàn trong trình duyệt (write-excel-file nạp động):
//   • một sự kiện: danh sách thành viên × trạng thái (có mặt / đi muộn / vắng có phép / vắng / chưa điểm danh), giờ, cách ghi, ghi chú;
//   • nhiều sự kiện trong khoảng ngày: trang "Tổng hợp" (thành viên × sự kiện + tổng), "Sự kiện" (thống kê từng buổi), "Chi tiết" (dạng dòng).
import { ATTENDANCE_LABEL, RSVP_LABEL } from "@/lib/events-format";
import type { AttendanceCell, AttendanceReportDto, AttendanceRosterDto, EventDto } from "@/lib/types/events";

type Cell = { value: string | number | null; [k: string]: unknown } | null;

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

const head = (value: string, color = "#EDE9FE"): Cell => ({ value, fontWeight: "bold", backgroundColor: color, align: "center", alignVertical: "center", wrap: true });
const txt = (value: string | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", type: String, ...extra });
const num = (value: number | null | undefined): Cell => (value === null || value === undefined ? { value: "—", align: "center" } : { value, type: Number, align: "right" });
const pct = (value: number | null | undefined): Cell => (value === null || value === undefined ? { value: "—", align: "center" } : { value: value / 100, type: Number, format: "0.0%", align: "right" });

const STATUS_COLOR: Record<string, string> = { present: "#D1FAE5", late: "#FEF3C7", excused: "#DBEAFE", absent: "#FEE2E2", none: "#F3F4F6" };
const METHOD_LABEL: Record<string, string> = { photo: "Ảnh", qr: "QR (cũ)", manual: "Ghi hộ", import: "Tự động", self: "Tự xác nhận" };
/** Ký hiệu ngắn trong bảng tổng hợp */
const CODE: Record<string, string> = { present: "✓", late: "M", excused: "P", absent: "V", none: "?" };

function statusCell(c: AttendanceCell, time?: string | null): Cell {
  if (c === null) return { value: "", backgroundColor: "#FAFAFA" };
  return { value: `${CODE[c]}${time && (c === "present" || c === "late") ? ` ${time}` : ""}`, align: "center", backgroundColor: STATUS_COLOR[c], type: String };
}

async function writer() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import("write-excel-file/browser")).default as any;
}

/** Điểm danh của MỘT sự kiện (danh sách đầy đủ — người điểm danh hộ / ban tổ chức / người xem toàn bộ điểm danh). */
export async function downloadEventAttendanceXlsx(ev: EventDto, roster: AttendanceRosterDto) {
  const write = await writer();
  const rows = roster.rows;
  const count = (s: string | null) => rows.filter((r) => (s === null ? !r.status : r.status === s)).length;
  const data: Cell[][] = [
    [{ value: `ĐIỂM DANH: ${ev.title.toUpperCase()}`, fontWeight: "bold", fontSize: 14 }],
    [txt(`${ev.category} · ${dmy(ev.dateIso)} · ${ev.startHm}–${ev.endHm}${ev.location ? ` · ${ev.location}` : ""}`)],
    [
      txt(
        `Có mặt ${count("present")} · Đi muộn ${count("late")} · Vắng có phép ${count("excused")} · Vắng ${count("absent")} · Chưa điểm danh ${count(null)} — tổng ${rows.length} người`
      ),
    ],
    [],
    ["STT", "Họ và tên", "Tên gọi", "Phòng", "Trạng thái", "Giờ điểm danh", "Cách ghi", "Phản hồi tham dự", "Ghi chú", "Người ghi"].map((h) => head(h)),
    ...rows.map((r, i) => [
      num(i + 1),
      txt(r.fullName),
      txt(r.name),
      txt(r.room ?? ""),
      { value: r.status ? ATTENDANCE_LABEL[r.status] : "Chưa điểm danh", backgroundColor: STATUS_COLOR[r.status ?? "none"], type: String },
      txt(r.time ?? "", { align: "center" }),
      txt(r.method ? METHOD_LABEL[r.method] ?? r.method : ""),
      txt(RSVP_LABEL[r.rsvp] ?? ""),
      txt(r.note ?? ""),
      txt(r.recordedBy ?? ""),
    ]),
  ];
  await write([{ data, sheet: "Diem danh", columns: [6, 26, 14, 8, 16, 12, 11, 15, 30, 16].map((width) => ({ width })) }]).toFile(
    `Diem_danh_${slug(ev.title)}_${ev.dateIso}.xlsx`
  );
}

/** Bảng điểm danh nhiều sự kiện (thành viên × sự kiện) trong khoảng ngày. */
export async function downloadAttendanceReportXlsx(r: AttendanceReportDto, house?: string | null) {
  const write = await writer();
  const ev = r.events;

  // ---- Tổng hợp: mỗi thành viên một dòng, mỗi sự kiện một cột ----
  const summary: Cell[][] = [
    [{ value: `BẢNG ĐIỂM DANH ${dmy(r.from)} – ${dmy(r.to)}`, fontWeight: "bold", fontSize: 14 }],
    [txt(`${house ? `${house} · ` : ""}${ev.length} sự kiện có điểm danh đã diễn ra · ${r.members.length} thành viên${r.scope === "organizer" ? " · chỉ các sự kiện bạn phụ trách" : ""}`)],
    [txt("Ký hiệu: ✓ có mặt (kèm giờ) · M đi muộn · P vắng có phép · V vắng không phép · ? chưa ghi nhận · ô trống: không thuộc đối tượng")],
    [],
    [
      head("Họ và tên"),
      head("Phòng"),
      ...ev.map((e) => head(`${dm(e.date)} ${e.startHm}\n${e.title}`, "#DBEAFE")),
      head("Có mặt", "#D1FAE5"),
      head("Đi muộn", "#FEF3C7"),
      head("Có phép", "#DBEAFE"),
      head("Vắng", "#FEE2E2"),
      head("Chưa ghi", "#F3F4F6"),
      head("Tỉ lệ có mặt", "#EDE9FE"),
    ],
    ...r.members.map((m) => [
      txt(m.fullName),
      txt(m.room ?? ""),
      ...m.cells.map((c, i) => statusCell(c, m.times[i])),
      num(m.totals.present),
      num(m.totals.late),
      num(m.totals.excused),
      num(m.totals.absent),
      num(m.totals.unrecorded),
      pct(m.totals.ratePct),
    ]),
  ];

  // ---- Sự kiện: thống kê từng buổi ----
  const events: Cell[][] = [
    ["Ngày", "Giờ", "Sự kiện", "Chủ đề", "Địa điểm", "Đối tượng", "Có mặt", "Đi muộn", "Có phép", "Vắng", "Chưa ghi", "Tỉ lệ có mặt"].map((h) => head(h)),
    ...ev.map((e) => [
      txt(dmy(e.date)),
      txt(`${e.startHm}–${e.endHm}`),
      txt(e.title),
      txt(e.category),
      txt(e.location),
      num(e.expected),
      num(e.present),
      num(e.late),
      num(e.excused),
      num(e.absent),
      num(e.unrecorded),
      pct(e.expected ? Math.round(((e.present + e.late) / e.expected) * 1000) / 10 : null),
    ]),
  ];

  // ---- Chi tiết: mỗi (thành viên, sự kiện) một dòng — tiện lọc/xoay bảng ----
  const detail: Cell[][] = [["Ngày", "Sự kiện", "Họ và tên", "Phòng", "Trạng thái", "Giờ điểm danh"].map((h) => head(h))];
  ev.forEach((e, i) => {
    for (const m of r.members) {
      const c = m.cells[i];
      if (c === null) continue;
      detail.push([
        txt(dmy(e.date)),
        txt(e.title),
        txt(m.fullName),
        txt(m.room ?? ""),
        { value: c === "none" ? "Chưa ghi nhận" : ATTENDANCE_LABEL[c], backgroundColor: STATUS_COLOR[c], type: String },
        txt(m.times[i] ?? "", { align: "center" }),
      ]);
    }
  });

  await write([
    { data: summary, sheet: "Tong hop", columns: [26, 8, ...ev.map(() => 13), 9, 9, 9, 8, 9, 12].map((width) => ({ width })), stickyRowsCount: 5, stickyColumnsCount: 1 },
    { data: events, sheet: "Su kien", columns: [12, 13, 36, 14, 22, 10, 9, 9, 9, 8, 9, 12].map((width) => ({ width })), stickyRowsCount: 1 },
    { data: detail, sheet: "Chi tiet", columns: [12, 36, 26, 8, 16, 12].map((width) => ({ width })), stickyRowsCount: 1 },
  ]).toFile(`Diem_danh_${r.from}_${r.to}.xlsx`);
}
