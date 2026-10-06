"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import type { HouseRuleSectionDto } from "@/lib/types/house-rules";
import { C, FONT, baseDoc, docTitle, doubleRule, downloadPdf, letterhead, plain, tableLayout } from "./core";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface HouseRulesPdfInput {
  houseName: string;
  orderName?: string | null;
  sections: HouseRuleSectionDto[];
  updatedAt: string | null;
  timetable: { time: string; text: string; section: string }[];
}

/** PDF "Luật nhà": đầu thư, bảng giờ giấc chung, từng mục đánh số điều khoản. */
export async function downloadHouseRulesPdf(p: HouseRulesPdfInput) {
  const W = 595 - 84;
  const clauses = p.sections.reduce((a, x) => a + x.items.length, 0);
  const content: Content[] = [
    letterhead({ orderName: p.orderName, houseName: p.houseName, rightTop: "NỘI QUY", rightBottom: p.updatedAt ? `Cập nhật ${fmtDate(p.updatedAt)}` : undefined }),
    doubleRule(W),
    docTitle("Luật nhà", `${p.sections.length} mục · ${clauses} điều khoản`),
  ];

  if (p.timetable.length) {
    const rows: TableCell[][] = [
      [{ text: "GIỜ GIẤC CHUNG TRONG NGÀY", colSpan: 2, font: FONT.semi, fontSize: 9, color: "#fff", characterSpacing: 0.5 }, {}],
      ...p.timetable.map((t): TableCell[] => [
        { text: t.time, font: FONT.heavy, color: C.primary, fontSize: 10, noWrap: true },
        { text: plain(t.text) },
      ]),
    ];
    content.push({
      margin: [0, 0, 0, 12],
      table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: [58, "*"], body: rows },
      layout: {
        ...tableLayout,
        fillColor: (row: number) => (row === 0 ? C.primary : row % 2 === 0 ? C.zebra : null),
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length ? 0.8 : i === 0 ? 0 : 0.4),
        paddingTop: (i: number) => (i === 0 ? 6 : 4),
        paddingBottom: (i: number) => (i === 0 ? 6 : 4),
      },
    });
  }

  p.sections.forEach((s, idx) => {
    const rows: TableCell[][] = [
      [
        {
          colSpan: 2,
          columns: [
            { text: ` MỤC ${idx + 1} `, width: 46, noWrap: true, font: FONT.heavy, fontSize: 8, color: "#fff", background: C.primary, margin: [0, 2, 0, 0] },
            { text: plain(s.title), width: "*", font: FONT.heavy, fontSize: 11.5, color: C.ink, margin: [6, 0, 0, 0] },
          ],
        },
        {},
      ],
      ...(s.description ? [[{ text: plain(s.description), colSpan: 2, italics: true, color: C.muted, fontSize: 9 }, {}] as TableCell[]] : []),
      ...s.items.map((it, i): TableCell[] => [
        { text: `${idx + 1}.${i + 1}`, bold: true, color: C.faint, fontSize: 9, noWrap: true },
        {
          text: [...(it.time ? [{ text: `[${it.time}] `, bold: true, color: C.primary }] : []), { text: plain(it.text) }],
        },
      ]),
    ];
    content.push({
      margin: [0, 0, 0, 10],
      table: { headerRows: s.description ? 2 : 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: [30, "*"], body: rows },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 ? 0 : i === 1 ? 1.6 : i === node.table.body.length ? 0 : 0.4),
        hLineColor: (i: number) => (i === 1 ? C.primary : C.line),
        vLineWidth: () => 0,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: (i: number) => (i === 0 ? 2 : 3.5),
        paddingBottom: (i: number) => (i === 0 ? 5 : 3.5),
      },
    });
  });

  content.push({
    margin: [0, 14, 0, 0],
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 0.6, lineColor: C.line }] },
      { text: "Mọi thành viên có trách nhiệm tuân thủ luật nhà.", alignment: "center", color: C.muted, margin: [0, 8, 0, 0], fontSize: 9 },
      { text: "Pax et Bonum — Bình An và Thiện Hảo", alignment: "center", italics: true, color: C.primary, margin: [0, 3, 0, 0], fontSize: 9 },
    ],
  });

  await downloadPdf(baseDoc({ runningTitle: "Luật nhà", orgName: p.houseName }, content), "Luat_Nha");
}
