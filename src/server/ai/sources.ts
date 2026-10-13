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

const STOP = new Set(["bai", "viet", "ve", "cua", "cho", "cac", "nhung", "mot", "nay", "thang", "nam", "ngay", "trong", "tai", "luu", "xa", "voi", "cac", "khi", "dang", "duoc", "den", "sinh", "vien", "nha", "thong", "bao", "hoat", "dong"]);
export const keywordsOf = (q: string): string[] => [...new Set(fold(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 10);

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
  return items
    .map((it) => {
      const t = fold(it.title);
      const s = fold(it.summary);
      const score = kw.reduce((a, w) => a + (t.includes(w) ? 2 : s.includes(w) ? 1 : 0), 0);
      return { it, score, hits: kw.filter((w) => t.includes(w) || s.includes(w)).length };
    })
    .filter((x) => x.hits >= need)
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

/** Tóm tắt Wikipedia tiếng Việt cho `query` (tối đa `limit` trang đầu của tìm kiếm). Lỗi mạng ⇒ mảng rỗng. */
export async function wikipediaVi(query: string, limit = 2): Promise<SourceItem[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 3) return [];
  try {
    let search = JSON.parse(await getText(`${wikiBase()}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`, "application/json")) as WikiSearch;
    if (!search.pages?.length && q.split(" ").length > 3) {
      const short = q.split(" ").slice(0, 3).join(" ");
      search = JSON.parse(await getText(`${wikiBase()}/w/rest.php/v1/search/page?q=${encodeURIComponent(short)}&limit=3`, "application/json")) as WikiSearch;
    }
    const keys = (search.pages ?? []).map((p) => p.key).filter((k): k is string => !!k && /^[^/?#]{1,200}$/.test(k)).slice(0, limit);
    const out: SourceItem[] = [];
    await Promise.all(
      keys.map(async (key) => {
        try {
          const j = JSON.parse(await getText(`${wikiBase()}/api/rest_v1/page/summary/${encodeURIComponent(key)}`, "application/json")) as WikiSummary;
          const extract = decode(j.extract ?? "").slice(0, 400);
          if (!extract) return;
          out.push({ kind: "wikipedia", title: decode(j.title ?? key.replace(/_/g, " ")).slice(0, 200), url: `https://vi.wikipedia.org/wiki/${encodeURIComponent(key)}`, summary: extract });
        } catch {
          /* bỏ qua trang lỗi */
        }
      }),
    );
    return keys.map((k) => out.find((o) => o.url.endsWith(encodeURIComponent(k)))).filter((x): x is SourceItem => !!x);
  } catch {
    return [];
  }
}
