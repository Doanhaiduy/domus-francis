import type { MetadataRoute } from "next";
import { sitemapArticles } from "@/server/modules/articles";
import { listPublicAlbums, getDonationInfo } from "@/server/modules/public-site";
import { publicDb, siteOrigin } from "@/server/public";

// Sơ đồ trang cho công cụ tìm kiếm: chỉ các trang công khai (bài viết đã đăng, album công khai).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const [articles, albums, donation] = await Promise.all([
    publicDb((tx) => sitemapArticles(tx)).catch(() => []),
    publicDb((tx) => listPublicAlbums(tx, 100)).catch(() => []),
    publicDb((tx) => getDonationInfo(tx)).catch(() => ({ enabled: false })),
  ]);
  const at = (p: string) => `${origin}${p}`;
  const pages: MetadataRoute.Sitemap = [
    { url: at("/tin-tuc"), changeFrequency: "daily", priority: 1 },
    { url: at("/gioi-thieu"), changeFrequency: "monthly", priority: 0.8 },
    { url: at("/lien-he"), changeFrequency: "monthly", priority: 0.8 },
    { url: at("/hoi-dap"), changeFrequency: "monthly", priority: 0.7 },
    { url: at("/thu-vien"), changeFrequency: "weekly", priority: 0.6 },
    ...(donation.enabled ? [{ url: at("/ung-ho"), changeFrequency: "yearly" as const, priority: 0.4 }] : []),
  ];
  return [
    ...pages,
    ...articles.map((a) => ({ url: at(`/tin-tuc/${a.slug}`), lastModified: a.updatedAt || undefined, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...albums.map((a) => ({ url: at(`/thu-vien/${a.id}`), lastModified: a.takenOn, changeFrequency: "yearly" as const, priority: 0.4 })),
  ];
}
