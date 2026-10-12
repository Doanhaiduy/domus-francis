import type { Metadata } from "next";

// Chỉ đặt tiêu đề thẻ trình duyệt cho trang (trang là thành phần trình duyệt nên không tự khai báo metadata được).
export const metadata: Metadata = { title: "Học tập · Lưu Xá Phanxicô" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
