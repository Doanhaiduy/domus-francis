"use client";

import React, { useEffect, useState } from "react";
import { Copy, Plus, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { useAssets, useDutySummary, useDutyWeek, useIssues, useLaundry } from "@/lib/data/duty";
import { buildDutyZaloText, isOpenIssue, vnTime } from "@/lib/duty-format";
import HauCanLoading from "./loading";
import DutyTab from "./DutyTab";
import IssuesTab from "./IssuesTab";
import LaundryTab from "./LaundryTab";
import AssetsTab from "./AssetsTab";

type Tab = "truc-nhat" | "bao-hong" | "may-giat" | "muon-do";

export default function HauCanPage() {
  const { openModal, showToast, isLoadingSkeleton } = useApp();
  const { can } = useSession();

  const [activeTab, setActiveTab] = useState<Tab>("truc-nhat");
  const [dutyWeek, setDutyWeek] = useState<string>("");
  const [laundryWeek, setLaundryWeek] = useState<string | null>(null);
  const [addDutyOpen, setAddDutyOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);

  // Mở thẳng tab từ liên kết (?tab=bao-hong) — Tổng quan/Sidebar có thể trỏ vào đây
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "truc-nhat" || t === "bao-hong" || t === "may-giat" || t === "muon-do") setActiveTab(t);
  }, []);

  const duty = useDutyWeek(dutyWeek || null);
  const { summary } = useDutySummary();
  const issues = useIssues();
  const laundry = useLaundry(laundryWeek);
  const assets = useAssets();

  const [issuesLoadedAt, setIssuesLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    if (issues.loaded) setIssuesLoadedAt(vnTime(new Date().toISOString()));
  }, [issues.issues, issues.loaded]);

  if (isLoadingSkeleton || (!duty.week && duty.isLoading)) {
    return <HauCanLoading />;
  }

  const todayCount = summary?.today.length ?? 0;
  const openIssues = issues.issues.filter((i) => isOpenIssue(i.status)).length;
  const loanable = assets.assets.filter((a) => a.isLoanable).length;

  const handleCopyDutyScheduleZalo = async () => {
    if (!duty.week) return;
    const success = await copyTextToClipboard(buildDutyZaloText(duty.week.roster, duty.week.today));
    if (success) showToast("success", "Đã sao chép lịch trực nhật Zalo! Hãy dán (Ctrl+V) vào nhóm chung.");
    else showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
  };

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
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Hậu Cần, Trực Nhật &amp; Kỹ Thuật</h1>
          <p className="text-sm text-gray-500 mt-1">Phân công dọn vệ sinh, nghiệm thu ca trực, báo hỏng cơ sở vật chất và mượn thiết bị dùng chung.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "truc-nhat" && (
            <>
              <button
                onClick={handleCopyDutyScheduleZalo}
                disabled={!duty.week || duty.week.roster.assignments.length === 0}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs border border-purple-200 transition shadow-2xs active:scale-95 disabled:opacity-50"
                title="Sao chép lịch phân công trực nhật tuần đang xem để gửi vào Zalo"
              >
                <Copy className="w-4 h-4 text-primary" />
                <span>Chép gửi Zalo</span>
              </button>
              {can("duty.manage") && (
                <button
                  onClick={() => setAddDutyOpen(true)}
                  disabled={!duty.week || duty.week.roster.status === "closed"}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 transition active:scale-95 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Phân công ca mới</span>
                </button>
              )}
            </>
          )}

          {activeTab === "bao-hong" && can("issue.create") && (
            <button
              onClick={() => openModal("reportIssue")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Báo hỏng mới</span>
            </button>
          )}

          {activeTab === "muon-do" && can("asset.manage") && (
            <button
              onClick={() => setAddAssetOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm thiết bị</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex gap-2 border-b border-purple-100 pb-2 overflow-x-auto custom-scroll">
        <button onClick={() => setActiveTab("truc-nhat")} className={tabBtn("truc-nhat")}>
          <span>🧹 Phân công Trực nhật &amp; Vệ sinh</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === "truc-nhat" ? "bg-white/20 text-white" : "bg-purple-100 text-primary"}`}
          >
            {todayCount} ca hôm nay
          </span>
        </button>

        <button onClick={() => setActiveTab("bao-hong")} className={tabBtn("bao-hong")}>
          <span>🔧 Báo hỏng &amp; Sự cố</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === "bao-hong" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"}`}>
            {openIssues}
          </span>
        </button>

        <button onClick={() => setActiveTab("may-giat")} className={tabBtn("may-giat")}>
          <span>🧺 Lịch máy giặt</span>
          {laundry.laundry && (
            <span className={`text-[10px] ${activeTab === "may-giat" ? "text-white/80" : "text-gray-400"}`}>
              ({laundry.laundry.myCountThisWeek}/{laundry.laundry.maxPerWeek} lượt)
            </span>
          )}
        </button>

        <button onClick={() => setActiveTab("muon-do")} className={tabBtn("muon-do")}>
          <span>📦 Mượn đồ chung</span>
          {assets.loaded && <span className={`text-[10px] ${activeTab === "muon-do" ? "text-white/80" : "text-gray-400"}`}>({loanable} món)</span>}
        </button>
      </div>

      {activeTab === "truc-nhat" && (
        <DutyTab
          data={duty.week}
          loading={duty.isLoading}
          week={dutyWeek || duty.week?.today || ""}
          onWeekChange={setDutyWeek}
          addOpen={addDutyOpen}
          onCloseAdd={() => setAddDutyOpen(false)}
        />
      )}
      {activeTab === "bao-hong" && <IssuesTab issues={issues.issues} loadedAt={issuesLoadedAt} loading={issues.isLoading} />}
      {activeTab === "may-giat" && <LaundryTab data={laundry.laundry} loading={laundry.isLoading} onWeekChange={setLaundryWeek} />}
      {activeTab === "muon-do" && <AssetsTab assets={assets.assets} loaded={assets.loaded} addOpen={addAssetOpen} onCloseAdd={() => setAddAssetOpen(false)} />}
    </div>
  );
}
