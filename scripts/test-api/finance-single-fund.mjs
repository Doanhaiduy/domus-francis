// Kiểm thử QUỸ CHUNG DUY NHẤT (gộp quỹ tiền mặt + tài khoản ngân hàng): migration db/data/2026-10-07-05_single_fund.sql chỉ gộp khi túi quỹ ngân hàng
// còn trống (giữ nguyên khi đã có giao dịch), và khi nhà chỉ còn MỘT túi quỹ thì mọi luồng vẫn chạy (tùy chọn quỹ, số dư đầu kỳ, nhận giao dịch ngân hàng).
// Bộ này đổi trạng thái túi quỹ BANK_MAIN trong DB thử và LUÔN khôi phục khi xong (migration chạy trong giao dịch rồi ROLLBACK).

import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const SECRET = "test-bank-webhook-secret-0001";

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Quỹ chung duy nhất (gộp tiền mặt + ngân hàng)");

  const head = await as("duc.tran@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const suffix = Date.now().toString(36);
  const sql = readFileSync(path.join(process.cwd(), "db", "data", "2026-10-07-05_single_fund.sql"), "utf8")
    .replace(/^\s*BEGIN;\s*$/m, "")
    .replace(/^\s*COMMIT;\s*$/m, "");

  const db = new pg.Client(pgConfig());
  await db.connect();
  const fundOf = async (code) => (await db.query("SELECT id, name, is_active, deleted_at, last_seq FROM funds WHERE code = $1", [code])).rows[0];
  const bank0 = await fundOf("BANK_MAIN");
  const cash0 = await fundOf("CASH");

  try {
    await test("Migration: túi quỹ ngân hàng ĐÃ có giao dịch ⇒ giữ nguyên hai túi quỹ (không tự chuyển tiền)", async () => {
      ok(bank0 && cash0, "DB thử cần có CASH và BANK_MAIN");
      ok(Number(bank0.last_seq) > 0, "BANK_MAIN trong DB thử có giao dịch demo");
      await db.query("BEGIN");
      try {
        await db.query(sql);
        const bank = await fundOf("BANK_MAIN");
        const cash = await fundOf("CASH");
        eq(bank.deleted_at, null, "BANK_MAIN không bị xóa");
        eq(bank.is_active, true);
        eq(cash.name, cash0.name, "CASH không đổi tên");
      } finally {
        await db.query("ROLLBACK");
      }
    });

    await test("Migration: túi quỹ ngân hàng CHƯA có giao dịch ⇒ ngưng BANK_MAIN, đổi tên CASH thành 'Quỹ Lưu Xá'; chạy lại không đổi gì thêm", async () => {
      await db.query("BEGIN");
      try {
        // giả lập môi trường mới triển khai: BANK_MAIN trống, không có dòng sao kê
        await db.query("SET LOCAL session_replication_role = replica"); // bỏ qua trigger/FK khi dựng trạng thái giả (giao dịch sẽ ROLLBACK)
        await db.query("UPDATE bank_statement_lines SET fund_id = $1 WHERE fund_id = $2", [cash0.id, bank0.id]);
        await db.query("UPDATE funds SET last_seq = 0 WHERE id = $1", [bank0.id]);
        await db.query(sql);
        const bank = await fundOf("BANK_MAIN");
        const cash = await fundOf("CASH");
        ok(bank.deleted_at, "BANK_MAIN bị ngưng (xóa mềm)");
        eq(bank.is_active, false);
        eq(cash.name, "Quỹ Lưu Xá");
        eq(cash.is_active, true);
        await db.query(sql); // idempotent
        eq((await fundOf("CASH")).name, "Quỹ Lưu Xá");
      } finally {
        await db.query("ROLLBACK");
      }
      eq((await fundOf("BANK_MAIN")).deleted_at, null, "đã ROLLBACK, DB thử còn nguyên");
    });

    await test("Chỉ còn MỘT túi quỹ: tùy chọn quỹ và số dư đầu kỳ chỉ có túi quỹ đó; giao dịch ngân hàng tự động vào đúng túi quỹ duy nhất", async () => {
      await db.query("UPDATE funds SET is_active = false, deleted_at = now() WHERE id = $1", [bank0.id]);
      try {
        const options = (await treasurer.get("/api/v1/finance/options")).json;
        ok(!options.funds.some((f) => f.id === bank0.id), "tùy chọn quỹ không còn túi quỹ ngân hàng");
        const mine = options.funds.filter((f) => f.id === cash0.id);
        eq(mine.length, 1);
        const open = (await head.get("/api/v1/finance/opening-balance")).json;
        ok(!open.funds.some((f) => f.id === bank0.id), "số dư đầu kỳ không liệt kê túi quỹ đã ngưng");

        const ref = `ONEFUND${suffix}`;
        const res = await fetch(BASE + "/api/v1/public/bank-webhook", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Apikey ${SECRET}` },
          body: JSON.stringify({ id: Math.floor(Math.random() * 1e9), gateway: "Techcombank", transactionDate: "2026-10-06 14:30:00", accountNumber: "19036996868", transferType: "in", transferAmount: 55000, accumulated: 5000000, content: `Chuyen khoan ${suffix}`, referenceCode: ref }),
        });
        eq(res.status, 200, await res.text());
        const line = (await db.query("SELECT l.fund_id, f.code FROM bank_statement_lines l JOIN funds f ON f.id = l.fund_id WHERE l.bank_reference = $1", [ref])).rows[0];
        ok(line, "dòng sao kê đã được lưu");
        eq(line.code, "CASH", "vào túi quỹ duy nhất còn dùng");
      } finally {
        await db.query("UPDATE funds SET is_active = true, deleted_at = NULL WHERE id = $1", [bank0.id]);
      }
    });
  } finally {
    // phòng khi một ca lỗi giữa chừng: luôn trả túi quỹ ngân hàng về như cũ
    await db.query("ROLLBACK").catch(() => {});
    await db.query("UPDATE funds SET is_active = $2, deleted_at = $3, last_seq = $4 WHERE id = $1", [bank0.id, bank0.is_active, bank0.deleted_at, bank0.last_seq]).catch(() => {});
    await db.end();
  }
}
