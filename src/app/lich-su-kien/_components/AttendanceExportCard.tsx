"use client";

import React, { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { CustomDatePicker } from "@/components/ui/FormControls";
import { daysBetween, toIsoDate } from "@/lib/events-format";
import { eventsApi } from "@/lib/data/events";

interface Props {
  /** Tháng đang xem trên lịch (0–11) — khoảng mặc định là cả tháng đó */
  year: number;
  month: number;
  /** Người xem toàn bộ điểm danh (false = chỉ các sự kiện mình phụ trách) */
  readAll: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (y: number, m: number, d: number) => `${pad(d)}/${pad(m + 1)}/${y}`;

/** Xuất Excel bảng điểm danh nhiều sự kiện (thành viên × sự kiện) trong khoảng ngày. */
export default function AttendanceExportCard({ year, month, readAll }: Props) {
  const { showToast } = useApp();
  const [from, setFrom] = useState(dmy(year, month, 1));
  const [to, setTo] = useState(dmy(year, month, new Date(year, month + 1, 0).getDate()));
  const [busy, setBusy] = useState(false);

  // Đổi tháng trên lịch ⇒ khoảng mặc định theo tháng đó
  useEffect(() => {
    setFrom(dmy(year, month, 1));
    setTo(dmy(year, month, new Date(year, month + 1, 0).getDate()));
  }, [year, month]);

  const run = async () => {
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (!f || !t) return showToast("error", "Chọn đủ ngày bắt đầu và ngày kết thúc.");
    if (t < f) return showToast("error", "Ngày kết thúc phải sau ngày bắt đầu.");
    if (daysBetween(f, t) > 366) return showToast("error", "Khoảng ngày tối đa 1 năm.");
    setBusy(true);
    try {
      const r = await eventsApi.attendanceReport(f, t);
      if (!r.events.length) {
        showToast("info", "Không có sự kiện bật điểm danh nào đã diễn ra trong khoảng này.");
        return;
      }
      const { downloadAttendanceReportXlsx } = await import("./attendance-xlsx");
      await downloadAttendanceReportXlsx(r);
      showToast("success", `Đã xuất bảng điểm danh ${r.events.length} sự kiện × ${r.members.length} thành viên.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-emerald-100 shadow-xs flex flex-col xl:flex-row xl:items-end gap-4">
      <div className="flex items-start gap-3 xl:flex-1 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-gray-900">Xuất Excel điểm danh</h3>
          <p className="text-[11px] text-gray-500 leading-snug">
            Bảng thành viên × sự kiện (có mặt / đi muộn / vắng có phép / vắng) kèm tổng và tỉ lệ có mặt
            {readAll ? "." : " — chỉ các sự kiện bạn phụ trách điểm danh."}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:w-[22rem]">
        <CustomDatePicker label="Từ ngày" value={from} onChange={setFrom} />
        <CustomDatePicker label="Đến ngày" value={to} onChange={setTo} />
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-60 shrink-0"
      >
        <FileSpreadsheet className="w-4 h-4" />
        {busy ? "Đang xuất…" : "Xuất Excel"}
      </button>
    </div>
  );
}
