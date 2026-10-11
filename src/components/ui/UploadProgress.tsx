"use client";

import React from "react";
import { Loader2, X } from "lucide-react";
import type { UploadState } from "@/lib/use-uploader";

const LABEL = {
  optimizing: "Đang tối ưu ảnh…",
  uploading: "Đang tải lên",
  processing: "Đang xử lý trên máy chủ…",
} as const;

/** Thanh tiến độ tải ảnh + nút Hủy. `state` null ⇒ không hiện. */
export function UploadProgress({ state, onCancel, className = "" }: { state: UploadState | null; onCancel: () => void; className?: string }) {
  if (!state) return null;
  const pct = Math.round(state.ratio * 100);
  const determinate = state.phase === "uploading";
  const text = state.phase === "uploading" ? `${LABEL.uploading} ${pct}%` : LABEL[state.phase];
  const multi = state.total && state.total > 1 ? ` · ảnh ${state.index}/${state.total}` : "";
  return (
    <div className={`rounded-2xl border border-purple-200 bg-purple-50/50 p-3 ${className}`} role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-800 truncate">
            {text}
            <span className="font-medium text-gray-500">{multi}</span>
          </p>
          <p className="text-[11px] text-gray-500 truncate">{state.name}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 bg-white text-[11px] font-bold text-rose-600 hover:bg-rose-50 active:scale-95 transition"
        >
          <X className="w-3.5 h-3.5" aria-hidden /> Hủy tải lên
        </button>
      </div>
      <div
        className="mt-2.5 h-2 rounded-full bg-purple-100 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? pct : undefined}
        aria-label="Tiến độ tải lên"
      >
        {determinate ? (
          <div className="h-full bg-primary rounded-full transition-[width] duration-150" style={{ width: `${Math.max(3, pct)}%` }} />
        ) : (
          <div className="h-full w-1/3 bg-primary/70 rounded-full animate-indeterminate" />
        )}
      </div>
    </div>
  );
}
