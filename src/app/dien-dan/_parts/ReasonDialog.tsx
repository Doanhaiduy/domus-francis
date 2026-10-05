"use client";

import React, { useEffect, useState } from "react";
import { X, Flag } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomTextarea } from "@/components/ui/FormControls";

export interface ReasonDialogProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  placeholder?: string;
  confirmText?: string;
  minLength?: number;
  onClose: () => void;
  /** Trả về promise: dialog chờ xong mới đóng (lỗi thì giữ nguyên để sửa lý do). */
  onConfirm: (reason: string) => Promise<void> | void;
}

/** Hộp thoại nhập lý do (báo cáo vi phạm, xem tác giả ý ẩn danh, hủy buổi phụng vụ…). */
export function ReasonDialog({
  isOpen,
  title,
  description,
  placeholder = "Nêu rõ lý do…",
  confirmText = "Gửi",
  minLength = 5,
  onClose,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const ok = reason.trim().length >= minLength;

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999] overflow-y-auto bg-black/60 backdrop-blur-xs p-4 flex items-center justify-center animate-fadeIn">
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ok || busy) return;
            setBusy(true);
            try {
              await onConfirm(reason.trim());
              onClose();
            } catch {
              /* thông báo lỗi do nơi gọi hiển thị */
            } finally {
              setBusy(false);
            }
          }}
          className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 p-6 flex flex-col gap-4 relative animate-scaleUp"
        >
          <button type="button" onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4 pr-6">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 border border-amber-200">
              <Flag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 tracking-tight leading-snug">{title}</h3>
              {description && <div className="mt-1 text-xs text-gray-600 leading-relaxed font-medium">{description}</div>}
            </div>
          </div>
          <CustomTextarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={placeholder} autoFocus maxLength={1000} />
          <div className="text-[11px] text-gray-400 -mt-2">Tối thiểu {minLength} ký tự.</div>
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors">
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!ok || busy}
              className="px-5 py-2 rounded-xl text-xs font-bold transition-all bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-200 active:scale-95 disabled:opacity-50"
            >
              {busy ? "Đang gửi…" : confirmText}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
