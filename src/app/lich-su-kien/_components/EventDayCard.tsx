"use client";

import React, { useState } from "react";
import { MapPin, User, Check, CheckCircle2, Camera, Pencil, Ban, Trash2, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ATTENDANCE_LABEL, eventPhase, nearCheckInWindow } from "@/lib/events-format";
import { eventsApi, refreshEvents } from "@/lib/data/events";
import type { EventDto, RsvpStatus } from "@/lib/types/events";
import PollCard from "./PollCard";
import { catStyle } from "./styles";

interface Props {
  event: EventDto;
  canManage: boolean;
  canManagePoll: boolean;
  canVote: boolean;
  onEdit: (e: EventDto) => void;
  onCancel: (e: EventDto) => void;
  onDelete: (e: EventDto) => void;
  onCheckIn: (e: EventDto) => void;
}

export default function EventDayCard({ event: evt, canManage, canManagePoll, canVote, onEdit, onCancel, onDelete, onCheckIn }: Props) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const style = catStyle(evt.categoryCode);
  const phase = eventPhase(evt);
  const cancelled = evt.status === "cancelled";
  const checkedIn = evt.stats.present + evt.stats.late;
  const me = evt.myAttendance;
  const meIn = me && (me.status === "present" || me.status === "late");
  const leadNames = evt.organizers.map((o) => o.name).join(", ");

  const rsvp = async (value: RsvpStatus) => {
    if (busy) return;
    const next: RsvpStatus = evt.myRsvp === value ? "none" : value;
    setBusy(true);
    try {
      await eventsApi.rsvp(evt.id, next);
      await refreshEvents();
      showToast(
        next === "going" ? "success" : "info",
        next === "going" ? "Đã xác nhận tham dự!" : next === "not_going" ? "Đã ghi nhận vắng." : next === "maybe" ? "Đã ghi nhận trạng thái chưa rõ." : "Đã bỏ phản hồi tham dự."
      );
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const rsvpDisabled = busy || cancelled || phase === "ended";

  return (
    <div className={cn("p-4 rounded-2xl border transition-all space-y-3", style.bg, style.border, cancelled && "opacity-70")}>
      <div className="flex items-center justify-between text-xs font-bold gap-2">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] bg-white/70", style.text)}>⭐ {evt.category.toUpperCase()}</span>
          {cancelled && <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-600 text-white">ĐÃ HỦY</span>}
          {phase === "ongoing" && <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white">ĐANG DIỄN RA</span>}
          {phase === "ended" && !cancelled && <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-500/80 text-white">ĐÃ KẾT THÚC</span>}
        </span>
        <span className="font-mono text-gray-700 font-bold shrink-0">
          {evt.startHm}–{evt.endHm}
        </span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={cn("text-sm font-bold text-gray-900", cancelled && "line-through")}>{evt.title}</h4>
          {evt.description && <p className="text-xs text-gray-600 mt-1 leading-relaxed">{evt.description}</p>}
          {cancelled && evt.cancelReason && <p className="text-xs text-rose-700 mt-1 font-semibold">Lý do hủy: {evt.cancelReason}</p>}
        </div>
        {(evt.canEdit || canManage) && (
          <div className="flex items-center gap-0.5 shrink-0">
            {evt.canEdit && !cancelled && (
              <button onClick={() => onEdit(evt)} title="Sửa sự kiện" className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-white/80 transition">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && !cancelled && evt.status !== "completed" && (
              <button onClick={() => onCancel(evt)} title="Hủy sự kiện" className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-white/80 transition">
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && (
              <button onClick={() => onDelete(evt)} title="Xóa sự kiện" className="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-white/80 transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span>{evt.location || "Lưu xá"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span>
            Người chủ trì: <b>{evt.organizer || "—"}</b>
          </span>
        </div>
        {leadNames && leadNames !== evt.organizer && (
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Phụ trách: {leadNames}</span>
          </div>
        )}
      </div>

      {evt.hasCheckIn && !cancelled && (
        <div className="p-3 bg-white/90 rounded-xl border border-purple-100 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Điểm danh tham dự: {checkedIn}
              {evt.stats.expected ? `/${evt.stats.expected}` : ""} có mặt
            </span>
          </div>

          <div className="flex items-center gap-2">
            {meIn ? (
              <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Bạn đã điểm danh{me?.time ? ` lúc ${me.time}` : ""} • {ATTENDANCE_LABEL[me!.status]}
              </span>
            ) : phase === "ended" ? (
              <span className="text-[11px] text-gray-500">
                {me ? `Kết quả của bạn: ${ATTENDANCE_LABEL[me.status]}` : "Sự kiện đã kết thúc — bạn chưa được ghi nhận điểm danh."}
              </span>
            ) : !nearCheckInWindow(evt) ? (
              <span className="text-[11px] text-gray-500">Điểm danh mở gần giờ bắt đầu — chụp ảnh gửi lại là được.</span>
            ) : (
              <button
                onClick={() => onCheckIn(evt)}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition active:scale-95 inline-flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                Chụp ảnh điểm danh
              </button>
            )}
          </div>
        </div>
      )}

      {evt.polls.map((p) => (
        <PollCard key={p.id} poll={p} variant="compact" canManage={canManagePoll} canVote={canVote} />
      ))}

      <div className="pt-2 border-t border-purple-100/60">
        <span className="text-[11px] font-bold text-gray-500 block mb-2">
          Xác nhận hiện diện (RSVP): <span className="font-medium text-gray-400">{evt.stats.going} tham dự • {evt.stats.notGoing} vắng • {evt.stats.maybe} chưa rõ</span>
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ["going", "Tham dự", "bg-primary"],
              ["not_going", "Vắng phép", "bg-rose-600"],
              ["maybe", "Chưa rõ", "bg-amber-600"],
            ] as const
          ).map(([value, label, active]) => (
            <button
              key={value}
              disabled={rsvpDisabled}
              onClick={() => rsvp(value)}
              className={cn(
                "py-1.5 rounded-xl text-xs font-bold transition disabled:cursor-not-allowed",
                evt.myRsvp === value ? `${active} text-white shadow-2xs` : "bg-white text-gray-700 border hover:bg-gray-50",
                rsvpDisabled && evt.myRsvp !== value && "opacity-60"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
