// Kiểm thử ĐỔI EMAIL ĐĂNG NHẬP (POST /api/v1/auth/email): users.email khác với "Email liên hệ" ở hồ sơ (members.contact_email).
// Đổi xong phải đăng nhập được bằng email mới và KHÔNG còn đăng nhập được bằng email cũ.

export async function run({ as, test, eq, ok, section, Client }) {
  section("Đổi email đăng nhập");

  const head = await as("duc.tran@luuxa.local");
  const stamp = Date.now();
  const oldEmail = `doi.email.${stamp}@luuxa.local`;
  const newEmail = `Moi.Email.${stamp}@Luuxa.Local`; // cố ý viết hoa: hệ thống phải thường hóa
  const PW1 = "MatKhauThu2026";
  let me;

  await test("Chuẩn bị: tạo thành viên + tài khoản rồi đổi mật khẩu tạm", async () => {
    const r = await head.post("/api/v1/members", { fullName: "Phaolô Đổi Email", email: oldEmail, createAccount: true, roomCode: null });
    eq(r.status, 201, JSON.stringify(r.json));
    me = await new Client("doi-email").login(oldEmail, r.json.account.temporaryPassword);
    eq((await me.post("/api/v1/auth/password", { currentPassword: r.json.account.temporaryPassword, newPassword: PW1 })).status, 200);
  });

  await test("Chưa đăng nhập → 401", async () => {
    const anon = await new Client("anon-email").init();
    eq((await anon.post("/api/v1/auth/email", { newEmail: "a@luuxa.local", password: PW1 })).status, 401);
  });
  await test("Sai mật khẩu hiện tại → 400, email không đổi", async () => {
    eq((await me.post("/api/v1/auth/email", { newEmail, password: "SaiMatKhau123" })).status, 400);
    eq((await me.get("/api/v1/auth/me")).json.user.email, oldEmail);
  });
  await test("Email sai định dạng → 400", async () => eq((await me.post("/api/v1/auth/email", { newEmail: "khong-phai-email", password: PW1 })).status, 400));
  await test("Trùng email đang dùng của chính mình → 400", async () => eq((await me.post("/api/v1/auth/email", { newEmail: oldEmail.toUpperCase(), password: PW1 })).status, 400));
  await test("Trùng email của tài khoản khác → 409", async () => eq((await me.post("/api/v1/auth/email", { newEmail: "duc.tran@luuxa.local", password: PW1 })).status, 409));

  await test("Đổi thành công: email được thường hóa, /auth/me trả email mới, phiên hiện tại vẫn dùng được", async () => {
    const r = await me.post("/api/v1/auth/email", { newEmail: `  ${newEmail}  `, password: PW1 });
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.email, newEmail.toLowerCase());
    eq((await me.get("/api/v1/auth/me")).json.user.email, newEmail.toLowerCase());
  });
  await test("Đăng nhập bằng email MỚI (kể cả gõ hoa) được; bằng email CŨ → 401", async () => {
    const a = await new Client("moi").login(newEmail, PW1);
    eq((await a.get("/api/v1/auth/me")).json.user.email, newEmail.toLowerCase());
    const b = await new Client("cu").init();
    eq((await b.post("/api/v1/auth/login", { identifier: oldEmail, password: PW1 })).status, 401);
  });
  await test("Email cũ được giải phóng: tài khoản khác dùng lại được", async () => {
    const other = await head.post("/api/v1/members", { fullName: "Giuse Dùng Lại Email", email: oldEmail, createAccount: true, roomCode: null });
    eq(other.status, 201, JSON.stringify(other.json));
    ok(other.json.account?.temporaryPassword, "phải cấp được mật khẩu tạm");
  });
}
