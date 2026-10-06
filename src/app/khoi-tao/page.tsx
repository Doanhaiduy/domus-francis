"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { useSession } from "@/lib/session";
import { SETUP_GROUPS, useSetupStatus, type SetupItem } from "@/lib/data/setup";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const { can, isLoading } = useSession();
  const allowed = can(["setting.write", "member.create"]);
  const { setup } = useSetupStatus(allowed);

  if (!isLoading && !allowed) {
    return <div className="max-w-md mx-auto mt-16 text-center text-sm text-gray-600">Chỉ Admin hoặc Trưởng nhà xem được trang thiết lập.</div>;
  }
  if (!setup) {
    return <div className="max-w-3xl space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer-box h-20 rounded-2xl" />)}</div>;
  }

  const pct = setup.requiredCount ? Math.round((setup.requiredDone / setup.requiredCount) * 100) : 100;
  const groups = (Object.keys(SETUP_GROUPS) as SetupItem["group"][]).map((g) => ({ g, items: setup.items.filter((i) => i.group === g) })).filter((x) => x.items.length);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
          <Rocket className="w-6 h-6 text-primary" /> Bắt đầu thiết lập
        </h1>
        <p className="text-sm text-gray-500 mt-1">Những việc nên làm để hệ thống sẵn sàng cho cả nhà dùng. Mỗi việc tự được đánh dấu xong khi dữ liệu đã có.</p>
      </div>

      <div className="bg-white border border-purple-100 rounded-2xl p-5">
        <div className="flex items-end justify-between gap-3 mb-2">
          <p className="text-sm font-bold text-gray-900">{setup.requiredDone}/{setup.requiredCount} việc cần làm đã xong</p>
          <p className="text-2xl font-extrabold text-primary">{pct}%</p>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-label="Tiến độ thiết lập" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#5f3add] to-[#7857f8] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {groups.map(({ g, items }) => (
        <section key={g} className="space-y-2.5" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="text-xs font-extrabold uppercase tracking-wider text-gray-400">{SETUP_GROUPS[g]}</h2>
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className={cn("group flex items-center gap-4 rounded-2xl border p-4 transition", it.done ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-purple-100 hover:border-purple-300 hover:shadow-sm")}
            >
              {it.done ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" aria-label="Đã xong" /> : <Circle className="w-6 h-6 text-gray-300 shrink-0" aria-label="Chưa xong" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 flex items-center gap-2">
                  {it.title}
                  {it.optional && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tùy chọn</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{it.description}</p>
                {it.detail && <p className={cn("text-[11px] mt-1 font-semibold", it.done ? "text-emerald-700" : "text-amber-700")}>{it.detail}</p>}
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
