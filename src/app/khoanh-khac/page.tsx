"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Camera,
  Heart,
  Calendar,
  MapPin,
  Users,
  Plus,
  Search,
  Sparkles,
  Share2,
  Download,
  X,
  Grid,
  Clock,
  Maximize2,
  Eye,
  EyeOff,
  Tag,
  Image as ImageIcon,
  ImageUp,
  FolderPlus,
  Folder,
  FolderOpen,
  ArrowLeft,
  Upload,
  Pencil,
  Trash2,
  Star,
  StarOff,
  MessageCircle,
  UserCheck,
  UserX,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect, SelectOption } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import KhoanhKhacLoading from "./loading";
import { cn } from "@/lib/utils";
import { useZaloSend } from "@/lib/zalo-client";
import { forgetAlbumAndRefresh, momentsApi, refreshMoments, useMomentAlbum, useMoments } from "@/lib/data/moments";
import { formatAlbumZalo, initials } from "@/lib/moments-format";
import type { MomentAlbumDetailDto, MomentAlbumDto, MomentListFilter, MomentPhotoDto } from "@/lib/types/moments";
import { categoryStyle, CoverLayer } from "./_components/styles";
import { AlbumFormModal } from "./_components/AlbumFormModal";
import { AddPhotosModal } from "./_components/AddPhotosModal";
import { CaptionModal } from "./_components/CaptionModal";
import { PhotoLightbox } from "./_components/PhotoLightbox";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface ConfirmState {
  title: string;
  message: React.ReactNode;
  confirmText: string;
  action: () => Promise<void>;
}

const monthSelectOptions: SelectOption<number | "all">[] = [
  { value: "all", label: "Tất cả tháng" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${String(i + 1).padStart(2, "0")}` })),
];

export default function KhoanhKhacPage() {
  const { members, showToast, isLoadingSkeleton } = useApp();
  const { canSend: canZaloSend, sending: zaloSending, send: zaloSend } = useZaloSend();
  const { can, session } = useSession();
  const canCreate = can("album.create");

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter States (lọc ở máy chủ)
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "timeline">("grid");
  const debouncedSearch = useDebounced(searchTerm.trim(), 300);
  const debouncedDate = useDebounced(selectedDate.trim(), 300);

  const filter = useMemo<MomentListFilter>(
    () => ({
      category: selectedCategory === "all" ? undefined : selectedCategory,
      year: selectedYear === "all" ? undefined : selectedYear,
      month: selectedMonth === "all" ? undefined : selectedMonth,
      day: debouncedDate || undefined,
      featured: onlyFeatured || undefined,
      q: debouncedSearch || undefined,
    }),
    [selectedCategory, selectedYear, selectedMonth, debouncedDate, onlyFeatured, debouncedSearch]
  );
  const { data, error, isLoading, mutate: mutateList } = useMoments(filter);
  const filteredMoments = data?.albums ?? [];
  const categories = data?.categories ?? [];
  const canModerate = data?.canModerate ?? can("album.moderate");

  // Active Album Folder View State (đồng bộ ?album=<id> để mở thẳng album)
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("album");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setActiveAlbumId(id);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const url = new URL(window.location.href);
    if (activeAlbumId) url.searchParams.set("album", activeAlbumId);
    else url.searchParams.delete("album");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, [activeAlbumId, mounted]);

  const { album: albumDetail, error: albumError, mutate: mutateAlbum } = useMomentAlbum(activeAlbumId);
  const activeAlbum: MomentAlbumDto | null = useMemo(
    () =>
      albumDetail ??
      filteredMoments.find((m) => m.id === activeAlbumId) ??
      (data?.featured?.id === activeAlbumId ? data?.featured : null) ??
      null,
    [albumDetail, filteredMoments, activeAlbumId, data]
  );
  const photos = albumDetail?.photos ?? [];

  useEffect(() => {
    if (albumError && activeAlbumId) {
      showToast("error", errorMessage(albumError));
      setActiveAlbumId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumError]);

  const openAlbum = (id: string) => {
    setActiveAlbumId(id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddPhotoModalOpen, setIsAddPhotoModalOpen] = useState(false);
  const [captionPhoto, setCaptionPhoto] = useState<MomentPhotoDto | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // Cập nhật bộ nhớ đệm SWR
  // ---------------------------------------------------------------
  const patchAlbumEverywhere = (id: string, fn: (a: MomentAlbumDto) => MomentAlbumDto) => {
    void mutateList(
      (d) =>
        d && {
          ...d,
          albums: d.albums.map((a) => (a.id === id ? fn(a) : a)),
          featured: d.featured && d.featured.id === id ? fn(d.featured) : d.featured,
        },
      { revalidate: false }
    );
    void mutateAlbum((d) => (d && d.id === id ? { ...d, ...fn(d) } : d), { revalidate: false });
  };
  const applySavedAlbum = (saved: MomentAlbumDetailDto) => {
    void mutateAlbum(saved, { revalidate: false });
    void refreshMoments();
  };

  // ---------------------------------------------------------------
  // Tim album / ảnh (mỗi người một lượt — DB giữ khóa chính và bộ đếm)
  // ---------------------------------------------------------------
  const pendingLikes = useRef(new Set<string>());
  const toggleLikeMoment = async (album: MomentAlbumDto) => {
    const key = `a:${album.id}`;
    if (pendingLikes.current.has(key)) return;
    pendingLikes.current.add(key);
    const next = !album.isLiked;
    patchAlbumEverywhere(album.id, (a) => ({ ...a, isLiked: next, likesCount: Math.max(0, a.likesCount + (next ? 1 : -1)) }));
    try {
      const r = await momentsApi.likeAlbum(album.id, next);
      patchAlbumEverywhere(album.id, (a) => ({ ...a, isLiked: r.liked, likesCount: r.likesCount }));
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      pendingLikes.current.delete(key);
      void refreshMoments();
    }
  };

  const togglePhotoLike = async (photo: MomentPhotoDto) => {
    const key = `p:${photo.id}`;
    if (pendingLikes.current.has(key)) return;
    pendingLikes.current.add(key);
    const next = !photo.isLiked;
    const patch = (fn: (p: MomentPhotoDto) => MomentPhotoDto) =>
      mutateAlbum((d) => d && { ...d, photos: d.photos.map((p) => (p.id === photo.id ? fn(p) : p)) }, { revalidate: false });
    void patch((p) => ({ ...p, isLiked: next, likesCount: Math.max(0, p.likesCount + (next ? 1 : -1)) }));
    try {
      const r = await momentsApi.likePhoto(photo.id, next);
      void patch((p) => ({ ...p, isLiked: r.liked, likesCount: r.likesCount }));
    } catch (e) {
      showToast("error", errorMessage(e));
      void mutateAlbum();
    } finally {
      pendingLikes.current.delete(key);
    }
  };

  // ---------------------------------------------------------------
  // Thao tác album / ảnh
  // ---------------------------------------------------------------
  const runBusy = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handleCopyAlbumZalo = async (album: MomentAlbumDto) => {
    let text = formatAlbumZalo(album, albumDetail?.id === album.id ? photos.length : undefined);
    if (typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      text += `\n🔗 ${window.location.origin}/khoanh-khac?album=${album.id}`;
    }
    await zaloSend(text, `Đã gửi tóm tắt album "${album.title}" vào nhóm Zalo.`);
  };

  const toggleFeatured = (album: MomentAlbumDto) =>
    runBusy("feature", async () => {
      const saved = await momentsApi.update(album.id, { isFeatured: !album.isFeatured });
      applySavedAlbum(saved);
      showToast("success", saved.isFeatured ? `Đã đánh dấu "${saved.title}" là khoảnh khắc tiêu biểu.` : `Đã bỏ đánh dấu tiêu biểu cho "${saved.title}".`);
    });

  const toggleHidden = (album: MomentAlbumDto) =>
    runBusy("hide", async () => {
      const saved = await momentsApi.update(album.id, { hidden: album.status !== "hidden" });
      applySavedAlbum(saved);
      showToast("success", saved.status === "hidden" ? `Đã ẩn album "${saved.title}" khỏi cộng đoàn.` : `Album "${saved.title}" đã hiển thị lại.`);
    });

  const askDeleteAlbum = (album: MomentAlbumDto) =>
    setConfirm({
      title: "Xóa album kỷ niệm?",
      message: (
        <>
          Album <b>{album.title}</b> cùng {album.photosCount} ảnh sẽ bị gỡ khỏi thư viện Khoảnh khắc.
          {!album.isMine && " Bạn đang xóa với quyền kiểm duyệt album."}
        </>
      ),
      confirmText: "Xóa album",
      action: async () => {
        await momentsApi.remove(album.id);
        showToast("success", `Đã xóa album "${album.title}".`);
        setLightboxIndex(null);
        setActiveAlbumId(null);
        void forgetAlbumAndRefresh(album.id);
      },
    });

  const askDeletePhoto = (photo: MomentPhotoDto, index: number) =>
    setConfirm({
      title: "Xóa ảnh khỏi album?",
      message: (
        <>
          Ảnh #{index + 1}
          {photo.caption ? <> “{photo.caption}”</> : null} sẽ bị gỡ khỏi album.
          {!photo.isMine && " Bạn đang xóa với quyền kiểm duyệt album."}
        </>
      ),
      confirmText: "Xóa ảnh",
      action: async () => {
        const saved = await momentsApi.removePhoto(photo.id);
        applySavedAlbum(saved);
        if (lightboxIndex !== null) setLightboxIndex(saved.photos.length ? Math.min(lightboxIndex, saved.photos.length - 1) : null);
        showToast("success", "Đã xóa ảnh khỏi album.");
      },
    });

  const setAsCover = (album: MomentAlbumDto, photo: MomentPhotoDto) =>
    runBusy(`cover:${photo.id}`, async () => {
      const saved = await momentsApi.update(album.id, { coverFileId: photo.fileId });
      applySavedAlbum(saved);
      showToast("success", "Đã đặt ảnh này làm ảnh bìa album.");
    });

  const respondTag = (album: MomentAlbumDto, status: "accepted" | "declined") =>
    runBusy(`tag:${status}`, async () => {
      const saved = await momentsApi.respondTag(album.id, status);
      applySavedAlbum(saved);
      showToast("success", status === "accepted" ? "Đã xác nhận thẻ tên của bạn trong album." : "Đã gỡ thẻ tên của bạn khỏi album.");
    });

  const resetFilters = () => {
    setSelectedYear("all");
    setSelectedMonth("all");
    setSelectedCategory("all");
    setSelectedDate("");
    setSearchTerm("");
    setOnlyFeatured(false);
  };

  if (isLoadingSkeleton || (!data && !error)) {
    return <KhoanhKhacLoading />;
  }

  if (!data) {
    return (
      <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto pb-16">
        <div className="py-16 bg-white rounded-3xl border border-dashed border-rose-200 text-center flex flex-col items-center justify-center p-6 gap-3">
          <Camera className="w-10 h-10 text-[#fda4af]" />
          <h3 className="text-base font-bold text-gray-900">Không tải được thư viện khoảnh khắc</h3>
          <p className="text-xs text-gray-500 max-w-sm">{errorMessage(error)}</p>
          <button onClick={() => void mutateList()} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs inline-flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      </div>
    );
  }

  const { stats } = data;
  const availableYears = stats.years;
  const featuredAlbum = data.featured;
  const filtersActive = selectedYear !== "all" || selectedMonth !== "all" || selectedCategory !== "all" || selectedDate !== "" || searchTerm !== "" || onlyFeatured;
  const selectedCategoryName = categories.find((c) => c.id === selectedCategory)?.name;
  const myTag = activeAlbum?.participants.find((p) => p.isMe);
  const actionBtn =
    "flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-60";

  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto pb-16">
      {/* 1. HEADER & KPI STATS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-200">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Lưu Khoảnh Khắc &amp; Kỷ Niệm</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">Pax et Bonum</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Nơi lưu giữ những hành trình đức tin, dã ngoại, đại lễ bổn mạng và từng bữa cơm huynh đệ
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeAlbumId ? (
            <button
              onClick={() => setActiveAlbumId(null)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary font-bold text-xs transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← Trở về danh sách album</span>
            </button>
          ) : (
            canCreate && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Tạo Album Mới</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* 2. MAIN BODY: ALBUM FOLDER GALLERY VIEW vs ALL ALBUMS VIEW */}
      {activeAlbumId ? (
        !activeAlbum ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-purple-50 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-gray-500">Đang mở thư mục album…</p>
          </div>
        ) : (
          /* ALBUM FOLDER GALLERY VIEW */
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            {/* Breadcrumb Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => setActiveAlbumId(null)}
                  className="text-gray-500 hover:text-primary font-bold flex items-center gap-1.5 transition active:scale-95"
                >
                  <Folder className="w-4 h-4 text-purple-500" />
                  <span>Tất cả Album</span>
                </button>
                <span className="text-gray-300">/</span>
                <span className="text-purple-700 font-semibold px-2.5 py-0.5 rounded-lg bg-purple-50 border border-purple-100">{activeAlbum.category}</span>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-black truncate max-w-[200px] sm:max-w-md">{activeAlbum.title}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveAlbumId(null)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition active:scale-95"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>← Trở về danh sách Album</span>
                </button>
              </div>
            </div>

            {/* Album Hero Info Card */}
            <div className="bg-white rounded-3xl border border-purple-100 shadow-sm overflow-hidden">
              <div className="relative min-h-[16rem] sm:h-80 lg:h-96 w-full overflow-hidden">
                <CoverLayer url={activeAlbum.coverUrl} code={activeAlbum.categoryCode} className="transition-transform duration-700 hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950/95 via-gray-950/50 to-transparent" />

                <div className="relative sm:absolute sm:inset-0 min-h-[16rem] sm:min-h-0 p-6 sm:p-8 flex flex-col justify-between gap-6 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "px-3 py-1 rounded-xl text-xs font-bold border backdrop-blur-md",
                          categoryStyle(activeAlbum.categoryCode).bg,
                          categoryStyle(activeAlbum.categoryCode).text,
                          categoryStyle(activeAlbum.categoryCode).border
                        )}
                      >
                        {activeAlbum.category}
                      </span>
                      <span className="px-3 py-1 rounded-xl bg-black/50 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5 text-[#d8b4fe]" />
                        Thư mục Album ({activeAlbum.photosCount} ảnh)
                      </span>
                      {activeAlbum.isFeatured && (
                        <span className="px-3 py-1 rounded-xl bg-primary/90 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#fcd34d]" />
                          Tiêu biểu
                        </span>
                      )}
                      {activeAlbum.status === "hidden" && (
                        <span className="px-3 py-1 rounded-xl bg-amber-500/90 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5">
                          <EyeOff className="w-3.5 h-3.5" />
                          Đang ẩn khỏi cộng đoàn
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void toggleLikeMoment(activeAlbum)}
                        className={cn(
                          "px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition backdrop-blur-md active:scale-95",
                          activeAlbum.isLiked ? "bg-rose-500 text-white shadow-md shadow-rose-500/30" : "bg-white/20 hover:bg-white/30 text-white"
                        )}
                      >
                        <Heart className={cn("w-3.5 h-3.5", activeAlbum.isLiked && "fill-current")} />
                        <span>{activeAlbum.likesCount} Yêu thích</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight drop-shadow-md">{activeAlbum.title}</h1>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#e5e7eb] font-medium">
                      <span className="flex items-center gap-1.5 drop-shadow-xs">
                        <Calendar className="w-4 h-4 text-[#d8b4fe]" />
                        {activeAlbum.date}
                      </span>
                      {activeAlbum.location && (
                        <span className="flex items-center gap-1.5 drop-shadow-xs">
                          <MapPin className="w-4 h-4 text-rose-400" />
                          {activeAlbum.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 drop-shadow-xs">
                        <Camera className="w-4 h-4 text-[#fcd34d]" />
                        Người đăng: {activeAlbum.author.fullName} ({activeAlbum.author.role})
                      </span>
                      <span className="flex items-center gap-1.5 drop-shadow-xs">
                        <ImageIcon className="w-4 h-4 text-cyan-300" />
                        {activeAlbum.photosCount} hình ảnh
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description, Tags, Participants & Action Buttons */}
              <div className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-6 bg-white">
                <div className="space-y-4 max-w-3xl flex-1">
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ý nghĩa &amp; Câu chuyện kỷ niệm</h3>
                    <p className="text-sm text-gray-700 leading-relaxed font-normal whitespace-pre-line">
                      {activeAlbum.description || "Chùm ảnh kỷ niệm ý nghĩa của anh em Lưu Xá Phanxicô."}
                    </p>
                  </div>

                  {/* Tags */}
                  {activeAlbum.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0 mr-1" />
                      {activeAlbum.tags.map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setSearchTerm(t);
                            setActiveAlbumId(null);
                          }}
                          title="Tìm các album cùng hashtag"
                          className="px-2.5 py-1 rounded-lg bg-surface-container-low text-xs font-semibold text-purple-700 hover:bg-purple-100 transition"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Participants */}
                  {activeAlbum.participants.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-primary" />
                        Anh em đồng hành ({activeAlbum.participants.filter((p) => p.status === "accepted").length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {activeAlbum.participants.map((p) => (
                          <span
                            key={p.memberId}
                            title={p.status === "pending" ? "Chờ thành viên xác nhận thẻ tên" : undefined}
                            className={cn(
                              "px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5",
                              p.status === "pending" ? "bg-white text-gray-500 border-dashed border-gray-300" : "bg-purple-50 text-purple-800 border-purple-100"
                            )}
                          >
                            <span
                              className={cn(
                                "w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center font-bold",
                                p.status === "pending" ? "bg-gray-400" : "bg-purple-600"
                              )}
                            >
                              {p.fullName.split(/\s+/).pop()?.charAt(0)}
                            </span>
                            <span>{p.fullName}</span>
                            {p.status === "pending" && <span className="text-[10px] font-semibold text-amber-600">(chờ xác nhận)</span>}
                          </span>
                        ))}
                      </div>
                      {myTag && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                          {myTag.status === "pending" ? (
                            <>
                              <span className="text-gray-500 font-medium">Bạn được gắn thẻ trong album này:</span>
                              <button
                                disabled={!!busy}
                                onClick={() => respondTag(activeAlbum, "accepted")}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 transition"
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Xác nhận
                              </button>
                              <button
                                disabled={!!busy}
                                onClick={() => respondTag(activeAlbum, "declined")}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 transition"
                              >
                                <UserX className="w-3.5 h-3.5" /> Từ chối
                              </button>
                            </>
                          ) : (
                            <button
                              disabled={!!busy}
                              onClick={() => respondTag(activeAlbum, "declined")}
                              className="inline-flex items-center gap-1 text-gray-400 hover:text-rose-600 font-semibold transition"
                            >
                              <UserX className="w-3.5 h-3.5" /> Gỡ thẻ tên của tôi khỏi album
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row lg:flex-col flex-wrap gap-2.5 shrink-0 w-full lg:w-60 pt-4 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                  <button
                    onClick={() => setLightboxIndex(0)}
                    disabled={!albumDetail || photos.length === 0}
                    className={cn(actionBtn, "bg-primary hover:bg-[#4d2dbf] text-white shadow-md shadow-purple-200")}
                  >
                    <Eye className="w-4 h-4" />
                    <span>Trình chiếu ({photos.length || activeAlbum.photosCount} ảnh)</span>
                  </button>

                  {activeAlbum.canAddPhotos && (
                    <button
                      onClick={() => setIsAddPhotoModalOpen(true)}
                      className={cn(actionBtn, "bg-purple-50 hover:bg-purple-100 text-primary border border-purple-200")}
                    >
                      <Upload className="w-4 h-4" />
                      <span>+ Thêm ảnh vào album</span>
                    </button>
                  )}

                  {canZaloSend && (
                    <button disabled={zaloSending} onClick={() => void handleCopyAlbumZalo(activeAlbum)} className={cn(actionBtn, "bg-surface-container-low hover:bg-purple-100 text-gray-700 disabled:opacity-60")}>
                      <Share2 className="w-4 h-4 text-purple-600" />
                      <span>{zaloSending ? "Đang gửi…" : "Gửi nhóm Zalo"}</span>
                    </button>
                  )}

                  {activeAlbum.canEdit && (
                    <button
                      onClick={() => setIsEditModalOpen(true)}
                      disabled={!albumDetail}
                      className={cn(actionBtn, "bg-surface-container-low hover:bg-purple-100 text-gray-700")}
                    >
                      <Pencil className="w-4 h-4 text-purple-600" />
                      <span>Chỉnh sửa album</span>
                    </button>
                  )}

                  {canModerate && (
                    <>
                      <button
                        onClick={() => toggleFeatured(activeAlbum)}
                        disabled={!!busy}
                        className={cn(actionBtn, "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200")}
                      >
                        {busy === "feature" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : activeAlbum.isFeatured ? (
                          <StarOff className="w-4 h-4" />
                        ) : (
                          <Star className="w-4 h-4" />
                        )}
                        <span>{activeAlbum.isFeatured ? "Bỏ đánh dấu tiêu biểu" : "Đánh dấu tiêu biểu"}</span>
                      </button>
                      <button
                        onClick={() => toggleHidden(activeAlbum)}
                        disabled={!!busy}
                        className={cn(actionBtn, "bg-surface-container-low hover:bg-gray-200 text-gray-700")}
                      >
                        {busy === "hide" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : activeAlbum.status === "hidden" ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                        <span>{activeAlbum.status === "hidden" ? "Hiển thị lại album" : "Ẩn album (kiểm duyệt)"}</span>
                      </button>
                    </>
                  )}

                  {activeAlbum.canDelete && (
                    <button onClick={() => askDeleteAlbum(activeAlbum)} className={cn(actionBtn, "bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100")}>
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa album</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Album Gallery Section Header */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold shadow-xs">
                  <Grid className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">Thư Viện Ảnh ({photos.length || activeAlbum.photosCount} bức ảnh)</h2>
                  <p className="text-xs text-gray-500">Nhấn vào bất kỳ ảnh nào để phóng to, trình chiếu và lướt xem ảnh chất lượng cao</p>
                </div>
              </div>

              {activeAlbum.canAddPhotos && (
                <button
                  onClick={() => setIsAddPhotoModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] shadow-xs active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Thêm ảnh mới</span>
                </button>
              )}
            </div>

            {/* Photo Gallery Grid */}
            {!albumDetail ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
                {Array.from({ length: Math.min(8, Math.max(1, activeAlbum.photosCount)) }, (_, i) => (
                  <div key={i} className="aspect-[4/3] rounded-2xl bg-gray-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    onClick={() => setLightboxIndex(index)}
                    className="group relative bg-white rounded-2xl overflow-hidden border border-purple-50 shadow-2xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    {/* Photo Image with Aspect Ratio */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption || `Ảnh #${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                        <span className="text-white text-xs font-medium line-clamp-2 drop-shadow-xs">{photo.caption}</span>
                      </div>

                      {/* Photo Index Badge */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono font-bold">#{index + 1}</span>
                        {photo.isCover && <span className="px-2 py-0.5 rounded-lg bg-primary/90 text-white text-[10px] font-bold">Ảnh bìa</span>}
                        {photo.status === "hidden" && <span className="px-2 py-0.5 rounded-lg bg-amber-500/90 text-white text-[10px] font-bold">Đang ẩn</span>}
                      </div>

                      {/* Hover actions */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <a
                          href={photo.downloadUrl}
                          download
                          onClick={(e) => e.stopPropagation()}
                          title="Tải ảnh gốc về máy"
                          className="w-7 h-7 rounded-lg bg-white/85 backdrop-blur-xs text-gray-800 flex items-center justify-center shadow-xs hover:bg-white"
                        >
                          <Download className="w-3.5 h-3.5 text-primary" />
                        </a>
                        {photo.isMine && activeAlbum.canEdit && !photo.isCover && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAsCover(activeAlbum, photo);
                            }}
                            title="Đặt làm ảnh bìa album"
                            className="w-7 h-7 rounded-lg bg-white/85 backdrop-blur-xs flex items-center justify-center shadow-xs hover:bg-white"
                          >
                            {busy === `cover:${photo.id}` ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" /> : <ImageUp className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        )}
                        {photo.canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCaptionPhoto(photo);
                            }}
                            title="Sửa chú thích ảnh"
                            className="w-7 h-7 rounded-lg bg-white/85 backdrop-blur-xs flex items-center justify-center shadow-xs hover:bg-white"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-primary" />
                          </button>
                        )}
                        {photo.canDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              askDeletePhoto(photo, index);
                            }}
                            title="Xóa ảnh khỏi album"
                            className="w-7 h-7 rounded-lg bg-white/85 backdrop-blur-xs flex items-center justify-center shadow-xs hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}
                        <span className="w-7 h-7 rounded-lg bg-white/85 backdrop-blur-xs flex items-center justify-center shadow-xs">
                          <Maximize2 className="w-3.5 h-3.5 text-primary" />
                        </span>
                      </div>
                    </div>

                    {/* Bottom metadata */}
                    <div className="p-3 bg-white flex items-center justify-between gap-2 border-t border-gray-50">
                      <div className="truncate">
                        <p className="text-xs font-bold text-gray-800 truncate group-hover:text-primary transition-colors">{photo.caption || `Ảnh #${index + 1}`}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {photo.uploadedBy.name} • {photo.date}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void togglePhotoLike(photo);
                        }}
                        title={photo.isLiked ? "Bỏ thích ảnh" : "Thích ảnh này"}
                        className={cn(
                          "shrink-0 text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded-lg transition",
                          photo.isLiked ? "text-rose-500 bg-rose-50" : "text-gray-400 hover:text-rose-500 hover:bg-rose-50"
                        )}
                      >
                        <Heart className={cn("w-3 h-3", photo.isLiked && "fill-rose-500 text-rose-500")} />
                        {photo.likesCount}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {albumDetail && photos.length === 0 && (
              <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-200 space-y-3">
                <Camera className="w-10 h-10 text-gray-300 mx-auto" />
                <h3 className="text-sm font-bold text-gray-800">Album này chưa có bức ảnh nào</h3>
                <p className="text-xs text-gray-400">
                  {activeAlbum.canAddPhotos ? "Hãy thêm những bức ảnh đầu tiên cho album kỷ niệm này nhé!" : "Người tạo album chưa tải ảnh lên."}
                </p>
                {activeAlbum.canAddPhotos && (
                  <button
                    onClick={() => setIsAddPhotoModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-[#4d2dbf] transition"
                  >
                    + Thêm ảnh ngay
                  </button>
                )}
              </div>
            )}
          </div>
        )
      ) : (
        /* ALL ALBUMS VIEW: STATS, FEATURED BANNER, FILTERS, LIST */
        <>
          {/* STATS KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tổng Album</span>
                <div className="text-2xl font-black text-gray-900 mt-1">{stats.albums}</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                <FolderPlus className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Bức ảnh lưu giữ</span>
                <div className="text-2xl font-black text-gray-900 mt-1">{stats.photos}</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <ImageIcon className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Niên khóa lưu giữ</span>
                <div className="text-2xl font-black text-gray-900 mt-1">
                  {availableYears.length > 0 ? `${availableYears[availableYears.length - 1]} - Nay` : "Chưa có"}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Calendar className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Lượt yêu thích</span>
                <div className="text-2xl font-black text-rose-500 mt-1">{stats.likes} ❤️</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center font-bold">
                <Heart className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* FEATURED HIGHLIGHT BANNER */}
          {featuredAlbum && selectedCategory === "all" && selectedYear === "all" && searchTerm === "" && (
            <div className="relative w-full rounded-3xl overflow-hidden border border-purple-100 shadow-md group">
              <CoverLayer url={featuredAlbum.coverUrl} code={featuredAlbum.categoryCode} className="transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent" />

              <div className="relative z-10 p-6 md:p-8 flex flex-col justify-end min-h-[300px] text-white">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-3 py-1 rounded-full bg-primary/90 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-[#fcd34d]" />
                    {featuredAlbum.isFeatured ? "Khoảnh khắc tiêu biểu" : "Khoảnh khắc mới nhất"}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold">{featuredAlbum.category}</span>
                  {featuredAlbum.location && (
                    <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-[#e5e7eb] text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-400" />
                      {featuredAlbum.location}
                    </span>
                  )}
                </div>

                <h2 className="text-xl md:text-3xl font-extrabold text-white tracking-tight mb-2 max-w-3xl drop-shadow-sm">{featuredAlbum.title}</h2>

                <p className="text-xs md:text-sm text-[#e5e7eb] line-clamp-2 max-w-2xl mb-4 font-normal leading-relaxed drop-shadow-xs">{featuredAlbum.description}</p>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-purple-500/80 backdrop-blur-xs flex items-center justify-center text-xs font-bold">
                        {initials(featuredAlbum.author.fullName)}
                      </div>
                      <span className="text-xs font-medium text-[#e5e7eb]">
                        {featuredAlbum.author.fullName} ({featuredAlbum.author.role}) • {featuredAlbum.date}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-white/20 text-xs text-[#d1d5db]">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{featuredAlbum.photosCount} bức ảnh</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void toggleLikeMoment(featuredAlbum)}
                      className={cn(
                        "px-3 py-2 rounded-xl backdrop-blur-md text-xs font-bold flex items-center gap-1.5 transition-colors",
                        featuredAlbum.isLiked ? "bg-rose-500 text-white" : "bg-white/20 hover:bg-white/30 text-white"
                      )}
                    >
                      <Heart className={cn("w-3.5 h-3.5", featuredAlbum.isLiked && "fill-current")} />
                      <span>{featuredAlbum.likesCount}</span>
                    </button>

                    <button
                      onClick={() => openAlbum(featuredAlbum.id)}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-900 text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-primary" />
                      <span>Mở thư mục Album ({featuredAlbum.photosCount} ảnh)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* COMPREHENSIVE FILTER & SEARCH TOOLBAR */}
          <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
            {/* Row 1: Year selection pills & View mode switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 sm:pb-0">
                <span className="text-xs font-bold text-gray-400 mr-2 shrink-0">Niên khóa:</span>
                <button
                  onClick={() => setSelectedYear("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                    selectedYear === "all" ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                  )}
                >
                  Tất cả các năm
                </button>
                {availableYears.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                      selectedYear === yr ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                    )}
                  >
                    Năm {yr}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                    viewMode === "grid" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-800"
                  )}
                  title="Chế độ lưới Gallery"
                >
                  <Grid className="w-4 h-4" />
                  <span className="hidden sm:inline">Lưới ảnh</span>
                </button>
                <button
                  onClick={() => setViewMode("timeline")}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                    viewMode === "timeline" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-800"
                  )}
                  title="Chế độ dòng thời gian"
                >
                  <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">Dòng thời gian</span>
                </button>
              </div>
            </div>

            {/* Row 2: Category chips & Search & Month select */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Category Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                    selectedCategory === "all" ? "bg-purple-700 text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                  )}
                >
                  Tất cả chủ đề
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                      selectedCategory === cat.id ? "bg-purple-700 text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
                <button
                  onClick={() => setOnlyFeatured((v) => !v)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1",
                    onlyFeatured ? "bg-amber-500 text-white shadow-xs" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  )}
                  title="Chỉ xem album tiêu biểu"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Tiêu biểu
                </button>
              </div>

              {/* Month selector, Date filter & Search Input */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="w-36">
                  <CustomSelect value={selectedMonth} onChange={setSelectedMonth} options={monthSelectOptions} />
                </div>

                <div className="w-36">
                  <CustomInput
                    placeholder="Ngày (dd/mm)..."
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    leftIcon={<Calendar className="w-3.5 h-3.5" />}
                  />
                </div>

                <div className="w-56">
                  <CustomInput
                    placeholder="Tìm tiêu đề, người, tag..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    leftIcon={isLoading && (debouncedSearch || debouncedDate) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Filter summary & quick reset */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-gray-500 font-medium">
                Tìm thấy <b className="text-primary font-bold">{filteredMoments.length}</b> album kỷ niệm
                {selectedYear !== "all" && ` · Năm ${selectedYear}`}
                {selectedMonth !== "all" && ` · Tháng ${selectedMonth}`}
                {selectedCategoryName && ` · ${selectedCategoryName}`}
                {onlyFeatured && " · Tiêu biểu"}
                {selectedDate && ` · Ngày "${selectedDate}"`}
                {searchTerm && ` · Từ khóa "${searchTerm}"`}
              </span>

              {filtersActive && (
                <button onClick={resetFilters} className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1">
                  <X className="w-3.5 h-3.5" />
                  <span>Đặt lại bộ lọc</span>
                </button>
              )}
            </div>
          </div>

          {/* CONTENT DISPLAY: GALLERY GRID OR TIMELINE */}
          {filteredMoments.length === 0 ? (
            <div className="py-16 bg-white rounded-3xl border border-dashed border-purple-200 text-center flex flex-col items-center justify-center p-6 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold text-xl">📷</div>
              {stats.albums === 0 && !filtersActive ? (
                <>
                  <h3 className="text-base font-bold text-gray-900">Thư viện khoảnh khắc còn trống</h3>
                  <p className="text-xs text-gray-500 max-w-sm">Hãy tạo album đầu tiên để lưu giữ kỷ niệm của anh em lưu xá.</p>
                  {canCreate && (
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs"
                    >
                      + Tạo Album Mới
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-base font-bold text-gray-900">Không tìm thấy album nào phù hợp</h3>
                  <p className="text-xs text-gray-500 max-w-sm">
                    Thử thay đổi niên khóa, tháng, hoặc xóa từ khóa tìm kiếm để khám phá các kỷ niệm khác của lưu xá.
                  </p>
                  <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs">
                    Xóa bộ lọc để xem tất cả
                  </button>
                </>
              )}
            </div>
          ) : viewMode === "grid" ? (
            /* GRID VIEW */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
              {filteredMoments.map((album) => {
                const meta = categoryStyle(album.categoryCode);

                return (
                  <div
                    key={album.id}
                    className="bg-white rounded-3xl overflow-hidden border border-purple-50 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between group"
                  >
                    {/* Cover Image with Overlay */}
                    <div className="relative h-56 w-full overflow-hidden bg-gray-100 cursor-pointer" onClick={() => openAlbum(album.id)}>
                      <CoverLayer url={album.coverUrl} code={album.categoryCode} className="transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                      {/* Badges on Cover */}
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className={cn("px-2.5 py-1 rounded-xl text-[11px] font-bold backdrop-blur-md border shadow-xs", meta.bg, meta.text, meta.border)}>
                          {album.category}
                        </span>
                        {album.isFeatured && (
                          <span className="w-6 h-6 rounded-lg bg-primary/90 text-[#fcd34d] flex items-center justify-center" title="Khoảnh khắc tiêu biểu">
                            <Sparkles className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {album.status === "hidden" && (
                          <span className="px-2 py-1 rounded-xl bg-amber-500/90 text-white text-[10px] font-bold flex items-center gap-1">
                            <EyeOff className="w-3 h-3" /> Đang ẩn
                          </span>
                        )}
                      </div>

                      <div className="absolute top-3 right-3">
                        <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1.5">
                          <FolderOpen className="w-3 h-3 text-[#d8b4fe]" />
                          {album.photosCount} ảnh
                        </span>
                      </div>

                      {/* Location & Date on Bottom of Image */}
                      <div className="absolute bottom-3 left-3 right-3 text-white flex items-center justify-between text-xs font-medium">
                        <div className="flex items-center gap-1.5 truncate drop-shadow-xs">
                          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="truncate">{album.location || "Lưu Xá Phanxicô"}</span>
                        </div>
                        <span className="text-[11px] text-[#d1d5db] shrink-0 drop-shadow-xs">{album.date}</span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex flex-col flex-1 justify-between gap-4">
                      <div className="space-y-2">
                        <h3
                          onClick={() => openAlbum(album.id)}
                          className="text-base font-extrabold text-gray-900 group-hover:text-primary transition-colors cursor-pointer line-clamp-1"
                        >
                          {album.title}
                        </h3>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed font-normal">{album.description}</p>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {album.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="px-2 py-0.5 rounded-lg bg-surface-container-low text-[10px] font-semibold text-purple-700">
                            {tag}
                          </span>
                        ))}
                        {album.tags.length > 3 && <span className="text-[10px] text-gray-400 self-center">+{album.tags.length - 3}</span>}
                      </div>

                      {/* Participants & Like Action */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2 overflow-hidden">
                            {album.participants.slice(0, 3).map((p) => (
                              <div
                                key={p.memberId}
                                className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-[9px] flex items-center justify-center"
                                title={p.fullName}
                              >
                                {initials(p.fullName)}
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium">{album.participants.length} anh em</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void toggleLikeMoment(album)}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all",
                              album.isLiked ? "bg-rose-50 text-rose-600 hover:bg-rose-100" : "bg-surface-container-low text-gray-600 hover:bg-rose-50 hover:text-rose-600"
                            )}
                          >
                            <Heart className={cn("w-3.5 h-3.5", album.isLiked && "fill-current")} />
                            <span>{album.likesCount}</span>
                          </button>

                          <button
                            onClick={() => openAlbum(album.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition active:scale-95"
                            title="Mở thư mục Album"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Mở Album</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TIMELINE VIEW */
            <div className="relative pl-6 md:pl-8 border-l-2 border-purple-200 flex flex-col gap-8 animate-in fade-in duration-200 ml-4 md:ml-6">
              {filteredMoments.map((album) => {
                const meta = categoryStyle(album.categoryCode);

                return (
                  <div key={album.id} className="relative group">
                    {/* Timeline Dot */}
                    <div className="absolute -left-[31px] md:-left-[39px] top-6 w-5 h-5 rounded-full border-4 border-white bg-primary shadow-xs group-hover:scale-125 transition-transform" />

                    <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row gap-6">
                      {/* Thumbnail Cover */}
                      <div
                        onClick={() => openAlbum(album.id)}
                        className="w-full md:w-64 h-48 rounded-2xl overflow-hidden bg-gray-100 shrink-0 relative cursor-pointer group/thumb"
                      >
                        <CoverLayer url={album.coverUrl} code={album.categoryCode} className="transition-transform duration-500 group-hover/thumb:scale-105" />
                        <div className="absolute inset-0 bg-black/20 group-hover/thumb:bg-black/10 transition-colors" />
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                          <FolderOpen className="w-3 h-3 text-[#d8b4fe]" />
                          {album.photosCount} ảnh
                        </span>
                      </div>

                      {/* Timeline Info */}
                      <div className="flex flex-col justify-between flex-1 gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={cn("px-2.5 py-0.5 rounded-lg text-[10px] font-bold border", meta.bg, meta.text, meta.border)}>{album.category}</span>
                            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {album.date}
                            </span>
                            {album.location && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                                {album.location}
                              </span>
                            )}
                            {album.status === "hidden" && (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold flex items-center gap-1">
                                <EyeOff className="w-3 h-3" /> Đang ẩn
                              </span>
                            )}
                          </div>

                          <h3 onClick={() => openAlbum(album.id)} className="text-lg font-black text-gray-900 group-hover:text-primary transition-colors cursor-pointer">
                            {album.title}
                          </h3>

                          <p className="text-xs text-gray-600 font-normal leading-relaxed mt-1">{album.description}</p>
                        </div>

                        {/* Participants & Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-gray-400">Đồng hành:</span>
                            <div className="flex flex-wrap gap-1">
                              {album.participants.map((p) => (
                                <span key={p.memberId} className="px-2 py-0.5 rounded-md bg-purple-50 text-[10px] font-medium text-purple-800">
                                  {p.fullName}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void toggleLikeMoment(album)}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors",
                                album.isLiked ? "bg-rose-50 text-rose-600" : "bg-surface-container-low text-gray-600 hover:bg-rose-50 hover:text-rose-600"
                              )}
                            >
                              <Heart className={cn("w-3.5 h-3.5", album.isLiked && "fill-current")} />
                              <span>{album.likesCount}</span>
                            </button>

                            <button
                              onClick={() => openAlbum(album.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-[#4d2dbf] active:scale-95 transition"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>Mở Album ({album.photosCount} ảnh)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 6. FULLSCREEN PHOTO LIGHTBOX MODAL */}
      {lightboxIndex !== null && albumDetail && mounted && (
        <PhotoLightbox
          album={albumDetail}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onToggleAlbumLike={() => void toggleLikeMoment(albumDetail)}
          onTogglePhotoLike={(p) => void togglePhotoLike(p)}
        />
      )}

      {/* 7. CREATE / EDIT ALBUM MODAL */}
      <AlbumFormModal
        open={isCreateModalOpen}
        mode="create"
        categories={categories}
        members={members}
        meId={session?.member?.id}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={(saved) => {
          setIsCreateModalOpen(false);
          void mutateAlbum(saved, { revalidate: false });
          openAlbum(saved.id);
          void refreshMoments();
        }}
        showToast={showToast}
      />
      <AlbumFormModal
        open={isEditModalOpen}
        mode="edit"
        album={albumDetail}
        categories={categories}
        members={members}
        meId={session?.member?.id}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={(saved) => {
          setIsEditModalOpen(false);
          applySavedAlbum(saved);
        }}
        showToast={showToast}
      />

      {/* 8. ADD PHOTOS TO ACTIVE ALBUM MODAL */}
      <AddPhotosModal
        album={activeAlbum}
        open={isAddPhotoModalOpen}
        onClose={() => setIsAddPhotoModalOpen(false)}
        onSaved={(saved) => {
          setIsAddPhotoModalOpen(false);
          applySavedAlbum(saved);
        }}
        showToast={showToast}
      />

      <CaptionModal
        photo={captionPhoto}
        onClose={() => setCaptionPhoto(null)}
        onSaved={(saved) => {
          setCaptionPhoto(null);
          applySavedAlbum(saved);
        }}
        showToast={showToast}
      />

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) void runBusy("confirm", c.action);
        }}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmText={confirm?.confirmText}
        variant="danger"
      />
    </div>
  );
}
