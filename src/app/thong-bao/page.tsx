"use client";

import React, { useState } from "react";
import {
  Bell,
  Pin,
  Trash2,
  Download,
  CheckCircle,
  Plus,
  ArrowLeft,
  FileText,
  User,
  Search,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { Announcement } from "@/lib/mockData";
import ThongBaoLoading from "./loading";

export default function ThongBaoPage() {
  const {
    announcements,
    togglePinAnnouncement,
    markAllAnnouncementsRead,
    markAnnouncementRead,
    openModal,
    showToast,
    isLoadingSkeleton,
  } = useApp();

  if (isLoadingSkeleton) {
    return <ThongBaoLoading />;
  }

  const [selectedAnnId, setSelectedAnnId] = useState<string>(announcements[0]?.id || "1");
  const [filterCat, setFilterCat] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmedAnns, setConfirmedAnns] = useState<Record<string, boolean>>({});

  const handleDownloadAttachment = (ann: Announcement) => {
    if (!ann.fileName) return;
    const content = `LƯU XÁ SINH VIÊN PHANXICÔ\nTÀI LIỆU ĐÍNH KÈM: ${ann.fileName}\n----------------------------------------\nTiêu đề: ${ann.title}\nNgười gửi: ${ann.author} (${ann.authorRole})\nNgày đăng: ${ann.date}\n\nNỘI DUNG:\n${ann.content}\n----------------------------------------\nLưu Xá Sinh Viên Công Giáo Phanxicô - Pax et Bonum\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ann.fileName.endsWith(".txt") ? ann.fileName : `${ann.fileName}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("success", `Đã tải xuống tệp đính kèm ${ann.fileName}!`);
  };

  const filteredAnnouncements = announcements
    .filter((a) => filterCat === "Tất cả" || a.category === filterCat)
    .filter(
      (a) =>
        !searchQuery ||
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.author.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const selectedAnn =
    announcements.find((a) => a.id === selectedAnnId) || announcements[0];

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
            Thông Báo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cập nhật mới nhất từ Ban Đại Diện và các ban sinh hoạt nhà
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={markAllAnnouncementsRead}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition"
          >
            Đánh dấu đã đọc
          </button>
          <button
            onClick={() => openModal("createAnnouncement")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo thông báo</span>
          </button>
        </div>
      </div>

      {/* CATEGORY FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm thông báo, nội dung..."
            className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["Tất cả", "Quan trọng", "Sự kiện", "Chung", "Bếp & Cơm"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition shrink-0 ${
                filterCat === cat
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 2-COLUMN SPLIT VIEW (LEFT: LIST, RIGHT: ARTICLE PREVIEW) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: LIST (5 COLS) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-4 border border-purple-50 shadow-xs flex flex-col gap-2">
          <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
            Hộp tin lưu xá ({filteredAnnouncements.length})
          </div>

          <div className="space-y-2">
            {filteredAnnouncements.map((a) => {
              const isSelected = a.id === selectedAnn?.id;

              return (
                <div
                  key={a.id}
                  onClick={() => {
                    setSelectedAnnId(a.id);
                    markAnnouncementRead(a.id);
                  }}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-purple-50/70 border-primary shadow-xs"
                      : "bg-surface-container-low/40 hover:bg-surface-container-low border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          a.isUnread ? "bg-primary" : "bg-transparent"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                        {a.category}
                      </span>
                      {a.isPinned && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                          <Pin className="w-2.5 h-2.5" /> Đã ghim
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">{a.date.split("·")[0]}</span>
                  </div>

                  <h3 className="text-xs font-bold text-gray-900 line-clamp-1">{a.title}</h3>
                  <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{a.preview}</p>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-purple-50/50 text-[10px] text-gray-400">
                    <span>{a.author}</span>
                    <span>{a.authorRole}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL VIEW (7 COLS) */}
        {selectedAnn && (
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-purple-50 shadow-xs flex flex-col gap-6">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-lg">
                {selectedAnn.category}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => togglePinAnnouncement(selectedAnn.id)}
                  className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-primary transition"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{selectedAnn.isPinned ? "Bỏ ghim" : "Ghim"}</span>
                </button>
                <span className="text-xs text-gray-400">{selectedAnn.date}</span>
              </div>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight leading-snug">
                {selectedAnn.title}
              </h2>

              <div className="flex items-center gap-3 mt-4 p-3 bg-surface-container-low/60 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-primary text-white font-bold flex items-center justify-center text-xs">
                  {selectedAnn.author.split(" ").slice(-1)[0].substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900">{selectedAnn.author}</div>
                  <div className="text-[11px] text-gray-400">{selectedAnn.authorRole}</div>
                </div>
              </div>
            </div>

            <div className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-line border-t border-gray-100 pt-4">
              {selectedAnn.content}
            </div>

            {selectedAnn.fileName && (
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">{selectedAnn.fileName}</div>
                    <div className="text-[10px] text-gray-400">1.4 MB · Tài liệu đính kèm chính thức</div>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadAttachment(selectedAnn)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 transition flex items-center gap-1.5 shadow-2xs active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải về</span>
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                <b>12 / 12</b> thành viên đã nhận được thông báo
              </span>
              <button
                onClick={() => {
                  const isConfirmed = confirmedAnns[selectedAnn.id];
                  setConfirmedAnns((prev) => ({
                    ...prev,
                    [selectedAnn.id]: !isConfirmed,
                  }));
                  showToast(
                    "success",
                    !isConfirmed
                      ? "Đã xác nhận: Bạn sẽ có mặt tham gia sự kiện!"
                      : "Đã hủy xác nhận tham dự."
                  );
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 ${
                  confirmedAnns[selectedAnn.id]
                    ? "bg-emerald-600 text-white"
                    : "bg-primary hover:bg-primary-container text-white"
                }`}
              >
                {confirmedAnns[selectedAnn.id] ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>✓ Đã xác nhận có mặt</span>
                  </>
                ) : (
                  <span>Tôi sẽ có mặt</span>
                )}
              </button>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
