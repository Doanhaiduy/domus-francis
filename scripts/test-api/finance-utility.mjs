// Kiểm thử TIỀN ĐIỆN NƯỚC (db/app/1031): nhập theo SỐ TIỀN MỖI NGƯỜI (tổng tự tính = mỗi người × số người) và "TRỪ QUỸ NGAY"
// (tự lập phiếu chi đã chi bằng tổng; anh em đóng thì cộng lại; hủy kế hoạch ⇒ đảo phiếu chi), trần tự trừ quỹ, quỹ chưa có số dư đầu kỳ, quyền.

import { randomUUID } from "node:crypto";
import pg from "pg";

const shiftMonth = (ym, n) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Tiền điện nước — mỗi người cố định, trừ quỹ ngay");

  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const PLANS = "/api/v1/finance/contribution-plans";
  const detail = (r) => JSON.stringify(r.json);
  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const current = options.today.slice(0, 7);
  const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const total = async () => (await head.get("/api/v1/finance/opening-balance")).json.totalVnd;
  const planOf = async (id) => (await treasurer.get(`${PLANS}?from=${shiftMonth(current, -30)}&to=${current}`)).json.find((p) => p.id === id);

  // Tháng còn trống (chưa có kế hoạch điện nước) trong 30 tháng gần nhất — mỗi ca dùng một tháng riêng
  const taken = new Set((await treasurer.get(`${PLANS}?from=${shiftMonth(current, -30)}&to=${current}`)).json.filter((p) => p.feeType === "utility").map((p) => p.month));
  const free = [];
  for (let i = 0; i < 30 && free.length < 8; i++) {
    const m = shiftMonth(current, -i);
    if (!taken.has(m)) free.push(m);
  }
  ok(free.length >= 6, "DB thử cần ít nhất 6 tháng điện nước còn trống, có " + free.length);
  let next = 0;
  const month = () => free[next++];

  await test("Chuẩn bị: cấp thêm 5.000.000đ vào quỹ thử bằng bút toán điều chỉnh (DB thử chỉ còn vài trăm nghìn)", async () => {
    const r = await head.post("/api/v1/finance/adjustments", { fundId: cash.id, direction: "in", amountVnd: 5_000_000, entryDate: options.today, reason: "Cấp quỹ thử cho kiểm thử điện nước" });
    eq(r.status, 201, detail(r));
  });

  let n; // số người đang ở được chia
  await test("Xem trước nhập MỖI NGƯỜI: tổng tự tính = mỗi người × số người, không dư; trần tự trừ quỹ có trong kết quả", async () => {
    const m = month();
    const r = await treasurer.get(`${PLANS}/preview?kind=utility&month=${m}&perPersonVnd=120000`);
    eq(r.status, 200, detail(r));
    n = r.json.splitCount;
    ok(n >= 5, "cần ít nhất 5 người đang ở: " + n);
    eq(r.json.amountVnd, 120000);
    eq(r.json.totalVnd, 120000 * n);
    eq(r.json.billTotalVnd, 120000 * n);
    eq(r.json.remainderVnd, 0);
    eq(r.json.autoExpenseMaxVnd, 10_000_000);
    next--; // tháng này chưa dùng để lập
    // nhập tổng vẫn như cũ: chia đều, làm tròn lên 1.000đ
    const t = (await treasurer.get(`${PLANS}/preview?kind=utility&month=${m}&billTotalVnd=1000000`)).json;
    eq(t.amountVnd, Math.ceil(1_000_000 / n / 1000) * 1000);
    eq(t.billTotalVnd, 1_000_000);
  });

  await test("Kiểm tra dữ liệu: nhập cả hai hoặc không nhập gì ⇒ 400; mỗi người 0 / quá lớn ⇒ 400; thành viên thường ⇒ 403", async () => {
    const m = month();
    next--;
    eq((await treasurer.post(PLANS, { kind: "utility", month: m })).status, 400, "không nhập gì");
    eq((await treasurer.post(PLANS, { kind: "utility", month: m, billTotalVnd: 1_000_000, perPersonVnd: 100000 })).status, 400, "nhập cả hai");
    eq((await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 0 })).status, 400, "mỗi người 0");
    eq((await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 200_000_000 })).status, 400, "mỗi người quá lớn");
    eq((await member.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000 })).status, 403);
    eq((await member.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, autoExpense: true })).status, 403);
  });

  let planA;
  await test("Lập MỖI NGƯỜI 120.000đ KHÔNG trừ quỹ: tổng = 120.000 × n, quỹ không đổi, không có phiếu chi; hủy được (chưa ai nộp)", async () => {
    const before = await total();
    const r = await treasurer.post(PLANS, { kind: "utility", month: month(), perPersonVnd: 120000, note: "Kiểm thử mỗi người" });
    eq(r.status, 201, detail(r));
    planA = r.json;
    eq(planA.amountVnd, 120000);
    ok(planA.generated >= 1, "có khoản phải thu");
    eq(planA.billTotalVnd, 120000 * planA.generated);
    eq(planA.remainderVnd, 0);
    eq(planA.expenseVoucherNo, null);
    eq(await total(), before, "quỹ không đổi khi không trừ quỹ");
    const c = await treasurer.post(`${PLANS}/${planA.id}/cancel`, { reason: "Hủy kế hoạch thử không trừ quỹ" });
    eq(c.status, 200, detail(c));
    eq(await total(), before);
  });

  let planB;
  let vno;
  let balanceBefore;
  await test("Lập MỖI NGƯỜI 120.000đ + TRỪ QUỸ NGAY: quỹ giảm đúng tổng, có phiếu chi đã chi (hạng mục Điện, Nước & Internet), kế hoạch ghi phiếu", async () => {
    balanceBefore = await total();
    const m = month();
    const r = await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 120000, autoExpense: true, payMethod: "bank_transfer" });
    eq(r.status, 201, detail(r));
    planB = r.json;
    vno = planB.expenseVoucherNo;
    ok(/^PC-\d{4}-\d{2}-\d{4}$/.test(vno), "số phiếu chi: " + vno);
    eq(planB.expenseVnd, 120000 * planB.generated);
    eq(planB.billTotalVnd, 120000 * planB.generated);
    eq(await total(), balanceBefore - 120000 * planB.generated, "quỹ bị trừ đúng tổng");
    const p = await planOf(planB.id);
    eq(p.expenseVoucherNo, vno);
    eq(p.expenseVnd, 120000 * planB.generated);
    const list = (await treasurer.get("/api/v1/finance/expenses?all=1")).json;
    const e = list.find((x) => x.voucherNo === vno);
    ok(e, "phiếu chi có trong danh sách");
    eq(e.status, "paid");
    eq(e.amountVnd, 120000 * planB.generated);
    eq(e.category.code, "UTILITY");
    eq(e.paymentMethod, "bank_transfer");
    ok(e.title.includes("Điện nước tháng"), "tiêu đề: " + e.title);
  });

  await test("Anh em đóng thì CỘNG LẠI quỹ: ghi thu một người ⇒ quỹ + 120.000; hủy kế hoạch khi đã có người nộp bị chặn (422)", async () => {
    const matrix = (await treasurer.get(`/api/v1/finance/contributions?months=24&to=${current}`)).json;
    const row = matrix.rows.find((r) => r.cells[planB.id]);
    ok(row, "có khoản phải thu của kế hoạch");
    const cell = row.cells[planB.id];
    const mid = total;
    const t0 = await mid();
    const pay = await treasurer.post("/api/v1/finance/payments", {
      memberId: row.memberId,
      fundId: cash.id,
      method: "cash",
      paidOn: options.today,
      allocations: [{ contributionId: cell.contributionId, amountVnd: cell.remainingVnd }],
      clientRequestId: randomUUID(),
    });
    eq(pay.status, 201, detail(pay));
    eq(await mid(), t0 + 120000, "quỹ cộng lại đúng số người đóng");
    const c = await treasurer.post(`${PLANS}/${planB.id}/cancel`, { reason: "Thử hủy khi đã có người nộp" });
    eq(c.status, 422, detail(c));
    // hoàn tác phiếu thu rồi hủy kế hoạch ⇒ phiếu chi bị đảo, quỹ về đúng như trước khi lập
    const paymentId = (await treasurer.get(`/api/v1/finance/contributions?months=24&to=${current}`)).json.rows.find((r) => r.memberId === row.memberId).cells[planB.id].payments[0].paymentId;
    eq((await treasurer.post(`/api/v1/finance/payments/${paymentId}/void`, { reason: "Hoàn tác phiếu thu thử điện nước" })).status, 200);
    eq(await mid(), t0, "sau hoàn tác phiếu thu, quỹ quay lại mức đã trừ");
    const ok2 = await treasurer.post(`${PLANS}/${planB.id}/cancel`, { reason: "Hủy kế hoạch thử, hoàn lại quỹ" });
    eq(ok2.status, 200, detail(ok2));
    eq(await mid(), balanceBefore, "hủy kế hoạch ⇒ đảo phiếu chi, quỹ về như ban đầu");
    const e = (await treasurer.get("/api/v1/finance/expenses?all=1")).json.find((x) => x.voucherNo === vno);
    eq(e.status, "reversed", "phiếu chi bị đảo");
  });

  await test("Nhập TỔNG hóa đơn + trừ quỹ ngay: quỹ trừ ĐÚNG tổng hóa đơn (không phải tổng làm tròn của anh em)", async () => {
    const t0 = await total();
    const r = await treasurer.post(PLANS, { kind: "utility", month: month(), billTotalVnd: 1_000_001, autoExpense: true });
    eq(r.status, 201, detail(r));
    eq(r.json.expenseVnd, 1_000_001);
    eq(await total(), t0 - 1_000_001);
    eq((await treasurer.post(`${PLANS}/${r.json.id}/cancel`, { reason: "Hủy kế hoạch thử tổng hóa đơn" })).status, 200);
    eq(await total(), t0);
  });

  await test("Vượt trần tự trừ quỹ (10.000.000đ) ⇒ 422 và KHÔNG tạo kế hoạch (tháng đó lập lại được)", async () => {
    const m = month();
    const r = await treasurer.post(PLANS, { kind: "utility", month: m, billTotalVnd: 12_000_000, autoExpense: true });
    eq(r.status, 422, detail(r));
    ok(/vượt mức/.test(detail(r)), "thông báo nêu vượt mức: " + detail(r));
    const again = await treasurer.post(PLANS, { kind: "utility", month: m, billTotalVnd: 500_000 });
    eq(again.status, 201, "tháng đó chưa bị chiếm: " + detail(again));
    eq((await treasurer.post(`${PLANS}/${again.json.id}/cancel`, { reason: "Hủy kế hoạch thử vượt trần" })).status, 200);
  });

  await test("Quỹ không đủ số dư ⇒ 422 (BR-FIN-07), không tạo gì; quỹ chưa có số dư đầu kỳ ⇒ 422 yêu cầu nhập số dư đầu kỳ", async () => {
    const bal = await total();
    if (bal + 1000 <= 10_000_000) {
      const m = month();
      const r = await treasurer.post(PLANS, { kind: "utility", month: m, billTotalVnd: bal + 1000, autoExpense: true });
      eq(r.status, 422, detail(r));
      eq(await total(), bal, "quỹ không đổi");
      const again = await treasurer.post(PLANS, { kind: "utility", month: m, billTotalVnd: 500_000 });
      eq(again.status, 201, "kế hoạch của lần lỗi không còn sót lại: " + detail(again));
      eq((await treasurer.post(`${PLANS}/${again.json.id}/cancel`, { reason: "Hủy kế hoạch thử thiếu số dư" })).status, 200);
    }
    const db = new pg.Client(pgConfig());
    await db.connect();
    let emptyId;
    try {
      emptyId = (await db.query("INSERT INTO funds (code, name, fund_type, description) VALUES ($1, $2, 'cash', 'Túi quỹ tạo bởi kiểm thử điện nước') RETURNING id", [`TUTIL_${Date.now().toString(36).toUpperCase().slice(-6)}`, "Quỹ trống điện nước"])).rows[0].id;
      const m = month();
      const r = await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, autoExpense: true, fundId: emptyId });
      eq(r.status, 422, detail(r));
      ok(/số dư đầu kỳ/i.test(detail(r)), "thông báo nêu số dư đầu kỳ: " + detail(r));
    } finally {
      if (emptyId) await db.query("UPDATE funds SET is_active = false, deleted_at = now() WHERE id = $1", [emptyId]).catch(() => {});
      await db.end();
    }
  });

  await test("Trưởng nhà (có quyền lập kế hoạch thu) cũng trừ quỹ ngay được; kế hoạch trùng tháng vẫn bị chặn (409)", async () => {
    const m = month();
    const t0 = await total();
    const r = await head.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, autoExpense: true });
    eq(r.status, 201, detail(r));
    eq(await total(), t0 - 100000 * r.json.generated);
    const dup = await head.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, autoExpense: true });
    eq(dup.status, 409, detail(dup));
    eq(await total(), t0 - 100000 * r.json.generated, "lập trùng không trừ quỹ thêm");
    eq((await head.post(`${PLANS}/${r.json.id}/cancel`, { reason: "Hủy kế hoạch thử của Trưởng nhà" })).status, 200);
    eq(await total(), t0);
  });
}
