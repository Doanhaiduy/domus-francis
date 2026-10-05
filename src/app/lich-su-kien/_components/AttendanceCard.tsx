"use client";

import React, { useState } from "react";
import { Check, CheckCircle2, QrCode, Lock, ClipboardCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ATTENDANCE_LABEL, eventPhase, nearCheckInWindow } from "@/lib/events-format";
import { eventsApi, refreshEvents, useAttendanceRoster } from "@/lib/data/events";
import type { AttendanceRowDto, EventDto } from "@/lib/types/events";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { catStyle } from "./styles";

interface Props {
  event: EventDto;
  canReadAll: boolean;
  onOpenQr: (e: EventDto) => void;
  onCheckIn: (e: EventDto) => void;
}

const STATUS_BADGE: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700",
  late: "bg-amber-50 text-amber-700",
  absent: "bg-rose-50 text-rose-700",
  excused: "bg-blue-50 text-blue-700",
};

const METHOD_LABEL: Record<string, string> = { qr: "QR", manual: "Ghi hộ", import: "Tự động", self: "Tự xác nhận" };

export default function AttendanceCard({ event: evt, canReadAll, onOpenQr, onCheckIn }: Props) {
  const { showToast } = useApp();
  const { session } = useSession();
  const phase = eventPhase(evt);
  const canSeeRoster = evt.canRecord || canReadAll;
  // Sự kiện sắp tới: thu gọn danh sách (chưa ai điểm danh) — bấm để mở
  const [expanded, setExpanded] = useState(phase !== "upcoming" || !!evt.qrSession);
  const showRoster = canSeeRoster && expanded;
  const { roster, mutate } = useAttendanceRoster(evt.id, showRoster);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const style = catStyle(evt.categoryCode);

  const present = evt.stats.present;
  const late = evt.stats.late;
  const expected = evt.stats.expected ?? 0;
  const pct = expected > 0 ? Math.round(((present + late) / expected) * 100) : 0;
  const me = evt.myAttendance;
  const meIn = me && (me.status === "present" || me.status === "late");

  const mark = async (row: AttendanceRowDto, status: "present" | "late" | "absent") => {
    setBusyMember(row.memberId);
    try {
      const r = await eventsApi.mark(evt.id, row.memberId, status);
      await mutate(r, { revalidate: false });
      await refreshEvents();
      showToast("success", `${row.name}: ${ATTENDANCE_LABEL[status]}.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusyMember(null);
    }
  };

  const closeAttendance = async () => {
    setConfirmClose(false);
    try {
      const r = await eventsApi.closeAttendance(evt.id);
      await mutate(r.roster, { revalidate: false });
      await refreshEvents();
      showToast("success", `Đã chốt điểm danh: ${r.result.absent_created} vắng, ${r.result.excused_created} có phép, ${r.result.merit_entries} lượt điểm chuyên cần.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  // Thành viên thường: chỉ thấy dòng của chính mình (RLS attendance_records)
  const ownRow: AttendanceRowDto | null =
    !canSeeRoster && session?.member
      ? {
          memberId: session.member.id,
          name: session.member.displayName,
          fullName: session.member.fullName,
          room: session.member.roomCode,
          status: me?.status ?? null,
          method: me?.method ?? null,
          checkedInAt: me?.checkedInAt ?? null,
          time: me?.time ?? null,
          note: null,
          recordedBy: null,
          rsvp: evt.myRsvp,
        }
      : null;
  const rows = showRoster ? roster?.rows ?? [] : ownRow ? [ownRow] : [];
  const canCheckInNow = nearCheckInWindow(evt);

  return (
    <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold", style.bg, style.text)}>{evt.category}</span>
            <span className="text-xs text-gray-500 font-medium">
              📅 {evt.date} • 🕒 {evt.startHm}–{evt.endHm} • 📍 {evt.location || "Lưu xá"}
            </span>
            {phase === "ongoing" && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Đang diễn ra</span>}
            {evt.status === "completed" && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">Đã chốt</span>}
            {evt.status === "cancelled" && <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">Đã hủy</span>}
            {evt.qrSession && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-primary text-[10px] font-bold">QR đang mở</span>}
          </div>
          <h3 className="text-lg font-black text-gray-900 mt-1">{evt.title}</h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(evt.canRecord || evt.canQr) && evt.status !== "cancelled" && (
            <button
              onClick={() => onOpenQr(evt)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 transition"
            >
              <QrCode className="w-4 h-4" />
              <span>Mã QR Điểm danh</span>
            </button>
          )}
          {meIn ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <Check className="w-4 h-4" />
              <span>Bạn đã có mặt{me?.time ? ` (${me.time})` : ""}</span>
            </span>
          ) : canCheckInNow && evt.status !== "cancelled" ? (
            <button
              onClick={() => onCheckIn(evt)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 active:scale-95 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Check-in có mặt tôi</span>
            </button>
          ) : me ? (
            <span className={cn("inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold", STATUS_BADGE[me.status])}>
              {ATTENDANCE_LABEL[me.status]}
            </span>
          ) : phase === "upcoming" && evt.status !== "cancelled" ? (
            <span className="text-[11px] text-gray-400 font-medium">Mở điểm danh gần giờ bắt đầu</span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs font-bold mb-1.5 gap-2 flex-wrap">
          <span className="text-gray-700">
            Tiến độ điểm danh: <b className="text-primary">{present + late}/{expected}</b> anh em ({pct}%)
          </span>
          <span className="text-gray-500 text-[11px]">
            {present} đúng giờ • {late} đi muộn • {evt.stats.absent} vắng{evt.stats.excused ? ` • ${evt.stats.excused} có phép` : ""}
          </span>
        </div>
        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {canSeeRoster && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] font-bold text-primary hover:underline"
        >
          {expanded ? "Thu gọn danh sách điểm danh" : `Xem danh sách điểm danh (${expected} anh em)`}
        </button>
      )}

      {(expanded || !canSeeRoster) && (
      <div className="overflow-x-auto custom-scroll">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-bold">
              <th className="py-2 px-3">Thành viên</th>
              <th className="py-2 px-3">Phòng</th>
              <th className="py-2 px-3">Giờ Check-in</th>
              <th className="py-2 px-3">Trạng thái</th>
              <th className="py-2 px-3">Ghi chú</th>
              {roster?.canRecord && evt.status !== "cancelled" && <th className="py-2 px-3 text-right">Điểm danh hộ</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {showRoster && !roster && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-400">
                  Đang tải danh sách...
                </td>
              </tr>
            )}
            {rows.map((rec) => (
              <tr key={rec.memberId} className="hover:bg-purple-50/30">
                <td className="py-2 px-3 font-bold text-gray-900">
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-100 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                      {rec.name.charAt(0)}
                    </span>
                    <span>{rec.name}</span>
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-600 font-mono">{rec.room || "Lưu Xá"}</td>
                <td className="py-2 px-3 text-gray-700 font-mono">{rec.time ?? "—"}</td>
                <td className="py-2 px-3">
                  {rec.status ? (
                    <span className={cn("px-2 py-0.5 rounded-full font-bold text-[10px]", STATUS_BADGE[rec.status])}>
                      {ATTENDANCE_LABEL[rec.status]}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold text-[10px]">Chưa điểm danh</span>
                  )}
                  {rec.method && <span className="ml-1.5 text-[10px] text-gray-400">{METHOD_LABEL[rec.method]}</span>}
                </td>
                <td className="py-2 px-3 text-gray-500 italic">
                  {rec.note || (rec.recordedBy ? `Ghi bởi ${rec.recordedBy}` : "—")}
                </td>
                {roster?.canRecord && evt.status !== "cancelled" && (
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-end gap-1">
                      {(["present", "late", "absent"] as const).map((s) => (
                        <button
                          key={s}
                          disabled={busyMember === rec.memberId || rec.status === s}
                          onClick={() => mark(rec, s)}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-bold border transition disabled:opacity-50",
                            rec.status === s
                              ? STATUS_BADGE[s] + " border-transparent"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          {s === "present" ? "Có mặt" : s === "late" ? "Muộn" : "Vắng"}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {!canSeeRoster && (
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          Danh sách điểm danh chi tiết chỉ hiển thị cho Ban điều hành và ban tổ chức sự kiện.
        </p>
      )}

      {roster?.canRecord && roster.ended && evt.status !== "completed" && evt.status !== "cancelled" && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-100">
          <p className="text-[11px] text-amber-800">
            Sự kiện đã kết thúc. Chốt điểm danh để ghi vắng cho người chưa điểm danh (có phép nếu có đơn được duyệt) và cộng/trừ điểm chuyên cần.
          </p>
          <button
            onClick={() => setConfirmClose(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
          >
            <ClipboardCheck className="w-4 h-4" />
            Chốt điểm danh
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={closeAttendance}
        title="Chốt điểm danh sự kiện?"
        message={`Người chưa điểm danh của "${evt.title}" sẽ bị ghi vắng (hoặc vắng có phép nếu có đơn xin phép được duyệt), điểm chuyên cần được ghi và sự kiện chuyển sang hoàn tất. Không thể hoàn tác.`}
        confirmText="Chốt điểm danh"
        variant="warning"
      />
    </div>
  );
}
