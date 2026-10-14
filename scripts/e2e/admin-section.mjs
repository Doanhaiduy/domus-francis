#!/usr/bin/env node
// Kiểm tra giao diện trang QUẢN TRỊ HỆ THỐNG (/quan-tri) tách khỏi Cài đặt (/cai-dat) bằng trình duyệt thật:
//   • Admin thấy mục "Quản Trị Hệ Thống" trên thanh bên + đủ tab; Cài đặt KHÔNG còn tab quản trị và không còn "v2.5.0"
//   • liên kết cũ /cai-dat?tab=<tab quản trị> tự chuyển sang /quan-tri?tab=…
//   • tab "Phiên bản & cập nhật": số phiên bản thật khớp /api/health, có lịch sử cập nhật
//   • thành viên thường không có mục trên thanh bên, mở /quan-tri chỉ thấy tab Phiên bản
//   • không tràn ngang ở 390px; ảnh ở .local/e2e/admin-section/<rộng>/
//   node scripts/e2e/admin-section.mjs [--base http://localhost:3100] [--admin viet.vu@luuxa.local] [--member tuan.nguyen@luuxa.local]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3100");
const ADMIN = get("--admin", "viet.vu@luuxa.local");
const MEMBER = get("--member", "tuan.nguyen@luuxa.local");
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}

let bad = 0;
const check = (cond, msg) => {
  console.log(cond ? "  ✓" : "  ✗", msg);
  if (!cond) bad++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const health = await (await fetch(`${BASE}/api/health`)).json();

async function login(context, user) {
  const page = await context.newPage();
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.fill("#email", user);
  await page.fill("#password", "LuuXa@2026");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  // hộp thoại đồng ý điều khoản (nếu có) che giao diện
  await page.getByRole("button", { name: /Tôi đã đọc và đồng ý/i }).click({ timeout: 3000 }).catch(() => {});
  return page;
}
const tabBtn = (page, name) => page.locator("button", { hasText: name }).first();

try {
  for (const width of [1440, 390]) {
    const mobile = width < 640;
    console.log(`\n▶ Rộng ${width}px — Admin`);
    mkdirSync(`.local/e2e/admin-section/${width}`, { recursive: true });
    const shot = (page, name) => page.screenshot({ path: `.local/e2e/admin-section/${width}/${name}.png` });
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: "vi-VN", hasTouch: mobile, isMobile: mobile });
    const page = await login(ctx, ADMIN);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Cài đặt: không còn tab quản trị, không còn "v2.5.0"
    await page.goto(`${BASE}/cai-dat?tab=general`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForSelector("text=Hồ sơ cá nhân", { timeout: 60_000 });
    const settingsText = await page.locator("main, body").first().innerText();
    check(!settingsText.includes("v2.5.0"), "Cài đặt không còn \"v2.5.0\" gõ cứng");
    for (const gone of ["Tích hợp Zalo", "Phân quyền & Vai trò", "Dung lượng", "Nhật ký hoạt động", "Trợ lý AI"]) {
      check((await page.getByRole("button", { name: new RegExp(`^${gone.replace(/[&]/g, "\\&")}`) }).count()) === 0, `Cài đặt không còn tab “${gone}”`);
    }
    await page.getByRole("link", { name: /Quản trị hệ thống/ }).first().waitFor({ timeout: 30_000 }).then(() => check(true, "Cài đặt có lối vào “Quản trị hệ thống” cho Admin"), () => check(false, "Cài đặt thiếu lối vào “Quản trị hệ thống” cho Admin"));
    await shot(page, "01-cai-dat");

    // Trang Quản trị: đủ tab cho Admin
    await page.goto(`${BASE}/quan-tri`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForSelector("h1:has-text('Quản Trị Hệ Thống')", { timeout: 60_000 });
    for (const t of ["Hệ thống", "Phân quyền & Vai trò", "Tài khoản", "Phân hệ", "Tích hợp Zalo", "Trợ lý AI", "Dung lượng", "Nhật ký hoạt động", "Phiên bản & cập nhật"]) {
      check((await tabBtn(page, t).count()) > 0, `Admin thấy tab “${t}”`);
    }
    if (!mobile) check((await page.locator("nav a", { hasText: "Quản Trị Hệ Thống" }).count()) > 0, "thanh bên có mục “Quản Trị Hệ Thống”");
    await shot(page, "02-quan-tri-mac-dinh");

    // Liên kết cũ tự chuyển trang
    for (const t of ["zalo", "storage", "ai", "roles", "accounts", "activity", "modules", "system"]) {
      await page.goto(`${BASE}/cai-dat?tab=${t}`, { waitUntil: "load", timeout: 90_000 });
      await page.waitForURL((u) => u.pathname === "/quan-tri" && u.searchParams.get("tab") === t, { timeout: 30_000 }).then(
        () => check(true, `/cai-dat?tab=${t} ⇒ /quan-tri?tab=${t}`),
        () => check(false, `/cai-dat?tab=${t} KHÔNG chuyển sang /quan-tri (đang ở ${page.url()})`),
      );
    }

    // Phiên bản & cập nhật
    await page.goto(`${BASE}/quan-tri?tab=version`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForSelector("text=Lịch sử cập nhật", { timeout: 60_000 });
    const verText = await page.locator("body").innerText();
    check(verText.includes(`v${health.version}`), `hiện phiên bản thật v${health.version} (khớp /api/health)`);
    check(/Đang chạy/.test(verText) && /Khởi tạo dự án/.test(verText) === false, "bản đang chạy được đánh dấu; các bản cũ nằm sau nút xem thêm");
    await page.getByRole("button", { name: /bản cũ hơn/ }).click();
    check(/Khởi tạo dự án/.test(await page.locator("body").innerText()), "bấm xem thêm hiện cả bản cũ nhất (0.1.0)");
    await shot(page, "03-phien-ban");

    // Zalo: có nút lưu riêng ở trang Quản trị
    await page.goto(`${BASE}/quan-tri?tab=zalo`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(2500);
    await shot(page, "04-zalo");

    if (mobile) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `không tràn ngang ở 390px (lệch ${overflow}px)`);
      await page.goto(`${BASE}/quan-tri?tab=version`, { waitUntil: "load" });
      await page.waitForSelector("text=Lịch sử cập nhật", { timeout: 60_000 });
      const o2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(o2 <= 1, `tab Phiên bản không tràn ngang ở 390px (lệch ${o2}px)`);
    }
    check(errors.length === 0, `không có lỗi JS (${errors.join(" | ").slice(0, 200)})`);
    await ctx.close();
  }

  console.log("\n▶ Thành viên thường");
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
  const mp = await login(mctx, MEMBER);
  await mp.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  await mp.waitForTimeout(2500);
  check((await mp.locator("nav a", { hasText: "Quản Trị Hệ Thống" }).count()) === 0, "thanh bên KHÔNG có mục “Quản Trị Hệ Thống”");
  await mp.goto(`${BASE}/quan-tri?tab=storage`, { waitUntil: "load", timeout: 90_000 });
  await mp.waitForSelector("text=Phiên bản & cập nhật", { timeout: 60_000 });
  check((await tabBtn(mp, "Dung lượng").count()) === 0 && (await tabBtn(mp, "Tài khoản").count()) === 0, "mở thẳng tab quản trị cũng không có tab/nội dung (chỉ còn Phiên bản)");
  await mp.screenshot({ path: ".local/e2e/admin-section/1440/05-thanh-vien.png" });
  await mctx.close();
} catch (e) {
  console.error("\n✗ Lỗi kịch bản:", e.message);
  bad++;
}
await browser.close();
console.log(bad ? `\n✗ ${bad} điểm chưa đạt` : "\n✓ Tất cả đạt");
process.exit(bad ? 1 : 0);
