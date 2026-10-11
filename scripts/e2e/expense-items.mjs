#!/usr/bin/env node
// Kiểm tra giao diện PHIẾU CHI CHI TIẾT TỪNG MÓN bằng trình duyệt thật (Edge/Chrome qua playwright-core). Chạy trên DB local (đã áp db/app/1040).
//   A. Form lập phiếu: bấm "Chi nhiều món?" → nhập 3 món bằng bàn phím (Enter chuyển ô, Enter ở ô đơn giá của dòng cuối thêm dòng) → tổng tự cộng,
//      ô số tiền chỉ đọc; "Bỏ chi tiết" giữ lại tổng; lưu nháp → danh sách hiện "3 món"
//   B. Chi tiết phiếu: bảng món + tổng (máy tính và 390px, không tràn ngang)
//   C. Phiếu đã chi có món → "Tải Báo Cáo PDF" mở báo cáo, bản xem trước liệt kê món, nút "Excel chi tiết" tải về được file .xlsx
//   node scripts/e2e/expense-items.mjs [--base http://localhost:3000] [--user bao.pham@luuxa.local] [--approver viet.vu@luuxa.local]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "bao.pham@luuxa.local");
const APPROVER = get("--approver", "viet.vu@luuxa.local");
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}
mkdirSync(".local/e2e/expense-items", { recursive: true });

let bad = 0;
const check = (cond, msg) => {
  console.log(cond ? "  ✓" : "  ✗", msg);
  if (!cond) bad++;
};
const suffix = Date.now().toString(36);

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
/** Gọi API trong ngữ cảnh trang (cookie + CSRF của người đang đăng nhập) */
const api = (page, method, path, body) =>
  page.evaluate(
    async ([m, p, b]) => {
      const csrf = (document.cookie.match(/(?:__Host-)?luuxa_csrf=([^;]+)/) ?? [])[1] ?? "";
      const r = await fetch(p, { method: m, headers: { "content-type": "application/json", "x-csrf-token": csrf, accept: "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      const t = await r.text();
      let j = null;
      try { j = JSON.parse(t); } catch { j = t; }
      return { status: r.status, json: j };
    },
    [method, path, body]
  );
const openForm = async (page) => {
  await page.goto(`${BASE}/thu-chi`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Lập phiếu chi|Đề xuất chi/.test(b.innerText)), null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Lập phiếu chi|Đề xuất chi/ }).first().click();
  await page.waitForSelector("[data-sheet-card]", { timeout: 15_000 });
  await page.waitForTimeout(500);
};
const fillRow = async (page, key, vals) => {
  const f = (field) => page.locator(`[data-item="${key}"][data-field="${field}"]`);
  await f("name").fill(vals.name);
  await f("quantity").fill(vals.qty);
  await f("unit").fill(vals.unit);
  await f("price").fill(vals.price);
};

try {
  // ================================================================= A
  console.log("\nA. Form lập phiếu: nhập từng món");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, locale: "vi-VN", acceptDownloads: true });
  const page = await login(ctx, USER);
  await openForm(page);
  const card = page.locator("[data-sheet-card]");
  await card.getByPlaceholder(/Ví dụ: Thịt cá chợ sáng/).fill(`Đi chợ thử ${suffix}`);
  check(await card.getByText("Chi nhiều món? Nhập chi tiết từng món").isVisible(), "hiện nút “Chi nhiều món?” khi chưa có món");
  await card.getByText("Chi nhiều món? Nhập chi tiết từng món").click();
  await page.waitForSelector("[data-field='name']");
  check((await page.locator("[data-field='name']").count()) === 1, "bấm vào ⇒ có 1 dòng món, ô tên được focus");
  check(await page.evaluate(() => document.activeElement?.getAttribute("data-field") === "name"), "ô tên món đang được focus");

  // dòng 1 bằng bàn phím: tên → Enter → số lượng → Enter → đơn vị → Enter → đơn giá → Enter ⇒ dòng 2
  await page.keyboard.type("Thịt heo");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await page.keyboard.type("kg");
  await page.keyboard.press("Enter");
  await page.keyboard.type("120000");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("[data-field='name']").length === 2);
  check(true, "Enter ở ô đơn giá của dòng cuối ⇒ thêm dòng mới và nhảy vào ô tên");
  check(await page.getByText("Chi tiết các món").first().isVisible(), "hiện tiêu đề “Chi tiết các món”");
  check(!(await page.getByText("Nhập số tiền hoặc thêm").count()), "không hiện lỗi nào");

  const keys = await page.locator("[data-field='name']").evaluateAll((els) => els.map((e) => e.getAttribute("data-item")));
  await fillRow(page, keys[1], { name: "Rau muống", qty: "1,5", unit: "kg", price: "15000" });
  await page.getByRole("button", { name: "Thêm món" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-field='name']").length === 3);
  const keys3 = await page.locator("[data-field='name']").evaluateAll((els) => els.map((e) => e.getAttribute("data-item")));
  await fillRow(page, keys3[2], { name: "Hành lá", qty: "3", unit: "bó", price: "5000" });

  const total = await page.locator("input[readonly]").first().inputValue();
  check(total.replace(/\D/g, "") === "277500", `tổng tự cộng = 277.500 (ô hiển thị “${total}”)`);
  check((await page.locator("input[readonly]").count()) === 1, "ô số tiền chuyển sang chỉ đọc khi có món");
  check(await card.getByText("Tổng 3 món").isVisible(), "chân bảng ghi “Tổng 3 món”");
  const rowAmounts = await card.locator(".tabular-nums").allInnerTexts();
  check(rowAmounts.some((t) => t.replace(/\D/g, "") === "22500"), "thành tiền 1,5 × 15.000 = 22.500 (số lượng gõ dấu phẩy)");
  await page.screenshot({ path: ".local/e2e/expense-items/form-desktop.png" });

  // Bỏ chi tiết ⇒ giữ tổng
  await card.getByRole("button", { name: /Bỏ chi tiết/ }).click();
  await page.waitForTimeout(300);
  const kept = await card.locator("input[inputmode='numeric']").first().inputValue();
  check(kept.replace(/\D/g, "") === "277500", `Bỏ chi tiết ⇒ số tiền một khoản giữ lại tổng đã cộng (“${kept}”)`);
  check((await page.locator("[data-field='name']").count()) === 0, "bảng món biến mất");
  // bật lại và nhập lại 3 món
  await card.getByText("Chi nhiều món? Nhập chi tiết từng món").click();
  await page.waitForSelector("[data-field='name']");
  const k1 = await page.locator("[data-field='name']").first().getAttribute("data-item");
  await fillRow(page, k1, { name: "Thịt heo", qty: "2", unit: "kg", price: "120000" });
  await page.getByRole("button", { name: "Thêm món" }).click();
  const k2 = (await page.locator("[data-field='name']").evaluateAll((els) => els.map((e) => e.getAttribute("data-item"))))[1];
  await fillRow(page, k2, { name: "Rau muống", qty: "1,5", unit: "kg", price: "15000" });
  await page.getByRole("button", { name: "Thêm món" }).click();
  const k3 = (await page.locator("[data-field='name']").evaluateAll((els) => els.map((e) => e.getAttribute("data-item"))))[2];
  await fillRow(page, k3, { name: "Hành lá", qty: "3", unit: "bó", price: "5000" });
  // Món sai ⇒ báo lỗi rõ
  await page.getByRole("button", { name: "Thêm món" }).click();
  const k4 = (await page.locator("[data-field='name']").evaluateAll((els) => els.map((e) => e.getAttribute("data-item"))))[3];
  await page.locator(`[data-item="${k4}"][data-field="name"]`).fill("Món thiếu giá");
  await card.getByRole("button", { name: "Lưu nháp" }).click();
  await page.waitForTimeout(1200); // > 0,6 giây: ModalGuard bỏ lần bấm Lưu thứ hai nếu quá sát
  check(await card.getByText(/Món 4 \(Món thiếu giá\): nhập đơn giá/).isVisible(), "món thiếu đơn giá ⇒ thông báo nêu đúng món");
  await page.getByRole("button", { name: "Xóa món 4" }).click();
  await card.getByRole("button", { name: "Lưu nháp" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-sheet-card]"), null, { timeout: 30_000 }).catch(async () => {
    console.log("    (hộp thoại vẫn mở) nội dung:", (await page.locator("[data-sheet-card]").last().innerText()).replace(/s+/g, " ").slice(-400));
    await page.screenshot({ path: ".local/e2e/expense-items/save-stuck.png" });
  });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Danh sách chi tiêu/ }).first().click(); // tab có bảng đầy đủ
  check(await page.locator(':text("3 món"):visible').first().waitFor({ timeout: 20_000 }).then(() => true, () => false), "lưu nháp xong ⇒ danh sách phiếu hiện “3 món”");

  // ================================================================= B
  console.log("\nB. Chi tiết phiếu");
  await page.locator(`:text("Đi chợ thử ${suffix}"):visible`).first().click(); // bỏ qua bản thẻ điện thoại đang ẩn
  await page.getByText("Chi tiết các món (3)").waitFor({ timeout: 15_000 });
  check(true, "hộp thoại chi tiết có khối “Chi tiết các món (3)”");
  const dlg = page.locator("[data-sheet-card]").last();
  check((await dlg.innerText()).includes("Thịt heo") && (await dlg.innerText()).includes("240.000"), "hiện món + thành tiền 240.000");
  check((await dlg.innerText()).includes("Tổng cộng 3 món"), "có dòng tổng cộng");
  await page.screenshot({ path: ".local/e2e/expense-items/detail-desktop.png" });
  await page.keyboard.press("Escape");
  await ctx.close();

  // điện thoại
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "vi-VN" });
  const mp = await login(mctx, USER);
  await openForm(mp);
  await mp.locator("[data-sheet-card]").getByText("Chi nhiều món? Nhập chi tiết từng món").click();
  await mp.waitForSelector("[data-field='name']");
  const mk = await mp.locator("[data-field='name']").first().getAttribute("data-item");
  await fillRow(mp, mk, { name: "Thịt heo ba chỉ", qty: "2,5", unit: "kg", price: "120000" });
  await mp.getByRole("button", { name: "Thêm món" }).click();
  const mk2 = (await mp.locator("[data-field='name']").evaluateAll((els) => els.map((e) => e.getAttribute("data-item"))))[1];
  await fillRow(mp, mk2, { name: "Rau muống", qty: "1", unit: "bó", price: "15000" });
  await mp.waitForTimeout(300);
  const ov = await mp.evaluate(() => {
    const c = document.querySelector("[data-sheet-card]");
    return { sw: c.scrollWidth - c.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check(ov.sw <= 1 && ov.page <= 1, `form trên điện thoại không tràn ngang (thẻ ${ov.sw}px, trang ${ov.page}px)`);
  const labels = await mp.locator("[data-sheet-card]").innerText();
  check(["Số lượng", "Đơn vị", "Đơn giá (đ)", "Thành tiền"].every((l) => labels.includes(l)), "mỗi ô có nhãn riêng ở màn hình hẹp");
  await mp.screenshot({ path: ".local/e2e/expense-items/form-mobile.png" });
  await mctx.close();

  // ================================================================= C
  console.log("\nC. Báo cáo: xem trước + Excel chi tiết");
  const actx = await browser.newContext({ viewport: { width: 1280, height: 950 }, locale: "vi-VN" });
  const ap = await login(actx, APPROVER);
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, locale: "vi-VN", acceptDownloads: true });
  const tp = await login(tctx, USER);
  await tp.goto(`${BASE}/thu-chi`, { waitUntil: "load", timeout: 90_000 });
  const options = (await api(tp, "GET", "/api/v1/finance/options")).json;
  const cat = options.categories[0];
  const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const created = await api(tp, "POST", "/api/v1/finance/expenses", {
    title: `Chợ sáng báo cáo ${suffix}`,
    categoryId: cat.id,
    expenseDate: options.today,
    fundId: cash.id,
    noReceiptReason: "Mua ở chợ, không có hóa đơn (kiểm thử)",
    submit: true,
    items: [
      // số tiền nhỏ: kiểm thử chạy lại nhiều lần không làm cạn quỹ (BR-FIN-07)
      { name: "Hành lá", quantity: 1.5, unit: "bó", unitPriceVnd: 2000 },
      { name: "Đậu hũ", quantity: 3, unit: "miếng", unitPriceVnd: 1500 },
    ],
  });
  check(created.status === 201 && created.json.amountVnd === 7500, `tạo phiếu có món qua API: ${created.status} tổng ${created.json?.amountVnd}`);
  const dec = await api(ap, "POST", `/api/v1/finance/expenses/${created.json.id}/decision`, { decision: "approved", comment: "Duyệt thử" });
  check(dec.status === 200, `duyệt phiếu: ${dec.status}`);
  const pay = await api(tp, "POST", `/api/v1/finance/expenses/${created.json.id}/pay`, { method: "cash", paidOn: options.today });
  check(pay.status === 200, `ghi chi: ${pay.status} ${pay.status === 200 ? "" : JSON.stringify(pay.json).slice(0, 300)}`);

  await tp.reload({ waitUntil: "load" });
  // chờ danh sách phiếu chi của kỳ tải xong (báo cáo dựng từ danh sách này)
  await tp.getByText(`Chợ sáng báo cáo ${suffix}`).first().waitFor({ timeout: 30_000 });
  await tp.getByRole("button", { name: /Tải Báo Cáo PDF/ }).first().click();
  await tp.getByText("BẢNG KÊ CHI TIẾT CÁC KHOẢN ĐÃ CHI TRONG KỲ").waitFor({ timeout: 20_000 });
  const preview = await tp.locator(".printable-area").innerText();
  check(preview.includes(`Chợ sáng báo cáo ${suffix}`) && preview.includes("Hành lá — 1,5 bó × 2.000"), "bản xem trước liệt kê từng món dưới phiếu");
  check(preview.includes("Đậu hũ — 3 miếng × 1.500"), "số lượng lẻ hiện dấu phẩy kiểu Việt");
  await tp.screenshot({ path: ".local/e2e/expense-items/report-preview.png" });
  const [dl] = await Promise.all([tp.waitForEvent("download", { timeout: 30_000 }), tp.getByRole("button", { name: /Excel chi tiết/ }).click()]);
  const file = `.local/e2e/expense-items/${dl.suggestedFilename()}`;
  await dl.saveAs(file);
  check(/^Bang_ke_chi_tiet_.*\.xlsx$/.test(dl.suggestedFilename()), `tải về ${dl.suggestedFilename()}`);
  check(statSync(file).size > 3000, `file Excel có nội dung (${statSync(file).size} byte)`);
  await actx.close();
  await tctx.close();
} catch (e) {
  console.error("LỖI:", e);
  bad++;
} finally {
  await browser.close();
}
console.log(bad ? `\n✗ ${bad} lỗi` : "\n✓ Phiếu chi chi tiết từng món (giao diện): đạt");
process.exit(bad ? 1 : 0);
