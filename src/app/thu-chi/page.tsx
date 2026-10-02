"use client";

import React, { useState, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Filter,
  Search,
  Download,
  FileDown,
  Receipt,
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  ShieldAlert,
  Calendar,
  Sparkles,
  Copy,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  RotateCcw,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { formatVND } from "@/lib/utils";
import ThuChiLoading from "./loading";
import { CustomInput, CustomSelect, CustomDatePicker } from "@/components/ui/FormControls";
import {
  FinancialBarChart,
  ExpenseDonutChart,
  AreaTrendChart,
  BarChartDataPoint,
  DonutDataPoint,
  AreaDataPoint,
} from "@/components/ui/Charts";
import FinancialReportModal from "@/components/FinancialReportModal";
import { formatFinancialReportForZalo, copyTextToClipboard } from "@/lib/zaloShare";
import { Contribution } from "@/lib/mockData";

const SIX_MONTH_BARS: BarChartDataPoint[] = [
  { label: "T5", thu: 4200000, chi: 3850000 },
  { label: "T6", thu: 4200000, chi: 4120000 },
  { label: "T7", thu: 4200000, chi: 3600000 },
  { label: "T8", thu: 4200000, chi: 3950000 },
  { label: "T9", thu: 4200000, chi: 4400000 },
  { label: "T10", thu: 3850000, chi: 2870000 },
];

const SIX_MONTH_TREND: AreaDataPoint[] = [
  { label: "Tháng 5", value: 6500000 },
  { label: "Tháng 6", value: 6850000 },
  { label: "Tháng 7", value: 7450000 },
  { label: "Tháng 8", value: 7700000 },
  { label: "Tháng 9", value: 8750000 },
  { label: "Tháng 10", value: 9730000 },
];

const MONTH_ORDER = ["08/2026", "09/2026", "10/2026"];

function parseVNDate(dStr: string): Date | null {
  const parts = dStr.split("/");
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  }
  return null;
}

export default function ThuChiPage() {
  const {
    fundBalance,
    contributions,
    expenses,
    toggleContribution,
    openModal,
    showToast,
    currentRole,
    isLoadingSkeleton,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"tong-quan" | "danh-sach" | "bao-cao">("tong-quan");
  const [filterPaid, setFilterPaid] = useState<"all" | "unpaid" | "paid">("unpaid");
  const [contributionSearch, setContributionSearch] = useState("");

  // PERIOD CONTROLS (THEO THÁNG HOẶC KHOẢNG NGÀY)
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [selectedMonth, setSelectedMonth] = useState<string>("10/2026");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Expenses Tab Filter States
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("Tất cả");
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>("Tất cả");
  const [expenseDateFilter, setExpenseDateFilter] = useState("");

  const canManageFinances = ["Trưởng nhà", "Thủ quỹ", "Admin"].includes(currentRole);

  // PERIOD LABEL
  const periodLabel = useMemo(() => {
    if (periodMode === "month") {
      if (selectedMonth === "all") return "Toàn bộ các tháng";
      const [m, y] = selectedMonth.split("/");
      return `Tháng ${m}, ${y}`;
    } else {
      if (startDate && endDate) {
        const s = startDate.split("-").reverse().join("/");
        const e = endDate.split("-").reverse().join("/");
        return `${s} – ${e}`;
      }
      if (startDate) return `Từ ngày ${startDate.split("-").reverse().join("/")}`;
      if (endDate) return `Đến ngày ${endDate.split("-").reverse().join("/")}`;
      return "Khoảng ngày tùy chọn";
    }
  }, [periodMode, selectedMonth, startDate, endDate]);

  // FILTERED EXPENSES FOR CURRENT PERIOD
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = parseVNDate(e.date);
      if (!d) return true;
      if (periodMode === "month") {
        if (selectedMonth === "all") return true;
        const [m, y] = selectedMonth.split("/").map(Number);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      } else {
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (d < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
        return true;
      }
    });
  }, [expenses, periodMode, selectedMonth, startDate, endDate]);

  // PERIOD CONTRIBUTIONS
  const periodContributions: Contribution[] = useMemo(() => {
    if (periodMode === "month" && (selectedMonth === "09/2026" || selectedMonth === "08/2026")) {
      // Past months were 100% paid
      return contributions.map((c) => ({
        ...c,
        status: "Đã đóng" as const,
        paidDate: `02/${selectedMonth.split("/")[0]}`,
      }));
    }
    return contributions;
  }, [contributions, periodMode, selectedMonth]);

  const paidList = useMemo(() => periodContributions.filter((c) => c.status === "Đã đóng"), [periodContributions]);
  const unpaidList = useMemo(() => periodContributions.filter((c) => c.status === "Chưa đóng"), [periodContributions]);

  const periodCollected = useMemo(() => paidList.reduce((sum, c) => sum + c.amount, 0), [paidList]);
  const periodUnpaid = useMemo(() => unpaidList.reduce((sum, c) => sum + c.amount, 0), [unpaidList]);
  const periodSpent = useMemo(() => periodExpenses.reduce((sum, e) => sum + e.amount, 0), [periodExpenses]);

  // DYNAMIC FUND BALANCE FOR PERIOD
  const currentPeriodBalance = useMemo(() => {
    if (selectedMonth === "09/2026") return 9730000;
    if (selectedMonth === "08/2026") return 7700000;
    return fundBalance;
  }, [selectedMonth, fundBalance]);

  // DYNAMIC DONUT BREAKDOWN
  const dynamicExpenseDonut: DonutDataPoint[] = useMemo(() => {
    const cats: Record<string, { val: number; color: string }> = {
      "Thực phẩm": { val: 0, color: "#f59e0b" },
      "Điện nước": { val: 0, color: "#3b82f6" },
      "Vệ sinh": { val: 0, color: "#10b981" },
      "Phụng vụ": { val: 0, color: "#8b5cf6" },
      "Sửa chữa": { val: 0, color: "#ef4444" },
      "Khác": { val: 0, color: "#6b7280" },
    };

    periodExpenses.forEach((e) => {
      if (cats[e.category]) {
        cats[e.category].val += e.amount;
      }
    });

    const points = Object.entries(cats)
      .filter(([_, v]) => v.val > 0)
      .map(([k, v]) => ({
        label: k === "Thực phẩm" ? "Thực phẩm & Bếp" : k,
        value: v.val,
        color: v.color,
      }));

    return points.length > 0
      ? points
      : [{ label: "Chưa có phát sinh", value: 1, color: "#e5e7eb" }];
  }, [periodExpenses]);

  // Filtered Contributions with Search
  const displayedContributions = useMemo(() => {
    let list =
      filterPaid === "unpaid"
        ? unpaidList
        : filterPaid === "paid"
        ? paidList
        : periodContributions;
    if (contributionSearch.trim()) {
      const q = contributionSearch.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.room.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filterPaid, unpaidList, paidList, periodContributions, contributionSearch]);

  // Filtered Expenses for Tab 2
  const filteredExpenses = useMemo(() => {
    return periodExpenses.filter((e) => {
      const matchSearch =
        e.name.toLowerCase().includes(expenseSearch.toLowerCase()) ||
        e.paidBy.toLowerCase().includes(expenseSearch.toLowerCase()) ||
        (e.note && e.note.toLowerCase().includes(expenseSearch.toLowerCase()));
      const matchCategory =
        expenseCategoryFilter === "Tất cả" || e.category === expenseCategoryFilter;
      const matchStatus =
        expenseStatusFilter === "Tất cả" || e.status === expenseStatusFilter;
      const matchDate =
        !expenseDateFilter || e.date.includes(expenseDateFilter);

      return matchSearch && matchCategory && matchStatus && matchDate;
    });
  }, [periodExpenses, expenseSearch, expenseCategoryFilter, expenseStatusFilter, expenseDateFilter]);

  const filteredExpensesTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // QUICK COPY ZALO ACTION
  const handleCopyZalo = async () => {
    const text = formatFinancialReportForZalo({
      periodLabel,
      fundBalance: currentPeriodBalance,
      totalCollected: periodCollected,
      totalSpent: periodSpent,
      totalUnpaid: periodUnpaid,
      unpaidMembers: unpaidList,
      recentExpenses: periodExpenses,
    });
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", "Đã sao chép báo cáo Zalo! Bạn có thể dán (Ctrl+V) ngay vào nhóm chat.");
    } else {
      showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
    }
  };

  // STEPPING MONTHS
  const handleStepMonth = (direction: -1 | 1) => {
    const currentIndex = MONTH_ORDER.indexOf(selectedMonth);
    if (currentIndex === -1) {
      setSelectedMonth("10/2026");
      return;
    }
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < MONTH_ORDER.length) {
      setSelectedMonth(MONTH_ORDER[nextIndex]);
    }
  };

  if (isLoadingSkeleton) {
    return <ThuChiLoading />;
  }

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
            Thu Chi &amp; Tài Chính
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý dòng tiền quỹ sinh hoạt chung Lưu Xá Phanxicô minh bạch &amp; chuẩn xác
          </p>
        </div>

        {/* TOP QUICK ACTIONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyZalo}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs transition active:scale-95 shadow-2xs"
            title="Sao chép báo cáo thu chi đầy đủ gửi nhóm Zalo Lưu Xá"
          >
            <Copy className="w-3.5 h-3.5 text-primary" />
            <span>Copy Zalo</span>
          </button>

          <button
            onClick={() => setIsReportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-purple-200 hover:bg-purple-50 text-gray-800 font-bold text-xs transition active:scale-95 shadow-2xs"
            title="Tải bản Báo cáo quyết toán thu chi (file PDF chuẩn A4)"
          >
            <FileDown className="w-3.5 h-3.5 text-primary" />
            <span>Tải Báo Cáo PDF</span>
          </button>

          {canManageFinances ? (
            <button
              onClick={() => openModal("addExpense")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Ghi chi tiêu</span>
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
        {/* LEFT: MODE TOGGLE */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
            <button
              onClick={() => setPeriodMode("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                periodMode === "month"
                  ? "bg-white text-primary shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Theo Tháng</span>
            </button>
            <button
              onClick={() => setPeriodMode("range")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                periodMode === "range"
                  ? "bg-white text-primary shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
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
        </div>

        {/* RIGHT: CONTROLS ACCORDING TO MODE */}
        <div className="flex flex-wrap items-center gap-2">
          {periodMode === "month" ? (
            <div className="flex items-center gap-1.5">
              {/* PREV MONTH STEPPER */}
              <button
                onClick={() => handleStepMonth(-1)}
                disabled={selectedMonth === MONTH_ORDER[0]}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* MONTH SELECT */}
              <div className="w-48">
                <CustomSelect
                  value={selectedMonth}
                  onChange={(val) => setSelectedMonth(val)}
                  options={[
                    { value: "10/2026", label: "Tháng 10, 2026 (Hiện tại)" },
                    { value: "09/2026", label: "Tháng 09, 2026" },
                    { value: "08/2026", label: "Tháng 08, 2026" },
                    { value: "all", label: "Tất cả các tháng" },
                  ]}
                  placeholder="Chọn tháng"
                />
              </div>

              {/* NEXT MONTH STEPPER */}
              <button
                onClick={() => handleStepMonth(1)}
                disabled={selectedMonth === MONTH_ORDER[MONTH_ORDER.length - 1]}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* RESET CURRENT MONTH BUTTON */}
              {selectedMonth !== "10/2026" && (
                <button
                  onClick={() => setSelectedMonth("10/2026")}
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
                <CustomDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Từ ngày..."
                  format="YYYY-MM-DD"
                />
              </div>

              <span className="text-gray-400 text-xs font-bold">→</span>

              <div className="w-36">
                <CustomDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Đến ngày..."
                  format="YYYY-MM-DD"
                />
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

      {/* ROLE BANNER FOR MEMBERS */}
      {!canManageFinances && (
        <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary shrink-0" />
            <span>
              <b>Chế độ xem tài chính công khai (Vai trò: {currentRole})</b>: Toàn bộ thành viên có quyền giám sát chứng từ, phiếu chi và số dư quỹ. Quyền ghi chi tiêu và duyệt chi chỉ áp dụng cho Thủ quỹ và Trưởng nhà.
            </span>
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-2 border-b border-purple-50 pb-2">
        <button
          onClick={() => setActiveTab("tong-quan")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "tong-quan"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-surface-container-low"
          }`}
        >
          Tổng quan
        </button>
        <button
          onClick={() => setActiveTab("danh-sach")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "danh-sach"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-surface-container-low"
          }`}
        >
          Danh sách chi tiêu ({periodExpenses.length})
        </button>
        <button
          onClick={() => setActiveTab("bao-cao")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "bao-cao"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-surface-container-low"
          }`}
        >
          Báo cáo &amp; Biểu đồ
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TỔNG QUAN */}
      {/* ========================================================================= */}
      {activeTab === "tong-quan" && (
        <>
          {/* ROW 1: 4 STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Tồn quỹ kỳ này ({periodLabel})</span>
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  🏛️
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-gray-900">
                  {formatVND(currentPeriodBalance)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-primary font-bold mt-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Tích lũy an toàn (+12.5%)</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Đã thu trong kỳ</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  💰
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-gray-900">
                  {formatVND(periodCollected)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold mt-2">
                  <span>{paidList.length}/12 thành viên</span>
                  <span className="text-[10px] text-gray-400">· {Math.round((paidList.length / 12) * 100)}% chỉ tiêu</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Đã chi trong kỳ</span>
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  🛒
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-gray-900">
                  {formatVND(periodSpent)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-primary font-bold mt-2">
                  <span>{periodExpenses.length} khoản chi</span>
                  <span className="text-[10px] text-gray-400">· Trong định mức</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Chưa thu trong kỳ</span>
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  ⏳
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-rose-600">
                  {formatVND(periodUnpaid)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 font-bold mt-2">
                  <span>{unpaidList.length} thành viên</span>
                  <span className="text-[10px] text-gray-400">
                    · {unpaidList.length === 0 ? "100% hoàn tất" : "Hạn chót: 05/" + (selectedMonth.includes("/") ? selectedMonth.split("/")[0] : "10")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* VISUAL CHARTS ROW IN OVERVIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs">
              <FinancialBarChart
                data={SIX_MONTH_BARS}
                height={220}
                title="Dòng Tiền Thu - Chi 6 Tháng Gần Nhất"
                subtitle="Thu từ quỹ sinh hoạt huynh đệ so với thực chi các tháng"
              />
            </div>
            <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col justify-between">
              <AreaTrendChart
                data={SIX_MONTH_TREND}
                height={190}
                title="Tăng Trưởng Số Dư Quỹ Lưu Xá"
                subtitle="Biến động số dư tích lũy sau đối soát từng tháng"
              />
            </div>
          </div>

          {/* ROW 3: CONTRIBUTIONS & RECENT EXPENSES */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: MONTHLY CONTRIBUTION TABLE (7 COLS) */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Đóng quỹ tháng 10</h2>
                  <p className="text-xs text-gray-500">Mức đóng cố định 350.000đ / thành viên / tháng</p>
                </div>

                <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
                  <button
                    onClick={() => setFilterPaid("unpaid")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterPaid === "unpaid" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                    }`}
                  >
                    Chưa đóng ({unpaidList.length})
                  </button>
                  <button
                    onClick={() => setFilterPaid("paid")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterPaid === "paid" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                    }`}
                  >
                    Đã đóng ({paidList.length})
                  </button>
                  <button
                    onClick={() => setFilterPaid("all")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterPaid === "all" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                    }`}
                  >
                    Tất cả (12)
                  </button>
                </div>
              </div>

              {/* SEARCH FILTER FOR CONTRIBUTIONS */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contributionSearch}
                  onChange={(e) => setContributionSearch(e.target.value)}
                  placeholder="Lọc tên anh em, số phòng (vd: Minh Tuấn, P.101)..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none transition"
                />
              </div>

              {/* TABLE OF MEMBERS */}
              <div className="overflow-x-auto">
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
                    {displayedContributions.map((c) => {
                      const isPaid = c.status === "Đã đóng";

                      return (
                        <tr key={c.memberId} className="hover:bg-purple-50/40 transition">
                          <td className="py-3 pl-1">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-purple-100 text-primary font-bold text-xs flex items-center justify-center">
                                {c.name.split(" ").slice(-1)[0].substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-gray-900">{c.name}</div>
                                <div className="text-[11px] text-gray-400">{c.room}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 font-bold text-gray-900">{formatVND(c.amount)}</td>
                          <td className="py-3 text-gray-500">
                            {isPaid ? (
                              <span className="text-[11px] text-emerald-600 font-medium">
                                Đã nộp {c.paidDate || "1/10"}
                              </span>
                            ) : (
                              <span className="text-[11px] text-amber-600 font-medium">{c.deadline}</span>
                            )}
                          </td>
                          <td className="py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="py-3 text-right pr-1">
                            {canManageFinances ? (
                              <button
                                onClick={() => toggleContribution(c.memberId)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                  isPaid
                                    ? "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {isPaid ? "Hủy đóng" : "Thu tiền"}
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400">Chỉ xem</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT: RECENT EXPENSES LIST (5 COLS) */}
            <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">Chi tiêu gần đây</h2>
                <button
                  onClick={() => setActiveTab("danh-sach")}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Xem tất cả →
                </button>
              </div>

              <div className="space-y-3">
                {expenses.slice(0, 5).map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low/50 border border-purple-50 hover:bg-surface-container-low transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                        🛒
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900">{exp.name}</div>
                        <div className="text-[11px] text-gray-400">
                          {exp.date} · {exp.paidBy} ({exp.category})
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-extrabold text-rose-600">
                      -{formatVND(exp.amount)}
                    </div>
                  </div>
                ))}
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
              <h2 className="text-base font-bold text-gray-900">Sổ cái chi tiêu sinh hoạt</h2>
              <p className="text-xs text-gray-500">
                Toàn bộ chứng từ, phiếu chi giải ngân cho hoạt động lưu xá
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100">
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
                placeholder="Tìm khoản chi, người thanh toán, ghi chú..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl text-xs font-semibold">
              {["Tất cả", "Đã duyệt", "Chờ duyệt"].map((st) => (
                <button
                  key={st}
                  onClick={() => setExpenseStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg transition ${
                    expenseStatusFilter === st
                      ? "bg-white text-gray-900 shadow-2xs font-bold"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Date filter */}
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
            {["Tất cả", "Thực phẩm", "Điện nước", "Vệ sinh", "Sửa chữa", "Phụng vụ", "Khác"].map((cat) => (
              <button
                key={cat}
                onClick={() => setExpenseCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  expenseCategoryFilter === cat
                    ? "bg-primary text-white shadow-2xs font-bold"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* TABLE OF EXPENSES */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase text-[10px]">
                  <th className="pb-3 pl-2">Mã / Ngày</th>
                  <th className="pb-3">Tên khoản chi</th>
                  <th className="pb-3">Phân loại</th>
                  <th className="pb-3">Người thanh toán</th>
                  <th className="pb-3">Ghi chú</th>
                  <th className="pb-3 text-right">Số tiền</th>
                  <th className="pb-3 text-center pr-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-purple-50/40 transition">
                    <td className="py-3 pl-2 font-mono text-[11px] text-gray-500">
                      <div>#{exp.id}</div>
                      <div className="text-[10px] text-gray-400">{exp.date}</div>
                    </td>
                    <td className="py-3 font-bold text-gray-900">{exp.name}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 text-gray-700 font-medium">{exp.paidBy}</td>
                    <td className="py-3 text-gray-400 text-[11px] max-w-[180px] truncate">
                      {exp.note || "—"}
                    </td>
                    <td className="py-3 text-right font-extrabold text-rose-600">
                      -{formatVND(exp.amount)}
                    </td>
                    <td className="py-3 text-center pr-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          exp.status === "Đã duyệt"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {exp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BÁO CÁO THÁNG & BIỂU ĐỒ */}
      {/* ========================================================================= */}
      {activeTab === "bao-cao" && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-purple-50 shadow-xs flex flex-col gap-6">
          {/* REPORT HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">
                Báo cáo tài chính nội bộ &amp; Biểu đồ thống kê
              </div>
              <h2 className="text-xl font-extrabold text-gray-900">
                Tổng Kết Quỹ &amp; Phân Tích {periodLabel}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Kỳ đối soát: {periodLabel} · Thủ quỹ: Phạm Gia Bảo (P.103)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyZalo}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                <span>Copy Zalo</span>
              </button>
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

          {/* KEY FINANCIAL SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50">
              <span className="text-xs text-gray-400 font-medium">Số dư đầu kỳ</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                {selectedMonth === "08/2026" ? "6.850.000đ" : selectedMonth === "09/2026" ? "7.700.000đ" : "8.750.000đ"}
              </div>
              <span className="text-[10px] text-gray-500 mt-1 block">Chuyển từ kỳ trước</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
              <span className="text-xs text-emerald-800 font-medium">Tổng thu quỹ</span>
              <div className="text-xl font-extrabold text-emerald-700 mt-1">+{formatVND(periodCollected)}</div>
              <span className="text-[10px] text-emerald-600 mt-1 block">{paidList.length}/12 thành viên đã nộp</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100">
              <span className="text-xs text-rose-800 font-medium">Tổng giải ngân</span>
              <div className="text-xl font-extrabold text-rose-600 mt-1">-{formatVND(periodSpent)}</div>
              <span className="text-[10px] text-rose-500 mt-1 block">{periodExpenses.length} khoản đã duyệt</span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100">
              <span className="text-xs text-purple-800 font-medium">Số dư kết chuyển</span>
              <div className="text-xl font-extrabold text-primary mt-1">{formatVND(currentPeriodBalance)}</div>
              <span className="text-[10px] text-primary font-bold mt-1 block">Quỹ an toàn</span>
            </div>
          </div>

          {/* CHARTS IN REPORT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 border border-purple-100 rounded-3xl p-5 bg-white shadow-2xs">
              <ExpenseDonutChart
                data={dynamicExpenseDonut}
                size={170}
                title={`Cơ Cấu Chi Phí (${periodLabel})`}
                subtitle="Tỷ trọng chi tiêu giữa các danh mục sinh hoạt thực tế"
              />
            </div>
            <div className="lg:col-span-6 border border-purple-100 rounded-3xl p-5 bg-white shadow-2xs">
              <FinancialBarChart
                data={SIX_MONTH_BARS}
                height={210}
                title="Đối Soát Thu Quỹ vs Chi Tiêu (6 Tháng)"
                subtitle="So sánh số tiền thu nộp thực tế và chi phí giải ngân"
              />
            </div>
          </div>
        </div>
      )}

      {/* FINANCIAL REPORT MODAL */}
      <FinancialReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        periodLabel={periodLabel}
        fundBalance={currentPeriodBalance}
        expenses={periodExpenses}
        contributions={periodContributions}
      />
    </div>
  );
}
