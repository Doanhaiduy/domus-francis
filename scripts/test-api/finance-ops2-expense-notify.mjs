// Kiểm thử THÔNG BÁO PHIẾU CHI (gói F — src/server/modules/finance-notify.ts, db/app/1045 app.fn_expense_signers):
//   • gửi duyệt ⇒ những người còn ký được vòng hiện tại (không gồm người lập / người ứng tiền; ưu tiên Trưởng nhà/Thủ quỹ, không làm ngập Admin)
//   • đủ chữ ký ⇒ người lập + người ứng tiền ("đã được duyệt") + người ghi chi ("chờ chi") — trừ người vừa duyệt
//   • phiếu 2 chữ ký: ký 1/2 ⇒ người còn ký được ("cần chữ ký thứ hai"); từ chối ⇒ người lập
//   • đã chi ⇒ người ứng tiền ("đã hoàn ứng") + người lập ("đã chi"); đảo ⇒ người lập + người ứng tiền
//   • rút về nháp ⇒ người ứng tiền; hủy ⇒ người lập/người ứng (trừ người hủy)
//   • payload.link = /thu-chi?tab=chi&expense=<id>; không ai nhận thông báo do chính mình thao tác
// Số tiền nhỏ (BR-FIN-07); phiếu đã chi được đảo lại để quỹ thử không đổi.
import { randomUUID } from "node:crypto";
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Thông báo phiếu chi tới đúng người (gói F)");
  const db = new pg.Client(pgConfig());
  await db.connect();
  try {
    const member = await as("tuan.nguyen@luuxa.local"); // người lập
    const treasurer = await as("bao.pham@luuxa.local");
    const head = await as("duc.tran@luuxa.local");
    const detail = (r) => JSON.stringify(r.json);
    const options = (await member.get("/api/v1/finance/options")).json;
    const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
    const category = options.categories.find((c) => c.code === "OTHER") ?? options.categories[0];
    ok(cash && category, "có túi quỹ + hạng mục chi");

    const mid = async (email) => (await db.query("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1", [email])).rows[0].id;
    const M = {
      tuan: await mid("tuan.nguyen@luuxa.local"),
      hieu: await mid("hieu.bui@luuxa.local"),
      bao: await mid("bao.pham@luuxa.local"),
      duc: await mid("duc.tran@luuxa.local"),
      viet: await mid("viet.vu@luuxa.local"),
    };
    /** Thông báo của phiếu theo loại: { memberId: [title…] } */
    const notes = async (voucherId, type) => {
      const rows = (
        await db.query(
          "SELECT member_id, title, payload ->> 'link' AS link FROM notifications WHERE entity_table = 'expense_vouchers' AND entity_id = $1 AND type_code = $2 ORDER BY created_at",
          [voucherId, type]
        )
      ).rows;
      return rows;
    };
    const who = (rows) => [...new Set(rows.map((r) => r.member_id))].sort();
    const expect = (...ids) => [...new Set(ids)].sort();
    const stamp = Date.now().toString(36).slice(-5);
    const created = [];

    const create = (body) =>
      member.post("/api/v1/finance/expenses", {
        categoryId: category.id,
        expenseDate: options.today,
        fundId: cash.id,
        clientRequestId: randomUUID(),
        ...body,
      });

    let v1;
    await test("Gửi duyệt phiếu 1 chữ ký (50.000đ, người ứng: Hiếu) ⇒ báo Trưởng nhà + Thủ quỹ; KHÔNG báo người lập, người ứng tiền, Admin", async () => {
      const r = await create({ title: `Mua đồ thử thông báo ${stamp}`, amountVnd: 50_000, paidByMemberId: M.hieu, submit: true });
      eq(r.status, 201, detail(r));
      v1 = r.json;
      created.push(v1.id);
      eq(v1.status, "pending_approval");
      eq(v1.requiredApprovals, 1);
      const rows = await notes(v1.id, "finance.expense_pending");
      eq(JSON.stringify(who(rows)), JSON.stringify(expect(M.duc, M.bao)), "người nhận: " + JSON.stringify(rows));
      ok(rows.every((x) => x.link === `/thu-chi?tab=chi&expense=${v1.id}`), "link: " + rows[0]?.link);
      ok(rows[0].title.includes(v1.voucherNo), "tiêu đề nêu số phiếu: " + rows[0].title);
    });

    await test("Thủ quỹ duyệt (1 chữ ký) ⇒ người lập + người ứng tiền nhận 'đã được duyệt'; người duyệt KHÔNG tự nhận; Admin không bị báo 'chờ chi'", async () => {
      const r = await treasurer.post(`/api/v1/finance/expenses/${v1.id}/decision`, { decision: "approved" });
      eq(r.status, 200, detail(r));
      eq(r.json.status, "approved");
      const rows = await notes(v1.id, "finance.expense_decided");
      eq(JSON.stringify(who(rows)), JSON.stringify(expect(M.tuan, M.hieu)), "người nhận: " + JSON.stringify(rows));
      ok(rows.some((x) => /được duyệt/.test(x.title)), "tiêu đề 'đã được duyệt'");
      ok(!rows.some((x) => x.member_id === M.bao), "người vừa duyệt không tự nhận");
    });

    await test("Thủ quỹ ghi chi ⇒ người ứng tiền nhận 'Đã hoàn ứng …', người lập nhận 'đã chi' (loại finance.expense_paid); rồi đảo ⇒ cả hai được báo", async () => {
      const r = await treasurer.post(`/api/v1/finance/expenses/${v1.id}/pay`, { method: "cash", paidOn: options.today });
      eq(r.status, 200, detail(r));
      eq(r.json.status, "paid");
      const rows = await notes(v1.id, "finance.expense_paid");
      eq(JSON.stringify(who(rows)), JSON.stringify(expect(M.tuan, M.hieu)), JSON.stringify(rows));
      ok(rows.find((x) => x.member_id === M.hieu).title.startsWith("Đã hoàn ứng"), "người ứng: " + JSON.stringify(rows));
      ok(/đã chi/.test(rows.find((x) => x.member_id === M.tuan).title), "người lập: " + JSON.stringify(rows));
      // Đảo để quỹ thử trở lại như cũ
      const rev = await treasurer.post(`/api/v1/finance/expenses/${v1.id}/reverse`, { reason: "Hoàn tác phiếu thử thông báo" });
      eq(rev.status, 200, detail(rev));
      const rv = (await notes(v1.id, "finance.expense_decided")).filter((x) => /đảo/.test(x.title));
      eq(JSON.stringify(who(rv)), JSON.stringify(expect(M.tuan, M.hieu)), JSON.stringify(rv));
    });

    let v2;
    await test("Phiếu 2 chữ ký (1.200.000đ): gửi ⇒ Trưởng nhà + Thủ quỹ; Trưởng nhà ký 1/2 ⇒ CHỈ Thủ quỹ nhận 'cần chữ ký thứ hai'", async () => {
      const r = await create({ title: `Sửa máy bơm thử ${stamp}`, amountVnd: 1_200_000, noReceiptReason: "Hóa đơn thử nghiệm", submit: true });
      eq(r.status, 201, detail(r));
      v2 = r.json;
      created.push(v2.id);
      eq(v2.requiredApprovals, 2);
      eq(JSON.stringify(who(await notes(v2.id, "finance.expense_pending"))), JSON.stringify(expect(M.duc, M.bao)));
      const d = await head.post(`/api/v1/finance/expenses/${v2.id}/decision`, { decision: "approved" });
      eq(d.status, 200, detail(d));
      eq(d.json.status, "pending_approval");
      const second = (await notes(v2.id, "finance.expense_pending")).filter((x) => /chữ ký thứ hai/.test(x.title));
      eq(JSON.stringify(who(second)), JSON.stringify(expect(M.bao)), JSON.stringify(second));
    });

    await test("Thủ quỹ từ chối (kèm lý do) ⇒ người lập nhận 'bị từ chối' có lý do; người từ chối không tự nhận", async () => {
      const r = await treasurer.post(`/api/v1/finance/expenses/${v2.id}/decision`, { decision: "rejected", comment: "Thiếu báo giá so sánh" });
      eq(r.status, 200, detail(r));
      eq(r.json.status, "rejected");
      const rows = (await db.query(
        "SELECT member_id, body FROM notifications WHERE entity_table = 'expense_vouchers' AND entity_id = $1 AND type_code = 'finance.expense_decided' AND title LIKE '%bị từ chối%'",
        [v2.id]
      )).rows;
      eq(JSON.stringify(who(rows)), JSON.stringify(expect(M.tuan)), JSON.stringify(rows));
      ok(rows[0].body.includes("Thiếu báo giá so sánh"), "nêu lý do: " + rows[0].body);
    });

    let v3;
    await test("Người lập rút phiếu đang chờ duyệt về nháp ⇒ người ứng tiền được báo; hủy phiếu ⇒ người ứng tiền được báo (người hủy không tự nhận)", async () => {
      const r = await create({ title: `Mua dụng cụ thử ${stamp}`, amountVnd: 30_000, paidByMemberId: M.hieu, submit: true });
      eq(r.status, 201, detail(r));
      v3 = r.json;
      created.push(v3.id);
      const w = await member.post(`/api/v1/finance/expenses/${v3.id}/withdraw`, {});
      eq(w.status, 200, detail(w));
      eq(w.json.status, "draft");
      const wd = (await notes(v3.id, "finance.expense_decided")).filter((x) => /rút về nháp/.test(x.title));
      eq(JSON.stringify(who(wd)), JSON.stringify(expect(M.hieu)), JSON.stringify(wd));
      // Sửa + gửi lại ⇒ người duyệt được báo lần nữa (vòng mới)
      const before = (await notes(v3.id, "finance.expense_pending")).length;
      const u = await member.patch(`/api/v1/finance/expenses/${v3.id}`, { title: `Mua dụng cụ thử (sửa) ${stamp}`, submit: true });
      eq(u.status, 200, detail(u));
      eq(u.json.status, "pending_approval");
      ok((await notes(v3.id, "finance.expense_pending")).length > before, "gửi lại ⇒ báo người duyệt lần nữa");
      const c = await member.post(`/api/v1/finance/expenses/${v3.id}/cancel`, { reason: "Không mua nữa (thử)" });
      eq(c.status, 200, detail(c));
      const cd = (await notes(v3.id, "finance.expense_decided")).filter((x) => /bị hủy/.test(x.title));
      eq(JSON.stringify(who(cd)), JSON.stringify(expect(M.hieu)), JSON.stringify(cd));
    });

    await test("Không ai nhận thông báo do chính mình thao tác; mọi thông báo phiếu chi đều có link tới đúng phiếu", async () => {
      const rows = (
        await db.query(
          `SELECT n.member_id, n.entity_id, n.payload ->> 'link' AS link FROM notifications n
            WHERE n.entity_table = 'expense_vouchers' AND n.entity_id = ANY ($1::uuid[])`,
          [created]
        )
      ).rows;
      ok(rows.length >= 10, "đã có thông báo: " + rows.length);
      for (const r of rows) eq(r.link, `/thu-chi?tab=chi&expense=${r.entity_id}`, "link");
      ok(!rows.some((r) => r.member_id === M.viet), "Admin (chỉ có quyền nhờ vai trò Admin) không bị báo khi đã có Trưởng nhà / Thủ quỹ");
    });

    await test("app.fn_expense_can_sign: Thủ quỹ còn ký được phiếu chờ duyệt; người lập thì không; thành viên khác không hỏi được phiếu của người khác", async () => {
      const r = await create({ title: `Phiếu thử quyền ký ${stamp}`, amountVnd: 20_000, submit: true });
      eq(r.status, 201, detail(r));
      created.push(r.json.id);
      const q = async (email) => {
        const c = new pg.Client(pgConfig());
        await c.connect();
        try {
          const uid = (await c.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;
          await c.query("BEGIN");
          await c.query("SET LOCAL ROLE luuxa_app");
          await c.query("SELECT set_config('app.current_user_id', $1, true)", [uid]);
          const out = (await c.query("SELECT app.fn_expense_can_sign($1) AS ok, (SELECT count(*)::int FROM app.fn_expense_signers($1)) AS n", [r.json.id])).rows[0];
          await c.query("ROLLBACK");
          return out;
        } finally {
          await c.end();
        }
      };
      eq((await q("bao.pham@luuxa.local")).ok, true, "Thủ quỹ ký được");
      eq((await q("tuan.nguyen@luuxa.local")).ok, false, "người lập không tự ký");
      const other = await q("kiet.do@luuxa.local");
      eq(other.ok, false);
      eq(other.n, 0, "thành viên khác không xem được danh sách người ký của phiếu không phải của mình");
      eq((await member.post(`/api/v1/finance/expenses/${r.json.id}/cancel`, { reason: "Dọn phiếu thử quyền ký" })).status, 200);
    });

    await test("Chế độ KÝ CHÉO: phiếu 300.000đ do Trưởng nhà lập ⇒ Thủ quỹ thấy nút Duyệt (can.approve) + được báo, duyệt được; phiếu cùng số tiền của thành viên thường ⇒ chỉ Trưởng nhà duyệt", async () => {
      const prev = (await db.query("SELECT value FROM settings WHERE key = 'finance.expense.cross_signer_mode'")).rows[0]?.value;
      if (prev !== true) await db.query("UPDATE settings SET value = 'true'::jsonb WHERE key = 'finance.expense.cross_signer_mode'");
      try {
        const base = { categoryId: category.id, expenseDate: options.today, fundId: cash.id, amountVnd: 300_000, noReceiptReason: "Phiếu thử ký chéo", submit: true };
        const hv = await head.post("/api/v1/finance/expenses", { ...base, title: `Trưởng nhà mua đồ thử ${stamp}`, clientRequestId: randomUUID() });
        eq(hv.status, 201, detail(hv));
        created.push(hv.json.id);
        eq(hv.json.requiredApprovals, 1);
        const asTreasurer = (await treasurer.get(`/api/v1/finance/expenses/${hv.json.id}`)).json;
        eq(asTreasurer.can.approve, true, "Thủ quỹ ký chéo phiếu của Trưởng nhà (trên hạn mức tự duyệt)");
        const listed = (await treasurer.get(`/api/v1/finance/expenses?from=${options.today}&to=${options.today}`)).json.find((x) => x.id === hv.json.id);
        eq(listed?.can.approve, true, "danh sách cũng hiện nút Duyệt");
        eq(JSON.stringify(who(await notes(hv.json.id, "finance.expense_pending"))), JSON.stringify(expect(M.bao)), "chỉ Thủ quỹ được báo chờ duyệt");
        const ok1 = await treasurer.post(`/api/v1/finance/expenses/${hv.json.id}/decision`, { decision: "approved" });
        eq(ok1.status, 200, detail(ok1));
        eq(ok1.json.status, "approved", "trigger CSDL đồng ý chữ ký chéo");
        // Cùng số tiền nhưng người lập là thành viên thường ⇒ Thủ quỹ KHÔNG tự duyệt được (BR-FIN-17), chỉ từ chối; Trưởng nhà duyệt được
        const mv = await create({ title: `Thành viên mua đồ thử ${stamp}`, amountVnd: 300_000, noReceiptReason: "Phiếu thử ký chéo", submit: true });
        eq(mv.status, 201, detail(mv));
        created.push(mv.json.id);
        const t = (await treasurer.get(`/api/v1/finance/expenses/${mv.json.id}`)).json;
        eq(t.can.approve, false, "Thủ quỹ không tự duyệt khoản > hạn mức khi Trưởng nhà không liên quan");
        eq(t.can.reject, true);
        eq((await head.get(`/api/v1/finance/expenses/${mv.json.id}`)).json.can.approve, true, "Trưởng nhà duyệt được");
        const bad = await treasurer.post(`/api/v1/finance/expenses/${mv.json.id}/decision`, { decision: "approved" });
        eq(bad.status, 422, "CSDL cũng chặn: " + detail(bad));
      } finally {
        if (prev !== true) await db.query("UPDATE settings SET value = $1::jsonb WHERE key = 'finance.expense.cross_signer_mode'", [JSON.stringify(prev ?? false)]);
      }
    });

    // Dọn: hủy phiếu thử còn treo (phiếu đã đảo / đã hủy giữ nguyên làm lịch sử)
    for (const id of created) {
      const s = (await db.query("SELECT status::text AS s FROM expense_vouchers WHERE id = $1", [id])).rows[0]?.s;
      if (s === "pending_approval" || s === "rejected" || s === "draft") await member.post(`/api/v1/finance/expenses/${id}/cancel`, { reason: "Dọn phiếu thử thông báo" });
      else if (s === "approved") await head.post(`/api/v1/finance/expenses/${id}/cancel`, { reason: "Dọn phiếu thử thông báo" });
    }
  } finally {
    await db.end();
  }
}
