"use client";

import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useLiturgyWeek, usePrayers } from "@/lib/data/community";
import { formatDayMonth } from "@/lib/community-format";
import PhungVuLoading from "./loading";
import LiturgySchedule from "./_parts/LiturgySchedule";
import PrayerBox from "./_parts/PrayerBox";
import ReflectionCard from "./_parts/ReflectionCard";

export default function PhungVuPage() {
  const { members, showToast, isLoadingSkeleton } = useApp();
  const { can } = useSession();
  const [from, setFrom] = useState<string | null>(null);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Phụng Vụ &amp; Đời Sống Thiêng Liêng</h1>
          <p className="text-sm text-gray-500 mt-1">Lịch kinh nguyện, ý hiệp thông cầu nguyện và suy niệm Lời Chúa hàng tuần</p>
        </div>

        {can("prayer.post") && (
          <button
            onClick={() => {
              const input = document.getElementById("prayer-input");
              input?.scrollIntoView({ behavior: "smooth", block: "center" });
              input?.focus();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition self-start md:self-auto"
          >
            <span>+ Gửi ý cầu nguyện</span>
          </button>
        )}
      </div>

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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {week && (
          <LiturgySchedule week={week} canManage={can("liturgy.manage")} members={memberOptions} onNavigate={setFrom} showToast={showToast} />
        )}

        {/* PRAYER INTENTIONS & SCRIPTURE (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
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
    </div>
  );
}
