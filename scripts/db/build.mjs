#!/usr/bin/env node
// Dựng lại một database từ đầu trên PostgreSQL local:
//   base    : 01…52 trích từ tài liệu thiết kế (db/migrations)
//   patched : base + kiem-dinh/sql/70…75 (bản vá sau kiểm định)
//   app     : patched + db/app/*.sql (bổ sung cho ứng dụng web) — mặc định
//
//   node scripts/db/build.mjs [--db luuxa] [--stage base|patched|app] [--keep]
import pg from "pg";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pgConfig, ROOT } from "./env.mjs";
import { runSqlFile, attachNoticePrinter } from "./sql.mjs";

export const MIGRATIONS = path.join(ROOT, "db", "migrations");
export const PATCHES = path.join(ROOT, "kiem-dinh", "sql");
export const APP_SQL = path.join(ROOT, "db", "app");

const list = (dir, re) =>
  readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));

export const baseFiles = () => list(MIGRATIONS, /^[0-5][0-9]_.*\.sql$/);
export const patchFiles = () => list(PATCHES, /^7[0-5]_.*\.sql$/);
export const appFiles = () => { try { return list(APP_SQL, /^\d+_.*\.sql$/); } catch { return []; } };

export function filesForStage(stage) {
  const files = [...baseFiles()];
  if (stage === "patched" || stage === "app") files.push(...patchFiles());
  if (stage === "app") files.push(...appFiles());
  return files;
}

export async function recreateDatabase(db) {
  const admin = new pg.Client(pgConfig({ database: "postgres" }));
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(db)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(db)} TEMPLATE template0 ENCODING 'UTF8'`);
  } finally {
    await admin.end();
  }
}

export async function applyFiles(db, files, { verbose = true, notices = false } = {}) {
  const client = new pg.Client(pgConfig({ database: db }));
  await client.connect();
  if (notices) attachNoticePrinter(client, "    ");
  try {
    for (const f of files) {
      const t0 = Date.now();
      const n = await runSqlFile(client, f);
      if (verbose) console.log(`  ✓ ${path.relative(ROOT, f).padEnd(52)} ${String(n).padStart(4)} lệnh  ${Date.now() - t0} ms`);
    }
  } finally {
    await client.end();
  }
}

export async function buildDatabase(db, stage = "app", opts = {}) {
  await recreateDatabase(db);
  await applyFiles(db, filesForStage(stage), opts);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const db = get("--db", "luuxa");
  const stage = get("--stage", "app");
  console.log(`▶ Dựng database "${db}" (stage=${stage}) trên 127.0.0.1`);
  const t0 = Date.now();
  try {
    await buildDatabase(db, stage);
    console.log(`✓ Xong sau ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(3);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
