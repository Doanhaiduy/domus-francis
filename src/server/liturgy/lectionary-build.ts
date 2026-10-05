// =====================================================================
// Dựng Sách Bài Đọc (Lời Chúa) từ dữ liệu mở trên GitHub — THUẦN dữ liệu, không eval mã từ xa, không truy cập CSDL.
//
// Nguồn: repo anrevietson/myCalLiturgy (Reading/*.js — mỗi tệp là một phép gán `window.X = {...}` chứa JSON):
//   readingdata.js      trích dẫn các bài đọc theo mã ngày (năm A/B/C, năm chẵn/lẻ)
//   Sunday.js, DailySeason.js, DailyOrdinary1/2.js, SaintsBible.js, Optionsaint.js — toàn văn (tựa đề, câu tóm, lời đáp ca…)
// Toàn văn được ghép vào trích dẫn THEO TRÍCH DẪN (sách + chương + câu đầu), không theo mã của tệp toàn văn (một số tệp lệch mã),
// nên bài đọc hiển thị luôn khớp đúng ngày; thiếu toàn văn thì chỉ hiện trích dẫn + liên kết bản chính thức.
// Khóa bài đọc đầu ra khớp src/lib/liturgy/engine.ts (vd. "ot-27-1" năm II, "saint-1001", "xmas-night").
// =====================================================================

export interface ReadingSlot {
  kind: "r1" | "psalm" | "r2" | "alleluia" | "gospel";
  label: string;
  ref: string | null;
  headline?: string | null;
  intro?: string | null;
  text?: string | null;
  response?: string | null;
  verses?: string[];
  end?: string | null;
}

export interface LectionaryEntry {
  key: string;
  cycle: string;
  variant: string;
  /** Mã gốc trong nguồn (để đối chiếu) */
  sourceCode: string;
  slots: ReadingSlot[];
}

export interface BuildStats {
  entries: number;
  withText: number;
  slots: number;
  slotsWithText: number;
  skippedCodes: string[];
}

/** Đọc `window.X = {...};` thành JSON mà KHÔNG chạy mã: cắt phần giá trị, bỏ dấu phẩy thừa, cân lại ngoặc nếu tệp thiếu. */
export function parseAssignedJson(src: string): unknown {
  let s = src.replace(/^﻿/, "");
  const eq = s.indexOf("=");
  const start = s.slice(eq + 1).search(/[[{]/);
  if (eq < 0 || start < 0) throw new Error("Tệp dữ liệu không đúng định dạng.");
  s = s.slice(eq + 1 + start).trim().replace(/;\s*$/, "");
  try {
    return JSON.parse(s);
  } catch {
    /* sửa lỗi thường gặp bên dưới */
  }
  // Duyệt có nhận biết chuỗi: bỏ dấu phẩy trước } ], đếm ngoặc chưa đóng
  let out = "";
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += s[++i] ?? "";
      } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "{" || c === "[") {
      stack.push(c === "{" ? "}" : "]");
      out += c;
    } else if (c === "}" || c === "]") {
      out = out.replace(/,\s*$/, "");
      stack.pop();
      out += c;
    } else if (c === ";" && stack.length > 0) {
      // dấu ; lạc giữa đối tượng (tệp đóng ngoặc thiếu) — bỏ qua
    } else out += c;
  }
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  return JSON.parse(out);
}

const cleanText = (t: unknown): string | null => {
  if (typeof t !== "string") return null;
  const s = t
    .replace(/Ð/g, "Đ")
    .replace(/ð/g, "đ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
  return s || null;
};

/** Khóa so khớp trích dẫn: sách + chương + câu đầu (bỏ dấu cách, "(năm I)", phần "hay …"). */
export function refKey(ref: string | null | undefined): string | null {
  if (!ref) return null;
  let s = ref
    .replace(/Ð/g, "Đ")
    .replace(/\(\s*(năm|Năm)\s*[IV12]+\s*\)/g, "")
    .replace(/^\s*(x\.|I\s+)(?=[A-ZĐ0-9])/i, "")
    .replace(/\s*\((hay|hoặc)[^)]*\)?/gi, "")
    .split(/\s+(hay|hoặc)\s+/i)[0];
  s = s.replace(/\s+/g, "");
  const m = /^((?:[1-3])?[A-Za-zĐđÀ-ỹ]+)\.?(\d+)[,:](\d+)/.exec(s);
  if (!m) return null;
  return `${m[1].toLowerCase()}|${+m[2]}|${+m[3]}`;
}

const psalmNeighbors = (k: string): string[] => {
  const [b, c, v] = k.split("|");
  if (b !== "tv") return [k];
  return [k, `${b}|${+c - 1}|${v}`, `${b}|${+c + 1}|${v}`];
};

type Raw = Record<string, any>;

interface Pool {
  r1: Map<string, Raw[]>;
  psalm: Map<string, Raw[]>;
  r2: Map<string, Raw[]>;
  gospel: Map<string, Raw[]>;
}

const SLOT_FIELD = { r1: "firstReading", psalm: "psalms", r2: "secondReading", gospel: "gospel" } as const;

function addToPool(pool: Pool, entry: Raw, code: string) {
  if (!entry || typeof entry !== "object") return;
  for (const kind of ["r1", "psalm", "r2", "gospel"] as const) {
    const part = entry[SLOT_FIELD[kind]];
    const k = refKey(part?.excerpt);
    if (!k) continue;
    const list = pool[kind].get(k) ?? [];
    list.push({ ...part, __entry: entry, __code: code });
    pool[kind].set(k, list);
  }
}

/** Mã nguồn → khóa engine. Trả null nếu mã không dùng. */
export function mapCode(code: string, year: string, reading1 = ""): { key: string; cycle: string; variant: string } | null {
  const cyc = /^[ABC]$/.test(year) ? year : year === "1" ? "I" : year === "2" ? "II" : "";
  const c = code;
  let m: RegExpExecArray | null;
  if ((m = /^1(\d\d)(\d)$/.exec(c))) return { key: `adv-${+m[1]}-${m[2]}`, cycle: cyc, variant: "" };
  if (c === "224122") return { key: "xmas-vigil", cycle: "", variant: "" };
  if ((m = /^2(\d\d)12$/.exec(c))) {
    const dd = +m[1];
    if (dd === 25) {
      const v = year === "D" ? "xmas-night" : year === "B" ? "xmas-dawn" : year === "R" ? "xmas-day" : year === "V" ? "xmas-vigil" : "xmas-day";
      return { key: v, cycle: "", variant: "" };
    }
    return { key: `dec-${m[1]}`, cycle: "", variant: "" };
  }
  if ((m = /^20(\d)01$/.exec(c))) return +m[1] === 1 ? { key: "mary-mother-god", cycle: "", variant: "" } : { key: `jan-0${m[1]}`, cycle: "", variant: "" };
  if (c === "2010") return { key: "holy-family", cycle: cyc, variant: "" };
  if (c === "6000") return { key: "epiphany", cycle: cyc, variant: "" };
  if ((m = /^600([1-6])$/.exec(c))) return { key: `post-epiph-${m[1]}`, cycle: "", variant: "" };
  if ((m = /^300([4-7])$/.exec(c))) return { key: `lent-0-${+m[1] - 1}`, cycle: "", variant: "" };
  if (c === "3064") return { key: /^\s*Is\s*61/i.test(reading1) ? "chrism" : "lords-supper", cycle: "", variant: "" };
  if (c === "3065") return { key: "good-friday", cycle: "", variant: "" };
  if (c === "3066") return { key: "easter-vigil", cycle: cyc, variant: "" };
  if ((m = /^3(0[1-6])(\d)$/.exec(c))) return { key: `lent-${+m[1]}-${m[2]}`, cycle: cyc, variant: "" };
  if (c === "4080") return { key: "ascension", cycle: cyc, variant: "" };
  if ((m = /^4(0[1-7])(\d)$/.exec(c))) return { key: `east-${+m[1]}-${m[2]}`, cycle: cyc, variant: "" };
  const special: Record<string, string> = {
    "5001": "pentecost",
    "5410": "pentecost",
    "5002": "trinity",
    "5420": "trinity",
    "5003": "corpus",
    "5430": "corpus",
    "5004": "sacred-heart",
    "5440": "sacred-heart",
    "5450": "saint-0806",
    "8410": "pentecost-vigil",
    "8411": "mary-mother-church",
    "8441": "immaculate-heart",
    "8330": "alt-1124",
    "82412": "xmas-vigil",
    "70001": "tet-1",
    "70002": "tet-2",
    "70003": "tet-3",
    "70211": "all-souls",
    "80211": "alt-1102",
    "71408": "vigil-0815",
    "72306": "vigil-0624",
    "72806": "vigil-0629",
    "82806": "vigil-0629",
    "82306": "vigil-0624",
  };
  if (special[c]) return { key: special[c], cycle: cyc, variant: "" };
  if ((m = /^5(\d\d)(\d)$/.exec(c)) && +m[1] >= 1 && +m[1] <= 34) return { key: `ot-${+m[1]}-${m[2]}`, cycle: cyc, variant: "" };
  if ((m = /^7(\d\d)(\d\d)$/.exec(c))) return { key: `saint-${m[2]}${m[1]}`, cycle: "", variant: "" };
  if ((m = /^8(\d\d)(\d\d)$/.exec(c)) && !["80001", "80158", "80209", "82512"].includes(c)) return { key: `alt-${m[2]}${m[1]}`, cycle: "", variant: "" };
  return null;
}

const SLOT_LABEL: Record<ReadingSlot["kind"], string> = {
  r1: "Bài đọc I",
  psalm: "Đáp ca",
  r2: "Bài đọc II",
  alleluia: "Tung hô Tin Mừng",
  gospel: "Tin Mừng",
};

function slotFromText(kind: ReadingSlot["kind"], ref: string | null, part: Raw | null): ReadingSlot {
  const slot: ReadingSlot = { kind, label: SLOT_LABEL[kind], ref: cleanText(ref) ?? cleanText(part?.excerpt) };
  if (!part) return slot;
  if (kind === "psalm") {
    slot.response = cleanText(part.response)?.replace(/^Đáp\s*:\s*/i, "") ?? null;
    slot.verses = Array.isArray(part.verses) ? part.verses.map(cleanText).filter((x: string | null): x is string => !!x).map((v: string) => v.replace(/^Xướng\s*:\s*/i, "")) : [];
    return slot;
  }
  slot.headline = cleanText(part.info);
  slot.intro = cleanText(part.title);
  slot.text = cleanText(part.content);
  slot.end = cleanText(part.end);
  return slot;
}

/** Ghép toàn văn cho một dòng trích dẫn. */
function resolveRow(pool: Pool, row: { reading1?: string; psalm?: string; reading2?: string; gospel?: string }, code: string): ReadingSlot[] {
  const pick = (kind: keyof Pool, ref: string | undefined): Raw | null => {
    const k = refKey(ref);
    if (!k) return null;
    const cands = (kind === "psalm" ? psalmNeighbors(k) : [k]).flatMap((x) => pool[kind].get(x) ?? []);
    if (!cands.length) return null;
    return cands.find((c) => c.__code === code) ?? cands[0];
  };
  const r1 = pick("r1", row.reading1);
  const r2 = row.reading2 ? pick("r2", row.reading2) ?? pick("r1", row.reading2) : null;
  const gospel = pick("gospel", row.gospel);
  // Đáp ca ưu tiên lấy cùng bộ với bài đọc I đã khớp (đáp ca đi theo bài đọc I của năm chẵn/lẻ)
  const ps = r1?.__entry?.psalms && refKey(r1.__entry.psalms.excerpt) ? r1.__entry.psalms : pick("psalm", row.psalm);
  const alleluia = gospel?.__entry?.alleluia ?? r1?.__entry?.alleluia ?? null;
  const slots: ReadingSlot[] = [slotFromText("r1", row.reading1 ?? null, r1), slotFromText("psalm", row.psalm ?? null, ps)];
  if (row.reading2 && row.reading2.trim()) slots.push(slotFromText("r2", row.reading2, r2));
  if (alleluia) slots.push({ kind: "alleluia", label: SLOT_LABEL.alleluia, ref: cleanText(alleluia.excerpt), text: cleanText(alleluia.content) });
  slots.push(slotFromText("gospel", row.gospel ?? null, gospel));
  return slots.filter((s) => s.ref || s.text);
}

function slotsFromEntry(e: Raw): ReadingSlot[] {
  const out: ReadingSlot[] = [];
  if (e.firstReading) out.push(slotFromText("r1", null, e.firstReading));
  if (e.psalms) out.push(slotFromText("psalm", null, e.psalms));
  if (e.secondReading) out.push(slotFromText("r2", null, e.secondReading));
  if (e.alleluia) out.push({ kind: "alleluia", label: SLOT_LABEL.alleluia, ref: cleanText(e.alleluia.excerpt), text: cleanText(e.alleluia.content) });
  if (e.gospel) out.push(slotFromText("gospel", null, e.gospel));
  return out.filter((s) => s.ref || s.text);
}

/** Khóa nguồn → khóa engine bổ sung (Chúa Nhật I Thường Niên = lễ Chúa Giêsu chịu phép Rửa; các lễ kính trong Bát Nhật Giáng Sinh). */
const ALIASES: [string, string][] = [
  ["ot-1-0", "baptism"],
  ["dec-26", "saint-1226"],
  ["dec-27", "saint-1227"],
  ["dec-28", "saint-1228"],
];

export interface LectionarySources {
  readingdata: string;
  sunday: string;
  season: string;
  ord1: string;
  ord2: string;
  saints: string;
  optional: string;
}

export function buildLectionary(src: LectionarySources): { entries: LectionaryEntry[]; stats: BuildStats } {
  const pool: Pool = { r1: new Map(), psalm: new Map(), r2: new Map(), gospel: new Map() };
  const textByCode = new Map<string, Raw>();
  const add = (code: string, entry: Raw, keepForCode = true) => {
    addToPool(pool, entry, code);
    if (keepForCode && !textByCode.has(code)) textByCode.set(code, entry);
  };

  const sunday = parseAssignedJson(src.sunday);
  for (const group of Array.isArray(sunday) ? sunday : [sunday]) {
    for (const [code, years] of Object.entries(group as Raw)) {
      for (const [y, e] of Object.entries(years as Raw)) add(`${code}/${y}`, e as Raw);
    }
  }
  for (const [code, e] of Object.entries(parseAssignedJson(src.season) as Raw)) add(code, e);
  // Ngày thường Mùa Thường Niên: mã trong tệp toàn văn không đáng tin ⇒ chỉ dùng để tra theo trích dẫn
  for (const [code, e] of Object.entries(parseAssignedJson(src.ord1) as Raw)) add(`${code}/1`, e, false);
  for (const [code, e] of Object.entries(parseAssignedJson(src.ord2) as Raw)) add(`${code}/2`, e, false);
  for (const [code, e] of Object.entries(parseAssignedJson(src.saints) as Raw)) add(code, e);
  for (const [code, e] of Object.entries(parseAssignedJson(src.optional) as Raw)) add(code, e);

  const rows = parseAssignedJson(src.readingdata) as { code: number | string; year: string; reading1?: string; psalm?: string; reading2?: string; gospel?: string }[];
  const entries = new Map<string, LectionaryEntry>();
  const skipped = new Set<string>();
  for (const r of rows) {
    const code = String(r.code);
    const mk = mapCode(code, String(r.year ?? "0"), r.reading1 ?? "");
    if (!mk) {
      skipped.add(code);
      continue;
    }
    const id = `${mk.key}|${mk.cycle}|${mk.variant}`;
    if (entries.has(id)) continue;
    const textCode = /^[1-6]\d{3}$/.test(code) && /^[ABC]$/.test(String(r.year)) ? `${code}/${r.year}` : code;
    entries.set(id, { ...mk, sourceCode: code, slots: resolveRow(pool, r, textCode) });
  }
  // Lễ chỉ có trong tệp toàn văn (vd. Đức Maria Mẹ Hội Thánh, Trái Tim Vô Nhiễm, Lễ Vọng Hiện Xuống, bài đọc riêng của lễ nhớ)
  for (const [codeY, e] of textByCode) {
    const [code, y = "0"] = codeY.split("/");
    const mk = mapCode(code, y);
    if (!mk) continue;
    const id = `${mk.key}|${mk.cycle}|${mk.variant}`;
    if (entries.has(id) || entries.has(`${mk.key}||`)) continue;
    entries.set(id, { ...mk, sourceCode: code, slots: slotsFromEntry(e) });
  }

  // Bí danh: một bộ bài đọc dùng cho hai khóa của engine
  for (const [from, to] of ALIASES) {
    for (const e of [...entries.values()].filter((x) => x.key === from)) {
      const id = `${to}|${e.cycle}|${e.variant}`;
      if (!entries.has(id)) entries.set(id, { ...e, key: to });
    }
  }

  const list = [...entries.values()].filter((e) => e.slots.length > 0);
  const slots = list.flatMap((e) => e.slots);
  return {
    entries: list,
    stats: {
      entries: list.length,
      withText: list.filter((e) => e.slots.some((s) => s.text || s.verses?.length)).length,
      slots: slots.length,
      slotsWithText: slots.filter((s) => s.text || s.verses?.length).length,
      skippedCodes: [...skipped].sort(),
    },
  };
}
