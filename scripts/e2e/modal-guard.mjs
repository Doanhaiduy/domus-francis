#!/usr/bin/env node
// Kiểm tra BẢO VỆ HỘP THOẠI + TIẾN ĐỘ TẢI ẢNH bằng trình duyệt thật (Edge/Chrome qua playwright-core). Chạy trên DB local/staging (có tạo 1 phiếu chi nháp thử).
//   A. nhập dở rồi bấm Hủy bỏ / Esc / ra ngoài ⇒ hỏi "Thoát mà chưa lưu?" (Ở lại / Thoát); chưa nhập gì ⇒ đóng thẳng
//   B. tải ảnh lớn: ảnh được nén ở trình duyệt (thân yêu cầu nhỏ), có thanh tiến độ + nút Hủy; đang tải thì Esc / ra ngoài / bấm Lưu đều bị chặn; Hủy tải lên dừng được;
//      tải xong rồi thoát ⇒ hỏi mất dữ liệu
//   C. đang lưu: lớp "Đang xử lý…", không đóng được, bấm Lưu hai lần chỉ gửi MỘT yêu cầu
//   D. điện thoại: vuốt xuống để đóng khi đã nhập dở ⇒ hiện hộp hỏi, hộp thoại không đóng
//   node scripts/e2e/modal-guard.mjs [--base http://localhost:3000] [--user viet.vu@luuxa.local]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "viet.vu@luuxa.local");
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

// ảnh "như ảnh điện thoại": 4000×3000, ~5–8 MB
mkdirSync(".local/test-assets", { recursive: true });
const BIG = ".local/test-assets/big-photo.jpg";
if (!existsSync(BIG)) {
  const raw = Buffer.alloc(4000 * 3000 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 90 + (i % 255) * 0.3) | 0;
  writeFileSync(BIG, await sharp(raw, { raw: { width: 4000, height: 3000, channels: 3 } }).jpeg({ quality: 93 }).toBuffer());
}

const browser = await chromium.launch({ executablePath: exe, headless: true });

async function login(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.fill("#email", USER);
  await page.fill("#password", "LuuXa@2026");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  return page;
}
async function openExpenseForm(page) {
  await page.goto(`${BASE}/thu-chi`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Lập phiếu chi/.test(b.innerText)), null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Lập phiếu chi/ }).first().click();
  await page.waitForSelector("[data-sheet-card]", { timeout: 15_000 });
  await page.waitForTimeout(500);
}
const modalOpen = (page) => page.evaluate(() => !!document.querySelector("[data-sheet-overlay]:not([data-no-guard])"));
const askVisible = (page) => page.getByText("Thoát mà chưa lưu?").isVisible().catch(() => false);
const closeFresh = async (page) => {
  if (await askVisible(page)) await page.getByRole("button", { name: "Thoát, bỏ thay đổi" }).click();
  else if (await modalOpen(page)) await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
};

try {
  // ================================================================= A
  console.log("\nA. Thoát khi đã nhập dở");
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "vi-VN" });
  const page = await login(ctxA);
  await openExpenseForm(page);
  await page.getByRole("button", { name: "Hủy bỏ" }).click();
  await page.waitForTimeout(500);
  check(!(await modalOpen(page)) && !(await askVisible(page)), "chưa nhập gì ⇒ Hủy bỏ đóng thẳng, không hỏi");

  await openExpenseForm(page);
  await page.locator("[data-sheet-card] input").first().pressSequentially("Phiếu thử bảo vệ", { delay: 10 });
  await page.getByRole("button", { name: "Hủy bỏ" }).click();
  await page.waitForTimeout(400);
  check(await askVisible(page), "đã nhập ⇒ bấm Hủy bỏ hiện hộp hỏi “Thoát mà chưa lưu?”");
  check(await modalOpen(page), "hộp thoại nhập liệu vẫn còn phía sau");
  await page.getByRole("button", { name: "Tiếp tục chỉnh sửa" }).click();
  await page.waitForTimeout(300);
  check(!(await askVisible(page)) && (await modalOpen(page)), "“Tiếp tục chỉnh sửa” ⇒ ở lại, dữ liệu còn nguyên");
  check((await page.locator("[data-sheet-card] input").first().inputValue()) === "Phiếu thử bảo vệ", "nội dung đã nhập không bị mất");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check(await askVisible(page), "Esc cũng hỏi");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(!(await askVisible(page)) && (await modalOpen(page)), "Esc trên hộp hỏi = ở lại");

  await page.mouse.click(8, 8);
  await page.waitForTimeout(400);
  check(await askVisible(page), "bấm ra ngoài (nền mờ) cũng hỏi");
  await page.getByRole("button", { name: "Tiếp tục chỉnh sửa" }).click();

  // X xóa ô ngày (trong biểu mẫu) KHÔNG bị coi là nút đóng
  const clearDate = page.locator("[data-sheet-card]").getByRole("button").filter({ has: page.locator("svg.lucide-x") }).nth(1);
  if (await clearDate.count()) {
    await clearDate.click().catch(() => {});
    await page.waitForTimeout(300);
    check(!(await askVisible(page)), "bấm X xóa ô ngày không hiện hộp hỏi thoát");
  }
  // nút X ở tiêu đề
  await page.locator("[data-sheet-card]").getByRole("button").filter({ has: page.locator("svg.lucide-x") }).first().click();
  await page.waitForTimeout(400);
  check(await askVisible(page), "nút X ở tiêu đề hỏi");
  await page.getByRole("button", { name: "Thoát, bỏ thay đổi" }).click();
  await page.waitForTimeout(500);
  check(!(await modalOpen(page)), "“Thoát, bỏ thay đổi” ⇒ đóng hộp thoại");

  // ================================================================= B
  console.log("\nB. Tải ảnh: nén ở trình duyệt, tiến độ, hủy, khóa thoát");
  const bodies = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/v1/files") && r.method() === "POST") bodies.push(r);
  });
  await openExpenseForm(page);
  const cdp = await ctxA.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: -1, uploadThroughput: 150 * 1024 });
  await page.locator("[data-sheet-card] input[type=file]").first().setInputFiles(BIG);
  await page.waitForSelector('[data-uploading="1"]', { timeout: 15_000 });
  check(true, "đang tải ⇒ ô tải ảnh có data-uploading");
  await page.waitForSelector('[role="progressbar"]', { timeout: 5000 });
  await page.waitForTimeout(1500);
  const label = await page.locator('[data-uploading="1"]').first().innerText();
  check(/Đang (tối ưu|tải lên|xử lý)/.test(label) && /Hủy tải lên/.test(label), `có chữ tiến độ + nút “Hủy tải lên” (“${label.replace(/\s+/g, " ").slice(0, 60)}…”)`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check((await modalOpen(page)) && !(await askVisible(page)), "Esc khi đang tải ⇒ bị chặn");
  check(await page.getByText(/Đang tải ảnh lên/).first().isVisible().catch(() => false), "hiện thông báo “Đang tải ảnh lên…”");
  await page.mouse.click(8, 8);
  await page.waitForTimeout(300);
  check(await modalOpen(page), "bấm ra ngoài khi đang tải ⇒ bị chặn");
  const before = bodies.length;
  await page.getByRole("button", { name: /Lập phiếu & gửi duyệt/ }).click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  check(await modalOpen(page), "bấm Lưu/Gửi khi đang tải ⇒ bị chặn");

  await page.getByRole("button", { name: "Hủy tải lên" }).click();
  await page.waitForTimeout(700);
  check((await page.locator('[data-uploading="1"]').count()) === 0, "bấm “Hủy tải lên” ⇒ dừng ngay");
  check((await page.locator('[data-upload-fresh="1"]').count()) === 0, "hủy xong ⇒ không có ảnh nào được ghi nhận");
  await page.getByRole("button", { name: "Hủy bỏ" }).click();
  await page.waitForTimeout(400);
  check(!(await askVisible(page)) && !(await modalOpen(page)), "sau khi hủy tải lên, chưa có thay đổi ⇒ đóng thẳng");

  // tải xong thật (không giới hạn mạng)
  await openExpenseForm(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const t0 = Date.now();
  await page.locator("[data-sheet-card] input[type=file]").first().setInputFiles(BIG);
  await page.waitForSelector('[data-upload-fresh="1"]', { timeout: 60_000 });
  const took = Date.now() - t0;
  const sent = Number((await bodies[bodies.length - 1].allHeaders())["content-length"] ?? 0);
  check(sent > 0 && sent < 1.6 * 1024 * 1024, `ảnh gốc ~${(await (await import("node:fs/promises")).stat(BIG)).size / 1048576 | 0} MB được nén ở trình duyệt: thân yêu cầu chỉ ${(sent / 1048576).toFixed(2)} MB`);
  console.log(`    ⏱ tải xong sau ${took} ms (gồm nén ở trình duyệt + máy chủ xử lý)`);
  await page.getByRole("button", { name: "Hủy bỏ" }).click();
  await page.waitForTimeout(400);
  check(await askVisible(page), "đã tải ảnh lên mà thoát ⇒ hỏi “Thoát mà chưa lưu?”");
  await closeFresh(page);

  // ================================================================= C
  console.log("\nC. Đang lưu: lớp xử lý, khóa thoát, chống bấm đúp");
  let posts = 0;
  await page.route("**/api/v1/finance/expenses", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      await new Promise((r) => setTimeout(r, 2600));
    }
    await route.continue();
  });
  await openExpenseForm(page);
  await page.locator("[data-sheet-card] input").first().fill("Phiếu thử chống bấm đúp");
  await page.locator('[data-sheet-card] input[inputmode="numeric"]').first().fill("15000");
  await page.waitForTimeout(300);
  const save = page.getByRole("button", { name: "Lưu nháp" });
  await save.click();
  await save.click({ force: true, timeout: 800 }).catch(() => {});
  await page.waitForTimeout(500);
  check(await page.locator("[data-guard-veil]").first().isVisible().catch(() => false), "đang lưu ⇒ có lớp phủ “Đang xử lý…”");
  await page.keyboard.press("Escape");
  await page.mouse.click(8, 8);
  await page.waitForTimeout(400);
  check(await modalOpen(page), "đang lưu ⇒ Esc / ra ngoài không đóng được");
  check(await page.getByText(/Đang lưu — vui lòng chờ/).first().isVisible().catch(() => false), "hiện thông báo “Đang lưu — vui lòng chờ…”");
  // chờ phản hồi (đã làm chậm 2,6 giây) + máy chủ dev biên dịch + làm mới dữ liệu rồi hộp thoại tự đóng
  await page.waitForFunction(() => !document.querySelector("[data-sheet-overlay]:not([data-no-guard])"), null, { timeout: 30_000 }).catch(() => {});
  check(posts === 1, `bấm Lưu hai lần chỉ gửi ${posts} yêu cầu (mong đợi 1)`);
  check(!(await modalOpen(page)), "lưu xong ⇒ hộp thoại tự đóng");
  await page.unroute("**/api/v1/finance/expenses");

  // ================================================================= D
  console.log("\nD. Điện thoại: vuốt xuống khi đã nhập dở");
  const ctxD = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "vi-VN" });
  const m = await login(ctxD);
  await openExpenseForm(m);
  await m.locator("[data-sheet-card] input").first().pressSequentially("Nhập dở trên điện thoại", { delay: 10 });
  const top = await m.evaluate(() => Math.round(document.querySelector("[data-sheet-card]").getBoundingClientRect().top));
  const cdpM = await ctxD.newCDPSession(m);
  const touch = (type, y) => cdpM.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }] });
  await touch("touchStart", top + 22);
  for (let k = 1; k <= 8; k++) {
    await touch("touchMove", top + 22 + k * 32);
    await m.waitForTimeout(16);
  }
  await touch("touchEnd", top + 280);
  await m.waitForTimeout(900);
  check(await askVisible(m), "vuốt xuống khi đã nhập ⇒ hiện hộp hỏi");
  check(await modalOpen(m), "hộp thoại không bị đóng (thẻ nảy về chỗ cũ)");
  await m.getByRole("button", { name: "Thoát, bỏ thay đổi" }).tap();
  await m.waitForTimeout(600);
  check(!(await modalOpen(m)), "xác nhận thoát ⇒ đóng");
} finally {
  await browser.close();
}
console.log(bad ? `\n✗ ${bad} kiểm tra lỗi` : "\n✓ Mọi kiểm tra bảo vệ hộp thoại đều đạt");
process.exit(bad ? 1 : 0);
