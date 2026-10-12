"use client";

// Thẻ "Nghi tách phiếu chi" (người duyệt chi): ≥ 2 phiếu MỘT chữ ký cho cùng người/nơi nhận trong một tuần có tổng ≥ ngưỡng phiếu cần 2 chữ ký
// (view v_expense_split_alerts — kiểm soát nội bộ: tránh chia nhỏ khoản chi để né duyệt hai người). Không có cảnh báo ⇒ không hiện gì.
import React from "react";
import { ShieldAlert } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { dmy } from "@/lib/finance-format";
import { useSplitAlerts } from "@/lib/data/finance";
import { StatusBadge } from "./ExpenseDetailModal";

export default function SplitAlertsCard({ enabled, onOpenExpense, compact = false }: { enabled: boolean; onOpenExpense: (id: string) => void; compact?: boolean }) {
  const { split } = useSplitAlerts(enabled, 60);
  if (!enabled || !split || split.alerts.length === 0) return null;
  const shown = compact ? split.alerts.slice(0, 3) : split.alerts;
  return (
    <div className="rounded-2xl p-4 border border-amber-200 bg-amber-50/60 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-amber-950">Nghi tách phiếu chi ({split.alerts.length})</h3>
          <p className="text-[11px] text-amber-900/80 leading-relaxed">
            Nhiều phiếu một chữ ký cho cùng người/nơi nhận trong một tuần, cộng lại ≥ {split.thresholdVnd !== null ? formatVND(split.thresholdVnd) : "ngưỡng"} (mức phải có 2 chữ
            ký). Kiểm tra xem có phải một khoản chi bị chia nhỏ không — {split.days} ngày gần đây.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((a) => (
          <div key={a.key} className="p-3 rounded-xl bg-white border border-amber-100 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-gray-900">
                {a.counterparty} <span className="font-normal text-gray-500">· tuần {dmy(a.weekStart)} – {dmy(a.weekEnd)}</span>
              </span>
              <span className="tabular-nums text-gray-600">
                {a.vouchers.length} phiếu · tổng <b className="text-amber-800">{formatVND(a.totalVnd)}</b>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.vouchers.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onOpenExpense(v.id)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 hover:bg-purple-50 border border-gray-100 text-[11px] text-gray-700 transition"
                  title={v.title}
                >
                  <span className="font-mono font-bold">{v.voucherNo}</span>
                  <span className="tabular-nums">{formatVND(v.amountVnd)}</span>
                  <StatusBadge status={v.status} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {compact && split.alerts.length > shown.length && <p className="text-[11px] text-amber-900">… và {split.alerts.length - shown.length} cảnh báo khác ở tab Chi tiêu.</p>}
      </div>
    </div>
  );
}
