#!/usr/bin/env node
// Kiểm tra HỘP THOẠI trên điện thoại: ở mỗi trang bấm lần lượt các nút "mở hộp thoại" (Thêm / Tạo / Lập / Gửi / Báo / Sửa…), đo hộp thoại
// vừa mở có lọt màn hình không (chiều ngang, chiều cao, nút chân trang), có tràn ngang không, rồi chụp ảnh và đóng lại.
//
//   node scripts/e2e/mobile-modals.mjs [--base http://localhost:3000] [--user viet.vu@luuxa.local] [--width 390] [--height 780] [--pages /thu-chi,/xin-phep]
// Ảnh: .local/e2e/modals-<rộng>/<trang>__<nút>.png · Thoát 1 nếu có hộp thoại lỗi bố cục. CHỈ chạy trên DB local/staging (bấm nút nhưng KHÔNG gửi biểu mẫu).
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3000");
const USER = get("--user", "viet.vu@luuxa.local");
const PASS = get("--pass", "LuuXa@2026");
const W = Number(get("--width", "390"));
const H = Number(get("--height", "780"));
const normPage = (p) => "/" + p.replace(/^[A-Za-z]:\/.*?\/Git\/?/, "").replace(/^\/+/, "");
const PAGES = get("--pages", "/,/thu-chi,/xin-phep,/lich-su-kien,/khoanh-khac,/thanh-vien,/bep-com,/hau-can,/hoc-tap,/so-do-nha,/dien-dan,/ky-luat,/phung-vu,/bai-viet,/cai-dat,/gop-y")
  .split(",")
  .map(normPage);
const EXTRA = get("--include", "");
const BUTTON_RE = new RegExp("^\\s*(\\+|Thêm|Tạo|Lập|Gửi|Báo|Sửa|Check|Đăng|Ghi|Nhập|Soạn|Xin|Mới|Chỉnh)" + (EXTRA ? "|" + EXTRA : ""), "i");
const MAX_PER_PAGE = Number(get("--max", "8"));

const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) =>
  existsSync(p)
);
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}

/** Chạy trong trang: tìm hộp thoại đang mở (lớp phủ fixed inset-0 có nền mờ) và đo. */
const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const overlays = [...document.querySelectorAll(".fixed.inset-0")].filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > vw * 0.9 && r.height > vh * 0.9 && /backdrop|bg-black|bg-gray-900/.test(String(el.className));
  });
  if (!overlays.length) return null;
  const ov = overlays[overlays.length - 1];
  // panel = phần tử con "thẻ" lớn nhất (có nền, bo góc)
  const cands = [...ov.querySelectorAll("div,form,section")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 200 && r.height > 120 && /rounded/.test(String(el.className));
  });
  const panel = cands.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] ?? ov;
  const r = panel.getBoundingClientRect();
  const problems = [];
  // Tờ trượt: SheetEnhancer đã gắn data-sheet-*; thẻ áp sát đáy màn hình, bo tròn hai góc trên, vuông hai góc dưới, có thanh nắm (::before)
  const cardEl = ov.querySelector("[data-sheet-card]");
  const sheet = { marked: !!cardEl && ov.hasAttribute("data-sheet-overlay") };
  if (!sheet.marked) problems.push("KHÔNG phải tờ trượt (thiếu data-sheet-card) — SheetEnhancer không nhận ra thẻ");
  else {
    const cb = cardEl.getBoundingClientRect();
    const cs2 = getComputedStyle(cardEl);
    const before = getComputedStyle(cardEl, "::before");
    sheet.bottomGap = Math.round(vh - cb.bottom);
    sheet.radiusTop = parseFloat(cs2.borderTopLeftRadius);
    sheet.radiusBottom = parseFloat(cs2.borderBottomLeftRadius);
    sheet.handle = before.content !== "none" && parseFloat(before.height) > 0;
    sheet.cardTop = Math.round(cb.top);
    sheet.cardW = Math.round(cb.width);
    if (Math.abs(sheet.bottomGap) > 1) problems.push(`thẻ không áp sát đáy (cách ${sheet.bottomGap}px)`);
    if (sheet.radiusTop < 16) problems.push(`góc trên chưa bo tròn (${sheet.radiusTop}px)`);
    if (sheet.radiusBottom > 0) problems.push(`góc dưới còn bo (${sheet.radiusBottom}px)`);
    if (!sheet.handle) problems.push("thiếu thanh nắm");
    if (Math.abs(cb.width - vw) > 1) problems.push(`thẻ không rộng hết màn hình (${Math.round(cb.width)}/${vw})`);
  }
  if (r.right > vw + 1 || r.left < -1) problems.push(`panel tràn ngang (${Math.round(r.left)}→${Math.round(r.right)} / ${vw})`);
  // panel cao hơn màn hình mà lớp phủ không cuộn được ⇒ bị cắt
  const ovCs = getComputedStyle(ov);
  const scrollable = /(auto|scroll)/.test(ovCs.overflowY);
  if (r.bottom > vh + 1 && !scrollable) problems.push(`đáy hộp thoại ${Math.round(r.bottom)} > màn hình ${vh} và không cuộn được`);
  if (r.top < -1 && !scrollable) problems.push(`đỉnh hộp thoại ${Math.round(r.top)} bị cắt`);
  // phần tử con tràn mép phải (bỏ qua vùng cuộn ngang có chủ đích)
  const inScrollX = (el) => {
    for (let p = el.parentElement; p && p !== ov; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const over = [];
  for (const el of panel.querySelectorAll("*")) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.visibility === "hidden" || cs.display === "none") continue;
    if (b.right > vw + 1 && b.left < vw && !inScrollX(el)) over.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(/\s+/).slice(0, 3).join(".")} “${(el.innerText || "").trim().slice(0, 30)}”`);
  }
  if (over.length) problems.push(`${over.length} phần tử vượt mép phải: ${over.slice(0, 3).join(" | ")}`);
  // nút chân trang phải nhìn thấy được trong khung nhìn khi hộp thoại không cuộn
  const buttons = [...panel.querySelectorAll("button[type=submit], button")].filter((b) => /^(Lưu|Gửi|Tạo|Thêm|Xác nhận|Lập|Duyệt|Ghi)/i.test((b.innerText || "").trim()));
  const hidden = buttons.filter((b) => {
    const bb = b.getBoundingClientRect();
    return bb.width > 0 && (bb.bottom > vh + 1 || bb.right > vw + 1) && !scrollable;
  });
  if (hidden.length) problems.push(`nút chính nằm ngoài màn hình: ${hidden.map((b) => (b.innerText || "").trim().slice(0, 20)).join(", ")}`);
  const small = [...panel.querySelectorAll("button,a,[role=button]")].filter((b) => {
    const bb = b.getBoundingClientRect();
    return bb.width > 0 && (bb.width < 28 || bb.height < 28) && (b.innerText || "").trim() === "" && !b.disabled;
  }).length;
  return { vw, vh, sheet, panel: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }, scrollable, docWidth: document.documentElement.scrollWidth, problems, tinyButtons: small };
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "vi-VN" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
const report = [];
let bad = 0;
const dir = path.resolve(`.local/e2e/modals-${W}`);
mkdirSync(dir, { recursive: true });
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 28).toLowerCase();

try {
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(1200);
  for (let i = 0; i < 2; i++) {
    await page.fill("#email", USER);
    await page.fill("#password", PASS);
    const ok = await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30_000 }).then(() => true, () => false), page.tap('button[type="submit"]')]).then(([r]) => r);
    if (ok) break;
    await page.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(1200);
  }
  console.log(`▶ Hộp thoại ở khổ ${W}×${H} · ${USER}`);
  for (const p of PAGES) {
    for (let t = 0; t < 3; t++) {
      try {
        await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 90_000 });
        break;
      } catch (e) {
        if (t === 2) throw e;
        await page.waitForTimeout(2000);
      }
    }
    // chờ React hydrate + dữ liệu về (trang dev biên dịch lâu): có ít nhất một nút trong <main>
    await page.waitForFunction(() => document.querySelectorAll("main button").length > 0, null, { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const labels = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc, "i");
      const seen = new Set();
      return [...document.querySelectorAll("main button, main [role=button], header button")]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          const t = (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
          if (!t || r.width === 0 || b.disabled || seen.has(t) || !re.test(t)) return false;
          seen.add(t);
          return true;
        })
        .map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "))
        .slice(0, 12);
    }, BUTTON_RE.source);
    console.log(`\n  ${p} — ${labels.length} nút thử`);
    let n = 0;
    for (const label of labels) {
      if (n >= MAX_PER_PAGE) break;
      const loc = page.locator("main button, main [role=button], header button").filter({ hasText: label }).first();
      try {
        if (!(await loc.isVisible())) continue;
        await loc.scrollIntoViewIfNeeded({ timeout: 2000 });
        await loc.tap({ timeout: 3000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(650);
      const m = await page.evaluate(MEASURE);
      if (!m) {
        // không mở hộp thoại (có thể điều hướng); quay lại trang
        if (!page.url().includes(p)) await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 90_000 });
        continue;
      }
      n++;
      const file = `${slug(p === "/" ? "tong-quan" : p)}__${slug(label)}.png`;
      await page.screenshot({ path: path.join(dir, file) });
      const fail = m.problems.length > 0 || m.docWidth > m.vw + 1;
      if (fail) bad++;
      report.push({ page: p, label, ...m });
      console.log(`   ${fail ? "✗" : "✓"} “${label.slice(0, 34)}” ${m.panel.w}×${m.panel.h}px${m.scrollable ? " (cuộn)" : ""}${m.tinyButtons ? ` · ${m.tinyButtons} nút nhỏ <28px` : ""}`);
      for (const pr of m.problems) console.log(`        → ${pr}`);
      if (m.docWidth > m.vw + 1) console.log(`        → trang tràn ngang (${m.docWidth}/${m.vw})`);
      // KÉO XUỐNG để đóng: vuốt bằng cảm ứng thật (CDP) từ thanh nắm xuống ~260px
      if (m.sheet?.marked) {
        const x = Math.round(m.vw / 2);
        const y0 = m.sheet.cardTop + 22;
        const cdp = await context.newCDPSession(page);
        const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
        await touch("touchStart", y0);
        for (let k = 1; k <= 8; k++) {
          await touch("touchMove", y0 + k * 32);
          await page.waitForTimeout(16);
        }
        await touch("touchEnd", y0 + 256);
        await page.waitForTimeout(900);
        const closed = !(await page.evaluate(() => !!document.querySelector("[data-sheet-overlay]")));
        console.log(`        ${closed ? "✓" : "✗"} kéo xuống để đóng${closed ? "" : " — KHÔNG đóng được"}`);
        if (!closed) bad++;
        await cdp.detach().catch(() => {});
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      // Escape không đóng được ⇒ tải lại trang
      if (await page.evaluate(() => !!document.querySelector(".fixed.inset-0[class*=backdrop]"))) {
        await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
    }
  }
} finally {
  await browser.close();
}
if (errors.length) console.log("\nLỗi JS:", [...new Set(errors)].slice(0, 5).join(" | "));
mkdirSync(".local/e2e", { recursive: true });
writeFileSync(`.local/e2e/modals-report-${W}.json`, JSON.stringify(report, null, 1));
console.log(`\n${bad ? `✗ ${bad} hộp thoại lỗi bố cục` : "✓ Mọi hộp thoại đã thử đều lọt màn hình"} · đã thử ${report.length} · ảnh ở .local/e2e/modals-${W}/`);
process.exit(bad ? 1 : 0);
