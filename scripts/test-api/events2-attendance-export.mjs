// Kiểm thử XUẤT ĐIỂM DANH nhiều sự kiện (gói D — GET /api/v1/events/attendance-report): bảng thành viên × sự kiện (bật điểm danh, đã diễn ra)
// trong khoảng ngày + tổng/tỉ lệ; quyền: người xem toàn bộ điểm danh thấy mọi sự kiện, ban tổ chức chỉ thấy sự kiện mình phụ trách,
// thành viên thường không phụ trách gì ⇒ 403; khoảng ngày sai ⇒ 400.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Xuất Excel điểm danh nhiều sự kiện (bảng thành viên × sự kiện)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const head = await as("duc.tran@luuxa.local");
  const lead = await as("khoi.hoang@luuxa.local"); // Trưởng ban Ẩm thực: KHÔNG có quyền điểm danh chung
  const member = await as("phuoc.ly@luuxa.local").catch(() => as("tuan.nguyen@luuxa.local"));
  const target = await as("kiet.do@luuxa.local");
  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member.id;
  const leadId = await meOf(lead);
  const targetId = await meOf(target);
  const tag = Date.now().toString(36);
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const yesterday = (await sql("SELECT (app.local_today() - 1)::text AS d")).rows[0].d;
  const H = 3_600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const created = [];
  const mk = async (title, extra = {}) => {
    const r = await head.post("/api/v1/events", { title: `${title} ${tag}`, startsAt: iso(-3 * H), endsAt: iso(-2 * H), categoryCode: "EVT_MEET", hasCheckIn: true, ...extra });
    if (r.status !== 201) throw new Error(`tạo sự kiện lỗi ${r.status} ${JSON.stringify(r.json)}`);
    created.push(r.json.id);
    return r.json.id;
  };

  try {
    let evA, evB;
    await test("Chuẩn bị: 2 sự kiện đã diễn ra có điểm danh; Trưởng ban Ẩm thực phụ trách sự kiện B; ghi có mặt / vắng", async () => {
      evA = await mk("Họp xuất điểm danh A");
      evB = await mk("Họp xuất điểm danh B", { organizerIds: [leadId] });
      eq((await head.post(`/api/v1/events/${evA}/attendance`, { memberId: targetId, status: "present" })).status, 200);
      eq((await head.post(`/api/v1/events/${evB}/attendance`, { memberId: targetId, status: "absent", note: "Kiểm thử" })).status, 200);
    });

    await test("Người xem toàn bộ điểm danh: bảng có cả 2 sự kiện, ô đúng trạng thái, tổng + tỉ lệ đúng", async () => {
      const r = await head.get(`/api/v1/events/attendance-report?from=${yesterday}&to=${today}`);
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.scope, "all");
      const ia = r.json.events.findIndex((e) => e.id === evA);
      const ib = r.json.events.findIndex((e) => e.id === evB);
      ok(ia >= 0 && ib >= 0, "thiếu sự kiện trong báo cáo");
      const row = r.json.members.find((m) => m.memberId === targetId);
      ok(row, "thiếu dòng của thành viên");
      eq(row.cells[ia], "present");
      ok(/^\d{2}:\d{2}$/.test(row.times[ia] ?? ""), `thiếu giờ có mặt: ${row.times[ia]}`);
      eq(row.cells[ib], "absent");
      const ea = r.json.events[ia];
      ok(ea.expected >= 1 && ea.present >= 1, JSON.stringify(ea));
      eq(ea.present + ea.late + ea.excused + ea.absent + ea.unrecorded, ea.expected, "tổng theo sự kiện");
      const t = row.totals;
      eq(t.present + t.late + t.excused + t.absent + t.unrecorded, t.expected, "tổng theo thành viên");
      ok(t.ratePct === null || (t.ratePct >= 0 && t.ratePct <= 100), `tỉ lệ ngoài 0–100: ${t.ratePct}`);
      // Thành viên chưa ghi nhận ⇒ "none"
      ok(r.json.members.some((m) => m.cells[ia] === "none"), "phải có người chưa ghi nhận ở sự kiện A");
    });

    await test("Ban tổ chức (không có quyền điểm danh chung): chỉ thấy sự kiện mình phụ trách", async () => {
      const r = await lead.get(`/api/v1/events/attendance-report?from=${yesterday}&to=${today}`);
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.scope, "organizer");
      ok(r.json.events.some((e) => e.id === evB), "phải thấy sự kiện mình phụ trách");
      ok(!r.json.events.some((e) => e.id === evA), "không được thấy sự kiện không phụ trách");
    });

    await test("Thành viên thường không phụ trách sự kiện nào ⇒ 403; khoảng ngày sai ⇒ 400", async () => {
      const mid = await meOf(member);
      const isOrg = (await sql("SELECT 1 FROM event_organizers WHERE member_id = $1 LIMIT 1", [mid])).rowCount > 0;
      const r = await member.get(`/api/v1/events/attendance-report?from=${yesterday}&to=${today}`);
      if (isOrg) eq(r.json.scope, "organizer", "người có phụ trách sự kiện chỉ thấy sự kiện của mình");
      else eq(r.status, 403, JSON.stringify(r.json));
      eq((await head.get(`/api/v1/events/attendance-report?from=${today}&to=${yesterday}`)).status, 400, "đến trước từ");
      eq((await head.get(`/api/v1/events/attendance-report?from=2026-01-01`)).status, 400, "thiếu to");
      eq((await head.get(`/api/v1/events/attendance-report?from=2024-01-01&to=2026-01-01`)).status, 400, "quá 1 năm");
    });

    await test("Danh sách điểm danh một sự kiện (nguồn xuất Excel từng sự kiện): ban tổ chức xem được, thành viên khác 403", async () => {
      eq((await lead.get(`/api/v1/events/${evB}/attendance`)).status, 200, "ban tổ chức");
      eq((await lead.get(`/api/v1/events/${evA}/attendance`)).status, 403, "không phụ trách");
    });
  } finally {
    for (const id of created) await head.del(`/api/v1/events/${id}`).catch(() => {});
  }
}
