import React from "react";
import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicOrgInfo } from "@/lib/types/articles";

// Chân trang dùng chung (không dùng hook ⇒ import được từ cả Server Component và Client Component).
//   variant "full"    : trang công khai và trang đăng nhập — giới thiệu, liên hệ, liên kết, bản quyền.
//   variant "minimal" : trang đăng nhập / chờ duyệt — một dòng căn giữa.
//   variant "compact" : trong ứng dụng (sau đăng nhập) — một dòng gọn: thương hiệu, liên kết, bản quyền.

const FALLBACK: PublicOrgInfo = { houseName: "Lưu Xá Phanxicô", motto: null, address: null, phone: null, orderName: null, patronName: null, about: null, patronFeast: null };

function Brand({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          "rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-extrabold shadow-md shadow-purple-200 shrink-0",
          size === "sm" ? "w-7 h-7 text-sm rounded-lg" : "w-9 h-9 text-xl"
        )}
        aria-hidden
      >
        ✝
      </span>
      <span className={cn("font-bold text-gray-900 leading-tight", size === "sm" ? "text-sm" : "text-base")}>{name}</span>
    </span>
  );
}

export function SiteFooter({ org, variant = "full", className, donationEnabled = false }: { org?: PublicOrgInfo | null; variant?: "full" | "compact" | "minimal"; className?: string; donationEnabled?: boolean }) {
  const o = org ?? FALLBACK;
  const year = new Date().getFullYear();
  const copyright = `© ${year} ${o.houseName}. Bảo lưu mọi quyền.`;

  if (variant === "minimal") {
    return (
      <footer className={cn("text-center text-[11px] text-gray-500 px-4 py-5 no-print", className)}>
        <p>
          {copyright}
          <span className="mx-2 text-gray-300">·</span>
          <Link href="/tin-tuc" className="font-semibold hover:text-primary transition">Bản tin lưu xá</Link>
        </p>
      </footer>
    );
  }

  if (variant === "compact") {
    return (
      <footer className={cn("px-3.5 sm:px-5 lg:px-6 pb-24 md:pb-6 pt-2 no-print", className)}>
        <div className="border-t border-purple-50 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-gray-500">
          <div className="flex items-center gap-2 min-w-0">
            <Brand name={o.houseName} size="sm" />
            {o.motto && <span className="hidden md:inline text-gray-400 truncate">· {o.motto}</span>}
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold" aria-label="Liên kết chân trang">
            <Link href="/tin-tuc" className="hover:text-primary transition" target="_blank">Bản tin công khai</Link>
            <Link href="/huong-dan" className="hover:text-primary transition">Hướng dẫn sử dụng</Link>
          </nav>
          <p className="text-gray-400">{copyright}</p>
        </div>
      </footer>
    );
  }

  return (
    <footer className={cn("border-t border-purple-100 bg-surface-container-lowest no-print", className)}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Brand name={o.houseName} />
          {o.motto && <p className="text-sm text-gray-600 leading-relaxed max-w-sm">“{o.motto}”</p>}
          <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
            Cộng đoàn sinh viên Công giáo{o.orderName ? ` — ${o.orderName}` : ""}.
            {o.patronName ? ` Dưới sự bảo trợ của ${o.patronName}.` : ""}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Liên hệ</h3>
          <ul className="space-y-2.5 text-sm text-gray-600">
            {o.address && (
              <li className="flex gap-2.5">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
                <span>{o.address}</span>
              </li>
            )}
            {o.phone && (
              <li className="flex gap-2.5">
                <Phone className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
                <a href={`tel:${o.phone.replace(/[^\d+]/g, "")}`} className="hover:text-primary font-semibold">{o.phone}</a>
              </li>
            )}
            {!o.address && !o.phone && <li className="text-gray-400">Liên hệ qua Ban điều hành lưu xá.</li>}
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Khám phá</h3>
          <ul className="space-y-2 text-sm text-gray-600 font-medium">
            <li><Link href="/gioi-thieu" className="hover:text-primary">Giới thiệu lưu xá</Link></li>
            <li><Link href="/tin-tuc" className="hover:text-primary">Bản tin</Link></li>
            <li><Link href="/tin-tuc?muc=tuyen-sinh" className="hover:text-primary">Thông tin tuyển sinh</Link></li>
            <li><Link href="/hoi-dap" className="hover:text-primary">Hỏi đáp</Link></li>
            <li><Link href="/thu-vien" className="hover:text-primary">Thư viện ảnh</Link></li>
            <li><Link href="/lien-he#dang-ky" className="hover:text-primary">Liên hệ &amp; đăng ký tìm hiểu</Link></li>
            {donationEnabled && <li><Link href="/ung-ho" className="hover:text-primary">Ủng hộ lưu xá</Link></li>}
            <li><Link href="/dang-nhap" className="hover:text-primary">Đăng nhập thành viên</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-purple-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs text-gray-500">
          <p>{copyright}</p>
          <p className="text-gray-400">Nội dung đăng với sự đồng ý của những người liên quan.</p>
        </div>
      </div>
    </footer>
  );
}
