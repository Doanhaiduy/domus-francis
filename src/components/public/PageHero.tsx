import React from "react";
import { cn } from "@/lib/utils";

/**
 * Dải tiêu đề tím dùng đầu mỗi trang công khai. Nền là dải màu CỐ ĐỊNH ⇒ chữ/nền mờ bên trong dùng mã màu cố định, không dùng các lớp
 * tím nhạt / trắng của bảng màu (chúng tự đảo sang tông tối ở giao diện tối và mất tương phản trên nền tím).
 */
export function PageHero({ eyebrow, title, subtitle, children, className }: { eyebrow?: string; title: string; subtitle?: string; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("relative overflow-hidden bg-gradient-to-br from-[#4d2dbf] via-[#5f3add] to-[#7857f8] text-white", className)}>
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#ffffff]/10 blur-3xl" aria-hidden />
      <div className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-[#a5b4fc]/20 blur-3xl" aria-hidden />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {eyebrow && <span className="inline-flex px-3 py-1 rounded-full bg-[#ffffff]/15 text-[11px] font-extrabold uppercase tracking-wider">{eyebrow}</span>}
        <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl">{title}</h1>
        {subtitle && <p className="mt-3 text-base sm:text-lg text-[#ede9fe] max-w-2xl leading-relaxed">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
