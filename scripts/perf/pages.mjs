#!/usr/bin/env node
// Đo hiệu năng thực tế bằng trình duyệt có sẵn (Edge/Chrome qua playwright-core): đăng nhập, mở app, rồi bấm qua từng tab
// như người dùng. Với mỗi trang: thời gian tới khi hết request /api, số request, request chậm nhất, và số vòng mạng DB
// của từng request (đọc từ header Server-Timing do máy chủ gửi về).
//
//   node scripts/perf/pages.mjs [--base http://localhost:3000] [--user duc.tran@luuxa.local] [--pass ...] [--out .local/perf/x.json] [--mobile]
// Chỉ ĐỌC dữ liệu (không bấm nút ghi). Chạy được ở máy nào có Edge/Chrome.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "duc.tran@luuxa.local");
const PASS = get("--pass", "LuuXa@2026");
const OUT = get("--out", ".local/perf/report.json");
const MOBILE = args.includes("--mobile");
const PAGES = get("--pages", "/thong-bao,/lich-su-kien,/thu-chi,/bep-com,/hau-can,/phung-vu,/dien-dan,/thanh-vien,/hoc-tap,/so-do-nha,/khoanh-khac,/cai-dat,/")
  .split(",")
  .map((p) => "/" + p.replace(/^[A-Za-z]:\/.*?\/Git\/?/, "").replace(/^\/+/, ""));

const exe = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext(
  MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "vi-VN" } : { viewport: { width: 1440, height: 900 }, locale: "vi-VN" },
);
const page = await context.newPage();

// ---- theo dõi request /api ----
let inflight = 0;
let lastActivity = Date.now();
let bucket = [];
const started = new Map();
page.on("request", (r) => {
  if (!r.url().includes("/api/")) return;
  inflight++;
  lastActivity = Date.now();
  started.set(r, Date.now());
});
const done = async (r, failed) => {
  if (!started.has(r)) return;
  inflight = Math.max(0, inflight - 1);
  lastActivity = Date.now();
  const t = Date.now() - started.get(r);
  started.delete(r);
  let st = null;
  let status = 0;
  try {
    const res = await r.response();
    status = res?.status() ?? 0;
    st = res ? (await res.allHeaders())["server-timing"] ?? null : null;
  } catch {
    /* bỏ qua */
  }
  const m = st?.match(/db;dur=([\d.]+);desc="(\d+) round-trips\/(\d+) tx"/);
  const conn = st?.match(/conn;dur=([\d.]+)/);
  const u = new URL(r.url());
  bucket.push({ path: u.pathname + (u.search.length > 60 ? u.search.slice(0, 60) + "…" : u.search), method: r.method(), status, ms: t, failed, dbMs: m ? +m[1] : null, rt: m ? +m[2] : null, tx: m ? +m[3] : null, connMs: conn ? +conn[1] : null });
};
page.on("requestfinished", (r) => done(r, false));
page.on("requestfailed", (r) => done(r, true));

async function settle(timeout = 45_000) {
  const t0 = Date.now();
  await page.waitForTimeout(150);
  while (Date.now() - t0 < timeout) {
    if (inflight === 0 && Date.now() - lastActivity > 600) return;
    await page.waitForTimeout(100);
  }
}

const results = [];
async function measure(label, action) {
  bucket = [];
  const t0 = Date.now();
  await action();
  await settle();
  const ms = Math.max(0, Date.now() - t0 - 600); // trừ khoảng chờ "yên lặng"
  const reqs = bucket.slice().sort((a, b) => b.ms - a.ms);
  results.push({ page: label, ms, requests: reqs.length, roundTrips: reqs.reduce((n, r) => n + (r.rt ?? 0), 0), reqs });
  const s = reqs[0];
  console.log(
    `  ${label.padEnd(22)} ${String(ms).padStart(6)} ms  ${String(reqs.length).padStart(3)} req  ${String(results.at(-1).roundTrips).padStart(4)} vòng DB` +
      (s ? `  · chậm nhất ${s.path} ${s.ms} ms${s.rt != null ? ` (${s.rt} vòng)` : ""}` : ""),
  );
  for (const e of reqs.filter((r) => r.status >= 500 || r.failed)) console.log(`      ⚠ ${e.method} ${e.path} → ${e.failed ? "thất bại" : e.status}`);
}

try {
  console.log(`▶ ${BASE} · ${USER}${MOBILE ? " · mobile 390px" : ""}`);
  // Lần đầu ở chế độ dev trang có thể tự tải lại (HMR) ngay sau khi biên dịch ⇒ chờ ổn định và thử lại một lần
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await measure("Đăng nhập → Tổng quan", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.fill("#email", USER);
      await page.fill("#password", PASS);
      const ok = await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30_000 }).then(() => true, () => false),
        page.click('button[type="submit"]'),
      ]).then(([r]) => r);
      if (ok) return;
      await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
    }
    throw new Error("Không đăng nhập được");
  });
  await measure("Tải lại (F5) Tổng quan", () => page.reload({ waitUntil: "load" }));
  for (const p of PAGES) {
    await measure(`Bấm tab ${p}`, async () => {
      // Máy tính: thanh bên; điện thoại: thanh điều hướng dưới, tab không có ở đó thì mở menu "Thêm"
      const desktopLink = page.locator(`aside a[href="${p}"]`).first();
      const bottomLink = page.locator(`nav a[href="${p}"]`).first();
      if (!MOBILE && (await desktopLink.count())) await desktopLink.click();
      else if (MOBILE && (await bottomLink.isVisible().catch(() => false))) await bottomLink.tap();
      else if (MOBILE) {
        await page.getByRole("button", { name: "Thêm" }).tap().catch(() => {});
        const drawerLink = page.locator(`a[href="${p}"]:visible`).first();
        if (await drawerLink.count()) await drawerLink.tap();
        else await page.goto(`${BASE}${p}`);
      } else await page.goto(`${BASE}${p}`);
      await page.waitForURL((u) => u.pathname === p, { timeout: 30_000 }).catch(() => page.goto(`${BASE}${p}`));
    });
  }
} finally {
  await browser.close();
}

// ---- tổng hợp theo endpoint ----
const all = results.flatMap((r) => r.reqs);
const byPath = new Map();
for (const r of all) {
  const k = `${r.method} ${r.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")}`;
  const e = byPath.get(k) ?? { k, n: 0, ms: 0, rt: 0 };
  e.n++;
  e.ms = Math.max(e.ms, r.ms);
  e.rt = Math.max(e.rt, r.rt ?? 0);
  byPath.set(k, e);
}
console.log("\nEndpoint chậm/nhiều vòng DB nhất (theo từng lần xuất hiện):");
for (const e of [...byPath.values()].sort((a, b) => b.ms - a.ms).slice(0, 15)) console.log(`  ${String(e.ms).padStart(6)} ms  ${String(e.rt).padStart(3)} vòng  ${e.k}`);
const total = results.reduce((n, r) => n + r.ms, 0);
console.log(`\nTổng thời gian các bước: ${(total / 1000).toFixed(1)} s · trung bình mỗi tab ${(total / results.length / 1000).toFixed(2)} s`);
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ base: BASE, user: USER, mobile: MOBILE, at: new Date().toISOString(), results, endpoints: all }, null, 1));
console.log(`Báo cáo: ${OUT}`);
