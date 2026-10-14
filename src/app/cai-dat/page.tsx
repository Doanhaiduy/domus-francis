"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Settings, Building, BellRing, Save, FolderTree, ShieldCheck, AlertCircle, Undo2, GraduationCap, User, ServerCog } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { useCategories, useRbacMatrix } from "@/lib/data/settings";
import { SETTINGS_TAB_EVENT } from "@/lib/data/system";
import { ADMIN_SECTION_PERMISSIONS, isAdminTab, settingsTabHref } from "@/lib/admin-tabs";
import { cn } from "@/lib/utils";
import CaiDatLoading from "./loading";
import { FormCardsSkeleton } from "@/components/settings/TabSkeletons";
import { useSettingsDraft } from "@/components/settings/useSettingsDraft";
import ProfileTab from "./_components/ProfileTab";
import SecurityTab from "./_components/SecurityTab";
import NotificationsTab from "./_components/NotificationsTab";
import GeneralTab, { isGeneralKey } from "./_components/GeneralTab";
import CategoriesTab from "./_components/CategoriesTab";
import RemindersTab from "./_components/RemindersTab";
import AcademicConfigTab from "./_components/AcademicConfigTab";

// CÀI ĐẶT: hồ sơ + bảo mật + thông báo của chính mình, và cấu hình của lưu xá (thông tin chung, danh mục, nhắc lịch).
// Phần kỹ thuật/vận hành (phân quyền, tài khoản, phân hệ, Zalo, AI, dung lượng, nhật ký, hệ thống, phiên bản) ở trang Quản trị hệ thống (/quan-tri).
type ActiveTab = "profile" | "security" | "notifications" | "general" | "categories" | "academic" | "reminders";
const TABS: readonly ActiveTab[] = ["profile", "security", "notifications", "general", "categories", "academic", "reminders"];
const isSettingsTab = (t: string | null | undefined): t is ActiveTab => !!t && (TABS as readonly string[]).includes(t);

export default function CaiDatPage() {
  const { showToast, isLoadingSkeleton } = useApp();
  const { session, can } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>("general");
  // Điện thoại: thanh tab cuộn ngang ⇒ đưa tab đang chọn vào tầm nhìn
  const tabsRef = useRef<HTMLDivElement>(null);
  // Mở thẳng một tab: /cai-dat?tab=profile. Liên kết CŨ tới tab đã chuyển sang Quản trị (vd. /cai-dat?tab=zalo, thông báo cũ, dấu trang) tự chuyển trang.
  const tabFromUrl = useRef(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (isAdminTab(t)) {
      window.location.replace(settingsTabHref(t));
      return;
    }
    if (isSettingsTab(t)) {
      tabFromUrl.current = true;
      setActiveTab(t);
    }
  }, []);
  // Chuyển tab khi đang ở trang này (xem openSettingsTab)
  useEffect(() => {
    const h = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (isSettingsTab(t)) setActiveTab(t);
    };
    window.addEventListener(SETTINGS_TAB_EVENT, h);
    return () => window.removeEventListener(SETTINGS_TAB_EVENT, h);
  }, []);

  const { matrix } = useRbacMatrix();
  const roleCodes = useMemo(() => (matrix?.roles ?? []).map((r) => r.code), [matrix]);
  const draft = useSettingsDraft(roleCodes);
  // Người KHÔNG có quyền sửa cấu hình nào mở Cài đặt (không chỉ định tab) ⇒ vào thẳng Hồ sơ cá nhân thay vì "Cấu hình chung" chỉ đọc
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || draft.isLoading || !session) return;
    defaulted.current = true;
    if (!tabFromUrl.current && !draft.anyWritable) setActiveTab("profile");
  }, [draft.isLoading, draft.anyWritable, session]);
  const { categories } = useCategories();

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

  const readOnly = !settingsLoading && !draft.anyWritable;
  const showAdminLink = !!session && ADMIN_SECTION_PERMISSIONS.some((p) => can(p));
  const tabBtn = (tab: ActiveTab) =>
    cn(
      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
      activeTab === tab ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900 hover:bg-white/60",
    );
  const dirtyIn = (pred: (k: string) => boolean) => draft.dirtyKeys.filter(pred).length;
  // Hồ sơ, bảo mật, thông báo là của riêng từng người — không có nút "Lưu cấu hình" của lưu xá
  const isConfigTab = activeTab === "general" || activeTab === "categories" || activeTab === "academic" || activeTab === "reminders";

  return (
    <div className="flex flex-col w-full gap-6 pb-16">
      {/* 1. HEADER & QUICK ACTIONS */}
      <div className="page-head">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center shadow-xs">
              {activeTab === "profile" ? <User className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">{activeTab === "profile" ? "Hồ Sơ Cá Nhân" : "Cài Đặt"}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {activeTab === "profile"
                  ? "Cập nhật thông tin cá nhân, ảnh đại diện, quê quán, số điện thoại cha mẹ và hồ sơ Công giáo"
                  : "Hồ sơ, bảo mật và thông báo của bạn; cấu hình riêng của lưu xá (thông tin chung, định mức, danh mục, nhắc lịch)"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {showAdminLink && (
            <Link href="/quan-tri" className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-primary bg-purple-50 hover:bg-purple-100 border border-purple-100 transition" title="Phân quyền, tài khoản, Zalo, AI, dung lượng, nhật ký, phiên bản…">
              <ServerCog className="w-4 h-4" />
              <span>Quản trị hệ thống</span>
            </Link>
          )}
          {isConfigTab && !settingsLoading ? (
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
                  onClick={handleSave}
                  disabled={draft.saving || dirtyCount === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition disabled:opacity-50 disabled:active:scale-100"
                >
                  <Save className="w-4 h-4" />
                  <span>{draft.saving ? "Đang lưu..." : dirtyCount ? `Lưu tất cả thay đổi (${dirtyCount})` : "Lưu tất cả thay đổi"}</span>
                </button>
              </>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">🔒 Chế độ chỉ xem ({session?.roleLabel ?? "Thành viên"})</span>
            )
          ) : null}
        </div>
      </div>

      {/* Thông báo quyền (chỉ hiện khi xem các tab cấu hình của lưu xá) */}
      {isConfigTab && !settingsLoading && (
        readOnly ? (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-100 text-amber-700 font-bold">🔒</span>
              <div>
                <h4 className="font-bold">Bạn đang xem cấu hình lưu xá ở chế độ chỉ đọc</h4>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Thay đổi cấu hình chỉ dành cho người có quyền tương ứng: thông tin cộng đoàn &amp; tham số vận hành (Admin, Trưởng nhà), định mức quỹ &amp; ngưỡng chi (Trưởng nhà), giờ chốt cơm (Ban Ẩm thực, Trưởng nhà), giờ Kinh Tối (Ban Phụng vụ, Trưởng nhà).
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

      {draft.error && !draft.byKey.size && isConfigTab ? (
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
        <button onClick={() => setActiveTab("security")} className={tabBtn("security")}>
          <ShieldCheck className="w-4 h-4" />
          <span>Bảo mật</span>
          {session?.mfa.required && !session.mfa.enabled && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
        </button>
        <button onClick={() => setActiveTab("notifications")} className={tabBtn("notifications")}>
          <BellRing className="w-4 h-4" />
          <span>Thông báo</span>
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
        {session && can("event.manage") && (
          <button onClick={() => setActiveTab("reminders")} className={tabBtn("reminders")}>
            <BellRing className="w-4 h-4" />
            <span>Nhắc lịch</span>
          </button>
        )}
      </div>

      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "security" && <SecurityTab />}
      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "general" && (settingsLoading ? <FormCardsSkeleton cards={4} /> : <GeneralTab draft={draft} roles={matrix?.roles ?? []} />)}
      {activeTab === "categories" && <CategoriesTab />}
      {activeTab === "reminders" && <RemindersTab />}
      {activeTab === "academic" && <AcademicConfigTab />}

      {/* Điện thoại: form dài, nút Lưu ở đầu trang ⇒ thanh lưu cố định phía trên thanh điều hướng dưới khi có thay đổi */}
      {!readOnly && dirtyCount > 0 && (
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
