import "server-only";
import type { Tx } from "../db";
import { guideChunks } from "./knowledge";
import { privacyPolicy } from "@/content/legal-privacy";
import { termsOfUse } from "@/content/legal-terms";
import type { LegalDoc } from "@/content/legal";
import { NHA_TRANG_CHURCH_GROUPS } from "@/lib/nha-trang-churches";

// ---------------------------------------------------------------------
// Ẩn danh hóa trước khi gửi dịch vụ ngoài (BR-AI-06): email, số điện thoại, dãy số dài (CCCD/STK), liên kết,
// và tên thành viên (đối chiếu danh sách thành viên mà người gọi được phép thấy qua RLS).
//
// Che tên (createNameMasker): một bộ che dùng chung cho cả lời nhắn (câu hỏi, lịch sử) lẫn tài liệu gửi kèm ⇒ cùng một người luôn mang
// cùng nhãn "Thành viên A" trong toàn prompt; unmask() trả lại tên thật trong câu trả lời trước khi hiển thị (nhà cung cấp không thấy tên).
//   • Họ tên đầy đủ / tên gọi nhiều chữ ("Minh Tuấn"): khớp không phân biệt hoa thường.
//   • Tên một chữ ("Tuấn", "Đức", "Bảo"…) dễ trùng từ thường ("Đức tin", "Bảo mật", "Thông báo", "Việt Nam") nên chỉ che khi:
//     (a) đứng sau từ xưng hô (anh, em, bạn, chị, cậu, ông, thầy, a., e.) — kể cả gõ thường "anh tuấn" trong câu hỏi; hoặc
//     (b) viết hoa đúng như tên VÀ không tạo thành cụm danh từ riêng với chữ liền trước/sau ("Đức Mẹ", "Kinh Thánh", "Nha Trang")
//         VÀ cặp chữ đó không phải từ ghép thông dụng (tra bộ cặp chữ lấy từ sách hướng dẫn, văn bản pháp lý, tên giáo xứ + danh sách bổ sung).
// ---------------------------------------------------------------------

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const PHONE = /(?<!\d)(?:\+?84|0)[\s.-]?\d{2,3}(?:[\s.-]?\d{3}){2}(?!\d)/g;
const LONG_DIGITS = /\b\d{9,}\b/g;

export function maskPatterns(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(URL_RE, "[liên kết]")
    .replace(PHONE, "[số điện thoại]")
    .replace(LONG_DIGITS, "[số]");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const lower = (s: string) => s.toLocaleLowerCase("vi");
const isCap = (w: string) => /^\p{Lu}/u.test(w);
const WORD = /[\p{L}\p{N}]+/gu;

/** Từ ghép thông dụng có chứa một chữ hay dùng làm tên (bổ sung cho bộ cặp chữ tự lấy từ văn bản của ứng dụng). */
const EXTRA_BIGRAMS = [
  "đức tin", "đức mẹ", "đức chúa", "đức cha", "đức ông", "đức bà", "đức giáo", "đức thánh", "đức kitô", "đức giêsu", "đức maria", "đức trinh",
  "đức hồng", "đức tổng", "đức ái", "đức cậy", "đức mến", "đức khiêm", "đức vâng", "đức hạnh", "đức tính", "đức độ", "đạo đức", "nhân đức",
  "phúc âm", "hạnh phúc", "chúc phúc", "phúc lợi", "bình an", "an toàn", "an ninh", "an tâm", "bình thường", "bình yên", "hòa bình", "hòa thuận",
  "thánh tâm", "thánh gia", "thiên chúa", "chúa giêsu", "kinh thánh", "tin mừng", "việt nam", "tiếng việt", "nha trang", "khánh hòa", "phan rang",
  "tín chỉ", "uy tín", "minh chứng", "minh bạch", "trung tâm", "trung thực", "trung bình", "phong trào", "phong cách", "nghĩa vụ", "ý nghĩa",
  "tâm hồn", "tâm lý", "quan tâm", "tài khoản", "tài chính", "tài liệu", "tài sản", "thông báo", "thông tin", "thông thường", "bảo mật", "bảo vệ",
  "bảo trì", "bảo quản", "bảo đảm", "khôi phục", "phát triển", "phát hiện", "duy trì", "duy nhất", "toàn bộ", "toàn thể", "công giáo", "công việc",
  "công khai", "thành viên", "thành phố", "thành công", "thành lập", "thành tích", "lưu xá", "nhà chung", "sinh viên", "giáo xứ", "giáo phận",
  "linh mục", "học tập", "hiếu thảo", "hiếu học", "khoa học", "vinh quang", "vinh danh", "thiện nguyện", "huy hiệu", "lợi ích", "quang cảnh",
  "hùng vĩ", "dũng cảm", "kiên nhẫn", "trí tuệ", "nhân ái", "lâm thời", "hưng thịnh", "thịnh vượng", "phú quý", "quý giá", "sang trọng",
];

let bigramCache: Set<string> | null = null;

function docText(d: LegalDoc): string {
  const out: string[] = [d.title, d.subtitle, ...d.summary];
  for (const s of d.sections) {
    out.push(s.title);
    for (const b of s.blocks) {
      if (b.t === "md" || b.t === "callout") out.push(b.text);
      else if (b.t === "table") out.push(b.head.join(". "), ...b.rows.map((r) => r.join(". ")));
    }
  }
  return out.join("\n");
}

/** Cặp chữ liền nhau (viết thường) trong văn bản tĩnh của ứng dụng — từ ghép thông dụng, KHÔNG phải tên người. Tính một lần. */
function knownBigrams(): Set<string> {
  if (bigramCache) return bigramCache;
  const set = new Set<string>(EXTRA_BIGRAMS);
  const org = { about: null, patronFeast: null, houseName: "Lưu Xá Phanxicô", motto: null, address: null, phone: null, orderName: null, patronName: null };
  const corpus = [
    ...guideChunks().map((c) => `${c.title}\n${c.text}`),
    docText(privacyPolicy(org)),
    docText(termsOfUse(org)),
    ...NHA_TRANG_CHURCH_GROUPS.flatMap((g) => [g.label, ...g.items.map((i) => `${i.name}. ${i.hint ?? ""}`)]),
  ];
  for (const text of corpus) {
    // cắt theo dấu câu ⇒ chỉ ghép hai chữ trong cùng một cụm
    for (const part of norm(text).split(/[.,;:!?()[\]{}"“”'‘’\n•·|*_#>/\\–—-]+/u)) {
      const words = part.match(WORD) ?? [];
      for (let i = 0; i + 1 < words.length; i++) set.add(`${lower(words[i])} ${lower(words[i + 1])}`);
    }
  }
  bigramCache = set;
  return set;
}

const HONORIFIC = "anh|em|bạn|chị|cậu|ông|thầy|a\\.|e\\.";
/** Dấu hiệu đầu câu / đầu ý (chữ ngay sau đó viết hoa vì là đầu câu, không hẳn là tên riêng) */
const SENTENCE_BREAK = /(^|[.!?:;\n•\-–—"“(…])\s*$/u;

export interface NameMasker {
  /** Che tên thành viên trong một đoạn (đã che email/SĐT/liên kết trước hay chưa đều được). Nhãn dùng chung trong cùng bộ che. */
  mask(text: string, opts?: { loose?: boolean }): string;
  /** Trả tên thật vào chỗ các nhãn "Thành viên X" (dùng cho câu trả lời trước khi hiển thị). */
  unmask(text: string): string;
  /** Chuỗi mô tả các nhãn đã dùng (đưa vào chuỗi băm cache để câu hỏi về hai người khác nhau không dùng chung kết quả). */
  signature(): string;
  /** Số người đã bị che */
  readonly count: number;
}

interface Entry {
  /** Khóa người (id thành viên, hoặc "s:<tên>" khi tên một chữ trùng nhiều người) */
  key: string;
}

/** Bộ che tên theo danh sách thành viên người gọi thấy được (RLS). */
export async function createNameMasker(tx: Tx): Promise<NameMasker> {
  const rows = (await tx.query<{ id: string; full_name: string | null; display_name: string | null }>("SELECT id, full_name, display_name FROM members")).rows;
  const multi = new Map<string, Entry>(); // tên nhiều chữ (viết thường) → người
  const single = new Map<string, Entry>(); // tên một chữ (giữ nguyên chữ hoa) → người
  const singleOwners = new Map<string, Set<string>>();
  for (const r of rows) {
    const full = norm(r.full_name ?? "");
    if (!full || full === "[Đã ẩn danh]") continue;
    const disp = norm(r.display_name ?? "");
    const fw = full.split(" ");
    const forms = new Set<string>([full, disp]);
    if (fw.length >= 3) forms.add(fw.slice(-2).join(" "));
    forms.add(fw[fw.length - 1]);
    for (const f of forms) {
      if (!f || f.startsWith("Cựu TV")) continue;
      if (f.includes(" ")) {
        if (f.length >= 4 && !multi.has(lower(f))) multi.set(lower(f), { key: r.id });
      } else if (f.length >= 2) {
        const owners = singleOwners.get(f) ?? new Set<string>();
        owners.add(r.id);
        singleOwners.set(f, owners);
      }
    }
  }
  for (const [f, owners] of singleOwners) single.set(f, { key: owners.size === 1 ? [...owners][0] : `s:${lower(f)}` });

  const multiRe = multi.size
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...multi.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu")
    : null;
  const singleNames = [...single.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const honorRe = single.size ? new RegExp(`(?<![\\p{L}\\p{N}])(${HONORIFIC})(\\s+)(${singleNames})(?![\\p{L}\\p{N}])`, "giu") : null;
  const capRe = single.size ? new RegExp(`(?<![\\p{L}\\p{N}])(${singleNames})(?![\\p{L}\\p{N}])`, "gu") : null;
  const bigrams = single.size ? knownBigrams() : new Set<string>();

  const labels = new Map<string, string>(); // khóa người → nhãn
  const surfaces = new Map<string, string>(); // nhãn → tên gốc gặp đầu tiên
  const order: string[] = [];
  const labelFor = (key: string, surface: string) => {
    let l = labels.get(key);
    if (!l) {
      const i = labels.size;
      l = `Thành viên ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
      labels.set(key, l);
      surfaces.set(l, surface);
      order.push(l);
    }
    return l;
  };
  const PH = (l: string) => `\u0001${order.indexOf(l)}\u0002`; // chỗ giữ nhãn (không chứa chữ ⇒ không bị khớp lại)

  const mask = (input: string, opts: { loose?: boolean } = {}): string => {
    let s = input.normalize("NFC");
    if (multiRe) s = s.replace(multiRe, (m) => PH(labelFor(multi.get(lower(norm(m)))!.key, m)));
    if (honorRe) {
      s = s.replace(honorRe, (m: string, h: string, sp: string, name: string, off: number, whole: string) => {
        // Tài liệu (không phải lời người hỏi): tên sau xưng hô vẫn phải viết hoa ("bạn bình tĩnh" không phải tên)
        const exact = single.get(name) ?? (opts.loose ? [...single.entries()].find(([k]) => lower(k) === lower(name))?.[1] : undefined);
        if (!exact) return m;
        if (!isCap(name)) {
          const after = /^[ \t]+([\p{L}\p{N}]+)/u.exec(whole.slice(off + m.length, off + m.length + 60))?.[1];
          if (after && bigrams.has(`${lower(name)} ${lower(after)}`)) return m;
        }
        return `${h}${sp}${PH(labelFor(exact.key, name))}`;
      });
    }
    if (capRe) {
      s = s.replace(capRe, (m: string, _n: string, off: number, whole: string) => {
        const e = single.get(m);
        if (!e || !isCap(m)) return m;
        const before = whole.slice(Math.max(0, off - 60), off);
        const after = whole.slice(off + m.length, off + m.length + 60);
        const prevM = /([\p{L}\p{N}]+)([ \t]+)$/u.exec(before);
        const nextM = /^[ \t]+([\p{L}\p{N}]+)/u.exec(after);
        const prev = prevM?.[1] ?? null;
        const next = nextM?.[1] ?? null;
        if (next && isCap(next)) return m; // "Đức Mẹ", "Việt Nam", "Phúc Âm"
        if (prev && isCap(prev)) {
          const prevInitial = SENTENCE_BREAK.test(before.slice(0, before.length - (prevM?.[0].length ?? 0)));
          if (!prevInitial) return m; // "Kinh Thánh", "Nha Trang" giữa câu
          if (bigrams.has(`${lower(prev)} ${lower(m)}`)) return m;
        }
        if (next && bigrams.has(`${lower(m)} ${lower(next)}`)) return m; // "Thông báo", "Bảo mật", "Đức tin" đầu câu
        if (prev && bigrams.has(`${lower(prev)} ${lower(m)}`)) return m; // "tiếng Việt"
        return PH(labelFor(e.key, m));
      });
    }
    return s.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => order[Number(i)] ?? "Thành viên");
  };

  const unmask = (text: string): string =>
    order.length
      ? text.replace(/(thành viên) ([A-Z]\d*)(?![\p{L}\p{N}])/giu, (m, _p: string, code: string) => surfaces.get(`Thành viên ${code.toUpperCase()}`) ?? m)
      : text;

  return {
    mask,
    unmask,
    signature: () => order.map((l) => `${l}=${surfaces.get(l)}`).join(";"),
    get count() {
      return order.length;
    },
  };
}

/** Thay tên thành viên bằng "Thành viên A/B/…" (ổn định trong cùng một văn bản). */
export async function maskMemberNames(tx: Tx, text: string): Promise<string> {
  return (await createNameMasker(tx)).mask(text);
}

export async function maskText(tx: Tx, text: string, withNames: boolean): Promise<string> {
  const base = maskPatterns(text);
  return withNames ? maskMemberNames(tx, base) : base;
}

/** Bỏ thẻ HTML/liên kết/ký tự điều khiển khỏi đầu ra mô hình trước khi hiển thị (BR-AI-07). */
export function sanitizeOutput(s: string, max: number): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(URL_RE, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}
