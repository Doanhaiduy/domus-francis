"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { useApp, type ToastMessage } from "@/lib/store";
import { Portal } from "@/components/ui/Portal";

// Thông báo nổi (toast). Vẽ qua Portal ra thẳng <body> với z-index cao hơn mọi hộp thoại (z-[999]/z-[1000]) nên không bao giờ bị lớp nền
// mờ của modal che mất. Chữ cỡ 14px, có biểu tượng + thanh đếm ngược; rê chuột / chạm giữ thì tạm dừng đếm ngược.
// Điện thoại: hiện ở ĐẦU màn hình (không bị bàn phím hay thanh điều hướng dưới che), trừ vùng tai thỏ.

const STYLE: Record<ToastMessage["type"], { icon: React.ReactNode; accent: string; ring: string; bar: string; chip: string; title: string }> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5" aria-hidden />,
    accent: "border-l-emerald-500",
    ring: "ring-emerald-500/20",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700",
    title: "Thành công",
  },
  error: {
    icon: <AlertCircle className="w-5 h-5" aria-hidden />,
    accent: "border-l-rose-500",
    ring: "ring-rose-500/20",
    bar: "bg-rose-500",
    chip: "bg-rose-100 text-rose-700",
    title: "Có lỗi xảy ra",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" aria-hidden />,
    accent: "border-l-amber-500",
    ring: "ring-amber-500/20",
    bar: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700",
    title: "Lưu ý",
  },
  info: {
    icon: <Info className="w-5 h-5" aria-hidden />,
    accent: "border-l-primary",
    ring: "ring-primary/20",
    bar: "bg-primary",
    chip: "bg-purple-100 text-primary",
    title: "Thông báo",
  },
};

/** Thời gian hiển thị: lỗi và tin dài ở lại lâu hơn để kịp đọc. */
function durationOf(t: ToastMessage): number {
  if (t.duration) return t.duration;
  const base = t.type === "error" ? 8000 : t.type === "warning" ? 6500 : t.type === "info" ? 5000 : 4200;
  return Math.min(14000, base + Math.max(0, t.message.length - 40) * 45);
}

function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const s = STYLE[toast.type];
  const total = durationOf(toast);
  const [paused, setPaused] = useState(false);
  const left = useRef(total);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(timer.current);
      left.current = Math.max(800, left.current - (Date.now() - startedAt.current));
    };
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 w-full rounded-2xl border border-gray-100 border-l-4 ${s.accent} bg-white text-gray-900 shadow-2xl shadow-black/25 ring-4 ${s.ring} pl-3.5 pr-2.5 py-3.5 animate-toastIn`}
    >
      <span className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${s.chip}`}>{s.icon}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{s.title}</p>
        <p className="text-sm font-semibold leading-snug text-gray-900 break-words whitespace-pre-line">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng thông báo"
        className="shrink-0 -mt-0.5 p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
      >
        <X className="w-4 h-4" />
      </button>
      <span
        aria-hidden
        className={`absolute left-0 bottom-0 h-1 w-full origin-left ${s.bar} opacity-60 animate-toastBar`}
        style={{ animationDuration: `${total}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </div>
  );
}

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();
  if (!toasts.length) return null;
  return (
    <Portal>
      <div
        aria-live="polite"
        className="pointer-events-none fixed z-[3000] inset-x-0 top-0 sm:inset-x-auto sm:right-5 sm:top-5 flex flex-col items-stretch gap-2.5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-0 sm:pt-0 sm:w-[26rem] max-w-full"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </Portal>
  );
};
