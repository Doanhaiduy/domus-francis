#!/usr/bin/env node
// Sao lưu DB của một môi trường ra thư mục backup/ (đã git-ignore). KHÔNG đưa file sao lưu lên git/Vercel/GitHub artifact:
// chứa dữ liệu cá nhân (dù CCCD/SĐT phụ huynh đã mã hóa ở tầng ứng dụng).
//
//   pnpm db:backup -- --env production [--with-storage]
//   node scripts/db/backup.mjs --env staging
//
// • Có pg_dump trên máy  → backup/<env>-<thời gian>.dump (định dạng custom, khôi phục bằng pg_restore — cách khuyến nghị).
// • Không có pg_dump     → xuất mỗi bảng thành NDJSON (backup/<env>-<thời gian>/<bảng>.ndjson) bằng Node; đủ để cứu dữ liệu
//                          nhưng khôi phục phải viết tay — hãy cài PostgreSQL client tools (pg_dump) khi có thể.
// • --with-storage       → tải thêm toàn bộ tệp trong Supabase Storage (ảnh, hóa đơn…) về backup/<env>-<thời gian>/storage/.
// Chuỗi kết nối: MIGRATE_DATABASE_URL (tài khoản chủ DB) trong .env.<môi trường>.
import pg from "pg";
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const get = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const envName = get("--env");
if (!envName || !/^[a-z][a-z0-9-]*$/.test(envName)) {
  console.error("Cách dùng: node scripts/db/backup.mjs --env <staging|production> [--with-storage]");
  process.exit(2);
}
const file = path.join(ROOT, `.env.${envName}`);
if (!existsSync(file)) {
  console.error(`✗ Không thấy .env.${envName}`);
  process.exit(2);
}
const envText = readFileSync(file, "utf8");
const val = (k) => /^([A-Z0-9_]+)=(.*)$/m.exec(envText.split(/\r?\n/).filter((l) => l.startsWith(k + "=")).join("\n"))?.[2]?.trim();
const url = val("MIGRATE_DATABASE_URL");
if (!url) {
  console.error(`✗ .env.${envName} chưa điền MIGRATE_DATABASE_URL`);
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const base = path.join(ROOT, "backup");
mkdirSync(base, { recursive: true });
const host = new URL(url).hostname;
console.log(`▶ Sao lưu [${envName.toUpperCase()}] ← ${host}`);

const dump = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
let dir = null;
if (dump.status === 0) {
  const out = path.join(base, `${envName}-${stamp}.dump`);
  const r = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--schema=public", "--schema=app", `--file=${out}`, url], { stdio: "inherit" });
  if (r.status !== 0) process.exit(3);
  console.log(`✓ ${path.relative(ROOT, out)} (khôi phục: pg_restore --no-owner -d <DB đích> <file>)`);
} else {
  dir = path.join(base, `${envName}-${stamp}`);
  mkdirSync(dir, { recursive: true });
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1")).rows.map((r) => r.table_name);
  let rows = 0;
  for (const t of tables) {
    const ws = createWriteStream(path.join(dir, `${t}.ndjson`));
    // Dữ liệu lưu xá nhỏ (vài chục nghìn dòng) nên đọc cả bảng một lần; tài khoản chủ DB không bị RLS chặn.
    const r = await client.query(`SELECT row_to_json(x)::text AS j FROM public."${t}" x`);
    if (r.rows.length) ws.write(r.rows.map((x) => x.j).join("\n") + "\n");
    rows += r.rows.length;
    await new Promise((res) => ws.end(res));
  }
  await client.end();
  writeFileSync(path.join(dir, "MANIFEST.txt"), `môi trường: ${envName}\nthời gian: ${new Date().toISOString()}\nbảng: ${tables.length}\ndòng: ${rows}\nđịnh dạng: NDJSON (không có pg_dump)\n`);
  console.log(`✓ ${path.relative(ROOT, dir)} — ${tables.length} bảng, ${rows} dòng (NDJSON; nên cài pg_dump để có bản khôi phục chuẩn)`);
}

if (args.includes("--with-storage")) {
  const sbUrl = val("NEXT_PUBLIC_SUPABASE_URL");
  const key = val("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !key) {
    console.error("✗ Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — bỏ qua Storage");
  } else {
    const root = path.join(dir ?? base, dir ? "storage" : `${envName}-${stamp}-storage`);
    mkdirSync(root, { recursive: true });
    const h = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
    const buckets = await (await fetch(`${sbUrl}/storage/v1/bucket`, { headers: h })).json();
    let n = 0;
    const walk = async (bucket, prefix) => {
      for (let offset = 0; ; offset += 100) {
        const r = await fetch(`${sbUrl}/storage/v1/object/list/${bucket}`, { method: "POST", headers: h, body: JSON.stringify({ prefix, limit: 100, offset }) });
        const items = await r.json();
        if (!Array.isArray(items) || !items.length) break;
        for (const it of items) {
          const p = prefix ? `${prefix}/${it.name}` : it.name;
          if (!it.id) await walk(bucket, p); // thư mục
          else {
            const o = await fetch(`${sbUrl}/storage/v1/object/authenticated/${bucket}/${p}`, { headers: h });
            if (!o.ok) continue;
            const dest = path.join(root, bucket, p);
            mkdirSync(path.dirname(dest), { recursive: true });
            writeFileSync(dest, Buffer.from(await o.arrayBuffer()));
            n++;
          }
        }
        if (items.length < 100) break;
      }
    };
    for (const b of buckets) await walk(b.name, "");
    console.log(`✓ Storage: ${n} tệp → ${path.relative(ROOT, root)}`);
  }
}
