"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { QrCode, X, Loader2, Power, Users, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage, swrFetcher } from "@/lib/api";
import { CustomSelect } from "@/components/ui/FormControls";
import { isoToVnHm } from "@/lib/events-format";
import { EVENTS_KEY, eventsApi, refreshEvents, useQrDisplay } from "@/lib/data/events";
import type { AttendanceRosterDto, EventDto } from "@/lib/types/events";

interface Props {
  event: EventDto;
  onClose: () => void;
}

/** Màn hình mã QR điểm danh cho Ban tổ chức: mở/đóng phiên, mã QR + mã 6 số xoay vòng theo DB (app.fn_qr_token). */
export default function QrModal({ event, onClose }: Props) {
  const { showToast } = useApp();
  const { qr, loaded, error, mutate } = useQrDisplay(event.id);
  const { data: roster } = useSWR<AttendanceRosterDto>(`${EVENTS_KEY}/${event.id}/attendance`, swrFetcher, { refreshInterval: qr ? 5000 : 0 });
  const [duration, setDuration] = useState("end");
  const [rotation, setRotation] = useState("45");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [left, setLeft] = useState(0);
  useEffect(() => setMounted(true), []);

  // Đếm ngược tới lần đổi mã
  useEffect(() => {
    if (!qr) return;
    const until = Date.now() + qr.refreshInMs;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [qr]);

  const open = async () => {
    setBusy(true);
    try {
      const d = await eventsApi.openQr(event.id, {
        durationMinutes: duration === "end" ? undefined : Number(duration),
        rotationSeconds: Number(rotation),
      });
      await mutate(d, { revalidate: false });
      await refreshEvents();
      showToast("success", "Đã mở phiên điểm danh QR — mã đổi tự động theo chu kỳ.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      await eventsApi.closeQr(event.id);
      await mutate({ session: null }, { revalidate: false });
      await refreshEvents();
      showToast("info", "Đã đóng phiên điểm danh QR.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checked = roster ? roster.rows.filter((r) => r.status === "present" || r.status === "late").length : event.stats.present + event.stats.late;
  const expected = roster ? roster.rows.length : event.stats.expected ?? 0;

  if (!mounted) return null;
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-purple-50 text-center flex flex-col items-center gap-4 my-auto"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-purple-100">Mã QR Check-in</span>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-gray-900">{event.title}</h3>
            <p className="text-xs text-gray-500">
              {event.date} • {event.startHm} – {event.endHm} • {event.location}
            </p>
          </div>

          {!loaded ? (
            <div className="w-52 h-52 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : error ? (
            <p className="text-xs text-rose-600 font-semibold">{errorMessage(error)}</p>
          ) : qr ? (
            <>
              <div
                className="p-3 bg-white border-4 border-purple-600 rounded-3xl shadow-md flex items-center justify-center w-56 h-56 [&>svg]:w-full [&>svg]:h-full"
                // SVG do máy chủ sinh bằng thư viện qrcode từ URL nội bộ
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />
              <div className="space-y-1.5 w-full">
                <p className="text-[11px] text-gray-500">Hoặc nhập mã điểm danh:</p>
                <p className="font-mono text-3xl font-black tracking-[0.25em] text-primary select-all">
                  {qr.code.slice(0, 3)} {qr.code.slice(3)}
                </p>
                <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Mã đổi sau {left}s (chu kỳ {qr.session.rotationSeconds}s) • Phiên mở đến {isoToVnHm(qr.session.closesAt)}
                </p>
              </div>
              <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs">
                <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> Đã điểm danh
                </span>
                <span className="font-mono font-black text-emerald-700">
                  {checked}/{expected}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-800">Quét bằng Camera điện thoại (đã đăng nhập Lưu Xá)</p>
                <p className="text-[11px]">Mỗi người tự điểm danh bằng máy của mình; giờ ghi nhận là giờ máy chủ.</p>
              </div>
              <button
                onClick={close}
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 active:scale-95 transition inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Power className="w-4 h-4" />
                Đóng phiên điểm danh
              </button>
            </>
          ) : (
            <>
              <div className="w-44 h-44 rounded-3xl border-4 border-dashed border-purple-200 flex flex-col items-center justify-center gap-2 text-purple-300">
                <QrCode className="w-16 h-16" />
                <span className="text-[11px] font-bold text-gray-400">Chưa mở phiên</span>
              </div>
              {!event.canQr ? (
                <p className="text-xs text-gray-500">Bạn không có quyền mở phiên điểm danh QR cho sự kiện này.</p>
              ) : (
                <div className="w-full space-y-3 text-left">
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      label="Thời lượng phiên"
                      value={duration}
                      onChange={setDuration}
                      options={[
                        { value: "end", label: "Đến khi kết thúc" },
                        { value: "15", label: "15 phút" },
                        { value: "30", label: "30 phút" },
                        { value: "60", label: "60 phút" },
                        { value: "120", label: "120 phút" },
                      ]}
                    />
                    <CustomSelect
                      label="Đổi mã mỗi"
                      value={rotation}
                      onChange={setRotation}
                      options={["30", "45", "60", "90", "120"].map((v) => ({ value: v, label: `${v} giây` }))}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 text-center">
                    Thành viên chỉ điểm danh được trong khung giờ mở điểm danh (mặc định từ 30 phút trước giờ bắt đầu đến khi kết thúc).
                  </p>
                  <button
                    onClick={open}
                    disabled={busy || event.status === "cancelled"}
                    className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] shadow-xs active:scale-95 transition disabled:opacity-60"
                  >
                    {busy ? "Đang mở..." : "Mở phiên điểm danh QR"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
