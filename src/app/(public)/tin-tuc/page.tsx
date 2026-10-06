import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Newspaper, Search, Sparkles } from "lucide-react";
import { ARTICLE_CATEGORIES, articleCategoryLabel } from "@/lib/types/articles";
import { featuredArticle, listPublished } from "@/server/modules/articles";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getOrgInfo, getSiteInfo, publicDb, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ArticleCard, ArticleMeta, CategoryChip, Cover } from "@/components/public/ArticleCard";
import { JoinCta } from "@/components/public/JoinCta";

export const dynamic = "force-dynamic";

type SearchParams = { muc?: string; q?: string; page?: string; tag?: string };
const PAGE_SIZE = 9;

const categoryOf = (v?: string) => ARTICLE_CATEGORIES.find((c) => c.code === v)?.code;
const tagOf = (v?: string) => (v ?? "").trim().toLowerCase().slice(0, 30);

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const org = await getOrgInfo();
  const cat = categoryOf(searchParams.muc);
  const tag = tagOf(searchParams.tag);
  const title = tag ? `#${tag} — ${org.houseName}` : cat ? `${articleCategoryLabel(cat)} — ${org.houseName}` : `Bản tin — ${org.houseName}`;
  const description = org.motto
    ? `${org.motto}. Tin tức, thông tin tuyển sinh và hoạt động của ${org.houseName}.`
    : `Tin tức, thông tin tuyển sinh và hoạt động của ${org.houseName} — cộng đoàn sinh viên Công giáo.`;
  return { metadataBase: new URL(siteOrigin()), title, description, alternates: { types: { "application/rss+xml": "/tin-tuc/rss.xml" } }, openGraph: { title, description, type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES } };
}

function pageHref(p: { muc?: string; q?: string; tag?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (p.muc) qs.set("muc", p.muc);
  if (p.tag) qs.set("tag", p.tag);
  if (p.q) qs.set("q", p.q);
  if (p.page && p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return `/tin-tuc${s ? `?${s}` : ""}`;
}

export default async function PublicHomePage({ searchParams }: { searchParams: SearchParams }) {
  const cat = categoryOf(searchParams.muc);
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const tag = tagOf(searchParams.tag);
  const page = Math.max(1, Math.min(500, Number.parseInt(searchParams.page ?? "1", 10) || 1));
  const filtered = !!cat || !!q || !!tag;

  const [site, list, featured] = await Promise.all([
    getSiteInfo(),
    publicDb((tx) => listPublished(tx, { category: cat, tag: tag || undefined, q, page, pageSize: PAGE_SIZE })),
    // Bài nổi bật chỉ hiện ở trang đầu, khi không lọc/tìm kiếm
    !filtered && page === 1 ? publicDb((tx) => featuredArticle(tx)) : Promise.resolve(null),
  ]);
  const org = site.org;
  const articles = featured ? list.articles.filter((a) => a.id !== featured.id) : list.articles;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const catInfo = ARTICLE_CATEGORIES.find((c) => c.code === cat);

  return (
    <>
      <PublicHeader org={org} section="tin-tuc" activeCategory={cat} donationEnabled={site.donationEnabled} />

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#4d2dbf] via-[#5f3add] to-[#7857f8] text-white">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-indigo-300/20 blur-3xl" aria-hidden />
        <div className={`relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 ${featured ? "pb-28 sm:pb-32" : "pb-12 sm:pb-16"}`}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[11px] font-extrabold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            {catInfo ? catInfo.label : "Bản tin cộng đoàn"}
          </span>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl">
            {catInfo ? catInfo.label : org.houseName}
          </h1>
          <p className="mt-3 text-base sm:text-lg text-purple-100 max-w-2xl leading-relaxed">
            {catInfo
              ? catInfo.description
              : org.motto
                ? `“${org.motto}” — Tin tức, thông tin tuyển sinh và những khoảnh khắc đẹp của cộng đoàn sinh viên Công giáo.`
                : "Tin tức, thông tin tuyển sinh và những khoảnh khắc đẹp của cộng đoàn sinh viên Công giáo."}
          </p>

          <form action="/tin-tuc" method="get" role="search" className="mt-7 flex max-w-xl gap-2">
            {cat && <input type="hidden" name="muc" value={cat} />}
            {tag && <input type="hidden" name="tag" value={tag} />}
            <label className="relative flex-1">
              <span className="sr-only">Tìm bài viết</span>
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
              <input
                name="q"
                defaultValue={q}
                placeholder="Tìm bài viết…"
                className="w-full h-11 pl-10 pr-3 rounded-2xl bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-white/30"
              />
            </label>
            <button type="submit" className="h-11 px-5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-sm font-bold border border-white/30 transition active:scale-95">
              Tìm
            </button>
          </form>
        </div>
      </section>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 space-y-10">
        {/* BÀI NỔI BẬT */}
        {featured && (
          <Link
            href={`/tin-tuc/${featured.slug}`}
            className="group grid md:grid-cols-[1.15fr_1fr] rounded-3xl overflow-hidden bg-white border border-purple-100 shadow-md hover:shadow-xl hover:shadow-primary/10 transition-shadow -mt-20 sm:-mt-24 relative"
          >
            <div className="aspect-[16/10] md:aspect-auto md:min-h-[320px] overflow-hidden bg-gray-100">
              <Cover article={featured} className="group-hover:scale-105 transition-transform duration-700" priority />
            </div>
            <div className="p-6 sm:p-9 flex flex-col justify-center gap-4">
              <div className="flex items-center gap-2">
                <CategoryChip code={featured.category} />
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600">★ Nổi bật</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight group-hover:text-primary transition-colors">{featured.title}</h2>
              {featured.summary && <p className="text-gray-600 leading-relaxed line-clamp-4">{featured.summary}</p>}
              <ArticleMeta article={featured} />
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                Đọc bài viết <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" aria-hidden />
              </span>
            </div>
          </Link>
        )}

        {/* DANH SÁCH */}
        <section aria-labelledby="latest">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h2 id="latest" className="text-xl sm:text-2xl font-extrabold text-gray-900">
                {q ? `Kết quả cho “${q}”` : tag ? `Thẻ #${tag}` : cat ? articleCategoryLabel(cat) : "Bài viết mới nhất"}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{list.total} bài viết</p>
            </div>
            {filtered && (
              <Link href="/tin-tuc" className="text-sm font-bold text-primary hover:underline">Xóa bộ lọc</Link>
            )}
          </div>

          {articles.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
              <Newspaper className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden />
              <p className="font-bold text-gray-900">{filtered ? "Không tìm thấy bài viết phù hợp" : "Chưa có bài viết nào"}</p>
              <p className="text-sm text-gray-500 mt-1">{filtered ? "Thử từ khóa khác hoặc xem tất cả bài viết." : "Bài viết đầu tiên sẽ sớm xuất hiện ở đây."}</p>
            </div>
          )}

          {pages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Phân trang">
              {page > 1 ? (
                <Link href={pageHref({ muc: cat, q, tag, page: page - 1 })} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-purple-100 bg-white text-sm font-bold text-gray-700 hover:text-primary transition">
                  <ChevronLeft className="w-4 h-4" aria-hidden /> Trước
                </Link>
              ) : (
                <span className="w-[88px]" />
              )}
              <span className="text-sm font-semibold text-gray-500">Trang {page} / {pages}</span>
              {page < pages ? (
                <Link href={pageHref({ muc: cat, q, tag, page: page + 1 })} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-purple-100 bg-white text-sm font-bold text-gray-700 hover:text-primary transition">
                  Sau <ChevronRight className="w-4 h-4" aria-hidden />
                </Link>
              ) : (
                <span className="w-[88px]" />
              )}
            </nav>
          )}
        </section>

        <JoinCta org={org} />
      </div>
    </>
  );
}
