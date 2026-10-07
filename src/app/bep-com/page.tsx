"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  Check,
  X,
  AlertCircle,
  ThumbsUp,
  Copy,
  Send,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Settings2,
  Users,
  Star,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useZaloSend } from "@/lib/zalo-client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { mealsApi, refreshMeals, useMealsWeek, usePantry, useMealSurveys } from "@/lib/data/kitchen";
import {
  addDays,
  countdown,
  dayCookTeam,
  dayMonthLong,
  dm,
  formatMealDayForZalo,
  kitchenErrorText,
  slotStatusText,
  vnTime,
  vnd,
} from "@/lib/kitchen-format";
import type { MealDayDto, MealRosterRowDto, MealSlotDto, MealType, RegStateDto } from "@/lib/types/kitchen";
import BepComLoading from "./loading";
import MenuEditModal from "./_components/MenuEditModal";
import FeedbackModal from "./_components/FeedbackModal";
import SurveyPanel from "./_components/SurveyPanel";
import PantryTab from "./_components/PantryTab";
import MealSettingsModal from "./_components/MealSettingsModal";

type Tab = "diem-danh" | "thuc-don" | "kho-do";

export default function BepComPage() {
  const { members, showToast, isLoadingSkeleton } = useApp();
  const { canSend: canZaloSend, sending: zaloSending, send: zaloSend } = useZaloSend();
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("diem-danh");
  const [date, setDate] = useState<string | null>(null);
  const { week, error, isLoading, mutate } = useMealsWeek(date);
  const { pantry } = usePantry();
  const { surveys } = useMealSurveys();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [editDay, setEditDay] = useState<MealDayDto | null>(null);
  const [feedback, setFeedback] = useState<{ day: MealDayDto; meal: MealType } | null>(null);
  const [surveyCreate, setSurveyCreate] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const sel = useMemo(() => week?.days.find((d) => d.date === week.selectedDate) ?? week?.days[0] ?? null, [week]);
  const phoneOf = useMemo(() => new Map(members.map((m) => [m.id, m.phone])), [members]);

  if (isLoadingSkeleton || (!week && isLoading)) return <BepComLoading />;
  if (!week || !sel) {
    return (
      <div className="p-6 rounded-3xl bg-white border border-rose-100 text-sm text-rose-700">
        Không tải được dữ liệu Bếp &amp; Cơm{error ? `: ${kitchenErrorText(error)}` : "."}
      </div>
    );
  }

  const { canManage, canRegister, enabled } = week;
  const lunchTotal = sel.lunch.eaters + sel.lunch.guests;
  const dinnerTotal = sel.dinner.eaters + sel.dinner.guests;
  const selLabel = sel.isToday ? "hôm nay" : `${sel.weekdayLong} ${dm(sel.date)}`;
  const weekOver = week.weekEnd < week.today;
  const openSurveys = surveys.filter((s) => s.status === "open").length;

  // ------------------------------------------------------------------
  // Thao tác
  // ------------------------------------------------------------------
  // Đang tải tuần/ngày khác (SWR giữ dữ liệu cũ) ⇒ tạm khóa nút để không ghi nhầm vào ngày đang hiển thị
  const switching = date !== null && week.selectedDate !== date;
  const canToggle = (slot: MealSlotDto) => !switching && enabled && canRegister && (canManage || !slot.locked);

  const toggle = async (row: MealRosterRowDto, meal: MealType) => {
    const slot = sel[meal];
    const cur = row[meal];
    const willEat = !(cur?.willEat ?? false);
    const key = `${row.memberId}|${meal}`;
    setPending((p) => new Set(p).add(key));
    try {
      await mealsApi.register({ date: sel.date, meal, willEat, memberId: row.memberId === week.meId ? undefined : row.memberId });
      await mutate();
      showToast(
        "success",
        `Đã cập nhật bữa ${meal === "lunch" ? "trưa" : "tối"} ${dm(slot.date)}: ${willEat ? "Ăn" : "Nghỉ"} (${row.memberId === week.meId ? "bạn" : row.name})`
      );
    } catch (e) {
      showToast("error", kitchenErrorText(e));
      mutate();
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  };

  const registerWeek = async () => {
    setBusy(true);
    try {
      const r = await mealsApi.registerWeek(sel.date);
      await refreshMeals();
      showToast(r.registered ? "success" : "info", r.message);
    } catch (e) {
      showToast("error", kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const registerAll = async () => {
    setBusy(true);
    try {
      const r = await mealsApi.registerAll(sel.date);
      await refreshMeals();
      showToast(r.registered ? "success" : "info", r.message);
    } catch (e) {
      showToast("error", kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyMealZalo = async () => {
    const text = formatMealDayForZalo({ day: sel, roster: week.roster, canSeeNames: canManage, activeMembers: week.activeMembers, today: week.today });
    await zaloSend(text, "Đã gửi danh sách chốt cơm vào nhóm Zalo.");
  };

  // ------------------------------------------------------------------
  // Mảnh giao diện
  // ------------------------------------------------------------------
  const mealChip = (slot: MealSlotDto, tone: "purple" | "emerald") => {
    const st = slotStatusText(slot);
    const cd = !st ? countdown(slot.cutoffAt, now) : null;
    const base = tone === "purple" ? "bg-purple-200/70 text-purple-900" : "bg-emerald-200/70 text-emerald-900";
    return (
      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg text-center whitespace-nowrap ${base} ${cd && cd.includes("phút") ? "animate-pulse" : ""}`}>
        {st ?? cd ?? `Chốt ${vnTime(slot.cutoffAt)}`}
      </span>
    );
  };

  const regButton = (row: MealRosterRowDto, meal: MealType) => {
    const st: RegStateDto | null = row[meal];
    const slot = sel[meal];
    const on = !!st?.willEat;
    const busyBtn = pending.has(`${row.memberId}|${meal}`);
    const allowed = canToggle(slot) && slot.status !== "cancelled";
    const color = meal === "lunch" ? "bg-primary" : "bg-secondary";
    return (
      <button
        onClick={() => allowed && !busyBtn && toggle(row, meal)}
        disabled={!allowed || busyBtn}
        title={
          !allowed
            ? slot.status === "cancelled"
              ? "Bữa này không nấu"
              : !enabled
                ? "Phân hệ đang tạm hoãn"
                : `Đã quá giờ chốt ${vnTime(slot.cutoffAt)} — liên hệ Ban Ẩm thực`
            : st === null
              ? "Chưa đăng ký — bấm để đăng ký ăn"
              : `${on ? "Đang đăng ký ăn — bấm để báo nghỉ" : "Đang báo nghỉ — bấm để đăng ký ăn"}${st.registeredBy ? ` (${st.registeredBy} ghi hộ)` : ""}`
        }
        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
          on
            ? `${color} text-white shadow-2xs`
            : st === null
              ? "bg-white text-gray-400 border border-dashed border-gray-300 hover:border-gray-400"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
        } ${!allowed ? "opacity-60 cursor-not-allowed" : ""} ${busyBtn ? "animate-pulse" : ""}`}
      >
        {on ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
        <span>{meal === "lunch" ? "Trưa" : "Tối"}</span>
        {on && st?.guests ? <span className="text-[10px]">+{st.guests}</span> : null}
        {slot.locked && canManage && allowed && <Lock className="w-3 h-3 opacity-70" />}
      </button>
    );
  };

  const rowNote = (row: MealRosterRowDto) => {
    const parts: string[] = [];
    for (const meal of ["lunch", "dinner"] as MealType[]) {
      const st = row[meal];
      const label = meal === "lunch" ? "trưa" : "tối";
      if (!st) parts.push(`chưa ĐK ${label}`);
      else if (!st.willEat) parts.push(`nghỉ ${label}${st.note ? ` (${st.note})` : ""}`);
    }
    return parts.join(" · ");
  };

  const menuList = (slot: MealSlotDto, dot: string) =>
    slot.status === "cancelled" ? (
      <p className="text-xs text-gray-500 italic">Không nấu bữa này.</p>
    ) : slot.dishes.length ? (
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-800">
        {slot.dishes.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
            <span>{d}</span>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-xs text-gray-400">Ban Ẩm thực chưa lên thực đơn bữa này.</p>
    );

  const maxBar = Math.max(week.activeMembers, 1, ...week.days.flatMap((d) => [d.lunch.eaters + d.lunch.guests, d.dinner.eaters + d.dinner.guests]));
  const servedSlots = week.days.flatMap((d) => [d.lunch, d.dinner]).filter((s) => s.menuId && s.status !== "cancelled");
  const avgPerMeal = servedSlots.length ? servedSlots.reduce((t, s) => t + s.eaters + s.guests, 0) / servedSlots.length : 0;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* MODULE STATUS BANNER */}
      {enabled ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-emerald-900">Phân hệ Bếp &amp; Cơm đang hoạt động</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900 uppercase">Đang mở</span>
              </div>
              <p className="text-xs text-emerald-800/90 mt-0.5">
                Đăng ký suất trước giờ chốt: trưa <b>{week.settings.lunchCutoff}</b>, tối <b>{week.settings.dinnerCutoff}</b> · Sau giờ chốt chỉ Ban Ẩm thực sửa được suất.
              </p>
            </div>
          </div>
          {(canManage || week.canToggleFeature) && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs whitespace-nowrap"
            >
              <Settings2 className="w-3.5 h-3.5" /> Cấu hình bếp
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 text-xl font-bold">⏸️</div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-amber-900">Tính năng Bếp &amp; Cơm tạm hoãn</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 uppercase">Tạm hoãn</span>
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Người quản lý đang tạm hoãn phân hệ này: dữ liệu bên dưới chỉ để tham khảo, không tiếp nhận đăng ký / sửa suất ăn mới.
              </p>
            </div>
          </div>
          {week.canToggleFeature ? (
            <button
              onClick={() => setSettingsOpen(true)}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs whitespace-nowrap"
            >
              Bật lại phân hệ
            </button>
          ) : (
            <Link href="/" className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs whitespace-nowrap">
              Về Trang Chủ →
            </Link>
          )}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Sinh Hoạt Cộng Đoàn › Bếp Ăn &amp; Phục Vụ</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Bếp &amp; Cơm</h1>
          <p className="text-sm text-gray-500 mt-1">Điểm danh bữa ăn, thực đơn hàng tuần và quản lý kho gia vị thực phẩm</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canZaloSend && (
            <button
              onClick={handleCopyMealZalo}
              disabled={zaloSending}
              className="px-3.5 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs transition flex items-center gap-1.5 active:scale-95 shadow-2xs disabled:opacity-60"
              title={`Gửi danh sách chốt cơm trưa và tối ${selLabel} vào nhóm Zalo bằng bot`}
            >
              <Send className="w-3.5 h-3.5 text-primary" />
              <span>{zaloSending ? "Đang gửi…" : "Gửi chốt cơm Zalo"}</span>
            </button>
          )}

          {canRegister && (
            <button
              onClick={registerWeek}
              disabled={busy || switching || !enabled || weekOver}
              title={weekOver ? "Tuần này đã qua" : !enabled ? "Phân hệ đang tạm hoãn" : "Đăng ký ăn mọi bữa còn mở từ hôm nay đến hết tuần đang xem"}
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>Đăng ký ăn cả tuần</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex gap-2 border-b border-purple-50 pb-2 overflow-x-auto">
        {(
          [
            ["diem-danh", "🍽️ Đặt cơm & Điểm danh"],
            ["thuc-don", `📋 Thực đơn cả tuần (7 ngày)${openSurveys ? ` · ${openSurveys} khảo sát` : ""}`],
            ["kho-do", `📦 Kho đồ & Gia vị${pantry ? ` (${pantry.items.length})` : ""}`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === t ? "bg-primary text-white shadow-xs" : "text-gray-600 hover:bg-surface-container-low"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* WEEK STRIP (ngày đang chọn — dùng cho tab Đặt cơm & Thực đơn) */}
      {activeTab !== "kho-do" && (
        <div className="bg-white rounded-3xl p-3 sm:p-4 border border-purple-50 shadow-xs flex items-center gap-2">
          <button
            onClick={() => setDate(addDays(sel.date, -7))}
            className="p-2 rounded-xl text-gray-500 hover:bg-surface-container-low hover:text-primary shrink-0"
            title="Tuần trước"
            aria-label="Tuần trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="grid grid-cols-7 gap-1.5 flex-1 min-w-0">
            {week.days.map((d) => {
              const active = d.date === sel.date;
              return (
                <button
                  key={d.date}
                  onClick={() => setDate(d.date)}
                  className={`rounded-2xl px-1 py-2 flex flex-col items-center transition border ${
                    active
                      ? "bg-primary text-white border-primary shadow-xs"
                      : d.isToday
                        ? "bg-purple-50 border-primary/40 text-primary"
                        : "bg-surface-container-low/60 border-transparent text-gray-700 hover:border-purple-200"
                  }`}
                >
                  <span className="text-[11px] font-bold">{d.weekday}</span>
                  <span className={`text-[10px] ${active ? "text-purple-100" : "text-gray-400"}`}>{dm(d.date)}</span>
                  <span className={`hidden sm:block text-[10px] font-semibold mt-0.5 ${active ? "text-white" : "text-gray-500"}`}>
                    {d.lunch.eaters + d.lunch.guests}·{d.dinner.eaters + d.dinner.guests}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setDate(addDays(sel.date, 7))}
            className="p-2 rounded-xl text-gray-500 hover:bg-surface-container-low hover:text-primary shrink-0"
            title="Tuần sau"
            aria-label="Tuần sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {sel.date !== week.today && (
            <button onClick={() => setDate(week.today)} className="hidden sm:block px-3 py-2 rounded-xl bg-purple-100 text-primary text-xs font-bold hover:bg-purple-200 shrink-0">
              Hôm nay
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: ĐẶT CƠM & ĐIỂM DANH */}
      {/* ========================================================================= */}
      {activeTab === "diem-danh" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* HERO DATE BOX */}
            <div className="lg:col-span-5 rounded-3xl p-6 bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white shadow-lg shadow-purple-300/40 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md">{week.academicYear ?? "Năm học hiện tại"}</span>
                <UtensilsCrossed className="w-5 h-5 text-[#e9d5ff]" />
              </div>

              <div className="my-6">
                <span className="text-sm font-medium text-[#e9d5ff] block">
                  {sel.weekdayLong}
                  {sel.isToday ? " · Hôm nay" : ""}
                </span>
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">{dayMonthLong(sel.date)}</div>
                <p className="text-xs text-[#e9d5ff] mt-2">
                  {sel.liturgy ? `${sel.liturgy} · ` : ""}Tuần {week.weekNo} · Cộng đoàn Thánh Phanxicô Assisi
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[#e9d5ff] font-semibold block text-[10px] uppercase tracking-wider">Trực bếp {sel.isToday ? "hôm nay" : `ngày ${dm(sel.date)}`}:</span>
                  <span className="font-bold text-white mt-0.5 block">{dayCookTeam(sel) || "Chưa phân công"}</span>
                </div>
                <span className="text-xl">👨‍🍳</span>
              </div>
            </div>

            {/* MEAL SERVICE STATUS */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col justify-between gap-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Kế hoạch phục vụ {selLabel}</h2>
                  <p className="text-xs text-gray-500">Tổng hợp định mức các suất cơm trưa &amp; tối (đã gồm khách)</p>
                </div>
                {enabled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Bếp đang hoạt động
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold whitespace-nowrap">Tạm hoãn</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-gray-600">Bữa Trưa</span>
                    <div className="text-2xl font-extrabold text-primary mt-1">
                      {lunchTotal} <span className="text-xs font-medium text-gray-500">suất</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {sel.lunch.guests ? `${sel.lunch.eaters} anh em + ${sel.lunch.guests} khách · ` : ""}11h30 dọn cơm
                    </span>
                  </div>
                  {mealChip(sel.lunch, "purple")}
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-gray-600">Bữa Tối</span>
                    <div className="text-2xl font-extrabold text-secondary mt-1">
                      {dinnerTotal} <span className="text-xs font-medium text-gray-500">suất</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {sel.dinner.guests ? `${sel.dinner.eaters} anh em + ${sel.dinner.guests} khách · ` : ""}18h30 sau giờ Kinh Tối
                    </span>
                  </div>
                  {mealChip(sel.dinner, "emerald")}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <b>Lưu ý về giờ chốt số suất ăn:</b> Hạn chốt đăng ký suất trưa trước <b>{vnTime(sel.lunch.cutoffAt)}</b> &amp; tối trước{" "}
                  <b>{vnTime(sel.dinner.cutoffAt)}</b> để anh em trực bếp mua sắm chuẩn bị đúng lượng thực phẩm, tránh lãng phí.
                </span>
              </div>
            </div>
          </div>

          {/* ATTENDANCE GRID */}
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">{canManage ? "Bảng điểm danh thành viên lưu xá" : "Đăng ký suất ăn của bạn"}</h2>
                <p className="text-xs text-gray-500">
                  {canManage
                    ? `Bấm nút để chuyển Ăn / Nghỉ cho ${selLabel} — Ban Ẩm thực sửa được cả sau giờ chốt`
                    : `Bấm nút để chuyển Ăn / Nghỉ cho ${selLabel} (trước giờ chốt). Danh sách cả nhà chỉ Ban Ẩm thực xem được.`}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-gray-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Ăn trưa ({sel.lunch.eaters})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary" /> Ăn tối ({sel.dinner.eaters})
                </span>
                {canManage && (
                  <button
                    onClick={() => setConfirmAll(true)}
                    disabled={busy || switching || !enabled}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-100 text-primary font-bold hover:bg-purple-200 disabled:opacity-50"
                  >
                    <Users className="w-3.5 h-3.5" /> Đăng ký cả nhà
                  </button>
                )}
              </div>
            </div>

            {week.roster.length === 0 && <p className="text-xs text-gray-400">Tài khoản của bạn chưa gắn hồ sơ thành viên nên không có suất ăn để đăng ký.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {week.roster.map((m) => {
                const phone = phoneOf.get(m.memberId);
                const note = rowNote(m);
                return (
                  <div
                    key={m.memberId}
                    className={`p-3.5 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition border flex items-center justify-between gap-3 ${
                      m.memberId === week.meId ? "border-primary/40" : "border-purple-50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                        {m.avatarFileId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/v1/files/${m.avatarFileId}?v=thumb`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          m.avatarText
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">
                          {m.fullName}
                          {m.memberId === week.meId && <span className="ml-1 text-[10px] font-semibold text-primary">(bạn)</span>}
                          {m.onLeave && <span className="ml-1 text-[10px] font-semibold text-amber-600">(đang vắng)</span>}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate" title={note}>
                          {m.room}
                          {phone ? ` · ${phone}` : ""}
                          {note ? ` · ${note}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {regButton(m, "lunch")}
                      {regButton(m, "dinner")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MENU OF SELECTED DAY & WEEKLY DENSITY */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Thực đơn {selLabel}</h2>
                  <p className="text-xs text-gray-500">
                    {sel.lunch.title ?? sel.dinner.title ?? `Khẩu phần dinh dưỡng cộng đoàn ${sel.weekdayLong}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sel.lunch.dishes.length + sel.dinner.dishes.length > 0 ? (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg whitespace-nowrap">Đã lên thực đơn</span>
                  ) : (
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg whitespace-nowrap">Chưa có thực đơn</span>
                  )}
                  {canManage && (
                    <button onClick={() => setEditDay(sel)} className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50" title="Sửa thực đơn ngày này">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-purple-50">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-900 mb-2">
                    <span>☀️ Bữa Trưa (11:30)</span>
                    <span className="text-[11px] text-gray-500 font-normal">
                      {sel.lunch.dishes.length} món
                    </span>
                  </div>
                  {menuList(sel.lunch, "bg-primary")}
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-purple-50">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-2">
                    <span>🌙 Bữa Tối (18:30)</span>
                    <span className="text-[11px] text-gray-500 font-normal">
                      {sel.dinner.dishes.length} món
                    </span>
                  </div>
                  {menuList(sel.dinner, "bg-secondary")}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Mật độ đăng ký ăn trong tuần</h2>
                  <p className="text-xs text-gray-500">
                    Số suất Thứ 2 ({dm(week.weekStart)}) đến Chủ Nhật ({dm(week.weekEnd)})
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between gap-2 h-44 pt-6 px-2">
                {week.days.map((d) => {
                  const l = d.lunch.eaters + d.lunch.guests;
                  const dn = d.dinner.eaters + d.dinner.guests;
                  const hl = d.date === sel.date;
                  return (
                    <button key={d.date} onClick={() => setDate(d.date)} className="flex flex-col items-center gap-2 flex-1">
                      <div className="w-full flex items-end justify-center gap-1 h-32">
                        <div
                          className={`w-3.5 rounded-t-md transition-all ${hl ? "bg-primary" : "bg-purple-200"}`}
                          style={{ height: `${Math.max(2, (l / maxBar) * 100)}%` }}
                          title={`Trưa ${d.weekday} ${dm(d.date)}: ${l} suất`}
                        />
                        <div
                          className={`w-3.5 rounded-t-md transition-all ${hl ? "bg-secondary" : "bg-emerald-200"}`}
                          style={{ height: `${Math.max(2, (dn / maxBar) * 100)}%` }}
                          title={`Tối ${d.weekday} ${dm(d.date)}: ${dn} suất`}
                        />
                      </div>
                      <span className={`text-[11px] font-bold ${hl ? "text-primary" : d.isToday ? "text-purple-500" : "text-gray-500"}`}>{d.weekday}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 bg-purple-50/50 rounded-2xl flex items-center justify-between text-xs text-gray-600">
                <span>
                  Trung bình: <b>{avgPerMeal.toFixed(1).replace(".", ",")} suất/bữa</b> · {week.activeMembers} thành viên
                </span>
                <span className="text-primary font-bold">Tuần {week.weekNo}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: THỰC ĐƠN CẢ TUẦN */}
      {/* ========================================================================= */}
      {activeTab === "thuc-don" && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Kế hoạch thực đơn tuần {dm(week.weekStart)} – {dm(week.weekEnd)} (Tuần {week.weekNo})
              </h2>
              <p className="text-xs text-gray-500">Phân công mua sắm thực phẩm và chế biến theo từng cặp trực · khảo sát món ăn của anh em</p>
            </div>
            <button
              onClick={() => {
                if (canManage) return setSurveyCreate(true);
                document.getElementById("khao-sat-mon")?.scrollIntoView({ behavior: "smooth", block: "start" });
                if (!openSurveys) showToast("info", "Hiện chưa có khảo sát món nào đang mở — Ban Ẩm thực sẽ mở phiếu khảo sát sớm.");
              }}
              className="px-4 py-2 rounded-xl bg-purple-100 text-primary font-bold text-xs hover:bg-purple-200 transition whitespace-nowrap"
            >
              {canManage ? "+ Đề xuất món tuần mới" : openSurveys ? "Bình chọn món tuần mới ↓" : "+ Đề xuất món tuần mới"}
            </button>
          </div>

          <SurveyPanel canManage={canManage} canRegister={canRegister} createOpen={surveyCreate} setCreateOpen={setSurveyCreate} weekStart={week.weekStart} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {week.days.map((d) => {
              const team = dayCookTeam(d);
              const rated = [d.lunch.rating, d.dinner.rating].filter(Boolean) as { avg: number; count: number }[];
              const ratingCount = rated.reduce((t, r) => t + r.count, 0);
              const ratingAvg = ratingCount ? rated.reduce((t, r) => t + r.avg * r.count, 0) / ratingCount : 0;
              const canFeedback = (d.isPast || d.isToday) && (d.lunch.menuId || d.dinner.menuId);
              return (
                <div
                  key={d.date}
                  className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between transition ${
                    d.isToday ? "border-primary ring-2 ring-purple-200 bg-purple-50/20" : d.date === sel.date ? "border-purple-300" : "border-purple-50 hover:border-purple-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 gap-2">
                      <span className="text-xs font-bold text-gray-900">
                        {d.weekdayLong} ({dm(d.date)}
                        {d.isToday ? " - Hôm nay" : ""})
                      </span>
                      <div className="flex items-center gap-1.5">
                        {d.isToday && <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold">Hôm nay</span>}
                        {canManage && (
                          <button onClick={() => setEditDay(d)} className="p-1 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50" title="Sửa thực đơn & người trực">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {(d.lunch.title || d.liturgy) && <div className="mt-2 text-[11px] font-bold text-primary">{d.lunch.title ?? d.liturgy}</div>}
                    <div className="mt-2.5 text-[11px] text-gray-500 flex items-center gap-1.5">
                      <span>👨‍🍳</span>
                      <span className="font-semibold text-gray-700">{team || "Chưa phân công trực bếp"}</span>
                    </div>

                    <div className="mt-3 p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center justify-between mb-1">
                        <span>☀️ Bữa Trưa:</span>
                        <span className="normal-case tracking-normal font-semibold text-gray-500">{d.lunch.eaters + d.lunch.guests} suất</span>
                      </span>
                      {d.lunch.status === "cancelled" ? (
                        <p className="text-xs text-gray-500 italic">Không nấu</p>
                      ) : d.lunch.dishes.length ? (
                        <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                          {d.lunch.dishes.map((dish, i) => (
                            <li key={i}>{dish}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-400">Chưa lên thực đơn</p>
                      )}
                    </div>

                    <div className="mt-2.5 p-3 rounded-2xl bg-emerald-50/40 border border-emerald-50/60">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between mb-1">
                        <span>🌙 Bữa Tối:</span>
                        <span className="normal-case tracking-normal font-semibold text-gray-500">{d.dinner.eaters + d.dinner.guests} suất</span>
                      </span>
                      {d.dinner.status === "cancelled" ? (
                        <p className="text-xs text-gray-500 italic">Không nấu</p>
                      ) : d.dinner.dishes.length ? (
                        <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                          {d.dinner.dishes.map((dish, i) => (
                            <li key={i}>{dish}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-400">Chưa lên thực đơn</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] gap-2">
                    <span className="text-gray-400">
                      {ratingCount === 0 && "Chưa có đánh giá"}
                      {ratingCount > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600 font-semibold">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {ratingAvg.toFixed(1)} ({ratingCount})
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => canFeedback && setFeedback({ day: d, meal: d.isToday && d.lunch.pastCutoff && d.dinner.menuId ? "dinner" : "lunch" })}
                      disabled={!canFeedback}
                      title={canFeedback ? "Chấm sao, gửi lời khen / góp ý cho bữa ăn" : "Chỉ bình chọn được bữa ăn đã diễn ra"}
                      className="inline-flex items-center gap-1 text-primary hover:underline font-semibold disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>{d.lunch.myFeedback || d.dinner.myFeedback ? "Đã bình chọn" : "Bình chọn món"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KHO ĐỒ & GIA VỊ */}
      {/* ========================================================================= */}
      {activeTab === "kho-do" && <PantryTab />}

      <MenuEditModal day={editDay} onClose={() => setEditDay(null)} />
      <FeedbackModal day={feedback ? week.days.find((d) => d.date === feedback.day.date) ?? feedback.day : null} initialMeal={feedback?.meal} canManage={canManage} onClose={() => setFeedback(null)} />
      <MealSettingsModal open={settingsOpen} week={week} onClose={() => setSettingsOpen(false)} />
      <ConfirmDialog
        isOpen={confirmAll}
        onClose={() => setConfirmAll(false)}
        variant="info"
        icon={<Users className="w-6 h-6" />}
        title={`Đăng ký cả nhà ${selLabel}?`}
        message={
          <>
            Ghi suất trưa &amp; tối {selLabel} cho mọi thành viên <b>chưa đăng ký</b> ({week.activeMembers} thành viên đang ở). Anh em đã báo nghỉ được giữ nguyên.
          </>
        }
        confirmText="Đăng ký cả nhà"
        onConfirm={registerAll}
      />
      {session && !session.member && (
        <p className="text-[11px] text-gray-400">Tài khoản kỹ thuật không có hồ sơ thành viên — chỉ xem được dữ liệu bếp.</p>
      )}
    </div>
  );
}
