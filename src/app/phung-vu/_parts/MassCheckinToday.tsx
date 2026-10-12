"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Church, Moon, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/duty-format";
import { vnToday } from "@/lib/vn-time";
import { useLiturgyDay, useLiturgyRange } from "@/lib/data/liturgy-calendar";
import type { CalendarDayDto } from "@/lib/types/liturgy";
import { CheckinBox } from "@/app/lich-su-kien/_components/LiturgyDayPanel";
import MassCheckinModal from "@/app/lich-su-kien/_components/MassCheckinModal";
import { LIT_COLOR, checkinStatusText, dm, dmy } from "@/app/lich-su-kien/_components/liturgy-style";

const WEEKDAY = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Ngày cần check-in "lúc này": hôm nay → ngày mai (lễ vọng) → ngày đã qua còn hạn mà chưa check-in hợp lệ → ngày bắt buộc kế tiếp. */
function pickDays(days: CalendarDayDto[], today: string) {
  const req = days.filter((d) => d.requirement);
  const needs = (d: CalendarDayDto) => !d.myCheckin || d.myCheckin.status === "rejected";
  const todayDay = req.find((d) => d.date === today);
  const tomorrow = req.find((d) => d.date === addDays(today, 1));
  const openPast = req.filter((d) => d.date < today && d.requirement!.deadline >= today && needs(d)).sort((a, b) => b.date.localeCompare(a.date));
  const next = req.find((d) => d.date > today);
  const primary = todayDay ?? openPast[0] ?? tomorrow ?? null;
  const others = [...openPast, ...(tomorrow && primary !== tomorrow ? [tomorrow] : [])].filter((d) => d !== primary);
  return { primary, others, next: primary ? null : next ?? null, isVigil: !!primary && primary === tomorrow };
}

interface Props {
  /** compact = chỉ hiện khi có việc cần làm (dùng ở tab chính của trang Phụng vụ) */
  compact?: boolean;
}

/** Thẻ "Check-in đi lễ hôm nay" ở trang Phụng vụ: thành viên check-in ngay tại đây (không phải sang Lịch); người duyệt thấy luôn tình hình cả nhà. */
export default function MassCheckinToday({ compact = false }: Props) {
  const clientToday = useMemo(() => vnToday(), []);
  const { range } = useLiturgyRange(addDays(clientToday, -7), addDays(clientToday, 14));
  const today = range?.today ?? clientToday;
  const picked = useMemo(() => pickDays(range?.days ?? [], today), [range, today]);
  const [chosen, setChosen] = useState<string | null>(null);
  const date = chosen ?? picked.primary?.date ?? null;
  const { day } = useLiturgyDay(date);
  const [open, setOpen] = useState(false);

  if (!range) return compact ? null : <div className="h-40 rounded-3xl bg-white border border-purple-50 animate-pulse" />;
  if (compact && !picked.primary) return null;

  if (!picked.primary || !date) {
    const n = picked.next;
    return (
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Church className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">Hôm nay không có lễ bắt buộc check-in</p>
          <p className="text-[11px] text-gray-500">
            {n
              ? `Lễ bắt buộc kế tiếp: ${WEEKDAY[n.weekday]} ${dmy(n.date)} · ${n.requirement!.label}${n.requirement!.evidenceRequired ? " (cần ảnh minh chứng)" : ""}. Check-in mở từ chiều hôm trước (lễ vọng).`
              : "Bạn đã check-in đủ các ngày lễ còn hạn."}
          </p>
        </div>
      </div>
    );
  }

  const shown = range.days.find((d) => d.date === date) ?? picked.primary;
  const color = LIT_COLOR[shown.color];
  const isVigil = !chosen && picked.isVigil;

  return (
    <div className="bg-white rounded-3xl border border-amber-200 shadow-xs overflow-hidden">
      <div className={cn("h-1.5 w-full", color.bar)} />
      <div className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider inline-flex items-center gap-1.5">
              <Church className="w-3.5 h-3.5" /> Check-in đi lễ {shown.date === today ? "hôm nay" : isVigil ? "· lễ vọng" : "· còn hạn"}
            </span>
            <h3 className="text-base font-black text-gray-900 leading-snug">
              {shown.isPatron && <Star className="inline w-4 h-4 -mt-0.5 mr-1 fill-amber-400 text-amber-500" />}
              {shown.special[0] ? `${shown.special[0].title} · ` : ""}
              {shown.title}
            </h3>
            <p className="text-[11px] text-gray-500 inline-flex flex-wrap items-center gap-x-1.5">
              <span>
                {WEEKDAY[shown.weekday]} {dmy(shown.date)}
              </span>
              <span>· {shown.rankLabel}</span>
              <span className="inline-flex items-center gap-1">
                · <Moon className="w-3 h-3" /> {shown.lunarLabel}
              </span>
            </p>
            {isVigil && <p className="text-[11px] text-amber-800 mt-0.5">Lễ vọng: anh em dự Thánh lễ chiều nay có thể check-in luôn.</p>}
          </div>
          <Link href={`/lich-su-kien?date=${shown.date}`} className="shrink-0 self-start text-[11px] font-bold text-primary hover:underline">
            Lời Chúa & ý lễ →
          </Link>
        </div>

        {day ? <CheckinBox d={day} onOpen={() => setOpen(true)} /> : <div className="h-24 rounded-2xl bg-amber-50/60 border border-amber-100 animate-pulse" />}

        {picked.others.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-gray-500 inline-flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" /> Ngày khác còn hạn check-in
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[picked.primary, ...picked.others].map((d) => (
                <button
                  key={d.date}
                  onClick={() => setChosen(d.date === picked.primary!.date ? null : d.date)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition",
                    d.date === date ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-200 hover:border-amber-300"
                  )}
                >
                  {dm(d.date)} · {d.requirement!.label}
                  {d.myCheckin ? ` · ${checkinStatusText(d.myCheckin)}` : d.date < today ? ` · hạn ${dm(d.requirement!.deadline)}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {open && day?.requirement && <MassCheckinModal day={day} onClose={() => setOpen(false)} />}
    </div>
  );
}
