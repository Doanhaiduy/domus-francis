// Kiểm thử CHỐT SỔ THÁNG HAI NGƯỜI + ĐỐI SOÁT (gói F — /api/v1/finance/periods…, db/app/1045 fn_reconcile_period / fn_close_period_checked):
//   • quyền: thành viên thường không xem/không chốt được; Thủ quỹ chốt, Trưởng nhà xác nhận / mở lại
//   • cấu hình "bắt buộc đối soát" (đang bật): quỹ ngân hàng chưa đối soát ⇒ không chốt được; đối soát lệch phải giải trình
//   • người chốt KHÔNG tự xác nhận (BR-FIN-10); ghi lùi ngày vào tháng đã chốt / đang chờ xác nhận bị chặn (BR-FIN-06)
//   • mở lại cần lý do ≥ 10 ký tự; thông báo tới người xác nhận / người đã chốt kèm link /thu-chi?tab=so-quy&month=…
//   • quỹ chung duy nhất (gộp tiền mặt + ngân hàng) cũng phải đối soát khi cấu hình bật (thử trong giao dịch rồi ROLLBACK)
// Dùng tháng CŨ NHẤT của DB thử (đã hết tháng); cuối bài luôn MỞ LẠI để không chặn các bộ kiểm thử khác.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Chốt sổ tháng hai người + đối soát (gói F)");
  const db = new pg.Client(pgConfig());
  await db.connect();
  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const detail = (r) => JSON.stringify(r.json);
  const P = "/api/v1/finance/periods";
  const mid = async (email) => (await db.query("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1", [email])).rows[0].id;
  const M = { bao: await mid("bao.pham@luuxa.local"), duc: await mid("duc.tran@luuxa.local"), viet: await mid("viet.vu@luuxa.local") };

  // Lượt chạy trước lỗi giữa chừng còn để kỳ đóng ⇒ mở lại (mới → cũ) để bắt đầu sạch
  for (const r of (await db.query("SELECT to_char(period_month, 'YYYY-MM') AS m FROM financial_periods WHERE status <> 'open' ORDER BY period_month DESC")).rows) {
    await head.post(`${P}/${r.m}/reopen`, { reason: "Dọn kỳ còn khóa từ lượt kiểm thử trước" });
  }
  const today = (await db.query("SELECT app.local_today()::text AS d")).rows[0].d;
  const target = (
    await db.query(
      `SELECT to_char(period_month, 'YYYY-MM') AS m, (period_month + interval '1 month' - interval '1 day')::date::text AS end_date
         FROM financial_periods WHERE status = 'open' AND (period_month + interval '1 month' - interval '1 day')::date <= $1::date
        ORDER BY period_month LIMIT 1`,
      [today]
    )
  ).rows[0];
  if (!target) {
    await test("DB thử có tháng đã hết để chốt sổ", async () => ok(false, "không có tháng nào đã hết trong financial_periods"));
    await db.end();
    return;
  }
  const month = target.m;
  const bank = (await db.query("SELECT id, name FROM funds WHERE code = 'BANK_MAIN' AND deleted_at IS NULL AND is_active")).rows[0];
  const cash = (await db.query("SELECT id FROM funds WHERE code = 'CASH' AND deleted_at IS NULL AND is_active")).rows[0];
  const cfg = (await db.query("SELECT (value #>> '{}')::boolean AS v FROM settings WHERE key = 'finance.period.close_requires_reconciliation'")).rows[0]?.v;
  // Biên bản đối soát còn lại từ lượt trước ⇒ xóa để bắt đầu sạch (kỳ đang mở nên trigger khóa kỳ cho phép)
  const clearRecon = () =>
    db.query("DELETE FROM period_reconciliations WHERE period_id = (SELECT id FROM financial_periods WHERE period_month = $1::date AND status = 'open')", [`${month}-01`]);
  await clearRecon();
  const t0 = (await db.query("SELECT now() AS t")).rows[0].t;
  const notes = async (type) =>
    (
      await db.query(
        `SELECT n.member_id, n.title, n.payload ->> 'link' AS link FROM notifications n JOIN financial_periods fp ON fp.id = n.entity_id
          WHERE n.entity_table = 'financial_periods' AND fp.period_month = $1::date AND n.type_code = $2 AND n.created_at >= $3
          ORDER BY n.created_at`,
        [`${month}-01`, type, t0]
      )
    ).rows;

  try {
    await test("Thành viên thường không xem được bảng chốt sổ, không chốt / đối soát được (403)", async () => {
      eq((await member.get(P)).status, 403);
      eq((await member.post(`${P}/${month}/close`, {})).status, 403);
      eq((await member.post(`${P}/${month}/reconcile`, { fundId: cash.id, statementVnd: 0 })).status, 403);
    });

    await test(`Thủ quỹ xem ${month}: đang mở, có số liệu từng túi quỹ (đầu + thu − chi = cuối), bước chặn nêu quỹ ngân hàng chưa đối soát`, async () => {
      const r = await treasurer.get(P);
      eq(r.status, 200, detail(r));
      ok(cfg === true, "DB thử bật cấu hình bắt buộc đối soát");
      eq(r.json.requireReconciliation, true);
      const p = r.json.periods.find((x) => x.month === month);
      ok(p, "có tháng " + month);
      eq(p.status, "open");
      eq(p.monthEnded, true);
      ok(p.funds && p.funds.length >= 1, "có số liệu túi quỹ");
      for (const f of p.funds) eq(f.closingVnd, f.openingVnd + f.inVnd - f.outVnd, `cân đối ${f.code}`);
      const b = p.funds.find((f) => f.fundId === bank.id);
      eq(b.requiresReconciliation, true, "quỹ ngân hàng phải đối soát");
      ok(p.blockers.some((x) => x.includes(bank.name)), "bước chặn: " + JSON.stringify(p.blockers));
      eq(p.can.close, false);
      ok(Array.isArray(r.json.chain) && r.json.chain.every((c) => c.ok), "chuỗi băm sổ quỹ nguyên vẹn: " + JSON.stringify(r.json.chain));
    });

    await test("Chốt khi quỹ ngân hàng chưa đối soát ⇒ 422 BR-FIN-09", async () => {
      const r = await treasurer.post(`${P}/${month}/close`, {});
      eq(r.status, 422, detail(r));
      ok(/BR-FIN-09/.test(detail(r)), detail(r));
    });

    let ledgerBank;
    await test("Đối soát lệch 10.000đ mà không giải trình ⇒ 422; có giải trình ⇒ lưu, sổ quỹ do CSDL tính (không tin số gửi lên)", async () => {
      ledgerBank = Number((await db.query("SELECT app.fn_fund_balance_at($1, $2::date) AS b", [bank.id, target.end_date])).rows[0].b);
      const bad = await treasurer.post(`${P}/${month}/reconcile`, { fundId: bank.id, statementVnd: ledgerBank - 10_000 });
      eq(bad.status, 422, detail(bad));
      ok(/giải trình/.test(detail(bad)), detail(bad));
      const r = await treasurer.post(`${P}/${month}/reconcile`, { fundId: bank.id, statementVnd: ledgerBank - 10_000, explanation: "Phí quản lý tài khoản 10.000đ chưa vào sổ" });
      eq(r.status, 200, detail(r));
      eq(r.json.ledgerVnd, ledgerBank);
      eq(r.json.differenceVnd, -10_000);
      // Đối soát khớp (không cần giải trình) ghi đè biên bản cũ
      const r2 = await treasurer.post(`${P}/${month}/reconcile`, { fundId: bank.id, statementVnd: ledgerBank });
      eq(r2.status, 200, detail(r2));
      eq(r2.json.differenceVnd, 0);
      const p = (await treasurer.get(P)).json.periods.find((x) => x.month === month);
      eq(p.funds.find((f) => f.fundId === bank.id).reconciliation.differenceVnd, 0);
      eq(p.funds.find((f) => f.fundId === bank.id).reconciliation.stale, false);
      eq(p.can.close, true, "đủ điều kiện chốt: " + JSON.stringify(p.blockers));
    });

    await test("Trưởng nhà (không có quyền chốt bước 1) không chốt được (403); Thủ quỹ chốt ⇒ chờ xác nhận + Trưởng nhà được báo (link tới tháng)", async () => {
      eq((await head.post(`${P}/${month}/close`, {})).status, 403);
      const r = await treasurer.post(`${P}/${month}/close`, { note: "Chốt sổ thử tự động" });
      eq(r.status, 200, detail(r));
      eq(r.json.month, month);
      ok(r.json.funds.length >= 1 && r.json.funds.every((f) => /^[0-9a-f]{64}$/.test(f.headHash)), "ảnh chụp số dư + băm: " + detail(r));
      const p = (await treasurer.get(P)).json.periods.find((x) => x.month === month);
      eq(p.status, "pending_confirmation");
      eq(p.closed.byMe, true);
      eq(p.can.confirm, false, "người chốt không thấy nút xác nhận");
      ok(p.funds.every((f) => f.snapshot), "số liệu là ảnh chụp lúc chốt");
      const n = await notes("finance.period_pending");
      ok(n.some((x) => x.member_id === M.duc), "Trưởng nhà được báo: " + JSON.stringify(n));
      ok(!n.some((x) => x.member_id === M.bao), "người chốt không tự nhận");
      ok(!n.some((x) => x.member_id === M.viet), "Admin không bị báo khi đã có Trưởng nhà");
      ok(n.every((x) => x.link === `/thu-chi?tab=so-quy&month=${month}`), "link: " + JSON.stringify(n));
    });

    await test("Thủ quỹ không xác nhận được (bước 2 là của người khác — 403); đang chờ xác nhận thì không đối soát lại / không ghi lùi ngày vào tháng đó", async () => {
      const r = await treasurer.post(`${P}/${month}/confirm`, {});
      eq(r.status, 403, detail(r));
      const rc = await treasurer.post(`${P}/${month}/reconcile`, { fundId: bank.id, statementVnd: ledgerBank });
      eq(rc.status, 422, detail(rc));
      const adj = await head.post("/api/v1/finance/adjustments", {
        fundId: cash.id,
        direction: "in",
        amountVnd: 1000,
        entryDate: target.end_date,
        reason: "Thử ghi lùi ngày vào kỳ đang chờ xác nhận",
      });
      eq(adj.status, 422, detail(adj));
      ok(/BR-FIN-06/.test(detail(adj)), detail(adj));
    });

    await test("Trưởng nhà xác nhận ⇒ ĐÃ CHỐT; người chốt được báo; ghi lùi ngày vào tháng đã chốt (và tháng trước đó) bị chặn", async () => {
      const r = await head.post(`${P}/${month}/confirm`, {});
      eq(r.status, 200, detail(r));
      const p = (await head.get(P)).json.periods.find((x) => x.month === month);
      eq(p.status, "closed");
      ok(p.confirmed && p.closed, "có người chốt + người xác nhận");
      eq(p.can.reopen, true);
      const n = await notes("finance.period_closed");
      ok(n.some((x) => x.member_id === M.bao), "người chốt được báo: " + JSON.stringify(n));
      ok(!n.some((x) => x.member_id === M.duc), "người xác nhận không tự nhận");
      for (const d of [target.end_date, `${month}-01`]) {
        const adj = await head.post("/api/v1/finance/adjustments", { fundId: cash.id, direction: "in", amountVnd: 1000, entryDate: d, reason: "Thử ghi lùi ngày vào kỳ đã chốt" });
        eq(adj.status, 422, `${d}: ${detail(adj)}`);
      }
      const before = (await db.query("SELECT (period_month - interval '1 day')::date::text AS d FROM financial_periods WHERE period_month = $1::date", [`${month}-01`])).rows[0].d;
      const adj = await head.post("/api/v1/finance/adjustments", { fundId: cash.id, direction: "in", amountVnd: 1000, entryDate: before, reason: "Thử ghi lùi ngày vào tháng trước kỳ đã chốt" });
      eq(adj.status, 422, `${before}: ${detail(adj)}`);
      ok(/BR-FIN-06/.test(detail(adj)), detail(adj));
    });

    await test("Mở lại: Thủ quỹ không có quyền (403); lý do < 10 ký tự ⇒ 400; Trưởng nhà mở lại có lý do ⇒ đang mở + Thủ quỹ được báo", async () => {
      eq((await treasurer.post(`${P}/${month}/reopen`, { reason: "Phát hiện sai sót cần sửa" })).status, 403);
      eq((await head.post(`${P}/${month}/reopen`, { reason: "sai sót" })).status, 400);
      const r = await head.post(`${P}/${month}/reopen`, { reason: "Phát hiện thiếu khoản thu cuối tháng (kiểm thử)" });
      eq(r.status, 200, detail(r));
      const p = (await head.get(P)).json.periods.find((x) => x.month === month);
      eq(p.status, "open");
      ok(p.reopenCount >= 1 && p.reopened?.reason?.includes("kiểm thử"), JSON.stringify(p.reopened));
      ok(p.funds.every((f) => !f.snapshot), "ảnh chụp cũ bị bỏ — số liệu tính trực tiếp lại");
      const n = (await notes("finance.period_closed")).filter((x) => /mở lại/.test(x.title));
      ok(n.some((x) => x.member_id === M.bao), "Thủ quỹ được báo mở lại: " + JSON.stringify(n));
    });

    await test("Người chốt KHÔNG tự xác nhận dù có cả hai quyền (Admin chốt rồi tự xác nhận ⇒ 422 BR-FIN-10); người khác xác nhận được", async () => {
      const c = await admin.post(`${P}/${month}/close`, { note: "Admin chốt thử nguyên tắc hai người" });
      eq(c.status, 200, detail(c));
      const self = await admin.post(`${P}/${month}/confirm`, {});
      eq(self.status, 422, detail(self));
      ok(/BR-FIN-10/.test(detail(self)), detail(self));
      const p = (await admin.get(P)).json.periods.find((x) => x.month === month);
      eq(p.can.confirm, false, "người chốt không thấy nút xác nhận");
      eq((await head.post(`${P}/${month}/confirm`, {})).status, 200);
      eq((await head.post(`${P}/${month}/reopen`, { reason: "Mở lại sau thử nguyên tắc hai người" })).status, 200);
    });

    await test("Quỹ chung DUY NHẤT (gộp tiền mặt + ngân hàng) cũng phải đối soát khi cấu hình bật; tắt cấu hình ⇒ không bắt (thử trong giao dịch, ROLLBACK)", async () => {
      const c = new pg.Client(pgConfig());
      await c.connect();
      try {
        await c.query("BEGIN");
        await c.query("UPDATE funds SET is_active = false WHERE code <> 'CASH' AND deleted_at IS NULL");
        const pid = (await c.query("SELECT id FROM financial_periods WHERE period_month = $1::date", [`${month}-01`])).rows[0].id;
        const u = (await c.query("SELECT f.code, u.missing FROM app.fn_period_unreconciled($1) u JOIN funds f ON f.id = u.fund_id", [pid])).rows;
        ok(u.some((x) => x.code === "CASH" && x.missing), "quỹ chung CASH phải đối soát: " + JSON.stringify(u));
        await c.query("UPDATE settings SET value = 'false'::jsonb WHERE key = 'finance.period.close_requires_reconciliation'");
        eq((await c.query("SELECT count(*)::int AS n FROM app.fn_period_unreconciled($1)", [pid])).rows[0].n, 0, "tắt cấu hình ⇒ không bắt đối soát");
      } finally {
        await c.query("ROLLBACK").catch(() => {});
        await c.end();
      }
    });
  } finally {
    // Luôn mở lại tháng thử (không để chặn ghi sổ của các bộ kiểm thử khác)
    const st = (await db.query("SELECT status::text AS s FROM financial_periods WHERE period_month = $1::date", [`${month}-01`])).rows[0]?.s;
    if (st && st !== "open") await head.post(`${P}/${month}/reopen`, { reason: "Dọn: mở lại kỳ sau kiểm thử chốt sổ" });
    await clearRecon().catch(() => {});
    await db.end();
  }
}
