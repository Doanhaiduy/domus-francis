"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { useApp } from "@/lib/store";

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => {
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-white text-gray-900 shadow-xl border border-purple-100 text-xs font-semibold animate-in slide-in-from-bottom duration-200"
          >
            {toast.type === "success" && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            {toast.type === "error" && (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            {toast.type === "warning" && (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            {toast.type === "info" && (
              <Info className="w-4 h-4 text-primary shrink-0" />
            )}

            <span>{toast.message}</span>

            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
