// Kiểm thử Thu chi — QUỸ ĐỊNH KỲ (6 tháng), TIỀN ĐIỆN NƯỚC (chia đều, làm tròn lên 1.000 đ), TÀI KHOẢN NHẬN TIỀN + QR.
// Chạy trong scripts/test-api.mjs (DB luuxa_test dựng mới + dữ liệu demo: kỳ quỹ hiện tại + điện nước 2 tháng trước đã có sẵn).
// Viết để chạy lại được trên DB đã có dữ liệu thử (--no-server): tự chọn kỳ / tháng còn trống.

const shiftMonth = (ym, n) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export async function run({ as, test, eq, ok, section }) {
  section("Thu chi — quỹ định kỳ, tiền điện nước, tài khoản nhận tiền (QR)");

  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const code = (r) => r.json?.code ?? "";
  const detail = (r) => r.json?.detail ?? JSON.stringify(r.json);
  const put = (c, path, body) => c.req("PUT", path, body);

  const me = (await member.get("/api/v1/auth/me")).json;
  const memberId = me?.member?.id;
  const treasurerMe = (await treasurer.get("/api/v1/auth/me")).json;
  const treasurerMemberId = treasurerMe?.member?.id;
  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const today = options?.today ?? new Date().toISOString().slice(0, 10);
  const current = today.slice(0, 7);

  await test("Cấu hình quỹ định kỳ mặc định: 300.000 đ / 6 tháng, hạn ngày 15; điện nước hạn ngày 10 tháng sau", async () => {
    ok(memberId && treasurerMemberId, "thiếu hồ sơ thành viên của tài khoản demo");
    eq(options.dues.cycleMonths, 6, "số tháng mỗi kỳ");
    eq(options.dues.amountVnd, 300000, "mức quỹ mỗi kỳ");
    eq(options.dues.graduatedAmountVnd, 500000, "mức quỹ đã ra trường mặc định 500.000 đ");
    eq(options.dues.dueDay, 15, "hạn nộp kỳ");
    eq(options.utilityDueDay, 10, "hạn nộp điện nước");
    ok(options.currentCycle.startMonth <= current && options.currentCycle.endMonth >= current, "kỳ hiện tại phải chứa tháng này");
    eq(shiftMonth(options.currentCycle.endMonth, 1), options.nextCycle.startMonth, "kỳ kế tiếp nối liền kỳ hiện tại");
  });

  // ------------------------------------------------------------------ Quỹ định kỳ
  let cyclePlan = null;
  await test("Thủ quỹ lập kỳ quỹ kế tiếp: mức lấy từ cấu hình, sinh khoản cho người đang ở; lập trùng ⇒ 409 BR-FIN-13", async () => {
    const startMonth = options.nextCycle.startMonth;
    const pv = await treasurer.get(`/api/v1/finance/contribution-plans/preview?kind=periodic_dues&startMonth=${startMonth}`);
    eq(pv.status, 200, detail(pv));
    eq(pv.json.amountVnd, options.dues.amountVnd, "xem trước dùng mức cấu hình");
    if (!pv.json.existing) {
      const r = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "periodic_dues", startMonth });
      eq(r.status, 201, detail(r));
      eq(r.json.amountVnd, options.dues.amountVnd, "mức kỳ quỹ");
      ok(r.json.generated > 0, "phải sinh khoản phải thu");
      eq(r.json.generated, pv.json.splitCount, "số khoản = số người xem trước");
      ok(/^QUY-\d{4}-\d{2}/.test(r.json.code), `mã kế hoạch lạ: ${r.json.code}`);
      cyclePlan = r.json;
    }
    const dup = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "periodic_dues", startMonth });
    eq(dup.status, 409, detail(dup));
    eq(code(dup), "BR-FIN-13");
  });

  await test("Kỳ quỹ phải bắt đầu đúng tháng đầu kỳ; quỹ tháng kiểu cũ không còn lập mới", async () => {
    const odd = shiftMonth(options.nextCycle.startMonth, 1);
    const r = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "periodic_dues", startMonth: odd });
    eq(r.status, 422, detail(r));
    const legacy = await treasurer.post("/api/v1/finance/contribution-plans", { month: current, amountVnd: 350000, dueDate: today });
    eq(legacy.status, 400, detail(legacy));
  });

  await test("Thành viên thường không lập được kế hoạch thu (kỳ quỹ / điện nước / xem trước) ⇒ 403", async () => {
    const a = await member.post("/api/v1/finance/contribution-plans", { kind: "periodic_dues" });
    eq(a.status, 403, detail(a));
    const b = await member.post("/api/v1/finance/contribution-plans", { kind: "utility", month: current, billTotalVnd: 1000000 });
    eq(b.status, 403, detail(b));
    const c = await member.get(`/api/v1/finance/contribution-plans/preview?kind=utility&month=${current}&billTotalVnd=1000000`);
    eq(c.status, 403, detail(c));
  });

  // ------------------------------------------------------------------ Tiền điện nước
  let utility = null;
  const BILL = 1_850_001;
  await test("Thủ quỹ nhập tiền điện nước: mỗi người = ceil(tổng / n / 1000) × 1000, n = số khoản sinh ra; trùng tháng ⇒ 409", async () => {
    // Tháng còn trống trong 6 tháng gần nhất (DB mới: tháng này)
    const plans = (await treasurer.get("/api/v1/finance/contribution-plans")).json;
    ok(Array.isArray(plans), "danh sách kế hoạch");
    let month = null;
    for (let i = 0; i < 6 && !month; i++) {
      const m = shiftMonth(current, -i);
      if (!plans.some((p) => p.feeType === "utility" && p.month === m)) month = m;
    }
    ok(month, "không còn tháng trống để thử");
    const pv = await treasurer.get(`/api/v1/finance/contribution-plans/preview?kind=utility&month=${month}&billTotalVnd=${BILL}`);
    eq(pv.status, 200, detail(pv));
    const r = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "utility", month, billTotalVnd: BILL, note: "Điện 1.200.001 + nước 650.000" });
    eq(r.status, 201, detail(r));
    const n = r.json.generated;
    ok(n > 0, "phải sinh khoản phải thu");
    eq(r.json.splitCount, n, "số người chia = số khoản sinh ra");
    eq(r.json.amountVnd, Math.ceil(BILL / n / 1000) * 1000, "mỗi người làm tròn lên 1.000 đ");
    eq(r.json.remainderVnd, r.json.amountVnd * n - BILL, "phần dư do làm tròn");
    eq(r.json.billTotalVnd, BILL);
    eq(pv.json.amountVnd, r.json.amountVnd, "xem trước khớp kết quả");
    ok(r.json.dueDate.startsWith(shiftMonth(month, 1)), `hạn nộp phải ở tháng sau tháng hóa đơn (nhận ${r.json.dueDate})`);
    utility = r.json;
    const dup = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "utility", month, billTotalVnd: 1000000 });
    eq(dup.status, 409, detail(dup));
    eq(code(dup), "BR-FIN-13");
    const future = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "utility", month: shiftMonth(current, 1), billTotalVnd: 1000000 });
    eq(future.status, 422, detail(future));
  });

  let myCell = null;
  await test("Thành viên thấy khoản điện nước của mình (chỉ dòng của mình) + số tổng hợp toàn nhà", async () => {
    ok(utility, "chưa lập được kế hoạch điện nước");
    const r = await member.get(`/api/v1/finance/contributions?plan=${utility.id}`);
    eq(r.status, 200, detail(r));
    eq(r.json.canReadAll, false);
    eq(r.json.rows.length, 1, "chỉ thấy dòng của mình");
    eq(r.json.rows[0].memberId, memberId);
    myCell = r.json.rows[0].cells[utility.id];
    ok(myCell, "phải có khoản của mình trong kế hoạch");
    eq(myCell.netDueVnd, utility.amountVnd);
    eq(myCell.planCode, utility.code);
    eq(r.json.plans[0].stats.expectedVnd, utility.amountVnd * utility.splitCount, "tổng phải thu toàn nhà");
    eq(r.json.plans[0].stats.paidCount, null, "không lộ số người đã đóng cho thành viên thường");
    const plans = (await member.get("/api/v1/finance/contribution-plans")).json;
    ok(plans.some((p) => p.id === utility.id && p.feeType === "utility" && p.shortLabel.startsWith("ĐN T")), "danh sách kế hoạch của thành viên");
  });

  await test("Thủ quỹ ghi thu khoản điện nước của thành viên ⇒ khoản chuyển 'Đã đóng'; hủy kế hoạch đã có người nộp ⇒ 422", async () => {
    ok(myCell, "thiếu khoản điện nước");
    const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
    const r = await treasurer.post("/api/v1/finance/payments", {
      memberId,
      fundId: cash.id,
      method: "cash",
      paidOn: today,
      note: "Thử ghi thu điện nước",
      allocations: [{ contributionId: myCell.contributionId, amountVnd: myCell.remainingVnd }],
    });
    eq(r.status, 201, detail(r));
    const after = await member.get(`/api/v1/finance/contributions?plan=${utility.id}`);
    eq(after.json.rows[0].cells[utility.id].status, "paid");
    const cancel = await treasurer.post(`/api/v1/finance/contribution-plans/${utility.id}/cancel`, { reason: "Thử hủy khi đã có người nộp" });
    eq(cancel.status, 422, detail(cancel));
  });

  await test("Hủy kế hoạch chưa ai nộp (vd. kỳ quỹ vừa lập trước) rồi lập lại được", async () => {
    if (!cyclePlan) return; // DB đã có kỳ kế tiếp từ lần chạy trước
    const member403 = await member.post(`/api/v1/finance/contribution-plans/${cyclePlan.id}/cancel`, { reason: "Thành viên thử hủy" });
    eq(member403.status, 403, detail(member403));
    const c = await treasurer.post(`/api/v1/finance/contribution-plans/${cyclePlan.id}/cancel`, { reason: "Lập trước nhầm hạn nộp" });
    eq(c.status, 200, detail(c));
    eq(c.json.cancelled, cyclePlan.generated);
    const again = await treasurer.post("/api/v1/finance/contribution-plans", { kind: "periodic_dues", startMonth: options.nextCycle.startMonth });
    eq(again.status, 201, detail(again));
    ok(again.json.code !== cyclePlan.code, "mã mới không trùng mã kế hoạch đã hủy");
  });

  await test("Tổng quan: kỳ quỹ hiện tại + điện nước gần nhất + khoản còn nợ của tôi", async () => {
    const r = await treasurer.get("/api/v1/finance/summary");
    eq(r.status, 200, detail(r));
    ok(r.json.contributions && r.json.contributions.periodLabel.startsWith("quỹ kỳ"), "thiếu kỳ quỹ hiện tại");
    ok(r.json.utility && r.json.utility.periodLabel.startsWith("điện nước"), "thiếu điện nước gần nhất");
    ok(r.json.mine && typeof r.json.mine.outstandingVnd === "number", "thiếu khoản của tôi");
    const m = await member.get("/api/v1/finance/summary");
    eq(m.json.contributions.paidCount, null, "thành viên thường không thấy số người đã đóng");
    const hist = await member.get(`/api/v1/finance/members/${memberId}/contributions?months=3`);
    eq(hist.status, 200, detail(hist));
    ok(hist.json.some((x) => x.feeType === "periodic_dues"), "lịch sử phải có kỳ quỹ đang diễn ra");
  });

  // ------------------------------------------------------------------ Tài khoản nhận quỹ của nhà
  await test("Thủ quỹ đặt tài khoản nhận quỹ; thành viên đọc được; Admin sửa ⇒ 403", async () => {
    const body = { bankBin: "970422", bankName: "MB Bank", accountNo: "0904 123 456", accountName: "PHAM GIA BAO", qrFileId: null };
    const r = await put(treasurer, "/api/v1/finance/receiving-account", body);
    eq(r.status, 200, detail(r));
    eq(r.json.account.accountNo, "0904123456", "STK được bỏ khoảng trắng");
    eq(r.json.canEdit, true);
    const m = await member.get("/api/v1/finance/receiving-account");
    eq(m.status, 200, detail(m));
    eq(m.json.account.bankBin, "970422");
    eq(m.json.account.accountName, "PHAM GIA BAO");
    eq(m.json.canEdit, false);
    const a = await put(admin, "/api/v1/finance/receiving-account", { ...body, accountNo: "999999999", accountName: "ADMIN DOI NOI NHAN" });
    eq(a.status, 403, detail(a));
    const mm = await put(member, "/api/v1/finance/receiving-account", body);
    eq(mm.status, 403, detail(mm));
    const bad = await put(treasurer, "/api/v1/finance/receiving-account", { ...body, bankBin: "97042" });
    eq(bad.status, 400, detail(bad));
    const h = await head.get("/api/v1/finance/receiving-account");
    eq(h.json.canEdit, true, "Trưởng nhà cũng sửa được");
  });

  // ------------------------------------------------------------------ Tài khoản nhận tiền của thành viên
  await test("Thành viên sửa tài khoản nhận tiền của mình được; của người khác ⇒ 403 (vẫn xem được)", async () => {
    const own = await put(member, `/api/v1/members/${memberId}/payment-account`, {
      bankBin: "970436",
      bankName: "Vietcombank",
      accountNo: "0011001234567",
      accountName: "LE MINH TUAN",
      note: "Tài khoản chính",
    });
    eq(own.status, 200, detail(own));
    eq(own.json.account.accountNo, "0011001234567");
    eq(own.json.canEdit, true);
    const other = await put(member, `/api/v1/members/${treasurerMemberId}/payment-account`, {
      bankBin: "970436",
      bankName: "Vietcombank",
      accountNo: "1234567890",
      accountName: "HACK",
    });
    eq(other.status, 403, detail(other));
    const view = await member.get(`/api/v1/members/${treasurerMemberId}/payment-account`);
    eq(view.status, 200, detail(view));
    eq(view.json.canEdit, false);
    const del = await member.del(`/api/v1/members/${treasurerMemberId}/payment-account`);
    eq(del.status, 403, detail(del));
    const noBank = await put(member, `/api/v1/members/${memberId}/payment-account`, { bankBin: null, bankName: "MoMo", accountNo: "0903112451", accountName: "LE MINH TUAN" });
    eq(noBank.status, 400, "ví điện tử không có BIN phải kèm ảnh QR");
    const headEdit = await put(head, `/api/v1/members/${memberId}/payment-account`, {
      bankBin: "970436",
      bankName: "Vietcombank",
      accountNo: "0011001234567",
      accountName: "LE MINH TUAN",
      note: "Trưởng nhà cập nhật hộ",
    });
    eq(headEdit.status, 200, "Trưởng nhà (member.update) sửa hộ được");
    const rm = await member.del(`/api/v1/members/${memberId}/payment-account`);
    eq(rm.status, 200, detail(rm));
    const gone = await member.get(`/api/v1/members/${memberId}/payment-account`);
    eq(gone.json.account, null);
  });

  await test("Định mức quỹ riêng: người ra trường (500k), sinh viên (300k), định mức cá nhân; điều chỉnh mức thu", async () => {
    // 1. Trưởng nhà cập nhật tình trạng thành viên: tuan chuyển sang đã tốt nghiệp
    const patchRes = await head.patch(`/api/v1/members/${memberId}`, {
      studentStatus: "graduated",
    });
    eq(patchRes.status, 200, detail(patchRes));
    eq(patchRes.json.studentStatus, "graduated");

    // 2. Xem trước kỳ quỹ phản ánh phân loại
    const pv = await treasurer.get(`/api/v1/finance/contribution-plans/preview?kind=periodic_dues`);
    eq(pv.status, 200, detail(pv));
    ok(pv.json.breakdown, "phải có breakdown phân loại");
    ok(pv.json.breakdown.graduatedCount >= 1, "phải có ít nhất 1 người đã ra trường");
    eq(pv.json.breakdown.graduatedAmountVnd, 500000);

    // 3. Thử gán định mức riêng cho thành viên
    const customRes = await head.patch(`/api/v1/members/${memberId}`, {
      customDuesVnd: 600000,
    });
    eq(customRes.status, 200, detail(customRes));
    eq(customRes.json.customDuesVnd, 600000);

    const pv2 = await treasurer.get(`/api/v1/finance/contribution-plans/preview?kind=periodic_dues`);
    eq(pv2.status, 200, detail(pv2));
    ok(pv2.json.breakdown.customCount >= 1, "phải có ít nhất 1 người có định mức riêng");

    // 4. Khôi phục lại
    await head.patch(`/api/v1/members/${memberId}`, {
      studentStatus: "studying",
      customDuesVnd: null,
    });

    // 5. Thử điều chỉnh khoản phải thu của một contribution
    const matrix = (await treasurer.get(`/api/v1/finance/contributions?months=6`)).json;
    const firstCell = Object.values(matrix?.rows?.[0]?.cells ?? {})[0];
    if (firstCell) {
      const adj = await treasurer.post(`/api/v1/finance/contributions/${firstCell.contributionId}/adjust`, {
        amountDueVnd: 450000,
        reason: "Điều chỉnh thử nghiệm kiểm tra tính năng",
      });
      eq(adj.status, 200, detail(adj));
      eq(adj.json.amountDueVnd, 450000);
      // Khôi phục lại
      await treasurer.post(`/api/v1/finance/contributions/${firstCell.contributionId}/adjust`, {
        amountDueVnd: firstCell.amountDueVnd,
        reason: "Khôi phục mức ban đầu",
      });
    }
  });
}

