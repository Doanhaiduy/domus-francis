// Tách bài viết (Markdown tối giản) thành các đoạn — dùng chung máy chủ + trình duyệt để "AI đề xuất chỗ chèn ảnh", nút "Vẽ cho đoạn đang chọn"
// và trình soạn hiểu CÙNG một cách đánh số/định vị đoạn (máy chủ chỉ trả số thứ tự đoạn, trình duyệt đổi lại thành vị trí trong văn bản).

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

/**
 * Mỗi DÒNG có chữ là một đoạn — người soạn hay xuống dòng một lần giữa hai đoạn (không chừa dòng trống), trình hiển thị cũng coi mỗi dòng là một khối.
 * Các dòng liền nhau cùng là danh sách ("- ", "1. ") hoặc cùng là trích dẫn ("> ") được gộp thành MỘT khối để ảnh không chen vào giữa danh sách.
 */
export function splitParagraphs(content: string): Para[] {
  const out: Para[] = [];
  let cur: { start: number; end: number; kind: ParaKind } | null = null;
  const flush = () => {
    if (!cur) return;
    out.push({ index: out.length, start: cur.start, end: cur.end, text: content.slice(cur.start, cur.end), kind: cur.kind });
    cur = null;
  };
  let offset = 0;
  for (const rawLine of content.split("\n")) {
    const lineStart = offset;
    offset += rawLine.length + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const start = lineStart + (rawLine.length - rawLine.trimStart().length);
    const end = start + trimmed.length;
    const kind = kindOf(trimmed);
    if (cur && cur.kind === kind && (kind === "list" || kind === "quote")) {
      cur.end = end;
      continue;
    }
    flush();
    cur = { start, end, kind };
  }
  flush();
  return out;
}

/** Đoạn chứa vị trí `pos` (con trỏ / cuối vùng bôi đen); đang ở khoảng trống giữa hai đoạn thì lấy đoạn ngay phía trên. */
export function paragraphAt(paras: Para[], pos: number): Para | null {
  if (!paras.length) return null;
  let best: Para | null = null;
  for (const p of paras) {
    if (p.start <= pos) best = p;
    else break;
  }
  return best ?? paras[0];
}

/** Đoạn văn thường đủ dài để minh họa và chưa có ảnh liền kề — ứng viên cho "AI đề xuất chỗ chèn ảnh". */
export function illustratableParagraphs(paras: Para[]): Para[] {
  return paras.filter((p, i) => {
    if (p.kind !== "text" || p.text.length < 60) return false;
    if (paras[i - 1]?.kind === "image" || paras[i + 1]?.kind === "image") return false;
    return true;
  });
}
