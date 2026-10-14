// Kiểm thử QUỸ RIÊNG CHO CHUYẾN ĐI / SỰ KIỆN (db/app/1054): lập quỹ, người phụ trách, người ngoài, ghi thu / hủy thu, phiếu chi 1 chữ ký,
// bù từ quỹ nhà, đóng quỹ (hoàn lại theo tỷ lệ / chuyển dư về quỹ nhà) và — quan trọng nhất — CÔ LẬP số liệu quỹ nhà.

import { randomUUID } from "node:crypto";

export async function run({ as, test, eq, ok, section }) {
  section("Quỹ riêng cho chuyến đi / sự kiện");

  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà
  const treasurer = await as("bao.pham@luuxa.local"); // Thủ quỹ
  const mgr = await as("long.le@luuxa.local"); // thành viên thường — sẽ là NGƯỜI PHỤ TRÁCH quỹ
  const member = await as("tuan.nguyen@luuxa.local"); // người tham gia
  const member2 = await as("kiet.do@luuxa.local"); // người tham gia
  const stranger = await as("hieu.bui@luuxa.local"); // không liên quan
  const stamp = Date.now().toString(36);
  const idOf = async (c) => (await c.get("/api/v1/auth/me")).json.member.id;
  const mgrId = await idOf(mgr);
  const memberId = await idOf(member);
  const member2Id = await idOf(member2);
  const strangerId = await idOf(stranger);
  const base = "/api/v1/finance/event-funds";
  const put = (c, p, b) => c.req("PUT", p, b);
  const tomorrow = new Date(Date.now() + 86400_000 + 7 * 3600_000).toISOString().slice(0, 10);

  const mkEvent = async (title) => {
    const r = await head.post("/api/v1/events", { title: `${title} ${stamp}`, date: tomorrow, time: "07:00", categoryCode: "EVT_PILGRIM" });
    eq(r.status, 201, "tạo sự kiện: " + JSON.stringify(r.json));
    return r.json.id;
  };
  const houseSnapshot = async () => {
    const s = (await head.get("/api/v1/finance/summary")).json;
    const o = (await head.get("/api/v1/finance/overview")).json;
    return JSON.stringify({ bal: s.fundBalanceVnd, funds: s.funds, month: s.month, last6: s.last6Months, byCat: s.expenseByCategory, o: [o.openingVnd, o.incomeVnd, o.expenseVnd, o.closingVnd, o.fundBalanceVnd, o.funds] });
  };
  const fundBalance = async () => (await head.get("/api/v1/finance/summary")).json.fundBalanceVnd;

  const ev1 = await mkEvent("Hành hương thử");
  const ev2 = await mkEvent("Liên hoan thử");
  const house0 = await houseSnapshot();
  const houseBal0 = await fundBalance();
  let F1;
  let roster;

  await test("Lập quỹ riêng: thành viên thường / người phụ trách chưa có quyền lập (403); Trưởng nhà lập được kèm người phụ trách + người ngoài", async () => {
    const body = { eventId: ev1, name: `Quỹ hành hương ${stamp}`, managerIds: [mgrId], defaultDueVnd: 3000000, participants: [{ memberId }, { memberId: member2Id }, { guestName: "Chị Lan (giáo dân)", guestPhone: "0901 234 567" }] };
    eq((await member.post(base, body)).status, 403, "thành viên thường");
    eq((await mgr.post(base, body)).status, 403, "người sẽ phụ trách nhưng chưa có quyền lập");
    eq((await head.post(base, { ...body, managerIds: [] })).status, 400, "thiếu người phụ trách");
    const r = await head.post(base, body);
    eq(r.status, 201, JSON.stringify(r.json));
    F1 = r.json.fundId;
    ok(/^QR\d{4}/.test(r.json.code), "mã quỹ tự sinh: " + r.json.code);
    eq((await treasurer.post(base, { ...body, name: "Quỹ trùng sự kiện" })).status, 409, "một sự kiện chỉ một quỹ");
    ok(JSON.stringify((await mgr.get("/api/v1/notifications")).json).includes("phụ trách quỹ"), "người phụ trách nhận thông báo");
  });

  await test("Phạm vi xem: người phụ trách / người quản lý thấy đủ; người tham gia chỉ thấy phần của mình; người lạ không thấy", async () => {
    const lm = (await mgr.get(base)).json;
    const f = lm.items.find((x) => x.id === F1);
    ok(f, "người phụ trách thấy quỹ");
    eq(f.relation, "manager");
    eq(f.participantCount, 3);
    eq(f.dueTotalVnd, 9000000);
    const lp = (await member.get(base)).json;
    const fp = lp.items.find((x) => x.id === F1);
    ok(fp, "người tham gia thấy quỹ có tên mình");
    eq(fp.relation, "participant");
    eq(fp.balanceVnd, null, "người tham gia không thấy số dư cả quỹ");
    eq(fp.myDueVnd, 3000000);
    eq((await stranger.get(base)).json.items.filter((x) => x.id === F1).length, 0, "người lạ không thấy");
    eq((await stranger.get(`${base}/${F1}`)).status, 403, "người lạ xem chi tiết");
    const dm = (await mgr.get(`${base}/${F1}`)).json;
    roster = dm.roster;
    eq(roster.length, 3);
    eq(roster.find((p) => p.isGuest).phone, "0901234567", "người phụ trách thấy SĐT người ngoài");
    ok(dm.summary && dm.can.operate, "người phụ trách thao tác được");
    eq(dm.can.closeFund, false, "nhưng không tự đóng quỹ được");
    const dp = (await member.get(`${base}/${F1}`)).json;
    eq(dp.summary, null, "người tham gia không có tóm tắt cả quỹ");
    eq(dp.roster.length, 1);
    eq(dp.roster[0].phone, null);
    eq(dp.expenses.length, 0);
    eq(dp.can.operate, false);
    ok((await treasurer.get(`${base}/${F1}`)).json.roster.find((p) => p.isGuest).phone === "0901234567", "Thủ quỹ thấy SĐT");
  });

  const pMember = () => roster.find((p) => p.memberId === memberId).id;
  const pMember2 = () => roster.find((p) => p.memberId === member2Id).id;
  const pGuest = () => roster.find((p) => p.isGuest).id;
  const today = (await head.get("/api/v1/finance/options")).json.today;
  const rid = randomUUID();
  let partialReceipt;

  await test("Ghi thu: chỉ người phụ trách / Thủ quỹ; idempotent theo clientRequestId; người ngoài + ngoài danh sách; hủy bằng bút toán đảo", async () => {
    const mk = (pid, amt, extra = {}) => ({ participantId: pid, amountVnd: amt, method: "cash", paidOn: today, ...extra });
    eq((await member.post(`${base}/${F1}/receipts`, mk(pMember(), 100000))).status, 403, "người tham gia không tự ghi thu");
    eq((await stranger.post(`${base}/${F1}/receipts`, mk(null, 100000, { payerName: "Lén" }))).status, 403);
    eq((await mgr.post(`${base}/${F1}/receipts`, mk(null, 100000))).status, 400, "ngoài danh sách phải có tên");
    const a = await mgr.post(`${base}/${F1}/receipts`, mk(pMember(), 3000000, { clientRequestId: rid }));
    eq(a.status, 201, JSON.stringify(a.json));
    const a2 = await mgr.post(`${base}/${F1}/receipts`, mk(pMember(), 3000000, { clientRequestId: rid }));
    eq(a2.json.id, a.json.id, "gửi lại cùng clientRequestId không nhân đôi");
    eq((await mgr.post(`${base}/${F1}/receipts`, mk(pGuest(), 3000000))).status, 201, "thu của người ngoài");
    eq((await treasurer.post(`${base}/${F1}/receipts`, mk(null, 500000, { payerName: "Cô Hoa (ủng hộ)" }))).status, 201, "Thủ quỹ ghi thu ngoài danh sách");
    const p = await mgr.post(`${base}/${F1}/receipts`, mk(pMember2(), 1000000));
    eq(p.status, 201);
    partialReceipt = p.json.id;
    eq((await mgr.req("POST", `${base}/${F1}/receipts/${partialReceipt}/void`, { reason: "ok" })).status, 400, "lý do quá ngắn");
    eq((await mgr.req("POST", `${base}/${F1}/receipts/${partialReceipt}/void`, { reason: "Nhập nhầm số tiền" })).status, 200);
    eq((await mgr.req("POST", `${base}/${F1}/receipts/${partialReceipt}/void`, { reason: "Hủy lại lần nữa" })).status, 422, "hủy hai lần");
    eq((await mgr.post(`${base}/${F1}/receipts`, mk(pMember2(), 3000000))).status, 201, "thu lại đủ");
    const s = (await mgr.get(`${base}/${F1}`)).json.summary;
    eq(s.balanceVnd, 9500000);
    eq(s.receiptsVnd, 9500000);
    eq(s.participants.paidFull, 3);
  });

  await test("Cô lập: thu quỹ riêng KHÔNG làm đổi bất kỳ con số nào của quỹ nhà (tổng quan, số dư, biểu đồ, cơ cấu chi)", async () => {
    eq(await houseSnapshot(), house0);
    const opt = (await head.get("/api/v1/finance/options")).json;
    ok(opt.funds.every((f) => f.type !== "event"), "form chi thường không liệt kê quỹ riêng");
  });

  let V;
  await test("Phiếu chi quỹ riêng: người phụ trách lập, chỉ cần 1 chữ ký dù khoản lớn, người phụ trách tự ghi chi; chi vượt số dư bị chặn", async () => {
    const mk = (title, amount, extra = {}) => ({ title, amountVnd: amount, categoryId: null, expenseDate: today, fundId: F1, paidByMemberId: null, noReceiptReason: "Nhà xe không xuất hóa đơn", submit: true, ...extra });
    const cats = (await head.get("/api/v1/finance/options")).json.categories;
    const categoryId = cats[0].id;
    eq((await member.post("/api/v1/finance/expenses", { ...mk("Chi lén", 1000), categoryId })).status, 403, "người không phụ trách không lập phiếu vào quỹ này");
    const r = await mgr.post("/api/v1/finance/expenses", { ...mk(`Thuê xe 29 chỗ ${stamp}`, 2600000), categoryId });
    eq(r.status, 201, JSON.stringify(r.json));
    V = r.json;
    eq(V.status, "pending_approval");
    eq(V.requiredApprovals, 1, "quỹ riêng chỉ cần 1 chữ ký");
    eq(V.isEventFund, true);
    eq((await mgr.post(`/api/v1/finance/expenses/${V.id}/decision`, { decision: "approved" })).status, 403, "người phụ trách không tự duyệt");
    const t = await treasurer.post(`/api/v1/finance/expenses/${V.id}/decision`, { decision: "approved" });
    eq(t.status, 422, "Thủ quỹ chỉ tự duyệt khoản nhỏ: " + JSON.stringify(t.json));
    eq((await head.post(`/api/v1/finance/expenses/${V.id}/decision`, { decision: "approved" })).status, 200, "Trưởng nhà duyệt");
    const d = (await mgr.get(`/api/v1/finance/expenses/${V.id}`)).json;
    eq(d.status, "approved");
    eq(d.can.pay, true, "người phụ trách thấy nút ghi chi");
    const other = await member.post(`/api/v1/finance/expenses/${V.id}/pay`, { method: "cash", paidOn: today });
    ok(other.status === 403 || other.status === 404, "người khác không ghi chi (không thấy phiếu ⇒ 404, không lộ phiếu tồn tại): " + other.status);
    eq((await mgr.post(`/api/v1/finance/expenses/${V.id}/pay`, { method: "cash", paidOn: today })).status, 200, "người phụ trách ghi chi");
    const s = (await mgr.get(`${base}/${F1}`)).json;
    eq(s.summary.balanceVnd, 9500000 - 2600000);
    eq(s.summary.spentVnd, 2600000);
    ok(s.expenses.some((e) => e.id === V.id && e.status === "paid"), "phiếu hiện trong quỹ");
    // chi vượt số dư
    const big = await mgr.post("/api/v1/finance/expenses", { ...mk("Chi quá tay", 50000000), categoryId });
    eq(big.status, 201);
    eq((await head.post(`/api/v1/finance/expenses/${big.json.id}/decision`, { decision: "approved" })).status, 200);
    const over = await mgr.post(`/api/v1/finance/expenses/${big.json.id}/pay`, { method: "cash", paidOn: today });
    eq(over.status, 422, "vượt số dư: " + JSON.stringify(over.json));
    ok(/BR-FIN-07|không đủ/.test(JSON.stringify(over.json)), "thông báo thiếu số dư");
    eq((await head.post(`/api/v1/finance/expenses/${big.json.id}/cancel`, { reason: "Hủy khoản chi quá tay" })).status, 200);
  });

  await test("Cô lập: danh sách chi, thông số 'phiếu chờ duyệt' và mọi số liệu quỹ nhà không lẫn phiếu quỹ riêng", async () => {
    const list = (await head.get("/api/v1/finance/expenses")).json;
    ok(!list.some((e) => e.id === V.id), "phiếu quỹ riêng không nằm trong danh sách chi của quỹ nhà");
    eq(await houseSnapshot(), house0, "số liệu quỹ nhà sau khi có phiếu chi quỹ riêng");
    const inFund = (await head.get(`${base}/${F1}`)).json.expenses;
    ok(inFund.some((e) => e.id === V.id), "người quản lý vẫn thấy phiếu trong quỹ riêng");
  });

  await test("Danh sách tham gia: người phụ trách thêm/sửa/gỡ; người đã đóng không gỡ được", async () => {
    const nobody = { items: [{ memberId: strangerId, dueVnd: 100000 }, { guestName: "Anh Minh", guestPhone: "0912345678", dueVnd: 200000 }] };
    eq((await put(member, `${base}/${F1}/participants`, nobody)).status, 403, "người tham gia không sửa danh sách");
    eq((await put(mgr, `${base}/${F1}/participants`, nobody)).status, 200);
    let r = (await mgr.get(`${base}/${F1}`)).json.roster;
    eq(r.filter((p) => !p.removed).length, 5);
    const added = r.find((p) => p.memberId === strangerId);
    eq((await put(mgr, `${base}/${F1}/participants`, { items: [{ id: added.id, dueVnd: 150000 }] })).status, 200);
    eq((await put(mgr, `${base}/${F1}/participants`, { items: [{ id: added.id, remove: true }] })).status, 200);
    eq((await put(mgr, `${base}/${F1}/participants`, { items: [{ id: pMember(), remove: true }] })).status, 422, "đã đóng tiền thì không gỡ được");
    const guest2 = r.find((p) => p.name === "Anh Minh");
    eq((await put(mgr, `${base}/${F1}/participants`, { items: [{ id: guest2.id, remove: true }] })).status, 200);
    // người vừa bị gỡ không còn thấy quỹ
    eq((await stranger.get(`${base}/${F1}`)).status, 403);
    roster = (await mgr.get(`${base}/${F1}`)).json.roster;
  });

  await test("Đóng quỹ: chỉ người quản lý; chặn khi còn phiếu chờ duyệt; hoàn lại theo tỷ lệ — tổng hoàn = số dư; quỹ đóng rồi không ghi thêm", async () => {
    const pend = await mgr.post("/api/v1/finance/expenses", { title: `Nước uống ${stamp}`, amountVnd: 150000, categoryId: (await head.get("/api/v1/finance/options")).json.categories[0].id, expenseDate: today, fundId: F1, paidByMemberId: null, noReceiptReason: "Mua lẻ", submit: true });
    eq(pend.status, 201, JSON.stringify(pend.json));
    eq((await mgr.post(`${base}/${F1}/close`, { mode: "refund" })).status, 403, "người phụ trách không tự đóng quỹ");
    eq((await head.post(`${base}/${F1}/close`, { mode: "bogus" })).status, 400);
    const blocked = await treasurer.post(`${base}/${F1}/close`, { mode: "refund" });
    eq(blocked.status, 422, "còn phiếu chờ duyệt: " + JSON.stringify(blocked.json));
    eq((await head.post(`/api/v1/finance/expenses/${pend.json.id}/cancel`, { reason: "Hủy, chi lẻ khác" })).status, 200);
    const bal = (await treasurer.get(`${base}/${F1}`)).json.summary.balanceVnd;
    eq(bal, 9500000 - 2600000);
    const c = await treasurer.post(`${base}/${F1}/close`, { mode: "refund", note: "Quyết toán thử" });
    eq(c.status, 200, JSON.stringify(c.json));
    eq(c.json.mode, "refund");
    eq(c.json.balanceVnd, bal);
    const d = (await treasurer.get(`${base}/${F1}`)).json;
    eq(d.summary.balanceVnd, 0, "số dư về 0");
    eq(d.summary.fund.isActive, false);
    eq(d.summary.settlement.lines.reduce((a, l) => a + l.amountVnd, 0), bal, "tổng hoàn = số dư");
    ok(d.summary.settlement.lines.every((l) => l.amountVnd <= l.paidVnd), "không ai được hoàn quá số đã đóng");
    eq(d.can.operate, false, "quỹ đã đóng không thao tác thêm");
    eq((await mgr.post(`${base}/${F1}/receipts`, { participantId: pMember(), amountVnd: 1000, method: "cash", paidOn: today })).status, 422, "đã đóng quỹ không ghi thu");
    ok(JSON.stringify((await member.get("/api/v1/notifications")).json).includes("đã quyết toán"), "người nhận hoàn được báo");
    eq((await head.post(`${base}/${F1}/close`, { mode: "refund" })).status, 422, "đóng hai lần");
    eq(await houseSnapshot(), house0, "đóng quỹ kiểu hoàn lại không đụng quỹ nhà");
  });

  await test("Quỹ thứ hai: bù từ quỹ nhà (chỉ Trưởng nhà, có lý do), chuyển phần dư về quỹ nhà — quỹ nhà tăng đúng và ghi rõ nguồn", async () => {
    const r = await treasurer.post(base, { eventId: ev2, name: `Quỹ liên hoan ${stamp}`, managerIds: [mgrId], participants: [{ guestName: "Anh Minh", dueVnd: 500000 }] });
    eq(r.status, 201, JSON.stringify(r.json));
    const F2 = r.json.fundId;
    const g = (await mgr.get(`${base}/${F2}`)).json.roster[0];
    eq((await mgr.post(`${base}/${F2}/receipts`, { participantId: g.id, amountVnd: 500000, method: "cash", paidOn: today })).status, 201);
    eq((await treasurer.post(`${base}/${F2}/subsidy`, { amountVnd: 100000, reason: "Bù tiền mua nước uống" })).status, 403, "Thủ quỹ không có quyền điều chỉnh sổ quỹ");
    eq((await head.post(`${base}/${F2}/subsidy`, { amountVnd: 100000, reason: "ngắn" })).status, 400, "lý do quá ngắn");
    eq((await head.post(`${base}/${F2}/subsidy`, { amountVnd: 100000, reason: "Bù tiền mua nước uống cho đoàn" })).status, 201);
    eq(await fundBalance(), houseBal0 - 100000, "quỹ nhà giảm đúng số tiền bù");
    const bad = await head.post(`${base}/${F2}/close`, { mode: "refund" });
    eq(bad.status, 422, "có tiền bù từ quỹ nhà thì không hoàn lại cho người đóng: " + JSON.stringify(bad.json));
    const c = await head.post(`${base}/${F2}/close`, { mode: "to_house", note: "Chuyển dư về quỹ nhà" });
    eq(c.status, 200, JSON.stringify(c.json));
    eq(c.json.balanceVnd, 600000);
    eq(await fundBalance(), houseBal0 + 500000, "quỹ nhà: −100.000 bù, +600.000 chuyển về");
    const s = (await head.get(`${base}/${F2}`)).json.summary;
    eq(s.settlement.mode, "to_house");
    eq(s.balanceVnd, 0);
    const ledger = JSON.stringify((await head.get("/api/v1/finance/ledger")).json ?? {});
    ok(ledger.length > 2, "sổ quỹ vẫn đọc được");
  });

  await test("Quyền hạn: người tham gia / người lạ không đóng quỹ, bù quỹ hay đổi người phụ trách; Trưởng nhà đổi được người phụ trách", async () => {
    const r = await head.post(base, { eventId: await mkEvent("Sự kiện thứ ba"), name: `Quỹ thứ ba ${stamp}`, managerIds: [mgrId], participants: [{ memberId }] });
    eq(r.status, 201, JSON.stringify(r.json));
    const F3 = r.json.fundId;
    eq((await put(mgr, `${base}/${F3}/managers`, { managerIds: [mgrId, member2Id] })).status, 403, "người phụ trách không tự đổi người phụ trách");
    eq((await put(head, `${base}/${F3}/managers`, { managerIds: [member2Id] })).status, 200);
    eq((await mgr.get(`${base}/${F3}`)).status, 403, "người cũ không còn quyền");
    eq((await member2.get(`${base}/${F3}`)).json.can.operate, true, "người mới được thao tác");
    eq((await member.post(`${base}/${F3}/close`, { mode: "refund" })).status, 403);
    eq((await member.post(`${base}/${F3}/subsidy`, { amountVnd: 1000, reason: "Không được phép làm" })).status, 403);
    eq((await stranger.post(`${base}/${F3}/receipts`, { payerName: "Lén", amountVnd: 1000, method: "cash", paidOn: today })).status, 403);
  });

  await test("Cô lập cuối cùng: sau toàn bộ giao dịch quỹ riêng, báo cáo tháng / số dư các quỹ nhà chỉ đổi đúng phần chuyển dư và bù (không lẫn thu chi quỹ riêng)", async () => {
    const s = (await head.get("/api/v1/finance/summary")).json;
    ok(!s.funds || s.funds.every((f) => !/Quỹ (hành hương|liên hoan|thứ ba)/.test(f.name)), "danh sách túi quỹ nhà không có quỹ riêng");
    eq(s.fundBalanceVnd, houseBal0 + 500000);
  });
}
