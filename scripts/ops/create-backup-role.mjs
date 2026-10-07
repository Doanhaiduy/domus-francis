#!/usr/bin/env node
// Tạo vai trò DB CHỈ ĐỌC `luuxa_backup` cho sao lưu tự động hằng ngày (repo riêng tư của GitHub Actions) — idempotent.
//
//   node scripts/ops/create-backup-role.mjs --env staging|production [--rotate]
//
// • Kết nối bằng MIGRATE_DATABASE_URL (tài khoản chủ DB) trong .env.<môi trường>.
// • Vai trò: LOGIN, BYPASSRLS (đọc được mọi bảng dù RLS FORCE) + pg_read_all_data, mặc định mọi giao dịch ở chế độ chỉ-đọc
//   (default_transaction_read_only = on) ⇒ lộ chuỗi kết nối này cũng KHÔNG ghi/xóa được dữ liệu.
// • Chuỗi kết nối (cổng 5432 — session mode của Supavisor, cần cho pg_dump) được ghi vào backup/backup-db-url-<env>.txt (git-ignore),
//   KHÔNG in ra màn hình. Vai trò đã có mà không --rotate ⇒ giữ nguyên mật khẩu (không tạo lại chuỗi kết nối).
import pg from "pg";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const envName = args.includes("--env") ? args[args.indexOf("--env") + 1] : undefined;
const rotate = args.includes("--rotate");
if (!envName || !/^[a-z][a-z0-9-]*$/.test(envName)) {
  console.error("Cách dùng: node scripts/ops/create-backup-role.mjs --env <staging|production> [--rotate]");
  process.exit(2);
}
const file = path.join(ROOT, `.env.${envName}`);
if (!existsSync(file)) {
  console.error(`✗ Không thấy .env.${envName}`);
  process.exit(2);
}
const ownerUrl = /^MIGRATE_DATABASE_URL=(.*)$/m.exec(readFileSync(file, "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!ownerUrl) {
  console.error(`✗ .env.${envName} chưa điền MIGRATE_DATABASE_URL`);
  process.exit(2);
}
const u = new URL(ownerUrl);
const ref = decodeURIComponent(u.username).split(".")[1]; // postgres.<ref>
if (!ref || !u.hostname.endsWith(".pooler.supabase.com")) {
  console.error("✗ MIGRATE_DATABASE_URL không đúng dạng pooler Supabase (postgres.<ref>@…pooler.supabase.com).");
  process.exit(2);
}

const ROLE = "luuxa_backup";
const password = randomBytes(24).toString("base64url"); // chỉ [A-Za-z0-9_-] ⇒ an toàn để nhúng vào chuỗi kết nối và lệnh SQL
const client = new pg.Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
let wrotePassword = false;
try {
  await client.query("BEGIN");
  const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROLE])).rowCount > 0;
  if (!exists) {
    await client.query(`CREATE ROLE ${ROLE} LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3 PASSWORD '${password}'`);
    wrotePassword = true;
  } else if (rotate) {
    await client.query(`ALTER ROLE ${ROLE} LOGIN BYPASSRLS PASSWORD '${password}'`);
    wrotePassword = true;
  }
  await client.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
  await client.query(`ALTER ROLE ${ROLE} SET statement_timeout = '15min'`);
  await client.query(`GRANT pg_read_all_data TO ${ROLE}`);
  await client.query("COMMIT");
  console.log(`✓ Vai trò ${ROLE} (chỉ đọc) trên ${envName.toUpperCase()}: ${exists ? (rotate ? "đã đổi mật khẩu" : "đã có — giữ nguyên mật khẩu") : "đã tạo mới"}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`✗ ${e.message}`);
  process.exitCode = 3;
} finally {
  await client.end();
}
if (process.exitCode) process.exit(process.exitCode);

if (!wrotePassword) {
  console.log("  (Không có mật khẩu mới. Muốn tạo lại chuỗi kết nối: thêm --rotate.)");
  process.exit(0);
}

// ---- thử đăng nhập bằng chuỗi mới: đọc được bảng RLS, KHÔNG ghi được ----
const backupUrl = `postgresql://${ROLE}.${ref}:${password}@${u.hostname}:5432/${u.pathname.replace(/^\//, "") || "postgres"}`;
const t = new pg.Client({ connectionString: backupUrl, ssl: { rejectUnauthorized: false } });
await t.connect();
try {
  const n = (await t.query("SELECT count(*)::int AS n FROM public.members")).rows[0].n;
  let writeBlocked = false;
  try {
    await t.query("UPDATE public.members SET full_name = full_name WHERE false");
    await t.query("CREATE TABLE public.__backup_probe (x int)");
  } catch (e) {
    writeBlocked = /read-only|permission denied|must be owner/i.test(e.message);
  }
  console.log(`✓ Thử đăng nhập: đọc được bảng members (${n} dòng, qua RLS FORCE); ghi bị chặn: ${writeBlocked ? "có" : "KHÔNG — kiểm tra lại!"}`);
  if (!writeBlocked) process.exitCode = 4;
} finally {
  await t.end();
}

const dir = path.join(ROOT, "backup");
mkdirSync(dir, { recursive: true });
const out = path.join(dir, `backup-db-url-${envName}.txt`);
writeFileSync(out, backupUrl + "\n", { mode: 0o600 });
console.log(`✓ Chuỗi kết nối chỉ-đọc đã ghi vào ${path.relative(ROOT, out)} (git-ignore). KHÔNG dán vào chat/commit.`);
process.exit(process.exitCode ?? 0);
