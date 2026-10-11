"use client";

import React from "react";
import { X } from "lucide-react";
import { Portal } from "./Portal";
import { cn } from "@/lib/utils";

export interface MobileDetailSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function MobileDetailSheet({
  open,
  onClose,
  title,
  className,
  children,
}: MobileDetailSheetProps) {
  return (
    <>
      {/* Desktop view: rendered in-place */}
      <div className={cn("hidden lg:block", className)}>
        {children}
      </div>

      {/* Mobile view: bottom sheet / slide-over dialog */}
      {open && (
        <Portal>
          {/* Lớp phủ = nền mờ bấm để đóng; SheetEnhancer thêm thanh nắm + kéo xuống để đóng */}
          <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50 backdrop-blur-xs" onClick={onClose}>
            {/* Sheet modal */}
            <div onClick={(e) => e.stopPropagation()} className="relative w-full max-h-[92dvh] flex flex-col bg-surface rounded-t-3xl shadow-2xl border-t border-outline-variant/30 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 bg-surface-container-low shrink-0">
                <h3 className="font-bold text-sm text-on-surface truncate pr-2">
                  {title || "Chi tiết"}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] overscroll-contain">
                {children}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
