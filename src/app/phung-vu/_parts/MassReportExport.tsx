"use client";

import React, { useMemo, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { addDays } from "@/lib/duty-format";
import { vnToday } from "@/lib/vn-time";
import { liturgyCalendarApi } from "@/lib/data/liturgy-calendar";
import { useOrgSettings } from "@/lib/data/settings";
import { CustomDateRangePicker } from "@/components/ui/FormControls";

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (iso: string, back = 0) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 - back, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
};
const monthEnd = (iso: string, back = 0) => addDays(monthStart(iso, back - 1), -1);
const MAX_DAYS = 366;

/** Xuất Excel BÁO CÁO ĐI LỄ theo khoảng ngày (thành viên × ngày lễ bắt buộc) — người duyệt check-in. */
export default function MassReportExport() {
  const { showToast } = useApp();
  const { org } = useOrgSettings();
  const today = useMemo(() => vnToday(), []);
  const presets = useMemo(
    () => [
      { key: "this", label: "Tháng này", from: monthStart(today), to: today },
      { key: "last", label: "Tháng trước", from: monthStart(today, 1), to: monthEnd(today, 1) },
      { key: "3m", label: "3 tháng gần đây", from: monthStart(today, 2), to: today },
      { key: "year", label: `Năm ${today.slice(0, 4)}`, from: `${today.slice(0, 4)}-01-01`, to: today },
    ],
    [today]
  );
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [busy, setBusy] = useState(false);
  const span = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  const invalid = !from || !to ? "Chọn đủ từ ngày và đến ngày." : to < from ? "Đến ngày phải sau từ ngày." : span > MAX_DAYS ? `Tối đa ${MAX_DAYS} ngày mỗi lần.` : null;

  const download = async () => {
    if (invalid) return showToast("error", invalid);
    setBusy(true);
    try {
      const r = await liturgyCalendarApi.report(from, to);
      if (!r.days.length) {
        showToast("info", "Khoảng ngày này chưa có ngày lễ bắt buộc nào đã qua.");
        return;
      }
      await (await import("@/lib/export/mass-report-xlsx")).downloadMassReportXlsx(r, org.houseName || null);
      showToast("success", `Đã tải báo cáo đi lễ ${r.days.length} ngày lễ · ${r.members.length} thành viên.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-black text-gray-900">Xuất Excel báo cáo đi lễ</h3>
          <p className="text-[11px] text-gray-500">Bảng thành viên × ngày lễ bắt buộc (đã xác nhận / chờ duyệt / vắng) kèm tổng hợp từng người và từng ngày.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[11px] font-bold border transition",
              from === p.from && to === p.to ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
        <CustomDateRangePicker
          label="Khoảng ngày"
          startDate={from}
          endDate={to}
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
          className="flex-1 sm:min-w-[16rem]"
        />
        <button
          onClick={download}
          disabled={busy || !!invalid}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Tải Excel
        </button>
      </div>
      {invalid && from && to && <p className="text-[11px] text-rose-600">{invalid}</p>}
    </div>
  );
}
