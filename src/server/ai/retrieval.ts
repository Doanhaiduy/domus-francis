import "server-only";
import type { Tx } from "../db";
import { guideChunks } from "./knowledge";

// ---------------------------------------------------------------------
// Truy hồi cho trợ lý hỏi đáp (RAG, BR-AI-08): chỉ đọc nội dung mà CHÍNH NGƯỜI HỎI được phép xem — truy vấn chạy
// trong transaction của người đó nên RLS (đối tượng thông báo, trạng thái xuất bản…) áp dụng như bình thường.
// Không dùng vector: chấm điểm từ khóa không dấu trên các đoạn ngắn (đủ cho vài chục văn bản; xem Phần 8.2.8).
// ---------------------------------------------------------------------

export interface Chunk {
  label: string;
  kind: "policy" | "announcement" | "event" | "guide";
  title: string;
  text: string;
  score: number;
}

const STOP = new Set(["la", "va", "cua", "co", "khong", "the", "nao", "gi", "nay", "cho", "toi", "minh", "ban", "duoc", "o", "tai", "va", "voi", "mot", "cac", "nhung", "khi", "thi", "hay", "de", "ve", "den", "tu", "bao", "nhieu"]);

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const tokens = (s: string) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));

/** Cắt văn bản theo đoạn/mục thành các khối ≤ ~900 ký tự. */
function split(md: string, max = 900): string[] {
  const parts = md.split(/\n{2,}|(?=^#{1,4}\s)/m).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + p.length > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${p}` : p;
    while (cur.length > max * 1.5) {
      out.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) out.push(cur);
  return out;
}

const fmtVn = (d: Date) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(d);

export async function retrieve(tx: Tx, question: string, topK = 7, maxChars = 7500, extraQuery = ""): Promise<Chunk[]> {
  // extraQuery: câu hỏi trước đó trong cuộc trò chuyện — dùng cho câu hỏi nối tiếp ngắn ("còn trên iPhone thì sao?")
  const q = [...new Set(tokens(`${question} ${extraQuery}`))];
  if (!q.length) return [];

  const raw: Omit<Chunk, "label" | "score">[] = [];

  const docs = (
    await tx.query<{ title: string; content_md: string }>(
      "SELECT title, content_md FROM policy_documents WHERE is_current AND doc_kind IN ('house_rules','faq','procedure') ORDER BY title LIMIT 20",
    )
  ).rows;
  for (const d of docs) for (const c of split(d.content_md)) raw.push({ kind: "policy", title: d.title, text: c });

  const anns = (
    await tx.query<{ title: string; content: string }>(
      `SELECT title, content FROM announcements
        WHERE deleted_at IS NULL AND status = 'published' AND (expires_at IS NULL OR expires_at > now())
        ORDER BY published_at DESC NULLS LAST LIMIT 40`,
    )
  ).rows;
  for (const a of anns) raw.push({ kind: "announcement", title: a.title, text: a.content.slice(0, 1200) });

  const evs = (
    await tx.query<{ title: string; starts_at: Date; location_text: string | null; description: string | null }>(
      `SELECT title, starts_at, location_text, description FROM events
        WHERE deleted_at IS NULL AND status = 'scheduled' AND starts_at > now() - interval '1 day'
        ORDER BY starts_at LIMIT 30`,
    )
  ).rows;
  for (const e of evs)
    raw.push({
      kind: "event",
      title: e.title,
      text: `Sự kiện "${e.title}" — ${fmtVn(e.starts_at)}${e.location_text ? ` tại ${e.location_text}` : ""}.${e.description ? ` ${e.description.slice(0, 400)}` : ""}`,
    });

  // Hướng dẫn sử dụng của ứng dụng (cách thao tác, đường đi menu) — tài liệu công khai, không phụ thuộc quyền xem dữ liệu
  for (const g of guideChunks()) raw.push({ kind: "guide", title: g.title, text: g.text });

  // Chấm điểm kiểu TF-IDF rút gọn: từ hiếm (ví dụ "nghiêm") nặng hơn từ phổ biến ("giờ", "nhà"); tiêu đề nặng gấp đôi;
  // cặp từ liền kề trong câu hỏi xuất hiện liền kề trong đoạn được cộng thêm; nội quy được ưu tiên nhẹ so với thông báo/lịch.
  const docs2 = raw.map((r) => ({ r, body: tokens(r.text), head: new Set(tokens(r.title)) }));
  const df = new Map<string, number>();
  for (const d of docs2) for (const t of new Set([...d.body, ...d.head])) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + docs2.length / (df.get(t) ?? 1));
  const qTok = tokens(question);
  const howTo = /(lam sao|cach|the nao|o dau|huong dan|bam|nut|buoc|dang nhap|mat khau|thong bao|cai dat|bat|tat|doi|xoa|sua)/.test(fold(question));
  const bigrams = qTok.slice(0, -1).map((t, i) => `${t} ${qTok[i + 1]}`);

  const scored = docs2
    .map(({ r, body, head }) => {
      const set = new Set(body);
      const joined = ` ${body.join(" ")} `;
      let s = 0;
      for (const t of q) s += idf(t) * ((set.has(t) ? 1 : 0) + (head.has(t) ? 2 : 0));
      for (const bg of bigrams) if (joined.includes(` ${bg} `)) s += 1.5 * Math.max(...bg.split(" ").map(idf));
      const prior = r.kind === "policy" ? 1.25 : r.kind === "guide" ? (howTo ? 1.35 : 1.05) : 1;
      return { ...r, score: (s * prior) / Math.sqrt(1 + r.text.length / 800) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const out: Chunk[] = [];
  let total = 0;
  for (const r of scored) {
    if (out.length >= topK || total + r.text.length > maxChars) continue;
    out.push({ ...r, label: `S${out.length + 1}` });
    total += r.text.length;
  }
  return out;
}
