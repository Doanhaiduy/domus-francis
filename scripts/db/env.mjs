// Đọc cấu hình kết nối PostgreSQL LOCAL từ .env.local (không bao giờ trỏ ra máy khác).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return {};
  const env = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** Kết nối superuser tới cluster local (127.0.0.1). */
export function pgConfig({ database = "luuxa", user = "postgres", password } = {}) {
  const env = loadEnvLocal();
  return {
    host: "127.0.0.1",
    port: Number(process.env.PGPORT_LOCAL || env.PGPORT_LOCAL || 54329),
    user,
    password: password ?? env.PG_SUPERUSER_PASSWORD,
    database,
  };
}
