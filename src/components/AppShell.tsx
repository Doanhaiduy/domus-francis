"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { Modals } from "./Modals";
import { CommandPalette } from "./CommandPalette";
import { ToastContainer } from "./ToastContainer";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useAiStatus } from "@/lib/data/ai";
import { Sparkles } from "lucide-react";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isAuthPage = pathname === "/dang-nhap" || pathname === "/cho-phe-duyet";
  const { activeModal, openModal } = useApp();
  const { session } = useSession();
  const { status: aiStatus } = useAiStatus(!isAuthPage && !!session?.member);
  const showAssistant = !!aiStatus?.available.includes("community.policy_rag");

  // Mật khẩu tạm (do Ban điều hành cấp/đặt lại) ⇒ bắt buộc đổi trước khi dùng tiếp
  useEffect(() => {
    if (!isAuthPage && session?.user.mustChangePassword && activeModal !== "changePassword") openModal("changePassword");
  }, [isAuthPage, session?.user.mustChangePassword, activeModal, openModal]);

  if (isAuthPage) {
    return (
      <>
        {children}
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-0 md:p-3 lg:p-6 transition-colors">
      <div className="min-h-[calc(100vh-2rem)] bg-surface-container-lowest rounded-none md:rounded-3xl shadow-[0_10px_40px_-10px_rgba(124,92,252,0.08),0_2px_10px_-2px_rgba(15,23,42,0.04)] overflow-hidden relative border border-purple-50">
        
        {/* SIDEBAR (DESKTOP FIXED + MOBILE DRAWER) */}
        <Sidebar />

        {/* MAIN APPLICATION AREA */}
        <div className="pl-0 md:pl-64 flex flex-col min-h-full">
          <Header />
          <main className="w-full flex-1 p-3.5 sm:p-5 lg:p-8 bg-surface-container-lowest pb-24 md:pb-8">
            {children}
          </main>
        </div>

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
