import React from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { getSiteInfo } from "@/server/public";

// Khung chung của các trang công khai (người ngoài xem, không cần đăng nhập). Dữ liệu đọc thẳng từ CSDL theo request.
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { org, donationEnabled } = await getSiteInfo();
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">{children}</main>
      <SiteFooter org={org} donationEnabled={donationEnabled} />
    </div>
  );
}
