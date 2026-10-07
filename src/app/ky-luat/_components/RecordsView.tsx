"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ClipboardList, Pencil, Plus, RotateCcw, Search, ShieldOff, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { vnToday } from "@/lib/vn-time";
import { disciplineApi, useDisciplineRecords } from "@/lib/data/discipline";
import { PENALTY_UNIT, PHASE_LABEL, penaltyText, type DisciplinePhase, type DisciplineRecordDto } from "@/lib/types/discipline";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";
import { RecordForm } from "./RecordForm";

const PHASE_STYLE: Record<DisciplinePhase, string> = {
  recorded: "bg-gray-100 text-gray-700",
  upcoming: "bg-sky-100 text-sky-800",
  serving: "bg-amber-100 text-amber-800",
  overdue: "bg-rose-100 text-rose-800",
  completed: "bg-emerald-100 text-emerald-800",
  waived: "bg-purple-100 text-purple-800",
};

const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

type Range = "all" | "month" | "quarter" | "year" | "last_year";
const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "all", label: "Mọi thời gian" },
  { value: "month", label: "Tháng này" },
  { value: "quarter", label: "Quý này" },
  { value: "year", label: "Năm nay" },
  { value: "last_year", label: "Năm trước" },
];
type PhaseFilter = DisciplinePhase | "active" | "";
const PHASE_OPTIONS: { value: PhaseFilter; label: string }[] = [
  { value: "", label: "Mọi trạng thái" },
  { value: "active", label: "Đang xử lý" },
  { value: "overdue", label: "Quá hạn chưa xong" },
  { value: "serving", label: "Đang chấp hành" },
  { value: "upcoming", label: "Sắp chấp hành" },
  { value: "recorded", label: "Chỉ ghi nhận" },
  { value: "completed", label: "Đã hoàn thành" },
  { value: "waived", label: "Được miễn" },
];

function rangeDates(r: Range): { from?: string; to?: string } {
  const today = vnToday();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const p2 = (n: number) => String(n).padStart(2, "0");
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (r === "month") return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${last(y, m)}` };
  if (r === "quarter") {
    const q1 = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: `${y}-${p2(q1)}-01`, to: `${y}-${p2(q1 + 2)}-${last(y, q1 + 2)}` };
  }
  if (r === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (r === "last_year") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return {};
}

/** Danh sách vi phạm: `mine` = chỉ của chính mình (mọi thành viên); không `mine` = cả nhà (discipline.read) + thao tác (discipline.manage). */
export function RecordsView({ mine }: { mine: boolean }) {
  const { members, showToast } = useApp();
  const [range, setRange] = useState<Range>(mine ? "all" : "year");
  const [phase, setPhase] = useState<PhaseFilter>("");
  const [memberId, setMemberId] = useState("");
  const [q, setQ] = useState("");
  const dates = useMemo(() => rangeDates(range), [range]);
  const { data, isLoading, error } = useDisciplineRecords({ mine, memberId: memberId || undefined, from: dates.from, to: dates.to, phase, q });
  const canManage = !mine && !!data?.canManage;

  const [form, setForm] = useState<{ record?: DisciplineRecordDto } | null>(null);
  const [toDelete, setToDelete] = useState<DisciplineRecordDto | null>(null);
  const [toWaive, setToWaive] = useState<DisciplineRecordDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const memberOptions = useMemo(() => [{ value: "", label: "Mọi thành viên" }, ...members.map((m) => ({ value: m.id, label: m.fullName, subLabel: m.room ?? undefined }))], [members]);
  const s = data?.summary;
  const records = data?.records ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><CustomSelect<Range> label="Thời gian" value={range} onChange={setRange} options={RANGE_OPTIONS} /></div>
        <div className="w-44"><CustomSelect<PhaseFilter> label="Trạng thái" value={phase} onChange={setPhase} options={PHASE_OPTIONS} /></div>
        {!mine && <div className="w-52"><CustomSelect label="Thành viên" value={memberId} onChange={setMemberId} options={memberOptions} /></div>}
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Tìm kiếm</span>
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm điều luật, ghi chú, tên…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-medium focus:outline-none focus:border-primary" />
        </label>
        {canManage && (
          <button type="button" onClick={() => setForm({})} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
            <Plus className="w-4 h-4" /> Ghi vi phạm
          </button>
        )}
      </div>

      {s && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip tone="bg-white border-gray-200 text-gray-800" label="Tổng" value={s.total} />
          <Chip tone="bg-amber-50 border-amber-200 text-amber-800" label="Đang xử lý" value={s.active} />
          {s.overdue > 0 && <Chip tone="bg-rose-50 border-rose-200 text-rose-800" label="Quá hạn" value={s.overdue} />}
          <Chip tone="bg-emerald-50 border-emerald-200 text-emerald-800" label="Đã xong" value={s.completed} />
          {s.waived > 0 && <Chip tone="bg-purple-50 border-purple-200 text-purple-800" label="Được miễn" value={s.waived} />}
          {s.byKind.map((k) => (
            <Chip key={k.kind} tone="bg-white border-purple-100 text-gray-700" label={k.kind === "other" ? "Phạt khác" : PENALTY_UNIT[k.kind]} value={k.kind === "other" ? k.count : k.qty} />
          ))}
        </div>
      )}

      {error && !data && <p className="text-sm text-rose-600">{errorMessage(error)}</p>}
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-24 rounded-2xl" />)}</div>
      ) : records.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{mine ? "Bạn chưa có ghi nhận vi phạm nào" : "Chưa có ghi nhận vi phạm nào ở mục này"}</p>
          {canManage && <p className="text-sm text-gray-500 mt-1">Bấm “Ghi vi phạm” để ghi nhận. Danh mục điều luật nhập ở tab “Luật & mức phạt”.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 items-start">
          {records.map((r) => (
            <li key={r.id} className={cn("bg-white border rounded-2xl p-4 sm:p-5 space-y-2.5", r.phase === "overdue" ? "border-rose-200" : "border-purple-100", busy === r.id && "opacity-60 pointer-events-none")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {!mine && <p className="font-extrabold text-gray-900">{r.memberName}{r.memberRoom ? <span className="ml-2 text-[11px] font-bold text-gray-400">P.{r.memberRoom}</span> : null}</p>}
                  <p className="text-sm font-bold text-gray-800">{r.ruleCode ? <span className="text-primary mr-1.5">{r.ruleCode}</span> : null}{r.ruleTitle}</p>
                </div>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0", PHASE_STYLE[r.phase])}>{PHASE_LABEL[r.phase]}</span>
              </div>
              <p className="text-xs text-gray-500">Vi phạm ngày <b className="text-gray-700">{dmy(r.occurredOn)}</b>{r.recordedByName && !mine ? ` · ghi bởi ${r.recordedByName}` : ""}</p>
              {r.note && <p className="text-sm text-gray-700">{r.note}</p>}
              <div className="rounded-xl bg-surface-container-low/70 px-3 py-2 text-xs text-gray-700 space-y-1">
                <p><span className="font-bold">Hình phạt:</span> {penaltyText(r.penaltyKind, r.penaltyQty, r.penaltyDetail)}</p>
                {(r.penaltyStartsOn || r.penaltyEndsOn) && (
                  <p className="inline-flex items-center gap-1.5 text-gray-600"><CalendarClock className="w-3.5 h-3.5" />{r.penaltyStartsOn ? dmy(r.penaltyStartsOn) : "…"} → {r.penaltyEndsOn ? dmy(r.penaltyEndsOn) : "…"}</p>
                )}
                {r.phase === "overdue" && <p className="inline-flex items-center gap-1.5 text-rose-700 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />Đã quá hạn nhưng chưa xác nhận hoàn thành.</p>}
                {r.status === "waived" && r.waiveReason && <p className="text-purple-700">Lý do miễn: {r.waiveReason}</p>}
                {r.completedAt && <p className="text-emerald-700">Hoàn thành ngày {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(r.completedAt))}</p>}
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === "open" && r.penaltyKind !== "none" && (
                    <button type="button" onClick={() => run(r.id, () => disciplineApi.act(r.id, "complete"), "Đã xác nhận hoàn thành.")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition active:scale-95"><Check className="w-3.5 h-3.5" /> Hoàn thành</button>
                  )}
                  {r.status === "open" && (
                    <button type="button" onClick={() => setToWaive(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 text-purple-700 text-xs font-bold hover:bg-purple-50 transition"><ShieldOff className="w-3.5 h-3.5" /> Miễn</button>
                  )}
                  {r.status !== "open" && (
                    <button type="button" onClick={() => run(r.id, () => disciplineApi.act(r.id, "reopen"), "Đã mở lại.")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition"><RotateCcw className="w-3.5 h-3.5" /> Mở lại</button>
                  )}
                  <button type="button" onClick={() => setForm({ record: r })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition"><Pencil className="w-3.5 h-3.5" /> Sửa</button>
                  <button type="button" onClick={() => setToDelete(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition"><Trash2 className="w-3.5 h-3.5" /> Xóa</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {form && <RecordForm record={form.record} defaultMemberId={memberId || undefined} onClose={() => setForm(null)} />}
      <WaiveDialog item={toWaive} onClose={() => setToWaive(null)} onConfirm={(reason) => { const r = toWaive; setToWaive(null); if (r) run(r.id, () => disciplineApi.act(r.id, "waive", reason), "Đã miễn hình phạt."); }} />
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { const r = toDelete; setToDelete(null); if (r) run(r.id, () => disciplineApi.deleteRecord(r.id), "Đã xóa ghi nhận."); }}
        title="Xóa ghi nhận vi phạm?"
        message={<>Ghi nhận “<b>{toDelete?.ruleTitle}</b>” của <b>{toDelete?.memberName}</b> sẽ bị xóa và không còn tính vào tổng kết. Nếu chỉ muốn bỏ hình phạt, hãy dùng nút <b>Miễn</b> để còn lịch sử.</>}
        confirmText="Xóa"
        cancelText="Giữ lại"
        variant="danger"
      />
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-semibold", tone)}>{label}<b className="font-extrabold">{value}</b></span>;
}

function WaiveDialog({ item, onClose, onConfirm }: { item: DisciplineRecordDto | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  if (!item) return null;
  const ok = reason.trim().length >= 5;
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-4 flex items-center justify-center animate-fadeIn">
        <div role="dialog" aria-modal="true" aria-label="Miễn hình phạt" onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl border border-gray-100 space-y-3 animate-scaleIn">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-extrabold text-gray-900">Miễn hình phạt cho {item.memberName}</h3>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <CustomTextarea label="Lý do miễn (lưu vào lịch sử)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="VD: Đã xin lỗi trước nhà và hứa sửa." />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="button" disabled={!ok} onClick={() => { onConfirm(reason.trim()); setReason(""); }} className="px-5 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition active:scale-95 disabled:opacity-50">Miễn hình phạt</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
