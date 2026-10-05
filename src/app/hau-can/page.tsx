"use client";

import React, { useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { useDutyBoard, useIssues } from "@/lib/data/duty";
import { isOpenIssue, vnTime } from "@/lib/duty-format";
import HauCanLoading from "./loading";
import DutyWeekTab from "./DutyWeekTab";
import IssuesTab from "./IssuesTab";

type Tab = "truc-nhat" | "bao-hong";

export default function HauCanPage() {
  const { openModal, isLoadingSkeleton } = useApp();
  const { can } = useSession();

  const [activeTab, setActiveTab] = useState<Tab>("truc-nhat");
  const [dutyWeek, setDutyWeek] = useState<string>("");

  // Mở thẳng tab từ liên kết (?tab=bao-hong) — Tổng quan/Sidebar có thể trỏ vào đây
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "truc-nhat" || t === "bao-hong") setActiveTab(t);
  }, []);

  const { board } = useDutyBoard(dutyWeek || null);
  const issues = useIssues();

  const [issuesLoadedAt, setIssuesLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    if (issues.loaded) setIssuesLoadedAt(vnTime(new Date().toISOString()));
  }, [issues.issues, issues.loaded]);

  if (isLoadingSkeleton) return <HauCanLoading />;

  const openIssues = issues.issues.filter((i) => isOpenIssue(i.status)).length;
  const mine = board?.week.isMine && board.week.weekStart === board.thisWeekStart;

  const tabBtn = (tab: Tab) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
      activeTab === tab ? "bg-primary text-white shadow-xs" : "text-gray-600 hover:bg-purple-50 hover:text-primary"
    }`;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-purple-50 shadow-xs">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Đời Sống &amp; Trách Nhiệm Cộng Đoàn · Lưu Xá Phanxicô</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Hậu Cần &amp; Kỹ Thuật</h1>
          <p className="text-sm text-gray-500 mt-1">Lịch trực vệ sinh sân nhà theo tuần và báo hỏng cơ sở vật chất.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "bao-hong" && can("issue.create") && (
            <button
              onClick={() => openModal("reportIssue")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Báo hỏng mới</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex gap-2 border-b border-purple-100 pb-2 overflow-x-auto custom-scroll">
        <button onClick={() => setActiveTab("truc-nhat")} className={tabBtn("truc-nhat")}>
          <span>🧹 Trực vệ sinh sân nhà</span>
          {mine && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === "truc-nhat" ? "bg-white/20 text-white" : "bg-purple-100 text-primary"}`}>Bạn trực tuần này</span>
          )}
        </button>

        <button onClick={() => setActiveTab("bao-hong")} className={tabBtn("bao-hong")}>
          <span>🔧 Báo hỏng &amp; Sự cố</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === "bao-hong" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"}`}>
            {openIssues}
          </span>
        </button>
      </div>

      {activeTab === "truc-nhat" && <DutyWeekTab week={dutyWeek} onWeekChange={setDutyWeek} />}
      {activeTab === "bao-hong" && <IssuesTab issues={issues.issues} loadedAt={issuesLoadedAt} loading={issues.isLoading} />}
    </div>
  );
}
