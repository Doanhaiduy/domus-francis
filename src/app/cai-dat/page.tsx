"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Settings, Building, Send, Save, RotateCcw, FolderTree, ShieldCheck, AlertCircle, Undo2, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { useCategories, useRbacMatrix } from "@/lib/data/settings";
import { sameSettingValue } from "@/lib/types/settings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import CaiDatLoading from "./loading";
import { useSettingsDraft } from "./_components/useSettingsDraft";
import GeneralTab, { isGeneralKey } from "./_components/GeneralTab";
import CategoriesTab from "./_components/CategoriesTab";
import RolesTab from "./_components/RolesTab";
import TelegramTab from "./_components/TelegramTab";
import AiTab from "./_components/AiTab";
import { useAiStatus } from "@/lib/data/ai";

type ActiveTab = "general" | "categories" | "roles" | "telegram" | "ai";

export default function CaiDatPage() {
  const { showToast, isLoadingSkeleton } = useApp();
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>("general");
  const { status: aiStatus } = useAiStatus();

  const { matrix, isLoading: rbacLoading, error: rbacError } = useRbacMatrix();
  const roleCodes = useMemo(() => (matrix?.roles ?? []).map((r) => r.code), [matrix]);
  const draft = useSettingsDraft(roleCodes);
  const { categories } = useCategories();
  const [confirmReset, setConfirmReset] = useState(false);

  // Cảnh báo khi rời trang còn thay đổi chưa lưu
  const dirtyCount = draft.dirtyKeys.length;
  useEffect(() => {
    if (!dirtyCount) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyCount]);

  // "Khôi phục mặc định": mọi khóa của tab hiện tại (chung hoặc Telegram) mà người dùng được sửa và đang khác mặc định
  const resetScope = activeTab === "telegram" ? "telegram" : "general";
  const resettable = useMemo(
    () =>
      [...draft.byKey.values()].filter(
        (m) =>
          m.canWrite &&
          m.defaultValue !== null &&
          m.defaultValue !== "" && // khóa không có mặc định thật (hotline, STK…) không bị xóa trắng hàng loạt
          (resetScope === "telegram" ? !isGeneralKey(m.key) : isGeneralKey(m.key)) &&
          !sameSettingValue(m.value, m.defaultValue),
      ),
    [draft.byKey, resetScope],
  );

  if (isLoadingSkeleton || draft.isLoading) {
    return <CaiDatLoading />;
  }

  const handleSave = async () => {
    const r = await draft.save();
    showToast(r.ok ? "success" : "error", r.message);
  };

  const handleReset = async () => {
    const r = await draft.resetToDefaults(resettable.map((m) => m.key));
    showToast(r.ok ? "info" : "error", r.message);
  };

  const readOnly = !draft.anyWritable;
  const tabBtn = (tab: ActiveTab) =>
    cn(
      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
      activeTab === tab ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900 hover:bg-white/60",
    );
  const dirtyIn = (pred: (k: string) => boolean) => draft.dirtyKeys.filter(pred).length;

  return (
    <div className="flex flex-col w-full gap-6 max-w-6xl mx-auto pb-16">
      {/* 1. HEADER & QUICK ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Cài Đặt &amp; Quản Lý Hệ Thống</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">v2.5.0</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Cấu hình thông số cộng đoàn, danh mục hệ thống toàn diện, phân quyền và kết nối bot</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly ? (
            <>
              {dirtyCount > 0 && (
                <button
                  onClick={() => draft.discard()}
                  disabled={draft.saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                  title="Bỏ các thay đổi chưa lưu"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Hủy thay đổi</span>
                </button>
              )}
              <button
                onClick={() =>
                  resettable.length ? setConfirmReset(true) : showToast("info", "Các cấu hình bạn được sửa ở tab này đều đang ở giá trị mặc định.")
                }
                disabled={draft.saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 shadow-2xs transition disabled:opacity-60"
              >
                <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
                <span>Khôi phục mặc định</span>
              </button>
              <button
                onClick={handleSave}
                disabled={draft.saving || dirtyCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition disabled:opacity-50 disabled:active:scale-100"
              >
                <Save className="w-4 h-4" />
                <span>{draft.saving ? "Đang lưu..." : dirtyCount ? `Lưu tất cả thay đổi (${dirtyCount})` : "Lưu tất cả thay đổi"}</span>
              </button>
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
              🔒 Chế độ chỉ xem ({session?.roleLabel ?? "Thành viên"})
            </span>
          )}
        </div>
      </div>

      {/* Thông báo quyền */}
      {readOnly ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-700 font-bold">🔒</span>
            <div>
              <h4 className="font-bold">Bạn đang xem cài đặt ở chế độ chỉ đọc</h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Thay đổi cấu hình hệ thống chỉ dành cho người có quyền tương ứng: thông tin cộng đoàn &amp; tham số vận hành (Admin, Trưởng nhà), định
                mức quỹ &amp; ngưỡng chi (Trưởng nhà), giá suất ăn &amp; giờ chốt cơm (Ban Ẩm thực, Trưởng/Phó nhà), giờ Kinh Tối (Ban Phụng vụ,
                Trưởng/Phó nhà).
              </p>
            </div>
          </div>
        </div>
      ) : (
        draft.byKey.size > 0 &&
        [...draft.byKey.values()].some((m) => !m.canWrite) && (
          <div className="px-4 py-2.5 rounded-2xl bg-surface-container-low border border-purple-50 text-[11px] text-gray-600">
            Các ô có biểu tượng 🔒 cần quyền khác với vai trò của bạn ({session?.roleLabel}) — lý do hiển thị ngay dưới ô.
          </div>
        )
      )}

      {draft.error && !draft.byKey.size ? (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Không tải được cấu hình: {errorMessage(draft.error)}
        </div>
      ) : null}

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-container-low rounded-2xl border border-purple-50 overflow-x-auto custom-scroll">
        <button onClick={() => setActiveTab("general")} className={tabBtn("general")}>
          <Building className="w-4 h-4" />
          <span>Cấu hình chung &amp; Định mức</span>
          {dirtyIn(isGeneralKey) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>
        <button onClick={() => setActiveTab("categories")} className={tabBtn("categories")}>
          <FolderTree className="w-4 h-4" />
          <span>Quản lý Danh mục</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700">{categories.length}</span>
        </button>
        <button onClick={() => setActiveTab("roles")} className={tabBtn("roles")}>
          <ShieldCheck className="w-4 h-4" />
          <span>Phân quyền &amp; Vai trò</span>
        </button>
        <button onClick={() => setActiveTab("telegram")} className={tabBtn("telegram")}>
          <Send className="w-4 h-4" />
          <span>Tích hợp Telegram</span>
          {dirtyIn((k) => !isGeneralKey(k)) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>
        {aiStatus?.canManage && (
          <button onClick={() => setActiveTab("ai")} className={tabBtn("ai")}>
            <Sparkles className="w-4 h-4" />
            <span>Trợ lý AI</span>
            {aiStatus.masterEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>
        )}
      </div>

      {activeTab === "general" && <GeneralTab draft={draft} roles={matrix?.roles ?? []} />}
      {activeTab === "categories" && <CategoriesTab />}
      {activeTab === "roles" && <RolesTab matrix={matrix} isLoading={rbacLoading} error={rbacError} />}
      {activeTab === "telegram" && <TelegramTab draft={draft} />}
      {activeTab === "ai" && <AiTab />}

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        title="Khôi phục giá trị mặc định"
        message={
          <span>
            Đưa <b>{resettable.length}</b> cấu hình bạn được quyền sửa trong tab {resetScope === "telegram" ? "Tích hợp Telegram" : "Cấu hình chung"}{" "}
            về giá trị mặc định và lưu ngay:
            <span className="block mt-2 max-h-40 overflow-y-auto text-[11px] text-gray-500 font-mono">
              {resettable.map((m) => (
                <span key={m.key} className="block">
                  • {m.key}
                </span>
              ))}
            </span>
          </span>
        }
        confirmText="Khôi phục"
        cancelText="Hủy bỏ"
        variant="warning"
      />
    </div>
  );
}
