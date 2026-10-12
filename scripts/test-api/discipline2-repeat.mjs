// Kiểm thử gói G — Vi phạm tái phạm (db/app/1051 discipline_rules.repeat_becomes_red, GET /api/v1/discipline/repeat):
// "Lần thứ N trong 12 tháng" với cùng điều luật + tổng vi phạm 12 tháng; cảnh báo đỏ khi tái phạm điều "tái phạm ⇒ Lỗi đỏ";
// bản được miễn / quá 12 tháng không tính; sửa bản ghi không tự đếm chính nó; chỉ Trưởng nhà / Admin dùng được.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Vi phạm — đếm tái phạm 12 tháng");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const head = await as("duc.tran@luuxa.local"); // discipline.manage
  const member = await as("tuan.nguyen@luuxa.local");
  const idOf = async (email) => (await sql("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1", [email])).rows[0].id;
  const tuanId = await idOf("tuan.nguyen@luuxa.local");
  const hieuId = await idOf("hieu.bui@luuxa.local");
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const daysAgo = async (n) => (await sql("SELECT (app.local_today() - $1::int)::text AS d", [n])).rows[0].d;
  const recs = [];
  let ruleId;
  let normalRuleId;

  const repeat = (q) => head.get(`/api/v1/discipline/repeat?${new URLSearchParams(q)}`);
  const rec = async (memberId, rId, occurredOn) => {
    const r = await head.post("/api/v1/discipline/records", { memberId, ruleId: rId, occurredOn, penaltyKind: "none" });
    eq(r.status, 201, JSON.stringify(r.json));
    recs.push(r.json.id);
    return r.json.id;
  };

  try {
    await test("Điều luật 'tái phạm ⇒ Lỗi đỏ': tạo được, cờ lưu và hiện trong danh sách; Lỗi đỏ sẵn thì không đặt thêm cờ tái phạm", async () => {
      const a = await head.post("/api/v1/discipline/rules", { code: `T${suffix}`, title: `Điều thử tái phạm ${suffix}`, defaultPenaltyKind: "none", repeatBecomesRed: true });
      eq(a.status, 201, JSON.stringify(a.json));
      ruleId = a.json.id;
      const b = await head.post("/api/v1/discipline/rules", { code: `N${suffix}`, title: `Điều thử thường ${suffix}`, defaultPenaltyKind: "none" });
      eq(b.status, 201);
      normalRuleId = b.json.id;
      const c = await head.post("/api/v1/discipline/rules", { code: `R${suffix}`, title: `Điều thử đỏ ${suffix}`, defaultPenaltyKind: "none", isRed: true, repeatBecomesRed: true });
      eq(c.status, 201);
      const list = (await head.get("/api/v1/discipline/rules")).json.rules;
      eq(list.find((r) => r.id === ruleId).repeatBecomesRed, true);
      eq(list.find((r) => r.id === normalRuleId).repeatBecomesRed, false);
      eq(list.find((r) => r.id === c.json.id).repeatBecomesRed, false, "Lỗi đỏ sẵn ⇒ cờ tái phạm bị bỏ");
      await sql("DELETE FROM discipline_rules WHERE id = $1", [c.json.id]);
    });

    await test("Chưa vi phạm: lần thứ 1, không cảnh báo đỏ", async () => {
      const r = await repeat({ memberId: tuanId, ruleId });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.nth, 1);
      eq(r.json.sameRuleBefore, 0);
      eq(r.json.escalatesToRed, false);
      eq(r.json.repeatBecomesRed, true);
    });

    await test("Đã có 1 lần: lần thứ 2 ⇒ cảnh báo đỏ; điều luật thường không cảnh báo; thành viên khác không bị đếm lẫn", async () => {
      await rec(tuanId, ruleId, await daysAgo(30));
      const r = (await repeat({ memberId: tuanId, ruleId })).json;
      eq(r.nth, 2);
      eq(r.sameRuleBefore, 1);
      eq(r.escalatesToRed, true, "tái phạm điều có cờ ⇒ cảnh báo đỏ");
      eq(r.previousDates.length, 1);
      await rec(tuanId, normalRuleId, await daysAgo(10));
      const n = (await repeat({ memberId: tuanId, ruleId: normalRuleId })).json;
      eq(n.nth, 2);
      eq(n.escalatesToRed, false, "điều thường tái phạm vẫn không đỏ");
      eq(n.totalBefore, 2, "tổng vi phạm 12 tháng (mọi điều)");
      const other = (await repeat({ memberId: hieuId, ruleId })).json;
      eq(other.nth, 1);
      eq(other.totalBefore, 0);
    });

    await test("Chỉ tính 12 tháng: vi phạm cách đây 13 tháng không đếm; bản được miễn không đếm", async () => {
      await rec(tuanId, ruleId, await daysAgo(400));
      eq((await repeat({ memberId: tuanId, ruleId })).json.sameRuleBefore, 1, "bản 400 ngày trước bị bỏ");
      const waivedId = await rec(tuanId, ruleId, await daysAgo(5));
      eq((await repeat({ memberId: tuanId, ruleId })).json.sameRuleBefore, 2);
      eq((await head.patch(`/api/v1/discipline/records/${waivedId}`, { action: "waive", reason: "Miễn thử nghiệm" })).status, 200);
      eq((await repeat({ memberId: tuanId, ruleId })).json.sameRuleBefore, 1, "bản được miễn không đếm");
    });

    await test("Tính tới ngày ghi (occurredOn): hỏi cho ngày cách đây 40 ngày chỉ thấy các bản trước đó; sửa bản ghi (excludeId) không tự đếm chính nó", async () => {
      const r = (await repeat({ memberId: tuanId, ruleId, occurredOn: await daysAgo(40) })).json;
      eq(r.sameRuleBefore, 1, "tại thời điểm 40 ngày trước chỉ có bản cách đó 360 ngày (trong 12 tháng); bản 30/5 ngày trước chưa xảy ra");
      eq(r.escalatesToRed, true);
      const first = recs[0];
      const all = (await repeat({ memberId: tuanId, ruleId })).json;
      eq(all.sameRuleBefore, 1, "hôm nay: bản 30 ngày trước (bản 400 ngày quá hạn, bản 5 ngày đã miễn)");
      const edit = (await repeat({ memberId: tuanId, ruleId, excludeId: first })).json;
      eq(edit.sameRuleBefore, 0, "đang sửa chính bản 30 ngày trước ⇒ không tự đếm chính nó");
      eq(edit.escalatesToRed, false);
    });

    await test("Điều ghi tay (không có mã): đếm theo tên không phân biệt hoa thường", async () => {
      const title = `Vi phạm ghi tay ${suffix}`;
      const r1 = await head.post("/api/v1/discipline/records", { memberId: tuanId, ruleTitle: title, occurredOn: await daysAgo(3), penaltyKind: "none" });
      eq(r1.status, 201, JSON.stringify(r1.json));
      recs.push(r1.json.id);
      const r = (await repeat({ memberId: tuanId, ruleTitle: title.toLowerCase() })).json;
      eq(r.sameRuleBefore, 1);
      eq(r.escalatesToRed, false, "điều ghi tay không có cờ tái phạm");
    });

    await test("Quyền & dữ liệu sai: thành viên thường 403; thiếu memberId 400; chưa đăng nhập 401", async () => {
      eq((await member.get(`/api/v1/discipline/repeat?${new URLSearchParams({ memberId: tuanId, ruleId })}`)).status, 403);
      eq((await head.get("/api/v1/discipline/repeat")).status, 400);
      eq((await head.get(`/api/v1/discipline/repeat?${new URLSearchParams({ memberId: "không-phải-uuid" })}`)).status, 400);
    });
  } finally {
    if (recs.length) await sql("DELETE FROM discipline_records WHERE id = ANY($1::uuid[])", [recs]);
    if (ruleId) await sql("DELETE FROM discipline_rules WHERE id = ANY($1::uuid[])", [[ruleId, normalRuleId].filter(Boolean)]);
    void today;
  }
}
