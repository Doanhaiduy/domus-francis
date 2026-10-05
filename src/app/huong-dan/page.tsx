"use client";

import React, { useMemo, useState } from "react";
import { BookOpen, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { MiniMarkdown } from "@/components/ui/MiniMarkdown";
import { GUIDE_AUDIENCE_LABEL, GUIDE_INTRO, GUIDE_SECTIONS, type GuideAudience } from "@/content/guide";
import { cn } from "@/lib/utils";

const SYSTEM_ROLES = new Set(["admin", "house_head", "treasurer", "member"]);

/** Hướng dẫn sử dụng theo vai trò — mặc định chỉ hiện phần dành cho vai trò của người đang xem. */
export default function HuongDanPage() {
  const { session } = useSession();
  const [showAll, setShowAll] = useState(false);

  const mine = useMemo(() => {
    const set = new Set<GuideAudience>(["all"]);
    for (const r of session?.roles ?? []) {
      if (SYSTEM_ROLES.has(r)) set.add(r as GuideAudience);
      else set.add("custom");
    }
    if (!session?.roles?.length) set.add("member");
    return set;
  }, [session?.roles]);

  const sections = GUIDE_SECTIONS.filter((s) => showAll || s.audience.some((a) => mine.has(a)));
  const myLabels = [...mine].filter((a) => a !== "all").map((a) => GUIDE_AUDIENCE_LABEL[a]);

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto pb-10">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Hướng dẫn sử dụng</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {showAll ? "Đang xem hướng dẫn cho mọi vai trò." : `Dành cho bạn: ${myLabels.join(", ") || "Thành viên"}.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAll(false)}
          className={cn("px-3.5 py-2 rounded-xl text-xs font-bold transition", !showAll ? "bg-primary text-white" : "bg-surface-container-low text-gray-600 hover:bg-purple-50")}
        >
          Của tôi
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={cn("inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition", showAll ? "bg-primary text-white" : "bg-surface-container-low text-gray-600 hover:bg-purple-50")}
        >
          <Users className="w-3.5 h-3.5" /> Tất cả vai trò
        </button>
      </div>

      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs">
        <MiniMarkdown source={GUIDE_INTRO} />
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-purple-50 text-[11px] font-semibold text-gray-700">
              {s.title}
            </a>
          ))}
        </div>
      </div>

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-lg font-extrabold text-gray-900">{s.title}</h2>
            {s.audience
              .filter((a) => a !== "all")
              .map((a) => (
                <span key={a} className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold">
                  {GUIDE_AUDIENCE_LABEL[a]}
                </span>
              ))}
          </div>
          <MiniMarkdown source={s.body} />
        </section>
      ))}
    </div>
  );
}
