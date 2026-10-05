"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench, EyeOff } from "lucide-react";
import { useSession } from "@/lib/session";
import { useModules } from "@/lib/data/modules";
import { DEFAULT_MAINTENANCE_MESSAGE } from "@/lib/modules";

/**
 * Chặn phân hệ Admin đã tạm ẩn: thành viên thấy trang "Đang bảo trì" kèm lời nhắn; người có quyền sửa cấu hình
 * vẫn vào được (để kiểm tra) và thấy dải nhắc "đang ẩn với thành viên".
 */
export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();
  const { stateOf, canManage } = useModules(!!session?.member);
  const st = stateOf(pathname);
  if (!st) return <>{children}</>;

  if (canManage) {
    return (
      <>
        <div className="mb-4 px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center gap-2">
          <EyeOff className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0">
            Phân hệ <b>{st.module.label}</b> đang ẩn với thành viên (bảo trì). Bạn vẫn xem được vì có quyền quản trị.
          </span>
          <Link href="/cai-dat?tab=modules" className="font-bold text-amber-800 underline shrink-0">
            Mở lại
          </Link>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="flex items-center justify-center py-16 sm:py-24">
      <div className="max-w-md w-full text-center bg-white rounded-3xl border border-purple-50 shadow-xs p-6 sm:p-8 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
          <Wrench className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-extrabold text-gray-900">{st.module.label} đang bảo trì</h1>
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{st.message || DEFAULT_MAINTENANCE_MESSAGE}</p>
        {st.since && <p className="text-[11px] text-gray-400">Từ {new Date(st.since).toLocaleDateString("vi-VN")}</p>}
        <Link href="/" className="mt-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold">
          Về trang Tổng quan
        </Link>
      </div>
    </div>
  );
}
