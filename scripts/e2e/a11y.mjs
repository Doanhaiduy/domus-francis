#!/usr/bin/env node
// Kiểm tra khả năng tiếp cận (axe-core) trên trình duyệt có sẵn (Edge/Chrome qua playwright-core), cả giao diện sáng và tối.
//   node scripts/e2e/a11y.mjs [--base http://localhost:3000] [--public /tin-tuc,/lien-he,…] [--app /xin-phep,…] [--user duc.tran@luuxa.local] [--min serious]
// Trang công khai kiểm khi chưa đăng nhập; trang nội bộ kiểm sau khi đăng nhập tài khoản demo (chỉ DB local/staging).
// In các vi phạm theo mức độ (critical > serious > moderate > minor); thoát 1 nếu có vi phạm từ mức --min (mặc định serious) trở lên.
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "duc.tran@luuxa.local");
const PASS = get("--pass", "LuuXa@2026");
const norm = (p) => "/" + p.replace(/^[A-Za-z]:\/.*?\/Git\/?/, "").replace(/^\/+/, "");
const PUBLIC = get("--public", "/tin-tuc,/gioi-thieu,/lien-he,/hoi-dap,/thu-vien,/dang-nhap").split(",").filter(Boolean).map(norm);
const APP = get("--app", "/,/xin-phep,/thu-chi,/thanh-vien,/bai-viet,/bao-cao,/cai-dat").split(",").filter(Boolean).map(norm);
const ORDER = ["minor", "moderate", "serious", "critical"];
const MIN = ORDER.indexOf(get("--min", "serious"));

const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome trên máy.");
  process.exit(2);
}
const axeSource = readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const browser = await chromium.launch({ executablePath: exe, headless: true });
let failed = 0;

async function audit(page, url, scheme) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 90_000 });
  // Giao diện "theo hệ thống" đọc prefers-color-scheme lúc tải; ép lại lớp dark cho chắc
  await page.evaluate((s) => document.documentElement.classList.toggle("dark", s === "dark"), scheme);
  await page.waitForTimeout(400);
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }, resultTypes: ["violations"] }));
  const rows = res.violations.filter((v) => ORDER.indexOf(v.impact ?? "minor") >= MIN);
  const tag = `${url} [${scheme}]`;
  if (!rows.length) {
    console.log(`  \x1b[32m✓\x1b[0m ${tag}${res.violations.length ? `  (${res.violations.length} lỗi nhẹ bỏ qua)` : ""}`);
    return;
  }
  failed += rows.length;
  console.log(`  \x1b[31m✗ ${tag}\x1b[0m`);
  for (const v of rows) {
    console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} chỗ)`);
    for (const n of v.nodes.slice(0, 3)) console.log(`         ${n.target.join(" ")}  ${(n.any[0]?.message ?? n.failureSummary ?? "").split("\n")[0].slice(0, 140)}`);
  }
}

const pub = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
const p1 = await pub.newPage();
console.log("▶ Trang công khai (chưa đăng nhập)");
for (const u of PUBLIC) for (const s of ["light", "dark"]) await audit(p1, u, s);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
const p2 = await ctx.newPage();
await p2.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
await p2.fill("#email", USER);
await p2.fill("#password", PASS);
await Promise.all([p2.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), p2.click("button[type=submit]")]);
console.log(`▶ Trang nội bộ (đăng nhập ${USER})`);
for (const u of APP) for (const s of ["light", "dark"]) await audit(p2, u, s);

await browser.close();
console.log(failed ? `\n\x1b[31m${failed} vi phạm từ mức "${ORDER[MIN]}" trở lên\x1b[0m` : "\n\x1b[32mKhông có vi phạm đáng kể.\x1b[0m");
process.exit(failed ? 1 : 0);
