"use client";

import React from "react";
import { CalendarClock } from "lucide-react";
import { CustomDatePicker, CustomSelect, CustomToggle } from "@/components/ui/FormControls";
import { fromVnParts, halfHourOptions, toVnParts, vnToday } from "@/lib/vn-time";

const TIMES = halfHourOptions(5, 22);

/** Chọn thời điểm hẹn đăng. `value` là ISO hoặc null (đăng ngay). */
export function SchedulePicker({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  const on = value !== null;
  const parts = value ? toVnParts(value) : null;

  const turnOn = () => {
    // Mặc định: 8:00 sáng ngày mai
    onChange(fromVnParts(vnToday(1), "08:00"));
  };

  return (
    <div className="space-y-3">
      <CustomToggle checked={on} onChange={(v) => (v ? turnOn() : onChange(null))} label="Hẹn giờ đăng" description="Bài tự hiện công khai vào giờ đã chọn" />
      {parts && (
        <div className="grid grid-cols-2 gap-2.5">
          <CustomDatePicker value={parts.date} format="YYYY-MM-DD" onChange={(d) => d && onChange(fromVnParts(d, parts.time))} />
          <CustomSelect value={TIMES.some((t) => t.value === parts.time) ? parts.time : "08:00"} onChange={(t) => onChange(fromVnParts(parts.date, t))} options={TIMES} />
        </div>
      )}
      {parts && new Date(value!).getTime() <= Date.now() && (
        <p className="text-[11px] text-amber-600 flex items-start gap-1.5"><CalendarClock className="w-3.5 h-3.5 shrink-0 mt-px" />Thời điểm này đã qua — bài sẽ đăng ngay khi bạn bấm đăng.</p>
      )}
    </div>
  );
}
