"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { leaveApi } from "@/lib/data/leave";
import { fromVnParts, halfHourOptions, toVnParts, vnToday } from "@/lib/vn-time";
import { LEAVE_KIND_HINT, LEAVE_KIND_LABEL, type LeaveEventOption, type LeaveKind } from "@/lib/types/leave";

const KINDS = (Object.keys(LEAVE_KIND_LABEL) as LeaveKind[]).map((k) => ({ value: k, label: LEAVE_KIND_LABEL[k] }));
const TIMES = halfHourOptions(0, 23);

// Mốc gợi ý theo loại đơn (giờ VN): [bắt đầu ngày+, giờ, kết thúc ngày+, giờ]
const DEFAULTS: Record<Exclude<LeaveKind, "event_absence">, [number, string, number, string]> = {
  late_return: [0, "18:00", 0, "23:30"],
  overnight_out: [0, "18:00", 1, "07:00"],
  long_leave: [1, "07:00", 3, "18:00"],
};

const fmtEvent = (e: LeaveEventOption) =>
  `${e.title} — ${new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(e.startsAt))}`;

/** Hộp thoại gửi đơn xin phép. */
export function LeaveForm({ events, onClose }: { events: LeaveEventOption[]; onClose: () => void }) {
  const { showToast } = useApp();
  const [kind, setKind] = useState<LeaveKind>(events.length ? "event_absence" : "late_return");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [from, setFrom] = useState({ date: vnToday(), time: "18:00" });
  const [to, setTo] = useState({ date: vnToday(), time: "23:30" });
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Đổi loại đơn ⇒ đặt lại mốc gợi ý
  const pickKind = (k: LeaveKind) => {
    setKind(k);
    if (k !== "event_absence") {
      const [d1, t1, d2, t2] = DEFAULTS[k];
      setFrom({ date: vnToday(d1), time: t1 });
      setTo({ date: vnToday(d2), time: t2 });
    }
  };

  const needsPlace = kind === "overnight_out" || kind === "long_leave";
  const ev = useMemo(() => events.find((e) => e.id === eventId), [events, eventId]);
  const startIso = kind === "event_absence" ? ev?.startsAt : fromVnParts(from.date, from.time);
  const endIso = kind === "event_absence" ? ev?.endsAt : fromVnParts(to.date, to.time);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "event_absence" && !ev) return showToast("error", "Hãy chọn sự kiện bạn xin vắng.");
    if (!startIso || !endIso || !(new Date(endIso) > new Date(startIso))) return showToast("error", "Thời điểm kết thúc phải sau thời điểm bắt đầu.");
    if (reason.trim().length < 5) return showToast("error", "Hãy ghi lý do (tối thiểu 5 ký tự).");
    if (needsPlace && !destination.trim()) return showToast("error", "Hãy cho biết nơi bạn đến.");
    setBusy(true);
    try {
      await leaveApi.create({ kind, eventId: kind === "event_absence" ? eventId : null, startsAt: startIso, endsAt: endIso, reason, destination: destination.trim() || null, contactPhone: phone.trim() || null });
      showToast("success", "Đã gửi đơn — người quản lý sẽ xem và trả lời bạn.");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Gửi đơn xin phép" className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-gray-900">Gửi đơn xin phép</h3>
              <p className="text-xs text-gray-500 mt-0.5">{LEAVE_KIND_HINT[kind]}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-4">
            <CustomSelect<LeaveKind> label="Loại đơn" value={kind} onChange={pickKind} options={events.length ? KINDS : KINDS.filter((k) => k.value !== "event_absence")} />

            {kind === "event_absence" ? (
              <CustomSelect label="Sự kiện xin vắng" value={eventId} onChange={setEventId} options={events.map((e) => ({ value: e.id, label: fmtEvent(e) }))} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <CustomDatePicker label="Từ ngày" format="YYYY-MM-DD" value={from.date} onChange={(d) => d && setFrom({ ...from, date: d })} required />
                  <CustomSelect aria-label="Từ giờ" value={from.time} onChange={(t) => setFrom({ ...from, time: t })} options={TIMES} />
                </div>
                <div className="space-y-2">
                  <CustomDatePicker label="Đến ngày" format="YYYY-MM-DD" value={to.date} onChange={(d) => d && setTo({ ...to, date: d })} required />
                  <CustomSelect aria-label="Đến giờ" value={to.time} onChange={(t) => setTo({ ...to, time: t })} options={TIMES} />
                </div>
              </div>
            )}

            {kind !== "event_absence" && <p className="text-[11px] text-gray-500 -mt-2">{kind === "late_return" ? "“Đến giờ” là giờ dự kiến bạn về tới lưu xá." : "Giờ theo múi giờ Việt Nam."}</p>}

            <CustomTextarea label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="VD: Em có buổi thi cuối kỳ ở trường, thi xong lúc 21h." />
            {(needsPlace || kind === "late_return") && (
              <CustomInput label={needsPlace ? "Nơi đến *" : "Bạn đang ở đâu? (tùy chọn)"} value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={200} placeholder={needsPlace ? "VD: Nhà bà con ở Nha Trang / Về quê Phú Yên" : "VD: Thư viện trường"} />
            )}
            {needsPlace && <CustomInput label="Số điện thoại liên lạc (tùy chọn)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="09xx xxx xxx" />}
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Gửi đơn
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
