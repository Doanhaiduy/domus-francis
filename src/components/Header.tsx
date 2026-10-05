"use client";

import React from "react";
import Link from "next/link";
import {
  Search,
  Bell,
  Clock,
  Plus,
  Menu,
  Sparkles,
  Shield,
  Crown,
  Wallet,
  Users,
  Building2,
  UtensilsCrossed,
  Wrench,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { fileUrl } from "@/lib/api";
import { useUnreadCount } from "@/lib/data/dashboard";
import { cn } from "@/lib/utils";

const ROLE_CONFIGS: Record<
  string,
  { label: string; desc: string; icon: any; color: string; badge: string }
> = {
  "Trưởng nhà": {
    label: "Trưởng nhà",
    desc: "Toàn quyền điều hành: Phê duyệt chi tiêu, quản lý phòng, cấp tài khoản & duyệt trực nhật",
    icon: Crown,
    color: "from-amber-500 to-amber-600 text-white",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  "Thủ quỹ": {
    label: "Thủ quỹ",
    desc: "Quản lý ngân quỹ: Lập phiếu chi, thu quỹ 600k/kỳ, xuất báo cáo tài chính minh bạch",
    icon: Wallet,
    color: "from-emerald-600 to-teal-600 text-white",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  "Thành viên": {
    label: "Thành viên",
    desc: "Thành viên lưu xá: Xem thu chi minh bạch, check-in trực nhật, báo hỏng, sinh hoạt",
    icon: Users,
    color: "from-purple-600 to-violet-600 text-white",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
  },
  "Trưởng ban Phụng vụ": {
    label: "Trưởng ban Phụng vụ",
    desc: "Lịch phụng vụ, phân công đọc sách/giúp lễ, kiểm duyệt ý chỉ cầu nguyện",
    icon: CheckCircle2,
    color: "from-indigo-500 to-purple-600 text-white",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  "Trưởng ban Ẩm thực": {
    label: "Trưởng ban Ẩm thực",
    desc: "Thực đơn, chốt suất ăn, kho bếp và phân công đi chợ",
    icon: UtensilsCrossed,
    color: "from-orange-500 to-amber-600 text-white",
    badge: "bg-orange-100 text-orange-800 border-orange-200",
  },
  "Trưởng ban Truyền thông": {
    label: "Trưởng ban Truyền thông",
    desc: "Kiểm duyệt album khoảnh khắc, đăng bản tin",
    icon: Eye,
    color: "from-pink-500 to-rose-600 text-white",
    badge: "bg-pink-100 text-pink-800 border-pink-200",
  },
  "Admin": {
    label: "Admin",
    desc: "Quản trị viên hệ thống: Quản trị kỹ thuật, phân quyền & cấu hình",
    icon: Shield,
    color: "from-rose-600 to-red-600 text-white",
    badge: "bg-rose-100 text-rose-800 border-rose-200",
  },
};

const CUSTOM_ROLE_CONFIG = {
  label: "",
  desc: "",
  icon: Building2,
  color: "from-sky-500 to-indigo-600 text-white",
  badge: "bg-sky-100 text-sky-800 border-sky-200",
};

export const Header: React.FC = () => {
  const { openModal, currentRole, toggleMobileMenu, toggleCommandPalette } = useApp();
  const { session, can } = useSession();
  const unread = useUnreadCount(!!session?.member);
  const unreadCount = (unread?.announcementsUnread ?? 0) + (unread?.notificationsUnread ?? 0);
  // Vai trò tự tạo do Admin thêm (không có cấu hình riêng): biểu tượng chung, mô tả theo tên vai trò
  const roleCfg =
    ROLE_CONFIGS[currentRole] ||
    (currentRole && currentRole !== "Thành viên"
      ? { ...CUSTOM_ROLE_CONFIG, label: currentRole, desc: `${currentRole}: quyền theo vai trò do Admin cấu hình` }
      : ROLE_CONFIGS["Thành viên"]);
  const RoleIcon = roleCfg.icon;
  const displayName = session?.member?.displayName ?? session?.user.email ?? "…";
  const roomLabel = session?.member?.roomCode ?? null;
  const avatar = fileUrl(session?.member?.avatarFileId, "thumb");

  const canCreateExpense = can("finance.expense.create");

  return (
    <div className="w-full z-20 sticky top-0 flex flex-col">
      {/* 1. TOP MAIN NAV BAR */}
      <header className="h-16 w-full bg-surface-container-lowest/95 backdrop-blur-xl flex items-center justify-between px-3.5 sm:px-6 lg:px-8 shadow-[0_1px_6px_rgba(0,0,0,0.02)] border-b border-purple-50">
        {/* LEFT: HAMBURGER (MOBILE ONLY) & SEARCH */}
        <div className="flex items-center gap-2.5 flex-1 max-w-md">
          {/* Mobile Hamburger Toggle */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 rounded-xl text-gray-600 hover:bg-purple-50 hover:text-primary transition"
            title="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile Mini Brand Icon */}
          <Link href="/" className="md:hidden flex items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-bold text-sm shadow-xs">
              ✝
            </div>
          </Link>

          {/* Search Bar / Command Palette Trigger */}
          <button
            onClick={toggleCommandPalette}
            className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl w-full text-on-surface-variant hover:bg-white hover:ring-2 hover:ring-purple-200 transition-all border border-transparent hover:border-purple-200 text-left cursor-pointer"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-400 flex-1 truncate">Tìm kiếm nhanh...</span>
            <kbd className="hidden sm:inline-block text-[10px] font-mono bg-white px-1.5 py-0.5 rounded shadow-2xs text-gray-500 border border-gray-100 shrink-0">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* RIGHT AMBIENT & ACTIONS */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* ROLE-BASED QUICK ACTION BUTTON */}
          {canCreateExpense ? (
            <button
              onClick={() => openModal("addExpense")}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-semibold shadow-xs transition shadow-primary/20 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ghi chi tiêu</span>
            </button>
          ) : (
            <Link
              href="/hau-can"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 text-xs font-semibold shadow-xs transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Trực nhật &amp; Hậu cần</span>
            </Link>
          )}

          {/* NOTIFICATION BELL */}
          <button
            onClick={() => openModal("notifications")}
            className="relative p-2 rounded-full hover:bg-surface-container-low text-gray-600 transition-colors"
            title="Thông báo"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error ring-2 ring-white" />
            )}
          </button>

          <div className="hidden sm:block h-5 w-px bg-surface-container-highest" />

          {/* ACTIVE ROLE PILL / PROFILE LINK */}
          <Link
            href="/cai-dat?tab=profile"
            className="hidden sm:flex items-center gap-2 pl-1 p-1 rounded-2xl hover:bg-purple-50/80 transition-all cursor-pointer group select-none active:scale-95"
            title="Xem &amp; sửa hồ sơ cá nhân của bạn"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover shadow-xs shrink-0 group-hover:ring-2 group-hover:ring-purple-300 transition" />
            ) : (
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xs shrink-0 bg-gradient-to-tr group-hover:ring-2 group-hover:ring-purple-300 transition",
                  roleCfg.color
                )}
                title={roleCfg.desc}
              >
                <RoleIcon className="w-4 h-4" />
              </div>
            )}
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-bold text-gray-900 group-hover:text-primary transition leading-tight">{displayName}</span>
              <span className="text-[10px] font-semibold text-primary">
                {currentRole}
                {roomLabel ? ` · ${roomLabel}` : ""}
              </span>
            </div>
          </Link>
        </div>
      </header>

    </div>
  );
};
