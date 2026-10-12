import React from "react";
import type { Metadata } from "next";
import { LegalDocument } from "@/components/public/LegalDocument";
import { LEGAL_PATHS, LEGAL_UPDATED_ISO } from "@/content/legal";
import { privacyPolicy } from "@/content/legal-privacy";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getSiteInfo } from "@/server/public";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const title = "Chính sách bảo mật";
  const description = `Cách ${org.houseName} thu thập, sử dụng, bảo vệ dữ liệu cá nhân và quyền của bạn theo Luật Bảo vệ dữ liệu cá nhân.`;
  return {
    title,
    description,
    alternates: { canonical: LEGAL_PATHS.privacy },
    openGraph: { title: `${title} — ${org.houseName}`, description, url: LEGAL_PATHS.privacy, type: "article", modifiedTime: LEGAL_UPDATED_ISO, locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES },
  };
}

export default async function PrivacyPolicyPage() {
  const site = await getSiteInfo();
  return <LegalDocument doc={privacyPolicy(site.org)} org={site.org} donationEnabled={site.donationEnabled} current="privacy" />;
}
