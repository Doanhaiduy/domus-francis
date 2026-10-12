import React from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { telHref } from "@/lib/public-site";
import type { PublicOrgInfo } from "@/lib/types/articles";

const DEFAULT_SECONDARY = { href: "/vao-o", label: "Chi phí & thủ tục vào ở" };

/** Dải mời đăng ký tìm hiểu / liên hệ ở cuối các trang công khai. `secondary`: nút phụ (mặc định trang "Vào ở lưu xá"). */
export function JoinCta({
  org,
  title = "Bạn muốn tìm hiểu và vào ở lưu xá?",
  secondary = DEFAULT_SECONDARY,
}: {
  org: PublicOrgInfo;
  title?: string;
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#5f3add] to-[#7857f8] text-white p-7 sm:p-10 grid gap-6 md:grid-cols-[1.4fr_1fr] items-center no-print">
      <div>
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="mt-2 text-[#ede9fe] leading-relaxed">Để lại thông tin, người quản lý sẽ liên hệ tư vấn và hẹn bạn đến thăm nhà.</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/lien-he#dang-ky" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#ffffff] text-[#5f3add] text-sm font-extrabold hover:bg-[#f3f0ff] transition active:scale-95">
            Đăng ký tìm hiểu <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          {secondary && (
            <Link href={secondary.href} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#ffffff]/15 border border-[#ffffff]/30 text-white text-sm font-bold hover:bg-[#ffffff]/25 transition active:scale-95">
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
      <ul className="space-y-3 text-sm text-[#f5f3ff]">
        {org.address && <li className="flex gap-2.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />{org.address}</li>}
        {org.phone && (
          <li className="flex gap-2.5"><Phone className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><a href={telHref(org.phone)} className="font-bold hover:underline">{org.phone}</a></li>
        )}
      </ul>
    </section>
  );
}
