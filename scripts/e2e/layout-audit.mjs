#!/usr/bin/env node
// Rà soát giao diện (điện thoại + máy tính): mở từng trang/tab ở các khổ màn hình, phát hiện
//   • tràn ngang (cuộn ngang ngoài ý muốn / phần tử vượt mép màn hình),
//   • NHÃN NÚT / LIÊN KẾT bị xuống dòng (vd. "Điền / Cập Nhật Điểm Số" rớt dòng),
//   • chữ bị cắt cụt quá hẹp (truncate chỉ còn vài ký tự, overflow-hidden cắt mất chữ),
//   • nút / liên kết bị ép hẹp hơn nội dung (co dưới 36px mà còn chữ),
// và chụp ảnh từng trang để xem lại.
//
//   node scripts/e2e/layout-audit.mjs [--base http://localhost:3100] [--user viet.vu@luuxa.local] [--widths 390,360,1440] [--pages /bai-viet,/hoc-tap] [--shots]
// Ảnh: .local/e2e/layout/<rộng>/<trang>.png (khi có --shots) · Thoát 1 nếu có phát hiện.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3100");
const USER = get("--user", "viet.vu@luuxa.local");
const PASS = get("--pass", "LuuXa@2026");
const WIDTHS = get("--widths", "390,360,1440").split(",").map(Number);
const SHOTS = args.includes("--shots");
const normPage = (p) => "/" + p.replace(/^[A-Za-z]:\/.*?\/Git\/?/, "").replace(/^\/+/, "");

const DEFAULT_PAGES = [
  "/", "/thong-bao", "/thong-bao?tab=luat", "/dien-dan", "/lich-su-kien", "/xin-phep", "/thu-chi", "/thu-chi?tab=chi", "/thu-chi?tab=dong-quy", "/thu-chi?tab=ung-ho",
  "/thu-chi?tab=so-quy", "/thu-chi?tab=bao-cao", "/thu-chi?tab=thong-ke", "/bao-cao", "/bep-com", "/hau-can", "/hau-can?tab=bao-hong", "/phung-vu", "/phung-vu?tab=checkin",
  "/phung-vu?tab=docs", "/thanh-vien", "/thanh-vien?tab=applications", "/thanh-vien?tab=former", "/thanh-vien?tab=data-requests", "/so-do-nha", "/ky-luat", "/hoc-tap",
  "/khoanh-khac", "/bai-viet", "/bai-viet?tab=faq", "/bai-viet?tab=inquiries", "/gop-y", "/huong-dan", "/khoi-tao",
  "/cai-dat?tab=profile", "/cai-dat?tab=security", "/cai-dat?tab=notifications", "/cai-dat?tab=general", "/cai-dat?tab=categories", "/cai-dat?tab=academic", "/quan-tri?tab=roles",
  "/quan-tri?tab=accounts", "/quan-tri?tab=zalo", "/cai-dat?tab=reminders", "/quan-tri?tab=ai", "/quan-tri?tab=modules", "/quan-tri?tab=activity", "/quan-tri?tab=storage", "/quan-tri?tab=system",
];
const PUBLIC_PAGES = ["/tin-tuc", "/gioi-thieu", "/lien-he", "/hoi-dap", "/thu-vien", "/ung-ho", "/vao-o", "/chinh-sach-bao-mat", "/dieu-khoan-su-dung", "/dang-nhap"];
const PAGES = (get("--pages", [...DEFAULT_PAGES, ...PUBLIC_PAGES].join(",")) ?? "").split(",").map(normPage);

const exe = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));
if (!exe) {
  console.error("Không tìm thấy Edge/Chrome.");
  process.exit(2);
}

/** Chạy trong trang. Trả các phát hiện (đã rút gọn). */
const PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const found = [];
  const idOf = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className?.baseVal ?? el.className).split(/\s+/).filter(Boolean).slice(0, 5).join(".")}`.slice(0, 110);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
    for (let p = el; p; p = p.parentElement) if (p.getAttribute?.("aria-hidden") === "true" || p.hasAttribute?.("inert")) return false;
    return true;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth - 1) return true;
    }
    return false;
  };
  // 1) tràn ngang
  if (document.documentElement.scrollWidth > vw + 1) found.push({ kind: "tràn-ngang", el: "document", text: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` });
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed" || cs.position === "sticky") continue;
    if (cs.position === "absolute" && !(el.innerText || "").trim() && !el.querySelector("button,a,input,img,svg")) continue;
    if (r.right > vw + 1 && r.left < vw && !inScroller(el) && !el.closest("[data-no-audit]")) found.push({ kind: "vượt-mép-phải", el: idOf(el), text: (el.innerText || "").trim().slice(0, 40), right: Math.round(r.right) });
  }
  // 2) nhãn nút / liên kết bị xuống dòng — chỉ tính chữ NẰM TRONG MỘT đoạn văn bản (icon xếp trên chữ, huy hiệu số… không tính)
  for (const el of document.querySelectorAll("button, a[href], [role=tab], [role=button]")) {
    if (!visible(el) || el.closest("[data-no-audit], .sr-only")) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.textContent || "").replace(/[ \t\r\n]+/g, " ").trim();
      if (t.length < 4 || t.length > 40 || !t.includes(" ") || n.parentElement?.closest(".sr-only")) continue;
      // chỉ nút / liên kết dạng "nút" (inline-*): thẻ danh sách cả hàng được phép xuống dòng chữ tự nhiên
      if (!/^inline-(flex|block)/.test(getComputedStyle(el).display)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const tops = new Set([...range.getClientRects()].filter((q) => q.width > 2 && q.height > 4).map((q) => Math.round(q.top / 6)));
      if (tops.size > 1) {
        found.push({ kind: "nhãn-xuống-dòng", el: idOf(el), text: t.slice(0, 40), lines: tops.size });
        break;
      }
    }
  }
  const textOverflows = (el) => {
    const er = el.getBoundingClientRect();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!(n.textContent || "").trim()) continue;
      const par = n.parentElement;
      let decorative = false;
      for (let q = par; q && q !== el; q = q.parentElement) {
        const pos = getComputedStyle(q).position;
        if (pos === "absolute" || pos === "fixed" || q.getAttribute("aria-hidden") === "true") decorative = true;
        // phần tử con tự cắt chữ (truncate / overflow ẩn) thì chữ dài hơn khung là CHỦ ĐÍCH, không phải lỗi
        if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(q).overflowX)) decorative = true;
      }
      if (decorative) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1 && (r.right > er.right + 2 || r.left < er.left - 2)) return true;
    }
    return false;
  };
  // 3) chữ bị cắt quá hẹp / bị overflow-hidden cắt mất
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || el.closest("[data-no-audit], .sr-only")) continue;
    const cs = getComputedStyle(el);
    if (!/(hidden|clip)/.test(cs.overflowX)) continue;
    if (el.scrollWidth <= el.clientWidth + 2) continue;
    const text = (el.innerText || "").trim();
    if (!text) continue;
    const ellipsis = cs.textOverflow === "ellipsis";
    if (ellipsis && el.clientWidth < 70 && text.length > 8) found.push({ kind: "cắt-quá-hẹp", el: idOf(el), text: text.slice(0, 40), width: Math.round(el.clientWidth) });
    else if (!ellipsis && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 8 && !el.matches("html,body") && cs.display !== "inline" && textOverflows(el)) found.push({ kind: "chữ-bị-cắt", el: idOf(el), text: text.slice(0, 40), width: Math.round(el.clientWidth), scroll: el.scrollWidth });
  }
  // 4) nút bị ép hẹp
  for (const el of document.querySelectorAll("button, a[href]")) {
    if (!visible(el) || el.closest("[data-no-audit]")) continue;
    const text = (el.innerText || "").trim();
    const r = el.getBoundingClientRect();
    if (text.length >= 3 && r.width < 28 && r.height > 20) found.push({ kind: "nút-bị-ép", el: idOf(el), text: text.slice(0, 30), width: Math.round(r.width) });
  }
  // gộp trùng
  const seen = new Set();
  return found.filter((f) => {
    const k = f.kind + f.el + f.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 25);
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
let total = 0;
try {
  for (const w of WIDTHS) {
    const mobile = w < 700;
    const context = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, locale: "vi-VN" });
    const page = await context.newPage();
    await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(800);
    const login = async () => {
      await page.fill("#email", USER);
      await page.fill("#password", PASS);
      return Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30_000 }).then(() => true, () => false), page.click('button[type="submit"]')]).then(([r]) => r);
    };
    if (!(await login())) {
      await page.goto(`${BASE}/dang-nhap`, { waitUntil: "networkidle", timeout: 120_000 });
      await login();
    }
    console.log(`\n=== ${w}px (${mobile ? "điện thoại" : "máy tính"}) ===`);
    const dir = path.resolve(".local/e2e/layout", String(w));
    if (SHOTS) mkdirSync(dir, { recursive: true });
    for (const p of PAGES) {
      try {
        await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 60_000 });
      } catch {
        /* trang có SSE / polling */
      }
      await page.waitForTimeout(1200);
      // đợi các khung xương (skeleton) biến mất để đo nội dung thật
      await page.waitForFunction(() => !document.querySelector(".shimmer-box, .animate-pulse"), null, { timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(500);
      let res = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          res = await page.evaluate(PROBE);
          break;
        } catch (e) {
          // trang vừa tự chuyển hướng / tải lại (HMR, làm mới phiên) ⇒ chờ rồi đo lại
          if (attempt === 3) throw e;
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
      total += res.length;
      console.log(`${res.length ? "✗" : "✓"} ${p}${res.length ? `  (${res.length})` : ""}`);
      for (const f of res) console.log(`    · ${f.kind}: "${f.text}"  ${f.el}${f.lines ? ` [${f.lines} dòng]` : ""}${f.width !== undefined ? ` [rộng ${f.width}${f.scroll ? "/" + f.scroll : ""}]` : ""}${f.right ? ` [mép ${f.right}]` : ""}`);
      if (SHOTS) await page.screenshot({ path: path.join(dir, (p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home") + ".png"), fullPage: true }).catch(() => {});
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${total ? `✗ ${total} phát hiện` : "✓ không phát hiện lỗi bố cục"}`);
process.exit(total ? 1 : 0);
