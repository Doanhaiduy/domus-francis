// Kiểm thử ỦNG HỘ ở trang Thu chi sau gói F (db/app/1045 thay hàm 1030 — chỉ đổi link thông báo):
//   • thành viên báo đã ủng hộ ⇒ Thủ quỹ được báo, link /thu-chi?tab=ung-ho; rút lại được
//   • khoản báo từ TRANG CÔNG KHAI (gói J: donor_member_id NULL + self_reported) hiện trong danh sách của Thủ quỹ là "người ngoài tự báo"
//     (isMember = false, selfReported = true), đang chờ; từ chối kèm lý do ⇒ không vào sổ quỹ
//   • ghi nhận đã nhận tiền (Thủ quỹ) vẫn ghi sổ quỹ + báo người ủng hộ với link tab Ủng hộ — rồi điều chỉnh trả lại để quỹ thử không đổi
import { randomUUID } from "node:crypto";
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Ủng hộ — liên kết tab + khoản báo từ trang công khai (gói F)");
  const db = new pg.Client(pgConfig());
  await db.connect();
  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const detail = (r) => JSON.stringify(r.json);
  const today = (await db.query("SELECT app.local_today()::text AS d")).rows[0].d;
  const stamp = Date.now().toString(36).slice(-5);
  const baoMid = (await db.query("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = 'bao.pham@luuxa.local'")).rows[0].id;
  const tuanMid = (await db.query("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = 'tuan.nguyen@luuxa.local'")).rows[0].id;
  let publicId = null;

  try {
    await test("Thành viên báo đã ủng hộ ⇒ Thủ quỹ nhận thông báo link /thu-chi?tab=ung-ho; thành viên rút lại được", async () => {
      const r = await member.post("/api/v1/donations/report", { amountVnd: 20_000, donatedOn: today, method: "cash", note: `Ủng hộ thử ${stamp}` });
      eq(r.status, 201, detail(r));
      const id = r.json.id;
      const n = (await db.query("SELECT member_id, payload ->> 'link' AS link FROM notifications WHERE entity_table = 'donations' AND entity_id = $1 AND type_code = 'finance.donation_pending'", [id])).rows;
      ok(n.some((x) => x.member_id === baoMid), "Thủ quỹ được báo: " + JSON.stringify(n));
      ok(n.every((x) => x.link === "/thu-chi?tab=ung-ho"), "link: " + JSON.stringify(n));
      eq((await member.patch(`/api/v1/donations/${id}`, { action: "withdraw" })).status, 200);
    });

    await test("Khoản báo từ trang công khai (người ngoài tự báo) ⇒ Thủ quỹ thấy isMember=false, selfReported=true, đang chờ; từ chối có lý do ⇒ không vào sổ", async () => {
      publicId = (
        await db.query(
          `INSERT INTO donations (donor_member_id, donor_name, amount_vnd, donated_on, method, note, status, self_reported)
           VALUES (NULL, $1, 30000, $2::date, 'bank_transfer', 'Lời nhắn thử · Liên hệ: 0900000000', 'pending', true) RETURNING id`,
          [`Khách ủng hộ thử ${stamp}`, today]
        )
      ).rows[0].id;
      const list = await treasurer.get(`/api/v1/donations?status=pending&q=${encodeURIComponent(stamp)}`);
      eq(list.status, 200, detail(list));
      const d = (list.json.items ?? list.json.donations ?? []).find((x) => x.id === publicId);
      ok(d, "có trong danh sách chờ: " + detail(list));
      eq(d.isMember, false);
      eq(d.selfReported, true);
      eq(d.status, "pending");
      eq((await member.get(`/api/v1/donations?q=${encodeURIComponent(stamp)}`)).json.items?.some?.((x) => x.id === publicId) ?? false, false, "thành viên khác không thấy");
      const bad = await treasurer.patch(`/api/v1/donations/${publicId}`, { action: "reject" });
      eq(bad.status, 422, "từ chối phải có lý do: " + detail(bad));
      const r = await treasurer.patch(`/api/v1/donations/${publicId}`, { action: "reject", note: "Không thấy tiền về trong sao kê" });
      eq(r.status, 200, detail(r));
      const after = (await db.query("SELECT status, ledger_entry_id, fund_id FROM donations WHERE id = $1", [publicId])).rows[0];
      eq(after.status, "rejected");
      eq(after.ledger_entry_id, null, "không ghi sổ quỹ");
    });

    await test("Thủ quỹ ghi nhận đã nhận tiền của thành viên ⇒ vào sổ quỹ + người ủng hộ được báo (link tab Ủng hộ); điều chỉnh trả lại để quỹ thử không đổi", async () => {
      const cash = (await db.query("SELECT id FROM funds WHERE code = 'CASH' AND deleted_at IS NULL AND is_active")).rows[0].id;
      const r = await treasurer.post("/api/v1/donations", {
        donorMemberId: tuanMid,
        amountVnd: 10_000,
        donatedOn: today,
        method: "cash",
        fundId: cash,
        received: true,
        note: `Ủng hộ thử đã nhận ${stamp}`,
        clientRequestId: randomUUID(),
      });
      eq(r.status, 201, detail(r));
      const n = (await db.query("SELECT member_id, payload ->> 'link' AS link FROM notifications WHERE entity_table = 'donations' AND entity_id = $1", [r.json.id])).rows;
      eq(n.length, 1, JSON.stringify(n));
      eq(n[0].member_id, tuanMid);
      eq(n[0].link, "/thu-chi?tab=ung-ho");
      const adj = await head.post("/api/v1/finance/adjustments", { fundId: cash, direction: "out", amountVnd: 10_000, entryDate: today, reason: "Trả lại khoản ủng hộ thử của bộ kiểm thử" });
      eq(adj.status, 201, detail(adj));
    });
  } finally {
    await db.end();
  }
}
