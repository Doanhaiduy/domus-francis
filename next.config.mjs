import { readFileSync } from "node:fs";

// Số phiên bản thật = "version" trong package.json (mỗi lần phát hành phải tăng — xem src/content/changelog.ts, scripts/check-version.mjs)
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cho phép chạy song song một máy chủ thử nghiệm (pnpm test:api) với thư mục build riêng
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Thông tin phiên bản điền LÚC BUILD (hiện ở Quản trị hệ thống → Phiên bản & cập nhật)
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "",
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? "local",
  },
  experimental: {
    // Module native / chỉ chạy trên Node — không bundle vào server chunk
    serverComponentsExternalPackages: ["pg", "sharp", "@node-rs/argon2", "exif-reader"],
    instrumentationHook: true,
  },
};

export default nextConfig;
