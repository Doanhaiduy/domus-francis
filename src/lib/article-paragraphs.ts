// Tách bài viết (Markdown tối giản) thành các đoạn — dùng chung máy chủ + trình duyệt để "AI đề xuất chỗ chèn ảnh" và trình soạn
// hiểu CÙNG một cách đánh số đoạn (máy chủ chỉ trả số thứ tự đoạn, trình duyệt đổi lại thành vị trí trong văn bản).

export type ParaKind = "text" | "heading" | "image" | "quote" | "list" | "rule";

export interface Para {
  /** Số thứ tự (từ 0) của đoạn trong bài. */
  index: number;
  /** Vị trí bắt đầu / kết thúc (không gồm khoảng trắng thừa) trong chuỗi gốc — ảnh được chèn ngay SAU `end`. */
  start: number;
  end: number;
  text: string;
  kind: ParaKind;
}

const kindOf = (t: string): ParaKind => {
  if (/^#{1,3}\s/.test(t)) return "heading";
  if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(t)) return "image";
  if (/^>\s?/.test(t)) return "quote";
  if (/^(?:[-*]\s|\d+\.\s)/.test(t)) return "list";
  if (/^---+\s*$/.test(t)) return "rule";
  return "text";
};

/** Các khối cách nhau bằng dòng trống. Bỏ khối rỗng. */
export function splitParagraphs(content: string): Para[] {
  const out: Para[] = [];
  const push = (raw: string, offset: number) => {
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) return;
    const start = offset + lead;
    out.push({ index: out.length, start, end: start + text.length, text, kind: kindOf(text) });
  };
  let last = 0;
  for (const m of content.matchAll(/\n[ \t]*\n+/g)) {
    push(content.slice(last, m.index), last);
    last = m.index! + m[0].length;
  }
  push(content.slice(last), last);
  return out;
}

/** Đoạn văn thường đủ dài để minh họa và chưa có ảnh liền kề — ứng viên cho "AI đề xuất chỗ chèn ảnh". */
export function illustratableParagraphs(paras: Para[]): Para[] {
  return paras.filter((p, i) => {
    if (p.kind !== "text" || p.text.length < 60) return false;
    if (paras[i - 1]?.kind === "image" || paras[i + 1]?.kind === "image") return false;
    return true;
  });
}
