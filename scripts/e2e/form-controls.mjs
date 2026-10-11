#!/usr/bin/env node
// Kiểm tra các ô NHẬP/CHỌN dùng chung bằng trình duyệt thật (Edge/Chrome qua playwright-core) — thay thành phần gốc của trình duyệt
// (datalist, <select>, ô ngày/giờ gốc) bằng CustomCombobox / CustomSelect / CustomDatePicker / CustomTimeInput. Chạy trên DB local.
//   A. Đơn vị món chi: bảng gợi ý vẽ bằng FloatingPanel (không phải datalist), lọc không dấu, ↑↓ + Enter chọn, chữ tự gõ được giữ, Esc chỉ đóng bảng
//   B. Chuyên mục tài liệu phụng vụ: cùng kiểu
//   C. Giờ bắt đầu buổi phụng vụ: bộ chọn giờ 24h (Admin)
//   D. Ngày sinh: bộ chọn ngày có chọn nhanh năm/tháng
//   E. Ô thẻ bài viết: không còn datalist, Enter vẫn thêm thẻ
//   node scripts/e2e/form-controls.mjs [--base http://localhost:3000] [--user duc.tran@luuxa.local]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "duc.tran@luuxa.local");
const ADMIN = get("--admin", "viet.vu@luuxa.local");
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}
mkdirSync(".local/e2e/form-controls", { recursive: true });

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
const fold = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const native = (page) => page.evaluate(() => ({ datalist: document.querySelectorAll("datalist").length, select: document.querySelectorAll("select").length, date: document.querySelectorAll('input[type="date"],input[type="time"]').length }));
const optionTexts = (page) => page.locator('[role="listbox"] [role="option"]').allInnerTexts();
const leaveAsk = async (page) => {
  if (await page.getByText("Thoát mà chưa lưu?").isVisible().catch(() => false)) await page.getByRole("button", { name: "Thoát, bỏ thay đổi" }).click();
  await page.waitForTimeout(300);
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, locale: "vi-VN" });
  const page = await login(ctx, USER);

  // ================================================================= A
  console.log("\nA. Đơn vị của món chi (CustomCombobox)");
  await page.goto(`${BASE}/thu-chi`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Lập phiếu chi|Đề xuất chi/.test(b.innerText)), null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Lập phiếu chi|Đề xuất chi/ }).first().click();
  await page.waitForSelector("[data-sheet-card]", { timeout: 15_000 });
  await page.locator("[data-sheet-card]").getByText("Chi nhiều món? Nhập chi tiết từng món").click();
  const unit = page.locator('[data-field="unit"]').first();
  await unit.click();
  await page.waitForSelector('[role="listbox"]', { timeout: 5000 });
  let opts = await optionTexts(page);
  check(opts.includes("kg") && opts.includes("lít") && opts.length >= 15, `bấm vào ô ⇒ bảng gợi ý (${opts.length} mục) vẽ bằng giao diện chung`);
  check((await native(page)).datalist === 0, "không còn <datalist> gốc của trình duyệt");
  await page.screenshot({ path: ".local/e2e/form-controls/unit-list.png" });
  await unit.fill("li");
  await page.waitForTimeout(200);
  opts = await optionTexts(page);
  check(opts.length >= 1 && opts.every((o) => fold(o).includes("li")) && opts.includes("lít"), `gõ “li” ⇒ lọc còn ${opts.join(", ")}`);
  await unit.fill("lit");
  await page.waitForTimeout(200);
  check((await optionTexts(page)).includes("lít"), "gõ không dấu “lit” vẫn ra “lít”");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check((await unit.inputValue()) === "lít", "↓ + Enter ⇒ chọn “lít”");
  check(!(await page.locator('[role="listbox"]').count()), "chọn xong bảng gợi ý đóng");
  await unit.fill("bó nhỏ");
  await page.waitForTimeout(150);
  check((await unit.inputValue()) === "bó nhỏ", "chữ tự gõ (không có trong gợi ý) được giữ nguyên");
  await unit.fill("");
  await unit.click();
  await page.waitForSelector('[role="listbox"]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check(!(await page.locator('[role="listbox"]').count()), "Esc đóng bảng gợi ý");
  check(!(await page.getByText("Thoát mà chưa lưu?").isVisible().catch(() => false)) && (await page.locator("[data-sheet-card]").count()) === 1, "…nhưng KHÔNG đóng hộp thoại phía sau (không hiện hộp hỏi thoát)");
  // Enter khi chưa tô sáng mục nào: nhảy sang ô kế tiếp (đơn giá) như cũ
  await unit.fill("kg");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check(await page.evaluate(() => document.activeElement?.getAttribute("data-field") === "price"), "Enter (chưa tô sáng mục nào) ⇒ nhảy sang ô đơn giá");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await leaveAsk(page);

  // ================================================================= B
  console.log("\nB. Chuyên mục tài liệu phụng vụ");
  await page.goto(`${BASE}/phung-vu#tai-lieu-phung-vu`, { waitUntil: "load", timeout: 90_000 });
  await page.getByRole("button", { name: /Thêm tài liệu/ }).click();
  await page.waitForSelector("[data-sheet-card]", { timeout: 15_000 });
  const cat = page.getByPlaceholder(/Kinh hằng ngày, Mùa Vọng/);
  await cat.click();
  await page.waitForTimeout(300);
  const catOpts = await optionTexts(page);
  check(catOpts.length > 0, `bấm vào ô Chuyên mục ⇒ bảng gợi ý (${catOpts.length} mục: ${catOpts.slice(0, 4).join(", ")}…)`);
  check((await native(page)).datalist === 0, "không còn <datalist>");
  await page.screenshot({ path: ".local/e2e/form-controls/liturgy-category.png" });
  if (catOpts.length) {
    await page.locator('[role="listbox"] [role="option"]').first().click();
    await page.waitForTimeout(200);
    check((await cat.inputValue()) === catOpts[0].split("\n")[0].trim(), "bấm một gợi ý ⇒ điền vào ô");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await leaveAsk(page);

  // ================================================================= C
  console.log("\nC. Giờ bắt đầu buổi phụng vụ (CustomTimeInput, Admin)");
  const actx = await browser.newContext({ viewport: { width: 1280, height: 950 }, locale: "vi-VN" });
  const ap = await login(actx, ADMIN);
  await ap.goto(`${BASE}/phung-vu`, { waitUntil: "load", timeout: 90_000 });
  const addSession = ap.getByRole("button", { name: /Thêm buổi/ });
  await addSession.first().waitFor({ timeout: 20_000 }).catch(() => {});
  if (await addSession.count()) {
    await addSession.first().click();
    const timeBtn = ap.getByRole("button", { name: "Giờ bắt đầu" });
    await timeBtn.waitFor({ timeout: 10_000 });
    check((await native(ap)).date === 0, "không còn ô giờ gốc của trình duyệt");
    await timeBtn.click();
    await ap.getByText("Giờ", { exact: true }).waitFor();
    await ap.getByRole("button", { name: "19", exact: true }).click();
    await ap.getByRole("button", { name: "30", exact: true }).click();
    await ap.waitForTimeout(250);
    check((await timeBtn.innerText()).includes("19:30"), `chọn 19 giờ + 30 phút ⇒ “${(await timeBtn.innerText()).trim()}”`);
    await timeBtn.click();
    await ap.getByPlaceholder("HH:MM").fill("6:05");
    await ap.getByRole("button", { name: "Xong", exact: true }).click();
    await ap.waitForTimeout(250);
    check((await timeBtn.innerText()).includes("06:05"), "gõ tay “6:05” ⇒ chuẩn hóa thành 06:05");
    await ap.screenshot({ path: ".local/e2e/form-controls/time.png" });
    await ap.getByRole("button", { name: "Hủy", exact: true }).first().click();
  } else {
    console.log("    (bỏ qua: không thấy nút “Thêm buổi”)");
  }
  await actx.close();

  // ================================================================= D
  console.log("\nD. Ngày sinh (CustomDatePicker có chọn nhanh năm/tháng)");
  await page.goto(`${BASE}/cai-dat?tab=profile`, { waitUntil: "load", timeout: 90_000 });
  await page.getByText("Ngày sinh").first().waitFor({ timeout: 60_000 });
  check((await native(page)).date === 0, "hồ sơ không còn ô ngày gốc của trình duyệt");
  const trigger = page.locator("label:has-text('Ngày sinh') + div");
  const panelBtn = (re) => page.locator('div[role="presentation"] button', { hasText: re });
  await trigger.click();
  await page.getByRole("button", { name: "Chọn nhanh tháng / năm" }).click(); // ngày → tháng
  await page.getByRole("button", { name: "Chọn nhanh tháng / năm" }).click(); // tháng → năm
  const years = await panelBtn(/^(19|20)\d\d$/).allInnerTexts();
  check(years.length === 12, `bảng chọn năm hiện 12 năm (${years[0]} … ${years[years.length - 1]})`);
  await page.getByRole("button", { name: "12 năm trước" }).click();
  await page.getByRole("button", { name: "12 năm trước" }).click();
  const years2 = await panelBtn(/^(19|20)\d\d$/).allInnerTexts();
  check(Number(years2[0]) === Number(years[0]) - 24, `lùi 2 trang ⇒ ${years2[0]} … ${years2[years2.length - 1]}`);
  const pickYear = years2[3];
  await panelBtn(new RegExp("^" + pickYear + "$")).click();
  await page.getByRole("button", { name: "Tháng 3", exact: true }).click();
  await panelBtn(/^15$/).first().click();
  await page.waitForTimeout(300);
  const shown = (await trigger.innerText()).trim();
  check(shown.startsWith("15/03/" + pickYear), `chọn năm → tháng → ngày ⇒ “${shown}”`);
  await page.screenshot({ path: ".local/e2e/form-controls/dob.png" });

  // ================================================================= E
  console.log("\nE. Ô thẻ bài viết (TagsInput)");
  await page.goto(`${BASE}/bai-viet/moi`, { waitUntil: "load", timeout: 90_000 });
  await page.getByLabel("Thẻ (tùy chọn)").waitFor({ timeout: 60_000 });
  check((await native(page)).datalist === 0, "trang soạn bài không còn <datalist>");
  await page.getByLabel("Thẻ (tùy chọn)").fill("tuyển sinh");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  check(await page.getByText("#tuyển sinh").first().isVisible(), "Enter vẫn thêm thẻ như cũ");
  await ctx.close();
} catch (e) {
  console.error("LỖI:", e);
  bad++;
} finally {
  await browser.close();
}
console.log(bad ? `\n✗ ${bad} lỗi` : "\n✓ Ô nhập/chọn dùng chung: đạt");
process.exit(bad ? 1 : 0);
