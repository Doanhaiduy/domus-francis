"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";

/**
 * Khung hộp thoại của phần Quyền riêng tư (cùng kiểu hộp thoại chung: nền mờ + thẻ bg-white rounded-3xl ⇒ trên điện thoại tự thành tờ trượt
 * từ đáy, kéo xuống để đóng; ModalGuard tự hỏi "Thoát mà chưa lưu?" khi đã nhập dở).
 */
export function PrivacyDialog({
  open,
  onClose,
  icon,
  title,
  subtitle,
  children,
  footer,
  maxWidth = "max-w-lg",
  tone = "primary",
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  tone?: "primary" | "danger";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] overflow-y-auto p-0 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-end sm:items-center justify-center">
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full sm:my-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden animate-sheetUp sm:animate-scaleIn",
              maxWidth,
            )}
          >
            <div className="flex items-start justify-between gap-2 p-4 sm:p-6 sm:pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-primary")}>{icon}</div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">{title}</h3>
                  {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Đóng" className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">{children}</div>
            {footer && (
              <div className="p-3 sm:p-4 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-gray-100 shrink-0 flex flex-wrap items-center justify-end gap-2 bg-gray-50/70">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export const dlgBtnGhost = "px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 disabled:opacity-60";
export const dlgBtnPrimary =
  "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60";
export const dlgBtnDanger =
  "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md shadow-rose-200 transition active:scale-95 disabled:opacity-60";
