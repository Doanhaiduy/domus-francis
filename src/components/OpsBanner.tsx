"use client";

// Dải cảnh báo vận hành cho Admin (quyền system.monitor) ngay dưới thanh tiêu đề — gói A (Giám sát):
//   • ĐỎ  : cron sáng/tối quá hạn, lượt gần nhất lỗi hoặc không chạy xong; sao lưu thất bại / quá hạn (khi đã từng có nhịp tim).
//   • VÀNG: có lỗi hệ thống MỚI (chưa xem) trong 24 giờ qua.
// Bấm mở Cài đặt → Hệ thống. Ẩn được đến hết ngày (localStorage, bọc try/catch) — xuất hiện vấn đề KHÁC thì hiện lại.
// Dữ liệu: GET /api/v1/system/status?summary=1 (một vòng CSDL, 5 phút làm mới một lần). Không gọi API khi người dùng không có quyền.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronRight, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { openSettingsTab, useOpsSummary } from "@/lib/data/system";
import { cn } from "@/lib/utils";

const HIDE_KEY = "luuxa-ops-banner-hidden";
const localDay = () => new Date().toLocaleDateString("en-CA");

export function OpsBanner() {
  const { session, can } = useSession();
  const allowed = !!session?.member && can("system.monitor");
  const { summary } = useOpsSummary(allowed);
  const pathname = usePathname();
  const [hidden, setHidden] = useState<string | null>(null);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY));
    } catch {
      /* trình duyệt chặn bộ nhớ — luôn hiện */
    }
  }, []);

  if (!allowed || !summary || summary.level === "ok" || summary.issues.length === 0) return null;
  // Chữ ký = ngày + các loại vấn đề: ẩn hôm nay thì chỉ hiện lại khi sang ngày mới hoặc có vấn đề loại khác
  const sig = `${localDay()}|${summary.issues
    .map((i) => i.key)
    .sort()
    .join(",")}`;
  if (hidden === sig) return null;

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, sig);
    } catch {
      /* bỏ qua */
    }
    setHidden(sig);
  };
  const red = summary.level === "error";
  const first = summary.issues.find((i) => i.level === "error") ?? summary.issues[0];
  const more = summary.issues.length - 1;

  return (
    <div className="px-3.5 sm:px-5 lg:px-6 pt-3">
      <div
        role={red ? "alert" : "status"}
        className={cn(
          "rounded-2xl border px-3.5 py-2.5 flex items-center gap-3 text-xs shadow-xs",
          red ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-amber-50 border-amber-200 text-amber-900",
        )}
      >
        <AlertTriangle className={cn("w-4 h-4 shrink-0", red ? "text-rose-600" : "text-amber-600")} />
        <Link
          href="/cai-dat?tab=system"
          onClick={(e) => {
            if (pathname === "/cai-dat") {
              e.preventDefault();
              openSettingsTab("system");
            }
          }}
          className="flex-1 min-w-0 flex items-center gap-2 group"
        >
          <span className="min-w-0 leading-snug">
            <b className="font-bold">{red ? "Sự cố vận hành: " : "Cần xem: "}</b>
            <span className="break-words">{first.title}</span>
            {more > 0 && <span className="opacity-75"> (+{more} mục khác)</span>}
          </span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-0.5 font-bold whitespace-nowrap group-hover:underline underline-offset-2 shrink-0">
            Xem chi tiết <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </Link>
        <button
          type="button"
          onClick={hide}
          aria-label="Ẩn cảnh báo này đến hết hôm nay"
          title="Ẩn đến hết hôm nay"
          className="p-1.5 -m-1 rounded-lg hover:bg-white/70 transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
