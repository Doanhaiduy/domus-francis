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
          <div className="fixed inset-0 z-50 flex lg:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={onClose}
            />
            {/* Sheet modal */}
            <div className="relative mt-auto w-full max-h-[85vh] flex flex-col bg-surface rounded-t-3xl shadow-2xl border-t border-outline-variant/30 overflow-hidden animate-in slide-in-from-bottom duration-200">
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
              <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
                {children}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
