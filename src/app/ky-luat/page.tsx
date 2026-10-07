"use client";

import React, { useState } from "react";
import { Gavel } from "lucide-react";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { RecordsView } from "./_components/RecordsView";
import { RulesView } from "./_components/RulesView";

type Tab = "mine" | "all" | "rules";

export default function DisciplinePage() {
  const { session, can, isLoading } = useSession();
  const hasMember = !!session?.member;
  const canAll = can(["discipline.read", "discipline.manage"]);
  const [tab, setTab] = useState<Tab | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    ...(canAll ? [{ key: "all" as const, label: "Cả nhà" }] : []),
    ...(hasMember ? [{ key: "mine" as const, label: "Của tôi" }] : []),
    { key: "rules", label: "Luật & mức phạt" },
  ];
  const active: Tab = tab && tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="flex flex-col w-full gap-5 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5"><Gavel className="w-6 h-6 text-primary" /> Vi phạm &amp; kỷ luật</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          {canAll
            ? "Ghi nhận vi phạm của anh em theo luật nhà, kèm hình phạt (lần chuỗi, đi lễ, trực nhật…) và thời gian chấp hành để cuối năm tổng kết."
            : "Các ghi nhận vi phạm và hình phạt của riêng bạn, cùng danh mục luật nhà. Người khác không xem được mục này của bạn."}
        </p>
      </div>

      {tabs.length > 1 && (
        <div role="tablist" className="inline-flex flex-wrap p-1 rounded-xl bg-gray-100 gap-1 self-start">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => setTab(t.key)} className={cn("px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", active === t.key ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isLoading && !session ? (
        <div className="shimmer-box h-40 rounded-2xl" />
      ) : active === "rules" ? (
        <RulesView />
      ) : (
        <RecordsView key={active} mine={active === "mine"} />
      )}
    </div>
  );
}
