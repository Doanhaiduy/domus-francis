"use client";
// Mục "Video" của album: lưới video (ảnh bìa + thời lượng), phát trong hộp thoại, xóa / ẩn video. Ảnh nằm ở mục Thư viện ảnh riêng.
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, EyeOff, Eye, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { errorMessage } from "@/lib/api";
import { momentsApi } from "@/lib/data/moments";
import { fmtBytes, fmtDuration } from "@/lib/video-upload";
import type { MomentAlbumDetailDto, MomentVideoDto } from "@/lib/types/moments";

export interface VideoSectionProps {
  videos: MomentVideoDto[];
  /** Số video theo danh sách album (hiện trong lúc chi tiết đang tải) */
  count: number;
  loading: boolean;
  canAdd: boolean;
  canModerate: boolean;
  onAdd: () => void;
  onChanged: (album: MomentAlbumDetailDto) => void;
  showToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

export function VideoSection({ videos, count, loading, canAdd, canModerate, onAdd, onChanged, showToast }: VideoSectionProps) {
  const [playing, setPlaying] = useState<MomentVideoDto | null>(null);
  const [toDelete, setToDelete] = useState<MomentVideoDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!loading && videos.length === 0 && !canAdd) return null;

  const run = async (id: string, fn: () => Promise<MomentAlbumDetailDto>, ok: string) => {
    setBusy(id);
    try {
      onChanged(await fn());
      showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Video của album">
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-purple-100 text-primary flex items-center justify-center shadow-xs shrink-0">
            <Clapperboard className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900">Video ({loading ? count : videos.length})</h2>
            <p className="text-xs text-gray-500">Nhấn vào video để xem ngay trong trang</p>
          </div>
        </div>
        {canAdd && (
          <button onClick={onAdd} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] shadow-xs active:scale-95 transition shrink-0">
            <Plus className="w-4 h-4" />
            <span>Thêm video</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: Math.min(3, Math.max(1, count)) }, (_, i) => (
            <div key={i} className="aspect-video rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-purple-200 bg-white p-8 text-center text-xs text-gray-500">
          Chưa có video nào trong album. {canAdd ? "Bấm “Thêm video” để chia sẻ khoảnh khắc đầu tiên." : ""}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {videos.map((v) => (
            <div key={v.id} className={`group bg-white rounded-2xl overflow-hidden border border-purple-50 shadow-2xs hover:shadow-lg transition ${busy === v.id ? "opacity-60 pointer-events-none" : ""}`}>
              <button type="button" onClick={() => setPlaying(v)} className="relative block w-full aspect-video bg-gray-900 text-left" aria-label={`Xem video${v.caption ? `: ${v.caption}` : ""}`}>
                {v.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.posterUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <Clapperboard className="absolute inset-0 m-auto w-10 h-10 text-white/40" />
                )}
                <span className="absolute inset-0 bg-black/10 group-hover:bg-black/25 transition" />
                <span className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-white/90 text-primary flex items-center justify-center shadow-lg group-hover:scale-105 transition">
                  <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                </span>
                {v.durationMs ? <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-bold">{fmtDuration(v.durationMs)}</span> : null}
                {v.status === "hidden" && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold">Đã ẩn</span>}
              </button>
              <div className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 line-clamp-2">{v.caption || "Video không có chú thích"}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{v.uploadedBy.name} · {v.date} · {fmtBytes(v.sizeBytes)}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {canModerate && (
                    <button
                      type="button"
                      title={v.status === "hidden" ? "Hiện lại video" : "Ẩn video (kiểm duyệt)"}
                      aria-label={v.status === "hidden" ? "Hiện lại video" : "Ẩn video"}
                      onClick={() => run(v.id, () => momentsApi.updateVideo(v.id, { hidden: v.status !== "hidden" }), v.status === "hidden" ? "Đã hiện lại video." : "Đã ẩn video.")}
                      className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50 transition"
                    >
                      {v.status === "hidden" ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  )}
                  {v.canDelete && (
                    <button type="button" title="Xóa video" aria-label="Xóa video" onClick={() => setToDelete(v)} className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition">
                      {busy === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {playing && <VideoModal video={playing} onClose={() => setPlaying(null)} />}
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const v = toDelete;
          setToDelete(null);
          if (v) void run(v.id, () => momentsApi.removeVideo(v.id), "Đã xóa video.");
        }}
        title="Xóa video này?"
        message={<>Video <b>{toDelete?.caption || "không có chú thích"}</b> sẽ bị xóa khỏi album và khỏi kho lưu trữ, không khôi phục được.</>}
        confirmText="Xóa video"
        cancelText="Giữ lại"
        variant="danger"
      />
    </section>
  );
}

function VideoModal({ video, onClose }: { video: MomentVideoDto; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div data-no-sheet onClick={onClose} className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-xs flex items-center justify-center p-0 sm:p-6 animate-fadeIn" role="dialog" aria-modal="true" aria-label="Xem video">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl flex flex-col gap-3">
        <button type="button" onClick={onClose} aria-label="Đóng video" className="self-end mr-3 mt-3 sm:mr-0 sm:mt-0 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition">
          <X className="w-5 h-5" />
        </button>
        {failed ? (
          <div className="mx-3 sm:mx-0 p-8 rounded-2xl bg-white text-center text-sm text-gray-700">
            Không phát được video này (định dạng chưa được trình duyệt hỗ trợ hoặc tệp không còn). Hãy thử mở bằng trình duyệt khác.
          </div>
        ) : (
          <VideoPlayer mp4Url={video.mp4Url} hlsUrl={video.hlsUrl} posterUrl={video.posterUrl} autoPlay onFail={() => setFailed(true)} className="sm:rounded-2xl rounded-none" />
        )}
        {video.caption && <p className="px-4 sm:px-0 pb-3 text-sm text-white/90">{video.caption}</p>}
      </div>
    </div>,
    document.body
  );
}
