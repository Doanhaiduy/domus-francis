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
import { useSession } from "@/lib/session";
import { formatVND } from "@/lib/utils";
import { vnTodayIso } from "@/lib/events-format";
import { DashboardSkeleton, FeedItemSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { FinancialBarChart, ExpenseDonutChart, BarChartDataPoint, DonutDataPoint } from "@/components/ui/Charts";
import { useDutySummaryQ, useFinanceSummaryQ, useLatestAnnouncementsQ, useUnreadCount, useUpcomingEventsQ } from "@/lib/data/dashboard";
import { useOrgSettings } from "@/lib/data/settings";
import LiturgyTodayCard from "@/components/LiturgyTodayCard";
import SetupCard from "@/components/SetupCard";
import type { FinanceSummaryDto, PlanSummaryDto } from "@/lib/types/finance";

const GREETING: Record<string, string> = {
  house_head: "👑 — Chúc bạn một ngày phục vụ cộng đoàn đầy ân sủng!",
  treasurer: "💰 — Ngân quỹ minh bạch là niềm tin của cả nhà.",
  admin: "🛡️ — Hệ thống quản trị đang sẵn sàng.",
};
/** Số người chưa đóng xong một khoản (null khi người xem chỉ thấy khoản của mình). */
const owingCount = (p: PlanSummaryDto | null) => (p && p.totalCount !== null && p.paidCount !== null ? Math.max(0, p.totalCount - p.paidCount) : null);
const collectedPct = (p: PlanSummaryDto) => (p.expectedVnd > 0 ? Math.round((p.collectedVnd / p.expectedVnd) * 100) : 0);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const relTime = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 60 * 24) return `${Math.round(m / 60)} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

export default function HomePage() {
  const { isLoadingSkeleton, members, rooms, peopleLoading } = useApp();
  const { session, can } = useSession();
  const ready = !!session?.member;
  const financeQ = useFinanceSummaryQ(ready);
  const dutyQ = useDutySummaryQ(ready);
  const eventsQ = useUpcomingEventsQ(5, ready);
  const announcementsQ = useLatestAnnouncementsQ(5, ready);
  const finance = financeQ.data;
  const duty = dutyQ.data;
  const events = eventsQ.data;
  const announcements = announcementsQ.data;
  // Đang tải lần đầu (chưa có dữ liệu): hiện skeleton thay vì ô trống / "—"
  const finLoading = !ready || (financeQ.isLoading && !finance);
  const dutyLoading = !ready || (dutyQ.isLoading && !duty);
  const feedLoading = !ready || (announcementsQ.isLoading && !announcements) || (eventsQ.isLoading && !events);
  const unread = useUnreadCount(ready);
  const { org } = useOrgSettings();

  // Đồng hồ (giờ máy)
  const [currentTime, setCurrentTime] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
      setToday(now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(
    (): BarChartDataPoint[] => (finance?.last6Months ?? []).map((m) => ({ label: m.label, thu: m.incomeVnd, chi: m.expenseVnd })),
    [finance]
  );
  const donutData = useMemo(
    (): DonutDataPoint[] => (finance?.expenseByCategory ?? []).filter((c) => c.amountVnd > 0).map((c) => ({ label: c.name, value: c.amountVnd, color: c.color })),
    [finance]
  );
  const total6 = useMemo(
    () => (finance?.last6Months ?? []).reduce((a, m) => ({ thu: a.thu + m.incomeVnd, chi: a.chi + m.expenseVnd }), { thu: 0, chi: 0 }),
    [finance]
  );

  if (isLoadingSkeleton) {
    return <DashboardSkeleton />;
  }

  // Thu quỹ theo KỲ (quỹ định kỳ hiện tại) + tiền điện nước tháng gần nhất; người chỉ thấy khoản của mình ⇒ nói về khoản của mình
  const fin = finance as unknown as FinanceSummaryDto | undefined;
  const dues = fin?.contributions ?? null;
  const utility = fin?.utility ?? null;
  const mine = fin?.mine ?? null;
  const duesOwing = owingCount(dues);
  const utilityOwing = owingCount(utility);
  const duesLine = dues
    ? duesOwing !== null
      ? duesOwing > 0
        ? `Còn ${duesOwing} bạn chưa đóng ${dues.periodLabel}`
        : `Đã thu đủ ${dues.periodLabel}`
      : `${dues.periodLabel[0].toUpperCase()}${dues.periodLabel.slice(1)}: đã thu ${collectedPct(dues)}%`
    : null;
  const utilityLine = utility
    ? utilityOwing !== null
      ? utilityOwing > 0
        ? `${utility.periodLabel[0].toUpperCase()}${utility.periodLabel.slice(1)}: còn ${utilityOwing} bạn`
        : `${utility.periodLabel[0].toUpperCase()}${utility.periodLabel.slice(1)}: đã thu đủ`
      : null
    : null;
  const mineLine = mine && duesOwing === null ? (mine.items > 0 ? `Bạn còn ${mine.items} khoản chưa đóng (${formatVND(mine.outstandingVnd)})` : "Bạn đã đóng đủ các khoản") : null;
  // Trực vệ sinh sân nhà theo TUẦN (mỗi tuần 1–2 người)
  const thisWeek = duty?.thisWeek ?? null;
  const myNextWeek = duty?.myNextWeek ?? null;
  const weekRange = (w: { weekStart: string; weekEnd: string }) => `${w.weekStart.slice(8, 10)}/${w.weekStart.slice(5, 7)} – ${w.weekEnd.slice(8, 10)}/${w.weekEnd.slice(5, 7)}`;
  const bedTotal = rooms.filter((r) => r.type === "bedroom").reduce((a, r) => a + r.capacity, 0);
  const housed = members.filter((m) => rooms.some((r) => r.id === m.room && r.type === "bedroom")).length;
  const name = session?.member?.displayName ?? "";
  const greeting = `Chào ${session?.roleLabel && session.primaryRole !== "member" ? session.roleLabel + " " : "bạn "}${name} ${GREETING[session?.primaryRole ?? ""] ?? "👋 — Chúc bạn một ngày học tập nhiều niềm vui và bình an!"}`;

  // Dòng hoạt động: thông báo mới + sự kiện sắp tới (sắp theo thời gian)
  const feed = [
    ...(announcements ?? []).map((a) => ({ key: `a-${a.id}`, icon: "📢", href: "/thong-bao", title: a.title, meta: `${a.author ?? ""}${a.authorRole ? ` (${a.authorRole})` : ""} · ${relTime(a.createdAt)}`, tag: a.category, unread: a.isUnread, at: a.createdAt })),
    ...(events ?? []).map((e) => ({ key: `e-${e.id}`, icon: "📅", href: "/lich-su-kien", title: e.title, meta: `${fmtDate(e.startsAt)} · ${fmtTime(e.startsAt)}${e.location ? ` · ${e.location}` : ""}`, tag: e.category ?? undefined, unread: false, at: e.startsAt })),
  ].slice(0, 7);

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
            {greeting}
            {can("finance.expense.approve") && finance?.pendingApprovals ? ` Có ${finance.pendingApprovals} phiếu chi chờ duyệt.` : ""}
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
            <span className="capitalize">{today || "—"}</span>
          </div>
        </div>
      </div>

      {/* Admin/Trưởng nhà: nhắc hoàn tất thiết lập hệ thống mới */}
      <SetupCard />

      {/* Phụng vụ hôm nay + lễ lớn sắp tới */}
      <LiturgyTodayCard />

      {/* ROW 1: 3 STATISTIC METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Trực vệ sinh tuần này */}
        <div className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-100/60 rounded-full blur-2xl group-hover:bg-purple-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary shadow-xs">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-surface-container-low px-2 py-0.5 rounded-md">
                Tuần này
              </span>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">{thisWeek?.isMine ? "Tuần này bạn trực vệ sinh sân nhà" : "Trực vệ sinh sân nhà"}</span>
              {dutyLoading ? (
                <Skeleton className="w-44 h-7 mt-1.5" />
              ) : (
                <div className="text-xl font-bold text-gray-900 tracking-tight mt-0.5 truncate">
                  {thisWeek ? `Trực: ${thisWeek.members.join(" & ") || "—"}` : duty ? "Tuần này chưa xếp người trực" : "—"}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            {dutyLoading ? (
              <Skeleton className="w-32 h-3.5" />
            ) : (
              <span className="text-xs text-gray-600 flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {thisWeek ? `Tuần ${weekRange(thisWeek)}` : "Xem lịch trực các tuần"}
              </span>
            )}
            <Link href="/hau-can" className="text-[11px] font-bold text-primary hover:underline">
              Xem lịch
            </Link>
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
              {finLoading && <Skeleton className="w-28 h-5 rounded-md" />}
              {finance?.month && (
                <span className="text-[11px] text-secondary font-bold bg-secondary-fixed/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {finance.month.label}: {finance.month.incomeVnd - finance.month.expenseVnd >= 0 ? "+" : "−"}
                  {formatVND(Math.abs(finance.month.incomeVnd - finance.month.expenseVnd))}
                </span>
              )}
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Quỹ hiện tại</span>
              {finLoading ? (
                <Skeleton className="w-40 h-8 mt-1" />
              ) : (
                <div className="text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
                  {finance?.fundBalanceVnd != null ? formatVND(finance.fundBalanceVnd) : "—"}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            {finLoading ? (
              <Skeleton className="w-40 h-3.5" />
            ) : (
              <span className="text-xs text-secondary font-semibold min-w-0">
                {mineLine ?? duesLine ?? utilityLine ?? "Xem sổ quỹ"}
                {!mineLine && duesLine && utilityLine && <span className="block text-[10px] font-medium text-gray-500">{utilityLine}</span>}
              </span>
            )}
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
              {dutyLoading ? (
                <Skeleton className="w-24 h-5 rounded-md" />
              ) : (
                <span className="text-[11px] text-cyan-800 font-bold bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
                  {thisWeek?.score != null ? `Đã chấm ${thisWeek.score}/10` : thisWeek ? "Chưa đánh giá" : "Chưa xếp lịch"}
                </span>
              )}
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Trực nhật &amp; Vệ sinh</span>
              {dutyLoading ? (
                <Skeleton className="w-44 h-8 mt-1" />
              ) : (
                <div className="text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">
                  Tuần này <span className="text-base font-semibold text-gray-500">· {thisWeek?.members.length ?? 0} người trực</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            {dutyLoading ? (
              <Skeleton className="w-32 h-3.5" />
            ) : (
              <span className="text-xs text-gray-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                {!duty ? "—" : can("duty.review") && duty.pendingReviewsCount > 0 ? `${duty.pendingReviewsCount} tuần chờ đánh giá` : thisWeek?.redoRequired ? "Được yêu cầu trực lại" : "Vệ sinh sân nhà hằng tuần"}
              </span>
            )}
            <span className="text-xs text-primary font-bold">Xem lịch trực →</span>
          </div>
        </Link>

      </div>

      {/* FINANCIAL & OCCUPANCY VISUAL CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: 6-Month Cashflow Bar Chart */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 md:p-6 border border-purple-50 shadow-xs flex flex-col justify-between">
          {finLoading ? (
            <div className="space-y-3">
              <Skeleton className="w-64 h-5" />
              <Skeleton className="w-80 max-w-full h-3.5" />
              <Skeleton className="w-full h-[220px] rounded-2xl" />
            </div>
          ) : (
            <FinancialBarChart
              data={chartData}
              height={220}
              title="Biểu Đồ Thu - Chi Quỹ Lưu Xá (6 Tháng)"
              subtitle="So sánh tiền thu quỹ, điện nước và chi tiêu thực tế"
            />
          )}
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Tổng thu 6T: {finLoading ? <Skeleton className="w-20 h-3.5" /> : <b className="text-gray-900 font-mono">{formatVND(total6.thu)}</b>}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              Tổng chi 6T: {finLoading ? <Skeleton className="w-20 h-3.5" /> : <b className="text-gray-900 font-mono">{formatVND(total6.chi)}</b>}
            </span>
            <Link href="/thu-chi" className="text-primary font-bold hover:underline">
              Xem sổ quỹ →
            </Link>
          </div>
        </div>

        {/* Right: Expense Breakdown Donut Chart */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 md:p-6 border border-purple-50 shadow-xs flex flex-col justify-between">
          {finLoading ? (
            <div className="space-y-3">
              <Skeleton className="w-48 h-5" />
              <Skeleton className="w-56 max-w-full h-3.5" />
              <div className="flex items-center gap-5 pt-2">
                <Skeleton className="w-40 h-40 rounded-full shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <Skeleton className="w-full h-3.5" />
                  <Skeleton className="w-5/6 h-3.5" />
                  <Skeleton className="w-4/6 h-3.5" />
                </div>
              </div>
            </div>
          ) : (
            <ExpenseDonutChart
              data={donutData}
              size={160}
              title={`Cơ Cấu Chi Tiêu ${finance?.month?.label ?? "Tháng Này"}`}
              subtitle="Phân bổ hạng mục chi phí cộng đoàn"
            />
          )}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500 flex items-center gap-1.5">Đã chi trong tháng: {finLoading ? <Skeleton className="w-20 h-3.5" /> : <b className="text-gray-900">{finance?.month ? formatVND(finance.month.expenseVnd) : "—"}</b>}</span>
            <Link href="/thu-chi" className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
              Chi tiết sổ quỹ
            </Link>
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
                  {finLoading ? (
                    <Skeleton className="w-36 h-3 mt-1" />
                  ) : (
                    <p className="text-xs text-rose-600 font-semibold">
                      {mine && mine.items > 0 ? `Bạn còn ${mine.items} khoản chưa đóng` : duesOwing ? `Còn ${duesOwing} bạn chưa đóng quỹ kỳ` : "Sổ quỹ minh bạch"}
                    </p>
                  )}
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
                    Lịch &amp; Sự Kiện
                  </h3>
                  {feedLoading ? (
                    <Skeleton className="w-36 h-3 mt-1" />
                  ) : (
                    <p className="text-xs text-gray-500 truncate">
                      {events?.[0] ? `Sắp tới: ${events[0].title}` : "Chưa có sự kiện sắp tới"}
                    </p>
                  )}
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
                  {dutyLoading ? <Skeleton className="w-32 h-3 mt-1" /> : <p className="text-xs text-orange-600 font-semibold">{duty ? `${duty.openIssuesCount} sự cố đang xử lý` : "Báo hỏng thiết bị"}</p>}
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
                  <p className="text-xs text-gray-500">{org.nightPrayerTime ? `${org.nightPrayerTime} tối nay · Nguyện đường` : "Lịch phụng vụ & ý chỉ cầu nguyện"}</p>
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
                  <p className="text-xs text-rose-600 font-semibold">{unread ? `${unread.announcementsUnread} thông báo mới` : "Bảng tin cộng đoàn"}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>

          </div>

          {/* Sĩ số & chỗ ở (dữ liệu thật) */}
          <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center justify-between text-xs text-gray-700">
            <Link href="/so-do-nha" aria-label={peopleLoading ? "Xem sơ đồ nhà" : undefined} className="flex items-center gap-2 hover:text-primary">
              <Building2 className="w-4 h-4 text-primary shrink-0" />
              {peopleLoading ? (
                <Skeleton className="w-56 h-4" />
              ) : (
                <span>
                  Sĩ số: <b>{members.length} thành viên</b> · Chỗ ở: <b>{housed}/{bedTotal}</b> giường
                </span>
              )}
            </Link>
            <div className="flex -space-x-1.5">
              {members.slice(0, 3).map((m) => (
                <div key={m.id} className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white" title={m.fullName}>
                  {m.avatarText}
                </div>
              ))}
              {members.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[9px] font-bold ring-2 ring-white">+{members.length - 3}</div>
              )}
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
            {feedLoading && feed.length === 0 ? (
              <>
                <FeedItemSkeleton />
                <FeedItemSkeleton />
                <FeedItemSkeleton />
                <FeedItemSkeleton />
              </>
            ) : feed.length > 0 ? (
              feed.map((f) => (
                <Link key={f.key} href={f.href} className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xs shrink-0 mt-0.5">{f.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs line-clamp-1 group-hover:text-primary ${f.unread ? "font-bold text-gray-900" : "text-gray-900"}`}>{f.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-400 truncate">{f.meta}</span>
                      {f.tag && <span className="text-[10px] px-1.5 bg-gray-100 text-gray-600 rounded shrink-0">{f.tag}</span>}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-xs text-gray-500 py-3 text-center">Chưa có hoạt động mới</p>
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

      {/* NHẮC TUẦN TRỰC SẮP TỚI CỦA BẠN */}
      {myNextWeek && (
        <div className="p-4 sm:p-5 rounded-2xl bg-purple-100/60 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-bold shrink-0 shadow-sm shadow-purple-300">🔔</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900">{myNextWeek.weekStart <= vnTodayIso() ? "Tuần này bạn trực vệ sinh sân nhà" : "Tuần trực sắp tới của bạn"}</span>
                <span className="px-2 py-0.5 bg-purple-200 text-purple-900 text-[10px] font-extrabold rounded-md">Nhắc nhở</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                <b>Tuần {weekRange(myNextWeek)}</b> · cùng {myNextWeek.members.filter((n) => n !== session?.member?.displayName).join(" & ") || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Link href="/hau-can" className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white transition shadow-sm shadow-purple-200 flex items-center gap-1">
              <span>Xem phân công</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
