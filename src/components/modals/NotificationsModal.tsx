"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Bell, CheckCheck, ArrowRight, Pin, Inbox, Megaphone } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import type { NotificationDto } from "@/lib/types/community";
import { announcementsApi, notificationsApi, refreshAnnouncements, useNotifications } from "@/lib/data/community";
import { announcementChipClass, formatRelative } from "@/lib/community-format";

const CATEGORY_ICON: Record<string, string> = {
  announcement: "📢",
  finance: "💰",
  duty: "🧹",
  event: "📅",
  academic: "📚",
  facility: "🔧",
  laundry: "🧺",
  meal: "🍳",
  social: "💬",
  security: "🔐",
  system: "⚙️",
};

export default function NotificationsModal() {
  const { closeModal, showToast } = useApp();
  const router = useRouter();
  const { data, isLoading, mutate } = useNotifications();
  const unread = data?.unread ?? { announcementsUnread: 0, notificationsUnread: 0 };
  const [tab, setTab] = useState<"inbox" | "board" | null>(null);
  const activeTab = tab ?? (unread.notificationsUnread === 0 && unread.announcementsUnread > 0 ? "board" : "inbox");
  const totalUnread = unread.notificationsUnread + unread.announcementsUnread;

  const markAll = async () => {
    try {
      await notificationsApi.readAll(true);
      await refreshAnnouncements();
      showToast("success", "Đã đánh dấu tất cả là đã đọc.");
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  const openNotification = async (n: NotificationDto) => {
    if (!n.isRead) {
      mutate(
        (d) => d && { ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)), unread: { ...d.unread, notificationsUnread: Math.max(0, d.unread.notificationsUnread - 1) } },
        { revalidate: false }
      );
      notificationsApi
        .read(n.id)
        .then(() => refreshAnnouncements())
        .catch(() => mutate());
    }
    if (n.link) {
      closeModal();
      router.push(n.link);
    }
  };

  const openAnnouncement = (id: string, isUnread: boolean) => {
    if (isUnread) {
      announcementsApi
        .read(id)
        .then(() => refreshAnnouncements())
        .catch(() => undefined);
    }
    closeModal();
    router.push(`/thong-bao?id=${id}`);
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Thông báo cộng đoàn</h3>
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-extrabold">{totalUnread} mới</span>
            </div>
            <p className="text-xs text-gray-400">Tin tức, hoạt động và thông tri nội bộ</p>
          </div>
        </div>
        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Actions Bar */}
      <div className="py-2.5 px-6 flex items-center justify-between text-xs border-b border-gray-50 shrink-0 bg-gray-50/40">
        <button
          onClick={markAll}
          disabled={totalUnread === 0}
          className="inline-flex items-center gap-1.5 text-primary hover:text-primary-container font-semibold transition disabled:opacity-50"
        >
          <CheckCheck className="w-4 h-4" />
          <span>Đánh dấu tất cả đã đọc</span>
        </button>
        <Link
          href="/thong-bao"
          onClick={closeModal}
          className="inline-flex items-center gap-1 text-gray-500 hover:text-primary font-semibold transition"
        >
          <span>Xem trên Bảng tin</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="px-5 sm:px-6 pt-4 flex items-center gap-2 shrink-0">
        {(
          [
            ["inbox", "Hộp thư", unread.notificationsUnread, Inbox],
            ["board", "Bảng tin", unread.announcementsUnread, Megaphone],
          ] as const
        ).map(([key, label, n, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === key ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {n > 0 && (
              <span className={`px-1.5 rounded-full text-[10px] ${activeTab === key ? "bg-white/25" : "bg-rose-100 text-rose-600"}`}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {/* List (Scrollable) */}
      <div className="overflow-y-auto p-5 sm:p-6 space-y-2.5 flex-1 min-h-0">
        {isLoading && !data && <div className="py-8 text-center text-xs text-gray-400">Đang tải thông báo…</div>}

        {activeTab === "inbox" &&
          data?.items.map((n) => (
            <div
              key={n.id}
              onClick={() => openNotification(n)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                !n.isRead ? "bg-purple-50/50 border-purple-200 shadow-2xs" : "bg-surface-container-low/40 border-transparent hover:bg-surface-container-low"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm">{CATEGORY_ICON[n.category] ?? "🔔"}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-primary truncate">{n.typeName}</span>
                  {(n.priority === "high" || n.priority === "urgent") && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Quan trọng</span>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{formatRelative(n.createdAt)}</span>
              </div>
              <h4 className="text-xs font-bold text-gray-900 mt-1.5 leading-snug">{n.title}</h4>
              {n.body && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{n.body}</p>}
              {!n.isRead && (
                <div className="flex justify-end mt-1.5 text-[10px]">
                  <span className="text-primary font-bold">● Chưa đọc</span>
                </div>
              )}
            </div>
          ))}
        {activeTab === "inbox" && data && data.items.length === 0 && (
          <div className="py-10 text-center text-xs text-gray-400">
            <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            Hộp thư trống.
          </div>
        )}

        {activeTab === "board" &&
          data?.announcements.map((ann) => (
            <div
              key={ann.id}
              onClick={() => openAnnouncement(ann.id, ann.isUnread)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                ann.isUnread ? "bg-purple-50/50 border-purple-200 shadow-2xs" : "bg-surface-container-low/40 border-transparent hover:bg-surface-container-low"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${announcementChipClass(ann.categoryCode)}`}>{ann.category}</span>
                  {ann.isPinned && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                      <Pin className="w-3 h-3 text-amber-600 fill-amber-500" /> Ghim
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{formatRelative(ann.publishedAt)}</span>
              </div>

              <h4 className="text-xs font-bold text-gray-900 mt-1.5 leading-snug">{ann.title}</h4>
              <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{ann.preview}</p>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-purple-100/40 text-[10px] text-gray-400">
                <span>
                  Đăng bởi: <b>{ann.author}</b> ({ann.authorRole})
                </span>
                {ann.isUnread && <span className="text-primary font-bold">● Chưa đọc</span>}
              </div>
            </div>
          ))}
        {activeTab === "board" && data && data.announcements.length === 0 && (
          <div className="py-10 text-center text-xs text-gray-400">Chưa có thông báo nào trên bảng tin.</div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end bg-gray-50/70">
        <button onClick={closeModal} className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition">
          Đóng
        </button>
      </div>
    </div>
  );
}
