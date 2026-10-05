// Seed: Thu Chi — số dư đầu kỳ, kế hoạch thu quỹ 4 tháng gần nhất + khoản đóng (đã đóng / chưa đóng / một phần / miễn /
// đóng gộp), phiếu chi từ INITIAL_EXPENSES (+3 khoản của tháng đầu) ở nhiều trạng thái.
// Mọi ghi nghiệp vụ đi qua app.fn_* (hoặc trigger của bảng) với ĐÚNG người thao tác (ctx.as):
//   số dư đầu kỳ: Trưởng nhà (fn_post_ledger_entry) · kế hoạch + thu quỹ: Thủ quỹ (fn_generate_contributions, fn_record_contribution_payment)
//   miễn quỹ: Trưởng nhà (UPDATE discount — trigger BR-FIN-14) · phiếu chi: người ứng tiền lập + nộp (fn_submit_expense),
//   chữ ký theo luật BR-FIN-01/02/17/35, Thủ quỹ ghi chi (fn_pay_expense) / đảo (fn_reverse_expense), người lập hủy (fn_cancel_expense).
// Dữ liệu lịch sử: chữ ký được chèn với decided_at trong quá khứ (trigger chữ ký vẫn kiểm đủ luật) và các mốc
// submitted_at/approved_at/paid_at được lùi về ngày chi để sổ cái có ngày hạch toán đúng tháng (BR-FIN-18: ngày chi ≥ ngày duyệt).

const CAT = { "Thực phẩm": "FOOD", "Điện nước": "UTILITY", "Vệ sinh": "CLEAN", "Sửa chữa": "REPAIR", "Phụng vụ": "LITURGY", Khác: "OTHER" };
/** "Hôm nay" của dữ liệu giao diện cũ (ngày của khoản chi mới nhất) — mọi ngày mock được dời theo khoảng cách tới hôm nay thật. */
const MOCK_TODAY = "2026-10-04";

// Trạng thái muốn có của từng phiếu (theo id mock); mặc định: đã chi
const VOUCHER_PLAN = {
  1: { state: "pending", signatures: 1 }, // phiếu lớn của Thủ quỹ: Trưởng nhà đã ký 1/2, chờ Phó nhà
  2: { state: "pending", signatures: 0 }, // chờ Trưởng nhà duyệt
  3: { state: "approved" }, // đã duyệt, chờ Thủ quỹ chi
  6: { state: "reversed", reason: "Cửa hàng đổi bảo hành bóng đèn lỗi và hoàn lại tiền" },
  10: { state: "rejected", reason: "Máy giặt còn hạn bảo hành — đề nghị gọi hãng bảo hành miễn phí trước" },
  11: { state: "cancelled", reason: "Giáo xứ tặng sách kinh mới, không cần chi khoản này" },
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
  const vice = ids.userByRole.vice_head;
  const fund = Object.fromEntries((await q("SELECT code, id FROM funds WHERE deleted_at IS NULL")).map((r) => [r.code, r.id]));
  const cat = Object.fromEntries((await q("SELECT code, id FROM categories WHERE kind = 'expense'")).map((r) => [r.code, r.id]));
  const setting = async (k) => Number((await q("SELECT value #>> '{}' AS v FROM settings WHERE key = $1", [k]))[0]?.v);
  const SOLO = await setting("finance.expense.treasurer_solo_approve_max_vnd");
  const DUAL = await setting("finance.expense.dual_approval_min_vnd");
  const RECEIPT_MIN = await setting("finance.expense.receipt_required_min_vnd");

  const months = [3, 2, 1, 0].map((k) => addMonths(today, -k)); // 'YYYY-MM-01' — 4 tháng gần nhất, cũ → mới
  const mkey = (m) => m.slice(0, 7);

  // ---------------------------------------------------------------- 1. Số dư đầu kỳ (Trưởng nhà — finance.ledger.adjust)
  await ctx.as(head);
  for (const [code, amount] of [["CASH", 6_850_000], ["BANK_MAIN", 2_500_000]]) {
    await q("SELECT app.fn_post_ledger_entry($1, $2::date, 'in', $3, 'opening_balance', $4)", [
      fund[code], months[0], amount, `Số dư đầu kỳ chuyển sang từ sổ quỹ giấy (${code === "CASH" ? "tiền mặt Thủ quỹ giữ" : "tài khoản Techcombank"})`,
    ]);
  }

  // ---------------------------------------------------------------- 2. Kế hoạch thu quỹ tháng + sinh khoản phải thu (Thủ quỹ)
  const DUES = mock.INITIAL_CONTRIBUTIONS[0]?.amount ?? 600_000;
  const dueDay = (mock.INITIAL_CONTRIBUTIONS[0]?.deadline ?? "15/10/2026").slice(0, 2);
  await ctx.as(treas);
  for (const m of months) {
    const [mm, yyyy] = [m.slice(5, 7), m.slice(0, 4)];
    const [plan] = await q(
      `INSERT INTO contribution_plans (code, name, fee_type, academic_year_id, period_month, amount_vnd, due_date, fund_id, created_by)
       VALUES ($1, $2, 'monthly_dues', (SELECT id FROM academic_years WHERE $3::date BETWEEN starts_on AND ends_on LIMIT 1),
               $3::date, $4, $5::date, $6, $7) RETURNING id`,
      [`QSH-${yyyy}-${mm}`, `Quỹ sinh hoạt tháng ${mm}/${yyyy}`, m, DUES, `${yyyy}-${mm}-${dueDay}`, fund.CASH, treas]
    );
    await q("SELECT app.fn_generate_contributions($1)", [plan.id]);
  }
  const contrib = {}; // contrib[memberUuid][YYYY-MM] = contribution id
  for (const r of await q(
    `SELECT ct.id, ct.member_id, to_char(cp.period_month, 'YYYY-MM') AS m
       FROM contributions ct JOIN contribution_plans cp ON cp.id = ct.plan_id`
  )) (contrib[r.member_id] ??= {})[r.m] = r.id;

  // ---------------------------------------------------------------- 3. Miễn quỹ (Trưởng nhà — finance.contribution.waive)
  const M = (mockId) => ids.member[mockId];
  await ctx.as(head);
  await q(
    "UPDATE contributions SET discount_vnd = amount_due_vnd, discount_reason = $2 WHERE id = $1",
    [contrib[M(11)][mkey(months[0])], "Đi thực tập xa cả tháng, không ở lưu xá — Ban điều hành miễn quỹ tháng này"]
  );

  // ---------------------------------------------------------------- 4. Thu quỹ (Thủ quỹ — fn_record_contribution_payment)
  await ctx.as(treas);
  const BANK_PAYERS = new Set(["5", "9"]);
  let refSeq = 0;
  const pay = async (mockId, monthKeys, paidOn, { amountEach = DUES, note = null } = {}) => {
    const method = BANK_PAYERS.has(mockId) ? "bank_transfer" : "cash";
    const allocations = monthKeys.map((k) => ({ contribution_id: contrib[M(mockId)][k], amount_vnd: amountEach }));
    const ref = method === "bank_transfer" ? `FT${paidOn.replaceAll("-", "").slice(2)}${String(++refSeq).padStart(5, "0")}` : null;
    await q("SELECT app.fn_record_contribution_payment($1, $2, $3, $4::payment_method_t, $5::date, $6, $7::jsonb, NULL, $8)", [
      M(mockId), method === "cash" ? fund.CASH : fund.BANK_MAIN, amountEach * monthKeys.length, method, paidOn, ref,
      JSON.stringify(allocations), note,
    ]);
  };
  const dayOf = (m, mockId) => `${m.slice(0, 8)}${String(1 + ((Number(mockId) * 3) % 9)).padStart(2, "0")}`;
  const mockIds = mock.INITIAL_MEMBERS.map((m) => String(m.id));
  // Tháng m-3: đủ cả nhà (trừ người được miễn); Hoàng Long đóng gộp 2 tháng
  for (const id of mockIds) {
    if (id === "11") continue;
    if (id === "3") await pay(id, [mkey(months[0]), mkey(months[1])], dayOf(months[0], id), { note: "Đóng gộp 2 tháng" });
    else await pay(id, [mkey(months[0])], dayOf(months[0], id));
  }
  // Tháng m-2: đủ cả nhà (Hoàng Long đã đóng trước)
  for (const id of mockIds) if (id !== "3") await pay(id, [mkey(months[1])], dayOf(months[1], id));
  // Tháng m-1: Tuấn Kiệt (10) chưa đóng, Hữu Phước (12) mới đóng một nửa
  for (const id of mockIds) {
    if (id === "10") continue;
    if (id === "12") await pay(id, [mkey(months[2])], clampToday(`${months[2].slice(0, 8)}12`), { amountEach: DUES / 2, note: "Đóng trước một nửa, hẹn đóng nốt" });
    else await pay(id, [mkey(months[2])], dayOf(months[2], id));
  }
  // Tháng hiện tại: theo INITIAL_CONTRIBUTIONS (ngày nộp dời theo hôm nay)
  for (const c of mock.INITIAL_CONTRIBUTIONS) {
    if (c.status !== "Đã đóng" || !M(c.memberId)) continue;
    const paidOn = c.paidDate ? shift(fromDmy(c.paidDate)) : today;
    await pay(String(c.memberId), [mkey(months[3])], paidOn < months[3] ? months[3] : paidOn);
  }

  // ---------------------------------------------------------------- 5. Phiếu chi
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
  const signersFor = (amount, requester) => {
    if (amount >= DUAL || (requester === head && amount > SOLO)) return [head, treas, vice].filter((u) => u !== requester).slice(0, 2);
    if (amount <= SOLO && requester !== treas) return [treas];
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
    const payee = memberOf(e.paidBy);
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
