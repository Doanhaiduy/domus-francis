#!/usr/bin/env node
// Gói TOÀN BỘ SQL của database (01…52 + vá kiểm định 70…75 + db/app) thành MỘT file và (tùy chọn) chạy nó bằng MỘT lệnh gửi lên máy chủ.
// Lý do: trình chạy từng câu lệnh mất 1 vòng mạng cho mỗi câu — trên DB ở xa (vd. Supabase) việc này rất chậm; gửi cả khối thì chỉ 1 vòng.
//
//   node scripts/db/bundle.mjs                       # ghi .local/db-bundle/luuxa_full.sql (dùng được với `psql -f` hoặc Supabase CLI)
//   node scripts/db/bundle.mjs --apply <DATABASE_URL> [--allow-remote] [--no-ssl]
//   thêm --clean-legacy để dọn 13 bảng schema CŨ (db/supabase/00_drop_legacy_schema.sql — XÓA DỮ LIỆU CŨ) ngay trước khi tạo schema mới
//
// An toàn: mặc định CHỈ chạy lên localhost. DB ở xa cần --allow-remote (dữ liệu rời máy — chỉ dùng khi được phép).
// Script KHÔNG xóa gì: nếu DB đích đã có bảng cùng tên (vd. schema cũ của bản UI-only) thì lệnh CREATE TABLE sẽ báo lỗi và dừng
// (cả khối chạy trong một transaction nên không để lại nửa chừng).
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";
import { filesForStage } from "./build.mjs";

const args = process.argv.slice(2);
const get = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);

const legacy = path.join(ROOT, "db", "supabase", "00_drop_legacy_schema.sql");
const files = [...(args.includes("--clean-legacy") ? [legacy] : []), ...filesForStage("app")]; // base + vá + db/app; KHÔNG gồm 60_smoke_tests.sql
const parts = files.map((f) => `\n-- ===== ${path.relative(ROOT, f).replace(/\\/g, "/")} =====\n${readFileSync(f, "utf8")}\n`);
// Một transaction duy nhất ⇒ lỗi ở đâu thì rollback sạch. File nào tự có BEGIN/COMMIT thì bỏ để khỏi lồng.
// Bổ sung schema extensions vào search_path của các hàm SECURITY DEFINER (để truy cập pgcrypto, unaccent trên Supabase).
const body = parts
  .join("")
  .replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, "-- (đã gỡ $1: bọc ở ngoài)")
  .replace(/SET\s+search_path\s*=\s*public,\s*app,\s*pg_temp/gi, "SET search_path = public, app, extensions, pg_temp")
  .replace(
    /^\s*(ALTER\s+(?:TABLE|SEQUENCE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|ROUTINE)\s+[^;]+?\s+OWNER\s+TO\s+[^;]+?)\s*;/gim,
    (_, m) => `DO $$ BEGIN ${m}; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;`
  );
const sql = `-- Lưu Xá Phanxicô — gói SQL đầy đủ (${files.length} file). Sinh bởi scripts/db/bundle.mjs\nBEGIN;\n${body}\nCOMMIT;\n`;

const out = path.join(ROOT, ".local", "db-bundle", "luuxa_full.sql");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, sql);
console.log(`✓ Gói đầy đủ: ${files.length} file → ${path.relative(ROOT, out)} (${(Buffer.byteLength(sql) / 1e6).toFixed(2)} MB)`);

// Sinh 4 phần nhỏ trong .local/db-bundle/parts/ cho Supabase SQL Editor (tránh lỗi "Query is too large" khi dán trên web)
const partsDir = path.join(ROOT, ".local", "db-bundle", "parts");
mkdirSync(partsDir, { recursive: true });

function formatPart(partFiles, title) {
  const p = partFiles.map((f) => `\n-- ===== ${path.relative(ROOT, f).replace(/\\/g, "/")} =====\n${readFileSync(f, "utf8")}\n`);
  const b = p
    .join("")
    .replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, "-- (đã gỡ $1: bọc ở ngoài)")
    .replace(/SET\s+search_path\s*=\s*public,\s*app,\s*pg_temp/gi, "SET search_path = public, app, extensions, pg_temp")
    .replace(
      /^\s*(ALTER\s+(?:TABLE|SEQUENCE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|ROUTINE)\s+[^;]+?\s+OWNER\s+TO\s+[^;]+?)\s*;/gim,
      (_, m) => `DO $$ BEGIN ${m}; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;`
    );
  return `-- Lưu Xá Phanxicô — ${title} (${partFiles.length} file). Sinh bởi scripts/db/bundle.mjs\nBEGIN;\n${b}\nCOMMIT;\n`;
}

const groups = [
  { name: "01_tables.sql", label: "Phần 1: Dọn dẹp, Bảng & Khóa ngoại", files: files.slice(0, 15) },
  { name: "02_functions.sql", label: "Phần 2: Chỉ mục & Hàm nghiệp vụ", files: files.slice(15, 27) },
  { name: "03_rls_and_seeds.sql", label: "Phần 3: Views, Chính sách RLS & Dữ liệu mầm", files: files.slice(27, 38) },
  { name: "04_patches_and_app.sql", label: "Phần 4: Bản vá kiểm định & Bổ sung Web App", files: files.slice(38) },
];

console.log(`✓ Đã chia 4 phần nhỏ cho Supabase SQL Editor (.local/db-bundle/parts/):`);
for (const g of groups) {
  const content = formatPart(g.files, g.label);
  writeFileSync(path.join(partsDir, g.name), content);
  console.log(`  • ${g.name.padEnd(24)} (${String(g.files.length).padStart(2)} file, ${(Buffer.byteLength(content) / 1024).toFixed(1).padStart(6)} KB)`);
}

const url = get("--apply");
if (url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    console.error(`✗ URL "${url}" là HTTP(S) API URL của Supabase, không phải chuỗi kết nối PostgreSQL.`);
    console.error(`  --apply cần PostgreSQL connection string (URI).`);
    console.error(`  Định dạng Supabase:`);
    console.error(`    1. Kết nối trực tiếp:`);
    console.error(`       postgresql://postgres:[MẬT_KHẨU]@db.<project-ref>.supabase.co:5432/postgres`);
    console.error(`    2. Qua Pooler IPv4 (khuyên dùng nếu mạng không có IPv6):`);
    console.error(`       postgresql://postgres.<project-ref>:[MẬT_KHẨU]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`);
    console.error(`  (Lấy trong Supabase Dashboard → Settings → Database → Connection string)`);
    process.exit(2);
  }
  const u = new URL(url);
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname);
  if (!local && !args.includes("--allow-remote")) {
    console.error(`✗ ${u.hostname} không phải localhost. Thêm --allow-remote nếu bạn được phép đưa dữ liệu lên đó.`);
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url, ssl: local || args.includes("--no-ssl") ? undefined : { rejectUnauthorized: false } });
  const t0 = Date.now();
  await client.connect();
  try {
    await client.query(sql); // simple query protocol: cả khối trong 1 lần gửi
    console.log(`✓ Đã chạy trên ${u.hostname}${u.pathname} sau ${((Date.now() - t0) / 1000).toFixed(1)} s`);

    const apiPw = get("--api-password") || process.env.LUUXA_API_PASSWORD;
    if (apiPw) {
      await client.query(`ALTER ROLE luuxa_api WITH LOGIN PASSWORD ${pg.escapeLiteral(apiPw)}`);
      console.log(`✓ Đã đặt mật khẩu cho vai trò luuxa_api`);
    }
  } catch (e) {
    console.error(`✗ Lỗi (đã rollback): ${e.message}${e.position ? ` — vị trí ký tự ${e.position} trong gói` : ""}`);
    process.exitCode = 3;
  } finally {
    await client.end();
  }
}
