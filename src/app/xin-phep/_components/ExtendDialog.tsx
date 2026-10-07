"use client";

import React, { useEffect, useState } from "react";
import { AlarmClockPlus, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { leaveApi } from "@/lib/data/leave";
import { fromVnParts, halfHourOptions, toVnParts } from "@/lib/vn-time";
import { LEAVE_KIND_LABEL, type LeaveRequestDto } from "@/lib/types/leave";

const TIMES = halfHourOptions(0, 23);
const VN = "Asia/Ho_Chi_Minh";
const fmt = (iso: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: VN }).format(new Date(iso));

/** Mặc định giờ mới: giờ hiệu lực hiện tại + 30 phút, làm tròn lên nửa giờ kế tiếp. */
const suggest = (effectiveEnd: string) => {
  const half = 30 * 60_000;
  return toVnParts(new Date(Math.ceil((new Date(effectiveEnd).getTime() + half) / half) * half).toISOString());
};

/** Hộp thoại "Xin thêm giờ": đã xin phép về muộn / ngủ ngoài rồi mà có chuyện phát sinh ⇒ báo giờ về mới + lý do, tin được gửi lại vào nhóm Zalo. */
export function ExtendDialog({ item, onClose }: { item: LeaveRequestDto | null; onClose: () => void }) {
  const { showToast } = useApp();
  const [to, setTo] = useState({ date: "", time: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTo(suggest(item.effectiveEndsAt));
    setReason("");
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, busy, onClose]);

  if (!item) return null;

  const newIso = to.date && to.time ? fromVnParts(to.date, to.time) : null;
  const later = !!newIso && new Date(newIso) > new Date(item.effectiveEndsAt);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIso || !later) return showToast("error", "Giờ mới phải muộn hơn giờ bạn đã báo.");
    if (reason.trim().length < 5) return showToast("error", "Hãy ghi lý do (tối thiểu 5 ký tự).");
    setBusy(true);
    try {
      await leaveApi.extend(item.id, { newEndsAt: newIso, reason: reason.trim() });
      showToast("success", "Đã báo giờ về mới — người quản lý và nhóm Zalo của nhà đã được báo.");
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
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Xin thêm giờ" className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><AlarmClockPlus className="w-5 h-5" aria-hidden /></span>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Xin thêm giờ</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {LEAVE_KIND_LABEL[item.kind]} — đã báo về lúc <b className="text-gray-800">{fmt(item.effectiveEndsAt)}</b>
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomDatePicker label="Về tới lưu xá — ngày" format="YYYY-MM-DD" value={to.date} onChange={(d) => d && setTo({ ...to, date: d })} required />
              <CustomSelect label="Giờ mới" value={to.time} onChange={(t) => setTo({ ...to, time: t })} options={TIMES} />
            </div>
            {newIso && !later && <p className="text-[11px] text-rose-600 -mt-2">Giờ mới phải muộn hơn {fmt(item.effectiveEndsAt)}.</p>}
            <CustomTextarea label="Lý do xin thêm giờ" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="VD: Xe bị hỏng giữa đường, đang chờ sửa; em sẽ về tới nhà khoảng 0h30." />
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-sky-50 border border-sky-100 text-[11px] text-sky-900 leading-relaxed">
              <MessageCircle className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" aria-hidden />
              <span>Giờ về mới sẽ được báo lại vào <b>nhóm Zalo của nhà</b>{item.doorMemberName ? <> và cho <b>{item.doorMemberName}</b> (người để cửa)</> : null}.</span>
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="submit" disabled={busy || !later} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Gửi giờ mới
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
