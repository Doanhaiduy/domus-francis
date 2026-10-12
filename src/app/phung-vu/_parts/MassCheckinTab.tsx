"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { vnToday } from "@/lib/vn-time";
import { useLiturgyDay, useLiturgyMonth } from "@/lib/data/liturgy-calendar";
import type { CalendarDayDetailDto } from "@/lib/types/liturgy";
import MassAttendanceSection from "@/app/lich-su-kien/_components/MassAttendanceSection";
import MassCheckinModal from "@/app/lich-su-kien/_components/MassCheckinModal";
import { CheckinBox } from "@/app/lich-su-kien/_components/LiturgyDayPanel";
import { dmy } from "@/app/lich-su-kien/_components/liturgy-style";
import MassCheckinToday from "./MassCheckinToday";
import MassPendingQueue from "./MassPendingQueue";
import MassReportExport from "./MassReportExport";

const MONTH = (m: number, y: number) => `Tháng ${m + 1}/${y}`;

/**
 * Tab "Check-in đi lễ" của trang Phụng vụ: thẻ check-in hôm nay, các ngày bắt buộc trong tháng (bấm một ngày để check-in / xem trạng thái),
 * và — cho người duyệt (liturgy.calendar.manage) — hàng đợi chờ duyệt nhiều ngày + xuất Excel báo cáo đi lễ.
 */
export default function MassCheckinTab({ canManage }: { canManage: boolean }) {
  const today = useMemo(() => vnToday(), []);
  const [ym, setYm] = useState({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 });
  const { month } = useLiturgyMonth(ym.y, ym.m);
  const [pick, setPick] = useState<string | null>(null);
  const [checkinDay, setCheckinDay] = useState<CalendarDayDetailDto | null>(null);
  const go = (delta: number) => {
    const d = new Date(Date.UTC(ym.y, ym.m + delta, 1));
    setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className={canManage ? "xl:col-span-7 flex flex-col gap-5" : "xl:col-span-12 flex flex-col gap-5"}>
          <MassCheckinToday />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-500">Các ngày bắt buộc check-in</span>
              <div className="flex items-center gap-1">
                <button onClick={() => go(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Tháng trước">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-gray-800 min-w-[6.5rem] text-center">{MONTH(ym.m, ym.y)}</span>
                <button onClick={() => go(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Tháng sau">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {month ? <MassAttendanceSection month={month} canManage={canManage} onPickDay={setPick} /> : <div className="h-40 rounded-3xl bg-white border border-purple-50 animate-pulse" />}
          </div>
        </div>
        {canManage && (
          <div className="xl:col-span-5 flex flex-col gap-5">
            <MassPendingQueue />
            <MassReportExport />
          </div>
        )}
      </div>

      {pick && (
        <DayCheckinDialog
          date={pick}
          onClose={() => setPick(null)}
          onCheckin={(d) => {
            setPick(null);
            setCheckinDay(d);
          }}
        />
      )}
      {checkinDay?.requirement && <MassCheckinModal day={checkinDay} onClose={() => setCheckinDay(null)} />}
    </div>
  );
}

/** Hộp thoại một ngày lễ: trạng thái check-in của tôi (+ danh sách cả nhà với người duyệt) — mở từ danh sách ngày trong tháng. */
function DayCheckinDialog({ date, onClose, onCheckin }: { date: string; onClose: () => void; onCheckin: (d: CalendarDayDetailDto) => void }) {
  const { day } = useLiturgyDay(date);
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-purple-50 flex flex-col gap-4 my-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Check-in đi lễ · {dmy(date)}</span>
                <h3 className="text-sm font-black text-gray-900 leading-snug">{day?.title ?? "Đang tải…"}</h3>
              </div>
              <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500" title="Đóng" aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>
            {day ? (
              day.requirement ? (
                <CheckinBox d={day} onOpen={() => onCheckin(day)} />
              ) : (
                <p className="text-xs text-gray-500">Ngày này không bắt buộc check-in đi lễ.</p>
              )
            ) : (
              <div className="h-28 rounded-2xl bg-amber-50/60 border border-amber-100 animate-pulse" />
            )}
            <Link href={`/lich-su-kien?date=${date}`} className="self-start text-[11px] font-bold text-primary hover:underline">
              Xem Lời Chúa, ý lễ ngày này trên Lịch →
            </Link>
          </div>
        </div>
      </div>
    </Portal>
  );
}
