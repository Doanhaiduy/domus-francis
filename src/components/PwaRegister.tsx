"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";

/** Đăng ký service worker một lần khi mở ứng dụng (cần cho cài đặt PWA, trang mất kết nối và thông báo đẩy). */
export function PwaRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
