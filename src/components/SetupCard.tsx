"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Rocket, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { useSetupStatus } from "@/lib/data/setup";

const DISMISS_KEY = "luuxa-setup-dismissed";

/** Thẻ nhắc "Bắt đầu thiết lập" trên Tổng quan cho Admin/Trưởng nhà — chỉ hiện khi còn việc bắt buộc chưa xong. */
export default function SetupCard() {
  const { can } = useSession();
  const allowed = can(["setting.write", "member.create"]);
  const { setup } = useSetupStatus(allowed);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!allowed || !setup || dismissed || setup.requiredDone >= setup.requiredCount) return null;
  const pct = Math.round((setup.requiredDone / setup.requiredCount) * 100);
  const next = setup.items.find((i) => !i.done && !i.optional);

  return (
    <div className="relative rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/80 to-indigo-50/60 p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-300/40">
        <Rocket className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-extrabold text-gray-900">Hoàn tất thiết lập hệ thống — {setup.requiredDone}/{setup.requiredCount} việc</p>
        <p className="text-xs text-gray-600 mt-0.5">{next ? `Việc tiếp theo: ${next.title}` : "Gần xong rồi!"}</p>
        <div className="h-1.5 mt-2.5 rounded-full bg-white/70 overflow-hidden max-w-sm" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Link href="/khoi-tao" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-300/40 transition active:scale-95">
        Xem danh sách <ArrowRight className="w-3.5 h-3.5" />
      </Link>
      <button
        type="button"
        aria-label="Ẩn nhắc nhở"
        title="Ẩn trong phiên này"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* không sao */
          }
          setDismissed(true);
        }}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:bg-white/70"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
