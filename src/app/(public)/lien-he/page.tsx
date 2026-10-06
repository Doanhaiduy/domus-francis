import React from "react";
import type { Metadata } from "next";
import { ExternalLink, MapPin, Phone } from "lucide-react";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getSiteInfo, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { InquiryForm } from "@/components/public/InquiryForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const title = `Liên hệ & đăng ký tìm hiểu — ${org.houseName}`;
  const description = `Để lại thông tin để ${org.houseName} liên hệ tư vấn và hẹn bạn đến thăm nhà.`;
  return { metadataBase: new URL(siteOrigin()), title, description, openGraph: { title, description, type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES } };
}

export default async function ContactPage() {
  const { org, donationEnabled } = await getSiteInfo();
  const map = org.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address)}` : null;
  return (
    <>
      <PublicHeader org={org} section="lien-he" donationEnabled={donationEnabled} />
      <PageHero eyebrow="Liên hệ" title="Đăng ký tìm hiểu & liên hệ" subtitle="Bạn quan tâm đến việc vào ở lưu xá? Để lại thông tin, chúng tôi sẽ liên hệ và hẹn bạn đến thăm nhà." />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 grid gap-8 lg:grid-cols-[1.4fr_1fr] items-start">
        <section id="dang-ky" className="rounded-3xl bg-white border border-purple-100 shadow-sm p-6 sm:p-8 scroll-mt-28" aria-labelledby="form-title">
          <h2 id="form-title" className="text-xl font-extrabold text-gray-900 mb-5">Đăng ký tìm hiểu</h2>
          <InquiryForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </section>

        <aside className="space-y-4 lg:sticky lg:top-28">
          <div className="rounded-3xl bg-white border border-purple-100 p-6 space-y-4">
            <h2 className="text-base font-extrabold text-gray-900">Thông tin liên hệ</h2>
            {org.phone && (
              <div className="flex gap-3">
                <Phone className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Hotline</p>
                  <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="text-lg font-extrabold text-gray-900 hover:text-primary">{org.phone}</a>
                </div>
              </div>
            )}
            {org.address && (
              <div className="flex gap-3">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Địa chỉ</p>
                  <p className="text-sm font-semibold text-gray-900 leading-relaxed">{org.address}</p>
                  {map && (
                    <a href={map} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                      Xem bản đồ <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            )}
            {!org.phone && !org.address && <p className="text-sm text-gray-500">Hãy dùng biểu mẫu bên cạnh — chúng tôi sẽ liên hệ lại.</p>}
          </div>
          <div className="rounded-3xl bg-purple-50/70 border border-purple-100 p-6 text-sm text-gray-700 leading-relaxed">
            <b className="text-gray-900">Điều gì xảy ra tiếp theo?</b>
            <ol className="mt-2 space-y-1.5 list-decimal pl-5">
              <li>Ban điều hành nhận thông tin của bạn.</li>
              <li>Chúng tôi gọi/nhắn tin trao đổi và tư vấn.</li>
              <li>Hẹn bạn đến thăm nhà và gặp gỡ anh em.</li>
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}
