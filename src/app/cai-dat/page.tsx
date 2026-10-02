"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  Building,
  Wallet,
  Tag,
  Send,
  User,
  Check,
  Save,
  RotateCcw,
  Plus,
  Edit2,
  Trash2,
  Search,
  Sliders,
  X,
  Layers,
  Bell,
  FolderTree,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  QrCode,
  Clock,
  Palette,
} from "lucide-react";
import { useApp } from "@/lib/store";
import CaiDatLoading from "./loading";
import { CustomToggle, CustomInput, CustomSelect, CustomTimePicker, SelectOption } from "@/components/ui/FormControls";
import { CategoryItem } from "@/lib/mockData";
import { cn } from "@/lib/utils";

type ActiveTab = "general" | "categories" | "roles" | "telegram";

const CATEGORY_TYPE_META: Record<
  CategoryItem["type"],
  { label: string; bg: string; text: string; border: string }
> = {
  expense: { label: "Thu Chi & Quỹ", bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  event: { label: "Lịch & Sự kiện", bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  announcement: { label: "Bảng Thông báo", bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200" },
  forum: { label: "Diễn đàn Huynh đệ", bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  maintenance: { label: "Hậu cần & Báo hỏng", bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
};

const COLOR_PRESETS = [
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#ef4444", // Rose
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#84cc16", // Lime
];

export default function CaiDatPage() {
  const {
    showToast,
    isLoadingSkeleton,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    toggleCategoryStatus,
    currentRole,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState<ActiveTab>("general");

  // General Settings State
  const [houseName, setHouseName] = useState("Lưu Xá Sinh Viên Phanxicô Assisi");
  const [motto, setMotto] = useState("Bình An và Thiện Hảo (Pax et Bonum)");
  const [houseAddress, setHouseAddress] = useState("Số 42 ngõ 180 Triều Khúc, Thanh Xuân, Hà Nội");
  const [patronFeast, setPatronFeast] = useState("04/10 (Thánh Phanxicô Assisi)");
  const [fundRate, setFundRate] = useState("350000");
  const [mealRate, setMealRate] = useState("25000");
  const [lunchCutoff, setLunchCutoff] = useState("09:00");
  const [dinnerCutoff, setDinnerCutoff] = useState("15:00");
  const [nightPrayerTime, setNightPrayerTime] = useState("20:30");
  const [bankAccount, setBankAccount] = useState("1903688889999 - Techcombank (Trần Văn Đức)");

  // Telegram Settings State
  const [telegramSync, setTelegramSync] = useState(true);
  const [remindMorningShift, setRemindMorningShift] = useState(true);
  const [reportMealSummary, setReportMealSummary] = useState(true);
  const [alertMaintenance, setAlertMaintenance] = useState(true);
  const [remindNightPrayer, setRemindNightPrayer] = useState(true);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("luuxa_settings");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.houseName) setHouseName(data.houseName);
        if (data.motto) setMotto(data.motto);
        if (data.houseAddress) setHouseAddress(data.houseAddress);
        if (data.patronFeast) setPatronFeast(data.patronFeast);
        if (data.fundRate) setFundRate(data.fundRate);
        if (data.mealRate) setMealRate(data.mealRate);
        if (data.lunchCutoff) setLunchCutoff(data.lunchCutoff);
        if (data.dinnerCutoff) setDinnerCutoff(data.dinnerCutoff);
        if (data.nightPrayerTime) setNightPrayerTime(data.nightPrayerTime);
        if (data.bankAccount) setBankAccount(data.bankAccount);
        if (data.telegramSync !== undefined) setTelegramSync(data.telegramSync);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleSaveSettings = () => {
    try {
      const settings = {
        houseName,
        motto,
        houseAddress,
        patronFeast,
        fundRate,
        mealRate,
        lunchCutoff,
        dinnerCutoff,
        nightPrayerTime,
        bankAccount,
        telegramSync,
      };
      localStorage.setItem("luuxa_settings", JSON.stringify(settings));
      showToast("success", "Đã lưu toàn bộ cấu hình cài đặt hệ thống vào bộ nhớ!");
    } catch {
      showToast("error", "Lỗi khi lưu cài đặt.");
    }
  };

  const handleResetSettings = () => {
    try {
      localStorage.removeItem("luuxa_settings");
      setHouseName("Lưu Xá Sinh Viên Phanxicô Assisi");
      setMotto("Bình An và Thiện Hảo (Pax et Bonum)");
      setHouseAddress("Số 42 ngõ 180 Triều Khúc, Thanh Xuân, Hà Nội");
      setPatronFeast("04/10 (Thánh Phanxicô Assisi)");
      setFundRate("350000");
      setMealRate("25000");
      setLunchCutoff("09:00");
      setDinnerCutoff("15:00");
      setNightPrayerTime("20:30");
      setBankAccount("1903688889999 - Techcombank (Trần Văn Đức)");
      showToast("info", "Đã khôi phục các giá trị ban đầu.");
    } catch {
      showToast("error", "Lỗi khôi phục.");
    }
  };

  // Category Manager State
  const [selectedCatType, setSelectedCatType] = useState<"all" | CategoryItem["type"]>("all");
  const [catSearchTerm, setCatSearchTerm] = useState("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  // Category Form State
  const [formCatName, setFormCatName] = useState("");
  const [formCatCode, setFormCatCode] = useState("");
  const [formCatType, setFormCatType] = useState<CategoryItem["type"]>("expense");
  const [formCatDesc, setFormCatDesc] = useState("");
  const [formCatColor, setFormCatColor] = useState(COLOR_PRESETS[0]);
  const [formCatActive, setFormCatActive] = useState(true);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const matchType = selectedCatType === "all" || c.type === selectedCatType;
      const matchSearch =
        catSearchTerm === "" ||
        c.name.toLowerCase().includes(catSearchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(catSearchTerm.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(catSearchTerm.toLowerCase()));
      return matchType && matchSearch;
    });
  }, [categories, selectedCatType, catSearchTerm]);

  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setFormCatName("");
    setFormCatCode("");
    setFormCatType(selectedCatType === "all" ? "expense" : selectedCatType);
    setFormCatDesc("");
    setFormCatColor(COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]);
    setFormCatActive(true);
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setFormCatName(cat.name);
    setFormCatCode(cat.code);
    setFormCatType(cat.type);
    setFormCatDesc(cat.description || "");
    setFormCatColor(cat.color || COLOR_PRESETS[0]);
    setFormCatActive(cat.isActive);
    setIsCategoryModalOpen(true);
  };

  useEffect(() => {
    if (!isCategoryModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsCategoryModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCategoryModalOpen]);

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCatName.trim() || !formCatCode.trim()) {
      showToast("error", "Vui lòng nhập tên và mã danh mục!");
      return;
    }

    if (editingCategory) {
      updateCategory(editingCategory.id, {
        name: formCatName.trim(),
        code: formCatCode.trim().toUpperCase(),
        type: formCatType,
        description: formCatDesc.trim(),
        color: formCatColor,
        isActive: formCatActive,
      });
    } else {
      addCategory({
        name: formCatName.trim(),
        code: formCatCode.trim().toUpperCase(),
        type: formCatType,
        description: formCatDesc.trim(),
        color: formCatColor,
        isActive: formCatActive,
        count: 0,
      });
    }

    setIsCategoryModalOpen(false);
  };

  const handleDeleteCategory = (cat: CategoryItem) => {
    if (confirm(`Bạn có chắc muốn xóa danh mục "${cat.name}"?`)) {
      deleteCategory(cat.id);
    }
  };

  if (isLoadingSkeleton) {
    return <CaiDatLoading />;
  }

  const categoryTypeOptions: SelectOption<CategoryItem["type"]>[] = [
    { value: "expense", label: "Thu Chi & Quỹ phòng" },
    { value: "event", label: "Lịch & Sự kiện" },
    { value: "announcement", label: "Bảng Thông báo" },
    { value: "forum", label: "Diễn đàn Huynh đệ" },
    { value: "maintenance", label: "Hậu cần & Báo hỏng" },
  ];

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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                  Cài Đặt &amp; Quản Lý Hệ Thống
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">
                  v2.5.0
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Cấu hình thông số cộng đoàn, danh mục hệ thống toàn diện, phân quyền và kết nối bot
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentRole !== "Thành viên" ? (
            <>
              <button
                onClick={handleResetSettings}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 shadow-2xs transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
                <span>Khôi phục</span>
              </button>
              <button
                onClick={handleSaveSettings}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition"
              >
                <Save className="w-4 h-4" />
                <span>Lưu tất cả thay đổi</span>
              </button>
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
              🔒 Chế độ chỉ xem (Thành viên)
            </span>
          )}
        </div>
      </div>

      {/* Role permission alert for Member */}
      {currentRole === "Thành viên" && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-700 font-bold">🔒</span>
            <div>
              <h4 className="font-bold">Bạn đang trải nghiệm vai trò Thành viên (Chế độ chỉ xem)</h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Các thao tác thay đổi cài đặt hệ thống, định mức tiền quỹ và chỉnh sửa danh mục chỉ dành riêng cho Trưởng nhà hoặc Admin. Hãy chuyển sang vai trò Trưởng nhà ở thanh công cụ phía trên để chỉnh sửa!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-container-low rounded-2xl border border-purple-50 overflow-x-auto custom-scroll">
        <button
          onClick={() => setActiveTab("general")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
            activeTab === "general"
              ? "bg-white text-primary shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
          )}
        >
          <Building className="w-4 h-4" />
          <span>Cấu hình chung &amp; Định mức</span>
        </button>

        <button
          onClick={() => setActiveTab("categories")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
            activeTab === "categories"
              ? "bg-white text-primary shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
          )}
        >
          <FolderTree className="w-4 h-4" />
          <span>Quản lý Danh mục</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700">
            {categories.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("roles")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
            activeTab === "roles"
              ? "bg-white text-primary shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
          )}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Phân quyền &amp; Vai trò</span>
        </button>

        <button
          onClick={() => setActiveTab("telegram")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
            activeTab === "telegram"
              ? "bg-white text-primary shadow-xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
          )}
        >
          <Send className="w-4 h-4" />
          <span>Tích hợp Telegram</span>
        </button>
      </div>

      {/* 3. TAB 1: CẤU HÌNH CHUNG & ĐỊNH MỨC */}
      {activeTab === "general" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Thông tin nhà */}
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Thông tin cộng đoàn lưu xá</h2>
                  <p className="text-xs text-gray-500">Thông tin nhận diện chính thức hiển thị cho anh em và phụ huynh</p>
                </div>
              </div>
              <span className="text-xs font-mono text-purple-700 font-bold bg-purple-50 px-2.5 py-1 rounded-xl">
                LX-HN-01
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CustomInput
                label="Tên lưu xá chính thức"
                value={houseName}
                onChange={(e) => setHouseName(e.target.value)}
                placeholder="Nhập tên lưu xá"
              />

              <CustomInput
                label="Khẩu hiệu / Châm ngôn cộng đoàn"
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                placeholder="VD: Pax et Bonum"
              />

              <div className="sm:col-span-2">
                <CustomInput
                  label="Địa chỉ cộng đoàn lưu xá"
                  value={houseAddress}
                  onChange={(e) => setHouseAddress(e.target.value)}
                  placeholder="Địa chỉ trụ sở lưu xá"
                />
              </div>

              <CustomInput
                label="Ngày Đại Lễ Bổn Mạng"
                value={patronFeast}
                onChange={(e) => setPatronFeast(e.target.value)}
                placeholder="VD: 04/10 (Thánh Phanxicô Assisi)"
              />

              <CustomInput
                label="Tài khoản nhận quỹ lưu xá (STK • Ngân hàng • Tên chủ thẻ)"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="Số tài khoản đóng quỹ"
              />
            </div>
          </div>

          {/* Quản lý quỹ & Định mức ăn uống */}
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-secondary flex items-center justify-center font-bold">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Quản lý quỹ &amp; Định mức ăn uống</h2>
                <p className="text-xs text-gray-500">Thiết lập tài chính cố định, giá suất ăn và khung giờ khóa điểm danh cơm</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CustomInput
                label="Định mức quỹ phòng hàng tháng (VNĐ / người)"
                type="number"
                value={fundRate}
                onChange={(e) => setFundRate(e.target.value)}
                rightSuffix="VNĐ"
              />

              <CustomInput
                label="Tiền suất cơm trưa / tối tham chiếu (VNĐ / suất)"
                type="number"
                value={mealRate}
                onChange={(e) => setMealRate(e.target.value)}
                rightSuffix="VNĐ"
              />

              <CustomTimePicker
                label="Giờ chốt điểm danh cơm trưa"
                value={lunchCutoff}
                onChange={setLunchCutoff}
              />

              <CustomTimePicker
                label="Giờ chốt điểm danh cơm tối"
                value={dinnerCutoff}
                onChange={setDinnerCutoff}
              />

              <div className="sm:col-span-2">
                <CustomTimePicker
                  label="Giờ cử hành Kinh Tối chung hàng ngày"
                  value={nightPrayerTime}
                  onChange={setNightPrayerTime}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
              <CustomToggle
                checked={telegramSync}
                onChange={setTelegramSync}
                label="Tự động gửi thông báo nhắc đóng quỹ qua Telegram"
                description="Bot sẽ tự động gửi kèm mã QR nộp tiền và thông tin ban tài chính vào ngày 01 hàng tháng"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: QUẢN LÝ DANH MỤC */}
      {activeTab === "categories" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Top Filter & Actions */}
          <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedCatType("all")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                  selectedCatType === "all"
                    ? "bg-primary text-white shadow-xs"
                    : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                )}
              >
                Tất cả ({categories.length})
              </button>
              {(Object.keys(CATEGORY_TYPE_META) as CategoryItem["type"][]).map((type) => {
                const count = categories.filter((c) => c.type === type).length;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedCatType(type)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                      selectedCatType === type
                        ? "bg-primary text-white shadow-xs"
                        : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                    )}
                  >
                    {CATEGORY_TYPE_META[type].label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <div className="w-56">
                <CustomInput
                  placeholder="Tìm danh mục, mã..."
                  value={catSearchTerm}
                  onChange={(e) => setCatSearchTerm(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <button
                onClick={handleOpenAddCategory}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm danh mục</span>
              </button>
            </div>
          </div>

          {/* Category Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategories.map((cat) => {
              const meta = CATEGORY_TYPE_META[cat.type];

              return (
                <div
                  key={cat.id}
                  className={cn(
                    "bg-white rounded-2xl p-4 border transition-all hover:shadow-md flex flex-col justify-between gap-3 group",
                    cat.isActive ? "border-purple-50 shadow-xs" : "border-gray-200 bg-gray-50/50 opacity-75"
                  )}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: cat.color }}
                        />
                        <h3 className="font-extrabold text-sm text-gray-900 group-hover:text-primary transition-colors">
                          {cat.name}
                        </h3>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                        {cat.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                          meta.bg,
                          meta.text,
                          meta.border
                        )}
                      >
                        {meta.label}
                      </span>
                      {typeof cat.count === "number" && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          {cat.count} bản ghi liên quan
                        </span>
                      )}
                    </div>

                    {cat.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {cat.description}
                      </p>
                    )}
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleCategoryStatus(cat.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors",
                          cat.isActive
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                        )}
                      >
                        {cat.isActive ? "● Hoạt động" : "○ Tạm ẩn"}
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditCategory(cat)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50 transition-colors"
                        title="Chỉnh sửa danh mục"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Xóa danh mục"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCategories.length === 0 && (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-200">
              <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-800">Không tìm thấy danh mục phù hợp</h3>
              <p className="text-xs text-gray-400 mt-1">
                Thử đổi từ khóa tìm kiếm hoặc chọn bộ lọc phân hệ khác.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. TAB 3: PHÂN QUYỀN & VAI TRÒ */}
      {activeTab === "roles" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Ma trận Phân quyền &amp; Trách nhiệm Nội bộ</h2>
                <p className="text-xs text-gray-500">
                  Quy định quyền truy cập và chỉnh sửa các phân hệ theo chức danh phục vụ trong lưu xá
                </p>
              </div>
            </div>

            <div className="overflow-x-auto custom-scroll">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Phân hệ chức năng</th>
                    <th className="py-3 px-3 text-center">Trưởng nhà</th>
                    <th className="py-3 px-3 text-center">Phó nhà</th>
                    <th className="py-3 px-3 text-center">Thủ quỹ</th>
                    <th className="py-3 px-3 text-center">Thành viên</th>
                    <th className="py-3 px-3 text-center">Admin HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                  <tr>
                    <td className="py-3 px-3 font-bold text-gray-900">Sơ đồ nhà &amp; Xếp chuyển phòng</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-gray-400">Xem</td>
                    <td className="py-3 px-3 text-center text-gray-400">Xem</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-gray-900">Thu Chi &amp; Phê duyệt quỹ</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Duyệt chi</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Xem &amp; Đối soát</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-gray-400">Xem minh bạch</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-gray-900">Đăng &amp; Ghim Thông Báo Khẩn</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-gray-400">Đăng thường</td>
                    <td className="py-3 px-3 text-center text-gray-400">Xem</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-gray-900">Bếp &amp; Phân ca trực nấu ăn</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Giám sát</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Xếp lịch ca</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Cấp tiền chợ</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Báo cơm &amp; Trực ca</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-gray-900">Quản lý Khoảnh Khắc &amp; Kỷ Niệm</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Quản trị</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Quản trị</td>
                    <td className="py-3 px-3 text-center text-gray-400">Đăng ảnh</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Đăng ảnh &amp; Thả tim</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-gray-900">Cài đặt Hệ thống &amp; Danh mục</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                    <td className="py-3 px-3 text-center text-gray-400">Xem</td>
                    <td className="py-3 px-3 text-center text-gray-400">Không</td>
                    <td className="py-3 px-3 text-center text-emerald-600 font-bold">Toàn quyền</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB 4: TÍCH HỢP TELEGRAM BOT */}
      {activeTab === "telegram" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Tích hợp Bot Telegram Lưu Xá</h2>
                  <p className="text-xs text-gray-500">
                    Tự động hóa thông báo điểm danh cơm, phân chia ca trực, thông báo khẩn và nhắc giờ kinh tối
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Đang kết nối
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-bold text-xl shadow-xs">
                  🤖
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900">
                    Lưu Xá Phanxico Alert Bot (@phanxico_bot)
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Chat ID: -100192847192 · Webhook Active
                  </div>
                </div>
              </div>

              <button
                onClick={() => showToast("success", "Đã gửi tin nhắn test thành công tới nhóm Telegram!")}
                className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 shadow-2xs transition"
              >
                Kiểm tra gửi tin nhắn Bot
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CustomInput
                label="Bot Token"
                type="password"
                defaultValue="7482910482:AAE3hK81-xxxxxx_phanxico"
                disabled
              />
              <CustomInput
                label="Group Chat ID"
                defaultValue="-100192847192 (Nhóm Chung Lưu Xá)"
                disabled
              />
            </div>

            <div className="p-4 rounded-2xl bg-surface-container-low/60 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-gray-800">Các kịch bản tự động hóa đang kích hoạt:</h3>
              <CustomToggle
                checked={remindMorningShift}
                onChange={setRemindMorningShift}
                label="Nhắc nhở ca trực cổng và chuẩn bị nấu ăn sáng"
                description="Gửi tin nhắn lúc 06:30 mỗi sáng nêu tên 2 anh em trong ca trực nhật"
              />
              <CustomToggle
                checked={reportMealSummary}
                onChange={setReportMealSummary}
                label="Báo cáo chốt danh sách cơm trưa (09:00) &amp; cơm tối (15:00)"
                description="Báo số lượng suất ăn cụ thể để ban ẩm thực chuẩn bị nguyên liệu đi chợ"
              />
              <CustomToggle
                checked={alertMaintenance}
                onChange={setAlertMaintenance}
                label="Cảnh báo sự cố hỏng hóc cơ sở vật chất mới"
                description="Chuyển tiếp báo cáo hư hỏng từ anh em tới Ban Hậu Cần ngay khi gửi"
              />
              <CustomToggle
                checked={remindNightPrayer}
                onChange={setRemindNightPrayer}
                label="Nhắc giờ kinh tối chung trước 15 phút"
                description="Chuông nhắc nhở anh em thu xếp việc học để cùng quy tụ về nguyện đường lúc 20:15"
              />
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL THÊM / SỬA DANH MỤC */}
      {isCategoryModalOpen &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsCategoryModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
              >
                <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                      <Tag className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-black text-gray-900">
                      {editingCategory ? "Chỉnh Sửa Danh Mục" : "Thêm Danh Mục Mới"}
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveCategory} className="flex flex-col flex-1 min-h-0">
                  <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <CustomInput
                    label="Tên danh mục"
                    value={formCatName}
                    onChange={(e) => setFormCatName(e.target.value)}
                    placeholder="VD: Rau củ tươi"
                    required
                  />

                  <CustomInput
                    label="Mã danh mục (Viết hoa)"
                    value={formCatCode}
                    onChange={(e) => setFormCatCode(e.target.value.toUpperCase())}
                    placeholder="VD: FOOD_VEG"
                    required
                  />
                </div>

                <CustomSelect
                  label="Phân hệ chức năng áp dụng"
                  value={formCatType}
                  onChange={(val) => setFormCatType(val as CategoryItem["type"])}
                  options={categoryTypeOptions}
                />

                <CustomInput
                  label="Mô tả phạm vi áp dụng"
                  value={formCatDesc}
                  onChange={(e) => setFormCatDesc(e.target.value)}
                  placeholder="Ghi chú chi tiết mục đích danh mục..."
                />

                {/* Color picker */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Màu sắc nhận diện
                  </label>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormCatColor(color)}
                        className={cn(
                          "w-7 h-7 rounded-full transition-transform flex items-center justify-center shadow-xs",
                          formCatColor === color ? "scale-110 ring-2 ring-purple-600 ring-offset-2" : "hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {formCatColor === color && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100">
                  <CustomToggle
                    checked={formCatActive}
                    onChange={setFormCatActive}
                    label="Kích hoạt sử dụng ngay"
                    description="Hiển thị danh mục này trong các form tạo mới và danh sách lọc"
                  />
                </div>

                  </div>

                  <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                    >
                      {editingCategory ? "Lưu thay đổi" : "Tạo danh mục"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
