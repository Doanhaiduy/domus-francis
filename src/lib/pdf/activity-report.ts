"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import type { ActivityReportDto } from "@/lib/types/activity-report";
import { C, baseDoc, docTitle, doubleRule, downloadPdf, fileSlug, kpiRow, letterhead, money, num, plain, sectionBar, signatures, tableLayout, th } from "./core";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const pctText = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);
const delta = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Thanh tỉ lệ ngang vẽ bằng canvas (vector) — dùng cho tỉ lệ thu quỹ, chuyên cần, hoàn thành trực. */
function bar(pct: number | null, width: number, color: string): Content {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100 * width;
  return { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: 6, r: 3, color: C.line }, ...(w > 0 ? [{ type: "rect", x: 0, y: 0, w, h: 6, r: 3, color }] : [])], margin: [0, 3, 0, 0] } as Content;
}

const kv = (label: string, value: string, note?: string): TableCell[] => [
  { text: label, color: C.muted },
  { text: value, bold: true, alignment: "right" },
  { text: note ?? "", fontSize: 8, color: C.faint },
];

/** PDF "Báo cáo hoạt động quý/năm" (A4 dọc): nhân sự, tài chính, sự kiện & chuyên cần, trực nhật & hậu cần. Chỉ số liệu tổng hợp. */
export async function downloadActivityReportPdf(r: ActivityReportDto) {
  const W = 595 - 84;
  const m = r.members;
  const f = r.finance;
  const content: Content[] = [
    letterhead({ orderName: r.house.orderName, houseName: r.house.name, subtitle: r.house.address, rightTop: `BÁO CÁO ${r.kind === "year" ? "NĂM" : "QUÝ"}`, rightBottom: `Kỳ: ${dmy(r.from)} – ${dmy(r.to)}` }),
    doubleRule(W),
    docTitle(`Báo cáo hoạt động ${r.label}`, r.house.motto ? `“${r.house.motto}”` : `Cộng đoàn ${r.house.name}`),
  ];

  // ---- I. Nhân sự
  content.push(
    sectionBar("I. Nhân sự & đời sống huynh đệ"),
    kpiRow([
      { label: "SĨ SỐ CUỐI KỲ", value: `${m.endCount} người`, color: C.primaryDark, bg: C.tint, note: `Đầu kỳ ${m.startCount} (${delta(m.endCount - m.startCount)})` },
      { label: "VÀO NHÀ TRONG KỲ", value: String(m.joined), color: C.green, bg: C.greenBg },
      { label: "RA TRƯỜNG / CỰU", value: String(m.becameAlumni), color: C.amber, bg: C.amberBg },
      { label: "RỜI LƯU XÁ", value: String(m.left), color: C.red, bg: C.redBg },
    ]),
    { text: `Cơ cấu giới tính: ${m.male} nam · ${m.female} nữ.`, fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 4] },
  );
  if (m.byUniversity.length) {
    content.push({
      table: { widths: ["*", 70], body: [[th("Trường đại học (sĩ số cuối kỳ)"), th("Số người", "right")], ...m.byUniversity.map((u): TableCell[] => [{ text: plain(u.name) }, { text: String(u.count), alignment: "right", bold: true }])] },
      layout: tableLayout,
    });
  }

  // ---- II. Tài chính
  content.push(sectionBar("II. Tình hình tài chính quỹ chung"));
  if (!f) {
    content.push({ text: "Số liệu tài chính chỉ hiển thị với người có quyền xem thống kê quỹ.", italics: true, fontSize: 8.5, color: C.muted });
  } else {
    content.push(
      kpiRow([
        { label: "TỒN QUỸ CUỐI KỲ", value: money(f.closingVnd), color: C.primaryDark, bg: C.tint, note: `Đầu kỳ ${money(f.openingVnd)}` },
        { label: "TỔNG THU", value: money(f.incomeVnd), color: C.green, bg: C.greenBg },
        { label: "TỔNG CHI", value: money(f.expenseVnd), color: C.red, bg: C.redBg },
        { label: "CHÊNH LỆCH", value: money(f.incomeVnd - f.expenseVnd), color: f.incomeVnd >= f.expenseVnd ? C.green : C.red, bg: C.amberBg },
      ]),
      {
        margin: [0, 4, 0, 4],
        columns: [
          { width: 150, text: `Thu quỹ định kỳ: ${money(f.duesCollectedVnd)} / ${money(f.duesExpectedVnd)}`, fontSize: 8.5, color: C.muted },
          { width: "*", stack: [bar(f.collectionRatePct, W - 220, C.green)] },
          { width: 50, text: pctText(f.collectionRatePct), bold: true, alignment: "right" },
        ],
      },
    );
    if (f.expenseByCategory.length) {
      const totalExpense = f.expenseByCategory.reduce((a, x) => a + x.amountVnd, 0);
      content.push({
        table: {
          headerRows: 1,
          widths: ["*", 52, 90, 48],
          body: [
            [th("Chi theo hạng mục"), th("Số phiếu", "right"), th("Số tiền", "right"), th("Tỉ trọng", "right")],
            ...f.expenseByCategory.map((c): TableCell[] => [{ text: plain(c.name) }, { text: String(c.count), alignment: "right", color: C.muted }, { text: money(c.amountVnd), alignment: "right", bold: true }, { text: pctText(totalExpense ? Math.round((c.amountVnd / totalExpense) * 1000) / 10 : null), alignment: "right", color: C.muted }]),
          ],
        },
        layout: tableLayout,
      });
    }
  }

  // ---- III. Sự kiện & chuyên cần
  const e = r.events;
  const a = e.attendance;
  content.push(
    sectionBar("III. Sự kiện & chuyên cần"),
    kpiRow([
      { label: "SỰ KIỆN TRONG KỲ", value: String(e.total), color: C.primaryDark, bg: C.tint, note: `${e.completed} đã diễn ra` },
      { label: "ĐÃ HỦY", value: String(e.cancelled), color: C.red, bg: C.redBg },
      { label: "TỈ LỆ CÓ MẶT", value: pctText(a.ratePct), color: C.green, bg: C.greenBg, note: `${a.present + a.late} lượt có mặt` },
      { label: "VẮNG CÓ PHÉP", value: String(a.excused), color: C.amber, bg: C.amberBg, note: `${a.absent} vắng không phép` },
    ]),
  );
  if (e.byCategory.length) {
    content.push({
      table: { widths: ["*", 70], body: [[th("Loại sự kiện"), th("Số lượng", "right")], ...e.byCategory.map((c): TableCell[] => [{ text: plain(c.name) }, { text: String(c.count), alignment: "right", bold: true }])] },
      layout: tableLayout,
    });
  }

  // ---- IV. Trực nhật & hậu cần
  const d = r.duty;
  content.push(
    sectionBar("IV. Trực nhật & hậu cần"),
    {
      table: {
        widths: ["*", 90, "*"],
        body: [
          kv("Ca trực đã xếp", num(d.assignments)),
          kv("Ca trực hoàn thành (được duyệt)", num(d.approved), d.completionPct !== null ? `Tỉ lệ hoàn thành ${pctText(d.completionPct)}` : undefined),
          kv("Ca trực bỏ lỡ", num(d.missed)),
          kv("Ca trực có phép", num(d.excused)),
          kv("Báo hỏng mới", num(d.issuesOpened)),
          kv("Báo hỏng đã xử lý xong", num(d.issuesDone)),
        ],
      },
      layout: tableLayout,
    },
    signatures(
      [
        { title: "Người lập báo cáo", hint: "(Ký và ghi rõ họ tên)", name: "………………………" },
        { title: "Trưởng lưu xá", hint: "(Xác nhận số liệu)", name: "………………………" },
      ],
      { place: `Lập ngày ${dmy(r.generatedAt.slice(0, 10))}` },
    ),
    { text: "Báo cáo chỉ gồm số liệu tổng hợp, không có dữ liệu cá nhân. Kết xuất tự động từ hệ thống quản lý Lưu Xá Phanxicô.", alignment: "right", fontSize: 7.5, color: C.faint, margin: [0, 10, 0, 0] },
  );

  await downloadPdf(baseDoc({ runningTitle: `Báo cáo hoạt động · ${r.label}`, orgName: r.house.name }, content), `Bao_Cao_Hoat_Dong_${fileSlug(r.label)}`);
}
