// Kiểm thử SỔ QUỸ CÓ SỐ DƯ (xuất Excel), CẢNH BÁO TÁCH PHIẾU CHI, bước cron LEDGER-VERIFY (gói F):
//   • GET /api/v1/finance/ledger: chỉ người xem sổ quỹ; mỗi túi quỹ đầu kỳ + thu − chi = cuối kỳ; số dư sau từng bút toán liên tục;
//     cuối kỳ khớp số dư thật của túi quỹ (v_fund_balances); chứng từ (số phiếu chi / mã khoản thu); khoảng ngày sai ⇒ 400
//   • GET /api/v1/finance/split-alerts: 2 phiếu một chữ ký cho cùng người trong một tuần, tổng ≥ ngưỡng 2 chữ ký ⇒ có cảnh báo; thành viên ⇒ 403
//   • cron tối "ledger-verify": chuỗi đúng ⇒ bước đạt + ghi chú "toàn vẹn"; đầu chuỗi lệch (túi quỹ thử) ⇒ ghi chú HỎNG,
//     chạy thật ⇒ báo Admin (system.ops_alert, link /thu-chi?tab=so-quy) một lần mỗi ngày. Túi quỹ thử được trả lại nguyên trạng.
import { randomUUID } from "node:crypto";
import pg from "pg";

const CRON = "test-cron-secret-0001";
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Sổ quỹ có số dư + cảnh báo tách phiếu + kiểm chuỗi băm sổ quỹ (gói F)");
  const db = new pg.Client(pgConfig());
  await db.connect();
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const detail = (r) => JSON.stringify(r.json);
  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const today = options.today;
  const from = addDays(today, -120);

  try {
    await test("Sổ quỹ: thành viên thường bị chặn (403); khoảng ngày ngược / quá 366 ngày ⇒ 400", async () => {
      eq((await member.get(`/api/v1/finance/ledger?from=${from}&to=${today}`)).status, 403);
      eq((await treasurer.get(`/api/v1/finance/ledger?from=${today}&to=${from}`)).status, 400);
      eq((await treasurer.get(`/api/v1/finance/ledger?from=${addDays(today, -400)}&to=${today}`)).status, 400);
      eq((await treasurer.get(`/api/v1/finance/ledger?from=2026-1-1&to=${today}`)).status, 400);
    });

    await test("Sổ quỹ 120 ngày: đầu + thu − chi = cuối; số dư sau từng bút toán nối liền; cuối kỳ = số dư thật của túi quỹ; có chứng từ", async () => {
      const r = await treasurer.get(`/api/v1/finance/ledger?from=${from}&to=${today}`);
      eq(r.status, 200, detail(r));
      const book = r.json;
      ok(book.funds.length >= 1, "có túi quỹ");
      eq(book.truncated, false);
      const real = Object.fromEntries((await db.query("SELECT fund_id, balance_vnd FROM v_fund_balances")).rows.map((x) => [x.fund_id, Number(x.balance_vnd)]));
      let withEntries = 0;
      for (const f of book.funds) {
        eq(f.closingVnd, f.openingVnd + f.inVnd - f.outVnd, `cân đối ${f.code}`);
        if (real[f.fundId] !== undefined) eq(f.closingVnd, real[f.fundId], `cuối kỳ = số dư thật ${f.code}`);
        let bal = f.openingVnd;
        for (const e of f.entries) {
          bal += e.direction === "in" ? e.amountVnd : -e.amountVnd;
          eq(e.balanceAfterVnd, bal, `số dư sau bút toán #${e.seq} ${f.code}`);
          ok(e.date >= from && e.date <= today, "ngày trong khoảng");
        }
        if (f.entries.length) {
          withEntries++;
          eq(f.entries[f.entries.length - 1].balanceAfterVnd, f.closingVnd, `bút toán cuối = số dư cuối ${f.code}`);
        }
        const sum = f.entries.reduce((a, e) => a + (e.direction === "in" ? e.amountVnd : -e.amountVnd), 0);
        eq(sum, f.inVnd - f.outVnd, `tổng bút toán ${f.code}`);
      }
      ok(withEntries >= 1, "có bút toán trong khoảng");
      const all = book.funds.flatMap((f) => f.entries);
      const exp = all.find((e) => e.sourceType === "expense");
      if (exp) ok(/^PC-\d{4}-\d{2}-\d{4}$/.test(exp.document ?? ""), "chứng từ phiếu chi: " + JSON.stringify(exp));
      const con = all.find((e) => e.sourceType === "contribution");
      if (con) ok(con.document && con.counterparty, "chứng từ khoản thu + người nộp: " + JSON.stringify(con));
    });

    await test("Sổ quỹ một túi quỹ (?fund=) chỉ trả túi quỹ đó", async () => {
      const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
      const r = await treasurer.get(`/api/v1/finance/ledger?from=${from}&to=${today}&fund=${cash.id}`);
      eq(r.status, 200, detail(r));
      eq(r.json.funds.length, 1);
      eq(r.json.funds[0].fundId, cash.id);
    });

    await test("Cảnh báo tách phiếu: 2 phiếu một chữ ký 600.000đ cùng người ứng (Hiếu) trong tuần ⇒ có cảnh báo tổng 1.200.000đ; thành viên ⇒ 403", async () => {
      const hieu = (await db.query("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = 'hieu.bui@luuxa.local'")).rows[0].id;
      const category = options.categories.find((c) => c.code === "OTHER") ?? options.categories[0];
      const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
      const stamp = Date.now().toString(36).slice(-5);
      const ids = [];
      try {
        for (const i of [1, 2]) {
          const r = await member.post("/api/v1/finance/expenses", {
            title: `Phiếu tách thử ${stamp}-${i}`,
            amountVnd: 600_000,
            categoryId: category.id,
            expenseDate: today,
            fundId: cash.id,
            paidByMemberId: hieu,
            noReceiptReason: "Phiếu kiểm thử cảnh báo",
            submit: true,
            clientRequestId: randomUUID(),
          });
          eq(r.status, 201, detail(r));
          eq(r.json.requiredApprovals, 1, "mỗi phiếu dưới ngưỡng 2 chữ ký");
          ids.push(r.json);
        }
        eq((await member.get("/api/v1/finance/split-alerts")).status, 403);
        const a = await treasurer.get("/api/v1/finance/split-alerts?days=30");
        eq(a.status, 200, detail(a));
        eq(a.json.thresholdVnd, 1_000_000);
        const hit = a.json.alerts.find((x) => ids.every((v) => x.vouchers.some((y) => y.id === v.id)));
        ok(hit, "có cảnh báo chứa 2 phiếu: " + detail(a));
        ok(hit.totalVnd >= 1_200_000, "tổng ≥ 1.200.000: " + hit.totalVnd);
        eq(hit.counterparty, "Văn Hiếu");
      } finally {
        for (const v of ids) await member.post(`/api/v1/finance/expenses/${v.id}/cancel`, { reason: "Dọn phiếu thử cảnh báo tách" });
      }
    });

    await test("Cron tối (xem trước): bước ledger-verify đạt, ghi chú sổ quỹ toàn vẹn", async () => {
      const r = await admin.post("/api/v1/integrations/cron/run", { slot: "evening", dry: true });
      eq(r.status, 200, detail(r));
      const step = r.json.steps.find((s) => s.name === "ledger-verify");
      ok(step, "có bước ledger-verify: " + JSON.stringify(r.json.steps.map((s) => s.name)));
      eq(step.ok, true, JSON.stringify(step));
      ok((step.info ?? []).some((x) => /toàn vẹn/.test(x)), JSON.stringify(step));
    });

    await test("Chuỗi băm lệch (túi quỹ thử) ⇒ xem trước ghi chú HỎNG; chạy thật ⇒ Admin nhận cảnh báo system.ops_alert (link sổ quỹ) — rồi trả lại nguyên trạng", async () => {
      const code = `TCHAIN_${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const fund = (
        await db.query("INSERT INTO funds (code, name, fund_type, description, head_hash) VALUES ($1, 'Quỹ thử chuỗi băm', 'cash', 'Túi quỹ tạo bởi kiểm thử ledger-verify', repeat('a', 64)) RETURNING id", [code])
      ).rows[0].id;
      try {
        const dry = await admin.post("/api/v1/integrations/cron/run", { slot: "evening", dry: true });
        const step = dry.json.steps.find((s) => s.name === "ledger-verify");
        eq(step.ok, true, "bước không lỗi (chỉ cảnh báo): " + JSON.stringify(step));
        ok((step.info ?? []).some((x) => /HỎNG/.test(x) && x.includes(code)), JSON.stringify(step));
        const r = await fetch(`${BASE}/api/cron/daily?slot=evening`, { headers: { authorization: `Bearer ${CRON}` } });
        const j = await r.json();
        const real = (j.steps ?? []).find((s) => s.name === "ledger-verify");
        ok(real && real.ok, "bước ledger-verify chạy thật đạt: " + JSON.stringify(j.steps));
        const key = `ledger-chain:${today}`;
        ok((await db.query("SELECT 1 FROM system_post_log WHERE key = $1", [key])).rowCount === 1, "đã ghi khóa chống gửi trùng " + key);
        const n = (
          await db.query(
            `SELECT n.title, n.payload ->> 'link' AS link FROM notifications n JOIN members m ON m.id = n.member_id JOIN users u ON u.id = m.user_id
              WHERE u.email = 'viet.vu@luuxa.local' AND n.type_code = 'system.ops_alert' AND n.title LIKE '%Sổ quỹ%' ORDER BY n.created_at DESC LIMIT 1`
          )
        ).rows[0];
        ok(n, "Admin có cảnh báo sổ quỹ");
        eq(n.link, "/thu-chi?tab=so-quy");
      } finally {
        await db.query("UPDATE funds SET head_hash = repeat('0', 64), is_active = false, deleted_at = now() WHERE id = $1", [fund]);
      }
      const ok2 = await admin.post("/api/v1/integrations/cron/run", { slot: "evening", dry: true });
      const step2 = ok2.json.steps.find((s) => s.name === "ledger-verify");
      ok((step2.info ?? []).some((x) => /toàn vẹn/.test(x)), "trả lại nguyên trạng: " + JSON.stringify(step2));
    });
  } finally {
    await db.end();
  }
}
