"use client";
// Màu theo chủ đề album (mã categories.code) + nền thay thế khi album chưa có ảnh bìa.
// Đặt trong src/app để Tailwind quét được các class.
import React from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoryStyle {
  bg: string;
  text: string;
  border: string;
  iconBg: string;
  gradient: string;
}

const STYLE_BY_CODE: Record<string, CategoryStyle> = {
  ALB_PILGRIM: { bg: "bg-indigo-50", text: "text-indigo-800", border: "border-indigo-200", iconBg: "bg-indigo-100", gradient: "from-indigo-400 to-violet-600" },
  ALB_TRIP: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200", iconBg: "bg-emerald-100", gradient: "from-emerald-400 to-sky-600" },
  ALB_PATRON: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", iconBg: "bg-amber-100", gradient: "from-amber-400 to-rose-500" },
  ALB_MEAL: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200", iconBg: "bg-rose-100", gradient: "from-rose-400 to-orange-500" },
  ALB_DAILY: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200", iconBg: "bg-blue-100", gradient: "from-blue-400 to-cyan-600" },
  ALB_FAREWELL: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200", iconBg: "bg-purple-100", gradient: "from-purple-400 to-slate-600" },
};
const DEFAULT_STYLE: CategoryStyle = {
  bg: "bg-purple-50",
  text: "text-purple-800",
  border: "border-purple-200",
  iconBg: "bg-purple-100",
  gradient: "from-purple-400 to-indigo-600",
};

export const categoryStyle = (code: string | null | undefined): CategoryStyle => (code && STYLE_BY_CODE[code]) || DEFAULT_STYLE;

/** Lớp nền ảnh bìa (absolute inset-0): ảnh thật từ máy chủ local hoặc gradient theo chủ đề nếu album chưa có ảnh. */
export function CoverLayer({ url, code, className }: { url: string | null | undefined; code?: string | null; className?: string }) {
  if (url) return <div className={cn("absolute inset-0 bg-cover bg-center", className)} style={{ backgroundImage: `url(${url})` }} />;
  return (
    <div className={cn("absolute inset-0 bg-gradient-to-br flex items-center justify-center", categoryStyle(code).gradient, className)}>
      <Camera className="w-10 h-10 text-white/60" />
    </div>
  );
}
