import React from "react";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/public/JsonLd";
import { MobileJoinBar } from "@/components/public/MobileJoinBar";
import { OG_DEFAULT_IMAGES, PUBLIC_HOME, SITE_CITY, SITE_KIND, SITE_REGION } from "@/lib/public-site";
import { getSiteInfo, siteOrigin } from "@/server/public";

// Khung chung của các trang công khai (người ngoài xem, không cần đăng nhập). Dữ liệu đọc thẳng từ CSDL theo request.
// Giữ force-dynamic (không ISR `revalidate`): (1) siteOrigin() đọc header Host — cùng mã chạy ở staging, production và tên miền riêng, thẻ
// canonical/Open Graph phải đúng tên miền đang xem; (2) ISR sẽ dựng sẵn trang lúc `next build` ⇒ cần CSDL khi build (CI không có) và đóng
// băng dữ liệu production vào bản build; (3) người quản lý đổi cấu hình (giới thiệu, bật Ủng hộ, hỏi đáp…) phải thấy ngay mà mô-đun cấu hình
// không có móc revalidateTag. Mỗi trang chỉ 1–3 truy vấn nhỏ.
export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const description = org.motto
    ? `${org.motto}. ${org.houseName} — ${SITE_KIND}: cùng học, cùng sống và cùng cầu nguyện.`
    : `${org.houseName} — ${SITE_KIND}: cùng học, cùng sống và cùng cầu nguyện.`;
  return {
    metadataBase: new URL(siteOrigin()),
    // Trang con đặt tiêu đề riêng (có "Nha Trang"/"lưu xá sinh viên Công giáo" ở trang chính) — mẫu thêm tên nhà phía sau
    title: { template: `%s | ${org.houseName}`, default: `${org.houseName} — ${cap(SITE_KIND)}` },
    description,
    applicationName: org.houseName,
    openGraph: { type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES },
    robots: { index: true, follow: true },
  };
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { org, donationEnabled } = await getSiteInfo();
  const origin = siteOrigin();
  // Thông tin tổ chức cho công cụ tìm kiếm (Knowledge Panel / tên site): một lần cho mọi trang công khai; trang con tham chiếu "@id".
  const orgLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#org`,
        name: org.houseName,
        alternateName: cap(SITE_KIND),
        url: `${origin}${PUBLIC_HOME}`,
        logo: `${origin}/icons/icon-512.png`,
        image: `${origin}/og-default.png`,
        description: org.motto ?? undefined,
        slogan: org.motto ?? undefined,
        telephone: org.phone ?? undefined,
        address: org.address
          ? { "@type": "PostalAddress", streetAddress: org.address, addressLocality: SITE_CITY, addressRegion: SITE_REGION, addressCountry: "VN" }
          : undefined,
        parentOrganization: org.orderName ? { "@type": "Organization", name: org.orderName } : undefined,
        contactPoint: org.phone ? [{ "@type": "ContactPoint", telephone: org.phone, contactType: "admissions", areaServed: "VN", availableLanguage: ["vi"] }] : undefined,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}${PUBLIC_HOME}`,
        name: org.houseName,
        inLanguage: "vi",
        publisher: { "@id": `${origin}/#org` },
      },
    ],
  };
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <JsonLd data={orgLd} />
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">{children}</main>
      <SiteFooter org={org} donationEnabled={donationEnabled} />
      <MobileJoinBar phone={org.phone} />
    </div>
  );
}
