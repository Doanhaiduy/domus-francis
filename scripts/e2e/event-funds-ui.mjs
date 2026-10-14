#!/usr/bin/env node
// Kiểm tra giao diện QUỸ RIÊNG (tab "Quỹ riêng" ở Thu chi) + ô "Tin cậy thiết bị này trong 30 ngày" ở bước 2FA, bằng trình duyệt thật
// (Edge/Chrome qua playwright-core). Chạy trên máy chủ thử (DB luuxa_test đã áp db/app/1054, 1055):
//   node scripts/test-api.mjs --serve       (giữ chạy)   rồi:   node scripts/e2e/event-funds-ui.mjs --base http://localhost:3100
//   Ảnh: .local/e2e/event-funds/<màn hình>-<rộng>-<sáng|tối>.png
import { chromium } from "playwright-core";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = get("--base", "http://localhost:3100");
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!exe) { console.error("Không tìm thấy Edge/Chrome."); process.exit(2); }
const OUT = ".local/e2e/event-funds";
mkdirSync(OUT, { recursive: true });
const PW = "LuuXa@2026";
let bad = 0;
const check = (cond, msg) => { console.log(cond ? "  ✓" : "  ✗", msg); if (!cond) bad++; };

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of secret.toUpperCase().replace(/[^A-Z2-7]/g, "")) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  return String((((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1e6).padStart(6, "0");
}

const browser = await chromium.launch({ executablePath: exe, headless: true });

async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(1200);
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  return page;
}
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
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name, w, scheme) => {
  await page.evaluate((s) => document.documentElement.classList.toggle("dark", s === "dark"), scheme);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${w}-${scheme === "dark" ? "toi" : "sang"}.png`, fullPage: true });
};
const stamp = Date.now().toString(36);

try {
  // ---------------- Dựng dữ liệu: Trưởng nhà lập quỹ qua API ----------------
  const headCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const head = await login(headCtx, "duc.tran@luuxa.local");
  const me = async (page) => (await api(page, "GET", "/api/v1/auth/me")).json.member.id;
  const ids = {};
  for (const [k, email] of Object.entries({ mgr: "long.le@luuxa.local", member: "tuan.nguyen@luuxa.local", member2: "kiet.do@luuxa.local" })) {
    const c = await browser.newContext();
    const p = await login(c, email);
    ids[k] = await me(p);
    await c.close();
  }
  const tomorrow = new Date(Date.now() + 86400_000 + 7 * 3600_000).toISOString().slice(0, 10);
  const ev = await api(head, "POST", "/api/v1/events", { title: `Hành hương giao diện ${stamp}`, date: tomorrow, time: "05:30", categoryCode: "EVT_PILGRIM" });
  check(ev.status === 201, "tạo sự kiện thử");
  const fund = await api(head, "POST", "/api/v1/finance/event-funds", {
    eventId: ev.json.id, name: `Quỹ hành hương giao diện ${stamp}`, managerIds: [ids.mgr], defaultDueVnd: 450000,
    participants: [{ memberId: ids.member }, { memberId: ids.member2 }, { guestName: "Chị Lan (giáo dân)", guestPhone: "0901234567" }, { guestName: "Anh Minh", dueVnd: 300000 }],
  });
  check(fund.status === 201, "lập quỹ riêng thử: " + JSON.stringify(fund.json).slice(0, 80));
  const F = fund.json.fundId;

  // ---------------- Trưởng nhà: danh sách + chi tiết + ghi thu ----------------
  for (const w of [1440, 390]) {
    await head.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await head.goto(`${BASE}/thu-chi?tab=quy-rieng`, { waitUntil: "load", timeout: 90_000 });
    await head.waitForSelector("text=Quỹ riêng", { timeout: 60_000 });
    await head.waitForSelector(`text=Quỹ hành hương giao diện ${stamp}`, { timeout: 30_000 });
    check(true, `[${w}] danh sách quỹ hiện, có nút Lập quỹ riêng: ${await head.getByRole("button", { name: /Lập quỹ riêng/ }).count() > 0}`);
    check(await noHScroll(head), `[${w}] danh sách không tràn ngang`);
    await shot(head, "danh-sach", w, "light");
    await shot(head, "danh-sach", w, "dark");
    await head.evaluate(() => document.documentElement.classList.remove("dark"));
    await head.getByText(`Quỹ hành hương giao diện ${stamp}`).first().click();
    await head.waitForSelector("text=Người tham gia", { timeout: 30_000 });
    await head.waitForSelector("text=Chị Lan", { timeout: 30_000 });
    check(await head.getByText("0901234567").count() > 0, `[${w}] người quản lý thấy SĐT người ngoài`);
    check(await noHScroll(head), `[${w}] chi tiết không tràn ngang`);
    await shot(head, "chi-tiet", w, "light");
    await shot(head, "chi-tiet", w, "dark");
    await head.evaluate(() => document.documentElement.classList.remove("dark"));
  }
  await head.setViewportSize({ width: 1440, height: 900 });
  await head.getByRole("button", { name: /^Thu$/ }).first().click(); // nút "Thu" trên dòng người tham gia: chọn sẵn người + mức còn thiếu
  await head.waitForSelector("text=Ghi thu vào quỹ", { timeout: 15_000 });
  await shot(head, "ghi-thu", 1440, "light");
  await head.getByRole("button", { name: /^Ghi thu$/ }).last().click();
  await head.waitForSelector("text=Phiếu thu (1)", { timeout: 30_000 });
  check(true, "ghi thu xong: phiếu thu hiện trong danh sách");
  await head.getByRole("button", { name: /Đóng quỹ/ }).first().click();
  await head.waitForSelector("text=Đóng quỹ (quyết toán)", { timeout: 15_000 });
  await shot(head, "dong-quy", 1440, "light");
  await head.keyboard.press("Escape");

  // ---------------- Người phụ trách: form phiếu chi có quỹ cố định ----------------
  const mgrCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mgr = await login(mgrCtx, "long.le@luuxa.local");
  await mgr.goto(`${BASE}/thu-chi?tab=quy-rieng&fund=${F}`, { waitUntil: "load", timeout: 90_000 });
  await mgr.waitForSelector("text=Người tham gia", { timeout: 60_000 });
  check(await mgr.getByRole("button", { name: /Đóng quỹ/ }).count() === 0, "người phụ trách không thấy nút Đóng quỹ");
  await mgr.getByRole("button", { name: /Lập phiếu chi/ }).first().click();
  await mgr.waitForSelector("text=Chi từ quỹ riêng", { timeout: 15_000 });
  check(await mgr.getByText(`Quỹ hành hương giao diện ${stamp}`).count() > 0, "form phiếu chi cố định quỹ riêng (không có ô chọn túi quỹ khác)");
  await mgr.locator('input[inputmode="numeric"]').first().fill("2600000");
  await mgr.waitForSelector("text=Quỹ riêng chỉ cần 1 chữ ký", { timeout: 10_000 }).catch(() => {});
  check(await mgr.getByText("Quỹ riêng chỉ cần 1 chữ ký").count() > 0, "nhập số tiền lớn ⇒ hiện rõ chỉ cần 1 chữ ký (không phải 2)");
  await shot(mgr, "phieu-chi", 390, "light");
  await mgrCtx.close();

  // ---------------- Thành viên tham gia: chỉ thấy phần của mình ----------------
  const memCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mem = await login(memCtx, "tuan.nguyen@luuxa.local");
  await mem.goto(`${BASE}/thu-chi?tab=quy-rieng&fund=${F}`, { waitUntil: "load", timeout: 90_000 });
  await mem.waitForSelector("text=Phần của bạn", { timeout: 60_000 });
  check(await mem.getByRole("button", { name: /Ghi thu|Lập phiếu chi|Đóng quỹ/ }).count() === 0, "thành viên chỉ tham gia không có nút thao tác");
  check((await mem.getByText("0901234567").count()) === 0 && (await mem.getByText("Chị Lan").count()) === 0, "không thấy người khác / SĐT người ngoài");
  await shot(mem, "thanh-vien", 390, "light");
  await memCtx.close();

  // ---------------- 2FA: ô tin cậy thiết bị 30 ngày ----------------
  const acc = "hieu.bui@luuxa.local";
  const aCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await login(aCtx, acc);
  const st = await api(a, "POST", "/api/v1/auth/mfa/setup");
  const cf = await api(a, "POST", "/api/v1/auth/mfa/confirm", { code: totp(st.json.secret) });
  check(cf.status === 200, "bật 2FA cho tài khoản thử");
  const rec = cf.json.recoveryCodes;
  await aCtx.close();

  const tCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const t = await tCtx.newPage();
  await t.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await t.waitForTimeout(1200);
  await t.fill("#email", acc);
  await t.fill("#password", PW);
  await t.click('button[type="submit"]');
  await t.waitForSelector("text=Xác thực 2 bước", { timeout: 30_000 });
  check(await t.getByText("Tin cậy thiết bị này trong 30 ngày").count() > 0, "bước nhập mã có ô “Tin cậy thiết bị này trong 30 ngày”");
  check(await noHScroll(t), "bước nhập mã không tràn ngang (390px)");
  await shot(t, "dang-nhap-2fa", 390, "light");
  await shot(t, "dang-nhap-2fa", 390, "dark");
  await t.evaluate(() => document.documentElement.classList.remove("dark"));
  await t.getByLabel("Mã xác thực").fill(rec[0]);
  await t.getByText("Tin cậy thiết bị này trong 30 ngày").click();
  await Promise.all([t.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), t.getByRole("button", { name: /Xác nhận/ }).click()]);
  check(true, "đăng nhập bằng mã khôi phục + tick tin cậy");
  await t.goto(`${BASE}/cai-dat?tab=security`, { waitUntil: "load", timeout: 90_000 });
  await t.waitForSelector("text=Thiết bị tin cậy", { timeout: 60_000 });
  check(await t.getByText("Thiết bị này").count() > 0, "Cài đặt → Bảo mật liệt kê thiết bị này");
  check(await noHScroll(t), "tab Bảo mật không tràn ngang");
  await shot(t, "bao-mat-thiet-bi", 390, "light");
  await shot(t, "bao-mat-thiet-bi", 390, "dark");
  await t.evaluate(() => document.documentElement.classList.remove("dark"));
  // đăng xuất rồi đăng nhập lại: không hỏi mã
  await api(t, "POST", "/api/v1/auth/logout");
  await t.goto(`${BASE}/dang-nhap`, { waitUntil: "load", timeout: 90_000 });
  await t.waitForTimeout(1200);
  await t.fill("#email", acc);
  await t.fill("#password", PW);
  await Promise.all([t.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 60_000 }), t.click('button[type="submit"]')]);
  check(true, "đăng nhập lại KHÔNG bị hỏi mã 2FA (thiết bị tin cậy)");
  // dọn: tắt 2FA
  const off = await api(t, "DELETE", "/api/v1/auth/mfa", { password: PW });
  check(off.status === 200, "dọn: tắt 2FA tài khoản thử");
  await tCtx.close();
} catch (e) {
  console.error("  ✗ LỖI:", e.message);
  bad++;
} finally {
  await browser.close();
}
console.log(bad ? `\n✗ ${bad} lỗi` : "\n✓ Giao diện quỹ riêng + tin cậy thiết bị đạt");
console.log(`Ảnh: ${OUT}/`);
process.exit(bad ? 1 : 0);
