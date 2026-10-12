"use client";

import React, { useMemo, useState } from "react";
import { AlarmClockPlus, CalendarOff, Check, Clock, DoorOpen, ListFilter, MapPin, Moon, Pencil, Phone, Plus, Search, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { leaveApi, useLeave, useLeaveAll, useLeaveTonight } from "@/lib/data/leave";
import { LEAVE_KIND_GROUPS, LEAVE_KIND_LABEL, LEAVE_STATUS_LABEL, type LeaveKind, type LeaveRequestDto, type LeaveStatus } from "@/lib/types/leave";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { PurgeButton } from "@/components/ui/PurgeButton";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";
import { LeaveForm } from "./_components/LeaveForm";
import { ExtendDialog } from "./_components/ExtendDialog";

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-gray-200 text-gray-600",
};

const VN = "Asia/Ho_Chi_Minh";
const fmt = (iso: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: VN }).format(new Date(iso));
const fmtDay = (iso: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: VN }).format(new Date(iso));
const dayOf = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: VN }).format(new Date(iso));
const LONG_KINDS: LeaveKind[] = ["long_leave", "home_visit", "tet_break", "summer_break", "holiday_break", "other"];
const when = (r: LeaveRequestDto) => {
  if (LONG_KINDS.includes(r.kind)) {
    const days = Math.round((new Date(dayOf(r.endsAt)).getTime() - new Date(dayOf(r.startsAt)).getTime()) / 86400_000) + 1;
    return `${fmtDay(r.startsAt)} → ${fmtDay(r.endsAt)} (${days} ngày)`;
  }
  return dayOf(r.startsAt) === dayOf(r.endsAt) ? `${fmt(r.startsAt)} → ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: VN }).format(new Date(r.endsAt))}` : `${fmt(r.startsAt)} → ${fmt(r.endsAt)}`;
};

type Tab = "mine" | "review" | "all";
const STATUS_FILTERS: { value: LeaveStatus | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
  { value: "cancelled", label: "Đã hủy" },
];
const KIND_FILTER_OPTIONS = [
  { value: "", label: "Mọi loại đơn" },
  ...LEAVE_KIND_GROUPS.flatMap((g) => g.kinds.map((k) => ({ value: k as string, label: LEAVE_KIND_LABEL[k], subLabel: g.label }))),
];

export default function LeavePage() {
  const { showToast } = useApp();
  const { isLoading: sessionLoading } = useSession();
  const { data, isLoading } = useLeave();
  const tonight = useLeaveTonight();
  const [tab, setTab] = useState<Tab | null>(null);
  const [form, setForm] = useState<{ open: boolean; item: LeaveRequestDto | null }>({ open: false, item: null });
  const [toCancel, setToCancel] = useState<LeaveRequestDto | null>(null);
  const [toReject, setToReject] = useState<LeaveRequestDto | null>(null);
  const [toExtend, setToExtend] = useState<LeaveRequestDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Bộ lọc tab "Tất cả đơn"
  const [fStatus, setFStatus] = useState<LeaveStatus | "">("");
  const [fKind, setFKind] = useState("");
  const [fQuery, setFQuery] = useState("");
  const [fLimit, setFLimit] = useState(30);

  const canReview = data?.canReview ?? false;
  const active: Tab = tab ?? (canReview && (data?.pendingCount ?? 0) > 0 ? "review" : "mine");
  const all = useLeaveAll({ status: fStatus, kind: fKind as LeaveKind | "", q: fQuery, limit: fLimit }, canReview && active === "all");
  const shown = active === "all" ? (all.data?.items ?? []) : active === "review" ? (data?.review ?? []) : (data?.mine ?? []);
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

  const tabs: [Tab, string][] = [
    ["review", "Chờ tôi duyệt"],
    ["mine", "Đơn của tôi"],
    ...(canReview ? ([["all", "Tất cả đơn"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="flex flex-col w-full gap-5 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5"><CalendarOff className="w-6 h-6 text-primary" /> Xin phép</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">Vắng sự kiện, về muộn, ngủ ngoài, về quê hay nghỉ Tết, nghỉ hè — gửi đơn để người quản lý biết và duyệt. Đơn vắng sự kiện được duyệt sẽ ghi “có phép”, không bị trừ điểm.</p>
        </div>
        {data?.canRequest && (
          <button type="button" onClick={() => setForm({ open: true, item: null })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
            <Plus className="w-4 h-4" /> Gửi đơn xin phép
          </button>
        )}
      </div>

      {canReview && (
        <div role="tablist" className="flex p-1 rounded-xl bg-gray-100 gap-1 overflow-x-auto max-w-full self-start">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={active === k} onClick={() => setTab(k)} className={cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap", active === k ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}>
              {label}
              {k === "review" && (data?.pendingCount ?? 0) > 0 && <span className="bg-error-container text-on-error-container text-[10px] font-bold px-1.5 py-0.5 rounded-full">{data!.pendingCount}</span>}
              {k === "mine" && pendingMine > 0 && <span className="text-[10px] font-bold text-amber-700">{pendingMine} chờ</span>}
            </button>
          ))}
        </div>
      )}

      {active === "all" && (
        <div className="rounded-2xl border border-purple-100 bg-white p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
            {STATUS_FILTERS.map((s) => {
              const count = s.value ? all.data?.counts[s.value] : all.data ? Object.values(all.data.counts).reduce((a, b) => a + b, 0) : undefined;
              return (
                <button
                  key={s.value || "all"}
                  type="button"
                  onClick={() => { setFStatus(s.value); setFLimit(30); }}
                  aria-pressed={fStatus === s.value}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition", fStatus === s.value ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300")}
                >
                  {s.label}{count !== undefined && <span className={cn("ml-1.5", fStatus === s.value ? "text-white/80" : "text-gray-400")}>{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomInput aria-label="Tìm theo tên, lý do, nơi đến" leftIcon={<Search className="w-4 h-4" aria-hidden />} value={fQuery} onChange={(e) => { setFQuery(e.target.value); setFLimit(30); }} placeholder="Tìm theo tên, lý do, nơi đến…" />
            <CustomSelect aria-label="Lọc theo loại đơn" value={fKind} onChange={(v) => { setFKind(v); setFLimit(30); }} options={KIND_FILTER_OPTIONS} />
          </div>
          <p className="text-[11px] text-gray-500 flex items-center gap-1.5"><ListFilter className="w-3.5 h-3.5" aria-hidden />Toàn bộ đơn của cả nhà, mọi thời gian{all.data ? ` — hiển thị ${all.data.items.length}/${all.data.total} đơn` : ""}.</p>
        </div>
      )}

      {active !== "all" && (tonight?.items.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5 space-y-2.5">
          <p className="text-sm font-extrabold text-indigo-900 flex items-center gap-2"><Moon className="w-4 h-4" aria-hidden /> Tối nay ai vắng / về muộn</p>
          <ul className="space-y-1.5">
            {tonight!.items.map((t) => (
              <li key={t.leaveId} className="text-sm text-indigo-900 flex flex-wrap items-baseline gap-x-2">
                <b>{t.memberName}</b>
                <span>
                  {t.kind === "late_return" ? "về muộn" : t.kind === "overnight_out" ? "ngủ ngoài" : "vắng (" + LEAVE_KIND_LABEL[t.kind].toLowerCase() + ")"} —{" "}
                  {t.kind === "late_return" || t.kind === "overnight_out" ? <>dự kiến về <b>{fmt(t.effectiveEndsAt)}</b></> : <>đến <b>{fmt(t.effectiveEndsAt)}</b></>}
                </span>
                {t.effectiveEndsAt !== t.endsAt && <span className="text-xs text-amber-700 font-semibold">(đã xin thêm giờ, ban đầu {fmt(t.endsAt)})</span>}
                {t.doorForMe && <span className="text-[11px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">bạn để cửa</span>}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-indigo-800/80">Chỉ hiện tên, loại đơn và giờ — lý do, nơi đến và số điện thoại chỉ người duyệt đơn xem ở danh sách đơn.</p>
        </div>
      )}

      {active !== "all" && (data?.doorDuties.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5 space-y-2.5">
          <p className="text-sm font-extrabold text-sky-900 flex items-center gap-2"><DoorOpen className="w-4 h-4" aria-hidden /> Anh em nhờ bạn để cửa</p>
          <ul className="space-y-1.5">
            {data!.doorDuties.map((d) => (
              <li key={d.leaveId} className="text-sm text-sky-900 flex flex-wrap items-baseline gap-x-2">
                <b>{d.memberName}</b>
                <span>{d.kind === "late_return" ? "về muộn" : "ngủ ngoài"} — dự kiến về <b>{fmt(d.effectiveEndsAt)}</b></span>
                {d.effectiveEndsAt !== d.endsAt && <span className="text-xs text-amber-700 font-semibold">(đã xin thêm giờ, ban đầu {fmt(d.endsAt)})</span>}
                {d.status === "pending" && <span className="text-[11px] text-sky-700">· đơn đang chờ duyệt</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {((isLoading || sessionLoading) && !data) || (active === "all" && all.isLoading) ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-24 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <CalendarOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{active === "all" ? "Không có đơn nào khớp bộ lọc" : active === "review" ? "Không có đơn nào cần xử lý" : "Bạn chưa gửi đơn nào"}</p>
          {active === "mine" && data?.canRequest && <p className="text-sm text-gray-500 mt-1">Cần vắng hay về muộn? Bấm “Gửi đơn xin phép” ở trên.</p>}
        </div>
      ) : (
        <>
          <ul className="grid gap-3 xl:grid-cols-2 items-start">
            {shown.map((r) => (
              <li key={r.id} className={cn("bg-white border rounded-2xl p-4 sm:p-5 space-y-2.5", r.status === "pending" ? "border-amber-200" : "border-purple-100", busy === r.id && "opacity-60 pointer-events-none")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {active !== "mine" && <span className="font-extrabold text-gray-900">{r.memberName}{r.isMine ? " (tôi)" : ""}</span>}
                      <span className="text-sm font-bold text-gray-800">{LEAVE_KIND_LABEL[r.kind]}{r.eventTitle ? ` — ${r.eventTitle}` : ""}</span>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", STATUS_STYLE[r.status])}>{LEAVE_STATUS_LABEL[r.status]}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0" />{when(r)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {r.canEdit && (
                      <button type="button" onClick={() => setForm({ open: true, item: r })} title="Sửa đơn" aria-label={`Sửa đơn ${LEAVE_KIND_LABEL[r.kind]} của ${r.memberName}`} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <PurgeButton variant="icon" url={`/api/v1/leave/${r.id}`} what={`đơn xin phép “${LEAVE_KIND_LABEL[r.kind]}” của ${r.memberName}`} />
                  </div>
                </div>
                <p className="text-sm text-gray-700">{r.reason}</p>
                {r.doorMemberName && (
                  <p className="text-xs text-gray-600 inline-flex items-center gap-1.5"><DoorOpen className="w-3.5 h-3.5 text-primary" aria-hidden />Nhờ <b className="text-gray-800">{r.doorMemberName}</b> để cửa</p>
                )}
                {r.extensions.length > 0 && (
                  <ul className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 space-y-1">
                    {r.extensions.map((x) => (
                      <li key={x.id} className="text-xs text-amber-900">
                        <span className="font-bold">Xin thêm giờ → về {fmt(x.newEndsAt)}</span>
                        <span className="text-amber-800/80"> · {x.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(r.destination || r.contactPhone) && (
                  <p className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                    {r.destination && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{r.destination}</span>}
                    {r.contactPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{r.contactPhone}</span>}
                  </p>
                )}
                {(r.status === "approved" || r.status === "rejected") && (
                  <p className="text-xs text-gray-500">{r.decidedByName ? `${r.decidedByName} ` : ""}{r.status === "approved" ? "đã duyệt" : "đã từ chối"}{r.decisionNote ? `: ${r.decisionNote}` : ""}</p>
                )}
                {r.canExtend && (
                  <button type="button" onClick={() => setToExtend(r)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold hover:bg-amber-100 transition active:scale-95">
                    <AlarmClockPlus className="w-3.5 h-3.5" aria-hidden /> Xin thêm giờ
                  </button>
                )}
                {r.status === "pending" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!r.isMine && canReview && (
                      <>
                        <button type="button" onClick={() => run(r.id, () => leaveApi.act(r.id, "approve"), "Đã duyệt đơn.")} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition active:scale-95"><Check className="w-3.5 h-3.5" /> Duyệt</button>
                        <button type="button" onClick={() => setToReject(r)} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition active:scale-95"><X className="w-3.5 h-3.5" /> Từ chối</button>
                      </>
                    )}
                    {r.isMine && (
                      <button type="button" onClick={() => setToCancel(r)} className="px-4 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition">Hủy đơn</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {active === "all" && all.data?.hasMore && (
            <button type="button" onClick={() => setFLimit((n) => n + 30)} className="self-center px-5 py-2 rounded-xl border border-purple-200 bg-white text-primary text-xs font-bold hover:bg-purple-50 transition active:scale-95">
              Xem thêm {Math.min(30, all.data.total - all.data.items.length)} đơn
            </button>
          )}
        </>
      )}

      {form.open && data && <LeaveForm events={data.events} item={form.item} onClose={() => setForm({ open: false, item: null })} />}
      <ExtendDialog item={toExtend} onClose={() => setToExtend(null)} />
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
      <div onClick={onClose} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-end sm:items-center justify-center animate-fadeIn">
        <div role="dialog" aria-modal="true" aria-label="Từ chối đơn" onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl border border-gray-100 space-y-3 animate-scaleIn max-h-[92dvh] overflow-y-auto">
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
