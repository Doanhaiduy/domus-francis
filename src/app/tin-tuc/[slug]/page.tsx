import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, MapPin, Phone } from "lucide-react";
import { formatArticleDate, publicFileUrl } from "@/lib/articles-format";
import { articleCategoryLabel } from "@/lib/types/articles";
import { getPublishedBySlug } from "@/server/modules/articles";
import { getOrgInfo, publicDb, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { ArticleCard, ArticleMeta, CategoryChip, Cover } from "@/components/public/ArticleCard";
import { ShareBar, ViewBeacon } from "@/components/public/PublicClient";

export const dynamic = "force-dynamic";

const validSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

async function load(slug: string) {
  if (!validSlug(slug)) return null;
  return publicDb((tx) => getPublishedBySlug(tx, slug));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [data, org] = await Promise.all([load(params.slug), getOrgInfo()]);
  if (!data) return { title: `Không tìm thấy bài viết — ${org.houseName}`, robots: { index: false } };
  const { article } = data;
  const origin = siteOrigin();
  const description = article.summary ?? article.title;
  const cover = publicFileUrl(article.coverFileId, "medium");
  const image = cover ? `${origin}${cover}` : undefined;
  return {
    metadataBase: new URL(origin),
    title: `${article.title} — ${org.houseName}`,
    description,
    alternates: { canonical: `/tin-tuc/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: `/tin-tuc/${article.slug}`,
      siteName: org.houseName,
      locale: "vi_VN",
      publishedTime: article.publishedAt ?? undefined,
      section: articleCategoryLabel(article.category),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: article.title, description, images: image ? [image] : undefined },
  };
}

export default async function PublicArticlePage({ params }: { params: { slug: string } }) {
  const [data, org] = await Promise.all([load(params.slug), getOrgInfo()]);
  if (!data) notFound();
  const { article, related } = data;
  const origin = siteOrigin();
  const cover = publicFileUrl(article.coverFileId, "medium");

  // Dữ liệu có cấu trúc cho công cụ tìm kiếm
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary ?? undefined,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt || undefined,
    image: cover ? [`${origin}${cover}`] : undefined,
    author: { "@type": "Organization", name: article.byline || org.houseName },
    publisher: { "@type": "Organization", name: org.houseName },
    mainEntityOfPage: `${origin}/tin-tuc/${article.slug}`,
  };

  return (
    <>
      <PublicHeader org={org} activeCategory={article.category} />
      <ViewBeacon slug={article.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <article className="max-w-3xl mx-auto w-full px-4 sm:px-6 pt-8 pb-4">
        <Link href="/tin-tuc" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-primary transition mb-6">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Tất cả bài viết
        </Link>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href={`/tin-tuc?muc=${article.category}`}><CategoryChip code={article.category} /></Link>
          {article.isFeatured && <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600">★ Nổi bật</span>}
        </div>
        <h1 className="mt-4 text-3xl sm:text-[2.6rem] font-extrabold text-gray-900 tracking-tight leading-[1.15]">{article.title}</h1>
        {article.summary && <p className="mt-4 text-lg sm:text-xl text-gray-600 leading-relaxed">{article.summary}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 pb-6 border-b border-purple-100">
          <span className="inline-flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white font-extrabold text-sm flex items-center justify-center" aria-hidden>✝</span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-gray-900">{article.byline || org.houseName}</span>
              <span className="text-xs text-gray-500">{formatArticleDate(article.publishedAt)}</span>
            </span>
          </span>
          <ArticleMeta article={{ publishedAt: null, readMinutes: article.readMinutes }} />
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><Eye className="w-3.5 h-3.5" aria-hidden />{article.views.toLocaleString("vi-VN")} lượt xem</span>
        </div>
      </article>

      {cover && (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6">
          <div className="rounded-3xl overflow-hidden border border-purple-100 shadow-md aspect-[16/9] bg-gray-100">
            <Cover article={article} priority />
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pb-6">
        <ArticleMarkdown source={article.content} className="mt-6" />

        <div className="mt-10 pt-6 border-t border-purple-100">
          <ShareBar title={article.title} />
        </div>

        {/* LIÊN HỆ */}
        <aside className="mt-10 rounded-3xl bg-gradient-to-br from-[#5f3add] to-[#7857f8] text-white p-6 sm:p-8">
          <h2 className="text-xl font-extrabold">Bạn quan tâm đến {org.houseName}?</h2>
          <p className="mt-1.5 text-purple-100 text-sm leading-relaxed">Liên hệ Ban điều hành để được tư vấn, hoặc ghé thăm nhà vào một buổi chiều cuối tuần.</p>
          <ul className="mt-4 space-y-2 text-sm text-purple-50">
            {org.address && <li className="flex gap-2.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />{org.address}</li>}
            {org.phone && (
              <li className="flex gap-2.5"><Phone className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="font-bold hover:underline">{org.phone}</a></li>
            )}
          </ul>
          <Link href="/tin-tuc?muc=tuyen-sinh" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#ffffff] text-[#5f3add] text-sm font-extrabold hover:bg-[#f3f0ff] transition active:scale-95">
            Thông tin tuyển sinh <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10" aria-labelledby="more">
          <h2 id="more" className="text-xl font-extrabold text-gray-900 mb-5">Bài viết khác</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}
    </>
  );
}
