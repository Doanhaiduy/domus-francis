// Seed: Thu Chi — số dư đầu kỳ, QUỸ ĐỊNH KỲ của kỳ hiện tại (vd. T7–T12/2026, 300.000 đ/người: đã đóng / chưa đóng / một phần /
// được giảm / đóng gộp với tiền điện nước), TIỀN ĐIỆN NƯỚC 2 tháng gần nhất (tổng hóa đơn chia đều, làm tròn lên 1.000 đ),
// tài khoản nhận tiền của vài thành viên, phiếu chi từ INITIAL_EXPENSES (+3 khoản của tháng đầu) ở nhiều trạng thái.
// Mọi ghi nghiệp vụ đi qua app.fn_* (hoặc trigger của bảng) với ĐÚNG người thao tác (ctx.as):
//   số dư đầu kỳ: Trưởng nhà (fn_post_ledger_entry) · kế hoạch thu: Thủ quỹ (fn_create_dues_cycle_plan, fn_create_utility_plan)
//   thu quỹ: Thủ quỹ (fn_record_contribution_payment) · giảm quỹ: Trưởng nhà (UPDATE discount — trigger BR-FIN-14)
//   phiếu chi: người ứng tiền lập + nộp (fn_submit_expense), chữ ký theo luật BR-FIN-01/02/17/35, Thủ quỹ ghi chi (fn_pay_expense) /
//   đảo (fn_reverse_expense), người lập hủy (fn_cancel_expense).
// Không dùng vai trò Phó nhà (đã bỏ — db/data/2026-10-05-01_roles.sql): phiếu cần 2 chữ ký do Trưởng nhà + Thủ quỹ ký, nên người
// ứng tiền của các phiếu đó không phải hai người này (BR-FIN-01) — khoản đi chợ lớn do Trưởng ban Ẩm thực ứng.
// Dữ liệu lịch sử: chữ ký được chèn với decided_at trong quá khứ (trigger chữ ký vẫn kiểm đủ luật) và các mốc
// submitted_at/approved_at/paid_at được lùi về ngày chi để sổ cái có ngày hạch toán đúng tháng (BR-FIN-18: ngày chi ≥ ngày duyệt).

const CAT = { "Thực phẩm": "FOOD", "Điện nước": "UTILITY", "Vệ sinh": "CLEAN", "Sửa chữa": "REPAIR", "Phụng vụ": "LITURGY", Khác: "OTHER" };
/** "Hôm nay" của dữ liệu giao diện cũ (ngày của khoản chi mới nhất) — mọi ngày mock được dời theo khoảng cách tới hôm nay thật. */
const MOCK_TODAY = "2026-10-04";

// Trạng thái muốn có của từng phiếu (theo id mock); mặc định: đã chi
const VOUCHER_PLAN = {
  1: { state: "pending", signatures: 1 }, // phiếu lớn (2 chữ ký): Trưởng nhà đã ký 1/2, chờ Thủ quỹ
  2: { state: "pending", signatures: 0 }, // chờ Trưởng nhà duyệt
  3: { state: "approved" }, // đã duyệt, chờ Thủ quỹ chi
  6: { state: "reversed", reason: "Cửa hàng đổi bảo hành bóng đèn lỗi và hoàn lại tiền" },
  10: { state: "rejected", reason: "Máy giặt còn hạn bảo hành — đề nghị gọi hãng bảo hành miễn phí trước" },
  11: { state: "cancelled", reason: "Giáo xứ tặng sách kinh mới, không cần chi khoản này" },
};

// Tiền điện nước 2 tháng gần nhất (tháng hóa đơn = tháng trước và tháng trước nữa): tổng hóa đơn điện + nước của cả nhà
const UTILITY_BILLS = [
  { back: 2, total: 1_630_000, note: "Điện 1.250.000 + nước 380.000" },
  { back: 1, total: 1_850_000, note: "Điện 1.180.000 + nước 670.000" },
];

// Tài khoản nhận tiền demo của vài thành viên (mock id → ngân hàng NAPAS)
const PAYMENT_ACCOUNTS = {
  4: { bin: "970422", bank: "MB Bank", no: "0904123456", name: "PHAM GIA BAO", note: "Nhận hoàn ứng tiền chợ, điện nước" },
  8: { bin: "970436", bank: "Vietcombank", no: "1012345678", name: "HOANG DINH KHOI", note: null },
  1: { bin: "970407", bank: "Techcombank", no: "19036655443322", name: "LE MINH TUAN", note: null },
};

const D = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = D(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const addMonths = (s, n) => {
  const d = D(`${s.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
};
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86_400_000);
const fromDmy = (s) => s.split("/").reverse().join("-");
const at = (day, hm) => `${day}T${hm}:00+07:00`;
const maxIso = (...xs) => xs.reduce((a, b) => (a > b ? a : b));

export async function seed(ctx) {
  const { q, ids, mock } = ctx;
  const existing = (await q("SELECT (SELECT count(*) FROM ledger_entries)::int + (SELECT count(*) FROM contribution_plans)::int AS n"))[0].n;
  if (existing > 0) {
    console.log("  · finance: DB đã có dữ liệu thu chi — bỏ qua (seed chỉ chạy một lần)");
    return;
  }

  const [{ today }] = await q("SELECT app.local_today()::text AS today");
  const shiftDays = daysBetween(MOCK_TODAY, today);
  const clampToday = (s) => (s > today ? today : s);
  const shift = (s) => clampToday(addDays(s, shiftDays));

  const head = ids.userByRole.house_head;
  const treas = ids.userByRole.treasurer;
  const fund = Object.fromEntries((await q("SELECT code, id FROM funds WHERE deleted_at IS NULL")).map((r) => [r.code, r.id]));
  const cat = Object.fromEntries((await q("SELECT code, id FROM categories WHERE kind = 'expense'")).map((r) => [r.code, r.id]));
  const setting = async (k) => Number((await q("SELECT value #>> '{}' AS v FROM settings WHERE key = $1", [k]))[0]?.v);
  const SOLO = await setting("finance.expense.treasurer_solo_approve_max_vnd");
  const DUAL = await setting("finance.expense.dual_approval_min_vnd");
  const RECEIPT_MIN = await setting("finance.expense.receipt_required_min_vnd");

  const months = [3, 2, 1, 0].map((k) => addMonths(today, -k)); // 'YYYY-MM-01' — 4 tháng gần nhất, cũ → mới
  const opening = months[0];
  const M = (mockId) => ids.member[mockId];
  const mockIds = mock.INITIAL_MEMBERS.map((m) => String(m.id));

  // ---------------------------------------------------------------- 1. Số dư đầu kỳ (Trưởng nhà — finance.ledger.adjust)
  await ctx.as(head);
  for (const [code, amount] of [["CASH", 6_850_000], ["BANK_MAIN", 2_500_000]]) {
    await q("SELECT app.fn_post_ledger_entry($1, $2::date, 'in', $3, 'opening_balance', $4)", [
      fund[code], opening, amount, `Số dư đầu kỳ chuyển sang từ sổ quỹ giấy (${code === "CASH" ? "tiền mặt Thủ quỹ giữ" : "tài khoản Techcombank"})`,
    ]);
  }

  // ---------------------------------------------------------------- 2. Kế hoạch thu (Thủ quỹ): kỳ quỹ hiện tại + điện nước 2 tháng
  await ctx.as(treas);
  const [cycle] = await q("SELECT start_month::text AS s, end_month::text AS e FROM app.fn_dues_cycle_bounds($1::date)", [today]);
  const [{ r: duesRes }] = await q("SELECT app.fn_create_dues_cycle_plan($1::date) AS r", [cycle.s]);
  const dues = { id: duesRes.plan_id, amount: Number(duesRes.amount_vnd), start: cycle.s };
  const utils = [];
  for (const b of UTILITY_BILLS) {
    const month = addMonths(today, -b.back);
    const [{ r }] = await q("SELECT app.fn_create_utility_plan($1::date, $2, NULL, NULL, $3) AS r", [month, b.total, b.note]);
    utils.push({ id: r.plan_id, amount: Number(r.amount_vnd), month });
  }
  const [utilOld, utilNew] = utils;

  const contrib = {}; // contrib[memberUuid][planId] = contribution id
  for (const r of await q("SELECT id, member_id, plan_id FROM contributions")) (contrib[r.member_id] ??= {})[r.plan_id] = r.id;

  // ---------------------------------------------------------------- 3. Giảm quỹ (Trưởng nhà — finance.contribution.waive)
  await ctx.as(head);
  await q("UPDATE contributions SET discount_vnd = $2, discount_reason = $3 WHERE id = $1", [
    contrib[M(11)][dues.id], Math.round(dues.amount / 2 / 1000) * 1000,
    "Đi thực tập xa 3 tháng trong kỳ, không ở lưu xá — Ban điều hành giảm một nửa quỹ kỳ",
  ]);

  // ---------------------------------------------------------------- 4. Thu quỹ (Thủ quỹ — fn_record_contribution_payment)
  await ctx.as(treas);
  const BANK_PAYERS = new Set(["5", "9"]);
  let refSeq = 0;
  /** Một phiếu thu của thành viên `mockId`, phân bổ cho 1..n khoản (đóng gộp nếu nhiều khoản). */
  const pay = async (mockId, items, paidOn, note = null) => {
    const method = BANK_PAYERS.has(mockId) ? "bank_transfer" : "cash";
    const allocations = items.map((it) => ({ contribution_id: contrib[M(mockId)][it.plan.id], amount_vnd: it.amount ?? it.plan.amount }));
    const total = allocations.reduce((s, a) => s + a.amount_vnd, 0);
    const ref = method === "bank_transfer" ? `FT${paidOn.replaceAll("-", "").slice(2)}${String(++refSeq).padStart(5, "0")}` : null;
    await q("SELECT app.fn_record_contribution_payment($1, $2, $3, $4::payment_method_t, $5::date, $6, $7::jsonb, NULL, $8)", [
      M(mockId), method === "cash" ? fund.CASH : fund.BANK_MAIN, total, method, paidOn, ref, JSON.stringify(allocations), note,
    ]);
  };
  /** Ngày nộp rải đều sau mốc `from` (không trước số dư đầu kỳ, không sau hôm nay). */
  const dayAfter = (from, mockId, span = 12) => clampToday(addDays(maxIso(from, opening), (Number(mockId) * 3) % span));

  // Quỹ kỳ hiện tại: Lê Hoàng Long (3) và Đỗ Tuấn Kiệt (10) chưa đóng; Phan Bảo Nam (11) được giảm một nửa, chưa đóng phần còn lại;
  // Lý Hữu Phước (12) mới đóng một nửa; Trưởng nhà (2) đóng gộp quỹ kỳ + điện nước tháng trước nữa trong một phiếu thu.
  for (const id of mockIds) {
    if (["3", "10", "11", "2"].includes(id)) continue;
    if (id === "12") await pay(id, [{ plan: dues, amount: Math.round(dues.amount / 2 / 1000) * 1000 }], dayAfter(dues.start, id, 20), "Đóng trước một nửa quỹ kỳ, hẹn đóng nốt");
    else await pay(id, [{ plan: dues }], dayAfter(dues.start, id, 20));
  }
  const afterOld = addMonths(utilOld.month, 1); // tiền điện nước tháng X thu từ đầu tháng X+1
  await pay("2", [{ plan: dues }, { plan: utilOld }], dayAfter(afterOld, "2", 8), "Đóng gộp quỹ kỳ + tiền điện nước");
  // Điện nước tháng trước nữa: đủ cả nhà trừ Đỗ Tuấn Kiệt (10) — đã quá hạn
  for (const id of mockIds) if (!["2", "10"].includes(id)) await pay(id, [{ plan: utilOld }], dayAfter(afterOld, id, 9));
  // Điện nước tháng trước (đang trong hạn): mới vài người nộp
  const afterNew = addMonths(utilNew.month, 1);
  for (const id of ["1", "4", "5", "6", "7", "8"]) await pay(id, [{ plan: utilNew }], dayAfter(afterNew, id, 5));

  // ---------------------------------------------------------------- 5. Tài khoản nhận tiền của thành viên (chính chủ tự khai)
  for (const [mockId, a] of Object.entries(PAYMENT_ACCOUNTS)) {
    const memberId = M(mockId);
    if (!memberId) continue;
    await ctx.as(ids.user[mockId]);
    await q(
      `INSERT INTO member_payment_accounts (member_id, bank_bin, bank_name, account_no, account_name, note)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (member_id) DO NOTHING`,
      [memberId, a.bin, a.bank, a.no, a.name, a.note]
    );
  }

  // ---------------------------------------------------------------- 6. Phiếu chi
  const extras = [
    { id: "x1", name: "Tiền điện sinh hoạt tháng trước (EVN Hà Nội)", amount: 960_000, category: "Điện nước", date: addDays(months[0], 7), paidBy: "Gia Bảo", note: "Thanh toán qua ứng dụng ngân hàng" },
    { id: "x2", name: "Tiền chợ cho anh em ở lại lưu xá dịp hè", amount: 1_850_000, category: "Thực phẩm", date: addDays(months[0], 13), paidBy: "Gia Bảo", note: "Nhóm 5 anh em ở lại trông nhà" },
    { id: "x3", name: "Thay ổ khóa cửa phòng sinh hoạt chung", amount: 150_000, category: "Sửa chữa", date: addDays(months[0], 21), paidBy: "Hoàng Long" },
  ];
  const vouchers = [
    ...extras.map((e) => ({ ...e, date: clampToday(e.date), status: "Đã duyệt" })),
    ...mock.INITIAL_EXPENSES.map((e) => ({ ...e, date: shift(fromDmy(e.date)) })),
  ].sort((a, b) => (a.date === b.date ? Number(b.id) - Number(a.id) || 0 : a.date < b.date ? -1 : 1));

  const memberOf = (name) => ids.memberByName[name] ?? ids.memberByFullName[name];
  const userOf = async (memberId) => (await q("SELECT user_id FROM members WHERE id = $1", [memberId]))[0]?.user_id;
  const memberOfUser = async (userId) => (await q("SELECT id FROM members WHERE user_id = $1", [userId]))[0]?.id;
  const headMember = await memberOfUser(head);
  const treasMember = await memberOfUser(treas);
  const kitchenMember = M("8"); // Trưởng ban Ẩm thực — đi chợ cho cả nhà
  const logisticsMember = M("7"); // phụ trách hậu cần
  /** Người ứng tiền thực tế: phiếu cần chữ ký của cả Trưởng nhà lẫn Thủ quỹ thì người ứng không được là một trong hai (BR-FIN-01). */
  const payeeFor = (e) => {
    const p = memberOf(e.paidBy);
    const needsBoth = e.amount >= DUAL || (p === headMember && e.amount > SOLO);
    if (needsBoth && (p === headMember || p === treasMember)) return CAT[e.category] === "FOOD" ? kitchenMember : logisticsMember;
    return p;
  };
  const signersFor = (amount, requester) => {
    if (amount >= DUAL) return [head, treas]; // hai vai trò khác nhau, có Trưởng nhà
    if (amount <= SOLO && requester !== treas) return [treas]; // Thủ quỹ tự duyệt khoản nhỏ
    return [requester === head ? treas : head];
  };
  // Ghi chữ ký: phiếu hôm nay qua fn_decide_expense; phiếu cũ chèn chữ ký với thời điểm lịch sử (trigger kiểm đủ luật)
  const decide = async (voucherId, signer, decision, comment, when) => {
    await ctx.as(signer);
    if (!when) return q("SELECT app.fn_decide_expense($1, $2::approval_decision_t, $3)", [voucherId, decision, comment]);
    return q(
      `INSERT INTO expense_approvals (voucher_id, round, approver_user_id, approver_role, decision, comment, decided_at)
       VALUES ($1, 0, $2, 'treasurer', $3::approval_decision_t, $4, $5::timestamptz)`,
      [voucherId, signer, decision, comment, when]
    );
  };

  for (const e of vouchers) {
    const plan = VOUCHER_PLAN[e.id] ?? { state: "paid" };
    const payee = payeeFor(e);
    if (!payee) throw new Error(`Không tìm thấy người ứng tiền "${e.paidBy}"`);
    const requester = await userOf(payee);
    const bank = CAT[e.category] === "UTILITY";
    const historic = e.date < today;
    const T = (hm) => (historic ? at(e.date, hm) : null);

    await ctx.as(requester);
    const [v] = await q(
      `INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, note, no_receipt_reason, requested_by)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9) RETURNING id`,
      [
        e.name, e.amount, cat[CAT[e.category] ?? "OTHER"], e.date, bank ? fund.BANK_MAIN : fund.CASH, payee, e.note ?? null,
        e.amount >= RECEIPT_MIN ? (bank ? "Hóa đơn điện tử gửi qua email, bản in lưu tại sổ quỹ" : "Biên lai giấy đã nộp Thủ quỹ, lưu tại sổ quỹ") : null,
        requester,
      ]
    );
    await q("SELECT app.fn_submit_expense($1)", [v.id]);
    if (historic) await q("UPDATE expense_vouchers SET submitted_at = $2::timestamptz WHERE id = $1", [v.id, T("19:00")]);

    if (plan.state === "cancelled") {
      await q("SELECT app.fn_cancel_expense($1, $2)", [v.id, plan.reason]);
      if (historic) await q("UPDATE expense_vouchers SET cancelled_at = $2::timestamptz WHERE id = $1", [v.id, at(addDays(e.date, 1), "08:00")]);
      continue;
    }
    const signers = signersFor(e.amount, requester);
    if (plan.state === "rejected") {
      await decide(v.id, signers[0], "rejected", plan.reason, T("20:00"));
      if (historic) await q("UPDATE expense_vouchers SET rejected_at = $2::timestamptz WHERE id = $1", [v.id, T("20:00")]);
      continue;
    }
    const nSign = plan.state === "pending" ? plan.signatures : signers.length;
    for (let i = 0; i < nSign; i++) await decide(v.id, signers[i], "approved", null, T(i === 0 ? "20:00" : "20:30"));
    if (plan.state === "pending") continue;
    if (historic) await q("UPDATE expense_vouchers SET approved_at = $2::timestamptz WHERE id = $1", [v.id, T(signers.length > 1 ? "20:30" : "20:00")]);
    if (plan.state === "approved") continue;

    await ctx.as(treas);
    await q("SELECT app.fn_pay_expense($1, $2::payment_method_t, $3::date, $4)", [
      v.id, bank ? "bank_transfer" : "cash", e.date, bank ? `UNC-${e.date.replaceAll("-", "")}` : null,
    ]);
    if (historic) await q("UPDATE expense_vouchers SET paid_at = $2::timestamptz WHERE id = $1", [v.id, T("21:00")]);
    if (plan.state === "reversed") await q("SELECT app.fn_reverse_expense($1, $2)", [v.id, plan.reason]);
  }
  await ctx.as(head);
}
