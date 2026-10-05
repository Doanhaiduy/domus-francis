"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  Pin,
  Trash2,
  Download,
  CheckCircle,
  Plus,
  FileText,
  Search,
  Users,
  CalendarCheck,
  Copy,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { useApp } from "@/lib/store";
import HouseRules from "./_components/HouseRules";
import { useZaloSend } from "@/lib/zalo-client";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import type { AnnouncementDto } from "@/lib/types/community";
import {
  announcementsApi,
  refreshAnnouncements,
  useAnnouncementMeta,
  useAnnouncementReaders,
  useAnnouncements,
} from "@/lib/data/community";
import {
  formatAnnouncementForZalo,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatRelative,
} from "@/lib/community-format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import ThongBaoLoading from "./loading";

function ReadersPanel({ id }: { id: string }) {
  const { readers, isLoading } = useAnnouncementReaders(id);
  if (isLoading || !readers) return <div className="text-[11px] text-gray-400 py-2">Đang tải danh sách…</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
      <div>
        <div className="font-bold text-emerald-700 mb-1.5">Đã đọc ({readers.read.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {readers.read.map((r) => (
            <span
              key={r.member.id}
              title={`Đọc lúc ${formatDateTime(r.readAt)}${r.acknowledgedAt ? ` · xác nhận ${formatDateTime(r.acknowledgedAt)}` : ""}`}
              className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold"
            >
              {r.member.name}
              {r.acknowledgedAt ? " ✓" : ""}
            </span>
          ))}
          {readers.read.length === 0 && <span className="text-gray-400">Chưa có ai.</span>}
        </div>
      </div>
      <div>
        <div className="font-bold text-rose-600 mb-1.5">Chưa đọc ({readers.unread.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {readers.unread.map((r) => (
            <span key={r.member.id} className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-semibold">
              {r.member.name}
              {r.member.room ? ` · ${r.member.room}` : ""}
            </span>
          ))}
          {readers.unread.length === 0 && <span className="text-gray-400">Tất cả đã đọc.</span>}
        </div>
      </div>
    </div>
  );
}

export default function ThongBaoPage() {
  return (
    <Suspense fallback={<ThongBaoLoading />}>
      <ThongBaoShell />
    </Suspense>
  );
}

/** Hai mục của trang: Bảng tin (thông báo) và Luật nhà (?tab=luat). */
function ThongBaoShell() {
  const sp = useSearchParams();
  const [view, setView] = useState<"tin" | "luat">(sp.get("tab") === "luat" ? "luat" : "tin");
  const switchView = (v: "tin" | "luat") => {
    setView(v);
    try {
      window.history.replaceState(null, "", v === "luat" ? "/thong-bao?tab=luat" : "/thong-bao");
    } catch {
      /* bỏ qua */
    }
  };
  const btn = (v: "tin" | "luat") =>
    `flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
      view === v ? "bg-primary text-white shadow-xs" : "text-gray-600 hover:bg-purple-50 hover:text-primary"
    }`;
  return (
    <div className="flex flex-col w-full gap-5">
      <div className="flex gap-2 border-b border-purple-100 pb-2 overflow-x-auto custom-scroll">
        <button onClick={() => switchView("tin")} className={btn("tin")}>
          📢 Bảng tin
        </button>
        <button onClick={() => switchView("luat")} className={btn("luat")}>
          📜 Luật nhà
        </button>
      </div>
      {view === "luat" ? <HouseRules /> : <ThongBaoContent />}
    </div>
  );
}

function ThongBaoContent() {
  const { openModal, showToast, isLoadingSkeleton } = useApp();
  const { canSend: canZaloSend, sending: zaloSending, send: zaloSend } = useZaloSend();
  const deepId = useSearchParams().get("id");
  const { can } = useSession();
  const { announcements, isLoading, mutate } = useAnnouncements();
  const meta = useAnnouncementMeta();

  const [selectedAnnId, setSelectedAnnId] = useState<string>("");
  const [openedId, setOpenedId] = useState<string>("");
  const [filterCat, setFilterCat] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AnnouncementDto | null>(null);
  const [showReaders, setShowReaders] = useState(false);

  // Mở đúng thông báo khi đi tới từ hộp thư (/thong-bao?id=…)
  useEffect(() => {
    if (deepId) {
      setSelectedAnnId(deepId);
      setOpenedId(deepId);
    }
  }, [deepId]);

  const filteredAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return announcements
      .filter((a) => filterCat === "Tất cả" || a.category === filterCat)
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q)
      );
  }, [announcements, filterCat, searchQuery]);

  const selectedAnn = announcements.find((a) => a.id === selectedAnnId) || filteredAnnouncements[0] || announcements[0];

  // Bấm mở một thông báo (hoặc đi tới từ hộp thư) ⇒ ghi "đã đọc" cho chính mình (announcement_reads)
  const opened = announcements.find((a) => a.id === openedId);
  useEffect(() => {
    if (!opened?.isUnread) return;
    const id = opened.id;
    mutate((list) => list?.map((a) => (a.id === id ? { ...a, isUnread: false, readAt: new Date().toISOString() } : a)), { revalidate: false });
    announcementsApi
      .read(id)
      .then(() => refreshAnnouncements())
      .catch(() => mutate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened?.id, opened?.isUnread]);

  useEffect(() => setShowReaders(false), [selectedAnn?.id]);

  if (isLoadingSkeleton || (isLoading && announcements.length === 0)) {
    return <ThongBaoLoading />;
  }

  const categoryChips = ["Tất cả", ...meta.categories.map((c) => c.label)];

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refreshAnnouncements();
      if (ok) showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const unreadCount = announcements.filter((a) => a.isUnread).length;

  const handleCopyZalo = async (a: AnnouncementDto) => {
    await zaloSend(formatAnnouncementForZalo(a), "Đã gửi thông báo vào nhóm Zalo.");
  };

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Thông Báo</h1>
          <p className="text-sm text-gray-500 mt-1">Cập nhật mới nhất từ Ban Đại Diện và các ban sinh hoạt nhà</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => run(() => announcementsApi.readAll(), "Đã đánh dấu tất cả thông báo là đã đọc.")}
            disabled={busy || unreadCount === 0}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition disabled:opacity-50"
          >
            Đánh dấu đã đọc{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
          {can("announcement.create") && (
            <button
              onClick={() => openModal("createAnnouncement")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo thông báo</span>
            </button>
          )}
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
          {categoryChips.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition shrink-0 ${
                filterCat === cat ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
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
                    setOpenedId(a.id);
                  }}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                    isSelected ? "bg-purple-50/70 border-primary shadow-xs" : "bg-surface-container-low/40 hover:bg-surface-container-low border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${a.isUnread ? "bg-primary" : "bg-transparent"}`} />
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">{a.category}</span>
                      {a.isPinned && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                          <Pin className="w-2.5 h-2.5" /> Đã ghim
                        </span>
                      )}
                      {a.requiresAck && !a.acknowledgedAt && a.isTarget && !a.isMine && (
                        <span className="text-[10px] text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-bold">Cần xác nhận</span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">{formatRelative(a.publishedAt)}</span>
                  </div>

                  <h3 className={`text-xs text-gray-900 line-clamp-1 ${a.isUnread ? "font-extrabold" : "font-bold"}`}>{a.title}</h3>
                  <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{a.preview}</p>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-purple-50/50 text-[10px] text-gray-400">
                    <span>{a.author}</span>
                    <span>{a.authorRole}</span>
                  </div>
                </div>
              );
            })}
            {filteredAnnouncements.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-400">
                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                {announcements.length === 0 ? "Chưa có thông báo nào." : "Không có thông báo phù hợp bộ lọc."}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL VIEW (7 COLS) */}
        {selectedAnn && (
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-purple-50 shadow-xs flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-lg">{selectedAnn.category}</span>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {selectedAnn.canPin && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => announcementsApi.pin(selectedAnn.id, !selectedAnn.isPinned),
                        selectedAnn.isPinned ? "Đã bỏ ghim thông báo." : "Đã ghim thông báo lên đầu bảng tin (14 ngày)."
                      )
                    }
                    className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-primary transition disabled:opacity-50"
                  >
                    <Pin className="w-3.5 h-3.5" />
                    <span>{selectedAnn.isPinned ? "Bỏ ghim" : "Ghim"}</span>
                  </button>
                )}
                {canZaloSend && (
                  <button
                    onClick={() => handleCopyZalo(selectedAnn)}
                    disabled={zaloSending}
                    className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-primary transition disabled:opacity-60"
                    title="Gửi nội dung thông báo vào nhóm Zalo bằng bot"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{zaloSending ? "Đang gửi…" : "Gửi Zalo"}</span>
                  </button>
                )}
                {selectedAnn.canManage && (
                  <button
                    disabled={busy}
                    onClick={() => setConfirmDelete(selectedAnn)}
                    className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-rose-600 transition disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </button>
                )}
                <span className="text-xs text-gray-400">{formatDateTime(selectedAnn.publishedAt)}</span>
              </div>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight leading-snug">{selectedAnn.title}</h2>

              <div className="flex items-center justify-between gap-3 mt-4 p-3 bg-surface-container-low/60 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-white font-bold flex items-center justify-center text-xs">
                    {selectedAnn.authorRef.initials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">{selectedAnn.author}</div>
                    <div className="text-[11px] text-gray-400">{selectedAnn.authorRole}</div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-gray-500">
                  <div className="flex items-center gap-1 justify-end">
                    <Users className="w-3.5 h-3.5" />
                    <span>{selectedAnn.targetLabel}</span>
                  </div>
                  {selectedAnn.requiresAck && selectedAnn.ackDeadline && (
                    <div className="text-rose-600 font-semibold mt-0.5">Hạn xác nhận: {formatDateTime(selectedAnn.ackDeadline)}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-line border-t border-gray-100 pt-4">
              {selectedAnn.content}
            </div>

            {selectedAnn.event && (
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-900 truncate">{selectedAnn.event.title}</div>
                  <div className="text-[10px] text-gray-500">
                    {formatDateTime(selectedAnn.event.startsAt)}
                    {selectedAnn.event.location ? ` · ${selectedAnn.event.location}` : ""}
                    {selectedAnn.event.goingCount != null ? ` · ${selectedAnn.event.goingCount} anh em sẽ có mặt` : ""}
                  </div>
                </div>
              </div>
            )}

            {selectedAnn.attachments.map((f) => (
              <div key={f.id} className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">{f.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {formatFileSize(f.sizeBytes)} · {f.mime === "application/pdf" ? "Tài liệu PDF" : "Hình ảnh"} đính kèm
                    </div>
                  </div>
                </div>
                <a
                  href={f.downloadUrl}
                  download={f.name}
                  onClick={() => showToast("success", `Đang tải xuống ${f.name}…`)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 transition flex items-center gap-1.5 shadow-2xs active:scale-95 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải về</span>
                </a>
              </div>
            ))}

            <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {selectedAnn.stats.readCount != null ? (
                  <button
                    onClick={() => setShowReaders((v) => !v)}
                    className="text-xs text-gray-500 hover:text-primary flex items-center gap-1 transition"
                  >
                    <span>
                      <b>
                        {selectedAnn.stats.readCount} / {selectedAnn.stats.targetCount}
                      </b>{" "}
                      thành viên đã đọc
                      {selectedAnn.requiresAck ? (
                        <>
                          {" "}
                          · <b>{selectedAnn.stats.ackCount}</b> đã xác nhận
                        </>
                      ) : null}
                    </span>
                    {showReaders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">
                    Gửi tới <b>{selectedAnn.stats.targetCount}</b> thành viên
                    {selectedAnn.readAt ? ` · bạn đã đọc ${formatRelative(selectedAnn.readAt).toLowerCase()}` : ""}
                  </span>
                )}

                {selectedAnn.event ? (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const going = selectedAnn.event!.myRsvp !== "going";
                      run(
                        () => announcementsApi.rsvp(selectedAnn.id, going),
                        going ? "Đã xác nhận: Bạn sẽ có mặt tham gia sự kiện!" : "Đã hủy xác nhận tham dự."
                      );
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-60 ${
                      selectedAnn.event.myRsvp === "going" ? "bg-emerald-600 text-white" : "bg-primary hover:bg-primary-container text-white"
                    }`}
                  >
                    {selectedAnn.event.myRsvp === "going" ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>✓ Đã xác nhận có mặt</span>
                      </>
                    ) : (
                      <span>Tôi sẽ có mặt</span>
                    )}
                  </button>
                ) : selectedAnn.requiresAck && selectedAnn.isTarget && !selectedAnn.isMine ? (
                  <button
                    disabled={busy || !!selectedAnn.acknowledgedAt}
                    onClick={() => run(() => announcementsApi.read(selectedAnn.id, true), "Đã xác nhận bạn đã đọc và nắm rõ thông báo.")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 ${
                      selectedAnn.acknowledgedAt ? "bg-emerald-600 text-white cursor-default" : "bg-primary hover:bg-primary-container text-white"
                    }`}
                  >
                    {selectedAnn.acknowledgedAt ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>✓ Đã xác nhận {formatDate(selectedAnn.acknowledgedAt)}</span>
                      </>
                    ) : (
                      <span>Xác nhận đã đọc</span>
                    )}
                  </button>
                ) : selectedAnn.readAt && !selectedAnn.isMine ? (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Đã đọc
                  </span>
                ) : null}
              </div>
              {showReaders && selectedAnn.stats.readCount != null && (
                <div className="p-3 rounded-2xl bg-surface-container-low/50">
                  <ReadersPanel id={selectedAnn.id} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          const a = confirmDelete;
          if (!a) return;
          run(() => announcementsApi.remove(a.id), "Đã xóa thông báo khỏi bảng tin.").then(() => setSelectedAnnId(""));
        }}
        title="Xóa thông báo này?"
        message={
          <>
            Thông báo <b>{confirmDelete?.title}</b> sẽ bị gỡ khỏi bảng tin của mọi thành viên. Lượt đọc và tệp đính kèm vẫn được lưu để đối chiếu.
          </>
        }
        confirmText="Xóa thông báo"
      />
    </div>
  );
}
