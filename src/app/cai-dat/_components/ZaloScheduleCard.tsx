"use client";

// Lịch & lịch sử tin gửi nhóm Zalo: lưới tháng (mỗi ngày hiện số tin đã gửi / lỗi / bỏ qua / dự kiến), bấm một ngày để xem từng tin.
import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, RefreshCw, SkipForward, XCircle } from "lucide-react";
import { swrFetcher } from "@/lib/api";
import type { ZaloDayDto, ZaloLogEntryDto, ZaloMonthDto, ZaloPlannedDto } from "@/lib/types/zalo-log";
import { cn } from "@/lib/utils";

const MONTHS = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const pad = (n: number) => String(n).padStart(2, "0");
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const longDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

const STATUS: Record<ZaloLogEntryDto["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  sent: { label: "Đã gửi", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: "Gửi lỗi", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: <XCircle className="w-3 h-3" /> },
  skipped: { label: "Bỏ qua", cls: "bg-gray-100 text-gray-600 border-gray-200", icon: <SkipForward className="w-3 h-3" /> },
};

function Chip({ n, cls, title }: { n: number; cls: string; title: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center justify-center min-w-[1.25rem] h-[1.125rem] px-1 rounded-full text-[10px] font-black leading-none tabular-nums", cls)}>
      {n}
    </span>
  );
}

function LogItem({ e }: { e: ZaloLogEntryDto }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[e.status];
  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50">
        <span className="text-xs font-bold text-gray-800 tabular-nums w-11 shrink-0">{timeOf(e.at)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-900">{e.eventLabel}</span>
            <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold", e.mode === "auto" ? "bg-sky-50 text-sky-700" : "bg-purple-50 text-primary")}>
              {e.mode === "auto" ? "Tự động" : `Thủ công${e.by ? ` · ${e.by}` : ""}`}
            </span>
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold", st.cls)}>
              {st.icon} {st.label}
            </span>
          </span>
          {e.error && <span className="block text-[10.5px] text-amber-700 mt-0.5 truncate">{e.error}</span>}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <pre className="px-3.5 pb-3 pt-0.5 text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-gray-700">{e.body}</pre>}
    </div>
  );
}

function PlannedItem({ p }: { p: ZaloPlannedDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/30 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-purple-50/60">
        <span className="text-xs font-bold text-primary w-11 shrink-0 inline-flex items-center gap-1">
          <Clock3 className="w-3 h-3" />~{p.slot === "morning" ? "7h" : "19h"}
        </span>
        <span className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-900">{p.eventLabel}</span>
          <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-primary text-[10px] font-bold">Dự kiến</span>
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <pre className="px-3.5 pb-3 pt-0.5 text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-gray-700">{p.text}</pre>}
    </div>
  );
}

export default function ZaloScheduleCard() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const month = `${ym.y}-${pad(ym.m + 1)}`;
  const { data: mdata, isLoading: mLoading, mutate: mMutate } = useSWR<ZaloMonthDto>(`/api/v1/integrations/zalo/schedule?month=${month}`, swrFetcher, { revalidateOnFocus: false });
  const todayIso = mdata?.today ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? todayIso;
  const { data: ddata, isLoading: dLoading, mutate: dMutate } = useSWR<ZaloDayDto>(`/api/v1/integrations/zalo/schedule?date=${selected}`, swrFetcher, { revalidateOnFocus: false });

  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const total = new Date(ym.y, ym.m + 1, 0).getDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: total }, (_, i) => i + 1)];
  }, [ym]);

  const go = (delta: number) => setYm((c) => {
    const d = new Date(c.y, c.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const refresh = () => {
    void mMutate();
    void dMutate();
  };

  return (
    <div className="p-4 rounded-2xl bg-surface-container-low/60 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-primary" /> Lịch &amp; lịch sử tin gửi nhóm Zalo</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Bấm một ngày để xem từng tin đã gửi (tự động hay do ai bấm, thành công hay lỗi) và tin dự kiến của các ngày sắp tới. Giữ 180 ngày.</p>
        </div>
        <button onClick={refresh} className="self-start shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-700">
          <RefreshCw className={cn("w-3.5 h-3.5", (mLoading || dLoading) && "animate-spin")} /> Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 items-start">
        <div className="bg-white rounded-2xl border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => go(-1)} aria-label="Tháng trước" className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-gray-900">{MONTHS[ym.m]}, {ym.y}</span>
              <button
                onClick={() => {
                  setYm({ y: now.getFullYear(), m: now.getMonth() });
                  setPicked(null);
                }}
                className="px-2 py-0.5 rounded-full bg-purple-50 text-primary text-[10px] font-bold hover:bg-purple-100"
              >
                Hôm nay
              </button>
            </div>
            <button onClick={() => go(1)} aria-label="Tháng sau" className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[10px] font-bold text-gray-400 py-1">{w}</span>
            ))}
          </div>
          <div className={cn("grid grid-cols-7 gap-1", mLoading && !mdata && "opacity-50")}>
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const iso = `${month}-${pad(d)}`;
              const c = mdata?.days[iso];
              const isToday = iso === todayIso;
              const isSel = iso === selected;
              return (
                <button
                  key={iso}
                  onClick={() => setPicked(iso)}
                  className={cn(
                    "aspect-square min-h-[3.25rem] rounded-xl border flex flex-col items-center justify-start gap-1 pt-1.5 transition",
                    isSel ? "border-primary bg-purple-50" : "border-transparent hover:bg-gray-50",
                    isToday && !isSel && "border-purple-200",
                  )}
                >
                  <span className={cn("text-xs font-bold leading-none", isToday ? "text-primary" : "text-gray-700")}>{d}</span>
                  <span className="flex flex-wrap justify-center gap-0.5 px-0.5">
                    {c?.sent ? <Chip n={c.sent} cls="bg-emerald-100 text-emerald-700" title="Đã gửi" /> : null}
                    {c?.failed ? <Chip n={c.failed} cls="bg-rose-100 text-rose-700" title="Gửi lỗi" /> : null}
                    {c?.skipped ? <Chip n={c.skipped} cls="bg-gray-200 text-gray-600" title="Bỏ qua" /> : null}
                    {c?.planned ? <Chip n={c.planned} cls="border border-purple-300 text-primary bg-white" title="Dự kiến" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-gray-50 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1"><Chip n={1} cls="bg-emerald-100 text-emerald-700" title="" /> đã gửi</span>
            <span className="inline-flex items-center gap-1"><Chip n={1} cls="bg-rose-100 text-rose-700" title="" /> gửi lỗi</span>
            <span className="inline-flex items-center gap-1"><Chip n={1} cls="bg-gray-200 text-gray-600" title="" /> bỏ qua</span>
            <span className="inline-flex items-center gap-1"><Chip n={1} cls="border border-purple-300 text-primary bg-white" title="" /> dự kiến</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <p className="text-xs font-black text-gray-900 capitalize">{longDay(selected)}</p>
          {dLoading && !ddata && <div className="h-16 rounded-xl bg-gray-100 animate-pulse" />}
          {ddata && ddata.log.length === 0 && ddata.planned.length === 0 && (
            <div className="py-8 text-center text-xs text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
              {selected > ddata.today ? (ddata.enabled ? "Chưa có tin tự động nào dự kiến cho ngày này." : "Gửi tin nhóm Zalo đang tắt nên không có tin dự kiến.") : "Ngày này không có tin nào được gửi."}
            </div>
          )}
          {ddata?.log.map((e) => <LogItem key={e.id} e={e} />)}
          {ddata?.planned.map((p, i) => <PlannedItem key={`${p.event}${i}`} p={p} />)}
          {ddata && ddata.notProjected.length > 0 && (
            <div className="text-[10.5px] text-gray-500 leading-relaxed mt-1">
              <p className="font-semibold text-gray-600">Không dự báo trước được:</p>
              <ul className="list-disc pl-4">
                {ddata.notProjected.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {ddata && selected === ddata.today && <p className="text-[10.5px] text-gray-400">Hôm nay: dùng “Xem trước buổi sáng/tối” ở khung bên dưới để biết tin còn lại sẽ gửi.</p>}
        </div>
      </div>
    </div>
  );
}
