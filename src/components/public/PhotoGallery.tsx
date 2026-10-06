"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface GalleryPhoto {
  id: string;
  thumb: string;
  full: string;
  caption: string | null;
}

/** Lưới ảnh + khung xem lớn (phím ← → Esc, vuốt ngang trên điện thoại). */
export function PhotoGallery({ photos, albumTitle }: { photos: GalleryPhoto[]; albumTitle: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);
  const close = useCallback(() => {
    setOpen(null);
    lastFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close, go]);

  const cur = open === null ? null : photos[open];

  return (
    <>
      <ul className="columns-2 md:columns-3 lg:columns-4 gap-3 [&>li]:mb-3">
        {photos.map((p, i) => (
          <li key={p.id} className="break-inside-avoid">
            <button
              type="button"
              onClick={(e) => {
                lastFocus.current = e.currentTarget;
                setOpen(i);
              }}
              className="group block w-full rounded-2xl overflow-hidden bg-gray-100 border border-purple-100 focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`Xem ảnh ${i + 1}${p.caption ? `: ${p.caption}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.caption || `${albumTitle} — ảnh ${i + 1}`} loading="lazy" className="w-full h-auto group-hover:scale-[1.03] transition-transform duration-500" />
            </button>
          </li>
        ))}
      </ul>

      {cur && open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${albumTitle} — ảnh ${open + 1}/${photos.length}`}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={close}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1);
          }}
        >
          <button ref={closeBtn} type="button" onClick={close} aria-label="Đóng" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center">
            <X className="w-6 h-6" />
          </button>
          {photos.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Ảnh trước" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Ảnh sau" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center">
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
          <figure className="max-w-[94vw] max-h-[88vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.full} alt={cur.caption || `${albumTitle} — ảnh ${open + 1}`} className="max-w-[94vw] max-h-[80vh] object-contain rounded-lg" />
            <figcaption className="mt-3 text-center text-sm text-white/85">
              {cur.caption && <span className="block font-semibold">{cur.caption}</span>}
              <span className="text-white/60 text-xs">{open + 1} / {photos.length}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
