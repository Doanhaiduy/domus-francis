"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Settings, Building, MessageCircle, BellRing, Save, RotateCcw, FolderTree, ShieldCheck, AlertCircle, Undo2, Sparkles, LayoutPanelLeft, UserCog, GraduationCap, User, ScrollText } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { useCategories, useRbacMatrix } from "@/lib/data/settings";
import { sameSettingValue } from "@/lib/types/settings";
import { settingLabel } from "@/lib/settings-catalog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import CaiDatLoading from "./loading";
import { FormCardsSkeleton } from "./_components/TabSkeletons";
import { useSettingsDraft } from "./_components/useSettingsDraft";
import ProfileTab from "./_components/ProfileTab";
import GeneralTab, { isGeneralKey } from "./_components/GeneralTab";
import CategoriesTab from "./_components/CategoriesTab";
import RolesTab from "./_components/RolesTab";
import ZaloTab from "./_components/ZaloTab";
import RemindersTab from "./_components/RemindersTab";
import AiTab from "./_components/AiTab";
import ModulesTab from "./_components/ModulesTab";
import AccountsTab from "./_components/AccountsTab";
import AcademicConfigTab from "./_components/AcademicConfigTab";
import ActivityTab from "./_components/ActivityTab";
import { useAiStatus } from "@/lib/data/ai";

type ActiveTab = "profile" | "general" | "categories" | "academic" | "roles" | "accounts" | "zalo" | "reminders" | "ai" | "modules" | "activity";
const TABS: readonly ActiveTab[] = ["profile", "general", "categories", "academic", "roles", "accounts", "zalo", "reminders", "ai", "modules", "activity"];

export default function CaiDatPage() {
  const { showToast, isLoadingSkeleton } = useApp();
  const { session, can } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>("general");
  // Điện thoại: thanh tab cuộn ngang ⇒ đưa tab đang chọn vào tầm nhìn
  const tabsRef = useRef<HTMLDivElement>(null);
  // Mở thẳng một tab: /cai-dat?tab=modules (vd. từ dải nhắc "phân hệ đang ẩn")
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as ActiveTab | null;
    if (t && TABS.includes(t)) setActiveTab(t);
  }, []);
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

  // "Khôi phục mặc định": mọi khóa của tab hiện tại (chung hoặc Zalo) mà người dùng được sửa và đang khác mặc định
  const resetScope = activeTab === "zalo" ? "zalo" : "general";
  const resettable = useMemo(
    () =>
      [...draft.byKey.values()].filter(
        (m) =>
          m.canWrite &&
          m.defaultValue !== null &&
          m.defaultValue !== "" && // khóa không có mặc định thật (hotline, STK…) không bị xóa trắng hàng loạt
          (resetScope === "zalo" ? !isGeneralKey(m.key) : isGeneralKey(m.key)) &&
          !sameSettingValue(m.value, m.defaultValue),
      ),
    [draft.byKey, resetScope],
  );

  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>("button.text-primary");
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeTab, draft.isLoading]);

  if (isLoadingSkeleton) {
    return <CaiDatLoading />;
  }
  // Cấu hình hệ thống tải lần đầu: vẫn dựng khung trang + các tab, chỉ phần nội dung tab dùng skeleton riêng
  const settingsLoading = draft.isLoading;

  const handleSave = async () => {
    const r = await draft.save();
    showToast(r.ok ? "success" : "error", r.message);
  };

  const handleReset = async () => {
    const r = await draft.resetToDefaults(resettable.map((m) => m.key));
    showToast(r.ok ? "info" : "error", r.message);
  };

  const readOnly = !settingsLoading && !draft.anyWritable;
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
              {activeTab === "profile" ? <User className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                  {activeTab === "profile" ? "Hồ Sơ Cá Nhân" : "Cài Đặt & Quản Lý Hệ Thống"}
                </h1>
                {activeTab !== "profile" && (
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">v2.5.0</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {activeTab === "profile"
                  ? "Cập nhật thông tin cá nhân, ảnh đại diện, quê quán, số điện thoại cha mẹ và hồ sơ Công giáo"
                  : "Cấu hình thông số cộng đoàn, danh mục hệ thống toàn diện, phân quyền và kết nối bot"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab !== "profile" && !settingsLoading ? (
            !readOnly ? (
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
            )
          ) : null}
        </div>
      </div>

      {/* Thông báo quyền hệ thống (chỉ hiện khi xem các tab cấu hình hệ thống) */}
      {activeTab !== "profile" && !settingsLoading && (
        readOnly ? (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-100 text-amber-700 font-bold">🔒</span>
              <div>
                <h4 className="font-bold">Bạn đang xem cài đặt hệ thống ở chế độ chỉ đọc</h4>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Thay đổi cấu hình hệ thống chỉ dành cho người có quyền tương ứng: thông tin cộng đoàn &amp; tham số vận hành (Admin, Trưởng nhà), định
                  mức quỹ &amp; ngưỡng chi (Trưởng nhà), giá suất ăn &amp; giờ chốt cơm (Ban Ẩm thực, Trưởng nhà), giờ Kinh Tối (Ban Phụng vụ,
                  Trưởng nhà).
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
        )
      )}

      {draft.error && !draft.byKey.size ? (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Không tải được cấu hình: {errorMessage(draft.error)}
        </div>
      ) : null}

      {/* 2. NAVIGATION TABS */}
      <div ref={tabsRef} className="flex items-center gap-2 p-1.5 bg-surface-container-low rounded-2xl border border-purple-50 overflow-x-auto custom-scroll">
        <button onClick={() => setActiveTab("profile")} className={tabBtn("profile")}>
          <User className="w-4 h-4" />
          <span>Hồ sơ cá nhân</span>
        </button>
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
        <button onClick={() => setActiveTab("academic")} className={tabBtn("academic")}>
          <GraduationCap className="w-4 h-4" />
          <span>Danh mục học tập</span>
        </button>
        <button onClick={() => setActiveTab("roles")} className={tabBtn("roles")}>
          <ShieldCheck className="w-4 h-4" />
          <span>Phân quyền &amp; Vai trò</span>
        </button>
        {session && can("auth.user.read") && (
          <button onClick={() => setActiveTab("accounts")} className={tabBtn("accounts")}>
            <UserCog className="w-4 h-4" />
            <span>Tài khoản</span>
          </button>
        )}
        <button onClick={() => setActiveTab("zalo")} className={tabBtn("zalo")}>
          <MessageCircle className="w-4 h-4" />
          <span>Tích hợp Zalo</span>
          {dirtyIn((k) => !isGeneralKey(k)) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>
        {session && can("event.manage") && (
          <button onClick={() => setActiveTab("reminders")} className={tabBtn("reminders")}>
            <BellRing className="w-4 h-4" />
            <span>Nhắc lịch</span>
          </button>
        )}
        <button onClick={() => setActiveTab("modules")} className={tabBtn("modules")}>
          <LayoutPanelLeft className="w-4 h-4" />
          <span>Phân hệ</span>
        </button>
        {session && can("activity.log.read") && (
          <button onClick={() => setActiveTab("activity")} className={tabBtn("activity")}>
            <ScrollText className="w-4 h-4" />
            <span>Nhật ký hoạt động</span>
          </button>
        )}
        {aiStatus?.canManage && (
          <button onClick={() => setActiveTab("ai")} className={tabBtn("ai")}>
            <Sparkles className="w-4 h-4" />
            <span>Trợ lý AI</span>
            {aiStatus.masterEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>
        )}
      </div>

      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "general" && (settingsLoading ? <FormCardsSkeleton cards={4} /> : <GeneralTab draft={draft} roles={matrix?.roles ?? []} />)}
      {activeTab === "categories" && <CategoriesTab />}
      {activeTab === "roles" && <RolesTab matrix={matrix} isLoading={rbacLoading} error={rbacError} />}
      {activeTab === "zalo" && (settingsLoading ? <FormCardsSkeleton cards={2} /> : <ZaloTab draft={draft} />)}
      {activeTab === "reminders" && <RemindersTab />}
      {activeTab === "ai" && <AiTab />}
      {activeTab === "modules" && <ModulesTab />}
      {activeTab === "accounts" && <AccountsTab />}
      {activeTab === "activity" && session && can("activity.log.read") && <ActivityTab />}
      {activeTab === "academic" && <AcademicConfigTab />}

      {/* Điện thoại: form dài, nút Lưu ở đầu trang ⇒ thanh lưu cố định phía trên thanh điều hướng dưới khi có thay đổi */}
      {!readOnly && dirtyCount > 0 && (
        <div className="md:hidden fixed left-3 right-3 bottom-[76px] z-40 flex items-center gap-2 p-2 pl-3.5 rounded-2xl bg-gray-900/95 backdrop-blur text-white shadow-xl animate-in slide-in-from-bottom-2 duration-150">
          <span className="text-xs font-semibold flex-1 min-w-0 truncate">{dirtyCount} thay đổi chưa lưu</span>
          <button onClick={() => draft.discard()} disabled={draft.saving} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-300 active:bg-white/10">
            Hủy
          </button>
          <button onClick={handleSave} disabled={draft.saving} className="px-4 py-2 rounded-xl bg-primary text-xs font-bold active:scale-95 transition disabled:opacity-60">
            {draft.saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        title="Khôi phục giá trị mặc định"
        message={
          <span>
            Đưa <b>{resettable.length}</b> cấu hình bạn được quyền sửa trong tab {resetScope === "zalo" ? "Tích hợp Zalo" : "Cấu hình chung"}{" "}
            về giá trị mặc định và lưu ngay:
            <span className="block mt-2 max-h-40 overflow-y-auto text-[11px] text-gray-500">
              {resettable.map((m) => (
                <span key={m.key} className="block">
                  • {settingLabel(m.key, m.description)}
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
