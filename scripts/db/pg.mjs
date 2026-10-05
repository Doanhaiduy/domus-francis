#!/usr/bin/env node
// Quản lý PostgreSQL 16 chạy LOCAL cho dev/test (binary từ @embedded-postgres, không cần cài đặt hệ thống).
// Chỉ lắng nghe 127.0.0.1 — không mở ra mạng ngoài.
//
//   node scripts/db/pg.mjs init     # initdb (một lần) + ghi cấu hình
//   node scripts/db/pg.mjs start | stop | status | restart
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL = path.join(ROOT, ".local");
const DATA = path.join(LOCAL, "pgdata");
const LOG = path.join(LOCAL, "postgres.log");
const ENV_FILE = path.join(ROOT, ".env.local");
export const PG_PORT = Number(process.env.PGPORT_LOCAL || 54329);

const PLATFORM_PKG = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const BIN_DIR = path.dirname((await import(PLATFORM_PKG)).pg_ctl);
const exe = (name) => path.join(BIN_DIR, process.platform === "win32" ? `${name}.exe` : name);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`✗ ${path.basename(cmd)} ${args.join(" ")} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return r.status;
}

function readEnvLocal() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );
}

function init() {
  if (existsSync(path.join(DATA, "PG_VERSION"))) {
    console.log(`• Đã có cluster tại ${DATA}`);
    return;
  }
  mkdirSync(LOCAL, { recursive: true });
  const env = readEnvLocal();
  const superPass = env.PG_SUPERUSER_PASSWORD || randomBytes(18).toString("base64url");
  const pwfile = path.join(LOCAL, ".pwfile");
  writeFileSync(pwfile, superPass + "\n");
  run(exe("initdb"), [
    "-D", DATA, "-U", "postgres", "--pwfile", pwfile,
    "--auth-local=scram-sha-256", "--auth-host=scram-sha-256",
    "-E", "UTF8", "--locale=C", "--locale-provider=icu", "--icu-locale=und",
  ]);
  rmSync(pwfile);
  appendFileSync(
    path.join(DATA, "postgresql.conf"),
    [
      "",
      "# --- domus-francis local ---",
      "listen_addresses = '127.0.0.1'",
      `port = ${PG_PORT}`,
      "timezone = 'Asia/Ho_Chi_Minh'",
      "log_timezone = 'Asia/Ho_Chi_Minh'",
      "shared_preload_libraries = 'pg_stat_statements'",
      "max_connections = 200",
      "",
    ].join("\n")
  );
  if (!env.PG_SUPERUSER_PASSWORD) {
    appendFileSync(ENV_FILE, `\n# Sinh bởi scripts/db/pg.mjs init — chỉ dùng local\nPG_SUPERUSER_PASSWORD=${superPass}\n`);
  }
  console.log(`✓ initdb xong — cổng ${PG_PORT}, mật khẩu superuser lưu trong .env.local`);
}

function status() {
  return run(exe("pg_ctl"), ["-D", DATA, "status"], { allowFail: true });
}

function start() {
  if (!existsSync(path.join(DATA, "PG_VERSION"))) init();
  if (status() === 0) return;
  // stdio "ignore": postgres con không giữ pipe của shell gọi lệnh (nếu không lệnh sẽ treo trên Windows)
  run(exe("pg_ctl"), ["-D", DATA, "-l", LOG, "-w", "-t", "60", "start"], { stdio: "ignore" });
  console.log(`✓ PostgreSQL đang chạy tại 127.0.0.1:${PG_PORT}`);
}

function stop() {
  if (status() !== 0) return;
  run(exe("pg_ctl"), ["-D", DATA, "-m", "fast", "-w", "stop"]);
}

const COMMANDS = { init, start, stop, status, restart: () => (stop(), start()) };
const cmd = process.argv[2];
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  if (!COMMANDS[cmd]) {
    console.log("Dùng: node scripts/db/pg.mjs init|start|stop|status|restart");
    process.exit(1);
  }
  COMMANDS[cmd]();
}
