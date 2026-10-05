// Kiểm thử PHÂN QUYỀN, VAI TRÒ & TÀI KHOẢN (Admin quản trị): vai trò hệ thống cố định (Admin, Trưởng nhà, Thủ quỹ, Thành viên —
// không còn Phó nhà), vai trò tự tạo (thêm/sửa quyền/xóa ⇒ lưu trữ), quyền bảo vệ, gán vai trò, đặt lại mật khẩu, khóa/vô hiệu.
// Dữ liệu thử: tạo vai trò/tài khoản MỚI (hậu tố thời gian) và trả lại mật khẩu Thủ quỹ như cũ để không ảnh hưởng suite khác.
const PW = "LuuXa@2026";

export async function run({ as, test, eq, ok, section, Client }) {
  section("Phân quyền & Vai trò & Tài khoản (Admin)");

  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const code = (r) => r.json?.code ?? "";
  const detail = (r) => r.json?.detail ?? "";
  const suffix = Date.now().toString(36);
  const roleCode = `ban_thu_${suffix}`;
  const tempRole = `ban_tam_${suffix}`;

  // Tra users.id theo email qua danh sách tài khoản (Admin có auth.user.read)
  let accounts = null;
  const userIdOf = async (email) => {
    accounts = (await admin.get("/api/v1/accounts")).json;
    return accounts.items.find((a) => a.email === email)?.userId;
  };

  await test("Không còn vai trò Phó nhà; vai trò hệ thống = Admin, Trưởng nhà, Thủ quỹ, Thành viên; các ban là vai trò tự tạo", async () => {
    const r = await admin.get("/api/v1/rbac");
    eq(r.status, 200);
    const codes = r.json.roles.map((x) => x.code);
    ok(!codes.includes("vice_head"), "vẫn còn vice_head trong /api/v1/rbac");
    eq(
      r.json.roles.filter((x) => x.isSystem).map((x) => x.code).sort().join(","),
      "admin,house_head,member,treasurer",
      "vai trò hệ thống",
    );
    for (const c of ["liturgy_lead", "kitchen_lead", "media_lead"]) ok(r.json.roles.find((x) => x.code === c)?.isSystem === false, `${c} phải là vai trò tự tạo`);
    eq(r.json.canManage, true, "Admin có auth.role.manage");
    eq(r.json.canAssign, true, "Admin có auth.role.assign");
    ok(r.json.protectedPermissions.includes("auth.role.assign") && r.json.protectedPermissions.includes("member.national_id.read"), "thiếu danh sách quyền bảo vệ");
  });

  await test("Phó nhà cũ (long.le) giờ chỉ là Thành viên", async () => {
    const c = await as("long.le@luuxa.local");
    const me = (await c.get("/api/v1/auth/me")).json;
    eq(me.roles.join(","), "member");
    ok(!me.permissions.includes("application.review") && !me.permissions.includes("duty.review"), "còn quyền của Phó nhà");
  });

  await test("Admin có quyền gán vai trò, quản lý nhiệm kỳ và trách vụ (auth.role.assign, term.manage, position.manage)", async () => {
    const me = (await admin.get("/api/v1/auth/me")).json;
    for (const p of ["auth.role.manage", "auth.role.assign", "term.manage", "position.manage", "auth.user.manage"]) ok(me.permissions.includes(p), `Admin thiếu ${p}`);
    ok(!me.permissions.includes("finance.expense.approve") && !me.permissions.includes("member.national_id.read"), "Admin không được có quyền tài chính / CCCD");
  });

  await test("Thành viên thường: chỉ xem ma trận; thêm vai trò / xem danh sách tài khoản → 403", async () => {
    const m = (await member.get("/api/v1/rbac")).json;
    eq(m.canManage, false);
    eq((await member.post("/api/v1/rbac/roles", { code: `hack_${suffix}`, name: "Ban Hack", permissions: ["poll.manage"] })).status, 403);
    eq((await member.get("/api/v1/accounts")).status, 403);
    eq((await member.del("/api/v1/rbac/roles/kitchen_lead")).status, 403);
  });

  await test("Trưởng nhà không thêm được vai trò (chỉ Admin có auth.role.manage) → 403", async () => {
    eq((await head.post("/api/v1/rbac/roles", { code: `ht_${suffix}`, name: "Ban Trưởng nhà thử", permissions: [] })).status, 403);
  });

  await test("Vai trò tự tạo không được nhận quyền bảo vệ (auth.role.assign) → 403 BR-RBAC-02", async () => {
    const r = await admin.post("/api/v1/rbac/roles", { code: `leo_${suffix}`, name: "Ban Leo thang", permissions: ["event.read", "auth.role.assign"] });
    eq(r.status, 403, JSON.stringify(r.json));
    eq(code(r), "BR-RBAC-02");
    const roles = (await admin.get("/api/v1/rbac")).json.roles.map((x) => x.code);
    ok(!roles.includes(`leo_${suffix}`), "vai trò không được tạo");
  });

  await test("Admin thêm vai trò tự tạo có quyền (Bỏ phiếu/khảo sát) → 201; mã trùng → 409", async () => {
    const r = await admin.post("/api/v1/rbac/roles", { code: roleCode, name: `Ban Thử nghiệm ${suffix}`, description: "Vai trò kiểm thử", permissions: ["poll.manage", "event.read"] });
    eq(r.status, 201, JSON.stringify(r.json));
    const role = (await admin.get("/api/v1/rbac")).json.roles.find((x) => x.code === roleCode);
    ok(role && role.isSystem === false, "không thấy vai trò mới");
    eq(role.permissions.slice().sort().join(","), "event.read,poll.manage");
    eq((await admin.post("/api/v1/rbac/roles", { code: roleCode, name: "Ban khác", permissions: [] })).status, 409);
  });

  let tuanUid;
  await test("Admin gán vai trò tự tạo cho thành viên ⇒ thành viên có quyền đó ngay (/auth/me)", async () => {
    tuanUid = await userIdOf("tuan.nguyen@luuxa.local");
    ok(tuanUid, "không thấy tài khoản tuan.nguyen");
    ok(accounts.assignableRoles.some((x) => x.code === roleCode), "vai trò mới phải có trong danh sách gán được");
    ok(!accounts.assignableRoles.some((x) => x.code === "vice_head"), "không còn Phó nhà trong danh sách gán được");
    ok(!(await member.get("/api/v1/auth/me")).json.permissions.includes("poll.manage"), "trước khi gán đã có poll.manage?");
    const r = await admin.post(`/api/v1/accounts/${tuanUid}/roles`, { role: roleCode, grant: true });
    eq(r.status, 200, JSON.stringify(r.json));
    ok(r.json.roles.includes(roleCode), "phải trả vai trò vừa gán");
    const me = (await member.get("/api/v1/auth/me")).json;
    ok(me.roles.includes(roleCode) && me.permissions.includes("poll.manage"), "thành viên chưa có quyền của vai trò mới");
  });

  await test("Sửa bộ quyền vai trò tự tạo có hiệu lực ngay với người đang giữ", async () => {
    const r = await admin.patch(`/api/v1/rbac/roles/${roleCode}`, { permissions: ["event.read", "vendor.manage"] });
    eq(r.status, 200, JSON.stringify(r.json));
    const me = (await member.get("/api/v1/auth/me")).json;
    ok(!me.permissions.includes("poll.manage") && me.permissions.includes("vendor.manage"), "bộ quyền mới chưa áp dụng");
  });

  await test("Vai trò hệ thống: không đổi được bộ quyền (BR-RBAC-01), không xóa được (BR-RBAC-04); đổi tên hiển thị được", async () => {
    const r1 = await admin.patch("/api/v1/rbac/roles/treasurer", { permissions: ["event.read"] });
    eq(r1.status, 422, JSON.stringify(r1.json));
    eq(code(r1), "BR-RBAC-01");
    const r2 = await admin.del("/api/v1/rbac/roles/house_head");
    eq(r2.status, 422, JSON.stringify(r2.json));
    eq(code(r2), "BR-RBAC-04");
    const before = (await admin.get("/api/v1/rbac")).json.roles.find((x) => x.code === "treasurer");
    eq((await admin.patch("/api/v1/rbac/roles/treasurer", { name: "Thủ quỹ (thử đổi tên)" })).status, 200);
    eq((await admin.get("/api/v1/rbac")).json.roles.find((x) => x.code === "treasurer").name, "Thủ quỹ (thử đổi tên)");
    eq((await admin.patch("/api/v1/rbac/roles/treasurer", { name: before.name })).status, 200, "trả lại tên cũ");
    const after = (await admin.get("/api/v1/rbac")).json.roles.find((x) => x.code === "treasurer");
    eq(after.permissionCount, before.permissionCount, "bộ quyền Thủ quỹ không được đổi");
    eq(after.description, before.description, "PATCH không gửi mô tả phải giữ nguyên mô tả");
  });

  await test("Admin không tự gán vai trò cho chính mình → 422 SELF_ROLE", async () => {
    const adminUid = await userIdOf("viet.vu@luuxa.local");
    const r = await admin.post(`/api/v1/accounts/${adminUid}/roles`, { role: roleCode, grant: true });
    eq(r.status, 422, JSON.stringify(r.json));
    eq(code(r), "SELF_ROLE");
    ok(!(await admin.get("/api/v1/auth/me")).json.roles.includes(roleCode), "Admin đã tự gán được vai trò");
  });

  await test("Admin đặt lại mật khẩu của Thủ quỹ (tài khoản đặc quyền) → mật khẩu tạm, phiên cũ bị thu hồi", async () => {
    const treasurer = await as("bao.pham@luuxa.local");
    const baoUid = await userIdOf("bao.pham@luuxa.local");
    eq((await member.post(`/api/v1/accounts/${baoUid}/password-reset`)).status, 403, "thành viên thường không được đặt lại");
    const r = await admin.post(`/api/v1/accounts/${baoUid}/password-reset`);
    eq(r.status, 200, JSON.stringify(r.json));
    ok(r.json.temporaryPassword, "phải trả mật khẩu tạm");
    eq((await treasurer.get("/api/v1/auth/me")).status, 401, "phiên cũ của Thủ quỹ phải bị thu hồi");
    const c = await new Client("bao-temp").login("bao.pham@luuxa.local", r.json.temporaryPassword);
    eq((await c.get("/api/v1/auth/me")).json.user.mustChangePassword, true);
    // Trả lại mật khẩu demo cho các suite sau
    eq((await c.post("/api/v1/auth/password", { currentPassword: r.json.temporaryPassword, newPassword: PW })).status, 200, "đổi lại mật khẩu demo");
    await as("bao.pham@luuxa.local");
  });

  await test("Admin không tự đặt lại mật khẩu / tự khóa tài khoản của mình (422)", async () => {
    const adminUid = await userIdOf("viet.vu@luuxa.local");
    eq((await admin.post(`/api/v1/accounts/${adminUid}/password-reset`)).status, 422);
    eq((await admin.patch(`/api/v1/accounts/${adminUid}`, { action: "lock" })).status, 422);
  });

  await test("Admin cấp tài khoản, khóa / mở khóa, vô hiệu / kích hoạt lại tài khoản thành viên", async () => {
    const email = `rbac.${suffix}@luuxa.local`;
    const p = await head.post("/api/v1/members", { fullName: `Phêrô Thử Tài Khoản ${suffix}` });
    eq(p.status, 201, JSON.stringify(p.json));
    const created = await admin.post("/api/v1/accounts", { memberId: p.json.id, email });
    eq(created.status, 201, JSON.stringify(created.json));
    const pw = created.json.temporaryPassword;
    const uid = await userIdOf(email);
    ok(uid, "không thấy tài khoản mới trong danh sách");
    const row = accounts.items.find((a) => a.userId === uid);
    eq(row.status, "active");
    ok(row.roles.some((x) => x.code === "member"), "tài khoản mới phải có vai trò Thành viên");
    eq((await member.patch(`/api/v1/accounts/${uid}`, { action: "lock" })).status, 403, "thành viên thường không khóa được");
    eq((await admin.patch(`/api/v1/accounts/${uid}`, { action: "lock" })).status, 200);
    const c = await new Client("rbac-new").init();
    eq((await c.post("/api/v1/auth/login", { identifier: email, password: pw })).status, 423, "tài khoản bị khóa không đăng nhập được");
    eq((await admin.patch(`/api/v1/accounts/${uid}`, { action: "unlock" })).status, 200);
    eq((await c.post("/api/v1/auth/login", { identifier: email, password: pw })).status, 200, "mở khóa xong đăng nhập được");
    eq((await admin.patch(`/api/v1/accounts/${uid}`, { action: "disable" })).status, 200);
    eq((await c.get("/api/v1/auth/me")).status, 401, "vô hiệu ⇒ phiên bị thu hồi");
    const c2 = await new Client("rbac-new2").init();
    eq((await c2.post("/api/v1/auth/login", { identifier: email, password: pw })).status, 403, "tài khoản vô hiệu không đăng nhập được");
    eq((await admin.patch(`/api/v1/accounts/${uid}`, { action: "enable" })).status, 200);
    eq((await c2.post("/api/v1/auth/login", { identifier: email, password: pw })).status, 200, "kích hoạt lại xong đăng nhập được");
  });

  await test("Xóa vai trò đang có người giữ ⇒ lưu trữ, người giữ mất quyền ngay; không gán lại được", async () => {
    const r = await admin.del(`/api/v1/rbac/roles/${roleCode}`);
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.result, "archived");
    const me = (await member.get("/api/v1/auth/me")).json;
    ok(!me.roles.includes(roleCode) && !me.permissions.includes("vendor.manage"), "người giữ vẫn còn quyền của vai trò đã xóa");
    ok(!(await admin.get("/api/v1/rbac")).json.roles.some((x) => x.code === roleCode), "vai trò đã xóa vẫn hiện trong /rbac");
    const again = await admin.post(`/api/v1/accounts/${tuanUid}/roles`, { role: roleCode, grant: true });
    eq(again.status, 400, JSON.stringify(again.json));
    eq((await admin.post("/api/v1/rbac/roles", { code: roleCode, name: "Dùng lại mã", permissions: [] })).status, 409, "mã đã lưu trữ không dùng lại được");
    ok(detail(again).length > 0, "phải có thông điệp lỗi");
  });

  await test("Xóa vai trò chưa từng gán ⇒ xóa hẳn", async () => {
    eq((await admin.post("/api/v1/rbac/roles", { code: tempRole, name: `Ban Tạm ${suffix}`, permissions: ["poll.manage"] })).status, 201);
    const r = await admin.del(`/api/v1/rbac/roles/${tempRole}`);
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.result, "deleted");
  });
}
