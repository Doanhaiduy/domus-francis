"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  Clock,
  Calendar,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  Sparkles,
  ShoppingBag,
  Package,
  Plus,
  ThumbsUp,
  Copy,
} from "lucide-react";
import { useApp } from "@/lib/store";
import BepComLoading from "./loading";
import { formatMealAttendanceForZalo, copyTextToClipboard } from "@/lib/zaloShare";

const WEEK_DAYS = [
  { day: "T2", lunch: 11, dinner: 12 },
  { day: "T3", lunch: 10, dinner: 11 },
  { day: "T4", lunch: 12, dinner: 13 },
  { day: "T5", lunch: 10, dinner: 11, isToday: true },
  { day: "T6", lunch: 9, dinner: 10 },
  { day: "T7", lunch: 8, dinner: 9 },
  { day: "CN", lunch: 12, dinner: 13 },
];

const WEEKLY_MENUS = [
  {
    day: "Thứ Hai (28/09)",
    cook: "Gia Bảo (Chính) · Văn Đức (Phụ)",
    lunch: ["Thịt ba chỉ luộc cà pháo", "Canh cua mồng tơi", "Đậu sốt cà chua"],
    dinner: ["Cá nục kho dứa", "Rau cải thìa xào tỏi", "Trứng chiên hành"],
  },
  {
    day: "Thứ Ba (29/09)",
    cook: "Quốc Việt (Chính) · Hoàng Long (Phụ)",
    lunch: ["Sườn xào chua ngọt", "Canh rau ngót nấu thịt băm", "Bắp cải luộc chấm trứng"],
    dinner: ["Gà rang gừng sả", "Canh mướp nấu tôm khô", "Đậu phụ rán giòn"],
  },
  {
    day: "Thứ Tư (30/09)",
    cook: "Thanh Phong (Chính) · Văn Hiếu (Phụ)",
    lunch: ["Bún bò Huế giò heo", "Rau sống bắp chuối", "Chả lụa chiên"],
    dinner: ["Thịt băm xào nấm rơm", "Canh bí đỏ hầm xương", "Rau muống luộc"],
  },
  {
    day: "Thứ Năm (01/10 - Hôm nay)",
    isToday: true,
    cook: "Đình Khôi (Chính) · Minh Tuấn (Phụ)",
    lunch: ["Thịt kho trứng cút", "Canh bí đao sườn", "Đậu rán tẩm hành", "Dưa chuột bóp xổi"],
    dinner: ["Canh chua cá lóc Nam Bộ", "Rau muống xào tỏi", "Trứng chiên hành hoa"],
  },
  {
    day: "Thứ Sáu (02/10)",
    cook: "Anh Khoa (Chính) · Tuấn Kiệt (Phụ)",
    lunch: ["Cá thu Nhật sốt cà", "Canh rau đay tép đồng", "Lạc rang muối"],
    dinner: ["Thịt rang cháy cạnh", "Canh mồng tơi riêu cua", "Cà muối chua giòn"],
  },
  {
    day: "Thứ Bảy (03/10)",
    cook: "Bảo Nam (Chính) · Hữu Phước (Phụ)",
    lunch: ["Thịt vịt kho gừng", "Canh bầu nấu tôm", "Đậu xào thịt bò"],
    dinner: ["Lẩu gà lá giang", "Bún tươi & rau muống", "Chả cá thác lác"],
  },
  {
    day: "Chúa Nhật (04/10)",
    cook: "Ban Ẩm Thực (Cộng đoàn nấu tiệc)",
    lunch: ["Tiệc Lễ Bổn Mạng Phanxicô", "Bò né sốt tiêu đen", "Cơm chiên Dương Châu", "Tráng miệng trái cây"],
    dinner: ["Cơm chiều nhẹ", "Cháo sườn bách thảo", "Rau củ luộc kho quẹt"],
  },
];

export default function BepComPage() {
  const { members, mealAttendance, toggleMeal, registerAllMeals, showToast, isLoadingSkeleton, openModal } = useApp();

  const [activeTab, setActiveTab] = useState<"diem-danh" | "thuc-don" | "kho-do">("diem-danh");

  // Pantry State (Kho đồ)
  const [pantryItems, setPantryItems] = useState([
    { id: 1, name: "Gạo thơm ST25", qty: "15 kg", status: "Đầy đủ", target: "25 kg", icon: "🌾", category: "Lương thực" },
    { id: 2, name: "Dầu ăn Simply 5L", qty: "1 bình", status: "Sắp hết", target: "2 bình", icon: "🍾", category: "Gia vị" },
    { id: 3, name: "Nước mắm Nam Ngư 750ml", qty: "3 chai", status: "Đầy đủ", target: "4 chai", icon: "🧂", category: "Gia vị" },
    { id: 4, name: "Hạt nêm Knorr 900g", qty: "2 gói", status: "Đầy đủ", target: "2 gói", icon: "📦", category: "Gia vị" },
    { id: 5, name: "Trứng gà công nghiệp", qty: "8 quả", status: "Cần mua gấp", target: "30 quả", icon: "🥚", category: "Thực phẩm tươi" },
    { id: 6, name: "Đường cát trắng 1kg", qty: "2 gói", status: "Đầy đủ", target: "2 gói", icon: "🍚", category: "Gia vị" },
    { id: 7, name: "Nước rửa chén Sunlight 3.8kg", qty: "1 can", status: "Đầy đủ", target: "1 can", icon: "🧴", category: "Hóa phẩm" },
  ]);

  if (isLoadingSkeleton) {
    return <BepComLoading />;
  }

  const totalLunch = Object.values(mealAttendance).filter((m) => m.lunch).length;
  const totalDinner = Object.values(mealAttendance).filter((m) => m.dinner).length;

  const handleCopyMealZalo = async () => {
    const lunchAttendants = members.filter((m) => mealAttendance[m.id]?.lunch);
    const lunchAbsentees = members.filter((m) => !mealAttendance[m.id]?.lunch);
    const dinnerAttendants = members.filter((m) => mealAttendance[m.id]?.dinner);
    const dinnerAbsentees = members.filter((m) => !mealAttendance[m.id]?.dinner);

    const todayMenu = WEEKLY_MENUS.find((m) => m.isToday);

    const text = formatMealAttendanceForZalo({
      dateStr: "Thứ Sáu, 02/10/2026 (Hôm nay)",
      cookTeam: todayMenu?.cook || "Đình Khôi (Chính) · Minh Tuấn (Phụ)",
      lunchAttendants,
      lunchAbsentees,
      dinnerAttendants,
      dinnerAbsentees,
      menuLunch: todayMenu?.lunch,
      menuDinner: todayMenu?.dinner,
    });

    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", "Đã sao chép danh sách chốt cơm Zalo! Hãy dán (Ctrl+V) vào nhóm Bếp.");
    } else {
      showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
    }
  };

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* PAUSED NOTICE BANNER */}
      <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 text-xl font-bold">
            ⏸️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-amber-900">Tính năng Bếp &amp; Cơm tạm hoãn triển khai</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 uppercase">
                Tạm hoãn
              </span>
            </div>
            <p className="text-xs text-amber-800/90 mt-0.5">
              Phân hệ này đang tạm hoãn theo quyết định của Ban Điều Hành Lưu Xá Phanxicô. Dữ liệu bên dưới được lưu ở chế độ tham khảo và không tiếp nhận đăng ký mới.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs whitespace-nowrap"
        >
          Về Trang Chủ →
        </Link>
      </div>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">
            Sinh Hoạt Cộng Đoàn › Bếp Ăn &amp; Phục Vụ
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
            Bếp &amp; Cơm
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Điểm danh bữa ăn, thực đơn hàng tuần và quản lý kho gia vị thực phẩm
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyMealZalo}
            className="px-3.5 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs transition flex items-center gap-1.5 active:scale-95 shadow-2xs"
            title="Sao chép danh sách chốt cơm trưa và tối gửi vào Zalo Bếp Lưu Xá"
          >
            <Copy className="w-3.5 h-3.5 text-primary" />
            <span>Copy chốt cơm Zalo</span>
          </button>

          <button
            onClick={() => registerAllMeals()}
            className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition flex items-center gap-1.5 active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Đăng ký ăn cả tuần</span>
          </button>
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex gap-2 border-b border-purple-50 pb-2">
        <button
          onClick={() => setActiveTab("diem-danh")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "diem-danh"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-surface-container-low"
          }`}
        >
          🍽️ Đặt cơm &amp; Điểm danh
        </button>
        <button
          onClick={() => setActiveTab("thuc-don")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "thuc-don"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-surface-container-low"
          }`}
        >
          📋 Thực đơn cả tuần (7 ngày)
        </button>
        <button
          onClick={() => setActiveTab("kho-do")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === "kho-do"
              ? "bg-primary text-white shadow-xs"
              : "text-gray-600 hover:bg-surface-container-low"
          }`}
        >
          📦 Kho đồ &amp; Gia vị ({pantryItems.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ĐẶT CƠM & ĐIỂM DANH */}
      {/* ========================================================================= */}
      {activeTab === "diem-danh" && (
        <>
          {/* TOP ROW: DATE HERO & MEAL TARGET CAPSULES */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* HERO DATE BOX (5 COLS) */}
            <div className="lg:col-span-5 rounded-3xl p-6 bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white shadow-lg shadow-purple-300/40 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md">
                  Năm học 2026 – 2027
                </span>
                <UtensilsCrossed className="w-5 h-5 text-purple-200" />
              </div>

              <div className="my-6">
                <span className="text-sm font-medium text-purple-200 block">Thứ Năm</span>
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">
                  1 tháng 10
                </div>
                <p className="text-xs text-purple-200 mt-2">
                  Tuần XXVI Thường Niên · Cộng đoàn Thánh Phanxicô Assisi
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-between text-xs">
                <div>
                  <span className="text-purple-200 font-semibold block text-[10px] uppercase tracking-wider">
                    Trực bếp hôm nay:
                  </span>
                  <span className="font-bold text-white mt-0.5 block">
                    Đình Khôi (Chính) · Minh Tuấn (Phụ)
                  </span>
                </div>
                <span className="text-xl">👨‍🍳</span>
              </div>
            </div>

            {/* MEAL SERVICE STATUS (7 COLS) */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col justify-between gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Kế hoạch phục vụ hôm nay</h2>
                  <p className="text-xs text-gray-500">Tổng hợp định mức các suất cơm trưa &amp; tối</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Bếp đang hoạt động
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Lunch */}
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-600">Bữa Trưa</span>
                    <div className="text-2xl font-extrabold text-primary mt-1">
                      {totalLunch} <span className="text-xs font-medium text-gray-500">suất</span>
                    </div>
                    <span className="text-[11px] text-gray-400">11h30 bắt đầu dọn cơm</span>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-200/70 text-purple-900 text-xs font-bold rounded-lg">
                    Đã khóa sổ
                  </span>
                </div>

                {/* Dinner */}
                <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-600">Bữa Tối</span>
                    <div className="text-2xl font-extrabold text-secondary mt-1">
                      {totalDinner} <span className="text-xs font-medium text-gray-500">suất</span>
                    </div>
                    <span className="text-[11px] text-gray-400">18h30 sau giờ Kinh Tối</span>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-200/70 text-emerald-900 text-xs font-bold rounded-lg animate-pulse">
                    Còn 2 tiếng
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <b>Lưu ý về giờ chốt số suất ăn:</b> Hạn chốt đăng ký suất trưa trước <b>9:00 sáng</b> &amp; tối trước <b>15:00 chiều</b> để bạn mua sắm chuẩn bị đúng lượng thực phẩm, tránh lãng phí.
                </span>
              </div>
            </div>
          </div>

          {/* ATTENDANCE CHECK-IN GRID (12 MEMBERS) */}
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Bảng điểm danh thành viên lưu xá</h2>
                <p className="text-xs text-gray-500">Bấm nút để chuyển đổi trạng thái Ăn / Không ăn</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Ăn trưa ({totalLunch})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary" /> Ăn tối ({totalDinner})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {members.map((m) => {
                const att = mealAttendance[m.id] || { lunch: false, dinner: false };

                return (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition border border-purple-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {m.avatarText}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">
                          {m.fullName}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {m.room} · {m.phone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Lunch Toggle */}
                      <button
                        onClick={() => toggleMeal(m.id, "lunch")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                          att.lunch
                            ? "bg-primary text-white shadow-2xs"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {att.lunch ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Trưa</span>
                      </button>

                      {/* Dinner Toggle */}
                      <button
                        onClick={() => toggleMeal(m.id, "dinner")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                          att.dinner
                            ? "bg-secondary text-white shadow-2xs"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {att.dinner ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Tối</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TODAY'S MENU & WEEKLY DENSITY CHART */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* MENU (7 COLS) */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Thực đơn hôm nay</h2>
                  <p className="text-xs text-gray-500">Khẩu phần dinh dưỡng cộng đoàn Thứ Năm</p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg">
                  Đã duyệt thực đơn
                </span>
              </div>

              <div className="space-y-4">
                {/* Lunch Menu */}
                <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-purple-50">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-900 mb-2">
                    <span>☀️ Bữa Trưa (11:30)</span>
                    <span className="text-[11px] text-gray-500 font-normal">4 Món chính &amp; phụ</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>Thịt kho trứng cút</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>Canh bí đao sườn</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>Đậu rán tẩm hành</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>Dưa chuột bóp xổi</span>
                    </div>
                  </div>
                </div>

                {/* Dinner Menu */}
                <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-purple-50">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-2">
                    <span>🌙 Bữa Tối (18:30)</span>
                    <span className="text-[11px] text-gray-500 font-normal">3 Món ấm nóng</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      <span>Canh chua cá lóc Nam Bộ</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      <span>Rau muống xào tỏi</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      <span>Trứng chiên hành hoa</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* WEEKLY MEAL DENSITY CHART (5 COLS) */}
            <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Mật độ đăng ký ăn tuần này</h2>
                  <p className="text-xs text-gray-500">Số lượng suất ăn Thứ 2 đến Chủ Nhật</p>
                </div>
              </div>

              <div className="flex items-end justify-between gap-2 h-44 pt-6 px-2">
                {WEEK_DAYS.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-full flex items-end justify-center gap-1 h-32">
                      {/* Lunch bar */}
                      <div
                        className={`w-3.5 rounded-t-md transition-all ${
                          d.isToday ? "bg-primary" : "bg-purple-200"
                        }`}
                        style={{ height: `${(d.lunch / 13) * 100}%` }}
                        title={`Trưa ${d.day}: ${d.lunch} suất`}
                      />
                      {/* Dinner bar */}
                      <div
                        className={`w-3.5 rounded-t-md transition-all ${
                          d.isToday ? "bg-secondary" : "bg-emerald-200"
                        }`}
                        style={{ height: `${(d.dinner / 13) * 100}%` }}
                        title={`Tối ${d.day}: ${d.dinner} suất`}
                      />
                    </div>
                    <span className={`text-[11px] font-bold ${d.isToday ? "text-primary" : "text-gray-500"}`}>
                      {d.day}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-purple-50/50 rounded-2xl flex items-center justify-between text-xs text-gray-600">
                <span>Trung bình: <b>10.8 suất/ngày</b></span>
                <span className="text-primary font-bold">Tuần 40</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: THỰC ĐƠN CẢ TUẦN */}
      {/* ========================================================================= */}
      {activeTab === "thuc-don" && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Kế hoạch thực đơn Tuần XXVI Thường Niên</h2>
              <p className="text-xs text-gray-500">Phân công mua sắm thực phẩm và chế biến theo từng cặp trực</p>
            </div>
            <button
              onClick={() => showToast("info", "Đã gửi phiếu khảo sát món ăn yêu thích tuần tới!")}
              className="px-4 py-2 rounded-xl bg-purple-100 text-primary font-bold text-xs hover:bg-purple-200 transition"
            >
              + Đề xuất món tuần mới
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WEEKLY_MENUS.map((menu, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between transition ${
                  menu.isToday
                    ? "border-primary ring-2 ring-purple-200 bg-purple-50/20"
                    : "border-purple-50 hover:border-purple-200"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-900">{menu.day}</span>
                    {menu.isToday && (
                      <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold">
                        Hôm nay
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 text-[11px] text-gray-500 flex items-center gap-1.5">
                    <span>👨‍🍳</span>
                    <span className="font-semibold text-gray-700">{menu.cook}</span>
                  </div>

                  {/* Lunch items */}
                  <div className="mt-3 p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block mb-1">
                      ☀️ Bữa Trưa:
                    </span>
                    <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                      {menu.lunch.map((dish, i) => (
                        <li key={i}>{dish}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Dinner items */}
                  <div className="mt-2.5 p-3 rounded-2xl bg-emerald-50/40 border border-emerald-50/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                      🌙 Bữa Tối:
                    </span>
                    <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                      {menu.dinner.map((dish, i) => (
                        <li key={i}>{dish}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Định mức: 25.000đ/suất</span>
                  <button
                    onClick={() => showToast("success", `Đã gửi lời khen/góp ý cho bữa ăn ${menu.day}!`)}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    <ThumbsUp className="w-3 h-3" />
                    <span>Bình chọn món</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KHO ĐỒ & GIA VỊ */}
      {/* ========================================================================= */}
      {activeTab === "kho-do" && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-purple-50 shadow-xs flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Kiểm kê gia vị &amp; Thực phẩm kho bếp</h2>
              <p className="text-xs text-gray-500">
                Theo dõi lượng tồn kho đồ dùng chung để kịp thời mua bổ sung
              </p>
            </div>
            <button
              onClick={() => showToast("success", "Đã thêm vào danh sách đồ cần mua sáng mai!")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Đề xuất mua thêm gia vị</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pantryItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">{item.name}</h3>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Hiện có: <b className="text-gray-900">{item.qty}</b> (Định mức: {item.target})
                    </div>
                    <span
                      className={`inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        item.status === "Đầy đủ"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "Sắp hết"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800 animate-pulse"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() =>
                    showToast("info", `Đã lưu yêu cầu bổ sung ${item.name} cho đội đi chợ!`)
                  }
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-purple-50 text-primary border border-purple-200 transition shrink-0"
                >
                  Mua thêm
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
