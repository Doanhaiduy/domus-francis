#!/usr/bin/env node
// Kiểm thử giao diện bằng trình duyệt có sẵn trên máy (Edge/Chrome qua playwright-core — không tải trình duyệt).
// Đăng nhập bằng tài khoản demo, mở từng trang, ghi lỗi console/pageerror/HTTP ≥ 500 và chụp ảnh màn hình.
//
//   node scripts/e2e/smoke.mjs [--base http://localhost:3000] [--user duc.tran@luuxa.local] [--pages /,/thu-chi] [--headed]
// Ảnh: .local/e2e/<user>/<trang>.png · Kết quả: thoát 1 nếu có lỗi.
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "duc.tran@luuxa.local");
const PASS = get("--pass", "LuuXa@2026");
// Git Bash (MSYS) đổi "/trang" thành "C:/Program Files/Git/trang" — chuẩn hóa lại
const normPage = (p) => "/" + p.replace(/^[A-Za-z]:\/.*?\/Git\/?/, "").replace(/^\/+/, "");
const PAGES = get("--pages", "/,/thong-bao,/lich-su-kien,/thu-chi,/bep-com,/hau-can,/phung-vu,/dien-dan,/thanh-vien,/hoc-tap,/so-do-nha,/khoanh-khac,/cai-dat").split(",").map(normPage);
const HEADED = args.includes("--headed");

const EXES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const executablePath = EXES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("Không tìm thấy Edge/Chrome trên máy.");
  process.exit(2);
}

const outDir = path.resolve(".local/e2e", USER.split("@")[0]);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: !HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
const page = await context.newPage();
const problems = [];
let current = "";
page.on("console", (m) => {
  // Lỗi tải tài nguyên đã được ghi kèm URL ở trình nghe "response"
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push(`[${current}] console: ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => problems.push(`[${current}] pageerror: ${e.message.slice(0, 300)}`));
page.on("response", (r) => {
  const st = r.status();
  if (st >= 500 || st === 404 || st === 403) problems.push(`[${current}] HTTP ${st} ${r.url()}`);
});
// Mọi request phải ở máy local
page.on("request", (r) => {
  const u = new URL(r.url());
  if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) {
    problems.push(`[${current}] REQUEST RA NGOÀI: ${r.url()}`);
  }
});

try {
  current = "/dang-nhap";
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
  await page.fill("#email", USER);
  await page.fill("#password", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30000 }), page.click('button[type="submit"]')]);
  console.log(`✓ Đăng nhập ${USER} → ${new URL(page.url()).pathname}`);
  for (const p of PAGES) {
    current = p;
    const t0 = Date.now();
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);
    const name = p === "/" ? "tong-quan" : p.replace(/^\//, "").replace(/\//g, "_");
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
    console.log(`  ✓ ${p.padEnd(16)} ${Date.now() - t0} ms`);
  }
} catch (e) {
  problems.push(`[${current}] ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} vấn đề:`);
  for (const x of problems) console.log("  - " + x);
  process.exit(1);
}
console.log(`\n✓ Không có lỗi. Ảnh chụp: ${outDir}`);
