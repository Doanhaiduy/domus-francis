import React from "react";
import { cn } from "@/lib/utils";

/** Nhãn "LỖI ĐỎ" — vi phạm nghiêm trọng. Nền đỏ đặc + chữ trắng (từ sắc 400 trở lên nên giữ nguyên ở giao diện tối). Dùng ở Luật nhà, Luật & mức phạt, Vi phạm. */
export function RedBadge({ className }: { className?: string }) {
  return <span className={cn("shrink-0 inline-flex items-center px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-extrabold tracking-wider", className)}>LỖI ĐỎ</span>;
}
