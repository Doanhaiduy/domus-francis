"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import type { GuideBlock, GuideSection } from "@/content/guide";
import { GUIDE_AUDIENCE_LABEL, GUIDE_INTRO, GUIDE_ROLES } from "@/content/guide";
import { C, FONT, baseDoc, docTitle, doubleRule, downloadPdf, inlineRuns, letterhead, markdownToPdf, tableLayout, th } from "./core";

const TONE: Record<string, { color: string; bg: string; label: string }> = {
  tip: { color: C.green, bg: C.greenBg, label: "Mẹo" },
  info: { color: C.sky, bg: C.skyBg, label: "Lưu ý" },
  warn: { color: C.amber, bg: C.amberBg, label: "Chú ý" },
  danger: { color: C.red, bg: C.redBg, label: "Quan trọng" },
};

const crumbs = (items: string[], label?: string): Content => ({
  margin: [0, 1, 0, 3],
  fontSize: 8,
  text: [
    ...(label ? [{ text: `${label}: `, color: C.faint }] : []),
    ...items.flatMap((p, i) => [
      ...(i > 0 ? [{ text: "  ›  ", color: C.faint }] : []),
      { text: p, bold: true, color: i === items.length - 1 ? C.primary : C.muted },
    ]),
  ],
});

function stepNumber(n: number): Content {
  return {
    width: 20,
    stack: [
      { canvas: [{ type: "ellipse", x: 10, y: 8, r1: 8, r2: 8, color: C.primary }] },
      { text: String(n), alignment: "center", color: "#fff", bold: true, fontSize: 8, margin: [0, -12.5, 0, 0] },
    ],
  } as unknown as Content;
}

function renderBlocks(blocks: GuideBlock[], depth = 0): Content[] {
  const out: Content[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "md":
        out.push(...markdownToPdf(b.text));
        break;
      case "heading":
        out.push({ text: b.text, style: "h2", margin: [0, depth ? 6 : 12, 0, 4] });
        break;
      case "callout": {
        const t = TONE[b.tone];
        out.push({
          unbreakable: true,
          margin: [0, 4, 0, 6],
          table: {
            widths: ["*"],
            body: [[{ stack: [{ text: b.title ?? t.label, bold: true, color: t.color, fontSize: 9 }, { text: inlineRuns(b.text), margin: [0, 2, 0, 0], fontSize: 9 }], fillColor: t.bg, margin: [4, 2, 4, 2] }]],
          },
          layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2.5 : 0), vLineColor: () => t.color, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 4, paddingBottom: () => 4 },
        });
        break;
      }
      case "steps": {
        if (b.title) out.push({ text: b.title, style: "h3", margin: [0, 8, 0, 4] });
        b.items.forEach((s, i) => {
          out.push({
            unbreakable: true,
            margin: [0, 0, 0, 6],
            columns: [
              stepNumber(i + 1),
              {
                width: "*",
                margin: [6, 0, 0, 0],
                stack: [
                  { text: s.title, bold: true, color: C.ink, margin: [0, 1.5, 0, 0] },
                  ...(s.path ? [crumbs(s.path)] : []),
                  ...(s.text ? [{ text: inlineRuns(s.text), margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
                ],
              },
            ],
          } as unknown as Content);
        });
        break;
      }
      case "path":
        out.push(crumbs(b.items, b.label));
        break;
      case "cards": {
        const cols = b.cols ?? 2;
        for (let i = 0; i < b.items.length; i += cols) {
          const row = b.items.slice(i, i + cols);
          const cells: TableCell[] = row.map((c) => ({ stack: [{ text: c.title, bold: true, color: C.primaryDark }, { text: inlineRuns(c.text), fontSize: 8.5, margin: [0, 2, 0, 0] }], fillColor: C.tint, margin: [2, 2, 2, 2] }));
          while (cells.length < cols) cells.push({ text: "" });
          out.push({
            unbreakable: true,
            margin: [0, 2, 0, 2],
            table: { widths: Array(cols).fill("*"), body: [cells] },
            layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
          });
        }
        break;
      }
      case "demo":
        break; // minh họa chỉ có trên màn hình
      case "table":
        out.push({
          margin: [0, 4, 0, 8],
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: b.head.map((_, i) => (i === 0 && b.head.length > 2 ? "auto" : "*")),
            body: [b.head.map((h) => th(h)), ...b.rows.map((r) => r.map((c): TableCell => ({ text: inlineRuns(c), fontSize: 8.8 })))],
          },
          layout: tableLayout,
        });
        break;
      case "tabs":
        for (const t of b.tabs) {
          out.push({ text: t.label, font: FONT.semi, fontSize: 10, color: C.primaryDark, margin: [0, 8, 0, 3] });
          out.push(...renderBlocks(t.blocks, depth + 1));
        }
        break;
      case "accordion":
        b.items.forEach((it, i) => {
          out.push({ text: [{ text: `${i + 1}. `, color: C.primary }, it.title], style: "h3", margin: [0, 10, 0, 3] });
          out.push({ margin: [10, 0, 0, 0], stack: renderBlocks(it.blocks, depth + 1) });
        });
        break;
    }
  }
  return out;
}

/** PDF "Hướng dẫn sử dụng": bìa + mục lục có số trang + từng mục. */
export async function downloadGuidePdf(sections: GuideSection[], scopeLabel: string) {
  const W = 595 - 84;
  const gen = new Date().toLocaleDateString("vi-VN");
  const content: Content[] = [
    letterhead({ houseName: "Lưu Xá Sinh Viên Phanxicô Assisi", subtitle: "Ứng dụng quản lý sinh hoạt cộng đoàn", rightTop: "TÀI LIỆU HƯỚNG DẪN", rightBottom: `Phiên bản ${gen}` }),
    doubleRule(W),
    docTitle("Hướng dẫn sử dụng", `Dành cho: ${scopeLabel}`),
    { text: inlineRuns(GUIDE_INTRO), alignment: "center", color: C.muted, margin: [20, 0, 20, 12], fontSize: 9.5 },
    { text: "CÁC VAI TRÒ TRONG ỨNG DỤNG", style: "h3", margin: [0, 8, 0, 4], color: C.primaryDark },
    {
      table: { widths: [96, "*"], body: GUIDE_ROLES.map((r): TableCell[] => [{ text: r.title, bold: true, color: C.ink }, { text: r.text, fontSize: 8.8 }]), dontBreakRows: true },
      layout: { ...tableLayout, fillColor: (row: number) => (row % 2 === 0 ? C.zebra : null) },
    },
    {
      toc: { title: { text: "MỤC LỤC", style: "h3", color: C.primaryDark, margin: [0, 16, 0, 4] }, numberStyle: { bold: true, color: C.primary } },
    } as Content,
  ];

  sections.forEach((s, i) => {
    content.push({
      pageBreak: i === 0 ? "before" : undefined,
      margin: [0, i === 0 ? 0 : 20, 0, 6],
      unbreakable: true,
      stack: [
        {
          text: `${i + 1}. ${s.title}`,
          font: FONT.heavy,
          fontSize: 14,
          color: C.ink,
          tocItem: true,
          tocMargin: [0, 2, 0, 0],
        },
        {
          text: [
            ...s.audience.filter((a) => a !== "all").map((a) => ({ text: ` ${GUIDE_AUDIENCE_LABEL[a].toUpperCase()} `, fontSize: 6.5, bold: true, color: C.primaryDark, background: C.tint })).flatMap((r) => [r, "  "]),
            { text: s.summary, color: C.muted, fontSize: 9 },
          ],
          margin: [0, 3, 0, 0],
        },
        { canvas: [{ type: "line", x1: 0, y1: 6, x2: W, y2: 6, lineWidth: 1.2, lineColor: C.primary }] },
      ],
    } as Content);
    content.push(...renderBlocks(s.blocks));
  });

  await downloadPdf(baseDoc({ runningTitle: "Hướng dẫn sử dụng", orgName: "Lưu Xá Sinh Viên Phanxicô Assisi" }, content), "Huong_Dan_Su_Dung_Luu_Xa");
}
