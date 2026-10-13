#!/usr/bin/env node
// Kiểm thử GIAO DIỆN trợ lý viết bài (ảnh bìa AI, phỏng vấn, tra cứu, viết nháp, thẻ "cần kiểm lại", minh họa, chú thích) bằng Edge/Chrome có sẵn.
// KHÔNG có lưu lượng ra ngoài: dùng máy chủ giả của scripts/test-api/article-ai.mjs (cổng 3199) + máy chủ thử `node scripts/test-api.mjs --serve` (cổng 3100,
// DB luuxa_test, khóa AI giả). Bật AI trực tiếp trong DB thử. Ảnh: .local/e2e/article-ai/<rộng>/ · thoát 1 nếu có lỗi console/trang/HTTP ≥ 500.
//
//   node scripts/test-api.mjs --serve        # cửa sổ khác, giữ chạy
//   node scripts/e2e/article-ai-ui.mjs [--base http://localhost:3100] [--widths 1440,390] [--headed]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { pgConfig } from "../db/env.mjs";
import { startMock } from "../test-api/article-ai.mjs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3100");
const WIDTHS = get("--widths", "1440,390").split(",").map(Number);
const HEADED = args.includes("--headed");
const DB = get("--db", "luuxa_test");
const USER = "duc.tran@luuxa.local";
const PASS = "LuuXa@2026";

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

const sql = async (text, params) => {
  const db = new pg.Client(pgConfig({ database: DB }));
  await db.connect();
  try {
    return await db.query(text, params);
  } finally {
    await db.end();
  }
};

const { state: mock, server } = await startMock();
const problems = [];
const step = (m) => console.log(`  • ${m}`);
let failed = false;
let lastPage = null;

try {
  // AI bật sẵn + dọn bộ đếm của các lượt chạy trước
  await sql("UPDATE settings SET value = 'true'::jsonb WHERE key = 'feature.ai.enabled'");
  await sql("UPDATE ai_task_types SET is_enabled = true WHERE code IN ('content.article_assist','content.article_research','content.article_image','content.image_caption')");
  await sql("UPDATE ai_jobs SET created_at = created_at - interval '2 days' WHERE task_code LIKE 'content.%'");
  await sql("DELETE FROM ai_provider_state");
  await sql("UPDATE ai_budgets SET used_vnd = 0");

  const browser = await chromium.launch({ executablePath, headless: !HEADED });
  for (const width of WIDTHS) {
    const mobile = width < 640;
    console.log(`\n▶ Rộng ${width}px`);
    // Lượt trước có thể để lại trạng thái "Cloudflare hết hạn mức" (bước cuối) và các ảnh đã tính vào trần ngày ⇒ dọn trước mỗi lượt
    await sql("DELETE FROM ai_provider_state");
    await sql("UPDATE ai_jobs SET created_at = created_at - interval '2 days' WHERE task_code LIKE 'content.%' AND created_at > now() - interval '1 day'");
    const outDir = path.resolve(".local/e2e/article-ai", String(width));
    mkdirSync(outDir, { recursive: true });
    const shot = async (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: "vi-VN", hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    lastPage = page;
    let current = "đăng nhập";
    page.on("console", (m) => {
      // "Extra attributes from the server: style" = Edge/trình quản lý mật khẩu tự chèn thuộc tính vào ô nhập trước khi React nạp, không phải lỗi của ứng dụng
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource") && !m.text().includes("Extra attributes from the server")) problems.push(`[${width}/${current}] console: ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => problems.push(`[${width}/${current}] pageerror: ${e.message.slice(0, 300)}`));
    page.on("response", (r) => {
      if (r.status() >= 500) problems.push(`[${width}/${current}] HTTP ${r.status()} ${r.url()}`);
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!["localhost", "127.0.0.1"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol)) problems.push(`[${width}/${current}] REQUEST RA NGOÀI: ${r.url()}`);
    });

    await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
    await page.fill("#email", USER);
    await page.fill("#password", PASS);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30000 }), page.click('button[type="submit"]')]);
    // Hộp thoại đồng ý điều khoản (nếu có) che giao diện
    await page.getByRole("button", { name: /Tôi đã đọc và đồng ý/i }).click({ timeout: 3000 }).catch(() => {});

    current = "mở trình soạn";
    mock.calls.length = 0;
    mock.groq = mock.gemini = mock.cftext = mock.cf = "ok";
    mock.search = "ok";
    await page.goto(`${BASE}/bai-viet/moi`, { waitUntil: "domcontentloaded" });
    const title = page.locator('input[placeholder^="VD: Lưu xá Phanxicô"]');
    await title.waitFor({ timeout: 90000 });
    // chờ trạng thái AI tải xong (nút "Tạo bằng AI" hết mờ) — trước đó thẻ Trợ lý AI báo "chưa dùng được"
    await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("Tạo bằng AI")); return !!b && !b.disabled; }, null, { timeout: 60000 });
    await title.fill(`Tối thứ Sáu lần chuỗi ở sân nhà ${Date.now().toString(36)}`);
    await shot(page, "01-trinh-soan");
    step("mở trình soạn");

    // ---- Ảnh bìa bằng AI
    current = "ảnh bìa AI";
    await page.getByRole("button", { name: /Tạo bằng AI/ }).click();
    await page.getByRole("dialog", { name: /Tạo ảnh bìa bằng AI/ }).waitFor({ timeout: 10000 });
    await shot(page, "02-anh-bia-form");
    await page.getByRole("button", { name: /Tạo 2 ảnh/ }).click();
    await page.getByRole("dialog", { name: /Chọn một ảnh/ }).waitFor({ timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].length >= 2 && [...document.querySelectorAll('[role="dialog"] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
    await shot(page, "03-anh-bia-ket-qua");
    await page.getByRole("button", { name: /Dùng ảnh này/ }).click();
    await page.getByText("Ảnh bìa do AI tạo").first().waitFor({ timeout: 10000 });
    await shot(page, "04-anh-bia-da-chon");
    step("tạo + chọn ảnh bìa AI");

    // ---- Viết nháp: phỏng vấn + tra cứu + thẻ cần kiểm lại
    current = "viết nháp";
    // Có hai thẻ Trợ lý AI (điện thoại / máy tính, một cái luôn ẩn) ⇒ chỉ lấy nút đang hiển thị
    await page.locator("button:visible", { hasText: "Viết nháp từ chủ đề" }).first().click();
    const dlg = page.getByRole("dialog", { name: /Nhờ AI viết nháp bài/ });
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator("textarea").first().fill("Buổi lần chuỗi tối thứ Sáu của anh em trong nhà");
    await dlg.getByRole("button", { name: /AI hỏi tôi vài câu/ }).click();
    await dlg.getByText("Buổi lần chuỗi diễn ra khi nào và ở đâu?").waitFor({ timeout: 30000 });
    await dlg.locator("textarea").nth(2).fill("Tối thứ Sáu 9/10 ở sân nhà, khoảng 20 anh em");
    await dlg.getByRole("button", { name: /Tra cứu thêm thông tin/ }).click();
    await dlg.getByText("Tư liệu tìm được").waitFor({ timeout: 30000 });
    await shot(page, "05-phong-van-tra-cuu");
    await dlg.getByRole("button", { name: /^Viết nháp$/ }).click();
    await page.getByRole("dialog", { name: /Bản nháp do AI viết/ }).waitFor({ timeout: 60000 });
    await page.getByText("Cần bạn kiểm lại trước khi đăng").waitFor({ timeout: 10000 });
    await shot(page, "06-ban-nhap-co-the-kiem-lai");
    await page.getByRole("button", { name: /Dùng bản này/ }).click();
    await page.getByText("AI cần bạn kiểm lại").first().waitFor({ timeout: 10000 });
    await shot(page, "07-the-can-kiem-lai");
    step("phỏng vấn, tra cứu, bản nháp, thẻ cần kiểm lại");

    // Bấm một thẻ ⇒ chọn đúng đoạn trong khung soạn
    const chip = page.locator("aside button", { hasText: "0912 345 678" }).first();
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(400); // vùng chọn được đặt sau một khung hình (requestAnimationFrame)
      const sel = await page.evaluate(() => {
        const ta = document.querySelector("textarea[aria-label='Nội dung bài viết']");
        return ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "";
      });
      if (!sel.includes("0912")) problems.push(`[${width}/thẻ kiểm lại] bấm thẻ không chọn đúng đoạn (đang chọn "${sel}")`);
    } else problems.push(`[${width}/thẻ kiểm lại] không thấy thẻ SĐT`);

    // ---- Minh họa cho đoạn + chú thích
    current = "minh họa";
    await page.locator("textarea[aria-label='Nội dung bài viết']").click();
    await page.locator('button[title^="AI vẽ ảnh minh họa"]').click();
    const idlg = page.getByRole("dialog", { name: /Tạo ảnh minh họa bằng AI/ });
    await idlg.waitFor({ timeout: 10000 });
    await shot(page, "08-minh-hoa-form");
    await idlg.getByRole("button", { name: /Tạo 2 ảnh/ }).click();
    await page.getByRole("dialog", { name: /Chọn một ảnh/ }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: /Dùng ảnh này/ }).click();
    await page.waitForFunction(() => /\(AI\)/.test(document.querySelector("textarea[aria-label='Nội dung bài viết']")?.value ?? ""), null, { timeout: 10000 });
    current = "chú thích";
    await page.locator('button[title^="AI gợi ý chú thích"]').click();
    await page.waitForFunction(() => /Sân trong có đài phun nước/.test(document.querySelector("textarea[aria-label='Nội dung bài viết']")?.value ?? ""), null, { timeout: 30000 });
    await shot(page, "09-da-chen-anh-va-chu-thich");
    step("minh họa đoạn + chú thích ảnh");

    // ---- Xem trước: nhãn "do AI tạo" ở ảnh trong bài
    if (mobile) await page.locator("button", { hasText: "Xem trước" }).first().click(); // <img role=button alt="Xem trước"> (ảnh bìa) không phải thẻ button nên không bị lẫn
    await page.getByText(/Ảnh minh họa do AI tạo/).first().waitFor({ timeout: 10000 }).catch(() => problems.push(`[${width}/xem trước] thiếu nhãn "Ảnh minh họa do AI tạo"`));
    await shot(page, "10-xem-truoc");

    // ---- Mô hình AI tạm thời hết hạn mức: thông báo thân thiện, không vỡ giao diện
    current = "hết hạn mức";
    mock.cf = "quota";
    await sql("DELETE FROM ai_provider_state");
    await page.getByRole("button", { name: /Tạo bằng AI/ }).click();
    await page.getByRole("dialog", { name: /Tạo ảnh bìa bằng AI/ }).getByRole("button", { name: /Tạo 2 ảnh/ }).click();
    await page.getByText(/07:00 sáng mai/).first().waitFor({ timeout: 30000 }).catch(() => problems.push(`[${width}/hết hạn mức] không thấy thông báo hết lượt`));
    await shot(page, "11-het-han-muc");
    step("hết hạn mức ⇒ thông báo");
    await context.close();
  }
  await browser.close();
} catch (e) {
  failed = true;
  console.error("\n✗ Lỗi kịch bản:", e.message);
  if (lastPage) {
    mkdirSync(path.resolve(".local/e2e/article-ai"), { recursive: true });
    await lastPage.screenshot({ path: path.resolve(".local/e2e/article-ai/99-loi.png") }).catch(() => {});
    console.error("Văn bản trên trang:", (await lastPage.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 700));
  }
} finally {
  await sql("UPDATE settings SET value = 'false'::jsonb WHERE key = 'feature.ai.enabled'").catch(() => {});
  await sql("UPDATE ai_task_types SET is_enabled = false WHERE code IN ('content.article_assist','content.article_research','content.article_image','content.image_caption')").catch(() => {});
  await sql("DELETE FROM ai_provider_state").catch(() => {});
  await new Promise((r) => server.close(r));
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} vấn đề:`);
  for (const p of [...new Set(problems)]) console.log("  - " + p);
}
process.exit(failed || problems.length ? 1 : 0);
