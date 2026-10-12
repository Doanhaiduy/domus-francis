"use client";

// Trang Tổng quan (app/page.tsx chỉ đặt tiêu đề trang rồi dựng thành phần này).
// Thứ tự: lời chào → "Việc của tôi hôm nay" (mọi thành viên) → "Việc cần xử lý" (người quản lý) → "Bắt đầu với Lưu Xá" (thành viên mới /
// chưa xong) → nhắc thiết lập hệ thống (Admin) → phụng vụ hôm nay → 3 thẻ số liệu → biểu đồ thu chi (người quản lý tài chính; thành viên
// thường thu gọn, bấm để mở) → lối tắt các phân hệ + hoạt động gần đây.
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Building2, CalendarDays, ChevronDown, Clock, Sparkles, Sun, TrendingUp, Wallet } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { cn, formatVND } from "@/lib/utils";
import { DashboardSkeleton, FeedItemSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { FinancialBarChart, ExpenseDonutChart, type BarChartDataPoint, type DonutDataPoint } from "@/components/ui/Charts";
import { useDutySummaryQ, useFinanceSummaryQ, useLatestAnnouncementsQ, useUnreadCount, useUpcomingEventsQ } from "@/lib/data/dashboard";
import { useOrgSettings } from "@/lib/data/settings";
import { useInbox } from "@/lib/data/inbox";
import LiturgyTodayCard from "@/components/LiturgyTodayCard";
import SetupCard from "@/components/SetupCard";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { MyTodayCard } from "./MyTodayCard";
import { InboxCard } from "./InboxCard";
import type { FinanceSummaryDto, PlanSummaryDto } from "@/lib/types/finance";

const GREETING: Record<string, string> = {
  house_head: "👑 — Chúc bạn một ngày phục vụ cộng đoàn đầy ân sủng!",
  treasurer: "💰 — Ngân quỹ minh bạch là niềm tin của cả nhà.",
  admin: "🛡️ — Hệ thống quản trị đang sẵn sàng.",
};
/** Quyền làm "người quản lý tài chính" — thấy biểu đồ thu chi mở sẵn trên Tổng quan. */
const FINANCE_MANAGER_PERMS = ["finance.ledger.read", "finance.expense.approve", "finance.contribution.record", "finance.contribution.plan.manage"];
const CHARTS_OPEN_KEY = "luuxa-home-finance-charts";

/** Số người chưa đóng xong một khoản (null khi người xem chỉ thấy khoản của mình). */
const owingCount = (p: PlanSummaryDto | null) => (p && p.totalCount !== null && p.paidCount !== null ? Math.max(0, p.totalCount - p.paidCount) : null);
const collectedPct = (p: PlanSummaryDto) => (p.expectedVnd > 0 ? Math.round((p.collectedVnd / p.expectedVnd) * 100) : 0);
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const relTime = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 60 * 24) return `${Math.round(m / 60)} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
};
const weekRange = (w: { weekStart: string; weekEnd: string }) => `${w.weekStart.slice(8, 10)}/${w.weekStart.slice(5, 7)} – ${w.weekEnd.slice(8, 10)}/${w.weekEnd.slice(5, 7)}`;

const shortcut = "p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all border border-purple-50 flex items-center justify-between group";

export default function HomeDashboard() {
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
  const finLoading = !ready || (financeQ.isLoading && !finance);
  const dutyLoading = !ready || (dutyQ.isLoading && !duty);
  const feedLoading = !ready || (announcementsQ.isLoading && !announcements) || (eventsQ.isLoading && !events);
  const eventsLoading = !ready || (eventsQ.isLoading && !events);
  const unread = useUnreadCount(ready);
  const { org } = useOrgSettings();
  const inbox = useInbox(ready);
  const financeManager = can(FINANCE_MANAGER_PERMS);

  // Biểu đồ thu chi: người quản lý tài chính luôn mở; thành viên thường thu gọn, tự mở (nhớ trên máy này)
  const [chartsOpen, setChartsOpen] = useState(false);
  useEffect(() => {
    try {
      setChartsOpen(localStorage.getItem(CHARTS_OPEN_KEY) === "1");
    } catch {
      /* bỏ qua */
    }
  }, []);
  const toggleCharts = () =>
    setChartsOpen((v) => {
      try {
        localStorage.setItem(CHARTS_OPEN_KEY, v ? "0" : "1");
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  const showCharts = financeManager || chartsOpen;

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
      : `${capFirst(dues.periodLabel)}: đã thu ${collectedPct(dues)}%`
    : null;
  const utilityLine = utility
    ? utilityOwing !== null
      ? utilityOwing > 0
        ? `${capFirst(utility.periodLabel)}: còn ${utilityOwing} bạn`
        : `${capFirst(utility.periodLabel)}: đã thu đủ`
      : null
    : null;
  const mineLine = mine && duesOwing === null ? (mine.items > 0 ? `Bạn còn ${mine.items} khoản chưa đóng (${formatVND(mine.outstandingVnd)})` : "Bạn đã đóng đủ các khoản") : null;

  // Trực vệ sinh sân nhà theo TUẦN (mỗi tuần 1–2 người) — "tuần trực của tôi" nằm ở thẻ Việc của tôi hôm nay
  const thisWeek = duty?.thisWeek ?? null;
  const reviewPending = inbox.countOf("duty_review");
  const dutyStatus = !duty
    ? null
    : reviewPending > 0
      ? `${reviewPending} tuần chờ đánh giá`
      : thisWeek?.redoRequired
        ? "Được yêu cầu trực lại"
        : thisWeek?.score != null
          ? `Đã chấm ${thisWeek.score}/10`
          : thisWeek
            ? `Tuần ${weekRange(thisWeek)}`
            : "Xem lịch trực các tuần";
  const nextEvent = events?.[0] ?? null;

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
    <div className="flex flex-col w-full gap-5 sm:gap-6">
      {/* LỜI CHÀO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Tổng quan</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              Cộng đoàn trực tuyến
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{greeting}</p>
        </div>

        <div className="hidden sm:flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-2xl border border-purple-50 shadow-xs self-start md:self-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Clock className="w-4 h-4 text-primary" aria-hidden />
            <span className="font-bold text-gray-900">{currentTime || "—:——"}</span>
          </div>
          <div className="w-px h-3.5 bg-gray-200" />
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Sun className="w-4 h-4 text-amber-500" aria-hidden />
            <span className="capitalize">{today || "—"}</span>
          </div>
        </div>
      </div>

      {/* VIỆC CỦA TÔI HÔM NAY (mọi thành viên) + VIỆC CẦN XỬ LÝ (người quản lý — tự ẩn với thành viên thường) */}
      <MyTodayCard />
      <InboxCard />

      {/* Thành viên mới / chưa hoàn thiện tài khoản */}
      <OnboardingChecklist />

      {/* Admin/Trưởng nhà: nhắc hoàn tất thiết lập hệ thống mới */}
      <SetupCard />

      {/* Phụng vụ hôm nay + lễ lớn sắp tới */}
      <LiturgyTodayCard />

      {/* 3 THẺ SỐ LIỆU */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* 1. Trực vệ sinh sân nhà tuần này */}
        <Link
          href="/hau-can?tab=truc-nhat"
          className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-cyan-100/60 rounded-full blur-2xl group-hover:bg-cyan-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 flex items-center justify-center text-cyan-700 shadow-xs">
                <Sparkles className="w-5 h-5" aria-hidden />
              </div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-surface-container-low px-2 py-0.5 rounded-md">Tuần này</span>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">{thisWeek?.isMine ? "Tuần này bạn trực vệ sinh sân nhà" : "Trực vệ sinh sân nhà"}</span>
              {dutyLoading ? (
                <Skeleton className="w-44 h-7 mt-1.5" />
              ) : (
                <div className="text-xl font-bold text-gray-900 tracking-tight mt-0.5 truncate">
                  {thisWeek ? thisWeek.members.join(" & ") || "—" : duty ? "Chưa xếp người trực" : "—"}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between gap-2 bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            {dutyLoading ? (
              <Skeleton className="w-32 h-3.5" />
            ) : (
              <span className={cn("text-xs flex items-center gap-1.5 truncate", reviewPending > 0 || thisWeek?.redoRequired ? "text-amber-700 font-semibold" : "text-gray-600")}>
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", reviewPending > 0 || thisWeek?.redoRequired ? "bg-amber-500" : "bg-emerald-600")} />
                {dutyStatus ?? "—"}
              </span>
            )}
            <span className="text-[11px] text-primary font-bold shrink-0">Xem lịch trực →</span>
          </div>
        </Link>

        {/* 2. Quỹ hiện tại */}
        <Link
          href="/thu-chi"
          className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-100/60 rounded-full blur-2xl group-hover:bg-emerald-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-10 h-10 rounded-2xl bg-secondary-fixed flex items-center justify-center text-secondary shadow-xs">
                <Wallet className="w-5 h-5" aria-hidden />
              </div>
              {finLoading && <Skeleton className="w-28 h-5 rounded-md" />}
              {finance?.month && (
                <span className="text-[11px] text-secondary font-bold bg-secondary-fixed/50 px-2 py-0.5 rounded-md flex items-center gap-1 min-w-0">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {finance.month.label}: {finance.month.incomeVnd - finance.month.expenseVnd >= 0 ? "+" : "−"}
                    {formatVND(Math.abs(finance.month.incomeVnd - finance.month.expenseVnd))}
                  </span>
                </span>
              )}
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Quỹ hiện tại</span>
              {finLoading ? (
                <Skeleton className="w-40 h-8 mt-1" />
              ) : (
                <div className="text-2xl font-extrabold text-gray-900 tracking-tight mt-0.5">{finance?.fundBalanceVnd != null ? formatVND(finance.fundBalanceVnd) : "—"}</div>
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
            <span className="text-[11px] text-primary font-bold shrink-0">Sổ quỹ →</span>
          </div>
        </Link>

        {/* 3. Sự kiện sắp tới */}
        <Link
          href={nextEvent ? `/lich-su-kien?date=${new Date(new Date(nextEvent.startsAt).getTime() + 7 * 3600e3).toISOString().slice(0, 10)}` : "/lich-su-kien"}
          className="bg-white rounded-2xl p-5 shadow-xs hover:shadow-md transition-all border border-purple-50 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-100/60 rounded-full blur-2xl group-hover:bg-purple-200/80 transition-all pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary shadow-xs">
                <CalendarDays className="w-5 h-5" aria-hidden />
              </div>
              {nextEvent?.hasCheckIn && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">Có điểm danh</span>
              )}
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500 font-medium block">Sự kiện sắp tới</span>
              {eventsLoading ? (
                <Skeleton className="w-44 h-7 mt-1.5" />
              ) : (
                <div className="text-xl font-bold text-gray-900 tracking-tight mt-0.5 truncate">{nextEvent ? nextEvent.title : "Chưa có sự kiện"}</div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2.5 flex items-center justify-between gap-2 bg-surface-container-low/70 -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
            {eventsLoading ? (
              <Skeleton className="w-32 h-3.5" />
            ) : (
              <span className="text-xs text-gray-600 truncate capitalize">
                {nextEvent ? `${fmtDate(nextEvent.startsAt)} · ${fmtTime(nextEvent.startsAt)}${nextEvent.location ? ` · ${nextEvent.location}` : ""}` : "Xem lịch sinh hoạt của nhà"}
              </span>
            )}
            <span className="text-[11px] text-primary font-bold shrink-0">Xem lịch →</span>
          </div>
        </Link>
      </div>

      {/* BIỂU ĐỒ THU CHI — người quản lý tài chính mở sẵn; thành viên thường thu gọn */}
      {!financeManager && (
        <button
          type="button"
          onClick={toggleCharts}
          aria-expanded={chartsOpen}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-purple-50 bg-white px-4 py-3 shadow-xs hover:border-purple-200 transition text-left"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <BarChart3 className="w-[18px] h-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-gray-900">Thu chi của nhà</span>
              <span className="block text-[11px] text-gray-500 truncate">
                {finance?.month ? `${finance.month.label}: thu ${formatVND(finance.month.incomeVnd)} · chi ${formatVND(finance.month.expenseVnd)}` : "Biểu đồ thu chi 6 tháng, cơ cấu chi tiêu"}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-primary shrink-0">
            {chartsOpen ? "Thu gọn" : "Xem biểu đồ"}
            <ChevronDown className={cn("w-4 h-4 transition", chartsOpen && "rotate-180")} aria-hidden />
          </span>
        </button>
      )}
      {showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white rounded-3xl p-5 md:p-6 border border-purple-50 shadow-xs flex flex-col justify-between">
            {finLoading ? (
              <div className="space-y-3">
                <Skeleton className="w-64 h-5" />
                <Skeleton className="w-80 max-w-full h-3.5" />
                <Skeleton className="w-full h-[220px] rounded-2xl" />
              </div>
            ) : (
              <FinancialBarChart data={chartData} height={220} title="Biểu Đồ Thu - Chi Quỹ Lưu Xá (6 Tháng)" subtitle="So sánh tiền thu quỹ, điện nước và chi tiêu thực tế" />
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
              <ExpenseDonutChart data={donutData} size={160} title={`Cơ Cấu Chi Tiêu ${finance?.month?.label ?? "Tháng Này"}`} subtitle="Phân bổ hạng mục chi phí cộng đoàn" />
            )}
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-gray-500 flex items-center gap-1.5">
                Đã chi trong tháng: {finLoading ? <Skeleton className="w-20 h-3.5" /> : <b className="text-gray-900">{finance?.month ? formatVND(finance.month.expenseVnd) : "—"}</b>}
              </span>
              <Link href="/thu-chi" className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                Chi tiết sổ quỹ
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* LỐI TẮT CÁC PHÂN HỆ + HOẠT ĐỘNG GẦN ĐÂY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-base font-bold text-gray-900">Các mục trong nhà</h2>
              <p className="text-xs text-gray-500">Truy cập nhanh các phân hệ sinh hoạt lưu xá</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Link href="/hau-can?tab=truc-nhat" className={shortcut}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold">🧹</div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Trực Nhật &amp; Hậu Cần</h3>
                  <p className="text-xs text-gray-500">Lịch trực vệ sinh &amp; tài sản chung</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
            </Link>

            <Link href="/thu-chi" className={shortcut}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">💳</div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Thu Chi</h3>
                  {finLoading ? (
                    <Skeleton className="w-36 h-3 mt-1" />
                  ) : (
                    <p className={cn("text-xs font-semibold", mine && mine.items > 0 ? "text-rose-600" : "text-gray-500")}>
                      {mine && mine.items > 0 ? `Bạn còn ${mine.items} khoản chưa đóng` : duesOwing ? `Còn ${duesOwing} bạn chưa đóng quỹ kỳ` : "Sổ quỹ minh bạch"}
                    </p>
                  )}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
            </Link>

            <Link href="/lich-su-kien" className={shortcut}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">📅</div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Lịch &amp; Sự Kiện</h3>
                  {feedLoading ? <Skeleton className="w-36 h-3 mt-1" /> : <p className="text-xs text-gray-500 truncate">{events?.[0] ? `Sắp tới: ${events[0].title}` : "Chưa có sự kiện sắp tới"}</p>}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden />
            </Link>

            <Link href="/hau-can?tab=bao-hong" className={shortcut}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold">🔧</div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Báo Hỏng</h3>
                  {dutyLoading ? <Skeleton className="w-32 h-3 mt-1" /> : <p className="text-xs text-orange-600 font-semibold">{duty ? `${duty.openIssuesCount} sự cố đang xử lý` : "Báo hỏng thiết bị"}</p>}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
            </Link>

            <Link href="/phung-vu" className={shortcut}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">📖</div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Giờ Kinh Tối</h3>
                  <p className="text-xs text-gray-500">{org.nightPrayerTime ? `${org.nightPrayerTime} tối nay · Nguyện đường` : "Lịch phụng vụ & ý chỉ cầu nguyện"}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
            </Link>

            <Link href="/thong-bao" className={shortcut}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">📢</div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">Bảng Tin</h3>
                  <p className={cn("text-xs font-semibold", unread?.announcementsUnread ? "text-rose-600" : "text-gray-500")}>
                    {unread?.announcementsUnread ? `${unread.announcementsUnread} thông báo mới` : "Bảng tin cộng đoàn"}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden />
            </Link>
          </div>

          {/* Sĩ số & chỗ ở (dữ liệu thật) */}
          <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center justify-between text-xs text-gray-700">
            <Link href="/so-do-nha" aria-label={peopleLoading ? "Xem sơ đồ nhà" : undefined} className="flex items-center gap-2 hover:text-primary">
              <Building2 className="w-4 h-4 text-primary shrink-0" aria-hidden />
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

        {/* HOẠT ĐỘNG GẦN ĐÂY */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Hoạt động gần đây</h2>
              <p className="text-xs text-gray-500">Thông báo mới và sự kiện sắp tới của nhà</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" aria-hidden />
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
                    <p className={cn("text-xs line-clamp-1 group-hover:text-primary", f.unread ? "font-bold text-gray-900" : "text-gray-900")}>{f.title}</p>
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

          <Link href="/thong-bao" className="w-full py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-bold text-gray-700 text-center transition">
            Xem tất cả bảng tin →
          </Link>
        </div>
      </div>
    </div>
  );
}
