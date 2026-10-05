"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { BookOpen, Church, Moon, Star } from "lucide-react";
import { swrFetcher } from "@/lib/api";
import { cn } from "@/lib/utils";
import { vnTodayIso } from "@/lib/events-format";
import { useUpcomingFeasts } from "@/lib/data/liturgy-calendar";
import type { CalendarMonthDto } from "@/lib/types/liturgy";
import { CHECKIN_STATUS_LABEL, LIT_COLOR, dm } from "@/app/lich-su-kien/_components/liturgy-style";

/** Trang Tổng quan: phụng vụ hôm nay (tên lễ, màu áo lễ, âm lịch, Tin Mừng, check-in đi lễ) + lễ lớn sắp tới. */
export default function LiturgyTodayCard() {
  const today = vnTodayIso();
  const { data } = useSWR<CalendarMonthDto>(`/api/v1/liturgy/calendar?from=${today}&to=${today}`, swrFetcher, { revalidateOnFocus: false });
  const upcoming = useUpcomingFeasts(30).filter((u) => u.daysLeft > 0).slice(0, 2);
  const d = data?.days[0];
  if (!d) return null;
  const color = LIT_COLOR[d.color];
  const special = d.isPatron || d.special.length > 0 || d.isSolemnity || d.tet > 0;
  return (
    <div className={cn("rounded-2xl border shadow-xs overflow-hidden flex", special ? "bg-gradient-to-r from-amber-50 to-white border-amber-200" : "bg-white border-purple-50")}>
      <div className={cn("w-1.5 shrink-0", color.bar)} />
      <div className="flex-1 min-w-0 p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <Link href={`/lich-su-kien?date=${today}`} className="min-w-0 flex-1 group">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1.5">
            Phụng vụ hôm nay
            <span className="text-gray-400 font-semibold normal-case tracking-normal inline-flex items-center gap-1">
              <Moon className="w-3 h-3" /> {d.lunarLabel}
            </span>
          </span>
          <p className="text-sm font-black text-gray-900 group-hover:text-primary transition truncate">
            {d.isPatron && <Star className="inline w-3.5 h-3.5 -mt-0.5 mr-1 fill-amber-400 text-amber-500" />}
            {d.isPatron ? "Lễ Bổn mạng của nhà · " : ""}
            {d.special[0] ? `${d.special[0].title} · ` : ""}
            {d.title}
          </p>
          <p className="text-[11px] text-gray-500 truncate">
            {d.rankLabel} · áo lễ {color.label.toLowerCase()}
            {d.gospelRef ? (
              <>
                {" "}
                · <BookOpen className="inline w-3 h-3 -mt-0.5" /> Tin Mừng {d.gospelRef}
              </>
            ) : null}
          </p>
        </Link>
        {d.requirement && (
          <Link
            href={`/lich-su-kien?date=${today}`}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border",
              d.myCheckin ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
            )}
          >
            <Church className="w-4 h-4" />
            {d.myCheckin ? CHECKIN_STATUS_LABEL[d.myCheckin.status] : `Check-in đi lễ (${d.requirement.label})`}
          </Link>
        )}
        {upcoming.length > 0 && (
          <div className="shrink-0 flex flex-col gap-0.5 text-[11px] text-gray-600 md:border-l md:border-gray-100 md:pl-5">
            {upcoming.map((u) => (
              <Link key={`${u.date}-${u.title}`} href={`/lich-su-kien?date=${u.date}`} className="hover:text-primary truncate max-w-[18rem]">
                <b className="text-amber-700">{dm(u.date)}</b> · {u.title} <span className="text-gray-400">(còn {u.daysLeft} ngày)</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
