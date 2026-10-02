"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Wallet,
  UtensilsCrossed,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Sun,
  Timer,
  Wrench,
  Church,
  Bell,
  ArrowRight,
  Sparkles,
  Building2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { formatVND } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import {
  FinancialBarChart,
  ExpenseDonutChart,
  BarChartDataPoint,
  DonutDataPoint,
} from "@/components/ui/Charts";

const MONTHLY_FINANCIAL_DATA: BarChartDataPoint[] = [
  { label: "T5", thu: 4200000, chi: 3850000 },
  { label: "T6", thu: 4200000, chi: 4120000 },
  { label: "T7", thu: 4200000, chi: 3600000 },
  { label: "T8", thu: 4200000, chi: 3950000 },
  { label: "T9", thu: 4200000, chi: 4400000 },
  { label: "T10", thu: 3850000, chi: 2870000 },
];

const EXPENSE_CATEGORIES_DATA: DonutDataPoint[] = [
  { label: "Thực phẩm & Bếp", value: 1870000, color: "#f59e0b" },
  { label: "Điện, Nước & Net", value: 350000, color: "#3b82f6" },
  { label: "Vệ sinh & Hóa phẩm", value: 240000, color: "#10b981" },
  { label: "Phụng vụ & Lễ", value: 230000, color: "#8b5cf6" },
  { label: "Sửa chữa & Vật tư", value: 180000, color: "#ef4444" },
];

export default function HomePage() {
  const {
    fundBalance,
    contributions,
    expenses,
    mealAttendance,
    announcements,
    issues,
    cleaningDuties,
    openModal,
    currentRole,
    isLoadingSkeleton,
  } = useApp();

  // Real-time clock
  const [currentTime, setCurrentTime] = useState("");
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Dynamic chart data from store
  const dynamicChartData = useMemo((): BarChartDataPoint[] => {
    const monthMap: Record<string, { thu: number; chi: number }> = {};
    // Parse expense dates (format: DD/MM/YYYY)
    expenses.forEach(e => {
      const parts = e.date.split("/");
      const month = parts.length === 3 ? `T${parseInt(parts[1])}` : "T10";
      if (!monthMap[month]) monthMap[month] = { thu: 0, chi: 0 };
      monthMap[month].chi += e.amount;
    });
    // Add contributions
    contributions.filter(c => c.status === "Đã đóng").forEach(c => {
      const key = "T10";
      if (!monthMap[key]) monthMap[key] = { thu: 0, chi: 0 };
      monthMap[key].thu += c.amount;
    });
    const keys = Object.keys(monthMap).sort();
    if (keys.length >= 2) {
      return keys.map(label => ({ label, ...monthMap[label] }));
    }
    return MONTHLY_FINANCIAL_DATA;
  }, [contributions, expenses]);

  // Dynamic donut data from expenses
  const dynamicDonutData = useMemo((): DonutDataPoint[] => {
    const colors = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#ec4899", "#06b6d4"];
    const catMap: Record<string, number> = {};
    expenses.forEach(e => {
      const cat = e.category || "Khác";
      catMap[cat] = (catMap[cat] || 0) + e.amount;
    });
    const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (entries.length >= 2) {
      return entries.map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
    }
    return EXPENSE_CATEGORIES_DATA;
  }, [expenses]);

  // Recent expenses for activity feed
  const recentExpenses = useMemo(() => {
    return [...expenses]
      .sort((a, b) => {
        // Parse DD/MM/YYYY
        const parseDate = (s: string) => {
          const p = s.split("/");
          return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime() : 0;
        };
        return parseDate(b.date) - parseDate(a.date);
      })
      .slice(0, 4);
  }, [expenses]);

  if (isLoadingSkeleton) {
    return <DashboardSkeleton />;
  }

  const unpaidCount = contributions.filter((c) => c.status === "Chưa đóng").length;
  const eatingLunchCount = Object.values(mealAttendance).filter((m) => m.lunch).length;
  const unreadCount = announcements.filter((a) => a.isUnread).length;
  const pendingIssues = issues.filter((i) => i.status !== "Đã xong").length;
  const todayDuties = cleaningDuties.filter((d) => d.dayOfWeek === "Thứ Sáu" || d.dateStr === "02/10/2026");
  const doneDutiesCount = todayDuties.filter((d) => d.status === "approved" || d.status === "submitted").length;

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* GREETING & AMBIENT HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              Tổng quan
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              Cộng đoàn trực tuyến
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {currentRole === "Trưởng nhà"
              ? "Chào Trưởng nhà Văn Đức 👑 — Chúc bạn một ngày phục vụ cộng đoàn đầy ân sủng!"
              : currentRole === "Thủ quỹ"
              ? "Chào Thủ quỹ Gia Bảo 💰 — Ngân quỹ minh bạch, đang có 1 khoản chi chờ đối soát."
              : currentRole === "Phó nhà"
              ? "Chào Phó nhà Minh Tuấn 🏛️ — Lịch trực nhật và sơ đồ 16 phòng đang ổn định."
              : currentRole === "Admin"
              ? "Chào Admin Quốc Việt 🛡️ — Toàn bộ hệ thống 17 màn hình đang sẵn sàng."
              : "Chào bạn Minh Tuấn 👋 — Chúc bạn một ngày học tập nhiều niềm vui và bình an!"}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-2xl border border-purple-50 shadow-xs self-start md:self-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Clock className="w-4 h-4 text-primary" />
            <span className="font-bold text-gray-900">{currentTime || "—:——"}</span>
          </div>
          <div className="w-px h-3.5 bg-gray-200" />
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Sun className="w-4 h-4 text-amber-500" />
            <span>26°C · Bình an</span>
          </div>
        </div>
      </div>

      {/* ROW 1: 3 STATISTIC METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Duty Today */}
        <div className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-100/60 rounded-full blur-2xl group-hover:bg-purple-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary shadow-xs">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-surface-container-low px-2 py-0.5 rounded-md">
                Hôm nay
              </span>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Phân công nhiệm vụ</span>
              <div className="text-xl font-bold text-gray-900 tracking-tight mt-0.5">
                Trực: Tuấn &amp; Khôi
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            <span className="text-xs text-gray-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Trực cửa · Đình Khôi nấu ăn
            </span>
            <button
              onClick={() => openModal("swapDuty")}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Đổi ca
            </button>
          </div>
        </div>

        {/* Card 2: Fund Balance */}
        <Link
          href="/thu-chi"
          className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-100/60 rounded-full blur-2xl group-hover:bg-emerald-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-secondary-fixed flex items-center justify-center text-secondary shadow-xs">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="text-[11px] text-secondary font-bold bg-secondary-fixed/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                +12.5%
              </span>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Quỹ hiện tại</span>
              <div className="text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
                {formatVND(fundBalance)}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            <span className="text-xs text-secondary font-semibold">
              Còn {unpaidCount} bạn chưa đóng T10
            </span>
            <svg className="w-16 h-5 text-primary" fill="none" viewBox="0 0 64 20">
              <path d="M1 16L13 13L24 15L35 8L46 11L55 4L63 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </Link>

        {/* Card 3: Cleaning & House Duty */}
        <Link
          href="/hau-can"
          className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-cyan-100/60 rounded-full blur-2xl group-hover:bg-cyan-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 flex items-center justify-center text-cyan-700 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-[11px] text-cyan-800 font-bold bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
                {doneDutiesCount}/{todayDuties.length} ca hoàn thành
              </span>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Trực nhật &amp; Vệ sinh</span>
              <div className="text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
                Hôm nay <span className="text-base font-semibold text-gray-500">· {todayDuties.length} ca trực</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            <span className="text-xs text-gray-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Đã nghiệm thu ca sáng
            </span>
            <span className="text-xs text-primary font-bold">Check-in ngay →</span>
          </div>
        </Link>

      </div>

      {/* FINANCIAL & OCCUPANCY VISUAL CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: 6-Month Cashflow Bar Chart */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 md:p-6 border border-purple-50 shadow-xs flex flex-col justify-between">
          <FinancialBarChart
            data={dynamicChartData}
            height={220}
            title="Biểu Đồ Thu - Chi Quỹ Lưu Xá (6 Tháng)"
            subtitle="So sánh tiền đóng quỹ hàng tháng và chi tiêu thực tế"
          />
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Tổng thu 6T: <b className="text-gray-900 font-mono">24.850.000đ</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              Tổng chi 6T: <b className="text-gray-900 font-mono">22.790.000đ</b>
            </span>
            <Link href="/thu-chi" className="text-primary font-bold hover:underline">
              Xem sổ quỹ →
            </Link>
          </div>
        </div>

        {/* Right: Expense Breakdown Donut Chart */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 md:p-6 border border-purple-50 shadow-xs flex flex-col justify-between">
          <ExpenseDonutChart
            data={dynamicDonutData}
            size={160}
            title="Cơ Cấu Chi Tiêu Tháng 10"
            subtitle="Phân bổ hạng mục chi phí cộng đoàn"
          />
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">Đã giải ngân: <b className="text-gray-900">2.870.000đ</b></span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
              Trong định mức an toàn
            </span>
          </div>
        </div>
      </div>

      {/* ROW 2: MODULE SHORTCUTS & ACTIVITY FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT: 6 QUICK MODULES (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-base font-bold text-gray-900">Các mục trong nhà</h2>
              <p className="text-xs text-gray-500">Truy cập nhanh các phân hệ sinh hoạt lưu xá</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* 1. Trực Nhật & Hậu Cần */}
            <Link
              href="/hau-can"
              className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold">
                  🧹
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                    Trực Nhật &amp; Hậu Cần
                  </h3>
                  <p className="text-xs text-gray-500">Phân công vệ sinh &amp; Check-in</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

            {/* 2. Thu Chi */}
            <Link
              href="/thu-chi"
              className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  💳
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                    Thu Chi
                  </h3>
                  <p className="text-xs text-rose-600 font-semibold">Còn {unpaidCount} bạn chưa đóng</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

            {/* 3. Lịch Trực Nhà */}
            <Link
              href="/lich-su-kien"
              className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  🧹
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                    Lịch Trực Nhà
                  </h3>
                  <p className="text-xs text-gray-500">Hôm nay: Trực cửa &amp; Bếp</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

            {/* 4. Báo Hỏng */}
            <Link
              href="/hau-can"
              className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                  🔧
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                    Báo Hỏng
                  </h3>
                  <p className="text-xs text-orange-600 font-semibold">{pendingIssues} sự cố đang xử lý</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

            {/* 5. Giờ Kinh Tối */}
            <Link
              href="/phung-vu"
              className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  📖
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                    Giờ Kinh Tối
                  </h3>
                  <p className="text-xs text-gray-500">20:30 tối nay · Nguyện đường</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

            {/* 6. Bảng Tin */}
            <Link
              href="/thong-bao"
              className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  📢
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                    Bảng Tin
                  </h3>
                  <p className="text-xs text-rose-600 font-semibold">{unreadCount} thông báo mới</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

          </div>

          {/* Quick Presence Status */}
          <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center justify-between text-xs text-gray-700">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary shrink-0" />
              <span>Hiện diện phòng sinh hoạt: <b>Khu A: 100% · Khu B: 85% có mặt</b></span>
            </div>
            <div className="flex -space-x-1.5">
              <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white">T</div>
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white">K</div>
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white">H</div>
              <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[9px] font-bold ring-2 ring-white">+9</div>
            </div>
          </div>
        </div>

        {/* RIGHT: REALTIME ACTIVITY FEED (5 COLS) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Hoạt động gần đây</h2>
              <p className="text-xs text-gray-500">Dòng sự kiện cập nhật theo thời gian thực</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>

          <div className="space-y-3.5">
            {recentExpenses.length > 0 ? (
              recentExpenses.map((exp) => (
                <div key={exp.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
                    💳
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-900 line-clamp-1">
                      <b>{exp.paidBy}</b> đã chi: {exp.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-semibold text-rose-600">
                        -{formatVND(exp.amount)}
                      </span>
                      <span className="text-[11px] text-gray-400">· {exp.date}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                        {exp.category}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 py-3 text-center">Chưa có chi tiêu gần đây</p>
            )}
          </div>

          <Link
            href="/thong-bao"
            className="w-full py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-bold text-gray-700 text-center transition"
          >
            Xem tất cả nhật ký nhà →
          </Link>
        </div>

      </div>

      {/* BOTTOM REMINDER BANNER */}
      <div className="p-4 sm:p-5 rounded-2xl bg-purple-100/60 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-bold shrink-0 shadow-sm shadow-purple-300">
            🔔
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900">Lịch trực ngày mai của bạn!</span>
              <span className="px-2 py-0.5 bg-purple-200 text-purple-900 text-[10px] font-extrabold rounded-md">
                Nhắc nhở
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Bạn có lịch <b>trực bếp vào ngày mai (Thứ Sáu, 2/10)</b>. Hãy chuẩn bị thực đơn cùng nhóm trước 21:00 tối nay nhé!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => openModal("swapDuty")}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition"
          >
            Báo đổi ca
          </button>
          <Link
            href="/lich-su-kien"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white transition shadow-sm shadow-purple-200 flex items-center gap-1"
          >
            <span>Xem phân công</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

    </div>
  );
}
