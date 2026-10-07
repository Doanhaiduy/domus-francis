"use client";

// Thẻ "Các khoản thu" (trang Thu chi → Tổng quan): chọn kế hoạch thu (mặc định kỳ quỹ hiện tại; chip tiền điện nước các tháng gần nhất),
// tiến độ đã thu / phải thu, danh sách thành viên (thẻ trên điện thoại, bảng trên máy tính) với Thu tiền / Nộp qua QR / Chi tiết.
import React, { useEffect, useMemo, useState } from "react";
import { Search, CalendarPlus, Zap, QrCode, MoreHorizontal, Ban, BellRing, Undo2, Check, X as XIcon, Hourglass, ListChecks } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { dm, dmy } from "@/lib/finance-format";
import { FEE_TYPE_LABEL, type ContributionCellDto, type ContributionClaimDto, type ContributionPlanDto, type ContributionRowDto } from "@/lib/types/finance";
import { ContributionBadge } from "./ContributionDialogs";

type Filter = "unpaid" | "paid" | "all";
const owingOf = (c: ContributionCellDto) => c.status === "unpaid" || c.status === "partial";
const initials = (name: string) => name.split(" ").slice(-1)[0].substring(0, 2).toUpperCase();

/** Kế hoạch mặc định: kỳ quỹ đang diễn ra ⇒ kỳ quỹ gần nhất ⇒ kế hoạch gần nhất. */
export function defaultPlanOf(plans: ContributionPlanDto[] | undefined, currentMonth: string): ContributionPlanDto | null {
  if (!plans?.length) return null;
  const started = plans.filter((p) => p.month <= currentMonth);
  return (
    plans.find((p) => p.feeType === "periodic_dues" && p.month <= currentMonth && (p.endMonth ?? p.month) >= currentMonth) ??
    [...started].reverse().find((p) => p.feeType === "periodic_dues") ??
    [...started].reverse()[0] ??
    plans[0]
  );
}

/** Chip: kỳ quỹ (mới → cũ) trước, rồi tiền điện nước (mới → cũ), rồi khoản khác. */
function chipOrder(plans: ContributionPlanDto[]): ContributionPlanDto[] {
  const rank = (p: ContributionPlanDto) => (p.feeType === "periodic_dues" ? 0 : p.feeType === "utility" ? 1 : 2);
  return [...plans].sort((a, b) => rank(a) - rank(b) || b.month.localeCompare(a.month));
}

export default function CollectionsCard({
  plans,
  plan,
  rows,
  loadingRows,
  canReadAll,
  canRecord,
  canWaive,
  canPlan,
  myMemberId,
  currentMonth,
  onSelectPlan,
  onRecord,
  onOpenCell,
  onPayQr,
  onCreateDues,
  onCreateUtility,
  onCancelPlan,
  claims,
  canRemind,
  onQuickPay,
  onClaim,
  onUndo,
  onRemindOne,
  onRemindPlan,
  onBulkPay,
  onDecideClaim,
  onCancelClaim,
}: {
  plans: ContributionPlanDto[] | undefined;
  plan: ContributionPlanDto | null;
  rows: ContributionRowDto[];
  loadingRows: boolean;
  canReadAll: boolean;
  canRecord: boolean;
  canWaive: boolean;
  canPlan: boolean;
  myMemberId: string | null;
  currentMonth: string;
  onSelectPlan: (planId: string) => void;
  onRecord: (memberId: string, contributionId: string) => void;
  onOpenCell: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onPayQr: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onCreateDues: () => void;
  onCreateUtility: () => void;
  onCancelPlan: (plan: ContributionPlanDto) => void;
  /** Yêu cầu "đã đóng" đang chờ xác nhận của kế hoạch đang xem */
  claims: ContributionClaimDto[];
  canRemind: boolean;
  /** Người có quyền ghi thu xác nhận thay thành viên đã đóng */
  onQuickPay: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  /** Thành viên tự báo "Tôi đã đóng" */
  onClaim: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  /** Hoàn tác phiếu thu gần nhất của khoản (báo nhầm) */
  onUndo: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onRemindOne: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onRemindPlan: () => void;
  /** Mở hộp thoại ghi thu hàng loạt (khoản đã đóng từ trước) */
  onBulkPay: () => void;
  onDecideClaim: (claim: ContributionClaimDto, approve: boolean) => void;
  onCancelClaim: (claim: ContributionClaimDto) => void;
}) {
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [search, setSearch] = useState("");
  // Thành viên chỉ thấy khoản của mình ⇒ mặc định "Tất cả" thay vì danh sách người chưa đóng
  useEffect(() => {
    if (!canReadAll) setFilter("all");
  }, [canReadAll]);

  const claimOf = useMemo(() => new Map(claims.map((c) => [c.contributionId, c])), [claims]);
  const chips = useMemo(() => chipOrder(plans ?? []), [plans]);
  const planRows = useMemo(() => (plan ? rows.filter((r) => r.cells[plan.id]) : []), [plan, rows]);
  const cellOf = (r: ContributionRowDto) => r.cells[plan!.id];
  const owingList = useMemo(() => (canReadAll ? planRows.filter((r) => owingOf(r.cells[plan!.id])) : []), [planRows, canReadAll, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const unpaidList = useMemo(() => planRows.filter((r) => owingOf(r.cells[plan!.id])), [planRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const paidList = useMemo(() => planRows.filter((r) => !owingOf(r.cells[plan!.id])), [planRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const displayed = useMemo(() => {
    let list = filter === "unpaid" ? unpaidList : filter === "paid" ? paidList : planRows;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) => r.fullName.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || (r.room ?? "").toLowerCase().includes(s));
    }
    return list;
  }, [filter, unpaidList, paidList, planRows, search]);

  const pct = plan && plan.stats.expectedVnd > 0 ? Math.min(100, Math.round((plan.stats.collectedVnd / plan.stats.expectedVnd) * 100)) : 0;
  const counted = plan && plan.stats.paidCount !== null && plan.stats.totalCount !== null;
  const paidCount = counted ? plan!.stats.paidCount! + (plan!.stats.waivedCount ?? 0) : null;
  const totalCount = counted ? plan!.stats.totalCount! + (plan!.stats.waivedCount ?? 0) : null;
  const emptyText =
    planRows.length === 0
      ? loadingRows
        ? "Đang tải…"
        : canReadAll
          ? "Kế hoạch này chưa có khoản phải thu nào."
          : "Bạn không có khoản nào trong kế hoạch này."
      : filter === "unpaid"
        ? canReadAll
          ? "🎉 Tất cả anh em đã hoàn tất khoản này."
          : "Bạn đã đóng đủ khoản này."
        : "Không có thành viên phù hợp.";

  const actionsFor = (r: ContributionRowDto, c: ContributionCellDto, compact: boolean) => {
    const owing = owingOf(c);
    const mine = r.memberId === myMemberId;
    const claim = claimOf.get(c.contributionId);
    const btn = compact ? "px-3 py-1.5" : "px-2.5 py-1";
    return (
      <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
        {owing && claim && (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold" title={claim.note ?? undefined}>
              <Hourglass className="w-3 h-3" /> Chờ xác nhận
            </span>
            {canRecord && (
              <>
                <button onClick={() => onDecideClaim(claim, true)} className={`${btn} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition`}>
                  <Check className="w-3.5 h-3.5" /> Xác nhận
                </button>
                <button onClick={() => onDecideClaim(claim, false)} className={`${btn} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 transition`}>
                  <XIcon className="w-3.5 h-3.5" /> Từ chối
                </button>
              </>
            )}
            {mine && !canRecord && (
              <button onClick={() => onCancelClaim(claim)} className={`${btn} rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition`}>
                Hủy báo
              </button>
            )}
          </>
        )}
        {canRecord && owing && !claim && (
          <button
            onClick={() => onQuickPay(r, c)}
            className={`${btn} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition shadow-2xs`}
            title="Xác nhận thành viên đã đóng (tiền mặt hoặc chuyển khoản) — nhầm thì Hoàn tác"
          >
            <Check className="w-3.5 h-3.5" /> Đã đóng
          </button>
        )}
        {mine && owing && !claim && !canRecord && (
          <button
            onClick={() => onClaim(r, c)}
            className={`${btn} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 transition`}
            title="Báo bạn đã đóng (tiền mặt / chuyển khoản) để Thủ quỹ xác nhận"
          >
            <Check className="w-3.5 h-3.5" /> Tôi đã đóng
          </button>
        )}
        {canRecord && !owing && c.payments.length > 0 && (
          <button
            onClick={() => onUndo(r, c)}
            className={`${btn} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 transition`}
            title="Hủy phiếu thu gần nhất của khoản này (báo thu nhầm)"
          >
            <Undo2 className="w-3.5 h-3.5" /> Hoàn tác
          </button>
        )}
        {canRemind && owing && !mine && (
          <button
            onClick={() => onRemindOne(r, c)}
            className={`${compact ? "px-2.5 py-1.5" : "px-2 py-1"} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 active:scale-95 transition`}
            title="Nhắc người này đóng quỹ"
          >
            <BellRing className="w-3.5 h-3.5" /> Nhắc
          </button>
        )}
        {mine && owing && (
          <button
            onClick={() => onPayQr(r, c)}
            className={`${compact ? "px-3 py-1.5" : "px-2.5 py-1"} inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-purple-50 text-primary hover:bg-purple-100 active:scale-95 transition`}
            title="Mã QR chuyển khoản có sẵn số tiền + nội dung"
          >
            <QrCode className="w-3.5 h-3.5" /> Nộp qua QR
          </button>
        )}
        <button
          onClick={() => onOpenCell(r, c)}
          className={`${compact ? "px-2.5 py-1.5 bg-gray-50" : "px-2 py-1"} rounded-lg text-xs font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:scale-95 transition`}
          title={canRecord || canWaive ? "Chi tiết, phiếu thu, miễn/giảm" : "Chi tiết khoản"}
        >
          {!compact && owing && (canRecord || canWaive) ? <MoreHorizontal className="w-4 h-4" /> : "Chi tiết"}
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900">Các khoản thu</h2>
          <p className="text-xs text-gray-500">Quỹ định kỳ và tiền điện nước hằng tháng của cả nhà</p>
        </div>
        {canPlan && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onCreateDues} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs active:scale-95 transition">
              <CalendarPlus className="w-3.5 h-3.5" /> Lập kỳ quỹ
            </button>
            <button
              onClick={onCreateUtility}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold active:scale-95 transition"
            >
              <Zap className="w-3.5 h-3.5" /> Nhập tiền điện nước
            </button>
          </div>
        )}
      </div>

      {plans && plans.length === 0 && (
        <div className="p-4 rounded-xl bg-surface-container-low/60 text-xs text-gray-600">
          Chưa có khoản thu nào trong 12 tháng gần đây{canPlan ? " — lập kỳ quỹ hoặc nhập tiền điện nước để sinh khoản phải thu cho anh em." : "."}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {chips.map((p) => {
            const on = p.id === plan?.id;
            const pp = p.stats.expectedVnd > 0 ? Math.round((p.stats.collectedVnd / p.stats.expectedVnd) * 100) : null;
            const year = p.month.slice(0, 4) !== currentMonth.slice(0, 4) ? `/${p.month.slice(2, 4)}` : "";
            return (
              <button
                key={p.id}
                onClick={() => onSelectPlan(p.id)}
                title={p.name}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  on
                    ? "bg-primary text-white shadow-2xs"
                    : p.feeType === "utility"
                      ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {p.shortLabel}
                {year}
                {pp !== null && <span className={`ml-1 text-[10px] font-semibold ${on ? "text-white/80" : "text-gray-400"}`}>{pp}%</span>}
              </button>
            );
          })}
        </div>
      )}

      {plan && (
        <>
          <div className="p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50 flex flex-col gap-2">
            {/* Điện thoại: tiêu đề một hàng riêng, các nút hành động xuống dưới và tự xuống dòng; từ sm trở lên nằm cùng hàng bên phải */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0 sm:flex-1">
                <div className="text-sm font-extrabold text-gray-900">{plan.name}</div>
                <div className="text-[11px] text-gray-500">
                  {plan.feeType === "utility" && plan.billTotalVnd !== null && plan.splitCount ? (
                    <>
                      Tổng hóa đơn {formatVND(plan.billTotalVnd)} ÷ {plan.splitCount} người = <b className="text-gray-800">{formatVND(plan.amountVnd)}</b>/người
                      {plan.amountVnd * plan.splitCount > plan.billTotalVnd && <> (dư {formatVND(plan.amountVnd * plan.splitCount - plan.billTotalVnd)} do làm tròn)</>}
                    </>
                  ) : plan.feeType === "periodic_dues" ? (
                    <>
                      <b className="text-gray-800">{formatVND(plan.amountVnd)}</b> / người cho cả kỳ
                    </>
                  ) : (
                    <>
                      {FEE_TYPE_LABEL[plan.feeType]} · <b className="text-gray-800">{formatVND(plan.amountVnd)}</b> / người
                    </>
                  )}{" "}
                  · Hạn {dmy(plan.dueDate)}
                </div>
                {plan.note && <div className="text-[11px] text-gray-400 italic">{plan.note}</div>}
                {plan.expenseVoucherNo && (
                  <div className="text-[11px] text-emerald-700 font-semibold">
                    Đã trừ quỹ {formatVND(plan.expenseVnd ?? 0)} (phiếu chi {plan.expenseVoucherNo}) — anh em đóng thì cộng lại quỹ
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end sm:max-w-[60%]">
              {canRecord && unpaidList.length > 0 && (
                <button
                  onClick={onBulkPay}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800"
                  title="Ghi thu một lượt cho nhiều người đã đóng (vd. đóng trước khi dùng hệ thống)"
                >
                  <ListChecks className="w-3.5 h-3.5" /> Ghi thu hàng loạt
                </button>
              )}
              {canRemind && owingList.length > 0 && (
                <button
                  onClick={onRemindPlan}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-[11px] font-bold text-amber-800"
                  title="Nhắc tất cả người chưa đóng — trong ứng dụng và/hoặc nhóm Zalo"
                >
                  <BellRing className="w-3.5 h-3.5" /> Nhắc người chưa đóng ({owingList.length})
                </button>
              )}
              {canPlan && plan.stats.collectedVnd === 0 && (plan.feeType === "utility" || plan.feeType === "periodic_dues") && (
                <button
                  onClick={() => onCancelPlan(plan)}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                  title="Hủy kế hoạch (chỉ khi chưa ai nộp) — ví dụ nhập sai tổng hóa đơn"
                >
                  <Ban className="w-3 h-3" /> Hủy
                </button>
              )}
              </div>
            </div>
            <div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[11px] font-semibold text-gray-600">
                <span>
                  Đã thu {formatVND(plan.stats.collectedVnd)} / {formatVND(plan.stats.expectedVnd)} ({pct}%)
                </span>
                {paidCount !== null && totalCount !== null && (
                  <span>
                    {paidCount}/{totalCount} người đã xong
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold self-start">
              {(
                [
                  ["unpaid", `Chưa đóng (${unpaidList.length})`],
                  ["paid", `Đã đóng (${paidList.length})`],
                  ["all", `Tất cả (${planRows.length})`],
                ] as [Filter, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition whitespace-nowrap ${filter === k ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {canReadAll && (
              <div className="relative sm:w-56">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lọc tên, số phòng..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none transition"
                />
              </div>
            )}
          </div>

          {/* Điện thoại: mỗi thành viên một thẻ */}
          <div className="sm:hidden flex flex-col gap-2">
            {displayed.map((r) => {
              const c = cellOf(r);
              const last = c.payments[c.payments.length - 1];
              return (
                <div key={r.memberId} className="p-3 rounded-2xl border border-gray-100 bg-white flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-primary font-bold text-xs flex items-center justify-center shrink-0">{initials(r.name)}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-gray-900 truncate">{r.fullName}</div>
                        <div className="text-[11px] text-gray-400">{r.room ?? "Chưa xếp phòng"}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-xs text-gray-900">{formatVND(c.netDueVnd)}</div>
                      {c.status === "partial" && <div className="text-[10px] font-semibold text-amber-700">đã đóng {formatVND(c.paidVnd)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ContributionBadge cell={c} />
                    {c.status === "paid" && last ? (
                      <span className="text-[11px] text-emerald-600 font-medium">Nộp {dm(last.paidOn)}</span>
                    ) : c.status === "waived" ? null : (
                      <span className={`text-[11px] font-medium ${c.overdue ? "text-rose-600" : "text-amber-600"}`}>Hạn {dmy(c.dueDate)}</span>
                    )}
                  </div>
                  {actionsFor(r, c, true)}
                </div>
              );
            })}
            {displayed.length === 0 && <p className="py-6 text-center text-xs text-gray-400">{emptyText}</p>}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase text-[10px]">
                  <th className="pb-3 pl-1">Thành viên</th>
                  <th className="pb-3">Số tiền</th>
                  <th className="pb-3">Hạn / Ngày</th>
                  <th className="pb-3 text-center">Trạng thái</th>
                  <th className="pb-3 text-right pr-1">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((r) => {
                  const c = cellOf(r);
                  const last = c.payments[c.payments.length - 1];
                  return (
                    <tr key={r.memberId} className="hover:bg-purple-50/40 transition">
                      <td className="py-3 pl-1">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-purple-100 text-primary font-bold text-xs flex items-center justify-center">{initials(r.name)}</div>
                          <div>
                            <div className="font-bold text-gray-900">{r.fullName}</div>
                            <div className="text-[11px] text-gray-400">{r.room ?? "Chưa xếp phòng"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 font-bold text-gray-900">
                        {formatVND(c.netDueVnd)}
                        {c.status === "partial" && <div className="text-[10px] font-semibold text-amber-700">đã đóng {formatVND(c.paidVnd)}</div>}
                      </td>
                      <td className="py-3 text-gray-500">
                        {c.status === "paid" && last ? (
                          <span className="text-[11px] text-emerald-600 font-medium">Đã nộp {dm(last.paidOn)}</span>
                        ) : c.status === "waived" ? (
                          <span className="text-[11px] text-sky-700 font-medium">Miễn</span>
                        ) : (
                          <span className={`text-[11px] font-medium ${c.overdue ? "text-rose-600" : "text-amber-600"}`}>{dmy(c.dueDate)}</span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <ContributionBadge cell={c} />
                      </td>
                      <td className="py-3 pr-1">{actionsFor(r, c, false)}</td>
                    </tr>
                  );
                })}
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      {emptyText}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!canReadAll && (
            <p className="text-[11px] text-gray-500">
              Bạn chỉ xem được khoản của mình. Toàn nhà đã thu {formatVND(plan.stats.collectedVnd)} / {formatVND(plan.stats.expectedVnd)} ({pct}%).
            </p>
          )}
        </>
      )}
    </div>
  );
}
