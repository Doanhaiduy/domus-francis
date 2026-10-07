"use client";

import React from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api";
import type { PublicOrgInfo } from "@/lib/types/articles";
import { SiteFooter } from "./SiteFooter";

/** Chân trang phía client: lấy thông tin cộng đoàn công khai (đệm lâu — hiếm khi đổi), hiển thị ngay bản mặc định khi chưa tải xong. */
export function AppFooter({ variant = "compact", className }: { variant?: "compact" | "minimal"; className?: string }) {
  const pathname = usePathname();
  const { data } = useSWR<PublicOrgInfo>("/api/v1/public/org", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
    shouldRetryOnError: false,
  });
  // Chân trang trong ứng dụng có liên kết "Góp ý" (kèm màn hình đang xem); trang đăng nhập (minimal) thì không
  const feedbackHref = variant === "compact" ? `/gop-y?from=${encodeURIComponent(pathname || "/")}` : undefined;
  return <SiteFooter org={data} variant={variant} className={className} feedbackHref={feedbackHref} />;
}
