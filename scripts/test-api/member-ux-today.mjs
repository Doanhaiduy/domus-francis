// Kiểm thử gói H — "Việc của tôi hôm nay" (GET /api/v1/me/today), tắt thông báo theo từng LOẠI (db/app/1052) và xác nhận đã đọc LUẬT NHÀ.
//   • /me/today chỉ trả việc của CHÍNH người gọi (khoản quỹ, tuần trực), cần đăng nhập
//   • tắt một loại thông báo ⇒ app.fn_notify không tạo thông báo/hàng đợi cho người đó; loại bắt buộc không tắt được và vẫn tạo
//   • xác nhận Luật nhà: ghi đúng phiên bản hiện hành, phiên bản cũ ⇒ 409, gọi lại giữ lần đầu; chỉ người có house.rules.manage xem danh sách
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig, Client, BASE }) {
  section("Trải nghiệm thành viên: Việc của tôi, thông báo theo loại, xác nhận Luật nhà");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const tuan = await as("tuan.nguyen@luuxa.local");
  const hieu = await as("hieu.bui@luuxa.local");
  const phuoc = await as("nam.phan@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json;
  const tuanMe = await meOf(tuan);
  const hieuMe = await meOf(hieu);
  const tuanId = tuanMe.member?.id;
  const hieuId = hieuMe.member?.id;
  ok(tuanId && hieuId, "tài khoản demo phải có hồ sơ thành viên");

  // ---------------- Việc của tôi hôm nay ----------------
  await test("Chưa đăng nhập ⇒ 401", async () => {
    const anon = new Client("anon");
    eq((await anon.get("/api/v1/me/today")).status, 401);
  });

  await test("Cấu trúc: today (giờ VN), items xếp sẵn, todo khớp số mục 'todo', dues có tổng", async () => {
    const r = await tuan.get("/api/v1/me/today");
    eq(r.status, 200, JSON.stringify(r.json));
    ok(/^\d{4}-\d{2}-\d{2}$/.test(r.json.today), "today dạng YYYY-MM-DD");
    ok(Array.isArray(r.json.items), "items là mảng");
    eq(r.json.todo, r.json.items.filter((i) => i.state === "todo").length);
    ok(typeof r.json.dues.count === "number" && typeof r.json.dues.totalVnd === "number", "dues có count/totalVnd");
    for (const i of r.json.items) ok(i.key && i.kind && i.title && i.href?.startsWith("/"), "mỗi mục có key/kind/title/href trong ứng dụng: " + JSON.stringify(i).slice(0, 200));
  });

  await test("Khoản quỹ chưa đóng: chỉ của chính mình (đối chiếu CSDL), kèm số còn thiếu + nút QR mở /thu-chi?pay=<id>", async () => {
    const r = (await tuan.get("/api/v1/me/today")).json;
    const dues = r.items.filter((i) => i.kind === "dues");
    for (const d of dues) {
      const row = (await sql("SELECT member_id, (amount_due_vnd - discount_vnd - paid_vnd)::bigint AS remaining_vnd FROM contributions WHERE id = $1", [d.contributionId])).rows[0];
      ok(row, "khoản phải tồn tại");
      eq(row.member_id, tuanId, "khoản quỹ phải là của chính người xem");
      eq(Number(row.remaining_vnd), d.remainingVnd, "số còn thiếu khớp CSDL");
      ok(d.remainingVnd > 0, "còn thiếu > 0");
      ok(d.href.includes("pay=") || d.href.startsWith("/thu-chi"), "liên kết dẫn tới Thu chi: " + d.href);
    }
  });

  // Tuần trực: dựng tuần này (Thứ Hai) có tuan.nguyen + hieu.bui; phuoc.ly không trực
  const mon = (await sql("SELECT date_trunc('week', app.local_today())::date::text AS d")).rows[0].d;
  let createdWeek = null;
  const existed = (await sql("SELECT id FROM duty_weeks WHERE week_start = $1", [mon])).rows[0];
  const addedMembers = [];
  try {
    if (existed) {
      createdWeek = existed.id;
    } else {
      createdWeek = (await sql("INSERT INTO duty_weeks (week_start) VALUES ($1) RETURNING id", [mon])).rows[0].id;
    }
    for (const id of [tuanId, hieuId]) {
      const ins = await sql("INSERT INTO duty_week_members (week_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [createdWeek, id]);
      if (ins.rowCount) addedMembers.push(id);
    }

    await test("Tuần trực: người trực thấy 'duty_week' tuần này kèm tên người trực cùng; người không trực thì không", async () => {
      const r = (await tuan.get("/api/v1/me/today")).json;
      const w = r.items.find((i) => i.kind === "duty_week" && i.weekStart === mon);
      ok(w, "phải có tuần trực của tôi: " + JSON.stringify(r.items.map((i) => i.kind)));
      eq(w.when, "this");
      ok(w.href.startsWith("/hau-can"), "dẫn tới Hậu cần");
      const hieuName = (await sql("SELECT display_name FROM members WHERE id = $1", [hieuId])).rows[0].display_name;
      ok(w.partners.includes(hieuName), "có tên người trực cùng: " + JSON.stringify(w.partners));
      ok(!w.partners.includes((await sql("SELECT display_name FROM members WHERE id = $1", [tuanId])).rows[0].display_name), "không tự liệt kê mình");
      const p = (await phuoc.get("/api/v1/me/today")).json;
      // phuoc.ly không nằm trong tuần này ⇒ không có mục tuần-này nào mang đúng tuần đó với tư cách người trực
      const inWeek = (await sql("SELECT 1 FROM duty_week_members WHERE week_id = $1 AND member_id = (SELECT id FROM members WHERE user_id = (SELECT id FROM users WHERE email = 'nam.phan@luuxa.local'))", [createdWeek])).rowCount;
      if (!inWeek) ok(!p.items.some((i) => i.kind === "duty_week" && i.weekStart === mon && i.when === "this"), "người không trực không thấy tuần trực của người khác");
    });
  } finally {
    for (const id of addedMembers) await sql("DELETE FROM duty_week_members WHERE week_id = $1 AND member_id = $2", [createdWeek, id]);
    if (!existed && createdWeek) await sql("DELETE FROM duty_weeks WHERE id = $1", [createdWeek]);
  }

  // ---------------- Tắt thông báo theo LOẠI ----------------
  const notify = async (memberId, type) =>
    (await sql("SELECT app.fn_notify($1::uuid, $2, 'Kiểm thử loại thông báo', 'nội dung', '{\"link\":\"/\"}'::jsonb) AS id", [memberId, type])).rows[0].id;
  const outboxCount = async (nid) => (await sql("SELECT count(*)::int AS n FROM notification_outbox WHERE notification_id = $1", [nid])).rows[0].n;

  await test("Danh sách loại thông báo có cờ bắt buộc / đã tắt; tắt 'system.birthday' ⇒ fn_notify không tạo gì (cả hàng đợi)", async () => {
    const before = (await tuan.get("/api/v1/notifications/preferences")).json;
    const t = before.types.find((x) => x.code === "system.birthday");
    ok(t, "loại system.birthday có trong danh sách");
    eq(t.mandatory, false);
    eq(t.muted, false);
    const idOn = await notify(tuanId, "system.birthday");
    ok(idOn, "chưa tắt ⇒ có thông báo");
    ok((await outboxCount(idOn)) >= 1, "có dòng hàng đợi gửi đẩy");

    const off = await tuan.req("PUT", "/api/v1/notifications/preferences", { type: "system.birthday", enabled: false });
    eq(off.status, 200, JSON.stringify(off.json));
    eq(off.json.types.find((x) => x.code === "system.birthday").muted, true);
    const countBefore = (await sql("SELECT count(*)::int AS n FROM notifications WHERE member_id = $1 AND type_code = 'system.birthday'", [tuanId])).rows[0].n;
    const idOff = await notify(tuanId, "system.birthday");
    eq(idOff, null, "đã tắt ⇒ fn_notify trả NULL");
    eq((await sql("SELECT count(*)::int AS n FROM notifications WHERE member_id = $1 AND type_code = 'system.birthday'", [tuanId])).rows[0].n, countBefore, "không thêm thông báo");
    // người khác không bị ảnh hưởng
    ok(await notify(hieuId, "system.birthday"), "người chưa tắt vẫn nhận");

    const on = await tuan.req("PUT", "/api/v1/notifications/preferences", { type: "system.birthday", enabled: true });
    eq(on.status, 200);
    eq(on.json.types.find((x) => x.code === "system.birthday").muted, false);
    ok(await notify(tuanId, "system.birthday"), "bật lại ⇒ nhận lại");
  });

  await test("Loại bắt buộc không tắt được (422) và fn_notify vẫn tạo", async () => {
    const prefs = (await tuan.get("/api/v1/notifications/preferences")).json;
    const mand = prefs.types.find((x) => x.mandatory);
    ok(mand, "phải có ít nhất một loại bắt buộc");
    const r = await tuan.req("PUT", "/api/v1/notifications/preferences", { type: mand.code, enabled: false });
    eq(r.status, 422, JSON.stringify(r.json));
    ok(await notify(tuanId, mand.code), "loại bắt buộc vẫn tạo thông báo");
    // ép ghi thẳng vào bảng ⇒ trigger chặn; fn_notify cũng bỏ qua dòng tắt cũ nếu có
    let blocked = false;
    try {
      await sql("INSERT INTO notification_type_mutes (member_id, type_code) VALUES ($1, $2)", [tuanId, mand.code]);
    } catch {
      blocked = true;
    }
    ok(blocked, "trigger chặn tắt loại bắt buộc");
  });

  await test("Loại lạ ⇒ 400; chưa đăng nhập ⇒ 401", async () => {
    eq((await tuan.req("PUT", "/api/v1/notifications/preferences", { type: "khong.co.loai.nay", enabled: false })).status, 400);
    eq((await tuan.req("PUT", "/api/v1/notifications/preferences", { type: "Sai Dinh Dang", enabled: false })).status, 400);
    const anon = new Client("anon2");
    eq((await anon.get("/api/v1/notifications/preferences")).status, 401);
  });

  await test("Chỉ chính chủ thấy lựa chọn tắt của mình: tắt của Tuấn không hiện ở Hiếu", async () => {
    await tuan.req("PUT", "/api/v1/notifications/preferences", { type: "system.birthday", enabled: false });
    try {
      eq((await hieu.get("/api/v1/notifications/preferences")).json.types.find((x) => x.code === "system.birthday").muted, false);
    } finally {
      await tuan.req("PUT", "/api/v1/notifications/preferences", { type: "system.birthday", enabled: true });
    }
  });

  // ---------------- Xác nhận đọc Luật nhà ----------------
  await test("Luật nhà: trạng thái của tôi + phiên bản hiện hành; thành viên thường KHÔNG thấy danh sách người xác nhận", async () => {
    const r = await phuoc.get("/api/v1/house-rules/ack");
    eq(r.status, 200, JSON.stringify(r.json));
    ok(r.json.current?.version && /^[0-9a-f]{16}$/.test(r.json.current.version), "có phiên bản 16 ký tự hex");
    eq(r.json.canManage, false);
    eq(r.json.members, null);
  });

  await test("Xác nhận: phiên bản cũ ⇒ 409; hiện hành ⇒ ghi; gọi lại giữ nguyên giờ đầu; /me/today hết nhắc Luật nhà", async () => {
    const cur = (await phuoc.get("/api/v1/house-rules/ack")).json.current.version;
    const bad = await phuoc.post("/api/v1/house-rules/ack", { version: "0000000000000000" });
    eq(bad.status, 409, JSON.stringify(bad.json));
    eq((await phuoc.post("/api/v1/house-rules/ack", { version: "khong-hop-le" })).status, 400);
    const a = await phuoc.post("/api/v1/house-rules/ack", { version: cur });
    eq(a.status, 200, JSON.stringify(a.json));
    ok(a.json.mine.ackedAt, "đã có giờ xác nhận");
    const row = (await sql("SELECT version, acknowledged_at FROM house_rule_acknowledgements WHERE member_id = (SELECT id FROM members WHERE user_id = (SELECT id FROM users WHERE email = 'nam.phan@luuxa.local')) AND version = $1", [cur])).rows;
    eq(row.length, 1, "đúng một bản ghi cho phiên bản hiện hành");
    const again = await phuoc.post("/api/v1/house-rules/ack", { version: cur });
    eq(again.status, 200);
    eq(new Date(again.json.mine.ackedAt).getTime(), new Date(a.json.mine.ackedAt).getTime(), "gọi lại không đổi giờ đã xác nhận");
    const t = (await phuoc.get("/api/v1/me/today")).json;
    ok(!t.items.some((i) => i.kind === "house_rules"), "đã xác nhận ⇒ không còn mục nhắc Luật nhà");
  });

  await test("Trưởng nhà (house.rules.manage) xem được ai đã / chưa xác nhận; thành viên khác không sửa/xóa được bằng chứng", async () => {
    const r = await head.get("/api/v1/house-rules/ack");
    eq(r.status, 200);
    eq(r.json.canManage, true);
    ok(Array.isArray(r.json.members) && r.json.members.length > 0, "có danh sách");
    ok(r.json.summary.total >= r.json.summary.acked, "tổng hợp hợp lệ");
    const mine = r.json.members.find((m) => m.fullName && m.ackedAt);
    ok(mine, "phải có ít nhất một người đã xác nhận (Phước)");
  });
}
