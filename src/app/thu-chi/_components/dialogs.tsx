"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";

/** Khung modal dùng chung của trang Thu Chi (giữ phong cách modal hiện có). */
export function DialogShell({
  open,
  onClose,
  icon,
  title,
  subtitle,
  children,
  footer,
  maxWidth = "max-w-lg",
  z = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  z?: string;
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
      <div onClick={onClose} className={`fixed inset-0 bg-gray-900/50 backdrop-blur-sm ${z} overflow-y-auto p-3 sm:p-5 animate-in fade-in duration-150`}>
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidth} my-auto bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150`}
          >
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold shrink-0">{icon}</div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{title}</h3>
                  {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">{children}</div>
            {footer && <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">{footer}</div>}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export const btnGhost = "px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700";
export const btnPrimary =
  "px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60";
export const btnDanger = "px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md shadow-rose-200 disabled:opacity-60";

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{error}</div>;
}

/** Hộp thoại bắt buộc nhập lý do (từ chối, hủy, đảo phiếu, hủy phiếu thu). Lý do ≥ 5 ký tự theo ràng buộc của DB. */
export function ReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  placeholder,
  icon,
  danger = true,
  minLength = 5,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  title: string;
  message?: React.ReactNode;
  confirmText: string;
  placeholder?: string;
  icon: React.ReactNode;
  danger?: boolean;
  minLength?: number;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  const go = async () => {
    if (reason.trim().length < minLength) return setError(`Lý do tối thiểu ${minLength} ký tự.`);
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={icon}
      title={title}
      z="z-[60]"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Quay lại
          </button>
          <button type="button" disabled={busy} onClick={go} className={danger ? btnDanger : btnPrimary}>
            {busy ? "Đang xử lý..." : confirmText}
          </button>
        </>
      }
    >
      {message && <div className="text-xs text-gray-600 leading-relaxed">{message}</div>}
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          Lý do <span className="text-rose-500">*</span>
        </label>
        <textarea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary"
        />
      </div>
      <ErrorBox error={error} />
    </DialogShell>
  );
}
