import type { MetadataRoute } from "next";
import { PUBLIC_SITE_PATHS } from "@/lib/public-site";
import { siteOrigin } from "@/server/public";

export const dynamic = "force-dynamic";

/**
 * Chỉ các trang công khai được lập chỉ mục; phần còn lại (ứng dụng nội bộ, API) bị chặn.
 * Cho phép thêm (quy tắc dài hơn thắng "Disallow: /"): ảnh của bài viết/album công khai (/api/v1/public/files/), ảnh chia sẻ mặc định,
 * biểu tượng, CSS/JS của trang (công cụ tìm kiếm cần để dựng trang) và đúng trang gốc "/" (khách được chuyển sang trang Giới thiệu).
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/$", ...PUBLIC_SITE_PATHS, "/api/v1/public/files/", "/og-default.png", "/icons/", "/icon.png", "/apple-icon.png", "/_next/static/"],
        disallow: ["/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
