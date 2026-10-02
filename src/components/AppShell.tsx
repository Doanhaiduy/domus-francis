"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { Modals } from "./Modals";
import { CommandPalette } from "./CommandPalette";
import { ToastContainer } from "./ToastContainer";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isAuthPage = pathname === "/dang-nhap" || pathname === "/cho-phe-duyet";

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
      <ToastContainer />
    </div>
  );
};
