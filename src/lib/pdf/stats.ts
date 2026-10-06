"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import type { FinanceStatsDto, StatsGranularity } from "@/lib/types/finance";
import { C, FONT, baseDoc, docTitle, doubleRule, downloadPdf, fileSlug, kpiRow, letterhead, money, num, sectionBar, tableLayout, th } from "./core";

const GRAN_LABEL: Record<StatsGranularity, string> = { month: "theo tháng", quarter: "theo quý", year: "theo năm" };
const shortLabel = (g: StatsGranularity, key: string, label: string) =>
  g === "month" ? `T${Number(key.slice(5, 7))}/${key.slice(2, 4)}` : g === "quarter" ? label.replace("Quý ", "Q") : key;

/** Biểu đồ cột thu/chi theo kỳ, vẽ bằng canvas của PDF (vector). */
function barChart(stats: FinanceStatsDto, width: number): Content {
  const n = stats.periods.length;
  const H = 96;
  const max = Math.max(1, ...stats.periods.flatMap((p) => [p.incomeVnd, p.expenseVnd]));
  const colW = width / n;
  const bw = Math.max(3, Math.min(16, colW * 0.32));
  return {
    margin: [0, 2, 0, 2],
    stack: [
      {
        columns: [
          { canvas: [{ type: "rect", x: 0, y: 2, w: 8, h: 8, color: C.green }], width: 10 },
          { text: "Thu", fontSize: 8, color: C.muted, width: 26 },
          { canvas: [{ type: "rect", x: 0, y: 2, w: 8, h: 8, color: C.red }], width: 10 },
          { text: "Chi", fontSize: 8, color: C.muted, width: 26 },
          { text: `Cột cao nhất = ${money(max)}`, fontSize: 7.5, color: C.faint, alignment: "right" },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        columns: stats.periods.map((p) => {
          const hi = Math.round((p.incomeVnd / max) * H);
          const he = Math.round((p.expenseVnd / max) * H);
          const x0 = (colW - bw * 2 - 2) / 2;
          return {
            width: colW,
            stack: [
              {
                canvas: [
                  { type: "line", x1: 0, y1: H, x2: colW, y2: H, lineWidth: 0.5, lineColor: C.line },
                  ...(hi > 0 ? [{ type: "rect" as const, x: x0, y: H - hi, w: bw, h: hi, color: C.green }] : []),
                  ...(he > 0 ? [{ type: "rect" as const, x: x0 + bw + 2, y: H - he, w: bw, h: he, color: C.red }] : []),
                ],
              },
              { text: shortLabel(stats.granularity, p.key, p.label), alignment: "center", fontSize: n > 14 ? 6 : 7, color: C.muted, margin: [0, 3, 0, 0] },
            ],
          };
        }),
        columnGap: 0,
      },
    ],
  };
}

function shareTable(rows: { name: string; count?: number; amountVnd: number }[], total: number, color: string, w: number): Content {
  const barMax = 90;
  const body: TableCell[][] = [
    [th("Hạng mục"), th("Số tiền", "right"), th("Tỷ trọng", "right"), th("")],
    ...rows.map((r): TableCell[] => {
      const pct = total > 0 ? (r.amountVnd / total) * 100 : 0;
      return [
        { text: r.name + (r.count !== undefined ? `  (${r.count} phiếu)` : ""), fontSize: 8.5 },
        { text: num(r.amountVnd), alignment: "right", bold: true },
        { text: `${pct.toFixed(1)}%`, alignment: "right", color: C.muted },
        { canvas: [{ type: "rect", x: 0, y: 2, w: Math.max(1, (pct / 100) * barMax), h: 6, color }] },
      ];
    }),
  ];
  return { table: { headerRows: 1, widths: [w - 210, 72, 42, barMax], body }, layout: tableLayout };
}

/** PDF "Thống kê thu chi" (A4 ngang). */
export async function downloadStatsPdf(stats: FinanceStatsDto) {
  const W = 842 - 72;
  const first = stats.periods[0];
  const last = stats.periods[stats.periods.length - 1];
  const house = stats.houseName ?? "Lưu Xá Phanxicô";
  const gen = new Date(stats.generatedAt).toLocaleDateString("vi-VN");

  const periodRows: TableCell[][] = [
    [th("Kỳ"), th("Đầu kỳ", "right"), th("Thu", "right"), th("Chi", "right"), th("Chênh lệch", "right"), th("Cuối kỳ", "right"), th("Tỷ lệ thu quỹ", "right")],
    ...stats.periods.map((p): TableCell[] => [
      { text: p.label, bold: true },
      { text: num(p.openingVnd), alignment: "right", color: C.muted },
      { text: num(p.incomeVnd), alignment: "right", color: p.incomeVnd ? C.green : C.faint },
      { text: num(p.expenseVnd), alignment: "right", color: p.expenseVnd ? C.red : C.faint },
      { text: num(p.netVnd), alignment: "right", bold: true, color: p.netVnd < 0 ? C.red : p.netVnd > 0 ? C.green : C.faint },
      { text: num(p.closingVnd), alignment: "right", bold: true },
      { text: p.collectionRatePct === null ? "—" : `${p.collectionRatePct}%`, alignment: "right", color: C.muted },
    ]),
    [
      { text: "TỔNG CỘNG", bold: true, font: FONT.semi },
      { text: num(stats.totals.openingVnd), alignment: "right", font: FONT.semi },
      { text: num(stats.totals.incomeVnd), alignment: "right", font: FONT.semi, color: C.green },
      { text: num(stats.totals.expenseVnd), alignment: "right", font: FONT.semi, color: C.red },
      { text: num(stats.totals.netVnd), alignment: "right", font: FONT.semi, color: stats.totals.netVnd < 0 ? C.red : C.green },
      { text: num(stats.totals.closingVnd), alignment: "right", font: FONT.semi },
      { text: "" },
    ],
  ];

  const expenseTotal = stats.expenseByCategory.reduce((s, c) => s + c.amountVnd, 0);
  const incomeTotal = (stats.incomeByType ?? []).reduce((s, c) => s + c.amountVnd, 0);
  const halves: Content[] = [];
  if (stats.expenseByCategory.length) halves.push({ stack: [sectionBar("Chi theo hạng mục"), shareTable(stats.expenseByCategory, expenseTotal, C.red, W / 2 - 8)] });
  if (stats.incomeByType?.length) halves.push({ stack: [sectionBar("Thu theo loại khoản"), shareTable(stats.incomeByType.map((t) => ({ name: t.label, amountVnd: t.amountVnd })), incomeTotal, C.green, W / 2 - 8)] });

  const content: Content[] = [
    letterhead({ houseName: house, rightTop: "BÁO CÁO TÀI CHÍNH", rightBottom: `Xuất ngày ${gen}` }),
    doubleRule(W),
    docTitle("Thống kê thu chi", `${GRAN_LABEL[stats.granularity][0].toUpperCase()}${GRAN_LABEL[stats.granularity].slice(1)} · ${first.label} – ${last.label} · Đơn vị: đồng (VND)`),
    kpiRow([
      { label: "TỔNG THU", value: money(stats.totals.incomeVnd), color: C.green, bg: C.greenBg },
      { label: "TỔNG CHI", value: money(stats.totals.expenseVnd), color: C.red, bg: C.redBg },
      { label: "CHÊNH LỆCH THU − CHI", value: money(stats.totals.netVnd), color: stats.totals.netVnd < 0 ? C.red : C.green, bg: stats.totals.netVnd < 0 ? C.redBg : C.greenBg },
      { label: "SỐ DƯ CUỐI KỲ", value: money(stats.totals.closingVnd), color: C.primaryDark, bg: C.tint },
    ]),
    sectionBar("Biểu đồ thu – chi theo kỳ"),
    barChart(stats, W),
    sectionBar("Bảng số liệu theo kỳ"),
    { table: { headerRows: 1, dontBreakRows: true, widths: ["*", 86, 86, 86, 90, 90, 80], body: periodRows }, layout: tableLayout },
    ...(halves.length ? [{ columns: halves, columnGap: 16, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
    {
      margin: [0, 12, 0, 0],
      fontSize: 7.5,
      color: C.muted,
      text:
        "Ghi chú: thu/chi là số thuần (đã trừ bút toán đảo); chuyển quỹ nội bộ không tính là thu hay chi. Nguồn: sổ quỹ Lưu Xá." +
        (stats.totals.adjustmentVnd !== 0 ? ` Số dư cuối − đầu còn gồm ${money(stats.totals.adjustmentVnd)} “số dư đầu kỳ” nhập tay giữa các kỳ (không phải thu/chi).` : ""),
    },
  ];

  await downloadPdf(
    baseDoc({ runningTitle: `Thống kê thu chi · ${first.label} – ${last.label}`, orgName: house, landscape: true }, content),
    `Thong_ke_thu_chi_${stats.granularity}_${fileSlug(first.label)}_${fileSlug(last.label)}`,
  );
}
