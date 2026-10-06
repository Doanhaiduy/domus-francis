"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { Modals } from "./Modals";
import { CommandPalette } from "./CommandPalette";
import { ModuleGate } from "./ModuleGate";
import { ToastContainer } from "./ToastContainer";
import { AppFooter } from "./AppFooter";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useAiStatus } from "@/lib/data/ai";
import { Sparkles } from "lucide-react";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isAuthPage = pathname === "/dang-nhap" || pathname === "/cho-phe-duyet";
  // Trang công khai (/tin-tuc/…) tự có đầu/chân trang riêng, không dùng khung ứng dụng và không cần phiên đăng nhập
  const isPublicSite = pathname === "/tin-tuc" || pathname.startsWith("/tin-tuc/");
  const { activeModal, openModal } = useApp();
  const { session } = useSession();
  const { status: aiStatus } = useAiStatus(!isAuthPage && !isPublicSite && !!session?.member);
  const showAssistant = !!aiStatus?.available.includes("community.policy_rag");

  // Mật khẩu tạm (do Ban điều hành cấp/đặt lại) ⇒ bắt buộc đổi trước khi dùng tiếp
  useEffect(() => {
    if (!isAuthPage && session?.user.mustChangePassword && activeModal !== "changePassword") openModal("changePassword");
  }, [isAuthPage, session?.user.mustChangePassword, activeModal, openModal]);

  if (isPublicSite) {
    return (
      <>
        {children}
        <ToastContainer />
      </>
    );
  }

  if (isAuthPage) {
    return (
      <>
        {children}
        <ToastContainer />
      </>
    );
  }

  return (
    // Nội dung tràn hết chiều rộng (trước đây bọc trong khung bg-surface có lề 12–24px + bo góc; khung overflow-hidden
    // đó còn làm thanh tiêu đề sticky không bám được đầu màn hình khi cuộn).
    <div className="min-h-screen bg-surface-container-lowest">
      {/* SIDEBAR (DESKTOP FIXED + MOBILE DRAWER) */}
      <Sidebar />

      {/* MAIN APPLICATION AREA */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        <Header />
        <main className="w-full flex-1 p-3.5 sm:p-5 lg:p-6 pb-6">
          <ModuleGate>{children}</ModuleGate>
        </main>
        {/* Chân trang (chừa chỗ cho thanh điều hướng dưới trên điện thoại) */}
        <AppFooter />
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <MobileBottomNav />

      {/* GLOBAL MODALS AND TOASTS */}
      <Modals />
      <CommandPalette />
      {/* Trợ lý AI hỏi đáp nội quy: chỉ hiện khi tính năng đã bật và có khóa API */}
      {showAssistant && !activeModal && (
        <button
          onClick={() => openModal("aiAssistant")}
          title="Hỏi trợ lý AI"
          className="fixed z-40 right-4 bottom-20 md:bottom-6 md:right-6 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 text-white text-xs font-bold shadow-lg shadow-violet-300/50 hover:scale-105 active:scale-95 transition"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Trợ lý AI</span>
        </button>
      )}
      <ToastContainer />
    </div>
  );
};
