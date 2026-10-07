"use client";

// Thẻ tệp đính kèm dùng chung: nhận diện loại tệp rồi xem trước đúng kiểu —
// ảnh hiện thẳng (bấm để phóng to), PDF/tài liệu hiện thẻ có biểu tượng + nút Xem/Tải về.
import React, { useEffect, useState } from "react";
import { Download, ExternalLink, File as FileIcon, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo, Presentation, X, ZoomIn } from "lucide-react";
import { FILE_KIND_LABEL, fileKind, type FileKind } from "@/lib/file-kind";
import { formatFileSize } from "@/lib/community-format";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";

export interface AttachmentLike {
  id?: string;
  name: string;
  sizeBytes?: number | null;
  mime?: string | null;
  /** Xem trực tiếp (inline) */
  url: string;
  /** Tải về (attachment); mặc định url + ?download=1 */
  downloadUrl?: string;
}

const KIND_STYLE: Record<FileKind, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  image: { icon: FileIcon, tone: "bg-purple-100 text-primary" },
  pdf: { icon: FileText, tone: "bg-rose-100 text-rose-600" },
  word: { icon: FileText, tone: "bg-blue-100 text-blue-600" },
  excel: { icon: FileSpreadsheet, tone: "bg-emerald-100 text-emerald-600" },
  powerpoint: { icon: Presentation, tone: "bg-orange-100 text-orange-600" },
  text: { icon: FileText, tone: "bg-gray-100 text-gray-600" },
  archive: { icon: FileArchive, tone: "bg-amber-100 text-amber-700" },
  video: { icon: FileVideo, tone: "bg-indigo-100 text-indigo-600" },
  audio: { icon: FileAudio, tone: "bg-pink-100 text-pink-600" },
  other: { icon: FileIcon, tone: "bg-purple-100 text-primary" },
};

const withQuery = (url: string, q: string) => `${url}${url.includes("?") ? "&" : "?"}${q}`;

function Lightbox({ src, name, downloadUrl, onClose }: { src: string; name: string; downloadUrl: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
      <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" onClick={onClose} role="dialog" aria-label={`Xem ảnh ${name}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-semibold truncate">{name}</p>
          <div className="flex items-center gap-2 shrink-0">
            <a href={downloadUrl} download={name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold"><Download className="w-3.5 h-3.5" /> Tải về</a>
            <button type="button" onClick={onClose} className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25" aria-label="Đóng"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      </div>
    </Portal>
  );
}

export function AttachmentCard({ file, className, onDownload }: { file: AttachmentLike; className?: string; onDownload?: () => void }) {
  const kind = fileKind(file.mime, file.name);
  const [zoom, setZoom] = useState(false);
  const [broken, setBroken] = useState(false);
  const downloadUrl = file.downloadUrl ?? withQuery(file.url, "download=1");
  const size = formatFileSize(file.sizeBytes ?? 0);
  const meta = [size, FILE_KIND_LABEL[kind]].filter(Boolean).join(" · ");

  if (kind === "image" && !broken) {
    return (
      <figure className={cn("rounded-2xl border border-purple-100 bg-purple-50/40 overflow-hidden", className)}>
        <button type="button" onClick={() => setZoom(true)} className="group relative block w-full bg-gray-50" title="Bấm để xem ảnh lớn">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withQuery(file.url, "v=medium")} alt={file.name} loading="lazy" onError={() => setBroken(true)} className="w-full max-h-96 object-contain mx-auto" />
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/55 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition">
            <ZoomIn className="w-3 h-3" /> Phóng to
          </span>
        </button>
        <figcaption className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{file.name}</p>
            <p className="text-[10px] text-gray-400">{meta}</p>
          </div>
          <a href={downloadUrl} download={file.name} onClick={onDownload} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 transition shrink-0">
            <Download className="w-3.5 h-3.5" /> Tải về
          </a>
        </figcaption>
        {zoom && <Lightbox src={file.url} name={file.name} downloadUrl={downloadUrl} onClose={() => setZoom(false)} />}
      </figure>
    );
  }

  const { icon: Icon, tone } = KIND_STYLE[broken ? "other" : kind];
  const viewable = kind === "pdf" || kind === "text" || kind === "video" || kind === "audio";
  return (
    <div className={cn("p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tone)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 truncate">{file.name}</p>
          <p className="text-[10px] text-gray-400">{meta}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {viewable && (
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold transition">
            <ExternalLink className="w-3.5 h-3.5" /> Xem
          </a>
        )}
        <a href={downloadUrl} download={file.name} onClick={onDownload} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 transition">
          <Download className="w-3.5 h-3.5" /> Tải về
        </a>
      </div>
    </div>
  );
}
