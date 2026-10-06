"use client";

// Lõi tạo PDF VECTOR (chữ thật, chọn/tìm được, nhẹ) bằng pdfmake + font Be Vietnam Pro nhúng đầy đủ tiếng Việt.
// Thay cho cách cũ chụp ảnh màn hình (html2pdf). Mọi báo cáo dùng chung: bảng màu, khung đầu/cuối trang, bảng, tiêu đề mục.
import type { Content, ContentTable, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";

export const C = {
  primary: "#5f3add",
  primaryDark: "#3f23a8",
  tint: "#f3efff",
  tintLine: "#d9d0f7",
  ink: "#111827",
  text: "#1f2937",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  zebra: "#faf8ff",
  green: "#047857",
  greenBg: "#ecfdf5",
  red: "#be123c",
  redBg: "#fff1f2",
  amber: "#b45309",
  amberBg: "#fffbeb",
  sky: "#0369a1",
  skyBg: "#f0f9ff",
};

export const FONT = { body: "BeVietnam", semi: "BeVietnamSemi", heavy: "BeVietnamHeavy" } as const;

// ---------------------------------------------------------------------
// Nạp pdfmake + font (một lần)
// ---------------------------------------------------------------------
type PdfMakeLib = typeof import("pdfmake/build/pdfmake");
let libPromise: Promise<PdfMakeLib> | null = null;

async function loadLib(): Promise<PdfMakeLib> {
  if (!libPromise) {
    libPromise = (async () => {
      const mod = (await import("pdfmake/build/pdfmake")) as unknown as { default?: PdfMakeLib } & PdfMakeLib;
      const lib = (mod.default ?? mod) as PdfMakeLib;
      const base = `${window.location.origin}/fonts/pdf/BeVietnamPro-`;
      lib.addFonts({
        [FONT.body]: { normal: `${base}Regular.ttf`, bold: `${base}Bold.ttf`, italics: `${base}Italic.ttf`, bolditalics: `${base}SemiBoldItalic.ttf` },
        [FONT.semi]: { normal: `${base}SemiBold.ttf`, bold: `${base}Bold.ttf`, italics: `${base}SemiBoldItalic.ttf`, bolditalics: `${base}SemiBoldItalic.ttf` },
        [FONT.heavy]: { normal: `${base}ExtraBold.ttf`, bold: `${base}ExtraBold.ttf`, italics: `${base}SemiBoldItalic.ttf`, bolditalics: `${base}SemiBoldItalic.ttf` },
      });
      return lib;
    })().catch((e) => {
      libPromise = null;
      throw e;
    });
  }
  return libPromise;
}

/** Chuẩn hóa chữ cho font PDF: NFC, thay mũi tên (font không có) bằng dấu ›, bỏ emoji và ✓ ✗ ★. Không cắt khoảng trắng. */
function fixGlyphs(t: string): string {
  return t
    .normalize("NFC")
    .replace(/[→⟶]/g, "›")
    .replace(/←/g, "‹")
    .replace(/[↑↓]/g, "")
    .replace(/[✓✔✗✘]\s?/g, "")
    .replace(/[★☆]/g, "*")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]\s?/gu, "");
}

/** Duyệt toàn bộ nội dung tài liệu, làm sạch mọi trường `text` (và chuỗi trần trong mảng). */
function sanitizeNode(n: unknown): unknown {
  if (typeof n === "string") return fixGlyphs(n);
  if (Array.isArray(n)) return n.map(sanitizeNode);
  if (n && typeof n === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      // chỉ đi sâu vào object/mảng; chuỗi chỉ làm sạch khi là `text` (tránh đụng link, svg, dataURL, tên font…)
      if (k === "text") out[k] = sanitizeNode(v);
      else if (typeof v === "object" && v !== null) out[k] = sanitizeNode(v);
      else out[k] = v;
    }
    return out;
  }
  return n;
}

/** Tạo PDF từ định nghĩa tài liệu và tải về máy. */
export async function downloadPdf(rawDef: TDocumentDefinitions, filename: string): Promise<void> {
  const lib = await loadLib();
  const def: TDocumentDefinitions = { ...rawDef, content: sanitizeNode(rawDef.content) as TDocumentDefinitions["content"] };
  const blob = (await lib.createPdf(def).getBlob()) as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------
// Tiện ích định dạng
// ---------------------------------------------------------------------
export const money = (v: number) => `${Math.round(v).toLocaleString("vi-VN")} đ`;
export const num = (v: number) => Math.round(v).toLocaleString("vi-VN");

export const nowText = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Bỏ emoji/ký hiệu mà font PDF không có (tránh ô vuông). */
export const plain = (s: string) =>
  s
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    .normalize("NFC")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Tên tệp không dấu, không ký tự lạ. */
export const fileSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// ---------------------------------------------------------------------
// Bố cục chung
// ---------------------------------------------------------------------
/** Biểu tượng nhà thờ (thập giá) vẽ bằng SVG — không phụ thuộc font. */
const CROSS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="${C.primary}"/><rect x="17.5" y="8" width="5" height="24" rx="1.5" fill="#fff"/><rect x="10" y="14.5" width="20" height="5" rx="1.5" fill="#fff"/></svg>`;

export interface PageOptions {
  /** Tên ngắn hiển thị ở đầu mỗi trang (từ trang 2) */
  runningTitle: string;
  orgName: string;
  landscape?: boolean;
  /** Dòng nhỏ ở chân trang (bên trái) */
  footerNote?: string;
}

/** Khung tài liệu: A4, lề, đầu trang chạy (từ trang 2), chân trang có số trang, kiểu chữ mặc định. */
export function baseDoc(opts: PageOptions, content: Content[]): TDocumentDefinitions {
  const margins: [number, number, number, number] = opts.landscape ? [36, 52, 36, 48] : [42, 58, 42, 52];
  const innerW = (opts.landscape ? 842 : 595) - margins[0] - margins[2];
  return {
    pageSize: "A4",
    pageOrientation: opts.landscape ? "landscape" : "portrait",
    pageMargins: margins,
    info: { title: opts.runningTitle, author: opts.orgName, creator: "Hệ thống quản lý Lưu Xá Phanxicô", producer: "pdfmake" },
    defaultStyle: { font: FONT.body, fontSize: 9.5, color: C.text, lineHeight: 1.3 },
    header: (page: number) =>
      page === 1
        ? null
        : {
            margin: [margins[0], 22, margins[2], 0],
            stack: [
              {
                columns: [
                  { text: opts.orgName.toUpperCase(), fontSize: 7.5, bold: true, color: C.primary, characterSpacing: 0.6 },
                  { text: opts.runningTitle, fontSize: 7.5, color: C.muted, alignment: "right" },
                ],
              },
              { canvas: [{ type: "line", x1: 0, y1: 5, x2: innerW, y2: 5, lineWidth: 0.6, lineColor: C.tintLine }] },
            ],
          },
    footer: (page: number, pages: number) => ({
      margin: [margins[0], 14, margins[2], 0],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: innerW, y2: 0, lineWidth: 0.6, lineColor: C.line }] },
        {
          margin: [0, 5, 0, 0],
          columns: [
            { text: opts.footerNote ?? `Xuất từ hệ thống quản lý Lưu Xá Phanxicô · ${nowText()}`, fontSize: 7.5, color: C.faint },
            { text: `Trang ${page} / ${pages}`, fontSize: 7.5, color: C.muted, alignment: "right" },
          ],
        },
      ],
    }),
    styles: {
      h1: { font: FONT.heavy, fontSize: 19, color: C.ink, characterSpacing: 0.4 },
      h2: { font: FONT.heavy, fontSize: 12, color: C.ink },
      h3: { font: FONT.semi, fontSize: 10.5, color: C.ink },
      muted: { color: C.muted, fontSize: 8.5 },
      label: { color: C.muted, fontSize: 8 },
    },
    content,
  };
}

/** Đầu thư: logo + tên tổ chức/nhà (trái), mã mẫu/ngày lập (phải). */
export function letterhead(o: { orderName?: string | null; houseName: string; subtitle?: string | null; rightTop?: string; rightBottom?: string }): Content {
  return {
    columns: [
      { width: 50, stack: [{ svg: CROSS_SVG }] },
      {
        width: "*",
        stack: [
          ...(o.orderName ? [{ text: o.orderName.toUpperCase(), fontSize: 7.5, bold: true, color: C.muted, characterSpacing: 0.5 }] : []),
          { text: o.houseName.toUpperCase(), font: FONT.heavy, fontSize: 11.5, color: C.ink, margin: [0, 1, 0, 0] },
          ...(o.subtitle ? [{ text: o.subtitle, italics: true, fontSize: 8, color: C.muted, margin: [0, 1, 0, 0] }] : []),
        ],
      },
      ...(o.rightTop || o.rightBottom
        ? [{ width: "auto", alignment: "right" as const, stack: [{ text: o.rightTop ?? "", bold: true, fontSize: 8.5, color: C.primary }, { text: o.rightBottom ?? "", fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] as [number, number, number, number] }] }]
        : []),
    ],
    columnGap: 0,
  } as unknown as Content;
}

/** Đường kẻ đôi dưới đầu thư. */
export const doubleRule = (width: number): Content => ({
  margin: [0, 8, 0, 10],
  canvas: [
    { type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 2.2, lineColor: C.primary },
    { type: "line", x1: 0, y1: 4, x2: width, y2: 4, lineWidth: 0.6, lineColor: C.primary },
  ],
});

/** Tiêu đề lớn của tài liệu (căn giữa) + dòng phụ. */
export function docTitle(title: string, sub?: string | Content): Content {
  return {
    margin: [0, 2, 0, 10],
    stack: [
      { text: title.toUpperCase(), style: "h1", alignment: "center" },
      ...(sub ? [typeof sub === "string" ? { text: sub, alignment: "center" as const, italics: true, color: C.muted, fontSize: 9, margin: [0, 3, 0, 0] as [number, number, number, number] } : sub] : []),
    ],
  };
}

/** Thanh tiêu đề mục: vạch tím bên trái + nền nhạt. */
export function sectionBar(text: string): Content {
  return {
    margin: [0, 12, 0, 6],
    table: { widths: ["*"], body: [[{ text: text.toUpperCase(), font: FONT.semi, fontSize: 9, color: C.ink, characterSpacing: 0.4, margin: [6, 4, 6, 4] }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => C.primary, fillColor: () => C.tint },
    unbreakable: true,
  } as ContentTable;
}

/** Bố cục bảng chuẩn: tiêu đề nền tím nhạt, kẻ ngang mảnh, so le dòng. */
export const tableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 0 ? C.tintLine : C.line),
  paddingLeft: () => 7,
  paddingRight: () => 7,
  paddingTop: () => 4.5,
  paddingBottom: () => 4.5,
  fillColor: (row: number, node: { table: { headerRows?: number } }) => {
    const h = node.table.headerRows ?? 0;
    if (row < h) return C.tint;
    return (row - h) % 2 === 1 ? C.zebra : null;
  },
};

export const th = (text: string, align: "left" | "right" | "center" = "left"): TableCell => ({ text, bold: true, font: FONT.semi, fontSize: 8.5, color: C.primaryDark, alignment: align });

/** Hộp chỉ số (KPI) — một hàng nhiều ô. */
export function kpiRow(items: { label: string; value: string; note?: string; color?: string; bg?: string }[]): Content {
  return {
    margin: [0, 4, 0, 4],
    table: {
      widths: items.map(() => "*"),
      body: [
        items.map((k) => ({
          stack: [
            { text: k.label, fontSize: 7.5, color: C.muted, bold: true },
            { text: k.value, font: FONT.heavy, fontSize: 13.5, color: k.color ?? C.ink, margin: [0, 3, 0, 0] },
            ...(k.note ? [{ text: k.note, fontSize: 7.5, color: k.color ?? C.muted, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
          ],
          fillColor: k.bg ?? C.tint,
          margin: [2, 3, 2, 3],
        })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 9,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  } as ContentTable;
}

/** Khối chữ ký nhiều cột. */
export function signatures(cols: { title: string; hint: string; name?: string | null }[], opts: { place?: string } = {}): Content {
  return {
    unbreakable: true,
    margin: [0, 14, 0, 0],
    stack: [
      ...(opts.place ? [{ text: opts.place, alignment: "right" as const, italics: true, fontSize: 8.5, color: C.muted, margin: [0, 0, 0, 8] as [number, number, number, number] }] : []),
      {
        columns: cols.map((c) => ({
          width: "*",
          alignment: "center" as const,
          stack: [
            { text: c.title.toUpperCase(), font: FONT.semi, fontSize: 8.5, color: C.ink },
            { text: c.hint, italics: true, fontSize: 7.5, color: C.faint, margin: [0, 2, 0, 0] },
            { text: c.name ?? "", font: FONT.semi, fontSize: 10, color: C.ink, margin: [0, 52, 0, 0] },
          ],
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------
// Markdown rút gọn → nội dung pdfmake (dùng cho Hướng dẫn)
// ---------------------------------------------------------------------
type Run = string | { text: string; [k: string]: unknown };

/** **đậm**, `mã`, [chữ](liên kết) → các đoạn chữ. */
export function inlineRuns(text: string, baseColor?: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true, color: C.ink });
    else if (t.startsWith("`")) out.push({ text: ` ${t.slice(1, -1)} `, background: "#f1f5f9", color: C.primaryDark, fontSize: 8.5 });
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const href = mm[2].startsWith("/") ? `${typeof window !== "undefined" ? window.location.origin : ""}${mm[2]}` : mm[2];
      out.push({ text: mm[1], color: C.primary, decoration: "underline", link: href });
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return baseColor ? out.map((r) => (typeof r === "string" ? { text: r, color: baseColor } : r)) : out;
}

export function markdownToPdf(source: string): Content[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Content[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("### ")) {
      out.push({ text: inlineRuns(line.slice(4)), style: "h3", margin: [0, 8, 0, 3] });
      i++;
    } else if (line.startsWith("## ")) {
      out.push({ text: inlineRuns(line.slice(3)), style: "h2", margin: [0, 10, 0, 4] });
      i++;
    } else if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      out.push({ text: inlineRuns(buf.join(" ")), margin: [0, 3, 0, 5] });
    } else if (/^- /.test(line)) {
      const items: Content[] = [];
      while (i < lines.length && (/^- /.test(lines[i]) || (/^\s{2,}- /.test(lines[i]) && items.length))) {
        if (/^- /.test(lines[i])) items.push({ text: inlineRuns(lines[i].slice(2)), margin: [0, 1, 0, 1] });
        else items.push({ ul: [{ text: inlineRuns(lines[i].replace(/^\s+- /, "")) }], margin: [0, 0, 0, 1] });
        i++;
      }
      out.push({ ul: items, markerColor: C.primary, margin: [0, 2, 0, 5] });
    } else if (/^\d+\. /.test(line)) {
      const items: Content[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push({ text: inlineRuns(lines[i++].replace(/^\d+\. /, "")), margin: [0, 1, 0, 1] });
      out.push({ ol: items, markerColor: C.primary, margin: [0, 2, 0, 5] });
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{2,3} |> |- |\d+\. )/.test(lines[i])) buf.push(lines[i++]);
      out.push({ text: inlineRuns(buf.join(" ")), margin: [0, 2, 0, 5] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Ảnh → dataURL JPEG/PNG (pdfkit không đọc được WebP)
// ---------------------------------------------------------------------
export async function imageToDataUrl(url: string, maxSide = 600): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
}

export type { TableCell, Content };
