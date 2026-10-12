"use client";

import React from "react";
import { AlarmClock, Clock } from "lucide-react";
import { DATA_REQUEST_STATUS_LABEL, DATA_REQUEST_TYPE_LABEL, type DataRequestDto, type DataRequestStatus, type DataRequestType } from "@/lib/types/data-requests";
import { cn } from "@/lib/utils";

// Mảnh giao diện dùng chung cho "Yêu cầu về dữ liệu cá nhân" (thẻ của thành viên ở Hồ sơ cá nhân + bảng của người quản lý ở trang Thành viên).

export const DSR_STATUS_STYLE: Record<DataRequestStatus, string> = {
  received: "bg-amber-100 text-amber-800",
  in_progress: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-gray-200 text-gray-700",
};

export const DSR_TYPE_STYLE: Record<DataRequestType, string> = {
  access: "bg-purple-50 text-purple-700 border-purple-100",
  portability: "bg-purple-50 text-purple-700 border-purple-100",
  rectification: "bg-sky-50 text-sky-700 border-sky-100",
  erasure: "bg-rose-50 text-rose-700 border-rose-100",
  restriction: "bg-amber-50 text-amber-800 border-amber-100",
  objection: "bg-amber-50 text-amber-800 border-amber-100",
  withdraw_consent: "bg-indigo-50 text-indigo-700 border-indigo-100",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

export const fmtDateTime = (isoStr: string) =>
  new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(isoStr));

export function DsrTypeChip({ type }: { type: DataRequestType }) {
  return <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold border", DSR_TYPE_STYLE[type])}>{DATA_REQUEST_TYPE_LABEL[type]}</span>;
}

export function DsrStatusChip({ status }: { status: DataRequestStatus }) {
  return <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", DSR_STATUS_STYLE[status])}>{DATA_REQUEST_STATUS_LABEL[status]}</span>;
}

/** Hạn phản hồi 72 giờ: còn bao lâu / đã quá hạn (chỉ khi yêu cầu còn mở). */
export function DsrDueBadge({ item, now = Date.now() }: { item: Pick<DataRequestDto, "status" | "dueAt" | "overdue">; now?: number }) {
  if (item.status !== "received" && item.status !== "in_progress") return null;
  const ms = new Date(item.dueAt).getTime() - now;
  if (item.overdue || ms <= 0) {
    const h = Math.max(1, Math.round(-ms / 3_600_000));
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white">
        <AlarmClock className="w-3 h-3" aria-hidden /> Quá hạn {h < 48 ? `${h} giờ` : `${Math.round(h / 24)} ngày`}
      </span>
    );
  }
  const h = Math.round(ms / 3_600_000);
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", h <= 24 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600")}>
      <Clock className="w-3 h-3" aria-hidden /> Hạn phản hồi: {h < 1 ? "dưới 1 giờ" : `${h} giờ nữa`}
    </span>
  );
}
