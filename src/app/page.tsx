import type { Metadata } from "next";
import HomeDashboard from "@/components/home/HomeDashboard";

// Trang Tổng quan: thành phần máy chủ chỉ để đặt tiêu đề trang; nội dung (thành phần trình duyệt) ở components/home/HomeDashboard.tsx.
export const metadata: Metadata = { title: "Tổng quan · Lưu Xá Phanxicô" };

export default function HomePage() {
  return <HomeDashboard />;
}
