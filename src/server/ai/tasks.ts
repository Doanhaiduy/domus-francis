import "server-only";
import { z } from "zod";
import { batch, type Tx } from "../db";
import { badRequest, forbidden } from "../errors";
import type { AcademicInsightOutput, AcademicInsightRow, AiOutputMap, AiTaskCode } from "@/lib/types/ai";
import { createNameMasker, maskPatterns, maskText, sanitizeOutput } from "./mask";
import { retrieve } from "./retrieval";
import { AI_LINKS, ROLE_HINT } from "./knowledge";
import { ARTICLE_CATEGORIES, articleCategoryLabel } from "@/lib/types/articles";
import { BASE_SYSTEM, assertArticleManager, block, clean, str, type Prepared, type TaskDef } from "./shared";
import { articleImageTask, articleResearchTask, imageCaptionTask } from "./article-media";
import { buildArticleFacts } from "./article-facts";
import { findClichesIn, findUnsupported, type DraftFlag } from "@/lib/article-verify";
import { illustratableParagraphs, splitParagraphs } from "@/lib/article-paragraphs";

// ---------------------------------------------------------------------
// Bộ xử lý từng tác vụ LLM: kiểm đầu vào → ẩn danh hóa → dựng prompt → kiểm lược đồ đầu ra.
// Quy ước chống tiêm lệnh (BR-AI-07): mọi nội dung do người dùng/CSDL cung cấp nằm trong khối <du_lieu> và được coi là
// DỮ LIỆU, không phải chỉ dẫn; đầu ra bắt buộc là JSON đúng lược đồ, được làm sạch (bỏ HTML/liên kết) trước khi lưu.
// ---------------------------------------------------------------------

export const PROMPT_VERSION = "v1";
export type { Prepared, TaskDef };

/** Lấy đối tượng JSON từ đầu ra mô hình (chấp nhận bọc ```json). */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Đầu ra không phải JSON");
  return JSON.parse(t.slice(a, b + 1));
}

// ======================= 1) Soạn tin nhắc đóng quỹ =======================
const duesIn = z.object({
  amountVnd: z.number().int().min(1000).max(1_000_000_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodLabel: z.string().trim().max(40).optional(),
  tone: z.enum(["friendly", "formal"]).default("friendly"),
});
const duesOut = z.object({ message: str(600, 10) });

const duesTask: TaskDef<"finance.dues_message"> = {
  code: "finance.dues_message",
  suggestionType: "message_draft",
  input: duesIn,
  async prepare(_tx, input: z.infer<typeof duesIn>) {
    // Chỉ gửi số tiền, hạn nộp, kỳ — không có tên người nợ (thiết kế 8.1.2).
    const vnd = new Intl.NumberFormat("vi-VN").format(input.amountVnd);
    const due = input.dueDate ? input.dueDate.split("-").reverse().join("/") : "chưa nêu";
    const user = [
      "Soạn một tin nhắn nhắc đóng quỹ gửi vào nhóm chat của cộng đoàn.",
      `Giọng văn: ${input.tone === "formal" ? "trang trọng, lịch sự" : "thân thiện, nhẹ nhàng, ấm áp"}.`,
      "Yêu cầu: 2–4 câu; có số tiền và hạn nộp; không nêu tên người; không đe dọa; không dùng emoji quá 2 cái.",
      'Lược đồ: {"message": "<nội dung tin nhắn>"}',
      block(`Số tiền: ${vnd} đồng\nHạn nộp: ${due}\nKỳ: ${input.periodLabel ?? "chưa nêu"}`),
    ].join("\n");
    return {
      system: BASE_SYSTEM,
      user,
      hashInput: `${input.amountVnd}|${input.dueDate ?? ""}|${input.periodLabel ?? ""}|${input.tone}`,
      inputRef: { kind: "dues_message" },
      parse(raw) {
        const o = duesOut.parse(raw);
        return { message: sanitizeOutput(o.message, 600) };
      },
    };
  },
};

// ======================= 2) Trợ lý Lưu Xá: hướng dẫn thao tác + hỏi đáp nội quy (RAG) =======================
const ragIn = z.object({
  question: z.string().trim().min(3).max(500),
  /** Vài lượt gần nhất của cuộc trò chuyện (để hiểu câu hỏi nối tiếp). */
  history: z
    .array(z.object({ q: z.string().trim().max(500), a: z.string().trim().max(1500).optional() }))
    .max(4)
    .default([]),
});
const ragOut = z.object({
  answer: str(1500, 1),
  confident: z.boolean().default(false),
  sources: z.array(z.string().max(10)).max(8).default([]),
  actions: z.array(z.string().max(120)).max(4).default([]),
});

const ASSISTANT_SYSTEM = [
  BASE_SYSTEM,
  "",
  "VAI TRÒ: bạn là Trợ lý Lưu Xá — hướng dẫn viên của ứng dụng quản lý cộng đoàn sinh viên Công giáo Lưu Xá Phanxicô. Bạn giúp thành viên (1) biết cách thao tác trong ứng dụng, (2) tra cứu nội quy, thông báo, lịch sự kiện mà chính họ được xem.",
  "CÁCH TRẢ LỜI:",
  "- Chỉ dựa vào tài liệu trong khối dữ liệu (Hướng dẫn, Luật nhà, Hỏi đáp, Thông báo, Lịch) và thông tin ngữ cảnh người hỏi. Thiếu thông tin thì nói rõ là chưa có và gợi ý hỏi Trưởng nhà/người quản lý hoặc mở trang Hướng dẫn sử dụng.",
  "- Câu hỏi 'làm thế nào / ở đâu': trả lời bằng các BƯỚC đánh số, mỗi bước một dòng ngắn (ví dụ \"1. Mở Cài đặt → Thông báo.\"). Tên nút/mục đặt trong dấu ngoặc kép “…”, đường đi menu viết bằng mũi tên →. Nêu rõ khác biệt theo thiết bị (iPhone/Android/máy tính) nếu tài liệu có.",
  "- Kiểm tra VAI TRÒ của người hỏi: nếu thao tác cần vai trò họ không có, nói rõ cần vai trò nào và nhờ ai (Trưởng nhà, Thủ quỹ, Admin…) thay vì hướng dẫn như thể họ làm được.",
  "- Bạn KHÔNG thể tự bấm nút hay thay đổi dữ liệu giúp người dùng, và không được tiết lộ dữ liệu cá nhân, tài chính, điểm số của người khác — từ chối khéo và chỉ đường tới đúng nơi.",
  "- Ngắn gọn: thường 2–6 dòng (dưới ~900 ký tự), không chào hỏi dài, không lặp lại câu hỏi. Có thể in đậm tên mục bằng **…**. Không dùng bảng, tiêu đề hay liên kết.",
  "- Câu hỏi mơ hồ: hỏi lại đúng một câu ngắn. Câu hỏi ngoài phạm vi ứng dụng/nội quy (tin tức, bài tập, tư vấn cá nhân…): từ chối lịch sự một câu và nói bạn hỗ trợ gì.",
  "- Mục 'actions': chọn tối đa 3 trang liên quan nhất để người dùng bấm mở, CHỈ dùng đúng đường dẫn trong danh sách 'Trang có thể gợi ý mở'; không có trang phù hợp thì để mảng rỗng.",
].join("\n");

const SMALL_TALK: { re: RegExp; reply: string }[] = [
  { re: /^(xin\s*chào|chào|hello|hi|hey|alo)\b/i, reply: "Chào bạn! Mình là Trợ lý Lưu Xá. Bạn cần hỏi cách thao tác (đăng ký cơm, xin phép, đóng quỹ, bật thông báo…), nội quy hay lịch sinh hoạt? Cứ hỏi nhé." },
  { re: /^(cảm\s*ơn|cám\s*ơn|thanks|thank you|ok|okay|được rồi|tốt rồi)\b/i, reply: "Rất vui được giúp bạn! Cần gì thêm cứ hỏi mình nhé." },
];

const ragTask: TaskDef<"community.policy_rag"> = {
  code: "community.policy_rag",
  suggestionType: "answer",
  input: ragIn,
  async prepare(tx, input: z.infer<typeof ragIn>) {
    // Truy hồi chạy NỘI BỘ trên câu hỏi gốc (chỉ che email/SĐT/liên kết); mọi thứ gửi cho nhà cung cấp AI được che thêm TÊN thành viên bằng
    // MỘT bộ che dùng chung (câu hỏi, lịch sử, tài liệu ⇒ cùng người cùng nhãn "Thành viên A"); câu trả lời được trả lại tên thật khi hiển thị.
    const q = maskPatterns(input.question);
    const historyRaw = input.history.slice(-3).map((h) => ({ q: maskPatterns(h.q), a: h.a ? maskPatterns(h.a) : "" }));
    const short = q.split(/\s+/).filter(Boolean).length <= 5;
    const prevQ = short && historyRaw.length ? historyRaw[historyRaw.length - 1].q : "";
    const chunks = await retrieve(tx, q, 7, 7500, prevQ);
    const masker = await createNameMasker(tx);
    const qMasked = masker.mask(q, { loose: true });
    const history = historyRaw.map((h) => ({ q: masker.mask(h.q, { loose: true }), a: h.a ? masker.mask(h.a, { loose: true }) : "" }));
    // Tài liệu gửi kèm: Luật nhà / hỏi đáp / thông báo / lịch có thể nhắc tên người ⇒ che; Hướng dẫn sử dụng là văn bản tĩnh của ứng dụng
    const sent = chunks.map((c) =>
      c.kind === "guide" ? { title: c.title, text: c.text } : { title: masker.mask(maskPatterns(c.title)), text: masker.mask(maskPatterns(c.text)) },
    );

    const NONE: AiOutputMap["community.policy_rag"] = {
      answer:
        "Mình chưa tìm thấy nội dung nào trong hướng dẫn, nội quy, thông báo hay lịch sự kiện liên quan đến câu hỏi này. Bạn thử diễn đạt cụ thể hơn (ví dụ “làm sao đổi mật khẩu”, “giờ giới nghiêm là mấy giờ”) hoặc mở mục Hướng dẫn sử dụng; việc cần người quyết định thì hỏi trực tiếp người quản lý nhé.",
      confident: false,
      sources: [],
      actions: [{ label: "Hướng dẫn sử dụng", href: "/huong-dan" }],
    };
    const talk = SMALL_TALK.find((t) => t.re.test(q.trim()));
    const shortCircuit: AiOutputMap["community.policy_rag"] | undefined = talk
      ? { answer: talk.reply, confident: true, sources: [], actions: [] }
      : chunks.length
        ? undefined
        : NONE;

    // Ngữ cảnh người hỏi: vai trò hiện hành (RLS: chỉ thấy vai trò của chính mình)
    const roles = (
      await tx.query<{ code: string; name_vi: string }>(
        `SELECT DISTINCT r.code, r.name_vi
           FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = app.current_user_id() AND ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())`,
      )
    ).rows;
    const roleText = roles.length ? roles.map((r) => r.name_vi || ROLE_HINT[r.code] || r.code).join(", ") : "Thành viên";
    const today = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "full" }).format(new Date());

    const ctx = chunks.map((c, i) => `[${c.label}] (${c.source}: ${clean(sent[i].title)})\n${clean(sent[i].text)}`).join("\n\n");
    const links = AI_LINKS.map((l) => `- ${l.href} — ${l.label}: ${l.hint}`).join("\n");
    const convo = history.length ? history.map((h) => `Người hỏi: ${clean(h.q)}${h.a ? `\nTrợ lý: ${clean(h.a)}` : ""}`).join("\n") : "";
    const user = [
      "Trả lời câu hỏi của thành viên theo đúng VAI TRÒ và CÁCH TRẢ LỜI đã nêu. Nếu tài liệu không đủ để trả lời, đặt confident=false và nói rõ là chưa có thông tin (đừng đoán).",
      "Trích nguồn bằng nhãn đoạn (ví dụ S1) trong mảng sources; không dùng nhãn không có trong tài liệu.",
      "Luật nhà là nội quy CHÍNH THỨC của nhà (ưu tiên khi trả lời về giờ giấc, quy định, mức xử lý). Tên người đã được thay bằng nhãn \"Thành viên A/B/…\": khi nhắc tới người đó, giữ NGUYÊN nhãn (không đoán tên thật).",
      'Lược đồ: {"answer": "<câu trả lời>", "confident": true|false, "sources": ["S1"], "actions": ["/duong-dan"]}',
      `Ngữ cảnh người hỏi: vai trò = ${roleText}; hôm nay = ${today}.`,
      `Trang có thể gợi ý mở (chỉ chọn trong danh sách này):\n${links}`,
      `Câu hỏi hiện tại: ${clean(qMasked)}`,
      block(`${convo ? `LỊCH SỬ TRÒ CHUYỆN GẦN ĐÂY\n${convo}\n\n` : ""}TÀI LIỆU\n${ctx}`),
    ].join("\n");
    return {
      system: ASSISTANT_SYSTEM,
      user,
      // Băm (không lưu nguyên văn): câu hỏi đã che + nhãn ↔ tên (hai câu hỏi về hai người khác nhau không dùng chung kết quả cache)
      hashInput: `${qMasked.toLowerCase()}|${prevQ.toLowerCase()}|${roleText}|${chunks.map((c, i) => `${c.label}:${c.title}:${sent[i].text.length}`).join(",")}|${masker.signature()}`,
      inputRef: { kind: "policy_rag", chunks: chunks.length, turns: history.length, maskedNames: masker.count },
      temperature: 0.2,
      maxOutputTokens: 700,
      shortCircuit,
      parse(raw) {
        const o = ragOut.parse(raw);
        const known = new Map(chunks.map((c) => [c.label, c]));
        const sources = [...new Set(o.sources.map((s) => s.trim().toUpperCase()))]
          .map((l) => known.get(l))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({ label: c.label, title: sanitizeOutput(c.title, 120), kind: c.kind }));
        // Chỉ nhận đường dẫn nằm trong danh sách cho phép (chống mô hình bịa/chèn liên kết lạ)
        const byHref = new Map(AI_LINKS.map((l) => [l.href, l]));
        const actions = [...new Set(o.actions.map((a) => a.trim()))]
          .map((h) => byHref.get(h))
          .filter((l): l is NonNullable<typeof l> => !!l)
          .slice(0, 3)
          .map((l) => ({ label: l.label, href: l.href }));
        // Không có nguồn hợp lệ ⇒ không thể tuyên bố chắc chắn. Nhãn "Thành viên A" ⇒ trả lại tên thật cho người hỏi (đã thấy trong câu hỏi/tài liệu).
        return { answer: masker.unmask(sanitizeOutput(o.answer, 1500)), confident: o.confident && sources.length > 0, sources, actions };
      },
    };
  },
};

// ======================= 3) Hỗ trợ kiểm duyệt =======================
const modIn = z.object({
  text: z.string().trim().min(2).max(3000),
  kind: z.enum(["forum_post", "forum_comment", "announcement"]).default("forum_post"),
});
const modOut = z.object({
  flagged: z.boolean(),
  // Nhãn lạ do mô hình tự nghĩ ra không làm hỏng cả kết quả — bị lọc ở bước chuẩn hóa bên dưới.
  categories: z.array(z.string().max(40)).max(10).default([]),
  reason: str(300).default(""),
});

const modTask: TaskDef<"community.moderation"> = {
  code: "community.moderation",
  suggestionType: "moderation_flag",
  input: modIn,
  async prepare(tx, input: z.infer<typeof modIn>) {
    // Chỉ gửi nội dung, đã ẩn danh; không bao giờ kèm danh tính tác giả. Ý chỉ cầu nguyện không nằm trong phạm vi (BR-COM-19).
    const masker = await createNameMasker(tx);
    const text = masker.mask(maskPatterns(input.text));
    const user = [
      "Đánh giá nội dung dưới đây có vi phạm quy tắc cộng đoàn không: xúc phạm/công kích (insult), lộ thông tin cá nhân (personal_info), quảng cáo/spam (spam), chủ đề nhạy cảm gây chia rẽ (sensitive), khác (other).",
      "Chỉ gắn cờ khi thật sự cần; góp ý thẳng thắn hoặc tranh luận lịch sự KHÔNG phải vi phạm. Người kiểm duyệt sẽ quyết định cuối cùng.",
      'Lược đồ: {"flagged": true|false, "categories": ["insult"], "reason": "<lý do ngắn, không trích nguyên văn đoạn xúc phạm>"}',
      block(text),
    ].join("\n");
    return {
      system: BASE_SYSTEM,
      user,
      hashInput: `${input.kind}|${text}|${masker.signature()}`,
      inputRef: { kind: "moderation", length: input.text.length },
      parse(raw) {
        const o = modOut.parse(raw);
        const known = new Set(["insult", "personal_info", "spam", "sensitive", "other"]);
        const categories = [...new Set(o.categories.map((c) => c.trim().toLowerCase()).filter((c) => known.has(c)))] as AiOutputMap["community.moderation"]["categories"];
        return { flagged: o.flagged, categories, reason: masker.unmask(sanitizeOutput(o.reason, 300)) };
      },
    };
  },
};

// ======================= 4) Phân loại & ưu tiên sự cố =======================
const triageIn = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(100).optional(),
});
const triageOut = z.object({
  urgency: z.enum(["low", "medium", "high", "critical"]),
  category: str(60, 1),
  summary: str(200, 1),
  rationale: str(300).default(""),
  duplicateOf: z.string().max(10).nullable().default(null),
});

const triageTask: TaskDef<"facility.issue_triage"> = {
  code: "facility.issue_triage",
  suggestionType: "issue_triage",
  input: triageIn,
  async prepare(tx, input: z.infer<typeof triageIn>) {
    // Sự cố cơ sở vật chất là dữ liệu nội bộ (internal_ok); vẫn lọc email/số điện thoại trong mô tả.
    const title = await maskText(tx, input.title, false);
    const desc = input.description ? await maskText(tx, input.description, false) : "";
    const loc = input.location ? await maskText(tx, input.location, false) : "";
    const open = (
      await tx.query<{ id: string; title: string; location_text: string | null }>(
        `SELECT id, title, location_text FROM maintenance_issues
          WHERE status IN ('new','in_progress','waiting_parts') ORDER BY created_at DESC LIMIT 15`,
      )
    ).rows;
    const labelled = open.map((r, i) => ({ label: `I${i + 1}`, ...r }));
    const list = labelled.map((r) => `[${r.label}] ${clean(r.title)}${r.location_text ? ` (${clean(r.location_text)})` : ""}`).join("\n") || "(không có)";
    const user = [
      "Phân loại một báo hỏng thiết bị/cơ sở vật chất. Mức khẩn: low (không ảnh hưởng sinh hoạt), medium (bất tiện, sửa trong tuần), high (ảnh hưởng nhiều người, sửa trong ngày), critical (nguy hiểm: điện, nước tràn, cháy nổ, an ninh).",
      "category: loại ngắn gọn (ví dụ Điện, Nước, Thiết bị, Nội thất, Vệ sinh, Mạng). Nếu báo cáo trùng với một sự cố đang mở trong danh sách thì ghi nhãn của nó vào duplicateOf, nếu không thì null.",
      'Lược đồ: {"urgency":"low|medium|high|critical","category":"…","summary":"<tóm tắt 1 câu>","rationale":"<lý do chọn mức khẩn>","duplicateOf":"I1"|null}',
      block(`Tiêu đề: ${title}\nVị trí: ${loc || "chưa nêu"}\nMô tả: ${desc || "chưa nêu"}`),
      "Danh sách sự cố đang mở:",
      block(list),
    ].join("\n");
    return {
      system: BASE_SYSTEM,
      user,
      hashInput: `${title}|${loc}|${desc}|${labelled.map((r) => r.id).join(",")}`,
      inputRef: { kind: "issue_triage", openIssues: labelled.length },
      parse(raw) {
        const o = triageOut.parse(raw);
        const dup = o.duplicateOf ? labelled.find((r) => r.label === o.duplicateOf!.trim().toUpperCase()) : undefined;
        return {
          urgency: o.urgency,
          category: sanitizeOutput(o.category, 60),
          summary: sanitizeOutput(o.summary, 200),
          rationale: sanitizeOutput(o.rationale, 300),
          duplicateOf: dup ? { id: dup.id, title: dup.title } : null,
        };
      },
    };
  },
};

// ======================= 5) Tóm tắt biên bản / bản tin =======================
const minutesIn = z.object({
  notes: z.string().trim().min(20).max(6000),
  kind: z.enum(["meeting", "weekly_digest"]).default("meeting"),
});
const minutesOut = z.object({
  summary: str(1200, 1),
  decisions: z.array(str(300)).max(10).default([]),
  actions: z.array(z.object({ task: str(300, 1), owner: str(80).default("") })).max(10).default([]),
});

const minutesTask: TaskDef<"community.minutes"> = {
  code: "community.minutes",
  suggestionType: "minutes_draft",
  input: minutesIn,
  async prepare(tx, input: z.infer<typeof minutesIn>) {
    // Tên thành viên được thay bằng "Thành viên A/B…" trước khi gửi; kết quả được điền lại tên thật (người phụ trách…) trước khi hiển thị.
    const masker = await createNameMasker(tx);
    const notes = masker.mask(maskPatterns(input.notes));
    const user = [
      input.kind === "weekly_digest"
        ? "Soạn bản tin tuần từ các ý chính: summary là đoạn mở đầu ngắn, decisions là các tin nổi bật, actions là việc cần làm."
        : "Tóm tắt ghi chú cuộc họp: summary ≤ 5 câu, decisions là các quyết định đã chốt, actions là việc cần làm kèm người phụ trách nếu có (nếu ghi chú không nêu người thì để rỗng).",
      'Lược đồ: {"summary":"…","decisions":["…"],"actions":[{"task":"…","owner":"…"}]}',
      block(notes),
    ].join("\n");
    return {
      system: BASE_SYSTEM,
      user,
      hashInput: `${input.kind}|${notes}|${masker.signature()}`,
      inputRef: { kind: "minutes", length: input.notes.length },
      parse(raw) {
        const o = minutesOut.parse(raw);
        return {
          summary: masker.unmask(sanitizeOutput(o.summary, 1200)),
          decisions: o.decisions.map((d) => masker.unmask(sanitizeOutput(d, 300))).filter(Boolean),
          actions: o.actions.map((a) => ({ task: masker.unmask(sanitizeOutput(a.task, 300)), owner: masker.unmask(sanitizeOutput(a.owner, 80)) })).filter((a) => a.task),
        };
      },
    };
  },
};

// ======================= Tiện ích chung cho các tác vụ "nhận xét" =======================
type Q = readonly [sql: string, params?: readonly unknown[]];
/** Chạy các câu SQL độc lập trong MỘT vòng mạng; phần tử null ⇒ mảng rỗng đúng vị trí. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchRows(tx: Tx, items: (Q | null)[]): Promise<any[][]> {
  const list = items.filter((x): x is Q => x !== null);
  const res = list.length ? await batch(tx, list) : [];
  let k = 0;
  return items.map((x) => (x ? res[k++].rows : []));
}

/** Danh sách chuỗi từ mô hình: nới khi kiểm, cắt sau khi làm sạch. */
const strList = (each: number) => z.array(z.string().max(each * 3)).max(12).default([]);
const cleanList = (xs: string[], n: number, each: number) => xs.map((x) => sanitizeOutput(x, each)).filter(Boolean).slice(0, n);
const n0 = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const fmtVnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} đ`;
const fmtNum = (n: number | null, d = 2) => (n === null ? "chưa có" : n.toFixed(d));
const fmtDmy = (iso: string) => iso.split("-").reverse().join("/");
const pctChange = (cur: number, prev: number): number | null => (prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10);
/** So khớp nhãn mô hình trả về với nhãn máy chủ (bỏ dấu ngoặc, gạch nối khác loại, khoảng trắng). */
const normLabel = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[[\]"“”'‘’]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

interface YearRow {
  id: string;
  code: string;
  starts_on: string;
  ends_on: string;
}
const YEARS_SQL: Q = ["SELECT id, code, starts_on::text AS starts_on, ends_on::text AS ends_on FROM academic_years ORDER BY starts_on DESC LIMIT 12"];
/** Năm học hiện tại (chứa hôm nay, nếu không thì năm gần nhất đã bắt đầu) và năm học liền trước. */
function pickYears(years: YearRow[], today: string): { cur: YearRow | null; prev: YearRow | null } {
  const sorted = [...years].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
  const i = sorted.findIndex((y) => y.starts_on <= today && today <= y.ends_on);
  const j = i >= 0 ? i : sorted.findIndex((y) => y.starts_on <= today);
  if (j < 0) return { cur: null, prev: null };
  return { cur: sorted[j], prev: sorted[j + 1] ?? null };
}
const trendOf = (cur: number | null, prev: number | null): AcademicInsightOutput["trend"] =>
  cur === null || prev === null ? "unknown" : cur - prev >= 0.1 ? "up" : prev - cur >= 0.1 ? "down" : "stable";
const TREND_TEXT: Record<AcademicInsightOutput["trend"], string> = {
  up: "tăng",
  down: "giảm",
  stable: "ổn định (chênh dưới 0,1 điểm hệ 4)",
  unknown: "chưa đủ dữ liệu để so sánh",
};
/** Trung bình có trọng số; bỏ phần tử thiếu giá trị hoặc trọng số 0. */
function weighted(items: { v: number | null; w: number }[]): number | null {
  const ok = items.filter((x) => x.v !== null && x.w > 0);
  const w = ok.reduce((a, x) => a + x.w, 0);
  return w > 0 ? Math.round((ok.reduce((a, x) => a + (x.v as number) * x.w, 0) / w) * 100) / 100 : null;
}

// ======================= 6) Nhận xét thu chi theo tháng =======================
const finIn = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có dạng YYYY-MM.").optional() });
const finOut = z.object({
  headline: str(120, 1),
  summary: str(600, 1),
  comparisons: z
    .array(z.object({ label: z.string().max(300), comment: z.string().max(600).nullish() }).passthrough())
    .max(20)
    .default([]),
  highlights: strList(200),
  warnings: strList(200),
  suggestions: strList(200),
});

interface FinSummary {
  opening_balance_vnd: number;
  total_in_vnd: number;
  total_out_vnd: number;
  closing_balance_vnd: number;
  dues_expected_vnd: number;
  dues_collected_vnd: number;
  collection_rate_pct: number | null;
  expense_by_category: { code: string; name: string; total_vnd: number; count: number }[];
}
const FEE_LABEL: Record<string, string> = {
  periodic_dues: "Quỹ định kỳ",
  utility: "Tiền điện nước",
  monthly_dues: "Quỹ sinh hoạt tháng",
  event_fee: "Phí sự kiện",
  donation: "Quyên góp",
  deposit: "Đặt cọc",
  other: "Khoản thu khác",
};
const prevMonthOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
const monthEndOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
};
const mmYyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
/** "T10/2026", "T9–T11/2026", "T11/2026–T1/2027" */
const monthRange = (a: string, b: string) =>
  a === b ? `T${Number(a.slice(5, 7))}/${a.slice(0, 4)}` : a.slice(0, 4) === b.slice(0, 4) ? `T${Number(a.slice(5, 7))}–T${Number(b.slice(5, 7))}/${b.slice(0, 4)}` : `T${Number(a.slice(5, 7))}/${a.slice(0, 4)}–T${Number(b.slice(5, 7))}/${b.slice(0, 4)}`;

const financeInsightTask: TaskDef<"finance.monthly_insight"> = {
  code: "finance.monthly_insight",
  suggestionType: "finance_insight",
  input: finIn,
  async prepare(tx, input: z.infer<typeof finIn>) {
    // Quyền: số liệu tổng hợp (finance.summary.read) + vai trò quản lý quỹ (Thủ quỹ/người quản lý). Thành viên thường chỉ xem
    // tổng quan trên trang Thu chi — không chạy AI (mỗi người một lượt gọi/ngày sẽ tốn ngân sách mà không thêm thông tin).
    const p = (
      await tx.query<{ today: string; summary: boolean; board: boolean; exp_all: boolean; contrib_all: boolean }>(
        `SELECT app.local_today()::text AS today, app.has_permission('finance.summary.read') AS summary,
                app.has_any_permission(ARRAY['finance.ledger.read', 'finance.expense.read_all', 'finance.contribution.read_all']) AS board,
                app.has_permission('finance.expense.read_all') AS exp_all, app.has_permission('finance.contribution.read_all') AS contrib_all`,
      )
    ).rows[0];
    if (!p.summary || !p.board) throw forbidden("Nhận xét thu chi bằng AI chỉ dành cho Thủ quỹ và người quản lý.");
    const thisMonth = p.today.slice(0, 7);
    const month = input.month ?? thisMonth;
    if (month > thisMonth) throw badRequest("Chưa có số liệu cho tháng trong tương lai.");
    const prev = prevMonthOf(month);
    const partial = month === thisMonth;
    const [curFrom, curTo, prevFrom, prevTo] = [`${month}-01`, monthEndOf(month), `${prev}-01`, monthEndOf(prev)];

    // Một vòng mạng: tổng hợp 2 tháng (hàm DB không lộ tên) + đóng quỹ theo loại khoản thu + chi lớn nhất + phiếu đang chờ.
    const [curR, prevR, contribR, topR, pendingR] = await batchRows(tx, [
      ["SELECT app.fn_finance_summary($1::date, $2::date) AS s", [curFrom, curTo]],
      ["SELECT app.fn_finance_summary($1::date, $2::date) AS s", [prevFrom, prevTo]],
      p.contrib_all
        ? [
            // Kế hoạch thu CHỒNG lên tháng (quỹ định kỳ nhiều tháng có period_end_month — đọc qua to_jsonb để vẫn chạy khi cột
            // chưa có; kế hoạch một tháng: period_month). Trạng thái đóng là hiện tại của kế hoạch, không phải ảnh chụp quá khứ.
            `WITH plans AS (
               SELECT cp.id, cp.fee_type::text AS fee_type, cp.period_month AS start_d,
                      COALESCE((to_jsonb(cp) ->> 'period_end_month')::date, cp.period_month) AS end_d
                 FROM contribution_plans cp
                WHERE cp.status <> 'cancelled' AND cp.period_month IS NOT NULL
             )
             SELECT to_char(mo.d, 'YYYY-MM') AS m, p.fee_type, to_char(p.start_d, 'YYYY-MM') AS start_m, to_char(p.end_d, 'YYYY-MM') AS end_m,
                    count(*) FILTER (WHERE ct.status NOT IN ('cancelled', 'waived'))::int AS total,
                    count(*) FILTER (WHERE ct.status = 'paid')::int AS paid,
                    count(*) FILTER (WHERE ct.status = 'partial')::int AS partial,
                    count(*) FILTER (WHERE ct.status = 'unpaid')::int AS unpaid,
                    count(*) FILTER (WHERE ct.status = 'waived')::int AS waived,
                    count(*) FILTER (WHERE ct.status IN ('unpaid', 'partial') AND ct.due_date < app.local_today())::int AS overdue,
                    COALESCE(sum(ct.amount_due_vnd - ct.discount_vnd) FILTER (WHERE ct.status <> 'cancelled'), 0)::bigint AS expected,
                    COALESCE(sum(ct.paid_vnd) FILTER (WHERE ct.status <> 'cancelled'), 0)::bigint AS collected
               FROM (VALUES ($1::date), ($2::date)) AS mo(d)
               JOIN plans p ON p.start_d <= (mo.d + interval '1 month' - interval '1 day')::date AND p.end_d >= mo.d
               JOIN contributions ct ON ct.plan_id = p.id
              GROUP BY mo.d, p.id, p.fee_type, p.start_d, p.end_d
              ORDER BY mo.d, p.start_d, p.fee_type`,
            [curFrom, prevFrom],
          ]
        : null,
      p.exp_all
        ? [
            `SELECT ev.title, ev.amount_vnd, c.name AS category
               FROM expense_vouchers ev JOIN categories c ON c.id = ev.category_id
              WHERE ev.status = 'paid' AND NOT app.fn_fund_is_event(ev.fund_id) AND app.local_date(ev.paid_at) BETWEEN $1::date AND $2::date
              ORDER BY ev.amount_vnd DESC, ev.paid_at DESC LIMIT 3`,
            [curFrom, curTo],
          ]
        : null,
      p.exp_all && partial
        ? ["SELECT count(*) FILTER (WHERE status = 'pending_approval')::int AS pending, count(*) FILTER (WHERE status = 'approved')::int AS approved FROM expense_vouchers WHERE NOT app.fn_fund_is_event(fund_id)"]
        : null,
    ]);
    const cur = curR[0].s as FinSummary;
    const old = prevR[0].s as FinSummary;

    // ---- Bảng so sánh: số do máy chủ tính (mô hình chỉ viết lời nhận xét cho từng nhãn) ----
    const row = (label: string, c: number, pv: number, better: "up" | "down") => ({ label, current: c, previous: pv, changePct: pctChange(c, pv), better });
    const [ci, co, pi, po] = [n0(cur.total_in_vnd), n0(cur.total_out_vnd), n0(old.total_in_vnd), n0(old.total_out_vnd)];
    const rows = [
      row("Tổng thu", ci, pi, "up"),
      row("Tổng chi", co, po, "down"),
      row("Chênh lệch thu – chi", ci - co, pi - po, "up"),
      row(partial ? "Số dư quỹ đến hôm nay" : "Số dư quỹ cuối tháng", n0(cur.closing_balance_vnd), n0(old.closing_balance_vnd), "up"),
    ];
    const cats = new Map<string, { name: string; cur: number; curN: number; prev: number; prevN: number }>();
    for (const c of cur.expense_by_category ?? []) cats.set(c.code, { name: c.name, cur: n0(c.total_vnd), curN: n0(c.count), prev: 0, prevN: 0 });
    for (const c of old.expense_by_category ?? []) {
      const x = cats.get(c.code) ?? { name: c.name, cur: 0, curN: 0, prev: 0, prevN: 0 };
      x.prev = n0(c.total_vnd);
      x.prevN = n0(c.count);
      cats.set(c.code, x);
    }
    const catList = [...cats.values()].sort((a, b) => b.cur - a.cur || b.prev - a.prev);
    // Hai hạng mục chi lớn nhất (tình hình đóng quỹ/điện nước nằm ở phần mô tả: quỹ định kỳ trải nhiều tháng nên không so theo tháng được).
    for (const c of catList.slice(0, 2)) rows.push(row(`Chi ${c.name.toLowerCase()}`, c.cur, c.prev, "down"));

    // ---- Đóng quỹ: chỉ số đếm/số tiền, không tên ----
    type Contrib = { m: string; fee_type: string; start_m: string; end_m: string; total: number; paid: number; partial: number; unpaid: number; waived: number; overdue: number; expected: string; collected: string };
    const contrib = contribR as Contrib[];
    const contribLine = (m: string) => {
      const list = contrib.filter((c) => c.m === m);
      if (!list.length) return null;
      return list
        .map((c) => {
          const exp = n0(c.expected);
          const col = n0(c.collected);
          const rate = exp > 0 ? ` (${Math.round((col / exp) * 1000) / 10}%)` : "";
          return `${FEE_LABEL[c.fee_type] ?? "Khoản thu"} ${monthRange(c.start_m, c.end_m)}: ${c.paid}/${c.total} người đã đóng đủ, ${c.partial} đóng một phần, ${c.unpaid} chưa đóng, ${c.waived} được miễn; ${c.overdue} người còn thiếu đã quá hạn; đã thu ${fmtVnd(col)} / ${fmtVnd(exp)}${rate}`;
        })
        .join("; ");
    };
    const duesFallback = (s: FinSummary) =>
      `kế hoạch thu bắt đầu trong tháng: phải thu ${fmtVnd(n0(s.dues_expected_vnd))}, đã thu ${fmtVnd(n0(s.dues_collected_vnd))}${s.collection_rate_pct === null ? "" : ` (${s.collection_rate_pct}%)`}`;

    // ---- Khoản chi lớn nhất: che tên thành viên/SĐT/email trong tiêu đề (một lần cho cả danh sách) ----
    const top = topR as { title: string; amount_vnd: string; category: string }[];
    let titles = top.map((t) => clean(t.title).replace(/\n/g, " ").slice(0, 120));
    if (titles.length) {
      const masked = (await maskText(tx, titles.join("\n"), true)).split("\n");
      titles = masked.length === titles.length ? masked : await Promise.all(titles.map((t) => maskText(tx, t, true)));
    }
    const pending = pendingR[0] as { pending: number; approved: number } | undefined;

    const noData = ci === 0 && co === 0 && n0(cur.dues_expected_vnd) === 0 && !(cur.expense_by_category ?? []).length;
    const base = { month, previousMonth: prev, partial };
    const NONE: AiOutputMap["finance.monthly_insight"] = {
      ...base,
      headline: `Tháng ${mmYyyy(month)} chưa có số liệu thu chi`,
      summary: `Chưa có khoản thu, khoản chi hay kế hoạch thu quỹ nào được ghi nhận trong tháng ${mmYyyy(month)} nên chưa thể nhận xét. Bảng dưới vẫn hiện số liệu tháng ${mmYyyy(prev)} để tham khảo.`,
      comparisons: rows.map((r) => ({ ...r, comment: "" })),
      highlights: [],
      warnings: [],
      suggestions: ["Ghi nhận các khoản thu, khoản chi của tháng vào hệ thống để có nhận xét chính xác."],
    };

    const data = [
      `Tháng đang xem: ${mmYyyy(month)}${partial ? ` (CHƯA kết thúc — số liệu tính đến ${fmtDmy(p.today)})` : " (đủ tháng)"}. So sánh với tháng ${mmYyyy(prev)} (đủ tháng).`,
      partial ? "Lưu ý: tháng chưa kết thúc nên tổng thu/chi thường thấp hơn tháng trước — không kết luận vội là giảm." : "",
      "Bảng so sánh (đơn vị đồng, nhãn trong ngoặc vuông):",
      ...rows.map(
        (r) => `- [${r.label}] tháng này: ${fmtVnd(r.current)}; tháng trước: ${fmtVnd(r.previous)}; thay đổi: ${r.changePct === null ? "không tính được (tháng trước bằng 0)" : `${r.changePct > 0 ? "+" : ""}${r.changePct}%`}`,
      ),
      "Chi theo hạng mục (tháng này | tháng trước):",
      ...(catList.length ? catList.map((c) => `- ${c.name}: ${fmtVnd(c.cur)} (${c.curN} phiếu) | ${fmtVnd(c.prev)} (${c.prevN} phiếu)`) : ["- (không có khoản chi nào)"]),
      "Tình hình đóng quỹ / điện nước theo kế hoạch thu của tháng:",
      `- Tháng này: ${p.contrib_all ? (contribLine(month) ?? "chưa có kế hoạch thu") : duesFallback(cur)}`,
      `- Tháng trước: ${p.contrib_all ? (contribLine(prev) ?? "chưa có kế hoạch thu") : duesFallback(old)}`,
      ...(titles.length ? ["Khoản chi lớn nhất tháng này (tiêu đề đã che tên):", ...titles.map((t, i) => `- ${clean(t)} — ${fmtVnd(n0(top[i].amount_vnd))} (${clean(top[i].category)})`)] : []),
      pending ? `Phiếu chi hiện đang chờ duyệt: ${pending.pending}; đã duyệt nhưng chưa chi: ${pending.approved}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const user = [
      "Nhận xét tình hình thu chi quỹ của cộng đoàn trong tháng đang xem so với tháng trước, CHỈ dựa vào số liệu trong khối dữ liệu (hệ thống đã tính sẵn — không tự tính lại, không bịa số, không nêu hay đoán tên người).",
      "Giọng văn: khách quan, ngắn gọn, mang tính xây dựng, không trách móc.",
      "headline: 1 câu ≤ 120 ký tự nêu điểm chính. summary: 2–4 câu. comparisons: với MỖI nhãn trong bảng so sánh viết 1 nhận xét ngắn (≤ 150 ký tự), giữ nguyên nhãn (không kèm ngoặc vuông).",
      "highlights: tối đa 4 điểm tích cực; warnings: tối đa 4 điều cần lưu ý (chi tăng mạnh, thu quỹ chậm, quá hạn, số dư giảm…); suggestions: tối đa 4 gợi ý cụ thể cho Thủ quỹ/người quản lý. Không có ý thì để mảng rỗng.",
      'Lược đồ: {"headline":"…","summary":"…","comparisons":[{"label":"Tổng thu","comment":"…"}],"highlights":["…"],"warnings":["…"],"suggestions":["…"]}',
      block(data),
    ].join("\n");

    return {
      system: BASE_SYSTEM,
      user,
      hashInput: JSON.stringify({ month, partial, today: partial ? p.today : null, rows, catList, contrib, titles, top: top.map((t) => t.amount_vnd), pending: pending ?? null, ex: p.exp_all, ca: p.contrib_all }),
      inputRef: { kind: "finance_monthly_insight", month },
      cacheScope: `finance:${month}`,
      shortCircuit: noData ? NONE : undefined,
      parse(raw) {
        const o = finOut.parse(raw);
        const comments = new Map(o.comparisons.map((c) => [normLabel(c.label), c.comment ?? ""]));
        return {
          ...base,
          headline: sanitizeOutput(o.headline, 120),
          summary: sanitizeOutput(o.summary, 600),
          comparisons: rows.map((r) => ({ ...r, comment: sanitizeOutput(comments.get(normLabel(r.label)) ?? "", 160) })),
          highlights: cleanList(o.highlights, 4, 200),
          warnings: cleanList(o.warnings, 4, 200),
          suggestions: cleanList(o.suggestions, 4, 200),
        };
      },
    };
  },
};

// ======================= 7) Nhận xét kết quả học tập của chính mình =======================
const acadOut = z.object({
  headline: str(120, 1),
  summary: str(600, 1),
  points: strList(220),
  suggestions: strList(220),
});
const acadParse = (raw: unknown, trend: AcademicInsightOutput["trend"], compare: AcademicInsightOutput["compare"]): AcademicInsightOutput => {
  const o = acadOut.parse(raw);
  return {
    headline: sanitizeOutput(o.headline, 120),
    summary: sanitizeOutput(o.summary, 600),
    trend,
    points: cleanList(o.points, 5, 220),
    suggestions: cleanList(o.suggestions, 4, 220),
    compare,
  };
};
const ACAD_TONE =
  "Giọng văn: ấm áp, khích lệ, tôn trọng; ghi nhận cố gắng; không phán xét, không so sánh với người cụ thể, không suy đoán hoàn cảnh riêng. Chỉ dùng số liệu trong khối dữ liệu, không bịa số.";
const ACAD_SCHEMA = 'Lược đồ: {"headline":"…","summary":"…","points":["…"],"suggestions":["…"]}';

const STATUS_VI: Record<string, string> = { verified: "đã xác minh", submitted: "đã nộp, chờ xác minh", draft: "bản nháp (tạm tính)", rejected: "bị trả lại (tạm tính)" };
const SEM_VI: Record<string, string> = { HK1: "HK1", HK2: "HK2", HE: "Học kỳ hè" };

interface MySem {
  label: string;
  yearId: string;
  status: string;
  g4: number | null;
  g10: number | null;
  rank: string | null;
  att: number;
  pas: number;
  courses: number;
  failed: number;
  incomplete: number;
  scholarship: boolean;
}

const acadSelfIn = z.object({ scope: z.enum(["self"], { message: "Phạm vi không hợp lệ." }).default("self") });

const academicSelfTask: TaskDef<"academic.insight"> = {
  code: "academic.insight",
  suggestionType: "academic_insight",
  input: acadSelfIn,
  async prepare(tx) {
    // CHỈ bảng điểm của chính người gọi; gửi đi: điểm trung bình, tín chỉ, số môn theo học kỳ — không tên, trường, ngành,
    // mã sinh viên hay tên môn. Cổng DB kiểm đồng ý ai_academic_summary của chủ thể (= người gọi).
    const [meR, yearsR, recR] = await batchRows(tx, [
      ["SELECT app.current_member_id() AS me, app.local_today()::text AS today"],
      YEARS_SQL,
      [
        `SELECT s.code AS sem_code, s.starts_on::text AS starts_on, y.id AS year_id, y.code AS year_code, ar.status::text AS status, ar.has_scholarship,
                snap.gpa10 AS s_g10, snap.gpa4 AS s_g4, snap.rank_label AS s_rank, snap.credits_attempted AS s_att, snap.credits_passed AS s_pas,
                snap.failed_courses AS s_failed, cum.gpa4 AS cum_g4, cum.gpa10 AS cum_g10, cum.rank_label AS cum_rank,
                pv.g10, pv.g4, pv.att, pv.pas, pv.failed, pv.incomplete, pv.courses,
                (SELECT rb.label_vi FROM grade_rank_bands rb
                  WHERE rb.scale_id = ar.scale_id AND pv.g4_raw IS NOT NULL AND rb.min_gpa4 <= pv.g4_raw
                  ORDER BY rb.min_gpa4 DESC LIMIT 1) AS pv_rank
           FROM academic_records ar
           JOIN semesters s ON s.id = ar.semester_id
           JOIN academic_years y ON y.id = s.academic_year_id
           JOIN grade_scales gs ON gs.id = ar.scale_id
           LEFT JOIN gpa_snapshots snap ON snap.member_id = ar.member_id AND snap.as_of_semester_id = ar.semester_id AND snap.scope = 'semester'
           LEFT JOIN gpa_snapshots cum ON cum.member_id = ar.member_id AND cum.as_of_semester_id = ar.semester_id AND cum.scope = 'cumulative'
           LEFT JOIN LATERAL (
             -- cùng công thức với app.fn_recompute_gpa (trọng số tín chỉ, chỉ môn counts_in_gpa) — để tạm tính bản nháp
             SELECT CASE WHEN x.att > 0 THEN round(x.w10 / x.att, 2) END AS g10,
                    CASE WHEN x.att > 0 THEN round(x.w4 / x.att, 2) END AS g4,
                    CASE WHEN x.att > 0 THEN x.w4 / x.att END AS g4_raw,
                    x.att, x.pas, x.failed, x.incomplete, x.courses
               FROM (SELECT COALESCE(SUM(g.credits) FILTER (WHERE g.counts_in_gpa), 0) AS att,
                            COALESCE(SUM(g.credits) FILTER (WHERE g.counts_in_gpa AND g.is_pass), 0) AS pas,
                            COUNT(*) FILTER (WHERE g.is_pass = false) AS failed,
                            COUNT(*) FILTER (WHERE g.total_score IS NULL) AS incomplete,
                            COUNT(*) AS courses,
                            COALESCE(SUM(g.total_score * g.credits) FILTER (WHERE g.counts_in_gpa), 0) AS w10,
                            COALESCE(SUM((CASE WHEN gs.gpa4_mode = 'linear' THEN g.total_score / gs.max_score * 4 ELSE g.gpa_points END) * g.credits)
                                     FILTER (WHERE g.counts_in_gpa), 0) AS w4
                       FROM grade_records g WHERE g.record_id = ar.id) x
           ) pv ON true
          WHERE ar.member_id = app.current_member_id()
          ORDER BY s.starts_on`,
      ],
    ]);
    const { me, today } = meR[0] as { me: string | null; today: string };
    if (!me) throw forbidden("Chỉ thành viên đã được duyệt mới dùng được nhận xét học tập.");

    const sems: MySem[] = recR
      .filter((r) => n0(r.courses) > 0)
      .map((r) => {
        const snap = r.s_g4 !== null && r.s_g4 !== undefined;
        return {
          label: `${SEM_VI[r.sem_code] ?? r.sem_code} ${r.year_code}`,
          yearId: r.year_id,
          status: r.status,
          g4: snap ? numOrNull(r.s_g4) : numOrNull(r.g4),
          g10: snap ? numOrNull(r.s_g10) : numOrNull(r.g10),
          rank: (snap ? r.s_rank : r.pv_rank) ?? null,
          att: n0(snap ? r.s_att : r.att),
          pas: n0(snap ? r.s_pas : r.pas),
          courses: n0(r.courses),
          failed: n0(snap ? r.s_failed : r.failed),
          incomplete: n0(r.incomplete),
          scholarship: !!r.has_scholarship,
        };
      });
    const lastCum = [...recR].reverse().find((r) => r.cum_g4 !== null && r.cum_g4 !== undefined);

    const NONE: AiOutputMap["academic.insight"] = {
      headline: "Chưa có bảng điểm để nhận xét",
      summary: "Bạn chưa nhập bảng điểm nào có điểm môn học. Khi bạn nhập điểm ở mục Học tập, AI sẽ nhận xét kết quả và so sánh với năm học trước giúp bạn.",
      trend: "unknown",
      points: [],
      suggestions: ["Nhập bảng điểm học kỳ gần nhất ở mục Học tập."],
      compare: null,
    };

    const { cur, prev } = pickYears(yearsR as YearRow[], today);
    const agg = (list: MySem[]) =>
      list.length
        ? {
            g4: weighted(list.map((s) => ({ v: s.g4, w: s.att }))),
            g10: weighted(list.map((s) => ({ v: s.g10, w: s.att }))),
            att: list.reduce((a, s) => a + s.att, 0),
            courses: list.reduce((a, s) => a + s.courses, 0),
            failed: list.reduce((a, s) => a + s.failed, 0),
          }
        : null;
    const curAgg = cur ? agg(sems.filter((s) => s.yearId === cur.id)) : null;
    const prevAgg = prev ? agg(sems.filter((s) => s.yearId === prev.id)) : null;

    // So sánh: năm học hiện tại vs năm trước; thiếu một bên ⇒ học kỳ gần nhất vs học kỳ trước đó; chỉ 1 học kỳ ⇒ không so sánh.
    type Agg = NonNullable<ReturnType<typeof agg>>;
    const mkRows = (a: Agg | null, b: Agg | null): AcademicInsightRow[] => [
      { label: "GPA hệ 4", current: a?.g4 ?? null, previous: b?.g4 ?? null, better: "up", decimals: 2 },
      { label: "GPA hệ 10", current: a?.g10 ?? null, previous: b?.g10 ?? null, better: "up", decimals: 2 },
      { label: "Tín chỉ tính GPA", current: a?.att ?? null, previous: b?.att ?? null, better: "up", decimals: 0 },
      { label: "Số môn chưa đạt", current: a?.failed ?? null, previous: b?.failed ?? null, better: "down", decimals: 0 },
    ];
    let compare: AcademicInsightOutput["compare"] = null;
    if (curAgg && prevAgg && cur && prev) {
      compare = { currentLabel: `Năm học ${cur.code}`, previousLabel: `Năm học ${prev.code}`, rows: mkRows(curAgg, prevAgg) };
    } else if (sems.length >= 2) {
      const [b, a] = sems.slice(-2);
      compare = { currentLabel: a.label, previousLabel: b.label, rows: mkRows(agg([a]), agg([b])) };
    } else if (sems.length === 1) {
      compare = { currentLabel: sems[0].label, previousLabel: null, rows: mkRows(agg(sems), null) };
    }
    const trend = compare ? trendOf(compare.rows[0].current, compare.rows[0].previous) : "unknown";

    const yearLine = (label: string, y: YearRow | null, a: Agg | null) =>
      !y
        ? `- ${label}: không xác định.`
        : !a
          ? `- ${label} ${y.code}: chưa có bảng điểm.`
          : `- ${label} ${y.code}: GPA hệ 4 ${fmtNum(a.g4)}, hệ 10 ${fmtNum(a.g10)}; ${a.att} tín chỉ tính GPA; ${a.courses} môn; ${a.failed} môn chưa đạt.`;
    const data = [
      `Hôm nay: ${fmtDmy(today)}.`,
      "Tổng hợp theo năm học (GPA có trọng số tín chỉ):",
      yearLine("Năm học hiện tại", cur, curAgg),
      yearLine("Năm học trước", prev, prevAgg),
      "Theo học kỳ (cũ → mới):",
      ...sems.map(
        (s) =>
          `- ${s.label} — ${STATUS_VI[s.status] ?? s.status}: GPA hệ 4 ${fmtNum(s.g4)}, hệ 10 ${fmtNum(s.g10)}${s.rank ? `, xếp loại ${s.rank}` : ""}; ${s.att} tín chỉ (đạt ${s.pas}); ${s.courses} môn, ${s.failed} môn chưa đạt${s.incomplete ? `, ${s.incomplete} môn chưa có điểm tổng kết` : ""}${s.scholarship ? "; có học bổng" : ""}.`,
      ),
      lastCum ? `GPA tích lũy gần nhất: hệ 4 ${fmtNum(numOrNull(lastCum.cum_g4))}, hệ 10 ${fmtNum(numOrNull(lastCum.cum_g10))}${lastCum.cum_rank ? ` (${lastCum.cum_rank})` : ""}.` : "",
      compare
        ? `So sánh do hệ thống tính: ${compare.currentLabel}${compare.previousLabel ? ` so với ${compare.previousLabel}` : " (chưa có kỳ trước để so sánh)"} — xu hướng GPA: ${TREND_TEXT[trend]}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const user = [
      'Viết nhận xét kết quả học tập cho CHÍNH bạn sinh viên đang xem (xưng "bạn"), dựa CHỈ vào số liệu trong khối dữ liệu.',
      "So sánh năm học hiện tại với năm học trước nếu có; nếu chưa đủ dữ liệu thì dùng so sánh học kỳ mà hệ thống đã nêu, hoặc nói rõ là chưa đủ để so sánh. Xu hướng đã do hệ thống tính — không nói ngược lại.",
      ACAD_TONE,
      "headline ≤ 120 ký tự; summary 2–4 câu; points: tối đa 5 ý (điểm mạnh, điều cần chú ý); suggestions: tối đa 4 gợi ý học tập cụ thể, khả thi (lập kế hoạch ôn tập, nhóm học hoặc phụ đạo trong nhà…).",
      ACAD_SCHEMA,
      block(data),
    ].join("\n");

    return {
      system: BASE_SYSTEM,
      user,
      hashInput: JSON.stringify({ sems, cur: cur?.id ?? null, prev: prev?.id ?? null, cum: lastCum ? [lastCum.cum_g4, lastCum.cum_g10, lastCum.cum_rank] : null }),
      inputRef: { kind: "academic_insight", semesters: sems.length },
      cacheScope: "academic:self",
      shortCircuit: sems.length ? undefined : NONE,
      parse: (raw) => acadParse(raw, trend, compare),
    };
  },
};

// ======================= 8) Nhận xét học tập toàn nhà (tổng hợp ẩn danh) =======================
interface HouseSem {
  semester_code: string;
  year_id: string;
  year_code: string;
  students: number;
  avg_gpa4: string | null;
  avg_gpa10: string | null;
  rank_counts: Record<string, number>;
  students_with_failed: number;
  failed_courses: number;
  scholarship: number;
}
const GOOD_RANKS = new Set(["Xuất sắc", "Giỏi"]);

const academicHouseTask: TaskDef<"academic.house_insight"> = {
  code: "academic.house_insight",
  suggestionType: "academic_insight",
  input: z.object({}),
  async prepare(tx) {
    const [pR, yearsR] = await batchRows(tx, [["SELECT app.local_today()::text AS today, app.has_permission('academic.read_aggregate') AS agg"], YEARS_SQL]);
    const { today, agg } = pR[0] as { today: string; agg: boolean };
    if (!agg) throw forbidden("Nhận xét học tập toàn nhà chỉ dành cho người quản lý.");
    const { cur, prev } = pickYears(yearsR as YearRow[], today);
    const ids = [cur?.id, prev?.id].filter((x): x is string => !!x);
    // Hàm DB tự kiểm quyền và bỏ học kỳ có < 3 bảng điểm (k-anonymity) — chỉ số liệu tổng hợp, không tên/trường/mã SV.
    const sems = ids.length
      ? ((await tx.query("SELECT * FROM app.fn_ai_academic_house_stats($1::uuid[])", [ids])).rows as HouseSem[])
      : [];

    const NONE: AiOutputMap["academic.house_insight"] = {
      headline: "Chưa đủ số liệu để nhận xét chung",
      summary: "Mỗi học kỳ cần ít nhất 3 bảng điểm đã nộp để thống kê ẩn danh. Khi đủ số liệu, AI sẽ nhận xét tình hình học tập chung của nhà và so sánh với năm học trước.",
      trend: "unknown",
      points: [],
      suggestions: ["Nhắc anh em nộp bảng điểm học kỳ ở mục Học tập."],
      compare: null,
    };

    const semLabel = (s: HouseSem) => `${SEM_VI[s.semester_code] ?? s.semester_code} ${s.year_code}`;
    const good = (s: HouseSem) => Object.entries(s.rank_counts ?? {}).reduce((a, [k, v]) => a + (GOOD_RANKS.has(k) ? Number(v) : 0), 0);
    const agg2 = (list: HouseSem[]) => {
      if (!list.length) return null;
      const students = list.reduce((a, s) => a + s.students, 0);
      return {
        g4: weighted(list.map((s) => ({ v: numOrNull(s.avg_gpa4), w: s.students }))),
        g10: weighted(list.map((s) => ({ v: numOrNull(s.avg_gpa10), w: s.students }))),
        students,
        goodPct: students ? Math.round((list.reduce((a, s) => a + good(s), 0) / students) * 100) : null,
        withFailed: list.reduce((a, s) => a + s.students_with_failed, 0),
      };
    };
    type Agg = NonNullable<ReturnType<typeof agg2>>;
    const curAgg = cur ? agg2(sems.filter((s) => s.year_id === cur.id)) : null;
    const prevAgg = prev ? agg2(sems.filter((s) => s.year_id === prev.id)) : null;
    const mkRows = (a: Agg | null, b: Agg | null): AcademicInsightRow[] => [
      { label: "GPA trung bình hệ 4", current: a?.g4 ?? null, previous: b?.g4 ?? null, better: "up", decimals: 2 },
      { label: "GPA trung bình hệ 10", current: a?.g10 ?? null, previous: b?.g10 ?? null, better: "up", decimals: 2 },
      { label: "Lượt bảng điểm", current: a?.students ?? null, previous: b?.students ?? null, better: "up", decimals: 0 },
      { label: "Tỷ lệ Giỏi trở lên (%)", current: a?.goodPct ?? null, previous: b?.goodPct ?? null, better: "up", decimals: 0 },
      { label: "Bảng điểm có môn chưa đạt", current: a?.withFailed ?? null, previous: b?.withFailed ?? null, better: "down", decimals: 0 },
    ];
    let compare: AcademicInsightOutput["compare"] = null;
    if (curAgg && prevAgg && cur && prev) {
      compare = { currentLabel: `Năm học ${cur.code}`, previousLabel: `Năm học ${prev.code}`, rows: mkRows(curAgg, prevAgg) };
    } else if (sems.length >= 2) {
      const [b, a] = sems.slice(-2);
      compare = { currentLabel: semLabel(a), previousLabel: semLabel(b), rows: mkRows(agg2([a]), agg2([b])) };
    } else if (sems.length === 1) {
      compare = { currentLabel: semLabel(sems[0]), previousLabel: null, rows: mkRows(agg2(sems), null) };
    }
    const trend = compare ? trendOf(compare.rows[0].current, compare.rows[0].previous) : "unknown";

    const data = [
      `Hôm nay: ${fmtDmy(today)}. Năm học hiện tại: ${cur?.code ?? "không xác định"}; năm học trước: ${prev?.code ?? "không có"}.`,
      "Số liệu tổng hợp ẩn danh theo học kỳ (chỉ gồm học kỳ có từ 3 bảng điểm trở lên):",
      ...sems.map((s) => {
        const ranks = Object.entries(s.rank_counts ?? {})
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .map(([k, v]) => `${clean(k)} ${v}`)
          .join(", ");
        return `- ${semLabel(s)}: ${s.students} bảng điểm; GPA trung bình hệ 4 ${fmtNum(numOrNull(s.avg_gpa4))}, hệ 10 ${fmtNum(numOrNull(s.avg_gpa10))}; xếp loại: ${ranks || "chưa có"}; ${s.students_with_failed} bảng điểm có môn chưa đạt (tổng ${s.failed_courses} môn); ${s.scholarship} người có học bổng.`;
      }),
      ...(curAgg && cur ? [`Tổng hợp năm học ${cur.code}: GPA TB hệ 4 ${fmtNum(curAgg.g4)}, tỷ lệ Giỏi trở lên ${curAgg.goodPct ?? 0}%.`] : []),
      ...(prevAgg && prev ? [`Tổng hợp năm học ${prev.code}: GPA TB hệ 4 ${fmtNum(prevAgg.g4)}, tỷ lệ Giỏi trở lên ${prevAgg.goodPct ?? 0}%.`] : []),
      compare
        ? `So sánh do hệ thống tính: ${compare.currentLabel}${compare.previousLabel ? ` so với ${compare.previousLabel}` : " (chưa có kỳ trước để so sánh)"} — xu hướng GPA: ${TREND_TEXT[trend]}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const user = [
      "Nhận xét tình hình học tập CHUNG của cộng đoàn sinh viên dựa CHỈ vào số liệu tổng hợp ẩn danh trong khối dữ liệu; không suy đoán về bất kỳ cá nhân nào.",
      "So sánh năm học hiện tại với năm học trước nếu có (hoặc theo so sánh học kỳ hệ thống đã nêu). Xu hướng đã do hệ thống tính — không nói ngược lại.",
      ACAD_TONE,
      "headline ≤ 120 ký tự; summary 2–4 câu; points: tối đa 5 ý; suggestions: tối đa 4 gợi ý cho người quản lý để hỗ trợ học tập chung (nhóm học, phụ đạo, giờ học chung…), mang tính khích lệ.",
      ACAD_SCHEMA,
      block(data),
    ].join("\n");

    return {
      system: BASE_SYSTEM,
      user,
      hashInput: JSON.stringify({ sems, cur: cur?.id ?? null, prev: prev?.id ?? null }),
      inputRef: { kind: "academic_house_insight", semesters: sems.length },
      cacheScope: "academic:house",
      shortCircuit: sems.length ? undefined : NONE,
      parse: (raw) => acadParse(raw, trend, compare),
    };
  },
};

// ======================= 9) Trợ lý viết bài công khai =======================
// Người soạn (article.manage) nhờ AI: gợi ý đề tài, phỏng vấn lấy dữ kiện, viết nháp, chỉnh văn, gợi ý tiêu đề + tóm tắt. Bài sẽ đăng CÔNG KHAI nên
// mô hình chỉ được dùng dữ kiện người soạn cung cấp + "THÔNG TIN THẬT" do hệ thống tính (ngày phụng vụ, Bổn mạng, sự kiện của nhà — article-facts.ts);
// chỗ thiếu dữ kiện phải để dấu "[cần bổ sung: …]". Sau khi AI viết, máy chủ tự dò ngày/giờ/số/SĐT không có trong dữ kiện + cụm sáo rỗng (article-verify.ts).
const ARTICLE_CATS = ARTICLE_CATEGORIES.map((c) => c.code) as [string, ...string[]];
const articleIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ideas"), category: z.enum(ARTICLE_CATS), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("questions"), topic: z.string().trim().min(5).max(400), category: z.enum(ARTICLE_CATS) }),
  // Giữ nguyên nội dung (không trim) — trình duyệt đổi số thứ tự đoạn thành vị trí trong văn bản theo cùng cách tách đoạn
  z.object({
    action: z.literal("illustrations"),
    title: z.string().trim().min(3).max(200),
    content: z.string().min(80).max(30000),
    category: z.enum(ARTICLE_CATS),
    max: z.number().int().min(1).max(5).default(3),
  }),
  z.object({
    action: z.literal("draft"),
    topic: z.string().trim().min(5).max(400),
    keyPoints: z.string().trim().max(2000).optional(),
    answers: z.array(z.object({ q: z.string().trim().max(240), a: z.string().trim().max(1200) })).max(6).optional(),
    research: z
      .object({
        // Rộng hơn mức tra cứu trả về (tối đa 12) để không bao giờ bị từ chối chỉ vì đếm lệch; thân yêu cầu vẫn bị chặn ở mức hợp lý
        notes: z.array(z.string().trim().max(400)).max(20),
        sources: z.array(z.object({ title: z.string().trim().max(240), url: z.string().trim().max(700) })).max(20),
      })
      .optional(),
    category: z.enum(ARTICLE_CATS),
    tone: z.enum(["plain", "warm", "formal", "lively"]).default("plain"),
    length: z.enum(["short", "medium", "long"]).default("medium"),
    ending: z.enum(["none", "soft", "contact"]).default("none"),
  }),
  z.object({
    action: z.literal("improve"),
    text: z.string().trim().min(5).max(8000),
    mode: z.enum(["polish", "shorter", "longer", "warmer", "formal", "catchy"]),
  }),
  z.object({ action: z.literal("meta"), content: z.string().trim().min(30).max(14000), title: z.string().trim().max(200).optional() }),
]);
type ArticleIn = z.infer<typeof articleIn>;

/** Phiên bản prompt riêng của trợ lý viết bài (đổi ⇒ bỏ kết quả cache cũ của riêng tác vụ này, không ảnh hưởng tác vụ khác). */
const ARTICLE_PV = "a4";

const ARTICLE_SYSTEM = [
  BASE_SYSTEM,
  "Vai trò: người trong nhà kể lại chuyện của chính cộng đoàn cho NGƯỜI NGOÀI đọc (sinh viên, phụ huynh, giáo dân) trên trang tin công khai.",
  "GIỌNG VĂN: mộc mạc, cụ thể, như người trong nhà kể lại — KHÔNG phải văn quảng cáo hay văn mẫu. Câu ngắn, đoạn ngắn. Ưu tiên chi tiết thật (ai, ở đâu, lúc nào, chuyện gì đã xảy ra, một câu nói, một hình ảnh) lấy từ dữ kiện. Không tâng bốc, không cảm thán liên tiếp, không khẩu hiệu.",
  "NGÔI KỂ: chọn MỘT ngôi và giữ nhất quán — nói về chính cộng đoàn bằng 'chúng ta' hoặc 'lưu xá mình'; đừng viết 'cộng đoàn …' ở ngôi thứ ba rồi chuyển sang 'chúng tôi', rồi 'chúng ta'.",
  "TRÁNH các cụm sáo rỗng: 'trong nhịp sống hối hả', 'hãy cùng', 'hành trình', 'tỏa sáng', 'chắp cánh', 'ngập tràn', 'lan tỏa', 'khoảnh khắc đáng nhớ', 'góp phần xây dựng', 'minh chứng cho', 'điểm tựa', 'ngôi nhà thứ hai', 'hơn bao giờ hết'.",
  "TRÁNH CÁC DẤU HIỆU 'LỘ AI': (1) cấu trúc 'không chỉ/không phải … mà là/mà còn …' — dùng tối đa MỘT lần cả bài, tốt nhất không dùng; (2) lời chứng chung chung không ai cụ thể ('nhiều anh chị em kể lại rằng…', 'chúng tôi thường chia sẻ…', 'họ cảm thấy nhẹ lòng hơn') — chỉ viết khi dữ kiện có chuyện thật; (3) câu đại ngôn không mang thông tin ('vượt qua ranh giới giữa sự sống và cái chết', 'sẽ là điểm nhấn', 'đức tin được sống cụ thể trong đời sống hằng ngày'); (4) lặp một từ hay cụm quá 3 lần (vd. 'hiệp thông', 'cầu nguyện') — hãy đổi cách nói; (5) khối trích dẫn '>' chỉ để nhắc lại ý vừa nói; (6) đoạn kết nhắc lại điều đã nêu hoặc câu tổng kết kiểu khẩu hiệu — kết bằng một câu ngắn, hoặc dừng đúng chỗ hết ý.",
  "THÔNG TIN THIẾT THỰC LÊN TRƯỚC: bài thông báo/mời tham dự thì nêu ngay ở 1–2 đoạn đầu: việc gì, ngày giờ, ở đâu, ai tham dự được, đến/đăng ký bằng cách nào — rồi mới đến suy niệm. Thứ nào dữ kiện không có (tên nhà thờ, địa chỉ, cách gửi ý lễ…) thì ghi [cần bổ sung: …], đừng bỏ qua.",
  "Diễn đạt lại thông tin lịch trong bảng THÔNG TIN THẬT bằng lời thường: đừng chép nguyên nhãn viết hoa hay phần trong ngoặc đơn (vd. 'Theo lịch sinh hoạt nội bộ … (Cầu Cho Các Tín Hữu Đã Qua Đời)'), và đừng nhắc đến 'lịch nội bộ'.",
  "MỖI ĐOẠN MỘT Ý. Chỉ dùng tư liệu tra cứu khi nó phục vụ ý chính của bài — bỏ tư liệu lạc đề, đừng ghép ý rời rạc (vd. quy định riêng của linh mục) cho đủ dài. Thà ngắn mà thật còn hơn dài mà độn: dữ kiện ít thì viết ngắn. Người đọc là sinh viên: giải thích giáo lý bằng 1–2 câu gần gũi, tránh định nghĩa kiểu sách vở.",
  "SỰ THẬT: chỉ nêu ngày, giờ, địa điểm, con số, tên người, sự kiện, ngày lễ có trong khối <du_lieu> (mục THÔNG TIN THẬT hoặc dữ kiện của người soạn). KHÔNG tự nói 'hôm nay là ngày lễ / ngày Bổn mạng …' trừ khi mục THÔNG TIN THẬT ghi đúng như vậy. Chỗ cần dữ kiện mà chưa có thì viết đúng dạng [cần bổ sung: mô tả ngắn thứ còn thiếu].",
  "KHÔNG bịa lời nói hay trích dẫn của người thật (chỉ dùng câu trích khi dữ kiện có ĐÚNG câu đó); KHÔNG thêm chi tiết cảnh (đồ vật, thời tiết, tiếng động, cảm xúc, hành động của người cụ thể) mà dữ kiện không nêu — thiếu chi tiết thì viết ngắn lại hoặc ghi [cần bổ sung: …], đừng tô vẽ cho đủ dài.",
  "KHÔNG tự thêm số điện thoại, địa chỉ hay lời kêu gọi kiểu 'liên hệ ngay / đăng ký ngay' — chỉ làm đúng theo phần KẾT BÀI được yêu cầu.",
  "Trường văn bản bài viết dùng Markdown giới hạn: '## ' tiêu đề mục, '### ' tiêu đề nhỏ, '- ' danh sách, '1. ' danh sách đánh số, '> ' trích dẫn (chỉ khi dữ kiện có đúng câu trích), **chữ đậm**. Không dùng bảng, HTML, hình ảnh hay liên kết. Không lặp lại tiêu đề bài ở đầu nội dung.",
].join("\n");

const TONE_TXT = {
  plain: "mộc mạc, chân thật, như người trong nhà kể lại (ưu tiên chi tiết cụ thể, tránh văn hoa mỹ)",
  warm: "thân thiện, ấm áp, gần gũi",
  formal: "trang trọng, lịch sự, chững chạc",
  lively: "tươi trẻ, năng động, truyền cảm hứng",
} as const;
// Ngắn hơn bản đầu ~25% (bài đánh giá: văn AI hay độn); đây là mức TỐI ĐA, dữ kiện ít thì viết ngắn hơn nữa
const LEN_TXT = { short: "tối đa khoảng 180 từ, 2–3 đoạn", medium: "tối đa khoảng 320 từ, có 2 tiêu đề mục", long: "tối đa khoảng 520 từ, có 3–4 tiêu đề mục" } as const;
const LEN_TOKENS = { short: 1300, medium: 2200, long: 3400 } as const;
const ENDING_TXT = {
  none: "khép bài tự nhiên bằng một câu cuối gắn với nội dung. KHÔNG kêu gọi, KHÔNG ghi số điện thoại hay địa chỉ liên hệ.",
  soft: "kết bằng một lời mời nhẹ nhàng, tối đa MỘT câu, liên quan đến nội dung. KHÔNG ghi số điện thoại hay địa chỉ.",
  contact: "cuối bài có một dòng thông tin liên hệ lấy ĐÚNG từ mục THÔNG TIN LIÊN HỆ (không thêm gì khác) kèm một câu mời ngắn.",
} as const;
const IMPROVE_TXT = {
  polish: "Sửa lỗi chính tả, ngữ pháp và làm câu văn mượt mà, mạch lạc hơn; giữ nguyên ý, độ dài và cấu trúc.",
  shorter: "Rút gọn còn khoảng một nửa, giữ ý chính và dữ kiện quan trọng.",
  longer: "Mở rộng thêm khoảng 50% bằng cách diễn giải, làm rõ ý; KHÔNG thêm dữ kiện mới không có trong văn bản gốc.",
  warmer: "Viết lại với giọng thân thiện, ấm áp, gần gũi hơn; giữ nguyên dữ kiện.",
  formal: "Viết lại với giọng trang trọng, lịch sự, chững chạc hơn; giữ nguyên dữ kiện.",
  catchy: "Viết lại cho cuốn hút, giàu hình ảnh và dễ đọc hơn; mở đầu thật thu hút; giữ nguyên dữ kiện.",
} as const;

const articleOut = z.object({
  ideas: z.array(z.object({ title: str(120, 3), angle: str(200, 3), basis: str(110).optional() })).max(8).optional(),
  questions: z.array(str(160, 5)).max(8).optional(),
  picks: z.array(z.object({ n: z.coerce.number(), reason: str(120).optional() })).max(10).optional(),
  title: str(200, 3).optional(),
  summary: str(400, 3).optional(),
  content: str(14000, 10).optional(),
  text: str(14000, 1).optional(),
  titles: z.array(str(200, 3)).max(8).optional(),
});

/**
 * Giữ nguyên xuống dòng của Markdown; bỏ thẻ HTML và ký tự điều khiển. `plain`: bản nháp do AI viết KHÔNG được có ảnh/liên kết
 * (AI không được tạo ảnh hay đường dẫn) ⇒ bỏ dòng ảnh, liên kết chỉ giữ chữ hiển thị.
 */
const cleanMd = (s: string, max: number, plain = false) => {
  let t = s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  if (plain) t = t.replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\((?:https?:|\/)[^)]*\)/g, "$1");
  return t.trim().slice(0, max);
};

const articleTask: TaskDef<"content.article_assist"> = {
  code: "content.article_assist",
  suggestionType: "article_draft",
  input: articleIn,
  async prepare(tx, input: ArticleIn) {
    await assertArticleManager(tx);
    const needFacts = input.action === "ideas" || input.action === "questions" || input.action === "draft";
    const facts = needFacts ? await buildArticleFacts(tx, { category: "category" in input ? input.category : undefined, withVoice: input.action === "draft" }) : null;
    const org = ((await tx.query("SELECT app.fn_public_org_info() AS o")).rows[0]?.o ?? {}) as Record<string, string>;
    const orgBlock = [`Tên cộng đoàn: ${org["org.house_name"] ?? "Lưu Xá Phanxicô"}`, org["org.order_name"] && `Thuộc: ${org["org.order_name"]}`].filter(Boolean).join("\n");
    const factsBlock = facts ? `THÔNG TIN THẬT (do hệ thống tính, đáng tin cậy):\n${facts.text}` : "";
    const patronFeast = facts?.patronFeast ?? org["org.patron_feast"] ?? null;

    const common = (hashInput: string, inputRef: Record<string, unknown>) => ({
      system: ARTICLE_SYSTEM,
      hashInput: `${ARTICLE_PV}|${facts?.todayIso ?? ""}|${hashInput}`,
      inputRef: { kind: "article_assist", ...inputRef },
    });

    if (input.action === "ideas") {
      const user = [
        "Gợi ý 5 đề tài bài viết cho trang tin công khai của cộng đoàn, hợp thời điểm hôm nay và đúng chuyên mục được chọn.",
        "Chỉ gợi ý đề tài có CƠ SỞ THẬT: một lễ/ngày đặc biệt trong mục THÔNG TIN THẬT, một sự kiện sắp tới của nhà, hoặc một chủ đề thường niên của lưu xá (đời sống chung, tìm hiểu vào ở, đức tin, học tập). Không bịa sự kiện. Không trùng các bài đã đăng.",
        "Mỗi đề tài gồm: title (tiêu đề tự nhiên ≤ 100 ký tự), angle (1 câu nêu góc viết ≤ 180 ký tự) và basis (cơ sở của đề tài ≤ 100 ký tự, vd. 'Lễ Các Thánh 01/11' hoặc 'Chủ đề thường niên'). Các đề tài phải khác nhau rõ rệt.",
        'Lược đồ: {"ideas":[{"title":"…","angle":"…","basis":"…"}]}',
        block(`${orgBlock}\n${factsBlock}\nChuyên mục: ${articleCategoryLabel(input.category)}${input.note ? `\nGhi chú của người soạn: ${input.note}` : ""}`),
      ].join("\n");
      return {
        ...common(`ideas|${input.category}|${input.note ?? ""}`, { action: "ideas" }),
        user,
        temperature: 0.6,
        maxOutputTokens: 1000,
        parse(raw) {
          const o = articleOut.parse(raw);
          const ideas = (o.ideas ?? [])
            .slice(0, 6)
            .map((i) => ({ title: sanitizeOutput(i.title, 120), angle: sanitizeOutput(i.angle, 200), basis: i.basis ? sanitizeOutput(i.basis, 110) : undefined }))
            .filter((i) => i.title);
          if (!ideas.length) throw new Error("thiếu ideas");
          return { action: "ideas", ideas };
        },
      };
    }

    if (input.action === "questions") {
      const user = [
        "Bạn là phóng viên của trang tin. Người soạn muốn viết về chủ đề dưới đây nhưng chưa có đủ chi tiết. Hãy đặt 4–5 CÂU HỎI NGẮN (mỗi câu ≤ 140 ký tự, tiếng Việt, xưng 'bạn') để họ kể lại dữ kiện THẬT: ai / ở đâu / khi nào, chuyện gì đã xảy ra, một chi tiết hay câu nói đáng nhớ, kết quả hoặc cảm nhận.",
        "Chỉ hỏi điều chưa có trong chủ đề hay mục THÔNG TIN THẬT. Không đoán đáp án, không đưa ví dụ bịa.",
        'Lược đồ: {"questions":["…","…"]}',
        block(`${factsBlock}\nChuyên mục: ${articleCategoryLabel(input.category)}\nChủ đề: ${input.topic}`),
      ].join("\n");
      return {
        ...common(`questions|${input.category}|${input.topic}`, { action: "questions" }),
        user,
        temperature: 0.5,
        maxOutputTokens: 700,
        parse(raw) {
          const o = articleOut.parse(raw);
          const questions = (o.questions ?? []).map((q) => sanitizeOutput(q, 160)).filter((q) => q.length >= 5).slice(0, 5);
          if (questions.length < 2) throw new Error("thiếu questions");
          return { action: "questions", questions };
        },
      };
    }

    if (input.action === "illustrations") {
      const paras = splitParagraphs(input.content);
      const eligible = illustratableParagraphs(paras);
      if (!eligible.length) {
        // Không có đoạn nào hợp để minh họa ⇒ trả lời ngay, không gọi mô hình
        return { ...common("illustrations|none", { action: "illustrations" }), user: "", shortCircuit: { action: "illustrations" as const, spots: [] }, parse: () => ({ action: "illustrations" as const, spots: [] }) };
      }
      const max = Math.min(input.max, eligible.length);
      const valid = new Set(eligible.map((p) => p.index));
      const list = eligible.map((p) => `[${p.index}] ${p.text.replace(/\s+/g, " ").slice(0, 280)}`).join("\n");
      const user = [
        `Bạn là biên tập viên ảnh của trang tin. Chọn từ ${Math.min(2, max)} đến ${max} đoạn trong bài nên có ảnh minh họa nhất.`,
        "Ưu tiên đoạn tả cảnh, đồ vật, không khí, hoạt động (ảnh vẽ được: nến, nhà thờ, bàn ăn, sân, hoa…). Tránh đoạn chỉ có giờ giấc/địa chỉ/số liệu và đoạn kết; đừng chọn hai đoạn đứng liền nhau; trải đều trong bài.",
        'Mỗi lựa chọn gồm n (số trong ngoặc vuông của đoạn) và reason (một câu tiếng Việt ≤ 90 ký tự nói vì sao đoạn đó hợp để minh họa). Lược đồ: {"picks":[{"n":3,"reason":"…"}]}',
        block(`Tiêu đề bài: ${input.title}\nChuyên mục: ${articleCategoryLabel(input.category)}\nCác đoạn (đánh số):\n${list}`),
      ].join("\n");
      return {
        ...common(`illustrations|${input.title}|${input.content}`, { action: "illustrations" }),
        user,
        temperature: 0.3,
        maxOutputTokens: 600,
        parse(raw) {
          const o = articleOut.parse(raw);
          const spots: { index: number; reason: string }[] = [];
          for (const p of o.picks ?? []) {
            const n = Math.round(p.n);
            if (!valid.has(n) || spots.some((x) => Math.abs(x.index - n) < 2)) continue; // đoạn lạ hoặc sát đoạn đã chọn
            spots.push({ index: n, reason: sanitizeOutput(p.reason ?? "", 120) });
            if (spots.length >= max) break;
          }
          if (!spots.length) throw new Error("thiếu picks");
          return { action: "illustrations", spots: spots.sort((a, b) => a.index - b.index) };
        },
      };
    }

    if (input.action === "draft") {
      const answers = (input.answers ?? []).filter((a) => a.a.trim());
      const notes = input.research?.notes ?? [];
      const material = (input.keyPoints ?? "").length + answers.reduce((n, a) => n + a.a.length, 0) + notes.join(" ").length;
      const thin = material < 40;
      const length = thin ? "short" : input.length;
      const contactBlock = input.ending === "contact" ? `\nTHÔNG TIN LIÊN HỆ:\n${facts!.contact || "(chưa có thông tin liên hệ — ghi [cần bổ sung: thông tin liên hệ])"}` : "";
      const researchBlock = notes.length
        ? `\nTư liệu đã tra cứu (người soạn đã chọn; chỉ dùng khi LIÊN QUAN TRỰC TIẾP đến chủ đề, diễn đạt lại bằng lời của nhà, không chép nguyên văn; mục nào lạc đề thì bỏ qua):\n${notes.map((n) => `- ${n}`).join("\n")}`
        : "";
      const answersBlock = answers.length ? `\nTrả lời của người soạn cho các câu hỏi:\n${answers.map((a) => `- Hỏi: ${a.q}\n  Đáp: ${a.a}`).join("\n")}` : "";
      const voiceBlock = facts!.voice.length
        ? "\n" + block(`MẪU GIỌNG VĂN của nhà (chỉ để học cách viết; KHÔNG dùng lại dữ kiện, tên hay câu chữ trong đó):\n${facts!.voice.map((v) => `[${v.title}] ${v.sample}`).join("\n")}`)
        : "";
      const user = [
        "Viết một bài đăng cho trang tin công khai của cộng đoàn theo chủ đề và dữ kiện dưới đây.",
        `Giọng văn: ${TONE_TXT[input.tone]}. Độ dài: ${LEN_TXT[length]}.`,
        `KẾT BÀI: ${ENDING_TXT[input.ending]}`,
        thin
          ? "LƯU Ý QUAN TRỌNG: người soạn CHƯA cung cấp dữ kiện thật nào. Chỉ viết KHUNG bài ngắn (mở đầu 2–3 câu + 2–3 mục ngắn); ở mỗi chỗ cần chi tiết thật hãy ghi [cần bổ sung: …]. Tuyệt đối không bịa."
          : "",
        "title: tiêu đề tự nhiên ≤ 110 ký tự, không viết IN HOA toàn bộ; summary: 1–2 câu tóm tắt ≤ 300 ký tự; content: thân bài Markdown (không lặp lại tiêu đề).",
        'Lược đồ: {"title":"…","summary":"…","content":"…"}',
        block(
          `${orgBlock}\n${factsBlock}\nChuyên mục: ${articleCategoryLabel(input.category)}\nChủ đề: ${input.topic}${input.keyPoints ? `\nCác ý chính / dữ kiện người soạn cung cấp:\n${input.keyPoints}` : ""}${answersBlock}${researchBlock}${contactBlock}`,
        ) + voiceBlock,
      ]
        .filter(Boolean)
        .join("\n");
      // Toàn bộ dữ kiện hợp lệ — mọi ngày/giờ/số trong bài phải có ở đây, không thì bị đánh dấu
      const sourceText = [input.topic, input.keyPoints ?? "", ...answers.flatMap((a) => [a.q, a.a]), ...notes, facts!.text, input.ending === "contact" ? facts!.contact : "", orgBlock].join("\n");
      return {
        ...common(
          `draft|${input.category}|${input.topic}|${input.keyPoints ?? ""}|${answers.map((a) => a.a).join("¦")}|${notes.join("¦")}|${input.tone}|${length}|${input.ending}`,
          { action: "draft", length },
        ),
        user,
        temperature: 0.55,
        maxOutputTokens: LEN_TOKENS[length],
        timeoutMs: 60_000,
        parse(raw) {
          const o = articleOut.parse(raw);
          if (!o.title || !o.content) throw new Error("thiếu title/content");
          const title = sanitizeOutput(o.title, 200);
          const summary = sanitizeOutput(o.summary ?? "", 400);
          const content = cleanMd(o.content, 14000, true);
          const flags: DraftFlag[] = [
            ...findUnsupported(`${title}\n${summary}\n${content}`, sourceText, { patronFeast }),
            ...findClichesIn(`${title}\n${summary}\n${content}`, { allowContact: input.ending === "contact", source: sourceText }),
          ].slice(0, 30);
          return { action: "draft", title, summary, content, flags, thin };
        },
      };
    }

    if (input.action === "improve") {
      const user = [
        `Nhiệm vụ: ${IMPROVE_TXT[input.mode]}`,
        "Giữ nguyên định dạng Markdown của văn bản gốc (tiêu đề ##, danh sách, chữ đậm; các dòng ![…](…) nếu có phải giữ NGUYÊN VẸN). Không thêm lời dẫn hay giải thích, chỉ trả về văn bản đã chỉnh.",
        'Lược đồ: {"text":"…"}',
        block(`Văn bản cần chỉnh:\n${input.text}`),
      ].join("\n");
      // Tiếng Việt ≈ 1 token / 1,8 ký tự: đầu ra phải đủ chỗ cho cả đoạn (trước đây cố định 2.600 token ⇒ đoạn dài bị cắt cụt JSON)
      const base = Math.ceil(input.text.length / 1.8);
      const factor = input.mode === "longer" ? 1.7 : input.mode === "shorter" ? 0.8 : 1.15;
      return {
        ...common(`improve|${input.mode}|${input.text}`, { action: "improve", mode: input.mode }),
        user,
        temperature: 0.5,
        maxOutputTokens: Math.min(8000, Math.max(700, Math.ceil(base * factor) + 300)),
        timeoutMs: Math.min(90_000, 30_000 + input.text.length * 5),
        parse(raw) {
          const o = articleOut.parse(raw);
          if (!o.text) throw new Error("thiếu text");
          const text = cleanMd(o.text, 14000);
          // Chỉnh văn không được thêm ngày/giờ/số mới so với bản gốc
          return { action: "improve", text, flags: findUnsupported(text, input.text, { patronFeast }).slice(0, 12) };
        },
      };
    }

    // meta
    const user = [
      "Đọc bài viết dưới đây và gợi ý: 4 tiêu đề khác nhau (tự nhiên, ≤ 100 ký tự, trung thực với nội dung, không giật tít) và 1 đoạn tóm tắt 1–2 câu (≤ 300 ký tự) dùng khi chia sẻ link lên Zalo/Facebook.",
      'Lược đồ: {"titles":["…","…","…","…"],"summary":"…"}',
      block(`${input.title ? `Tiêu đề hiện tại: ${input.title}\n` : ""}Nội dung:\n${input.content}`),
    ].join("\n");
    return {
      ...common(`meta|${input.title ?? ""}|${input.content}`, { action: "meta" }),
      user,
      temperature: 0.6,
      maxOutputTokens: 700,
      parse(raw) {
        const o = articleOut.parse(raw);
        const titles = (o.titles ?? []).map((t) => sanitizeOutput(t, 200)).filter(Boolean).slice(0, 5);
        if (!titles.length || !o.summary) throw new Error("thiếu titles/summary");
        return { action: "meta", titles, summary: sanitizeOutput(o.summary, 400) };
      },
    };
  },
};

export const TASKS: { [C in AiTaskCode]: TaskDef<C> } = {
  "finance.dues_message": duesTask,
  "community.policy_rag": ragTask,
  "community.moderation": modTask,
  "facility.issue_triage": triageTask,
  "community.minutes": minutesTask,
  "finance.monthly_insight": financeInsightTask,
  "academic.insight": academicSelfTask,
  "academic.house_insight": academicHouseTask,
  "content.article_assist": articleTask,
  "content.article_research": articleResearchTask,
  "content.article_image": articleImageTask,
  "content.image_caption": imageCaptionTask,
};

export function parseInput(code: AiTaskCode, raw: unknown) {
  const r = TASKS[code].input.safeParse(raw);
  if (!r.success) {
    throw badRequest(
      "Dữ liệu gửi cho AI không hợp lệ.",
      r.error.issues.map((i) => ({ field: i.path.join(".") || "input", message: i.message })),
    );
  }
  return r.data;
}
