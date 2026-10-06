import type { Metadata, Viewport } from "next";
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
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import { PwaRegister } from "@/components/PwaRegister";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Lưu Xá Phanxicô - Quản Lý Cộng Đoàn Sinh Viên",
  description: "Ứng dụng nội bộ quản lý sinh hoạt, thu chi, cơm nước, phụng vụ cho anh em Lưu Xá Phanxicô Assisi",
  applicationName: "Lưu Xá Phanxicô",
  appleWebApp: { capable: true, title: "Lưu Xá", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5f3add" },
    { media: "(prefers-color-scheme: dark)", color: "#12111a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: script trong <head> gắn lớp "dark"/color-scheme lên <html> trước khi React chạy
    <html lang="vi" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {/* Liên kết "bỏ qua" cho người dùng bàn phím / trình đọc màn hình: hiện khi được focus */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[1000] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-primary focus:text-white focus:text-sm focus:font-bold focus:shadow-lg">
          Bỏ qua đến nội dung chính
        </a>
        <ThemeProvider>
          <SessionProvider>
            <AppProvider>
              <AppShell>{children}</AppShell>
            </AppProvider>
          </SessionProvider>
        </ThemeProvider>
        <PwaRegister />
        {/* Số liệu truy cập + tốc độ thật (chỉ hoạt động trên Vercel khi đã bật Web Analytics / Speed Insights trong dự án) */}
        {process.env.VERCEL ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
