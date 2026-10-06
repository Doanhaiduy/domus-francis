"use client";

import React from "react";

/** Lỗi ở tầng gốc (layout hỏng): giao diện tối giản, không phụ thuộc Tailwind/Provider. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#faf8ff", color: "#131b2e" }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>Ứng dụng gặp lỗi</h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 16px" }}>Vui lòng tải lại trang. Nếu vẫn lỗi, báo Ban điều hành.</p>
          <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 12, border: 0, background: "#5f3add", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Tải lại
          </button>
        </div>
      </body>
    </html>
  );
}
