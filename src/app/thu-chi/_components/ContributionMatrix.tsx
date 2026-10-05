"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, CalendarPlus } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { monthTitle, shiftMonth, vnToday } from "@/lib/finance-format";
import { useContributionMatrix } from "@/lib/data/finance";
import type { ContributionCellDto, ContributionRowDto } from "@/lib/types/finance";
import AiDuesMessage from "./AiDuesMessage";

const GLYPH: Record<string, string> = { paid: "✓", partial: "½", unpaid: "✗", waived: "M", cancelled: "–" };
const CELL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  partial: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  unpaid: "bg-rose-50 text-rose-700 hover:bg-rose-100",
  waived: "bg-sky-100 text-sky-800 hover:bg-sky-200",
  cancelled: "bg-gray-100 text-gray-400",
};

/** Ma trận đóng quỹ 12 tháng: thành viên × tháng (RLS: thành viên thường chỉ thấy dòng của mình). */
export default function ContributionMatrix({
  canPlan,
  onOpenCell,
  onCreatePlan,
}: {
  canPlan: boolean;
  onOpenCell: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onCreatePlan: (month: string) => void;
}) {
  const current = vnToday().slice(0, 7);
  const [end, setEnd] = useState(current);
  const [q, setQ] = useState("");
  const { matrix, isLoading, error } = useContributionMatrix(end, 12);

  const rows = useMemo(() => {
    const list = matrix?.rows ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((r) => r.fullName.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || (r.room ?? "").toLowerCase().includes(s));
  }, [matrix, q]);
  const planByMonth = new Map((matrix?.plans ?? []).map((p) => [p.month, p]));
  const nextMonth = shiftMonth(current, 1);
  const missingPlan = [current, nextMonth].find((m) => !planByMonth.has(m) && m <= end);

  return (
    <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Ma trận đóng quỹ 12 tháng</h2>
          <p className="text-xs text-gray-500">
            {!matrix
              ? "Đang tải dữ liệu đóng quỹ…"
              : matrix.canReadAll
              ? "Tình hình đóng quỹ sinh hoạt của từng thành viên theo tháng — bấm vào ô để ghi thu, xem phiếu thu hoặc miễn giảm"
              : "Bạn xem được các khoản đóng quỹ của chính mình; số liệu toàn nhà ở thẻ Tổng quan"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPlan && <AiDuesMessage plan={planByMonth.get(current) ?? matrix?.plans[matrix.plans.length - 1]} />}
          {canPlan && matrix && !planByMonth.has(current) && (
            <button
              onClick={() => onCreatePlan(current)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Lập kỳ thu {monthTitle(current).toLowerCase()}
            </button>
          )}
          {canPlan && matrix && planByMonth.has(current) && !planByMonth.has(nextMonth) && (
            <button
              onClick={() => onCreatePlan(nextMonth)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Lập trước kỳ {monthTitle(nextMonth).toLowerCase()}
            </button>
          )}
          <button
            onClick={() => setEnd(shiftMonth(end, -12))}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700"
            title="12 tháng trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-gray-700 px-2">
            {monthTitle(shiftMonth(end, -11))} – {monthTitle(end)}
          </span>
          <button
            onClick={() => setEnd(shiftMonth(end, 12) > nextMonth ? nextMonth : shiftMonth(end, 12))}
            disabled={end >= nextMonth}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30"
            title="12 tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {matrix?.canReadAll && (
        <div className="relative max-w-sm">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Lọc tên anh em, số phòng..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none transition"
          />
        </div>
      )}

      {error && <div className="p-3 rounded-xl bg-rose-50 text-xs text-rose-700">Không tải được ma trận đóng quỹ.</div>}
      {isLoading && !matrix && <div className="p-6 text-center text-xs text-gray-400">Đang tải…</div>}

      {matrix && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="text-gray-400 font-bold uppercase text-[10px]">
                <th className="pb-2 pl-1 sticky left-0 bg-white min-w-[150px]">Thành viên</th>
                {matrix.months.map((m) => (
                  <th key={m} className={`pb-2 text-center min-w-[44px] ${m === current ? "text-primary" : ""}`} title={monthTitle(m)}>
                    T{Number(m.slice(5, 7))}
                    <div className="text-[9px] font-medium normal-case">{m.slice(2, 4)}</div>
                  </th>
                ))}
                <th className="pb-2 text-right pr-1 min-w-[90px]">Còn nợ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memberId}>
                  <td className="py-1 pl-1 sticky left-0 bg-white">
                    <div className="font-bold text-gray-900">{r.fullName}</div>
                    <div className="text-[10px] text-gray-400">{r.room ?? "Chưa xếp phòng"}</div>
                  </td>
                  {matrix.months.map((m) => {
                    const c = r.cells[m];
                    if (!c)
                      return (
                        <td key={m} className="text-center text-gray-300">
                          {planByMonth.has(m) ? "·" : "—"}
                        </td>
                      );
                    const overdue = c.overdue && (c.status === "unpaid" || c.status === "partial");
                    return (
                      <td key={m} className="text-center">
                        <button
                          onClick={() => onOpenCell(r, c)}
                          className={`w-9 h-8 rounded-lg font-extrabold text-xs transition ${overdue ? "bg-rose-600 text-white hover:bg-rose-700" : CELL[c.status]}`}
                          title={`${monthTitle(m)}: đã đóng ${formatVND(c.paidVnd)} / ${formatVND(c.netDueVnd)}${overdue ? " — quá hạn" : ""}`}
                        >
                          {GLYPH[c.status]}
                        </button>
                      </td>
                    );
                  })}
                  <td className={`py-1 pr-1 text-right font-bold ${r.outstandingVnd > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {r.outstandingVnd > 0 ? formatVND(r.outstandingVnd) : "Đủ"}
                    {r.overdueMonths > 0 && <div className="text-[10px] font-semibold">{r.overdueMonths} tháng quá hạn</div>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={matrix.months.length + 2} className="py-6 text-center text-gray-400">
                    Chưa có khoản đóng quỹ nào trong 12 tháng này.
                  </td>
                </tr>
              )}
            </tbody>
            {matrix.plans.length > 0 && (
              <tfoot>
                <tr className="text-[10px] text-gray-500">
                  <td className="pt-2 pl-1 sticky left-0 bg-white font-bold uppercase">Đã thu / phải thu</td>
                  {matrix.months.map((m) => {
                    const p = planByMonth.get(m);
                    const pct = p && p.stats.expectedVnd > 0 ? Math.round((p.stats.collectedVnd / p.stats.expectedVnd) * 100) : null;
                    return (
                      <td
                        key={m}
                        className="pt-2 text-center font-bold"
                        title={p ? `${formatVND(p.stats.collectedVnd)} / ${formatVND(p.stats.expectedVnd)}` : "Chưa lập kỳ thu"}
                      >
                        {pct !== null ? `${pct}%` : ""}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
        {[
          ["✓", "Đã đóng", CELL.paid],
          ["½", "Đóng một phần", CELL.partial],
          ["✗", "Chưa đóng", CELL.unpaid],
          ["!", "Quá hạn", "bg-rose-600 text-white"],
          ["M", "Được miễn", CELL.waived],
        ].map(([g, l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center ${c}`}>{g}</span> {l}
          </span>
        ))}
        <span>— Chưa lập kỳ thu</span>
        {matrix && missingPlan && canPlan && <span className="text-amber-700 font-semibold">· {monthTitle(missingPlan)} chưa có kỳ thu</span>}
      </div>
    </div>
  );
}
