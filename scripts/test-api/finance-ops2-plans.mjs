// Kiểm thử KHOẢN THU MỘT LẦN + CẬP NHẬT NGƯỜI PHẢI ĐÓNG + LIÊN KẾT THẲNG trong thông báo quỹ (gói F — db/app/1045):
//   • khoản thu một lần chỉ tạo cho NGƯỜI ĐƯỢC CHỌN (mức chung + mức riêng), kiểm dữ liệu, quyền
//   • "Tôi đã đóng" / xác nhận / nhắc quỹ chạy như khoản thường; link thông báo: /thu-chi?tab=tong-quan&plan=<id>[&pay=<khoản>]
//   • thêm người vào khoản thu một lần — bấm lại không sinh trùng
//   • "Cập nhật người phải đóng" kỳ quỹ định kỳ: thêm đúng người mới (vào sau hạn nộp vẫn được thêm, hạn riêng), idempotent; điện nước bị chặn
//   • duyệt đơn vào nhà ⇒ tự thêm khoản quỹ định kỳ đang mở cho người mới
// Tự dọn: hủy phiếu thu + hủy kế hoạch thử; xóa khoản/hồ sơ thử bằng quyền chủ DB.
import pg from "pg";

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Khoản thu một lần + cập nhật người phải đóng + liên kết thông báo quỹ (gói F)");
  const db = new pg.Client(pgConfig());
  await db.connect();
  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const tuan = await as("tuan.nguyen@luuxa.local");
  const detail = (r) => JSON.stringify(r.json);
  const PLANS = "/api/v1/finance/contribution-plans";
  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const today = options.today;
  const cash = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const mid = async (email) => (await db.query("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1", [email])).rows[0].id;
  const M = {
    tuan: await mid("tuan.nguyen@luuxa.local"),
    hieu: await mid("hieu.bui@luuxa.local"),
    kiet: await mid("kiet.do@luuxa.local"),
    bao: await mid("bao.pham@luuxa.local"),
  };
  const stamp = Date.now().toString(36).slice(-5);
  const cleanupMembers = [];
  let plan = null;
  let paymentId = null;

  const cellsOf = async (planId) => {
    const m = (await treasurer.get(`/api/v1/finance/contributions?plan=${planId}&months=12`)).json;
    return Object.fromEntries(m.rows.filter((r) => r.cells[planId]).map((r) => [r.memberId, r.cells[planId]]));
  };

  try {
    await test("Thành viên thường không lập được khoản thu một lần (403); dữ liệu sai ⇒ 400 (trùng người, thiếu người, loại sai, số tiền 0)", async () => {
      const base = { kind: "onetime", feeType: "event_fee", name: `Phí hành hương thử ${stamp}`, amountVnd: 50_000, dueDate: addDays(today, 7), members: [{ memberId: M.tuan }] };
      eq((await tuan.post(PLANS, base)).status, 403);
      eq((await treasurer.post(PLANS, { ...base, members: [{ memberId: M.tuan }, { memberId: M.tuan }] })).status, 400, "trùng người");
      eq((await treasurer.post(PLANS, { ...base, members: [] })).status, 400, "không chọn ai");
      eq((await treasurer.post(PLANS, { ...base, feeType: "periodic_dues" })).status, 400, "loại sai");
      eq((await treasurer.post(PLANS, { ...base, amountVnd: 0 })).status, 400, "số tiền 0");
      eq((await treasurer.post(PLANS, { ...base, name: "x" })).status, 400, "tên quá ngắn");
    });

    await test("Lập 'Phí hành hương' cho ĐÚNG 2 người (Tuấn mức chung 50.000đ, Hiếu mức riêng 70.000đ) ⇒ chỉ 2 khoản phải thu", async () => {
      const r = await treasurer.post(PLANS, {
        kind: "onetime",
        feeType: "event_fee",
        name: `Phí hành hương thử ${stamp}`,
        amountVnd: 50_000,
        dueDate: addDays(today, 7),
        members: [{ memberId: M.tuan }, { memberId: M.hieu, amountVnd: 70_000 }],
        fundId: cash.id,
        note: "Kiểm thử khoản thu một lần",
      });
      eq(r.status, 201, detail(r));
      plan = r.json;
      eq(plan.generated, 2);
      eq(plan.totalVnd, 120_000);
      ok(/^SK-\d{4}-\d{2}/.test(plan.code), "mã khoản: " + plan.code);
      const cells = await cellsOf(plan.id);
      eq(Object.keys(cells).length, 2, "chỉ người được chọn: " + JSON.stringify(Object.keys(cells)));
      eq(cells[M.tuan].amountDueVnd, 50_000);
      eq(cells[M.hieu].amountDueVnd, 70_000);
      eq(cells[M.tuan].dueDate, addDays(today, 7));
      ok(!cells[M.kiet], "người không được chọn không có khoản");
      const list = (await tuan.get(PLANS)).json;
      const p = list.find((x) => x.id === plan.id);
      ok(p && p.feeType === "event_fee", "thành viên thấy khoản trong danh sách");
      eq(p.stats.expectedVnd, 120_000, "tổng phải thu (số tổng hợp, không lộ tên)");
    });

    await test("'Tôi đã đóng' khoản một lần ⇒ Thủ quỹ được báo, link /thu-chi?tab=tong-quan&plan=<id>; xác nhận ⇒ ghi thu + người đóng được báo cùng link", async () => {
      const cells = await cellsOf(plan.id);
      const c = await tuan.post("/api/v1/finance/claims", { contributionId: cells[M.tuan].contributionId, method: "cash", note: "Đã đưa tiền mặt (thử)" });
      eq(c.status, 201, detail(c));
      const link = `/thu-chi?tab=tong-quan&plan=${plan.id}`;
      const n1 = (await db.query("SELECT member_id, payload ->> 'link' AS link FROM notifications WHERE entity_table = 'contribution_claims' AND entity_id = $1 AND type_code = 'finance.claim_pending'", [c.json.id])).rows;
      ok(n1.some((x) => x.member_id === M.bao), "Thủ quỹ được báo: " + JSON.stringify(n1));
      ok(n1.every((x) => x.link === link), "link: " + JSON.stringify(n1));
      const d = await treasurer.post(`/api/v1/finance/claims/${c.json.id}/decide`, { approve: true });
      eq(d.status, 200, detail(d));
      paymentId = d.json.paymentId;
      ok(paymentId, "có phiếu thu");
      const n2 = (await db.query("SELECT member_id, payload ->> 'link' AS link FROM notifications WHERE entity_table = 'contribution_claims' AND entity_id = $1 AND type_code = 'finance.claim_decided'", [c.json.id])).rows;
      eq(n2.length, 1);
      eq(n2[0].member_id, M.tuan);
      eq(n2[0].link, link);
      eq((await cellsOf(plan.id))[M.tuan].status, "paid");
    });

    await test("Nhắc người chưa đóng ⇒ thông báo có link mở thẳng mã QR: /thu-chi?tab=tong-quan&plan=<id>&pay=<khoản>", async () => {
      const cells = await cellsOf(plan.id);
      const r = await treasurer.post(`${PLANS}/${plan.id}/remind`, { app: true, zalo: false });
      eq(r.status, 200, detail(r));
      ok(r.json.sent + r.json.skipped >= 1, detail(r));
      const n = (
        await db.query(
          "SELECT member_id, payload ->> 'link' AS link FROM notifications WHERE entity_table = 'contributions' AND entity_id = $1 AND type_code IN ('finance.dues_reminder', 'finance.dues_overdue') ORDER BY created_at DESC LIMIT 1",
          [cells[M.hieu].contributionId]
        )
      ).rows[0];
      ok(n, "Hiếu được nhắc");
      eq(n.member_id, M.hieu);
      eq(n.link, `/thu-chi?tab=tong-quan&plan=${plan.id}&pay=${cells[M.hieu].contributionId}`);
    });

    await test("Thêm người vào khoản thu một lần: xem trước ⇒ 1 người; thêm ⇒ 1; bấm lại ⇒ 0 (không trùng); không chọn ai ⇒ 422", async () => {
      const pv = await treasurer.get(`${PLANS}/${plan.id}/members?members=${M.kiet}`);
      eq(pv.status, 200, detail(pv));
      eq(pv.json.dry, true);
      eq(pv.json.added, 1);
      eq(pv.json.members[0].memberId, M.kiet);
      eq(pv.json.members[0].amountVnd, 50_000, "mức chung");
      eq(Object.keys(await cellsOf(plan.id)).length, 2, "xem trước không ghi");
      const a = await treasurer.post(`${PLANS}/${plan.id}/members`, { memberIds: [M.kiet] });
      eq(a.status, 200, detail(a));
      eq(a.json.added, 1);
      const again = await treasurer.post(`${PLANS}/${plan.id}/members`, { memberIds: [M.kiet, M.tuan] });
      eq(again.json.added, 0, "người đã có khoản không bị thêm lần nữa");
      eq(Object.keys(await cellsOf(plan.id)).length, 3);
      eq((await treasurer.post(`${PLANS}/${plan.id}/members`, {})).status, 422, "khoản một lần phải chọn người");
      eq((await tuan.post(`${PLANS}/${plan.id}/members`, { memberIds: [M.kiet] })).status, 403);
    });

    await test("Tiền điện nước: không 'cập nhật người phải đóng' được (đã chia theo số người lúc lập) ⇒ 422", async () => {
      const u = (await treasurer.get(PLANS)).json.find((p) => p.feeType === "utility");
      if (!u) return;
      const r = await treasurer.post(`${PLANS}/${u.id}/members`, {});
      eq(r.status, 422, detail(r));
    });

    const dues = (await treasurer.get(PLANS)).json.find((p) => p.feeType === "periodic_dues" && p.month <= today.slice(0, 7) && (p.endMonth ?? p.month) >= today.slice(0, 7));
    await test("Kỳ quỹ định kỳ đang diễn ra: người mới vào giữa kỳ (sau hạn nộp) ⇒ 'Cập nhật người phải đóng' thêm ĐÚNG người đó, hạn riêng = hôm nay + 14 ngày; bấm lại ⇒ 0", async () => {
      ok(dues, "DB thử có kỳ quỹ định kỳ đang diễn ra");
      const newbie = (
        await db.query("INSERT INTO members (full_name, display_name, status, joined_on) VALUES ($1, $2, 'active', app.local_today()) RETURNING id", [
          `Thành Viên Mới Thử ${stamp}`,
          `Mới ${stamp}`,
        ])
      ).rows[0].id;
      cleanupMembers.push(newbie);
      const pv = await treasurer.get(`${PLANS}/${dues.id}/members`);
      eq(pv.status, 200, detail(pv));
      const mine = pv.json.members.find((m) => m.memberId === newbie);
      ok(mine, "xem trước có người mới: " + detail(pv));
      ok(mine.amountVnd > 0, "mức quỹ theo định mức");
      const expectDue = dues.dueDate >= today ? dues.dueDate : addDays(today, 14);
      eq(pv.json.dueDate, expectDue, "hạn của người được thêm");
      // Ghi: chỉ thêm người mới của bài thử (DB thử dùng chung — không thêm khoản cho hồ sơ thử của bộ kiểm thử khác)
      const r = await treasurer.post(`${PLANS}/${dues.id}/members`, { memberIds: [newbie] });
      eq(r.status, 200, detail(r));
      eq(r.json.added, 1);
      eq(r.json.members[0].memberId, newbie);
      const cell = (await cellsOf(dues.id))[newbie];
      ok(cell, "người mới có khoản phải thu");
      eq(cell.dueDate, expectDue);
      eq(cell.status, "unpaid");
      const again = await treasurer.post(`${PLANS}/${dues.id}/members`, { memberIds: [newbie] });
      eq(again.json.added, 0, "bấm lại không sinh trùng");
      ok(!(await treasurer.get(`${PLANS}/${dues.id}/members`)).json.members.some((m) => m.memberId === newbie), "xem trước không còn người mới");
      eq((await tuan.get(`${PLANS}/${dues.id}/members`)).status, 403, "thành viên thường không xem trước được");
    });

    await test("Duyệt đơn vào nhà ⇒ người mới TỰ có khoản quỹ định kỳ đang mở (phản hồi có danh sách `dues`)", async () => {
      ok(dues, "DB thử có kỳ quỹ định kỳ đang diễn ra");
      const app = (
        await db.query("INSERT INTO member_applications (full_name, email, message, status) VALUES ($1, $2, 'Đơn kiểm thử tự thêm khoản quỹ', 'submitted') RETURNING id", [`Người Duyệt Đơn Thử ${stamp}`, `don.thu.${stamp}@example.com`])
      ).rows[0].id;
      const r = await head.post(`/api/v1/applications/${app}/approve`, { note: "Duyệt thử (gói F)" });
      eq(r.status, 200, detail(r));
      ok(r.json.memberId, "có hồ sơ thành viên");
      cleanupMembers.push(r.json.memberId);
      ok(Array.isArray(r.json.dues) && r.json.dues.some((d) => d.planId === dues.id), "phản hồi có khoản quỹ vừa thêm: " + detail(r));
      const cell = (await cellsOf(dues.id))[r.json.memberId];
      ok(cell && cell.status === "unpaid", "người mới có khoản phải thu kỳ này");
    });
  } finally {
    // Dọn: hủy phiếu thu thử ⇒ hủy kế hoạch một lần; xóa khoản + hồ sơ thử (quyền chủ DB)
    if (paymentId) await treasurer.post(`/api/v1/finance/payments/${paymentId}/void`, { reason: "Dọn phiếu thu kiểm thử khoản một lần" });
    if (plan) await treasurer.post(`${PLANS}/${plan.id}/cancel`, { reason: "Dọn kế hoạch kiểm thử khoản một lần" });
    for (const m of cleanupMembers) {
      await db.query("DELETE FROM contribution_reminders WHERE member_id = $1", [m]).catch(() => {});
      await db.query("DELETE FROM contributions WHERE member_id = $1 AND paid_vnd = 0", [m]).catch(() => {});
      await db.query("UPDATE members SET status = 'left', deleted_at = now() WHERE id = $1", [m]).catch(() => {});
    }
    await db.end();
  }
}
