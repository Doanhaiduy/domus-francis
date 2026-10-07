// Kiểm thử ĐIỀU CHỈNH SỔ QUỸ (POST/GET /api/v1/finance/adjustments): chỉ Trưởng nhà / Admin (finance.ledger.adjust) ghi được,
// cộng vào hoặc trừ khỏi quỹ kèm lý do ≥ 10 ký tự, không âm quỹ, idempotent theo clientRequestId, túi quỹ chưa có số dư đầu kỳ thì chặn.

import { randomUUID } from "node:crypto";
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Điều chỉnh sổ quỹ");

  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const ADJ = "/api/v1/finance/adjustments";
  const OPEN = "/api/v1/finance/opening-balance";
  const stamp = Date.now().toString(36);

  const funds = async (c = head) => (await c.get(OPEN)).json;
  const base = await funds();
  const cash = base.funds.find((f) => f.entryCount > 0 && f.type === "cash") ?? base.funds.find((f) => f.entryCount > 0);
  ok(cash, "DB thử cần có túi quỹ đã có bút toán");
  const balance = async (id = cash.id) => (await funds()).funds.find((f) => f.id === id).balanceVnd;
  const today = base.today;

  await test("Quyền: Trưởng nhà và Admin ghi được; Thủ quỹ xem được nhưng không ghi (403); thành viên không xem, không ghi (403)", async () => {
    const h = await head.get(ADJ);
    eq(h.status, 200, JSON.stringify(h.json));
    eq(h.json.canAdjust, true);
    ok(Array.isArray(h.json.entries));
    eq((await admin.get(ADJ)).json.canAdjust, true);
    const t = await treasurer.get(ADJ);
    eq(t.status, 200);
    eq(t.json.canAdjust, false);
    const body = { fundId: cash.id, direction: "in", amountVnd: 1000, entryDate: today, reason: "Thử quyền điều chỉnh sổ quỹ" };
    eq((await treasurer.post(ADJ, body)).status, 403);
    eq((await member.get(ADJ)).status, 403);
    eq((await member.post(ADJ, body)).status, 403);
  });

  await test("Kiểm tra dữ liệu: lý do < 10 ký tự, số tiền sai, chiều lạ, ngày sai/tương lai, túi quỹ không tồn tại", async () => {
    const ok0 = { fundId: cash.id, direction: "in", amountVnd: 1000, entryDate: today, reason: "Lý do đủ dài để hợp lệ" };
    eq((await head.post(ADJ, { ...ok0, reason: "ngắn" })).status, 400, "lý do ngắn");
    eq((await head.post(ADJ, { ...ok0, reason: undefined })).status, 400, "thiếu lý do");
    eq((await head.post(ADJ, { ...ok0, amountVnd: 0 })).status, 400, "số tiền 0");
    eq((await head.post(ADJ, { ...ok0, amountVnd: -1 })).status, 400, "số tiền âm");
    eq((await head.post(ADJ, { ...ok0, amountVnd: 1.5 })).status, 400, "số tiền lẻ");
    eq((await head.post(ADJ, { ...ok0, direction: "sideways" })).status, 400, "chiều lạ");
    eq((await head.post(ADJ, { ...ok0, entryDate: "05/10/2026" })).status, 400, "ngày sai định dạng");
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const f = await head.post(ADJ, { ...ok0, entryDate: future });
    ok(f.status === 422 || f.status === 400, "ngày tương lai bị từ chối: " + f.status);
    const missing = await head.post(ADJ, { ...ok0, fundId: randomUUID() });
    ok([400, 404, 422].includes(missing.status), "túi quỹ không tồn tại: " + missing.status);
  });

  let inId;
  await test("Cộng vào quỹ: số dư tăng đúng, bút toán hiện ở lịch sử kèm lý do + người ghi; gọi lại cùng clientRequestId không nhân đôi", async () => {
    const before = await balance();
    const requestId = randomUUID();
    const body = { fundId: cash.id, direction: "in", amountVnd: 345_000, entryDate: today, reason: `Sửa số dư đầu kỳ nhập thiếu (kiểm thử ${stamp})`, clientRequestId: requestId };
    const r = await head.post(ADJ, body);
    eq(r.status, 201, JSON.stringify(r.json));
    inId = r.json.id;
    eq(await balance(), before + 345_000);
    const e = (await head.get(ADJ)).json.entries.find((x) => x.id === inId);
    ok(e, "có trong lịch sử");
    eq(e.kind, "adjustment");
    eq(e.direction, "in");
    eq(e.amountVnd, 345_000);
    eq(e.entryDate, today);
    eq(e.fundId, cash.id);
    ok(e.description.includes(stamp) && e.description.startsWith("Điều chỉnh sổ quỹ"), "mô tả: " + e.description);
    ok(e.recordedByName, "có tên người ghi");
    const again = await head.post(ADJ, body);
    eq(again.status, 201);
    eq(again.json.id, inId);
    eq(await balance(), before + 345_000, "không nhân đôi");
  });

  await test("Trừ khỏi quỹ: số dư giảm đúng; trừ quá số dư hiện có bị chặn (422) và số dư không đổi", async () => {
    const before = await balance();
    const out = await head.post(ADJ, { fundId: cash.id, direction: "out", amountVnd: 345_000, entryDate: today, reason: `Hoàn lại khoản cộng thử (kiểm thử ${stamp})` });
    eq(out.status, 201, JSON.stringify(out.json));
    eq(await balance(), before - 345_000);
    const entry = (await head.get(ADJ)).json.entries.find((x) => x.id === out.json.id);
    eq(entry.direction, "out");
    const over = await head.post(ADJ, { fundId: cash.id, direction: "out", amountVnd: (await balance()) + 1, entryDate: today, reason: `Trừ quá số dư hiện có (kiểm thử ${stamp})` });
    eq(over.status, 422, JSON.stringify(over.json));
    eq(await balance(), before - 345_000, "số dư không đổi sau lần bị chặn");
  });

  await test("Admin cũng điều chỉnh được; túi quỹ CHƯA có số dư đầu kỳ thì bị chặn (422) — phải nhập số dư đầu kỳ trước", async () => {
    const before = await balance();
    const a1 = await admin.post(ADJ, { fundId: cash.id, direction: "in", amountVnd: 1_000, entryDate: today, reason: `Admin điều chỉnh thử (${stamp})` });
    eq(a1.status, 201, JSON.stringify(a1.json));
    const a2 = await admin.post(ADJ, { fundId: cash.id, direction: "out", amountVnd: 1_000, entryDate: today, reason: `Admin hoàn lại điều chỉnh thử (${stamp})` });
    eq(a2.status, 201);
    eq(await balance(), before);

    const db = new pg.Client(pgConfig());
    await db.connect();
    let emptyId;
    try {
      emptyId = (await db.query("INSERT INTO funds (code, name, fund_type, description) VALUES ($1, $2, 'cash', 'Túi quỹ tạo bởi kiểm thử điều chỉnh') RETURNING id", [`TADJ_${stamp.toUpperCase()}`, `Quỹ trống ${stamp}`])).rows[0].id;
      const r = await head.post(ADJ, { fundId: emptyId, direction: "in", amountVnd: 5_000, entryDate: today, reason: "Điều chỉnh vào túi quỹ trống (phải bị chặn)" });
      eq(r.status, 422, JSON.stringify(r.json));
      ok(/số dư đầu kỳ/i.test(JSON.stringify(r.json)), "thông báo nêu rõ phải nhập số dư đầu kỳ: " + JSON.stringify(r.json));
      eq((await funds()).funds.find((f) => f.id === emptyId).entryCount, 0, "túi quỹ vẫn trống, còn nhập được số dư đầu kỳ");
    } finally {
      if (emptyId) await db.query("UPDATE funds SET is_active = false, deleted_at = now() WHERE id = $1", [emptyId]).catch(() => {});
      await db.end();
    }
  });
}
