"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, QrCode, Smartphone, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { ATTENDANCE_LABEL } from "@/lib/events-format";
import { eventsApi, refreshEvents } from "@/lib/data/events";
import type { CheckInResultDto, EventDto } from "@/lib/types/events";

interface Props {
  /** Sự kiện cần điểm danh (null = dò mọi phiên đang mở) */
  event: EventDto | null;
  onClose: () => void;
}

/** Thành viên tự điểm danh: quét QR (mở trang /lich-su-kien/diem-danh) hoặc nhập mã 6 số đang hiển thị cạnh mã QR. */
export default function CheckInModal({ event, onClose }: Props) {
  const { showToast } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResultDto | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setMounted(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      showToast("error", "Mã điểm danh gồm 6 chữ số.");
      return;
    }
    setBusy(true);
    try {
      const r = await eventsApi.checkIn({ code: digits, eventId: event?.id ?? null });
      setResult(r);
      await refreshEvents();
      showToast("success", `Đã điểm danh "${r.eventTitle}": ${ATTENDANCE_LABEL[r.status]}${r.time ? ` lúc ${r.time}` : ""}.`);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-purple-50 text-center flex flex-col items-center gap-4 my-auto"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-purple-100">Điểm danh có mặt</span>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {event && (
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-gray-900">{event.title}</h3>
              <p className="text-xs text-gray-500">
                {event.date} • {event.startHm} – {event.endHm}
              </p>
            </div>
          )}

          {result ? (
            <div className="w-full flex flex-col items-center gap-3 py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <p className="text-sm font-bold text-gray-900">
                {ATTENDANCE_LABEL[result.status]}
                {result.time ? ` lúc ${result.time}` : ""}
              </p>
              <p className="text-xs text-gray-500">{result.eventTitle}</p>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] active:scale-95 transition">
                Xong
              </button>
            </div>
          ) : (
            <>
              <div className="w-full grid grid-cols-2 gap-2 text-left">
                <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
                  <QrCode className="w-5 h-5 text-primary mb-1" />
                  <p className="text-[11px] font-bold text-gray-800">Quét mã QR</p>
                  <p className="text-[10px] text-gray-500 leading-snug">Dùng camera điện thoại quét mã trên màn hình Ban tổ chức.</p>
                </div>
                <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-100">
                  <Smartphone className="w-5 h-5 text-blue-600 mb-1" />
                  <p className="text-[11px] font-bold text-gray-800">Nhập mã 6 số</p>
                  <p className="text-[10px] text-gray-500 leading-snug">Mã hiển thị ngay dưới mã QR, đổi theo chu kỳ.</p>
                </div>
              </div>
              <form onSubmit={submit} className="w-full space-y-3">
                <input
                  ref={inputRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
                  placeholder="000 000"
                  className="w-full text-center font-mono text-2xl font-black tracking-[0.3em] py-3 rounded-2xl border-2 border-purple-200 focus:border-primary focus:outline-none text-primary placeholder:text-gray-300"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition disabled:opacity-60"
                >
                  {busy ? "Đang xác nhận..." : "Xác nhận tôi đã có mặt tại đây"}
                </button>
              </form>
              <p className="text-[10px] text-gray-400">Mỗi người điểm danh cho chính mình bằng thiết bị của mình.</p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
