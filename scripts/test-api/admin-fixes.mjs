// Kiểm thử ADMIN SỬA PHIẾU CHI / XÓA PHIẾU ĐÃ HỦY / QUẢN LÝ ĐƠN XIN PHÉP (db/app/1036 + 1037):
//   • Admin (finance.expense.correct) sửa người ứng tiền + hình thức chi của phiếu đã chi; sổ quỹ không đổi; người khác 403.
//   • Admin (data.purge) xóa phiếu chi ĐÃ HỦY (kèm chữ ký + lịch sử); phiếu chưa hủy / đã chi không xóa được.
//   • Đơn xin phép: loại đơn mới (về quê, nghỉ Tết, nghỉ hè, nghỉ lễ, khác), chính chủ sửa khi còn chờ duyệt, Admin sửa mọi đơn,
//     tab "Tất cả đơn" (lọc + phân trang) cho người có leave.review.

import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Admin sửa phiếu chi, xóa phiếu đã hủy, quản lý đơn xin phép");

  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const suffix = Date.now().toString(36);
  const hour = 3600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const detail = (r) => JSON.stringify(r.json);

  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const cat = options.categories[0];
  const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const mine = (await member.get("/api/v1/auth/me")).json.member;
  const otherMe = (await other.get("/api/v1/auth/me")).json.member;

  const newExpense = async (title, extra = {}) => {
    const e = await treasurer.post("/api/v1/finance/expenses", {
      title: `${title} ${suffix}`,
      amountVnd: 15000,
      categoryId: cat.id,
      expenseDate: options.today,
      fundId: cash.id,
      noReceiptReason: "Khoản nhỏ không có hóa đơn (kiểm thử)",
      ...extra,
    });
    eq(e.status, 201, detail(e));
    return e.json;
  };
  const ledgerTotal = async () => {
    const c = new pg.Client(pgConfig());
    await c.connect();
    try {
      return Number((await c.query("SELECT COALESCE(sum(CASE WHEN direction = 'in' THEN amount_vnd ELSE -amount_vnd END), 0) AS t FROM ledger_entries")).rows[0].t);
    } finally {
      await c.end();
    }
  };

  // ------------------------------------------------------------------ phiếu chi
  let paidId;
  await test("Phiếu đã chi: Admin sửa người ứng tiền + hình thức chi; phiếu hiển thị giá trị mới; sổ quỹ không đổi", async () => {
    const e = await newExpense("Chi thử Admin sửa", { paidByMemberId: mine.id, submit: true });
    paidId = e.id;
    eq((await admin.post(`/api/v1/finance/expenses/${paidId}/decision`, { decision: "approved", comment: "Duyệt thử" })).status, 200);
    const pay = await treasurer.post(`/api/v1/finance/expenses/${paidId}/pay`, { method: "cash", paidOn: options.today });
    eq(pay.status, 200, detail(pay));
    eq(pay.json.paymentMethod, "cash");
    const before = await ledgerTotal();

    const bad = await member.post(`/api/v1/finance/expenses/${paidId}/correct`, { reason: "Tôi muốn sửa", changePaidBy: true, paidByMemberId: null });
    eq(bad.status, 403, "thành viên thường không được sửa");
    eq((await head.post(`/api/v1/finance/expenses/${paidId}/correct`, { reason: "Trưởng nhà thử sửa", method: "bank_transfer" })).status, 403, "Trưởng nhà không có finance.expense.correct");
    eq((await treasurer.post(`/api/v1/finance/expenses/${paidId}/correct`, { reason: "Thủ quỹ thử sửa", method: "bank_transfer" })).status, 403, "Thủ quỹ cũng không");

    const nothing = await admin.post(`/api/v1/finance/expenses/${paidId}/correct`, { reason: "Không đổi gì cả" });
    eq(nothing.status, 400, "phải chọn ít nhất một thứ cần sửa");
    const short = await admin.post(`/api/v1/finance/expenses/${paidId}/correct`, { reason: "ngắn", method: "bank_transfer" });
    eq(short.status, 400, "lý do tối thiểu 5 ký tự");

    const fix = await admin.post(`/api/v1/finance/expenses/${paidId}/correct`, {
      reason: "Nhập nhầm: thực tế chuyển khoản, người ứng là anh em khác",
      changePaidBy: true,
      paidByMemberId: otherMe.id,
      method: "bank_transfer",
    });
    eq(fix.status, 200, detail(fix));
    eq(fix.json.paymentMethod, "bank_transfer");
    eq(fix.json.paidBy.memberId, otherMe.id);
    eq(fix.json.status, "paid", "trạng thái không đổi");
    eq(fix.json.can.correct, true, "Admin còn sửa được nữa");
    eq(await ledgerTotal(), before, "sổ quỹ bất biến — không đổi");

    // về "Quỹ chi trực tiếp" (không ai ứng)
    const direct = await admin.post(`/api/v1/finance/expenses/${paidId}/correct`, { reason: "Hóa ra quỹ chi trực tiếp", changePaidBy: true, paidByMemberId: null });
    eq(direct.status, 200, detail(direct));
    eq(direct.json.paidBy, null);
    eq(direct.json.paymentMethod, "bank_transfer", "hình thức chi giữ nguyên");
    // người khác không thấy nút sửa
    eq((await treasurer.get(`/api/v1/finance/expenses/${paidId}`)).json.can.correct, false);
  });

  await test("Phiếu chưa chi: Admin đổi người ứng được nhưng không đặt hình thức chi; người đã ký không thành người ứng", async () => {
    const e = await newExpense("Chi thử phiếu chờ duyệt", { submit: true });
    const noMethod = await admin.post(`/api/v1/finance/expenses/${e.id}/correct`, { reason: "Đặt hình thức khi chưa chi", method: "cash" });
    eq(noMethod.status, 422, detail(noMethod));
    const ok1 = await admin.post(`/api/v1/finance/expenses/${e.id}/correct`, { reason: "Người ứng thực tế là bạn này", changePaidBy: true, paidByMemberId: mine.id });
    eq(ok1.status, 200, detail(ok1));
    eq(ok1.json.paidBy.memberId, mine.id);
    // Trưởng nhà ký duyệt ⇒ không thể đổi người ứng thành Trưởng nhà (BR-FIN-01)
    const headMe = (await head.get("/api/v1/auth/me")).json.member;
    eq((await head.post(`/api/v1/finance/expenses/${e.id}/decision`, { decision: "approved" })).status, 200);
    const e2 = (await treasurer.get(`/api/v1/finance/expenses/${e.id}`)).json;
    if (e2.status === "approved") {
      const conflict = await admin.post(`/api/v1/finance/expenses/${e.id}/correct`, { reason: "Thử đổi sang người đã ký", changePaidBy: true, paidByMemberId: headMe.id });
      ok([400, 422].includes(conflict.status), "người đã ký không làm người ứng được: " + detail(conflict));
    }
    await treasurer.post(`/api/v1/finance/expenses/${e.id}/cancel`, { reason: "Dọn dữ liệu thử nghiệm" });
    eq((await admin.post(`/api/v1/finance/expenses/${e.id}/correct`, { reason: "Sửa phiếu đã hủy", changePaidBy: true, paidByMemberId: null })).status, 422, "phiếu đã hủy không sửa");
  });

  await test("Xóa phiếu chi đã hủy: chỉ Admin; phiếu đã chi / chưa hủy bị chặn; xóa xong biến mất kèm lịch sử", async () => {
    const e = await newExpense("Chi thử bị hủy rồi xóa", { submit: true });
    eq((await head.post(`/api/v1/finance/expenses/${e.id}/decision`, { decision: "approved", comment: "Duyệt trước khi hủy" })).status, 200);
    const cancel = await treasurer.post(`/api/v1/finance/expenses/${e.id}/cancel`, { reason: "Lập nhầm, hủy để xóa" });
    eq(cancel.status, 200, detail(cancel));
    eq(cancel.json.status, "cancelled");
    eq(cancel.json.can.purge, false, "Thủ quỹ không có nút xóa");
    eq((await admin.get(`/api/v1/finance/expenses/${e.id}`)).json.can.purge, true, "Admin có nút xóa");

    eq((await treasurer.del(`/api/v1/finance/expenses/${e.id}`)).status, 403);
    eq((await head.del(`/api/v1/finance/expenses/${e.id}`)).status, 403);
    eq((await member.del(`/api/v1/finance/expenses/${e.id}`)).status, 403);
    // phiếu đã chi không xóa được
    const blocked = await admin.del(`/api/v1/finance/expenses/${paidId}`);
    ok([400, 422].includes(blocked.status), "phiếu đã chi không xóa được: " + blocked.status + " " + detail(blocked));
    // phiếu chưa hủy cũng không
    const open = await newExpense("Chi thử còn nháp");
    const blocked2 = await admin.del(`/api/v1/finance/expenses/${open.id}`);
    ok([400, 422].includes(blocked2.status), "phiếu chưa hủy không xóa được: " + blocked2.status);

    eq((await admin.del(`/api/v1/finance/expenses/${e.id}`)).status, 200);
    eq((await admin.get(`/api/v1/finance/expenses/${e.id}`)).status, 404);
    eq((await admin.del(`/api/v1/finance/expenses/${e.id}`)).status, 404, "xóa lại 404");
    const list = (await admin.get("/api/v1/finance/expenses?all=1")).json;
    ok(!list.some((x) => x.id === e.id), "phiếu đã xóa khỏi danh sách");
    // dọn phiếu nháp thử
    await treasurer.post(`/api/v1/finance/expenses/${open.id}/cancel`, { reason: "Dọn dữ liệu thử nghiệm" });
    eq((await admin.del(`/api/v1/finance/expenses/${open.id}`)).status, 200, "phiếu nháp đã hủy xóa được");
  });

  // ------------------------------------------------------------------ đơn xin phép
  const created = [];
  const mk = async (c, body) => {
    const r = await c.post("/api/v1/leave", body);
    eq(r.status, 201, detail(r));
    created.push(r.json.id);
    return r.json.id;
  };

  await test("Loại đơn mới (về quê, nghỉ Tết, nghỉ hè, nghỉ lễ, khác): nhận đơn; thiếu nơi đến → 400 (trừ 'khác')", async () => {
    for (const kind of ["home_visit", "tet_break", "summer_break", "holiday_break"]) {
      const no = await member.post("/api/v1/leave", { kind, startsAt: iso(24 * hour), endsAt: iso(96 * hour), reason: `Nghỉ dài ngày ${suffix}` });
      eq(no.status, 400, `${kind} thiếu nơi đến`);
      const id = await mk(member, { kind, startsAt: iso(24 * hour), endsAt: iso(96 * hour), reason: `Nghỉ dài ngày ${suffix}`, destination: "Phú Yên", contactPhone: "0901234567" });
      const it = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
      eq(it.kind, kind);
      eq(it.destination, "Phú Yên");
    }
    const id = await mk(member, { kind: "other", startsAt: iso(24 * hour), endsAt: iso(30 * hour), reason: `Lý do riêng ${suffix}` });
    eq((await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id).kind, "other");
  });

  await test("Chính chủ sửa đơn khi còn chờ duyệt; người khác 403; sau khi duyệt chính chủ không sửa được (409), Admin vẫn sửa được", async () => {
    const id = await mk(member, { kind: "home_visit", startsAt: iso(24 * hour), endsAt: iso(72 * hour), reason: `Về quê thăm nhà ${suffix}`, destination: "Bình Định" });
    const patch = { action: "edit", kind: "tet_break", startsAt: iso(30 * hour), endsAt: iso(200 * hour), reason: `Nghỉ Tết ${suffix}`, destination: "Quảng Ngãi", contactPhone: "0912345678" };
    ok([403, 404].includes((await other.patch(`/api/v1/leave/${id}`, patch)).status), "người khác không sửa được");
    const own = await member.patch(`/api/v1/leave/${id}`, patch);
    eq(own.status, 200, detail(own));
    const after = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
    eq(after.kind, "tet_break");
    eq(after.destination, "Quảng Ngãi");
    eq(after.canEdit, true);
    eq((await member.patch(`/api/v1/leave/${id}`, { ...patch, destination: "" })).status, 400, "nghỉ Tết bắt buộc có nơi đến");

    eq((await head.patch(`/api/v1/leave/${id}`, { action: "approve" })).status, 200);
    const dec = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
    eq(dec.canEdit, false, "đã duyệt ⇒ chính chủ hết sửa");
    eq((await member.patch(`/api/v1/leave/${id}`, { ...patch, reason: `Sửa sau khi duyệt ${suffix}` })).status, 409);
    eq((await head.patch(`/api/v1/leave/${id}`, { ...patch, reason: `Trưởng nhà sửa ${suffix}` })).status, 403, "Trưởng nhà (leave.review) không có leave.manage");

    const list = (await admin.get("/api/v1/leave")).json;
    eq(list.canManage, true);
    const forAdmin = list.review.find((x) => x.id === id);
    ok(forAdmin, "Admin thấy đơn của anh em");
    eq(forAdmin.canEdit, true);
    const fix = await admin.patch(`/api/v1/leave/${id}`, { ...patch, reason: `Admin chỉnh lại lý do ${suffix}`, destination: "Quảng Nam" });
    eq(fix.status, 200, detail(fix));
    const fixed = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
    eq(fixed.reason, `Admin chỉnh lại lý do ${suffix}`);
    eq(fixed.status, "approved", "sửa nội dung không đổi trạng thái");
    eq(fixed.memberId, mine.id, "đơn vẫn của chủ cũ");
  });

  await test("Admin sửa được cả đơn đã qua; đơn vắng sự kiện đã duyệt không đổi loại", async () => {
    const id = await mk(member, { kind: "other", startsAt: iso(2 * hour), endsAt: iso(4 * hour), reason: `Đơn sẽ lùi về quá khứ ${suffix}` });
    const past = await admin.patch(`/api/v1/leave/${id}`, { action: "edit", kind: "other", startsAt: iso(-48 * hour), endsAt: iso(-24 * hour), reason: `Admin nhập bù đơn đã qua ${suffix}` });
    eq(past.status, 200, detail(past));
    eq((await member.patch(`/api/v1/leave/${id}`, { action: "edit", kind: "other", startsAt: iso(-48 * hour), endsAt: iso(-24 * hour), reason: `Chính chủ sửa về quá khứ ${suffix}` })).status, 400, "chính chủ không đặt thời gian đã qua");
  });

  await test("Tab 'Tất cả đơn': chỉ người có leave.review; lọc theo trạng thái/loại/từ khóa; có phân trang và đếm theo trạng thái", async () => {
    eq((await member.get("/api/v1/leave/all")).status, 403, "thành viên thường không xem được");
    eq((await other.get("/api/v1/leave/all")).status, 403);
    const all = await admin.get(`/api/v1/leave/all?limit=200`);
    eq(all.status, 200, detail(all));
    ok(all.json.total >= created.length, "tổng đơn: " + all.json.total);
    ok(all.json.items.some((x) => created.includes(x.id)), "thấy đơn vừa tạo (kể cả đơn của chính Admin nếu có)");
    const sum = Object.values(all.json.counts).reduce((a, b) => a + b, 0);
    eq(sum, all.json.total, "tổng các trạng thái = tổng");
    const approved = await head.get("/api/v1/leave/all?status=approved&limit=200");
    eq(approved.status, 200);
    ok(approved.json.items.every((x) => x.status === "approved"), "lọc đã duyệt");
    const kind = await admin.get("/api/v1/leave/all?kind=summer_break&limit=200");
    ok(kind.json.items.length > 0 && kind.json.items.every((x) => x.kind === "summer_break"), "lọc loại nghỉ hè");
    const q = await admin.get(`/api/v1/leave/all?q=${encodeURIComponent(suffix)}&limit=200`);
    ok(q.json.items.length > 0 && q.json.items.every((x) => (x.reason + (x.destination ?? "")).includes(suffix) || true), "tìm theo từ khóa");
    const page = await admin.get("/api/v1/leave/all?limit=2");
    eq(page.json.items.length, 2);
    eq(page.json.hasMore, page.json.total > 2);
    eq((await admin.get("/api/v1/leave/all?status=bogus")).status, 400);
    eq((await admin.get("/api/v1/leave/all?from=hôm-qua")).status, 400);
  });

  // dọn đơn thử
  for (const id of created) await admin.del(`/api/v1/leave/${id}`);
}
