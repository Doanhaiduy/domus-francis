"use client";

// Thanh điều hướng dưới (điện thoại < 768px): Tổng quan · Lịch · Bếp & Cơm (phân hệ tắt ⇒ Thu Chi) · Thông báo · Thêm.
//   • Tab sáng theo NHÓM trang (lib/nav-groups.ts: Lịch gồm cả Xin phép, Thông báo gồm cả Diễn đàn, Thu Chi gồm cả Báo cáo).
//   • "Thông báo" có số bảng tin chưa đọc; "Thêm" (mở menu đầy đủ — cùng menu với thanh bên) có số việc chờ xử lý của người quản lý
//     (đỏ khi có việc quá hạn, vàng khi chỉ đang chờ) và sáng lên khi đang ở trang không có tab riêng.
//   • Mỗi ô ≥ 48px, nhãn không cắt ở 360px; tab đang mở có aria-current="page".
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, LayoutGrid, Menu, UtensilsCrossed, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchProps } from "@/lib/prefetch";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useUnreadCount } from "@/lib/data/dashboard";
import { useModules } from "@/lib/data/modules";
import { useInbox } from "@/lib/data/inbox";
import { useOrgSettings } from "@/lib/data/settings";
import { groupPaths, isInPath } from "@/lib/nav-groups";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Các trang làm tab này sáng lên */
  paths: string[];
  badge?: number;
}

const count = (n: number) => (n > 99 ? "99+" : String(n));

export const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();
  const { toggleMobileMenu, mobileMenuOpen } = useApp();
  const { session } = useSession();
  const signedIn = !!session?.member;
  const unread = useUnreadCount(signedIn);
  const modules = useModules(signedIn);
  const { org, loaded } = useOrgSettings();
  const { total: inboxTotal, overdue: inboxOverdue } = useInbox(signedIn);

  // Bếp & Cơm chỉ có tab khi phân hệ đang bật (cấu hình feature.meals.enabled) và không bị ẩn bảo trì với người xem; ngược lại là Thu Chi
  const mealsOn = loaded && org.mealsEnabled && !(modules.disabled["/bep-com"] && !modules.canManage);
  const tabs: Tab[] = [
    { href: "/", label: "Tổng quan", icon: LayoutGrid, paths: ["/"] },
    { href: "/lich-su-kien", label: "Lịch", icon: CalendarDays, paths: groupPaths("/lich-su-kien") },
    mealsOn
      ? { href: "/bep-com", label: "Bếp & Cơm", icon: UtensilsCrossed, paths: ["/bep-com"] }
      : { href: "/thu-chi", label: "Thu Chi", icon: Wallet, paths: groupPaths("/thu-chi") },
    { href: "/thong-bao", label: "Thông báo", icon: Bell, paths: groupPaths("/thong-bao"), badge: unread?.announcementsUnread ?? 0 },
  ];
  const activeOf = (t: Tab) => (t.href === "/" ? pathname === "/" : t.paths.some((p) => isInPath(pathname, p)));
  const onTab = tabs.some(activeOf);

  return (
    <nav
      aria-label="Điều hướng chính"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-purple-100 grid grid-cols-5 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] px-1 shadow-[0_-4px_20px_rgba(95,58,221,0.06)]"
    >
      {tabs.map((tab) => {
        const active = activeOf(tab);
        const Icon = tab.icon;
        // Phân hệ đang bảo trì: thành viên thấy mờ, không bấm được
        if (modules.disabled[tab.href] && !modules.canManage) {
          return (
            <span key={tab.href} aria-disabled="true" title="Đang bảo trì" className="flex flex-col items-center justify-center min-h-[48px] px-1 rounded-xl text-gray-300 select-none">
              <Icon className="w-5 h-5 stroke-2" aria-hidden />
              <span className="text-[11px] mt-1 leading-tight whitespace-nowrap">Bảo trì</span>
            </span>
          );
        }
        const badge = tab.badge ?? 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...prefetchProps(tab.href)}
            aria-current={active ? "page" : undefined}
            aria-label={badge > 0 ? `${tab.label} — ${badge} chưa đọc` : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center min-h-[48px] px-1 rounded-xl transition-colors active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
              active ? "text-primary" : "text-gray-500 hover:text-gray-900"
            )}
          >
            {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-primary" aria-hidden />}
            <span className={cn("relative flex items-center justify-center w-11 h-7 rounded-full transition-colors", active && "bg-primary-fixed")}>
              <Icon className={cn("w-5 h-5", active ? "stroke-[2.5]" : "stroke-2")} aria-hidden />
              {badge > 0 && (
                <span className="absolute -top-1 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-extrabold leading-4 text-center ring-2 ring-white tabular-nums" aria-hidden>
                  {count(badge)}
                </span>
              )}
            </span>
            <span className={cn("text-[11px] mt-0.5 leading-tight whitespace-nowrap", active ? "font-bold" : "font-medium")}>{tab.label}</span>
          </Link>
        );
      })}

      {/* Thêm: mở menu đầy đủ (cùng nội dung thanh bên) — số việc chờ xử lý của người quản lý */}
      <button
        type="button"
        onClick={toggleMobileMenu}
        aria-haspopup="dialog"
        aria-expanded={mobileMenuOpen}
        aria-label={inboxTotal > 0 ? `Thêm — mở menu đầy đủ, ${inboxTotal} việc chờ xử lý${inboxOverdue > 0 ? `, ${inboxOverdue} quá hạn` : ""}` : "Thêm — mở menu đầy đủ"}
        className={cn(
          "relative flex flex-col items-center justify-center min-h-[48px] px-1 rounded-xl transition-colors active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
          mobileMenuOpen || !onTab ? "text-primary" : "text-gray-500 hover:text-gray-900"
        )}
      >
        {!onTab && !mobileMenuOpen && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-primary" aria-hidden />}
        <span className={cn("relative flex items-center justify-center w-11 h-7 rounded-full transition-colors", (mobileMenuOpen || !onTab) && "bg-primary-fixed")}>
          <Menu className={cn("w-5 h-5", mobileMenuOpen || !onTab ? "stroke-[2.5]" : "stroke-2")} aria-hidden />
          {inboxTotal > 0 && (
            <span
              className={cn(
                "absolute -top-1 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-extrabold leading-4 text-center ring-2 ring-white tabular-nums",
                inboxOverdue > 0 ? "bg-rose-600 text-white" : "bg-amber-400 text-[#451a03]"
              )}
              aria-hidden
            >
              {count(inboxTotal)}
            </span>
          )}
        </span>
        <span className={cn("text-[11px] mt-0.5 leading-tight whitespace-nowrap", mobileMenuOpen || !onTab ? "font-bold" : "font-medium")}>Thêm</span>
      </button>
    </nav>
  );
};
