#!/usr/bin/env node
// Chạy `next dev` trên máy bạn nhưng dùng DB/khóa của STAGING (.env.staging).
//   pnpm dev:staging
// Khác với biến trên Vercel: localhost chạy http nên COOKIE_SECURE=false và địa chỉ gốc là http://localhost:3000.
// Biến đặt ở đây thắng .env.local (biến môi trường tiến trình luôn ưu tiên hơn file .env của Next).
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = path.join(ROOT, ".env.staging");
if (!existsSync(file)) {
  console.error("✗ Chưa có .env.staging ở thư mục dự án.");
  process.exit(2);
}

const env = { ...process.env };
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
  if (m && m[2] !== "") env[m[1]] = m[2];
}
env.COOKIE_SECURE = "false";
env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
delete env.MIGRATE_DATABASE_URL; // chỉ dành cho script migrate, ứng dụng không cần

const host = (() => {
  try {
    return new URL(env.DATABASE_URL ?? "").hostname;
  } catch {
    return "(DATABASE_URL không hợp lệ)";
  }
})();
console.log(`▶ next dev với cấu hình STAGING → DB ${host}`);

const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], { stdio: "inherit", env, cwd: ROOT });
child.on("exit", (code) => process.exit(code ?? 0));
