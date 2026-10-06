import type { MetadataRoute } from "next";
import { PUBLIC_SITE_PATHS } from "@/lib/public-site";
import { siteOrigin } from "@/server/public";

export const dynamic = "force-dynamic";

// Chỉ các trang công khai được lập chỉ mục; phần còn lại (ứng dụng nội bộ, API) bị chặn.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: [...PUBLIC_SITE_PATHS], disallow: ["/"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
