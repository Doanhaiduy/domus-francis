import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/lib/theme";
import { ARTICLE_CATEGORIES, type PublicOrgInfo } from "@/lib/types/articles";
import { cn } from "@/lib/utils";
import { PublicAuthButton } from "./PublicClient";

export type SiteSection = "tin-tuc" | "gioi-thieu" | "hoi-dap" | "thu-vien" | "lien-he" | "ung-ho";

const SECTIONS: { key: SiteSection; label: string; href: string }[] = [
  { key: "tin-tuc", label: "Bản tin", href: "/tin-tuc" },
  { key: "gioi-thieu", label: "Giới thiệu", href: "/gioi-thieu" },
  { key: "hoi-dap", label: "Hỏi đáp", href: "/hoi-dap" },
  { key: "thu-vien", label: "Thư viện ảnh", href: "/thu-vien" },
  { key: "lien-he", label: "Liên hệ", href: "/lien-he" },
];

/**
 * Đầu trang công khai: thương hiệu, các mục của site, (ở mục Bản tin) thanh chuyên mục, đổi giao diện sáng/tối, đăng nhập.
 * Server Component (chỉ PublicAuthButton/ThemeToggle là client).
 */
export function PublicHeader({
  org,
  section,
  activeCategory,
  donationEnabled,
}: {
  org: PublicOrgInfo;
  section?: SiteSection;
  activeCategory?: string | null;
  donationEnabled?: boolean;
}) {
  const items = donationEnabled ? [...SECTIONS, { key: "ung-ho" as const, label: "Ủng hộ", href: "/ung-ho" }] : SECTIONS;
  const pill = (active: boolean) =>
    cn("shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition", active ? "bg-primary text-white shadow-sm shadow-primary/20" : "text-gray-600 hover:bg-purple-50 hover:text-primary");
  const catPill = (active: boolean) =>
    cn("shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition border", active ? "bg-purple-100 text-purple-800 border-purple-200" : "text-gray-500 border-transparent hover:bg-purple-50 hover:text-primary");

  return (
    <header className="sticky top-0 z-30 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-purple-50 no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/tin-tuc" className="flex items-center gap-3 group min-w-0">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-extrabold text-xl shadow-md shadow-purple-200 group-hover:scale-105 transition-transform shrink-0" aria-hidden>
            ✝
          </span>
          <span className="flex flex-col min-w-0">
            <span className="font-bold text-gray-900 leading-tight text-base truncate group-hover:text-primary transition-colors">{org.houseName}</span>
            <span className="text-[11px] text-gray-500 font-medium leading-tight">Cộng đoàn sinh viên Công giáo</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Các mục của trang">
          {items.map((i) => (
            <Link key={i.key} href={i.href} className={pill(section === i.key)} aria-current={section === i.key ? "page" : undefined}>{i.label}</Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Link href="/lien-he#dang-ky" className="hidden sm:inline-flex px-3.5 py-2 rounded-xl border border-purple-200 text-primary hover:bg-purple-50 text-xs font-bold transition">
            Đăng ký tìm hiểu
          </Link>
          <ThemeToggle />
          <PublicAuthButton />
        </div>
      </div>

      <nav className="lg:hidden flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 custom-scroll" aria-label="Các mục của trang">
        {items.map((i) => (
          <Link key={i.key} href={i.href} className={pill(section === i.key)} aria-current={section === i.key ? "page" : undefined}>{i.label}</Link>
        ))}
      </nav>

      {section === "tin-tuc" && (
        <nav className="border-t border-purple-50/70 bg-surface/60" aria-label="Chuyên mục bản tin">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-1 overflow-x-auto custom-scroll">
            <Link href="/tin-tuc" className={catPill(!activeCategory)}>Tất cả</Link>
            {ARTICLE_CATEGORIES.map((c) => (
              <Link key={c.code} href={`/tin-tuc?muc=${c.code}`} className={catPill(activeCategory === c.code)}>{c.label}</Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
