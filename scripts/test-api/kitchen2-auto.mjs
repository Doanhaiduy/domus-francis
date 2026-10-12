// Kiểm thử gói G — Bếp & Cơm (db/app/1051): "Luôn ăn, trừ khi báo vắng", đăng ký hộ cả nhà bỏ qua người có đơn vắng đã duyệt,
// nhắc đăng ký cơm bằng cron sáng (chống trùng), chỉ MỘT công tắc bật/tắt phân hệ (Cài đặt → Phân hệ).
import pg from "pg";

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Bếp & Cơm — luôn ăn, bỏ qua người vắng, nhắc đăng ký, một công tắc");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const admin = await as("viet.vu@luuxa.local");
  const kitchen = await as("khoi.hoang@luuxa.local"); // Trưởng ban Ẩm thực: meal.manage
  const tuan = await as("tuan.nguyen@luuxa.local"); // bật "Luôn ăn"
  const hieu = await as("hieu.bui@luuxa.local"); // có đơn vắng, không bật "Luôn ăn"
  const phuoc = await as("nam.phan@luuxa.local"); // bật "Luôn ăn" + có đơn vắng
  const kiet = await as("kiet.do@luuxa.local"); // không làm gì ⇒ nhận nhắc
  const idOf = async (email) => (await sql("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1", [email])).rows[0].id;
  const [tuanId, hieuId, phuocId, kietId, headUser] = [
    await idOf("tuan.nguyen@luuxa.local"),
    await idOf("hieu.bui@luuxa.local"),
    await idOf("nam.phan@luuxa.local"),
    await idOf("kiet.do@luuxa.local"),
    (await sql("SELECT id FROM users WHERE email = 'duc.tran@luuxa.local'")).rows[0].id,
  ];
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
  const D = addDays(today, 4);
  const CRON = "test-cron-secret-0001";

  const prevModules = (await admin.get("/api/v1/ui/modules")).json.disabled ?? {};
  const flag = async () => (await sql("SELECT value FROM settings WHERE key = 'feature.meals.enabled'")).rows[0].value;
  const leaveIds = [];
  const cleanup = async () => {
    for (const c of [tuan, phuoc]) await c.req("PUT", "/api/v1/meals/auto-eat", { enabled: false });
    await sql("DELETE FROM meal_menus WHERE menu_date = $1", [D]);
    await sql("DELETE FROM meal_registrations WHERE menu_id IN (SELECT id FROM meal_menus WHERE menu_date = $1)", [today]);
    await sql("DELETE FROM notifications WHERE type_code = 'meal.reminder' AND member_id = ANY($1::uuid[])", [[tuanId, hieuId, phuocId, kietId]]);
    await sql("DELETE FROM system_post_log WHERE key LIKE $1", [`meal-reminder:${today}:%`]);
    if (leaveIds.length) await sql("DELETE FROM leave_requests WHERE id = ANY($1::uuid[])", [leaveIds]);
    await admin.req("PUT", "/api/v1/ui/modules", { disabled: prevModules });
  };

  try {
    await test("MỘT công tắc: ẩn Bếp & Cơm ở tab Phân hệ ⇒ cờ feature.meals.enabled tắt; bật lại ⇒ bật; hộp 'Cấu hình bếp' không đổi được cờ", async () => {
      eq((await admin.req("PUT", "/api/v1/ui/modules", { disabled: { ...prevModules, "/bep-com": { message: "Tạm nghỉ thử" } } })).status, 200);
      eq(await flag(), false, "ẩn ở tab Phân hệ ⇒ cờ tắt");
      eq((await admin.req("PUT", "/api/v1/ui/modules", { disabled: {} })).status, 200);
      eq(await flag(), true, "bật lại ⇒ cờ bật");
      const patch = await kitchen.req("PATCH", "/api/v1/meals/settings", { enabled: false, lunchCutoff: "09:00" });
      ok(patch.status === 200 || patch.status === 400, JSON.stringify(patch.json));
      eq(await flag(), true, "API cấu hình bếp KHÔNG còn đổi được cờ bật/tắt");
    });

    // Chuẩn bị: đơn vắng đã duyệt (thẳng CSDL) cho hieu + phuoc, phủ từ hôm qua đến ngày D+1 ⇒ vắng cả hôm nay lẫn ngày D
    const mkLeave = async (memberId) => {
      const r = await sql(
        `INSERT INTO leave_requests (member_id, kind, starts_at, ends_at, reason, destination)
         VALUES ($1, 'long_leave', (($2::date - 1) + time '06:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', (($3::date + 1) + time '23:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                 'Về quê dịp kiểm thử bếp', 'Quê nhà') RETURNING id`,
        [memberId, today, D]
      );
      leaveIds.push(r.rows[0].id);
      // Máy trạng thái của đơn chỉ cho pending ⇒ approved
      await sql("UPDATE leave_requests SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1", [r.rows[0].id, headUser]);
    };
    await sql("DELETE FROM meal_menus WHERE menu_date = $1", [D]);
    await mkLeave(hieuId);
    await mkLeave(phuocId);

    await test("Bật 'Luôn ăn' (chính chủ): API trả autoEat; thành viên không bật thì không có; tắt được", async () => {
      const a = await tuan.req("PUT", "/api/v1/meals/auto-eat", { enabled: true });
      eq(a.status, 200, JSON.stringify(a.json));
      eq(a.json.autoEat, true);
      eq((await phuoc.req("PUT", "/api/v1/meals/auto-eat", { enabled: true })).status, 200);
      eq((await tuan.get("/api/v1/meals")).json.autoEat, true);
      eq((await kiet.get("/api/v1/meals")).json.autoEat, false);
      const rows = (await sql("SELECT member_id FROM meal_auto_eaters")).rows.map((r) => r.member_id);
      ok(rows.includes(tuanId) && rows.includes(phuocId) && !rows.includes(kietId), "bảng meal_auto_eaters đúng");
      // Chính chủ tắt/bật được; người khác không bật hộ (không có API) — thử bật rồi bật lại không lỗi
      eq((await tuan.req("PUT", "/api/v1/meals/auto-eat", { enabled: true })).status, 200, "bật lại không lỗi");
    });

    await test("Ban Ẩm thực lập thực đơn ngày D ⇒ người bật 'Luôn ăn' tự có suất ăn (cả trưa, tối); người không bật thì không; người có đơn vắng đã duyệt bị bỏ qua", async () => {
      const r = await kitchen.req("PUT", "/api/v1/meals/menus", { date: D, lunch: { dishes: ["Cơm gà"] }, dinner: { dishes: ["Canh chua"] } });
      eq(r.status, 200, JSON.stringify(r.json));
      const day = (await tuan.get(`/api/v1/meals?date=${D}`)).json.days.find((d) => d.date === D);
      eq(day.lunch.mine?.willEat, true, "trưa D");
      eq(day.dinner.mine?.willEat, true, "tối D");
      eq(day.lunch.mine?.registeredBy ?? null, null, "tự đăng ký của chính mình, không bị coi là đăng ký hộ");
      const regs = (await sql("SELECT r.member_id FROM meal_registrations r JOIN meal_menus m ON m.id = r.menu_id WHERE m.menu_date = $1 AND m.meal_type = 'lunch'", [D])).rows.map((x) => x.member_id);
      ok(regs.includes(tuanId), "tuan đã được ghi");
      ok(!regs.includes(phuocId), "phuoc có đơn vắng ⇒ không ghi");
      ok(!regs.includes(kietId) && !regs.includes(hieuId), "người không bật không được ghi");
    });

    await test("Người dùng vẫn bỏ được từng bữa; lưu lại thực đơn không đè lựa chọn đó", async () => {
      const off = await tuan.req("PUT", "/api/v1/meals/registrations", { date: D, meal: "dinner", willEat: false });
      eq(off.status, 200, JSON.stringify(off.json));
      eq((await kitchen.req("PUT", "/api/v1/meals/menus", { date: D, dinner: { dishes: ["Canh chua", "Cá kho"] } })).status, 200);
      const day = (await tuan.get(`/api/v1/meals?date=${D}`)).json.days.find((d) => d.date === D);
      eq(day.dinner.mine?.willEat, false, "tối D vẫn là Nghỉ");
      eq(day.lunch.mine?.willEat, true, "trưa D vẫn Ăn");
    });

    await test("Đăng ký hộ cả nhà: bỏ qua người có đơn xin phép vắng đã duyệt (báo số bị bỏ qua), vẫn đăng ký người khác", async () => {
      const r = await kitchen.post("/api/v1/meals/registrations/bulk", { scope: "all-members", date: D, meals: ["lunch"] });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.absent >= 2, `absent=${r.json.absent} (hieu + phuoc): ${r.json.message}`);
      ok(/xin phép vắng/.test(r.json.message), r.json.message);
      const regs = (await sql("SELECT r.member_id FROM meal_registrations r JOIN meal_menus m ON m.id = r.menu_id WHERE m.menu_date = $1 AND m.meal_type = 'lunch'", [D])).rows.map((x) => x.member_id);
      ok(!regs.includes(hieuId) && !regs.includes(phuocId), "người vắng không bị đăng ký hộ");
      ok(regs.includes(kietId) && regs.includes(tuanId), "người còn lại được đăng ký");
      // thành viên thường không dùng được
      eq((await kiet.post("/api/v1/meals/registrations/bulk", { scope: "all-members", date: D })).status, 403);
    });

    // --- Nhắc đăng ký bằng cron sáng ---
    const runCron = async () => {
      const r = await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: `Bearer ${CRON}` } });
      const j = await r.json();
      const step = (j.steps ?? []).find((s) => s.name === "meal-reminder");
      ok(step, `thiếu bước meal-reminder: ${JSON.stringify((j.steps ?? []).map((s) => s.name))}`);
      eq(step.ok, true, `bước meal-reminder lỗi: ${step.error}`);
      return step;
    };
    const reminders = async (id) =>
      Number((await sql("SELECT count(*)::int AS n FROM notifications WHERE type_code = 'meal.reminder' AND member_id = $1 AND created_at::date >= current_date - 1", [id])).rows[0].n);

    await test("Chuẩn bị hôm nay: hai bữa mở đăng ký (chốt 23:59), chưa ai đăng ký", async () => {
      const r = await kitchen.req("PUT", "/api/v1/meals/menus", { date: today, lunch: { dishes: ["Bún"], cutoffTime: "23:59" }, dinner: { dishes: ["Cơm"], cutoffTime: "23:59" } });
      eq(r.status, 200, JSON.stringify(r.json));
      await sql("DELETE FROM meal_registrations WHERE menu_id IN (SELECT id FROM meal_menus WHERE menu_date = $1)", [today]);
      await sql("DELETE FROM notifications WHERE type_code = 'meal.reminder' AND member_id = ANY($1::uuid[])", [[tuanId, hieuId, phuocId, kietId]]);
      await sql("DELETE FROM system_post_log WHERE key LIKE $1", [`meal-reminder:${today}:%`]);
    });

    await test("Cron sáng: người bật 'Luôn ăn' được tự đăng ký hôm nay (không bị nhắc); người vắng không bị nhắc; người chưa làm gì nhận nhắc kèm liên kết /bep-com", async () => {
      const step = await runCron();
      ok((step.info ?? []).some((m) => /Đã nhắc \d+ người/.test(m)), `ghi chú: ${JSON.stringify(step.info)}`);
      eq(await reminders(kietId), 1, "kiet chưa đăng ký ⇒ được nhắc");
      eq(await reminders(tuanId), 0, "tuan 'Luôn ăn' ⇒ không cần nhắc");
      eq(await reminders(hieuId), 0, "hieu có đơn vắng ⇒ không nhắc");
      eq(await reminders(phuocId), 0, "phuoc có đơn vắng ⇒ không nhắc");
      const n = (await sql("SELECT payload->>'link' AS link, title FROM notifications WHERE type_code = 'meal.reminder' AND member_id = $1 ORDER BY created_at DESC LIMIT 1", [kietId])).rows[0];
      eq(n.link, "/bep-com");
      ok(/chưa báo ăn cơm/.test(n.title), n.title);
      const todayAuto = (await sql("SELECT count(*)::int AS n FROM meal_registrations r JOIN meal_menus m ON m.id = r.menu_id WHERE m.menu_date = $1 AND r.member_id = $2 AND r.will_eat", [today, tuanId])).rows[0].n;
      eq(todayAuto, 2, "tuan được tự ghi 2 bữa hôm nay");
    });

    await test("Chống trùng: chạy cron lần nữa trong ngày không nhắc lại", async () => {
      await runCron();
      eq(await reminders(kietId), 1);
    });

    await test("Đã đăng ký thì không bị nhắc: kiet đăng ký cả hai bữa, xóa khóa chống trùng, chạy lại ⇒ vẫn chỉ 1 thông báo cũ", async () => {
      for (const meal of ["lunch", "dinner"]) eq((await kiet.req("PUT", "/api/v1/meals/registrations", { date: today, meal, willEat: true })).status, 200);
      await sql("DELETE FROM system_post_log WHERE key LIKE $1", [`meal-reminder:${today}:%`]);
      await runCron();
      eq(await reminders(kietId), 1, "không nhắc thêm vì đã đăng ký đủ");
    });
  } finally {
    await cleanup();
  }
}
