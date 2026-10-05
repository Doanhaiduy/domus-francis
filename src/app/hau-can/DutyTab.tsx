"use client";
// Tab "Phân công Trực nhật & Vệ sinh": roster tuần (điều hướng tuần, tạo/sao chép/công bố), thẻ ca trực từ DB,
// check-in (ảnh + checklist mẫu), nghiệm thu (đạt/làm lại), xin đổi ca, phân công/sửa/hủy ca cho Ban điều hành.
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect, CustomTextarea, ImageUploadDropzone, previewUrl, type SelectOption } from "@/components/ui/FormControls";
import { Portal } from "@/components/ui/Portal";
import { PendingSwapList, SwapDutyCard } from "@/components/modals/SwapDutyModal";
import { dutyApi, refreshDuty, useDutySwaps } from "@/lib/data/duty";
import { DUTY_STATUS_LABEL, WEEKDAYS, addDays, dm, dmy, mondayOf, vnStamp, vnTime, vnToday, weekdayLabel } from "@/lib/duty-format";
import type { DutyAssignmentDto, DutyStatus, DutyWeekDto } from "@/lib/types/duty";
import { Lightbox, MemberMultiPicker, ModalShell, Stars } from "./ui";

type StatusFilter = "all" | "mine" | DutyStatus;
const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "mine", label: "👤 Ca của tôi" },
  { value: "scheduled", label: "⏳ Chờ trực" },
  { value: "checked_in", label: "🕒 Chờ nghiệm thu" },
  { value: "approved", label: "✅ Đã nghiệm thu (Đạt)" },
  { value: "rework_required", label: "⚠️ Yêu cầu dọn lại" },
  { value: "missed", label: "❌ Bỏ ca" },
  { value: "cancelled", label: "🚫 Đã hủy" },
];

const cardTone = (s: DutyStatus) =>
  s === "approved"
    ? "border-emerald-200 bg-emerald-50/10"
    : s === "checked_in"
    ? "border-amber-200 bg-amber-50/10"
    : s === "rework_required" || s === "missed"
    ? "border-rose-200 bg-rose-50/10"
    : s === "cancelled" || s === "excused"
    ? "border-gray-200 bg-gray-50/40 opacity-80"
    : "border-purple-100 hover:border-purple-300";
const badgeTone = (s: DutyStatus) =>
  s === "approved"
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : s === "checked_in"
    ? "bg-amber-100 text-amber-800 border-amber-200 animate-pulse"
    : s === "rework_required" || s === "missed"
    ? "bg-rose-100 text-rose-800 border-rose-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

export default function DutyTab({
  data,
  loading,
  week,
  onWeekChange,
  addOpen,
  onCloseAdd,
}: {
  data: DutyWeekDto | undefined;
  loading: boolean;
  week: string;
  onWeekChange: (week: string) => void;
  addOpen: boolean;
  onCloseAdd: () => void;
}) {
  const { showToast } = useApp();
  const { can, session } = useSession();
  const me = session?.member?.id ?? null;
  const today = data?.today ?? vnToday();
  const roster = data?.roster;
  const weekStart = roster?.weekStart ?? mondayOf(week || vnToday());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const inWeek = days.includes(today);
  const isCurrentWeek = data ? mondayOf(data.today) === weekStart : true;
  const canManage = can("duty.manage");
  const list = useMemo(() => roster?.assignments ?? [], [roster]);

  const [dayFilter, setDayFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  useEffect(() => setDayFilter("all"), [weekStart]);

  const [checkInTarget, setCheckInTarget] = useState<DutyAssignmentDto | null>(null);
  const [reviewTarget, setReviewTarget] = useState<DutyAssignmentDto | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DutyAssignmentDto | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DutyAssignmentDto | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);
  const [rosterBusy, setRosterBusy] = useState(false);

  const { swaps, mutate: mutateSwaps } = useDutySwaps();
  const pendingSwaps = (swaps?.requests ?? []).filter((r) => r.canRespond || r.canDecide || r.canCancel);

  const filtered = list.filter((d) => {
    if (dayFilter === "today" && d.date !== today) return false;
    if (dayFilter !== "all" && dayFilter !== "today" && d.date !== dayFilter) return false;
    if (statusFilter === "mine") return d.isMine;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return true;
  });

  const live = list.filter((d) => d.status !== "cancelled");
  const todayDuties = live.filter((d) => d.date === today);
  const approvedCount = live.filter((d) => d.status === "approved").length;
  const submittedCount = live.filter((d) => d.status === "checked_in").length;
  const completionRate = live.length ? Math.round((approvedCount / live.length) * 100) : 0;

  const afterChange = async () => {
    await Promise.all([refreshDuty(), mutateSwaps()]);
  };

  const createRoster = async (copyFrom: string | null) => {
    setRosterBusy(true);
    try {
      const r = await dutyApi.createRoster(weekStart, copyFrom);
      await afterChange();
      showToast(
        "success",
        copyFrom
          ? `Đã tạo roster nháp, sao chép ${r.copied} ca từ tuần ${dm(copyFrom)}${r.skipped.length ? ` (bỏ qua: ${r.skipped.join("; ")})` : ""}.`
          : "Đã tạo roster nháp — thêm ca trực rồi bấm Công bố."
      );
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRosterBusy(false);
    }
  };
  const publishRoster = async () => {
    if (!roster?.id) return;
    setRosterBusy(true);
    try {
      const r = await dutyApi.publishRoster(roster.id);
      await afterChange();
      showToast("success", `Đã công bố roster tuần ${dm(weekStart)} (${r.count} ca) — anh em trực đã nhận thông báo.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRosterBusy(false);
    }
  };
  const deleteRoster = async () => {
    if (!roster?.id) return;
    setRosterBusy(true);
    try {
      await dutyApi.deleteRoster(roster.id);
      await afterChange();
      showToast("success", "Đã xóa roster nháp trống.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRosterBusy(false);
    }
  };

  const meName = (p: { id: string; fullName: string }) => (p.id === me ? `${p.fullName} (bạn)` : p.fullName);

  return (
    <div className="flex flex-col gap-6">
      {/* ĐIỀU HƯỚNG TUẦN + TRẠNG THÁI ROSTER */}
      <div className="bg-white p-4 rounded-3xl border border-purple-50 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onWeekChange(addDays(weekStart, -7))}
            className="p-2 rounded-xl bg-surface-container-low text-gray-600 hover:bg-purple-100 hover:text-primary transition"
            title="Tuần trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-1">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-sm font-extrabold text-gray-900">
              Tuần {dm(weekStart)} – {dmy(addDays(weekStart, 6))}
            </span>
            {isCurrentWeek && <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-primary">Tuần này</span>}
          </div>
          <button
            onClick={() => onWeekChange(addDays(weekStart, 7))}
            className="p-2 rounded-xl bg-surface-container-low text-gray-600 hover:bg-purple-100 hover:text-primary transition"
            title="Tuần sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && data && (
            <button onClick={() => onWeekChange(data.today)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-primary bg-purple-50 hover:bg-purple-100">
              Về tuần này
            </button>
          )}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {roster?.status === "published" && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✅ Đã công bố {roster.publishedAt ? vnStamp(roster.publishedAt, today) : ""}
            </span>
          )}
          {roster?.status === "closed" && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">🔒 Đã khóa</span>
          )}
          {roster?.status === "draft" && canManage && (
            <>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                📝 Bản nháp — chỉ Ban điều hành thấy
              </span>
              {list.length === 0 && (
                <button
                  onClick={deleteRoster}
                  disabled={rosterBusy}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                >
                  Xóa nháp
                </button>
              )}
              <button
                onClick={publishRoster}
                disabled={rosterBusy || list.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-60"
              >
                {rosterBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Công bố roster
              </button>
            </>
          )}
          {roster?.status === "none" && canManage && (
            <>
              {data?.previousRosterWeek && (
                <button
                  onClick={() => createRoster(data.previousRosterWeek)}
                  disabled={rosterBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold disabled:opacity-60"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" /> Sao chép từ tuần {dm(data.previousRosterWeek)}
                </button>
              )}
              <button
                onClick={() => createRoster(null)}
                disabled={rosterBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-xs disabled:opacity-60"
              >
                {rosterBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Tạo roster trống
              </button>
            </>
          )}
        </div>
      </div>

      {/* ĐƠN ĐỔI CA CẦN XỬ LÝ */}
      {pendingSwaps.length > 0 && (
        <div className="bg-white p-4 rounded-3xl border border-purple-100 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900">Đơn đổi ca cần xử lý</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-primary">{pendingSwaps.length}</span>
          </div>
          <PendingSwapList requests={pendingSwaps} onDone={afterChange} />
        </div>
      )}

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">{inWeek ? "Ca trực hôm nay" : "Ca trực trong tuần"}</span>
            <div className="text-xl sm:text-2xl font-black text-gray-900 mt-0.5">{inWeek ? todayDuties.length : live.length} ca</div>
            <span className="text-[10px] text-primary font-semibold">{inWeek ? `${weekdayLabel(today)} (${dm(today)})` : `Tuần ${dm(weekStart)}`}</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold text-lg">🧹</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Đã nghiệm thu</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">{approvedCount} ca</div>
            <span className="text-[10px] text-gray-400">Đạt chuẩn sạch sẽ</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">✅</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Chờ nghiệm thu</span>
            <div className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">{submittedCount} ca</div>
            <span className="text-[10px] text-gray-400">Đã gửi ảnh check-in</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">🕒</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Tiến độ tuần</span>
            <div className="text-xl sm:text-2xl font-black text-primary mt-0.5">{completionRate}%</div>
            <span className="text-[10px] text-gray-400">
              {approvedCount}/{live.length} ca hoàn thành
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold text-lg">📊</div>
        </div>
      </div>

      {/* FILTERS & DAY SELECTOR */}
      <div className="bg-white p-4 rounded-3xl border border-purple-50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 md:pb-0">
          <span className="text-xs font-bold text-gray-400 shrink-0 mr-1">Ngày:</span>
          {[
            { key: "all", label: "Tất cả" },
            ...(inWeek ? [{ key: "today", label: "Hôm nay" }] : []),
            ...days.map((d, i) => ({ key: d, label: `${WEEKDAYS[i]} ${dm(d)}` })),
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setDayFilter(o.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                dayFilter === o.key ? "bg-primary text-white shadow-2xs" : "bg-surface-container-low text-gray-600 hover:bg-purple-100 hover:text-primary"
              } ${o.key === today ? "ring-1 ring-primary/40" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 w-48">
          <CustomSelect value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)} options={STATUS_FILTER_OPTIONS} />
        </div>
      </div>

      {/* DUTY CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((duty) => {
          const ck = duty.checkins[0] ?? null;
          const review = ck?.review ?? null;
          const now = Date.now();
          const notOpenYet = duty.isMine && duty.status === "scheduled" && now < new Date(duty.checkinOpensAt).getTime();
          const closed = duty.isMine && duty.status === "scheduled" && now > new Date(duty.checkinClosesAt).getTime();
          const mySwap = duty.openSwaps.find((s) => s.from.id === me || s.to.id === me) ?? duty.openSwaps[0];
          return (
            <div key={duty.id} className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${cardTone(duty.status)}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl p-2 rounded-2xl bg-purple-50 text-purple-700">{duty.area.icon}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 leading-snug">{duty.area.name}</h3>
                      <div className="flex items-center flex-wrap gap-x-1.5 text-[11px] text-gray-500 mt-0.5">
                        <span className={`font-semibold whitespace-nowrap ${duty.date === today ? "text-rose-600" : "text-primary"}`}>
                          {duty.date === today ? "Hôm nay" : weekdayLabel(duty.date)} {dm(duty.date)}
                        </span>
                        <span>•</span>
                        <span className="whitespace-nowrap">{duty.shift.label}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 border ${badgeTone(duty.status)}`}>
                    {DUTY_STATUS_LABEL[duty.status]}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50/60 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">Phòng phụ trách:</span>
                    <span className="font-bold text-gray-900">{duty.roomName ?? (duty.area.isWholeHouse ? "Toàn thể lưu xá" : "—")}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-gray-500 font-medium shrink-0">Người trực:</span>
                    <span
                      className={`font-bold text-right ${duty.isMine ? "text-rose-600" : "text-primary"} ${duty.members.length > 3 ? "line-clamp-2" : ""}`}
                      title={duty.members.map((m) => m.fullName).join(", ")}
                    >
                      {duty.members.length ? duty.members.map((m) => (m.id === me ? "Bạn" : m.name)).join(", ") : "Chưa phân người"}
                    </span>
                  </div>
                </div>

                {mySwap && (
                  <div className="p-2.5 rounded-2xl bg-purple-50/60 border border-purple-100 text-[11px] text-purple-900 flex items-center gap-2">
                    <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Đang xin đổi: <b>{meName(mySwap.from)}</b> → <b>{meName(mySwap.to)}</b> ·{" "}
                      {mySwap.status === "pending_peer" ? "chờ người nhận xác nhận" : "chờ Ban điều hành duyệt"}
                    </span>
                  </div>
                )}

                {ck && (
                  <div className="p-3 rounded-2xl bg-purple-50/40 border border-purple-100/60 text-xs flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] text-purple-900 font-semibold gap-2">
                      <span>
                        🕒 Check-in lúc {vnTime(ck.at)}
                        {ck.attempt > 1 ? ` (lần ${ck.attempt})` : ""}
                        {ck.isLate ? ` · muộn ${ck.lateMinutes} phút` : ""}
                      </span>
                      <span className="truncate">bởi {ck.by.id === me ? "bạn" : ck.by.name}</span>
                    </div>
                    {ck.note && <p className="text-gray-600 text-[11px] italic mt-0.5 line-clamp-2">“{ck.note}”</p>}
                  </div>
                )}

                {ck?.evidenceFileId && (
                  <div className="flex items-center justify-between p-2 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl(ck.evidenceFileId, "thumb")}
                        alt="Ảnh nghiệm thu"
                        className="w-10 h-10 rounded-xl object-cover border border-purple-200 cursor-pointer hover:opacity-80 transition"
                        onClick={() => setLightbox({ url: previewUrl(ck.evidenceFileId, "medium"), title: `${duty.area.name} - ${weekdayLabel(duty.date)} ${dm(duty.date)}` })}
                      />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-gray-800">Ảnh nghiệm thu</span>
                        <span className="text-[10px] text-gray-400">
                          {ck.items.length ? `${ck.items.filter((i) => i.isDone).length}/${ck.items.length} tiêu chí đạt` : "Đã đính kèm bằng chứng"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLightbox({ url: previewUrl(ck.evidenceFileId, "medium"), title: `${duty.area.name} - ${weekdayLabel(duty.date)} ${dm(duty.date)}` })}
                      className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-[11px] font-bold transition flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem ảnh</span>
                    </button>
                  </div>
                )}

                {review && review.decision === "approved" && (
                  <div className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/60 text-[11px] text-emerald-950 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold">{review.reviewer.fullName}: </span>
                      <span>
                        {review.feedback || "Nghiệm thu đạt chuẩn"} ({vnTime(review.reviewedAt)})
                      </span>
                      {review.score && <Stars value={review.score} size="w-3 h-3" />}
                    </div>
                  </div>
                )}
                {duty.status === "rework_required" && (
                  <div className="p-2.5 rounded-2xl bg-rose-50/70 border border-rose-200/70 text-[11px] text-rose-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">{review?.reviewer.fullName ?? "Ban điều hành"}: </span>
                      <span>{duty.statusReason ?? review?.feedback}</span>
                      {duty.reworkDueAt && <span className="block text-[10px] font-semibold mt-0.5">Hạn dọn lại: {vnStamp(duty.reworkDueAt, today)}</span>}
                    </div>
                  </div>
                )}
                {(duty.status === "missed" || duty.status === "cancelled" || duty.status === "excused") && duty.statusReason && (
                  <div className="p-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-[11px] text-gray-600">Lý do: {duty.statusReason}</div>
                )}
              </div>

              {/* ACTION BUTTONS FOOTER */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                {duty.canCheckin && (
                  <button
                    onClick={() => setCheckInTarget(duty)}
                    className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{duty.status === "rework_required" ? "Check-in lại sau khi dọn" : "Check-in đã dọn"}</span>
                  </button>
                )}
                {notOpenYet && (
                  <div className="flex-1 py-1.5 text-center text-[11px] font-bold text-gray-500 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Mở check-in {vnStamp(duty.checkinOpensAt, today)}
                  </div>
                )}
                {closed && (
                  <div className="flex-1 py-1.5 text-center text-[11px] font-bold text-rose-600 bg-rose-50 rounded-xl border border-rose-200">Đã quá giờ check-in</div>
                )}
                {duty.canReview && (
                  <button
                    onClick={() => setReviewTarget(duty)}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Nghiệm thu</span>
                  </button>
                )}
                {duty.status === "checked_in" && !duty.canReview && duty.isMine && can("duty.review") && (
                  <span className="flex-1 text-center text-[10px] text-gray-400">Ca của bạn — người khác nghiệm thu</span>
                )}
                {duty.canSwap && (
                  <button
                    onClick={() => setSwapTarget(duty.id)}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition active:scale-95"
                    title="Xin đổi ca trực nhật này"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                )}
                {duty.canManage && (
                  <>
                    <button
                      onClick={() => setEditTarget(duty)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-primary transition active:scale-95"
                      title="Sửa phân công"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCancelTarget(duty)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-rose-100 text-gray-700 hover:text-rose-600 transition active:scale-95"
                      title="Hủy ca trực"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                {duty.status === "approved" && (
                  <div className="flex-1 py-1.5 text-center text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">✨ Hoàn thành xuất sắc</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-3xl p-12 text-center border border-purple-50 flex flex-col items-center justify-center gap-3">
          <span className="text-4xl">🧹</span>
          {roster?.status === "none" ? (
            <>
              <h3 className="text-base font-bold text-gray-800">Tuần này chưa có lịch trực{canManage ? "" : " được công bố"}</h3>
              <p className="text-xs text-gray-500">
                {canManage ? "Tạo roster trống hoặc sao chép từ tuần trước ở thanh phía trên." : "Ban điều hành sẽ công bố lịch trực sớm."}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-800">Không có ca trực nào phù hợp</h3>
              <p className="text-xs text-gray-500">Hãy thử đổi bộ lọc ngày hoặc trạng thái ở trên.</p>
            </>
          )}
        </div>
      )}

      <CheckInModal target={checkInTarget} onClose={() => setCheckInTarget(null)} onDone={afterChange} meName={session?.member?.fullName ?? ""} today={today} />
      <ReviewModal target={reviewTarget} onClose={() => setReviewTarget(null)} onDone={afterChange} onZoom={setLightbox} />
      <AssignmentModal
        open={addOpen || !!editTarget}
        target={editTarget}
        data={data}
        days={days}
        today={today}
        onClose={() => {
          setEditTarget(null);
          onCloseAdd();
        }}
        onDone={afterChange}
      />
      <CancelModal target={cancelTarget} draft={roster?.status === "draft"} onClose={() => setCancelTarget(null)} onDone={afterChange} />
      {swapTarget && (
        <Portal>
          <div onClick={() => setSwapTarget(null)} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5 animate-in fade-in duration-150">
            <div className="flex min-h-full items-center justify-center">
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
                <SwapDutyCard initialAssignmentId={swapTarget} onClose={() => setSwapTarget(null)} />
              </div>
            </div>
          </div>
        </Portal>
      )}
      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------
// MODAL: CHECK-IN HOÀN THÀNH VỆ SINH
// ---------------------------------------------------------------------
function CheckInModal({
  target,
  onClose,
  onDone,
  meName,
  today,
}: {
  target: DutyAssignmentDto | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  meName: string;
  today: string;
}) {
  const { showToast } = useApp();
  const [done, setDone] = useState<string[]>([]);
  const [fileId, setFileId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) return;
    setDone(target.checklist.map((i) => i.id));
    setFileId("");
    setNote(target.status === "rework_required" ? "Đã dọn lại theo nhận xét của Ban điều hành." : `Đã lau dọn ${target.area.name.toLowerCase()} sạch sẽ, ngăn nắp.`);
  }, [target]);
  if (!target) return null;
  const rework = target.status === "rework_required";
  const lastReview = target.checkins[0]?.review;
  const late = !rework && Date.now() > new Date(target.endsAt).getTime() + 60 * 60e3;
  const missingRequired = target.checklist.filter((i) => i.isRequired && !done.includes(i.id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileId) {
      showToast("warning", "Hãy tải lên ảnh chụp khu vực sau khi dọn.");
      return;
    }
    if (missingRequired.length) {
      showToast("warning", `Còn ${missingRequired.length} tiêu chí bắt buộc chưa tick.`);
      return;
    }
    setBusy(true);
    try {
      await dutyApi.checkIn(target.id, { fileId, doneItemIds: done, note: note.trim() || null });
      await onDone();
      showToast("success", `Đã check-in ${target.area.name}! Chờ Ban điều hành nghiệm thu.`);
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      maxWidth="max-w-lg"
      icon={target.area.icon}
      title={rework ? `Check-in Lại (lần ${target.attemptCount + 1})` : "Check-in Hoàn Thành Vệ Sinh"}
      subtitle={`${target.area.name} · ${weekdayLabel(target.date)} ${dm(target.date)} · ${target.shift.label}`}
    >
      <form onSubmit={submit} className="p-5 space-y-4">
        {rework && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
            <b>Yêu cầu dọn lại:</b> {target.statusReason ?? lastReview?.feedback}
            {target.reworkDueAt && <span className="block mt-0.5 font-semibold">Hạn: {vnStamp(target.reworkDueAt, today)}</span>}
          </div>
        )}
        <div className="p-3 rounded-2xl bg-surface-container-low/70 border border-purple-50 flex items-center justify-between text-xs">
          <span className="text-gray-600 font-medium">Người check-in:</span>
          <span className="font-bold text-gray-900">{meName} (bạn)</span>
        </div>
        <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center justify-between text-xs">
          <span className="text-gray-600 font-medium">Thời gian ghi nhận:</span>
          <span className={`font-bold flex items-center gap-1 ${late ? "text-amber-700" : "text-primary"}`}>
            <Clock className="w-3.5 h-3.5" />
            {late ? "Lúc bấm xác nhận (sẽ ghi nhận muộn)" : "Lúc bấm xác nhận (giờ máy chủ)"}
          </span>
        </div>

        {target.checklist.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">Checklist hạng mục đã hoàn thành:</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {target.checklist.map((it) => (
                <label key={it.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 cursor-pointer hover:bg-purple-50/50">
                  <input
                    type="checkbox"
                    checked={done.includes(it.id)}
                    onChange={(e) => setDone((prev) => (e.target.checked ? [...prev, it.id] : prev.filter((x) => x !== it.id)))}
                    className="rounded text-primary focus:ring-primary accent-primary"
                  />
                  <span className="font-semibold text-gray-800">
                    {it.label}
                    {it.isRequired && <span className="text-rose-500"> *</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <ImageUploadDropzone
          bucket="cleaning-evidence"
          label="Ảnh chụp minh chứng hoàn thành dọn dẹp *"
          value={fileId}
          onChange={setFileId}
          placeholder="Kéo thả ảnh chụp hoặc nhấp để chọn tệp từ máy..."
          helperText="Chụp rõ khu vực sau khi đã lau dọn — ảnh mới cho mỗi lần check-in (PNG, JPG, WEBP)"
        />

        <CustomTextarea
          label="Ghi chú thêm (Tình trạng khu vực, cần bổ sung đồ...):"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: Đã cọ sạch sàn WC T2, đổ rác hành lang và thay túi bóng mới."
        />

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Xác nhận Hoàn Thành Ca Trực →
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------
// MODAL: NGHIỆM THU CA TRỰC
// ---------------------------------------------------------------------
function ReviewModal({
  target,
  onClose,
  onDone,
  onZoom,
}: {
  target: DutyAssignmentDto | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  onZoom: (p: { url: string; title: string }) => void;
}) {
  const { showToast } = useApp();
  const [decision, setDecision] = useState<"approved" | "rework">("approved");
  const [score, setScore] = useState(5);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) return;
    setDecision("approved");
    setScore(5);
    setNote("Rất sạch sẽ, thơm tho, đạt chuẩn vệ sinh quy định của Lưu Xá.");
  }, [target]);
  if (!target) return null;
  const ck = target.checkins[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (decision === "rework" && note.trim().length < 5) {
      showToast("warning", "Ghi rõ điểm cần dọn lại (tối thiểu 5 ký tự).");
      return;
    }
    setBusy(true);
    try {
      await dutyApi.review(target.id, { decision, score: decision === "approved" ? score : null, feedback: note.trim() || null });
      await onDone();
      showToast(decision === "approved" ? "success" : "warning", decision === "approved" ? `Đã nghiệm thu đạt ${target.area.name}.` : "Đã yêu cầu dọn lại — người trực sẽ nhận thông báo.");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      icon={<ShieldCheck className="w-5 h-5" />}
      iconClass="bg-emerald-600 text-white"
      headerClass="bg-emerald-50/60"
      title="Nghiệm Thu Ca Trực Vệ Sinh"
      subtitle={`${target.area.name} · Người trực: ${target.members.map((m) => m.name).join(", ")}`}
    >
      <form onSubmit={submit} className="p-5 space-y-4">
        {ck && (
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Ảnh bằng chứng {ck.by.name} đã gửi lúc {vnTime(ck.at)}
              {ck.attempt > 1 ? ` (lần ${ck.attempt})` : ""}:
            </label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl(ck.evidenceFileId, "medium")}
              alt="Bằng chứng"
              onClick={() => onZoom({ url: previewUrl(ck.evidenceFileId, "medium"), title: `${target.area.name} - ${dm(target.date)}` })}
              className="w-full h-40 rounded-2xl object-cover border border-purple-200 cursor-zoom-in"
            />
            {ck.note && <p className="text-xs text-gray-600 italic mt-1.5 p-2 rounded-xl bg-gray-50">“{ck.note}”</p>}
            {ck.items.length > 0 && (
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                {ck.items.map((i) => (
                  <span key={i.itemId} className={`text-[11px] ${i.isDone ? "text-emerald-700" : "text-rose-600"}`}>
                    {i.isDone ? "✓" : "✗"} {i.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-2">Kết quả đánh giá:</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setDecision("approved");
                setNote("Rất sạch sẽ, đạt chuẩn vệ sinh quy định của Lưu Xá.");
              }}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 font-bold text-xs transition ${
                decision === "approved" ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200" : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
              }`}
            >
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span>Đạt Chuẩn (Duyệt)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision("rework");
                setNote("Sàn còn đọng nước, thùng rác chưa đổ hết. Yêu cầu xử lý lại.");
              }}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 font-bold text-xs transition ${
                decision === "rework" ? "border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-200" : "border-gray-200 bg-white text-gray-600 hover:border-rose-300"
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>Chưa Đạt (Dọn lại)</span>
            </button>
          </div>
        </div>

        {decision === "approved" && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/50 border border-amber-100">
            <span className="text-xs font-bold text-gray-700">Chấm điểm:</span>
            <Stars value={score} onChange={setScore} />
          </div>
        )}

        <CustomTextarea
          label={decision === "rework" ? "Điểm cần dọn lại (bắt buộc):" : "Nhận xét của Ban Quản Lý:"}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nhập nhận xét hoặc lưu ý cho thành viên trực..."
        />

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition disabled:opacity-60 inline-flex items-center gap-1.5 ${
              decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" : "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
            }`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {decision === "approved" ? "Xác nhận Đạt Chuẩn" : "Yêu cầu dọn lại"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------
// MODAL: PHÂN CÔNG CA TRỰC MỚI / SỬA PHÂN CÔNG (duty.manage)
// ---------------------------------------------------------------------
function AssignmentModal({
  open,
  target,
  data,
  days,
  today,
  onClose,
  onDone,
}: {
  open: boolean;
  target: DutyAssignmentDto | null;
  data: DutyWeekDto | undefined;
  days: string[];
  today: string;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { members, rooms, showToast } = useApp();
  const areas = useMemo(() => data?.areas ?? [], [data]);
  const shifts = useMemo(() => data?.shifts ?? [], [data]);
  const [date, setDate] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (target) {
      setDate(target.date);
      setShiftId(target.shift.id);
      setAreaId(target.area.id);
      setRoomCode(target.roomCode ?? "");
      setMemberIds(target.members.map((m) => m.id));
    } else {
      setDate(days.includes(today) ? today : days[0]);
      setShiftId(shifts[0]?.id ?? "");
      setAreaId(areas[0]?.id ?? "");
      setRoomCode("");
      setMemberIds([]);
    }
    setOverride("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  const active = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const busyMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of data?.roster.assignments ?? []) {
      if (a.id === target?.id || a.date !== date || a.shift.id !== shiftId || a.status === "cancelled") continue;
      for (const m of a.members) out[m.id] = `Đang trực ${a.area.name}`;
    }
    return out;
  }, [data, date, shiftId, target]);
  const area = areas.find((a) => a.id === areaId);

  if (!open) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberIds.length) {
      showToast("warning", "Chọn ít nhất một người trực.");
      return;
    }
    setBusy(true);
    try {
      if (target) {
        await dutyApi.updateAssignment(target.id, {
          memberIds,
          roomCode: roomCode || null,
          overrideReason: override.trim() || null,
          ...(date !== target.date ? { date } : {}),
          ...(shiftId !== target.shift.id ? { shiftId } : {}),
          ...(areaId !== target.area.id ? { areaId } : {}),
        });
        showToast("success", "Đã cập nhật phân công ca trực.");
      } else {
        await dutyApi.createAssignment({ date, areaId, shiftId, roomCode: roomCode || null, memberIds, overrideReason: override.trim() || null });
        showToast("success", data?.roster.status === "published" ? "Đã thêm ca trực vào roster đã công bố." : "Đã thêm ca trực vào roster nháp — nhớ bấm Công bố.");
      }
      await onDone();
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      icon={target ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
      title={target ? "Sửa Phân Công Ca Trực" : "Phân Công Ca Trực Nhật Mới"}
      subtitle={target ? `${target.area.name} · ${weekdayLabel(target.date)} ${dm(target.date)}` : "Tạo ca vệ sinh cho các phòng và thành viên"}
    >
      <form onSubmit={submit} className="p-5 space-y-3.5">
        {data?.roster.status === "none" && (
          <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            Tuần này chưa có roster — ca mới sẽ nằm trong roster nháp, công bố sau khi phân công xong.
          </p>
        )}
        <CustomSelect
          label="Khu vực vệ sinh *:"
          value={areaId}
          onChange={setAreaId}
          options={areas.map((a) => ({ value: a.id, label: `${a.icon} ${a.name}`, subLabel: a.isWholeHouse ? "Toàn nhà" : `Tối thiểu ${a.minAssignees} người` }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <CustomSelect label="Ngày trong tuần:" value={date} onChange={setDate} options={days.map((d) => ({ value: d, label: `${weekdayLabel(d)} ${dm(d)}` }))} />
          <CustomSelect label="Ca trực:" value={shiftId} onChange={setShiftId} options={shifts.map((s) => ({ value: s.id, label: s.label, subLabel: `${s.start}–${s.end}` }))} />
        </div>
        <CustomSelect
          label="Phòng phụ trách:"
          value={roomCode}
          onChange={setRoomCode}
          options={[
            { value: "", label: "— Không gắn phòng —" },
            ...rooms.filter((r) => r.type === "bedroom").map((r) => ({ value: r.id, label: r.name, subLabel: r.id })),
          ]}
        />
        <MemberMultiPicker
          label={`Thành viên trực *${area && !area.isWholeHouse ? ` (tối thiểu ${area.minAssignees})` : ""}:`}
          members={active}
          value={memberIds}
          onChange={setMemberIds}
          busy={busyMap}
        />
        <CustomInput
          label="Lý do ghi đè (nếu thành viên đã báo bận/nghỉ phép):"
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          placeholder="Bỏ trống nếu không cần"
        />
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy || !areaId || !shiftId || !date}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {target ? "Lưu thay đổi" : "Tạo ca trực mới"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------
// MODAL: HỦY CA TRỰC
// ---------------------------------------------------------------------
function CancelModal({ target, draft, onClose, onDone }: { target: DutyAssignmentDto | null; draft: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { showToast } = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(""), [target]);
  if (!target) return null;
  const submit = async () => {
    if (!draft && reason.trim().length < 3) {
      showToast("warning", "Nhập lý do hủy ca (mọi người đã thấy lịch này).");
      return;
    }
    setBusy(true);
    try {
      await dutyApi.cancelAssignment(target.id, reason.trim() || undefined);
      await onDone();
      showToast("success", `Đã hủy ca ${target.area.name} ${dm(target.date)}.`);
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      open
      onClose={onClose}
      icon={<X className="w-5 h-5" />}
      iconClass="bg-rose-600 text-white"
      headerClass="bg-rose-50/60"
      title="Hủy Ca Trực"
      subtitle={`${target.area.name} · ${weekdayLabel(target.date)} ${dm(target.date)} · ${target.shift.label}`}
    >
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-600">
          Ca bị hủy vẫn được giữ trong lịch sử (không xóa). {draft ? "Roster đang là bản nháp nên có thể bỏ trống lý do." : "Roster đã công bố — bắt buộc ghi lý do."}
        </p>
        <CustomTextarea label="Lý do hủy ca:" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Cả nhà đi tĩnh tâm, khu vực đang sửa chữa…" />
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Đóng
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-200 transition disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Xác nhận hủy ca
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
