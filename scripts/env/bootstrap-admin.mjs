#!/usr/bin/env node
// Tạo tài khoản Admin đầu tiên cho một DB MỚI (chưa có ai đăng nhập được, nên không thể tạo qua giao diện).
//
//   node scripts/env/bootstrap-admin.mjs --env production --email a@x.com --name "Họ Tên" [--display "Tên gọi"]
//
// • Kết nối bằng MIGRATE_DATABASE_URL (tài khoản chủ DB) trong .env.<môi trường>.
// • Tạo: users (mật khẩu tạm Argon2id, BẮT BUỘC đổi khi đăng nhập lần đầu) + hồ sơ members + vai trò admin và member.
// • Không ghi sẵn bất kỳ "đồng ý" (consents) nào thay người dùng. Mật khẩu tạm chỉ in ra MỘT lần trên màn hình.
import pg from "pg";
import { hash } from "@node-rs/argon2";
import { randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const get = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const envName = get("--env");
const email = get("--email")?.trim().toLowerCase();
const fullName = get("--name")?.trim();
const display = get("--display")?.trim() || fullName?.split(/\s+/).slice(-2).join(" ");
if (!envName || !email || !fullName) {
  console.error('Cách dùng: node scripts/env/bootstrap-admin.mjs --env <staging|production> --email <email> --name "<Họ tên>" [--display "<Tên gọi>"]');
  process.exit(2);
}
const file = path.join(ROOT, `.env.${envName}`);
if (!existsSync(file)) {
  console.error(`✗ Không thấy .env.${envName}`);
  process.exit(2);
}
const url = /^MIGRATE_DATABASE_URL=(.*)$/m.exec(readFileSync(file, "utf8"))?.[1]?.trim();
if (!url) {
  console.error(`✗ .env.${envName} chưa điền MIGRATE_DATABASE_URL`);
  process.exit(2);
}

// Mật khẩu tạm: 14 ký tự, đủ chữ hoa/thường/số/ký hiệu, bỏ ký tự dễ nhầm (0/O, 1/l/I)
const pick = (set, n) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
const shuffle = (s) => s.split("").sort(() => randomInt(3) - 1).join("");
const tempPassword = shuffle(pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 4) + pick("abcdefghijkmnpqrstuvwxyz", 6) + pick("23456789", 3) + pick("@#$%&*", 1));

const pwHash = await hash(tempPassword, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  const exists = await client.query("SELECT 1 FROM users WHERE email = $1::citext AND deleted_at IS NULL", [email]);
  if (exists.rowCount) throw new Error(`Email ${email} đã có tài khoản.`);
  const roles = (await client.query("SELECT id, code FROM roles WHERE code IN ('admin', 'member')")).rows;
  if (roles.length !== 2) throw new Error("Chưa có vai trò admin/member — DB chưa dựng schema?");
  const userId = (
    await client.query(
      `INSERT INTO users (email, password_hash, password_changed_at, must_change_password, status, email_verified_at)
       VALUES ($1, $2, now(), true, 'active', now()) RETURNING id`,
      [email, pwHash]
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO members (user_id, full_name, display_name, contact_email, created_by)
     VALUES ($1, $2, $3, $4, $1)`,
    [userId, fullName, display, email]
  );
  for (const r of roles) {
    await client.query("INSERT INTO user_roles (user_id, role_id, granted_by, note) VALUES ($1, $2, $1, $3)", [userId, r.id, "Tài khoản quản trị đầu tiên (khởi tạo môi trường)"]);
  }
  await client.query("COMMIT");
  console.log(`✓ Đã tạo ${email} (${fullName}) — vai trò admin + member`);
  console.log(`  Mật khẩu tạm (chỉ hiện một lần, đổi ngay khi đăng nhập): ${tempPassword}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`✗ ${e.message}`);
  process.exitCode = 3;
} finally {
  await client.end();
}
