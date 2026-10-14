"use client";

import { useEffect } from "react";

type Kind = "boundary" | "global" | "window" | "promise";

/** Gửi một lỗi phía trình duyệt về máy chủ (nhật ký lỗi ở Quản trị → Hệ thống). Không bao giờ ném lỗi; tối đa 10 lần mỗi lần mở trang. */
let sent = 0;
const seen = new Set<string>();
export function reportClientError(kind: Kind, message: string, stack?: string | null, digest?: string | null) {
  try {
    if (typeof window === "undefined" || sent >= 10) return;
    const key = `${kind}|${message}`.slice(0, 300);
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    const body = JSON.stringify({
      kind,
      message: (message || "unknown").slice(0, 500),
      digest: digest ?? undefined,
      path: window.location.pathname,
      stack: stack?.slice(0, 2000) ?? undefined,
    });
    // keepalive: vẫn gửi được khi người dùng rời trang ngay sau lỗi
    fetch("/api/v1/public/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* bỏ qua */
  }
}

/** Bắt lỗi JS chưa xử lý (window.onerror) và promise bị từ chối không ai bắt (unhandledrejection) trên mọi trang. */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // Lỗi tải tài nguyên / script bên ngoài (không có thông tin) ⇒ bỏ qua
      if (!e.message || e.message === "Script error.") return;
      reportClientError("window", e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string; stack?: string } | undefined;
      // Hủy yêu cầu (AbortController) và lỗi mạng của người dùng không phải lỗi ứng dụng
      if (r?.name === "AbortError" || /Failed to fetch|NetworkError|Load failed/i.test(r?.message ?? "")) return;
      // Lỗi API đã có mã (ApiClientError) do máy chủ ghi nhận rồi
      if (r && typeof r === "object" && "status" in r && "code" in r) return;
      reportClientError("promise", r?.message ?? String(e.reason ?? "unhandled rejection"), r?.stack);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
