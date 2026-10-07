"use client";

import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Plus,
  FileDown,
  Search,
  Eye,
  Calendar,
  Copy,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  RotateCcw,
  Check,
  X,
  Paperclip,
  Lock,
  AlertCircle,
  Ban,
  Send,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import ThuChiLoading from "./loading";
import { CustomSelect, CustomDatePicker } from "@/components/ui/FormControls";
import { Portal } from "@/components/ui/Portal";
import { FinancialBarChart, ExpenseDonutChart, AreaTrendChart, DonutDataPoint } from "@/components/ui/Charts";
import FinancialReportModal, { buildFinanceReport } from "@/components/FinancialReportModal";
import { ExpenseFormCard } from "@/components/modals/AddExpenseModal";
import { useZaloSend } from "@/lib/zalo-client";
import { dmy, formatFinanceReportForZalo, monthEndOf, shiftMonth, vnToday } from "@/lib/finance-format";
import {
  financeApi,
  refreshFinance,
  useContributionMatrix,
  useContributionPlans,
  useExpenses,
  useFinanceOptions,
  useFinanceOverview,
  usePendingClaims,
  type PeriodQuery,
} from "@/lib/data/finance";
import {
  PERIOD_STATUS_LABEL,
  type ContributionCellDto,
  type ContributionClaimDto,
  type ContributionPlanDto,
  type ContributionRowDto,
  type ExpenseDetailDto,
  type ExpenseDto,
  type ExpenseStatus,
} from "@/lib/types/finance";
import { duesTransferContent } from "@/lib/vietqr";
import ReceivingAccountCard from "@/components/finance/ReceivingAccountCard";
import AiFinanceInsight from "@/components/ai/AiFinanceInsight";
import PayQrDialog from "@/components/finance/PayQrDialog";
import ExpenseDetailModal, { StatusBadge } from "./_components/ExpenseDetailModal";
import ContributionMatrix from "./_components/ContributionMatrix";
import CollectionsCard, { defaultPlanOf } from "./_components/CollectionsCard";
import { CellDialog, DuesCycleModal, PayModal, UtilityModal } from "./_components/ContributionDialogs";
import { ReasonDialog } from "./_components/dialogs";
import { ClaimDialog, QuickPayDialog, RemindDialog } from "./_components/CollectionDialogs";
import StatsPanel from "./_components/StatsPanel";
import DonationsPanel from "./_components/DonationsPanel";
import { OpeningBalanceBanner, OpeningBalanceButton } from "./_components/OpeningBalance";
import BankLinesCard from "./_components/BankLinesCard";

const STATUS_FILTERS: { label: string; statuses: ExpenseStatus[] | null }[] = [
  { label: "Tất cả", statuses: null },
  { label: "Chờ duyệt", statuses: ["pending_approval"] },
  { label: "Đã duyệt", statuses: ["approved"] },
  { label: "Đã chi", statuses: ["paid"] },
  { label: "Từ chối", statuses: ["rejected"] },
  { label: "Nháp", statuses: ["draft"] },
  { label: "Hủy / Đảo", statuses: ["cancelled", "reversed"] },
];
const NOT_COUNTED: ExpenseStatus[] = ["cancelled", "rejected", "reversed"];
const CATEGORY_EMOJI: Record<string, string> = { FOOD: "🛒", UTILITY: "⚡", CLEAN: "🧴", REPAIR: "🔧", LITURGY: "✝", GUEST: "🤝", OTHER: "📦" };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

type Tab = "tong-quan" | "danh-sach" | "dong-quy" | "ung-ho" | "bao-cao" | "thong-ke";

export default function ThuChiPage() {
  const { openModal, showToast, currentRole, isLoadingSkeleton } = useApp();
  const { canSend: canZaloSend, sending: zaloSending, send: zaloSend } = useZaloSend();
  const { can, session } = useSession();
  const today = useMemo(() => vnToday(), []);
  const current = today.slice(0, 7);

  const [activeTab, setActiveTab] = useState<Tab>("tong-quan");

  // PERIOD CONTROLS (THEO THÁNG HOẶC KHOẢNG NGÀY)
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [selectedMonth, setSelectedMonth] = useState<string>(current);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Expenses Tab Filter States
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("ALL");
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>("Tất cả");
  const [expenseDateFilter, setExpenseDateFilter] = useState("");

  // Hộp thoại
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseDetailDto | null>(null);
  const [rejectFor, setRejectFor] = useState<ExpenseDto | null>(null);
  const [payFor, setPayFor] = useState<{ memberId: string; contributionId: string } | null>(null);
  const [cellFor, setCellFor] = useState<{ row: ContributionRowDto; cell: ContributionCellDto } | null>(null);
  const [payQrFor, setPayQrFor] = useState<{ row: ContributionRowDto; cell: ContributionCellDto } | null>(null);
  const [duesOpen, setDuesOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [cancelPlanFor, setCancelPlanFor] = useState<ContributionPlanDto | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Thu quỹ nhanh: đã đóng / tôi đã đóng / hoàn tác / nhắc nợ / xác nhận báo đóng
  const [quickPayFor, setQuickPayFor] = useState<{ row: ContributionRowDto; cell: ContributionCellDto } | null>(null);
  const [claimFor, setClaimFor] = useState<{ row: ContributionRowDto; cell: ContributionCellDto } | null>(null);
  const [undoFor, setUndoFor] = useState<{ row: ContributionRowDto; cell: ContributionCellDto } | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remindOne, setRemindOne] = useState<{ contributionId: string; name: string } | null>(null);
  const [rejectClaim, setRejectClaim] = useState<ContributionClaimDto | null>(null);

  const canManageFinances = can(["finance.expense.read_all", "finance.ledger.read", "finance.contribution.read_all"]);
  const canSeeAllExpenses = can("finance.expense.read_all");
  const canCreateExpense = can("finance.expense.create");
  const canApprove = can("finance.expense.approve");
  const canRecord = can("finance.contribution.record");
  const canWaive = can("finance.contribution.waive");
  const canPlan = can("finance.contribution.plan.manage");
  const canRemind = canRecord || canPlan;

  // KỲ ĐANG XEM → tham số truy vấn
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i)), [current]);
  const MONTH_ORDER = useMemo(() => [...monthOptions].reverse(), [monthOptions]);
  const { periodQuery, rangeError } = useMemo((): { periodQuery: PeriodQuery; rangeError: string | null } => {
    const thisMonth = { from: `${current}-01`, to: monthEndOf(current) };
    if (periodMode === "month")
      return { periodQuery: selectedMonth === "all" ? { all: true } : { from: `${selectedMonth}-01`, to: monthEndOf(selectedMonth) }, rangeError: null };
    let from = startDate;
    let to = endDate;
    if (!from && !to) return { periodQuery: thisMonth, rangeError: null };
    if (from && !to) to = from > today ? from : today;
    if (!from && to) from = `${to.slice(0, 4)}-01-01`;
    if (from > to) return { periodQuery: thisMonth, rangeError: "Ngày bắt đầu phải trước ngày kết thúc." };
    if (daysBetween(from, to) > 366) return { periodQuery: thisMonth, rangeError: "Khoảng ngày tối đa 366 ngày — đang hiển thị tháng hiện tại." };
    return { periodQuery: { from, to }, rangeError: null };
  }, [periodMode, selectedMonth, startDate, endDate, current, today]);

  const { overview: o, error: overviewError } = useFinanceOverview(periodQuery);
  const { expenses } = useExpenses(o?.from, o?.to);
  const options = useFinanceOptions();

  // CÁC KHOẢN THU (độc lập với kỳ báo cáo): kế hoạch 12 tháng qua + 6 tháng tới; mặc định kỳ quỹ đang diễn ra
  const { plans: recentPlans } = useContributionPlans();
  const plan = useMemo(
    () => recentPlans?.find((p) => p.id === selectedPlanId) ?? defaultPlanOf(recentPlans, current),
    [recentPlans, selectedPlanId, current],
  );
  const { matrix: planMatrix, isLoading: planRowsLoading } = useContributionMatrix({ plan: plan?.id }, !!plan);
  const planRows = useMemo(() => (plan && planMatrix ? planMatrix.rows.filter((r) => r.cells[plan.id]) : []), [plan, planMatrix]);
  const { claims: planClaims } = usePendingClaims(plan?.id, !!plan);
  const owingInPlan = useMemo(() => planRows.filter((r) => r.cells[plan!.id] && (r.cells[plan!.id].status === "unpaid" || r.cells[plan!.id].status === "partial")).length, [planRows, plan]);

  // PERIOD LABEL
  const periodLabel = useMemo(() => {
    if (periodMode === "month") {
      if (selectedMonth === "all") return "Toàn bộ các tháng";
      return `Tháng ${selectedMonth.slice(5, 7)}, ${selectedMonth.slice(0, 4)}`;
    }
    if (rangeError) return `Tháng ${current.slice(5, 7)}, ${current.slice(0, 4)}`;
    if (startDate && endDate) return `${dmy(startDate)} – ${dmy(endDate)}`;
    if (startDate) return `Từ ngày ${dmy(startDate)}`;
    if (endDate) return `Đến ngày ${dmy(endDate)}`;
    return "Khoảng ngày tùy chọn";
  }, [periodMode, selectedMonth, startDate, endDate, rangeError, current]);

  const periodStatus = useMemo(() => {
    if (!o || periodMode !== "month" || selectedMonth === "all") return null;
    return o.periods.find((p) => p.month === selectedMonth)?.status ?? null;
  }, [o, periodMode, selectedMonth]);

  // SỐ LIỆU KỲ (từ sổ cái — fn_finance_summary)
  const opening = o?.openingVnd ?? 0;
  const closing = o?.closingVnd ?? 0;
  const delta = closing - opening;
  const deltaPct = opening > 0 ? Math.round((delta / opening) * 1000) / 10 : null;
  const plansInPeriod = o?.plans ?? [];
  const duesExpected = plansInPeriod.reduce((s, p) => s + p.stats.expectedVnd, 0);
  const duesCollected = plansInPeriod.reduce((s, p) => s + p.stats.collectedVnd, 0);
  const outstanding = Math.max(0, duesExpected - duesCollected);
  const collectRate = duesExpected > 0 ? Math.round((duesCollected / duesExpected) * 100) : null;
  const countsKnown = plansInPeriod.length > 0 && plansInPeriod.every((p) => p.stats.paidCount !== null);
  const paidCount = countsKnown ? plansInPeriod.reduce((s, p) => s + (p.stats.paidCount ?? 0) + (p.stats.waivedCount ?? 0), 0) : null;
  const totalCount = countsKnown ? plansInPeriod.reduce((s, p) => s + (p.stats.totalCount ?? 0) + (p.stats.waivedCount ?? 0), 0) : null;
  const owingCount = countsKnown ? plansInPeriod.reduce((s, p) => s + (p.stats.unpaidCount ?? 0) + (p.stats.partialCount ?? 0), 0) : null;
  const unitLabel = plansInPeriod.length > 1 ? "lượt" : "thành viên";
  const paidVoucherCount = (o?.expenseByCategory ?? []).reduce((s, c) => s + c.count, 0);
  const pendingInPeriod = expenses.filter((e) => e.status === "pending_approval").length;

  const barData = useMemo(() => (o?.months ?? []).map((m) => ({ label: m.label, thu: m.incomeVnd, chi: m.expenseVnd })), [o]);
  const trendData = useMemo(() => (o?.months ?? []).map((m) => ({ label: `Tháng ${Number(m.month.slice(5, 7))}`, value: m.closingVnd })), [o]);
  const dynamicExpenseDonut: DonutDataPoint[] = useMemo(() => {
    const pts = (o?.expenseByCategory ?? []).filter((c) => c.amountVnd > 0).map((c) => ({ label: c.name, value: c.amountVnd, color: c.color }));
    return pts.length ? pts : [{ label: "Chưa có phát sinh", value: 1, color: "#e5e7eb" }];
  }, [o]);

  // DANH SÁCH PHIẾU CHI (lọc)
  const filteredExpenses = useMemo(() => {
    const st = STATUS_FILTERS.find((f) => f.label === expenseStatusFilter)?.statuses ?? null;
    const q = expenseSearch.toLowerCase().trim();
    return expenses.filter((e) => {
      const matchSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.voucherNo.toLowerCase().includes(q) ||
        (e.paidBy?.name ?? "").toLowerCase().includes(q) ||
        e.requestedBy.name.toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q);
      const matchCategory = expenseCategoryFilter === "ALL" || e.category.code === expenseCategoryFilter;
      const matchStatus = !st || st.includes(e.status);
      const matchDate = !expenseDateFilter || dmy(e.expenseDate).includes(expenseDateFilter.trim());
      return matchSearch && matchCategory && matchStatus && matchDate;
    });
  }, [expenses, expenseSearch, expenseCategoryFilter, expenseStatusFilter, expenseDateFilter]);
  const filteredExpensesTotal = filteredExpenses.filter((e) => !NOT_COUNTED.includes(e.status)).reduce((s, e) => s + e.amountVnd, 0);

  const reportProps = { periodLabel, overview: o, expenses, plan, rows: o?.access.contributionsAll ? planRows : null, canSeeAllExpenses };

  // QUICK COPY ZALO ACTION
  const handleCopyZalo = async () => {
    if (!o) return;
    await zaloSend(formatFinanceReportForZalo(buildFinanceReport(reportProps)), "Đã gửi báo cáo thu chi vào nhóm Zalo.");
  };

  // STEPPING MONTHS
  const handleStepMonth = (direction: -1 | 1) => {
    const currentIndex = MONTH_ORDER.indexOf(selectedMonth);
    if (currentIndex === -1) {
      setSelectedMonth(current);
      return;
    }
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < MONTH_ORDER.length) setSelectedMonth(MONTH_ORDER[nextIndex]);
  };

  const approveClaim = async (claim: ContributionClaimDto) => {
    setBusyId(claim.id);
    try {
      await financeApi.decideClaim(claim.id, true);
      await refreshFinance();
      showToast("success", "Đã xác nhận khoản đóng và ghi phiếu thu.");
    } catch (x) {
      showToast("error", errorMessage(x));
    } finally {
      setBusyId(null);
    }
  };
  const cancelClaim = async (claim: ContributionClaimDto) => {
    try {
      await financeApi.cancelClaim(claim.id);
      await refreshFinance();
      showToast("info", "Đã hủy báo đã đóng.");
    } catch (x) {
      showToast("error", errorMessage(x));
    }
  };

  const quickApprove = async (e: ExpenseDto) => {
    setBusyId(e.id);
    try {
      const r = await financeApi.decide(e.id, "approved");
      await refreshFinance();
      showToast(
        "success",
        r.status === "approved"
          ? `Phiếu ${e.voucherNo} đã đủ chữ ký — chờ Thủ quỹ chi.`
          : `Đã ký duyệt phiếu ${e.voucherNo} (${r.approvedCount}/${r.requiredApprovals}).`,
      );
    } catch (x) {
      showToast("error", errorMessage(x));
    } finally {
      setBusyId(null);
    }
  };

  if (isLoadingSkeleton || (!o && !overviewError)) {
    return <ThuChiLoading />;
  }

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Thu Chi &amp; Tài Chính</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý dòng tiền quỹ sinh hoạt chung Lưu Xá Phanxicô minh bạch &amp; chuẩn xác</p>
        </div>

        {/* TOP QUICK ACTIONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canZaloSend && (
            <button
              onClick={handleCopyZalo}
              disabled={zaloSending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs transition active:scale-95 shadow-2xs disabled:opacity-60"
              title="Gửi báo cáo thu chi vào nhóm Zalo bằng bot"
            >
              <Send className="w-3.5 h-3.5 text-primary" />
              <span>{zaloSending ? "Đang gửi…" : "Gửi nhóm Zalo"}</span>
            </button>
          )}

          <button
            onClick={() => setIsReportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-purple-200 hover:bg-purple-50 text-gray-800 font-bold text-xs transition active:scale-95 shadow-2xs"
            title="Tải bản Báo cáo quyết toán thu chi (file PDF chuẩn A4)"
          >
            <FileDown className="w-3.5 h-3.5 text-primary" />
            <span>Tải Báo Cáo PDF</span>
          </button>

          {canCreateExpense ? (
            <button
              onClick={() => openModal("addExpense")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
              title={canManageFinances ? "Lập phiếu chi (chờ người quản lý phê duyệt)" : "Đề xuất chi / xin hoàn ứng khoản bạn đã chi cho nhà"}
            >
              <Plus className="w-4 h-4" />
              <span>{canManageFinances ? "Lập phiếu chi" : "Đề xuất chi"}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <span>Chế độ xem minh bạch</span>
            </div>
          )}
        </div>
      </div>

      {/* PERIOD CONTROLLER (BỘ CHỌN CHU KỲ TÀI CHÍNH THÁNG / KHOẢNG NGÀY) */}
      <div className="bg-white rounded-2xl p-4 border border-purple-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
            <button
              onClick={() => setPeriodMode("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                periodMode === "month" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Theo Tháng</span>
            </button>
            <button
              onClick={() => setPeriodMode("range")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                periodMode === "range" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Khoảng Ngày (Từ - Đến)</span>
            </button>
          </div>

          <span className="hidden sm:inline-block text-xs font-medium text-gray-400">|</span>

          {/* ACTIVE PERIOD BADGE */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 text-xs font-bold">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span>Kỳ: {periodLabel}</span>
          </div>
          {periodStatus && (
            <div
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold ${
                periodStatus === "closed"
                  ? "bg-gray-900 text-white"
                  : periodStatus === "pending_confirmation"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-50 text-emerald-700"
              }`}
              title="Trạng thái sổ quỹ tháng: đã chốt thì không ghi thêm bút toán vào tháng này"
            >
              {periodStatus !== "open" && <Lock className="w-3 h-3" />}
              {PERIOD_STATUS_LABEL[periodStatus]}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {periodMode === "month" ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleStepMonth(-1)}
                disabled={selectedMonth === MONTH_ORDER[0] || selectedMonth === "all"}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="w-52">
                <CustomSelect
                  value={selectedMonth}
                  onChange={(val) => setSelectedMonth(val)}
                  options={[
                    ...monthOptions.map((m) => ({ value: m, label: `Tháng ${m.slice(5, 7)}, ${m.slice(0, 4)}${m === current ? " (Hiện tại)" : ""}` })),
                    { value: "all", label: "Tất cả các tháng" },
                  ]}
                  placeholder="Chọn tháng"
                />
              </div>

              <button
                onClick={() => handleStepMonth(1)}
                disabled={selectedMonth === MONTH_ORDER[MONTH_ORDER.length - 1] || selectedMonth === "all"}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {selectedMonth !== current && (
                <button
                  onClick={() => setSelectedMonth(current)}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition"
                  title="Về tháng hiện tại"
                >
                  Tháng này
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <CustomDatePicker value={startDate} onChange={setStartDate} placeholder="Từ ngày..." format="YYYY-MM-DD" />
              </div>
              <span className="text-gray-400 text-xs font-bold">→</span>
              <div className="w-36">
                <CustomDatePicker value={endDate} onChange={setEndDate} placeholder="Đến ngày..." format="YYYY-MM-DD" />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="p-2 rounded-xl hover:bg-rose-50 text-rose-600 transition"
                  title="Xóa khoảng ngày"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {rangeError && <div className="-mt-3 text-xs font-semibold text-rose-600">{rangeError}</div>}

      {/* ROLE BANNER FOR MEMBERS */}
      {!canManageFinances && (
        <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary shrink-0" />
            <span>
              <b>Chế độ xem tài chính công khai (Vai trò: {currentRole})</b>: Mọi thành viên giám sát được tồn quỹ, tổng thu – chi, cơ cấu chi tiêu và tỷ lệ thu
              quỹ của cả nhà; phiếu chi và khoản đóng quỹ thì bạn xem được của chính mình. Duyệt chi, ghi thu và xuất quỹ chỉ áp dụng cho Thủ quỹ và Ban điều
              hành.
            </span>
          </div>
        </div>
      )}

      {overviewError && !o && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800">Không tải được số liệu quỹ: {errorMessage(overviewError)}</div>
      )}

      {canApprove && o && o.pendingApprovals > pendingInPeriod && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Có {o.pendingApprovals - pendingInPeriod} phiếu chi đang chờ duyệt nằm ngoài kỳ đang xem.
          </span>
          <button
            onClick={() => {
              setPeriodMode("month");
              setSelectedMonth("all");
              setExpenseStatusFilter("Chờ duyệt");
              setActiveTab("danh-sach");
            }}
            className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 font-bold hover:bg-amber-100"
          >
            Xem phiếu chờ duyệt
          </button>
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-2 border-b border-purple-50 pb-2 overflow-x-auto">
        {(
          [
            ["tong-quan", "Tổng quan"],
            ["danh-sach", `Danh sách chi tiêu (${expenses.length})`],
            ["dong-quy", "Ma trận đóng quỹ"],
            ["ung-ho", "Ủng hộ"],
            ["bao-cao", "Báo cáo & Biểu đồ"],
            ["thong-ke", "Thống kê & Xuất file"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setActiveTab(k)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === k ? "bg-primary text-white shadow-xs" : "text-gray-600 hover:bg-surface-container-low"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TỔNG QUAN */}
      {/* ========================================================================= */}
      {activeTab === "tong-quan" && o && (
        <>
          {/* Mới triển khai (sổ quỹ còn trống): nhắc Trưởng nhà nhập số dư quỹ khởi đầu */}
          <OpeningBalanceBanner />

          {/* AI nhận xét thu chi tháng đang xem so với tháng trước (tự ẩn khi tác vụ tắt hoặc không đủ quyền) */}
          {periodMode === "month" && selectedMonth !== "all" && <AiFinanceInsight month={selectedMonth} />}

          {/* ROW 1: 4 STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Tồn quỹ kỳ này ({periodLabel})</span>
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">🏛️</div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-gray-900">{formatVND(closing)}</div>
                <div className={`flex items-center gap-1.5 text-xs font-bold mt-2 ${delta >= 0 ? "text-primary" : "text-rose-600"}`}>
                  {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>
                    {delta >= 0 ? "Tăng" : "Giảm"} {formatVND(Math.abs(delta))}
                    {deltaPct !== null ? ` (${delta >= 0 ? "+" : ""}${deltaPct}%)` : ""} so với đầu kỳ
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Đã thu trong kỳ</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">💰</div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-gray-900">{formatVND(o.incomeVnd)}</div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold mt-2">
                  {paidCount !== null && totalCount ? (
                    <span>
                      {paidCount}/{totalCount} {unitLabel}
                    </span>
                  ) : (
                    <span>Thu quỹ &amp; điện nước</span>
                  )}
                  <span className="text-[10px] text-gray-400">· {collectRate !== null ? `${collectRate}% chỉ tiêu` : "Chưa có khoản thu"}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Đã chi trong kỳ</span>
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">🛒</div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-gray-900">{formatVND(o.expenseVnd)}</div>
                <div className="flex items-center gap-1.5 text-xs text-primary font-bold mt-2">
                  <span>{paidVoucherCount} phiếu đã chi</span>
                  <span className="text-[10px] text-gray-400">
                    · {o.pendingApprovals} {canSeeAllExpenses ? "phiếu chờ duyệt" : "chờ duyệt (của bạn)"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Chưa thu trong kỳ</span>
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">⏳</div>
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-extrabold ${outstanding > 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatVND(outstanding)}</div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 font-bold mt-2">
                  {owingCount !== null && (
                    <span>
                      {owingCount} {unitLabel}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">
                    · {plansInPeriod.length === 0 ? "Chưa có khoản thu" : outstanding === 0 ? "100% hoàn tất" : "Quỹ kỳ + điện nước trong kỳ"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* VISUAL CHARTS ROW IN OVERVIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs">
              <FinancialBarChart
                data={barData}
                height={220}
                title="Dòng Tiền Thu - Chi 6 Tháng Gần Nhất"
                subtitle="Thu quỹ thực nhận so với thực chi (số thuần, đã trừ bút toán đảo)"
              />
            </div>
            <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <AreaTrendChart data={trendData} height={190} title="Tăng Trưởng Số Dư Quỹ Lưu Xá" subtitle="Số dư cuối mỗi tháng theo sổ cái" />
              {o.funds && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {o.funds.map((f) => (
                    <span key={f.id} className="px-2.5 py-1 rounded-lg bg-surface-container-low text-[11px] font-semibold text-gray-700">
                      {f.name}: <b className="text-gray-900">{formatVND(f.balanceVnd)}</b>
                    </span>
                  ))}
                  <OpeningBalanceButton />
                </div>
              )}
            </div>
          </div>

          {/* ROW 3: CONTRIBUTIONS & RECENT EXPENSES */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: CÁC KHOẢN THU (7 COLS) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <BankLinesCard />
              <CollectionsCard
                plans={recentPlans}
                plan={plan}
                rows={planRows}
                loadingRows={planRowsLoading}
                canReadAll={!!o.access.contributionsAll}
                canRecord={canRecord}
                canWaive={canWaive}
                canPlan={canPlan}
                myMemberId={session?.member?.id ?? null}
                currentMonth={current}
                onSelectPlan={setSelectedPlanId}
                onRecord={(memberId, contributionId) => setPayFor({ memberId, contributionId })}
                onOpenCell={(row, cell) => setCellFor({ row, cell })}
                onPayQr={(row, cell) => setPayQrFor({ row, cell })}
                onCreateDues={() => setDuesOpen(true)}
                onCreateUtility={() => setUtilityOpen(true)}
                onCancelPlan={setCancelPlanFor}
                claims={planClaims}
                canRemind={canRemind}
                onQuickPay={(row, cell) => setQuickPayFor({ row, cell })}
                onClaim={(row, cell) => setClaimFor({ row, cell })}
                onUndo={(row, cell) => setUndoFor({ row, cell })}
                onRemindOne={(row, cell) => setRemindOne({ contributionId: cell.contributionId, name: row.name })}
                onRemindPlan={() => setRemindOpen(true)}
                onDecideClaim={(claim, approve) => (approve ? approveClaim(claim) : setRejectClaim(claim))}
                onCancelClaim={cancelClaim}
              />
            </div>

            {/* RIGHT: TÀI KHOẢN NHẬN QUỸ (QR) + CHI TIÊU GẦN ĐÂY (5 COLS) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <ReceivingAccountCard />
              <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900">{canSeeAllExpenses ? "Chi tiêu gần đây" : "Phiếu chi của tôi"}</h2>
                  <button onClick={() => setActiveTab("danh-sach")} className="text-xs font-bold text-primary hover:underline">
                    Xem tất cả →
                  </button>
                </div>

                <div className="space-y-3">
                  {expenses.slice(0, 5).map((exp) => (
                    <button
                      key={exp.id}
                      onClick={() => setDetailId(exp.id)}
                      className="w-full text-left flex items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low/50 border border-purple-50 hover:bg-surface-container-low transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {CATEGORY_EMOJI[exp.category.code] ?? "🛒"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-gray-900 truncate">{exp.title}</div>
                          <div className="text-[11px] text-gray-400 truncate">
                            {dmy(exp.expenseDate)} · {exp.paidBy?.name ?? "Quỹ chi"} ({exp.category.name})
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs font-extrabold ${NOT_COUNTED.includes(exp.status) ? "text-gray-400 line-through" : "text-rose-600"}`}>
                          -{formatVND(exp.amountVnd)}
                        </div>
                        <StatusBadge status={exp.status} className="mt-1 inline-block" />
                      </div>
                    </button>
                  ))}
                  {expenses.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-400">
                      {canSeeAllExpenses ? "Chưa có phiếu chi nào trong kỳ." : "Bạn chưa có phiếu chi/đề xuất chi nào trong kỳ."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DANH SÁCH CHI TIÊU TOÀN DIỆN */}
      {/* ========================================================================= */}
      {activeTab === "danh-sach" && (
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{canSeeAllExpenses ? "Sổ phiếu chi sinh hoạt" : "Phiếu chi & đề xuất chi của tôi"}</h2>
              <p className="text-xs text-gray-500">
                {canSeeAllExpenses
                  ? "Toàn bộ chứng từ, phiếu chi giải ngân cho hoạt động lưu xá — bấm vào phiếu để xem hóa đơn, chữ ký duyệt"
                  : "Phiếu bạn lập hoặc bạn đã ứng tiền; tổng chi của cả nhà xem ở thẻ Tổng quan / Báo cáo"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold text-gray-700 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100"
                title="Không tính phiếu đã hủy, bị từ chối hoặc đã đảo"
              >
                Tổng đã lọc: <b className="text-rose-600">{formatVND(filteredExpensesTotal)}</b>
              </span>
            </div>
          </div>

          {/* FILTERS & SEARCH ROW */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                placeholder="Tìm khoản chi, số phiếu, người ứng tiền, ghi chú..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-surface-container-low p-1 rounded-xl text-xs font-semibold">
              {STATUS_FILTERS.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setExpenseStatusFilter(label)}
                  className={`px-3 py-1 rounded-lg transition ${
                    expenseStatusFilter === label ? "bg-white text-gray-900 shadow-2xs font-bold" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-40">
              <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={expenseDateFilter}
                onChange={(e) => setExpenseDateFilter(e.target.value)}
                placeholder="Lọc ngày (dd/mm)..."
                className="w-full pl-7 pr-2.5 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[{ code: "ALL", name: "Tất cả" }, ...(options?.categories ?? [])].map((cat) => (
              <button
                key={cat.code}
                onClick={() => setExpenseCategoryFilter(cat.code)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  expenseCategoryFilter === cat.code ? "bg-primary text-white shadow-2xs font-bold" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Điện thoại: thẻ phiếu chi (bảng 7 cột phải cuộn ngang) — chạm để mở chi tiết, duyệt/từ chối trong đó */}
          <div className="sm:hidden flex flex-col gap-2">
            {filteredExpenses.map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => setDetailId(exp.id)}
                className="text-left p-3 rounded-2xl border border-gray-100 bg-white flex flex-col gap-1.5 active:bg-purple-50/50 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-xs text-gray-900 min-w-0">
                    {exp.title}
                    {exp.receipts.length > 0 && <Paperclip className="inline w-3 h-3 ml-1 text-primary" aria-label="Có hóa đơn" />}
                  </span>
                  <span className={`text-xs font-extrabold shrink-0 ${NOT_COUNTED.includes(exp.status) ? "text-gray-400 line-through" : "text-rose-600"}`}>
                    -{formatVND(exp.amountVnd)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">
                  #{exp.voucherNo} · {dmy(exp.expenseDate)} · {exp.paidBy?.name ?? "Quỹ chi trực tiếp"}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold">{exp.category.name}</span>
                  <StatusBadge status={exp.status} />
                  {exp.status === "pending_approval" && (
                    <span className="text-[10px] text-gray-400">
                      {exp.approvedCount}/{exp.requiredApprovals} chữ ký
                    </span>
                  )}
                </div>
              </button>
            ))}
            {filteredExpenses.length === 0 && <p className="py-6 text-center text-xs text-gray-400">Không có phiếu chi phù hợp.</p>}
          </div>

          {/* TABLE OF EXPENSES */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase text-[10px]">
                  <th className="pb-3 pl-2">Mã / Ngày</th>
                  <th className="pb-3">Tên khoản chi</th>
                  <th className="pb-3">Phân loại</th>
                  <th className="pb-3">Người ứng / chi</th>
                  <th className="pb-3">Ghi chú</th>
                  <th className="pb-3 text-right">Số tiền</th>
                  <th className="pb-3 text-center pr-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} onClick={() => setDetailId(exp.id)} className="hover:bg-purple-50/40 transition cursor-pointer">
                    <td className="py-3 pl-2 font-mono text-[11px] text-gray-500">
                      <div>#{exp.voucherNo}</div>
                      <div className="text-[10px] text-gray-400">{dmy(exp.expenseDate)}</div>
                    </td>
                    <td className="py-3 font-bold text-gray-900">
                      <span className="inline-flex items-center gap-1.5">
                        {exp.title}
                        {exp.receipts.length > 0 && <Paperclip className="w-3 h-3 text-primary shrink-0" aria-label="Có hóa đơn" />}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold whitespace-nowrap">{exp.category.name}</span>
                    </td>
                    <td className="py-3 text-gray-700 font-medium">{exp.paidBy?.name ?? "Quỹ chi trực tiếp"}</td>
                    <td className="py-3 text-gray-400 text-[11px] max-w-[180px] truncate">{exp.note || exp.noReceiptReason || "—"}</td>
                    <td className={`py-3 text-right font-extrabold ${NOT_COUNTED.includes(exp.status) ? "text-gray-400 line-through" : "text-rose-600"}`}>
                      -{formatVND(exp.amountVnd)}
                    </td>
                    <td className="py-3 text-center pr-2" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setDetailId(exp.id)} className="flex flex-col items-center">
                          <StatusBadge status={exp.status} />
                          {exp.status === "pending_approval" && (
                            <span className="text-[10px] text-gray-400 mt-0.5">
                              {exp.approvedCount}/{exp.requiredApprovals} chữ ký
                            </span>
                          )}
                        </button>

                        {(exp.can.approve || exp.can.reject) && (
                          <div className="flex items-center gap-1">
                            {exp.can.approve && (
                              <button
                                disabled={busyId === exp.id}
                                onClick={() => quickApprove(exp)}
                                className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition disabled:opacity-50"
                                title="Ký duyệt phiếu chi"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setRejectFor(exp)}
                              className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                              title="Từ chối phiếu chi"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      Không có phiếu chi phù hợp trong kỳ {periodLabel.toLowerCase()}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: MA TRẬN ĐÓNG QUỸ 12 THÁNG */}
      {/* ========================================================================= */}
      {activeTab === "dong-quy" && (
        <ContributionMatrix
          canPlan={canPlan}
          onOpenCell={(row, cell) => setCellFor({ row, cell })}
          onCreateDues={() => setDuesOpen(true)}
          onCreateUtility={() => setUtilityOpen(true)}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BÁO CÁO THÁNG & BIỂU ĐỒ */}
      {/* ========================================================================= */}
      {activeTab === "bao-cao" && o && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-purple-50 shadow-xs flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Báo cáo tài chính nội bộ &amp; Biểu đồ thống kê</div>
              <h2 className="text-xl font-extrabold text-gray-900">Tổng Kết Quỹ &amp; Phân Tích {periodLabel}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Kỳ đối soát: {periodLabel}
                {o.signatories.treasurer
                  ? ` · Thủ quỹ: ${o.signatories.treasurer.name}${o.signatories.treasurer.room ? ` (${o.signatories.treasurer.room})` : ""}`
                  : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {canZaloSend && (
                <button
                  onClick={handleCopyZalo}
                  disabled={zaloSending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5 text-primary" />
                  <span>{zaloSending ? "Đang gửi…" : "Gửi nhóm Zalo"}</span>
                </button>
              )}
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold transition shadow-xs active:scale-95"
                title="Tải tệp PDF quyết toán"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Tải Báo Cáo PDF (A4)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50">
              <span className="text-xs text-gray-400 font-medium">Số dư đầu kỳ</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">{formatVND(o.openingVnd)}</div>
              <span className="text-[10px] text-gray-500 mt-1 block">Chuyển từ kỳ trước (gồm số dư đầu kỳ nhập sổ)</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
              <span className="text-xs text-emerald-800 font-medium">Tổng thu quỹ</span>
              <div className="text-xl font-extrabold text-emerald-700 mt-1">+{formatVND(o.incomeVnd)}</div>
              <span className="text-[10px] text-emerald-600 mt-1 block">
                {paidCount !== null && totalCount
                  ? `${paidCount}/${totalCount} ${unitLabel} đã nộp`
                  : collectRate !== null
                    ? `Đạt ${collectRate}% chỉ tiêu thu quỹ`
                    : "Chưa có khoản thu"}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100">
              <span className="text-xs text-rose-800 font-medium">Tổng giải ngân</span>
              <div className="text-xl font-extrabold text-rose-600 mt-1">-{formatVND(o.expenseVnd)}</div>
              <span className="text-[10px] text-rose-500 mt-1 block">{paidVoucherCount} khoản đã chi (đã trừ phiếu đảo)</span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100">
              <span className="text-xs text-purple-800 font-medium">Số dư kết chuyển</span>
              <div className="text-xl font-extrabold text-primary mt-1">{formatVND(o.closingVnd)}</div>
              <span className="text-[10px] text-primary font-bold mt-1 block">
                {delta >= 0 ? "Quỹ tăng" : "Quỹ giảm"} {formatVND(Math.abs(delta))} trong kỳ
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 border border-purple-100 rounded-3xl p-5 bg-white shadow-2xs">
              <ExpenseDonutChart
                data={dynamicExpenseDonut}
                size={170}
                title={`Cơ Cấu Chi Phí (${periodLabel})`}
                subtitle="Tỷ trọng các phiếu đã chi giữa các danh mục sinh hoạt"
              />
            </div>
            <div className="lg:col-span-6 border border-purple-100 rounded-3xl p-5 bg-white shadow-2xs">
              <FinancialBarChart
                data={barData}
                height={210}
                title="Đối Soát Thu Quỹ vs Chi Tiêu (6 Tháng)"
                subtitle="So sánh số tiền thu nộp thực tế và chi phí giải ngân"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: THỐNG KÊ THEO THÁNG / QUÝ / NĂM + XUẤT EXCEL / PDF */}
      {/* ========================================================================= */}
      {activeTab === "ung-ho" && <DonationsPanel />}

      {activeTab === "thong-ke" && <StatsPanel />}

      {/* FINANCIAL REPORT MODAL */}
      <FinancialReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} {...reportProps} />

      {/* CHI TIẾT / SỬA PHIẾU CHI */}
      <ExpenseDetailModal
        expenseId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(e) => {
          setDetailId(null);
          setEditing(e);
        }}
      />
      {editing && (
        <Portal>
          <div onClick={() => setEditing(null)} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5">
            <div className="flex min-h-full items-center justify-center">
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
                <ExpenseFormCard expense={editing} onClose={() => setEditing(null)} onSaved={(s) => setDetailId(s.id)} />
              </div>
            </div>
          </div>
        </Portal>
      )}
      <ReasonDialog
        open={!!rejectFor}
        onClose={() => setRejectFor(null)}
        icon={<X className="w-5 h-5" />}
        title="Từ chối phiếu chi"
        message={rejectFor ? `Phiếu ${rejectFor.voucherNo} — ${rejectFor.title} (${formatVND(rejectFor.amountVnd)}).` : null}
        confirmText="Từ chối phiếu"
        placeholder="Ví dụ: Thiếu hóa đơn, số tiền chưa khớp biên lai…"
        onConfirm={async (reason) => {
          await financeApi.decide(rejectFor!.id, "rejected", reason);
          await refreshFinance();
          showToast("success", `Đã từ chối phiếu ${rejectFor!.voucherNo}.`);
        }}
      />

      {/* THU QUỸ */}
      <PayModal memberId={payFor?.memberId ?? null} contributionId={payFor?.contributionId ?? null} onClose={() => setPayFor(null)} />
      <CellDialog
        row={cellFor?.row ?? null}
        cell={cellFor?.cell ?? null}
        onClose={() => setCellFor(null)}
        onPay={(memberId, contributionId) => setPayFor({ memberId, contributionId })}
        onPayQr={(row, cell) => setPayQrFor({ row, cell })}
      />
      <PayQrDialog
        open={!!payQrFor}
        onClose={() => setPayQrFor(null)}
        amountVnd={payQrFor?.cell.remainingVnd ?? 0}
        content={payQrFor ? duesTransferContent(payQrFor.cell.planCode, payQrFor.row.fullName, payQrFor.row.name) : ""}
        subtitle={payQrFor ? `${payQrFor.cell.planName} · ${formatVND(payQrFor.cell.remainingVnd)}` : undefined}
      />
      <QuickPayDialog target={quickPayFor} onClose={() => setQuickPayFor(null)} />
      <ClaimDialog target={claimFor} onClose={() => setClaimFor(null)} />
      <RemindDialog
        open={remindOpen || !!remindOne}
        onClose={() => {
          setRemindOpen(false);
          setRemindOne(null);
        }}
        plan={plan}
        owingCount={owingInPlan}
        only={remindOne}
      />
      <ReasonDialog
        open={!!undoFor}
        onClose={() => setUndoFor(null)}
        icon={<RotateCcw className="w-5 h-5" />}
        title="Hoàn tác “đã đóng”"
        message={
          undoFor
            ? (() => {
                const last = undoFor.cell.payments[undoFor.cell.payments.length - 1];
                return `Hủy phiếu thu ${last ? formatVND(last.totalVnd) : ""} của ${undoFor.row.fullName} (${undoFor.cell.planName}) bằng bút toán đảo — không xóa sổ cái. Khoản sẽ trở về “chưa đóng”.${
                  last && last.monthsCovered > 1 ? ` Phiếu này đóng gộp ${last.monthsCovered} khoản — mọi khoản trong phiếu đều trở về chưa đóng.` : ""
                }`;
              })()
            : null
        }
        confirmText="Hoàn tác"
        placeholder="Ví dụ: Báo nhầm người, chưa nhận được tiền…"
        onConfirm={async (reason) => {
          const last = undoFor!.cell.payments[undoFor!.cell.payments.length - 1];
          if (!last) throw new Error("Không tìm thấy phiếu thu để hoàn tác.");
          await financeApi.voidPayment(last.paymentId, reason);
          await refreshFinance();
          showToast("success", `Đã hoàn tác khoản đóng của ${undoFor!.row.name}.`);
        }}
      />
      <ReasonDialog
        open={!!rejectClaim}
        onClose={() => setRejectClaim(null)}
        icon={<X className="w-5 h-5" />}
        title="Từ chối báo đã đóng"
        message="Người báo sẽ nhận thông báo kèm lý do; khoản vẫn là chưa đóng."
        confirmText="Từ chối"
        placeholder="Ví dụ: Chưa nhận được tiền / chưa thấy chuyển khoản"
        onConfirm={async (reason) => {
          await financeApi.decideClaim(rejectClaim!.id, false, reason);
          await refreshFinance();
          showToast("success", "Đã từ chối yêu cầu.");
        }}
      />
      <DuesCycleModal open={duesOpen} onClose={() => setDuesOpen(false)} />
      <UtilityModal open={utilityOpen} onClose={() => setUtilityOpen(false)} />
      <ReasonDialog
        open={!!cancelPlanFor}
        onClose={() => setCancelPlanFor(null)}
        icon={<Ban className="w-5 h-5" />}
        title="Hủy kế hoạch thu"
        message={
          cancelPlanFor
            ? `“${cancelPlanFor.name}” chưa có ai nộp tiền. Hủy sẽ hủy toàn bộ khoản phải thu của kế hoạch này (giữ lại trong nhật ký); sau đó có thể lập lại.`
            : null
        }
        confirmText="Hủy kế hoạch"
        placeholder="Ví dụ: Nhập sai tổng hóa đơn điện nước"
        onConfirm={async (reason) => {
          await financeApi.cancelPlan(cancelPlanFor!.id, reason);
          setSelectedPlanId(null);
          await refreshFinance();
          showToast("success", `Đã hủy ${cancelPlanFor!.name}.`);
        }}
      />
    </div>
  );
}
