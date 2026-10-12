"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { InboxItem } from "@/lib/types/inbox";

/**
 * Số việc chờ xử lý trên thanh bên / tab con (hộp "Việc cần xử lý"): đỏ khi có việc quá hạn, vàng khi chỉ đang chờ.
 * Rê chuột thấy danh sách từng loại việc; trình đọc màn hình đọc "N việc cần xử lý".
 */
export function InboxBadge({ items, size = "md", className }: { items: InboxItem[]; size?: "sm" | "md"; className?: string }) {
  const count = items.reduce((s, i) => s + i.count, 0);
  if (count <= 0) return null;
  const urgent = items.some((i) => i.urgent);
  const title = items.map((i) => `${i.label}: ${i.count}${i.overdue ? ` (${i.overdue} quá hạn)` : ""}`).join("\n");
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums shrink-0 leading-none",
        size === "sm" ? "min-w-[18px] h-[18px] px-1.5 text-[10px]" : "min-w-[20px] h-5 px-1.5 text-[11px]",
        urgent ? "bg-error-container text-on-error-container" : "bg-amber-100 text-amber-800",
        className
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> việc cần xử lý{urgent ? ", có việc quá hạn" : ""}</span>
    </span>
  );
}
