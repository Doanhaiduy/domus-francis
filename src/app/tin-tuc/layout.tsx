import React from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { getOrgInfo } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";

// Khung chung của các trang công khai (người ngoài xem, không cần đăng nhập). Dữ liệu đọc thẳng từ CSDL theo request.
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrgInfo();
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <main className="flex-1 flex flex-col">{children}</main>
      <SiteFooter org={org} />
    </div>
  );
}
