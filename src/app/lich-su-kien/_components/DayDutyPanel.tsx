"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDayDuties } from "@/lib/data/events";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const PHASE: Record<string, { label: string; cls: string }> = {
  current: { label: "Tuần này", cls: "bg-emerald-100 text-emerald-700" },
  upcoming: { label: "Sắp tới", cls: "bg-sky-100 text-sky-700" },
  past: { label: "Đã qua", cls: "bg-gray-100 text-gray-500" },
};

/** Panel ngày: ai trực vệ sinh sân nhà trong TUẦN chứa ngày đang xem (duty_weeks), ghi chú và kết quả đánh giá nếu có. */
export default function DayDutyPanel({ date }: { date: string }) {
  const { duty, isLoading } = useDayDuties(date);
  const phase = duty ? PHASE[duty.phase] : null;

  return (
    <div className={cn("p-4 rounded-2xl border", duty?.isMine && duty.phase !== "past" ? "bg-emerald-50/60 border-emerald-200" : "bg-surface-container-low/60 border-purple-50")}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold text-gray-800">🧹 Trực vệ sinh sân nhà</span>
        {duty && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-bold text-gray-500 tabular-nums">
              {dm(duty.weekStart)} – {dm(duty.weekEnd)}
            </span>
            {phase && <span className={cn("px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase", phase.cls)}>{phase.label}</span>}
          </span>
        )}
      </div>

      {isLoading && !duty ? (
        <p className="text-[11px] text-gray-400">Đang tải…</p>
      ) : duty && duty.members.length > 0 ? (
        <div className="space-y-2">
          {duty.isMine && duty.phase !== "past" && (
            <p className="text-[11px] font-bold text-emerald-800">
              {duty.phase === "current" ? "Tuần này bạn trực vệ sinh sân nhà." : "Bạn được xếp trực tuần này."}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {duty.members.map((m) => (
              <span
                key={m.id}
                className={cn(
                  "inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs font-bold",
                  m.isMe ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-800 border-gray-100"
                )}
                title={m.fullName}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                    m.isMe ? "bg-white/25 text-white" : "bg-purple-100 text-primary"
                  )}
                >
                  {m.name.charAt(0)}
                </span>
                {m.isMe ? `${m.name} (bạn)` : m.name}
                {m.room && <span className={cn("text-[10px] font-medium", m.isMe ? "text-white/80" : "text-gray-400")}>· {m.room}</span>}
              </span>
            ))}
          </div>
          {duty.note && <p className="text-[11px] text-gray-600">📝 {duty.note}</p>}
          {duty.review && (
            <div className="p-2.5 rounded-xl bg-white border border-gray-100 space-y-1">
              <p className="text-[11px] text-gray-700 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                Đánh giá: <b className="text-gray-900">{duty.review.score}/10</b>
                {duty.review.comment ? <span className="text-gray-500"> — {duty.review.comment}</span> : null}
              </p>
              {duty.review.redoRequired && (
                <p className="text-[11px] font-bold text-rose-600 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Phải trực lại{duty.review.redoNote ? `: ${duty.review.redoNote}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">Tuần này chưa xếp người trực vệ sinh sân nhà.</p>
      )}

      <Link href="/hau-can?tab=truc-nhat" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
        Xem lịch trực các tuần <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
