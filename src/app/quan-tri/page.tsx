"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, HardDrive, LayoutPanelLeft, MessageCircle, Rocket, Save, ScrollText, ServerCog, ShieldCheck, Sparkles, Undo2, UserCog } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { useRbacMatrix } from "@/lib/data/settings";
import { useAiStatus } from "@/lib/data/ai";
import { SETTINGS_TAB_EVENT, useOpsSummary } from "@/lib/data/system";
import { isAdminTab, type AdminTab } from "@/lib/admin-tabs";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { FormCardsSkeleton } from "@/components/settings/TabSkeletons";
import { useSettingsDraft } from "@/components/settings/useSettingsDraft";
import DelegationsPanel from "@/components/members/DelegationsPanel";
import QuanTriLoading from "./loading";
import RolesTab from "./_components/RolesTab";
import AccountsTab from "./_components/AccountsTab";
import ModulesTab from "./_components/ModulesTab";
import ZaloTab from "./_components/ZaloTab";
import AiTab from "./_components/AiTab";
import StorageTab from "./_components/StorageTab";
import ActivityTab from "./_components/ActivityTab";
import SystemTab from "./_components/SystemTab";
import VersionTab from "./_components/VersionTab";

/**
 * QUẢN TRỊ HỆ THỐNG — phần kỹ thuật/vận hành, tách khỏi Cài đặt (Cài đặt chỉ còn hồ sơ + bảo mật + thông báo của bản thân và cấu hình của lưu xá).
 * Mỗi tab tự kiểm quyền (máy chủ vẫn là nơi quyết định cuối cùng); tab "Phiên bản & cập nhật" ai vào được trang này cũng xem được.
 */
export default function QuanTriPage() {
  const { showToast, isLoadingSkeleton } = useApp();
  const { session, can } = useSession();
  const { status: aiStatus } = useAiStatus();
  const [requested, setRequested] = useState<AdminTab | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Mở thẳng một tab: /quan-tri?tab=storage; và chuyển tab khi đang ở trang này (liên kết từ dải cảnh báo / tab Hệ thống — xem openSettingsTab)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (isAdminTab(t)) setRequested(t);
    const h = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (isAdminTab(next)) setRequested(next);
    };
    window.addEventListener(SETTINGS_TAB_EVENT, h);
    return () => window.removeEventListener(SETTINGS_TAB_EVENT, h);
  }, []);

  const { summary: ops } = useOpsSummary(!!session && can("system.monitor"));
  const { matrix, isLoading: rbacLoading, error: rbacError } = useRbacMatrix();
  const roleCodes = useMemo(() => (matrix?.roles ?? []).map((r) => r.code), [matrix]);
  const draft = useSettingsDraft(roleCodes);

  const tabs = useMemo(() => {
    const roleAdmin = ["auth.role.assign", "auth.role.manage", "auth.role.delegate", "auth.user.read"].some((p) => can(p));
    return [
      { id: "system" as const, label: "Hệ thống", icon: ServerCog, show: can("system.monitor") },
      { id: "roles" as const, label: "Phân quyền & Vai trò", icon: ShieldCheck, show: roleAdmin },
      { id: "accounts" as const, label: "Tài khoản", icon: UserCog, show: can("auth.user.read") },
      { id: "modules" as const, label: "Phân hệ", icon: LayoutPanelLeft, show: can("setting.write") },
      { id: "zalo" as const, label: "Tích hợp Zalo", icon: MessageCircle, show: can("setting.write") },
      { id: "ai" as const, label: "Trợ lý AI", icon: Sparkles, show: !!aiStatus?.canManage },
      { id: "storage" as const, label: "Dung lượng", icon: HardDrive, show: can("system.monitor") },
      { id: "activity" as const, label: "Nhật ký hoạt động", icon: ScrollText, show: can("activity.log.read") },
      { id: "version" as const, label: "Phiên bản & cập nhật", icon: Rocket, show: true },
    ].filter((t) => t.show);
  }, [can, aiStatus?.canManage]);

  // Tab đang xem: tab được yêu cầu nếu người dùng được phép, không thì tab đầu tiên được phép
  const activeTab: AdminTab = requested && tabs.some((t) => t.id === requested) ? requested : (tabs[0]?.id ?? "version");

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

  // Điện thoại: thanh tab cuộn ngang ⇒ đưa tab đang chọn vào tầm nhìn
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>("button.text-primary")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeTab, tabs.length]);

  if (isLoadingSkeleton || !session) return <QuanTriLoading />;

  const settingsLoading = draft.isLoading;
  const handleSave = async () => {
    const r = await draft.save();
    showToast(r.ok ? "success" : "error", r.message);
  };
  const canSave = !settingsLoading && draft.anyWritable;
  const tabBtn = (tab: AdminTab) =>
    cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all", activeTab === tab ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900 hover:bg-white/60");

  return (
    <div className="flex flex-col w-full gap-6 pb-16">
      <div className="page-head">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center shadow-xs">
            <ServerCog className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Quản Trị Hệ Thống</h1>
              <button
                type="button"
                onClick={() => setRequested("version")}
                title="Xem phiên bản và lịch sử cập nhật"
                className="px-2.5 py-0.5 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-bold font-mono transition"
              >
                v{APP_VERSION}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Phân quyền, tài khoản, tích hợp, AI, dung lượng, nhật ký và phiên bản — phần kỹ thuật dành cho người quản trị. Hồ sơ cá nhân và cấu hình lưu xá ở mục Cài đặt.</p>
          </div>
        </div>

        {activeTab === "zalo" && canSave && (
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <button onClick={() => draft.discard()} disabled={draft.saving} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition" title="Bỏ các thay đổi chưa lưu">
                <Undo2 className="w-3.5 h-3.5" />
                <span>Hủy thay đổi</span>
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={draft.saving || dirtyCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition disabled:opacity-50 disabled:active:scale-100"
            >
              <Save className="w-4 h-4" />
              <span>{draft.saving ? "Đang lưu..." : dirtyCount ? `Lưu thay đổi (${dirtyCount})` : "Lưu thay đổi"}</span>
            </button>
          </div>
        )}
      </div>

      {draft.error && !draft.byKey.size && activeTab === "zalo" ? (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Không tải được cấu hình: {errorMessage(draft.error)}
        </div>
      ) : null}

      <div ref={tabsRef} className="flex items-center gap-2 p-1.5 bg-surface-container-low rounded-2xl border border-purple-50 overflow-x-auto custom-scroll">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setRequested(t.id)} className={tabBtn(t.id)}>
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
            {t.id === "system" && ops && ops.level !== "ok" && <span className={cn("w-1.5 h-1.5 rounded-full", ops.level === "error" ? "bg-rose-500" : "bg-amber-500")} />}
            {t.id === "ai" && aiStatus?.masterEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            {t.id === "zalo" && dirtyCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {activeTab === "system" && <SystemTab />}
      {activeTab === "roles" && (
        <>
          <DelegationsPanel />
          <RolesTab matrix={matrix} isLoading={rbacLoading} error={rbacError} />
        </>
      )}
      {activeTab === "accounts" && <AccountsTab />}
      {activeTab === "modules" && <ModulesTab />}
      {activeTab === "zalo" && (settingsLoading ? <FormCardsSkeleton cards={2} /> : <ZaloTab draft={draft} />)}
      {activeTab === "ai" && <AiTab />}
      {activeTab === "storage" && <StorageTab />}
      {activeTab === "activity" && <ActivityTab />}
      {activeTab === "version" && <VersionTab />}

      {/* Điện thoại: form dài, nút Lưu ở đầu trang ⇒ thanh lưu cố định phía trên thanh điều hướng dưới khi có thay đổi */}
      {activeTab === "zalo" && canSave && dirtyCount > 0 && (
        <div className="lg:hidden fixed left-3 right-3 bottom-[76px] z-40 flex items-center gap-2 p-2 pl-3.5 rounded-2xl bg-gray-900/95 backdrop-blur text-white shadow-xl animate-in slide-in-from-bottom-2 duration-150">
          <span className="text-xs font-semibold flex-1 min-w-0 truncate">{dirtyCount} thay đổi chưa lưu</span>
          <button onClick={() => draft.discard()} disabled={draft.saving} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-300 active:bg-white/10">
            Hủy
          </button>
          <button onClick={handleSave} disabled={draft.saving} className="px-4 py-2 rounded-xl bg-primary text-xs font-bold active:scale-95 transition disabled:opacity-60">
            {draft.saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      )}
    </div>
  );
}
