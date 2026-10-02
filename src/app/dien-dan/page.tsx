"use client";

import React, { useState } from "react";
import {
  MessagesSquare,
  Pin,
  Heart,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  Search,
} from "lucide-react";
import { useApp } from "@/lib/store";
import DienDanLoading from "./loading";

export default function DienDanPage() {
  const { threads, addReply, toggleLikeThread, openModal, isLoadingSkeleton } = useApp();

  if (isLoadingSkeleton) {
    return <DienDanLoading />;
  }

  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || "1");
  const [replyInput, setReplyInput] = useState("");
  const [filterCat, setFilterCat] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = threads
    .filter((t) => filterCat === "Tất cả" || t.category === filterCat)
    .filter(
      (t) =>
        !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.author.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || threads[0];

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              Diễn Đàn
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              {threads.length} chủ đề sôi nổi
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Chia sẻ, thảo luận và giao lưu đời sống cộng đoàn Lưu Xá Phanxicô
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openModal("createThread")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo chủ đề mới</span>
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Tổng chủ đề trao đổi</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              24 <span className="text-sm font-semibold text-gray-400">bài viết</span>
            </div>
            <span className="text-[11px] text-primary font-bold mt-1 inline-block">+3 tuần này</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold">
            💬
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Bình luận &amp; Thảo luận</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              158 <span className="text-sm font-semibold text-gray-400">lượt</span>
            </div>
            <span className="text-[11px] text-secondary font-bold mt-1 inline-block">92% phản hồi</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-secondary flex items-center justify-center font-bold">
            👥
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Chủ đề hot</span>
            <div className="text-lg font-bold text-gray-900 mt-1">
              Dã ngoại Vũng Tàu
            </div>
            <span className="text-[11px] text-amber-700 font-bold mt-1 inline-block">18 thành viên quan tâm</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            🏖️
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm chủ đề, nội dung..."
            className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["Tất cả", "Đi chơi", "Bếp & Thực đơn", "Góp ý chung", "Học tập"].map((cat) => (
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

      {/* 2 COLUMNS: THREAD LIST (7 COLS) & DETAIL VIEW (5 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* THREAD LIST (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {filteredThreads.map((t) => {
            const isSelected = t.id === selectedThread?.id;

            return (
              <div
                key={t.id}
                onClick={() => setSelectedThreadId(t.id)}
                className={`p-5 rounded-3xl cursor-pointer transition border ${
                  isSelected
                    ? "bg-purple-50/70 border-primary shadow-xs"
                    : t.isPinned
                    ? "bg-purple-50/30 border-purple-200"
                    : "bg-white hover:bg-surface-container-low border-purple-50 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {t.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded-md">
                        <Pin className="w-3 h-3" /> ĐÃ GHIM
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                      {t.category}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">{t.date}</span>
                </div>

                <h3 className="text-sm font-bold text-gray-900 hover:text-primary transition-colors">
                  {t.title}
                </h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                  {t.content}
                </p>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-purple-50/60 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                      {t.author.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-bold text-gray-900">{t.author}</span>
                    <span className="text-[11px] text-gray-400">· {t.authorRole}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-primary font-bold">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{t.repliesCount}</span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLikeThread(t.id);
                      }}
                      className="flex items-center gap-1 text-rose-600 hover:scale-110 transition-transform font-bold"
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-50" />
                      <span>{t.likesCount}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* THREAD DETAIL & QUICK REPLY (5 COLS) */}
        {selectedThread && (
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="px-2.5 py-1 bg-purple-100 text-primary text-xs font-bold rounded-lg">
                {selectedThread.category}
              </span>
              <span className="text-xs text-gray-400">{selectedThread.date}</span>
            </div>

            <div>
              <h2 className="text-base font-bold text-gray-900 leading-snug">
                {selectedThread.title}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                  {selectedThread.author.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900">{selectedThread.author}</div>
                  <div className="text-[10px] text-gray-400">{selectedThread.authorRole}</div>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed bg-surface-container-low/60 p-3.5 rounded-2xl">
              {selectedThread.content}
            </p>

            {/* REPLIES LIST */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-900">
                <span>Phản hồi ({selectedThread.replies?.length || 0})</span>
              </div>

              {selectedThread.replies && selectedThread.replies.length > 0 ? (
                selectedThread.replies.map((r) => (
                  <div key={r.id} className="p-3 rounded-2xl bg-surface-container-low/40 border border-purple-50 text-xs">
                    <div className="flex items-center justify-between font-bold text-gray-900 mb-1">
                      <span className="text-primary">{r.author}</span>
                      <span className="text-[10px] text-gray-400 font-normal">{r.time}</span>
                    </div>
                    <p className="text-gray-700">{r.content}</p>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400 italic text-center py-2">
                  Chưa có bình luận nào. Hãy là người đầu tiên trả lời!
                </div>
              )}
            </div>

            {/* QUICK REPLY BOX */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!replyInput.trim()) return;
                addReply(selectedThread.id, replyInput);
                setReplyInput("");
              }}
              className="pt-3 border-t border-gray-100 flex items-center gap-2"
            >
              <input
                type="text"
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder="Viết câu trả lời của bạn..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-container-low text-xs border border-transparent focus:border-primary focus:bg-white outline-none transition"
              />
              <button
                type="submit"
                className="p-2.5 rounded-xl bg-primary hover:bg-primary-container text-white transition shadow-xs"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

      </div>

    </div>
  );
}
