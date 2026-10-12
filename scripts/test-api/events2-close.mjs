// Kiểm thử TỰ CHỐT ĐIỂM DANH (gói D — bước cron "recurring-events", lượt sáng): sự kiện bật điểm danh đã kết thúc QUÁ 12 GIỜ mà chưa chốt
// ⇒ app.fn_close_event_attendance với vai trò hệ thống: người chưa điểm danh thành "vắng" (method import), sự kiện ⇒ completed;
// sự kiện vừa kết thúc (< 12 giờ) và sự kiện quá cũ (> 30 ngày) không bị đụng; chạy lại không tạo thêm gì.
import pg from "pg";

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Tự chốt điểm danh sự kiện đã kết thúc quá 12 giờ (cron sáng)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const CRON = "test-cron-secret-0001";
  const head = await as("duc.tran@luuxa.local");
  const kiet = await as("kiet.do@luuxa.local");
  const kietId = (await kiet.get("/api/v1/auth/me")).json.member.id;
  const tag = Date.now().toString(36);
  const H = 3_600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const created = [];
  const mk = async (title, startMs, endMs) => {
    const r = await head.post("/api/v1/events", { title: `${title} ${tag}`, startsAt: iso(startMs), endsAt: iso(endMs), categoryCode: "EVT_MEET", hasCheckIn: true });
    if (r.status !== 201) throw new Error(`tạo sự kiện lỗi ${r.status} ${JSON.stringify(r.json)}`);
    created.push(r.json.id);
    // Chỉ MỘT người được mời (đỡ tạo nhiều dòng vắng/điểm chuyên cần cho cả nhà trong DB thử)
    await sql("UPDATE events SET expected_scope = 'invitees' WHERE id = $1", [r.json.id]);
    await sql("INSERT INTO event_participants (event_id, member_id, is_invited) VALUES ($1, $2, true) ON CONFLICT (event_id, member_id) DO UPDATE SET is_invited = true", [r.json.id, kietId]);
    return r.json.id;
  };
  const state = async (id) => (await sql("SELECT status::text AS status FROM events WHERE id = $1", [id])).rows[0].status;
  const records = async (id) => (await sql("SELECT member_id, status::text AS status, method::text AS method FROM attendance_records WHERE event_id = $1", [id])).rows;
  const runCron = async () => {
    const r = await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: `Bearer ${CRON}` } });
    const j = await r.json();
    ok([200, 500].includes(r.status), `HTTP ${r.status}`);
    const step = (j.steps ?? []).find((s) => s.name === "recurring-events");
    ok(step, `thiếu bước recurring-events: ${JSON.stringify(j.steps?.map((s) => s.name))}`);
    eq(step.ok, true, `bước recurring-events lỗi: ${step.error}`);
    return step;
  };

  try {
    let oldEnough, recent, tooOld;
    await test("Chuẩn bị: sự kiện kết thúc 19 giờ trước, 2 giờ trước và 40 ngày trước (đều bật điểm danh, chưa chốt)", async () => {
      oldEnough = await mk("Họp thử đã qua 19 giờ", -20 * H, -19 * H);
      recent = await mk("Họp thử vừa xong", -3 * H, -2 * H);
      tooOld = await mk("Họp thử 40 ngày trước", -40 * 24 * H, -40 * 24 * H + H);
      for (const id of [oldEnough, recent, tooOld]) eq(await state(id), "scheduled");
    });

    await test("Cron sáng chốt sự kiện kết thúc quá 12 giờ: người được mời chưa điểm danh ⇒ vắng (tự động), sự kiện ⇒ hoàn tất", async () => {
      const step = await runCron();
      ok((step.info ?? []).some((m) => /Đã tự chốt điểm danh \d+ sự kiện/.test(m)), `ghi chú bước: ${JSON.stringify(step.info)}`);
      eq(await state(oldEnough), "completed", "sự kiện quá 12 giờ phải được chốt");
      const rec = await records(oldEnough);
      eq(rec.length, 1, `chỉ người được mời: ${JSON.stringify(rec)}`);
      eq(rec[0].member_id, kietId);
      eq(rec[0].status, "absent");
      eq(rec[0].method, "import");
      // Thành viên xem được kết quả của chính mình
      const ev = (await kiet.get(`/api/v1/events/${oldEnough}`)).json;
      eq(ev.myAttendance?.status, "absent");
    });

    await test("Sự kiện vừa kết thúc (< 12 giờ) và sự kiện quá cũ (> 30 ngày) KHÔNG bị tự chốt", async () => {
      eq(await state(recent), "scheduled");
      eq((await records(recent)).length, 0);
      eq(await state(tooOld), "scheduled");
      eq((await records(tooOld)).length, 0);
    });

    await test("Chạy lại: không chốt lại, không tạo thêm dòng điểm danh", async () => {
      await runCron();
      eq((await records(oldEnough)).length, 1);
      eq(await state(oldEnough), "completed");
    });
  } finally {
    for (const id of created) await head.del(`/api/v1/events/${id}`).catch(() => {});
  }
}
