"use client";

import { SectionTabs } from "./SectionTabs";
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
import { isPublicSitePath } from "@/lib/public-site";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useAiStatus } from "@/lib/data/ai";
import { Sparkles } from "lucide-react";
import { SecurityGate, useSecurityGate } from "./security/SecurityGate";
import { OpsBanner } from "./OpsBanner";
import { ConsentGate } from "./ConsentGate";
import { InstallPrompt } from "./InstallPrompt";
import { NotificationDeepLink } from "./NotificationDeepLink";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isAuthPage = ["/dang-nhap", "/cho-phe-duyet", "/quen-mat-khau", "/dat-lai-mat-khau"].includes(pathname);
  // Trang công khai (/tin-tuc/…) tự có đầu/chân trang riêng, không dùng khung ứng dụng và không cần phiên đăng nhập
  const isPublicSite = isPublicSitePath(pathname);
  const { activeModal, openModal } = useApp();
  const { session } = useSession();
  // Mật khẩu tạm / vai trò bắt buộc 2FA chưa bật ⇒ chỉ hiện màn hình chặn (API cũng chặn mọi thứ trừ /api/v1/auth/*)
  const gate = useSecurityGate();
  const { status: aiStatus } = useAiStatus(!isAuthPage && !isPublicSite && !!session?.member && !gate);
  const showAssistant = !!aiStatus?.available.includes("community.policy_rag");

  // Mật khẩu tạm (do người quản lý cấp/đặt lại) ⇒ bắt buộc đổi trước khi dùng tiếp
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

  if (gate) {
    return (
      <>
        <SecurityGate kind={gate} />
        <Modals />
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
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header />
        {/* Cảnh báo vận hành cho Admin (cron ngừng/lỗi, sao lưu quá hạn…) */}
        <OpsBanner />
        <main id="main-content" tabIndex={-1} className="w-full flex-1 p-3.5 sm:p-5 lg:p-6 pb-6 focus:outline-none">
          <SectionTabs />
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
      {/* Xác nhận Điều khoản + Chính sách bảo mật (lần đầu / khi văn bản đổi phiên bản) */}
      <ConsentGate />
      {/* Gợi ý cài ứng dụng + bật thông báo; cảnh báo khi mở trong trình duyệt của Zalo/Facebook */}
      <InstallPrompt />
      {/* Mở từ thông báo đẩy (?n=<id>) ⇒ đánh dấu đã đọc */}
      <NotificationDeepLink />
      {/* Trợ lý AI hỏi đáp nội quy: chỉ hiện khi tính năng đã bật và có khóa API */}
      {showAssistant && !activeModal && (
        <button
          onClick={() => openModal("aiAssistant")}
          title="Hỏi trợ lý AI"
          className="fixed z-40 right-4 bottom-20 lg:bottom-6 lg:right-6 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 text-white text-xs font-bold shadow-lg shadow-violet-300/50 hover:scale-105 active:scale-95 transition"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Trợ lý AI</span>
        </button>
      )}
      <ToastContainer />
    </div>
  );
};
