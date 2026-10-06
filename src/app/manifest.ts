import type { MetadataRoute } from "next";

// Web App Manifest: cho phép "Cài đặt ứng dụng / Thêm vào màn hình chính" (Android, iOS 16.4+, máy tính) và nhận thông báo đẩy.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lưu Xá Phanxicô",
    short_name: "Lưu Xá",
    description: "Ứng dụng quản lý cộng đoàn sinh viên Công giáo Lưu Xá Phanxicô",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "vi",
    background_color: "#faf8ff",
    theme_color: "#5f3add",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Thông báo", url: "/thong-bao", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Lịch & Sự kiện", url: "/lich-su-kien", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Thu Chi", url: "/thu-chi", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
