"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Check,
  Plus,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Sparkles,
  Users,
  Church,
  CalendarCheck,
  QrCode,
  Vote,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Share2,
  FileText,
  X,
  CheckCircle,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { CalendarEvent } from "@/lib/mockData";
import { CustomInput, CustomSelect, CustomDatePicker, CustomTextarea, SelectOption } from "@/components/ui/FormControls";
import LichSuKienLoading from "./loading";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/zaloShare";

const MONTH_NAMES = [
  "Tháng 01", "Tháng 02", "Tháng 03", "Tháng 04", "Tháng 05", "Tháng 06",
  "Tháng 07", "Tháng 08", "Tháng 09", "Tháng 10", "Tháng 11", "Tháng 12"
];

const CATEGORY_COLORS: Record<string, { bg: string; dot: string; text: string; border: string }> = {
  "Phụng vụ": { bg: "bg-purple-100", dot: "bg-purple-600", text: "text-purple-800", border: "border-purple-200" },
  "Họp nhà": { bg: "bg-blue-100", dot: "bg-blue-600", text: "text-blue-800", border: "border-blue-200" },
  "Bổn mạng": { bg: "bg-rose-100", dot: "bg-rose-600", text: "text-rose-800", border: "border-rose-200" },
  "Dã ngoại": { bg: "bg-emerald-100", dot: "bg-emerald-600", text: "text-emerald-800", border: "border-emerald-200" },
  "Sinh hoạt": { bg: "bg-amber-100", dot: "bg-amber-600", text: "text-amber-800", border: "border-amber-200" },
};

export default function LichSuKienPage() {
  const {
    events,
    addEvent,
    checkInEvent,
    voteEventPoll,
    createEventPoll,
    members,
    openModal,
    showToast,
    isLoadingSkeleton,
    currentRole,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Main Active Tab: "calendar" | "checkin" | "polls"
  const [activeTab, setActiveTab] = useState<"calendar" | "checkin" | "polls">("calendar");

  // Active Month & Year (Default October 2026)
  const [currentMonth, setCurrentMonth] = useState(9); // 0-indexed: 9 = October
  const [currentYear, setCurrentYear] = useState(2026);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rsvpState, setRsvpState] = useState<Record<string, "tham-du" | "vang" | "chua-ro">>({});

  // QR Check-in Modal State
  const [qrModalEvent, setQrModalEvent] = useState<CalendarEvent | null>(null);

  // Create Poll Modal State
  const [isCreatePollModalOpen, setIsCreatePollModalOpen] = useState(false);
  const [pollSelectedEventId, setPollSelectedEventId] = useState<string>("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Custom Add Event Modal State (with Poll and Check-in toggles)
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("04/10/2026");
  const [newEventTime, setNewEventTime] = useState("19:30 tối");
  const [newEventLocation, setNewEventLocation] = useState("Phòng sinh hoạt chung T2");
  const [newEventCategory, setNewEventCategory] = useState<CalendarEvent["category"]>("Họp nhà");
  const [newEventOrganizer, setNewEventOrganizer] = useState("Trần Văn Đức (Trưởng nhà)");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventHasCheckIn, setNewEventHasCheckIn] = useState(true);
  const [newEventHasPoll, setNewEventHasPoll] = useState(false);
  const [newEventPollQuestion, setNewEventPollQuestion] = useState("");
  const [newEventPollOptions, setNewEventPollOptions] = useState<string[]>(["Phương án 1", "Phương án 2"]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDay(1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDay(1);
  };

  const handleGoToToday = () => {
    setCurrentMonth(9);
    setCurrentYear(2026);
    setSelectedDay(1);
  };

  // Calendar Calculation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  const trailingDaysCount = (7 - ((firstDayOfWeek + daysInMonth) % 7)) % 7;

  // Filter events based on month/year and search/category
  const filteredEventsForMonth = useMemo(() => {
    return events.filter((evt) => {
      const parts = evt.date.split("/");
      if (parts.length < 3) return false;
      const m = Number(parts[1]);
      const y = Number(parts[2]);

      const matchDate = m === currentMonth + 1 && y === currentYear;
      const matchCat = selectedCategory === "all" || evt.category === selectedCategory;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        searchTerm === "" ||
        evt.title.toLowerCase().includes(term) ||
        evt.location.toLowerCase().includes(term) ||
        evt.organizer.toLowerCase().includes(term);

      return matchDate && matchCat && matchSearch;
    });
  }, [events, currentMonth, currentYear, selectedCategory, searchTerm]);

  // Group events by day for quick badge display
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    filteredEventsForMonth.forEach((evt) => {
      const parts = evt.date.split("/");
      const d = Number(parts[0]);
      if (!map[d]) map[d] = [];
      map[d].push(evt);
    });
    return map;
  }, [filteredEventsForMonth]);

  // Selected Day's events
  const selectedDayEvents = useMemo(() => {
    return filteredEventsForMonth.filter((evt) => {
      const d = Number(evt.date.split("/")[0]);
      return d === selectedDay;
    });
  }, [filteredEventsForMonth, selectedDay]);

  // Events with Check-In enabled
  const eventsWithCheckIn = useMemo(() => {
    return events.filter((e) => e.hasCheckIn);
  }, [events]);

  // Events with Polls
  const eventsWithPoll = useMemo(() => {
    return events.filter((e) => !!e.poll);
  }, [events]);

  // Handle Quick Check-In for current user
  const handleUserCheckIn = (eventId: string) => {
    checkInEvent(eventId, "Minh Tuấn");
  };

  // Handle Submit New Event
  const handleCreateNewEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) {
      showToast("error", "Vui lòng nhập tiêu đề sự kiện!");
      return;
    }

    let pollData = undefined;
    if (newEventHasPoll && newEventPollQuestion.trim()) {
      const validOpts = newEventPollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
      if (validOpts.length >= 2) {
        pollData = {
          id: `poll-${Date.now()}`,
          question: newEventPollQuestion.trim(),
          options: validOpts.map((txt, idx) => ({
            id: `opt-${Date.now()}-${idx}`,
            text: txt,
            votes: [],
          })),
          createdAt: new Date().toLocaleDateString("vi-VN"),
        };
      }
    }

    addEvent({
      title: newEventTitle.trim(),
      date: newEventDate,
      time: newEventTime.trim(),
      location: newEventLocation.trim(),
      category: newEventCategory,
      organizer: newEventOrganizer.trim(),
      description: newEventDescription.trim() || undefined,
      hasCheckIn: newEventHasCheckIn,
      checkIns: newEventHasCheckIn
        ? [{ memberId: "m2", memberName: "Minh Tuấn", room: "P.204", checkedInAt: "19:00", status: "present" }]
        : undefined,
      poll: pollData,
    });

    setIsAddEventModalOpen(false);
    // Reset Form
    setNewEventTitle("");
    setNewEventDescription("");
    setNewEventPollQuestion("");
  };

  // Handle Submit New Poll
  const handleCreatePollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollSelectedEventId) {
      showToast("error", "Vui lòng chọn sự kiện liên kết!");
      return;
    }
    if (!pollQuestion.trim()) {
      showToast("error", "Vui lòng nhập câu hỏi biểu quyết!");
      return;
    }
    const validOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (validOptions.length < 2) {
      showToast("error", "Cần ít nhất 2 phương án lựa chọn!");
      return;
    }

    createEventPoll(pollSelectedEventId, pollQuestion.trim(), validOptions);
    setIsCreatePollModalOpen(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
  };

  // Copy Poll summary to Zalo
  const handleCopyPollZalo = async (evt: CalendarEvent) => {
    if (!evt.poll) return;
    const poll = evt.poll;
    const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);

    let text = `📊 BIỂU QUYẾT LƯU XÁ: ${poll.question}\n`;
    text += `📅 Sự kiện: ${evt.title} (${evt.date})\n`;
    text += `🗳️ Tổng số lượt biểu quyết: ${totalVotes} phiếu\n\n`;

    poll.options.forEach((opt, idx) => {
      const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
      text += `${idx + 1}. ${opt.text}: ${opt.votes.length} phiếu (${pct}%)\n`;
      if (opt.votes.length > 0) {
        text += `   👥 Anh em: ${opt.votes.join(", ")}\n`;
      }
    });

    text += `\nPax et Bonum - Lưu Xá Sinh Viên Phanxicô`;
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", "Đã sao chép kết quả biểu quyết! Có thể dán ngay vào Zalo.");
    }
  };

  if (isLoadingSkeleton) {
    return <LichSuKienLoading />;
  }

  const isTodayActive = currentMonth === 9 && currentYear === 2026;

  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto pb-16">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4" />
            <span>Phân Lịch Hoạt Động &amp; Bổn Mạng</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
            Lịch, Sự Kiện &amp; Điểm Danh
          </h1>
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
            onClick={() => setIsCreatePollModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 transition active:scale-95"
          >
            <Vote className="w-4 h-4" />
            <span>Tạo Vote mới</span>
          </button>
          <button
            onClick={() => setIsAddEventModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm sự kiện</span>
          </button>
        </div>
      </div>

      {/* 2. THREE MAIN FEATURE TABS */}
      <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 border border-purple-50 shadow-xs max-w-xl">
        <button
          onClick={() => setActiveTab("calendar")}
          className={cn(
            "flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
            activeTab === "calendar"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-purple-50"
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>Lịch Biểu ({filteredEventsForMonth.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("checkin")}
          className={cn(
            "flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
            activeTab === "checkin"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-purple-50"
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Điểm Danh &amp; Check-in ({eventsWithCheckIn.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("polls")}
          className={cn(
            "flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
            activeTab === "polls"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-purple-50"
          )}
        >
          <Vote className="w-3.5 h-3.5" />
          <span>Biểu Quyết / Vote ({eventsWithPoll.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: CALENDAR VIEW */}
      {/* ======================================================== */}
      {activeTab === "calendar" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* FILTER & SEARCH TOOLBAR */}
          <div className="bg-white rounded-3xl p-4 border border-purple-50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 sm:pb-0">
              <span className="text-xs font-bold text-gray-400 mr-2 shrink-0">Chủ đề:</span>
              {["all", "Phụng vụ", "Họp nhà", "Bổn mạng", "Dã ngoại", "Sinh hoạt"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                    selectedCategory === cat
                      ? "bg-primary text-white shadow-xs"
                      : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                  )}
                >
                  {cat === "all" ? "Tất cả" : cat}
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

          {/* 2 COLUMNS: CALENDAR GRID (7 COLS) & DAY DETAILS (5 COLS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: DYNAMIC MONTH CALENDAR */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-black text-gray-900 tracking-tight">
                    {MONTH_NAMES[currentMonth]}, {currentYear}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handlePrevMonth}
                      className="p-1.5 rounded-xl hover:bg-purple-50 text-gray-600 hover:text-primary transition"
                      title="Tháng trước"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="p-1.5 rounded-xl hover:bg-purple-50 text-gray-600 hover:text-primary transition"
                      title="Tháng sau"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleGoToToday}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition"
                >
                  Hôm nay (T10/2026)
                </button>
              </div>

              {/* DOW HEADER */}
              <div className="grid grid-cols-7 gap-1 text-center border-b border-gray-100 pb-2">
                {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((dow, idx) => (
                  <div
                    key={dow}
                    className={cn(
                      "py-1 text-xs font-extrabold uppercase",
                      idx === 6 ? "text-rose-500" : "text-gray-500"
                    )}
                  >
                    {dow}
                  </div>
                ))}
              </div>

              {/* CALENDAR DAYS GRID */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {/* Leading days from previous month */}
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => {
                  const dayNum = daysInPrevMonth - firstDayOfWeek + 1 + idx;
                  return (
                    <div
                      key={`prev-${idx}`}
                      onClick={handlePrevMonth}
                      className="h-16 p-1 text-gray-300 hover:text-gray-400 text-xs flex flex-col justify-start cursor-pointer opacity-50"
                      title="Xem tháng trước"
                    >
                      <span className="font-medium text-left pl-1">{dayNum}</span>
                    </div>
                  );
                })}

                {/* Days in current month */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const isSelected = selectedDay === d;
                  const isToday = isTodayActive && d === 1;
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
                        <span
                          className={cn(
                            "text-xs font-bold",
                            isSelected
                              ? "text-primary"
                              : isToday
                              ? "text-primary"
                              : "text-gray-800"
                          )}
                        >
                          {d}
                        </span>
                        {isToday && (
                          <span className="text-[9px] bg-primary text-white px-1 rounded font-bold">
                            Nay
                          </span>
                        )}
                      </div>

                      {/* Day Events Dots / Badges */}
                      <div className="flex flex-wrap gap-1 items-center">
                        {dayEvts.map((evt, eIdx) => {
                          const style = CATEGORY_COLORS[evt.category] || { dot: "bg-primary" };
                          return (
                            <span
                              key={evt.id || eIdx}
                              className={cn("w-2 h-2 rounded-full ring-1 ring-white shadow-2xs", style.dot)}
                              title={`${evt.title} (${evt.category})`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Trailing days for next month */}
                {Array.from({ length: trailingDaysCount }).map((_, idx) => (
                  <div
                    key={`next-${idx}`}
                    onClick={handleNextMonth}
                    className="h-16 p-1 text-gray-300 hover:text-gray-400 text-xs flex flex-col justify-start cursor-pointer opacity-50"
                    title="Xem tháng sau"
                  >
                    <span className="font-medium text-left pl-1">{idx + 1}</span>
                  </div>
                ))}
              </div>

              {/* LEGEND */}
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-3 border-t border-gray-100 flex-wrap">
                <span className="font-bold text-gray-700">Chú thích:</span>
                {Object.entries(CATEGORY_COLORS).map(([cat, s]) => (
                  <span key={cat} className="flex items-center gap-1.5 font-medium">
                    <span className={cn("w-2 h-2 rounded-full", s.dot)} />
                    <span>{cat}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN: DAY DETAILS (5 COLS) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* FOCUSED DAY CARD */}
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
                      selectedDayEvents.length > 0
                        ? "bg-purple-100 text-primary"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {selectedDayEvents.length} Sự kiện
                  </span>
                </div>

                {/* DAY EVENT LIST */}
                {selectedDayEvents.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {selectedDayEvents.map((evt) => {
                      const style = CATEGORY_COLORS[evt.category] || {
                        bg: "bg-purple-50",
                        border: "border-purple-200",
                        text: "text-primary",
                      };

                      const currentRsvp = rsvpState[evt.id] || "tham-du";
                      const checkedInCount = evt.checkIns?.length || 0;
                      const isMeCheckedIn = evt.checkIns?.some((c) => c.memberName === "Minh Tuấn");

                      return (
                        <div
                          key={evt.id}
                          className={cn("p-4 rounded-2xl border transition-all space-y-3", style.bg, style.border)}
                        >
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className={cn("px-2.5 py-0.5 rounded-full text-[10px]", style.bg, style.text)}>
                              ⭐ {evt.category.toUpperCase()}
                            </span>
                            <span className="font-mono text-gray-700 font-bold">{evt.time}</span>
                          </div>

                          <div>
                            <h4 className="text-sm font-bold text-gray-900">{evt.title}</h4>
                            {evt.description && (
                              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                {evt.description}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              <span>{evt.location}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              <span>Người chủ trì: <b>{evt.organizer}</b></span>
                            </div>
                          </div>

                          {/* CHECK-IN INTEGRATION BADGE & ACTIONS */}
                          {evt.hasCheckIn && (
                            <div className="p-3 bg-white/90 rounded-xl border border-purple-100 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Điểm danh tham dự: {checkedInCount} có mặt
                                </span>
                                <button
                                  onClick={() => setQrModalEvent(evt)}
                                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                >
                                  <QrCode className="w-3 h-3" />
                                  <span>Mã QR Check-in</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                {isMeCheckedIn ? (
                                  <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Minh Tuấn đã điểm danh
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleUserCheckIn(evt.id)}
                                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition active:scale-95"
                                  >
                                    Điểm danh có mặt tôi
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* POLL INTEGRATION WIDGET */}
                          {evt.poll && (
                            <div className="p-3 bg-white/90 rounded-xl border border-purple-100 flex flex-col gap-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-800 flex items-center gap-1">
                                  <Vote className="w-3.5 h-3.5 text-purple-600" />
                                  Biểu quyết: {evt.poll.question}
                                </span>
                              </div>

                              <div className="space-y-1.5">
                                {evt.poll.options.map((opt) => {
                                  const totalVotes = evt.poll!.options.reduce((s, o) => s + o.votes.length, 0);
                                  const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                                  const isMyVote = opt.votes.includes("Minh Tuấn");

                                  return (
                                    <button
                                      key={opt.id}
                                      onClick={() => voteEventPoll(evt.id, evt.poll!.id, opt.id, "Minh Tuấn")}
                                      className={cn(
                                        "w-full text-left p-2 rounded-lg text-xs border transition relative overflow-hidden flex items-center justify-between",
                                        isMyVote
                                          ? "border-primary bg-purple-50/80 font-bold text-primary"
                                          : "border-gray-200 hover:border-purple-200 bg-white text-gray-700"
                                      )}
                                    >
                                      {/* Background progress fill */}
                                      <div
                                        className="absolute left-0 top-0 bottom-0 bg-purple-100/40 -z-0"
                                        style={{ width: `${pct}%` }}
                                      />
                                      <span className="relative z-10 truncate pr-2">
                                        {isMyVote ? "✓ " : ""}{opt.text}
                                      </span>
                                      <span className="relative z-10 text-[10px] font-mono font-bold shrink-0">
                                        {opt.votes.length} ({pct}%)
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* RSVP BUTTONS */}
                          <div className="pt-2 border-t border-purple-100/60">
                            <span className="text-[11px] font-bold text-gray-500 block mb-2">
                              Xác nhận hiện diện (RSVP):
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                onClick={() => {
                                  setRsvpState((prev) => ({ ...prev, [evt.id]: "tham-du" }));
                                  showToast("success", "Đã xác nhận tham dự!");
                                }}
                                className={cn(
                                  "py-1.5 rounded-xl text-xs font-bold transition",
                                  currentRsvp === "tham-du"
                                    ? "bg-primary text-white shadow-2xs"
                                    : "bg-white text-gray-700 border hover:bg-gray-50"
                                )}
                              >
                                Tham dự
                              </button>
                              <button
                                onClick={() => {
                                  setRsvpState((prev) => ({ ...prev, [evt.id]: "vang" }));
                                  showToast("info", "Đã ghi nhận vắng có phép.");
                                }}
                                className={cn(
                                  "py-1.5 rounded-xl text-xs font-bold transition",
                                  currentRsvp === "vang"
                                    ? "bg-rose-600 text-white shadow-2xs"
                                    : "bg-white text-gray-700 border hover:bg-gray-50"
                                )}
                              >
                                Vắng phép
                              </button>
                              <button
                                onClick={() => {
                                  setRsvpState((prev) => ({ ...prev, [evt.id]: "chua-ro" }));
                                  showToast("info", "Đã ghi nhận trạng thái chưa rõ.");
                                }}
                                className={cn(
                                  "py-1.5 rounded-xl text-xs font-bold transition",
                                  currentRsvp === "chua-ro"
                                    ? "bg-amber-600 text-white shadow-2xs"
                                    : "bg-white text-gray-700 border hover:bg-gray-50"
                                )}
                              >
                                Chưa rõ
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                    <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-gray-600">
                      Ngày {selectedDay}/{currentMonth + 1} chưa có sự kiện lên lịch
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Anh em duy trì các giờ kinh tối và sinh hoạt thường nhật.
                    </p>
                    <button
                      onClick={() => setIsAddEventModalOpen(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 text-primary text-xs font-bold hover:bg-purple-200 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tạo sự kiện ngày này</span>
                    </button>
                  </div>
                )}

                {/* DAILY DUTIES */}
                <div className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800 mb-2">
                    <span>🧹 Phân công trực nhật ngày {selectedDay}/{currentMonth + 1}</span>
                    <span className="text-emerald-700 font-bold">3 Ca</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-100">
                      <span className="text-gray-500">Trực cổng &amp; Quét sân:</span>
                      <span className="font-bold text-gray-900">Minh Tuấn</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-100">
                      <span className="text-gray-500">Đi chợ &amp; Nấu trưa:</span>
                      <span className="font-bold text-gray-900">Đình Khôi</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-100">
                      <span className="text-gray-500">Rửa bát &amp; Dọn tối:</span>
                      <span className="font-bold text-gray-900">Hoàng Nam, Văn Bình</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: DEDICATED CHECK-IN & ATTENDANCE VIEW */}
      {/* ======================================================== */}
      {activeTab === "checkin" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Sự kiện có điểm danh
                </span>
                <div className="text-2xl font-black text-gray-900 mt-1">{eventsWithCheckIn.length}</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Tỉ lệ có mặt trung bình
                </span>
                <div className="text-2xl font-black text-emerald-600 mt-1">92.5%</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Check-in của bạn (Minh Tuấn)
                </span>
                <div className="text-2xl font-black text-primary mt-1">Đầy đủ 100%</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* EVENTS LIST WITH FULL CHECK-IN ROSTER */}
          <div className="space-y-6">
            {eventsWithCheckIn.map((evt) => {
              const checkIns = evt.checkIns || [];
              const presentCount = checkIns.filter((c) => c.status === "present").length;
              const lateCount = checkIns.filter((c) => c.status === "late").length;
              const totalMembers = members.length;
              const pct = Math.round(((presentCount + lateCount) / totalMembers) * 100);
              const isMeCheckedIn = checkIns.some((c) => c.memberName === "Minh Tuấn");

              return (
                <div
                  key={evt.id}
                  className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm flex flex-col gap-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-primary text-[10px] font-bold">
                          {evt.category}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          📅 {evt.date} • 🕒 {evt.time} • 📍 {evt.location}
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-gray-900 mt-1">{evt.title}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQrModalEvent(evt)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 transition"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Mã QR Điểm danh</span>
                      </button>

                      {isMeCheckedIn ? (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                          <Check className="w-4 h-4" />
                          <span>Bạn đã có mặt</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleUserCheckIn(evt.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 active:scale-95 transition"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Check-in có mặt tôi</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Attendance Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-gray-700">
                        Tiến độ điểm danh: <b className="text-primary">{presentCount + lateCount}/{totalMembers}</b> anh em ({pct}%)
                      </span>
                      <span className="text-gray-500 text-[11px]">
                        {presentCount} đúng giờ • {lateCount} đi muộn
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-600 to-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Attendance List Table */}
                  <div className="overflow-x-auto custom-scroll">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-bold">
                          <th className="py-2 px-3">Thành viên</th>
                          <th className="py-2 px-3">Phòng</th>
                          <th className="py-2 px-3">Giờ Check-in</th>
                          <th className="py-2 px-3">Trạng thái</th>
                          <th className="py-2 px-3">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {checkIns.map((rec) => (
                          <tr key={rec.memberId} className="hover:bg-purple-50/30">
                            <td className="py-2 px-3 font-bold text-gray-900 flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-purple-100 text-primary font-bold text-[10px] flex items-center justify-center">
                                {rec.memberName.charAt(0)}
                              </span>
                              <span>{rec.memberName}</span>
                            </td>
                            <td className="py-2 px-3 text-gray-600 font-mono">{rec.room || "Lưu Xá"}</td>
                            <td className="py-2 px-3 text-gray-700 font-mono">{rec.checkedInAt}</td>
                            <td className="py-2 px-3">
                              {rec.status === "present" ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                                  Có mặt
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px]">
                                  Đi muộn
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-gray-500 italic">{rec.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: DEDICATED POLLS & VOTING VIEW */}
      {/* ======================================================== */}
      {activeTab === "polls" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-purple-50 shadow-xs">
            <div>
              <h2 className="text-base font-black text-gray-900">
                Các Cuộc Biểu Quyết Đang Diễn Ra
              </h2>
              <p className="text-xs text-gray-500">
                Lấy ý kiến tập thể anh em Lưu Xá cho các quyết định chung, chọn lịch họp và phương án dã ngoại
              </p>
            </div>
            <button
              onClick={() => setIsCreatePollModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-[#4d2dbf] active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo biểu quyết mới</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {eventsWithPoll.map((evt) => {
              if (!evt.poll) return null;
              const poll = evt.poll;
              const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);

              return (
                <div
                  key={poll.id}
                  className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm flex flex-col justify-between gap-5 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-primary text-[10px] font-bold">
                        {evt.title} ({evt.date})
                      </span>
                      <span className="text-[11px] font-mono text-gray-400">
                        {totalVotes} lượt vote
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold text-gray-900 leading-snug">
                      {poll.question}
                    </h3>

                    {/* Options Voting */}
                    <div className="space-y-2 pt-2">
                      {poll.options.map((opt) => {
                        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                        const isMyVote = opt.votes.includes("Minh Tuấn");

                        return (
                          <div
                            key={opt.id}
                            onClick={() => voteEventPoll(evt.id, poll.id, opt.id, "Minh Tuấn")}
                            className={cn(
                              "p-3 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col gap-1.5 group/opt",
                              isMyVote
                                ? "border-primary bg-purple-50/90 shadow-2xs"
                                : "border-gray-200 hover:border-purple-300 bg-white"
                            )}
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-purple-100/60 -z-0"
                              style={{ width: `${pct}%` }}
                            />

                            <div className="relative z-10 flex items-center justify-between text-xs font-bold">
                              <span className={cn(isMyVote ? "text-primary font-black" : "text-gray-900")}>
                                {isMyVote ? "✓ " : ""}{opt.text}
                              </span>
                              <span className="font-mono text-primary text-xs shrink-0">
                                {opt.votes.length} ({pct}%)
                              </span>
                            </div>

                            {opt.votes.length > 0 && (
                              <div className="relative z-10 flex items-center gap-1 overflow-hidden pt-1">
                                <span className="text-[10px] text-gray-400">Đã vote:</span>
                                <span className="text-[10px] text-gray-600 truncate font-medium">
                                  {opt.votes.join(", ")}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-gray-400">
                      Tạo ngày {poll.createdAt}
                    </span>
                    <button
                      onClick={() => handleCopyPollZalo(evt)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition active:scale-95"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Copy Zalo</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. MODALS */}
      {/* ======================================================== */}

      {/* MODAL 1: QR CODE CHECK-IN */}
      {qrModalEvent &&
        mounted &&
        createPortal(
          <div
            onClick={() => setQrModalEvent(null)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-purple-50 text-center flex flex-col items-center gap-4 my-auto"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-purple-100">
                    Mã QR Check-in
                  </span>
                  <button
                    onClick={() => setQrModalEvent(null)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-gray-900">{qrModalEvent.title}</h3>
                  <p className="text-xs text-gray-500">
                    {qrModalEvent.date} • {qrModalEvent.time}
                  </p>
                </div>

                {/* Simulated High-Res QR SVG Box */}
                <div className="p-4 bg-white border-4 border-purple-600 rounded-3xl shadow-md flex items-center justify-center">
                  <svg className="w-44 h-44 text-gray-900" viewBox="0 0 100 100" fill="currentColor">
                    <rect x="5" y="5" width="25" height="25" fill="#5f3add" rx="4" />
                    <rect x="10" y="10" width="15" height="15" fill="#ffffff" rx="2" />
                    <rect x="14" y="14" width="7" height="7" fill="#5f3add" />
                    <rect x="70" y="5" width="25" height="25" fill="#5f3add" rx="4" />
                    <rect x="75" y="10" width="15" height="15" fill="#ffffff" rx="2" />
                    <rect x="79" y="14" width="7" height="7" fill="#5f3add" />
                    <rect x="5" y="70" width="25" height="25" fill="#5f3add" rx="4" />
                    <rect x="10" y="75" width="15" height="15" fill="#ffffff" rx="2" />
                    <rect x="14" y="79" width="7" height="7" fill="#5f3add" />
                    {/* Pattern dots */}
                    <circle cx="45" cy="15" r="3" fill="#5f3add" />
                    <circle cx="55" cy="25" r="3" fill="#5f3add" />
                    <circle cx="40" cy="45" r="4" fill="#5f3add" />
                    <circle cx="50" cy="50" r="5" fill="#5f3add" />
                    <circle cx="60" cy="45" r="4" fill="#5f3add" />
                    <circle cx="45" cy="75" r="3" fill="#5f3add" />
                    <circle cx="75" cy="55" r="4" fill="#5f3add" />
                    <circle cx="85" cy="75" r="3" fill="#5f3add" />
                  </svg>
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-800">Quét bằng Camera điện thoại hoặc Zalo</p>
                  <p className="text-[11px]">Mã bí mật điểm danh: <b className="font-mono text-primary">LX-OCT26-ASSISI</b></p>
                </div>

                <button
                  onClick={() => {
                    handleUserCheckIn(qrModalEvent.id);
                    setQrModalEvent(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] shadow-xs active:scale-95 transition"
                >
                  Xác nhận tôi đã có mặt tại đây
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL 2: CREATE POLL */}
      {isCreatePollModalOpen &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsCreatePollModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col overflow-hidden my-auto p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Vote className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-black text-gray-900">Tạo Cuộc Biểu Quyết Mới</h3>
                  </div>
                  <button
                    onClick={() => setIsCreatePollModalOpen(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreatePollSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Chọn sự kiện liên kết:
                    </label>
                    <select
                      value={pollSelectedEventId}
                      onChange={(e) => setPollSelectedEventId(e.target.value)}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white font-medium"
                    >
                      <option value="">-- Chọn sự kiện --</option>
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} ({e.date})
                        </option>
                      ))}
                    </select>
                  </div>

                  <CustomInput
                    label="Câu hỏi biểu quyết"
                    placeholder="VD: Anh em chọn ngày nào thuận tiện để dã ngoại?"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    required
                  />

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Các phương án lựa chọn:
                    </label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder={`Phương án ${idx + 1}...`}
                            value={opt}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPollOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
                            }}
                            className="flex-1 p-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none"
                            required
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => [...prev, ""])}
                      className="mt-2 text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm phương án</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsCreatePollModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                    >
                      Xuất bản biểu quyết
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL 3: CUSTOM ADD EVENT (WITH CHECKIN & POLL) */}
      {isAddEventModalOpen &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsAddEventModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
              >
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-black text-gray-900">Tạo Sự Kiện Lưu Xá Mới</h3>
                  </div>
                  <button
                    onClick={() => setIsAddEventModalOpen(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateNewEvent} className="p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
                  <CustomInput
                    label="Tên sự kiện / Hoạt động"
                    placeholder="VD: Họp Ban Đại diện Lưu Xá mở rộng"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <CustomDatePicker
                      label="Ngày diễn ra"
                      placeholder="Chọn ngày..."
                      value={newEventDate}
                      onChange={setNewEventDate}
                      required
                    />

                    <CustomInput
                      label="Giờ bắt đầu"
                      placeholder="VD: 19:30 tối"
                      value={newEventTime}
                      onChange={(e) => setNewEventTime(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Chủ đề sự kiện
                      </label>
                      <select
                        value={newEventCategory}
                        onChange={(e) => setNewEventCategory(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white font-medium"
                      >
                        <option value="Họp nhà">Họp nhà</option>
                        <option value="Phụng vụ">Phụng vụ</option>
                        <option value="Bổn mạng">Bổn mạng</option>
                        <option value="Dã ngoại">Dã ngoại</option>
                        <option value="Sinh hoạt">Sinh hoạt</option>
                      </select>
                    </div>

                    <CustomInput
                      label="Địa điểm tổ chức"
                      placeholder="VD: Phòng T2"
                      value={newEventLocation}
                      onChange={(e) => setNewEventLocation(e.target.value)}
                      required
                    />
                  </div>

                  <CustomInput
                    label="Người chủ trì / Ban tổ chức"
                    placeholder="VD: Trần Văn Đức (Trưởng nhà)"
                    value={newEventOrganizer}
                    onChange={(e) => setNewEventOrganizer(e.target.value)}
                    required
                  />

                  <CustomTextarea
                    label="Mô tả nội dung &amp; chương trình"
                    placeholder="Nêu rõ mục đích cuộc họp hoặc hoạt động..."
                    value={newEventDescription}
                    onChange={(e) => setNewEventDescription(e.target.value)}
                    rows={2}
                  />

                  {/* Toggle Check-in */}
                  <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-900 block">Kích hoạt Điểm danh (Check-in)</span>
                      <span className="text-[11px] text-gray-500">Cho phép anh em quét QR hoặc check-in 1-chạm</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={newEventHasCheckIn}
                      onChange={(e) => setNewEventHasCheckIn(e.target.checked)}
                      className="w-4 h-4 text-primary rounded accent-primary"
                    />
                  </div>

                  {/* Toggle Poll */}
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-gray-900 block">Tạo cuộc biểu quyết (Vote)</span>
                        <span className="text-[11px] text-gray-500">Lấy ý kiến tập thể cho cuộc họp</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={newEventHasPoll}
                        onChange={(e) => setNewEventHasPoll(e.target.checked)}
                        className="w-4 h-4 text-primary rounded accent-primary"
                      />
                    </div>

                    {newEventHasPoll && (
                      <div className="pt-2 space-y-2">
                        <input
                          type="text"
                          placeholder="Câu hỏi biểu quyết..."
                          value={newEventPollQuestion}
                          onChange={(e) => setNewEventPollQuestion(e.target.value)}
                          className="w-full p-2 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Phương án 1..."
                            value={newEventPollOptions[0]}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewEventPollOptions((prev) => [val, prev[1]]);
                            }}
                            className="p-2 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-primary outline-none"
                          />
                          <input
                            type="text"
                            placeholder="Phương án 2..."
                            value={newEventPollOptions[1]}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewEventPollOptions((prev) => [prev[0], val]);
                            }}
                            className="p-2 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-primary outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsAddEventModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                    >
                      Lưu sự kiện
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
