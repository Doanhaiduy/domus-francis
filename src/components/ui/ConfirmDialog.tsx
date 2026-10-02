"use client";

import React, { useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { Portal } from "./Portal";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  icon?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Xác nhận",
  cancelText = "Hủy bỏ",
  variant = "danger",
  icon,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      iconBg: "bg-rose-100 text-rose-600 border border-rose-200",
      defaultIcon: <AlertTriangle className="w-6 h-6" />,
      confirmBtn:
        "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200 active:scale-95",
    },
    warning: {
      iconBg: "bg-amber-100 text-amber-600 border border-amber-200",
      defaultIcon: <AlertCircle className="w-6 h-6" />,
      confirmBtn:
        "bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-200 active:scale-95",
    },
    info: {
      iconBg: "bg-purple-100 text-primary border border-purple-200",
      defaultIcon: <Info className="w-6 h-6" />,
      confirmBtn:
        "bg-primary hover:bg-[#4d2dbf] text-white shadow-md shadow-purple-200 active:scale-95",
    },
  }[variant];

  return (
    <Portal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[999] overflow-y-auto bg-black/60 backdrop-blur-xs p-4 flex items-center justify-center animate-fadeIn"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 p-6 flex flex-col gap-4 relative animate-scaleUp"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header with Icon */}
          <div className="flex items-start gap-4 pr-6">
            <div
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                variantStyles.iconBg
              )}
            >
              {icon || variantStyles.defaultIcon}
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 tracking-tight leading-snug">
                {title}
              </h3>
              <div className="mt-1 text-xs text-gray-600 leading-relaxed font-medium">
                {message}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                variantStyles.confirmBtn
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
