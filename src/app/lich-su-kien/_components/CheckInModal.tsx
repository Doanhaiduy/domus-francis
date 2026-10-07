"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { ATTENDANCE_LABEL } from "@/lib/events-format";
import { eventsApi, refreshEvents } from "@/lib/data/events";
import { ImageUploadDropzone } from "@/components/ui/FormControls";
import type { CheckInResultDto, EventDto } from "@/lib/types/events";

interface Props {
  event: EventDto;
  onClose: () => void;
}

/** Thành viên tự điểm danh bằng ẢNH: chụp (hoặc chọn) một tấm ảnh tại sự kiện rồi gửi lại — không cần mã QR. Giờ ghi nhận là giờ máy chủ. */
export default function CheckInModal({ event, onClose }: Props) {
  const { showToast } = useApp();
  const [fileId, setFileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResultDto | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileId) {
      showToast("error", "Hãy chụp hoặc chọn một tấm ảnh tại sự kiện rồi gửi.");
      return;
    }
    setBusy(true);
    try {
      const r = await eventsApi.checkIn({ eventId: event.id, fileId });
      setResult(r);
      await refreshEvents();
      showToast("success", `Đã điểm danh "${r.eventTitle}": ${ATTENDANCE_LABEL[r.status]}${r.time ? ` lúc ${r.time}` : ""}.`);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-purple-50 flex flex-col gap-4 my-auto"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-purple-100">Điểm danh có mặt</span>
            <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600" aria-label="Đóng">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-gray-900">{event.title}</h3>
            <p className="text-xs text-gray-500">
              {event.date} • {event.startHm} – {event.endHm}
              {event.location ? ` • ${event.location}` : ""}
            </p>
          </div>

          {result ? (
            <div className="w-full flex flex-col items-center gap-3 py-2 text-center">
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
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
                <Camera className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Chụp một tấm ảnh <b>tại sự kiện</b> rồi gửi lại là được điểm danh. Giờ ghi nhận là giờ lúc bạn gửi; ban tổ chức xem được ảnh để đối chiếu.
                </p>
              </div>
              <ImageUploadDropzone
                value={fileId}
                onChange={setFileId}
                bucket="attachments"
                placeholder="Chụp hoặc chọn ảnh tại sự kiện"
                helperText="Thông tin vị trí trong ảnh được xóa trước khi lưu."
              />
              <button
                type="submit"
                disabled={busy || !fileId}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition disabled:opacity-60"
              >
                {busy ? "Đang gửi..." : "Gửi ảnh và điểm danh"}
              </button>
              <p className="text-[10px] text-gray-400 text-center">Mỗi người điểm danh cho chính mình bằng ảnh của mình.</p>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
