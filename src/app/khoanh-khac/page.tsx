"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Heart,
  Calendar,
  MapPin,
  Users,
  Plus,
  Search,
  Filter,
  Sparkles,
  Share2,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Grid,
  Clock,
  Maximize2,
  Eye,
  Tag,
  Check,
  Image as ImageIcon,
  FolderPlus,
  Folder,
  FolderOpen,
  ArrowLeft,
  Upload,
  Bookmark,
  MessageCircle,
  Compass,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { MomentAlbum, MomentPhoto } from "@/lib/mockData";
import { CustomInput, CustomSelect, CustomToggle, CustomDatePicker, CustomTextarea, SelectOption, ImageUploadDropzone, MultiImageUploadDropzone } from "@/components/ui/FormControls";
import KhoanhKhacLoading from "./loading";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/zaloShare";

const CATEGORY_COLORS: Record<
  MomentAlbum["category"],
  { bg: string; text: string; border: string; iconBg: string }
> = {
  "Hành hương": { bg: "bg-indigo-50", text: "text-indigo-800", border: "border-indigo-200", iconBg: "bg-indigo-100" },
  "Dã ngoại & Du lịch": { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200", iconBg: "bg-emerald-100" },
  "Lễ Bổn Mạng": { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", iconBg: "bg-amber-100" },
  "Bữa cơm huynh đệ": { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200", iconBg: "bg-rose-100" },
  "Sinh hoạt thường nhật": { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200", iconBg: "bg-blue-100" },
  "Chia tay & Tốt nghiệp": { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200", iconBg: "bg-purple-100" },
};

const CATEGORIES_LIST: MomentAlbum["category"][] = [
  "Lễ Bổn Mạng",
  "Hành hương",
  "Dã ngoại & Du lịch",
  "Bữa cơm huynh đệ",
  "Sinh hoạt thường nhật",
  "Chia tay & Tốt nghiệp",
];

export default function KhoanhKhacPage() {
  const {
    moments,
    addMomentAlbum,
    toggleLikeMoment,
    addPhotoToMoment,
    members,
    showToast,
    isLoadingSkeleton,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter States
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "timeline">("grid");

  // Active Album Folder View State
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const activeAlbum = useMemo(
    () => moments.find((m) => m.id === activeAlbumId) || null,
    [moments, activeAlbumId]
  );

  // Quick Add Photo to Active Album Modal
  const [isAddPhotoModalOpen, setIsAddPhotoModalOpen] = useState(false);
  const [quickPhotoUrl, setQuickPhotoUrl] = useState("");
  const [quickPhotoCaption, setQuickPhotoCaption] = useState("");

  const PHOTO_PRESETS = [
    { label: "Nguyện đường lưu xá", url: "https://images.unsplash.com/photo-1548625361-19597c55c2f3?auto=format&fit=crop&w=1200&q=80" },
    { label: "Bữa cơm huynh đệ", url: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80" },
    { label: "Dã ngoại bãi biển", url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80" },
    { label: "Sinh hoạt đàn hát", url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80" },
  ];

  const handleAddPhotoToActiveAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlbum || !quickPhotoUrl.trim()) {
      showToast("error", "Vui lòng nhập đường dẫn hình ảnh!");
      return;
    }
    addPhotoToMoment(activeAlbum.id, {
      url: quickPhotoUrl.trim(),
      caption: quickPhotoCaption.trim() || `Khoảnh khắc mới trong ${activeAlbum.title}`,
      uploadedBy: "Minh Tuấn",
      date: new Date().toLocaleDateString("vi-VN"),
    });
    setQuickPhotoUrl("");
    setQuickPhotoCaption("");
    setIsAddPhotoModalOpen(false);
  };

  const handleCopyAlbumZalo = async (album: MomentAlbum) => {
    const text = `📸 KHOẢNH KHẮC LƯU XÁ: ${album.title}\n📍 Địa điểm: ${album.location} (${album.date})\n🏷️ Thể loại: ${album.category}\n👥 Thành viên tham gia: ${album.participants.join(", ")}\n🖼️ Thư mục: ${album.photos.length} hình ảnh kỷ niệm\n📝 ${album.description}\n\nPax et Bonum - Lưu Xá Sinh Viên Phanxicô`;
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", `Đã sao chép tóm tắt album "${album.title}"! Có thể dán ngay vào Zalo.`);
    } else {
      showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
    }
  };
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    album: MomentAlbum | null;
    photoIndex: number;
  }>({
    isOpen: false,
    album: null,
    photoIndex: 0,
  });

  // Create Album Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<MomentAlbum["category"]>("Dã ngoại & Du lịch");
  const [formDate, setFormDate] = useState("02/10/2026");
  const [formLocation, setFormLocation] = useState("");
  const [formCoverPhoto, setFormCoverPhoto] = useState(
    "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80"
  );
  const [formTags, setFormTags] = useState("#KyNiemLuuXa, #PhanxicoAssisi");
  const [formPhotoUrls, setFormPhotoUrls] = useState<string[]>([]);
  const [newPhotoInput, setNewPhotoInput] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([
    "Minh Tuấn",
    "Trần Văn Đức",
    "Lê Hoàng Long",
  ]);

  // Available Years
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(moments.map((m) => m.year))).sort((a, b) => b - a);
    return years;
  }, [moments]);

  // Statistics
  const totalAlbums = moments.length;
  const totalPhotos = moments.reduce((sum, m) => sum + m.photos.length, 0);
  const totalLikes = moments.reduce((sum, m) => sum + m.likesCount, 0);

  // Filtered Moments
  const filteredMoments = useMemo(() => {
    return moments.filter((album) => {
      const matchYear = selectedYear === "all" || album.year === selectedYear;
      const matchMonth = selectedMonth === "all" || album.month === selectedMonth;
      const matchCat = selectedCategory === "all" || album.category === selectedCategory;
      const matchDate =
        !selectedDate.trim() ||
        album.date.toLowerCase().includes(selectedDate.trim().toLowerCase());

      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        term === "" ||
        album.title.toLowerCase().includes(term) ||
        album.description.toLowerCase().includes(term) ||
        album.location.toLowerCase().includes(term) ||
        album.date.toLowerCase().includes(term) ||
        album.year.toString().includes(term) ||
        album.author.toLowerCase().includes(term) ||
        album.tags.some((t) => t.toLowerCase().includes(term)) ||
        album.participants.some((p) => p.toLowerCase().includes(term));

      return matchYear && matchMonth && matchCat && matchDate && matchSearch;
    });
  }, [moments, selectedYear, selectedMonth, selectedCategory, selectedDate, searchTerm]);

  // Featured Album
  const featuredAlbum = useMemo(() => {
    return moments.find((m) => m.isFeatured) || moments[0];
  }, [moments]);

  // Lightbox Navigation Handlers
  const handleOpenLightbox = (album: MomentAlbum, photoIndex = 0) => {
    setLightboxState({
      isOpen: true,
      album,
      photoIndex,
    });
  };

  const handleCloseLightbox = () => {
    setLightboxState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleNextPhoto = useCallback(() => {
    if (!lightboxState.album) return;
    const len = lightboxState.album.photos.length;
    setLightboxState((prev) => ({
      ...prev,
      photoIndex: (prev.photoIndex + 1) % len,
    }));
  }, [lightboxState.album]);

  const handlePrevPhoto = useCallback(() => {
    if (!lightboxState.album) return;
    const len = lightboxState.album.photos.length;
    setLightboxState((prev) => ({
      ...prev,
      photoIndex: (prev.photoIndex - 1 + len) % len,
    }));
  }, [lightboxState.album]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightboxState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseLightbox();
      if (e.key === "ArrowRight") handleNextPhoto();
      if (e.key === "ArrowLeft") handlePrevPhoto();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxState.isOpen, handleNextPhoto, handlePrevPhoto]);

  // Keyboard navigation for Create Modal
  useEffect(() => {
    if (!isCreateModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsCreateModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateModalOpen]);

  // Handle Add Photo URL in Create Modal
  const handleAddPhotoUrl = () => {
    if (!newPhotoInput.trim()) return;
    setFormPhotoUrls((prev) => [...prev, newPhotoInput.trim()]);
    setNewPhotoInput("");
  };

  // Handle Submit New Album
  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast("error", "Vui lòng nhập tiêu đề album!");
      return;
    }

    const [day, monthStr, yearStr] = formDate.split("/");
    const year = Number(yearStr) || 2026;
    const month = Number(monthStr) || 10;

    const parsedTags = formTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));

    const albumPhotos: MomentPhoto[] = [
      {
        id: `p-${Date.now()}-cover`,
        url: formCoverPhoto,
        caption: formTitle,
        uploadedBy: "Minh Tuấn",
        date: formDate,
        likesCount: 1,
      },
      ...formPhotoUrls.map((url, idx) => ({
        id: `p-${Date.now()}-${idx}`,
        url,
        caption: `Khoảnh khắc kỷ niệm ${idx + 1}`,
        uploadedBy: "Minh Tuấn",
        date: formDate,
        likesCount: 0,
      })),
    ];

    addMomentAlbum({
      title: formTitle.trim(),
      description: formDescription.trim() || "Chùm ảnh kỷ niệm ý nghĩa của anh em Lưu Xá Phanxicô.",
      category: formCategory,
      date: formDate,
      year,
      month,
      location: formLocation.trim() || "Lưu Xá Phanxicô Assisi",
      coverPhoto: formCoverPhoto,
      photos: albumPhotos,
      author: "Minh Tuấn",
      authorRole: "Phó nhà",
      tags: parsedTags,
      participants: selectedParticipants,
      isFeatured: false,
    });

    setIsCreateModalOpen(false);
    // Reset Form
    setFormTitle("");
    setFormDescription("");
    setFormPhotoUrls([]);
    setFormLocation("");
  };

  if (isLoadingSkeleton) {
    return <KhoanhKhacLoading />;
  }

  const categorySelectOptions: SelectOption<MomentAlbum["category"]>[] = CATEGORIES_LIST.map((c) => ({
    value: c,
    label: c,
  }));

  const monthSelectOptions: SelectOption<number | "all">[] = [
    { value: "all", label: "Tất cả tháng" },
    { value: 1, label: "Tháng 01" },
    { value: 2, label: "Tháng 02" },
    { value: 3, label: "Tháng 03" },
    { value: 4, label: "Tháng 04" },
    { value: 5, label: "Tháng 05" },
    { value: 6, label: "Tháng 06" },
    { value: 7, label: "Tháng 07" },
    { value: 8, label: "Tháng 08" },
    { value: 9, label: "Tháng 09" },
    { value: 10, label: "Tháng 10" },
    { value: 11, label: "Tháng 11" },
    { value: 12, label: "Tháng 12" },
  ];

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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                  Lưu Khoảnh Khắc &amp; Kỷ Niệm
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">
                  Pax et Bonum
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Nơi lưu giữ những hành trình đức tin, dã ngoại, đại lễ bổn mạng và từng bữa cơm huynh đệ
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeAlbum ? (
            <button
              onClick={() => setActiveAlbumId(null)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary font-bold text-xs transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← Trở về danh sách album</span>
            </button>
          ) : (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Tạo Album Mới</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. MAIN BODY: ALBUM FOLDER GALLERY VIEW vs ALL ALBUMS VIEW */}
      {activeAlbum ? (
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
              <span className="text-purple-700 font-semibold px-2.5 py-0.5 rounded-lg bg-purple-50 border border-purple-100">
                {activeAlbum.category}
              </span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-900 font-black truncate max-w-[200px] sm:max-w-md">
                {activeAlbum.title}
              </span>
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
            <div className="relative h-64 sm:h-80 lg:h-96 w-full overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
                style={{ backgroundImage: `url(${activeAlbum.coverPhoto})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/95 via-gray-950/50 to-transparent" />

              <div className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-between text-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-3 py-1 rounded-xl text-xs font-bold border backdrop-blur-md",
                        CATEGORY_COLORS[activeAlbum.category]?.bg || "bg-purple-50",
                        CATEGORY_COLORS[activeAlbum.category]?.text || "text-purple-800",
                        CATEGORY_COLORS[activeAlbum.category]?.border || "border-purple-200"
                      )}
                    >
                      {activeAlbum.category}
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-black/50 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-purple-300" />
                      Thư mục Album ({activeAlbum.photos.length} ảnh)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleLikeMoment(activeAlbum.id)}
                      className={cn(
                        "px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition backdrop-blur-md active:scale-95",
                        activeAlbum.isLiked
                          ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                          : "bg-white/20 hover:bg-white/30 text-white"
                      )}
                    >
                      <Heart className={cn("w-3.5 h-3.5", activeAlbum.isLiked && "fill-current")} />
                      <span>{activeAlbum.likesCount} Yêu thích</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
                    {activeAlbum.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-200 font-medium">
                    <span className="flex items-center gap-1.5 drop-shadow-xs">
                      <Calendar className="w-4 h-4 text-purple-300" />
                      {activeAlbum.date}
                    </span>
                    <span className="flex items-center gap-1.5 drop-shadow-xs">
                      <MapPin className="w-4 h-4 text-rose-400" />
                      {activeAlbum.location}
                    </span>
                    <span className="flex items-center gap-1.5 drop-shadow-xs">
                      <Camera className="w-4 h-4 text-amber-300" />
                      Người đăng: {activeAlbum.author} ({activeAlbum.authorRole})
                    </span>
                    <span className="flex items-center gap-1.5 drop-shadow-xs">
                      <ImageIcon className="w-4 h-4 text-cyan-300" />
                      {activeAlbum.photos.length} hình ảnh
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description, Tags, Participants & Action Buttons */}
            <div className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-6 bg-white">
              <div className="space-y-4 max-w-3xl flex-1">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Ý nghĩa &amp; Câu chuyện kỷ niệm
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed font-normal">
                    {activeAlbum.description}
                  </p>
                </div>

                {/* Tags */}
                {activeAlbum.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0 mr-1" />
                    {activeAlbum.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-surface-container-low text-xs font-semibold text-purple-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Participants */}
                {activeAlbum.participants.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      Anh em đồng hành ({activeAlbum.participants.length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {activeAlbum.participants.map((p, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-800 text-xs font-bold border border-purple-100 flex items-center gap-1.5"
                        >
                          <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] flex items-center justify-center font-bold">
                            {p.charAt(0)}
                          </span>
                          <span>{p}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 w-full lg:w-60 pt-4 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                <button
                  onClick={() => handleOpenLightbox(activeAlbum, 0)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition"
                >
                  <Eye className="w-4 h-4" />
                  <span>Trình chiếu ({activeAlbum.photos.length} ảnh)</span>
                </button>

                <button
                  onClick={() => setIsAddPhotoModalOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 active:scale-95 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>+ Thêm ảnh vào album</span>
                </button>

                <button
                  onClick={() => handleCopyAlbumZalo(activeAlbum)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-purple-100 text-gray-700 text-xs font-bold transition active:scale-95"
                >
                  <Share2 className="w-4 h-4 text-purple-600" />
                  <span>Sao chép gửi Zalo</span>
                </button>
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
                <h2 className="text-lg font-black text-gray-900">
                  Thư Viện Ảnh ({activeAlbum.photos.length} bức ảnh)
                </h2>
                <p className="text-xs text-gray-500">
                  Nhấn vào bất kỳ ảnh nào để phóng to, trình chiếu và lướt xem ảnh chất lượng cao
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsAddPhotoModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] shadow-xs active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Thêm ảnh mới</span>
            </button>
          </div>

          {/* Photo Gallery Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {activeAlbum.photos.map((photo, index) => (
              <div
                key={photo.id}
                onClick={() => handleOpenLightbox(activeAlbum, index)}
                className="group relative bg-white rounded-2xl overflow-hidden border border-purple-50 shadow-2xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
              >
                {/* Photo Image with Aspect Ratio */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <span className="text-white text-xs font-medium line-clamp-2 drop-shadow-xs">
                      {photo.caption}
                    </span>
                  </div>

                  {/* Photo Index Badge */}
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono font-bold">
                    #{index + 1}
                  </span>

                  {/* Hover Zoom Icon */}
                  <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-white/80 backdrop-blur-xs text-gray-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
                    <Maximize2 className="w-3.5 h-3.5 text-primary" />
                  </div>
                </div>

                {/* Bottom metadata */}
                <div className="p-3 bg-white flex items-center justify-between gap-2 border-t border-gray-50">
                  <div className="truncate">
                    <p className="text-xs font-bold text-gray-800 truncate group-hover:text-primary transition-colors">
                      {photo.caption || `Ảnh #${index + 1}`}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {photo.uploadedBy} • {photo.date}
                    </p>
                  </div>

                  <span className="shrink-0 text-[11px] font-bold text-rose-500 flex items-center gap-1">
                    <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                    {photo.likesCount || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {activeAlbum.photos.length === 0 && (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-200 space-y-3">
              <Camera className="w-10 h-10 text-gray-300 mx-auto" />
              <h3 className="text-sm font-bold text-gray-800">Album này chưa có bức ảnh nào</h3>
              <p className="text-xs text-gray-400">Hãy thêm những bức ảnh đầu tiên cho album kỷ niệm này nhé!</p>
              <button
                onClick={() => setIsAddPhotoModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-[#4d2dbf] transition"
              >
                + Thêm ảnh ngay
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ALL ALBUMS VIEW: STATS, FEATURED BANNER, FILTERS, LIST */
        <>
          {/* STATS KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Tổng Album
                </span>
                <div className="text-2xl font-black text-gray-900 mt-1">{totalAlbums}</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                <FolderPlus className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Bức ảnh lưu giữ
                </span>
                <div className="text-2xl font-black text-gray-900 mt-1">{totalPhotos}</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <ImageIcon className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Niên khóa lưu giữ
                </span>
                <div className="text-2xl font-black text-gray-900 mt-1">
                  {availableYears.length > 0 ? `${availableYears[availableYears.length - 1]} - Nay` : "2026"}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Calendar className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Lượt yêu thích
                </span>
                <div className="text-2xl font-black text-rose-500 mt-1">{totalLikes} ❤️</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center font-bold">
                <Heart className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* FEATURED HIGHLIGHT BANNER */}
          {featuredAlbum && selectedCategory === "all" && selectedYear === "all" && searchTerm === "" && (
            <div className="relative w-full rounded-3xl overflow-hidden border border-purple-100 shadow-md group">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url(${featuredAlbum.coverPhoto})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent" />

              <div className="relative z-10 p-6 md:p-8 flex flex-col justify-end min-h-[300px] text-white">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-3 py-1 rounded-full bg-primary/90 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Khoảnh khắc tiêu biểu
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold">
                    {featuredAlbum.category}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-gray-200 text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-red-400" />
                    {featuredAlbum.location}
                  </span>
                </div>

                <h2 className="text-xl md:text-3xl font-extrabold text-white tracking-tight mb-2 max-w-3xl drop-shadow-sm">
                  {featuredAlbum.title}
                </h2>

                <p className="text-xs md:text-sm text-gray-200 line-clamp-2 max-w-2xl mb-4 font-normal leading-relaxed drop-shadow-xs">
                  {featuredAlbum.description}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-purple-500/80 backdrop-blur-xs flex items-center justify-center text-xs font-bold">
                        {featuredAlbum.author.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-gray-200">
                        {featuredAlbum.author} ({featuredAlbum.authorRole}) • {featuredAlbum.date}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-white/20 text-xs text-gray-300">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{featuredAlbum.photos.length} bức ảnh</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleLikeMoment(featuredAlbum.id)}
                      className={cn(
                        "px-3 py-2 rounded-xl backdrop-blur-md text-xs font-bold flex items-center gap-1.5 transition-colors",
                        featuredAlbum.isLiked
                          ? "bg-rose-500 text-white"
                          : "bg-white/20 hover:bg-white/30 text-white"
                      )}
                    >
                      <Heart className={cn("w-3.5 h-3.5", featuredAlbum.isLiked && "fill-current")} />
                      <span>{featuredAlbum.likesCount}</span>
                    </button>

                    <button
                      onClick={() => setActiveAlbumId(featuredAlbum.id)}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-900 text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-primary" />
                      <span>Mở thư mục Album ({featuredAlbum.photos.length} ảnh)</span>
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
                    selectedYear === "all"
                      ? "bg-primary text-white shadow-xs"
                      : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
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
                      selectedYear === yr
                        ? "bg-primary text-white shadow-xs"
                        : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
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
                    selectedCategory === "all"
                      ? "bg-purple-700 text-white shadow-xs"
                      : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                  )}
                >
                  Tất cả chủ đề
                </button>
                {CATEGORIES_LIST.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                      selectedCategory === cat
                        ? "bg-purple-700 text-white shadow-xs"
                        : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Month selector, Date filter & Search Input */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="w-36">
                  <CustomSelect
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthSelectOptions}
                  />
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
                    leftIcon={<Search className="w-3.5 h-3.5" />}
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
                {selectedCategory !== "all" && ` · ${selectedCategory}`}
                {selectedDate && ` · Ngày "${selectedDate}"`}
                {searchTerm && ` · Từ khóa "${searchTerm}"`}
              </span>

              {(selectedYear !== "all" ||
                selectedMonth !== "all" ||
                selectedCategory !== "all" ||
                selectedDate !== "" ||
                searchTerm !== "") && (
                <button
                  onClick={() => {
                    setSelectedYear("all");
                    setSelectedMonth("all");
                    setSelectedCategory("all");
                    setSelectedDate("");
                    setSearchTerm("");
                  }}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Đặt lại bộ lọc</span>
                </button>
              )}
            </div>
          </div>

          {/* CONTENT DISPLAY: GALLERY GRID OR TIMELINE */}
          {filteredMoments.length === 0 ? (
            <div className="py-16 bg-white rounded-3xl border border-dashed border-purple-200 text-center flex flex-col items-center justify-center p-6 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold text-xl">
                📷
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Không tìm thấy album nào phù hợp
              </h3>
              <p className="text-xs text-gray-500 max-w-sm">
                Thử thay đổi niên khóa, tháng, hoặc xóa từ khóa tìm kiếm để khám phá các kỷ niệm khác của lưu xá.
              </p>
              <button
                onClick={() => {
                  setSelectedYear("all");
                  setSelectedMonth("all");
                  setSelectedCategory("all");
                  setSelectedDate("");
                  setSearchTerm("");
                }}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs"
              >
                Xóa bộ lọc để xem tất cả
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* GRID VIEW */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
              {filteredMoments.map((album) => {
                const meta = CATEGORY_COLORS[album.category];

                return (
                  <div
                    key={album.id}
                    className="bg-white rounded-3xl overflow-hidden border border-purple-50 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between group"
                  >
                    {/* Cover Image with Overlay */}
                    <div
                      className="relative h-56 w-full overflow-hidden bg-gray-100 cursor-pointer"
                      onClick={() => setActiveAlbumId(album.id)}
                    >
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                        style={{ backgroundImage: `url(${album.coverPhoto})` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                      {/* Badges on Cover */}
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-xl text-[11px] font-bold backdrop-blur-md border shadow-xs",
                            meta.bg,
                            meta.text,
                            meta.border
                          )}
                        >
                          {album.category}
                        </span>
                      </div>

                      <div className="absolute top-3 right-3">
                        <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1.5">
                          <FolderOpen className="w-3 h-3 text-purple-300" />
                          {album.photos.length} ảnh
                        </span>
                      </div>

                      {/* Location & Date on Bottom of Image */}
                      <div className="absolute bottom-3 left-3 right-3 text-white flex items-center justify-between text-xs font-medium">
                        <div className="flex items-center gap-1.5 truncate drop-shadow-xs">
                          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="truncate">{album.location}</span>
                        </div>
                        <span className="text-[11px] text-gray-300 shrink-0 drop-shadow-xs">
                          {album.date}
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex flex-col flex-1 justify-between gap-4">
                      <div className="space-y-2">
                        <h3
                          onClick={() => setActiveAlbumId(album.id)}
                          className="text-base font-extrabold text-gray-900 group-hover:text-primary transition-colors cursor-pointer line-clamp-1"
                        >
                          {album.title}
                        </h3>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed font-normal">
                          {album.description}
                        </p>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {album.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-lg bg-surface-container-low text-[10px] font-semibold text-purple-700"
                          >
                            {tag}
                          </span>
                        ))}
                        {album.tags.length > 3 && (
                          <span className="text-[10px] text-gray-400 self-center">
                            +{album.tags.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Participants & Like Action */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2 overflow-hidden">
                            {album.participants.slice(0, 3).map((p, idx) => (
                              <div
                                key={idx}
                                className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-[9px] flex items-center justify-center"
                                title={p}
                              >
                                {p.substring(0, 2).toUpperCase()}
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {album.participants.length} anh em
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleLikeMoment(album.id)}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all",
                              album.isLiked
                                ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                                : "bg-surface-container-low text-gray-600 hover:bg-rose-50 hover:text-rose-600"
                            )}
                          >
                            <Heart className={cn("w-3.5 h-3.5", album.isLiked && "fill-current")} />
                            <span>{album.likesCount}</span>
                          </button>

                          <button
                            onClick={() => setActiveAlbumId(album.id)}
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
                const meta = CATEGORY_COLORS[album.category];

                return (
                  <div key={album.id} className="relative group">
                    {/* Timeline Dot */}
                    <div className="absolute -left-[31px] md:-left-[39px] top-6 w-5 h-5 rounded-full border-4 border-white bg-primary shadow-xs group-hover:scale-125 transition-transform" />

                    <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row gap-6">
                      {/* Thumbnail Cover */}
                      <div
                        onClick={() => setActiveAlbumId(album.id)}
                        className="w-full md:w-64 h-48 rounded-2xl overflow-hidden bg-gray-100 shrink-0 relative cursor-pointer group/thumb"
                      >
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover/thumb:scale-105"
                          style={{ backgroundImage: `url(${album.coverPhoto})` }}
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover/thumb:bg-black/10 transition-colors" />
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                          <FolderOpen className="w-3 h-3 text-purple-300" />
                          {album.photos.length} ảnh
                        </span>
                      </div>

                      {/* Timeline Info */}
                      <div className="flex flex-col justify-between flex-1 gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span
                              className={cn(
                                "px-2.5 py-0.5 rounded-lg text-[10px] font-bold border",
                                meta.bg,
                                meta.text,
                                meta.border
                              )}
                            >
                              {album.category}
                            </span>
                            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {album.date}
                            </span>
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-rose-400" />
                              {album.location}
                            </span>
                          </div>

                          <h3
                            onClick={() => setActiveAlbumId(album.id)}
                            className="text-lg font-black text-gray-900 group-hover:text-primary transition-colors cursor-pointer"
                          >
                            {album.title}
                          </h3>

                          <p className="text-xs text-gray-600 font-normal leading-relaxed mt-1">
                            {album.description}
                          </p>
                        </div>

                        {/* Participants & Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-gray-400">Đồng hành:</span>
                            <div className="flex flex-wrap gap-1">
                              {album.participants.map((p, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-md bg-purple-50 text-[10px] font-medium text-purple-800"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleLikeMoment(album.id)}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors",
                                album.isLiked
                                  ? "bg-rose-50 text-rose-600"
                                  : "bg-surface-container-low text-gray-600 hover:bg-rose-50 hover:text-rose-600"
                              )}
                            >
                              <Heart className={cn("w-3.5 h-3.5", album.isLiked && "fill-current")} />
                              <span>{album.likesCount}</span>
                            </button>

                            <button
                              onClick={() => setActiveAlbumId(album.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-[#4d2dbf] active:scale-95 transition"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>Mở Album ({album.photos.length} ảnh)</span>
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
      {lightboxState.isOpen &&
        lightboxState.album &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-200">
            {/* Top Toolbar */}
            <div className="p-4 flex items-center justify-between text-white border-b border-white/10 z-10">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-xl bg-primary text-[11px] font-bold">
                  {lightboxState.album.category}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white truncate max-w-md">
                    {lightboxState.album.title}
                  </h3>
                  <div className="text-[11px] text-gray-400 flex items-center gap-2">
                    <span>
                      Ảnh {lightboxState.photoIndex + 1} / {lightboxState.album.photos.length}
                    </span>
                    <span>•</span>
                    <span>{lightboxState.album.photos[lightboxState.photoIndex]?.uploadedBy}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleLikeMoment(lightboxState.album!.id)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-rose-400 transition"
                  title="Thả tim album"
                >
                  <Heart
                    className={cn(
                      "w-5 h-5",
                      lightboxState.album.isLiked && "fill-current text-rose-500"
                    )}
                  />
                </button>
                <button
                  onClick={handleCloseLightbox}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition"
                  title="Đóng (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Central Photo View & Navigation Buttons */}
            <div className="relative flex-1 flex items-center justify-center p-4 min-h-0">
              <button
                onClick={handlePrevPhoto}
                className="absolute left-4 p-3 rounded-2xl bg-black/40 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-95 z-10"
                title="Ảnh trước (Mũi tên trái)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="max-w-5xl max-h-full flex flex-col items-center justify-center">
                <img
                  src={lightboxState.album.photos[lightboxState.photoIndex]?.url}
                  alt={lightboxState.album.photos[lightboxState.photoIndex]?.caption || "Khoảnh khắc"}
                  className="max-h-[70vh] w-auto object-contain rounded-2xl shadow-2xl transition-all"
                />

                {lightboxState.album.photos[lightboxState.photoIndex]?.caption && (
                  <p className="text-xs md:text-sm text-gray-300 text-center mt-3 max-w-2xl px-4 py-1.5 rounded-xl bg-black/40 backdrop-blur-xs">
                    💬 {lightboxState.album.photos[lightboxState.photoIndex].caption}
                  </p>
                )}
              </div>

              <button
                onClick={handleNextPhoto}
                className="absolute right-4 p-3 rounded-2xl bg-black/40 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-95 z-10"
                title="Ảnh tiếp theo (Mũi tên phải)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Bottom Thumbnail Strip */}
            <div className="p-4 border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto custom-scroll z-10">
              {lightboxState.album.photos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxState((prev) => ({ ...prev, photoIndex: idx }))}
                  className={cn(
                    "w-16 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all",
                    lightboxState.photoIndex === idx
                      ? "border-primary scale-105 opacity-100 shadow-md"
                      : "border-transparent opacity-50 hover:opacity-80"
                  )}
                >
                  <img
                    src={photo.url}
                    alt="thumbnail"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

      {/* 7. CREATE ALBUM MODAL */}
      {isCreateModalOpen &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsCreateModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
              >
                <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                      <FolderPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Tạo Album Khoảnh Khắc Mới</h3>
                      <p className="text-[11px] text-gray-500">Lưu giữ kỷ niệm hoạt động cộng đoàn Lưu Xá</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateAlbum} className="flex flex-col flex-1 min-h-0">
                  <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 custom-scroll">
                <CustomInput
                  label="Tiêu đề album kỷ niệm"
                  placeholder="VD: Dã ngoại Vũng Tàu – Tình Huynh Đệ 2026"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />

                <div className="grid grid-cols-2 gap-3">
                  <CustomSelect
                    label="Chủ đề album"
                    value={formCategory}
                    onChange={(val) => setFormCategory(val as MomentAlbum["category"])}
                    options={categorySelectOptions}
                  />

                  <CustomDatePicker
                    label="Ngày diễn ra"
                    placeholder="Chọn ngày..."
                    value={formDate}
                    onChange={setFormDate}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <CustomInput
                    label="Địa điểm tổ chức"
                    placeholder="VD: Linh địa La Vang, Quảng Trị"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    required
                  />

                  <CustomInput
                    label="Hashtags (cách nhau bằng dấu phẩy)"
                    placeholder="#LaVang, #MuaHe2026"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                  />
                </div>

                <CustomTextarea
                  label="Mô tả câu chuyện &amp; ý nghĩa kỷ niệm"
                  rows={3}
                  placeholder="Kể lại cảm xúc, những dấu ấn không thể quên của anh em..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />

                <ImageUploadDropzone
                  label="Ảnh bìa Album (Cover Photo)"
                  placeholder="Kéo thả ảnh bìa hoặc nhấp để chọn tệp từ máy..."
                  helperText="Ảnh bìa đại diện cho toàn bộ Album (PNG, JPG, WEBP)"
                  value={formCoverPhoto}
                  onChange={setFormCoverPhoto}
                  required
                />

                {/* Additional Photos via Multi Upload */}
                <MultiImageUploadDropzone
                  label="Thêm các ảnh khác vào Album"
                  values={formPhotoUrls}
                  onChange={setFormPhotoUrls}
                  maxFiles={30}
                />

                {/* Participant picker */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Thành viên đồng hành cùng tham gia:
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scroll p-2 bg-surface-container-low rounded-xl">
                    {members.map((m) => {
                      const isSelected = selectedParticipants.includes(m.fullName);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedParticipants((prev) =>
                              isSelected
                                ? prev.filter((name) => name !== m.fullName)
                                : [...prev, m.fullName]
                            );
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1",
                            isSelected
                              ? "bg-primary text-white shadow-2xs"
                              : "bg-white text-gray-700 border border-gray-200 hover:border-purple-200"
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          <span>{m.fullName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                  </div>

                  <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                    >
                      Lưu &amp; Xuất bản Album
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 8. QUICK ADD PHOTO TO ACTIVE ALBUM MODAL */}
      {isAddPhotoModalOpen &&
        activeAlbum &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsAddPhotoModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col overflow-hidden my-auto"
              >
                <div className="shrink-0 flex items-center justify-between p-5 border-b border-gray-100 bg-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Thêm Ảnh Vào Album</h3>
                      <p className="text-[11px] text-gray-500 truncate max-w-xs">{activeAlbum.title}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddPhotoModalOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddPhotoToActiveAlbum} className="p-5 space-y-4">
                  <ImageUploadDropzone
                    label="Tải ảnh khoảnh khắc lên Album"
                    placeholder="Kéo thả ảnh hoặc nhấp để chọn tệp từ máy..."
                    helperText="Hỗ trợ tải trực tiếp từ máy tính/điện thoại (PNG, JPG, WEBP)"
                    value={quickPhotoUrl}
                    onChange={setQuickPhotoUrl}
                    presets={PHOTO_PRESETS}
                    required
                  />

                  <CustomInput
                    label="Chú thích bức ảnh (Caption)"
                    placeholder="VD: Anh em cùng nhau tạ ơn sau giờ kinh tối..."
                    value={quickPhotoCaption}
                    onChange={(e) => setQuickPhotoCaption(e.target.value)}
                  />

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsAddPhotoModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition"
                    >
                      Lưu ảnh vào album
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
