import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CalendarHeart, Church, House, MapPin, Phone } from "lucide-react";
import { listPublished } from "@/server/modules/articles";
import { listPublicAlbums } from "@/server/modules/public-site";
import { OG_DEFAULT_IMAGES, SITE_KIND } from "@/lib/public-site";
import { getSiteInfo, publicDb } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { JoinCta } from "@/components/public/JoinCta";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { ArticleCard } from "@/components/public/ArticleCard";
import { publicFileUrl } from "@/lib/articles-format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const description = org.motto
    ? `${org.motto}. ${org.houseName} — ${SITE_KIND}: tinh thần, đời sống chung và cách đăng ký vào ở.`
    : `${org.houseName} — ${SITE_KIND}: cùng học, cùng sống và cùng cầu nguyện. Tinh thần, đời sống chung và cách đăng ký vào ở.`;
  return {
    title: `Giới thiệu ${SITE_KIND}`,
    description,
    alternates: { canonical: "/gioi-thieu" },
    openGraph: { title: `Giới thiệu — ${org.houseName}`, description, url: "/gioi-thieu", type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES },
  };
}

const FEAST_MONTH = (v: string | null) => {
  const m = /^(\d{1,2})[-/](\d{1,2})$/.exec(v ?? "");
  if (!m) return v;
  // lưu dạng "MM-DD" (vd. 12-08) hoặc "DD/MM": cả hai đều hiện thành "08/12"
  const [a, b] = [Number(m[1]), Number(m[2])];
  return v?.includes("/") ? `${String(a).padStart(2, "0")}/${String(b).padStart(2, "0")}` : `${String(b).padStart(2, "0")}/${String(a).padStart(2, "0")}`;
};

export default async function AboutPage() {
  const site = await getSiteInfo();
  const org = site.org;
  const [latest, albums] = await Promise.all([publicDb((tx) => listPublished(tx, { pageSize: 3 })), publicDb((tx) => listPublicAlbums(tx, 4))]);

  const facts = [
    org.patronName && { icon: Church, label: "Bổn mạng", value: `${org.patronName}${org.patronFeast ? ` — ngày ${FEAST_MONTH(org.patronFeast)}` : ""}` },
    org.orderName && { icon: Building2, label: "Thuộc", value: org.orderName },
    org.address && { icon: MapPin, label: "Địa chỉ", value: org.address },
    org.phone && { icon: Phone, label: "Hotline", value: org.phone },
  ].filter(Boolean) as { icon: typeof Church; label: string; value: string }[];

  return (
    <>
      <PublicHeader org={org} section="gioi-thieu" donationEnabled={site.donationEnabled} />
      <PageHero eyebrow="Về chúng tôi" title={org.houseName} subtitle={org.motto ? `“${org.motto}”` : "Cộng đoàn sinh viên Công giáo — nơi cùng học, cùng sống và cùng cầu nguyện."} />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 space-y-12">
        {facts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 -mt-16 sm:-mt-20 relative">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl bg-white border border-purple-100 shadow-md p-5">
                <f.icon className="w-5 h-5 text-primary mb-2.5" aria-hidden />
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">{f.label}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5 leading-snug">{f.value}</p>
              </div>
            ))}
          </div>
        )}

        <section className="max-w-3xl">
          {org.about ? (
            <ArticleMarkdown source={org.about} />
          ) : (
            <div className="text-[17px] leading-8 text-gray-700 space-y-5">
              <p>
                {org.houseName} là mái nhà chung của những sinh viên Công giáo xa gia đình. Ở đây, anh em <b>cùng học, cùng sống và cùng cầu nguyện</b>:
                chia sẻ bữa cơm, luân phiên việc nhà, tham dự Thánh lễ và đọc kinh chung, giúp nhau trong học tập và trưởng thành.
              </p>
              <p>Chúng tôi chào đón các bạn sinh viên có nhu cầu ở trọ trong một môi trường lành mạnh, đầm ấm và có đời sống đức tin. Hãy đến thăm nhà để cảm nhận không khí gia đình ấy.</p>
            </div>
          )}
        </section>

        <Link
          href="/vao-o"
          className="group flex flex-col sm:flex-row sm:items-center gap-4 rounded-3xl bg-white border border-purple-100 p-5 sm:p-6 hover:border-purple-300 hover:shadow-md transition"
        >
          <span className="w-12 h-12 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0" aria-hidden>
            <House className="w-6 h-6" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-lg font-extrabold text-gray-900 group-hover:text-primary transition-colors">Muốn vào ở lưu xá?</span>
            <span className="block text-sm text-gray-600 mt-0.5 leading-relaxed">Chi phí, chỗ còn trống, nhịp sinh hoạt và các bước để trở thành thành viên của nhà.</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary shrink-0">
            Xem chi tiết <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden />
          </span>
        </Link>

        {albums.length > 0 && (
          <section aria-labelledby="gallery">
            <div className="flex items-end justify-between gap-3 mb-5">
              <h2 id="gallery" className="text-xl sm:text-2xl font-extrabold text-gray-900">Khoảnh khắc của nhà</h2>
              <Link href="/thu-vien" className="text-sm font-bold text-primary hover:underline inline-flex items-center gap-1">Xem thư viện <ArrowRight className="w-4 h-4" aria-hidden /></Link>
            </div>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {albums.map((a) => (
                <Link key={a.id} href={`/thu-vien/${a.id}`} className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 border border-purple-100">
                  {a.coverFileId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={publicFileUrl(a.coverFileId, "medium")!} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white text-sm font-bold leading-snug line-clamp-2">{a.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {latest.articles.length > 0 && (
          <section aria-labelledby="news">
            <div className="flex items-end justify-between gap-3 mb-5">
              <h2 id="news" className="text-xl sm:text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2"><CalendarHeart className="w-5 h-5 text-primary" aria-hidden />Tin mới</h2>
              <Link href="/tin-tuc" className="text-sm font-bold text-primary hover:underline inline-flex items-center gap-1">Tất cả bài viết <ArrowRight className="w-4 h-4" aria-hidden /></Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {latest.articles.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          </section>
        )}

        <JoinCta org={org} />
      </div>
    </>
  );
}
