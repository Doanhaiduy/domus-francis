"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Khung bắt lỗi của mọi trang: báo về máy chủ (log) và cho người dùng thử lại thay vì màn hình trắng. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/v1/public/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.message?.slice(0, 500) ?? "unknown", digest: error.digest, path: window.location.pathname, stack: error.stack?.slice(0, 2000) }),
    })
      .then((r) => r.text())
      .catch(() => {});
  }, [error]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center bg-white border border-rose-100 rounded-3xl p-10">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-extrabold text-gray-900">Có lỗi xảy ra</h2>
      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">Trang này tạm thời không hiển thị được. Lỗi đã được ghi nhận — bạn thử tải lại nhé.</p>
      {error.digest && <p className="text-[11px] text-gray-400 mt-2 font-mono">Mã lỗi: {error.digest}</p>}
      <button onClick={reset} className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold transition active:scale-95">
        <RefreshCw className="w-3.5 h-3.5" /> Thử lại
      </button>
    </div>
  );
}
