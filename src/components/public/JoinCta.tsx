import React from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import type { PublicOrgInfo } from "@/lib/types/articles";

/** Dải mời đăng ký tìm hiểu / liên hệ ở cuối các trang công khai. */
export function JoinCta({ org, title = "Bạn muốn tìm hiểu và vào ở lưu xá?" }: { org: PublicOrgInfo; title?: string }) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#5f3add] to-[#7857f8] text-white p-7 sm:p-10 grid gap-6 md:grid-cols-[1.4fr_1fr] items-center">
      <div>
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="mt-2 text-purple-100 leading-relaxed">Để lại thông tin, người quản lý sẽ liên hệ tư vấn và hẹn bạn đến thăm nhà.</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/lien-he#dang-ky" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#ffffff] text-[#5f3add] text-sm font-extrabold hover:bg-[#f3f0ff] transition active:scale-95">
            Đăng ký tìm hiểu <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link href="/tin-tuc?muc=tuyen-sinh" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-bold hover:bg-white/25 transition active:scale-95">
            Thông tin tuyển sinh
          </Link>
        </div>
      </div>
      <ul className="space-y-3 text-sm text-purple-50">
        {org.address && <li className="flex gap-2.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />{org.address}</li>}
        {org.phone && (
          <li className="flex gap-2.5"><Phone className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="font-bold hover:underline">{org.phone}</a></li>
        )}
      </ul>
    </section>
  );
}
