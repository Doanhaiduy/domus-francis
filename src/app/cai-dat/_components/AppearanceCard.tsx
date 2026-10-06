"use client";

import React from "react";
import { Palette } from "lucide-react";
import { FontSizeSegmented, ThemeSegmented, useTheme } from "@/lib/theme";

/** Chọn giao diện Sáng / Tối / Theo hệ thống — lưu trên trình duyệt này (mỗi thiết bị một lựa chọn). */
export function AppearanceCard() {
  const { preference, resolved } = useTheme();
  return (
    <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
          <Palette className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Giao diện</h3>
          <p className="text-[11px] text-gray-400">
            {preference === "system" ? `Đang theo hệ thống (hiện là ${resolved === "dark" ? "tối" : "sáng"})` : `Đang dùng giao diện ${resolved === "dark" ? "tối" : "sáng"}`} · lưu riêng cho thiết bị này
          </p>
        </div>
      </div>
      <ThemeSegmented />
      <div className="basis-full flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-100">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Cỡ chữ</h3>
          <p className="text-[11px] text-gray-400">Phóng to chữ và toàn bộ giao diện cho dễ đọc · lưu riêng cho thiết bị này</p>
        </div>
        <FontSizeSegmented />
      </div>
    </div>
  );
}
