// Kiểm chứng bản nháp do AI viết — thuần tính toán (chạy được ở máy chủ lẫn trình duyệt, KHÔNG gọi AI).
// Ý tưởng: mọi ngày / giờ / số điện thoại / con số trong bài phải có trong "dữ kiện" (chủ đề, ý chính, câu trả lời phỏng vấn, tư liệu tra cứu,
// bảng thông tin thật của hệ thống). Cái nào AI tự thêm vào mà dữ kiện không có thì bị đánh dấu để người soạn kiểm lại trước khi đăng.
// Ngoài ra: ngày Bổn mạng nêu sai so với cấu hình, và các cụm từ sáo rỗng thường gặp ở văn do AI viết.

export type DraftFlagKind = "date" | "time" | "phone" | "number" | "quote" | "claim" | "patron" | "repeat" | "cliche" | "cta";

/** Cờ "mềm" (gợi ý văn phong) — không tính là chi tiết sai sự thật cần kiểm chứng. */
export const SOFT_FLAG_KINDS: ReadonlySet<DraftFlagKind> = new Set<DraftFlagKind>(["cliche", "cta", "repeat"]);

export interface DraftFlag {
  kind: DraftFlagKind;
  /** Đoạn chữ nguyên văn trong bài (để tìm và chọn lại trong khung soạn). */
  text: string;
  /** Giải thích ngắn (chỉ một số loại). */
  note?: string;
}

export const FLAG_LABEL: Record<DraftFlagKind, string> = {
  date: "Ngày chưa có trong dữ kiện",
  time: "Giờ chưa có trong dữ kiện",
  phone: "Số điện thoại chưa có trong dữ kiện",
  number: "Con số chưa có trong dữ kiện",
  quote: "Lời trích dẫn chưa có trong dữ kiện",
  claim: "Lời chứng chung chung về cộng đoàn (chưa có trong dữ kiện)",
  repeat: "Từ/cụm lặp quá nhiều lần",
  patron: "Ngày Bổn mạng khác cấu hình",
  cliche: "Cụm từ sáo rỗng hay gặp ở văn AI",
  cta: "Lời kêu gọi / thông tin liên hệ",
};

const boundaryBefore = (text: string, i: number) => i === 0 || !/[\d/.\-]/.test(text[i - 1]);

function dmKey(d: string, m: string): string | null {
  const dd = +d;
  const mm = +m;
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 ? `${dd}/${mm}` : null;
}

interface Hit {
  key: string;
  raw: string;
}

/** Ngày dạng 13/10, 13/10/2026, 13.10.2026, 13-10-2026, "ngày 13 tháng 10", "13 tháng 10 năm 2026" ⇒ khóa "d/m" (bỏ năm). */
function dateHits(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?(?![\d/])/g)) {
    if (!boundaryBefore(text, m.index!)) continue;
    const k = dmKey(m[1], m[2]);
    if (k) out.push({ key: k, raw: m[0] });
  }
  // Dấu chấm/gạch ngang chỉ coi là ngày khi có đủ ngày-tháng-năm (tránh "10-12 người", "3.5")
  for (const m of text.matchAll(/(\d{1,2})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{4})(?!\d)/g)) {
    if (!boundaryBefore(text, m.index!)) continue;
    const k = dmKey(m[1], m[2]);
    if (k) out.push({ key: k, raw: m[0] });
  }
  for (const m of text.matchAll(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+\d{4})?/gi)) {
    const k = dmKey(m[1], m[2]);
    if (k) out.push({ key: k, raw: m[0] });
  }
  return out;
}

const hmKey = (h: string, mm?: string): string | null => {
  const hh = +h;
  const m = mm ? +mm : 0;
  return hh >= 0 && hh <= 24 && m >= 0 && m < 60 ? `${hh}:${String(m).padStart(2, "0")}` : null;
};

/** Giờ dạng 7h30, 19h, 19:30, "lúc 7 giờ 30" ⇒ khóa "h:mm". Chữ "giờ" chỉ tính khi có từ chỉ thời điểm đứng trước (không bắt "kéo dài 2 giờ"). */
function timeHits(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(/(\d{1,2})\s*h\s*(\d{2})?(?![\p{L}\d])/giu)) {
    const k = hmKey(m[1], m[2]);
    if (k) out.push({ key: k, raw: m[0].trim() });
  }
  for (const m of text.matchAll(/(\d{1,2}):(\d{2})(?!\d)/g)) {
    const k = hmKey(m[1], m[2]);
    if (k) out.push({ key: k, raw: m[0] });
  }
  for (const m of text.matchAll(/(?:lúc|vào|từ|đến|tới|trước|sau|khoảng|hồi)\s+(\d{1,2})\s*giờ(?:\s*(\d{1,2}))?/giu)) {
    const k = hmKey(m[1], m[2]);
    if (k) out.push({ key: k, raw: m[0] });
  }
  return out;
}

const phoneNorm = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.startsWith("84") ? "0" + d.slice(2) : d;
};

/** Số điện thoại Việt Nam (10–11 số, có thể kèm +84, dấu cách/chấm/gạch). */
function phoneHits(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(/(?:\+?84|0)(?:[\s.\-]?\d){9,10}/g)) {
    if (!boundaryBefore(text, m.index!)) continue;
    const n = phoneNorm(m[0]);
    if (n.length >= 10 && n.length <= 11) out.push({ key: n, raw: m[0].trim() });
  }
  return out;
}

const MONEY_UNITS = "%|đồng|đ|vnđ|vnd|nghìn|ngàn|triệu|tỷ|người|bạn|sinh viên|thành viên|suất|giường|phòng|phút|giờ";
const OTHER_UNITS = "buổi|tuần|ngày|tháng|năm|km|tiết|học kỳ|khóa";

/** Con số kèm đơn vị. Tiền/phần trăm/số người: mọi số ≥ 2; đơn vị thời gian: chỉ số > 31 (tránh "3 tuần", "2 buổi"). Khóa = chữ số liền (bỏ dấu . ,). */
function numberHits(text: string): Hit[] {
  const out: Hit[] = [];
  const re = new RegExp(`(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(${MONEY_UNITS}|${OTHER_UNITS})(?![\\p{L}])`, "giu");
  for (const m of text.matchAll(re)) {
    if (!boundaryBefore(text, m.index!)) continue;
    const digits = m[1].replace(/[.,]/g, "");
    const n = +digits;
    const unit = m[2].toLowerCase();
    const money = new RegExp(`^(${MONEY_UNITS})$`, "iu").test(unit);
    if (money ? n < 2 : n <= 31) continue;
    out.push({ key: digits, raw: m[0].trim() });
  }
  return out;
}

/** Mọi dãy chữ số trong văn bản nguồn (bỏ dấu . ,) — để đối chiếu con số. */
function digitRuns(text: string): Set<string> {
  const s = new Set<string>();
  for (const m of text.matchAll(/\d[\d.,]*/g)) {
    s.add(m[0].replace(/[.,]/g, ""));
    // "1.5" / "2,5" hiểu cả khi nguồn viết khác dấu: thêm từng phần
    for (const part of m[0].split(/[.,]/)) if (part) s.add(part);
  }
  return s;
}

/** Ngày Bổn mạng cấu hình dạng "MM-DD" hoặc "DD/MM" ⇒ "d/m". */
export function feastKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let m = /^(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (m) return dmKey(m[2], m[1]);
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(raw.trim());
  return m ? dmKey(m[1], m[2]) : null;
}

/** Chuẩn hóa để so khớp câu trích: chữ thường, bỏ dấu câu, gộp khoảng trắng. */
const normQuote = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Lời trích dẫn trong bài: dòng bắt đầu bằng "> " hoặc câu đặt trong dấu ngoặc kép kiểu “…” / "…" dài từ 5 từ trở lên. */
function quoteHits(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(/^[ \t]*>[ \t]*(.+)$/gm)) out.push({ key: normQuote(m[1]), raw: m[1].trim() });
  for (const m of text.matchAll(/[“"]([^”"\n]{25,300})[”"]/g)) {
    if (!out.some((o) => o.raw.includes(m[1]))) out.push({ key: normQuote(m[1]), raw: m[0] });
  }
  return out.filter((h) => h.key.split(" ").length >= 5);
}

const uniq = (flags: DraftFlag[]) => {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = `${f.kind}|${f.text.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Ngày/giờ/số điện thoại/con số trong `output` mà `source` (toàn bộ dữ kiện đã đưa cho AI) không có.
 * `patronFeast`: ngày Bổn mạng cấu hình — bài nói "Bổn mạng" cạnh một ngày khác ⇒ đánh dấu.
 */
export function findUnsupported(outputRaw: string, sourceRaw: string, opts: { patronFeast?: string | null } = {}): DraftFlag[] {
  const output = outputRaw.normalize("NFC");
  const source = sourceRaw.normalize("NFC");
  const flags: DraftFlag[] = [];
  const srcDates = new Set(dateHits(source).map((h) => h.key));
  const srcTimes = new Set(timeHits(source).map((h) => h.key));
  const srcPhones = new Set(phoneHits(source).map((h) => h.key));
  const srcDigits = digitRuns(source);

  for (const h of dateHits(output)) if (!srcDates.has(h.key)) flags.push({ kind: "date", text: h.raw });
  for (const h of timeHits(output)) if (!srcTimes.has(h.key)) flags.push({ kind: "time", text: h.raw });
  for (const h of phoneHits(output)) if (!srcPhones.has(h.key)) flags.push({ kind: "phone", text: h.raw });
  for (const h of numberHits(output)) if (!srcDigits.has(h.key)) flags.push({ kind: "number", text: h.raw });
  // Lời nói/trích dẫn phải có ĐÚNG trong dữ kiện (AI hay bịa câu "một anh em chia sẻ …")
  const srcQuote = normQuote(source);
  for (const h of quoteHits(output)) if (!srcQuote.includes(h.key)) flags.push({ kind: "quote", text: h.raw });

  const feast = feastKey(opts.patronFeast);
  if (feast) {
    const label = (() => {
      const [d, m] = feast.split("/");
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}`;
    })();
    for (const m of output.matchAll(/bổn\s*mạng/giu)) {
      const start = m.index!;
      const win = output.slice(Math.max(0, start - 45), start + 90);
      for (const h of dateHits(win)) {
        if (h.key !== feast) flags.push({ kind: "patron", text: h.raw, note: `Ngày Bổn mạng của nhà là ${label}` });
      }
    }
  }
  return uniq(flags).slice(0, 24);
}

/** Cụm từ sáo rỗng hay gặp ở văn do AI viết (chữ thường, không dấu câu). */
const CLICHES = [
  "trong nhịp sống hối hả",
  "nhịp sống hối hả",
  "không chỉ là",
  "mà còn là",
  "hãy cùng",
  "hành trình",
  "tỏa sáng",
  "chắp cánh",
  "ngập tràn",
  "lan tỏa",
  "ấm áp tình người",
  "khoảnh khắc đáng nhớ",
  "góp phần xây dựng",
  "minh chứng cho",
  "dệt nên",
  "bức tranh",
  "điểm tựa",
  "hơn cả một",
  "đừng ngần ngại",
  "hân hoan chào đón",
  "trái tim rộng mở",
  "vòng tay rộng mở",
  "mái ấm thứ hai",
  "ngôi nhà thứ hai",
  "sẻ chia yêu thương",
  "tràn đầy năng lượng",
  "không khí ấm cúng",
  "vô cùng ý nghĩa",
  "thật sự ý nghĩa",
  "hơn bao giờ hết",
  "tình yêu thương",
  // Câu đại ngôn không mang thông tin (rút từ bản đánh giá một bài do AI viết)
  "vượt qua ranh giới",
  "điểm nhấn",
  "đức tin được sống cụ thể",
  "mối dây liên kết",
  "mốc thời gian trên lịch",
  "giữ gìn truyền thống",
  "ý nghĩa sâu sắc",
  "dịp để chúng ta nhìn lại",
  "thắp lên",
  "ươm mầm",
  "gắn kết yêu thương",
];

/** Cấu trúc "không (chỉ/phải) … mà (là/còn) …" — dấu hiệu rất đặc trưng của văn AI; một lần thì được, từ hai lần thì lộ. */
const CONTRAST_RES = [
  // Không dùng \b: nó chỉ hiểu chữ ASCII nên sau "là" (có dấu) không bao giờ coi là biên từ
  /không\s+(?:chỉ\s+|phải\s+)?(?:là\s+)?[^.;!?\n]{2,80}?,?\s+mà\s+(?:là|còn)(?![\p{L}])[^.;!?\n]{0,50}/giu,
  /không\s+phải\s+là[^.!?\n]{3,80}[.!?]\s*(?:Nó|Đó|Đây)\s+là(?![\p{L}])[^.;!?\n]{0,40}/giu,
];

/** Lời chứng chung chung không ai cụ thể ("nhiều anh chị em kể rằng…", "chúng tôi thường chia sẻ…") — chỉ chấp nhận khi dữ kiện của người soạn có nói. */
const CLAIM_RES = [
  /(?:nhiều|một số|không ít|rất nhiều)\s+(?:anh\s*chị\s*em|anh\s*em|chị\s*em|bạn(?:\s+sinh\s+viên)?|thành\s+viên|người)[^.;!?\n]{0,50}?(?:kể|chia\s+sẻ|cho\s+biết|cảm\s+thấy|nhận\s+ra|tâm\s+sự)[^.;!?\n]{0,60}/giu,
  /(?:chúng\s+tôi|cộng\s+đoàn|lưu\s+xá|mọi\s+người)\s+thường\s+(?:chia\s+sẻ|nói|nhắc|cầu\s+nguyện|trao\s+đổi)[^.;!?\n]{0,60}/giu,
];

/** Từ nối/hư từ — không tính vào cụm lặp. */
const REPEAT_STOP = new Set(["của", "và", "là", "các", "những", "một", "có", "trong", "cho", "với", "được", "này", "đó", "để", "khi", "từ", "đã", "sẽ", "cũng", "như", "không", "người", "chúng", "tôi", "ta", "hay", "thì", "mà", "nên", "rất", "còn", "bạn", "anh", "chị", "em", "nhà", "đây", "ngày", "tháng", "cùng", "nhau", "về", "ở", "tại", "vào", "ra", "lên", "đến", "sau", "trước"]);

/** Cụm hai chữ xuất hiện ≥ 5 lần trong bài mà người soạn không hề dùng (vd. "hiệp thông" ×5): đọc thấy đều đều, nên đổi cách nói. */
function repeatHits(text: string, source: string): DraftFlag[] {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (a.length < 2 || b.length < 2 || REPEAT_STOP.has(a) || REPEAT_STOP.has(b)) continue;
    const k = `${a} ${b}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const src = source.toLowerCase();
  return [...counts.entries()]
    .filter(([k, n]) => n >= 5 && !src.includes(k))
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([k, n]) => ({ kind: "repeat" as const, text: k, note: `“${k}” xuất hiện ${n} lần` }));
}
const CTA_RE = /(liên hệ (?:ngay|với chúng tôi|qua)|hotline|đăng ký ngay|nhanh tay|đừng bỏ lỡ|gọi (?:ngay )?số)/giu;

export const CLICHE_LIST = CLICHES;

/** Cụm sáo rỗng + lời kêu gọi/liên hệ trong bài. `allowContact`: người soạn đã chọn kết bài kèm thông tin liên hệ ⇒ không đánh dấu CTA. */
export function findClichesIn(textRaw: string, opts: { allowContact?: boolean; source?: string } = {}): DraftFlag[] {
  const text = textRaw.normalize("NFC");
  const source = (opts.source ?? "").normalize("NFC");
  const flags: DraftFlag[] = [];
  const lower = text.toLowerCase();
  for (const c of CLICHES) {
    const i = lower.indexOf(c);
    if (i >= 0) flags.push({ kind: "cliche", text: text.slice(i, i + c.length) });
  }
  // "không … mà …": chỉ đánh dấu khi lặp từ hai lần trở lên (một lần là bình thường)
  const contrasts = CONTRAST_RES.flatMap((re) => [...text.matchAll(re)].map((m) => m[0].trim().slice(0, 90)));
  if (contrasts.length >= 2) for (const c of contrasts.slice(0, 4)) flags.push({ kind: "cliche", text: c });
  // Lời chứng chung chung: bỏ qua nếu người soạn tự viết câu đó trong dữ kiện
  const srcNorm = normQuote(source);
  for (const re of CLAIM_RES) {
    for (const m of text.matchAll(re)) {
      const phrase = m[0].trim();
      if (!srcNorm || !srcNorm.includes(normQuote(phrase).split(" ").slice(0, 6).join(" "))) flags.push({ kind: "claim", text: phrase.slice(0, 100) });
    }
  }
  flags.push(...repeatHits(text, source));
  if (!opts.allowContact) for (const m of text.matchAll(CTA_RE)) flags.push({ kind: "cta", text: m[0] });
  return uniq(flags).slice(0, 18);
}

/** Cờ còn hiệu lực với nội dung hiện tại (người soạn đã sửa/xóa đoạn bị đánh dấu thì cờ biến mất). */
export const activeFlags = (flags: DraftFlag[], content: string): DraftFlag[] => flags.filter((f) => f.text && content.includes(f.text));
