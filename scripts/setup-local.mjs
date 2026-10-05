#!/usr/bin/env node
// =====================================================================
// Dựng toàn bộ môi trường LOCAL bằng một lệnh (không kết nối dịch vụ ngoài):
//   1. PostgreSQL 16.14 portable (127.0.0.1:54329) — init + start
//   2. .env.local: mật khẩu DB, khóa JWT Ed25519, khóa mã hóa dữ liệu cá nhân — sinh ngẫu nhiên trên máy
//   3. Database "luuxa" = DDL thiết kế 01…52 + bản vá kiểm định 70…75 + db/app/*.sql (chỉ khi chưa có hoặc --reset)
//   4. Dữ liệu demo (--no-seed để bỏ qua)
//
//   pnpm setup:local            # lần đầu / giữ nguyên dữ liệu nếu DB đã có
//   pnpm setup:local --reset    # XÓA và dựng lại DB luuxa + seed
// =====================================================================
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { exportJWK, generateKeyPair } from "jose";
import { ROOT, loadEnvLocal, pgConfig } from "./db/env.mjs";
import { buildDatabase } from "./db/build.mjs";

const args = process.argv.slice(2);
const RESET = args.includes("--reset");
const SEED = !args.includes("--no-seed");
const DB = "luuxa";
const ENV_FILE = path.join(ROOT, ".env.local");

const step = (s) => console.log(`\n\x1b[36m▶ ${s}\x1b[0m`);

function run(script, ...a) {
  const r = spawnSync(process.execPath, ["--no-warnings", path.join(ROOT, script), ...a], { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function ensureEnv() {
  const env = loadEnvLocal();
  const add = {};
  if (!env.LUUXA_API_PASSWORD) add.LUUXA_API_PASSWORD = randomBytes(18).toString("base64url");
  const apiPw = env.LUUXA_API_PASSWORD || add.LUUXA_API_PASSWORD;
  const port = pgConfig().port;
  if (!env.DATABASE_URL) add.DATABASE_URL = `postgresql://luuxa_api:${encodeURIComponent(apiPw)}@127.0.0.1:${port}/${DB}`;
  if (!env.AUTH_JWT_PRIVATE_JWK || !env.AUTH_JWT_PUBLIC_JWK) {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const kid = `local-${new Date().toISOString().slice(0, 10)}`;
    add.AUTH_JWT_PRIVATE_JWK = JSON.stringify({ ...(await exportJWK(privateKey)), kid, alg: "EdDSA" });
    add.AUTH_JWT_PUBLIC_JWK = JSON.stringify({ ...(await exportJWK(publicKey)), kid, alg: "EdDSA" });
  }
  if (!env.PII_KEY_V1) add.PII_KEY_V1 = randomBytes(32).toString("base64");
  if (!env.PII_BIDX_KEY) add.PII_BIDX_KEY = randomBytes(32).toString("base64");
  if (!env.STORAGE_DIR) add.STORAGE_DIR = ".local/storage";
  if (!env.COOKIE_SECURE) add.COOKIE_SECURE = "false";
  if (!env.NEXT_PUBLIC_APP_NAME) add.NEXT_PUBLIC_APP_NAME = "Lưu Xá Phanxicô";
  if (Object.keys(add).length) {
    if (!existsSync(ENV_FILE)) writeFileSync(ENV_FILE, "# .env.local — CHỈ dùng trên máy này, không commit (đã có trong .gitignore)\n");
    appendFileSync(ENV_FILE, `\n# Sinh bởi scripts/setup-local.mjs ${new Date().toISOString()}\n` + Object.entries(add).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    console.log(`  ✓ .env.local: thêm ${Object.keys(add).join(", ")}`);
  } else console.log("  • .env.local đã đủ biến");
  return { ...env, ...add };
}

async function dbExists(name) {
  const c = new pg.Client(pgConfig({ database: "postgres" }));
  await c.connect();
  try {
    return (await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])).rowCount > 0;
  } finally {
    await c.end();
  }
}

async function main() {
  step("1/4 PostgreSQL local");
  run("scripts/db/pg.mjs", "start");
  if (!existsSync(path.join(ROOT, "db", "migrations", "01_foundation.sql"))) run("scripts/db/extract-ddl.mjs");

  step("2/4 Biến môi trường (.env.local)");
  const env = await ensureEnv();
  Object.assign(process.env, env);
  mkdirSync(path.join(ROOT, env.STORAGE_DIR), { recursive: true });

  step(`3/4 Database "${DB}"`);
  const exists = await dbExists(DB);
  let fresh = false;
  if (!exists || RESET) {
    await buildDatabase(DB, "app");
    fresh = true;
  } else console.log(`  • Giữ nguyên DB "${DB}" (dùng --reset để dựng lại)`);
  const su = new pg.Client(pgConfig({ database: DB }));
  await su.connect();
  await su.query(`ALTER ROLE luuxa_api WITH LOGIN PASSWORD ${pg.escapeLiteral(env.LUUXA_API_PASSWORD)}`);
  await su.end();
  console.log("  ✓ Vai trò đăng nhập luuxa_api sẵn sàng");

  step("4/4 Dữ liệu demo");
  if (SEED && fresh) run("scripts/db/seed/index.mjs");
  else console.log(fresh ? "  • Bỏ qua (--no-seed)" : "  • DB đã có dữ liệu — bỏ qua seed");

  console.log("\n\x1b[32m✓ Môi trường local sẵn sàng.\x1b[0m  Chạy: pnpm dev  →  http://localhost:3000");
  const demo = path.join(ROOT, ".local", "demo-accounts.txt");
  if (existsSync(demo)) console.log("\n" + readFileSync(demo, "utf8"));
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
