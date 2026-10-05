"use client";

import React, { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomTextarea } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";

/** Hộp nhập lý do (trả lại / mở lại bảng điểm). minLength = 0 ⇒ lý do không bắt buộc. */
export default function ReasonDialog({
  open,
  title,
  description,
  placeholder,
  confirmText,
  minLength,
  tone = "danger",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  placeholder?: string;
  confirmText: string;
  minLength: number;
  tone?: "danger" | "warning";
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setBusy(false);
    }
  }, [open]);
  if (!open) return null;
  const tooShort = reason.trim().length < minLength;

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999] overflow-y-auto bg-black/60 backdrop-blur-xs p-4 flex items-center justify-center animate-fadeIn">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 p-6 flex flex-col gap-4 relative animate-scaleUp">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="pr-6">
            <h3 className="text-base font-black text-gray-900 tracking-tight leading-snug">{title}</h3>
            <div className="mt-1 text-xs text-gray-600 leading-relaxed font-medium">{description}</div>
          </div>
          <CustomTextarea
            label={minLength > 0 ? `Lý do (bắt buộc, tối thiểu ${minLength} ký tự)` : "Lý do / ghi chú (không bắt buộc)"}
            placeholder={placeholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors">
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={tooShort || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm(reason.trim());
                } finally {
                  setBusy(false);
                }
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed",
                tone === "danger"
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200 active:scale-95"
                  : "bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-200 active:scale-95"
              )}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
