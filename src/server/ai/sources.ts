import "server-only";
import { testBaseUrl } from "./config";

// ---------------------------------------------------------------------
// Nguồn tư liệu MIỄN PHÍ, địa chỉ cố định trong mã (allow-list): tin Vatican News tiếng Việt (RSS) và Wikipedia tiếng Việt (API tóm tắt).
// Dùng để bổ sung dữ kiện khi tra cứu web bằng Gemini không dùng được/hết hạn mức; không bao giờ nhận URL từ người dùng.
// Chỉ lấy tiêu đề + tóm tắt + liên kết gốc — người soạn tự mở nguồn để kiểm; không chép nguyên văn bài.
// ---------------------------------------------------------------------

export interface SourceItem {
  kind: "vatican" | "wikipedia";
  title: string;
  url: string;
  /** Tóm tắt ngắn (≤ 400 ký tự) do chính nguồn cung cấp. */
  summary: string;
  date?: string;
}

const UA = "LuuXaPhanxico/1.0 (+https://domus-francis-production.vercel.app)";
const FEED_TTL_MS = 60 * 60 * 1000;

const vaticanFeeds = () => {
  const t = testBaseUrl();
  return t ? [`${t}/vaticannews/vi.rss.xml`] : ["https://www.vaticannews.va/vi.rss.xml", "https://www.vaticannews.va/vi/church.rss.xml"];
};
const vaticanOk = (url: string) => /^https:\/\/www\.vaticannews\.va\//i.test(url) || (!!testBaseUrl() && url.startsWith(testBaseUrl()!));
const wikiBase = () => (testBaseUrl() ? `${testBaseUrl()}/wikipedia` : "https://vi.wikipedia.org");

async function getText(url: string, accept: string, timeoutMs = 8000, maxBytes = 900_000): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder("utf-8").decode(buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf);
}

const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n: string) => (+n > 31 && +n < 0x10ffff ? String.fromCodePoint(+n) : " "))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]) : "";
};

/** Bỏ dấu + chữ thường để so khớp từ khóa tiếng Việt. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/** Từ thông dụng của câu chủ đề — so theo dạng CÓ DẤU ("đang" ≠ "đẳng"; bỏ dấu rồi mới so thì từ khóa "Đẳng" bị nuốt mất). */
const STOP_VI = new Set(["bài", "viết", "về", "của", "cho", "các", "những", "một", "này", "tháng", "năm", "ngày", "trong", "tại", "lưu", "xá", "với", "khi", "đang", "được", "đến", "sinh", "viên", "nhà", "thông", "báo", "hoạt", "động", "và", "là", "có", "để", "từ"]);
/**
 * Từ quá chung của chủ đề Công giáo (đã bỏ dấu): trùng mỗi từ này KHÔNG đủ coi một tin là liên quan — "cầu nguyện" có ở vô số tin
 * (vd. "cầu nguyện cho Đức Thánh Cha" không liên quan bài "cầu cho các Đẳng"). Tin phải trùng ít nhất một từ ĐẶC TRƯNG của đề tài.
 */
const GENERIC = new Set(["cau", "nguyen", "cong", "giao", "hoi", "duc", "thanh", "chua", "thien", "cha", "giam", "muc", "tin", "huu", "kinh", "gia", "dinh", "tam", "long", "dieu", "viec"]);
/** Tập các từ (đã bỏ dấu, chữ thường) của một đoạn văn — để so khớp từ khóa theo từ nguyên vẹn. */
const tokenSet = (s: string): Set<string> => new Set(fold(s).split(/[^a-z0-9]+/).filter(Boolean));
export const keywordsOf = (q: string): string[] => {
  const words = q.normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP_VI.has(w));
  return [...new Set(words.map((w) => fold(w)))].slice(0, 10);
};
const distinctive = (kw: string[]) => kw.filter((w) => !GENERIC.has(w));

const feedCache = (globalThis as unknown as { __luuxaFeedCache?: { at: number; items: SourceItem[] } });

async function loadFeed(): Promise<SourceItem[]> {
  const ttl = testBaseUrl() ? 0 : FEED_TTL_MS;
  if (feedCache.__luuxaFeedCache && Date.now() - feedCache.__luuxaFeedCache.at < ttl) return feedCache.__luuxaFeedCache.items;
  const settled = await Promise.allSettled(vaticanFeeds().map((u) => getText(u, "application/rss+xml, application/xml, text/xml")));
  const items: SourceItem[] = [];
  const seen = new Set<string>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const m of r.value.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
      const b = m[0];
      const url = tag(b, "link");
      const title = tag(b, "title");
      if (!title || !url || !vaticanOk(url) || seen.has(url)) continue;
      seen.add(url);
      const d = tag(b, "pubDate");
      items.push({ kind: "vatican", title: title.slice(0, 200), url: url.slice(0, 500), summary: tag(b, "description").slice(0, 400), date: d ? new Date(d).toISOString().slice(0, 10) : undefined });
    }
  }
  if (items.length) feedCache.__luuxaFeedCache = { at: Date.now(), items };
  else if (feedCache.__luuxaFeedCache) return feedCache.__luuxaFeedCache.items; // nguồn lỗi tạm thời: dùng bản cũ còn hơn không
  return items;
}

/** Tin Vatican News (tiếng Việt) liên quan tới `query` (khớp từ khóa không dấu; tiêu đề tính gấp đôi). Lỗi mạng ⇒ mảng rỗng. */
export async function vaticanNews(query: string, limit = 3): Promise<SourceItem[]> {
  const kw = keywordsOf(query);
  if (!kw.length) return [];
  let items: SourceItem[];
  try {
    items = await loadFeed();
  } catch {
    return [];
  }
  const need = Math.min(2, kw.length);
  const special = distinctive(kw);
  return items
    .map((it) => {
      // So khớp theo TỪ nguyên vẹn (không phải chuỗi con: "man" không được khớp "mang", "nguyen" không khớp "nguyên thủ")
      const t = tokenSet(it.title);
      const s = tokenSet(it.summary);
      const score = kw.reduce((a, w) => a + (t.has(w) ? 2 : s.has(w) ? 1 : 0), 0);
      const specialHits = special.filter((w) => t.has(w) || s.has(w)).length;
      return { it, score, hits: kw.filter((w) => t.has(w) || s.has(w)).length, specialHits };
    })
    // đủ số từ khóa VÀ (nếu đề tài có từ đặc trưng) phải trùng từ đặc trưng — đề tài có ≥ 2 từ đặc trưng thì trùng ≥ 2 (một từ riêng lẻ như "Tòa" hay "Hồng" dễ khớp nhầm tin khác)
    .filter((x) => x.hits >= need && (!special.length || x.specialHits >= Math.min(2, special.length)))
    .sort((a, b) => b.score - a.score || (b.it.date ?? "").localeCompare(a.it.date ?? ""))
    .slice(0, limit)
    .map((x) => x.it);
}

interface WikiSearch {
  pages?: { key?: string; title?: string; description?: string | null; excerpt?: string | null }[];
}
interface WikiSummary {
  title?: string;
  extract?: string;
  description?: string;
}

/**
 * Dấu hiệu một trang Wikipedia nói về đạo Công giáo (đã bỏ dấu, tìm trong tiêu đề + mô tả + tóm tắt). Nhà là cộng đoàn Công giáo nên chỉ
 * lấy trang có một trong các dấu hiệu này — tìm theo cả câu chủ đề hay ra trang đạo khác dùng chung chữ "Hội Thánh", "Tòa Thánh" (vd. Cao Đài).
 */
const CATHOLIC_MARKERS = ["cong giao", "kito", "ki-to", "giao hoang", "vatican", "giesu", "gie-su", "duc me", "giao phan", "giao xu", "linh muc", "giam muc", "hong y", "thanh le", "tong do", "man coi", "giao hoi cong giao"];
/** Tôn giáo/đạo khác: nếu phần ĐỊNH NGHĨA của trang (tiêu đề + mô tả + ~200 ký tự đầu tóm tắt) nêu thì loại, dù có chữ trùng với đề tài. */
const OTHER_FAITHS = ["cao dai", "phat giao", "hoa hao", "hoi giao", "islam", "tin lanh", "ba ha", "bao son", "tu an hieu nghia", "dao mau", "do thai", "an do giao", "hindu", "khong giao", "dao giao", "mormon", "chung nhan jehovah", "nhan chung giehova"];
const hasAny = (haystack: string, needles: string[]) => needles.some((n) => haystack.includes(n));

/** Tóm tắt Wikipedia tiếng Việt cho `query` (tối đa `limit` trang). Chỉ giữ trang đúng đề tài VÀ thuộc Công giáo. Lỗi mạng ⇒ mảng rỗng. */
export async function wikipediaVi(query: string, limit = 2): Promise<SourceItem[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 3) return [];
  const searchKeys = async (text: string): Promise<string[]> => {
    const r = JSON.parse(await getText(`${wikiBase()}/w/rest.php/v1/search/page?q=${encodeURIComponent(text)}&limit=3`, "application/json")) as WikiSearch;
    return (r.pages ?? []).map((p) => p.key).filter((k): k is string => !!k && /^[^/?#]{1,200}$/.test(k));
  };
  try {
    // Tìm 2 lượt song song: đúng câu chủ đề, và kèm "Công giáo" để công cụ tìm kiếm ưu tiên trang của đạo mình (một lượt lỗi không làm hỏng lượt kia)
    const withFaith = fold(q).includes("cong giao") ? q : `${q} Công giáo`.slice(0, 80);
    const searches = await Promise.allSettled(withFaith === q ? [searchKeys(q)] : [searchKeys(q), searchKeys(withFaith)]);
    let keys = [...new Set(searches.flatMap((s) => (s.status === "fulfilled" ? s.value : [])))].slice(0, 5);
    if (!keys.length && q.split(" ").length > 3) keys = (await searchKeys(q.split(" ").slice(0, 3).join(" "))).slice(0, 3);
    const out: (SourceItem & { description: string })[] = [];
    await Promise.all(
      keys.map(async (key) => {
        try {
          const j = JSON.parse(await getText(`${wikiBase()}/api/rest_v1/page/summary/${encodeURIComponent(key)}`, "application/json")) as WikiSummary;
          const extract = decode(j.extract ?? "").slice(0, 400);
          if (!extract) return;
          out.push({ kind: "wikipedia", title: decode(j.title ?? key.replace(/_/g, " ")).slice(0, 200), url: `https://vi.wikipedia.org/wiki/${encodeURIComponent(key)}`, summary: extract, description: decode(j.description ?? "") });
        } catch {
          /* bỏ qua trang lỗi */
        }
      }),
    );
    // Công cụ tìm kiếm của Wikipedia hay trả về trang lạc đề (vd. tìm "cầu nguyện cho các đẳng" ra "Hoa Kỳ", tìm "Tòa Thánh" ra "Cao Đài")
    // ⇒ giữ trang (1) có từ khóa ĐẶC TRƯNG của đề tài, (2) thuộc Công giáo, (3) không phải trang của đạo khác. Trang trùng từ đặc trưng ở tiêu đề từ 2 lần trở lên
    // (tên riêng đúng đề tài) được miễn điều kiện (2) nhưng vẫn phải qua (3).
    const kw = keywordsOf(query);
    const special = distinctive(kw);
    return keys
      .map((k) => out.find((o) => o.url.endsWith(encodeURIComponent(k))))
      .filter((x): x is SourceItem & { description: string } => !!x)
      .filter((x) => {
        const definition = fold(`${x.title} ${x.description} ${x.summary.slice(0, 200)}`);
        if (hasAny(definition, OTHER_FAITHS)) return false;
        if (!kw.length) return hasAny(fold(`${x.title} ${x.description} ${x.summary}`), CATHOLIC_MARKERS);
        const tokens = tokenSet(`${x.title} ${x.summary}`);
        const need = special.length ? special : kw;
        if (!need.some((w) => tokens.has(w))) return false;
        const titleHits = need.filter((w) => tokenSet(x.title).has(w)).length;
        return titleHits >= 2 || hasAny(fold(`${x.title} ${x.description} ${x.summary}`), CATHOLIC_MARKERS);
      })
      .slice(0, limit)
      .map(({ description: _d, ...item }) => item);
  } catch {
    return [];
  }
}
