"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";
import { telHref } from "@/lib/public-site";
import { cn } from "@/lib/utils";

// Trang mà thanh "Đăng ký tìm hiểu" không cần (đã có biểu mẫu / không đúng ngữ cảnh / văn bản pháp lý).
const HIDE_ON = ["/lien-he", "/ung-ho", "/chinh-sach-bao-mat", "/dieu-khoan-su-dung"];

/**
 * Thanh dính cuối màn hình trên điện thoại (< 640px) ở các trang công khai: nút "Đăng ký tìm hiểu" + gọi hotline. Đầu trang công khai ẩn
 * nút này trên điện thoại cho gọn. Có phần đệm cùng chiều cao để không che chân trang; tự lùi xuống khi người xem đang gõ (bàn phím ảo).
 */
export function MobileJoinBar({ phone }: { phone: string | null }) {
  const pathname = usePathname() ?? "";
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);
    const onIn = (e: FocusEvent) => isField(e.target) && setTyping(true);
    const onOut = (e: FocusEvent) => isField(e.target) && setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <>
      <div aria-hidden className="sm:hidden h-[calc(4.75rem+env(safe-area-inset-bottom))] no-print" />
      <div
        className={cn("sm:hidden fixed inset-x-0 bottom-0 z-40 no-print transition-transform duration-200", typing && "translate-y-full")}
        role="region"
        aria-label="Đăng ký tìm hiểu"
      >
        <div className="bg-surface-container-lowest/95 backdrop-blur-xl border-t border-purple-100 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2.5 shadow-[0_-8px_24px_-12px_rgba(95,58,221,0.25)]">
          <Link
            href="/lien-he#dang-ky"
            className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white text-sm font-extrabold shadow-md shadow-primary/25 active:scale-[0.98] transition"
          >
            Đăng ký tìm hiểu <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          {phone && (
            <a
              href={telHref(phone)}
              aria-label={`Gọi hotline ${phone}`}
              className="shrink-0 w-12 h-12 inline-flex items-center justify-center rounded-2xl border border-purple-200 bg-white text-primary active:scale-95 transition"
            >
              <Phone className="w-5 h-5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </>
  );
}
