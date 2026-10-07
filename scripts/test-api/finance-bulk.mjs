// Kiểm thử GHI THU HÀNG LOẠT (POST /api/v1/finance/payments/bulk): nhiều người đã đóng trước khi dùng hệ thống, một lượt, một giao dịch.
// Mỗi người một phiếu thu + bút toán thu ở sổ quỹ; tất cả hoặc không gì cả; gửi lại không ghi trùng; chỉ Thủ quỹ (finance.contribution.record).

import { randomUUID } from "node:crypto";

const shiftMonth = (ym, n) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export async function run({ as, test, eq, ok, section }) {
  section("Ghi thu hàng loạt (khoản đã đóng từ trước)");

  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const BULK = "/api/v1/finance/payments/bulk";
  const detail = (r) => JSON.stringify(r.json);
  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const today = options.today;
  const current = today.slice(0, 7);
  const fund = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const total = async () => (await head.get("/api/v1/finance/opening-balance")).json.totalVnd;

  // Kế hoạch điện nước của một tháng còn trống trong 6 tháng gần nhất (có đủ khoản phải thu cho cả nhà)
  let plan;
  let cells;
  await test("Chuẩn bị: lập kế hoạch điện nước một tháng còn trống ⇒ cả nhà có khoản phải thu chưa đóng", async () => {
    const existing = (await treasurer.get("/api/v1/finance/contribution-plans")).json;
    const taken = new Set(existing.filter((p) => p.feeType === "utility").map((p) => p.month));
    const month = [0, -1, -2, -3, -4, -5].map((n) => shiftMonth(current, n)).find((m) => !taken.has(m));
    ok(month, "DB thử không còn tháng điện nước trống trong 6 tháng gần nhất");
    const r = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "utility", month, billTotalVnd: 1_200_000, note: "Kiểm thử ghi thu hàng loạt" });
    eq(r.status, 201, detail(r));
    plan = r.json;
    const matrix = (await treasurer.get("/api/v1/finance/contributions?months=6")).json;
    cells = matrix.rows.map((row) => ({ memberId: row.memberId, name: row.fullName, cell: row.cells[plan.id] })).filter((x) => x.cell);
    ok(cells.length >= 5, "cần ít nhất 5 khoản phải thu, có " + cells.length);
    ok(cells.every((x) => x.cell.status === "unpaid"), "tất cả chưa đóng");
  });

  const item = (i, amountVnd) => ({ memberId: cells[i].memberId, contributionId: cells[i].cell.contributionId, amountVnd: amountVnd ?? cells[i].cell.remainingVnd });
  const cellOf = async (i) => {
    const matrix = (await treasurer.get("/api/v1/finance/contributions?months=6")).json;
    return matrix.rows.find((r) => r.memberId === cells[i].memberId).cells[plan.id];
  };

  const requestId = randomUUID();
  let result;
  await test("Ghi thu 3 người một lượt (ngày thực tế, tiền mặt): 201, quỹ tăng đúng tổng, 3 khoản chuyển sang 'đã đóng'", async () => {
    const before = await total();
    const items = [item(0), item(1), item(2)];
    const sum = items.reduce((a, x) => a + x.amountVnd, 0);
    const r = await treasurer.post(BULK, { fundId: fund.id, method: "cash", paidOn: today, note: "Đóng trước khi dùng hệ thống", items, clientRequestId: requestId });
    eq(r.status, 201, detail(r));
    eq(r.json.count, 3);
    eq(r.json.totalVnd, sum);
    eq(r.json.paymentIds.length, 3);
    result = r.json;
    eq(await total(), before + sum, "số dư quỹ tăng đúng tổng");
    for (const i of [0, 1, 2]) {
      const c = await cellOf(i);
      eq(c.status, "paid", `${cells[i].name} phải 'đã đóng'`);
      eq(c.paidVnd, items[[0, 1, 2].indexOf(i)].amountVnd);
      eq(c.payments[0].method, "cash");
    }
    eq((await cellOf(3)).status, "unpaid", "người không tick vẫn chưa đóng");
  });

  await test("Gửi lại cùng clientRequestId (mất mạng, bấm lại): không ghi trùng — quỹ và phiếu thu giữ nguyên", async () => {
    const before = await total();
    const r = await treasurer.post(BULK, { fundId: fund.id, method: "cash", paidOn: today, note: "Đóng trước khi dùng hệ thống", items: [item(0), item(1), item(2)], clientRequestId: requestId });
    eq(r.status, 201, detail(r));
    eq(JSON.stringify(r.json.paymentIds.slice().sort()), JSON.stringify(result.paymentIds.slice().sort()), "trả đúng các phiếu thu cũ");
    eq(await total(), before, "không cộng thêm");
  });

  await test("Tất cả hoặc không gì cả: một người sai số tiền (vượt số còn phải thu) ⇒ lỗi và KHÔNG ai được ghi", async () => {
    const before = await total();
    const r = await treasurer.post(BULK, {
      fundId: fund.id,
      method: "cash",
      paidOn: today,
      items: [item(3), item(4, cells[4].cell.remainingVnd + 1000)],
      clientRequestId: randomUUID(),
    });
    ok(r.status === 400 || r.status === 422, "phải bị từ chối: " + r.status + " " + detail(r));
    eq(await total(), before, "quỹ không đổi");
    eq((await cellOf(3)).status, "unpaid", "người hợp lệ trong lô lỗi cũng không bị ghi");
    eq((await cellOf(4)).status, "unpaid");
  });

  await test("Kiểm tra dữ liệu: lô rỗng, trùng khoản, ngày tương lai, khoản của người khác, khoản đã đóng đủ", async () => {
    const base = { fundId: fund.id, method: "cash", paidOn: today, clientRequestId: randomUUID() };
    eq((await treasurer.post(BULK, { ...base, items: [] })).status, 400, "lô rỗng");
    eq((await treasurer.post(BULK, { ...base, clientRequestId: undefined, items: [item(3)] })).status, 400, "thiếu clientRequestId");
    eq((await treasurer.post(BULK, { ...base, items: [item(3), item(3)] })).status, 400, "trùng một khoản");
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    eq((await treasurer.post(BULK, { ...base, paidOn: future, items: [item(3)] })).status, 422, "ngày tương lai");
    const wrongOwner = { memberId: cells[4].memberId, contributionId: cells[3].cell.contributionId, amountVnd: 1000 };
    const w = await treasurer.post(BULK, { ...base, items: [wrongOwner] });
    ok([400, 409, 422].includes(w.status), "khoản không thuộc người đó: " + w.status + " " + detail(w));
    const done = await treasurer.post(BULK, { ...base, items: [item(0, 1000)] });
    ok([400, 409, 422].includes(done.status), "khoản đã đóng đủ: " + done.status + " " + detail(done));
  });

  await test("Đóng một phần + chuyển khoản không có mã giao dịch ⇒ ghi 'Đóng trước khi dùng hệ thống'; khoản còn lại là 'partial'", async () => {
    const before = await total();
    const part = Math.floor(cells[3].cell.remainingVnd / 2);
    const r = await treasurer.post(BULK, { fundId: fund.id, method: "bank_transfer", paidOn: today, items: [item(3, part)], clientRequestId: randomUUID() });
    eq(r.status, 201, detail(r));
    eq(await total(), before + part);
    const c = await cellOf(3);
    eq(c.status, "partial");
    eq(c.paidVnd, part);
    eq(c.payments[0].method, "bank_transfer");
  });

  await test("Quyền: thành viên thường 403; Trưởng nhà ghi được hay không đúng theo quyền finance.contribution.record", async () => {
    eq((await member.post(BULK, { fundId: fund.id, method: "cash", paidOn: today, items: [item(4)], clientRequestId: randomUUID() })).status, 403);
    const canRecord = (await head.get("/api/v1/auth/me")).json.permissions.includes("finance.contribution.record");
    const h = await head.post(BULK, { fundId: fund.id, method: "cash", paidOn: today, items: [item(4, 1000)], clientRequestId: randomUUID() });
    eq(h.status, canRecord ? 201 : 403, detail(h));
    eq((await cellOf(4)).status, canRecord ? "partial" : "unpaid");
  });

  await test("Hủy một phiếu thu hàng loạt (bút toán đảo): quỹ giảm đúng và khoản trở lại chưa đóng", async () => {
    const list = (await treasurer.get(`/api/v1/finance/contributions?months=6`)).json;
    const c = list.rows.find((r) => r.memberId === cells[0].memberId).cells[plan.id];
    const pid = c.payments[0].paymentId;
    const before = await total();
    const v = await treasurer.post(`/api/v1/finance/payments/${pid}/void`, { reason: "Hủy phiếu thu thử (kiểm thử ghi thu hàng loạt)" });
    eq(v.status, 200, "hủy phiếu thu: " + detail(v));
    eq(await total(), before - c.payments[0].allocatedVnd, "quỹ giảm đúng bằng phiếu thu bị hủy");
    eq((await cellOf(0)).status, "unpaid", "khoản trở lại chưa đóng");
  });
}
