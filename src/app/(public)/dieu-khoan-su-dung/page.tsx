import React from "react";
import type { Metadata } from "next";
import { LegalDocument } from "@/components/public/LegalDocument";
import { LEGAL_PATHS, LEGAL_UPDATED_ISO } from "@/content/legal";
import { termsOfUse } from "@/content/legal-terms";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getSiteInfo, siteOrigin } from "@/server/public";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const title = `Điều khoản sử dụng — ${org.houseName}`;
  const description = `Quy tắc khi dùng trang web và ứng dụng của ${org.houseName}: tài khoản, quỹ chung, nội dung, trách nhiệm và giải quyết tranh chấp.`;
  return {
    metadataBase: new URL(siteOrigin()),
    title,
    description,
    alternates: { canonical: LEGAL_PATHS.terms },
    openGraph: { title, description, type: "article", modifiedTime: LEGAL_UPDATED_ISO, locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES },
  };
}

export default async function TermsOfUsePage() {
  const site = await getSiteInfo();
  return <LegalDocument doc={termsOfUse(site.org)} org={site.org} donationEnabled={site.donationEnabled} current="terms" />;
}
