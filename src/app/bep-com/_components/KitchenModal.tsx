"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconClass?: string;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Khung hộp thoại dùng chung của trang Bếp & Cơm (cùng phong cách các modal khác của ứng dụng). */
export default function KitchenModal({ open, onClose, title, subtitle, icon, iconClass = "bg-purple-50 text-primary", maxWidth = "max-w-lg", children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidth} bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[90vh] overflow-hidden`}
          >
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {icon && <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>{icon}</div>}
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{title}</h3>
                  {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100" aria-label="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">{children}</div>
            {footer && <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2.5 shrink-0">{footer}</div>}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export const btnPrimary =
  "px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
export const btnGhost = "px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition";
