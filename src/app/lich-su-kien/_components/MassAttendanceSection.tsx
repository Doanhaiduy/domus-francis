"use client";

import React, { useMemo, useState } from "react";
import { Church, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMassReport } from "@/lib/data/liturgy-calendar";
import type { CalendarMonthDto } from "@/lib/types/liturgy";
import { CHECKIN_STATUS_CLASS, CHECKIN_STATUS_LABEL, dm } from "./liturgy-style";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

interface Props {
  month: CalendarMonthDto | undefined;
  canManage: boolean;
  onPickDay: (iso: string) => void;
}

/** Tab Điểm danh → "Đi lễ": các ngày phải check-in trong tháng + trạng thái của tôi; người quản lý xem tổng hợp cả nhà. */
export default function MassAttendanceSection({ month, canManage, onPickDay }: Props) {
  const days = useMemo(() => (month?.days ?? []).filter((d) => d.requirement), [month]);
  const [showReport, setShowReport] = useState(false);
  const { report, isLoading } = useMassReport(month?.from ?? "", month?.to ?? "", canManage && showReport && !!month);
  const today = month?.today ?? "";
  const past = days.filter((d) => d.date <= today);
  const done = past.filter((d) => d.myCheckin && d.myCheckin.status !== "rejected").length;

  if (!month) return null;
  return (
    <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Church className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-gray-900">Check-in đi lễ trong tháng</h3>
            <p className="text-[11px] text-gray-500">
              Chúa Nhật check-in không cần ảnh; lễ trọng, lễ Bổn mạng và ngày đặc biệt của nhà cần ảnh minh chứng · Bạn: {done}/{past.length} ngày đã qua
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowReport((v) => !v)}
            className={cn("px-3.5 py-2 rounded-xl text-xs font-bold border transition", showReport ? "bg-primary text-white border-primary" : "bg-purple-50 text-primary border-purple-200 hover:bg-purple-100")}
          >
            {showReport ? "Ẩn tổng hợp cả nhà" : "Tổng hợp cả nhà"}
          </button>
        )}
      </div>

      {days.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">Tháng này không có ngày bắt buộc check-in đi lễ.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {days.map((d) => {
            const mine = d.myCheckin;
            const overdue = !mine && d.requirement && today > d.requirement.deadline;
            return (
              <button
                key={d.date}
                onClick={() => onPickDay(d.date)}
                className={cn(
                  "p-3 rounded-2xl border text-left flex flex-col gap-1 transition hover:shadow-xs",
                  d.isSolemnity || d.isPatron ? "bg-amber-50/70 border-amber-200" : "bg-surface-container-low/40 border-gray-100"
                )}
              >
                <span className="text-[10px] font-bold text-gray-500 inline-flex items-center gap-1">
                  {d.isPatron && <Star className="w-3 h-3 fill-amber-400 text-amber-500" />}
                  {WEEKDAY[d.weekday]} {dm(d.date)} · {d.requirement!.label}
                </span>
                <span className="text-xs font-bold text-gray-900 line-clamp-2">{d.title}</span>
                {mine ? (
                  <span className={cn("self-start px-1.5 py-0.5 rounded-md border text-[9px] font-bold", CHECKIN_STATUS_CLASS[mine.status])}>{CHECKIN_STATUS_LABEL[mine.status]}</span>
                ) : (
                  <span className={cn("self-start px-1.5 py-0.5 rounded-md text-[9px] font-bold", overdue ? "bg-rose-50 text-rose-600" : d.date > today ? "bg-gray-50 text-gray-500" : "bg-amber-100 text-amber-800")}>
                    {overdue ? "Đã quá hạn" : d.date > today ? "Sắp tới" : "Chưa check-in"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {canManage && showReport && (
        <div className="border-t border-gray-100 pt-4">
          {isLoading || !report ? (
            <div className="h-24 rounded-2xl bg-gray-50 animate-pulse" />
          ) : report.days.length === 0 ? (
            <p className="text-xs text-gray-500">Chưa có ngày bắt buộc nào đã qua trong tháng.</p>
          ) : (
            <div className="overflow-x-auto custom-scroll">
              <table className="w-full text-[11px] border-separate border-spacing-0">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left font-bold p-2 sticky left-0 bg-white">Thành viên</th>
                    {report.days.map((d) => (
                      <th key={d.date} className="font-bold p-2 text-center whitespace-nowrap" title={d.title}>
                        {dm(d.date)}
                        <span className="block text-[9px] font-medium text-gray-400">
                          {d.checkedIn}/{d.expected}
                        </span>
                      </th>
                    ))}
                    <th className="font-bold p-2 text-center">Đã đi</th>
                  </tr>
                </thead>
                <tbody>
                  {report.members.map((m) => (
                    <tr key={m.memberId} className="border-t border-gray-50">
                      <td className="p-2 font-semibold text-gray-900 whitespace-nowrap sticky left-0 bg-white">
                        {m.name}
                        {m.room ? <span className="text-gray-400 font-medium"> · {m.room}</span> : null}
                      </td>
                      {report.days.map((d) => (
                        <td key={d.date} className="p-2 text-center">
                          {m.missing.includes(d.date) ? <span className="text-rose-500 font-black">✗</span> : <span className="text-emerald-600 font-black">✓</span>}
                        </td>
                      ))}
                      <td className={cn("p-2 text-center font-bold", m.attended < m.required ? "text-rose-600" : "text-emerald-700")}>
                        {m.attended}/{m.required}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
