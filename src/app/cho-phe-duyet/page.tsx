"use client";

import React from "react";
import Link from "next/link";
import { Hourglass, RefreshCw, Contact, ArrowLeft } from "lucide-react";
import { useApp } from "@/lib/store";

export default function ChoPheDuyetPage() {
  const { showToast } = useApp();

  return (
    <div className="min-h-screen bg-[#f5f4ff] flex items-center justify-center p-4">
      
      {/* FLOATING CARD */}
      <div className="w-full max-w-[480px] bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12),0_4px_20px_rgba(0,0,0,0.03)] border border-purple-100 flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Top Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-200/50 rounded-full blur-3xl pointer-events-none" />

        {/* CLOCK ICON */}
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-3xl shadow-xs mb-5 border border-amber-200">
          <Hourglass className="w-8 h-8 animate-pulse" />
        </div>

        {/* STATUS BADGE */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          Đang chờ phê duyệt quyền thành viên
        </span>

        {/* TITLE */}
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          Chào bạn! Tài khoản đang được xác minh
        </h1>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Email Google của bạn đã được tiếp nhận. Để đảm bảo an ninh nội bộ, Ban đại diện cần duyệt tài khoản trước khi bạn truy cập vào các tính năng của nhà.
        </p>

        {/* REGISTERED USER CARD */}
        <div className="w-full mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3.5 text-left">
          <div className="w-11 h-11 rounded-full bg-purple-100 text-primary flex items-center justify-center font-bold text-sm shrink-0">
            MT
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs text-gray-900 truncate">Nguyễn Minh Tuấn</div>
            <div className="text-[11px] text-gray-400 truncate">nguyen.minhtuan2004@gmail.com</div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-gray-200 text-gray-700 text-[10px] font-semibold shrink-0">
            Mới đăng ký
          </span>
        </div>

        {/* CONTACT BOX */}
        <div className="w-full mt-4 p-4 rounded-2xl bg-purple-50/70 border border-purple-100 text-left">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-900 mb-1.5">
            <Contact className="w-4 h-4 text-primary" />
            <span>Thông tin liên hệ cấp quyền:</span>
          </div>
          <p className="text-xs text-purple-900/80 leading-relaxed">
            Vui lòng nhắn tin trực tiếp cho <b>Anh Văn Đức</b> (Trưởng nhà · P.1 · 0912 334 782) hoặc <b>Anh Hoàng Long</b> (Phó nhà · P.1) để được kích hoạt ngay nhé!
          </p>
        </div>

        {/* ACTIONS */}
        <div className="w-full mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href="/dang-nhap"
            className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs transition text-center"
          >
            Đăng xuất
          </Link>
          <Link
            href="/"
            onClick={() => showToast("info", "Đang kiểm tra lại trạng thái quyền...")}
            className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white hover:bg-primary-container font-bold text-xs shadow-md shadow-primary/20 transition text-center flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Kiểm tra lại</span>
          </Link>
        </div>

        {/* FOOTER */}
        <div className="mt-6 pt-4 border-t border-gray-100 w-full text-center">
          <p className="text-[11px] text-gray-400">
            Lưu Xá Phanxicô Assisi • Bình An và Thiện Hảo
          </p>
        </div>

      </div>

    </div>
  );
}
