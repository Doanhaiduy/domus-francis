// =====================================================================
// Bộ tính Lịch Phụng vụ Công giáo (Nghi lễ Rôma) cho Việt Nam — thuần TypeScript, không gọi mạng, chạy được ở client lẫn server.
//
//  • Chu kỳ mùa: Mùa Vọng → Giáng Sinh → Thường Niên I → Mùa Chay → Tam Nhật Vượt Qua → Phục Sinh → Thường Niên II.
//  • Thứ tự ưu tiên theo "Bảng các ngày phụng vụ" (Quy luật tổng quát về Năm Phụng vụ, số 59): lễ trọng bị ngăn trở được dời,
//    lễ kính/lễ nhớ bị ngăn trở thì bỏ, lễ nhớ trong Mùa Chay và 17–24/12 thành "kính nhớ", hai lễ nhớ buộc trùng ngày ⇒ tùy ý.
//  • Riêng Việt Nam (HĐGMVN): Hiển Linh (Chúa Nhật 2–8/1), Thăng Thiên (Chúa Nhật VII Phục Sinh), Mình Máu Thánh (Chúa Nhật)
//    được dời về Chúa Nhật; 24/11 Các Thánh Tử Đạo Việt Nam là lễ trọng; Mồng Một/Hai/Ba Tết có thánh lễ riêng; Lễ Tro trùng
//    mồng 1–3 Tết thì dời sang mồng 4 Tết (đặc ân của Bộ Phụng tự, văn thư 2407/98/L).
//  • Mỗi ngày trả về khóa Sách Bài Đọc (lectionary) để tra Lời Chúa đã nạp vào CSDL (xem src/server/modules/liturgy-lectionary.ts).
// =====================================================================
import { PROPER_READING_DATES, saintsOn, type SaintEntry } from "./saints";
import { lunarYearName, solarToLunar, tetDate } from "./lunar";

export type LitColor = "white" | "red" | "green" | "violet" | "rose" | "black";
export type LitSeason = "advent" | "christmas" | "ordinary" | "lent" | "triduum" | "easter";
export type LitRank =
  | "triduum"
  | "solemnity"
  | "feast_lord"
  | "feast"
  | "sunday"
  | "memorial"
  | "optional"
  | "all_souls"
  | "privileged"
  | "weekday"
  | "tet";

export interface LectionaryRef {
  /** Khóa Sách Bài Đọc, vd. "ot-27-1", "saint-1001", "xmas-night" */
  key: string;
  /** Năm A/B/C (Chúa Nhật, lễ trọng) hoặc I/II (ngày thường Mùa Thường Niên) */
  cycle: string;
  /** Tên thánh lễ khi một ngày có nhiều bộ bài đọc (vd. "Lễ Đêm", "Lễ Dầu") */
  label?: string;
}

export interface LitDay {
  date: string;
  /** 0 = Chúa Nhật … 6 = Thứ Bảy */
  weekday: number;
  weekdayLabel: string;
  season: LitSeason;
  seasonLabel: string;
  week: number | null;
  /** "Tuần XXVII Thường Niên" */
  weekLabel: string | null;
  sundayCycle: "A" | "B" | "C";
  weekdayCycle: "I" | "II";
  psalterWeek: number | null;
  /** Tên cử hành chính của ngày */
  title: string;
  rank: LitRank;
  rankLabel: string;
  color: LitColor;
  /** Lễ nhớ tùy ý / kính nhớ có thể cử hành thay */
  optional: { title: string; color: LitColor; rank: LitRank }[];
  /** Ghi chú phụng vụ: lễ bị bỏ/dời, thứ Sáu đầu tháng… */
  notes: string[];
  /** Ý cầu nguyện đặc biệt của Giáo hội cho ngày này (ngày thế giới, tháng kính…) */
  intentions: string[];
  isSunday: boolean;
  /** Lễ trọng (gồm Tam Nhật Vượt Qua, Chúa Nhật Phục Sinh) — tô nổi bật, cần điểm danh đi lễ */
  isSolemnity: boolean;
  /** Lễ buộc tại Việt Nam (ngoài Chúa Nhật): Giáng Sinh, Đức Mẹ Lên Trời, Các Thánh Nam Nữ */
  isObligation: boolean;
  /** Ngày nên tô nổi bật trên lịch (lễ trọng, lễ kính về Chúa, Tết, Lễ Tro…) */
  isHighlight: boolean;
  fasting: "fast_abstinence" | "abstinence" | null;
  /** 1–3 nếu là Mồng Một/Hai/Ba Tết */
  tet: 0 | 1 | 2 | 3;
  lunar: { day: number; month: number; leap: boolean; yearName: string; label: string };
  lectionary: LectionaryRef[];
  /** Bài đọc riêng tùy chọn của lễ nhớ (nếu có) */
  altLectionary: LectionaryRef[];
}

// ---------------------------------------------------------------------
// Ngày tháng dạng "YYYY-MM-DD" (UTC, không phụ thuộc múi giờ máy)
// ---------------------------------------------------------------------
const DAY = 86_400_000;
const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDaysIso = (iso: string, n: number) => isoOf(ms(iso) + n * DAY);
const dowOf = (iso: string) => new Date(ms(iso)).getUTCDay();
const diffDays = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DAY);
const ymd = (y: number, m: number, d: number) => isoOf(Date.UTC(y, m - 1, d));
const sundayOnOrBefore = (iso: string) => addDaysIso(iso, -dowOf(iso));

export const WEEKDAY_LABEL = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII",
  "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX", "XXXI", "XXXII", "XXXIII", "XXXIV"];
const SEASON_LABEL: Record<LitSeason, string> = {
  advent: "Mùa Vọng",
  christmas: "Mùa Giáng Sinh",
  ordinary: "Mùa Thường Niên",
  lent: "Mùa Chay",
  triduum: "Tam Nhật Vượt Qua",
  easter: "Mùa Phục Sinh",
};
export const RANK_LABEL: Record<LitRank, string> = {
  triduum: "Tam Nhật Vượt Qua",
  solemnity: "Lễ trọng",
  feast_lord: "Lễ kính",
  feast: "Lễ kính",
  sunday: "Chúa Nhật",
  memorial: "Lễ nhớ",
  optional: "Lễ nhớ tùy ý",
  all_souls: "Lễ cầu hồn",
  privileged: "Ngày thường",
  weekday: "Ngày thường",
  tet: "Thánh lễ Tết",
};
export const COLOR_LABEL: Record<LitColor, string> = {
  white: "Trắng",
  red: "Đỏ",
  green: "Xanh lá",
  violet: "Tím",
  rose: "Hồng",
  black: "Đen",
};
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const leTitle = (t: string) => (/^lễ /i.test(t) ? t : `lễ ${t}`);
const SAINT_COLOR: Record<SaintEntry["color"], LitColor> = { W: "white", R: "red", V: "violet", G: "green" };

/** Lễ Phục Sinh (thuật toán Gregory ẩn danh — Meeus/Jones/Butcher). */
export function easterDate(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

interface Anchors {
  year: number;
  easter: string;
  ashWed: string;
  lent1: string;
  palm: string;
  holyThu: string;
  goodFri: string;
  holySat: string;
  divineMercy: string;
  ascension: string;
  pentecost: string;
  maryMotherChurch: string;
  trinity: string;
  corpus: string;
  sacredHeart: string;
  immaculateHeart: string;
  adv1: string;
  christTheKing: string;
  epiphany: string;
  baptism: string;
  /** Chúa Nhật làm mốc đếm tuần Thường Niên I (Chúa Nhật lễ Chúa Giêsu chịu phép Rửa, hoặc Chúa Nhật Hiển Linh nếu lễ Rửa rơi vào thứ Hai) */
  otRef: string;
  holyFamily: string;
  tet: string;
  /** Ngày cử hành Lễ Tro thực tế tại Việt Nam (mồng 4 Tết nếu Thứ Tư Lễ Tro trùng mồng 1–3 Tết) */
  ashRite: string;
}

const anchorCache = new Map<number, Anchors>();

function anchors(y: number): Anchors {
  const hit = anchorCache.get(y);
  if (hit) return hit;
  const easter = easterDate(y);
  const ashWed = addDaysIso(easter, -46);
  const pentecost = addDaysIso(easter, 49);
  const xmas = ymd(y, 12, 25);
  const xmasDow = dowOf(xmas);
  const adv4 = addDaysIso(xmas, -(xmasDow === 0 ? 7 : xmasDow));
  const adv1 = addDaysIso(adv4, -21);
  // Hiển Linh: Chúa Nhật từ 2 đến 8/1
  const jan2 = ymd(y, 1, 2);
  const epiphany = addDaysIso(jan2, (7 - dowOf(jan2)) % 7);
  const epiDay = +epiphany.slice(8, 10);
  const baptism = epiDay >= 7 ? addDaysIso(epiphany, 1) : addDaysIso(epiphany, 7);
  const otRef = dowOf(baptism) === 0 ? baptism : epiphany;
  // Thánh Gia: Chúa Nhật trong Tuần Bát Nhật Giáng Sinh; nếu Giáng Sinh là Chúa Nhật ⇒ thứ Sáu 30/12
  let holyFamily = ymd(y, 12, 30);
  for (let d = 26; d <= 31; d++) if (dowOf(ymd(y, 12, d)) === 0) holyFamily = ymd(y, 12, d);
  const tet = tetDate(y);
  const tetDays = tet ? [tet, addDaysIso(tet, 1), addDaysIso(tet, 2)] : [];
  const ashRite = tetDays.includes(ashWed) ? addDaysIso(tet, 3) : ashWed;
  const a: Anchors = {
    year: y,
    easter,
    ashWed,
    lent1: addDaysIso(ashWed, 4),
    palm: addDaysIso(easter, -7),
    holyThu: addDaysIso(easter, -3),
    goodFri: addDaysIso(easter, -2),
    holySat: addDaysIso(easter, -1),
    divineMercy: addDaysIso(easter, 7),
    ascension: addDaysIso(easter, 42),
    pentecost,
    maryMotherChurch: addDaysIso(pentecost, 1),
    trinity: addDaysIso(pentecost, 7),
    corpus: addDaysIso(pentecost, 14),
    sacredHeart: addDaysIso(pentecost, 19),
    immaculateHeart: addDaysIso(pentecost, 20),
    adv1,
    christTheKing: addDaysIso(adv1, -7),
    epiphany,
    baptism,
    otRef,
    holyFamily,
    tet,
    ashRite,
  };
  anchorCache.set(y, a);
  return a;
}

// ---------------------------------------------------------------------
// Ứng viên cử hành của một ngày — prec càng nhỏ càng ưu tiên (Bảng các ngày phụng vụ, số 59)
//   1 Tam Nhật · 2 Giáng Sinh/Hiển Linh/Thăng Thiên/Hiện Xuống, Chúa Nhật Vọng-Chay-Phục Sinh, Lễ Tro, Tuần Thánh, Bát Nhật Phục Sinh
//   3 Lễ trọng chung (3.0 về Chúa, 3.1 Đức Mẹ, 3.2 các thánh), Lễ Các Đẳng · 4 lễ trọng riêng · 5 lễ kính về Chúa
//   6 Chúa Nhật Giáng Sinh & Thường Niên · 7 lễ kính · 8 lễ kính riêng · 9 ngày thường 17–24/12, Bát Nhật Giáng Sinh, Mùa Chay
//   10 lễ nhớ buộc · 12 lễ nhớ tùy ý · 13 ngày thường khác
// ---------------------------------------------------------------------
interface Cand {
  key: string;
  title: string;
  rank: LitRank;
  prec: number;
  color: LitColor;
  lect: LectionaryRef[];
  altLect?: LectionaryRef[];
  /** lễ trọng có thể dời khi bị ngăn trở */
  transferable?: boolean;
}

interface Temporal {
  season: LitSeason;
  week: number | null;
  cand: Cand;
  litYear: number;
}

function temporalOf(date: string): Temporal {
  const y = +date.slice(0, 4);
  const A = anchors(y);
  const d = dowOf(date);
  const WD = WEEKDAY_LABEL[d];
  const litYear = date >= A.adv1 ? y + 1 : y;
  const cyc = (["C", "A", "B"] as const)[litYear % 3];
  const wcyc = litYear % 2 === 1 ? "I" : "II";
  const mk = (season: LitSeason, week: number | null, c: Omit<Cand, "lect"> & { lect?: LectionaryRef[] }): Temporal => ({
    season,
    week,
    litYear,
    cand: { lect: [], ...c },
  });
  const L = (key: string, cycle: string = cyc, label?: string): LectionaryRef => (label ? { key, cycle, label } : { key, cycle });
  const mmdd = date.slice(5);

  // --- Mùa Vọng & Giáng Sinh (cuối năm dương lịch)
  if (date >= A.adv1) {
    if (mmdd < "12-25") {
      const w = Math.floor(diffDays(date, A.adv1) / 7) + 1;
      if (d === 0)
        return mk("advent", w, {
          key: `adv-${w}-0`,
          title: `Chúa Nhật ${ROMAN[w]} Mùa Vọng`,
          rank: "sunday",
          prec: 2,
          color: w === 3 ? "rose" : "violet",
          lect: [L(`adv-${w}-0`)],
        });
      if (mmdd >= "12-17") {
        const lect = [L(`dec-${mmdd.slice(3)}`)];
        if (mmdd === "12-24") lect.push(L("xmas-vigil", cyc, "Lễ Vọng Giáng Sinh (chiều 24/12)"));
        return mk("advent", w, { key: `dec-${mmdd.slice(3)}`, title: `${WD} — Ngày ${+mmdd.slice(3)} tháng 12 Mùa Vọng`, rank: "privileged", prec: 9, color: "violet", lect });
      }
      return mk("advent", w, { key: `adv-${w}-${d}`, title: `${WD} tuần ${ROMAN[w]} Mùa Vọng`, rank: "weekday", prec: 13, color: "violet", lect: [L(`adv-${w}-${d}`)] });
    }
    if (mmdd === "12-25")
      return mk("christmas", null, {
        key: "christmas",
        title: "Chúa Giáng Sinh",
        rank: "solemnity",
        prec: 2,
        color: "white",
        lect: [L("xmas-night", cyc, "Lễ Đêm"), L("xmas-dawn", cyc, "Lễ Rạng Đông"), L("xmas-day", cyc, "Lễ Ban Ngày")],
      });
    if (date === A.holyFamily)
      return mk("christmas", null, {
        key: "holy-family",
        title: "Thánh Gia Thất: Chúa Giêsu, Đức Maria và Thánh Giuse",
        rank: "feast_lord",
        prec: 5,
        color: "white",
        lect: [L("holy-family")],
      });
    const n = +mmdd.slice(3) - 24;
    return mk("christmas", null, {
      key: `dec-${mmdd.slice(3)}`,
      title: d === 0 ? "Chúa Nhật trong Tuần Bát Nhật Giáng Sinh" : `Ngày thứ ${["", "nhất", "hai", "ba", "bốn", "năm", "sáu", "bảy"][n]} trong Tuần Bát Nhật Giáng Sinh`,
      rank: "privileged",
      prec: 9,
      color: "white",
      lect: [L(`dec-${mmdd.slice(3)}`)],
    });
  }

  // --- Mùa Giáng Sinh (đầu năm dương lịch)
  if (date <= A.baptism) {
    if (mmdd === "01-01")
      return mk("christmas", null, { key: "mary-mother-god", title: "Thánh Maria, Mẹ Thiên Chúa", rank: "solemnity", prec: 3.1, color: "white", lect: [L("mary-mother-god")] });
    if (date === A.epiphany)
      return mk("christmas", null, { key: "epiphany", title: "Chúa Hiển Linh", rank: "solemnity", prec: 2, color: "white", lect: [L("epiphany")] });
    if (date === A.baptism)
      return mk("christmas", null, { key: "baptism", title: "Chúa Giêsu Chịu Phép Rửa", rank: "feast_lord", prec: 5, color: "white", lect: [L("baptism")] });
    if (date < A.epiphany)
      return mk("christmas", null, { key: `jan-${mmdd.slice(3)}`, title: `${WD} — Mùa Giáng Sinh (trước lễ Hiển Linh)`, rank: "weekday", prec: 13, color: "white", lect: [L(`jan-${mmdd.slice(3)}`)] });
    return mk("christmas", null, { key: `post-epiph-${d}`, title: `${WD} sau lễ Hiển Linh`, rank: "weekday", prec: 13, color: "white", lect: [L(`post-epiph-${d}`)] });
  }

  // --- Mùa Thường Niên I
  if (date < A.ashWed) return ordinaryOf(date, Math.floor(diffDays(date, A.otRef) / 7) + 1, mk, L, cyc, wcyc);

  // --- Mùa Chay & Tuần Thánh
  if (date < A.holyThu) {
    if (date < A.lent1) {
      const isAsh = date === A.ashWed;
      return mk("lent", 0, {
        key: `lent-0-${d}`,
        title: isAsh ? "Thứ Tư Lễ Tro" : `${WD} sau Lễ Tro`,
        rank: "privileged",
        prec: isAsh ? 2 : 9,
        color: "violet",
        lect: [L(`lent-0-${d}`)],
      });
    }
    const w = Math.floor(diffDays(date, A.lent1) / 7) + 1;
    if (w === 6) {
      if (d === 0)
        return mk("lent", 6, {
          key: "palm",
          title: "Chúa Nhật Lễ Lá — Tưởng Niệm Cuộc Thương Khó của Chúa",
          rank: "sunday",
          prec: 2,
          color: "red",
          lect: [L("lent-6-0")],
        });
      return mk("lent", 6, { key: `holy-${d}`, title: `${WD} Tuần Thánh`, rank: "privileged", prec: 2, color: "violet", lect: [L(`lent-6-${d}`)] });
    }
    if (d === 0)
      return mk("lent", w, { key: `lent-${w}-0`, title: `Chúa Nhật ${ROMAN[w]} Mùa Chay`, rank: "sunday", prec: 2, color: w === 4 ? "rose" : "violet", lect: [L(`lent-${w}-0`)] });
    return mk("lent", w, { key: `lent-${w}-${d}`, title: `${WD} tuần ${ROMAN[w]} Mùa Chay`, rank: "privileged", prec: 9, color: "violet", lect: [L(`lent-${w}-${d}`)] });
  }

  // --- Tam Nhật Vượt Qua
  if (date === A.holyThu)
    return mk("triduum", null, {
      key: "holy-thursday",
      title: "Thứ Năm Tuần Thánh — Thánh Lễ Tiệc Ly",
      rank: "triduum",
      prec: 1,
      color: "white",
      lect: [L("chrism", cyc, "Lễ Dầu (buổi sáng, tại nhà thờ chính tòa)"), L("lords-supper", cyc, "Thánh Lễ Tiệc Ly (buổi chiều)")],
    });
  if (date === A.goodFri)
    return mk("triduum", null, {
      key: "good-friday",
      title: "Thứ Sáu Tuần Thánh — Tưởng Niệm Cuộc Thương Khó của Chúa",
      rank: "triduum",
      prec: 1,
      color: "red",
      lect: [L("good-friday")],
    });
  if (date === A.holySat)
    return mk("triduum", null, {
      key: "holy-saturday",
      title: "Thứ Bảy Tuần Thánh — Đêm Canh Thức Vượt Qua",
      rank: "triduum",
      prec: 1,
      color: "white",
      lect: [L("easter-vigil", cyc, "Đêm Canh Thức Vượt Qua")],
    });

  // --- Mùa Phục Sinh
  if (date <= A.pentecost) {
    const w = Math.floor(diffDays(date, A.easter) / 7) + 1;
    if (date === A.easter)
      return mk("easter", 1, { key: "easter", title: "Chúa Nhật Phục Sinh", rank: "triduum", prec: 1, color: "white", lect: [L("east-1-0")] });
    if (date === A.ascension)
      return mk("easter", w, { key: "ascension", title: "Chúa Thăng Thiên", rank: "solemnity", prec: 2, color: "white", lect: [L("ascension")] });
    if (date === A.pentecost)
      return mk("easter", w, { key: "pentecost", title: "Chúa Thánh Thần Hiện Xuống", rank: "solemnity", prec: 2, color: "red", lect: [L("pentecost")] });
    if (w === 1)
      return mk("easter", 1, { key: `east-1-${d}`, title: `${WD} trong Tuần Bát Nhật Phục Sinh`, rank: "privileged", prec: 2, color: "white", lect: [L(`east-1-${d}`)] });
    if (d === 0)
      return mk("easter", w, {
        key: `east-${w}-0`,
        title: w === 2 ? "Chúa Nhật II Phục Sinh — Kính Lòng Chúa Thương Xót" : `Chúa Nhật ${ROMAN[w]} Phục Sinh`,
        rank: "sunday",
        prec: 2,
        color: "white",
        lect: [L(`east-${w}-0`)],
      });
    const lect = [L(`east-${w}-${d}`)];
    if (date === addDaysIso(A.pentecost, -1)) lect.push(L("pentecost-vigil", cyc, "Lễ Vọng Hiện Xuống (chiều thứ Bảy)"));
    return mk("easter", w, { key: `east-${w}-${d}`, title: `${WD} tuần ${ROMAN[w]} Phục Sinh`, rank: "weekday", prec: 13, color: "white", lect });
  }

  // --- Mùa Thường Niên II (sau Hiện Xuống)
  const w = 34 - Math.round(diffDays(A.christTheKing, sundayOnOrBefore(date)) / 7);
  if (date === A.trinity) return mk("ordinary", w, { key: "trinity", title: "Chúa Ba Ngôi", rank: "solemnity", prec: 3, color: "white", lect: [L("trinity")] });
  if (date === A.corpus)
    return mk("ordinary", w, { key: "corpus", title: "Mình và Máu Thánh Chúa Kitô", rank: "solemnity", prec: 3, color: "white", lect: [L("corpus")] });
  if (date === A.sacredHeart)
    return mk("ordinary", w, { key: "sacred-heart", title: "Thánh Tâm Chúa Giêsu", rank: "solemnity", prec: 3, color: "white", lect: [L("sacred-heart")] });
  if (date === A.christTheKing)
    return mk("ordinary", 34, { key: "christ-king", title: "Đức Giêsu Kitô, Vua Vũ Trụ", rank: "solemnity", prec: 3, color: "white", lect: [L("ot-34-0")] });
  return ordinaryOf(date, w, mk, L, cyc, wcyc);
}

function ordinaryOf(
  date: string,
  w: number,
  mk: (season: LitSeason, week: number | null, c: Omit<Cand, "lect"> & { lect?: LectionaryRef[] }) => Temporal,
  L: (key: string, cycle?: string, label?: string) => LectionaryRef,
  cyc: string,
  wcyc: string,
): Temporal {
  const d = dowOf(date);
  if (d === 0)
    return mk("ordinary", w, { key: `ot-${w}-0`, title: `Chúa Nhật ${ROMAN[w]} Thường Niên`, rank: "sunday", prec: 6, color: "green", lect: [L(`ot-${w}-0`, cyc)] });
  return mk("ordinary", w, {
    key: `ot-${w}-${d}`,
    title: `${WEEKDAY_LABEL[d]} tuần ${ROMAN[w]} Thường Niên`,
    rank: "weekday",
    prec: 13,
    color: "green",
    lect: [L(`ot-${w}-${d}`, wcyc)],
  });
}

// ---------------------------------------------------------------------
// Lễ các thánh + lễ trọng cố định (có dời ngày khi bị ngăn trở) cho cả năm dương lịch
// ---------------------------------------------------------------------
const yearSanctoral = new Map<number, Map<string, Cand[]>>();
const yearNotes = new Map<number, Map<string, string[]>>();

const saintPrec = (s: SaintEntry): number => {
  if (s.rank === "S") return s.mmdd === "11-24" ? 4 : s.mmdd === "03-25" || s.mmdd === "12-08" || s.mmdd === "08-15" ? 3.1 : 3.2;
  if (s.rank === "FL") return 5;
  if (s.rank === "F") return s.mmdd === "10-01" || s.mmdd === "12-03" ? 8 : 7;
  if (s.rank === "M") return 10;
  return 12;
};
const saintRank = (s: SaintEntry): LitRank =>
  s.rank === "S" ? "solemnity" : s.rank === "FL" ? "feast_lord" : s.rank === "F" ? "feast" : s.rank === "M" ? "memorial" : "optional";

function sanctoral(y: number): { cands: Map<string, Cand[]>; notes: Map<string, string[]> } {
  const hit = yearSanctoral.get(y);
  if (hit) return { cands: hit, notes: yearNotes.get(y)! };
  const A = anchors(y);
  const cands = new Map<string, Cand[]>();
  const notes = new Map<string, string[]>();
  const push = (date: string, c: Cand) => cands.set(date, [...(cands.get(date) ?? []), c]);
  const note = (date: string, n: string) => notes.set(date, [...(notes.get(date) ?? []), n]);

  for (let t = ms(ymd(y, 1, 1)); t <= ms(ymd(y, 12, 31)); t += DAY) {
    const date = isoOf(t);
    const mmdd = date.slice(5);
    for (const s of saintsOn(mmdd)) {
      const proper = PROPER_READING_DATES.has(mmdd) ? [{ key: `saint-${mmdd.replace("-", "")}`, cycle: "" }] : [];
      push(date, {
        key: `saint-${mmdd}`,
        title: s.title,
        rank: saintRank(s),
        prec: saintPrec(s),
        color: SAINT_COLOR[s.color],
        lect: s.rank === "M" || s.rank === "O" ? [] : proper,
        altLect: s.rank === "M" || s.rank === "O" ? [{ key: `alt-${mmdd.replace("-", "")}`, cycle: "" }] : undefined,
        transferable: s.rank === "S",
      });
    }
  }
  // Lễ Các Đẳng Linh Hồn (02/11): xếp ngang lễ trọng, cử hành cả khi rơi vào Chúa Nhật
  push(ymd(y, 11, 2), {
    key: "all-souls",
    title: "Cầu Cho Các Tín Hữu Đã Qua Đời (Lễ Các Đẳng)",
    rank: "all_souls",
    prec: 3.3,
    color: "violet",
    lect: [{ key: "all-souls", cycle: "" }],
    altLect: [{ key: "alt-1102", cycle: "" }],
  });
  // Lễ nhớ di động
  push(A.maryMotherChurch, {
    key: "mary-mother-church",
    title: "Đức Maria, Mẹ Hội Thánh",
    rank: "memorial",
    prec: 10,
    color: "white",
    lect: [{ key: "mary-mother-church", cycle: "" }],
  });
  push(A.immaculateHeart, {
    key: "immaculate-heart",
    title: "Trái Tim Vô Nhiễm Đức Mẹ",
    rank: "memorial",
    prec: 10,
    color: "white",
    lect: [],
    altLect: [{ key: "immaculate-heart", cycle: "" }],
  });

  // Dời các lễ trọng bị ngăn trở
  const tprec = (date: string) => temporalOf(date).cand.prec;
  const hasSolemnity = (date: string) => (cands.get(date) ?? []).some((c) => c.prec < 5);
  const move = (from: string, to: string, why: string) => {
    const list = cands.get(from) ?? [];
    const moving = list.filter((c) => c.transferable && c.prec < 5);
    if (!moving.length) return;
    cands.set(from, list.filter((c) => !moving.includes(c)));
    for (const c of moving) {
      push(to, { ...c, transferable: false });
      note(from, `${cap(leTitle(c.title))} năm nay được dời sang ${WEEKDAY_LABEL[dowOf(to)].toLowerCase()} ${+to.slice(8)}/${+to.slice(5, 7)} (${why}).`);
      note(to, `${cap(leTitle(c.title))} được dời từ ngày ${+from.slice(8)}/${+from.slice(5, 7)}.`);
    }
  };
  const nextFree = (from: string) => {
    let d = addDaysIso(from, 1);
    while (tprec(d) <= 8 || hasSolemnity(d)) d = addDaysIso(d, 1);
    return d;
  };
  // Hai lễ trọng trùng nhau (vd. Sinh Nhật Gioan Tẩy Giả trùng Thánh Tâm) ⇒ riêng 24/6 được cử hành sớm một ngày (Bộ Phụng tự, 2022); các trường hợp khác: lễ thấp hơn dời sang ngày trống kế tiếp
  const jb = ymd(y, 6, 24);
  if (jb === A.sacredHeart) move(jb, ymd(y, 6, 23), "trùng lễ Thánh Tâm Chúa Giêsu");
  for (const [date, list] of [...cands.entries()].sort()) {
    for (const c of list.filter((x) => x.transferable && x.prec < 5)) {
      const tp = tprec(date);
      const mmdd = date.slice(5);
      if (mmdd === "03-19" && date >= A.palm && date <= A.easter) move(date, addDaysIso(A.palm, -1), "trùng Tuần Thánh");
      else if (mmdd === "03-25" && date >= A.palm && date <= A.divineMercy) move(date, addDaysIso(A.divineMercy, 1), "trùng Tuần Thánh / Tuần Bát Nhật Phục Sinh");
      else if (tp <= 2) move(date, nextFree(date), dowOf(date) === 0 ? "trùng Chúa Nhật" : "trùng ngày phụng vụ cao hơn");
      else if (tp < c.prec) move(date, nextFree(date), "trùng một lễ trọng khác");
    }
  }

  yearSanctoral.set(y, cands);
  yearNotes.set(y, notes);
  return { cands, notes };
}

// ---------------------------------------------------------------------
// Ý cầu nguyện đặc biệt / ghi chú theo ngày
// ---------------------------------------------------------------------
const MONTH_DEVOTION: Record<number, string> = {
  3: "Tháng Ba — tháng kính Thánh Giuse.",
  5: "Tháng Năm — tháng Hoa kính Đức Mẹ.",
  6: "Tháng Sáu — tháng kính Thánh Tâm Chúa Giêsu.",
  7: "Tháng Bảy — tháng kính Máu Châu Báu Chúa Giêsu.",
  10: "Tháng Mười — tháng Mân Côi, lần chuỗi Mân Côi mỗi ngày.",
  11: "Tháng Mười Một — tháng cầu nguyện cho các linh hồn nơi luyện ngục.",
};

export const monthDevotion = (month: number): string | null => MONTH_DEVOTION[month] ?? null;

function specialIntentions(date: string, A: Anchors, winnerKey: string): string[] {
  const out: string[] = [];
  const mmdd = date.slice(5);
  const d = dowOf(date);
  const y = A.year;
  if (mmdd === "01-01") out.push("Ngày Thế giới Hòa bình — cầu cho hòa bình trên thế giới và quê hương.");
  if (mmdd === "02-02") out.push("Ngày Thế giới Đời sống Thánh hiến — cầu cho các tu sĩ nam nữ.");
  if (mmdd === "02-11") out.push("Ngày Thế giới Bệnh nhân — cầu cho các bệnh nhân và người chăm sóc.");
  if (mmdd === "09-01") out.push("Ngày Thế giới cầu nguyện cho việc chăm sóc thụ tạo.");
  if (winnerKey === "all-souls" || mmdd === "11-02") out.push("Cầu nguyện cho các tín hữu đã qua đời, đặc biệt ông bà, cha mẹ, ân nhân của cộng đoàn.");
  if (d === 0 && date === addDaysIso(A.otRef, 14)) out.push("Chúa Nhật Lời Chúa — đọc và suy niệm Kinh Thánh.");
  if (d === 0 && date === addDaysIso(A.easter, 21)) out.push("Chúa Nhật Chúa Chiên Lành — Ngày Thế giới cầu nguyện cho Ơn Thiên Triệu.");
  if (date === A.ascension) out.push("Ngày Thế giới Truyền thông Xã hội.");
  if (date === A.sacredHeart) out.push("Ngày Thế giới xin ơn thánh hóa các linh mục.");
  if (date === A.holyThu) out.push("Cầu nguyện cho các linh mục trong ngày lập Bí tích Thánh Thể và Chức Thánh.");
  if (date === A.goodFri) out.push("Ngày ăn chay và kiêng thịt; quyên góp giúp các nơi thánh tại Đất Thánh.");
  // Chúa Nhật thứ tư tháng Bảy: Ngày Thế giới Ông bà và Người cao tuổi
  if (d === 0 && mmdd >= "07-22" && mmdd <= "07-28") out.push("Ngày Thế giới Ông bà và Người cao tuổi.");
  // Chúa Nhật áp chót tháng Mười: Chúa Nhật Truyền giáo
  if (d === 0 && mmdd >= "10-18" && mmdd <= "10-24") out.push("Chúa Nhật Thế giới Truyền giáo — cầu nguyện và đóng góp cho việc truyền giáo.");
  if (d === 0 && date === addDaysIso(A.christTheKing, -7)) out.push("Ngày Thế giới Người nghèo. Có thể mừng trọng thể Các Thánh Tử Đạo Việt Nam.");
  if (date === A.christTheKing) out.push("Ngày Giới trẻ của các giáo phận.");
  if (date === ymd(y, 11, 24) || mmdd === "11-24") out.push("Cầu cho Giáo Hội Việt Nam, xin ơn trung thành với đức tin của cha ông.");
  return out;
}

const tetTitle = (n: 1 | 2 | 3, yearName: string) =>
  n === 1
    ? `Mồng Một Tết ${yearName} — Cầu bình an cho năm mới`
    : n === 2
      ? "Mồng Hai Tết — Kính nhớ Tổ tiên và Ông bà Cha mẹ"
      : "Mồng Ba Tết — Thánh hóa công ăn việc làm";

// ---------------------------------------------------------------------
// API công khai
// ---------------------------------------------------------------------
const dayCache = new Map<string, LitDay>();

export function liturgicalDay(date: string): LitDay {
  const hit = dayCache.get(date);
  if (hit) return hit;
  const y = +date.slice(0, 4);
  const A = anchors(y);
  const T = temporalOf(date);
  const d = dowOf(date);
  const mmdd = date.slice(5);
  const { cands, notes: sNotes } = sanctoral(y);
  const notes: string[] = [...(sNotes.get(date) ?? [])];
  const optional: LitDay["optional"] = [];
  const list = [...(cands.get(date) ?? [])];

  // Chọn cử hành chính
  let winner: Cand = T.cand;
  const higher = list.filter((c) => c.prec < 10).sort((a, b) => a.prec - b.prec);
  for (const c of higher) {
    if (c.prec < winner.prec) {
      if (winner.prec <= 8 && winner !== T.cand) notes.push(`Không cử hành ${winner.title} vì trùng ${c.title}.`);
      winner = c;
    } else if (c.prec >= 5) notes.push(`Năm nay không cử hành ${leTitle(c.title)} vì trùng ${winner.title}.`);
  }
  let altLect: LectionaryRef[] = [];
  const memorials = list.filter((c) => c.prec >= 10);
  const obligatory = memorials.filter((c) => c.rank === "memorial");
  if (winner.prec <= 8) {
    for (const m of obligatory) notes.push(`Không cử hành lễ nhớ ${m.title} (trùng ${winner.title}).`);
  } else if (winner.prec === 9) {
    for (const m of memorials) optional.push({ title: `Kính nhớ ${m.title}`, color: m.color, rank: "optional" });
  } else {
    if (obligatory.length === 1) {
      const m = obligatory[0];
      winner = { ...m, lect: m.lect.length ? m.lect : T.cand.lect };
      altLect = m.altLect ?? [];
    } else if (obligatory.length > 1) {
      notes.push("Các lễ nhớ trùng ngày nên đều trở thành lễ nhớ tùy ý.");
      for (const m of obligatory) optional.push({ title: m.title, color: m.color, rank: "optional" });
    }
    for (const m of memorials.filter((c) => c.rank === "optional")) optional.push({ title: m.title, color: m.color, rank: "optional" });
    if (T.season === "ordinary" && d === 6 && obligatory.length === 0) optional.push({ title: "Đức Maria ngày thứ Bảy", color: "white", rank: "optional" });
  }
  // Lễ nhớ/lễ kính dùng bài đọc ngày thường nếu không có bài đọc riêng
  let lectionary = winner.lect.length ? winner.lect : T.cand.lect;
  if (winner !== T.cand && winner.prec < 9 && winner.lect.length && T.cand.lect.length && winner.rank !== "solemnity" && winner.rank !== "all_souls") {
    // Lễ kính có bài đọc riêng; bài đọc ngày thường vẫn tham khảo được
    altLect = [...altLect, ...T.cand.lect.map((l) => ({ ...l, label: "Bài đọc ngày thường" }))];
  }

  // Tết Nguyên Đán
  let tet: 0 | 1 | 2 | 3 = 0;
  const lunar = solarToLunar(+date.slice(8, 10), +date.slice(5, 7), y);
  const yearName = lunarYearName(lunar.year);
  if (A.tet) {
    const k = diffDays(date, A.tet);
    if (k >= 0 && k <= 2 && T.season !== "triduum") {
      tet = (k + 1) as 1 | 2 | 3;
      const base = winner;
      if (base.prec <= 2 && base.key.startsWith("lent-0")) {
        notes.push(`Hôm nay là ${base.title} theo lịch chung. Tại Việt Nam, Thánh lễ Lễ Tro (làm phép tro, xức tro, ăn chay và kiêng thịt) được dời sang Mồng Bốn Tết ${+A.ashRite.slice(8)}/${+A.ashRite.slice(5, 7)}; các Giờ Kinh Phụng Vụ vẫn theo ngày Thứ Tư Lễ Tro.`);
      } else if (base !== T.cand || base.prec <= 6) {
        notes.push(`Theo lịch chung hôm nay là ${base.title}.`);
      }
      winner = {
        key: `tet-${tet}`,
        title: tetTitle(tet, yearName),
        rank: "tet",
        prec: 1.9,
        color: "white",
        lect: [{ key: `tet-${tet}`, cycle: "" }],
      };
      lectionary = winner.lect;
      optional.length = 0;
    }
  }
  if (date === A.ashRite && A.ashRite !== A.ashWed) {
    notes.push("Cử hành Thánh lễ Lễ Tro: làm phép tro và xức tro, ăn chay và kiêng thịt (dời từ Thứ Tư Lễ Tro vì trùng Tết).");
    winner = { ...winner, key: "ash-rite", title: `Lễ Tro — khởi đầu Mùa Chay (dời sang Mồng Bốn Tết, ${WEEKDAY_LABEL[d]})`, rank: "privileged", color: "violet" };
    lectionary = [{ key: "lent-0-3", cycle: "", label: "Thánh lễ Lễ Tro" }, ...lectionary.map((l) => ({ ...l, label: l.label ?? "Bài đọc ngày thường" }))];
  }

  // Ghi chú lòng đạo đức đầu tháng
  const dom = +date.slice(8, 10);
  if (dom <= 7) {
    if (d === 4) notes.push("Thứ Năm đầu tháng — cầu nguyện cho các linh mục và ơn thiên triệu.");
    if (d === 5) notes.push("Thứ Sáu đầu tháng — ngày đền tạ Thánh Tâm Chúa Giêsu.");
    if (d === 6) notes.push("Thứ Bảy đầu tháng — ngày đền tạ Trái Tim Vô Nhiễm Đức Mẹ.");
  }
  if (date === addDaysIso(A.pentecost, -1)) notes.push("Chiều nay: Lễ Vọng Chúa Thánh Thần Hiện Xuống.");
  if (mmdd === "12-24") notes.push("Chiều tối nay: Lễ Vọng Giáng Sinh.");
  if (date === addDaysIso(A.adv1, -1)) notes.push("Kết thúc năm phụng vụ; chiều nay bắt đầu Mùa Vọng.");

  // Chay tịnh
  let fasting: LitDay["fasting"] = null;
  const ashFast = A.ashRite;
  if (date === ashFast || date === A.goodFri) fasting = "fast_abstinence";
  else if (d === 5 && !(winner.rank === "solemnity" || winner.rank === "tet")) fasting = "abstinence";

  const isSolemnity = winner.rank === "solemnity" || winner.rank === "triduum";
  const isObligation = d === 0 || ["christmas", "saint-08-15", "saint-11-01"].includes(winner.key);
  const isHighlight = isSolemnity || winner.rank === "feast_lord" || winner.rank === "tet" || date === A.ashRite || winner.key === "palm";
  const psalter =
    T.season === "ordinary" || T.season === "advent" || (T.season === "lent" && (T.week ?? 0) > 0) || (T.season === "easter" && (T.week ?? 0) > 1)
      ? (((T.week ?? 1) - 1) % 4) + 1
      : T.season === "lent"
        ? 4
        : null;

  const weekLabel =
    T.week == null
      ? null
      : T.season === "lent" && T.week === 0
        ? "Sau Lễ Tro"
        : T.season === "lent" && T.week === 6
          ? "Tuần Thánh"
          : T.season === "easter" && T.week === 1
            ? "Tuần Bát Nhật Phục Sinh"
            : `Tuần ${ROMAN[T.week]} ${T.season === "ordinary" ? "Thường Niên" : SEASON_LABEL[T.season]}`;

  const litYear = T.litYear;
  const out: LitDay = {
    date,
    weekday: d,
    weekdayLabel: WEEKDAY_LABEL[d],
    season: T.season,
    seasonLabel: SEASON_LABEL[T.season],
    week: T.week,
    weekLabel,
    sundayCycle: (["C", "A", "B"] as const)[litYear % 3],
    weekdayCycle: litYear % 2 === 1 ? "I" : "II",
    psalterWeek: psalter,
    title: winner.title,
    rank: winner.rank,
    rankLabel:
      winner.rank === "privileged"
        ? winner.key.startsWith("holy-")
          ? "Tuần Thánh"
          : winner.key.startsWith("east-1")
            ? "Bát Nhật Phục Sinh"
            : winner.key === "lent-0-3" || winner.key === "ash-rite"
              ? "Khởi đầu Mùa Chay"
              : "Ngày thường"
        : RANK_LABEL[winner.rank],
    color: winner.color,
    optional,
    notes: [...new Set(notes)],
    intentions: [...specialIntentions(date, A, winner.key), ...(dom === 1 && MONTH_DEVOTION[+mmdd.slice(0, 2)] ? [MONTH_DEVOTION[+mmdd.slice(0, 2)]] : [])],
    isSunday: d === 0,
    isSolemnity,
    isObligation,
    isHighlight,
    fasting,
    tet,
    lunar: { day: lunar.day, month: lunar.month, leap: lunar.leap, yearName, label: `${lunar.day}/${lunar.month}${lunar.leap ? " (nhuận)" : ""} ${yearName}` },
    lectionary,
    altLectionary: altLect,
  };
  if (dayCache.size > 5000) dayCache.clear();
  dayCache.set(date, out);
  return out;
}

/** Các ngày phụng vụ từ `from` đến `to` (bao gồm), tối đa 400 ngày. */
export function liturgicalRange(from: string, to: string): LitDay[] {
  const out: LitDay[] = [];
  const n = Math.min(Math.max(diffDays(to, from), 0), 400);
  for (let i = 0; i <= n; i++) out.push(liturgicalDay(addDaysIso(from, i)));
  return out;
}

/** Mốc quan trọng của năm (cho trang hướng dẫn / kiểm thử). */
export function yearAnchors(y: number) {
  const A = anchors(y);
  return { easter: A.easter, ashWednesday: A.ashWed, ashRite: A.ashRite, pentecost: A.pentecost, adventStart: A.adv1, christTheKing: A.christTheKing, tet: A.tet };
}
