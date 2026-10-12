"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Church, FileSpreadsheet, Inbox, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { liturgyCalendarApi, useMassReport, usePendingCheckins } from "@/lib/data/liturgy-calendar";
import { useOrgSettings } from "@/lib/data/settings";
import type { CalendarMonthDto, MassReportCell } from "@/lib/types/liturgy";
import { CHECKIN_STATUS_CLASS, checkinStatusText, dm } from "./liturgy-style";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const CELL_MARK: Record<MassReportCell, { text: string; cls: string; title: string }> = {
  approved: { text: "✓", cls: "text-emerald-600", title: "Đã xác nhận" },
  submitted: { text: "⏳", cls: "text-amber-600", title: "Chờ duyệt" },
  rejected: { text: "✗", cls: "text-rose-500", title: "Check-in chưa hợp lệ" },
  none: { text: "✗", cls: "text-rose-500", title: "Vắng (quá hạn chưa check-in)" },
  open: { text: "…", cls: "text-gray-400", title: "Còn hạn check-in" },
  na: { text: "", cls: "", title: "Chưa ở nhà / đã rời nhà" },
};

interface Props {
  month: CalendarMonthDto | undefined;
  canManage: boolean;
  onPickDay: (iso: string) => void;
}

/** Tab Điểm danh → "Đi lễ": các ngày phải check-in trong tháng + trạng thái của tôi; người quản lý xem tổng hợp cả nhà, tải Excel, mở hàng đợi chờ duyệt. */
export default function MassAttendanceSection({ month, canManage, onPickDay }: Props) {
  const { showToast } = useApp();
  const { org } = useOrgSettings();
  const days = useMemo(() => (month?.days ?? []).filter((d) => d.requirement), [month]);
  const [showReport, setShowReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { report, isLoading } = useMassReport(month?.from ?? "", month?.to ?? "", canManage && showReport && !!month);
  const { pending } = usePendingCheckins(canManage);
  const today = month?.today ?? "";
  const past = days.filter((d) => d.date <= today);
  const done = past.filter((d) => d.myCheckin && d.myCheckin.status !== "rejected").length;

  const exportXlsx = async () => {
    if (!month) return;
    setExporting(true);
    try {
      const r = await liturgyCalendarApi.report(month.from, month.to);
      await (await import("@/lib/export/mass-report-xlsx")).downloadMassReportXlsx(r, org?.houseName ?? null);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  if (!month) return null;
  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Church className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-black text-gray-900">Check-in đi lễ trong tháng</h3>
            <p className="text-[11px] text-gray-500">
              Chúa Nhật check-in không cần ảnh; lễ trọng, lễ Bổn mạng và ngày đặc biệt của nhà cần ảnh minh chứng · Bạn: {done}/{past.length} ngày đã qua
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowReport((v) => !v)}
              className={cn("px-3.5 py-2 rounded-xl text-xs font-bold border transition", showReport ? "bg-primary text-white border-primary" : "bg-purple-50 text-primary border-purple-200 hover:bg-purple-100")}
            >
              {showReport ? "Ẩn tổng hợp cả nhà" : "Tổng hợp cả nhà"}
            </button>
            <button
              onClick={exportXlsx}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-60"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Tải Excel tháng
            </button>
          </div>
        )}
      </div>

      {canManage && pending && pending.total > 0 && (
        <Link
          href="/phung-vu?tab=checkin"
          className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 hover:bg-sky-100 transition"
        >
          <span className="inline-flex items-center gap-2 text-xs font-bold">
            <Inbox className="w-4 h-4 shrink-0" /> {pending.total} check-in đi lễ đang chờ duyệt (mọi ngày)
          </span>
          <span className="text-[11px] font-bold shrink-0">Mở hàng đợi →</span>
        </Link>
      )}

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
                  <span className={cn("self-start px-1.5 py-0.5 rounded-md border text-[9px] font-bold", CHECKIN_STATUS_CLASS[mine.status])}>{checkinStatusText(mine)}</span>
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
        <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
          {isLoading || !report ? (
            <div className="h-24 rounded-2xl bg-gray-50 animate-pulse" />
          ) : report.days.length === 0 ? (
            <p className="text-xs text-gray-500">Chưa có ngày bắt buộc nào đã qua trong tháng.</p>
          ) : (
            <>
              <p className="text-[10px] text-gray-500">✓ đã xác nhận · ⏳ chờ duyệt · ✗ vắng / chưa hợp lệ · … còn hạn check-in · ô trống = chưa ở nhà</p>
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
                        {report.days.map((d, i) => {
                          const c = CELL_MARK[m.cells[i] ?? "na"];
                          return (
                            <td key={d.date} className={cn("p-2 text-center font-black", c.cls, m.cells[i] === "na" && "bg-gray-50")} title={c.title}>
                              {c.text}
                            </td>
                          );
                        })}
                        <td className={cn("p-2 text-center font-bold", m.missed > 0 ? "text-rose-600" : "text-emerald-700")}>
                          {m.attended}/{m.required}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
