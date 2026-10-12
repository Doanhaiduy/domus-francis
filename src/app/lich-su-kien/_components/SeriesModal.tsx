"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  CalendarX2,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CustomDatePicker, CustomInput, CustomToggle } from "@/components/ui/FormControls";
import { isoToDmy, toIsoDate, vnTodayIso, weekdayDm, daysBetween } from "@/lib/events-format";
import { refreshEvents, seriesApi, useEventSeries } from "@/lib/data/events";
import type { EventSeriesDto } from "@/lib/types/events";
import { catStyle } from "./styles";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Cuộn tới / mở sẵn chuỗi này */
  focusId?: string | null;
  /** Sửa chuỗi (mở form sửa) — fromDate gợi ý */
  onEdit: (s: EventSeriesDto, fromDate: string | null) => void;
  /** Tạo chuỗi mới (mở form tạo với "Lặp lại hằng tuần" bật sẵn) */
  onCreate: () => void;
  /** Mở lịch tới ngày */
  onPickDate: (iso: string) => void;
}

type Dialog =
  | { kind: "skip"; series: EventSeriesDto; date: string }
  | { kind: "stop"; series: EventSeriesDto }
  | { kind: "resume"; series: EventSeriesDto }
  | null;

/** Danh sách sự kiện định kỳ: xem lịch lặp, bỏ một ngày (nghỉ), khôi phục, sửa các buổi sau, dừng / tiếp tục chuỗi. */
export default function SeriesModal({ open, onClose, focusId, onEdit, onCreate, onPickDate }: Props) {
  const { showToast } = useApp();
  const { list, isLoading, mutate } = useEventSeries(open);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showStopped, setShowStopped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const items = list?.items ?? [];
  const canManage = !!list?.canManage;
  const running = items.filter((s) => s.isActive && !s.finished);
  const stopped = items.filter((s) => !s.isActive || s.finished);

  useEffect(() => {
    if (!open || !focusId || !list) return;
    if (stopped.some((s) => s.id === focusId)) setShowStopped(true);
    const t = setTimeout(() => document.getElementById(`series-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusId, !!list]);

  const restore = async (s: EventSeriesDto, date: string) => {
    setBusy(true);
    try {
      await seriesApi.restore(s.id, date);
      await Promise.all([mutate(), refreshEvents()]);
      showToast("success", `Đã khôi phục buổi ${weekdayDm(date)} của "${s.title}".`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
        >
          <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Repeat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-gray-900">Sự kiện định kỳ</h3>
                <p className="text-[11px] text-gray-500 leading-snug">
                  Sinh hoạt lặp lại hằng tuần — hệ thống tự lên lịch các buổi trước {list?.horizonDays ?? 14} ngày, nhắc cả nhà như sự kiện thường.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg text-gray-400 hover:text-gray-600 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
            {canManage && (
              <button
                type="button"
                onClick={onCreate}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-50 transition"
              >
                <Plus className="w-4 h-4" />
                Tạo sự kiện định kỳ mới
              </button>
            )}

            {isLoading && <p className="text-xs text-gray-400 text-center py-6">Đang tải…</p>}
            {!isLoading && !items.length && (
              <div className="py-8 text-center bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                <Repeat className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-600">Chưa có sự kiện định kỳ nào</p>
                <p className="text-[11px] text-gray-400 mt-0.5 px-6">
                  Ví dụ: Giờ Kinh Tối 21:00 mỗi ngày, Họp nhà tối Thứ Tư hằng tuần, Tổng vệ sinh sáng Chúa Nhật 2 tuần một lần.
                </p>
              </div>
            )}

            {running.map((s) => (
              <SeriesCard
                key={s.id}
                s={s}
                focus={s.id === focusId}
                canManage={canManage}
                busy={busy}
                onEdit={() => onEdit(s, null)}
                onSkip={(date) => setDialog({ kind: "skip", series: s, date })}
                onStop={() => setDialog({ kind: "stop", series: s })}
                onResume={() => setDialog({ kind: "resume", series: s })}
                onRestore={(d) => restore(s, d)}
                onPickDate={onPickDate}
              />
            ))}

            {stopped.length > 0 && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowStopped((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-[11px] font-bold text-gray-600 transition"
                  aria-expanded={showStopped}
                >
                  <span>Đã dừng / đã kết thúc ({stopped.length})</span>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", showStopped && "rotate-180")} />
                </button>
                {showStopped &&
                  stopped.map((s) => (
                    <SeriesCard
                      key={s.id}
                      s={s}
                      focus={s.id === focusId}
                      canManage={canManage}
                      busy={busy}
                      onEdit={() => onEdit(s, null)}
                      onSkip={(date) => setDialog({ kind: "skip", series: s, date })}
                      onStop={() => setDialog({ kind: "stop", series: s })}
                      onResume={() => setDialog({ kind: "resume", series: s })}
                      onRestore={(d) => restore(s, d)}
                      onPickDate={onPickDate}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {dialog && (
        <SeriesActionDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={async (msg) => {
            setDialog(null);
            await Promise.all([mutate(), refreshEvents()]);
            showToast("success", msg);
          }}
        />
      )}
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------
// Thẻ một chuỗi
// ---------------------------------------------------------------------
function SeriesCard({
  s,
  focus,
  canManage,
  busy,
  onEdit,
  onSkip,
  onStop,
  onResume,
  onRestore,
  onPickDate,
}: {
  s: EventSeriesDto;
  focus: boolean;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onSkip: (date: string) => void;
  onStop: () => void;
  onResume: () => void;
  onRestore: (date: string) => void;
  onPickDate: (iso: string) => void;
}) {
  const style = catStyle(s.categoryCode);
  const running = s.isActive && !s.finished;
  const today = vnTodayIso();
  const futureSkips = s.skips.filter((k) => k.date >= today);
  const cancelledDates = new Set(s.upcoming.filter((u) => u.status === "cancelled").map((u) => u.date));
  const customized = new Set(s.upcoming.filter((u) => u.customized).map((u) => u.date));
  const status = !s.isActive
    ? { label: "Đã dừng", cls: "bg-gray-100 text-gray-600" }
    : s.finished
    ? { label: "Đã kết thúc", cls: "bg-gray-100 text-gray-600" }
    : { label: "Đang lặp", cls: "bg-emerald-100 text-emerald-700" };

  return (
    <div
      id={`series-${s.id}`}
      className={cn(
        "rounded-2xl border p-4 space-y-3 transition",
        running ? "bg-white border-indigo-100" : "bg-gray-50/70 border-gray-100",
        focus && "ring-2 ring-indigo-300"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", style.bg, style.text)}>{s.category}</span>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", status.cls)}>{status.label}</span>
            {s.hasCheckIn && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-primary">Có điểm danh</span>}
          </div>
          <h4 className={cn("text-sm font-black mt-1", running ? "text-gray-900" : "text-gray-500")}>{s.title}</h4>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {running ? (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100 transition"
                >
                  <Pencil className="w-3.5 h-3.5" /> Sửa các buổi sau
                </button>
                <button
                  type="button"
                  onClick={() => onSkip(s.nextDates[0] ?? today)}
                  disabled={!s.nextDates.length}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-bold hover:bg-amber-100 transition disabled:opacity-50"
                >
                  <CalendarX2 className="w-3.5 h-3.5" /> Bỏ một ngày
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-[11px] font-bold hover:bg-rose-100 transition"
                >
                  <CirclePause className="w-3.5 h-3.5" /> Dừng
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onResume}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition"
              >
                <CirclePlay className="w-3.5 h-3.5" /> Tiếp tục chuỗi
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600">
        <span className="flex items-center gap-1.5">
          <Repeat className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <b className="text-gray-800">{s.patternLabel}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {s.timeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          Từ {isoToDmy(s.startsOn)}
          {s.untilDate ? ` đến ${isoToDmy(s.untilDate)}` : " · không kết thúc"}
        </span>
        {s.location && (
          <span className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{s.location}</span>
          </span>
        )}
        {(s.organizers.length > 0 || s.organizerText) && (
          <span className="flex items-center gap-1.5 sm:col-span-2 min-w-0">
            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">Phụ trách: {s.organizers.length ? s.organizers.map((o) => o.name).join(", ") : s.organizerText}</span>
          </span>
        )}
      </div>

      {running && s.nextDates.length > 0 && (
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Các buổi sắp tới</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {s.nextDates.slice(0, 10).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onPickDate(d)}
                title={cancelledDates.has(d) ? "Buổi này đã bị hủy riêng" : customized.has(d) ? "Buổi này đã được sửa riêng" : "Mở ngày này trên lịch"}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-[10px] font-bold tabular-nums transition",
                  cancelledDates.has(d)
                    ? "bg-rose-50 text-rose-600 line-through"
                    : daysBetween(today, d) <= 14
                    ? "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                    : "bg-gray-50 text-gray-500 border border-dashed border-gray-200 hover:bg-gray-100"
                )}
              >
                {weekdayDm(d)}
                {customized.has(d) ? " *" : ""}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Ô nét đứt: chưa lên lịch (hệ thống tự tạo khi còn ≤ 14 ngày). * = buổi đã sửa riêng.</p>
        </div>
      )}

      {futureSkips.length > 0 && (
        <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-2.5 space-y-1.5">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Ngày nghỉ ({futureSkips.length})</span>
          {futureSkips.map((k) => (
            <div key={k.date} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 text-amber-900">
                <b className="tabular-nums">{weekdayDm(k.date)}</b>
                {k.reason ? <span className="text-amber-800/80"> — {k.reason}</span> : null}
              </span>
              {canManage && running && k.restorable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(k.date)}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white text-amber-800 border border-amber-200 text-[10px] font-bold hover:bg-amber-100 transition disabled:opacity-50"
                >
                  <Undo2 className="w-3 h-3" /> Khôi phục
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400">
        Đã diễn ra {s.pastCount} buổi · {s.upcomingCount} buổi sắp tới đã lên lịch
        {s.createdByName ? ` · Tạo bởi ${s.createdByName}` : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hộp thoại thao tác: bỏ một ngày / dừng chuỗi / tiếp tục chuỗi
// ---------------------------------------------------------------------
function SeriesActionDialog({ dialog, onClose, onDone }: { dialog: NonNullable<Dialog>; onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const { showToast } = useApp();
  const s = dialog.series;
  const today = vnTodayIso();
  const [date, setDate] = useState(dialog.kind === "skip" ? isoToDmy(dialog.date) : isoToDmy(today));
  const [reason, setReason] = useState("");
  // Buổi bị bỏ trong 3 ngày tới ⇒ mặc định báo cả nhà
  const [notify, setNotify] = useState(dialog.kind === "skip" && daysBetween(today, dialog.date) <= 3);
  const [noEnd, setNoEnd] = useState(true);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const chips = useMemo(() => (dialog.kind === "skip" ? s.nextDates.slice(0, 12) : []), [dialog.kind, s.nextDates]);
  const iso = toIsoDate(date);

  const submit = async () => {
    setBusy(true);
    try {
      if (dialog.kind === "skip") {
        if (!iso) throw new Error("Chọn ngày cần bỏ.");
        await seriesApi.skip(s.id, { date: iso, reason: reason.trim() || null, notify });
        await onDone(`Đã bỏ buổi ${weekdayDm(iso)} của "${s.title}"${notify ? " và báo cả nhà" : ""}.`);
      } else if (dialog.kind === "stop") {
        if (!iso) throw new Error("Chọn ngày dừng.");
        const r = await seriesApi.stop(s.id, { fromDate: iso, reason: reason.trim() || null, notify });
        await onDone(`Đã dừng "${s.title}" từ ${isoToDmy(iso)}${r.removed ? ` — gỡ ${r.removed} buổi chưa diễn ra` : ""}.`);
      } else {
        const u = noEnd ? null : toIsoDate(until);
        if (!noEnd && !u) throw new Error("Chọn ngày kết thúc mới (hoặc bật Không kết thúc).");
        const r = await seriesApi.update(s.id, { isActive: true, ...(noEnd ? { noEnd: true } : { untilDate: u }) });
        await onDone(`Đã tiếp tục "${s.title}" — ${r.generated + r.restored} buổi được lên lịch lại.`);
      }
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const title = dialog.kind === "skip" ? "Bỏ một buổi (tạm nghỉ)" : dialog.kind === "stop" ? "Dừng sự kiện định kỳ" : "Tiếp tục sự kiện định kỳ";

  // Vẽ ra <body> (không lồng trong lớp phủ của danh sách); chặn sự kiện bấm lan lên lớp phủ cha (React vẫn chuyển sự kiện qua portal)
  return createPortal(
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
    >
      <div className="flex min-h-full items-center justify-center">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 p-4 sm:p-5 space-y-4 my-auto">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-gray-900">{title}</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {s.title} · {s.patternLabel} · {s.timeLabel}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {dialog.kind === "skip" && (
            <>
              <div>
                <span className="block text-xs font-bold text-gray-700 mb-1.5">Chọn buổi cần bỏ</span>
                <div className="flex flex-wrap gap-1">
                  {chips.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={iso === d}
                      onClick={() => setDate(isoToDmy(d))}
                      className={cn(
                        "px-2 py-1 rounded-lg text-[11px] font-bold tabular-nums transition border",
                        iso === d ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-200 hover:border-amber-300"
                      )}
                    >
                      {weekdayDm(d)}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <CustomDatePicker placeholder="Hoặc chọn ngày khác…" value={date} onChange={setDate} />
                </div>
              </div>
              <CustomInput label="Lý do (hiện cho cả nhà)" placeholder="VD: Nghỉ lễ, cả nhà đi hành hương" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              <CustomToggle label="Báo cả nhà" description="Gửi thông báo trong ứng dụng cho mọi thành viên" checked={notify} onChange={setNotify} />
              <p className="text-[11px] text-gray-500">Buổi đó được gỡ khỏi lịch (nếu đã lên lịch) và không được tạo lại. Khôi phục được khi ngày chưa qua.</p>
            </>
          )}

          {dialog.kind === "stop" && (
            <>
              <CustomDatePicker label="Dừng từ ngày" value={date} onChange={setDate} required />
              <CustomInput label="Lý do (tuỳ chọn)" placeholder="VD: Kết thúc học kỳ" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              <CustomToggle label="Báo cả nhà" description="Gửi thông báo trong ứng dụng cho mọi thành viên" checked={notify} onChange={setNotify} />
              <div className="p-3 rounded-2xl bg-rose-50/70 border border-rose-100 text-[11px] text-rose-800 leading-relaxed">
                Các buổi <b>chưa diễn ra</b> từ ngày này sẽ được gỡ khỏi lịch và không tạo buổi mới nữa. Buổi đã diễn ra cùng kết quả điểm danh được giữ nguyên.
                Có thể <b>tiếp tục chuỗi</b> sau.
              </div>
            </>
          )}

          {dialog.kind === "resume" && (
            <>
              <CustomToggle label="Không kết thúc" description="Lặp lại cho tới khi dừng" checked={noEnd} onChange={setNoEnd} />
              {!noEnd && <CustomDatePicker label="Đến ngày" value={until} onChange={setUntil} />}
              <p className="text-[11px] text-gray-500">Các buổi từ hôm nay (không gồm ngày đã bỏ) được lên lịch lại theo mẫu lặp {s.patternLabel.toLowerCase()}.</p>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
              Đóng
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={cn(
                "px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs active:scale-95 transition disabled:opacity-60",
                dialog.kind === "stop" ? "bg-rose-600 hover:bg-rose-700" : dialog.kind === "skip" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              {busy ? "Đang lưu..." : dialog.kind === "skip" ? "Bỏ buổi này" : dialog.kind === "stop" ? "Dừng chuỗi" : "Tiếp tục chuỗi"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
