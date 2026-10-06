import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, HelpCircle } from "lucide-react";
import { listFaqs } from "@/server/modules/public-site";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getSiteInfo, publicDb, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { JoinCta } from "@/components/public/JoinCta";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const title = `Hỏi đáp — ${org.houseName}`;
  const description = `Những câu hỏi thường gặp về việc vào ở, chi phí, sinh hoạt và nội quy tại ${org.houseName}.`;
  return { metadataBase: new URL(siteOrigin()), title, description, openGraph: { title, description, type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES } };
}

export default async function FaqPage() {
  const [site, faqs] = await Promise.all([getSiteInfo(), publicDb((tx) => listFaqs(tx))]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
  return (
    <>
      <PublicHeader org={site.org} section="hoi-dap" donationEnabled={site.donationEnabled} />
      <PageHero eyebrow="Hỏi đáp" title="Câu hỏi thường gặp" subtitle="Giải đáp nhanh những điều các bạn sinh viên và phụ huynh thường quan tâm." />
      {faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10 space-y-10">
        {faqs.length ? (
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <details key={f.id} className="group rounded-2xl bg-white border border-purple-100 shadow-xs open:shadow-md open:border-purple-300 transition" open={i === 0}>
                <summary className="flex items-center justify-between gap-4 cursor-pointer select-none list-none px-5 py-4 font-bold text-gray-900 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start gap-3"><HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />{f.question}</span>
                  <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="px-5 pb-5 pl-[3.25rem]">
                  <ArticleMarkdown source={f.answer} compact className="!text-[15px] !leading-7" />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
            <HelpCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden />
            <p className="font-bold text-gray-900">Chưa có câu hỏi nào</p>
            <p className="text-sm text-gray-500 mt-1">Bạn cứ <Link href="/lien-he#dang-ky" className="font-bold text-primary hover:underline">liên hệ</Link> để được giải đáp trực tiếp.</p>
          </div>
        )}
        <JoinCta org={site.org} title="Chưa thấy câu trả lời bạn cần?" />
      </div>
    </>
  );
}
