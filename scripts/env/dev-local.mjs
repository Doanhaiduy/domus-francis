#!/usr/bin/env node
// Chạy `next dev` trên DB LOCAL (PostgreSQL portable) dù .env.local đang trỏ vào Supabase staging.
//   pnpm dev:local
// Ghi đè DATABASE_URL sang 127.0.0.1:54329 (dùng LUUXA_API_PASSWORD trong .env.local), tắt Supabase Storage (tệp lưu ở .local/storage).
// Biến đặt trong tiến trình thắng .env.local nên không cần sửa .env.local.
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = path.join(ROOT, ".env.local");
const vars = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
    if (m) vars[m[1]] = m[2];
  }
}
if (!vars.LUUXA_API_PASSWORD) {
  console.error("✗ .env.local chưa có LUUXA_API_PASSWORD — chạy `pnpm setup:local` để dựng DB local trước.");
  process.exit(2);
}

// Bảo đảm PostgreSQL local đang chạy
spawnSync(process.execPath, [path.join(ROOT, "scripts", "db", "pg.mjs"), "start"], { stdio: "inherit", cwd: ROOT });

const port = vars.PGPORT_LOCAL || "54329";
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://luuxa_api:${vars.LUUXA_API_PASSWORD}@127.0.0.1:${port}/luuxa`,
  ALLOW_REMOTE_DB: "",
  NEXT_PUBLIC_SUPABASE_URL: "",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  STORAGE_DRIVER: "local",
  COOKIE_SECURE: "false",
};
console.log(`▶ next dev với DB LOCAL 127.0.0.1:${port}/luuxa (không đụng staging/production)`);

const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], { stdio: "inherit", env, cwd: ROOT });
child.on("exit", (code) => process.exit(code ?? 0));
