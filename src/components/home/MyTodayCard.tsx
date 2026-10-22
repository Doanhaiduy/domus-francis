"use client";

// Gói H: thẻ "Việc của tôi hôm nay" ở ĐẦU trang Tổng quan cho MỌI thành viên (GET /api/v1/me/today — src/server/modules/me-today.ts).
// Mỗi dòng là một việc của chính mình với MỘT hành động một chạm: chụp ảnh điểm danh (CheckInModal), check-in đi lễ (MassCheckinModal),
// báo cơm (PUT /api/v1/meals/registrations), mã QR nộp quỹ (PayQrDialog), xin thêm giờ (ExtendDialog), nhận lời phục vụ phụng vụ,
// đọc & xác nhận Luật nhà. Việc gấp tô đỏ và lên đầu; việc đã xong hôm nay gom gọn ở cuối. Trống ⇒ "Hôm nay bạn không có việc nào cần làm 🎉".
// Liên kết lối tắt: /?viec=check-in-le mở ngay hộp thoại check-in đi lễ (lối tắt của ứng dụng đã cài — app/manifest.ts).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { mutate as globalMutate } from "swr";
import {
  BookOpen,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  Church,
  CircleCheck,
  DoorOpen,
  Gavel,
  Loader2,
  QrCode,
  RefreshCw,
  ScrollText,
  Sparkles,
  Sun,
  TriangleAlert,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/utils";
import { duesTransferContent } from "@/lib/vietqr";
import { MY_TODAY_SHORTCUT_EVENT, refreshMyToday, useMyToday } from "@/lib/data/me-today";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CalendarDayDetailDto } from "@/lib/types/liturgy";
import type { MyTodayDues, MyTodayEventCheckin, MyTodayItem, MyTodayKind, MyTodayLeave, MyTodayMass, MyTodayMeal } from "@/lib/types/me-today";
import { eventDtoFor, leaveDtoFor } from "./my-today-adapters";

// Hộp thoại dùng lại của các trang khác — chỉ tải khi cần (giảm dung lượng trang Tổng quan)
const PayQrDialog = dynamic(() => import("@/components/finance/PayQrDialog"), { ssr: false });
const CheckInModal = dynamic(() => import("@/app/lich-su-kien/_components/CheckInModal"), { ssr: false });
const MassCheckinModal = dynamic(() => import("@/app/lich-su-kien/_components/MassCheckinModal"), { ssr: false });
const ExtendDialog = dynamic(() => import("@/app/xin-phep/_components/ExtendDialog").then((m) => m.ExtendDialog), { ssr: false });

const KIND_STYLE: Record<MyTodayKind, { icon: LucideIcon; tile: string }> = {
  event_checkin: { icon: Camera, tile: "bg-emerald-50 text-emerald-700" },
  mass: { icon: Church, tile: "bg-amber-50 text-amber-700" },
  meal: { icon: UtensilsCrossed, tile: "bg-orange-50 text-orange-700" },
  door: { icon: DoorOpen, tile: "bg-sky-50 text-sky-700" },
  leave: { icon: CalendarClock, tile: "bg-blue-50 text-blue-700" },
  liturgy: { icon: BookOpen, tile: "bg-indigo-50 text-indigo-700" },
  duty_week: { icon: Sparkles, tile: "bg-cyan-50 text-cyan-700" },
  dues: { icon: Wallet, tile: "bg-violet-50 text-violet-700" },
  discipline: { icon: Gavel, tile: "bg-rose-50 text-rose-700" },
  house_rules: { icon: ScrollText, tile: "bg-purple-50 text-purple-700" },
};

const WEEKDAY = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const dayLabel = (iso: string) => `${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MEAL_LABEL = { lunch: "Trưa", dinner: "Tối" } as const;

/** Nhãn ngắn của việc đã xong (dòng tóm tắt cuối thẻ). */
const doneLabel = (i: MyTodayItem) =>
  i.kind === "meal" ? "báo cơm" : i.kind === "event_checkin" ? `điểm danh ${i.event.title}` : i.kind === "mass" ? "check-in đi lễ" : i.title.toLowerCase();

const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition active:scale-95 disabled:opacity-60 whitespace-nowrap";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 bg-white text-gray-700 hover:border-purple-200 hover:text-primary transition active:scale-95 disabled:opacity-60 whitespace-nowrap";

// ---------------------------------------------------------------------
// Báo cơm: mỗi bữa còn mở một cặp nút Ăn / Không
// ---------------------------------------------------------------------
function MealToggles({ item, busy, onSet }: { item: MyTodayMeal; busy: string | null; onSet: (meal: "lunch" | "dinner", eat: boolean) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.meals.map((s) => (
        <div key={s.meal} role="group" aria-label={`Cơm ${MEAL_LABEL[s.meal].toLowerCase()}`} className="inline-flex items-center rounded-xl border border-gray-200 bg-white p-0.5">
          <span className="pl-2 pr-1.5 text-[11px] font-bold text-gray-600">{MEAL_LABEL[s.meal]}</span>
          {s.cancelled ? (
            <span className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">Nghỉ nấu</span>
          ) : s.open ? (
            ([true, false] as const).map((eat) => {
              const on = s.willEat === eat;
              const k = `${s.meal}:${eat}`;
              return (
                <button
                  key={String(eat)}
                  type="button"
                  aria-pressed={on}
                  disabled={!!busy}
                  onClick={() => onSet(s.meal, eat)}
                  className={cn(
                    "min-w-[44px] px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition active:scale-95 disabled:opacity-60",
                    on ? (eat ? "bg-emerald-600 text-white" : "bg-gray-600 text-white") : "text-gray-600 hover:bg-purple-50 hover:text-primary"
                  )}
                >
                  {busy === k ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : eat ? "Ăn" : "Không"}
                </button>
              );
            })
          ) : (
            <span className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">{s.willEat === null ? "Đã chốt" : s.willEat ? "Ăn ✓" : "Không ăn"}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Một dòng việc
// ---------------------------------------------------------------------
interface RowProps {
  item: MyTodayItem;
  actions: React.ReactNode;
  highlight?: boolean;
}

function TodayRow({ item, actions, highlight }: RowProps) {
  const style = KIND_STYLE[item.kind];
  const Icon = style.icon;
  return (
    <li
      id={`viec-${item.key.replace(/[^a-z0-9-]/gi, "-")}`}
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-2xl border px-3 py-2.5 transition",
        item.urgent ? "border-rose-200 bg-rose-50/50" : item.state === "info" ? "border-gray-100 bg-surface-container-low/40" : "border-gray-100 bg-white",
        highlight && "ring-2 ring-primary/40"
      )}
    >
      <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", style.tile)}>
        <Icon className="w-[18px] h-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 self-center">
        <Link href={item.href} className="block text-[13px] font-semibold text-gray-900 leading-snug hover:text-primary focus:outline-none focus-visible:underline">
          {item.title}
        </Link>
        {item.hint && (
          <p className={cn("flex items-start gap-1 text-[11px] mt-0.5 leading-snug", item.urgent ? "text-rose-600 font-semibold" : "text-gray-500")}>
            {item.urgent && <TriangleAlert className="w-3 h-3 mt-[1px] shrink-0" aria-hidden />}
            <span className="min-w-0">{item.hint}</span>
          </p>
        )}
      </div>
      {actions && <div className="col-start-2 sm:col-start-3 sm:row-start-1 sm:self-center flex flex-wrap items-center gap-1.5 sm:justify-end">{actions}</div>}
    </li>
  );
}

// ---------------------------------------------------------------------
// Thẻ chính
// ---------------------------------------------------------------------
export function MyTodayCard() {
  const { showToast } = useApp();
  const { session } = useSession();
  const { today, error, isLoading, isValidating, mutate } = useMyToday();
  const [payFor, setPayFor] = useState<MyTodayDues | null>(null);
  const [checkInFor, setCheckInFor] = useState<MyTodayEventCheckin | null>(null);
  const [massDay, setMassDay] = useState<CalendarDayDetailDto | null>(null);
  const [extendFor, setExtendFor] = useState<MyTodayLeave | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<string | null>(null);

  const me = session?.member ?? null;
  const items = useMemo(() => today?.items ?? [], [today]);
  const active = items.filter((i) => i.state !== "done");
  const done = items.filter((i) => i.state === "done");
  const urgent = items.filter((i) => i.state === "todo" && i.urgent).length;

  const openMass = useCallback(
    async (m: MyTodayMass) => {
      setBusy(m.key);
      try {
        const day = await api.get<CalendarDayDetailDto>(`/api/v1/liturgy/calendar/${m.date}`);
        if (!day.requirement) {
          showToast("info", "Ngày này không còn yêu cầu check-in đi lễ.");
          refreshMyToday(0);
          return;
        }
        if (!day.canCheckin && day.myCheckin?.status !== "rejected") {
          showToast("info", day.checkinBlockedReason ?? "Bạn đã check-in ngày lễ này rồi.");
          refreshMyToday(0);
          return;
        }
        setMassDay(day);
      } catch (e) {
        showToast("error", errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [showToast]
  );

  // Lối tắt (manifest / bảng lệnh): /?viec=check-in-le mở hộp thoại check-in đi lễ, /?viec=bao-com tô sáng dòng báo cơm.
  // Đang ở Tổng quan thì bảng lệnh phát sự kiện `luuxa:viec` (đổi tham số trên cùng trang không làm thẻ tải lại).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const want = q.get("viec");
    if (want) {
      setShortcut(want);
      q.delete("viec");
      try {
        window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}${window.location.hash}`);
      } catch {
        /* bỏ qua */
      }
    }
    const onEvent = (e: Event) => setShortcut(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(MY_TODAY_SHORTCUT_EVENT, onEvent);
    return () => window.removeEventListener(MY_TODAY_SHORTCUT_EVENT, onEvent);
  }, []);
  useEffect(() => {
    if (!today || !shortcut) return;
    const want = shortcut;
    setShortcut(null);
    if (want === "check-in-le") {
      const m = today.items.find((i): i is MyTodayMass => i.kind === "mass" && (i.state === "todo" || i.state === "info"));
      if (m) void openMass(m);
      else showToast("info", "Hôm nay bạn không có lễ nào cần check-in.");
    } else if (want === "bao-com") {
      const meal = today.items.find((i) => i.kind === "meal");
      if (meal) {
        setHighlight(meal.key);
        setTimeout(() => document.getElementById(`viec-${meal.key.replace(/[^a-z0-9-]/gi, "-")}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      } else window.location.assign("/bep-com");
    }
  }, [today, shortcut, openMass, showToast]);

  const setMeal = async (item: MyTodayMeal, meal: "lunch" | "dinner", willEat: boolean) => {
    const k = `${meal}:${willEat}`;
    setBusy(k);
    try {
      await api.put("/api/v1/meals/registrations", { date: item.date, meal, willEat });
      showToast("success", `Đã báo ${willEat ? "ăn" : "không ăn"} bữa ${MEAL_LABEL[meal].toLowerCase()} hôm nay.`);
      await mutate();
      void globalMutate((key) => typeof key === "string" && key.startsWith("/api/v1/meals"));
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmLiturgy = async (id: string) => {
    setBusy(`liturgy:${id}`);
    try {
      await api.patch(`/api/v1/liturgy/assignments/${id}`, { status: "confirmed" });
      showToast("success", "Đã nhận lời phục vụ. Cảm ơn bạn!");
      await mutate();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const actionsFor = (item: MyTodayItem): React.ReactNode => {
    switch (item.kind) {
      case "event_checkin":
        if (item.state === "todo" && item.open)
          return (
            <button type="button" onClick={() => setCheckInFor(item)} className={cn(btnPrimary, "bg-emerald-600 hover:bg-emerald-700")}>
              <Camera className="w-3.5 h-3.5" /> Chụp ảnh điểm danh
            </button>
          );
        return null;
      case "mass":
        if (item.state === "done") return null;
        return (
          <button type="button" onClick={() => openMass(item)} disabled={busy === item.key} className={cn(btnPrimary, "bg-amber-600 hover:bg-amber-700")}>
            {busy === item.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Church className="w-3.5 h-3.5" />}
            {item.status === "rejected" ? "Gửi lại" : item.date > (today?.today ?? "") ? "Check-in lễ vọng" : "Check-in"}
          </button>
        );
      case "meal":
        return item.meals.some((s) => s.open) ? <MealToggles item={item} busy={busy} onSet={(meal, eat) => setMeal(item, meal, eat)} /> : null;
      case "dues":
        if (item.claimPending) return null;
        return (
          <>
            <button type="button" onClick={() => setPayFor(item)} className={cn(btnPrimary, "bg-primary hover:bg-primary-container")}>
              <QrCode className="w-3.5 h-3.5" /> Mã QR
            </button>
            <Link href={item.href} className={btnGhost}>
              Chi tiết
            </Link>
          </>
        );
      case "leave":
        if (item.canExtend && item.state === "todo")
          return (
            <button type="button" onClick={() => setExtendFor(item)} className={cn(btnPrimary, "bg-blue-600 hover:bg-blue-700")}>
              <CalendarClock className="w-3.5 h-3.5" /> Xin thêm giờ
            </button>
          );
        return null;
      case "liturgy":
        if (item.status !== "assigned") return null;
        return (
          <button type="button" onClick={() => confirmLiturgy(item.assignmentId)} disabled={busy === `liturgy:${item.assignmentId}`} className={cn(btnPrimary, "bg-indigo-600 hover:bg-indigo-700")}>
            {busy === `liturgy:${item.assignmentId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Nhận lời
          </button>
        );
      case "house_rules":
        return (
          <Link href={item.href} className={cn(btnPrimary, "bg-primary hover:bg-primary-container")}>
            <ScrollText className="w-3.5 h-3.5" /> Đọc &amp; xác nhận
          </Link>
        );
      case "duty_week":
        return item.state === "todo" ? (
          <Link href={item.href} className={btnGhost}>
            Xem lịch trực
          </Link>
        ) : null;
      default:
        return null;
    }
  };

  if (!session?.member) return null;

  const summary = !today
    ? "Đang xem hôm nay bạn có việc gì…"
    : today.todo === 0
      ? active.length
        ? "Không có việc cần làm ngay — vài điều nên biết"
        : "Mọi việc đã xong"
      : `${today.todo} việc cần làm${urgent ? ` · ${urgent} việc gấp` : ""}`;

  return (
    <section aria-labelledby="my-today-title" className="bg-white rounded-3xl border border-purple-50 shadow-xs p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
          <Sun className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="my-today-title" className="text-base font-bold text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
            Việc của tôi hôm nay
            {!!today?.todo && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-extrabold tabular-nums">{today.todo}</span>}
            {urgent > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                <TriangleAlert className="w-3 h-3" aria-hidden /> {urgent} gấp
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {today ? `${dayLabel(today.today)} · ` : ""}
            {summary}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void mutate()}
          disabled={isValidating}
          aria-label="Làm mới việc hôm nay"
          title="Làm mới"
          className="p-2 -mr-1 -mt-1 rounded-xl text-gray-400 hover:text-primary hover:bg-purple-50 transition disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={cn("w-4 h-4", isValidating && "animate-spin")} />
        </button>
      </header>

      {isLoading || (!today && !error) ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true" aria-label="Đang tải việc hôm nay">
          {[0, 1, 2].map((k) => (
            <li key={k} className={cn("flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5", k > 1 && "hidden sm:flex")}>
              <Skeleton className="w-9 h-9 rounded-xl" />
              <span className="flex-1 space-y-1.5">
                <Skeleton className="w-48 max-w-full h-3.5" />
                <Skeleton className="w-32 h-3" />
              </span>
              <Skeleton className="w-20 h-8 rounded-xl hidden sm:block" />
            </li>
          ))}
        </ul>
      ) : !today ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
          <p className="text-xs font-semibold text-rose-800">Chưa tải được việc hôm nay ({errorMessage(error)}).</p>
          <button type="button" onClick={() => void mutate()} className={btnGhost}>
            Thử lại
          </button>
        </div>
      ) : (
        <>
          {active.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 px-4 py-3.5">
              <CircleCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-800">Hôm nay bạn không có việc nào cần làm 🎉</p>
                <p className="text-[11px] text-emerald-700/80 mt-0.5">Thẻ tự cập nhật khi có việc mới (điểm danh, đi lễ, khoản quỹ…).</p>
              </div>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {active.map((i) => (
                <TodayRow key={i.key} item={i} actions={actionsFor(i)} highlight={highlight === i.key} />
              ))}
            </ul>
          )}

          {today.dues.hidden > 0 && (
            <Link
              href="/thu-chi"
              className="mt-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] text-gray-600 hover:bg-surface-container-low hover:text-primary transition"
            >
              <span>
                Bạn còn {today.dues.count} khoản quỹ chưa đóng · tổng <b className="text-gray-800">{formatVND(today.dues.totalVnd)}</b>
                {today.dues.hidden > 0 ? ` (${today.dues.hidden} khoản chưa tới hạn)` : ""}
              </span>
              <span className="font-bold text-primary shrink-0">Thu chi →</span>
            </Link>
          )}

          {done.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="w-full flex items-center justify-between gap-2 text-left text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span className="truncate">Đã xong hôm nay: {done.map(doneLabel).join(" · ")}</span>
                </span>
                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition", showDone && "rotate-180")} aria-hidden />
              </button>
              {showDone && (
                <ul className="mt-2 flex flex-col gap-2">
                  {done.map((i) => (
                    <TodayRow key={i.key} item={i} actions={actionsFor(i)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* Hộp thoại một chạm */}
      {payFor && me && (
        <PayQrDialog
          open={!!payFor}
          onClose={() => setPayFor(null)}
          amountVnd={payFor.remainingVnd}
          content={duesTransferContent(payFor.planCode, me.fullName, me.displayName)}
          subtitle={`${payFor.planName} · ${formatVND(payFor.remainingVnd)}`}
          planId={payFor.planId}
        />
      )}
      {checkInFor && (
        <CheckInModal
          event={eventDtoFor(checkInFor.event)}
          onClose={() => {
            setCheckInFor(null);
            refreshMyToday(0);
          }}
        />
      )}
      {massDay && (
        <MassCheckinModal
          day={massDay}
          onClose={() => {
            setMassDay(null);
            refreshMyToday(0);
          }}
        />
      )}
      {extendFor && me && (
        <ExtendDialog
          item={leaveDtoFor(extendFor, { id: me.id, name: me.displayName })}
          onClose={() => {
            setExtendFor(null);
            refreshMyToday(0);
          }}
        />
      )}
    </section>
  );
}

export default MyTodayCard;
