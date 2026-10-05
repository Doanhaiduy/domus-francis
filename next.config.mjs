/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cho phép chạy song song một máy chủ thử nghiệm (pnpm test:api) với thư mục build riêng
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  experimental: {
    // Module native / chỉ chạy trên Node — không bundle vào server chunk
    serverComponentsExternalPackages: ["pg", "sharp", "@node-rs/argon2", "exif-reader"],
    instrumentationHook: true,
  },
};

export default nextConfig;
