"use client";
// Thêm video vào album: chọn tệp → kiểm tra loại / dung lượng / thời lượng → chụp ảnh bìa ngay trên máy → tải THẲNG lên nơi lưu trữ
// (Cloudinary / Supabase Storage) có thanh tiến độ → ghi vào album. Video không đi qua máy chủ ứng dụng.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, Film, Loader2, Upload, X } from "lucide-react";
import { CustomInput } from "@/components/ui/FormControls";
import { uploadFile } from "@/components/ui/ImageUploadDropzone";
import { errorMessage } from "@/lib/api";
import { momentsApi } from "@/lib/data/moments";
import { fmtBytes, fmtDuration, probeVideo, uploadVideoFile, type VideoProbe, type VideoUploadHandle } from "@/lib/video-upload";
import type { MomentAlbumDetailDto, MomentAlbumDto, VideoLimitsDto } from "@/lib/types/moments";

export interface AddVideoModalProps {
  album: MomentAlbumDto | null;
  open: boolean;
  limits: VideoLimitsDto;
  onClose: () => void;
  onSaved: (album: MomentAlbumDetailDto) => void;
  showToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

type Phase = "idle" | "preparing" | "uploading" | "saving";

export function AddVideoModal({ album, open, limits, onClose, onSaved, showToast }: AddVideoModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const handle = useRef<VideoUploadHandle | null>(null);
  const busy = phase !== "idle";

  useEffect(() => {
    if (open) {
      setFile(null);
      setProbe(null);
      setPosterUrl(null);
      setCaption("");
      setPhase("idle");
      setProgress(0);
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    if (!posterUrl) return;
    return () => URL.revokeObjectURL(posterUrl);
  }, [posterUrl]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !album || !mounted) return null;

  const limitMb = Math.round(limits.maxBytes / 1024 / 1024);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setProbe(null);
    setPosterUrl(null);
    if (!limits.mimes.includes(f.type)) {
      setFile(null);
      return setError("Chỉ nhận video MP4, MOV (iPhone), WebM, M4V hoặc 3GP.");
    }
    if (f.size > limits.maxBytes) {
      setFile(null);
      const hint = limits.provider === "supabase" ? " Hãy cắt ngắn hoặc nén video (vd. quay 720p) rồi chọn lại." : "";
      return setError(`Video nặng ${fmtBytes(f.size)}, vượt giới hạn ${limitMb} MB.${hint}`);
    }
    setFile(f);
    setPhase("preparing");
    const p = await probeVideo(f);
    setPhase("idle");
    if (p.durationMs && p.durationMs > limits.maxDurationS * 1000) {
      setFile(null);
      return setError(`Video dài ${fmtDuration(p.durationMs)}, tối đa ${Math.round(limits.maxDurationS / 60)} phút — hãy cắt ngắn rồi chọn lại.`);
    }
    setProbe(p);
    if (p.poster) setPosterUrl(URL.createObjectURL(p.poster));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setError(null);
    try {
      setPhase("uploading");
      setProgress(0);
      const init = await momentsApi.videoInit(album.id, { type: file.type, size: file.size });
      handle.current = uploadVideoFile(file, init, setProgress);
      const upload = await handle.current.promise;
      setPhase("saving");
      // ảnh bìa là ảnh thường (xóa EXIF, tạo bản thu nhỏ); lỗi ảnh bìa không làm hỏng việc thêm video
      let posterFileId: string | null = null;
      if (probe?.poster) {
        try {
          posterFileId = (await uploadFile(new File([probe.poster], "poster.jpg", { type: "image/jpeg" }), "moments")).id;
        } catch {
          posterFileId = null;
        }
      }
      const saved = await momentsApi.addVideo(album.id, {
        ticket: init.ticket,
        caption: caption.trim() || null,
        durationMs: probe?.durationMs ?? null,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
        posterFileId,
        upload,
      });
      showToast("success", `Đã thêm video vào album "${saved.title}".`);
      onSaved(saved);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") setError("Đã hủy tải video.");
      else setError(errorMessage(err));
    } finally {
      handle.current = null;
      setPhase("idle");
    }
  };

  const cancelUpload = () => handle.current?.abort();
  const label = phase === "preparing" ? "Đang đọc video…" : phase === "uploading" ? `Đang tải lên… ${Math.round(progress * 100)}%` : phase === "saving" ? "Đang lưu vào album…" : "";

  return createPortal(
    <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] overflow-y-auto bg-black/60 backdrop-blur-xs p-0 sm:p-5 animate-fadeIn">
      <div className="flex min-h-full items-end sm:items-center justify-center">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[92dvh] overflow-hidden">
          <div className="shrink-0 flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
                <Clapperboard className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-gray-900">Thêm Video Vào Album</h3>
                <p className="text-[11px] text-gray-500 truncate">{album.title}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 custom-scroll">
              <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
              {!file ? (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/40 hover:bg-purple-50 p-8 flex flex-col items-center gap-2 text-center transition"
                >
                  <Film className="w-8 h-8 text-primary" />
                  <span className="text-sm font-bold text-gray-900">Chọn video từ máy</span>
                  <span className="text-[11px] text-gray-500">MP4, MOV, WebM — tối đa {limitMb} MB, {Math.round(limits.maxDurationS / 60)} phút</span>
                </button>
              ) : (
                <div className="rounded-2xl border border-purple-100 bg-white overflow-hidden">
                  <div className="relative aspect-video bg-gray-900 flex items-center justify-center">
                    {posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={posterUrl} alt="Ảnh bìa video" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <Film className="w-10 h-10 text-white/50" />
                    )}
                    {phase === "preparing" && <Loader2 className="relative w-6 h-6 text-white animate-spin" />}
                    {probe?.durationMs ? <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-bold">{fmtDuration(probe.durationMs)}</span> : null}
                  </div>
                  <div className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{file.name}</p>
                      <p className="text-[11px] text-gray-500">{fmtBytes(file.size)}{probe?.width ? ` · ${probe.width}×${probe.height}` : ""}</p>
                    </div>
                    {!busy && (
                      <button type="button" onClick={() => input.current?.click()} className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold text-primary bg-purple-50 hover:bg-purple-100">
                        Đổi video
                      </button>
                    )}
                  </div>
                </div>
              )}

              {file && (
                <CustomInput label="Chú thích (không bắt buộc)" placeholder="VD: Tập bóng chuyền chiều thứ Bảy" value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} disabled={busy} />
              )}

              {(phase === "uploading" || phase === "saving") && (
                <div className="space-y-1.5" role="status" aria-live="polite">
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round((phase === "saving" ? 1 : progress) * 100)}%` }} />
                  </div>
                  <p className="text-xs font-semibold text-gray-700">{label}</p>
                </div>
              )}

              {limits.provider === "supabase" && !error && (
                <p className="text-[11px] text-gray-500 leading-relaxed">Kho video hiện giới hạn {limitMb} MB mỗi tệp. Video quay điện thoại nên chọn chất lượng 720p hoặc cắt ngắn để nhẹ và xem mượt hơn.</p>
              )}
              {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{error}</div>}
            </div>

            <div className="shrink-0 flex items-center justify-end gap-2.5 p-4 px-5 border-t border-gray-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {phase === "uploading" ? (
                <button type="button" onClick={cancelUpload} className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50">
                  Hủy tải lên
                </button>
              ) : (
                <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-60">
                  Đóng
                </button>
              )}
              <button
                type="submit"
                disabled={busy || !file}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Tải video lên
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
