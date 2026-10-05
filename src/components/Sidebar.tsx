"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Bell,
  Calendar,
  Wallet,
  UtensilsCrossed,
  Wrench,
  Church,
  MessagesSquare,
  Users,
  Settings,
  ChevronDown,
  X,
  ExternalLink,
  Building2,
  Camera,
  Check,
  GraduationCap,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Menu, Transition } from "@headlessui/react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { fileUrl } from "@/lib/api";
import { useDutySummary, useUnreadCount } from "@/lib/data/dashboard";

export const NAV_ITEMS = [
  { href: "/", label: "Tổng quan", icon: LayoutGrid },
  { href: "/thong-bao", label: "Thông báo", icon: Bell, badgeKey: "announcements" },
  { href: "/lich-su-kien", label: "Lịch & Sự kiện", icon: Calendar },
  { href: "/thu-chi", label: "Thu Chi", icon: Wallet },
  { href: "/bep-com", label: "Bếp & Cơm", icon: UtensilsCrossed, isPaused: false },
  { href: "/hau-can", label: "Hậu Cần & Trực", icon: Wrench, badgeDot: true },
  { href: "/phung-vu", label: "Phụng Vụ", icon: Church },
  { href: "/dien-dan", label: "Diễn Đàn", icon: MessagesSquare, isNew: true },
  { href: "/thanh-vien", label: "Thành Viên", icon: Users },
  { href: "/hoc-tap", label: "Học Tập", icon: GraduationCap, isNew: true },
  { href: "/so-do-nha", label: "Sơ đồ nhà", icon: Building2 },
  { href: "/khoanh-khac", label: "Khoảnh Khắc", icon: Camera, isNew: true },
  { href: "/cai-dat", label: "Cài Đặt", icon: Settings, isDividerBefore: true },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentRole,
    openModal,
    mobileMenuOpen,
    setMobileMenuOpen,
  } = useApp();
  const { session, logout } = useSession();

  const displayName = session?.member?.displayName ?? session?.user.email ?? "…";
  const initials = (session?.member?.displayName ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatar = fileUrl(session?.member?.avatarFileId, "thumb");
  const handleSignOut = () => logout();

  // Huy hiệu từ dữ liệu thật: thông báo chưa đọc của chính mình, sự cố còn mở
  const unread = useUnreadCount(!!session?.member);
  const duty = useDutySummary(!!session?.member);
  const unreadAnnCount = unread?.announcementsUnread ?? 0;
  const pendingIssuesCount = duty?.openIssuesCount ?? 0;

  const NavContent = (
    <div className="flex flex-col h-full justify-between">
      <div className="flex flex-col flex-1 overflow-y-auto px-4 py-5 custom-scroll">
        
        {/* LOGO BRAND */}
        <div className="flex items-center justify-between px-2 mb-6">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-extrabold text-xl shadow-md shadow-purple-200 group-hover:scale-105 transition-transform">
              ✝
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-gray-900 leading-tight text-base group-hover:text-primary transition-colors">
                Lưu Xá Phanxicô
              </span>
              <span className="text-xs text-gray-500 font-medium">Cộng đoàn sinh viên</span>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVIGATION LIST */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <React.Fragment key={item.href}>
                {item.isDividerBefore && (
                  <div className="my-2 h-px bg-surface-container-highest" />
                )}
                <Link
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all text-xs font-semibold active:scale-[0.98]",
                    isActive
                      ? "bg-primary-fixed text-on-primary-fixed shadow-xs font-bold"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-gray-500")} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badgeKey === "announcements" && unreadAnnCount > 0 && (
                    <span className="bg-error-container text-on-error-container text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                      {unreadAnnCount}
                    </span>
                  )}

                  {item.badgeDot && pendingIssuesCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                  )}

                  {item.isNew && (
                    <span className="bg-primary text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0">
                      MỚI
                    </span>
                  )}

                  {item.isPaused && (
                    <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0">
                      TẠM HOÃN
                    </span>
                  )}
                </Link>
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* USER & ROLE PROFILE */}
      <div className="p-3 border-t border-purple-50 bg-white">
        <Menu as="div" className="relative">
          <Menu.Button className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-surface-container-low border border-purple-50 shadow-xs hover:border-purple-200 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-purple-200">
            <div className="flex items-center gap-2.5 min-w-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover shadow-xs shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                  {initials}
                </div>
              )}
              <div className="flex flex-col text-left min-w-0">
                <span className="font-bold text-xs text-gray-900 leading-tight truncate">{displayName}</span>
                <span className="text-[11px] text-purple-700 font-semibold truncate mt-0.5">
                  {currentRole}
                  {session?.member?.roomCode ? ` · ${session.member.roomCode}` : ""}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          </Menu.Button>

          <Transition
            as={React.Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute bottom-full left-0 mb-2 w-full origin-bottom-left rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/5 border border-purple-50 focus:outline-none z-50">
              <div className="px-2.5 py-1.5 text-[11px] text-gray-500 leading-snug">
                Đăng nhập: <b className="text-gray-800">{session?.user.email}</b>
                {session && session.roles.length > 1 && (
                  <div className="mt-0.5 text-[10px] text-gray-400">Vai trò: {session.roleLabel} + {session.roles.length - 1} vai trò khác</div>
                )}
              </div>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() => openModal("changePassword")}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors text-left",
                      active ? "bg-purple-50 text-primary" : "text-gray-700"
                    )}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Đổi mật khẩu</span>
                  </button>
                )}
              </Menu.Item>

              <div className="my-1 border-t border-gray-100" />

              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors text-left text-red-600",
                      active ? "bg-red-50 text-red-700" : ""
                    )}
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Đăng xuất</span>
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. DESKTOP SIDEBAR (FIXED, VISIBLE FROM md UP) */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-30 flex-col justify-between shadow-[1px_0_12px_rgba(0,0,0,0.02)] border-r border-purple-50">
        {NavContent}
      </aside>

      {/* 2. MOBILE DRAWER (OVERLAY + SLIDE-OVER) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop blur */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          />

          {/* Drawer content */}
          <div className="relative w-72 max-w-[80vw] h-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 border-r border-purple-100">
            {NavContent}
          </div>
        </div>
      )}
    </>
  );
};
