"use client";

import { useEffect } from "react";
import { captureInstallPrompt, registerServiceWorker } from "@/lib/push";

/**
 * Đăng ký service worker một lần khi mở ứng dụng (cần cho cài đặt PWA, trang mất kết nối và thông báo đẩy) + bắt sự kiện
 * `beforeinstallprompt` ngay từ lúc tải trang (lib/push.ts giữ sự kiện trong kho dùng chung — nút "Cài ứng dụng" ở mọi nơi đều dùng được).
 */
export function PwaRegister() {
  useEffect(() => {
    captureInstallPrompt();
    void registerServiceWorker();
  }, []);
  return null;
}
