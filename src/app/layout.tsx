import type { Metadata } from "next";
// Font tự lưu trữ từ gói npm @fontsource (không tải từ Google Fonts lúc chạy hay lúc build).
// Be Vietnam Pro: thiết kế riêng cho tiếng Việt (dấu chồng Ậ Ể Ữ… cân đối), đủ độ đậm 400–900 và chữ nghiêng.
// QUAN TRỌNG: nhập file "<độ đậm>.css" (kèm unicode-range cho từng bộ ký tự: vietnamese/latin-ext/latin) — KHÔNG nhập các file
// "vietnamese-400.css", "latin-400.css"… riêng lẻ vì chúng không có unicode-range, file khai báo sau sẽ đè lên toàn bộ ký tự.
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/be-vietnam-pro/900.css";
import "@fontsource/be-vietnam-pro/400-italic.css";
import "@fontsource/be-vietnam-pro/600-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
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
