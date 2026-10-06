"use client";
// Trình chiếu toàn màn hình: ảnh cỡ vừa (?v=medium), dải ảnh thu nhỏ (?v=thumb), tải ảnh gốc (?download=1), thả tim ảnh/album.
import React, { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MomentAlbumDetailDto, MomentPhotoDto } from "@/lib/types/moments";

export interface PhotoLightboxProps {
  album: MomentAlbumDetailDto;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onToggleAlbumLike: () => void;
  onTogglePhotoLike: (photo: MomentPhotoDto) => void;
}

export function PhotoLightbox({ album, index, onIndex, onClose, onToggleAlbumLike, onTogglePhotoLike }: PhotoLightboxProps) {
  const photos = album.photos;
  const len = photos.length;
  const photo = photos[Math.min(index, Math.max(0, len - 1))];
  const next = useCallback(() => len && onIndex((index + 1) % len), [index, len, onIndex]);
  const prev = useCallback(() => len && onIndex((index - 1 + len) % len), [index, len, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-200">
      {/* Top Toolbar */}
      <div className="p-4 flex items-center justify-between text-white border-b border-white/10 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-2.5 py-1 rounded-xl bg-primary text-[11px] font-bold shrink-0">{album.category}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate max-w-md">{album.title}</h3>
            <div className="text-[11px] text-gray-400 flex items-center gap-2">
              <span>
                Ảnh {len ? index + 1 : 0} / {len}
              </span>
              {photo && (
                <>
                  <span>•</span>
                  <span>{photo.uploadedBy.name}</span>
                  <span>•</span>
                  <span>{photo.date}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {photo && (
            <a
              href={photo.downloadUrl}
              download
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition"
              title="Tải ảnh gốc về máy"
            >
              <Download className="w-5 h-5" />
            </a>
          )}
          <button onClick={onToggleAlbumLike} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-rose-400 transition" title="Thả tim album">
            <Heart className={cn("w-5 h-5", album.isLiked && "fill-current text-rose-500")} />
          </button>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition" title="Đóng (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Central Photo View & Navigation Buttons */}
      <div className="relative flex-1 flex items-center justify-center p-4 min-h-0">
        {len > 1 && (
          <button
            onClick={prev}
            className="absolute left-4 p-3 rounded-2xl bg-black/40 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-95 z-10"
            title="Ảnh trước (Mũi tên trái)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {photo ? (
          <div className="max-w-5xl max-h-full flex flex-col items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photo.id}
              src={photo.url}
              alt={photo.caption || "Khoảnh khắc"}
              className="max-h-[66vh] w-auto object-contain rounded-2xl shadow-2xl transition-all"
            />
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3 max-w-2xl px-4">
              {photo.caption && (
                <p className="text-xs md:text-sm text-gray-300 text-center px-4 py-1.5 rounded-xl bg-black/40 backdrop-blur-xs">💬 {photo.caption}</p>
              )}
              <button
                onClick={() => onTogglePhotoLike(photo)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95",
                  photo.isLiked ? "bg-rose-500 text-white shadow-md shadow-rose-500/30" : "bg-white/10 hover:bg-white/20 text-[#fda4af]"
                )}
                title={photo.isLiked ? "Bỏ thích ảnh này" : "Thích ảnh này"}
              >
                <Heart className={cn("w-3.5 h-3.5", photo.isLiked && "fill-current")} />
                <span>{photo.likesCount}</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Album chưa có ảnh nào.</p>
        )}

        {len > 1 && (
          <button
            onClick={next}
            className="absolute right-4 p-3 rounded-2xl bg-black/40 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-95 z-10"
            title="Ảnh tiếp theo (Mũi tên phải)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      <div className="p-4 border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto custom-scroll z-10">
        {photos.map((p, idx) => (
          <button
            key={p.id}
            onClick={() => onIndex(idx)}
            className={cn(
              "w-16 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all",
              index === idx ? "border-primary scale-105 opacity-100 shadow-md" : "border-transparent opacity-50 hover:opacity-80"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumbUrl} alt={p.caption || `Ảnh ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
