#!/usr/bin/env node
// =====================================================================
// Kiểm thử API tích hợp (chạy thật qua HTTP, DB thật) — không đụng DB đang dùng:
//   1. dựng DB luuxa_test (01…52 + 70…75 + db/app) + dữ liệu demo
//   2. chạy một Next.js thử nghiệm ở cổng 3100 (thư mục build .next-test) trỏ vào luuxa_test
//   3. chạy các ca kiểm thử bảo mật / nghiệp vụ, in ĐẠT/LỖI, thoát 1 nếu có lỗi
//
//   pnpm test:api                 # đầy đủ
//   pnpm test:api -- --base http://localhost:3000 --no-server   # chạy trên máy chủ đang có (DB của nó sẽ bị ghi dữ liệu thử!)
// =====================================================================
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { loadEnvLocal, ROOT, pgConfig } from "./db/env.mjs";
import { buildDatabase } from "./db/build.mjs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const NO_SERVER = args.includes("--no-server");
// --only <tiền tố tên file>: chỉ chạy bộ kiểm thử phân hệ tương ứng (vd. --only public-site), bỏ các suite nền
const ONLY = get("--only", "");
const PORT = Number(get("--port", "3100"));
const BASE = get("--base", `http://localhost:${PORT}`);
const DB = "luuxa_test";
const PW = "LuuXa@2026";
const env = loadEnvLocal();

// ---------------------------------------------------------------------
// Máy khách HTTP có cookie jar + CSRF
// ---------------------------------------------------------------------
class Client {
  constructor(name) {
    this.name = name;
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv, ...attrs] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i).trim();
      const v = kv.slice(i + 1);
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
      if (expired || v === "") this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  csrf() {
    return this.jar.get("luuxa_csrf") ?? this.jar.get("__Host-luuxa_csrf") ?? "";
  }
  async req(method, p, body, { csrf = true, raw = false, form } = {}) {
    const headers = { cookie: this.cookieHeader(), accept: "application/json" };
    if (method !== "GET" && csrf) headers["x-csrf-token"] = this.csrf();
    if (method !== "GET") headers.origin = BASE;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + p, { method, headers, body: payload, redirect: "manual" });
    this.store(res);
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }
  get(p, o) { return this.req("GET", p, undefined, o); }
  post(p, b, o) { return this.req("POST", p, b ?? {}, o); }
  patch(p, b, o) { return this.req("PATCH", p, b ?? {}, o); }
  del(p, o) { return this.req("DELETE", p, undefined, o); }
  async init() {
    const r = await fetch(BASE + "/dang-nhap", { redirect: "manual" });
    this.store(r);
    return this;
  }
  async login(email, password = PW) {
    await this.init();
    const r = await this.post("/api/v1/auth/login", { identifier: email, password });
    if (r.status !== 200) throw new Error(`Đăng nhập ${email} thất bại: ${r.status} ${JSON.stringify(r.json)}`);
    return this;
  }
}
const as = async (email) => new Client(email).login(email);

// ---------------------------------------------------------------------
// Bộ chạy ca kiểm thử
// ---------------------------------------------------------------------
const results = [];
let group = "";
async function test(name, fn) {
  try {
    await fn();
    results.push({ group, name, ok: true });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    results.push({ group, name, ok: false, err: e.message });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${e.message}`);
  }
}
function eq(actual, expected, msg = "") {
  if (actual !== expected) throw new Error(`${msg} — mong đợi ${JSON.stringify(expected)}, nhận ${JSON.stringify(actual)}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
const section = (s) => {
  group = s;
  console.log(`\n\x1b[36m▶ ${s}\x1b[0m`);
};

// ---------------------------------------------------------------------
// Máy chủ thử nghiệm
// ---------------------------------------------------------------------
let server = null;
async function startServer() {
  console.log(`▶ Dựng DB ${DB} + dữ liệu demo…`);
  await buildDatabase(DB, "app", { verbose: false });
  const seed = spawnSync(process.execPath, ["--no-warnings", path.join(ROOT, "scripts/db/seed/index.mjs"), "--db", DB], { stdio: "inherit", cwd: ROOT });
  if (seed.status !== 0) throw new Error("seed lỗi");
  // Dữ liệu nghiệp vụ hiện hành (db/data: bỏ Phó nhà, quyền Admin…) giống DB thật
  const mig = spawnSync(process.execPath, [path.join(ROOT, "scripts/db/migrate.mjs"), "--db", DB], { stdio: "inherit", cwd: ROOT });
  if (mig.status !== 0) throw new Error("migrate lỗi");
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  const port = process.env.PGPORT_LOCAL || env.PGPORT_LOCAL || 54329;
  const pw = env.LUUXA_API_PASSWORD;
  if (!pw) throw new Error("Thiếu LUUXA_API_PASSWORD trong .env.local (chạy pnpm setup:local).");
  const testDbUrl = `postgresql://luuxa_api:${pw}@127.0.0.1:${port}/${DB}`;
  console.log(`▶ Khởi động Next.js thử nghiệm tại ${BASE} (DB ${DB})…`);
  mkdirSync(path.join(ROOT, ".local"), { recursive: true });
  server = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
      NEXT_DIST_DIR: ".next-test",
      LUUXA_DISABLE_JOBS: "true",
      PORT: String(PORT),
      // AI: khóa giả + máy chủ giả loopback (scripts/test-api/ai.mjs) ⇒ không bao giờ có lưu lượng ra Groq/Gemini khi kiểm thử,
      // và khóa thật trong .env.local không được dùng (biến môi trường rõ ràng ưu tiên hơn file .env).
      AI_TEST_BASE_URL: "http://127.0.0.1:3199",
      AI_RETRY_BASE_MS: "5",
      GROQ_API_KEY: "offline-test-key",
      GEMINI_API_KEY: "offline-test-gemini",
      // Danh mục tỉnh/thành: máy chủ giả loopback (scripts/test-api/geo.mjs) thay provinces.open-api.vn
      PROVINCES_API_BASE_URL: "http://127.0.0.1:3198",
      // Lời Chúa (lịch phụng vụ): máy chủ giả loopback (scripts/test-api/liturgy-calendar.mjs) thay GitHub
      LITURGY_DATA_BASE_URL: "http://127.0.0.1:3197",
      LITURGY_AUTO_IMPORT: "0",
      // Webhook ngân hàng (scripts/test-api/bank-webhook.mjs dùng đúng khóa này)
      BANK_WEBHOOK_SECRET: "test-bank-webhook-secret-0001",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 240_000) throw new Error("Máy chủ thử nghiệm không khởi động được:\n" + log.slice(-2000));
    try {
      const r = await fetch(BASE + "/dang-nhap", { redirect: "manual" });
      if (r.status < 500) break;
    } catch {
      /* chưa sẵn sàng */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  writeFileSync(path.join(ROOT, ".local/test-server.log"), log);
}
function stopServer() {
  if (!server) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}

// ---------------------------------------------------------------------
// CÁC CA KIỂM THỬ
// ---------------------------------------------------------------------
async function suiteAuth() {
  section("Xác thực & phiên");
  const anon = await new Client("anon").init();
  for (const p of ["/api/v1/auth/me", "/api/v1/members", "/api/v1/house", "/api/v1/applications", "/api/v1/lookups"]) {
    await test(`Chưa đăng nhập: GET ${p} → 401`, async () => eq((await anon.get(p)).status, 401, p));
  }
  await test("Trang nội bộ khi chưa đăng nhập → chuyển hướng làm mới phiên", async () => {
    const r = await anon.get("/thu-chi", { raw: true });
    eq(r.status, 307);
    ok((r.headers.get("location") || "").includes("/api/v1/auth/refresh"), "phải chuyển tới refresh");
  });
  await test("Sai mật khẩu → 401 BAD_CREDENTIALS (không lộ email có tồn tại hay không)", async () => {
    const c = await new Client("x").init();
    const a = await c.post("/api/v1/auth/login", { identifier: "duc.tran@luuxa.local", password: "sai-mat-khau" });
    const b = await c.post("/api/v1/auth/login", { identifier: "khong-ton-tai@luuxa.local", password: "sai-mat-khau" });
    eq(a.status, 401);
    eq(b.status, 401);
    eq(a.json.detail, b.json.detail, "thông điệp phải giống nhau");
  });
  await test("Thiếu CSRF token → 403", async () => {
    const c = await new Client("x").init();
    const r = await c.post("/api/v1/auth/login", { identifier: "duc.tran@luuxa.local", password: PW }, { csrf: false });
    eq(r.status, 403);
    eq(r.json.code, "CSRF");
  });
  await test("Origin lạ → 403", async () => {
    const c = await new Client("x").init();
    const res = await fetch(BASE + "/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: c.cookieHeader(), "x-csrf-token": c.csrf(), origin: "http://evil.example" },
      body: JSON.stringify({ identifier: "duc.tran@luuxa.local", password: PW }),
    });
    eq(res.status, 403);
  });
  await test("Đăng nhập bằng số điện thoại (0912 334 782)", async () => {
    const c = await new Client("x").init();
    eq((await c.post("/api/v1/auth/login", { identifier: "0912 334 782", password: PW })).status, 200);
  });
  await test("/auth/me trả vai trò + quyền từ DB, không có trong JWT", async () => {
    const c = await as("duc.tran@luuxa.local");
    const me = (await c.get("/api/v1/auth/me")).json;
    eq(me.primaryRole, "house_head");
    ok(me.permissions.includes("finance.expense.approve"), "Trưởng nhà phải có quyền duyệt chi");
    const at = c.jar.get("luuxa_at");
    const payload = JSON.parse(Buffer.from(at.split(".")[1], "base64url").toString());
    ok(!("roles" in payload) && !("permissions" in payload), "JWT không được chứa vai trò/quyền");
  });
  await test("Khóa tạm sau 5 lần sai liên tiếp → 423, mật khẩu đúng cũng bị chặn", async () => {
    const c = await new Client("x").init();
    for (let i = 0; i < 5; i++) await c.post("/api/v1/auth/login", { identifier: "phuoc.ly@luuxa.local", password: "sai" + i });
    const r = await c.post("/api/v1/auth/login", { identifier: "phuoc.ly@luuxa.local", password: PW });
    eq(r.status, 423);
  });
  await test("Refresh token xoay vòng; dùng lại token cũ (ngoài 30 giây) ⇒ thu hồi cả phiên", async () => {
    const c = await as("hieu.bui@luuxa.local");
    const rt1 = c.jar.get("luuxa_rt");
    eq((await c.post("/api/v1/auth/refresh")).status, 200);
    ok(c.jar.get("luuxa_rt") !== rt1, "refresh token phải đổi");
    // Giả lập kẻ gian dùng lại rt1 sau 30 giây: lùi rotated_at trong DB
    const pg = (await import("pg")).default;
    const db = new pg.Client(pgConfig({ database: NO_SERVER ? "luuxa" : DB }));
    await db.connect();
    await db.query("UPDATE refresh_tokens SET rotated_at = now() - interval '5 minutes' WHERE rotated_at IS NOT NULL AND rotated_at > now() - interval '1 minute'");
    await db.end();
    const thief = new Client("thief");
    thief.jar.set("luuxa_rt", rt1);
    eq((await thief.post("/api/v1/auth/refresh", {}, { csrf: false })).status, 401, "token cũ");
    eq((await c.get("/api/v1/auth/me")).status, 401, "phiên của chủ tài khoản phải bị thu hồi");
  });
  await test("Đăng xuất thu hồi phiên ngay (access token cũ không dùng lại được)", async () => {
    const c = await as("kiet.do@luuxa.local");
    const at = c.jar.get("luuxa_at");
    eq((await c.post("/api/v1/auth/logout")).status, 200);
    const replay = new Client("replay");
    replay.jar.set("luuxa_at", at);
    eq((await replay.get("/api/v1/auth/me")).status, 401);
  });
  await test("Đổi mật khẩu: chính sách mật khẩu yếu bị từ chối", async () => {
    const c = await as("nam.phan@luuxa.local");
    eq((await c.post("/api/v1/auth/password", { currentPassword: PW, newPassword: "abc" })).status, 400);
  });
}

async function suiteRegistration() {
  section("Đăng ký & duyệt đơn");
  const email = `test.${Date.now()}@luuxa.local`;
  const applicant = await new Client("applicant").init();
  await test("Đăng ký tài khoản mới → trạng thái chờ duyệt", async () => {
    const r = await applicant.post("/api/v1/auth/register", { fullName: "Phêrô Nguyễn Văn Thử", email, password: "MatKhau2026", universityName: "ĐH Bách Khoa Hà Nội" });
    eq(r.status, 201);
    eq(r.json.pending, true);
  });
  await test("Tài khoản chờ duyệt không đọc được dữ liệu nội bộ (403 PENDING_APPROVAL)", async () => {
    const r = await applicant.get("/api/v1/members");
    eq(r.status, 403);
    eq(r.json.code, "PENDING_APPROVAL");
  });
  await test("Trang nội bộ chuyển người chờ duyệt về /cho-phe-duyet", async () => {
    const r = await applicant.get("/thu-chi", { raw: true });
    ok((r.headers.get("location") || "").endsWith("/cho-phe-duyet"), "phải về trang chờ duyệt");
  });
  const member = await as("tuan.nguyen@luuxa.local");
  // Không còn vai trò Phó nhà (db/data/2026-10-05-01_roles.sql): Trưởng nhà duyệt đơn (application.review)
  const head = await as("duc.tran@luuxa.local");
  let appId;
  await test("Thành viên thường không xem được danh sách đơn", async () => eq((await member.get("/api/v1/applications")).status, 403));
  await test("Trưởng nhà thấy đơn mới", async () => {
    const list = (await head.get("/api/v1/applications")).json;
    appId = list.find((a) => a.email === email)?.id;
    ok(appId, "không thấy đơn vừa nộp");
  });
  await test("Từ chối phải có lý do ≥ 5 ký tự", async () => eq((await head.post(`/api/v1/applications/${appId}/reject`, { note: "x" })).status, 400));
  await test("Trưởng nhà duyệt đơn + xếp phòng P.5 → tạo hồ sơ thành viên", async () => {
    const r = await head.post(`/api/v1/applications/${appId}/approve`, { roomCode: "P.5" });
    eq(r.status, 200, JSON.stringify(r.json));
    ok(r.json.memberId, "phải trả memberId");
  });
  await test("Người được duyệt làm mới phiên → hết chờ duyệt, đọc được danh bạ", async () => {
    const r = await applicant.post("/api/v1/auth/refresh");
    eq(r.json.pending, false);
    eq((await applicant.get("/api/v1/members")).status, 200);
  });
  await test("Duyệt lại đơn đã duyệt → 422", async () => eq((await head.post(`/api/v1/applications/${appId}/approve`, {})).status, 422));
}

async function suiteMembers() {
  section("Thành viên & quyền riêng tư");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const list = (await member.get("/api/v1/members")).json;
  const tuan = list.find((m) => m.fullName === "Nguyễn Minh Tuấn");
  const hieu = list.find((m) => m.fullName === "Bùi Văn Hiếu");
  await test("Danh bạ: thành viên thường không thấy Tên Thánh của người khác (dữ liệu tôn giáo)", async () => {
    ok(!hieu.holyName, "không được lộ tên thánh");
    const own = list.find((m) => m.id === tuan.id);
    ok(own.holyName, "chính chủ phải thấy tên thánh của mình");
  });
  await test("Trưởng nhà thấy Tên Thánh khi có đồng ý chia sẻ lãnh đạo", async () => {
    const l = (await head.get("/api/v1/members")).json;
    ok(l.find((m) => m.id === hieu.id).holyName, "lãnh đạo phải thấy");
  });
  await test("Ẩn SĐT: người khác không thấy, người quản lý vẫn thấy", async () => {
    eq((await other.patch(`/api/v1/members/${hieu.id}`, { hidePhone: true })).status, 200);
    const seen = (await member.get("/api/v1/members")).json.find((m) => m.id === hieu.id);
    eq(seen.phone, "");
    const byHead = (await head.get("/api/v1/members")).json.find((m) => m.id === hieu.id);
    ok(byHead.phone.length > 0, "Người quản lý phải thấy SĐT");
    await other.patch(`/api/v1/members/${hieu.id}`, { hidePhone: false });
  });
  await test("Thành viên không đọc được thông tin riêng tư (ngày sinh, quê, phụ huynh) của người khác", async () => {
    const d = (await member.get(`/api/v1/members/${hieu.id}`)).json;
    ok(!d.birthDateIso && !d.hometown && !d.fatherName, "không được lộ dữ liệu tầng 2");
    eq(d.canViewPrivate, false);
  });
  await test("Thành viên không sửa được hồ sơ người khác", async () => {
    const r = await member.patch(`/api/v1/members/${hieu.id}`, { displayName: "Bị sửa" });
    ok(r.status === 403 || r.status === 404, `nhận ${r.status}`);
  });
  await test("Chính chủ sửa hồ sơ của mình (quê quán)", async () => {
    const r = await member.patch(`/api/v1/members/${tuan.id}`, { hometown: "Xuân Trường, Nam Định" });
    eq(r.status, 200, JSON.stringify(r.json));
  });
  await test("CCCD: mặc định che; thành viên không xem được bản đầy đủ", async () => {
    const d = (await head.get(`/api/v1/members/${tuan.id}`)).json;
    ok(d.identityCard?.startsWith("•"), "phải che CCCD");
    eq((await member.post(`/api/v1/members/${hieu.id}/national-id`, { reason: "tò mò muốn xem" })).status, 403);
  });
  await test("CCCD: Trưởng nhà xem được khi nêu lý do (ghi kiểm toán); thiếu lý do → 400", async () => {
    eq((await head.post(`/api/v1/members/${tuan.id}/national-id`, { reason: "ab" })).status, 400);
    const r = await head.post(`/api/v1/members/${tuan.id}/national-id`, { reason: "Khai báo tạm trú" });
    eq(r.status, 200);
    ok(/^\d{12}$/.test(r.json.nationalId), "phải giải mã ra 12 số");
  });
  await test("Thành viên không tạo được thành viên mới", async () => eq((await member.post("/api/v1/members", { fullName: "Người Lạ" })).status, 403));
  await test("Thành viên không đặt lại mật khẩu người khác", async () => eq((await member.post(`/api/v1/members/${hieu.id}/password-reset`)).status, 403));
  await test("Thành viên không tự gán vai trò Thủ quỹ", async () => eq((await member.post(`/api/v1/members/${tuan.id}/roles`, { role: "treasurer", grant: true })).status, 403));
  await test("Trưởng nhà thêm thành viên + cấp tài khoản → nhận mật khẩu tạm, đăng nhập phải đổi mật khẩu", async () => {
    const email = `moi.${Date.now()}@luuxa.local`;
    const r = await head.post("/api/v1/members", { fullName: "Giuse Lê Văn Mới", email, createAccount: true, roomCode: null });
    eq(r.status, 201, JSON.stringify(r.json));
    const c = await new Client("new").login(email, r.json.account.temporaryPassword);
    eq((await c.get("/api/v1/auth/me")).json.user.mustChangePassword, true);
  });
}

async function suiteAccountLink() {
  section("Cấp tài khoản cho hồ sơ đã có");
  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  let id;
  await test("Trưởng nhà tạo hồ sơ chưa có tài khoản", async () => {
    const r = await head.post("/api/v1/members", { fullName: "Đaminh Phạm Văn Hồ Sơ", phone: "0901 234 567" });
    eq(r.status, 201, JSON.stringify(r.json));
    id = r.json.id;
    eq(r.json.account, null);
  });
  const email = `hoso.${Date.now()}@luuxa.local`;
  let pw;
  await test("Admin cấp tài khoản (auth.user.manage) → mật khẩu tạm", async () => {
    const r = await admin.post(`/api/v1/members/${id}/account`, { email });
    eq(r.status, 200, JSON.stringify(r.json));
    pw = r.json.temporaryPassword;
  });
  await test("Cấp lần hai → 409", async () => eq((await head.post(`/api/v1/members/${id}/account`, { email: "khac@luuxa.local" })).status, 409));
  await test("Đăng nhập bằng tài khoản mới → đã gắn hồ sơ, vai trò Thành viên, phải đổi mật khẩu", async () => {
    const c = await new Client("linked").login(email, pw);
    const me = (await c.get("/api/v1/auth/me")).json;
    eq(me.member?.id, id);
    eq(me.primaryRole, "member");
    eq(me.user.mustChangePassword, true);
    eq((await c.post("/api/v1/auth/password", { currentPassword: pw, newPassword: "MatKhauMoi2026" })).status, 200);
    eq((await c.get("/api/v1/auth/me")).json.user.mustChangePassword, false);
  });
}

async function suiteHouse() {
  section("Sơ đồ nhà & phân phòng");
  // Trưởng nhà xếp phòng / sửa cấu trúc nhà (house.assign, house.structure.manage) — không còn vai trò Phó nhà
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const list = (await head.get("/api/v1/members")).json;
  const kiet = list.find((m) => m.fullName === "Đỗ Tuấn Kiệt");
  const p1Count = list.filter((m) => m.room === "P.1").length;
  await test("Thành viên không xếp phòng được (403)", async () => eq((await member.post("/api/v1/house/assignments", { memberId: kiet.id, roomCode: "P.3" })).status, 403));
  await test("Không xếp người vào phòng không phải phòng ngủ (P.SANH1) → 422", async () =>
    eq((await head.post("/api/v1/house/assignments", { memberId: kiet.id, roomCode: "P.SANH1" })).status, 422));
  await test(`Vượt sức chứa P.1 (đang ${p1Count}/2) → 422`, async () => {
    const r = await head.post("/api/v1/house/assignments", { memberId: kiet.id, roomCode: "P.1" });
    eq(r.status, 422, JSON.stringify(r.json));
    ok(/đủ/.test(r.json.detail), "thông điệp phải nói phòng đã đủ chỗ");
  });
  await test("Trưởng nhà chuyển Kiệt sang phòng mới P.7 rồi hủy gán trong ngày, rồi xếp lại phòng cũ", async () => {
    const before = (await head.get("/api/v1/members")).json.find((m) => m.id === kiet.id).room;
    eq((await head.post("/api/v1/house/rooms", { id: "P.7", name: "Phòng 7 (thử)", floor: 2, type: "bedroom", capacity: 2 })).status, 200);
    eq((await head.post("/api/v1/house/assignments", { memberId: kiet.id, roomCode: "P.7" })).status, 200);
    eq((await head.get("/api/v1/members")).json.find((m) => m.id === kiet.id).room, "P.7");
    eq((await head.del(`/api/v1/house/assignments/${kiet.id}`)).status, 200);
    eq((await head.get("/api/v1/members")).json.find((m) => m.id === kiet.id).room, "Chưa xếp phòng");
    const back = await head.post("/api/v1/house/assignments", { memberId: kiet.id, roomCode: before });
    eq(back.status, 200, JSON.stringify(back.json));
    eq((await head.del("/api/v1/house/rooms/P.7")).status, 200);
  });
  await test("Không xóa được phòng đang có người (409)", async () => eq((await head.del("/api/v1/house/rooms/P.2")).status, 409));
  await test("Trưởng nhà thêm/sửa/xóa phòng mới P.6 (tầng 2)", async () => {
    eq((await head.post("/api/v1/house/rooms", { id: "P.6", name: "Phòng 6", floor: 2, type: "bedroom", capacity: 2, amenities: ["Quạt trần", "Bàn học cá nhân (gỗ)"] })).status, 200);
    eq((await head.patch("/api/v1/house/rooms/P.6", { capacity: 3, x: 400, y: 300, w: 80, h: 60 })).status, 200);
    const h = (await head.get("/api/v1/house")).json;
    const p6 = h.rooms.find((r) => r.id === "P.6");
    eq(p6.capacity, 3);
    ok(p6.amenities.some((a) => a.startsWith("Bàn học cá nhân")), "tiện ích phải lưu");
    eq((await head.del("/api/v1/house/rooms/P.6")).status, 200);
  });
  await test("Thành viên không sửa được cấu trúc nhà (403)", async () => eq((await member.patch("/api/v1/house/rooms/P.1", { name: "Hack" })).status, 403));
}

async function suiteFiles() {
  section("Tệp tải lên (lưu local)");
  const a = await as("tuan.nguyen@luuxa.local");
  const b = await as("hieu.bui@luuxa.local");
  const jpg = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 120, b: 200 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: "TestCam", Model: "GPS-Leaker" } } })
    .toBuffer();
  let fileId;
  await test("Tải ảnh JPEG lên bucket receipts → ready, có ảnh thu nhỏ", async () => {
    const form = new FormData();
    form.append("bucket", "receipts");
    form.append("file", new Blob([jpg], { type: "image/jpeg" }), "hoa-don.jpg");
    const r = await a.req("POST", "/api/v1/files", undefined, { form });
    eq(r.status, 200, JSON.stringify(r.json));
    fileId = r.json.id;
  });
  await test("Ảnh lưu trên máy chủ đã bị xóa EXIF", async () => {
    const res = await a.get(`/api/v1/files/${fileId}`, { raw: true });
    eq(res.status, 200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    ok(!meta.exif, "EXIF phải bị loại bỏ");
  });
  await test("Người khác không xem được tệp chưa gắn vào thực thể họ được xem (404)", async () => eq((await b.get(`/api/v1/files/${fileId}`)).status, 404));
  await test("Tệp không phải ảnh/PDF bị từ chối (415)", async () => {
    const form = new FormData();
    form.append("bucket", "receipts");
    form.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }), "fake.jpg");
    eq((await a.req("POST", "/api/v1/files", undefined, { form })).status, 415);
  });
  await test("Bucket không hợp lệ bị từ chối (400)", async () => {
    const form = new FormData();
    form.append("bucket", "../../etc");
    form.append("file", new Blob([jpg], { type: "image/jpeg" }), "x.jpg");
    eq((await a.req("POST", "/api/v1/files", undefined, { form })).status, 400);
  });
}

// Bộ kiểm thử của từng phân hệ (nếu có file scripts/test-api/<tên>.mjs export async function run({ as, test, eq, ok, section, BASE }))
async function suiteModules() {
  const { readdirSync } = await import("node:fs");
  const dir = path.join(ROOT, "scripts", "test-api");
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs") && x.startsWith(ONLY)).sort()) {
    const mod = await import(`./test-api/${f}`);
    await mod.run({ as, test, eq, ok, section, BASE, Client });
  }
}

// ---------------------------------------------------------------------
(async () => {
  const t0 = Date.now();
  try {
    if (!NO_SERVER) await startServer();
    if (!ONLY) {
      await suiteAuth();
      await suiteRegistration();
      await suiteMembers();
      await suiteAccountLink();
      await suiteHouse();
      await suiteFiles();
    }
    await suiteModules();
  } catch (e) {
    results.push({ group: "runner", name: "Lỗi bộ chạy", ok: false, err: e.message });
    console.error(e);
  } finally {
    stopServer();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? "\x1b[31m" : "\x1b[32m"}${results.length - failed.length}/${results.length} ca đạt\x1b[0m sau ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  mkdirSync(path.join(ROOT, ".local"), { recursive: true });
  writeFileSync(path.join(ROOT, ".local/test-api-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  process.exit(failed.length ? 1 : 0);
})();
