#!/usr/bin/env node
// =====================================================================
// Áp migration TĂNG DẦN lên một DB đang chạy (local hoặc Supabase) — không dựng lại, không mất dữ liệu:
//   1. db/app/<số ≥ 991>_*.sql — cấu trúc mới (bảng, hàm, quyền, cấu hình). Viết idempotent.
//   2. db/data/*.sql           — thay đổi DỮ LIỆU nghiệp vụ (vd. bỏ vai trò Phó nhà, cấp quyền cho Admin). Idempotent.
//      (Tách riêng vì bộ kiểm định độc lập `pnpm db:audit` dựng DB từ thiết kế gốc + db/app và chạy smoke test giả định
//       dữ liệu gốc — những thay đổi mang tính cấu hình nghiệp vụ không thuộc phần đó.)
// File đã chạy được ghi vào bảng public.app_migrations (tên + sha256); chạy lại chỉ áp file mới hoặc file đã đổi nội dung.
// Mỗi file = một transaction gửi trong MỘT lượt (nhanh khi DB ở xa).
//
//   pnpm db:migrate                                   # DB local "luuxa"
//   pnpm db:migrate -- --db luuxa_test                # DB local khác
//   pnpm db:migrate -- --url "postgresql://…" --allow-remote   # DB ở xa (Supabase) — chỉ khi được phép
//   pnpm db:migrate -- --env staging                 # DB của môi trường: đọc MIGRATE_DATABASE_URL (tài khoản chủ DB) trong .env.staging
//   pnpm db:migrate -- --env production --dry-run     # .env.production — luôn dry-run trước khi áp lên production
//   thêm --dry-run để chỉ liệt kê, --only-data / --only-app để giới hạn
// =====================================================================
import pg from "pg";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pgConfig, ROOT } from "./env.mjs";

export const APP_MIN = 991;

export function migrationFiles({ onlyApp = false, onlyData = false } = {}) {
  const appDir = path.join(ROOT, "db", "app");
  const dataDir = path.join(ROOT, "db", "data");
  const app = onlyData
    ? []
    : readdirSync(appDir)
        .filter((f) => /^\d+_.*\.sql$/.test(f) && Number.parseInt(f, 10) >= APP_MIN)
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b))
        .map((f) => ({ name: `db/app/${f}`, file: path.join(appDir, f) }));
  const data =
    onlyApp || !existsSync(dataDir)
      ? []
      : readdirSync(dataDir)
          .filter((f) => f.endsWith(".sql"))
          .sort()
          .map((f) => ({ name: `db/data/${f}`, file: path.join(dataDir, f) }));
  return [...app, ...data];
}

/** Cùng các điều chỉnh tương thích Supabase như scripts/db/bundle.mjs (vô hại trên PostgreSQL local). */
export function prepareSql(text) {
  return text
    .replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, "-- (đã gỡ $1: bọc ở ngoài)")
    .replace(/SET\s+search_path\s*=\s*public,\s*app,\s*pg_temp/gi, "SET search_path = public, app, extensions, pg_temp")
    .replace(
      /^\s*(ALTER\s+(?:TABLE|SEQUENCE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|ROUTINE|TYPE)\s+[^;]+?\s+OWNER\s+TO\s+[^;]+?)\s*;/gim,
      (_, m) => `DO $mig$ BEGIN ${m}; EXCEPTION WHEN insufficient_privilege THEN NULL; END $mig$;`,
    );
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

export async function migrate(client, { dryRun = false, log = console.log, ...sel } = {}) {
  await client.query(`CREATE TABLE IF NOT EXISTS public.app_migrations (
    filename   text PRIMARY KEY,
    sha256     text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query("ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY");
  const done = new Map((await client.query("SELECT filename, sha256 FROM public.app_migrations")).rows.map((r) => [r.filename, r.sha256]));
  let applied = 0;
  for (const m of migrationFiles(sel)) {
    const raw = readFileSync(m.file, "utf8");
    const h = sha(raw);
    if (done.get(m.name) === h) continue;
    const what = done.has(m.name) ? "chạy lại (nội dung đã đổi)" : "áp dụng";
    if (dryRun) {
      log(`  • sẽ ${what}: ${m.name}`);
      continue;
    }
    const t0 = Date.now();
    try {
      await client.query(
        `BEGIN;\n${prepareSql(raw)}\n;INSERT INTO public.app_migrations (filename, sha256) VALUES (${pg.escapeLiteral(m.name)}, '${h}')
           ON CONFLICT (filename) DO UPDATE SET sha256 = EXCLUDED.sha256, applied_at = now();\nCOMMIT;`,
      );
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`${m.name}: ${e.message}${e.position ? ` (vị trí ${e.position})` : ""}`);
    }
    applied++;
    log(`  ✓ ${what}: ${m.name} (${Date.now() - t0} ms)`);
  }
  return applied;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  let url = get("--url");
  const envName = get("--env");
  if (envName) {
    // Môi trường có tên: .env.<tên> (staging, production…) — chuỗi kết nối chủ DB nằm ở MIGRATE_DATABASE_URL (KHÁC DATABASE_URL của ứng dụng)
    if (!/^[a-z][a-z0-9-]*$/.test(envName)) {
      console.error("✗ Tên môi trường không hợp lệ.");
      process.exit(2);
    }
    const file = path.join(ROOT, `.env.${envName}`);
    if (!existsSync(file)) {
      console.error(`✗ Không thấy ${path.basename(file)} ở thư mục dự án.`);
      process.exit(2);
    }
    const m = /^MIGRATE_DATABASE_URL=(.*)$/m.exec(readFileSync(file, "utf8"));
    url = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (!url) {
      console.error(`✗ ${path.basename(file)} chưa điền MIGRATE_DATABASE_URL (chuỗi kết nối tài khoản chủ DB, vd. postgres.<project-ref>).`);
      process.exit(2);
    }
  }
  let client;
  if (url) {
    if (/^https?:\/\//.test(url)) {
      console.error("✗ --url cần chuỗi kết nối PostgreSQL (postgresql://…), không phải URL API của Supabase.");
      process.exit(2);
    }
    const u = new URL(url);
    const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname);
    if (!local && !args.includes("--allow-remote") && !envName) {
      console.error(`✗ ${u.hostname} không phải localhost. Thêm --allow-remote nếu bạn được phép áp migration lên DB đó.`);
      process.exit(2);
    }
    client = new pg.Client({ connectionString: url, ssl: local || args.includes("--no-ssl") ? undefined : { rejectUnauthorized: false } });
    console.log(`▶ Migration tăng dần${envName ? ` [${envName.toUpperCase()}]` : ""} → ${u.hostname}${u.pathname}`);
  } else {
    const db = get("--db") ?? "luuxa";
    client = new pg.Client(pgConfig({ database: db }));
    console.log(`▶ Migration tăng dần → DB local "${db}"`);
  }
  await client.connect();
  try {
    const dryRun = args.includes("--dry-run");
    const n = await migrate(client, { dryRun, onlyApp: args.includes("--only-app"), onlyData: args.includes("--only-data") });
    if (!dryRun) console.log(n ? `✓ Đã áp ${n} file.` : "✓ Không có migration mới.");
  } catch (e) {
    console.error(`✗ ${e.message}\n  (file lỗi đã được rollback; các file trước đó vẫn giữ)`);
    process.exitCode = 3;
  } finally {
    await client.end();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
