// Các đường dẫn thuộc TRANG CÔNG KHAI (người ngoài xem, không cần đăng nhập, không dùng khung ứng dụng).
// Dùng chung cho middleware (không chuyển hướng đăng nhập), AppShell (không vẽ thanh bên) và SessionProvider (không gọi /auth/me).
export const PUBLIC_SITE_PATHS = ["/tin-tuc", "/gioi-thieu", "/lien-he", "/hoi-dap", "/thu-vien", "/ung-ho"] as const;

export const isPublicSitePath = (pathname: string): boolean => PUBLIC_SITE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Ảnh chia sẻ mặc định (Open Graph) khi trang không có ảnh riêng — sinh bởi scripts/gen-icons.mjs. */
export const OG_DEFAULT_IMAGES = [{ url: "/og-default.png", width: 1200, height: 630 }];
