#!/usr/bin/env node
// Kiểm tra giao diện tab "Dung lượng" (Cài đặt → chỉ Admin) bằng trình duyệt thật: hiển thị đủ khối, Admin thấy tab còn Trưởng nhà thì không,
// không tràn ngang ở 390px, chụp ảnh sáng/tối (.local/e2e/storage-tab/). Chạy trên DB local (đã áp db/app/1039).
//   node scripts/e2e/storage-tab.mjs [--base http://localhost:3000] [--admin viet.vu@luuxa.local] [--head duc.tran@luuxa.local]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const ADMIN = get("--admin", "viet.vu@luuxa.local");
const HEAD = get("--head", "duc.tran@luuxa.local");
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}
mkdirSync(".local/e2e/storage-tab", { recursive: true });

let bad = 0;
const check = (cond, msg) => {
  console.log(cond ? "  ✓" : "  ✗", msg);
  if (!cond) bad++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });

async function login(context, user) {
  const page = await context.newPage();
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.fill("#email", user);
  await page.fill("#password", "LuuXa@2026");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  return page;
}
const tabBtn = (page) => page.getByRole("button", { name: /^Dung lượng$/ });

try {
  console.log("\nTrưởng nhà: không thấy tab");
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
  const hp = await login(hctx, HEAD);
  await hp.goto(`${BASE}/quan-tri`, { waitUntil: "load", timeout: 90_000 });
  await hp.waitForSelector("text=Phiên bản & cập nhật", { timeout: 60_000 }); // Trưởng nhà vào được Quản trị nhưng không có tab Dung lượng
  check((await tabBtn(hp).count()) === 0, "Trưởng nhà không có tab “Dung lượng”");
  await hp.goto(`${BASE}/quan-tri?tab=storage`, { waitUntil: "load" });
  await hp.waitForTimeout(1500);
  check((await hp.getByText("Hạn mức gói & ngưỡng cảnh báo").count()) === 0, "mở thẳng ?tab=storage cũng không hiện nội dung");
  await hctx.close();

  console.log("\nAdmin: máy tính");
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "vi-VN", colorScheme: scheme });
    const page = await login(ctx, ADMIN);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/quan-tri`, { waitUntil: "load", timeout: 90_000 });
    await page.evaluate((s) => document.documentElement.classList.toggle("dark", s === "dark"), scheme);
    await tabBtn(page).waitFor({ timeout: 60_000 });
    await tabBtn(page).click();
    await page.getByText("Dung lượng & lưu trữ").waitFor({ timeout: 30_000 });
    // chờ số đo nhà cung cấp (thẻ Supabase Storage hết "Đang đo…")
    await page.waitForFunction(() => !document.body.innerText.includes("Đang đo…"), null, { timeout: 60_000 });
    await page.waitForTimeout(500);
    if (scheme === "light") {
      for (const t of ["CSDL", "Supabase Storage", "Tệp đã tải lên", "Tải lên theo ngày", "Theo tháng (12 tháng)", "Người tải lên nhiều nhất", "Tệp lớn nhất", "Bảng CSDL lớn nhất", "Hạn mức gói & ngưỡng cảnh báo", "Xu hướng theo ngày"]) {
        check((await page.getByText(t, { exact: false }).count()) > 0, `có khối “${t}”`);
      }
      check((await page.locator('[role="progressbar"]').count()) >= 2, "có thanh tiến độ (CSDL + Supabase Storage …)");
      const pct = await page.locator('[role="progressbar"]').first().getAttribute("aria-valuenow");
      check(pct !== null, `thanh CSDL có % (${pct})`);
      // đổi khoảng thời gian của biểu đồ ngày
      await page.locator("text=Tải lên theo ngày").locator("xpath=ancestor::section").getByRole("button").first().click();
      await page.getByRole("option", { name: "90 ngày" }).click().catch(() => page.getByText("90 ngày").last().click());
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Biểu đồ số tệp tải lên theo ngày"] > div').length === 90, null, { timeout: 15_000 }).catch(() => {});
      const bars = await page.locator('[aria-label="Biểu đồ số tệp tải lên theo ngày"] > div').count();
      check(bars === 90, `biểu đồ đổi sang 90 ngày (${bars} cột)`);
    }
    await page.screenshot({ path: `.local/e2e/storage-tab/desktop-${scheme}.png`, fullPage: true });
    check(errors.length === 0, `không có lỗi trang (${scheme})${errors.length ? ": " + errors[0] : ""}`);
    await ctx.close();
  }

  console.log("\nAdmin: điện thoại 390px");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "vi-VN" });
  const mp = await login(mctx, ADMIN);
  await mp.goto(`${BASE}/quan-tri?tab=storage`, { waitUntil: "load", timeout: 90_000 });
  await mp.getByText("Dung lượng & lưu trữ").waitFor({ timeout: 60_000 });
  await mp.waitForFunction(() => !document.body.innerText.includes("Đang đo…"), null, { timeout: 60_000 });
  await mp.waitForTimeout(600);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `không tràn ngang (${overflow}px)`);
  await mp.screenshot({ path: ".local/e2e/storage-tab/mobile.png", fullPage: true });
  await mctx.close();
} catch (e) {
  console.error("LỖI:", e);
  bad++;
} finally {
  await browser.close();
}
console.log(bad ? `\n✗ ${bad} lỗi` : "\n✓ Tab Dung lượng: đạt");
process.exit(bad ? 1 : 0);
