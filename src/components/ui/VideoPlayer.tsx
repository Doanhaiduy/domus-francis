"use client";

// Trình phát video khoảnh khắc. Có HLS (Cloudinary) ⇒ phát thích ứng băng thông: Safari/iOS phát native, trình duyệt khác nạp hls.js (chỉ tải khi
// cần xem video). HLS lỗi / chậm quá 7 giây ⇒ tự lùi về MP4. Chỉ nạp metadata trước (preload) để không tốn dữ liệu di động khi lướt album.
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  mp4Url: string;
  hlsUrl?: string | null;
  posterUrl?: string | null;
  autoPlay?: boolean;
  className?: string;
  /** Gọi khi video không phát được bằng cả HLS lẫn MP4 */
  onFail?: () => void;
}

export function VideoPlayer({ mp4Url, hlsUrl, posterUrl, autoPlay = false, className, onFail }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let destroyed = false;
    let hlsInstance: { destroy: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let usingMp4 = false;

    const fallbackToMp4 = () => {
      if (destroyed || usingMp4) return;
      usingMp4 = true;
      clearTimeout(timer);
      hlsInstance?.destroy();
      hlsInstance = null;
      el.removeEventListener("error", fallbackToMp4);
      el.src = mp4Url;
      el.addEventListener("error", () => onFail?.(), { once: true });
      el.load();
      if (autoPlay) void el.play().catch(() => {});
    };
    const started = () => clearTimeout(timer);
    el.addEventListener("loadeddata", started, { once: true });

    if (!hlsUrl) {
      usingMp4 = true;
      el.src = mp4Url;
      el.addEventListener("error", () => onFail?.(), { once: true });
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = hlsUrl;
      el.addEventListener("error", fallbackToMp4, { once: true });
      timer = setTimeout(fallbackToMp4, 7000);
    } else {
      timer = setTimeout(fallbackToMp4, 7000);
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed || usingMp4) return;
          if (!Hls.isSupported()) return fallbackToMp4();
          const hls = new Hls({ maxBufferLength: 20, enableWorker: true });
          hlsInstance = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(el);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) fallbackToMp4();
          });
          if (autoPlay) hls.on(Hls.Events.MANIFEST_PARSED, () => void el.play().catch(() => {}));
        })
        .catch(fallbackToMp4);
    }
    if (autoPlay && (usingMp4 || el.canPlayType("application/vnd.apple.mpegurl"))) void el.play().catch(() => {});

    return () => {
      destroyed = true;
      clearTimeout(timer);
      hlsInstance?.destroy();
      el.removeEventListener("loadeddata", started);
      el.removeEventListener("error", fallbackToMp4);
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [mp4Url, hlsUrl, autoPlay, onFail]);

  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      poster={posterUrl ?? undefined}
      controlsList="nodownload"
      className={cn("w-full max-h-[75dvh] rounded-2xl bg-black", className)}
    />
  );
}
