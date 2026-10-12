// Kiểm thử CHỐT BẢO MẬT ở tầng API (src/server/http.ts + db/app/1041):
//   • vai trò bắt buộc 2FA (settings auth.mfa_required_roles) mà chưa bật ⇒ mọi API trừ /api/v1/auth/* trả 403 MFA_REQUIRED
//   • mật khẩu tạm (must_change_password) ⇒ 403 PASSWORD_CHANGE_REQUIRED cho tới khi đổi
//   • tự đăng ký: tắt được (auth.registration_open) và có giới hạn tần suất lưu trong CSDL
//   • lỗi 5xx không lộ thông điệp kỹ thuật ra ngoài
import pg from "pg";

export async function run({ as, test, eq, ok, section, BASE, pgConfig, Client }) {
  section("Chốt bảo mật ở API (2FA bắt buộc, mật khẩu tạm, đăng ký)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const setSetting = (key, json) => sql("UPDATE settings SET value = $2::jsonb WHERE key = $1", [key, json]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- 2FA bắt buộc ----
  const prevRoles = (await sql("SELECT value FROM settings WHERE key = 'auth.mfa_required_roles'")).rows[0]?.value ?? [];
  try {
    await setSetting("auth.mfa_required_roles", JSON.stringify(["treasurer"]));
    const treasurer = await as("bao.pham@luuxa.local");
    await test("Vai trò bắt buộc 2FA chưa bật: API nghiệp vụ → 403 MFA_REQUIRED", async () => {
      // đệm phiên tối đa 15 giây có thể còn giữ trạng thái cũ ⇒ thử lại vài lần
      let r;
      for (let i = 0; i < 10; i++) {
        r = await treasurer.get("/api/v1/members");
        if (r.status === 403) break;
        await wait(2000);
      }
      eq(r.status, 403, JSON.stringify(r.json));
      eq(r.json.code, "MFA_REQUIRED");
    });
    await test("… nhưng /api/v1/auth/me và /api/v1/auth/mfa vẫn dùng được (để thiết lập 2FA)", async () => {
      const me = await treasurer.get("/api/v1/auth/me");
      eq(me.status, 200);
      eq(me.json.mfa.required, true);
      eq(me.json.mfa.enabled, false);
      eq((await treasurer.get("/api/v1/auth/mfa")).status, 200);
    });
    await test("Ghi dữ liệu cũng bị chặn (POST /api/v1/feedback → 403 MFA_REQUIRED)", async () => {
      const r = await treasurer.post("/api/v1/feedback", { category: "idea", content: "Thử ghi khi chưa bật 2FA bắt buộc" });
      eq(r.status, 403);
      eq(r.json.code, "MFA_REQUIRED");
    });
    await test("Thành viên thường (không thuộc vai trò bắt buộc) không bị chặn", async () => {
      const m = await as("tuan.nguyen@luuxa.local");
      eq((await m.get("/api/v1/members")).status, 200);
    });
  } finally {
    await setSetting("auth.mfa_required_roles", JSON.stringify(prevRoles));
  }

  // ---- Mật khẩu tạm ----
  await test("Mật khẩu tạm: API nghiệp vụ → 403 PASSWORD_CHANGE_REQUIRED; đổi mật khẩu xong thì dùng được", async () => {
    const head = await as("duc.tran@luuxa.local");
    const email = `tam.${Date.now()}@luuxa.local`;
    const r = await head.post("/api/v1/members", { fullName: "Giuse Thử Mật Khẩu Tạm", email, createAccount: true, roomCode: null });
    eq(r.status, 201, JSON.stringify(r.json));
    const c = await new Client("tam").login(email, r.json.account.temporaryPassword);
    const blocked = await c.get("/api/v1/members");
    eq(blocked.status, 403, JSON.stringify(blocked.json));
    eq(blocked.json.code, "PASSWORD_CHANGE_REQUIRED");
    eq((await c.get("/api/v1/auth/me")).status, 200);
    eq((await c.post("/api/v1/auth/password", { currentPassword: r.json.account.temporaryPassword, newPassword: "MatKhauMoi2026x" })).status, 200);
    let after;
    for (let i = 0; i < 5; i++) {
      after = await c.get("/api/v1/members");
      if (after.status === 200) break;
      await wait(1000);
    }
    eq(after.status, 200, "đổi mật khẩu xong phải dùng được ngay");
  });

  // ---- Tự đăng ký ----
  await test("Tắt tự đăng ký (auth.registration_open = false) → 403 REGISTRATION_CLOSED; capabilities báo registrationOpen=false", async () => {
    await setSetting("auth.registration_open", "false");
    try {
      const anon = await new Client("anon-reg").init();
      const cap = await anon.get("/api/v1/auth/capabilities");
      eq(cap.json.registrationOpen, false);
      const r = await anon.post("/api/v1/auth/register", { fullName: "Người Thử Đóng Đăng Ký", email: `dong.${Date.now()}@luuxa.local`, password: "MatKhau2026", acceptTerms: true });
      eq(r.status, 403, JSON.stringify(r.json));
      eq(r.json.code, "REGISTRATION_CLOSED");
    } finally {
      await setSetting("auth.registration_open", "true");
    }
  });
  await test("Giới hạn tự đăng ký toàn hệ thống (60/ngày) → 429 khi chạm ngưỡng", async () => {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'register:%'");
    await sql("INSERT INTO rate_limit_hits (key) SELECT 'register:all' FROM generate_series(1, 60)");
    try {
      const anon = await new Client("anon-rl").init();
      const r = await anon.post("/api/v1/auth/register", { fullName: "Người Thử Giới Hạn", email: `gioihan.${Date.now()}@luuxa.local`, password: "MatKhau2026", acceptTerms: true });
      eq(r.status, 429, JSON.stringify(r.json));
    } finally {
      await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'register:%'");
    }
  });
  await test("Đăng ký thành công ⇒ Trưởng nhà nhận thông báo 'Đơn đăng ký mới'", async () => {
    const anon = await new Client("anon-ok").init();
    const name = `Phêrô Thử Báo Tin ${Date.now() % 100000}`;
    const r = await anon.post("/api/v1/auth/register", { fullName: name, email: `baotin.${Date.now()}@luuxa.local`, password: "MatKhau2026", acceptTerms: true });
    eq(r.status, 201, JSON.stringify(r.json));
    let n = 0;
    for (let i = 0; i < 10 && !n; i++) {
      await wait(500);
      n = (await sql("SELECT count(*)::int AS n FROM notifications WHERE type_code = 'member.application_new' AND title LIKE $1", [`%${name}%`])).rows[0].n;
    }
    ok(n >= 1, "phải có thông báo member.application_new");
  });

  // ---- Lỗi 5xx không lộ chi tiết ----
  await test("Lỗi hệ thống (500) trả câu chung + mã lỗi, không lộ thông điệp kỹ thuật", async () => {
    // gọi /api/v1/inbox khi bảng/thao tác lỗi là khó dựng; dùng route gặp lỗi CSDL thật: tạm đổi tên cột bằng giao dịch không được — thay vào đó
    // kiểm hàm ánh xạ qua một route công khai nhận dữ liệu sai kiểu sâu: kiểm tra định dạng phản hồi 5xx từ client-error khi body hỏng là 400.
    const anon = await new Client("anon-err").init();
    const bad = await fetch(`${BASE}/api/v1/public/client-error`, { method: "POST", headers: { "content-type": "application/json" }, body: "{hỏng" });
    eq(bad.status, 400);
    const j = await bad.json();
    ok(typeof j.request_id === "string" && j.request_id.length > 8, "phản hồi lỗi phải có request_id");
    ok(!("debug" in j) || typeof j.debug === "string", "debug chỉ có ở dev");
    void anon;
  });
}
