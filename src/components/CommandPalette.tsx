"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  LayoutDashboard,
  UtensilsCrossed,
  Wallet,
  Calendar,
  Wrench,
  Church,
  MessagesSquare,
  Users,
  Settings,
  Plus,
  ArrowRight,
  User,
  Building2,
  Camera,
  GraduationCap,
  ScrollText,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useModules } from "@/lib/data/modules";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";

export const CommandPalette: React.FC = () => {
  const router = useRouter();
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    openModal,
    members,
  } = useApp();

  const { can, session } = useSession();
  const modules = useModules(!!session?.member);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const NAV_ITEMS = [
    { label: "Tổng quan", href: "/", icon: LayoutDashboard, category: "Điều hướng" },
    { label: "Hậu cần, Trực vệ sinh & Báo hỏng", href: "/hau-can", icon: Wrench, category: "Điều hướng" },
    { label: "Luật nhà (nội quy, giờ giấc)", href: "/thong-bao?tab=luat", icon: ScrollText, category: "Điều hướng" },
    { label: "Bếp & Điểm danh cơm", href: "/bep-com", icon: UtensilsCrossed, category: "Điều hướng" },
    { label: "Thu Chi & Tài Chính", href: "/thu-chi", icon: Wallet, category: "Điều hướng" },
    { label: "Lịch & Sự kiện", href: "/lich-su-kien", icon: Calendar, category: "Điều hướng" },
    { label: "Phụng vụ & Kinh tối", href: "/phung-vu", icon: Church, category: "Điều hướng" },
    { label: "Diễn đàn trao đổi", href: "/dien-dan", icon: MessagesSquare, category: "Điều hướng" },
    { label: "Danh bạ thành viên", href: "/thanh-vien", icon: Users, category: "Điều hướng" },
    { label: "Quản lý Học tập & Điểm số", href: "/hoc-tap", icon: GraduationCap, category: "Điều hướng" },
    { label: "Sơ đồ nhà & Phòng ở", href: "/so-do-nha", icon: Building2, category: "Điều hướng" },
    { label: "Lưu Khoảnh Khắc & Kỷ niệm", href: "/khoanh-khac", icon: Camera, category: "Điều hướng" },
    { label: "Cài đặt & Quản lý danh mục", href: "/cai-dat", icon: Settings, category: "Điều hướng" },
  ];

  const ACTION_ITEMS = [
    { label: "Xem sơ đồ nhà tương tác", action: () => { setCommandPaletteOpen(false); router.push("/so-do-nha"); }, icon: Building2, category: "Hành động nhanh" },
    { label: "Xem album & Lưu khoảnh khắc", action: () => { setCommandPaletteOpen(false); router.push("/khoanh-khac"); }, icon: Camera, category: "Hành động nhanh" },
    { label: "Ghi chi tiêu quỹ mới", action: () => openModal("addExpense"), icon: Plus, category: "Hành động nhanh", perm: "finance.expense.create" },
    { label: "Báo hỏng thiết bị & cơ sở", action: () => openModal("reportIssue"), icon: Wrench, category: "Hành động nhanh", perm: "issue.create" },
    { label: "Đăng thông báo cộng đoàn", action: () => openModal("createAnnouncement"), icon: Plus, category: "Hành động nhanh", perm: "announcement.create" },
    { label: "Thêm sự kiện mới", action: () => openModal("addEvent"), icon: Plus, category: "Hành động nhanh", perm: "event.manage" },
    { label: "Thêm thành viên mới", action: () => openModal("addMember"), icon: User, category: "Hành động nhanh", perm: "member.create" },
    { label: "Đổi mật khẩu", action: () => openModal("changePassword"), icon: User, category: "Hành động nhanh" },
  ].filter((a) => !("perm" in a) || !a.perm || can(a.perm));

  const handleSelectNav = (href: string) => {
    setCommandPaletteOpen(false);
    router.push(href);
  };

  const handleSelectAction = (action: () => void) => {
    setCommandPaletteOpen(false);
    action();
  };

  // Tìm không dấu: "tuan" khớp "Tuấn"
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const q = fold(query.trim());
  // Phân hệ đang bảo trì không xuất hiện trong tìm kiếm nhanh (trừ người quản trị)
  const filteredNav = NAV_ITEMS.filter((item) => fold(item.label).includes(q) && (modules.canManage || !modules.disabled[item.href]));

  const filteredActions = ACTION_ITEMS.filter((item) => fold(item.label).includes(q));

  const filteredMembers = members.filter(
    (m) => fold(m.fullName).includes(q) || fold(m.room).includes(q) || (!!m.phone && m.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
  );

  const visibleMembers = query.trim() ? filteredMembers : [];

  const allItems = [
    ...filteredActions.map((item) => ({
      label: item.label,
      onSelect: () => handleSelectAction(item.action),
    })),
    ...filteredNav.map((item) => ({
      label: item.label,
      onSelect: () => handleSelectNav(item.href),
    })),
    ...visibleMembers.map((m) => ({
      label: m.fullName,
      onSelect: () => handleSelectNav(`/thanh-vien?member=${m.id}`),
    })),
  ];

  const totalCount = allItems.length;

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery("");
      setActiveIndex(-1);
    }
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    if (!isCommandPaletteOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandPaletteOpen(false);
        return;
      }

      if (totalCount === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % totalCount);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? totalCount - 1 : prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = activeIndex >= 0 ? allItems[activeIndex] : allItems[0];
        if (target) {
          target.onSelect();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, activeIndex, totalCount, allItems, setCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  let itemIndex = 0;

  return (
    <Portal>
      <div
        onClick={() => setCommandPaletteOpen(false)}
        className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-4 animate-in fade-in duration-150"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-purple-100 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          {/* SEARCH HEADER */}
          <div className="flex items-center px-4 py-3.5 border-b border-gray-100 gap-3">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm chức năng, hành động, hoặc tên thành viên..."
              className="w-full text-xs text-gray-900 bg-transparent outline-none placeholder:text-gray-400"
            />
            <kbd className="hidden sm:inline-block text-[10px] font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-200 shrink-0">
              ESC để đóng
            </kbd>
            <button
              onClick={() => setCommandPaletteOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* RESULTS LIST */}
          <div className="max-h-96 overflow-y-auto p-2 space-y-4">
            
            {/* QUICK ACTIONS */}
            {filteredActions.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Hành động nhanh
                </div>
                <div className="space-y-0.5">
                  {filteredActions.map((item) => {
                    const idx = itemIndex++;
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectAction(item.action)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-purple-50 text-gray-700 hover:text-primary transition group text-left",
                          idx === activeIndex ? "bg-purple-50 text-primary" : ""
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-6 h-6 rounded-lg bg-purple-100/70 text-primary flex items-center justify-center",
                            idx === activeIndex ? "bg-purple-200" : ""
                          )}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-semibold">{item.label}</span>
                        </div>
                        <ArrowRight className={cn(
                          "w-3.5 h-3.5 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition",
                          idx === activeIndex ? "text-primary translate-x-0.5" : ""
                        )} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* NAVIGATION */}
            {filteredNav.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Trang &amp; Phân hệ
                </div>
                <div className="space-y-0.5">
                  {filteredNav.map((item) => {
                    const idx = itemIndex++;
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectNav(item.href)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-purple-50 text-gray-700 hover:text-primary transition group text-left",
                          idx === activeIndex ? "bg-purple-50 text-primary" : ""
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-6 h-6 rounded-lg bg-gray-100 text-gray-500 group-hover:bg-purple-100 group-hover:text-primary flex items-center justify-center transition",
                            idx === activeIndex ? "bg-purple-100 text-primary" : ""
                          )}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-semibold">{item.label}</span>
                        </div>
                        <span className={cn(
                          "text-[10px] text-gray-400 group-hover:text-primary",
                          idx === activeIndex ? "text-primary font-medium" : ""
                        )}>Mở trang</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MEMBERS MATCH */}
            {visibleMembers.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Thành viên
                </div>
                <div className="space-y-0.5">
                  {visibleMembers.map((m) => {
                    const idx = itemIndex++;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectNav(`/thanh-vien?member=${m.id}`)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-purple-50 text-gray-700 hover:text-primary transition group text-left",
                          idx === activeIndex ? "bg-purple-50 text-primary" : ""
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold text-[10px] flex items-center justify-center">
                            {m.avatarText}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{m.fullName}</span>
                            <span className="text-[11px] text-gray-400 ml-2">{m.room} · {m.role}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400">{m.phone}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredNav.length === 0 && filteredActions.length === 0 && visibleMembers.length === 0 && (
              <div className="py-8 text-center text-xs text-gray-400">
                Không tìm thấy kết quả phù hợp với &quot;{query}&quot;
              </div>
            )}

          </div>

          {/* FOOTER */}
          <div className="px-4 py-2.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
            <span>Lưu Xá Phanxicô Quick Switcher</span>
            <span>Dùng phím ↑ ↓ để duyệt</span>
          </div>
        </div>
      </div>
    </Portal>
  );
};
