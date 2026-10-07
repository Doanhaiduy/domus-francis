// Kiểm thử SỐ DƯ QUỸ KHỞI ĐẦU (POST/GET /api/v1/finance/opening-balance): chỉ Trưởng nhà / Admin (finance.ledger.adjust) ghi được,
// mỗi túi quỹ MỘT lần và phải là bút toán đầu tiên, bất biến, idempotent theo clientRequestId, ảnh hưởng số dư quỹ.
// DB thử đã có giao dịch ở mọi túi quỹ có sẵn nên bộ này TỰ TẠO hai túi quỹ trống (INSERT trực tiếp) và gỡ đi khi xong (deleted_at).

import { randomUUID } from "node:crypto";
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Số dư quỹ khởi đầu");

  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const URL = "/api/v1/finance/opening-balance";
  const get = async (c) => (await c.get(URL)).json;

  const db = new pg.Client(pgConfig());
  await db.connect();
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const newFund = async (n) =>
    (await db.query("INSERT INTO funds (code, name, fund_type, description) VALUES ($1, $2, 'cash', 'Túi quỹ tạo bởi kiểm thử số dư đầu kỳ') RETURNING id", [`TOPEN${n}_${stamp}`, `Quỹ thử số dư ${n} ${stamp}`])).rows[0].id;
  const fundA = await newFund(1);
  const fundB = await newFund(2);
  try {
  let before;
  await test("Trưởng nhà xem được số dư từng túi quỹ + trạng thái nhập số dư đầu kỳ", async () => {
    const r = await head.get(URL);
    eq(r.status, 200, JSON.stringify(r.json));
    before = r.json;
    eq(before.canAdjust, true);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(before.today), "có ngày hôm nay");
    ok(before.funds.length >= 2, "có ít nhất 2 túi quỹ (tiền mặt + ngân hàng)");
    for (const f of before.funds) {
      eq(f.canOpen, f.entryCount === 0, `canOpen khớp số bút toán (${f.code})`);
      ok(Number.isInteger(f.balanceVnd));
    }
    eq(before.totalVnd, before.funds.reduce((a, f) => a + f.balanceVnd, 0));
  });

  await test("Quyền: Thủ quỹ xem được nhưng không ghi (403); thành viên thường không xem, không ghi (403)", async () => {
    const t = await treasurer.get(URL);
    eq(t.status, 200);
    eq(t.json.canAdjust, false);
    const fund = before.funds[0];
    const body = { fundId: fund.id, amountVnd: 1000, entryDate: before.today };
    eq((await treasurer.post(URL, body)).status, 403, "Thủ quỹ không có finance.ledger.adjust");
    eq((await member.get(URL)).status, 403);
    eq((await member.post(URL, body)).status, 403);
  });

  await test("Kiểm tra dữ liệu: số tiền ≤ 0 hoặc lẻ, ngày sai/tương lai, túi quỹ không tồn tại", async () => {
    const fund = before.funds[0];
    const base = { fundId: fund.id, amountVnd: 1000, entryDate: before.today };
    eq((await head.post(URL, { ...base, amountVnd: 0 })).status, 400, "số tiền 0");
    eq((await head.post(URL, { ...base, amountVnd: -5 })).status, 400, "số tiền âm");
    eq((await head.post(URL, { ...base, amountVnd: 10.5 })).status, 400, "số tiền lẻ");
    eq((await head.post(URL, { ...base, amountVnd: 20_000_000_000 })).status, 400, "vượt trần");
    eq((await head.post(URL, { ...base, entryDate: "30/09/2026" })).status, 400, "ngày sai định dạng");
    eq((await head.post(URL, { ...base, fundId: "không-phải-uuid" })).status, 400, "mã túi quỹ sai");
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const f = await head.post(URL, { ...base, entryDate: future });
    ok(f.status === 422 || f.status === 400, "ngày tương lai bị từ chối: " + f.status);
    const missing = await head.post(URL, { ...base, fundId: randomUUID() });
    ok(missing.status === 404 || missing.status === 422 || missing.status === 400, "túi quỹ không tồn tại: " + missing.status);
  });

  await test("Túi quỹ ĐÃ có giao dịch không nhập số dư đầu kỳ được nữa (422, chỉ một lần & phải là bút toán đầu tiên)", async () => {
    const used = before.funds.find((f) => !f.canOpen && !f.opening);
    if (!used) return; // DB thử chưa có túi quỹ nào có giao dịch sẵn — ca này được kiểm ở bước sau
    const r = await head.post(URL, { fundId: used.id, amountVnd: 5000, entryDate: before.today });
    eq(r.status, 422, JSON.stringify(r.json));
    ok(/một lần|đầu tiên/i.test(JSON.stringify(r.json)), "thông báo nêu rõ lý do: " + JSON.stringify(r.json));
    const after = (await get(head)).funds.find((f) => f.id === used.id);
    eq(after.balanceVnd, used.balanceVnd, "số dư không đổi");
  });

  await test("Trưởng nhà ghi số dư đầu kỳ cho túi quỹ trống ⇒ vào sổ, đổi số dư, hiện người ghi; ghi lại cùng mã yêu cầu không nhân đôi; lần thứ hai bị chặn", async () => {
    const target = before.funds.find((f) => f.id === fundA);
    ok(target && target.canOpen, "túi quỹ thử còn trống");
    const requestId = randomUUID();
    const body = { fundId: target.id, amountVnd: 12_345_000, entryDate: before.today, note: "Số dư theo sổ tay Thủ quỹ cũ (kiểm thử)", clientRequestId: requestId };
    const r = await head.post(URL, body);
    eq(r.status, 201, JSON.stringify(r.json));
    ok(r.json.id, "trả id bút toán");

    const after = await get(head);
    const f = after.funds.find((x) => x.id === target.id);
    eq(f.balanceVnd, target.balanceVnd + 12_345_000);
    eq(f.canOpen, false);
    eq(f.entryCount, 1);
    ok(f.opening, "có bút toán số dư đầu kỳ");
    eq(f.opening.amountVnd, 12_345_000);
    eq(f.opening.entryDate, before.today);
    ok(f.opening.description.includes("Số dư đầu kỳ") && f.opening.description.includes("kiểm thử"), "mô tả ghi rõ: " + f.opening.description);
    ok(f.opening.recordedByName, "có tên người ghi");
    eq(after.totalVnd, before.totalVnd + 12_345_000);

    // gọi lại với cùng clientRequestId (mất mạng, bấm lại) ⇒ trả đúng bút toán cũ, không ghi thêm
    const again = await head.post(URL, body);
    eq(again.status, 201, JSON.stringify(again.json));
    eq(again.json.id, r.json.id);
    eq((await get(head)).totalVnd, before.totalVnd + 12_345_000, "không nhân đôi");

    // ghi thêm lần nữa (mã yêu cầu mới) ⇒ bị chặn
    const dup = await head.post(URL, { ...body, amountVnd: 999_000, clientRequestId: randomUUID() });
    eq(dup.status, 422, JSON.stringify(dup.json));
    eq((await get(head)).totalVnd, before.totalVnd + 12_345_000, "số dư không đổi sau lần ghi bị chặn");

    // tồn quỹ ở Tổng quan phản ánh khoản vừa nhập
    const overview = (await head.get("/api/v1/finance/overview?all=1")).json;
    ok(overview.funds.some((x) => x.id === target.id && x.balanceVnd === f.balanceVnd), "Tổng quan hiện số dư mới của túi quỹ");
  });

  await test("Admin cũng ghi được (có toàn quyền); thành viên không thấy dữ liệu", async () => {
    const view = await get(admin);
    eq(view.canAdjust, true);
    const stillOpen = view.funds.find((f) => f.id === fundB);
    ok(stillOpen && stillOpen.canOpen, "túi quỹ thử thứ hai còn trống");
    {
      const r = await admin.post(URL, { fundId: stillOpen.id, amountVnd: 777_000, entryDate: view.today, note: "Admin nhập (kiểm thử)" });
      eq(r.status, 201, JSON.stringify(r.json));
      eq((await get(admin)).funds.find((f) => f.id === stillOpen.id).balanceVnd, stillOpen.balanceVnd + 777_000);
    }
    eq((await member.get(URL)).status, 403);
  });
  } finally {
    // gỡ túi quỹ thử khỏi danh sách/số dư (sổ cái bất biến nên chỉ đánh dấu đã xóa)
    await db.query("UPDATE funds SET is_active = false, deleted_at = now() WHERE id = ANY($1)", [[fundA, fundB]]).catch(() => {});
    await db.end();
  }
}
