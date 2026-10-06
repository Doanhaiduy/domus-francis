import { listPublished } from "@/server/modules/articles";
import { getOrgInfo, publicDb, siteOrigin } from "@/server/public";
import { articleCategoryLabel } from "@/lib/types/articles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Nguồn cấp RSS 2.0 cho 30 bài mới nhất (để độc giả/ứng dụng đọc tin theo dõi bản tin). */
export async function GET() {
  const origin = siteOrigin();
  const [org, list] = await Promise.all([getOrgInfo(), publicDb((tx) => listPublished(tx, { pageSize: 30 }))]);
  const items = list.articles
    .map((a) => {
      const link = `${origin}/tin-tuc/${a.slug}`;
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      ${a.publishedAt ? `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>` : ""}
      <category>${esc(articleCategoryLabel(a.category))}</category>
      <description>${esc(a.summary ?? a.title)}</description>
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(org.houseName)} — Bản tin</title>
    <link>${origin}/tin-tuc</link>
    <description>${esc(org.motto ?? `Tin tức và thông tin tuyển sinh của ${org.houseName}`)}</description>
    <language>vi</language>
    <atom:link href="${origin}/tin-tuc/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600, s-maxage=600" } });
}
