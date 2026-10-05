"use client";

import React from "react";
import { BellRing, Church, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpcomingFeastDto } from "@/lib/types/liturgy";
import { dm } from "./liturgy-style";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const when = (n: number) => (n === 0 ? "Hôm nay" : n === 1 ? "Ngày mai" : `Còn ${n} ngày`);

/** Dải nhắc lễ trọng / Tết / lễ Bổn mạng / ngày đặc biệt sắp tới (14 ngày) — bấm để mở ngày trên lịch. */
export default function UpcomingFeastsBanner({ items, onPick }: { items: UpcomingFeastDto[]; onPick: (iso: string) => void }) {
  const soon = items.filter((i) => i.daysLeft <= 14).slice(0, 4);
  if (!soon.length) return null;
  return (
    <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-white p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-900 shrink-0">
        <BellRing className="w-4 h-4" /> Sắp đến
      </span>
      <div className="flex gap-2 overflow-x-auto custom-scroll pb-1 sm:pb-0">
        {soon.map((u) => (
          <button
            key={`${u.date}-${u.title}`}
            onClick={() => onPick(u.date)}
            className={cn(
              "shrink-0 text-left px-3 py-2 rounded-2xl border bg-white hover:shadow-xs transition max-w-[16rem]",
              u.kind === "patron" ? "border-amber-400 ring-1 ring-amber-200" : "border-amber-200"
            )}
          >
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
              {u.kind === "patron" && <Star className="w-3 h-3 fill-amber-400 text-amber-500" />}
              {when(u.daysLeft)} · {WEEKDAY[new Date(`${u.date}T00:00:00Z`).getUTCDay()]} {dm(u.date)}
              {u.requiresCheckin && <Church className="w-3 h-3 ml-0.5" aria-label="Cần check-in đi lễ" />}
            </span>
            <span className="block text-xs font-bold text-gray-900 truncate">{u.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
