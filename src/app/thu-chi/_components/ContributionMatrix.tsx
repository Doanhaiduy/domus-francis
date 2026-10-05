"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, CalendarPlus, Zap } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { monthTitle, shiftMonth, vnToday } from "@/lib/finance-format";
import { useContributionMatrix } from "@/lib/data/finance";
import type { ContributionCellDto, ContributionPlanDto, ContributionRowDto } from "@/lib/types/finance";
import AiDuesMessage from "./AiDuesMessage";

const GLYPH: Record<string, string> = { paid: "✓", partial: "½", unpaid: "✗", waived: "M", cancelled: "–" };
const CELL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  partial: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  unpaid: "bg-rose-50 text-rose-700 hover:bg-rose-100",
  waived: "bg-sky-100 text-sky-800 hover:bg-sky-200",
  cancelled: "bg-gray-100 text-gray-400",
};
const isOverdue = (c: ContributionCellDto) => c.overdue && (c.status === "unpaid" || c.status === "partial");
const pctOf = (p: ContributionPlanDto) => (p.stats.expectedVnd > 0 ? Math.round((p.stats.collectedVnd / p.stats.expectedVnd) * 100) : null);
const yearOf = (p: ContributionPlanDto) => (p.endMonth && p.endMonth.slice(0, 4) !== p.month.slice(0, 4) ? `${p.month.slice(2, 4)}–${p.endMonth.slice(2, 4)}` : p.month.slice(0, 4));

/** Ma trận đóng quỹ: hàng = thành viên, cột = các kế hoạch thu (quỹ kỳ, điện nước…) trong 12 tháng đang xem. RLS: thành viên thường chỉ thấy dòng của mình. */
export default function ContributionMatrix({
  canPlan,
  onOpenCell,
  onCreateDues,
  onCreateUtility,
}: {
  canPlan: boolean;
  onOpenCell: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onCreateDues: () => void;
  onCreateUtility: () => void;
}) {
  const current = vnToday().slice(0, 7);
  const maxEnd = shiftMonth(current, 6);
  const [end, setEnd] = useState(current);
  const [q, setQ] = useState("");
  const { matrix, isLoading, error } = useContributionMatrix({ to: end, months: 12 });

  const rows = useMemo(() => {
    const list = matrix?.rows ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((r) => r.fullName.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || (r.room ?? "").toLowerCase().includes(s));
  }, [matrix, q]);
  const plans = matrix?.plans ?? [];
  const currentDues = plans.find((p) => p.feeType === "periodic_dues" && p.month <= current && (p.endMonth ?? p.month) >= current);
  const latestUtility = [...plans].reverse().find((p) => p.feeType === "utility");
  const aiPlan = currentDues ?? latestUtility ?? plans[plans.length - 1];

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Ma trận đóng quỹ</h2>
          <p className="text-xs text-gray-500">
            {!matrix
              ? "Đang tải dữ liệu đóng quỹ…"
              : matrix.canReadAll
                ? "Mỗi cột là một khoản thu (quỹ định kỳ, tiền điện nước) — bấm vào ô để ghi thu, xem phiếu thu hoặc miễn giảm"
                : "Bạn xem được các khoản đóng quỹ của chính mình; số liệu toàn nhà ở thẻ Tổng quan"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPlan && <AiDuesMessage plan={aiPlan} />}
          {canPlan && (
            <>
              <button
                onClick={onCreateDues}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs"
              >
                <CalendarPlus className="w-3.5 h-3.5" /> Lập kỳ quỹ
              </button>
              <button
                onClick={onCreateUtility}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold"
              >
                <Zap className="w-3.5 h-3.5" /> Nhập tiền điện nước
              </button>
            </>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEnd(shiftMonth(end, -12))}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700"
              title="12 tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-gray-700 px-1 sm:px-2 whitespace-nowrap">
              {monthTitle(shiftMonth(end, -11))} – {monthTitle(end)}
            </span>
            <button
              onClick={() => setEnd(shiftMonth(end, 12) > maxEnd ? maxEnd : shiftMonth(end, 12))}
              disabled={end >= maxEnd}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30"
              title="12 tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
      {matrix && plans.length === 0 && (
        <div className="p-6 text-center text-xs text-gray-400">Chưa có khoản thu nào trong 12 tháng này{canPlan ? " — bấm “Lập kỳ quỹ” hoặc “Nhập tiền điện nước”." : "."}</div>
      )}

      {/* Điện thoại: mỗi thành viên một thẻ, các khoản là chip bấm được */}
      {matrix && plans.length > 0 && (
        <div className="sm:hidden flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.memberId} className="p-3 rounded-2xl border border-gray-100 bg-white flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-xs text-gray-900 truncate">{r.fullName}</div>
                  <div className="text-[11px] text-gray-400">{r.room ?? "Chưa xếp phòng"}</div>
                </div>
                <div className={`text-right text-xs font-bold shrink-0 ${r.outstandingVnd > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  {r.outstandingVnd > 0 ? `Còn ${formatVND(r.outstandingVnd)}` : "Đủ"}
                  {r.overdueCount > 0 && <div className="text-[10px] font-semibold">{r.overdueCount} khoản quá hạn</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {plans.map((p) => {
                  const c = r.cells[p.id];
                  if (!c) return null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onOpenCell(r, c)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${isOverdue(c) ? "bg-rose-600 text-white" : CELL[c.status]}`}
                    >
                      {p.shortLabel} {GLYPH[c.status]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="py-6 text-center text-xs text-gray-400">Không có thành viên phù hợp.</p>}
        </div>
      )}

      {matrix && plans.length > 0 && (
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="text-gray-400 font-bold text-[10px]">
                <th className="pb-2 pl-1 sticky left-0 bg-white min-w-[150px] uppercase">Thành viên</th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    className={`pb-2 text-center min-w-[64px] ${p === currentDues ? "text-primary" : p.feeType === "utility" ? "text-amber-700" : ""}`}
                    title={`${p.name} · ${formatVND(p.amountVnd)}/người · hạn ${p.dueDate.split("-").reverse().join("/")}`}
                  >
                    {p.shortLabel}
                    <div className="text-[9px] font-medium">{yearOf(p)}</div>
                  </th>
                ))}
                <th className="pb-2 text-right pr-1 min-w-[90px] uppercase">Còn nợ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memberId}>
                  <td className="py-1 pl-1 sticky left-0 bg-white">
                    <div className="font-bold text-gray-900">{r.fullName}</div>
                    <div className="text-[10px] text-gray-400">{r.room ?? "Chưa xếp phòng"}</div>
                  </td>
                  {plans.map((p) => {
                    const c = r.cells[p.id];
                    if (!c)
                      return (
                        <td key={p.id} className="text-center text-gray-300" title="Không có khoản phải thu (vào ở sau hạn nộp hoặc không thuộc kế hoạch)">
                          ·
                        </td>
                      );
                    const overdue = isOverdue(c);
                    return (
                      <td key={p.id} className="text-center">
                        <button
                          onClick={() => onOpenCell(r, c)}
                          className={`w-10 h-8 rounded-lg font-extrabold text-xs transition ${overdue ? "bg-rose-600 text-white hover:bg-rose-700" : CELL[c.status]}`}
                          title={`${p.name}: đã đóng ${formatVND(c.paidVnd)} / ${formatVND(c.netDueVnd)}${overdue ? " — quá hạn" : ""}`}
                        >
                          {GLYPH[c.status]}
                        </button>
                      </td>
                    );
                  })}
                  <td className={`py-1 pr-1 text-right font-bold ${r.outstandingVnd > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {r.outstandingVnd > 0 ? formatVND(r.outstandingVnd) : "Đủ"}
                    {r.overdueCount > 0 && <div className="text-[10px] font-semibold">{r.overdueCount} khoản quá hạn</div>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={plans.length + 2} className="py-6 text-center text-gray-400">
                    Không có thành viên phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="text-[10px] text-gray-500">
                <td className="pt-2 pl-1 sticky left-0 bg-white font-bold uppercase">Đã thu / phải thu</td>
                {plans.map((p) => {
                  const pct = pctOf(p);
                  return (
                    <td key={p.id} className="pt-2 text-center font-bold" title={`${formatVND(p.stats.collectedVnd)} / ${formatVND(p.stats.expectedVnd)}`}>
                      {pct !== null ? `${pct}%` : ""}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
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
        <span>· Không có khoản</span>
        <span className="text-gray-400">“Quỹ T7–T12” = quỹ định kỳ cả kỳ; “ĐN T9” = tiền điện nước tháng 9</span>
        {matrix && canPlan && !currentDues && end >= current && <span className="text-amber-700 font-semibold">· Kỳ quỹ hiện tại chưa lập kế hoạch thu</span>}
      </div>
    </div>
  );
}
