"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

export default function DangNhapPage() {
  return (
    <div className="min-h-screen bg-[#f5f4ff] flex items-center justify-center p-4">
      
      {/* FLOATING AUTH WINDOW */}
      <div className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12),0_4px_20px_rgba(0,0,0,0.03)] border border-purple-100 flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Top Ambient Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-200/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-indigo-200/50 rounded-full blur-3xl pointer-events-none" />

        {/* LOGO ICON */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-extrabold text-3xl shadow-lg shadow-purple-300/60 mb-5">
          ✝
        </div>

        {/* BRAND TITLE */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Lưu Xá Phanxicô
        </h1>
        <p className="text-xs font-bold text-primary bg-purple-100 px-3 py-1 rounded-full mt-2 inline-block">
          Cộng đoàn sinh viên công giáo
        </p>

        {/* GREETING */}
        <p className="text-xs text-gray-500 mt-4 leading-relaxed">
          Hệ thống thông tin nội bộ dành riêng cho anh em sinh viên đang lưu trú tại Lưu Xá Phanxicô Assisi.
        </p>

        {/* GOOGLE LOGIN ACTION */}
        <div className="w-full mt-8 space-y-3">
          <Link
            href="/"
            className="w-full py-3.5 px-4 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 text-gray-800 font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-2xs hover:shadow-xs group"
          >
            {/* Google SVG Logo */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            <span>Đăng nhập với Google</span>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Pending Approval Link for Testing */}
          <Link
            href="/cho-phe-duyet"
            className="block text-xs text-primary hover:underline font-semibold pt-2"
          >
            Xem trạng thái tài khoản đang chờ phê duyệt →
          </Link>
        </div>

        {/* NOTICE FOOTER */}
        <div className="mt-8 pt-6 border-t border-gray-100 w-full">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bảo mật nội bộ · Phê duyệt bởi Trưởng nhà</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            © 2026 Lưu Xá Phanxicô Assisi • Pax et Bonum
          </p>
        </div>

      </div>

    </div>
  );
}
