// Kiểm thử ADMIN CÓ TOÀN QUYỀN (db/app/1002 + 1027): có đủ mọi mã quyền, thao tác được các việc vốn gắn với Trưởng nhà/Thủ quỹ
// (duyệt đơn xin phép của người khác, duyệt phiếu chi, sửa tài khoản nhận quỹ, đăng bài công khai, báo cáo…), nhưng quy tắc TÁCH NGƯỜI
// (không tự duyệt đơn / phiếu của chính mình) vẫn giữ.

export async function run({ as, test, eq, ok, section }) {
  section("Admin có toàn quyền");

  const admin = await as("viet.vu@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const suffix = Date.now().toString(36);
  const hour = 3600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();

  await test("Admin có TẤT CẢ mã quyền trong hệ thống (khớp bảng permissions)", async () => {
    const me = (await admin.get("/api/v1/auth/me")).json;
    const rbac = (await admin.get("/api/v1/rbac")).json;
    const all = rbac.modules.flatMap((m) => m.permissions.map((p) => p.code));
    ok(all.length > 100, "không đọc được danh sách quyền: " + all.length);
    const missing = all.filter((c) => !me.permissions.includes(c));
    eq(missing.length, 0, "Admin thiếu quyền: " + missing.slice(0, 5).join(", "));
    const adminRole = rbac.roles.find((r) => r.code === "admin");
    const roleMissing = all.filter((c) => !adminRole.permissions.includes(c));
    eq(roleMissing.length, 0, "vai trò admin trong ma trận thiếu: " + roleMissing.slice(0, 5).join(", "));
    for (const c of ["report.read", "leave.review", "leave.request", "article.manage", "application.review", "finance.expense.approve", "finance.reconcile", "member.update"]) ok(me.permissions.includes(c), `thiếu ${c}`);
  });

  await test("Admin duyệt được đơn xin phép của thành viên; không tự duyệt đơn của chính mình", async () => {
    const r = await member.post("/api/v1/leave", { kind: "late_return", startsAt: iso(2 * hour), endsAt: iso(5 * hour), reason: `Admin duyệt thử ${suffix}` });
    eq(r.status, 201, JSON.stringify(r.json));
    const list = (await admin.get("/api/v1/leave")).json;
    eq(list.canReview, true);
    ok(list.review.some((x) => x.id === r.json.id), "Admin phải thấy đơn chờ duyệt");
    eq((await admin.patch(`/api/v1/leave/${r.json.id}`, { action: "approve" })).status, 200);
    const own = await admin.post("/api/v1/leave", { kind: "late_return", startsAt: iso(2 * hour), endsAt: iso(5 * hour), reason: `Admin tự duyệt ${suffix}` });
    eq(own.status, 201);
    eq((await admin.patch(`/api/v1/leave/${own.json.id}`, { action: "approve" })).status, 403, "không tự duyệt đơn của mình");
    await admin.patch(`/api/v1/leave/${own.json.id}`, { action: "cancel" });
  });

  await test("Admin duyệt được phiếu chi do Thủ quỹ lập (được tính là Trưởng nhà + Thủ quỹ khi ký duyệt)", async () => {
    const options = (await treasurer.get("/api/v1/finance/options")).json;
    const cat = options.categories[0];
    const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
    const e = await treasurer.post("/api/v1/finance/expenses", {
      title: `Chi thử Admin duyệt ${suffix}`,
      amountVnd: 12000,
      categoryId: cat.id,
      expenseDate: options.today,
      fundId: cash.id,
      noReceiptReason: "Khoản nhỏ không có hóa đơn (kiểm thử)",
      submit: true,
    });
    eq(e.status, 201, JSON.stringify(e.json));
    const d = await admin.post(`/api/v1/finance/expenses/${e.json.id}/decision`, { decision: "approved", comment: "Admin duyệt" });
    eq(d.status, 200, JSON.stringify(d.json));
    ok(["approved", "paid"].includes(d.json.status), "phiếu phải được duyệt: " + d.json.status);
    // dọn: hủy phiếu thử
    await treasurer.post(`/api/v1/finance/expenses/${e.json.id}/cancel`, { reason: "Dọn dữ liệu thử nghiệm" });
  });

  await test("Admin sửa được tài khoản nhận quỹ và đọc báo cáo hoạt động, thống kê, giao dịch ngân hàng", async () => {
    const acc = (await treasurer.get("/api/v1/finance/receiving-account")).json.account;
    if (acc) eq((await admin.req("PUT", "/api/v1/finance/receiving-account", acc)).status, 200);
    const y = new Date().getFullYear();
    eq((await admin.get(`/api/v1/reports/activity?kind=year&year=${y}`)).status, 200);
    eq((await admin.get("/api/v1/finance/bank-lines")).status, 200);
    eq((await admin.get("/api/v1/inquiries")).status, 200);
    eq((await admin.get("/api/v1/faqs")).status, 200);
  });

  await test("Cấu hình không còn 'giá tham chiếu một suất cơm' (đã bỏ); tuần bếp không trả giá tham chiếu", async () => {
    const items = (await admin.get("/api/v1/settings")).json.items;
    ok(!items.some((x) => x.key === "meal.price_per_serving_vnd"), "khóa meal.price_per_serving_vnd phải đã bị xóa");
    const w = (await member.get("/api/v1/meals")).json;
    if (w?.settings) ok(!("pricePerServing" in w.settings), "settings của tuần bếp không còn pricePerServing");
  });

  await test("Thành viên thường vẫn KHÔNG có các quyền đó (admin không làm lộ quyền cho người khác)", async () => {
    eq((await member.get("/api/v1/reports/activity?kind=year&year=2026")).status, 403);
    eq((await member.get("/api/v1/finance/bank-lines")).status, 403);
  });
}
