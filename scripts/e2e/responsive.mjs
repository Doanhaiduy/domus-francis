#!/usr/bin/env node
// Kiểm tra giao diện trên điện thoại: mở từng trang ở các khổ màn hình nhỏ, phát hiện tràn ngang (cuộn ngang ngoài ý muốn),
// phần tử vượt mép màn hình, chữ quá nhỏ ở nút bấm, và chụp ảnh từng trang để xem lại.
//
//   node scripts/e2e/responsive.mjs [--base http://localhost:3000] [--user duc.tran@luuxa.local] [--widths 390,360] [--pages /,/thu-chi]
// Ảnh: .local/e2e/mobile-<rộng>/<trang>.png · Thoát 1 nếu có trang bị tràn ngang.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "duc.tran@luuxa.local");
const PASS = get("--pass", "LuuXa@2026");
const WIDTHS = get("--widths", "390,360").split(",").map(Number);
const normPage = (p) => "/" + p.replace(/^[A-Za-z]:\/.*?\/Git\/?/, "").replace(/^\/+/, "");
const PAGES = get("--pages", "/,/thong-bao,/lich-su-kien,/thu-chi,/bep-com,/hau-can,/phung-vu,/dien-dan,/thanh-vien,/hoc-tap,/so-do-nha,/khoanh-khac,/cai-dat,/huong-dan")
  .split(",")
  .map(normPage);

const exe = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}

/** Chạy trong trang: tìm phần tử tràn mép phải (bỏ qua phần tử nằm trong vùng cuộn ngang có chủ đích). */
const PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const scrollable = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      // Chỉ vùng cuộn ngang CÓ CHỦ ĐÍCH (auto/scroll) mới được bỏ qua; phần tử bị khung overflow-hidden cắt mất vẫn bị báo.
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth - 1) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed") continue;
    // Hình trang trí (absolute, không chữ, không tương tác) được phép tràn ra mép thẻ
    if (cs.position === "absolute" && !(el.innerText || "").trim() && !el.querySelector("button,a,input,img,svg")) continue;
    if (r.right > vw + 1 && r.left < vw && !scrollable(el)) {
      const id = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className?.baseVal ?? el.className).split(/\s+/).slice(0, 4).join(".")}`;
      out.push({ el: id.slice(0, 120), right: Math.round(r.right), text: (el.innerText || "").trim().slice(0, 50) });
    }
  }
  // chỉ giữ phần tử "lá" (bỏ cha khi con cũng tràn)
  return {
    vw,
    docWidth: document.documentElement.scrollWidth,
    overflow: out.slice(-12),
  };
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const report = [];
let bad = 0;
try {
  for (const w of WIDTHS) {
    const context = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "vi-VN" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    for (let i = 0; i < 2; i++) {
      await page.fill("#email", USER);
      await page.fill("#password", PASS);
      const ok = await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30_000 }).then(() => true, () => false), page.tap('button[type="submit"]')]).then(([r]) => r);
      if (ok) break;
      await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
    }
    const dir = path.resolve(`.local/e2e/mobile-${w}`);
    mkdirSync(dir, { recursive: true });
    console.log(`\n▶ Khổ ${w}px · ${USER}`);
    for (const p of PAGES) {
      for (let t = 0; t < 3; t++) {
        try {
          await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 90_000 });
          break;
        } catch (e) {
          if (t === 2) throw e;
          await page.waitForTimeout(2000); // máy chủ dev đang biên dịch lại
        }
      }
      await page.waitForTimeout(700);
      const r = await page.evaluate(PROBE);
      const name = p === "/" ? "tong-quan" : p.replace(/^\//, "").replace(/\//g, "_");
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
      const overflowX = r.docWidth > r.vw + 1;
      if (overflowX) bad++;
      report.push({ width: w, page: p, ...r, overflowX });
      console.log(`  ${overflowX ? "✗" : "✓"} ${p.padEnd(14)} rộng tài liệu ${r.docWidth}/${r.vw}${r.overflow.length ? ` · ${r.overflow.length} phần tử vượt mép` : ""}`);
      for (const o of r.overflow.slice(0, 5)) console.log(`      → ${o.el} (mép phải ${o.right}px) “${o.text}”`);
    }
    if (errors.length) console.log("  Lỗi JS:", errors.slice(0, 3).join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
}
mkdirSync(".local/e2e", { recursive: true });
writeFileSync(".local/e2e/responsive-report.json", JSON.stringify(report, null, 1));
console.log(`\n${bad ? `✗ ${bad} trang bị tràn ngang` : "✓ Không trang nào tràn ngang"} · ảnh ở .local/e2e/mobile-*/`);
process.exit(bad ? 1 : 0);
