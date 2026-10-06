import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/lib/theme";
import { ARTICLE_CATEGORIES, type PublicOrgInfo } from "@/lib/types/articles";
import { PublicAuthButton } from "./PublicClient";

/** Đầu trang công khai: thương hiệu, chuyên mục, đổi giao diện sáng/tối, đăng nhập. Server Component (chỉ PublicAuthButton/ThemeToggle là client). */
export function PublicHeader({ org, activeCategory }: { org: PublicOrgInfo; activeCategory?: string | null }) {
  const pill = (active: boolean) =>
    `shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition ${active ? "bg-primary text-white shadow-sm shadow-primary/20" : "text-gray-600 hover:bg-purple-50 hover:text-primary"}`;
  return (
    <header className="sticky top-0 z-30 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-purple-50 no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/tin-tuc" className="flex items-center gap-3 group min-w-0">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-extrabold text-xl shadow-md shadow-purple-200 group-hover:scale-105 transition-transform shrink-0" aria-hidden>
            ✝
          </span>
          <span className="flex flex-col min-w-0">
            <span className="font-bold text-gray-900 leading-tight text-base truncate group-hover:text-primary transition-colors">{org.houseName}</span>
            <span className="text-[11px] text-gray-500 font-medium leading-tight">Bản tin cộng đoàn</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Chuyên mục">
          <Link href="/tin-tuc" className={pill(!activeCategory)}>Tất cả</Link>
          {ARTICLE_CATEGORIES.map((c) => (
            <Link key={c.code} href={`/tin-tuc?muc=${c.code}`} className={pill(activeCategory === c.code)}>{c.label}</Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ThemeToggle />
          <PublicAuthButton />
        </div>
      </div>
      <nav className="md:hidden flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 custom-scroll" aria-label="Chuyên mục">
        <Link href="/tin-tuc" className={pill(!activeCategory)}>Tất cả</Link>
        {ARTICLE_CATEGORIES.map((c) => (
          <Link key={c.code} href={`/tin-tuc?muc=${c.code}`} className={pill(activeCategory === c.code)}>{c.label}</Link>
        ))}
      </nav>
    </header>
  );
}
