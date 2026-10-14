// Kiểm thử "TIN CẬY THIẾT BỊ NÀY 30 NGÀY" ở bước xác thực 2 bước (db/app/1055): tick ở bước nhập mã ⇒ cookie thiết bị; đăng nhập lại
// trên đúng thiết bị đó (mật khẩu đúng) không hỏi mã; không có cookie / cookie giả / sang tài khoản khác / sang trình duyệt khác thì vẫn hỏi;
// hết hạn, thu hồi, đổi mật khẩu, tắt 2FA đều làm mất hiệu lực. Dùng mã khôi phục (một lần) để không phụ thuộc đồng hồ TOTP.

import { createHmac } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of secret.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1e6).padStart(6, "0");
}

export async function run({ as, test, eq, ok, section, BASE, Client, pgConfig }) {
  section("Tin cậy thiết bị 30 ngày (xác thực 2 bước)");
  const PW = "LuuXa@2026";
  const { default: pg } = await import("pg");
  const sql = async (q, p) => {
    const c = new pg.Client(pgConfig());
    await c.connect();
    try { return await c.query(q, p); } finally { await c.end(); }
  };

  /** Bật 2FA cho một tài khoản demo; trả máy khách đã đăng nhập + mã khôi phục (mỗi mã dùng một lần). */
  const enable2fa = async (email) => {
    const me = await as(email);
    const st = await me.post("/api/v1/auth/mfa/setup");
    eq(st.status, 200, JSON.stringify(st.json));
    const cf = await me.post("/api/v1/auth/mfa/confirm", { code: totp(st.json.secret) });
    eq(cf.status, 200, JSON.stringify(cf.json));
    return { me, recovery: cf.json.recoveryCodes };
  };
  const fresh = async (name) => new Client(name).init();
  const loginStep = (c, email, pw = PW) => c.post("/api/v1/auth/login", { identifier: email, password: pw });
  const A = "nam.phan@luuxa.local";
  const B = "phuoc.ly@luuxa.local";
  const a = await enable2fa(A);
  const b = await enable2fa(B);
  const rc = [...a.recovery];
  const trustCookie = (c) => c.jar.get("luuxa_td") ?? c.jar.get("__Secure-luuxa_td") ?? null;

  /** đăng nhập đủ 2 bước bằng một mã khôi phục; trust = tick "tin cậy 30 ngày" */
  const fullLogin = async (c, trust) => {
    const l = await loginStep(c, A);
    eq(l.status, 200, JSON.stringify(l.json));
    ok(l.json.mfaRequired && l.json.mfaToken, "phải đòi mã 2FA");
    const v = await c.post("/api/v1/auth/mfa/verify", { mfaToken: l.json.mfaToken, code: rc.shift(), trustDevice: trust });
    eq(v.status, 200, JSON.stringify(v.json));
    return v;
  };

  try {
    const c1 = await fresh("td-1");

    await test("Không tick ⇒ không cấp cookie thiết bị tin cậy; đăng nhập lại vẫn đòi mã", async () => {
      const v = await fullLogin(c1, false);
      eq(v.json.trusted, false);
      eq(trustCookie(c1), null, "không có cookie");
      await c1.post("/api/v1/auth/logout");
      const l = await loginStep(c1, A);
      ok(l.json.mfaRequired, "đăng nhập lại vẫn đòi mã");
    });

    let trustedDeviceId;
    await test("Tick 'tin cậy 30 ngày' ở bước nhập mã ⇒ cấp cookie; đăng xuất rồi đăng nhập lại KHÔNG hỏi mã 2FA nữa", async () => {
      const v = await fullLogin(c1, true);
      eq(v.json.trusted, true);
      ok(trustCookie(c1) && trustCookie(c1).length >= 43, "có cookie thiết bị tin cậy");
      ok(!trustCookie(c1).includes("."), "cookie là token ngẫu nhiên, không lộ mã tài khoản");
      await c1.post("/api/v1/auth/logout");
      const l = await loginStep(c1, A);
      eq(l.status, 200, JSON.stringify(l.json));
      ok(!l.json.mfaRequired, "không còn hỏi mã");
      const me = await c1.get("/api/v1/auth/me");
      eq(me.status, 200);
      eq(me.json.mfa.enabled, true, "tài khoản vẫn bật 2FA");
    });

    await test("Mật khẩu vẫn luôn phải đúng: sai mật khẩu trên thiết bị tin cậy ⇒ 401, không bỏ qua bước nào", async () => {
      await c1.post("/api/v1/auth/logout");
      const l = await loginStep(c1, A, "SaiMatKhau#123");
      eq(l.status, 401);
    });

    await test("Danh sách thiết bị tin cậy: thấy thiết bị này (current), còn ~30 ngày", async () => {
      await loginStep(c1, A);
      const r = await c1.get("/api/v1/auth/trusted-devices");
      eq(r.status, 200);
      eq(r.json.length, 1);
      eq(r.json[0].current, true);
      trustedDeviceId = r.json[0].id;
      const days = (new Date(r.json[0].expiresAt).getTime() - Date.now()) / 86_400_000;
      ok(days > 29 && days <= 30.01, "hạn 30 ngày: " + days.toFixed(2));
    });

    await test("Không dùng được ở nơi khác: không có cookie, cookie giả, cookie của người khác, trình duyệt/hệ điều hành khác ⇒ vẫn hỏi mã", async () => {
      // máy khác (không cookie)
      ok((await loginStep(await fresh("td-2"), A)).json.mfaRequired, "không cookie");
      // cookie giả
      const fake = await fresh("td-3");
      fake.jar.set("luuxa_td", "A".repeat(43));
      ok((await loginStep(fake, A)).json.mfaRequired, "cookie giả");
      // cookie của A dùng cho B (B cũng bật 2FA)
      const cross = await fresh("td-4");
      cross.jar.set("luuxa_td", trustCookie(c1));
      ok((await loginStep(cross, B)).json.mfaRequired, "cookie của A không có tác dụng với tài khoản B");
      // cùng cookie nhưng trình duyệt/hệ điều hành khác (nhãn thiết bị khác lúc tin cậy)
      const r = await fetch(BASE + "/api/v1/auth/login", {
        method: "POST",
        headers: {
          cookie: c1.cookieHeader(),
          "content-type": "application/json",
          origin: BASE,
          "x-csrf-token": c1.csrf(),
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        },
        body: JSON.stringify({ identifier: A, password: PW }),
      });
      const j = await r.json();
      ok(j.mfaRequired, "khác nhãn thiết bị (Chrome · Windows) ⇒ vẫn hỏi mã: " + JSON.stringify(j).slice(0, 80));
    });

    await test("Thu hồi một thiết bị ⇒ cookie bị gỡ, lần đăng nhập sau hỏi mã lại; thu hồi lần hai ⇒ 404", async () => {
      const del = await c1.del(`/api/v1/auth/trusted-devices/${trustedDeviceId}`);
      eq(del.status, 200, JSON.stringify(del.json));
      eq(trustCookie(c1), null, "cookie đã bị gỡ khỏi trình duyệt");
      eq((await c1.get("/api/v1/auth/trusted-devices")).json.length, 0);
      eq((await c1.del(`/api/v1/auth/trusted-devices/${trustedDeviceId}`)).status, 404);
      await c1.post("/api/v1/auth/logout");
      ok((await loginStep(c1, A)).json.mfaRequired, "đăng nhập lại đòi mã");
    });

    await test("Hết hạn 30 ngày ⇒ hỏi mã lại", async () => {
      await fullLogin(c1, true);
      await sql("UPDATE trusted_devices SET created_at = now() - interval '40 days', expires_at = now() - interval '10 days' WHERE user_id = (SELECT id FROM users WHERE email = $1)", [A]);
      await c1.post("/api/v1/auth/logout");
      ok((await loginStep(c1, A)).json.mfaRequired, "thiết bị hết hạn không còn bỏ qua 2FA");
    });

    await test("Đổi mật khẩu ⇒ MỌI thiết bị tin cậy bị thu hồi (đăng nhập lại hỏi mã)", async () => {
      await fullLogin(c1, true);
      await c1.post("/api/v1/auth/logout");
      ok(!(await loginStep(c1, A)).json.mfaRequired, "đã tin cậy: không hỏi");
      const NEW = "TinCay#2026-Moi";
      eq((await c1.post("/api/v1/auth/password", { currentPassword: PW, newPassword: NEW })).status, 200);
      eq((await c1.get("/api/v1/auth/trusted-devices")).json.length, 0, "danh sách trống sau khi đổi mật khẩu");
      await c1.post("/api/v1/auth/logout");
      ok((await loginStep(c1, A, NEW)).json.mfaRequired, "đăng nhập bằng mật khẩu mới vẫn hỏi mã");
      // trả mật khẩu về như cũ để các bộ test khác dùng được
      const l = await loginStep(c1, A, NEW);
      const v = await c1.post("/api/v1/auth/mfa/verify", { mfaToken: l.json.mfaToken, code: rc.shift() });
      eq(v.status, 200, JSON.stringify(v.json));
      eq((await c1.post("/api/v1/auth/password", { currentPassword: NEW, newPassword: PW })).status, 200);
    });

    await test("Tắt 2FA ⇒ thu hồi hết thiết bị tin cậy", async () => {
      await c1.post("/api/v1/auth/logout");
      await fullLogin(c1, true);
      eq((await c1.get("/api/v1/auth/trusted-devices")).json.length, 1);
      const off = await c1.req("DELETE", "/api/v1/auth/mfa", { password: PW });
      eq(off.status, 200, JSON.stringify(off.json));
      const left = (await sql("SELECT count(*)::int AS n FROM trusted_devices WHERE user_id = (SELECT id FROM users WHERE email = $1) AND revoked_at IS NULL", [A])).rows[0].n;
      eq(left, 0, "không còn thiết bị tin cậy hiệu lực");
    });
  } finally {
    // dọn: trả 2 tài khoản demo về không bật 2FA để không ảnh hưởng các bộ khác
    for (const email of [A, B]) {
      await sql("DELETE FROM user_mfa_factors WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email]);
      await sql("DELETE FROM mfa_recovery_codes WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email]);
      await sql("UPDATE trusted_devices SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, 'mfa_disabled') WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email]);
    }
  }
}
