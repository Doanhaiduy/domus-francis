"use client";

import React from "react";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nút "In / lưu PDF" (hộp thoại in của trình duyệt có sẵn lựa chọn lưu thành PDF). Phần đầu/chân trang đã có lớp no-print. */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn("inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-purple-200 text-primary hover:bg-purple-50 text-xs font-bold transition", className)}
    >
      <Printer className="w-4 h-4" aria-hidden /> In hoặc lưu PDF
    </button>
  );
}
