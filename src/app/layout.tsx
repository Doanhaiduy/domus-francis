import type { Metadata } from "next";
// Font tự lưu trữ từ gói npm @fontsource (không tải từ Google Fonts lúc chạy hay lúc build)
import "@fontsource/plus-jakarta-sans/vietnamese-400.css";
import "@fontsource/plus-jakarta-sans/vietnamese-500.css";
import "@fontsource/plus-jakarta-sans/vietnamese-600.css";
import "@fontsource/plus-jakarta-sans/vietnamese-700.css";
import "@fontsource/plus-jakarta-sans/vietnamese-800.css";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { SessionProvider } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Lưu Xá Phanxicô - Quản Lý Cộng Đoàn Sinh Viên",
  description: "Ứng dụng nội bộ quản lý sinh hoạt, thu chi, cơm nước, phụng vụ cho anh em Lưu Xá Phanxicô Assisi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="font-sans antialiased">
        <SessionProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
          </AppProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
