"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, Church, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useLiturgyWeek, usePrayers } from "@/lib/data/community";
import { formatDayMonth } from "@/lib/community-format";
import PhungVuLoading from "./loading";
import LiturgySchedule from "./_parts/LiturgySchedule";
import PrayerBox from "./_parts/PrayerBox";
import ReflectionCard from "./_parts/ReflectionCard";
import LiturgyDocuments from "./_parts/LiturgyDocuments";
import MassCheckinToday from "./_parts/MassCheckinToday";
import MassCheckinTab from "./_parts/MassCheckinTab";
import { usePendingCheckins } from "@/lib/data/liturgy-calendar";

type Tab = "main" | "checkin" | "docs";
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "main", label: "Phụng Vụ & Đời Sống Thiêng Liêng", icon: <Church className="w-3.5 h-3.5" /> },
  { key: "checkin", label: "Check-in đi lễ", icon: <ListChecks className="w-3.5 h-3.5" /> },
  { key: "docs", label: "Tài liệu phụng vụ", icon: <BookOpen className="w-3.5 h-3.5" /> },
];
/** ?tab= trên đường dẫn (thông báo, hộp việc, liên kết từ Lịch) */
const TAB_PARAM: Record<string, Tab> = { checkin: "checkin", "check-in": "checkin", docs: "docs", "tai-lieu": "docs" };

export default function PhungVuPage() {
  const { members, showToast, isLoadingSkeleton } = useApp();
  const { can } = useSession();
  const [from, setFrom] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("main");

  // Liên kết cũ dạng #tai-lieu-phung-vu mở thẳng tab Tài liệu; ?tab=checkin mở tab Check-in đi lễ
  useEffect(() => {
    if (window.location.hash === "#tai-lieu-phung-vu") setTab("docs");
    const t = TAB_PARAM[new URLSearchParams(window.location.search).get("tab") ?? ""];
    if (t) setTab(t);
  }, []);
  const canReviewMass = can("liturgy.calendar.manage");
  const { pending: massPending } = usePendingCheckins(canReviewMass);
  const { week, isLoading: weekLoading } = useLiturgyWeek(from);
  const { data: prayers, isLoading: prayersLoading, mutate: mutatePrayers } = usePrayers();

  if (isLoadingSkeleton || (weekLoading && !week) || (prayersLoading && !prayers)) {
    return <PhungVuLoading />;
  }

  const tonight = week?.tonight;
  const nextMass = week?.nextMass;
  const stats = prayers?.stats;
  const memberOptions = members
    .filter((m) => m.status === "active" || m.status === "on_leave")
    .map((m) => ({ id: m.id, name: m.fullName, room: m.room }));

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER */}
      <div className="page-head">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Phụng Vụ</h1>
          <p className="text-sm text-gray-500 mt-1">Lịch kinh nguyện, check-in đi lễ, ý hiệp thông cầu nguyện, suy niệm Lời Chúa hàng tuần và kho tài liệu phụng vụ</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {tab === "main" && can("prayer.post") && (
            <button
              onClick={() => {
                const input = document.getElementById("prayer-input");
                input?.scrollIntoView({ behavior: "smooth", block: "center" });
                input?.focus();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition"
            >
              <span>+ Gửi ý cầu nguyện</span>
            </button>
          )}
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap p-1 rounded-xl bg-gray-100 gap-1 self-start">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", tab === t.key ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}
          >
            {t.icon}
            {t.label}
            {t.key === "checkin" && canReviewMass && (massPending?.total ?? 0) > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-extrabold leading-none" title="Check-in chờ duyệt">
                {massPending!.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "main" && (
      <>
      {/* CHECK-IN ĐI LỄ: chỉ hiện khi hôm nay / ngày mai (lễ vọng) / ngày còn hạn cần check-in */}
      <MassCheckinToday compact />

      {/* TOP 3 CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs text-gray-500 font-medium">
              {tonight && tonight.date === week?.today ? "Kinh Tối Hôm Nay" : "Giờ Kinh Chung Sắp Tới"}
            </span>
            <div className="text-3xl font-extrabold text-primary mt-1">
              {tonight?.time ?? week?.defaultNightPrayerTime ?? "20:30"}{" "}
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md align-middle">
                {tonight?.whenLabel ?? "Chưa lên lịch"}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 truncate">
              {tonight ? `${tonight.location ?? "Nhà nguyện"} · Trực: ${tonight.presider ?? "Ban Phụng Vụ"}` : "Ban Phụng vụ chưa lập lịch giờ kinh"}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl shrink-0">📖</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs text-gray-500 font-medium">Ý Cầu Nguyện Tháng</span>
            <div className="text-3xl font-extrabold text-secondary mt-1">
              {stats?.monthCount ?? 0}{" "}
              <span className="text-xs font-bold text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-md align-middle">
                +{stats?.weekNew ?? 0} mới tuần này
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{stats?.prayingMembers ?? 0} anh em đang cùng hiệp thông</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-secondary flex items-center justify-center font-bold text-xl shrink-0">🙏</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs text-gray-500 font-medium">Thánh Lễ Sắp Tới</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              {nextMass ? (nextMass.date === week?.today ? "Hôm nay" : nextMass.weekday) : "Chưa có lịch"}{" "}
              {nextMass && (
                <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md align-middle">{formatDayMonth(nextMass.date)}</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1 truncate">
              {nextMass ? `${nextMass.time} ${nextMass.timeLabel.split(" ")[1]?.toLowerCase() ?? ""} · ${nextMass.title}` : "Ban Phụng vụ sẽ cập nhật lịch Thánh lễ"}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xl shrink-0">⛪</div>
        </div>
      </div>

      {/* 2 COLUMNS: SCHEDULE & PRAYER INTENTIONS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {week && (
          <LiturgySchedule week={week} canManage={can("liturgy.manage")} members={memberOptions} onNavigate={setFrom} showToast={showToast} />
        )}

        {/* PRAYER INTENTIONS & SCRIPTURE (5 COLS) */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          <PrayerBox
            data={prayers}
            canModerate={can("prayer.moderate")}
            canReveal={can("prayer.reveal_author")}
            canPost={can("prayer.post")}
            showToast={showToast}
            mutate={mutatePrayers}
          />
          <ReflectionCard showToast={showToast} />
        </div>
      </div>

      </>
      )}

      {/* TAB CHECK-IN ĐI LỄ: hôm nay, các ngày trong tháng, hàng đợi chờ duyệt + xuất Excel (người duyệt) */}
      {tab === "checkin" && <MassCheckinTab canManage={canReviewMass} />}

      {/* TAB 3: THƯ VIỆN TÀI LIỆU PHỤNG VỤ (kinh, bài hát, video, PDF, liên kết) */}
      {tab === "docs" && <LiturgyDocuments showToast={showToast} />}
    </div>
  );
}
