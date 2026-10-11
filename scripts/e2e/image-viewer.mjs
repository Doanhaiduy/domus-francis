#!/usr/bin/env node
// Kiểm tra TRÌNH XEM ẢNH DÙNG CHUNG + DÁN ẢNH VÀO TRÌNH SOẠN BÀI bằng trình duyệt thật (Edge/Chrome qua playwright-core). Chạy trên DB local/staging
// (tải 2 ảnh thử lên bucket "attachments" qua Ctrl+V và kéo thả).
//   A. soạn bài: Ctrl+V ảnh ⇒ tải lên + chèn Markdown tại con trỏ; ảnh kèm chữ ⇒ để trình duyệt dán chữ; kéo thả ảnh ⇒ chèn thêm
//   B. bấm ảnh trong khung xem trước ⇒ mở trình xem; lăn chuột phóng to, bấm đúp, xoay, thu về 100%, Esc đóng
//   C. trình xem mở TRÊN hộp thoại: Esc chỉ đóng trình xem (hộp thoại nhập dở vẫn còn, không hiện hộp hỏi); ← → lướt ảnh
//   D. điện thoại (390px): chụm hai ngón phóng to, vuốt xuống để đóng
//   node scripts/e2e/image-viewer.mjs [--base http://localhost:3000] [--user duc.tran@luuxa.local]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "duc.tran@luuxa.local");
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}
mkdirSync(".local/e2e/image-viewer", { recursive: true });

let bad = 0;
const check = (cond, msg) => {
  console.log(cond ? "  ✓" : "  ✗", msg);
  if (!cond) bad++;
};

const png = async (w, h, rgb) => (await sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer()).toString("base64");
const B64_A = await png(900, 600, { r: 95, g: 58, b: 221 });
const B64_B = await png(600, 900, { r: 16, g: 185, b: 129 });
const dataUrl = (b64) => `data:image/png;base64,${b64}`;

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
const viewerOpen = (page) => page.evaluate(() => !!document.querySelector("[data-image-viewer]"));
const percent = (page) =>
  page.evaluate(() => {
    const t = [...document.querySelectorAll("[data-image-viewer] p")].map((p) => p.textContent || "").join(" ");
    const m = /(\d+)%/.exec(t);
    return m ? Number(m[1]) : null;
  });
const openViewerEvent = (page, images, index = 0) => page.evaluate(([imgs, i]) => window.dispatchEvent(new CustomEvent("luuxa:image-viewer", { detail: { images: imgs, index: i } })), [images, index]);

try {
  // ================================================================= A + B
  console.log("\nA. Dán / kéo thả ảnh vào trình soạn bài");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
  const page = await login(ctx);
  await page.goto(`${BASE}/bai-viet/moi`, { waitUntil: "load", timeout: 90_000 });
  const ta = page.locator('textarea[aria-label="Nội dung bài viết"]');
  await ta.waitFor({ timeout: 60_000 });
  await ta.fill("Mở đầu bài viết.");
  await ta.focus();

  const pasteImage = (b64, withText) =>
    page.evaluate(
      ([b, text]) => {
        const bin = atob(b);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const file = new File([bytes], "image.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        if (text) dt.setData("text/plain", text);
        const el = document.querySelector('textarea[aria-label="Nội dung bài viết"]');
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      },
      [b64, withText ?? ""]
    );

  const prevented = await pasteImage(B64_A);
  check(prevented, "Ctrl+V có ảnh, không có chữ ⇒ chặn dán mặc định và tự xử lý");
  await page.waitForFunction(() => /!\[Chú thích ảnh\]\(\/api\/v1\/public\/files\/[0-9a-f-]{36}\)/.test(document.querySelector('textarea[aria-label="Nội dung bài viết"]').value), null, { timeout: 60_000 });
  const v1 = await ta.inputValue();
  check(v1.startsWith("Mở đầu bài viết."), "nội dung gõ trước đó còn nguyên");
  check((v1.match(/!\[Chú thích ảnh\]/g) ?? []).length === 1, "đã chèn đúng 1 dòng ảnh Markdown");

  const preventedText = await pasteImage(B64_B, "đoạn chữ sao chép từ Word");
  check(!preventedText, "ảnh kèm chữ (Word/Excel) ⇒ để trình duyệt dán chữ, không tải ảnh");
  await page.waitForTimeout(600);
  check((await ta.inputValue()) === v1, "nội dung không đổi khi ảnh đi kèm chữ");

  // kéo thả
  await page.evaluate((b) => {
    const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "keo-tha.png", { type: "image/png" }));
    const el = document.querySelector('textarea[aria-label="Nội dung bài viết"]');
    el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, B64_B);
  await page.waitForFunction(() => (document.querySelector('textarea[aria-label="Nội dung bài viết"]').value.match(/!\[Chú thích ảnh\]/g) ?? []).length === 2, null, { timeout: 60_000 });
  check(true, "kéo thả ảnh ⇒ chèn thêm dòng ảnh thứ hai");

  // ================================================================= B
  console.log("\nB. Bấm ảnh trong khung xem trước ⇒ trình xem ảnh");
  const preview = page.locator('[aria-label="Xem trước"] img').first();
  await preview.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => { const i = document.querySelector('[aria-label="Xem trước"] img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30_000 });
  await preview.click();
  await page.waitForSelector("[data-image-viewer]", { timeout: 5000 });
  check(true, "bấm ảnh mở trình xem ảnh toàn màn hình");
  check((await percent(page)) === 100, "mở ở mức 100%");
  const box = await page.locator("[data-viewer-stage]").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(250);
  const z1 = await percent(page);
  check(z1 > 100, `lăn chuột lên ⇒ phóng to (${z1}%)`);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  check((await percent(page)) === 100, "bấm đúp khi đang phóng ⇒ về 100%");
  await page.getByRole("button", { name: "Xoay ảnh" }).click();
  const rot = await page.evaluate(() => document.querySelector("[data-image-viewer] img").style.transform);
  check(/rotate\(90deg\)/.test(rot), "nút Xoay ⇒ xoay 90°");
  await page.getByRole("button", { name: "Phóng to" }).click();
  check((await percent(page)) > 100, "nút Phóng to tăng mức zoom");
  const dl = await page.locator("[data-image-viewer] a[download]").getAttribute("href");
  check(/\/api\/v1\/files\/[0-9a-f-]{36}\?download=1/.test(dl ?? ""), "nút Tải về trỏ tới ?download=1 của tệp");
  await page.screenshot({ path: ".local/e2e/image-viewer/desktop-viewer.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check(!(await viewerOpen(page)), "Esc đóng trình xem");
  check(await page.evaluate(() => document.body.style.overflow !== "hidden"), "đóng xong trả lại cuộn trang");

  // ================================================================= C
  console.log("\nC. Trình xem mở trên hộp thoại");
  await page.goto(`${BASE}/thu-chi`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Lập phiếu chi/.test(b.innerText)), null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Lập phiếu chi/ }).first().click();
  await page.waitForSelector("[data-sheet-card]", { timeout: 15_000 });
  await page.locator("[data-sheet-card] input").first().pressSequentially("Phiếu thử xem ảnh", { delay: 10 });
  await openViewerEvent(page, [{ src: dataUrl(B64_A), alt: "Ảnh A" }, { src: dataUrl(B64_B), alt: "Ảnh B", caption: "Chú thích ảnh B" }], 0);
  await page.waitForSelector("[data-image-viewer]");
  check(await page.evaluate(() => !document.querySelector("[data-image-viewer]").hasAttribute("data-sheet-overlay")), "trình xem không bị biến thành tờ trượt (data-no-sheet)");
  check((await page.locator("[data-image-viewer]").innerText()).includes("1/2"), "hiện thứ tự 1/2");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const t2 = await page.locator("[data-image-viewer]").innerText();
  check(t2.includes("2/2") && t2.includes("Chú thích ảnh B"), "← → lướt sang ảnh 2, hiện chú thích");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(!(await viewerOpen(page)), "Esc đóng trình xem");
  check(await page.evaluate(() => !!document.querySelector("[data-sheet-overlay]")), "hộp thoại phía sau vẫn mở");
  check(!(await page.getByText("Thoát mà chưa lưu?").isVisible().catch(() => false)), "Esc không kích hoạt hộp hỏi “Thoát mà chưa lưu?” của hộp thoại");
  check((await page.locator("[data-sheet-card] input").first().inputValue()) === "Phiếu thử xem ảnh", "nội dung nhập dở còn nguyên");
  await ctx.close();

  // ================================================================= D
  console.log("\nD. Điện thoại: chụm hai ngón + vuốt xuống");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "vi-VN" });
  const mp = await login(mctx);
  await mp.goto(`${BASE}/bai-viet/moi`, { waitUntil: "load", timeout: 90_000 });
  await mp.waitForTimeout(1200);
  await openViewerEvent(mp, [{ src: dataUrl(B64_A), alt: "Ảnh A" }], 0);
  await mp.waitForSelector("[data-image-viewer]");
  const cdp = await mctx.newCDPSession(mp);
  const sb = await mp.locator("[data-viewer-stage]").boundingBox();
  const cx = sb.x + sb.width / 2;
  const cy = sb.y + sb.height / 2;
  const pts = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(30) });
  for (let k = 1; k <= 10; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(30 + k * 12) });
    await mp.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await mp.waitForTimeout(300);
  const zm = await percent(mp);
  check(zm > 150, `chụm hai ngón dang ra ⇒ phóng to (${zm}%)`);
  await mp.screenshot({ path: ".local/e2e/image-viewer/mobile-zoomed.png" });
  const zoomOut = mp.getByRole("button", { name: "Thu nhỏ" });
  for (let k = 0; k < 12 && (await zoomOut.isEnabled()); k++) await zoomOut.click();
  check(await zoomOut.isDisabled(), "nút Thu nhỏ tự khóa khi về mức nhỏ nhất");
  await mp.waitForTimeout(200);
  check((await percent(mp)) === 100, "thu nhỏ về 100%");
  const y0 = cy - 120;
  const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: cx, y }] });
  await touch("touchStart", y0);
  for (let k = 1; k <= 8; k++) {
    await touch("touchMove", y0 + k * 30);
    await mp.waitForTimeout(16);
  }
  await touch("touchEnd", 0);
  await mp.waitForTimeout(400);
  check(!(await viewerOpen(mp)), "vuốt nhanh xuống (chưa phóng) ⇒ đóng trình xem");
  await mctx.close();
} catch (e) {
  console.error("LỖI:", e);
  bad++;
} finally {
  await browser.close();
}
console.log(bad ? `\n✗ ${bad} lỗi` : "\n✓ Trình xem ảnh + dán ảnh: đạt");
process.exit(bad ? 1 : 0);
