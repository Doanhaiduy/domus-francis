// Kiểm thử gói G — "Tối nay ai vắng / về muộn" (db/app/1051 app.fn_leave_tonight, GET /api/v1/leave/tonight):
// người duyệt đơn (leave.review) và người được nhờ giữ cửa tối nay thấy danh sách đơn ĐÃ DUYỆT có hiệu lực tối nay; thành viên khác thì rỗng;
// người giữ cửa CHỈ thấy tên/loại/giờ (không lý do, nơi đến, số điện thoại); giờ về hiệu lực tính cả lần xin thêm giờ; đơn chờ duyệt / vắng sự kiện / đã qua không hiện.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Xin phép — tối nay ai vắng / về muộn");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const head = await as("duc.tran@luuxa.local"); // leave.review
  const door = await as("bao.pham@luuxa.local"); // được nhờ giữ cửa
  const stranger = await as("nam.phan@luuxa.local"); // không liên quan
  const idOf = async (email) => (await sql("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1", [email])).rows[0].id;
  const tuanId = await idOf("tuan.nguyen@luuxa.local");
  const hieuId = await idOf("hieu.bui@luuxa.local");
  const doorId = await idOf("bao.pham@luuxa.local");
  const headUser = (await sql("SELECT id FROM users WHERE email = 'duc.tran@luuxa.local'")).rows[0].id;
  // "Tối nay" như hàm SQL: trước 6 giờ sáng vẫn là đêm hôm trước
  const D = (await sql("SELECT (((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '6 hours')::date)::text AS d")).rows[0].d;
  const at = (day, hm) => `(($1::date + ${day}) + time '${hm}') AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  const ids = [];
  const mk = async ({ member, kind, from, to, status = "approved", door: doorMember = null, reason = "Lý do riêng tư kiểm thử", dest = "Nơi riêng tư kiểm thử", phone = null }) => {
    // Máy trạng thái của đơn chỉ cho pending ⇒ approved: chèn 'pending' rồi duyệt
    const r = await sql(
      `INSERT INTO leave_requests (member_id, kind, starts_at, ends_at, reason, destination, contact_phone_e164, door_member_id)
       VALUES ($2, $3, ${at(from[0], from[1])}, ${at(to[0], to[1])}, $4, $5, $6, $7) RETURNING id`,
      [D, member, kind, reason, dest, phone, doorMember]
    );
    ids.push(r.rows[0].id);
    if (status === "approved") await sql("UPDATE leave_requests SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1", [r.rows[0].id, headUser]);
    return r.rows[0].id;
  };
  const tonight = async (c) => (await c.get("/api/v1/leave/tonight")).json;

  try {
    // Hiệu lực tối nay: về muộn D 19:00 → D+1 00:30 (Tuấn, nhờ Bảo để cửa); ngủ ngoài của Hiếu D 20:00 → D+1 06:30 (không nhờ ai)
    const lateId = await mk({ member: tuanId, kind: "late_return", from: [0, "19:00"], to: [1, "00:30"], door: doorId, phone: "+84901234567" });
    const overnightId = await mk({ member: hieuId, kind: "overnight_out", from: [0, "20:00"], to: [1, "06:30"] });
    // Không hiện: đơn chờ duyệt và đơn đã kết thúc từ mấy hôm trước
    await mk({ member: hieuId, kind: "late_return", from: [0, "19:30"], to: [1, "00:00"], status: "pending" });
    await mk({ member: tuanId, kind: "overnight_out", from: [-3, "20:00"], to: [-2, "06:00"] });

    await test("Người duyệt đơn thấy các đơn ĐÃ DUYỆT hiệu lực tối nay; đơn chờ duyệt và đơn đã qua không hiện", async () => {
      const r = await tonight(head);
      const got = r.items.map((i) => i.leaveId);
      ok(got.includes(lateId) && got.includes(overnightId), `thiếu đơn tối nay: ${JSON.stringify(got)}`);
      eq(r.items.filter((i) => [lateId, overnightId].includes(i.leaveId)).length, 2);
      const pending = (await sql("SELECT id FROM leave_requests WHERE status = 'pending' AND id = ANY($1::uuid[])", [ids])).rows[0].id;
      ok(!got.includes(pending), "đơn chờ duyệt không hiện");
    });

    await test("Người được nhờ giữ cửa thấy danh sách tối nay; chỉ tên/loại/giờ — KHÔNG có lý do, nơi đến, số điện thoại; đánh dấu đơn mình để cửa", async () => {
      const r = await tonight(door);
      ok(r.items.length >= 2, `người giữ cửa phải thấy danh sách: ${JSON.stringify(r)}`);
      const mine = r.items.find((i) => i.leaveId === lateId);
      ok(mine, "đơn nhờ mình để cửa");
      eq(mine.doorForMe, true);
      eq(r.items.find((i) => i.leaveId === overnightId).doorForMe, false);
      const raw = JSON.stringify(r);
      ok(!/Lý do riêng tư|Nơi riêng tư|0901234567|\+84901234567|reason|destination|phone/i.test(raw), "không lộ lý do / nơi đến / số điện thoại: " + raw.slice(0, 300));
      ok(mine.memberName && mine.kind === "late_return" && mine.effectiveEndsAt, "có tên, loại, giờ");
    });

    await test("Người không liên quan (không duyệt đơn, không để cửa) nhận danh sách rỗng", async () => {
      eq((await tonight(stranger)).items.length, 0);
      eq((await (await as("tuan.nguyen@luuxa.local")).get("/api/v1/leave/tonight")).json.items.length, 0, "ngay cả người xin phép cũng không xem được danh sách cả nhà");
    });

    await test("Giờ về hiệu lực tính cả giờ xin thêm", async () => {
      await sql("INSERT INTO leave_extensions (leave_request_id, member_id, new_ends_at, reason) VALUES ($1, $2, (($3::date + 1) + time '02:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'Xin thêm giờ kiểm thử')", [lateId, tuanId, D]);
      const it = (await tonight(head)).items.find((i) => i.leaveId === lateId);
      ok(new Date(it.effectiveEndsAt) > new Date(it.endsAt), "giờ hiệu lực muộn hơn giờ gốc");
      const hm = (await sql("SELECT to_char($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS h", [it.effectiveEndsAt])).rows[0].h;
      eq(hm, "02:00");
    });

    await test("Đơn vắng nhiều ngày bao trùm tối nay cũng hiện (loại 'vắng')", async () => {
      const longId = await mk({ member: hieuId, kind: "long_leave", from: [-1, "07:00"], to: [3, "07:00"] });
      const it = (await tonight(head)).items.find((i) => i.leaveId === longId);
      ok(it, "đơn tạm vắng dài hiện");
      eq(it.kind, "long_leave");
    });
  } finally {
    if (ids.length) {
      await sql("DELETE FROM leave_extensions WHERE leave_request_id = ANY($1::uuid[])", [ids]);
      await sql("DELETE FROM leave_requests WHERE id = ANY($1::uuid[])", [ids]);
    }
  }
}
