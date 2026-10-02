"use client";

import React, { useState } from "react";
import {
  Wrench,
  AlertTriangle,
  Clock,
  Plus,
  CheckCircle,
  Package,
  Check,
  X,
  Share2,
  Sparkles,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Camera,
  Upload,
  ArrowRightLeft,
  Copy,
  User,
  Eye,
  ThumbsUp,
  ShieldCheck,
  Filter,
  ExternalLink,
  ChevronRight,
  Send,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { formatVND } from "@/lib/utils";
import HauCanLoading from "./loading";
import { CleaningDuty } from "@/lib/mockData";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { ImageUploadDropzone } from "@/components/ui/FormControls";

const SLOTS = [
  "06:00 – 08:00",
  "08:00 – 10:00",
  "10:00 – 12:00",
  "14:00 – 16:00",
  "16:00 – 18:00",
  "18:00 – 20:00",
  "20:00 – 22:00",
];

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const SAMPLE_CLEANING_PHOTOS = [
  { label: "Nhà tắm & WC sáng bóng", url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80" },
  { label: "Cầu thang & Hành lang sạch", url: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80" },
  { label: "Gian bếp & Bàn ăn ngăn nắp", url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80" },
  { label: "Nguyện đường & Phòng sinh hoạt", url: "https://images.unsplash.com/photo-1548625361-19597c4568e6?auto=format&fit=crop&w=800&q=80" },
];

export default function HauCanPage() {
  const {
    issues,
    updateIssueStatus,
    openModal,
    laundryBookings,
    bookLaundry,
    cancelLaundry,
    showToast,
    isLoadingSkeleton,
    cleaningDuties,
    checkInCleaningDuty,
    reviewCleaningDuty,
    swapCleaningDuty,
    addCleaningDuty,
    currentRole,
    members,
  } = useApp();

  const canReviewDuties = ["Trưởng nhà", "Phó nhà", "Admin"].includes(currentRole);

  const [activeTab, setActiveTab] = useState<"truc-nhat" | "bao-hong" | "may-giat" | "muon-do">("truc-nhat");
  const [selectedIssueId, setSelectedIssueId] = useState<string>(issues[0]?.id || "LOG-108");

  // Cleaning Duty Filters
  const [dayFilter, setDayFilter] = useState<string>("Tất cả");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "submitted" | "approved" | "rejected">("all");

  // Modals for Cleaning Duty
  const [checkInTarget, setCheckInTarget] = useState<CleaningDuty | null>(null);
  const [checkInMemberName, setCheckInMemberName] = useState<string>("");
  const [checkInNote, setCheckInNote] = useState<string>("");
  const [checkInPhotoUrl, setCheckInPhotoUrl] = useState<string>(SAMPLE_CLEANING_PHOTOS[0].url);
  const [checkInTasks, setCheckInTasks] = useState({
    scrubbed: true,
    trashEmptied: true,
    mirrorsCleaned: true,
    restocked: true,
  });

  const [reviewTarget, setReviewTarget] = useState<CleaningDuty | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState<string>("");

  const [swapTarget, setSwapTarget] = useState<CleaningDuty | null>(null);
  const [swapFrom, setSwapFrom] = useState<string>("");
  const [swapTo, setSwapTo] = useState<string>("");
  const [swapReason, setSwapReason] = useState<string>("");

  const [isAddDutyModalOpen, setIsAddDutyModalOpen] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [newAreaIcon, setNewAreaIcon] = useState("🧹");
  const [newDay, setNewDay] = useState<CleaningDuty["dayOfWeek"]>("Thứ Hai");
  const [newRoom, setNewRoom] = useState("Phòng 201");
  const [newMembersStr, setNewMembersStr] = useState("");
  const [newShift, setNewShift] = useState<CleaningDuty["shift"]>("Ca Sáng (06:30)");

  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; title: string } | null>(null);

  // Equipment borrowing
  const [borrowItems, setBorrowItems] = useState([
    { id: 1, name: "Máy chiếu Full HD", loc: "Phòng sinh hoạt T2", status: "Có sẵn", borrower: "", icon: "📽️" },
    { id: 2, name: "Máy khoan cầm tay & Mũi khoan", loc: "Tủ đồ nghề T1", status: "Đang mượn", borrower: "Văn Đức (Trả 18:00)", icon: "🔩" },
    { id: 3, name: "Thang nhôm rút 3.8m", loc: "Gầm cầu thang", status: "Có sẵn", borrower: "", icon: "🪜" },
    { id: 4, name: "Ổ cắm dài 10m chịu tải", loc: "Phòng khách T1", status: "Có sẵn", borrower: "", icon: "⚡" },
    { id: 5, name: "Loa kéo bluetooth & 2 Mic", loc: "Nguyện đường T3", status: "Có sẵn", borrower: "", icon: "🎤" },
  ]);

  if (isLoadingSkeleton) {
    return <HauCanLoading />;
  }

  // Filtered Cleaning Duties
  const filteredDuties = cleaningDuties.filter((d) => {
    if (dayFilter === "Hôm nay" && d.dayOfWeek !== "Thứ Sáu") return false;
    if (dayFilter !== "Tất cả" && dayFilter !== "Hôm nay" && d.dayOfWeek !== dayFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return true;
  });

  // Derived metrics for Cleaning Duties
  const todayDuties = cleaningDuties.filter((d) => d.dayOfWeek === "Thứ Sáu" || d.dateStr === "02/10/2026");
  const approvedCount = cleaningDuties.filter((d) => d.status === "approved").length;
  const submittedCount = cleaningDuties.filter((d) => d.status === "submitted").length;
  const pendingCount = cleaningDuties.filter((d) => d.status === "pending").length;
  const totalDuties = cleaningDuties.length;
  const completionRate = totalDuties > 0 ? Math.round((approvedCount / totalDuties) * 100) : 0;

  const handleToggleBorrow = (id: number) => {
    setBorrowItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const isAvail = item.status === "Có sẵn";
          showToast(
            "success",
            isAvail ? `Đã ghi nhận mượn ${item.name} thành công!` : `Đã hoàn trả ${item.name} vào kho!`
          );
          return {
            ...item,
            status: isAvail ? "Đang mượn" : "Có sẵn",
            borrower: isAvail ? "Bạn (Đang mượn)" : "",
          };
        }
        return item;
      })
    );
  };

  const handleCopyDutyScheduleZalo = async () => {
    const lines = [
      "🧹 BẢNG PHÂN CÔNG & CHECK-IN TRỰC NHẬT TUẦN · LƯU XÁ PHANXICÔ",
      `📅 Cập nhật ngày: ${new Date().toLocaleDateString("vi-VN")}`,
      "------------------------------------",
    ];

    cleaningDuties.forEach((d) => {
      const statusIcon = d.status === "approved" ? "✅ Đã nghiệm thu Đạt" : d.status === "submitted" ? "🕒 Đã dọn - Chờ duyệt" : "⏳ Chưa trực";
      lines.push(`• [${d.dayOfWeek} · ${d.shift}] ${d.area} (${d.assignedRoom})`);
      lines.push(`  Người trực: ${d.assignedMembers.join(", ")} 👉 ${statusIcon}`);
    });

    lines.push("------------------------------------");
    lines.push("🔔 Nhắc nhở: Anh em hoàn thành ca trực vui lòng chụp ảnh nghiệm thu và bấm Check-in trên web Lưu Xá đúng giờ.");
    lines.push("Nguyện chúc bình an và tinh thần phục vụ huynh đệ! ✝️");

    const text = lines.join("\n");
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", "Đã sao chép lịch trực nhật Zalo! Hãy dán (Ctrl+V) vào nhóm chung.");
    } else {
      showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
    }
  };

  const handleOpenCheckInModal = (duty: CleaningDuty) => {
    setCheckInTarget(duty);
    setCheckInMemberName(duty.assignedMembers[0] || (members[0]?.fullName || "Tôi"));
    setCheckInNote(`Đã cọ sạch sàn, đổ rác và lau dọn ${duty.area} ngăn nắp.`);
    setCheckInPhotoUrl(SAMPLE_CLEANING_PHOTOS[0].url);
  };

  const handleConfirmCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInTarget) return;
    const taskDetails = [
      checkInTasks.scrubbed && "Đã cọ rửa sàn/bồn",
      checkInTasks.trashEmptied && "Đã gom và đổ rác",
      checkInTasks.mirrorsCleaned && "Đã lau gương/bề mặt",
      checkInTasks.restocked && "Đã bổ sung vật tư",
    ].filter(Boolean).join(" · ");

    const fullNote = checkInNote ? `${checkInNote} (${taskDetails})` : taskDetails;
    checkInCleaningDuty(checkInTarget.id, checkInMemberName, fullNote, checkInPhotoUrl);
    setCheckInTarget(null);
  };

  const handleOpenReviewModal = (duty: CleaningDuty) => {
    setReviewTarget(duty);
    setReviewDecision("approved");
    setReviewNote("Rất sạch sẽ, thơm tho, đạt chuẩn vệ sinh quy định của Lưu Xá.");
  };

  const handleConfirmReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    reviewCleaningDuty(reviewTarget.id, reviewDecision, "Ban Quản Lý Lưu Xá", reviewNote);
    setReviewTarget(null);
  };

  const handleOpenSwapModal = (duty: CleaningDuty) => {
    setSwapTarget(duty);
    setSwapFrom(duty.assignedMembers[0] || "");
    const otherMembers = members.filter((m) => !duty.assignedMembers.includes(m.fullName));
    setSwapTo(otherMembers[0]?.fullName || "");
    setSwapReason("Bận lịch học và thi kết thúc môn");
  };

  const handleConfirmSwap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapTarget || !swapFrom || !swapTo) return;
    swapCleaningDuty(swapTarget.id, swapFrom, swapTo, swapReason);
    setSwapTarget(null);
  };

  const handleConfirmAddDuty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArea.trim()) {
      showToast("error", "Vui lòng nhập tên khu vực vệ sinh.");
      return;
    }
    const parsedMembers = newMembersStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    addCleaningDuty({
      dayOfWeek: newDay,
      dateStr: "Tuần này",
      area: newArea,
      areaIcon: newAreaIcon,
      assignedRoom: newRoom,
      assignedMembers: parsedMembers.length > 0 ? parsedMembers : ["Tất cả thành viên"],
      shift: newShift,
      status: "pending",
    });

    setIsAddDutyModalOpen(false);
    setNewArea("");
    setNewMembersStr("");
  };

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) || issues[0];

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-purple-50 shadow-xs">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Đời Sống &amp; Trách Nhiệm Cộng Đoàn · Lưu Xá Phanxicô</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
            Hậu Cần, Trực Nhật &amp; Kỹ Thuật
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Phân công dọn vệ sinh, nghiệm thu ca trực, báo hỏng cơ sở vật chất và mượn thiết bị dùng chung.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "truc-nhat" && (
            <>
              <button
                onClick={handleCopyDutyScheduleZalo}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs border border-purple-200 transition shadow-2xs active:scale-95"
                title="Sao chép lịch phân công trực nhật gửi vào Zalo"
              >
                <Copy className="w-4 h-4 text-primary" />
                <span>Copy Zalo</span>
              </button>
              {canReviewDuties && (
                <button
                  onClick={() => setIsAddDutyModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Phân công ca mới</span>
                </button>
              )}
            </>
          )}

          {activeTab === "bao-hong" && (
            <button
              onClick={() => openModal("reportIssue")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Báo hỏng mới</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex gap-2 border-b border-purple-100 pb-2 overflow-x-auto custom-scroll">
        <button
          onClick={() => setActiveTab("truc-nhat")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "truc-nhat"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-purple-50 hover:text-primary"
          }`}
        >
          <span>🧹 Phân công Trực nhật &amp; Vệ sinh</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === "truc-nhat" ? "bg-white/20 text-white" : "bg-purple-100 text-primary"}`}>
            {todayDuties.length} ca hôm nay
          </span>
        </button>

        <button
          onClick={() => setActiveTab("bao-hong")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "bao-hong"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-purple-50 hover:text-primary"
          }`}
        >
          <span>🔧 Báo hỏng &amp; Sự cố</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === "bao-hong" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"}`}>
            {issues.filter((i) => i.status !== "Đã xong").length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("may-giat")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "may-giat"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-purple-50 hover:text-primary"
          }`}
        >
          <span>🧺 Lịch máy giặt</span>
          <span className="text-[10px] text-gray-400">(3/4 ca)</span>
        </button>

        <button
          onClick={() => setActiveTab("muon-do")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === "muon-do"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-purple-50 hover:text-primary"
          }`}
        >
          <span>📦 Mượn đồ chung</span>
          <span className="text-[10px] text-gray-400">(5 món)</span>
        </button>
      </div>

      {/* TAB 0: TRỰC NHẬT & VỆ SINH */}
      {activeTab === "truc-nhat" && (
        <div className="flex flex-col gap-6">
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase">Ca trực hôm nay</span>
                <div className="text-xl sm:text-2xl font-black text-gray-900 mt-0.5">
                  {todayDuties.length} ca
                </div>
                <span className="text-[10px] text-primary font-semibold">Thứ Sáu (02/10)</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold text-lg">
                🧹
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase">Đã nghiệm thu</span>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">
                  {approvedCount} ca
                </div>
                <span className="text-[10px] text-gray-400">Đạt chuẩn sạch sẽ</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                ✅
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase">Chờ nghiệm thu</span>
                <div className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">
                  {submittedCount} ca
                </div>
                <span className="text-[10px] text-gray-400">Đã gửi ảnh check-in</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                🕒
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase">Tiến độ tuần</span>
                <div className="text-xl sm:text-2xl font-black text-primary mt-0.5">
                  {completionRate}%
                </div>
                <span className="text-[10px] text-gray-400">{approvedCount}/{totalDuties} ca hoàn thành</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold text-lg">
                📊
              </div>
            </div>
          </div>

          {/* FILTERS & DAY SELECTOR */}
          <div className="bg-white p-4 rounded-3xl border border-purple-50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Day of Week Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 md:pb-0">
              <span className="text-xs font-bold text-gray-400 shrink-0 mr-1">Ngày:</span>
              {["Tất cả", "Hôm nay", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chúa Nhật"].map((day) => {
                const isSelected = dayFilter === day;
                return (
                  <button
                    key={day}
                    onClick={() => setDayFilter(day)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      isSelected
                        ? "bg-primary text-white shadow-2xs"
                        : "bg-surface-container-low text-gray-600 hover:bg-purple-100 hover:text-primary"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-bold text-gray-400">Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface-container-low border border-purple-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">⏳ Chờ trực</option>
                <option value="submitted">🕒 Chờ nghiệm thu</option>
                <option value="approved">✅ Đã nghiệm thu (Đạt)</option>
                <option value="rejected">⚠️ Yêu cầu dọn lại</option>
              </select>
            </div>
          </div>

          {/* DUTY CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDuties.map((duty) => {
              const isApproved = duty.status === "approved";
              const isSubmitted = duty.status === "submitted";
              const isRejected = duty.status === "rejected";

              return (
                <div
                  key={duty.id}
                  className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                    isApproved
                      ? "border-emerald-200 bg-emerald-50/10"
                      : isSubmitted
                      ? "border-amber-200 bg-amber-50/10"
                      : isRejected
                      ? "border-rose-200 bg-rose-50/10"
                      : "border-purple-100 hover:border-purple-300"
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl p-2 rounded-2xl bg-purple-50 text-purple-700">
                          {duty.areaIcon}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 leading-snug">
                            {duty.area}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                            <span className="font-semibold text-primary">{duty.dayOfWeek}</span>
                            <span>•</span>
                            <span>{duty.shift}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 border ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : isSubmitted
                            ? "bg-amber-100 text-amber-800 border-amber-200 animate-pulse"
                            : isRejected
                            ? "bg-rose-100 text-rose-800 border-rose-200"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {isApproved
                          ? "✅ Đạt chuẩn"
                          : isSubmitted
                          ? "🕒 Chờ nghiệm thu"
                          : isRejected
                          ? "⚠️ Cần dọn lại"
                          : "⏳ Chờ trực"}
                      </span>
                    </div>

                    {/* Assigned Room & Members */}
                    <div className="p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50/60 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 font-medium">Phòng phụ trách:</span>
                        <span className="font-bold text-gray-900">{duty.assignedRoom}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 font-medium">Người trực:</span>
                        <span className="font-bold text-primary truncate max-w-[180px]">
                          {duty.assignedMembers.join(", ")}
                        </span>
                      </div>
                    </div>

                    {/* Check-in Info & Notes */}
                    {(duty.checkInTime || duty.checkInNote) && (
                      <div className="p-3 rounded-2xl bg-purple-50/40 border border-purple-100/60 text-xs flex flex-col gap-1">
                        {duty.checkInTime && (
                          <div className="flex items-center justify-between text-[11px] text-purple-900 font-semibold">
                            <span>🕒 Check-in lúc {duty.checkInTime}</span>
                            <span>bởi {duty.checkInBy}</span>
                          </div>
                        )}
                        {duty.checkInNote && (
                          <p className="text-gray-600 text-[11px] italic mt-0.5 line-clamp-2">
                            "{duty.checkInNote}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Evidence Photo Preview Thumbnail */}
                    {duty.evidencePhoto && (
                      <div className="flex items-center justify-between p-2 rounded-2xl bg-gray-50 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <img
                            src={duty.evidencePhoto}
                            alt="Ảnh nghiệm thu"
                            className="w-10 h-10 rounded-xl object-cover border border-purple-200 cursor-pointer hover:opacity-80 transition"
                            onClick={() => setLightboxPhoto({ url: duty.evidencePhoto!, title: `${duty.area} - ${duty.dayOfWeek}` })}
                          />
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-800">Ảnh nghiệm thu</span>
                            <span className="text-[10px] text-gray-400">Đã đính kèm bằng chứng</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLightboxPhoto({ url: duty.evidencePhoto!, title: `${duty.area} - ${duty.dayOfWeek}` })}
                          className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem ảnh</span>
                        </button>
                      </div>
                    )}

                    {/* Review Note from Admin */}
                    {duty.reviewerName && (
                      <div className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/60 text-[11px] text-emerald-950 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-bold">{duty.reviewerName}: </span>
                          <span>{duty.reviewNote || "Nghiệm thu đạt chuẩn"} ({duty.reviewedAt})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACTION BUTTONS FOOTER */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                    {/* Check-in button */}
                    {duty.status !== "approved" && (
                      <button
                        onClick={() => handleOpenCheckInModal(duty)}
                        className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{duty.status === "submitted" ? "Cập nhật Check-in" : "Check-in đã dọn"}</span>
                      </button>
                    )}

                    {/* Admin Review Button */}
                    {canReviewDuties && duty.status === "submitted" && (
                      <button
                        onClick={() => handleOpenReviewModal(duty)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Nghiệm thu</span>
                      </button>
                    )}

                    {/* Swap Duty Button */}
                    {duty.status !== "approved" && (
                      <button
                        onClick={() => handleOpenSwapModal(duty)}
                        className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition active:scale-95"
                        title="Xin đổi ca trực nhật này"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
                    )}

                    {/* If Approved, show full completion note */}
                    {duty.status === "approved" && (
                      <div className="flex-1 py-1.5 text-center text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                        ✨ Hoàn thành xuất sắc
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredDuties.length === 0 && (
            <div className="bg-white rounded-3xl p-12 text-center border border-purple-50 flex flex-col items-center justify-center gap-3">
              <span className="text-4xl">🧹</span>
              <h3 className="text-base font-bold text-gray-800">Không có ca trực nào phù hợp</h3>
              <p className="text-xs text-gray-500">Hãy thử đổi bộ lọc ngày hoặc trạng thái ở trên.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: BÁO HỎNG */}
      {activeTab === "bao-hong" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ISSUE LIST (7 COLS) */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Danh sách sự cố &amp; sửa chữa</h2>
              <span className="text-xs text-gray-400">Cập nhật lúc 15:42</span>
            </div>

            <div className="space-y-3">
              {issues.map((i) => {
                const isSelected = i.id === selectedIssue?.id;
                const isDone = i.status === "Đã xong";

                return (
                  <div
                    key={i.id}
                    onClick={() => setSelectedIssueId(i.id)}
                    className={`p-4 rounded-2xl cursor-pointer transition border ${
                      isSelected
                        ? "bg-purple-50/70 border-primary shadow-xs"
                        : "bg-surface-container-low/50 hover:bg-surface-container-low border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            i.status === "Mới tiếp nhận"
                              ? "bg-rose-100 text-rose-700"
                              : i.status === "Đang xử lý"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {i.status}
                        </span>
                        <span className="text-[11px] font-mono text-gray-400">#{i.id}</span>
                      </div>
                      <span className="text-[11px] text-gray-400">{i.date}</span>
                    </div>

                    <h3 className="text-sm font-bold text-gray-900">{i.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{i.description}</p>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-purple-50 text-xs text-gray-400">
                      <span>Vị trí: <b>{i.location}</b></span>
                      <span>Báo bởi: <b>{i.reportedBy}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ISSUE DETAIL VIEW (5 COLS) */}
          {selectedIssue && (
            <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    selectedIssue.status === "Mới tiếp nhận"
                      ? "bg-rose-100 text-rose-700"
                      : selectedIssue.status === "Đang xử lý"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {selectedIssue.status} #{selectedIssue.id}
                </span>
                <span className="text-xs text-gray-400">{selectedIssue.date}</span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedIssue.title}</h3>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  {selectedIssue.description}
                </p>
              </div>

              {/* INFO TABLE */}
              <div className="p-3.5 rounded-2xl bg-surface-container-low/70 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Vị trí:</span>
                  <span className="font-bold text-gray-900">{selectedIssue.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Người báo:</span>
                  <span className="font-bold text-gray-900">{selectedIssue.reportedBy}</span>
                </div>
                {selectedIssue.cost && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Dự toán vật tư:</span>
                    <span className="font-bold text-primary">{formatVND(selectedIssue.cost)}</span>
                  </div>
                )}
                {selectedIssue.assignee && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Phụ trách:</span>
                    <span className="font-bold text-secondary">{selectedIssue.assignee}</span>
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="pt-2 flex flex-col gap-2">
                {selectedIssue.status !== "Đã xong" ? (
                  <>
                    <button
                      onClick={() => updateIssueStatus(selectedIssue.id, "Đang xử lý")}
                      className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition"
                    >
                      Nhận xử lý ca này
                    </button>
                    <button
                      onClick={() => updateIssueStatus(selectedIssue.id, "Đã xong")}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                    >
                      Đánh dấu đã sửa xong
                    </button>
                  </>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold text-center">
                    ✓ Sự cố này đã được sửa chữa và nghiệm thu hoàn tất!
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: MÁY GIẶT */}
      {activeTab === "may-giat" && (
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Đặt lịch máy giặt (Sân phơi Tầng 4)</h2>
              <p className="text-xs text-gray-500">Mỗi ca 2 tiếng. Bấm ô trống để đặt ca, bấm ca của bạn để hủy.</p>
            </div>
            <span className="px-3 py-1 bg-purple-100 text-primary text-xs font-bold rounded-lg">
              Máy Aqua 9kg &amp; Electrolux
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-2.5 text-left text-xs font-bold text-gray-400">Khung giờ</th>
                  {DAYS.map((d) => (
                    <th key={d} className={`py-2.5 px-2 font-bold ${d === "T5" ? "text-primary bg-purple-50/50 rounded-t-lg" : ""}`}>
                      {d} {d === "T5" && "(Nay)"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {SLOTS.map((slot, sIdx) => (
                  <tr key={slot}>
                    <td className="py-3 text-left font-mono text-[11px] text-gray-500 pr-3 whitespace-nowrap">
                      {slot}
                    </td>
                    {DAYS.map((d, dIdx) => {
                      const key = `${dIdx}-${sIdx}`;
                      const bookedBy = laundryBookings[key];
                      const isMine = bookedBy?.includes("Minh Tuấn");

                      return (
                        <td key={d} className={`p-1.5 ${d === "T5" ? "bg-purple-50/30" : ""}`}>
                          {bookedBy ? (
                            <button
                              onClick={() => {
                                if (isMine) {
                                  cancelLaundry(dIdx, sIdx);
                                } else {
                                  showToast("warning", `Ca này đã được đặt bởi ${bookedBy}`);
                                }
                              }}
                              className={`w-full py-2 px-1 rounded-xl text-[10px] font-bold transition truncate ${
                                isMine
                                  ? "bg-primary text-white shadow-2xs hover:bg-rose-600 hover:content-['Hủy']"
                                  : "bg-surface-container-low text-gray-600 cursor-not-allowed"
                              }`}
                              title={isMine ? "Bấm để hủy ca" : `Đã đặt bởi ${bookedBy}`}
                            >
                              {isMine ? "Của bạn (Hủy)" : bookedBy}
                            </button>
                          ) : (
                            <button
                              onClick={() => bookLaundry(dIdx, sIdx, "Minh Tuấn (Lịch của bạn)")}
                              className="w-full py-2 px-1 rounded-xl text-[10px] text-gray-400 hover:text-primary hover:bg-purple-100/70 border border-dashed border-gray-200 transition"
                            >
                              + Trống
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MƯỢN ĐỒ CHUNG */}
      {activeTab === "muon-do" && (
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Thiết bị &amp; Đồ dùng dùng chung</h2>
              <p className="text-xs text-gray-500">Kho dụng cụ tầng trệt và phòng sinh hoạt</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {borrowItems.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">{item.name}</h3>
                    <p className="text-[11px] text-gray-400">{item.loc}</p>
                    {item.borrower && (
                      <p className="text-[10px] text-amber-700 font-semibold">{item.borrower}</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleToggleBorrow(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    item.status === "Có sẵn"
                      ? "bg-primary text-white hover:bg-primary-container"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {item.status === "Có sẵn" ? "Mượn" : "Trả"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: CHECK-IN HOÀN THÀNH VỆ SINH */}
      {checkInTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-purple-100 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-2xl bg-primary text-white font-bold text-lg">
                  {checkInTarget.areaIcon}
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    Check-in Hoàn Thành Vệ Sinh
                  </h3>
                  <p className="text-xs text-gray-500">
                    {checkInTarget.area} · {checkInTarget.assignedRoom}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCheckInTarget(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCheckIn} className="p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Người đại diện Check-in *
                </label>
                <select
                  value={checkInMemberName}
                  onChange={(e) => setCheckInMemberName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {checkInTarget.assignedMembers.map((m) => (
                    <option key={m} value={m}>{m} (Được phân công)</option>
                  ))}
                  {members.map((m) => (
                    <option key={m.id} value={m.fullName}>{m.fullName}</option>
                  ))}
                </select>
              </div>

              {/* Real-time Clock Info */}
              <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center justify-between text-xs">
                <span className="text-gray-600 font-medium">Thời gian ghi nhận:</span>
                <span className="font-bold text-primary flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Hôm nay (Tự động ghi giờ)
                </span>
              </div>

              {/* Tasks Checklist */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Checklist hạng mục đã hoàn thành:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 cursor-pointer hover:bg-purple-50/50">
                    <input
                      type="checkbox"
                      checked={checkInTasks.scrubbed}
                      onChange={(e) => setCheckInTasks((prev) => ({ ...prev, scrubbed: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="font-semibold text-gray-800">Cọ rửa sàn &amp; bồn</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 cursor-pointer hover:bg-purple-50/50">
                    <input
                      type="checkbox"
                      checked={checkInTasks.trashEmptied}
                      onChange={(e) => setCheckInTasks((prev) => ({ ...prev, trashEmptied: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="font-semibold text-gray-800">Gom &amp; đổ rác sạch</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 cursor-pointer hover:bg-purple-50/50">
                    <input
                      type="checkbox"
                      checked={checkInTasks.mirrorsCleaned}
                      onChange={(e) => setCheckInTasks((prev) => ({ ...prev, mirrorsCleaned: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="font-semibold text-gray-800">Lau kính &amp; tay vịn</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 cursor-pointer hover:bg-purple-50/50">
                    <input
                      type="checkbox"
                      checked={checkInTasks.restocked}
                      onChange={(e) => setCheckInTasks((prev) => ({ ...prev, restocked: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="font-semibold text-gray-800">Bổ sung xà phòng</span>
                  </label>
                </div>
              </div>

              {/* Photo Evidence Upload */}
              <ImageUploadDropzone
                label="Ảnh chụp minh chứng hoàn thành dọn dẹp"
                value={checkInPhotoUrl}
                onChange={setCheckInPhotoUrl}
                placeholder="Kéo thả ảnh chụp hoặc nhấp để chọn tệp từ máy..."
                helperText="Chụp rõ khu vực sau khi đã lau dọn sạch sẽ (PNG, JPG, WEBP tối đa 10MB)"
                presets={SAMPLE_CLEANING_PHOTOS}
              />

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Ghi chú thêm (Tình trạng khu vực, cần bổ sung đồ...):
                </label>
                <textarea
                  rows={2}
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  placeholder="Ví dụ: Đã cọ sạch sàn WC T2, đổ rác hành lang và thay túi bóng mới."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCheckInTarget(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition"
                >
                  Xác nhận Hoàn Thành Ca Trực →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NGHIỆM THU CA TRỰC (BQL DUYỆT) */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-purple-100 flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-2xl bg-emerald-600 text-white font-bold text-lg">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    Nghiệm Thu Ca Trực Vệ Sinh
                  </h3>
                  <p className="text-xs text-gray-500">
                    {reviewTarget.area} · Người trực: {reviewTarget.checkInBy || reviewTarget.assignedMembers.join(", ")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewTarget(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReview} className="p-5 space-y-4">
              {/* Evidence preview */}
              {reviewTarget.evidencePhoto && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Ảnh bằng chứng thành viên đã gửi:
                  </label>
                  <img
                    src={reviewTarget.evidencePhoto}
                    alt="Bằng chứng"
                    className="w-full h-40 rounded-2xl object-cover border border-purple-200"
                  />
                  {reviewTarget.checkInNote && (
                    <p className="text-xs text-gray-600 italic mt-1.5 p-2 rounded-xl bg-gray-50">
                      "{reviewTarget.checkInNote}"
                    </p>
                  )}
                </div>
              )}

              {/* Review Decision */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Kết quả đánh giá:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision("approved");
                      setReviewNote("Rất sạch sẽ, đạt chuẩn vệ sinh quy định của Lưu Xá.");
                    }}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 font-bold text-xs transition ${
                      reviewDecision === "approved"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200"
                        : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
                    }`}
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Đạt Chuẩn (Duyệt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision("rejected");
                      setReviewNote("Sàn còn đọng nước, thùng rác chưa đổ hết. Yêu cầu xử lý lại.");
                    }}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 font-bold text-xs transition ${
                      reviewDecision === "rejected"
                        ? "border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-200"
                        : "border-gray-200 bg-white text-gray-600 hover:border-rose-300"
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <span>Chưa Đạt (Dọn lại)</span>
                  </button>
                </div>
              </div>

              {/* Reviewer Note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nhận xét của Ban Quản Lý:
                </label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition ${
                    reviewDecision === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
                  }`}
                >
                  {reviewDecision === "approved" ? "Xác nhận Đạt Chuẩn" : "Yêu cầu dọn lại"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: XIN ĐỔI CA TRỰC NHẬT */}
      {swapTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-purple-100 flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-2xl bg-purple-600 text-white font-bold text-lg">
                  <ArrowRightLeft className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    Xin Đổi Ca Trực Nhật
                  </h3>
                  <p className="text-xs text-gray-500">
                    {swapTarget.area} · {swapTarget.dayOfWeek} ({swapTarget.shift})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSwapTarget(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSwap} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Người xin đổi (Bạn):
                </label>
                <select
                  value={swapFrom}
                  onChange={(e) => setSwapFrom(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {swapTarget.assignedMembers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Thành viên muốn đổi ca cùng:
                </label>
                <select
                  value={swapTo}
                  onChange={(e) => setSwapTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.fullName}>
                      {m.fullName} ({m.room})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Lý do xin đổi ca:
                </label>
                <textarea
                  rows={2}
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="Ví dụ: Bận lịch thi môn Giải tích, thực tập tốt nghiệp..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSwapTarget(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition"
                >
                  Xác nhận Đổi Ca →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PHÂN CÔNG CA TRỰC MỚI (CHO BQL) */}
      {isAddDutyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-purple-100 flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-2xl bg-primary text-white font-bold text-lg">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    Phân Công Ca Trực Nhật Mới
                  </h3>
                  <p className="text-xs text-gray-500">
                    Tạo ca vệ sinh cho các phòng và thành viên
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddDutyModalOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAddDuty} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Khu vực vệ sinh *:
                </label>
                <input
                  type="text"
                  required
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder="VD: Khu vực WC Tầng 1 - 2, Cầu thang bộ..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Ngày trong tuần:
                  </label>
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chúa Nhật"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Ca trực:
                  </label>
                  <select
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Ca Sáng (06:30)">Ca Sáng (06:30)</option>
                    <option value="Ca Chiều (17:30)">Ca Chiều (17:30)</option>
                    <option value="Ca Tối (21:00)">Ca Tối (21:00)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Phòng phụ trách:
                  </label>
                  <input
                    type="text"
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                    placeholder="Phòng 201"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Biểu tượng Icon:
                  </label>
                  <select
                    value={newAreaIcon}
                    onChange={(e) => setNewAreaIcon(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold"
                  >
                    <option value="🚿">🚿 Phòng tắm &amp; WC</option>
                    <option value="🪜">🪜 Cầu thang &amp; Hành lang</option>
                    <option value="🍳">🍳 Bếp &amp; Bàn ăn</option>
                    <option value="⛪">⛪ Nguyện đường &amp; SHC</option>
                    <option value="🌱">🌱 Sân thượng &amp; Rác</option>
                    <option value="✨">✨ Tổng vệ sinh</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Thành viên trực (cách nhau bằng dấu phẩy):
                </label>
                <input
                  type="text"
                  value={newMembersStr}
                  onChange={(e) => setNewMembersStr(e.target.value)}
                  placeholder="VD: Trần Văn Đức, Minh Tuấn"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddDutyModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition"
                >
                  Tạo ca trực mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL CHO ẢNH BẰNG CHỨNG */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
              <span className="text-sm font-bold truncate">{lightboxPhoto.title}</span>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="p-1 rounded-xl hover:bg-white/20 text-gray-300 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.title}
              className="w-full max-h-[75vh] object-contain bg-black"
            />
          </div>
        </div>
      )}

    </div>
  );
}
