"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import type { MemberReportDto, MemberReportRow } from "@/lib/types/member-report";
import { C, baseDoc, docTitle, doubleRule, downloadPdf, fileSlug, kpiRow, letterhead, money, num, sectionBar, signatures, tableLayout, th } from "./core";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const pctText = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`);
const dash = (v: number | string | null | undefined) => (v === null || v === undefined ? "—" : String(v));

const fmtPenalty = (d: NonNullable<MemberReportRow["discipline"]>) => {
  const parts = [d.rosary ? `${d.rosary} chuỗi` : "", d.mass ? `${d.mass} ngày lễ` : "", d.duty ? `${d.duty} ca trực` : "", d.other ? `${d.other} khác` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
};

/** PDF tổng kết theo thành viên: cả nhà = khổ NGANG (bảng mỗi người một dòng); cá nhân = khổ dọc, một trang. */
export async function downloadMemberReportPdf(r: MemberReportDto) {
  return r.scope === "me" ? personalPdf(r) : houseLandscapePdf(r);
}

// ---------------------------------------------------------------------
// Cả nhà (A4 ngang)
// ---------------------------------------------------------------------
async function houseLandscapePdf(r: MemberReportDto) {
  const W = 842 - 72;
  const s = r.sections;
  const t = r.house_totals;
  const content: Content[] = [
    letterhead({ orderName: r.house.orderName, houseName: r.house.name, subtitle: r.house.address, rightTop: "TỔNG KẾT THÀNH VIÊN", rightBottom: `Kỳ: ${dmy(r.from)} – ${dmy(r.to)}` }),
    doubleRule(W),
    docTitle(`Tổng kết ${r.label}`, `${t.memberCount} thành viên · lập ngày ${dmy(r.generatedAt.slice(0, 10))}`),
  ];

  // ---- Số liệu cả nhà
  const kpis = [
    { label: "SỰ KIỆN", value: String(t.events.total), color: C.primaryDark, bg: C.tint, note: `${t.events.completed} đã diễn ra · ${t.events.cancelled} hủy` },
    { label: "HÀNH HƯƠNG · LẦN CHUỖI", value: `${t.events.pilgrimages} · ${t.events.rosary}`, color: C.primaryDark, bg: C.tint, note: "số buổi trong kỳ" },
    ...(t.attendance ? [{ label: "TỈ LỆ CÓ MẶT", value: pctText(t.attendance.ratePct), color: C.green, bg: C.greenBg, note: `${num(t.attendance.records)} lượt điểm danh` }] : []),
    ...(t.leave ? [{ label: "ĐƠN XIN PHÉP", value: String(t.leave.total), color: C.amber, bg: C.amberBg, note: `${t.leave.lateReturn} về muộn · ${t.leave.overnightOut} ngủ ngoài` }] : []),
  ];
  content.push(sectionBar("I. Số liệu cả nhà"), kpiRow(kpis));
  const kpis2 = [
    ...(t.discipline ? [{ label: "VI PHẠM", value: `${t.discipline.count} (${t.discipline.people} người)`, color: C.red, bg: C.redBg, note: `${t.discipline.rosary} chuỗi · ${t.discipline.mass} ngày lễ · ${t.discipline.duty} ca trực` }] : []),
    ...(t.finance ? [{ label: "ĐÓNG QUỸ", value: money(t.finance.paidVnd), color: C.green, bg: C.greenBg, note: `Còn nợ ${money(t.finance.owedVnd)}${t.finance.overdueVnd ? ` (quá hạn ${money(t.finance.overdueVnd)})` : ""}` }] : []),
    ...(t.donations ? [{ label: "ỦNG HỘ ĐÃ NHẬN", value: money(t.donations.totalVnd), color: C.primaryDark, bg: C.tint, note: `${t.donations.donors} người (${t.donations.memberDonors} trong nhà) · ${t.donations.count} khoản` }] : []),
    ...(t.duty ? [{ label: "TRỰC VỆ SINH", value: `${t.duty.weeks} lượt`, color: C.amber, bg: C.amberBg, note: `Điểm TB ${dash(t.duty.avgScore)}/10` }] : []),
  ];
  if (kpis2.length) content.push(kpiRow(kpis2));
  if (t.events.byCategory.length) {
    content.push({ text: `Sự kiện theo loại: ${t.events.byCategory.map((c) => `${c.name} (${c.count})`).join(" · ")}`, fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 0] });
  }

  // ---- Bảng từng thành viên
  const heads: { title: string; width: number | string; align: "left" | "right" | "center"; cell: (m: MemberReportRow) => string }[] = [
    { title: "Thành viên", width: "*", align: "left", cell: (m) => `${m.fullName}${m.room ? `  (P.${m.room})` : ""}` },
  ];
  if (s.attendance) heads.push({ title: "Có mặt / trễ / vắng KP / có phép", width: 96, align: "center", cell: (m) => (m.attendance ? `${m.attendance.present} / ${m.attendance.late} / ${m.attendance.absent} / ${m.attendance.excused}` : "—") });
  if (s.leave) heads.push({ title: "Xin phép (về muộn · ngủ ngoài · khác)", width: 100, align: "center", cell: (m) => (m.leave ? `${m.leave.total} (${m.leave.lateReturn} · ${m.leave.overnightOut} · ${m.leave.total - m.leave.lateReturn - m.leave.overnightOut})` : "—") });
  if (s.duty) heads.push({ title: "Trực (tuần · điểm TB)", width: 64, align: "center", cell: (m) => (m.duty ? `${m.duty.weeks} · ${dash(m.duty.avgScore)}` : "—") });
  if (s.merit) heads.push({ title: "Điểm thi đua", width: 42, align: "right", cell: (m) => (m.merit ? (m.merit.points > 0 ? `+${m.merit.points}` : String(m.merit.points)) : "—") });
  if (s.discipline) heads.push({ title: "Vi phạm (số · hình phạt)", width: 110, align: "left", cell: (m) => (m.discipline ? (m.discipline.count ? `${m.discipline.count} · ${fmtPenalty(m.discipline)}` : "0") : "—") });
  if (s.finance) heads.push({ title: "Còn nợ quỹ", width: 62, align: "right", cell: (m) => (m.finance ? (m.finance.owedVnd ? money(m.finance.owedVnd) : "—") : "—") });
  if (s.donations) heads.push({ title: "Ủng hộ", width: 62, align: "right", cell: (m) => (m.donations && m.donations.totalVnd ? money(m.donations.totalVnd) : "—") });
  if (s.academic) heads.push({ title: "GPA", width: 34, align: "center", cell: (m) => (m.academic?.gpa4 != null ? m.academic.gpa4.toFixed(2) : "—") });

  content.push(sectionBar("II. Từng thành viên"));
  const body: TableCell[][] = [heads.map((h) => th(h.title, h.align)), ...r.members.map((m) => heads.map((h): TableCell => ({ text: h.cell(m), alignment: h.align, fontSize: 8.5 })))];
  content.push({ table: { headerRows: 1, widths: heads.map((h) => h.width), body }, layout: tableLayout });
  if (!r.members.length) content.push({ text: "Không có thành viên nào trong kỳ này.", italics: true, color: C.muted, fontSize: 9 });

  const notes: string[] = [];
  if (s.attendance) notes.push("Điểm danh tính các sự kiện đã diễn ra trong kỳ (KP = không phép). Tỉ lệ có mặt = (có mặt + trễ) / (có mặt + trễ + vắng không phép).");
  if (s.academic) notes.push("GPA hệ 4 của học kỳ trong kỳ — chỉ hiện với thành viên đã đồng ý chia sẻ bảng điểm.");
  if (s.finance) notes.push("Còn nợ quỹ = các khoản đến hạn trong kỳ mà chưa đóng đủ.");
  content.push(
    ...notes.map((n): Content => ({ text: `• ${n}`, fontSize: 7.5, color: C.faint, margin: [0, 1, 0, 0] })),
    signatures(
      [
        { title: "Người lập", hint: "(Ký và ghi rõ họ tên)", name: "………………………" },
        { title: "Trưởng lưu xá", hint: "(Xác nhận số liệu)", name: "………………………" },
      ],
      { place: `Lập ngày ${dmy(r.generatedAt.slice(0, 10))}` },
    ),
    { text: "Tài liệu nội bộ — có thông tin cá nhân của thành viên, chỉ chia sẻ cho người có trách nhiệm.", alignment: "right", fontSize: 7.5, color: C.faint, margin: [0, 8, 0, 0] },
  );

  await downloadPdf(baseDoc({ runningTitle: `Tổng kết thành viên · ${r.label}`, orgName: r.house.name, landscape: true }, content), `Tong_Ket_Thanh_Vien_${fileSlug(r.label)}`);
}

// ---------------------------------------------------------------------
// Cá nhân (A4 dọc)
// ---------------------------------------------------------------------
async function personalPdf(r: MemberReportDto) {
  const W = 595 - 84;
  const m = r.members[0];
  const content: Content[] = [
    letterhead({ orderName: r.house.orderName, houseName: r.house.name, subtitle: r.house.address, rightTop: "TỔNG KẾT CÁ NHÂN", rightBottom: `Kỳ: ${dmy(r.from)} – ${dmy(r.to)}` }),
    doubleRule(W),
    docTitle(`Tổng kết ${r.label}`, m ? `${m.fullName}${m.room ? ` · Phòng ${m.room}` : ""}` : undefined),
  ];
  if (!m) {
    content.push({ text: "Chưa có số liệu cho kỳ này.", italics: true, color: C.muted });
  } else {
    const kv = (label: string, value: string): TableCell[] => [{ text: label, color: C.muted }, { text: value, bold: true, alignment: "right" }];
    const block = (title: string, rows: TableCell[][]): Content[] => [sectionBar(title), { table: { widths: ["*", 160], body: rows }, layout: tableLayout }];
    if (m.attendance) content.push(...block("Điểm danh sự kiện", [kv("Có mặt", String(m.attendance.present)), kv("Đi trễ", String(m.attendance.late)), kv("Vắng có phép", String(m.attendance.excused)), kv("Vắng không phép", String(m.attendance.absent)), kv("Tỉ lệ có mặt", pctText(m.attendance.ratePct))]));
    if (m.leave) content.push(...block("Xin phép", [kv("Tổng số đơn", String(m.leave.total)), kv("Đã duyệt", String(m.leave.approved)), kv("Về muộn", String(m.leave.lateReturn)), kv("Ngủ ngoài", String(m.leave.overnightOut)), kv("Tạm vắng nhiều ngày", String(m.leave.longLeave)), kv("Vắng sự kiện", String(m.leave.eventAbsence))]));
    if (m.duty) content.push(...block("Trực vệ sinh sân nhà", [kv("Số tuần trực", String(m.duty.weeks)), kv("Điểm trung bình (0–10)", dash(m.duty.avgScore)), kv("Tuần phải trực lại", String(m.duty.redo))]));
    if (m.merit) content.push(...block("Điểm thi đua", [kv("Điểm cộng/trừ trong kỳ", m.merit.points > 0 ? `+${m.merit.points}` : String(m.merit.points))]));
    if (m.discipline) content.push(...block("Vi phạm & kỷ luật", [kv("Số lần được ghi nhận", String(m.discipline.count)), kv("Đang chấp hành / chờ", String(m.discipline.active)), kv("Đã hoàn thành", String(m.discipline.completed)), kv("Được miễn", String(m.discipline.waived)), kv("Hình phạt", fmtPenalty(m.discipline))]));
    if (m.finance) content.push(...block("Đóng quỹ (khoản đến hạn trong kỳ)", [kv("Phải đóng", money(m.finance.dueVnd)), kv("Đã đóng", money(m.finance.paidVnd)), kv("Còn nợ", money(m.finance.owedVnd)), kv("Trong đó quá hạn", money(m.finance.overdueVnd))]));
    if (m.donations) content.push(...block("Ủng hộ quỹ nhà", [kv("Số lần đã ủng hộ", String(m.donations.count)), kv("Tổng số tiền", money(m.donations.totalVnd))]));
    if (m.academic) content.push(...block("Học tập", [kv("Học kỳ", m.academic.semester), kv("GPA hệ 10", dash(m.academic.gpa10)), kv("GPA hệ 4", dash(m.academic.gpa4))]));
  }
  content.push({ text: "Tài liệu cá nhân — chỉ dành cho riêng bạn. Kết xuất từ hệ thống quản lý Lưu Xá Phanxicô.", alignment: "right", fontSize: 7.5, color: C.faint, margin: [0, 12, 0, 0] });
  await downloadPdf(baseDoc({ runningTitle: `Tổng kết cá nhân · ${r.label}`, orgName: r.house.name }, content), `Tong_Ket_Ca_Nhan_${fileSlug(r.label)}`);
}
