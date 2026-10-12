// Kiểm thử BƯỚC CRON "manager-digest" (src/server/cron/steps/manager-digest.ts, loại thông báo system.manager_digest — db/app/1044):
//   • người quản lý có việc QUÁ HẠN (ở đây: hình phạt quá ngày kết thúc) nhận MỘT thông báo tóm tắt (link "/"), nội dung liệt kê việc quá hạn
//   • thành viên thường không nhận; chạy lại cùng ngày không gửi thêm (khóa mgr-digest:<thành viên>:<ngày>)
//   • xem trước (dry) không ghi gì, chỉ báo "Sẽ gửi …"
// Gọi cron thật như Vercel (GET /api/cron/daily?slot=morning + Bearer CRON_SECRET của máy chủ thử).
import pg from "pg";

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Tin tóm tắt việc quá hạn buổi sáng cho người quản lý (cron manager-digest)");
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
  const tag = `inbox-d-${Date.now().toString(36)}`;
  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member;
  const headMe = await meOf(head);
  const memberMe = await meOf(member);
  const otherMe = await meOf(await as("hieu.bui@luuxa.local"));
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const started = (await sql("SELECT now() AS t")).rows[0].t;
  const digests = async (memberId) =>
    (await sql("SELECT id, title, body, payload FROM notifications WHERE member_id = $1 AND type_code = 'system.manager_digest' AND created_at >= $2 ORDER BY created_at", [memberId, started])).rows;
  const runCron = async () => {
    const r = await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: `Bearer ${CRON}` } });
    const j = await r.json();
    ok([200, 500].includes(r.status), `HTTP ${r.status}`);
    const step = (j.steps ?? []).find((s) => s.name === "manager-digest");
    ok(step, `thiếu bước manager-digest: ${JSON.stringify(j.steps?.map((s) => s.name))}`);
    eq(step.ok, true, `bước manager-digest lỗi: ${step.error}`);
    return { j, step };
  };

  let discId = null;
  try {
    // Việc quá hạn chắc chắn có: hình phạt đã quá ngày kết thúc mà chưa xong (Trưởng nhà + Admin có quyền discipline.manage)
    discId = (
      await sql(
        `INSERT INTO discipline_records (member_id, rule_title, occurred_on, penalty_kind, penalty_qty, penalty_starts_on, penalty_ends_on, note)
         VALUES ($1, 'Kiểm thử tin tóm tắt', $2::date - 8, 'rosary', 2, $2::date - 7, $2::date - 3, $3) RETURNING id`,
        [otherMe.id, today, tag]
      )
    ).rows[0].id;
    // Chạy lại trong cùng ngày: gỡ khóa chống trùng của lần chạy trước để kiểm tra lại từ đầu
    await sql("DELETE FROM system_post_log WHERE key LIKE 'mgr-digest:%:' || $1", [today]);

    await test("Hộp việc của Trưởng nhà có hình phạt quá hạn (điều kiện để gửi tóm tắt)", async () => {
      const box = (await head.get("/api/v1/inbox")).json;
      const it = box.items.find((i) => i.kind === "discipline_overdue");
      ok(it && it.urgent && it.overdue >= 1, JSON.stringify(box.items));
    });

    await test("Cron sáng ⇒ Trưởng nhà nhận MỘT tin tóm tắt việc quá hạn (link “/”); thành viên thường không nhận", async () => {
      const { step } = await runCron();
      ok((step.info ?? []).some((m) => /Đã gửi tóm tắt việc quá hạn cho \d+ người quản lý/.test(m)), `ghi chú bước: ${JSON.stringify(step.info)}`);
      const list = await digests(headMe.id);
      eq(list.length, 1, "đúng một tin tóm tắt");
      ok(/^Bạn có \d+ việc quá hạn cần xử lý$/.test(list[0].title), list[0].title);
      ok(/hình phạt quá hạn chưa chấp hành xong/.test(list[0].body), list[0].body);
      eq(list[0].payload?.link, "/");
      eq((await digests(memberMe.id)).length, 0, "thành viên thường không có hộp việc ⇒ không nhận tóm tắt");
      const n = (await head.get("/api/v1/notifications")).json.items.find((x) => x.id === list[0].id);
      ok(n, "tin tóm tắt phải có trong hộp thư của Trưởng nhà");
      eq(n.link, "/");
      eq(n.type, "system.manager_digest");
    });

    await test("Chạy lại cron trong ngày ⇒ không gửi thêm tin tóm tắt (chống trùng theo ngày)", async () => {
      const { step } = await runCron();
      eq((await digests(headMe.id)).length, 1, "vẫn chỉ một tin");
      ok((step.info ?? []).some((m) => /đã nhận tóm tắt hôm nay/.test(m)), `ghi chú bước: ${JSON.stringify(step.info)}`);
    });

    await test("Xem trước (dry) do Admin chạy ⇒ không ghi thông báo nào, chỉ ghi chú “Sẽ gửi …”", async () => {
      await sql("DELETE FROM system_post_log WHERE key = $1", [`mgr-digest:${headMe.id}:${today}`]);
      const r = await admin.post("/api/v1/integrations/cron/run", { slot: "morning", dry: true });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.dry, true);
      const step = r.json.steps.find((s) => s.name === "manager-digest");
      ok(step && step.ok, JSON.stringify(step));
      ok(r.json.notes.some((m) => /manager-digest: Sẽ gửi tóm tắt việc quá hạn cho \d+ người quản lý/.test(m)), JSON.stringify(r.json.notes));
      eq((await digests(headMe.id)).length, 1, "xem trước không gửi");
      eq((await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key = $1", [`mgr-digest:${headMe.id}:${today}`])).rows[0].n, 0, "xem trước không ghi khóa");
    });

    await test("Không còn việc quá hạn ⇒ không gửi tóm tắt", async () => {
      await sql("DELETE FROM discipline_records WHERE id = $1", [discId]);
      discId = null;
      const box = (await head.get("/api/v1/inbox")).json;
      if (box.items.some((i) => i.urgent)) {
        // Dữ liệu demo / bộ kiểm thử khác còn để lại việc quá hạn ⇒ không kiểm được nhánh này một cách chắc chắn
        ok(true);
        return;
      }
      await sql("DELETE FROM system_post_log WHERE key = $1", [`mgr-digest:${headMe.id}:${today}`]);
      const before = (await digests(headMe.id)).length;
      await runCron();
      eq((await digests(headMe.id)).length, before, "không có việc quá hạn ⇒ không gửi");
    });
  } finally {
    if (discId) await sql("DELETE FROM discipline_records WHERE id = $1", [discId]).catch(() => {});
    await sql("DELETE FROM discipline_records WHERE note LIKE 'inbox-d-%'").catch(() => {});
  }
}
