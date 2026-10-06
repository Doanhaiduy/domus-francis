import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getPublicAlbum } from "@/server/modules/public-site";
import { getSiteInfo, publicDb, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { JoinCta } from "@/components/public/JoinCta";
import { PhotoGallery } from "@/components/public/PhotoGallery";
import { publicFileUrl } from "@/lib/articles-format";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const load = (id: string) => (UUID.test(id) ? publicDb((tx) => getPublicAlbum(tx, id)) : Promise.resolve(null));

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const [album, { org }] = await Promise.all([load(params.id), getSiteInfo()]);
  if (!album) return { title: "Không tìm thấy album" };
  const description = album.description || `${album.photosCount} ảnh — ${album.title}, ${org.houseName}.`;
  const cover = publicFileUrl(album.coverFileId, "medium");
  return {
    metadataBase: new URL(siteOrigin()),
    title: `${album.title} — ${org.houseName}`,
    description,
    alternates: { canonical: `/thu-vien/${album.id}` },
    openGraph: { title: album.title, description, type: "website", locale: "vi_VN", siteName: org.houseName, images: cover ? [{ url: cover }] : OG_DEFAULT_IMAGES },
  };
}

export default async function AlbumPage({ params }: { params: { id: string } }) {
  const [album, site] = await Promise.all([load(params.id), getSiteInfo()]);
  if (!album) notFound();
  const photos = album.photos.map((p) => ({ id: p.id, thumb: publicFileUrl(p.fileId, "medium")!, full: publicFileUrl(p.fileId)!, caption: p.caption }));
  const date = new Date(album.takenOn + "T00:00:00").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <>
      <PublicHeader org={site.org} section="thu-vien" donationEnabled={site.donationEnabled} />
      <PageHero eyebrow="Thư viện ảnh" title={album.title} subtitle={[date, album.location].filter(Boolean).join(" · ")} />
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/thu-vien" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><ArrowLeft className="w-4 h-4" aria-hidden />Tất cả album</Link>
          {album.location && <span className="inline-flex items-center gap-1 text-sm text-gray-500"><MapPin className="w-4 h-4" aria-hidden />{album.location}</span>}
        </div>
        {album.description && <p className="max-w-3xl text-[17px] leading-8 text-gray-700">{album.description}</p>}
        {photos.length ? <PhotoGallery photos={photos} albumTitle={album.title} /> : <p className="text-gray-500">Album chưa có ảnh nào.</p>}
        <JoinCta org={site.org} />
      </div>
    </>
  );
}
