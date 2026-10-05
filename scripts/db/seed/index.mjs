#!/usr/bin/env node
// Nạp dữ liệu demo vào DB local (một transaction, superuser). Mỗi phân hệ một file seed, chạy theo thứ tự.
//   node scripts/db/seed/index.mjs [--db luuxa]
import pg from "pg";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { hash, Algorithm } from "@node-rs/argon2";
import { loadEnvLocal, pgConfig, ROOT } from "../env.mjs";

Object.assign(process.env, loadEnvLocal()); // khóa mã hóa PII cho src/server/pii.ts

const args = process.argv.slice(2);
const DB = args.includes("--db") ? args[args.indexOf("--db") + 1] : "luuxa";
// --only finance,duty : chỉ chạy các phân hệ này trên DB đã có dữ liệu người (people) — dùng khi phát triển từng phân hệ
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

// Thứ tự phụ thuộc: people trước (người dùng/thành viên), các phân hệ sau dùng ctx.ids
const MODULES = ["people", "finance", "duty", "academic", "events", "community", "moments", "kitchen", "settings", "documents"];

const srcFile = existsSync(path.join(ROOT, "scripts/db/seed/mock-source.ts"))
  ? "./mock-source.ts"
  : "../../../src/lib/mockData.ts";
const mock = await import(srcFile);

const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
const client = url
  ? new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  : new pg.Client(pgConfig({ database: DB }));
await client.connect();
const ctx = {
  client,
  mock,
  ids: {},
  q: async (sql, params = []) => (await client.query(sql, params)).rows,
  as: (userId) => client.query("SELECT set_config('app.current_user_id', $1, true)", [userId ?? ""]),
  hashPassword: (pw) => hash(pw, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
};

try {
  await client.query("BEGIN");
  if (ONLY) {
    const { loadIds } = await import("./people.mjs");
    await loadIds(ctx);
  }
  for (const name of ONLY ?? MODULES) {
    const file = path.join(ROOT, "scripts/db/seed", `${name}.mjs`);
    if (!existsSync(file)) continue;
    const t0 = Date.now();
    const mod = await import(`./${name}.mjs`);
    await mod.seed(ctx);
    console.log(`  ✓ seed ${name.padEnd(10)} ${Date.now() - t0} ms`);
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`✗ seed lỗi: ${e.message}${e.detail ? "\n  " + e.detail : ""}${e.where ? "\n  " + e.where : ""}`);
  process.exit(1);
} finally {
  await client.end();
}

if (ctx.accounts) {
  const { DEMO_PASSWORD } = await import("./people.mjs");
  const lines = [
    "Tài khoản demo (mật khẩu chung: " + DEMO_PASSWORD + ")",
    ...ctx.accounts.map((a) => `  ${a.email.padEnd(28)} ${a.name.padEnd(22)} ${a.roles}`),
  ];
  mkdirSync(path.join(ROOT, ".local"), { recursive: true });
  writeFileSync(path.join(ROOT, ".local", "demo-accounts.txt"), lines.join("\n") + "\n");
}
