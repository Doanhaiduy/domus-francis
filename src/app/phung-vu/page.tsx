"use client";

import React, { useState } from "react";
import {
  Church,
  Heart,
  Send,
  Calendar,
  Clock,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { useApp } from "@/lib/store";
import PhungVuLoading from "./loading";
import { CustomTextarea } from "@/components/ui/FormControls";

export default function PhungVuPage() {
  const { prayers, addPrayer, togglePraying, showToast, isLoadingSkeleton } = useApp();

  if (isLoadingSkeleton) {
    return <PhungVuLoading />;
  }

  const [intentionInput, setIntentionInput] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
            Phụng Vụ &amp; Đời Sống Thiêng Liêng
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Lịch kinh nguyện, ý hiệp thông cầu nguyện và suy niệm Lời Chúa hàng tuần
          </p>
        </div>

        <button
          onClick={() => {
            const input = document.getElementById("prayer-input");
            input?.focus();
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition self-start md:self-auto"
        >
          <span>+ Gửi ý cầu nguyện</span>
        </button>
      </div>

      {/* TOP 3 CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Kinh Tối Hôm Nay</span>
            <div className="text-3xl font-extrabold text-primary mt-1">
              20:30 <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">Tối nay</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Nguyện đường Tầng 3 · Trực: Ban Phụng Vụ</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl">
            📖
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Ý Cầu Nguyện Tháng</span>
            <div className="text-3xl font-extrabold text-secondary mt-1">
              {prayers.length} <span className="text-xs font-bold text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-md">+3 mới tuần này</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">12 anh em đang cùng hiệp thông</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-secondary flex items-center justify-center font-bold text-xl">
            🙏
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Thánh Lễ Sắp Tới</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              Chúa Nhật <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">04/10</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">08:30 sáng · Đại lễ Bổn mạng Lưu Xá</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xl">
            ⛪
          </div>
        </div>
      </div>

      {/* 2 COLUMNS: SCHEDULE & PRAYER INTENTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* SCHEDULE (7 COLS) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Lịch phụng vụ tuần này</h2>
              <p className="text-xs text-gray-500">Tháng 10/2026 · Tuần XXVII Thường Niên</p>
            </div>
            <span className="text-xs text-gray-400 font-mono">01/10 – 07/10/2026</span>
          </div>

          <div className="space-y-4">
            
            {/* THURSDAY */}
            <div className="p-4 rounded-2xl bg-purple-50/70 border-l-4 border-primary">
              <div className="flex items-center justify-between text-xs font-bold text-purple-900 mb-2">
                <span className="bg-primary text-white px-2 py-0.5 rounded-md">HÔM NAY</span>
                <span>Thứ Năm, 01/10 · Thánh Têrêsa Hài Đồng Giêsu</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white">
                  <span className="font-mono font-bold text-primary">06:00 SÁNG</span>
                  <span className="font-semibold text-gray-900">Giờ kinh sáng &amp; Ngắm nguyện cá nhân</span>
                  <span className="text-gray-400">Nguyện đường T3</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white">
                  <span className="font-mono font-bold text-primary">20:30 TỐI</span>
                  <span className="font-semibold text-gray-900">Kinh Tối &amp; Lần hạt Mân Côi chung cả nhà</span>
                  <span className="text-gray-400">Chủ sự: Minh Tuấn (P.204)</span>
                </div>
              </div>
            </div>

            {/* FRIDAY */}
            <div className="p-4 rounded-2xl bg-surface-container-low/50">
              <div className="flex items-center justify-between text-xs font-bold text-gray-700 mb-2">
                <span>Thứ Sáu, 02/10</span>
                <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">Ngày kiêng thịt / Đền tội</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white text-xs flex items-center justify-between">
                <span className="font-mono font-bold text-gray-600">20:30 TỐI</span>
                <span className="font-semibold text-gray-900">Ngắm Đàng Thánh Giá &amp; Kinh Tối hiệp thông</span>
                <span className="text-gray-400">Chủ sự: Văn Bình (P.102)</span>
              </div>
            </div>

            {/* SUNDAY SOLEMNITY */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200">
              <div className="flex items-center justify-between text-xs font-bold text-purple-900 mb-2">
                <span className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white px-2 py-0.5 rounded-md">
                  ✪ ĐẠI LỄ BỔN MẠNG THÁNH PHANXICÔ ASSISI
                </span>
                <span>Chúa Nhật, 04/10</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white flex items-center justify-between">
                  <span className="font-mono font-bold text-purple-700">08:30 SÁNG</span>
                  <span className="font-semibold text-gray-900">Thánh Lễ đồng tế mừng Bổn mạng Lưu Xá</span>
                  <span className="text-gray-400">Quý Cha linh hướng</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white flex items-center justify-between">
                  <span className="font-mono font-bold text-secondary">11:30 TRƯA</span>
                  <span className="font-semibold text-gray-900">Bữa cơm huynh đệ hiệp nhất với quý Ân nhân</span>
                  <span className="text-gray-400">Hội trường tầng trệt</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* PRAYER INTENTIONS & SCRIPTURE (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* INTENTIONS BOX */}
          <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Ý cầu nguyện cộng đoàn</h2>
                <p className="text-xs text-gray-500">Cùng hiệp thông nâng đỡ anh em trong lời cầu</p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-100 text-secondary text-xs font-bold rounded-full">
                {prayers.length} ý
              </span>
            </div>

            {/* SEND INTENTION FORM */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!intentionInput.trim()) return;
                addPrayer(intentionInput, isAnonymous);
                setIntentionInput("");
              }}
              className="space-y-2"
            >
              <CustomTextarea
                id="prayer-input"
                value={intentionInput}
                onChange={(e) => setIntentionInput(e.target.value)}
                placeholder="Ghi ý nguyện của bạn để anh em cùng hiệp thông..."
                rows={2}
              />

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded text-primary"
                  />
                  <span>Gửi ẩn danh</span>
                </label>

                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs transition shadow-2xs flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  <span>Gửi ý cầu</span>
                </button>
              </div>
            </form>

            {/* PRAYER CARDS */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              {prayers.map((p) => (
                <div key={p.id} className="p-3.5 rounded-2xl bg-surface-container-low/60 border border-purple-50 text-xs">
                  <p className="text-gray-900 leading-relaxed font-medium">"{p.text}"</p>
                  
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-purple-50/50 text-[11px] text-gray-400">
                    <span>{p.author} · {p.date}</span>
                    <button
                      onClick={() => togglePraying(p.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                        p.hasPrayed
                          ? "bg-primary text-white shadow-2xs"
                          : "bg-white text-gray-700 hover:bg-purple-100 border border-gray-200"
                      }`}
                    >
                      <Heart className={`w-3 h-3 ${p.hasPrayed ? "fill-white" : ""}`} />
                      <span>{p.prayingCount} người cầu nguyện</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* SCRIPTURE SHARING CARD */}
          <div className="p-5 rounded-3xl bg-purple-50/60 border border-purple-100 text-xs flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-bold">
              <BookOpen className="w-4 h-4" />
              <span>Góc Chia Sẻ Lời Chúa · Ga 14, 27</span>
            </div>
            <blockquote className="italic text-gray-800 leading-relaxed border-l-2 border-primary pl-3 my-1">
              "Thầy để lại bình an cho các con, Thầy ban bình an của Thầy cho các con. Thầy ban cho các con không theo kiểu thế gian..."
            </blockquote>
            <p className="text-[11px] text-gray-500">
              Suy niệm từ Anh Minh Tuấn: Giữa những bộn bề bài vở thi cử, xin cho mỗi anh em tìm thấy sự lắng đọng và bình an đích thực trong giờ kinh chung mỗi tối.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
