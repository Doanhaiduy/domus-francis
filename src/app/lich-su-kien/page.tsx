"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  Users,
  CalendarCheck,
  Vote,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { eventPhase, vnParts } from "@/lib/events-format";
import { eventsApi, refreshEvents, useDayDuties, useMonthEvents, usePolls } from "@/lib/data/events";
import type { EventDto } from "@/lib/types/events";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import LichSuKienLoading from "./loading";
import EventDayCard from "./_components/EventDayCard";
import EventFormModal from "./_components/EventFormModal";
import PollFormModal from "./_components/PollFormModal";
import PollCard from "./_components/PollCard";
import QrModal from "./_components/QrModal";
import CheckInModal from "./_components/CheckInModal";
import AttendanceCard from "./_components/AttendanceCard";
import { catStyle } from "./_components/styles";

const MONTH_NAMES = [
  "Tháng 01", "Tháng 02", "Tháng 03", "Tháng 04", "Tháng 05", "Tháng 06",
  "Tháng 07", "Tháng 08", "Tháng 09", "Tháng 10", "Tháng 11", "Tháng 12",
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function LichSuKienPage() {
  const { openModal, showToast, isLoadingSkeleton } = useApp();
  const { can, session } = useSession();
  const canManageEvents = can("event.manage");
  const canManagePolls = can("poll.manage");
  const canVote = can("poll.vote");
  const canReadAllAttendance = can("event.attendance.read_all");

  // Hôm nay theo giờ VN
  const today = useMemo(() => vnParts(), []);
  const [activeTab, setActiveTab] = useState<"calendar" | "checkin" | "polls">("calendar");
  const [currentMonth, setCurrentMonth] = useState(today.m - 1); // 0-indexed
  const [currentYear, setCurrentYear] = useState(today.y);
  const [selectedDay, setSelectedDay] = useState<number>(today.d);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { events, categories, isLoading } = useMonthEvents(currentYear, currentMonth);
  const { polls } = usePolls();
  const selectedIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(selectedDay)}`;
  const duties = useDayDuties(selectedIso);

  // Modal
  const [eventForm, setEventForm] = useState<{ open: boolean; event: EventDto | null; date: string | null }>({ open: false, event: null, date: null });
  const [pollForm, setPollForm] = useState<{ open: boolean; eventId: string | null }>({ open: false, eventId: null });
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [checkInEvent, setCheckInEvent] = useState<EventDto | null | undefined>(undefined);
  const [cancelTarget, setCancelTarget] = useState<EventDto | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EventDto | null>(null);

  // Luôn dùng bản mới nhất của sự kiện trong modal QR (sau khi làm mới dữ liệu)
  const qrEvent = qrEventId ? events.find((e) => e.id === qrEventId) ?? null : null;
  useEffect(() => {
    if (qrEventId && !isLoading && !events.some((e) => e.id === qrEventId)) setQrEventId(null);
  }, [qrEventId, events, isLoading]);

  const goMonth = (delta: number) => {
    const d = new Date(currentYear, currentMonth + delta, 1);
    setCurrentMonth(d.getMonth());
    setCurrentYear(d.getFullYear());
    setSelectedDay(1);
  };
  const handleGoToToday = () => {
    setCurrentMonth(today.m - 1);
    setCurrentYear(today.y);
    setSelectedDay(today.d);
  };

  // Lưới lịch
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Thứ Hai = 0
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  const trailingDaysCount = (7 - ((firstDayOfWeek + daysInMonth) % 7)) % 7;
  const isTodayActive = currentMonth === today.m - 1 && currentYear === today.y;
  const monthPrefix = `${currentYear}-${pad(currentMonth + 1)}-`;

  const filteredEventsForMonth = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return events.filter((evt) => {
      if (!evt.dateIso.startsWith(monthPrefix)) return false;
      const matchCat = selectedCategory === "all" || evt.categoryCode === selectedCategory;
      const matchSearch =
        !term ||
        evt.title.toLowerCase().includes(term) ||
        evt.location.toLowerCase().includes(term) ||
        evt.organizer.toLowerCase().includes(term) ||
        evt.organizers.some((o) => o.name.toLowerCase().includes(term));
      return matchCat && matchSearch;
    });
  }, [events, monthPrefix, selectedCategory, searchTerm]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, EventDto[]> = {};
    filteredEventsForMonth.forEach((evt) => {
      const d = Number(evt.dateIso.slice(8, 10));
      (map[d] ??= []).push(evt);
    });
    return map;
  }, [filteredEventsForMonth]);

  const selectedDayEvents = eventsByDay[selectedDay] ?? [];

  // Điểm danh: sự kiện bật điểm danh trong tháng — đang diễn ra trước, rồi sắp tới (gần nhất trước), rồi đã qua (mới nhất trước)
  const eventsWithCheckIn = useMemo(() => {
    const rank = (e: EventDto) => {
      const p = eventPhase(e);
      return p === "ongoing" ? 0 : p === "upcoming" ? 1 : p === "ended" ? 2 : 3;
    };
    return events
      .filter((e) => e.hasCheckIn && e.dateIso.startsWith(monthPrefix))
      .sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
  }, [events, monthPrefix]);

  const checkInStats = useMemo(() => {
    const ended = eventsWithCheckIn.filter((e) => eventPhase(e) === "ended" && e.status !== "cancelled");
    const rates = ended.filter((e) => (e.stats.expected ?? 0) > 0).map((e) => (e.stats.present + e.stats.late) / (e.stats.expected ?? 1));
    const avg = rates.length ? (rates.reduce((s, r) => s + r, 0) / rates.length) * 100 : null;
    const mine = ended.filter((e) => e.myAttendance && (e.myAttendance.status === "present" || e.myAttendance.status === "late")).length;
    return { avg, mine, endedCount: ended.length };
  }, [eventsWithCheckIn]);

  const categoryFilters = categories.length ? categories : [];

  const openCreate = (dateIso?: string) => setEventForm({ open: true, event: null, date: dateIso ?? selectedIso });

  const confirmCancel = async () => {
    const evt = cancelTarget;
    const reason = cancelReason.trim();
    if (!evt) return;
    if (reason.length < 3) {
      showToast("error", "Nhập lý do hủy (tối thiểu 3 ký tự).");
      setTimeout(() => setCancelTarget(evt), 0);
      return;
    }
    try {
      await eventsApi.cancel(evt.id, reason);
      await refreshEvents();
      showToast("success", `Đã hủy sự kiện "${evt.title}".`);
      setCancelReason("");
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  const confirmDelete = async () => {
    const evt = deleteTarget;
    if (!evt) return;
    try {
      await eventsApi.remove(evt.id);
      await refreshEvents();
      showToast("success", `Đã xóa sự kiện "${evt.title}".`);
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  if (isLoadingSkeleton || (isLoading && events.length === 0 && categories.length === 0)) {
    return <LichSuKienLoading />;
  }

  const openPolls = polls.filter((p) => p.isOpen).length;
  const cardHandlers = {
    canManage: canManageEvents,
    canManagePoll: canManagePolls,
    canVote,
    onEdit: (e: EventDto) => setEventForm({ open: true, event: e, date: null }),
    onCancel: (e: EventDto) => {
      setCancelReason("");
      setCancelTarget(e);
    },
    onDelete: (e: EventDto) => setDeleteTarget(e),
    onOpenQr: (e: EventDto) => setQrEventId(e.id),
    onCheckIn: (e: EventDto) => setCheckInEvent(e),
  };

  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto pb-16">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4" />
            <span>Phân Lịch Hoạt Động &amp; Bổn Mạng</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Lịch, Sự Kiện &amp; Điểm Danh</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Lịch sinh hoạt cộng đoàn, giờ phụng vụ thánh thiêng, biểu quyết họp nhà và điểm danh tham dự
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openModal("swapDuty")}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition shadow-2xs"
          >
            Đổi ca trực nhật
          </button>
          <button
            onClick={() => setCheckInEvent(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 transition active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Nhập mã điểm danh</span>
          </button>
          {canManagePolls && (
            <button
              onClick={() => setPollForm({ open: true, eventId: null })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 transition active:scale-95"
            >
              <Vote className="w-4 h-4" />
              <span>Tạo Vote mới</span>
            </button>
          )}
          {canManageEvents && (
            <button
              onClick={() => openCreate()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm sự kiện</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. THREE MAIN FEATURE TABS */}
      <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 border border-purple-50 shadow-xs max-w-xl">
        {(
          [
            ["calendar", CalendarIcon, `Lịch Biểu (${filteredEventsForMonth.length})`],
            ["checkin", CheckCircle2, `Điểm Danh & Check-in (${eventsWithCheckIn.length})`],
            ["polls", Vote, `Biểu Quyết / Vote (${openPolls})`],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
              activeTab === key ? "bg-primary text-white shadow-xs" : "text-gray-600 hover:text-gray-900 hover:bg-purple-50"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: CALENDAR VIEW */}
      {activeTab === "calendar" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-4 border border-purple-50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 sm:pb-0">
              <span className="text-xs font-bold text-gray-400 mr-2 shrink-0">Chủ đề:</span>
              {[{ code: "all", label: "Tất cả" }, ...categoryFilters].map((cat) => (
                <button
                  key={cat.code}
                  onClick={() => setSelectedCategory(cat.code)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                    selectedCategory === cat.code ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm sự kiện, địa điểm..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: MONTH CALENDAR */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-black text-gray-900 tracking-tight">
                    {MONTH_NAMES[currentMonth]}, {currentYear}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button onClick={() => goMonth(-1)} className="p-1.5 rounded-xl hover:bg-purple-50 text-gray-600 hover:text-primary transition" title="Tháng trước">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => goMonth(1)} className="p-1.5 rounded-xl hover:bg-purple-50 text-gray-600 hover:text-primary transition" title="Tháng sau">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button onClick={handleGoToToday} className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition">
                  Hôm nay (T{today.m}/{today.y})
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center border-b border-gray-100 pb-2">
                {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((dow, idx) => (
                  <div key={dow} className={cn("py-1 text-xs font-extrabold uppercase", idx === 6 ? "text-rose-500" : "text-gray-500")}>
                    {dow}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                  <div
                    key={`prev-${idx}`}
                    onClick={() => goMonth(-1)}
                    className="h-16 p-1 text-gray-300 hover:text-gray-400 text-xs flex flex-col justify-start cursor-pointer opacity-50"
                    title="Xem tháng trước"
                  >
                    <span className="font-medium text-left pl-1">{daysInPrevMonth - firstDayOfWeek + 1 + idx}</span>
                  </div>
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const isSelected = selectedDay === d;
                  const isToday = isTodayActive && d === today.d;
                  const dayEvts = eventsByDay[d] || [];
                  return (
                    <div
                      key={d}
                      onClick={() => setSelectedDay(d)}
                      className={cn(
                        "h-16 p-1.5 rounded-xl cursor-pointer transition flex flex-col justify-between text-left border relative select-none group",
                        isSelected
                          ? "bg-purple-100/90 border-primary ring-2 ring-purple-200 shadow-2xs font-bold"
                          : isToday
                          ? "bg-purple-50/70 border-purple-200"
                          : "bg-surface-container-low/40 hover:bg-purple-50/50 border-transparent hover:border-purple-200"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-bold", isSelected || isToday ? "text-primary" : "text-gray-800")}>{d}</span>
                        {isToday && <span className="text-[9px] bg-primary text-white px-1 rounded font-bold">Nay</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 items-center">
                        {dayEvts.map((evt) => (
                          <span
                            key={evt.id}
                            className={cn(
                              "w-2 h-2 rounded-full ring-1 ring-white shadow-2xs",
                              catStyle(evt.categoryCode).dot,
                              evt.status === "cancelled" && "opacity-30"
                            )}
                            title={`${evt.title} (${evt.category})${evt.status === "cancelled" ? " — đã hủy" : ""}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {Array.from({ length: trailingDaysCount }).map((_, idx) => (
                  <div
                    key={`next-${idx}`}
                    onClick={() => goMonth(1)}
                    className="h-16 p-1 text-gray-300 hover:text-gray-400 text-xs flex flex-col justify-start cursor-pointer opacity-50"
                    title="Xem tháng sau"
                  >
                    <span className="font-medium text-left pl-1">{idx + 1}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 pt-3 border-t border-gray-100 flex-wrap">
                <span className="font-bold text-gray-700">Chú thích:</span>
                {categories.map((c) => (
                  <span key={c.code} className="flex items-center gap-1.5 font-medium">
                    <span className={cn("w-2 h-2 rounded-full", catStyle(c.code).dot)} />
                    <span>{c.label}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT: DAY DETAILS */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                      Chi tiết ngày {selectedDay}/{currentMonth + 1}/{currentYear}
                    </span>
                    <h3 className="text-base font-bold text-gray-900">
                      {selectedDayEvents.length > 0 ? "Lịch hoạt động & Sự kiện" : "Không có sự kiện đặc biệt"}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "px-2.5 py-1 text-xs font-bold rounded-lg",
                      selectedDayEvents.length > 0 ? "bg-purple-100 text-primary" : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {selectedDayEvents.length} Sự kiện
                  </span>
                </div>

                {selectedDayEvents.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {selectedDayEvents.map((evt) => (
                      <EventDayCard key={evt.id} event={evt} {...cardHandlers} />
                    ))}
                    {canManageEvents && (
                      <button
                        onClick={() => openCreate(selectedIso)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-primary text-xs font-bold hover:bg-purple-100 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm sự kiện ngày này</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                    <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-gray-600">
                      Ngày {selectedDay}/{currentMonth + 1} chưa có sự kiện lên lịch
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Anh em duy trì các giờ kinh tối và sinh hoạt thường nhật.</p>
                    {canManageEvents && (
                      <button
                        onClick={() => openCreate(selectedIso)}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 text-primary text-xs font-bold hover:bg-purple-200 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tạo sự kiện ngày này</span>
                      </button>
                    )}
                  </div>
                )}

                {/* DAILY DUTIES (lịch trực đã công bố) */}
                <div className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800 mb-2">
                    <span>
                      🧹 Phân công trực nhật ngày {selectedDay}/{currentMonth + 1}
                    </span>
                    <span className={cn("font-bold", duties.length ? "text-emerald-700" : "text-gray-400")}>{duties.length} Ca</span>
                  </div>
                  {duties.length > 0 ? (
                    <div className="space-y-2 text-xs">
                      {duties.map((dt) => (
                        <div key={dt.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-gray-100">
                          <span className="text-gray-500">
                            {dt.area} <span className="text-gray-400">({dt.shift})</span>:
                          </span>
                          <span className="font-bold text-gray-900 text-right">{dt.members.join(", ") || "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400">Chưa có lịch trực nhật được công bố cho ngày này.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHECK-IN & ATTENDANCE */}
      {activeTab === "checkin" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sự kiện có điểm danh ({MONTH_NAMES[currentMonth]})</span>
                <div className="text-2xl font-black text-gray-900 mt-1">{eventsWithCheckIn.length}</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tỉ lệ có mặt trung bình</span>
                <div className="text-2xl font-black text-emerald-600 mt-1">
                  {checkInStats.avg === null ? "—" : `${checkInStats.avg.toFixed(1).replace(".", ",")}%`}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Check-in của bạn ({session?.member?.displayName ?? "bạn"})
                </span>
                <div className="text-2xl font-black text-primary mt-1">
                  {checkInStats.endedCount === 0
                    ? "Chưa có"
                    : `${checkInStats.mine}/${checkInStats.endedCount} (${Math.round((checkInStats.mine / checkInStats.endedCount) * 100)}%)`}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {eventsWithCheckIn.length === 0 && (
              <div className="py-10 text-center bg-white rounded-3xl border border-dashed border-gray-200 text-xs text-gray-500">
                {MONTH_NAMES[currentMonth]}/{currentYear} chưa có sự kiện nào bật điểm danh.
              </div>
            )}
            {eventsWithCheckIn.map((evt) => (
              <AttendanceCard
                key={evt.id}
                event={evt}
                canReadAll={canReadAllAttendance}
                onOpenQr={(e) => setQrEventId(e.id)}
                onCheckIn={(e) => setCheckInEvent(e)}
              />
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: POLLS */}
      {activeTab === "polls" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-purple-50 shadow-xs gap-3">
            <div>
              <h2 className="text-base font-black text-gray-900">Các Cuộc Biểu Quyết</h2>
              <p className="text-xs text-gray-500">
                Lấy ý kiến tập thể anh em Lưu Xá cho các quyết định chung, chọn lịch họp và phương án dã ngoại — {openPolls} cuộc đang mở
              </p>
            </div>
            {canManagePolls && (
              <button
                onClick={() => setPollForm({ open: true, eventId: null })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-[#4d2dbf] active:scale-95 transition shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo biểu quyết mới</span>
              </button>
            )}
          </div>

          {polls.length === 0 ? (
            <div className="py-10 text-center bg-white rounded-3xl border border-dashed border-gray-200 text-xs text-gray-500">Chưa có cuộc biểu quyết nào.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {polls.map((poll) => (
                <PollCard key={poll.id} poll={poll} variant="full" canManage={canManagePolls} canVote={canVote} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      <EventFormModal
        open={eventForm.open}
        onClose={() => setEventForm({ open: false, event: null, date: null })}
        categories={categories}
        event={eventForm.event}
        presetDate={eventForm.date}
        onSaved={(e) => {
          const [y, m, d] = e.dateIso.split("-").map(Number);
          setCurrentYear(y);
          setCurrentMonth(m - 1);
          setSelectedDay(d);
        }}
      />
      <PollFormModal
        open={pollForm.open}
        onClose={() => setPollForm({ open: false, eventId: null })}
        events={events.filter((e) => eventPhase(e) !== "ended")}
        presetEventId={pollForm.eventId}
      />
      {qrEvent && <QrModal event={qrEvent} onClose={() => setQrEventId(null)} />}
      {checkInEvent !== undefined && <CheckInModal event={checkInEvent} onClose={() => setCheckInEvent(undefined)} />}

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        title={`Hủy sự kiện "${cancelTarget?.title ?? ""}"?`}
        message={
          <div className="space-y-2">
            <p>Sự kiện vẫn hiển thị trên lịch với nhãn ĐÃ HỦY; phiên QR và biểu quyết đang mở của sự kiện sẽ được đóng.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              placeholder="Lý do hủy (bắt buộc)..."
              className="w-full p-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none"
            />
          </div>
        }
        confirmText="Hủy sự kiện"
        cancelText="Đóng"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Xóa sự kiện "${deleteTarget?.title ?? ""}"?`}
        message="Sự kiện bị gỡ khỏi lịch (dữ liệu điểm danh vẫn được lưu để đối chiếu). Biểu quyết chưa có phiếu bị xóa, đã có phiếu thì được đóng."
        confirmText="Xóa sự kiện"
        variant="danger"
      />
    </div>
  );
}
