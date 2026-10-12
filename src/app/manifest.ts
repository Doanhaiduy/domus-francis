import type { MetadataRoute } from "next";

// Web App Manifest: cho phép "Cài đặt ứng dụng / Thêm vào màn hình chính" (Android, iOS 16.4+, máy tính) và nhận thông báo đẩy.
// Lối tắt (giữ lâu biểu tượng ứng dụng trên Android / chuột phải trên máy tính): các việc anh em làm hằng ngày. Biểu tượng lối tắt sinh
// bằng lucide (chữ trắng trên nền tím thương hiệu) — public/icons/shortcut-*.png. "/?viec=check-in-le" do thẻ "Việc của tôi hôm nay" mở thẳng
// hộp thoại check-in đi lễ.
const shortcutIcons = (name: string) => [
  { src: `/icons/shortcut-${name}.png`, sizes: "96x96", type: "image/png" },
  { src: `/icons/shortcut-${name}-192.png`, sizes: "192x192", type: "image/png" },
];

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
    dir: "ltr",
    categories: ["lifestyle", "productivity"],
    background_color: "#faf8ff",
    theme_color: "#5f3add",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Đăng ký cơm hôm nay", short_name: "Đăng ký cơm", description: "Báo ăn / không ăn bữa trưa, bữa tối", url: "/bep-com", icons: shortcutIcons("meal") },
      { name: "Viết đơn xin phép", short_name: "Xin phép", description: "Xin vắng, về muộn, ngủ ngoài, về quê", url: "/xin-phep", icons: shortcutIcons("leave") },
      { name: "Check-in đi lễ", short_name: "Check-in lễ", description: "Xác nhận đã tham dự Thánh lễ hôm nay", url: "/?viec=check-in-le", icons: shortcutIcons("mass") },
      { name: "Thu chi & nộp quỹ", short_name: "Thu chi", description: "Khoản quỹ chưa đóng, mã QR nộp quỹ, sổ quỹ", url: "/thu-chi", icons: shortcutIcons("finance") },
    ],
  };
}
