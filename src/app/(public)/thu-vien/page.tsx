import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ImageIcon, MapPin } from "lucide-react";
import { listPublicAlbums } from "@/server/modules/public-site";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getSiteInfo, publicDb, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { JoinCta } from "@/components/public/JoinCta";
import { publicFileUrl } from "@/lib/articles-format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const title = `Thư viện ảnh — ${org.houseName}`;
  const description = `Khoảnh khắc đời sống, sinh hoạt và lễ hội của ${org.houseName}.`;
  return { metadataBase: new URL(siteOrigin()), title, description, openGraph: { title, description, type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES } };
}

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function GalleryPage() {
  const [site, albums] = await Promise.all([getSiteInfo(), publicDb((tx) => listPublicAlbums(tx))]);
  return (
    <>
      <PublicHeader org={site.org} section="thu-vien" donationEnabled={site.donationEnabled} />
      <PageHero eyebrow="Thư viện" title="Khoảnh khắc của nhà" subtitle="Những hình ảnh về đời sống chung, sinh hoạt và các dịp lễ của anh em." />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 space-y-12">
        {albums.length ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/thu-vien/${a.id}`} className="group block rounded-3xl overflow-hidden bg-white border border-purple-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
                  <div className="aspect-[4/3] bg-gray-100 overflow-hidden relative">
                    {a.coverFileId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={publicFileUrl(a.coverFileId, "medium")!} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-10 h-10" aria-hidden /></div>
                    )}
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-bold"><Camera className="w-3 h-3" aria-hidden />{a.photosCount} ảnh</span>
                  </div>
                  <div className="p-5">
                    <h2 className="font-extrabold text-gray-900 leading-snug group-hover:text-primary transition-colors line-clamp-2">{a.title}</h2>
                    <p className="mt-1.5 text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <time dateTime={a.takenOn}>{fmt(a.takenOn)}</time>
                      {a.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden />{a.location}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-14 text-center">
            <Camera className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden />
            <p className="font-bold text-gray-900">Chưa có album nào được công khai</p>
            <p className="text-sm text-gray-500 mt-1">Hãy quay lại sau nhé.</p>
          </div>
        )}
        <JoinCta org={site.org} />
      </div>
    </>
  );
}
