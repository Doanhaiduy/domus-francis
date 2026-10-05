"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Wrench,
  Wallet,
  Calendar,
  MessagesSquare,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchProps } from "@/lib/prefetch";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useUnreadCount } from "@/lib/data/dashboard";
import { useModules } from "@/lib/data/modules";

export const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();
  const { toggleMobileMenu } = useApp();
  const { session } = useSession();
  const unread = useUnreadCount(!!session?.member);

  const unreadCount = unread?.announcementsUnread ?? 0;
  const modules = useModules(!!session?.member);

  const tabs = [
    { href: "/", label: "Tổng quan", icon: LayoutGrid },
    { href: "/hau-can", label: "Hậu Cần", icon: Wrench },
    { href: "/thu-chi", label: "Thu Chi", icon: Wallet },
    { href: "/lich-su-kien", label: "Lịch & Sự kiện", icon: Calendar },
    { href: "/dien-dan", label: "Diễn Đàn", icon: MessagesSquare },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-purple-100 flex items-center justify-around pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-1 shadow-[0_-4px_20px_rgba(95,58,221,0.06)]">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        const Icon = tab.icon;
        // Phân hệ đang bảo trì: thành viên thấy mờ, không bấm được
        if (modules.disabled[tab.href] && !modules.canManage) {
          return (
            <span key={tab.href} aria-disabled="true" className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-gray-300 select-none">
              <Icon className="w-5 h-5 stroke-2" />
              <span className="text-[10px] mt-1 tracking-tight truncate max-w-[55px]">Bảo trì</span>
            </span>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...prefetchProps(tab.href)}
            className={cn(
              "flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all active:scale-90",
              isActive
                ? "text-primary font-bold"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            <div className="relative">
              <Icon className={cn("w-5 h-5", isActive ? "text-primary stroke-[2.5]" : "stroke-2")} />
              {tab.href === "/" && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight truncate max-w-[55px]">
              {tab.label}
            </span>
          </Link>
        );
      })}

      {/* Menu / Drawer Toggle */}
      <button
        onClick={toggleMobileMenu}
        className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-gray-500 hover:text-gray-900 active:scale-90 transition-all"
      >
        <div className="relative">
          <Menu className="w-5 h-5 stroke-2" />
        </div>
        <span className="text-[10px] mt-1 tracking-tight">Thêm</span>
      </button>
    </nav>
  );
};
