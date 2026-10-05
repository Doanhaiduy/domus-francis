"use client";

import React from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api";

export interface MemberContributionRow {
  periodLabel: string; // "Tháng 10 / 2026"
  amountDueVnd: number;
  amountPaidVnd: number;
  status: "paid" | "partial" | "unpaid" | "waived";
}

const fmt = (n: number) => n.toLocaleString("vi-VN") + "đ";

/** Lịch sử đóng quỹ của một thành viên (Thu Chi — RLS: chính chủ hoặc người có quyền xem quỹ). */
export default function MemberContributionHistory({ memberId, months = 3 }: { memberId: string; months?: number }) {
  const { data, error, isLoading } = useSWR<MemberContributionRow[]>(`/api/v1/finance/members/${memberId}/contributions?months=${months}`, swrFetcher, {
    shouldRetryOnError: false,
  });
  return (
    <div className="pt-2">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Lịch sử đóng quỹ {months} tháng gần nhất</span>
      <div className="space-y-1.5 text-xs">
        {isLoading && <div className="p-2 rounded-xl bg-gray-50 text-gray-400">Đang tải…</div>}
        {error && <div className="p-2 rounded-xl bg-gray-50 text-gray-400">Không có quyền xem hoặc chưa có dữ liệu quỹ.</div>}
        {data && data.length === 0 && <div className="p-2 rounded-xl bg-gray-50 text-gray-400">Chưa có khoản phải thu nào.</div>}
        {data?.map((c) => (
          <div
            key={c.periodLabel}
            className={`flex items-center justify-between p-2 rounded-xl font-medium ${
              c.status === "paid" ? "bg-emerald-50 text-emerald-900" : c.status === "waived" ? "bg-sky-50 text-sky-900" : c.status === "partial" ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-900"
            }`}
          >
            <span>{c.periodLabel}</span>
            <span className="font-bold">
              {c.status === "paid" && `${fmt(c.amountPaidVnd)} ✓ Đã đóng`}
              {c.status === "partial" && `${fmt(c.amountPaidVnd)}/${fmt(c.amountDueVnd)} · Còn thiếu`}
              {c.status === "unpaid" && `${fmt(c.amountDueVnd)} · Chưa đóng`}
              {c.status === "waived" && "Được miễn"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
