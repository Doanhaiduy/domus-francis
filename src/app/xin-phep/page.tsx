"use client";

import React, { useMemo, useState } from "react";
import { CalendarOff, Check, Clock, MapPin, Phone, Plus, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { leaveApi, useLeave } from "@/lib/data/leave";
import { LEAVE_KIND_LABEL, LEAVE_STATUS_LABEL, type LeaveRequestDto, type LeaveStatus } from "@/lib/types/leave";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomTextarea } from "@/components/ui/FormControls";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";
import { LeaveForm } from "./_components/LeaveForm";

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-gray-200 text-gray-600",
};

const VN = "Asia/Ho_Chi_Minh";
const fmt = (iso: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: VN }).format(new Date(iso));
const dayOf = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: VN }).format(new Date(iso));
const when = (r: LeaveRequestDto) => (dayOf(r.startsAt) === dayOf(r.endsAt) ? `${fmt(r.startsAt)} → ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: VN }).format(new Date(r.endsAt))}` : `${fmt(r.startsAt)} → ${fmt(r.endsAt)}`);

type Tab = "mine" | "review";

export default function LeavePage() {
  const { showToast } = useApp();
  const { isLoading: sessionLoading } = useSession();
  const { data, isLoading } = useLeave();
  const [tab, setTab] = useState<Tab | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toCancel, setToCancel] = useState<LeaveRequestDto | null>(null);
  const [toReject, setToReject] = useState<LeaveRequestDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canReview = data?.canReview ?? false;
  const active: Tab = tab ?? (canReview && (data?.pendingCount ?? 0) > 0 ? "review" : "mine");
  const shown = active === "review" ? (data?.review ?? []) : (data?.mine ?? []);
  const pendingMine = useMemo(() => (data?.mine ?? []).filter((r) => r.status === "pending").length, [data]);

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

  return (
    <div className="flex flex-col w-full gap-5 max-w-6xl mx-auto pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5"><CalendarOff className="w-6 h-6 text-primary" /> Xin phép</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">Vắng sự kiện, về muộn, ngủ ngoài hay đi xa vài ngày — gửi đơn để Ban điều hành biết và duyệt. Đơn vắng sự kiện được duyệt sẽ ghi “có phép”, không bị trừ điểm.</p>
        </div>
        {data?.canRequest && (
          <button type="button" onClick={() => setFormOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
            <Plus className="w-4 h-4" /> Gửi đơn xin phép
          </button>
        )}
      </div>

      {canReview && (
        <div role="tablist" className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
          {([["review", "Chờ tôi duyệt"], ["mine", "Đơn của tôi"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={active === k} onClick={() => setTab(k)} className={cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", active === k ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}>
              {label}
              {k === "review" && (data?.pendingCount ?? 0) > 0 && <span className="bg-error-container text-on-error-container text-[10px] font-bold px-1.5 py-0.5 rounded-full">{data!.pendingCount}</span>}
              {k === "mine" && pendingMine > 0 && <span className="text-[10px] font-bold text-amber-700">{pendingMine} chờ</span>}
            </button>
          ))}
        </div>
      )}

      {(isLoading || sessionLoading) && !data ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-24 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <CalendarOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{active === "review" ? "Không có đơn nào cần xử lý" : "Bạn chưa gửi đơn nào"}</p>
          {active === "mine" && data?.canRequest && <p className="text-sm text-gray-500 mt-1">Cần vắng hay về muộn? Bấm “Gửi đơn xin phép” ở trên.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 items-start">
          {shown.map((r) => (
            <li key={r.id} className={cn("bg-white border rounded-2xl p-4 sm:p-5 space-y-2.5", r.status === "pending" ? "border-amber-200" : "border-purple-100", busy === r.id && "opacity-60 pointer-events-none")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {active === "review" && <span className="font-extrabold text-gray-900">{r.memberName}</span>}
                    <span className="text-sm font-bold text-gray-800">{LEAVE_KIND_LABEL[r.kind]}{r.eventTitle ? ` — ${r.eventTitle}` : ""}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", STATUS_STYLE[r.status])}>{LEAVE_STATUS_LABEL[r.status]}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{when(r)}</p>
                </div>
              </div>
              <p className="text-sm text-gray-700">{r.reason}</p>
              {(r.destination || r.contactPhone) && (
                <p className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                  {r.destination && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{r.destination}</span>}
                  {r.contactPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{r.contactPhone}</span>}
                </p>
              )}
              {(r.status === "approved" || r.status === "rejected") && (
                <p className="text-xs text-gray-500">{r.decidedByName ? `${r.decidedByName} ` : ""}{r.status === "approved" ? "đã duyệt" : "đã từ chối"}{r.decisionNote ? `: ${r.decisionNote}` : ""}</p>
              )}
              {r.status === "pending" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {active === "review" ? (
                    <>
                      <button type="button" onClick={() => run(r.id, () => leaveApi.act(r.id, "approve"), "Đã duyệt đơn.")} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition active:scale-95"><Check className="w-3.5 h-3.5" /> Duyệt</button>
                      <button type="button" onClick={() => setToReject(r)} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition active:scale-95"><X className="w-3.5 h-3.5" /> Từ chối</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setToCancel(r)} className="px-4 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition">Hủy đơn</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {formOpen && data && <LeaveForm events={data.events} onClose={() => setFormOpen(false)} />}
      <RejectDialog
        item={toReject}
        onClose={() => setToReject(null)}
        onConfirm={(note) => {
          const r = toReject;
          setToReject(null);
          if (r) run(r.id, () => leaveApi.act(r.id, "reject", note), "Đã từ chối đơn.");
        }}
      />
      <ConfirmDialog
        isOpen={!!toCancel}
        onClose={() => setToCancel(null)}
        onConfirm={() => {
          const r = toCancel;
          setToCancel(null);
          if (r) run(r.id, () => leaveApi.act(r.id, "cancel"), "Đã hủy đơn.");
        }}
        title="Hủy đơn xin phép?"
        message={<>Đơn “<b>{toCancel ? LEAVE_KIND_LABEL[toCancel.kind] : ""}</b>” sẽ được rút lại.</>}
        confirmText="Hủy đơn"
        cancelText="Giữ lại"
        variant="warning"
      />
    </div>
  );
}

function RejectDialog({ item, onClose, onConfirm }: { item: LeaveRequestDto | null; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  if (!item) return null;
  const ok = note.trim().length >= 5;
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-4 flex items-center justify-center animate-fadeIn">
        <div role="dialog" aria-modal="true" aria-label="Từ chối đơn" onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl border border-gray-100 space-y-3 animate-scaleIn">
          <h3 className="text-base font-extrabold text-gray-900">Từ chối đơn của {item.memberName}</h3>
          <CustomTextarea label="Lý do (người xin sẽ thấy)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="VD: Hôm đó cả nhà có Thánh lễ bổn mạng, em sắp xếp tham dự nhé." />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="button" disabled={!ok} onClick={() => { onConfirm(note); setNote(""); }} className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition active:scale-95 disabled:opacity-50">Từ chối đơn</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
