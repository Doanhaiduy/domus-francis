"use client";

import React, { useEffect, useState } from "react";
import { BadgeCheck, Church, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomTextarea, ImageUploadDropzone } from "@/components/ui/FormControls";
import { ChurchPicker } from "@/components/ui/ChurchPicker";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { liturgyCalendarApi, refreshLiturgy } from "@/lib/data/liturgy-calendar";
import type { CalendarDayDetailDto } from "@/lib/types/liturgy";
import { dmy, readLastChurch, rememberChurch } from "./liturgy-style";

interface Props {
  day: CalendarDayDetailDto;
  onClose: () => void;
}

/**
 * Thành viên check-in đã tham dự Thánh lễ: Chúa Nhật chỉ cần xác nhận (được tự xác nhận ngay khi cấu hình bật); lễ trọng / Bổn mạng ngoài
 * Chúa Nhật cần ảnh minh chứng. Nhà thờ lần trước được nhớ trên trình duyệt này để điền sẵn.
 */
export default function MassCheckinModal({ day, onClose }: Props) {
  const { showToast } = useApp();
  const req = day.requirement!;
  const mine = day.myCheckin;
  const [church, setChurch] = useState(mine?.church ?? "");
  const [note, setNote] = useState(mine?.note ?? "");
  const [evidence, setEvidence] = useState(mine?.evidenceFileId ?? "");
  const [busy, setBusy] = useState(false);
  const [rememberedChurch, setRememberedChurch] = useState(false);

  // Check-in mới: điền sẵn nhà thờ lần trước (localStorage chỉ đọc được trên trình duyệt)
  useEffect(() => {
    if (mine?.church) return;
    const last = readLastChurch();
    if (last) {
      setChurch((c) => c || last);
      setRememberedChurch(true);
    }
  }, [mine?.church]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (req.evidenceRequired && !evidence) {
      showToast("error", "Ngày lễ này cần ảnh minh chứng (ảnh nhà thờ / Thánh lễ bạn tham dự).");
      return;
    }
    setBusy(true);
    try {
      const c = await liturgyCalendarApi.checkin({ date: day.date, church: church.trim() || null, note: note.trim() || null, evidenceFileId: evidence || null });
      rememberChurch(church);
      await refreshLiturgy();
      showToast(
        "success",
        c.status === "approved"
          ? "Đã check-in đi lễ — đã được xác nhận. Tạ ơn Chúa!"
          : mine
            ? "Đã cập nhật check-in — chờ Ban Phụng vụ xác nhận."
            : "Đã check-in đi lễ — chờ Ban Phụng vụ xác nhận. Tạ ơn Chúa!"
      );
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-purple-50 flex flex-col gap-4 my-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Church className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    Check-in đi lễ · {req.label} · {dmy(day.date)}
                  </span>
                  <h3 className="text-sm font-black text-gray-900 leading-snug">{day.title}</h3>
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500" title="Đóng" aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>

            {mine?.status === "rejected" && mine.reviewNote && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <b>Lần trước chưa hợp lệ:</b> {mine.reviewNote}
                <span className="block mt-0.5 text-rose-700/90">Lần gửi lại này sẽ do Ban Phụng vụ xem và xác nhận.</span>
              </div>
            )}
            {day.autoApprove && mine?.status !== "rejected" && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                <BadgeCheck className="w-4 h-4 shrink-0 mt-px" />
                <span>Ngày này không cần ảnh minh chứng — check-in được xác nhận ngay khi gửi.</span>
              </div>
            )}

            <ImageUploadDropzone
              label={req.evidenceRequired ? "Ảnh minh chứng đã đi lễ" : "Ảnh minh chứng (không bắt buộc)"}
              required={req.evidenceRequired}
              value={evidence}
              onChange={setEvidence}
              bucket="attachments"
              placeholder="Chụp hoặc chọn ảnh nhà thờ / Thánh lễ bạn tham dự"
              helperText="Ảnh chụp tại nhà thờ trong ngày lễ (hoặc lễ vọng chiều hôm trước). Thông tin vị trí trong ảnh được xóa trước khi lưu."
            />
            <div>
              <ChurchPicker label="Nhà thờ / giáo xứ đã dự lễ" value={church} onChange={setChurch} />
              <p className="mt-1 text-[11px] text-gray-500">
                {rememberedChurch && church
                  ? "Đã điền sẵn nhà thờ lần trước — sửa nếu hôm nay bạn dự lễ ở nơi khác."
                  : "Chọn trong danh sách giáo xứ Nha Trang (gõ để lọc, không cần dấu) hoặc tự nhập nếu nhà thờ không có trong danh sách."}
              </p>
            </div>
            <CustomTextarea label="Ghi chú (tùy chọn)" placeholder="VD: dự lễ 17h30 chiều thứ Bảy (lễ vọng)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />

            <p className="text-[11px] text-gray-500">
              Hạn check-in: hết ngày {dmy(req.deadline)}.{" "}
              {req.evidenceRequired
                ? "Ban Phụng vụ sẽ xem ảnh và xác nhận."
                : day.autoApprove
                  ? "Ảnh kèm theo (nếu có) giống ảnh của người khác hoặc chụp không đúng ngày thì chờ Ban Phụng vụ xem."
                  : "Chúa Nhật không cần ảnh minh chứng."}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition disabled:opacity-60"
              >
                {busy ? "Đang gửi…" : mine ? "Cập nhật check-in" : "Xác nhận đã đi lễ"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
