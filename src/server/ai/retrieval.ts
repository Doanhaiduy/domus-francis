import "server-only";
import type { Tx } from "../db";
import { guideChunks } from "./knowledge";

// ---------------------------------------------------------------------
// Truy hồi cho trợ lý hỏi đáp (RAG, BR-AI-08): chỉ đọc nội dung mà CHÍNH NGƯỜI HỎI được phép xem — truy vấn chạy
// trong transaction của người đó nên RLS (đối tượng thông báo, trạng thái xuất bản…) áp dụng như bình thường.
// Không dùng vector: chấm điểm từ khóa không dấu trên các đoạn ngắn (đủ cho vài chục văn bản; xem Phần 8.2.8).
// Nguồn nội quy CHÍNH THỨC = Luật nhà (house_rule_sections: mục + điều khoản, cờ LỖI ĐỎ, điều con, ghi chú) + Hỏi đáp công khai đã đăng
// (public_faqs). Bảng policy_documents chỉ còn lấy tài liệu loại hỏi đáp/quy trình (KHÔNG lấy nội quy — bản mẫu cũ ghi sai giờ giới nghiêm).
// ---------------------------------------------------------------------

export interface Chunk {
  label: string;
  kind: "policy" | "announcement" | "event" | "guide";
  /** Nhãn nguồn hiện trong prompt: "Luật nhà", "Hỏi đáp", "Tài liệu", "Thông báo", "Lịch", "Hướng dẫn" */
  source: string;
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

/** Gói các dòng thành khối ≤ max ký tự, không cắt giữa dòng; mỗi khối mở đầu bằng `head` (để đoạn nào cũng biết thuộc mục nào). */
function packLines(head: string, lines: string[], max = 900): string[] {
  const out: string[] = [];
  let cur = head;
  for (const l of lines) {
    if (cur !== head && cur.length + l.length + 1 > max) {
      out.push(cur);
      cur = `${head}\n(tiếp)`;
    }
    cur = `${cur}\n${l}`;
  }
  if (cur !== head) out.push(cur);
  return out;
}

interface RuleItem {
  text?: string;
  time?: string | null;
  red?: boolean;
  sub?: boolean;
  note?: boolean;
}

/** Một mục Luật nhà ⇒ các dòng chữ: điều khoản đánh số (kèm giờ, nhãn [LỖI ĐỎ]), điều con thụt vào, ghi chú tách riêng. */
function ruleLines(items: RuleItem[]): string[] {
  const out: string[] = [];
  let n = 0;
  for (const it of items) {
    const text = (it.text ?? "").trim();
    if (!text) continue;
    const time = it.time ? ` [${String(it.time).trim()}]` : "";
    const red = it.red ? " [LỖI ĐỎ]" : "";
    if (it.note) out.push(`Ghi chú${red}:${time} ${text}`);
    else if (it.sub) out.push(`   - ${text}${time}`);
    else out.push(`${++n}.${red}${time} ${text}`);
  }
  return out;
}

const fmtVn = (d: Date) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(d);

export async function retrieve(tx: Tx, question: string, topK = 7, maxChars = 7500, extraQuery = ""): Promise<Chunk[]> {
  // extraQuery: câu hỏi trước đó trong cuộc trò chuyện — dùng cho câu hỏi nối tiếp ngắn ("còn trên iPhone thì sao?")
  const q = [...new Set(tokens(`${question} ${extraQuery}`))];
  if (!q.length) return [];

  const raw: Omit<Chunk, "label" | "score">[] = [];

  // Luật nhà chính thức (mục đang hiện)
  const sections = (
    await tx.query<{ title: string; description: string | null; items: RuleItem[] | null }>(
      "SELECT title, description, items FROM house_rule_sections WHERE is_active ORDER BY sort_order, created_at LIMIT 60",
    )
  ).rows;
  for (const s of sections) {
    const items = Array.isArray(s.items) ? s.items : [];
    const lines = ruleLines(items);
    if (!lines.length && !s.description) continue;
    const hasRed = items.some((i) => i.red);
    const head = [
      `Luật nhà — mục "${s.title}"`,
      s.description?.trim() || "",
      hasRed ? "(Điều có nhãn [LỖI ĐỎ] là vi phạm nghiêm trọng nhất — mức xử lý xem mục \"Xử lý vi phạm\" của Luật nhà.)" : "",
    ]
      .filter(Boolean)
      .join("\n");
    for (const text of packLines(head, lines)) raw.push({ kind: "policy", source: "Luật nhà", title: `Luật nhà: ${s.title}`, text });
  }

  // Hỏi đáp công khai đã đăng (trang /hoi-dap)
  const faqs = (await tx.query<{ question: string; answer: string }>("SELECT question, answer FROM public_faqs WHERE is_active ORDER BY sort_order, created_at LIMIT 60")).rows;
  for (const f of faqs) {
    for (const text of split(`Hỏi: ${f.question}\nĐáp: ${f.answer}`, 1100)) raw.push({ kind: "policy", source: "Hỏi đáp", title: `Hỏi đáp: ${f.question.slice(0, 120)}`, text });
  }

  // Tài liệu hỏi đáp / quy trình còn hiệu lực (không lấy nội quy — Luật nhà ở trên là bản chính thức; bỏ mọi bản mẫu)
  const docs = (
    await tx.query<{ title: string; content_md: string }>(
      `SELECT title, content_md FROM policy_documents
        WHERE is_current AND doc_kind IN ('faq', 'procedure') AND content_md NOT LIKE '%(BẢN MẪU)%' AND title NOT ILIKE '%bản mẫu%'
        ORDER BY title LIMIT 20`,
    )
  ).rows;
  for (const d of docs) for (const c of split(d.content_md)) raw.push({ kind: "policy", source: "Tài liệu", title: d.title, text: c });

  const anns = (
    await tx.query<{ title: string; content: string }>(
      `SELECT title, content FROM announcements
        WHERE deleted_at IS NULL AND status = 'published' AND (expires_at IS NULL OR expires_at > now())
        ORDER BY published_at DESC NULLS LAST LIMIT 40`,
    )
  ).rows;
  for (const a of anns) raw.push({ kind: "announcement", source: "Thông báo", title: a.title, text: a.content.slice(0, 1200) });

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
      source: "Lịch",
      title: e.title,
      text: `Sự kiện "${e.title}" — ${fmtVn(e.starts_at)}${e.location_text ? ` tại ${e.location_text}` : ""}.${e.description ? ` ${e.description.slice(0, 400)}` : ""}`,
    });

  // Hướng dẫn sử dụng của ứng dụng (cách thao tác, đường đi menu) — tài liệu công khai, không phụ thuộc quyền xem dữ liệu
  for (const g of guideChunks()) raw.push({ kind: "guide", source: "Hướng dẫn", title: g.title, text: g.text });

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
      const prior = r.kind === "policy" ? (r.source === "Luật nhà" ? 1.35 : 1.25) : r.kind === "guide" ? (howTo ? 1.35 : 1.05) : 1;
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
