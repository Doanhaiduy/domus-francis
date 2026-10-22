// Kiểm thử TIỀN ĐIỆN NƯỚC (db/app/1031 + 1056): nhập theo SỐ TIỀN MỖI NGƯỜI (tổng tự tính = mỗi người × số người);
// KHÔNG trừ quỹ nhà và tiền anh em đóng KHÔNG cộng vào sổ quỹ nhà (phiếu thu không có bút toán); chọn tài khoản nhận tiền (STK);
// Thủ quỹ / Trưởng nhà / Admin xác nhận "Tôi đã đóng" kể cả chuyển khoản không kèm mã giao dịch (lỗi "Dữ liệu không thỏa ràng buộc nghiệp vụ").

import { randomUUID } from "node:crypto";
import pg from "pg";

const shiftMonth = (ym, n) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const SECRET = "test-bank-webhook-secret-0001";

export async function run({ as, test, eq, ok, section, pgConfig, BASE }) {
  section("Tiền điện nước — không đụng sổ quỹ nhà, chọn STK, xác nhận đã đóng");

  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const hieu = await as("hieu.bui@luuxa.local");
  const kiet = await as("kiet.do@luuxa.local");
  const PLANS = "/api/v1/finance/contribution-plans";
  const detail = (r) => JSON.stringify(r.json);
  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const current = options.today.slice(0, 7);
  const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const total = async () => (await head.get("/api/v1/finance/opening-balance")).json.totalVnd;
  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member.id;
  const treasurerId = await meOf(treasurer);
  const tuanId = await meOf(member);

  const db = new pg.Client(pgConfig());
  await db.connect();
  const payRow = async (paymentId) => (await db.query("SELECT ledger_entry_id, void_ledger_entry_id, reference_code, voided_at, method::text AS method FROM contribution_payments WHERE id = $1", [paymentId])).rows[0];

  try {
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
    const cellOf = async (client, planId) => (await client.get(`/api/v1/finance/contributions?plan=${planId}`)).json.rows[0].cells[planId];

    let n; // số người đang ở được chia
    await test("Xem trước nhập MỖI NGƯỜI: tổng tự tính = mỗi người × số người, không dư; không còn trần tự trừ quỹ", async () => {
      const m = month();
      const r = await treasurer.get(`${PLANS}/preview?kind=utility&month=${m}&perPersonVnd=120000`);
      eq(r.status, 200, detail(r));
      n = r.json.splitCount;
      ok(n >= 5, "cần ít nhất 5 người đang ở: " + n);
      eq(r.json.amountVnd, 120000);
      eq(r.json.totalVnd, 120000 * n);
      eq(r.json.billTotalVnd, 120000 * n);
      eq(r.json.remainderVnd, 0);
      eq(r.json.autoExpenseMaxVnd, undefined, "trần tự trừ quỹ đã bỏ");
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
      eq((await member.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, payeeMemberId: treasurerId })).status, 403);
    });

    await test("Bản giao diện cũ gửi autoExpense = true ⇒ 422 nêu rõ không còn tự trừ quỹ nhà, KHÔNG tạo kế hoạch (tháng đó lập lại được)", async () => {
      const m = month();
      const before = await total();
      const r = await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 120000, autoExpense: true });
      eq(r.status, 422, detail(r));
      ok(/không còn tự trừ/.test(detail(r)), "thông báo nêu rõ: " + detail(r));
      eq(await total(), before, "quỹ không đổi");
      const again = await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 120000 });
      eq(again.status, 201, "tháng đó chưa bị chiếm: " + detail(again));
      eq((await treasurer.post(`${PLANS}/${again.json.id}/cancel`, { reason: "Hủy kế hoạch thử autoExpense" })).status, 200);
    });

    let planA;
    await test("Lập MỖI NGƯỜI 120.000đ: tổng = 120.000 × n, quỹ nhà không đổi, không có phiếu chi, STK mặc định = tài khoản nhà; hủy được (chưa ai nộp)", async () => {
      const before = await total();
      const r = await treasurer.post(PLANS, { kind: "utility", month: month(), perPersonVnd: 120000, note: "Kiểm thử mỗi người" });
      eq(r.status, 201, detail(r));
      planA = r.json;
      eq(planA.amountVnd, 120000);
      ok(planA.generated >= 1, "có khoản phải thu");
      eq(planA.billTotalVnd, 120000 * planA.generated);
      eq(planA.remainderVnd, 0);
      eq(planA.expenseVoucherNo, null);
      eq(planA.payeeMemberId, null);
      eq(await total(), before, "quỹ không đổi khi lập kế hoạch");
      const dto = (await treasurer.get(`${PLANS}?from=${shiftMonth(current, -30)}&to=${current}`)).json.find((p) => p.id === planA.id);
      eq(dto.payeeMemberId, null);
      eq(dto.expenseVoucherNo, null);
      const house = (await member.get(`/api/v1/finance/receiving-account?planId=${planA.id}`)).json;
      eq(house.payeeMemberId, null, "kế hoạch không chọn STK ⇒ tài khoản nhà");
      const c = await treasurer.post(`${PLANS}/${planA.id}/cancel`, { reason: "Hủy kế hoạch thử không trừ quỹ" });
      eq(c.status, 200, detail(c));
      eq(await total(), before);
    });

    await test("Chọn STK: người chưa khai báo tài khoản ⇒ 422; không tồn tại ⇒ 404; chọn tài khoản Thủ quỹ ⇒ kế hoạch ghi người nhận, mã QR/STK theo kế hoạch", async () => {
      const m = month();
      const noAcc = (await db.query("SELECT m.id FROM members m WHERE m.status = 'active' AND m.deleted_at IS NULL AND m.id <> $1 AND NOT EXISTS (SELECT 1 FROM member_payment_accounts a WHERE a.member_id = m.id) LIMIT 1", [treasurerId])).rows[0];
      if (noAcc) {
        const r = await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, payeeMemberId: noAcc.id });
        eq(r.status, 422, detail(r));
        ok(/chưa khai báo tài khoản nhận tiền/.test(detail(r)), "thông báo: " + detail(r));
      }
      eq((await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, payeeMemberId: randomUUID() })).status, 404);
      const put = await treasurer.req("PUT", `/api/v1/members/${treasurerId}/payment-account`, { bankBin: "970436", bankName: "Vietcombank", accountNo: "0011009876543", accountName: "PHAM BAO" });
      eq(put.status, 200, detail(put));
      const opts = (await treasurer.get("/api/v1/finance/options")).json;
      ok(opts.payees.some((p) => p.memberId === treasurerId && p.accountLast4 === "6543"), "danh sách STK có tài khoản vừa khai: " + JSON.stringify(opts.payees));
      eq((await member.get("/api/v1/finance/options")).json.payees.length, 0, "thành viên thường không nhận danh sách người nhận");
      const r = await treasurer.post(PLANS, { kind: "utility", month: m, perPersonVnd: 100000, payeeMemberId: treasurerId });
      eq(r.status, 201, detail(r));
      eq(r.json.payeeMemberId, treasurerId);
      const dto = (await member.get(PLANS)).json.find((p) => p.id === r.json.id);
      eq(dto.payeeMemberId, treasurerId);
      ok(dto.payeeName, "có tên người nhận");
      const acc = (await member.get(`/api/v1/finance/receiving-account?planId=${r.json.id}`)).json;
      eq(acc.payeeMemberId, treasurerId);
      eq(acc.account.accountNo, "0011009876543");
      eq(acc.account.bankName, "Vietcombank");
      eq((await member.get("/api/v1/finance/receiving-account?planId=khong-phai-uuid")).status, 400);
      eq((await treasurer.post(`${PLANS}/${r.json.id}/cancel`, { reason: "Hủy kế hoạch thử chọn STK" })).status, 200);
    });

    // ------------------------------------------------------------------ Ghi thu không vào sổ quỹ nhà
    let plan;
    await test("Lập kế hoạch điện nước thử cho phần ghi thu / xác nhận (quỹ nhà không đổi)", async () => {
      const before = await total();
      const r = await treasurer.post(PLANS, { kind: "utility", month: month(), perPersonVnd: 50000, note: "Kiểm thử ghi thu điện nước" });
      eq(r.status, 201, detail(r));
      plan = r.json;
      eq(await total(), before);
    });

    await test("Ghi thu tay một khoản điện nước: khoản 'đã đóng', quỹ nhà KHÔNG đổi, phiếu thu không có bút toán; hủy phiếu thu cũng không đụng quỹ", async () => {
      const c = await cellOf(member, plan.id);
      const t0 = await total();
      const pay = await treasurer.post("/api/v1/finance/payments", {
        memberId: tuanId,
        fundId: cash.id,
        method: "cash",
        paidOn: options.today,
        note: "Thử ghi thu điện nước",
        allocations: [{ contributionId: c.contributionId, amountVnd: c.remainingVnd }],
        clientRequestId: randomUUID(),
      });
      eq(pay.status, 201, detail(pay));
      eq(await total(), t0, "tiền điện nước không cộng vào quỹ nhà");
      const after = await cellOf(member, plan.id);
      eq(after.status, "paid");
      const p = await payRow(pay.json.id ?? after.payments[0].paymentId);
      eq(p.ledger_entry_id, null, "phiếu thu không có bút toán sổ cái");
      const cancel = await treasurer.post(`${PLANS}/${plan.id}/cancel`, { reason: "Thử hủy khi đã có người nộp" });
      eq(cancel.status, 422, detail(cancel));
      const v = await treasurer.post(`/api/v1/finance/payments/${after.payments[0].paymentId}/void`, { reason: "Hoàn tác phiếu thu thử điện nước" });
      eq(v.status, 200, detail(v));
      eq(await total(), t0, "hủy phiếu thu không đảo bút toán nào");
      const p2 = await payRow(after.payments[0].paymentId);
      ok(p2.voided_at, "phiếu thu đã hủy");
      eq(p2.void_ledger_entry_id, null);
      eq((await cellOf(member, plan.id)).status, "unpaid", "khoản trở lại chưa đóng");
    });

    await test("Không gộp chung phiếu thu điện nước với khoản thu khác (422); khoản thu khác vẫn vào sổ quỹ như thường", async () => {
      const one = await treasurer.post(PLANS, {
        kind: "onetime",
        feeType: "other",
        name: `Thu thử điện nước ${Date.now().toString(36)}`,
        amountVnd: 10_000,
        dueDate: addDays(options.today, 7),
        members: [{ memberId: tuanId }],
        fundId: cash.id,
      });
      eq(one.status, 201, detail(one));
      const oneCell = await cellOf(member, one.json.id);
      const uCell = await cellOf(member, plan.id);
      const mix = await treasurer.post("/api/v1/finance/payments", {
        memberId: tuanId,
        fundId: cash.id,
        method: "cash",
        paidOn: options.today,
        allocations: [
          { contributionId: uCell.contributionId, amountVnd: uCell.remainingVnd },
          { contributionId: oneCell.contributionId, amountVnd: oneCell.remainingVnd },
        ],
        clientRequestId: randomUUID(),
      });
      eq(mix.status, 422, detail(mix));
      ok(/không gộp chung/.test(detail(mix)), "thông báo: " + detail(mix));
      eq((await cellOf(member, plan.id)).status, "unpaid", "không ai bị ghi");
      eq((await cellOf(member, one.json.id)).status, "unpaid");

      // "Tôi đã đóng" chuyển khoản KHÔNG kèm mã giao dịch: xác nhận được (lỗi cũ: ck_contribution_payments__bank_ref)
      const t0 = await total();
      const claim = await member.post("/api/v1/finance/claims", { contributionId: oneCell.contributionId, method: "bank_transfer" });
      eq(claim.status, 201, detail(claim));
      const d = await treasurer.post(`/api/v1/finance/claims/${claim.json.id}/decide`, { approve: true });
      eq(d.status, 200, "xác nhận chuyển khoản thiếu mã giao dịch: " + detail(d));
      eq(await total(), t0 + 10_000, "khoản thu khác vẫn cộng vào quỹ nhà");
      const p = await payRow(d.json.paymentId);
      eq(p.reference_code, "XAC-NHAN-THU-CONG");
      ok(p.ledger_entry_id, "có bút toán sổ cái");
      const paid = await cellOf(member, one.json.id);
      eq(paid.status, "paid");
      eq((await treasurer.post(`/api/v1/finance/payments/${paid.payments[0].paymentId}/void`, { reason: "Hoàn tác phiếu thu thử" })).status, 200);
      eq(await total(), t0, "hủy phiếu thu ⇒ quỹ về như cũ");
      eq((await treasurer.post(`${PLANS}/${one.json.id}/cancel`, { reason: "Hủy khoản thu thử" })).status, 200);
    });

    await test("Thủ quỹ / Trưởng nhà / Admin đều xác nhận được 'Tôi đã đóng' tiền điện nước (chuyển khoản không mã, tiền mặt); quỹ nhà không đổi", async () => {
      const t0 = await total();
      const tuanCell = await cellOf(member, plan.id);
      const hieuCell = await cellOf(hieu, plan.id);
      const kietCell = await cellOf(kiet, plan.id);
      const c1 = await member.post("/api/v1/finance/claims", { contributionId: tuanCell.contributionId, method: "bank_transfer" });
      const c2 = await hieu.post("/api/v1/finance/claims", { contributionId: hieuCell.contributionId, method: "cash", note: "Đưa tiền mặt (thử)" });
      const c3 = await kiet.post("/api/v1/finance/claims", { contributionId: kietCell.contributionId, method: "bank_transfer", referenceCode: "FT-THU-DIEN-NUOC" });
      for (const c of [c1, c2, c3]) eq(c.status, 201, detail(c));
      const pending = (await treasurer.get(`/api/v1/finance/claims?plan=${plan.id}`)).json;
      ok(Array.isArray(pending) && pending.length >= 3, "danh sách chờ xác nhận có 3 yêu cầu: " + JSON.stringify(pending));
      const d1 = await treasurer.post(`/api/v1/finance/claims/${c1.json.id}/decide`, { approve: true });
      eq(d1.status, 200, "Thủ quỹ xác nhận: " + detail(d1));
      const d2 = await head.post(`/api/v1/finance/claims/${c2.json.id}/decide`, { approve: true });
      eq(d2.status, 200, "Trưởng nhà xác nhận: " + detail(d2));
      const d3 = await admin.post(`/api/v1/finance/claims/${c3.json.id}/decide`, { approve: true });
      eq(d3.status, 200, "Admin xác nhận: " + detail(d3));
      eq(await total(), t0, "tiền điện nước không vào quỹ nhà");
      eq((await payRow(d1.json.paymentId)).reference_code, "XAC-NHAN-THU-CONG");
      eq((await payRow(d3.json.paymentId)).reference_code, "FT-THU-DIEN-NUOC");
      for (const id of [d1, d2, d3]) eq((await payRow(id.json.paymentId)).ledger_entry_id, null);
      for (const [c, k] of [[member, "tuan"], [hieu, "hieu"], [kiet, "kiet"]]) eq((await cellOf(c, plan.id)).status, "paid", `${k} đã đóng`);
      // thành viên thường không xác nhận được
      const again = await member.post(`/api/v1/finance/claims/${c1.json.id}/decide`, { approve: true });
      eq(again.status, 403, detail(again));
    });

    await test("Giao dịch ngân hàng khớp khoản điện nước: ghi thu không bút toán, dòng sao kê chuyển 'bỏ qua' kèm lý do, không ghi thu lần hai; quỹ nhà không đổi", async () => {
      const taken = new Set([tuanId, await meOf(hieu), await meOf(kiet)]);
      const rows = (await treasurer.get(`/api/v1/finance/contributions?plan=${plan.id}`)).json.rows;
      const target = rows.find((r) => !taken.has(r.memberId) && r.cells[plan.id]?.status === "unpaid");
      ok(target, "cần một thành viên khác chưa đóng khoản điện nước");
      const longCell = target.cells[plan.id];
      const ref = `FTDN${Date.now().toString(36)}`;
      const res = await fetch(BASE + "/api/v1/public/bank-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Apikey ${SECRET}` },
        body: JSON.stringify({ id: Math.floor(Math.random() * 1e9), gateway: "Techcombank", transactionDate: "2026-10-06 14:30:00", accountNumber: "19036996868", transferType: "in", transferAmount: longCell.remainingVnd, accumulated: 5000000, content: `${longCell.planCode} ${target.fullName}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toUpperCase(), referenceCode: ref }),
      });
      eq(res.status, 200);
      const lines = (await treasurer.get("/api/v1/finance/bank-lines")).json.lines;
      const line = lines.find((l) => l.reference === ref);
      ok(line, "thấy dòng sao kê vừa gửi");
      const t0 = await total();
      const r = await treasurer.post(`/api/v1/finance/bank-lines/${line.id}`, { action: "confirm", contributionId: longCell.contributionId });
      eq(r.status, 200, detail(r));
      eq(await total(), t0, "tiền điện nước không vào quỹ nhà");
      const after = (await treasurer.get("/api/v1/finance/bank-lines")).json.lines.find((l) => l.reference === ref);
      eq(after.status, "ignored");
      const paidRow = (await treasurer.get(`/api/v1/finance/contributions?plan=${plan.id}`)).json.rows.find((r) => r.memberId === target.memberId);
      eq(paidRow.cells[plan.id].status, "paid");
      eq((await treasurer.post(`/api/v1/finance/bank-lines/${line.id}`, { action: "confirm", contributionId: longCell.contributionId })).status, 409, "không ghi thu lần hai");
    });

    await test("Hủy các phiếu thu điện nước thử rồi hủy kế hoạch (dọn DB thử)", async () => {
      const t0 = await total();
      const rows = (await treasurer.get(`/api/v1/finance/contributions?plan=${plan.id}`)).json.rows;
      for (const row of rows) {
        const c = row.cells[plan.id];
        for (const p of c.payments ?? []) {
          const v = await treasurer.post(`/api/v1/finance/payments/${p.paymentId}/void`, { reason: "Dọn phiếu thu thử điện nước" });
          ok(v.status === 200 || v.status === 409 || v.status === 422, "hủy phiếu thu: " + detail(v));
        }
      }
      eq(await total(), t0, "dọn dẹp không đụng quỹ nhà");
      const c = await treasurer.post(`${PLANS}/${plan.id}/cancel`, { reason: "Hủy kế hoạch điện nước thử" });
      eq(c.status, 200, detail(c));
    });
  } finally {
    await db.end();
  }
}
