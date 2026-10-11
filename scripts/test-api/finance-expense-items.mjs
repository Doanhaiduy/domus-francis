// Kiểm thử PHIẾU CHI CHI TIẾT TỪNG MÓN (db/app/1040): đi chợ nhiều món — tên · số lượng · đơn vị · đơn giá · thành tiền.
//   • Số tiền phiếu = tổng các món (máy chủ/CSDL tự tính, không tin số tiền gửi lên); làm tròn thành tiền từng món.
//   • Kiểm tra dữ liệu (số lượng ≤ 3 chữ số thập phân, đơn giá > 0, tối đa 100 món, phải có số tiền hoặc món).
//   • Sửa món chỉ khi phiếu nháp (luồng "rút về nháp"); phiếu đã chi bất biến — kể cả khi ghi thẳng vào CSDL (trigger).
//   • Tổng món lệch số tiền phiếu bị chặn ở COMMIT (constraint trigger hoãn).
//   • Món theo quyền xem phiếu; xóa vĩnh viễn phiếu đã hủy xóa món theo.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Phiếu chi chi tiết từng món");

  const admin = await as("viet.vu@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const suffix = Date.now().toString(36);
  const detail = (r) => JSON.stringify(r.json);

  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const cat = options.categories[0];
  const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];

  const base = (title, extra = {}) => ({
    title: `${title} ${suffix}`,
    categoryId: cat.id,
    expenseDate: options.today,
    fundId: cash.id,
    noReceiptReason: "Mua ở chợ, người bán không xuất hóa đơn (kiểm thử)",
    ...extra,
  });
  const MARKET = [
    { name: "Thịt heo", quantity: 2, unit: "kg", unitPriceVnd: 120000 }, // 240.000
    { name: "Rau muống", quantity: 1.5, unit: "kg", unitPriceVnd: 15000 }, // 22.500
    { name: "Hành lá", quantity: 3, unit: "bó", unitPriceVnd: 5000 }, // 15.000
  ];
  const MARKET_TOTAL = 277500;

  const withDb = async (fn) => {
    const c = new pg.Client(pgConfig());
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end();
    }
  };
  const itemCount = (id) => withDb(async (c) => Number((await c.query("SELECT count(*) AS n FROM expense_voucher_items WHERE voucher_id = $1", [id])).rows[0].n));

  let marketId;
  await test("Lập phiếu có món: số tiền = tổng các món, thành tiền từng món đúng, thứ tự giữ nguyên; số tiền gửi lên bị bỏ qua", async () => {
    const r = await treasurer.post("/api/v1/finance/expenses", base("Đi chợ sáng", { items: MARKET, amountVnd: 1 }));
    eq(r.status, 201, detail(r));
    marketId = r.json.id;
    eq(r.json.amountVnd, MARKET_TOTAL, "tổng = 240.000 + 22.500 + 15.000");
    eq(r.json.items.length, 3);
    eq(r.json.items.map((i) => i.name).join("|"), "Thịt heo|Rau muống|Hành lá", "đúng thứ tự");
    eq(r.json.items.map((i) => i.amountVnd).join(","), "240000,22500,15000");
    eq(r.json.items[1].quantity, 1.5);
    eq(r.json.items[1].unit, "kg");
    eq(r.json.items.map((i) => i.position).join(","), "1,2,3");
    eq(r.json.status, "draft");
  });

  await test("Phiếu không có món (chi một khoản) vẫn hoạt động như cũ; items rỗng", async () => {
    const r = await treasurer.post("/api/v1/finance/expenses", base("Mua bóng đèn", { amountVnd: 45000 }));
    eq(r.status, 201, detail(r));
    eq(r.json.amountVnd, 45000);
    eq(r.json.items.length, 0);
  });

  await test("Làm tròn thành tiền: 2,675 × 100đ = 268đ (nửa lên), 0,333 × 10.000đ = 3.330đ; số lượng lẻ giữ 3 chữ số", async () => {
    const r = await treasurer.post(
      "/api/v1/finance/expenses",
      base("Thử làm tròn", {
        items: [
          { name: "Gia vị", quantity: 2.675, unit: "g", unitPriceVnd: 100 },
          { name: "Dầu ăn", quantity: 0.333, unit: "lít", unitPriceVnd: 10000 },
        ],
      })
    );
    eq(r.status, 201, detail(r));
    eq(r.json.items[0].amountVnd, 268);
    eq(r.json.items[1].amountVnd, 3330);
    eq(r.json.amountVnd, 268 + 3330);
    eq(r.json.items[0].quantity, 2.675);
  });

  await test("Kiểm tra dữ liệu: thiếu cả số tiền lẫn món, số lượng 0 / âm / quá 3 chữ số thập phân, đơn giá 0, tên rỗng, quá 100 món → 400", async () => {
    const bad = async (items, extra = {}) => eq((await treasurer.post("/api/v1/finance/expenses", base("Sai dữ liệu", { items, ...extra }))).status, 400, JSON.stringify(items).slice(0, 80));
    eq((await treasurer.post("/api/v1/finance/expenses", base("Thiếu tiền"))).status, 400, "không số tiền, không món");
    eq((await treasurer.post("/api/v1/finance/expenses", base("Món rỗng", { items: [] }))).status, 400, "items rỗng mà không có số tiền");
    await bad([{ name: "A", quantity: 0, unit: "kg", unitPriceVnd: 1000 }]);
    await bad([{ name: "A", quantity: -1, unit: "kg", unitPriceVnd: 1000 }]);
    await bad([{ name: "A", quantity: 1.2345, unit: "kg", unitPriceVnd: 1000 }]);
    await bad([{ name: "A", quantity: 1, unit: "kg", unitPriceVnd: 0 }]);
    await bad([{ name: "A", quantity: 1, unit: "kg", unitPriceVnd: 1000.5 }]);
    await bad([{ name: "  ", quantity: 1, unit: "kg", unitPriceVnd: 1000 }]);
    await bad(Array.from({ length: 101 }, (_, i) => ({ name: `M${i}`, quantity: 1, unitPriceVnd: 1000 })));
    const ok100 = await treasurer.post("/api/v1/finance/expenses", base("Đúng 100 món", { items: Array.from({ length: 100 }, (_, i) => ({ name: `Món ${i + 1}`, quantity: 1, unitPriceVnd: 1000 })) }));
    eq(ok100.status, 201, detail(ok100));
    eq(ok100.json.amountVnd, 100000);
    eq(ok100.json.items.length, 100);
  });

  await test("Danh sách + chi tiết đều trả món; người không xem được phiếu không thấy (404)", async () => {
    const list = (await treasurer.get(`/api/v1/finance/expenses?from=${options.today}&to=${options.today}`)).json;
    const row = (list.items ?? list).find((e) => e.id === marketId);
    ok(row, "phiếu có trong danh sách");
    eq(row.items.length, 3, "danh sách có món");
    eq((await treasurer.get(`/api/v1/finance/expenses/${marketId}`)).json.items.length, 3);
    eq((await other.get(`/api/v1/finance/expenses/${marketId}`)).status, 404, "thành viên khác không xem được phiếu ⇒ không thấy món");
  });

  await test("Sửa phiếu nháp: thay món ⇒ tổng tính lại; items [] + số tiền ⇒ bỏ chi tiết, về một khoản", async () => {
    const r = await treasurer.patch(`/api/v1/finance/expenses/${marketId}`, { items: [{ name: "Cá lóc", quantity: 1.2, unit: "kg", unitPriceVnd: 95000 }] });
    eq(r.status, 200, detail(r));
    eq(r.json.items.length, 1);
    eq(r.json.amountVnd, 114000, "1,2 × 95.000");
    eq(await itemCount(marketId), 1, "món cũ đã bị thay hẳn");
    const back = await treasurer.patch(`/api/v1/finance/expenses/${marketId}`, { items: [], amountVnd: 50000 });
    eq(back.status, 200, detail(back));
    eq(back.json.items.length, 0);
    eq(back.json.amountVnd, 50000);
    eq(await itemCount(marketId), 0);
    const again = await treasurer.patch(`/api/v1/finance/expenses/${marketId}`, { items: MARKET });
    eq(again.status, 200, detail(again));
    eq(again.json.amountVnd, MARKET_TOTAL);
  });

  await test("Phiếu có món mà chỉ đổi số tiền (không gửi món) ⇒ bị chặn vì tổng không khớp; phiếu nguyên vẹn", async () => {
    const r = await treasurer.patch(`/api/v1/finance/expenses/${marketId}`, { amountVnd: 999999 });
    ok(r.status >= 400 && r.status < 500, `phải từ chối: ${r.status} ${detail(r)}`);
    ok(/không khớp/.test(detail(r)), `thông báo phải nói tổng không khớp: ${detail(r)}`);
    const cur = (await treasurer.get(`/api/v1/finance/expenses/${marketId}`)).json;
    eq(cur.amountVnd, MARKET_TOTAL);
    eq(cur.items.length, 3);
  });

  await test("CSDL chặn lệch tổng ở COMMIT (ghi thẳng) và chặn sửa/xóa/thêm món khi phiếu không còn nháp", async () => {
    // lệch tổng
    await withDb(async (c) => {
      await c.query("BEGIN");
      await c.query("UPDATE expense_vouchers SET amount_vnd = amount_vnd + 1 WHERE id = $1", [marketId]);
      let msg = "";
      try {
        await c.query("COMMIT");
      } catch (e) {
        msg = e.message;
      }
      ok(/không khớp/.test(msg), `COMMIT phải bị chặn: ${msg}`);
      await c.query("ROLLBACK").catch(() => {});
    });
    // gửi duyệt ⇒ không còn nháp
    eq((await treasurer.post(`/api/v1/finance/expenses/${marketId}/submit`)).status, 200);
    await withDb(async (c) => {
      for (const sql of [
        "UPDATE expense_voucher_items SET name = 'Sửa lén' WHERE voucher_id = $1",
        "DELETE FROM expense_voucher_items WHERE voucher_id = $1",
        "INSERT INTO expense_voucher_items (voucher_id, position, name, quantity, unit_price_vnd) VALUES ($1, 9, 'Thêm lén', 1, 1000)",
      ]) {
        let msg = "";
        try {
          await c.query(sql, [marketId]);
        } catch (e) {
          msg = e.message;
        }
        ok(/nháp/.test(msg), `phải bị chặn vì phiếu không còn nháp: ${sql.slice(0, 30)} → ${msg}`);
      }
    });
  });

  await test("Sửa phiếu đang chờ duyệt: rút về nháp, thay món, gửi lại; duyệt + chi ⇒ bút toán sổ quỹ bằng tổng các món; sau đó bất biến", async () => {
    const r = await treasurer.patch(`/api/v1/finance/expenses/${marketId}`, {
      items: [
        { name: "Thịt heo", quantity: 2.5, unit: "kg", unitPriceVnd: 120000 }, // 300.000
        { name: "Rau muống", quantity: 1.5, unit: "kg", unitPriceVnd: 15000 }, // 22.500
      ],
      submit: true,
    });
    eq(r.status, 200, detail(r));
    eq(r.json.status, "pending_approval");
    eq(r.json.amountVnd, 322500);
    eq(r.json.items.length, 2);
    const ap = await admin.post(`/api/v1/finance/expenses/${marketId}/decision`, { decision: "approved", comment: "Duyệt thử món" });
    eq(ap.status, 200, detail(ap));
    const pay = await treasurer.post(`/api/v1/finance/expenses/${marketId}/pay`, { method: "cash", paidOn: options.today });
    eq(pay.status, 200, detail(pay));
    eq(pay.json.status, "paid");
    eq(pay.json.items.length, 2, "đã chi vẫn giữ món");
    const ledger = await withDb(async (c) => (await c.query("SELECT amount_vnd FROM ledger_entries WHERE id = (SELECT ledger_entry_id FROM expense_vouchers WHERE id = $1)", [marketId])).rows[0]);
    eq(Number(ledger.amount_vnd), 322500, "bút toán = tổng các món");
    const edit = await treasurer.patch(`/api/v1/finance/expenses/${marketId}`, { items: MARKET });
    ok(edit.status === 403 || edit.status === 422, `phiếu đã chi không sửa món được: ${edit.status} ${detail(edit)}`);
    eq(await itemCount(marketId), 2);
  });

  await test("Hủy phiếu có món rồi Admin xóa vĩnh viễn ⇒ món xóa theo", async () => {
    const e = await treasurer.post("/api/v1/finance/expenses", base("Phiếu thử xóa", { items: MARKET }));
    eq(e.status, 201, detail(e));
    eq(await itemCount(e.json.id), 3);
    eq((await treasurer.post(`/api/v1/finance/expenses/${e.json.id}/cancel`, { reason: "Lập nhầm, hủy thử" })).status, 200);
    eq((await admin.del(`/api/v1/finance/expenses/${e.json.id}`)).status, 200);
    eq(await itemCount(e.json.id), 0, "món đã xóa theo phiếu");
    eq((await admin.get(`/api/v1/finance/expenses/${e.json.id}`)).status, 404);
  });
}
